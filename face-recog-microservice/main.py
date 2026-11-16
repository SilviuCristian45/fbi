import pickle
import psycopg2
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel
import numpy as np
import cv2
# Șterge sau comentează: import requests
from curl_cffi import requests # 👈 Folosim requests din curl_cffi
from curl_cffi import CurlOpt
import socket
from urllib.parse import urlsplit
from deepface import DeepFace
from apscheduler.schedulers.background import BackgroundScheduler
import os
import pika
import json
import threading
import time

print(os.cpu_count())
os.environ["OPENCV_IO_ENABLE_OPENEXR"] = "0"
cv2.setNumThreads(0)
# --- CONFIGURARE DB ---
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_NAME = os.getenv("DB_NAME", "fbi")
DB_USER = os.getenv("DB_USER", "keycloak")
DB_PASS = os.getenv("DB_PASS", "keycloak")
DB_PORT = os.getenv("DB_PORT", "5433")
API_KEY = os.getenv("API_KEY", "super_secret_face_recognition_api_key")
# Atenție: os.getenv întoarce string, iar "False" e truthy -> parsăm explicit
RUN_SYNC_AT_STARTUP = os.getenv("RUN_SYNC_AT_STARTUP", "false").strip().lower() in ("1", "true", "yes")

# Calea indexului facial (în Docker: pe volum persistent). Lipsă = index gol.
DB_FILE = os.getenv("FACE_INDEX_PATH", "fbi_vectors.pkl")
# URL-uri descărcate dar fără față detectabilă (sărite la sync-urile următoare)
NO_FACE_FILE = DB_FILE + ".noface.json"

def env_int(name, default, minimum=0):
    """Nesetată = default; goală = 0; invalidă = default."""
    raw = os.getenv(name)
    if raw is None:
        return default
    raw = raw.strip()
    if raw == "":
        return 0 if minimum == 0 else default
    try:
        return max(minimum, int(raw))
    except ValueError:
        print(f"⚠️ {name}='{raw}' invalid, folosesc {default}.")
        return default

# Câte persoane (sau poze, fără limită) procesează sync-ul între două salvări ale indexului
SYNC_BATCH_SIZE = env_int("SYNC_BATCH_SIZE", 50, minimum=1)
# Câte persoane sunt recunoscute (o poză per persoană). 0 sau gol = fără limită: toate pozele
SYNC_MAX_PERSONS = env_int("SYNC_MAX_PERSONS", 100)
# Pauză între descărcări, ca să nu încărcăm serverele FBI
SYNC_DELAY_MS = env_int("SYNC_DELAY_MS", 200)

def env_delays(name, default):
    """Secunde separate prin virgulă. Nesetată = default; goală = fără reîncercări; invalidă = default."""
    raw = os.getenv(name)
    if raw is None:
        return default
    delays = []
    for part in raw.split(","):
        if not part.strip():
            continue
        try:
            delays.append(max(0.0, float(part)))
        except ValueError:
            print(f"⚠️ {name}='{raw}' invalid, folosesc {default}.")
            return default
    return delays

# Pauzele dintre reîncercările unei descărcări eșuate din sync (eroare de rețea, 429, 5xx).
# Implicit 5s, apoi 15s: 3 încercări, ca un sync să nu lase persoane fără vector din cauza unei erori trecătoare
SYNC_RETRY_DELAYS = env_delays("SYNC_RETRY_DELAYS", [5, 15])
# Ce afișe FBI (poster_classification) sunt indexate: implicit doar persoanele căutate.
# Cu o listă se exclud și victimele (person_classification) și afișele ViCAP
# (dispăruți, neidentificați). "*" = toate afișele, fără niciun filtru.
DEFAULT_CLASSIFICATIONS = "default,ten,terrorist,fraudster,crimes-against-children,kidnapping,law-enforcement-assistance,ecap"
_classifications = os.getenv("SYNC_INCLUDE_CLASSIFICATIONS") or ""
SYNC_INCLUDE_CLASSIFICATIONS = [
    c.strip().lower() for c in (_classifications if _classifications.strip() else DEFAULT_CLASSIFICATIONS).split(",") if c.strip()
]
SYNC_ALL_CLASSIFICATIONS = "*" in SYNC_INCLUDE_CLASSIFICATIONS
# Latura maximă a unei poze înainte de detecție (RAM și viteză); 0 = fără redimensionare
IMAGE_MAX_SIDE = env_int("IMAGE_MAX_SIDE", 1280)
# Rescrie prefixul URL-urilor pozelor raportate la descărcare: "public=>intern".
# În dev: http://localhost:8088=>http://nginx (localhost din container e containerul însuși). Gol în prod.
IMAGE_URL_REWRITE = (os.getenv("IMAGE_URL_REWRITE") or "").strip()
if IMAGE_URL_REWRITE and "=>" not in IMAGE_URL_REWRITE:
    print(f"⚠️ IMAGE_URL_REWRITE='{IMAGE_URL_REWRITE}' invalid (format: public=>intern), îl ignor.")
    IMAGE_URL_REWRITE = ""

# Rapoartele sync-ului (o linie per poză); implicit lângă index, pe același volum
SYNC_REPORT_DIR = os.getenv("SYNC_REPORT_DIR") or os.path.join(os.path.dirname(DB_FILE) or ".", "sync-reports")
SYNC_REPORT_KEEP = env_int("SYNC_REPORT_KEEP", 20, minimum=1)

vector_db = []
no_face_urls = set()

# --- 1. LOGICA DE SINCRONIZARE ---
def fetch_images_from_postgres(verbose=True):
    """Toate pozele din "WantedImages", ordonate după persoană și poză. None = eroare DB."""
    try:
        if verbose:
            print(f"🔌 Connecting to DB at {DB_HOST}:{DB_PORT} as {DB_USER}...")
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASS
        )
        cur = conn.cursor()
        # Atenție la ghilimele, Postgres e sensibil la case dacă s-a creat cu EF Core
        filters, params = "", []
        if not SYNC_ALL_CLASSIFICATIONS:
            filters = """
              AND lower(wp."PosterClassification") = ANY(%s)
              AND coalesce(wp."PersonClassification", '') <> 'Victim'
              AND NOT EXISTS (SELECT 1 FROM "WantedSubjects" ws
                              WHERE ws."WantedPersonId" = wp."Id" AND ws."Name" ILIKE 'ViCAP%%')
            """
            params = [SYNC_INCLUDE_CLASSIFICATIONS]
        sql_query = """
            SELECT wp."Id", wi."OriginalUrl", wi."LargeUrl"
            FROM "WantedImages" wi
            INNER JOIN "WantedPersons" wp ON wi."WantedPersonId" = wp."Id"
            WHERE wi."OriginalUrl" IS NOT NULL AND wi."OriginalUrl" != ''
        """ + filters + """
            ORDER BY wp."Id", wi."Id"
        """

        cur.execute(sql_query, params)
        rows = cur.fetchall()

        cur.close()
        conn.close()
        # [(person_id, url_original, url_large_sau_None), ...]
        return [(row[0], row[1], row[2] or None) for row in rows]
    except Exception as e:
        print(f"❌ DB Connection Error: {e}")
        return None

def fetch_person_counts():
    """(persoane în DB, persoane fără poster_classification). None = eroare DB."""
    try:
        conn = psycopg2.connect(host=DB_HOST, port=DB_PORT, database=DB_NAME, user=DB_USER, password=DB_PASS)
        cur = conn.cursor()
        cur.execute('SELECT count(*), count(*) FILTER (WHERE "PosterClassification" IS NULL) FROM "WantedPersons"')
        total, unclassified = cur.fetchone()
        cur.close()
        conn.close()
        return total, unclassified
    except Exception as e:
        print(f"❌ DB Connection Error: {e}")
        return None

def limit_image_size(img):
    """Micșorează pozele mari înainte de detecție (memorie și viteză)."""
    if img is None or IMAGE_MAX_SIDE <= 0:
        return img
    h, w = img.shape[:2]
    if max(h, w) <= IMAGE_MAX_SIDE:
        return img
    scale = IMAGE_MAX_SIDE / max(h, w)
    return cv2.resize(img, (max(1, int(w * scale)), max(1, int(h * scale))), interpolation=cv2.INTER_AREA)

def rewrite_image_url(url):
    """Aplică IMAGE_URL_REWRITE (prefix public -> intern) pe URL-ul unei poze raportate."""
    if IMAGE_URL_REWRITE:
        src, dst = (part.strip() for part in IMAGE_URL_REWRITE.split("=>", 1))
        if src and url.startswith(src):
            return dst + url[len(src):]
    return url

def select_sync_units(rows):
    """Ce trebuie să fie în index: [(cheie, [(url_original, url_large), ...]), ...].
    Cu SYNC_MAX_PERSONS > 0: o unitate per persoană (primele N după Id), candidatele sunt
    pozele ei în ordinea Id; se indexează prima cu față detectabilă.
    Cu 0: fiecare poză e o unitate separată (toate pozele)."""
    if SYNC_MAX_PERSONS == 0:
        return [(f"img:{u_orig}", [(u_orig, u_large)]) for _, u_orig, u_large in rows]
    units, by_person = [], {}
    for person_id, u_orig, u_large in rows:
        if person_id not in by_person:
            if len(by_person) >= SYNC_MAX_PERSONS:
                break  # rândurile sunt ordonate după persoană
            by_person[person_id] = []
            units.append((person_id, by_person[person_id]))
        by_person[person_id].append((u_orig, u_large))
    return units

def unit_url_map(units):
    url_to_unit = {}
    for key, candidates in units:
        for u_orig, u_large in candidates:
            url_to_unit.setdefault(u_orig, key)
            if u_large:
                url_to_unit.setdefault(u_large, key)
    return url_to_unit

def is_no_face(candidate):
    u_orig, u_large = candidate
    return u_orig in no_face_urls or (u_large is not None and u_large in no_face_urls)

def save_index():
    """Scriere atomică: un crash în timpul salvării nu strică indexul existent."""
    os.makedirs(os.path.dirname(DB_FILE) or ".", exist_ok=True)
    tmp_file = DB_FILE + ".tmp"
    with open(tmp_file, 'wb') as f:
        pickle.dump(vector_db, f)
    os.replace(tmp_file, DB_FILE)
    with open(NO_FACE_FILE + ".tmp", 'w', encoding='utf-8') as f:
        json.dump(sorted(no_face_urls), f)
    os.replace(NO_FACE_FILE + ".tmp", NO_FACE_FILE)

def download_image(u_orig, u_large):
    """Descarcă poza (originală, apoi large).
    Întoarce (bytes_comprimați, url, None) sau (None, url_original, motivul eșecului)."""
    def get_bytes(u):
        reason = ""
        for attempt, delay in enumerate([0] + SYNC_RETRY_DELAYS):
            if attempt:
                print(f"   ↻ Reîncerc ({attempt}/{len(SYNC_RETRY_DELAYS)}) peste {delay:g}s după {reason}: {u}")
                time.sleep(delay)
            time.sleep(SYNC_DELAY_MS / 1000)
            try:
                with requests.Session() as s:
                    resp = s.get(u, impersonate="chrome110", allow_redirects=True, timeout=10)
                    # Erori trecătoare: se reîncearcă; 404/403 etc. nu
                    if resp.status_code == 429 or resp.status_code >= 500:
                        reason = f"HTTP {resp.status_code}"
                        continue
                    if resp.status_code != 200: return None, f"HTTP {resp.status_code}"
                    ct = resp.headers.get("content-type", "").lower()
                    if "text" in ct or "html" in ct: return None, f"content-type {ct or '?'}"
                    return np.frombuffer(resp.content, dtype=np.uint8), None
            except Exception as e:
                reason = type(e).__name__
        print(f"   ✗ Descărcare eșuată după {len(SYNC_RETRY_DELAYS) + 1} încercări ({reason}): {u}")
        return None, f"{reason} după {len(SYNC_RETRY_DELAYS) + 1} încercări"

    img_bytes, reason = get_bytes(u_orig)
    if img_bytes is not None:
        return img_bytes, u_orig, None
    reasons = [f"original: {reason}"]
    if u_large:
        img_bytes, reason = get_bytes(u_large)
        if img_bytes is not None:
            return img_bytes, u_large, None
        reasons.append(f"large: {reason}")
    return None, u_orig, "; ".join(reasons)

class SyncReport:
    """Raportul unui sync: o linie per poză încercată (indexată, fără față, eșuată), apoi rezumatul.
    Fișierul e scris pe loc (flush per linie), ca să poată fi urmărit și dacă sync-ul se oprește."""
    def __init__(self):
        self.path = None
        self.file = None
        try:
            os.makedirs(SYNC_REPORT_DIR, exist_ok=True)
            # Păstrăm doar ultimele SYNC_REPORT_KEEP rapoarte
            old = sorted(f for f in os.listdir(SYNC_REPORT_DIR) if f.startswith("sync-") and f.endswith(".log"))
            for name in old[:max(0, len(old) - SYNC_REPORT_KEEP + 1)]:
                os.remove(os.path.join(SYNC_REPORT_DIR, name))
            self.path = os.path.join(SYNC_REPORT_DIR, time.strftime("sync-%Y%m%d-%H%M%S.log"))
            self.file = open(self.path, "w", encoding="utf-8")
            print(f"📝 SYNC REPORT: {self.path}")
        except Exception as e:
            print(f"⚠️ Nu pot scrie raportul sync-ului în {SYNC_REPORT_DIR} ({e}); continui fără el.")

    def line(self, text):
        if self.file:
            self.file.write(text + "\n")
            self.file.flush()

    def item(self, status, person, url, detail=""):
        self.line(f"{time.strftime('%H:%M:%S')}  {status:<15} persoana {str(person):<8} {url}" + (f"  ({detail})" if detail else ""))

    def close(self, summary):
        self.line("")
        self.line(summary)
        if self.file:
            self.file.close()
            self.file = None

def run_sync_job():
    """Sincronizează indexul cu setul selectat din "WantedImages" (SYNC_MAX_PERSONS)."""
    report = SyncReport()
    try:
        summary = sync_index(report)
    except Exception as e:
        summary = f"🏁 SYNC FAILED: {type(e).__name__}: {e}"
    if report.path:
        summary += f" Report: {report.path}"
    print(summary)
    report.close(summary)

def sync_index(report):
    """Corpul sync-ului; întoarce linia finală (SYNC FINISHED / SYNC FAILED)."""
    global vector_db, no_face_urls
    limit = SYNC_MAX_PERSONS or "fără limită"
    classes = "*" if SYNC_ALL_CLASSIFICATIONS else ",".join(SYNC_INCLUDE_CLASSIFICATIONS)
    print(f"⏰ SYNC STARTED (max persons: {limit}, classifications: {classes}, batch {SYNC_BATCH_SIZE}, delay {SYNC_DELAY_MS} ms)...")
    report.line(f"SYNC {time.strftime('%Y-%m-%d %H:%M:%S')} (max persons: {limit}, classifications: {classes}, retry: {SYNC_RETRY_DELAYS or '-'})")
    report.line("Status: INDEXAT = adăugată în index; FARA_FATA = descărcată, dar fără față detectabilă;")
    report.line("        DESCARCARE_ESUATA = nu s-a putut descărca (motivul în paranteză); EROARE_AI = eroare la procesare.")
    report.line("")

    # 1. Luăm pozele
    db_rows = fetch_images_from_postgres()
    if db_rows is None:
        return "🏁 SYNC FAILED: nu pot citi \"WantedImages\" din DB."
    if not db_rows:
        # Tabela goală (scraper-ul n-a rulat încă): nu ștergem nimic din index
        counts = fetch_person_counts()
        if counts and counts[0] and counts[1] == counts[0]:
            print("⚠️ No URLs found: persoanele nu au poster_classification. Rulează importul FBI din nou (SCRAPER_RUN_AT_STARTUP=always).")
        elif counts and counts[0]:
            print("⚠️ No URLs found: nicio persoană nu corespunde SYNC_INCLUDE_CLASSIFICATIONS.")
        else:
            print("⚠️ No URLs found in \"WantedImages\" (scraper-ul FBI n-a terminat încă?).")
        return f"🏁 SYNC FINISHED. Added 0, removed 0, failed 0, no face 0. Index size: {len(vector_db)}"

    units = select_sync_units(db_rows)
    url_to_unit = unit_url_map(units)

    # 2. Păstrăm doar URL-urile din setul selectat, cel mult un vector per unitate
    kept, covered = [], set()
    for item in vector_db:
        key = url_to_unit.get(item.get("url"))
        if key is not None and key not in covered:
            kept.append(item)
            covered.add(key)
    removed = len(vector_db) - len(kept)
    vector_db = kept
    no_face_urls &= set(url_to_unit)
    if removed:
        save_index()
        print(f"🧹 Removed {removed} vectors outside the selected set (or duplicates).")

    # 3. Ce lipsește: unitățile fără vector; pozele știute fără față sunt sărite
    todo, known_no_face = [], 0
    for key, candidates in units:
        if key in covered:
            continue
        pending = [c for c in candidates if not is_no_face(c)]
        if pending:
            todo.append((key, pending))
        else:
            known_no_face += 1
    total = len(todo)
    unit_name = "persons" if SYNC_MAX_PERSONS else "images"
    if not total:
        print("✅ Nothing new to index.")
        report.line("Nimic nou de indexat.")
        return f"🏁 SYNC FINISHED. Added 0, removed {removed}, failed 0, no face {known_no_face}. Index size: {len(vector_db)}"

    print(f"🔄 Indexing {total} {unit_name} ({len(units)} selected, {len(covered)} already indexed)...")

    processed = added = failed = no_face = 0
    for start in range(0, total, SYNC_BATCH_SIZE):
        for key, candidates in todo[start:start + SYNC_BATCH_SIZE]:
            processed += 1
            indexed = False
            only_no_face = True
            # Prima poză cu față detectabilă; altfel următoarea poză a aceleiași persoane
            for u_orig, u_large in candidates:
                img_bytes, url, reason = download_image(u_orig, u_large)
                if img_bytes is None:
                    only_no_face = False
                    print(f"⚠️ Download failed: {url} ({reason})")
                    report.item("DESCARCARE_ESUATA", key, url, reason)
                    continue
                try:
                    img_mat = limit_image_size(cv2.imdecode(img_bytes, cv2.IMREAD_COLOR))
                    del img_bytes
                    if img_mat is None:
                        raise RuntimeError("imagine invalidă")
                    try:
                        objs = DeepFace.represent(
                            img_path=img_mat,
                            model_name="Facenet",
                            enforce_detection=True,
                            detector_backend="opencv"
                        )
                    except ValueError:
                        no_face_urls.add(url)
                        print(f"🙈 No face: {url}")
                        report.item("FARA_FATA", key, url)
                        continue
                    vector_db.append({"url": url, "embedding": objs[0]["embedding"]})
                    indexed = True
                    report.item("INDEXAT", key, url)
                    break
                except Exception as e:
                    only_no_face = False
                    print(f"❌ AI Failed for {url}: {e}")
                    report.item("EROARE_AI", key, url, str(e))
            if indexed:
                added += 1
            elif only_no_face:
                no_face += 1
            else:
                failed += 1

        # Salvăm pe disc după fiecare lot (ca să nu pierdem progresul)
        save_index()
        print(f"📊 Progress: {processed}/{total} {unit_name} processed, {added} added, {failed} failed, {no_face} no face. Index size: {len(vector_db)}")

    return f"🏁 SYNC FINISHED. Added {added}, removed {removed}, failed {failed}, no face {no_face + known_no_face}. Index size: {len(vector_db)}"
# --- 2. CONFIGURARE SCHEDULER ---
scheduler = BackgroundScheduler()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # -- STARTUP --
    # 1. Încărcăm cache-ul existent
    global vector_db, no_face_urls
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, 'rb') as f:
                loaded = pickle.load(f)
            if not isinstance(loaded, list):
                raise ValueError("format neașteptat")
            vector_db = loaded
            print(f"📂 Loaded {len(vector_db)} vectors from disk.")
        except Exception as e:
            vector_db = []
            print(f"⚠️ Cache corrupt ({e}): pornesc cu index gol.")
    else:
        print(f"📂 Index inexistent ({DB_FILE}): pornesc cu index gol.")

    if os.path.exists(NO_FACE_FILE):
        try:
            with open(NO_FACE_FILE, encoding='utf-8') as f:
                no_face_urls = set(json.load(f))
        except Exception as e:
            print(f"⚠️ {NO_FACE_FILE} ilizibil ({e}), îl ignor.")

    if not vector_db:
        print("⚠️ Indexul facial e gol: recunoașterea nu va găsi potriviri. Rulează scripts/sync-faces.sh --full.")

    print("🐰 Starting RabbitMQ Consumer Thread...")
    worker_thread = threading.Thread(target=start_rabbitmq_consumer, daemon=True)
    worker_thread.start()

    # 2. Pornim Scheduler-ul
    # Rulează în fiecare zi la ora 03:00 AM
    #scheduler.add_job(run_sync_job, 'cron', hour=3, minute=0)
    #scheduler.start()
    print("🕒 Scheduler started (Runs daily at 03:00).")

    
    
    # 3. (Opțional) Rulăm un sync rapid la start, ca să nu aștepți până mâine
    if RUN_SYNC_AT_STARTUP:
        run_sync_job() 
    
    yield
    
    # -- SHUTDOWN --
    scheduler.shutdown()

# --- 3. INIT API ---
app = FastAPI(title="FBI Autonomous AI", lifespan=lifespan)

class SearchRequest(BaseModel):
    image_to_verify_url: str

# Helper matematic (același ca înainte)
def find_cosine_distance(source, test):
    a = np.matmul(np.transpose(source), test)
    b = np.sum(np.multiply(source, source))
    c = np.sum(np.multiply(test, test))
    return 1 - (a / (np.sqrt(b) * np.sqrt(c)))

def system_resolve_options(url):
    """Rezolvă hostul cu resolver-ul sistemului și îl dă lui curl (CURLOPT_RESOLVE).
    Resolver-ul din curl_cffi are nevoie de ~4s pentru numele interne Docker (nginx,
    alias-ul DOMAIN), adică aproape tot timeout-ul. URL-ul, Host și SNI rămân neschimbate."""
    try:
        parts = urlsplit(url)
        port = parts.port or (443 if parts.scheme == "https" else 80)
        ip = socket.getaddrinfo(parts.hostname, port, socket.AF_INET, socket.SOCK_STREAM)[0][4][0]
        return {CurlOpt.RESOLVE: [f"{parts.hostname}:{port}:{ip}"]}
    except Exception:
        return {}

def load_image_from_url(url: str):
    headers = {'User-Agent': 'Mozilla/5.0'}
    fetch_url = rewrite_image_url(url)
    print("load_image_from_url : " + url + ("" if fetch_url == url else f" (via {fetch_url})"))
    # O eroare la o încercare (timeout, DNS) nu oprește celelalte încercări
    for _ in range(5):
        try:
            response = requests.get(fetch_url, headers=headers, timeout=5, verify=False,
                                    curl_options=system_resolve_options(fetch_url))
            if response.status_code == 200:
                print("success")
                image_array = np.asarray(bytearray(response.content), dtype=np.uint8)
                return limit_image_size(cv2.imdecode(image_array, cv2.IMREAD_COLOR))
        except Exception as e:
            print(str(e))
    return None

def get_embedding(img_data):
    try:
        # Facenet e rapid. Folosim detection 'opencv' pt viteză
        objs = DeepFace.represent(img_path=img_data, model_name="Facenet", enforce_detection=False, detector_backend="opencv")
        return objs[0]["embedding"]
    except:
        return None

# Endpoint-ul de Search (Rămâne neschimbat, rapid)
@app.post("/fast-search")
async def fast_search(
        req: SearchRequest,
        x_api_key: str | None = Header(default=None, alias="X-FBI-Key")
    ):

    if not vector_db:
        raise HTTPException(status_code=400, detail="Database is empty. Call /sync-db first.")

    if x_api_key != API_KEY:
        raise HTTPException(status_code=400, detail="U must provide api key in ")


    target_img = load_image_from_url(req.image_to_verify_url)
    if target_img is None: raise HTTPException(status_code=400, detail="Download error")
    
    target_emb = get_embedding(target_img)
    if not target_emb: return {"matches": []}

    matches = []
    
    # Comparăm cu toți vectorii din memorie
    for item in vector_db:
        dist = find_cosine_distance(target_emb, item["embedding"])
        
        # Pragul de 0.40 (poți să-l scazi la 0.35 dacă vrei rezultate mai stricte)
        if dist < 0.40:
            matches.append({
                "url": item["url"],
                "confidence": round((1-dist)*100, 2)
            })
    
    # 1. Sortăm descrescător după încredere (cei mai buni primii)
    matches.sort(key=lambda x: x["confidence"], reverse=True)
    
    # 2. 🔥 AICI E MODIFICAREA: Returnăm doar primii 5
    top_5_matches = matches[:5] 

    return {"matches": top_5_matches}

@app.get("/health")
def health():
    """Healthcheck pentru Docker (procesul API răspunde)"""
    return {"status": "ok"}

@app.get("/index-status")
def index_status():
    """Indexul față de setul așteptat (SYNC_MAX_PERSONS); folosit de scripts/healthcheck.sh și dev-up."""
    rows = fetch_images_from_postgres(verbose=False)
    counts = fetch_person_counts()
    if rows is None or counts is None:
        raise HTTPException(status_code=503, detail="DB unavailable")
    units = select_sync_units(rows)
    url_to_unit = unit_url_map(units)
    index_urls = {item["url"] for item in vector_db}
    indexed_units = {url_to_unit[u] for u in index_urls if u in url_to_unit}
    missing = no_face = 0
    for key, candidates in units:
        if key in indexed_units:
            continue
        if all(is_no_face(c) for c in candidates):
            no_face += 1
        else:
            missing += 1
    return {
        "max_persons": SYNC_MAX_PERSONS,
        "db_images": len(rows),
        "expected": len(units),
        "indexed": len(index_urls),
        "indexed_expected": len(indexed_units),
        "orphans": sum(1 for u in index_urls if u not in url_to_unit),
        "missing": missing,
        "no_face": no_face,
        "persons_total": counts[0],
        "persons_unclassified": counts[1],
        "classifications": "*" if SYNC_ALL_CLASSIFICATIONS else ",".join(SYNC_INCLUDE_CLASSIFICATIONS),
    }

@app.get("/list-faces")
def list_faces():
    """Returnează lista celor 11 suspecți indexați"""
    return [item["url"] for item in vector_db]

# --- LOGICA RABBITMQ WORKER ---
def process_rabbitmq_message(ch, method, properties, body):
    """Callback-ul care se execută când vine un mesaj în coadă"""
    try:
        # 1. Despachetăm mesajul
        message = json.loads(body)["message"]
        print(f"🐰 [RabbitMQ] Received job: {message}")
        
        report_id = message.get("ReportId") or message.get("reportId") # Handle both cases
        image_url = message.get("ImageUrl") or message.get("imageUrl")
        
        if not report_id or not image_url:
            print("⚠️ Invalid message format.")
            ch.basic_ack(delivery_tag=method.delivery_tag)
            return

        # 2. Logica de AI (Copiată/Adaptată din fast_search)
        target_img = load_image_from_url(image_url)
        if target_img is None:
            print(f"❌ Failed to download image: {image_url}")
            # Putem marca raportul ca Failed în DB aici dacă vrei
            ch.basic_ack(delivery_tag=method.delivery_tag)
            return

        target_emb = get_embedding(target_img)
        
        matches = []
        if target_emb:
            # Comparăm cu baza vectoriala din memorie
            for item in vector_db:
                dist = find_cosine_distance(target_emb, item["embedding"])
                if dist < 0.40:
                    matches.append({
                        "url": item["url"],
                        "confidence": float(round((1-dist)*100, 2))
                    })
            matches.sort(key=lambda x: x["confidence"], reverse=True)
            top_5_matches = matches[:5]
        else:
            top_5_matches = []

        # 3. Scriem rezultatele în DB (Postgres)
        save_results_to_postgres(report_id, top_5_matches)
        
        # 4. Confirmăm mesajul (ACK) ca să fie șters din coadă
        print(f"✅ Job {report_id} finished. Matches found: {len(top_5_matches)}")

        response_message = {
            "reportId": report_id,
            "success": True
        }
        
        publish_queue = os.getenv("RABBIT_QUEUE_PUBLISH", "analysis-finished-queue")
        ch.queue_declare(queue=publish_queue, durable=True)
        
        ch.basic_publish(
            exchange='',
            routing_key=publish_queue,
            body=json.dumps(response_message),
            properties=pika.BasicProperties(
                delivery_mode=2,  # Mesaj persistent
                content_type='application/json'
            )
        )

        print(f"✅ Job {report_id} finished & notification sent.")
        ch.basic_ack(delivery_tag=method.delivery_tag)

    except Exception as e:
        print(f"❌ Worker Error: {e}")
        # În caz de eroare gravă, dăm NACK (mesajul revine în coadă sau merge în Dead Letter)
        # ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
        ch.basic_ack(delivery_tag=method.delivery_tag) # Dăm ACK ca să nu blocheze coada la infinit


def save_results_to_postgres(report_id, matches):
    """Funcție auxiliară pentru INSERT"""
    try:
        conn = psycopg2.connect(
            host=DB_HOST, port=DB_PORT, database=DB_NAME, user=DB_USER, password=DB_PASS
        )
        cur = conn.cursor()
        
        # 1. Insert Match-uri
        if matches:
            args_str = ','.join(cur.mogrify("(%s, %s, %s)", (report_id, m['url'], m['confidence'])).decode('utf-8') for m in matches)
            cur.execute("INSERT INTO \"PersonMatchResults\" (\"LocationWantedPersonId\", \"ImageUrl\", \"Confidence\") VALUES " + args_str)
        
        # 2. Update Status Raport (Status = 1 aka Completed)
        # Asigură-te că ID-ul statusului '1' corespunde cu Enum-ul din C# (Completed)
        cur.execute('UPDATE "LocationWantedPersons" SET "Status" = 1 WHERE "Id" = %s', (report_id,))
        
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"❌ DB Save Error: {e}")

def start_rabbitmq_consumer():
    """Această funcție rulează în thread separat"""
    while True:
        try:
            print("🐰 Connecting to RabbitMQ...")
            # 'rabbitmq' este numele containerului din docker-compose
            # Dacă rulezi local python (fără docker), pune 'localhost'
            rabbit_host = os.getenv("RABBIT_HOST", "localhost") 
            rabbit_user = os.getenv("RABBIT_USER", "guest")
            rabbit_pass = os.getenv("RABBIT_PASS", "guest")

            
            connection = pika.BlockingConnection(
                pika.ConnectionParameters(
                    host=rabbit_host, 
                    credentials=pika.PlainCredentials( rabbit_user, rabbit_pass),
                    heartbeat=600 # Keep-alive mai lung
                )
            )
            channel = connection.channel()
            
            # Ne asigurăm că există coada (Idempotent)
            # IMPORTANT: Numele trebuie să fie identic cu cel din C# (MassTransit)
            # MassTransit de obicei folosește numele complet al contractului, ex: "FbiApi.Contracts:AnalyzeFaceCommand"
            # Sau dacă ai configurat un endpoint specific în C#, folosește numele ăla.
            # Pentru simplitate, să zicem că ai configurat în C# queue name = 'face-analysis-queue'
            QUEUE_NAME = os.getenv("RABBIT_QUEUE", 'face-analysis-queue') 
            
            channel.queue_declare(queue=QUEUE_NAME, durable=True)
            channel.basic_qos(prefetch_count=1) # Ia câte un mesaj pe rând
            
            channel.basic_consume(queue=QUEUE_NAME, on_message_callback=process_rabbitmq_message)
            
            print("🐰 Consumer started. Waiting for messages...")
            channel.start_consuming()
        
        except Exception as e:
            print(f"⚠️ RabbitMQ Connection Failed: {e}. Retrying in 5s...")
            time.sleep(5)
import pickle
import psycopg2
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel
import numpy as np
import cv2
# Șterge sau comentează: import requests
from curl_cffi import requests # 👈 Folosim requests din curl_cffi
from deepface import DeepFace
from concurrent.futures import ThreadPoolExecutor
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
RUN_SYNC_AT_STARTUP = os.getenv("RUN_SYNC_AT_STARTUP", False)

DB_FILE = "fbi_vectors.pkl"
vector_db = []

# --- 1. LOGICA DE SINCRONIZARE ---
def fetch_urls_from_postgres():
    """Se conectează direct la Postgres și ia toate pozele."""
    try:
        print(f"🔌 Connecting to DB at {DB_HOST}:{DB_PORT} as {DB_USER}...")
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,      # <-- Specificăm portul aici
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASS
        )
        cur = conn.cursor()
        # Presupunem că tabela se numește "WantedPersons" și coloana "ImageURL"
        # Atenție la ghilimele, Postgres e sensibil la case dacă s-a creat cu EF Core
        sql_query = """
            SELECT wi."OriginalUrl", wi."LargeUrl"
            FROM "WantedImages" wi
            INNER JOIN "WantedPersons" wp ON wi."WantedPersonId" = wp."Id"
            WHERE wi."OriginalUrl" IS NOT NULL AND wi."OriginalUrl" != '' AND wi."LargeUrl" IS NOT NULL AND wi."LargeUrl" != ''
            LIMIT 200
        """

        cur.execute(sql_query)
        rows = cur.fetchall()

        cur.close()
        conn.close()
        # rows vine ca [('url1',), ('url2',)] -> le facem listă simplă
        return [ (row[0],row[1]) for row in rows if row[0]]
    except Exception as e:
        print(f"❌ DB Connection Error: {e}")
        return []

def run_sync_job():
    """Funcție optimizată: Download Paralel -> Procesare Serială"""
    global vector_db
    print("⏰ CRON JOB STARTED: Daily Vector Sync...")
    
    # 1. Luăm URL-urile
    db_urls = fetch_urls_from_postgres()
    if not db_urls:
        print("⚠️ No URLs found.")
        return

    # 2. Vedem ce e nou
    # db_urls vine ca [(url_mic, url_mare), ...]
    # cached_urls ține minte doar url-ul final salvat
    cached_urls = {item["url"] for item in vector_db}
    
    # Filtrăm tuplele. Dacă url_mic SAU url_mare e deja în cache, sărim.
    new_entries = []
    for u_small, u_large in db_urls:
        if u_small not in cached_urls and (not u_large or u_large not in cached_urls):
            new_entries.append((u_small, u_large))
    
    if not new_entries:
        print("✅ Nothing new to index.")
        return

    print(f"🔄 Indexing {len(new_entries)} new faces in batches...")

    # --- FUNCȚIA DE DOWNLOAD (Doar download, fără AI) ---
    def download_only(url_tuple):
        u_small, u_large = url_tuple
        
        # Helper intern
        def get_bytes(u):
            if not u: return None
            try:
                with requests.Session() as s:
                    resp = s.get(u, impersonate="chrome110", allow_redirects=True, timeout=10)
                    if resp.status_code != 200: return None
                    ct = resp.headers.get("content-type", "").lower()
                    if "text" in ct or "html" in ct: return None
                    return np.asarray(bytearray(resp.content), dtype=np.uint8)
            except:
                return None

        # Încercăm mic
        img_arr = get_bytes(u_small)
        final_url = u_small

        # Încercăm mare dacă mic a eșuat
        if img_arr is None and u_large:
            img_arr = get_bytes(u_large)
            final_url = u_large
        
        if img_arr is None:
            return None

        # Decodăm AICI (e safe în thread dacă cv2.setNumThreads(0) e setat)
        try:
            img = cv2.imdecode(img_arr, cv2.IMREAD_COLOR)
            return {"img": img, "url": final_url}
        except:
            return None

    # --- PROCESAREA ÎN LOTURI (BATCHES) ---
    # Procesăm câte 10 ca să nu umplem RAM-ul
    BATCH_SIZE = 10
    total_added = 0

    # Spargem lista în bucăți de 10
    chunks = [new_entries[i:i + BATCH_SIZE] for i in range(0, len(new_entries), BATCH_SIZE)]

    for chunk in chunks:
        # PASUL 1: Download Paralel (Rapid)
        # Putem folosi mai mulți workeri aici că e doar rețea, nu CPU
        downloaded_images = []
        with ThreadPoolExecutor(max_workers=5) as ex:
            results = ex.map(download_only, chunk)
            downloaded_images = [r for r in results if r is not None]

        # PASUL 2: AI Serial (Safe & Stable)
        # Rulăm DeepFace pe rând, pe thread-ul principal
        for item in downloaded_images:
            try:
                img_mat = item["img"]
                url_final = item["url"]
                
                print(f"🧠 Analyzing AI: {url_final[:40]}...")
                
                objs = DeepFace.represent(
                    img_path=img_mat, 
                    model_name="Facenet", 
                    enforce_detection=False, 
                    detector_backend="opencv"
                )
                
                # Salvăm în memorie
                vector_db.append({"url": url_final, "embedding": objs[0]["embedding"]})
                total_added += 1
                
            except Exception as e:
                print(f"❌ AI Failed for {item['url']}: {e}")

        # Salvăm pe disc după fiecare batch (ca să nu pierdem progresul dacă pică curentul)
        with open(DB_FILE, 'wb') as f:
            pickle.dump(vector_db, f)
            
        print(f"💾 Saved batch. Total so far: {total_added}")

    print(f"🏁 SYNC FINISHED. Added {total_added} new faces.")
# --- 2. CONFIGURARE SCHEDULER ---
scheduler = BackgroundScheduler()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # -- STARTUP --
    # 1. Încărcăm cache-ul existent
    global vector_db
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, 'rb') as f:
                vector_db = pickle.load(f)
            print(f"📂 Loaded {len(vector_db)} vectors from disk.")
        except:
            print("⚠️ Cache corrupt.")

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

def load_image_from_url(url: str):
    try:
        headers = {'User-Agent': 'Mozilla/5.0'}
        success = False
        iterations = 5
        print("load_image_from_url : " + url)
        while iterations > 0 and success == False:
            response = requests.get(url, headers=headers, timeout=5, verify=False)
            if response.status_code == 200:
                print("success")
                image_array = np.asarray(bytearray(response.content), dtype=np.uint8)
                success = True
            iterations -= 1
        
        return  cv2.imdecode(image_array, cv2.IMREAD_COLOR) if success else None
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
    
    print(x_api_key)
    print(API_KEY)
    
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
            routing_key='analysis-finished-queue',
            body=json.dumps(response_message),
            properties=pika.BasicProperties(
                delivery_mode=2,  # Mesaj persistent
                content_type='application/json'
            )
        )

        print(f"✅ Job {report_id} finished & notification sent.")
        ch.basic_ack(delivery_tag=method.delivery_tag)

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
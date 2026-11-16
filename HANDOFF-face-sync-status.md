# Handoff: sync-ul facial să ignore persoanele care nu mai sunt căutate

Notă pentru o sesiune nouă de Claude Code (scrisă pe 2026-11-16, branch `chore/deploy-docs`,
după commit-ul `2eb33bb`). Citește întâi `CLAUDE.md`. Șterge acest fișier după ce termini.

## Context

`run_sync_job` din `face-recog-microservice/main.py` indexează câte o poză (prima cu față)
pentru primele `SYNC_MAX_PERSONS` (100) persoane din `"WantedPersons"`, după `Id`, filtrate
după `SYNC_INCLUDE_CLASSIFICATIONS`. În dev, indexul are 66 de vectori din 100: 34 de persoane
nu au putut fi indexate.

Commit-ul `2eb33bb` a adăugat un raport per poză. Primul raport e în
`logs/sync-faces/dev-sync-20261116-165015.log`: 34 de persoane, 82 de poze, toate cu
`DESCARCARE_ESUATA`. Motivele, pentru poza originală: 76 × `content-type text/html`,
4 × timeout, 2 × HTTP 503.

## Diagnostic (deja făcut, nu-l mai repeta)

**Nu e blocare anti-bot.** Persoanele sunt prinse sau cazurile închise, iar FBI a scos afișele de pe site.

- O cerere pe `https://www.fbi.gov/wanted/additional/gordon-montanez/@@images/image`
  (persoana 22) a dat redirect la `https://www.fbi.gov/?came_from=...` (200, pagina
  principală, HTML). `came_from` e redirectul Plone pentru conținut care nu mai e public.
- În DB, persoana 22 are `"WantedPersons"."Status" = 'captured'`.
- Statusul celor 100 de persoane din set:

  | Status FBI | Eșuate (34) | Indexate (66) |
  |---|---|---|
  | `na` (încă e căutat) | 6 | 64 |
  | `captured` | 25 | 1 |
  | `resolved` / `surrendered` / `deceased` | 3 | 1 |

  28 din 34 de eșecuri sunt persoane cu status diferit de `na`.

API-ul FBI (`api.fbi.gov/wanted/v1/list`) încă le întoarce cu URL-urile pozelor, deci
scraper-ul le păstrează. Scraper-ul nu șterge persoane, doar face upsert.

**Atenție la FBI:** utilizatorul nu vrea multe cereri către fbi.gov. Nu rula un sync complet
sau teste care descarcă multe poze fără să întrebi. Pentru verificări punctuale, maxim 1–2 cereri.

## De făcut

1. **Doar persoanele cu `Status = 'na'` (încă căutate) intră în setul recunoscut.**
   - Filtrul se pune în SQL-ul din `fetch_images_from_postgres` (`main.py`, ~linia 105), lângă
     filtrele de clasificare existente. `index_status()` (`GET /index-status`, ~linia 566)
     folosește aceeași funcție, deci rămâne automat sincron cu `select_sync_units`, cum cere
     `CLAUDE.md`. Verifică totuși.
   - De lămurit: `Status` NULL sau gol se tratează ca `na`? Probabil da, verifică în DB câte
     sunt: `SELECT "Status", count(*) FROM "WantedPersons" GROUP BY 1`.
   - De decis cu utilizatorul: filtrul e fix sau configurabil printr-o variabilă nouă
     (ex. `SYNC_INCLUDE_STATUSES`, gol = `na`, `*` = toate)? Dacă e configurabil, variabila
     trebuie adăugată în `docker-compose.yaml` (secțiunea `python-ai`), `.env.example`,
     `.env.prod.example` și `docs/dev/environment.md`.
   - Efect: cele 2 persoane indexate cu `captured`/`surrendered` ies din index la următorul
     sync (pasul de curățare), iar locul celor 28 îl iau persoane încă căutate.
2. **Opțional:** în `download_image`, redirectul către pagina principală (`r.url` conține
   `came_from=`) să fie raportat ca motiv separat, ex. `poza retrasa de FBI`, nu
   `content-type text/html`. `SyncReport` și numărătoarea din `scripts/sync-faces.sh` nu
   trebuie schimbate dacă statusul rămâne `DESCARCARE_ESUATA`.
3. **Rămân 6 persoane `na` cu descărcări eșuate**, neinvestigate. Id-urile se iau din raport:
   persoanele eșuate care au `Status = 'na'`. Investigarea cere cereri către fbi.gov, deci
   întreabă înainte.
4. **Documentație:** actualizează `docs/architecture.md` (paragraful despre selecția
   sync-ului, ~linia 256), `docs/dev/local-setup.md` (~linia 58) și secțiunea despre sync din
   `CLAUDE.md` ("only fugitives are recognised...").

## Constrângeri

- `main.py` are terminații de linie **CRLF**. Nu-l rescrie cu un script care le schimbă în LF
  (diff-ul ar arăta tot fișierul). Scripturile `.sh` rămân LF.
- Comentariile și mesajele de log sunt în română, ca în restul codului.
- Nu există teste automate. Verificarea se face așa:
  - `python -c "import ast; ast.parse(open('main.py', encoding='utf-8').read())"`;
  - `scripts/dev-up.sh python-ai` (rebuild);
  - `curl -s http://localhost:18006/index-status` (numărul `expected` și `missing`);
  - un sync (`scripts/sync-faces.sh --dev`) **doar cu acordul utilizatorului** (vezi mai sus).
    Ar descărca doar persoanele noi intrate în set.
- După un sync, raportul nou din `logs/sync-faces/` trebuie dat în commit (`release-build.sh`
  cere un working tree curat).
- Commit pe `chore/deploy-docs` (nu pe `main`), mesaje în stilul `feat(ai): ...`.

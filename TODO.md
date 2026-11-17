# TODO

Open work from the move to "build on the PC, push over SSH" (Nov 2026).

## 1. Test the release flow end to end

Not done yet. Builds started from an agent's background shell hung after the
image was written (`docker build` / `compose build` never exited). Run the
build from an interactive Git Bash window.

1. `scripts/release-build.sh --measure` with a test `.env.prod`
   (`DOMAIN=fbi-prodtest.internal`, `COMPOSE_PROJECT_NAME=fbi-prodtest`,
   `HTTP_PORT`/`HTTPS_PORT` on free ports). Note the uncompressed and gzip
   sizes and fill in the TODOs in `docs/prod/requirements.md`.
2. Start a local `fbi-prodtest` stack only from those images
   (`PROD_ENV_FILE=<test env> RELEASE_FILE=<tmp> scripts/prod-deploy.sh --tag <sha>`).
   Put a self-signed certificate for the test domain in the `letsencrypt`
   volume (`live/<domain>/fullchain.pem` + `privkey.pem`) first. Bind the
   ports to `127.0.0.1` on a shared network.
3. Check: every service healthy, `up` with `--pull never`, login through
   `/api/Auth/login`, an API call with the token, and the frontend bundle
   containing `https://<domain>/api` (not `localhost`).
4. Test `scripts/push-face-index.sh` locally against `fbi-prodtest` (everything
   except the ssh hop): stats from `fbi-dev_face_index`, tar into the prod
   volume through `compose run python-ai`, python-ai restart, `/index-status`.
5. With a VPS: `release-push.sh` (arch check, checkout, image comparison,
   `docker save | ssh | docker load` from Docker Desktop's containerd store
   into the classic store, `--backup`, `--prune`), `--with-index`,
   `rollback.sh`. If `docker load` fails on the VPS, enable the containerd
   image store there (`"features": {"containerd-snapshotter": true}` in
   `/etc/docker/daemon.json`) and consider adding it to `setup-vps.sh`.

## 2. Slim down the python-ai image (~5.1 GB → ~3.9 GB)

Do this after step 1 works with the current images, so there is a baseline.

`docker history fbi/python-ai:dev` (Docker Desktop reports 5.12 GB):

| Layer | Size | Change | Estimate |
|---|---|---|---|
| `apt-get install build-essential cmake git wget unzip libgl1 libglib2.0-0` | 777 MB | Neither dlib nor face_recognition is in `requirements.txt` or the code, so drop `build-essential`, `cmake`, `git`, `wget` and `unzip` (gcc/g++ ~140 MB, git ~50 MB, cmake ~40 MB, plus perl and other dependencies). `libgl1` pulls `libllvm19` + mesa (~250 MB) and is only needed by the non-headless `opencv-python`. Keep only `libglib2.0-0`, with `--no-install-recommends`. | −0.7 GB |
| `pip install -r requirements.txt` | 2.81 GB | Delete `tensorflow/include` (351 MB of C++ headers, not used at runtime) in the same `RUN`. Keep only `opencv-python-headless` and drop `opencv-python` (~115 MB + its libs; check that no other dependency pulls it back in). `tensorflow-cpu` instead of `tensorflow` gains little: `libtensorflow_cc.so` is 973 MB either way and CUDA isn't installed. Drop Flask, gunicorn and flask-cors only if `grep` confirms nothing imports them. | −0.4…0.5 GB |
| Facenet weights | 94 MB | needed | 0 |

Verification:

- the same test photo gives the same top match with practically the same
  confidence (±0.5%);
- a sync of 10 persons works;
- `/health` is OK;
- report the new size, uncompressed and gzip.

Commit it separately.

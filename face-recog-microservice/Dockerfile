FROM python:3.11-slim

# Dependențe de sistem (pt dlib/face_recognition)
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    git \
    wget \
    unzip \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt
    
# Instalăm uvicorn explicit dacă nu e în requirements
RUN pip install uvicorn

# Logurile apar imediat (fără buffer); malloc cu mai puține arene = vârf de RAM mai mic
ENV PYTHONUNBUFFERED=1 \
    MALLOC_ARENA_MAX=2

# Weights-urile Facenet (~92 MB) intră în imagine, ca la runtime să nu depindem de GitHub
RUN python -c "from deepface import DeepFace; DeepFace.build_model(model_name='Facenet')" \
    && ls -la /root/.deepface/weights/

COPY . .

EXPOSE 8006

# IMPORTANT:
# "main:app" înseamnă: fișierul main.py, variabila app (FastAPI/Flask instance)
# --host 0.0.0.0 este OBLIGATORIU în Docker
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8006"]

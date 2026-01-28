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

COPY . .

EXPOSE 8006

# IMPORTANT:
# "main:app" înseamnă: fișierul main.py, variabila app (FastAPI/Flask instance)
# --host 0.0.0.0 este OBLIGATORIU în Docker
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8006"]

FROM python:3.11-slim

# libgomp1 is required by onnxruntime (used by ChromaDB's ONNX embedder)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

# Install Python deps — separate layer so it caches well
COPY backend/requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Pre-download the ONNX embedding model into the image (avoids runtime download)
RUN python -c "from chromadb.utils import embedding_functions; embedding_functions.ONNXMiniLM_L6_V2()"

# Copy the rest of the backend source
COPY backend/ .

EXPOSE 8000

# Railway injects $PORT; fall back to 8000 for local docker run
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}

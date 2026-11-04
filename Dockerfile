# Second Eyes, one container (Brief 17): the built frontend and the FastAPI backend on one port, plain HTTP inside.
# The host's proxy (Coolify / Traefik) terminates HTTPS. No secrets in the image: everything comes from env vars.

# ---- 1. Build the frontend (typecheck + vite build) -----------------------------------------------------------------
FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- 2. Runtime: Python + the built files ---------------------------------------------------------------------------
FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    DATA_DIR=/data \
    STATIC_DIR=/app/static
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
# The face model (public/models) and the onnxruntime wasm are inside dist.
COPY --from=web /web/dist ./static
RUN useradd --create-home --uid 1000 app && mkdir -p /data && chown app /data
USER app
EXPOSE 8000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('PORT', '8000') + '/api/health', timeout=4)"
# --proxy-headers: the visitor's IP from X-Forwarded-For (used by the /api/slot rate limit) behind the host's proxy.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port \"$PORT\" --proxy-headers --forwarded-allow-ips='*'"]

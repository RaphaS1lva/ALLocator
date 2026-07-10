# Hugging Face Spaces (Docker SDK) espera o serviço na porta 7860.
FROM python:3.11-slim

WORKDIR /code
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# HF Spaces roda como usuário não-root
RUN useradd -m appuser
USER appuser

# HF Spaces usa 7860 fixo; Render injeta $PORT — o shell-form cobre os dois.
EXPOSE 7860
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-7860}

@echo off
REM ============================================================
REM DataMaster - API de IA (FastAPI)
REM De um duplo clique neste arquivo para subir a API local.
REM A janela precisa ficar ABERTA enquanto voce usa o portal.
REM Portal local: http://localhost:5173  |  API: http://127.0.0.1:8123
REM ============================================================
cd /d "%~dp0"
title DataMaster API - nao feche esta janela
python -m uvicorn app.main:app --port 8123
pause

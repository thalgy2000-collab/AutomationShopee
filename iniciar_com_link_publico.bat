@echo off
title Central de Automacao Shopee - Servidor + Ngrok Permanente
cd /d "%~dp0"
echo =============================================================
echo   Iniciando Central Shopee com Link Permanente Ngrok...
echo =============================================================
node ngrok_tunnel.mjs
pause

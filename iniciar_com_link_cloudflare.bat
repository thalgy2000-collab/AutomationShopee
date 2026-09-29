@echo off
title Central de Automacao Shopee - Servidor + Cloudflare Tunnel
cd /d "%~dp0"
echo =============================================================
echo   Iniciando Central Shopee com Link Cloudflare (Sem Limite)
echo =============================================================
node cloudflare_tunnel.mjs
pause

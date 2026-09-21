/**
 * ngrok_tunnel.mjs — Inicia e monitora o túnel permanente do Ngrok e o servidor local
 *
 * Garante que:
 * 1. O servidor local (server.mjs) esteja ativo e rodando.
 * 2. O túnel permanente do ngrok esteja ativo apontando para 127.0.0.1:80 (IPv4).
 * 3. Se o túnel cair por oscilação de rede, ele reconecta automaticamente.
 */

import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import http from 'node:http';

// Lê variáveis do .env se existir
const envPath = resolve('./.env');
if (existsSync(envPath)) {
  try {
    const lines = readFileSync(envPath, 'utf8').split(/[\r\n]+/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [k, ...v] = trimmed.split('=');
        if (k && v.length > 0 && !process.env[k.trim()]) {
          process.env[k.trim()] = v.join('=').trim();
        }
      }
    }
  } catch {}
}

const PORT = process.env.PORT || '80';
const PERMANENT_URL = process.env.NGROK_URL || 'https://daredevil-splashy-scrawny.ngrok-free.dev';

let serverProc = null;
let ngrokProc = null;
let isOnline = false;
let isShuttingDown = false;

// Verifica se o servidor local já está rodando
function isLocalServerRunning(port) {
  return new Promise((res) => {
    const req = http.get(`http://127.0.0.1:${port}/api/status`, (r) => {
      res(true);
    });
    req.on('error', () => res(false));
    req.setTimeout(1500, () => {
      req.destroy();
      res(false);
    });
  });
}

// Inicia o servidor local se não estiver rodando
async function ensureServerRunning() {
  const running = await isLocalServerRunning(PORT);
  if (running) {
    console.log(`✅ Servidor Web local já está ativo e respondendo na porta ${PORT}.`);
    return;
  }

  console.log(`🚀 Iniciando Servidor Web local (agent2-enricher/server.mjs) na porta ${PORT}...`);
  serverProc = spawn('node', ['agent2-enricher/server.mjs'], {
    stdio: 'inherit',
    shell: true,
  });

  serverProc.on('close', (code) => {
    if (!isShuttingDown) {
      console.error(`⚠️ Servidor Web finalizou inesperadamente (código ${code}). Reiniciando em 3s...`);
      setTimeout(ensureServerRunning, 3000);
    }
  });

  // Aguarda 2 segundos para o servidor subir
  await new Promise((r) => setTimeout(r, 2000));
}

function startNgrok() {
  if (isShuttingDown) return;

  console.log(`\n=============================================================`);
  console.log(`🔗 INICIANDO NGROK COM LINK PERMANENTE`);
  console.log(`🌐 URL Pública:   ${PERMANENT_URL}`);
  console.log(`🔌 Destino Local: 127.0.0.1:${PORT}`);
  console.log(`=============================================================\n`);

  // Usamos 127.0.0.1 explicitamente para evitar conflito de resolução IPv6 [::1] no Windows
  const args = ['http', `127.0.0.1:${PORT}`, '--url', PERMANENT_URL];

  ngrokProc = spawn('ngrok.exe', args, {
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: true,
  });

  isOnline = false;

  function handleOutput(data) {
    const text = data.toString();
    process.stdout.write(text);

    if (!isOnline && (text.includes('started tunnel') || text.includes('client session established') || text.includes('url=https://') || text.includes(PERMANENT_URL))) {
      isOnline = true;
      console.log(`\n=============================================================`);
      console.log(`✅ TÚNEL NGROK E SERVIDOR ESTÃO 100% ATIVOS!`);
      console.log(`👉 Link Permanente de Acesso:`);
      console.log(`   ${PERMANENT_URL}`);
      console.log(`   ${PERMANENT_URL}/relatorio.html`);
      console.log(`=============================================================\n`);
    }
  }

  ngrokProc.stdout.on('data', handleOutput);
  ngrokProc.stderr.on('data', handleOutput);

  ngrokProc.on('error', (err) => {
    console.error(`❌ Erro ao executar ngrok: ${err.message}`);
    console.log(`Dica: Verifique se o ngrok está instalado no PATH ou instale com: choco install ngrok / winget install ngrok`);
  });

  ngrokProc.on('close', (code) => {
    if (!isShuttingDown) {
      console.log(`\n⚠️ Túnel Ngrok desconectado (código ${code}). Reconectando em 5 segundos...`);
      setTimeout(startNgrok, 5000);
    }
  });
}

function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\nEncerrando serviços...`);
  if (ngrokProc) ngrokProc.kill('SIGINT');
  if (serverProc) serverProc.kill('SIGINT');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Execução principal
await ensureServerRunning();
startNgrok();

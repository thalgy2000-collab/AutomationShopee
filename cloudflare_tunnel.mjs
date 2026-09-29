/**
 * cloudflare_tunnel.mjs — Inicia o Cloudflare Tunnel e garante o servidor web ativo
 * Utiliza o executável nativo bin/cloudflared.exe (sem limites de banda mensais).
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
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
const CLOUDFLARED_BIN = resolve('./bin/cloudflared.exe');

if (!existsSync(CLOUDFLARED_BIN)) {
  console.error('❌ Executável cloudflared.exe não encontrado em bin/cloudflared.exe!');
  process.exit(1);
}

let serverProc = null;
let cfProc = null;
let isShuttingDown = false;

// Verifica se o servidor local já está rodando
function isLocalServerRunning(port) {
  return new Promise((res) => {
    const req = http.get(`http://127.0.0.1:${port}/`, () => {
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

  await new Promise((r) => setTimeout(r, 2000));
}

async function startTunnel() {
  await ensureServerRunning();

  console.log(`\n☁️  Iniciando Cloudflare Tunnel para http://127.0.0.1:${PORT}...`);

  cfProc = spawn(CLOUDFLARED_BIN, ['tunnel', '--url', `http://127.0.0.1:${PORT}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const recentLogs = [];
  let foundUrl = false;

  function processOutput(data) {
    const text = data.toString();
    recentLogs.push(text);
    if (recentLogs.length > 20) recentLogs.shift();

    const match = text.match(/https:\/\/([a-zA-Z0-9-]+)\.trycloudflare\.com/);
    if (match && match[1] !== 'api' && !foundUrl) {
      foundUrl = true;
      const url = match[0];
      console.log(`\n=============================================================`);
      console.log(`🚀 CLOUDFLARE TUNNEL ONLINE COM SUCESSO!`);
      console.log(`👉 Links de Acesso:`);
      console.log(`   Painel Principal: ${url}`);
      console.log(`   Relatório:        ${url}/relatorio.html`);
      console.log(`   Roadmap Kanban:   ${url}/roadmap.html`);
      console.log(`=============================================================`);
      console.log(`💡 Abrindo o painel no navegador...\n`);

      try {
        spawn('cmd.exe', ['/c', 'start', url], { detached: true, stdio: 'ignore' });
      } catch {}
    }
  }

  cfProc.stdout.on('data', processOutput);
  cfProc.stderr.on('data', processOutput);

  cfProc.on('close', (code) => {
    if (!isShuttingDown) {
      if (code !== 0 && !foundUrl) {
        console.error(`\n❌ Falha ao iniciar Cloudflare Tunnel (código ${code}). Últimos logs:`);
        console.error(recentLogs.join(''));
      }
      console.log(`\n⚠️ Cloudflare Tunnel reconectando em 5s...`);
      setTimeout(startTunnel, 5000);
    }
  });
}

function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\nEncerrando serviços...`);
  if (cfProc) cfProc.kill();
  if (serverProc) serverProc.kill('SIGINT');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await startTunnel();

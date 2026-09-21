/**
 * cloudflare_tunnel.mjs — Inicia o Cloudflare Tunnel para expor o painel (porta 3000)
 * Utiliza o executável nativo bin/cloudflared.exe sem depender de npm ou políticas do PowerShell.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";

const PORT = process.env.PORT || 3000;
const CLOUDFLARED_BIN = resolve("./bin/cloudflared.exe");

if (!existsSync(CLOUDFLARED_BIN)) {
  console.error("❌ Executável cloudflared.exe não encontrado em bin/cloudflared.exe!");
  process.exit(1);
}

console.log(`\n☁️  Iniciando Cloudflare Tunnel para http://localhost:${PORT}...`);

const cfProc = spawn(CLOUDFLARED_BIN, ["tunnel", "--url", `http://localhost:${PORT}`], {
  stdio: ["ignore", "pipe", "pipe"],
});

const recentLogs = [];
let foundUrl = false;

function processOutput(data) {
  const text = data.toString();
  recentLogs.push(text);
  if (recentLogs.length > 20) recentLogs.shift();
  
  // Cloudflare imprime a URL gerada no formato: https://[nome-aleatorio].trycloudflare.com
  const match = text.match(/https:\/\/([a-zA-Z0-9-]+)\.trycloudflare\.com/);
  if (match && match[1] !== "api" && !foundUrl) {
    foundUrl = true;
    const url = match[0];
    console.log(`\n=============================================================`);
    console.log(`🚀 CLOUDFLARE TUNNEL ONLINE COM SUCESSO!`);
    console.log(`👉 Link de Acesso Público:`);
    console.log(`   ${url}`);
    console.log(`=============================================================`);
    console.log(`💡 Abrindo o painel no seu navegador automaticamente...\n`);
    
    // Abre a URL automaticamente no navegador padrão do Windows
    try {
      spawn("cmd.exe", ["/c", "start", url], { detached: true, stdio: "ignore" });
    } catch {}
  }
}

cfProc.stdout.on("data", processOutput);
cfProc.stderr.on("data", processOutput);

cfProc.on("close", (code) => {
  if (code !== 0 && !foundUrl) {
    console.error(`\n❌ Falha ao iniciar Cloudflare Tunnel (código ${code}). Últimos logs:`);
    console.error(recentLogs.join(""));
  } else {
    console.log(`Cloudflare Tunnel encerrado (código ${code}).`);
  }
});

process.on("SIGINT", () => {
  cfProc.kill();
  process.exit();
});

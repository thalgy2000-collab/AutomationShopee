import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, exec, execSync } from 'node:child_process';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { extractParentSku } from './grouping.mjs';
import { runDiagnostics, applySolution, applyAllCategoryFixes } from '../agent4-diagnostician/diagnose.mjs';
import { getQuotaData, isModelBlocked, resetAllQuotas, formatResetTime } from './quota_manager.mjs';
import { loadHistory, recordExecution } from './history_manager.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 80;
const NGROK_URL = process.env.NGROK_URL || process.env.SYSTEM_URL || 'https://daredevil-splashy-scrawny.ngrok-free.dev';
const RELATORIO_PATH = path.join(__dirname, 'relatorio.html');
const PAINEL_PATH = path.join(__dirname, 'painel.html');
const CSV_PATH = path.resolve(__dirname, '../agent1-scraper/lote_d1fae5.csv');
const PRODUTOS_DIR = path.join(__dirname, 'produtos');
const SCRAPER_DIR = path.resolve(__dirname, '../agent1-scraper');
const RPA_DIR = path.resolve(__dirname, '../agent3-rpa-magis5');
const SANKHYA_DIR = path.resolve(__dirname, '../agent0-sankhya');
const UPLOADS_DIR = path.resolve(__dirname, '../uploads');

// Garante que o diretório de uploads existe
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─────────────────────────────────────────────────────────────────────────────
// Gerenciador de Processos dos Agentes e Logs em Tempo Real
// ─────────────────────────────────────────────────────────────────────────────

let currentProcess = null;
let currentAgent = null; // 'agent0', 'agent1', 'agent2', 'agent3'
let currentAgentOptions = {};
let agent2ActiveModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
let agentStatus = 'idle'; // 'idle', 'running', 'done', 'error'
const logBuffer = [];
const MAX_LOGS = 500;

// Estado do Lote / Planilha Ativa compartilhada continuamente entre todos os agentes
const ACTIVE_BATCH_STATE_FILE = path.resolve(__dirname, '.active_batch.json');

function saveActiveBatchState(p) {
  try {
    fs.writeFileSync(ACTIVE_BATCH_STATE_FILE, JSON.stringify({ path: p, updatedAt: new Date().toISOString() }, null, 2));
  } catch {}
}

function loadActiveBatchState() {
  try {
    if (fs.existsSync(ACTIVE_BATCH_STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(ACTIVE_BATCH_STATE_FILE, 'utf8'));
      if (data.path && fs.existsSync(data.path)) {
        return data.path;
      }
    }
  } catch {}
  return null;
}

let activeSpreadsheetPath = loadActiveBatchState();

function resolveActiveSpreadsheet(preferredQuery = null) {
  if (preferredQuery) {
    const q = String(preferredQuery).trim().toLowerCase();
    // 1. Caminho direto se existir
    if (path.isAbsolute(preferredQuery) && fs.existsSync(preferredQuery)) {
      activeSpreadsheetPath = preferredQuery;
      saveActiveBatchState(activeSpreadsheetPath);
      return activeSpreadsheetPath;
    }
    // 2. Busca em uploads/
    if (fs.existsSync(UPLOADS_DIR)) {
      const uFiles = fs.readdirSync(UPLOADS_DIR).filter(f => f.toLowerCase().includes(q));
      if (uFiles.length > 0) {
        activeSpreadsheetPath = path.join(UPLOADS_DIR, uFiles[0]);
        saveActiveBatchState(activeSpreadsheetPath);
        return activeSpreadsheetPath;
      }
    }
    // 3. Busca em Downloads do usuário
    const dlDir = path.join(process.env.USERPROFILE || 'C:\\Users\\marke', 'Downloads');
    if (fs.existsSync(dlDir)) {
      const dFiles = fs.readdirSync(dlDir).filter(f => f.toLowerCase().includes(q));
      if (dFiles.length > 0) {
        activeSpreadsheetPath = path.join(dlDir, dFiles[0]);
        saveActiveBatchState(activeSpreadsheetPath);
        return activeSpreadsheetPath;
      }
    }
  }

  // 1. Prioriza a planilha mais recente em uploads/ se for mais nova que a atual
  try {
    if (fs.existsSync(UPLOADS_DIR)) {
      const files = fs.readdirSync(UPLOADS_DIR)
        .filter(f => /\.(xlsx?|csv)$/i.test(f))
        .map(f => {
          const p = path.join(UPLOADS_DIR, f);
          return { name: f, path: p, mtime: fs.statSync(p).mtime.getTime() };
        })
        .sort((a, b) => b.mtime - a.mtime);

      if (files.length > 0) {
        const latestUpload = files[0];
        let currentMtime = 0;
        try {
          if (activeSpreadsheetPath && fs.existsSync(activeSpreadsheetPath)) {
            currentMtime = fs.statSync(activeSpreadsheetPath).mtime.getTime();
          }
        } catch {}

        if (!activeSpreadsheetPath || !fs.existsSync(activeSpreadsheetPath) || latestUpload.mtime > currentMtime) {
          activeSpreadsheetPath = latestUpload.path;
          saveActiveBatchState(activeSpreadsheetPath);
          return activeSpreadsheetPath;
        }
      }
    }
  } catch {}

  if (activeSpreadsheetPath && fs.existsSync(activeSpreadsheetPath)) {
    return activeSpreadsheetPath;
  }

  // 2. Fallback padrão para o lote CSV existente
  const defaultCsv = path.resolve(SCRAPER_DIR, 'lote_d1fae5.csv');
  if (fs.existsSync(defaultCsv)) {
    activeSpreadsheetPath = defaultCsv;
    saveActiveBatchState(activeSpreadsheetPath);
    return activeSpreadsheetPath;
  }
  return null;
}

// Telemetria estruturada em tempo real de cada agente
const agentTelemetry = {
  currentAgent: null,
  currentModel: agent2ActiveModel,
  status: 'idle', // 'idle', 'running', 'done', 'error'
  startTime: null,
  elapsedSeconds: 0,
  currentSku: null,
  currentStep: null,
  stepDetail: null,
  progress: { current: 0, total: 0 },
  history: {
    agent0: { lastRun: null, status: 'idle', lastAction: 'Pronto para consultar produtos no Sankhya Web e gerar planilhas', count: 0 },
    agent1: { lastRun: null, status: 'idle', lastAction: 'Pronto para download de fotos e extração de planilhas', count: 0 },
    agent2: { lastRun: null, status: 'idle', lastAction: '17 JSONs enriquecidos com títulos e ficha técnica IA', count: 17, lastModel: 'gemini-2.5-flash' },
    agent3: { lastRun: null, status: 'idle', lastAction: '11 produtos publicados na Shopee via Magis5', count: 11, lastSku: 'C02821I', lastScreenshot: null },
    agent4: { lastRun: null, status: 'idle', lastAction: 'Catálogo de regras ativo e diagnóstico pronto', count: 0 }
  }
};

function getRecentScreenshots(limit = 8) {
  const shotsDir = path.join(RPA_DIR, 'screenshots');
  if (!fs.existsSync(shotsDir)) return [];
  try {
    const files = fs.readdirSync(shotsDir).filter(f => f.endsWith('.png'));
    const list = files.map(f => {
      const p = path.join(shotsDir, f);
      const st = fs.statSync(p);
      const skuMatch = f.match(/(?:dryrun|published)-([A-Za-z0-9_-]+)-\d+\.png/);
      return {
        filename: f,
        url: `/screenshots/${f}`,
        sku: skuMatch ? skuMatch[1] : 'Produto',
        isDryRun: f.startsWith('dryrun-'),
        time: st.mtime,
        size: st.size
      };
    });
    list.sort((a, b) => b.time - a.time);
    return list.slice(0, limit);
  } catch (e) {
    return [];
  }
}

function addLog(message, stream = 'stdout') {
  const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
  const entry = { time, message: message.toString(), stream };
  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOGS) {
    logBuffer.shift();
  }
}

function stopCurrentAgent() {
  if (currentProcess) {
    const pid = currentProcess.pid;
    const targetAgent = currentAgent;
    addLog(`⚠️ Solicitada interrupção imediata da atividade do ${targetAgent} (PID: ${pid})...`, 'stderr');

    // No Windows, encerra toda a árvore de subprocessos (Node, Playwright, Chromium, etc)
    if (process.platform === 'win32' && pid) {
      try {
        spawn('taskkill', ['/pid', pid.toString(), '/T', '/F']);
      } catch (err) {
        console.error('Erro ao executar taskkill:', err);
      }
    }

    try {
      currentProcess.kill('SIGKILL');
    } catch (e) {
      // Processo já pode ter sido encerrado pelo taskkill
    }

    currentProcess = null;
    agentStatus = 'idle';
    agentTelemetry.status = 'idle';
    agentTelemetry.currentAgent = null;
    agentTelemetry.currentStep = 'Atividade interrompida';
    agentTelemetry.stepDetail = 'O robô foi encerrado no meio da tarefa pelo usuário.';
    currentAgent = null;
    addLog(`🛑 Atividade do ${targetAgent} encerrada com sucesso. Recursos liberados.`, 'stdout');
    return true;
  }
  return false;
}

function startAgent(agentId, options = {}) {
  if (currentProcess) {
    throw new Error(`Um agente já está em execução (${currentAgent}). Aguarde ou interrompa antes.`);
  }

  currentAgentOptions = { ...options };
  logBuffer.length = 0; // Limpa logs anteriores
  currentAgent = agentId;
  agentStatus = 'running';

  agentTelemetry.currentAgent = agentId;
  agentTelemetry.status = 'running';
  agentTelemetry.startTime = Date.now();
  agentTelemetry.elapsedSeconds = 0;
  agentTelemetry.currentSku = options.sku || null;
  agentTelemetry.currentStep = `Iniciando ${agentId.toUpperCase()}...`;
  agentTelemetry.stepDetail = 'Carregando dependências e ambiente de execução...';
  agentTelemetry.progress = { current: 0, total: options.limit ? parseInt(options.limit, 10) : 0 };
  if (!agentTelemetry.history[agentId]) agentTelemetry.history[agentId] = {};
  agentTelemetry.history[agentId].lastRun = new Date().toISOString();
  agentTelemetry.history[agentId].status = 'running';

  let cmd = 'node';
  let args = [];
  let cwd = __dirname;
  const effectiveInput = options.inputFile || resolveActiveSpreadsheet();

  if (agentId === 'agent1') {
    cwd = SCRAPER_DIR;
    const action = options.action || 'auto';
    const inputFile = effectiveInput;
    const isExcel = inputFile && /\.(xlsx?)$/i.test(inputFile);

    if (options.sku || options.skus) {
      const skusVal = Array.isArray(options.skus) 
        ? options.skus.join(',') 
        : String(options.sku || '').trim();
      const splitted = (Array.isArray(options.skus) ? options.skus : skusVal.split(/[,;\s]+/))
        .map(s => s.trim().toUpperCase())
        .filter(Boolean);
      agentTelemetry.lastAgent1Skus = splitted;
      args = ['scraper.mjs', '--sku', skusVal];
      if (options.collection) {
        args.push('--collection', options.collection.trim());
      }
    } else if (action === 'auto') {
      args = ['pipeline_agent1.mjs'];
      if (inputFile) args.push('--input', inputFile);
      if (options.color && options.color !== 'TODAS') {
        args.push('--color', options.color);
      }
      if (options.collection) {
        args.push('--collection', options.collection.trim());
      }
      if (options.limit && parseInt(options.limit, 10) > 0) {
        args.push('--limit', options.limit.toString());
      }
    } else if (action === 'extract') {
      args = ['create_lote.mjs'];
      if (inputFile) args.push('--input', inputFile);
      if (options.color && options.color !== 'TODAS') {
        args.push('--color', options.color);
      }
      if (options.collection) {
        args.push('--collection', options.collection.trim());
      }
      if (options.limit && parseInt(options.limit, 10) > 0) {
        args.push('--limit', options.limit.toString());
      }
    } else if (action === 'scraper') {
      args = ['scraper.mjs'];
      if (inputFile && !isExcel) args.push('--input', inputFile);
      if (options.collection) {
        args.push('--collection', options.collection.trim());
      }
      if (options.limit && parseInt(options.limit, 10) > 0) {
        args.push('--limit', options.limit.toString());
      }
    } else if (action === 'restore-all') {
      args = ['restore_all_physical_folders.mjs'];
    } else {
      // Padrão ou 'restore'
      args = ['restore_original_images.mjs'];
      if (inputFile && !isExcel) args.push('--input', inputFile);
      if (options.limit && parseInt(options.limit, 10) > 0) {
        args.push('--limit', options.limit.toString());
      }
    }
  } else if (agentId === 'agent2') {
    cwd = __dirname;
    args = ['enricher.mjs'];
    const inputFile = effectiveInput;
    if (inputFile) {
      let fullPath = path.isAbsolute(inputFile)
        ? inputFile
        : path.resolve(__dirname, '..', inputFile);
      if (/\.(xlsx?)$/i.test(fullPath)) {
        const lotePath = path.resolve(SCRAPER_DIR, 'lote_d1fae5.csv');
        try {
          const script = path.join(SCRAPER_DIR, 'create_lote.mjs');
          execSync(`node "${script}" --input "${fullPath}" --output "${lotePath}" --color TODAS`, { cwd: SCRAPER_DIR });
          addLog(`⚡ [LOTE SINCRONIZADO] Planilha ${path.basename(fullPath)} extraída para ${path.basename(lotePath)} (todos os produtos).`);
        } catch (e) {
          console.error('Erro ao extrair lote para Agente 2:', e.message);
        }
        if (fs.existsSync(lotePath)) {
          fullPath = lotePath;
        }
      }
      args.push('--input', fullPath);
      addLog(`📄 [AGENTE 2] Vinculado ao lote: ${path.basename(fullPath)}`);
    }
    let chosenModel = options.model || agent2ActiveModel || 'gemini-2.5-flash';
    const qCheck = isModelBlocked(chosenModel);
    if (qCheck.blocked) {
      const fallback = chosenModel === 'gemini-2.5-flash' ? 'groq' : 'gemini-2.5-flash';
      addLog(`⚠️ Modelo '${chosenModel}' atingiu o limite de cota diária até ${formatResetTime(qCheck.resetAt)}. Alternando automaticamente para '${fallback}'.`);
      chosenModel = fallback;
    }
    args.push('--model', chosenModel);
    agent2ActiveModel = chosenModel;
    agentTelemetry.history.agent2.lastModel = chosenModel;
    agentTelemetry.currentModel = chosenModel;
    if (options.limit && parseInt(options.limit, 10) > 0) {
      args.push('--limit', options.limit.toString());
    }
    if (options.batch && parseInt(options.batch, 10) > 0) {
      args.push('--batch', options.batch.toString());
    }
    if (options.sku) {
      args.push('--sku', options.sku.trim());
      if (options.force !== false) {
        args.push('--force');
      }
    }
  } else if (agentId === 'agent3') {
    cwd = RPA_DIR;
    if (options.action === 'fix-drafts' || options.fixDrafts) {
      args = ['fix_drafts_runner.mjs'];
      if (options.onlyFusion) {
        args.push('--only-fusion');
      }
      if (options.sku) {
        args.push('--sku', options.sku.trim());
      }
      if (options.limit && parseInt(options.limit, 10) > 0) {
        args.push('--limit', options.limit.toString());
      }
      if (options.headed) {
        args.push('--headed');
      }
      if (options.publish) {
        args.push('--publish');
      } else {
        args.push('--dry-run');
      }
      addLog(`🔧 [AGENTE 3] Iniciando Correção de Variações em Rascunhos Magis5${options.onlyFusion ? ' (Exclusivo FUSION)' : ''}...`);
    } else {
      args = ['src/runner.mjs'];
      const inputFile = effectiveInput;
      if (inputFile) {
        let fullPath = path.isAbsolute(inputFile)
          ? inputFile
          : path.resolve(__dirname, '..', inputFile);
        if (/\.(xlsx?)$/i.test(fullPath)) {
          const lotePath = path.resolve(SCRAPER_DIR, 'lote_d1fae5.csv');
          try {
            const script = path.join(SCRAPER_DIR, 'create_lote.mjs');
            execSync(`node "${script}" --input "${fullPath}" --output "${lotePath}"`, { cwd: SCRAPER_DIR });
            addLog(`⚡ [LOTE SINCRONIZADO] Planilha ${path.basename(fullPath)} extraída para ${path.basename(lotePath)}.`);
          } catch (e) {
            console.error('Erro ao extrair lote para Agente 3:', e.message);
          }
          if (fs.existsSync(lotePath)) {
            fullPath = lotePath;
          }
        }
        args.push('--input', fullPath);
        addLog(`📄 [AGENTE 3] Publicando produtos do lote: ${path.basename(fullPath)}`);
      }
      if (options.dryRun) {
        args.push('--dry-run');
      } else {
        args.push('--publish');
      }
      if (options.limit && parseInt(options.limit, 10) > 0) {
        args.push('--limit', options.limit.toString());
      }
      if (options.headed) {
        args.push('--headed');
      }
      if (options.sku) {
        args.push('--sku', options.sku.trim());
      }
    }
  } else if (agentId === 'agent0') {
    cwd = SANKHYA_DIR;
    args = ['src/runner.mjs'];
    if (options.action === 'login') {
      args.push('--only-login');
    }
    if (options.collection) {
      args.push('--collection', options.collection.trim());
    }
    if (options.filterFull) {
      args.push('--filter-full', options.filterFull.trim());
    }
    if (options.skus && Array.isArray(options.skus) && options.skus.length > 0) {
      args.push('--skus', options.skus.join(','));
    } else if (options.sku) {
      args.push('--sku', options.sku.trim());
    }
    if (options.headless) {
      args.push('--headless');
    }
  } else if (agentId === 'agent4') {
    cwd = path.resolve(__dirname, '../agent4-diagnostician');
    args = ['diagnose.mjs'];
  } else if (agentId === 'sync-report') {
    cwd = __dirname;
    args = ['report.mjs'];
  } else {
    throw new Error(`Agente desconhecido: ${agentId}`);
  }

  const safeArgs = args.map(arg => {
    const str = String(arg);
    return str.includes(' ') && !str.startsWith('"') ? `"${str}"` : str;
  });

  addLog(`🚀 Iniciando ${agentId.toUpperCase()}: ${cmd} ${safeArgs.join(' ')}`);
  addLog(`📂 Diretório de trabalho: ${cwd}`);

  const child = spawn(cmd, safeArgs, {
    cwd,
    shell: true,
    env: { ...process.env, FORCE_COLOR: '1' }
  });

  currentProcess = child;

  child.stdout.on('data', (data) => {
    const text = data.toString();
    addLog(text, 'stdout');
    process.stdout.write(`[${agentId}] ${text}`);

    // Telemetria em tempo real das etapas
    const lines = text.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      const progMatch = line.match(/\[(\d+)\/(\d+)\]/);
      if (progMatch) {
        agentTelemetry.progress = { current: parseInt(progMatch[1], 10), total: parseInt(progMatch[2], 10) };
      }

      const skuMatch = line.match(/Processando Produto:\s*\[([^\]]+)\]/i) || line.match(/Filtro SKU:\s*([A-Za-z0-9_-]+)/i);
      if (skuMatch) {
        agentTelemetry.currentSku = skuMatch[1];
        if (agentId === 'agent3') agentTelemetry.history.agent3.lastSku = skuMatch[1];
      }

      if (line.includes('Navegando para tela de criação')) {
        agentTelemetry.currentStep = 'Navegação Magis5';
        agentTelemetry.stepDetail = 'Abrindo formulário de criação Shopee';
      } else if (line.includes('Selecionando Marketplace Shopee')) {
        agentTelemetry.currentStep = 'Seleção de Canal';
        agentTelemetry.stepDetail = 'Definindo Marketplace Shopee';
      } else if (line.includes('Preenchendo campos do anúncio')) {
        agentTelemetry.currentStep = 'Dados Gerais & SEO';
        agentTelemetry.stepDetail = `Preenchendo Título, SKU ${agentTelemetry.currentSku || ''}, Marca e Dimensões`;
      } else if (line.includes('Configurando Categoria Shopee:')) {
        agentTelemetry.currentStep = 'Categoria Shopee';
        agentTelemetry.stepDetail = line.replace('📂', '').trim();
      } else if (line.includes('Gerando Ficha Técnica')) {
        agentTelemetry.currentStep = 'Ficha Técnica Oficial';
        agentTelemetry.stepDetail = 'Disparando criação de atributos Shopee';
      } else if (line.includes('Preenchendo campos da Ficha Técnica')) {
        agentTelemetry.currentStep = 'Ficha Técnica';
        agentTelemetry.stepDetail = line.replace('📋', '').trim();
      } else if (line.includes('Enviando') && line.includes('fotos')) {
        agentTelemetry.currentStep = 'Upload de Imagens HD';
        agentTelemetry.stepDetail = line.replace('📸', '').trim();
      } else if (line.includes('Configurando seção de Variações')) {
        agentTelemetry.currentStep = 'Variações & Grade';
        agentTelemetry.stepDetail = 'Configurando modelos, grades de tamanho e preços Sankhya';
      } else if (line.includes('Configurando fotos das variações')) {
        agentTelemetry.currentStep = 'Fotos das Variações';
        agentTelemetry.stepDetail = 'Vinculando 1 foto oficial por modelo/variação';
      } else if (line.includes('Salvando anúncio') || line.includes('Clicando em Salvar') || line.includes('DRY-RUN')) {
        agentTelemetry.currentStep = line.includes('DRY-RUN') ? 'Simulação Dry-Run Concluída' : 'Salvando Anúncio';
        agentTelemetry.stepDetail = line.trim();
      } else if (line.includes('Preparando correção de:')) {
        agentTelemetry.currentStep = 'Corrigindo Rascunho';
        agentTelemetry.stepDetail = line.trim();
      } else if (line.includes('Inserindo') && line.includes('variações novas')) {
        agentTelemetry.currentStep = 'Inserindo Tamanhos';
        agentTelemetry.stepDetail = line.trim();
      } else if (line.includes('Preenchendo códigos Sankhya')) {
        agentTelemetry.currentStep = 'Códigos Sankhya';
        agentTelemetry.stepDetail = line.trim();
      } else if (line.includes('Tabela de Medidas')) {
        agentTelemetry.currentStep = 'Tabela de Medidas';
        agentTelemetry.stepDetail = line.trim();
      } else if (line.includes('Salvando rascunho corrigido')) {
        agentTelemetry.currentStep = 'Salvando Rascunho';
        agentTelemetry.stepDetail = line.trim();
      } else if (line.includes('Screenshot comprobatório salvo em:') || line.includes('Screenshot:')) {
        const shotPath = (line.includes('salvo em:') ? line.split('salvo em:')[1] : line.split('Screenshot:')[1])?.trim();
        if (shotPath) {
          const fname = path.basename(shotPath);
          agentTelemetry.history.agent3.lastScreenshot = `/screenshots/${fname}`;
        }
      }

      // Agente 2
      if (line.includes('Enriquecendo com IA') || line.includes('Gerando')) {
        agentTelemetry.currentStep = 'Enriquecimento IA';
        agentTelemetry.stepDetail = line.trim();
      } else if (line.includes('JSON salvo') || line.includes('salvo com sucesso')) {
        agentTelemetry.currentStep = 'JSON Gravado';
        agentTelemetry.stepDetail = line.trim();
      }

      // Agente 1
      if (line.includes('Baixando') || line.includes('Download')) {
        agentTelemetry.currentStep = 'Coleta de Fotos CDN';
        agentTelemetry.stepDetail = line.trim();
      } else if (line.includes('Extraindo lote') || line.includes('Lendo planilha')) {
        agentTelemetry.currentStep = 'Leitura de Planilha';
        agentTelemetry.stepDetail = line.trim();
      }

      // Agente 0 - Sankhya Web
      if (line.includes('TELA DE LOGIN DO SANKHYA ABERTA')) {
        agentTelemetry.currentStep = 'Aguardando Login';
        agentTelemetry.stepDetail = 'Por favor, insira suas credenciais no navegador aberto...';
      } else if (line.includes('Login detectado com sucesso')) {
        agentTelemetry.currentStep = 'Autenticado';
        agentTelemetry.stepDetail = 'Sessão Sankhya ativa.';
      } else if (line.includes('Navegando para a tela de Produtos')) {
        agentTelemetry.currentStep = 'Navegação Sankhya';
        agentTelemetry.stepDetail = 'Abrindo módulo de Produtos';
      } else if (line.includes('Consultando SKU:')) {
        const sMatch = line.match(/Consultando SKU:\s*([A-Za-z0-9_-]+)/i);
        if (sMatch) agentTelemetry.currentSku = sMatch[1];
        agentTelemetry.currentStep = 'Extração Sankhya';
        agentTelemetry.stepDetail = `Buscando dados de ${agentTelemetry.currentSku || ''}`;
      } else if (line.includes('Planilha gerada com sucesso') || line.includes('planilha_sankhya_') || (line.includes('.xlsx') && line.includes('uploads'))) {
        agentTelemetry.currentStep = 'Concluído';
        agentTelemetry.stepDetail = 'Planilha .xlsx gerada e vinculada a todos os agentes';
        const match = line.match(/([A-Za-z]:\\[^\s\r\n]+\.xlsx|\/[^\s\r\n]+\.xlsx|\.\.?[/\\]uploads[/\\][^\s\r\n]+\.xlsx)/i);
        if (match) {
          const resolvedPath = path.isAbsolute(match[1]) ? match[1] : path.resolve(SANKHYA_DIR, match[1]);
          if (fs.existsSync(resolvedPath)) {
            activeSpreadsheetPath = resolvedPath;
            saveActiveBatchState(activeSpreadsheetPath);
            agentTelemetry.activeSpreadsheet = activeSpreadsheetPath;
            addLog(`📄 [LOTE VINCULADO] Nova planilha ${path.basename(activeSpreadsheetPath)} definida como lote ativo.`);
            try {
              const script = path.join(SCRAPER_DIR, 'create_lote.mjs');
              const lotePath = path.join(SCRAPER_DIR, 'lote_d1fae5.csv');
              execSync(`node "${script}" --input "${activeSpreadsheetPath}" --output "${lotePath}"`, { cwd: SCRAPER_DIR });
              addLog(`⚡ [LOTE EXTRAÍDO] Produtos extraídos para ${path.basename(lotePath)} (Pronto para Agente 1, 2 e 3).`);
            } catch (e) {
              console.error('Erro ao extrair lote do Agente 0:', e.message);
            }
          }
        }
      }
    }
  });

  child.stderr.on('data', (data) => {
    const text = data.toString();
    addLog(text, 'stderr');
    process.stderr.write(`[${agentId} ERROR] ${text}`);
  });

  child.on('close', (code) => {
    addLog(`🏁 ${agentId.toUpperCase()} finalizou com código de saída: ${code}`, code === 0 ? 'stdout' : 'stderr');
    agentStatus = code === 0 ? 'done' : 'error';
    agentTelemetry.status = code === 0 ? 'done' : 'error';
    if (agentTelemetry.startTime) {
      agentTelemetry.elapsedSeconds = Math.round((Date.now() - agentTelemetry.startTime) / 1000);
    }
    const summaryText = code === 0
      ? `Execução concluída com sucesso (${agentTelemetry.currentSku ? 'SKU ' + agentTelemetry.currentSku : 'Concluído'})`
      : `Execução finalizou com erro (código ${code})`;

    if (agentTelemetry.history[agentId]) {
      agentTelemetry.history[agentId].status = code === 0 ? 'done' : 'error';
      agentTelemetry.history[agentId].lastRun = new Date().toISOString();
      agentTelemetry.history[agentId].lastAction = summaryText;
    }
    agentTelemetry.currentStep = code === 0 ? 'Concluído com sucesso' : 'Finalizado com erro';

    // Salva no histórico persistente do agente
    try {
      let executionFiles = [];
      if (agentId === 'agent0' && activeSpreadsheetPath && fs.existsSync(activeSpreadsheetPath)) {
        try {
          const st = fs.statSync(activeSpreadsheetPath);
          const bname = path.basename(activeSpreadsheetPath);
          executionFiles.push({
            name: bname,
            path: activeSpreadsheetPath,
            size: st.size,
            downloadUrl: `/uploads/${encodeURIComponent(bname)}`
          });
        } catch {}
      }

      recordExecution({
        agentId,
        status: code === 0 ? 'success' : 'error',
        summary: summaryText,
        durationSeconds: agentTelemetry.elapsedSeconds || 0,
        skus: agentTelemetry.currentSku ? [agentTelemetry.currentSku] : [],
        files: executionFiles,
        details: [
          agentTelemetry.stepDetail || summaryText,
          agentTelemetry.progress && agentTelemetry.progress.total > 0
            ? `Progresso: ${agentTelemetry.progress.current}/${agentTelemetry.progress.total}`
            : null
        ].filter(Boolean),
        metadata: {
          exitCode: code,
          model: agentTelemetry.currentModel
        }
      });
    } catch (e) {
      console.error('Erro ao registrar histórico de execução:', e.message);
    }

    currentProcess = null;
    currentAgent = null;
  });

  child.on('error', (err) => {
    addLog(`❌ Falha ao iniciar processo: ${err.message}`, 'stderr');
    agentStatus = 'error';
    agentTelemetry.status = 'error';
    agentTelemetry.currentStep = 'Erro de inicialização';
    agentTelemetry.stepDetail = err.message;
    currentProcess = null;
    currentAgent = null;
  });

  return { success: true, agentId, cmd: `${cmd} ${args.join(' ')}` };
}

function getPipelineStats() {
  let totalCsv = 0;
  let statusCounts = {};
  let corCounts = {};

  if (fs.existsSync(CSV_PATH)) {
    try {
      const content = fs.readFileSync(CSV_PATH, 'utf-8');
      const records = parse(content, { columns: true, skip_empty_lines: true, trim: true, bom: true });
      totalCsv = records.length;
      for (const r of records) {
        statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
        corCounts[r.cor] = (corCounts[r.cor] || 0) + 1;
      }
    } catch {}
  }

  let totalJsons = 0;
  let publishedJsons = 0;
  let pendingJsons = 0;

  if (fs.existsSync(PRODUTOS_DIR)) {
    try {
      const files = fs.readdirSync(PRODUTOS_DIR).filter(f => f.endsWith('.json'));
      totalJsons = files.length;
      for (const f of files) {
        const d = JSON.parse(fs.readFileSync(path.join(PRODUTOS_DIR, f), 'utf-8'));
        if (d.is_published || d.status === 'concluido' || d.status === 'publicado') {
          publishedJsons++;
        } else {
          pendingJsons++;
        }
      }
    } catch {}
  }

  return {
    totalCsv,
    statusCounts,
    corCounts,
    totalJsons,
    publishedJsons,
    pendingJsons,
    timestamp: new Date().toISOString()
  };
}

function getAvailableFiles() {
  const result = [];
  const seenPaths = new Set();

  const addFile = (item) => {
    if (!seenPaths.has(item.path)) {
      seenPaths.add(item.path);
      const ext = path.extname(item.path).toLowerCase();
      const inUploads = item.path.startsWith(UPLOADS_DIR) || item.source === 'Uploads';
      result.push({
        ...item,
        ext,
        isExcel: ext === '.xls' || ext === '.xlsx',
        isCsv: ext === '.csv',
        downloadUrl: inUploads ? `/uploads/${encodeURIComponent(item.name)}` : null
      });
    }
  };

  // 1. Arquivos da pasta uploads
  if (fs.existsSync(UPLOADS_DIR)) {
    const files = fs.readdirSync(UPLOADS_DIR);
    for (const f of files) {
      if (/\.(xlsx?|csv)$/i.test(f)) {
        const fPath = path.join(UPLOADS_DIR, f);
        const st = fs.statSync(fPath);
        addFile({
          name: f,
          path: fPath,
          size: st.size,
          mtime: st.mtime,
          source: 'Uploads'
        });
      }
    }
  }

  // 2. Arquivos padrão conhecidos
  const knownFiles = [
    { name: 'lote_d1fae5.csv', path: CSV_PATH, source: 'São Bento — Lote Ativo' },
    { name: 'Estoque Douglas IMP.xls', path: 'C:\\Users\\marke\\Downloads\\Estoque Douglas IMP.xls', source: 'Downloads' },
    { name: 'Estoque Douglas IMP - Conferido.xlsx', path: 'C:\\Users\\marke\\Downloads\\Estoque Douglas IMP - Conferido.xlsx', source: 'Downloads' }
  ];

  for (const k of knownFiles) {
    if (fs.existsSync(k.path)) {
      const st = fs.statSync(k.path);
      addFile({
        name: k.name,
        path: k.path,
        size: st.size,
        mtime: st.mtime,
        source: k.source
      });
    }
  }

  // 3. Outros CSVs no diretório do scraper
  if (fs.existsSync(SCRAPER_DIR)) {
    const files = fs.readdirSync(SCRAPER_DIR);
    for (const f of files) {
      if (f.endsWith('.csv')) {
        const fPath = path.join(SCRAPER_DIR, f);
        const st = fs.statSync(fPath);
        addFile({
          name: f,
          path: fPath,
          size: st.size,
          mtime: st.mtime,
          source: 'Scraper'
        });
      }
    }
  }

  // Ordena os arquivos mais recentes primeiro
  result.sort((a, b) => new Date(b.mtime) - new Date(a.mtime));

  return result;
}

function getBatchPreview(csvFilePath, limit = 10) {
  const activeCsv = csvFilePath && fs.existsSync(csvFilePath) ? csvFilePath : CSV_PATH;
  const csvMap = {};
  const csvOrder = [];

  if (fs.existsSync(activeCsv)) {
    try {
      const content = fs.readFileSync(activeCsv, 'utf-8');
      const records = parse(content, { columns: true, skip_empty_lines: true, trim: true, bom: true });
      for (const r of records) {
        if (!csvMap[r.sku]) {
          csvMap[r.sku] = r;
          csvOrder.push(r.sku);
        }
      }
    } catch (e) {
      console.error('Erro ao ler CSV para preview:', e.message);
    }
  }

  const products = [];
  if (fs.existsSync(PRODUTOS_DIR)) {
    try {
      const files = fs.readdirSync(PRODUTOS_DIR).filter(f => f.endsWith('.json'));
      for (const f of files) {
        try {
          const raw = fs.readFileSync(path.join(PRODUTOS_DIR, f), 'utf-8');
          const p = JSON.parse(raw);
          products.push(p);
        } catch {}
      }
    } catch {}
  }

  // Ordena produtos pela ordem em que aparecem no CSV
  products.sort((a, b) => {
    const idxA = csvOrder.indexOf(a.sku);
    const idxB = csvOrder.indexOf(b.sku);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.sku.localeCompare(b.sku);
  });

  const pendingList = [];
  const publishedList = [];

  const COLOR_PUBLISHED = '#83E28E';
  const COLOR_CONCLUIDO = '#47D359';

  for (const p of products) {
    const csvRow = csvMap[p.sku] || {};
    const isPublished =
      p.is_published === true ||
      p.status === 'concluido' ||
      p.status === 'publicado' ||
      csvRow.status === 'publicado' ||
      csvRow.status === 'concluido' ||
      csvRow.cor === COLOR_PUBLISHED ||
      csvRow.cor === COLOR_CONCLUIDO;

    const varCount = p.variacoes ? p.variacoes.length : 0;
    const priceVal = p.preco?.preco_sem_promocao || p.preco?.preco_venda || (typeof p.preco === 'number' ? p.preco : null);
    const promoVal = p.preco?.em_promocao ? p.preco?.preco_com_promocao : null;
    const priceStr = priceVal ? `R$ ${Number(priceVal).toFixed(2).replace('.', ',')}` : 'Sob consulta';
    const promoStr = promoVal ? `R$ ${Number(promoVal).toFixed(2).replace('.', ',')}` : null;

    const item = {
      sku: p.sku,
      titulo: p.titulo_shopee || p.titulo_bruto || p.sku,
      marca: p.marca || 'N/A',
      modelo: p.modelo || 'N/A',
      cod_sankhya: p.cod_sankhya || csvRow.cod_sankhya || 'N/A',
      variacoesCount: varCount,
      variacoesNomes: p.variacoes ? p.variacoes.map(v => v.nome || v.sku).slice(0, 5) : [],
      preco: priceStr,
      precoPromocional: promoStr,
      isPublished,
      status: isPublished ? (csvRow.status || p.status || 'publicado') : 'pendente',
      cor: csvRow.cor || '#D1FAE5'
    };

    if (isPublished) {
      publishedList.push(item);
    } else {
      pendingList.push(item);
    }
  }

  const numLimit = parseInt(limit, 10) || 10;
  const queueWithFlags = pendingList.map((item, idx) => ({
    ...item,
    queueIndex: idx + 1,
    willPublishInBatch: idx < numLimit
  }));

  return {
    csvFile: path.basename(activeCsv),
    csvPath: activeCsv,
    totalCatalog: products.length,
    totalPending: pendingList.length,
    totalPublished: publishedList.length,
    limit: numLimit,
    queue: queueWithFlags,
    published: publishedList
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Servidor HTTP
// ─────────────────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split('?')[0];
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  const sendJson = (status, data) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify(data));
  };

  // 0. API: Telemetria Visual em Tempo Real de Todos os Agentes
  if (req.method === 'GET' && urlPath === '/api/telemetry') {
    const elapsed = agentTelemetry.startTime && agentTelemetry.status === 'running'
      ? Math.round((Date.now() - agentTelemetry.startTime) / 1000)
      : agentTelemetry.elapsedSeconds || 0;

    return sendJson(200, {
      telemetry: {
        ...agentTelemetry,
        elapsedSeconds: elapsed
      },
      stats: getPipelineStats(),
      screenshots: getRecentScreenshots(8)
    });
  }

  // 1. API: Obter Status e Métricas
  if (req.method === 'GET' && urlPath === '/api/stats') {
    return sendJson(200, {
      stats: getPipelineStats(),
      agentRunning: Boolean(currentProcess),
      currentAgent,
      agentStatus,
      telemetry: agentTelemetry
    });
  }

  // 2. API: Obter Logs
  if (req.method === 'GET' && urlPath === '/api/agents/logs') {
    return sendJson(200, {
      logs: logBuffer,
      running: Boolean(currentProcess),
      currentAgent,
      agentStatus,
      telemetry: agentTelemetry
    });
  }

  // 3. API: Listar Arquivos / Planilhas Disponíveis
  if (req.method === 'GET' && urlPath === '/api/files') {
    return sendJson(200, {
      files: getAvailableFiles()
    });
  }

  // 3.5 API: Preview de SKUs do Lote (Agente 3)
  if (req.method === 'GET' && urlPath === '/api/batch/preview') {
    const urlObj = new URL(req.url, 'http://localhost:3000');
    const fileParam = urlObj.searchParams.get('file');
    const limitParam = urlObj.searchParams.get('limit') || '10';
    return sendJson(200, getBatchPreview(fileParam, limitParam));
  }

  // 4. API: Upload de Nova Planilha / Fonte de Dados
  if (req.method === 'POST' && urlPath === '/api/upload') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { filename, base64, agent } = JSON.parse(body || '{}');
        if (!filename || !base64) {
          return sendJson(400, { error: 'Campos "filename" e "base64" são obrigatórios' });
        }

        const ext = path.extname(filename).toLowerCase();
        if (!['.xls', '.xlsx', '.csv'].includes(ext)) {
          return sendJson(400, { error: 'Formato inválido. Apenas planilhas .xls, .xlsx ou .csv são permitidas.' });
        }

        // Sanitiza o nome do arquivo
        const baseName = path.basename(filename, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
        const safeName = `${baseName}_${Date.now()}${ext}`;
        const targetPath = path.join(UPLOADS_DIR, safeName);

        const buffer = Buffer.from(base64, 'base64');
        fs.writeFileSync(targetPath, buffer);

        console.log(`[Upload] Arquivo salvo: ${targetPath} (${buffer.length} bytes) para ${agent || 'geral'}`);

        let extractedCount = 0;
        if (ext === '.xlsx' || ext === '.xls') {
          try {
            const script = path.join(SCRAPER_DIR, 'create_lote.mjs');
            const outCsv = path.join(SCRAPER_DIR, 'lote_d1fae5.csv');
            execSync(`node "${script}" --input "${targetPath}" --output "${outCsv}"`, { cwd: SCRAPER_DIR });
            if (fs.existsSync(outCsv)) {
              const lines = fs.readFileSync(outCsv, 'utf-8').trim().split('\n');
              extractedCount = Math.max(0, lines.length - 1);
            }
            addLog(`📥 [PLANILHA ATIVADA] Arquivo ${filename} carregado e extraído com ${extractedCount} produtos no lote.`);
          } catch (e) {
            console.warn('Erro ao extrair planilha:', e.message);
          }
        }

        activeSpreadsheetPath = targetPath;
        saveActiveBatchState(activeSpreadsheetPath);
        agentTelemetry.activeSpreadsheet = activeSpreadsheetPath;

        return sendJson(200, {
          success: true,
          filename: safeName,
          originalName: filename,
          filePath: targetPath,
          size: buffer.length,
          extractedCount
        });
      } catch (err) {
        console.error('[Upload] Erro:', err);
        return sendJson(500, { error: err.message });
      }
    });
    return;
  }

  // 4.5 API: Lote / Planilha Ativa Compartilhada
  if (req.method === 'GET' && urlPath === '/api/active-batch') {
    const active = resolveActiveSpreadsheet();
    return sendJson(200, {
      activeSpreadsheet: active,
      filename: active ? path.basename(active) : null,
      downloadUrl: active && active.startsWith(UPLOADS_DIR) ? `/uploads/${encodeURIComponent(path.basename(active))}` : null
    });
  }

  if (req.method === 'POST' && urlPath === '/api/active-batch') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const candidate = payload.path || payload.filePath || payload.filename || payload.query;
        const resolved = resolveActiveSpreadsheet(candidate);
        if (resolved && fs.existsSync(resolved)) {
          activeSpreadsheetPath = resolved;
          saveActiveBatchState(activeSpreadsheetPath);
          agentTelemetry.activeSpreadsheet = activeSpreadsheetPath;

          // Se for uma planilha Excel (.xlsx), extrai imediatamente para lote_d1fae5.csv
          if (/\.(xlsx?)$/i.test(activeSpreadsheetPath)) {
            try {
              const lotePath = path.resolve(SCRAPER_DIR, 'lote_d1fae5.csv');
              const script = path.join(SCRAPER_DIR, 'create_lote.mjs');
              execSync(`node "${script}" --input "${activeSpreadsheetPath}" --output "${lotePath}"`, { cwd: SCRAPER_DIR });
              addLog(`⚡ [LOTE SINCRONIZADO] Planilha ${path.basename(activeSpreadsheetPath)} extraída para ${path.basename(lotePath)}.`);
            } catch (e) {
              console.error('Erro ao extrair lote:', e.message);
            }
          }

          addLog(`📄 [LOTE DEFINIDO] Planilha ${path.basename(activeSpreadsheetPath)} definida como lote ativo.`);
          return sendJson(200, { success: true, activeSpreadsheet: activeSpreadsheetPath, filename: path.basename(activeSpreadsheetPath) });
        }
        return sendJson(400, { error: 'Caminho de arquivo inválido ou não encontrado' });
      } catch (e) {
        return sendJson(500, { error: e.message });
      }
    });
    return;
  }

  // 5. API: Iniciar Agente
  if (req.method === 'POST' && urlPath === '/api/agents/start') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const { agent, options } = payload;
        if (!agent) {
          return sendJson(400, { error: 'Campo "agent" é obrigatório (agent0, agent1, agent2, agent3, agent4)' });
        }
        const result = startAgent(agent, options || {});
        return sendJson(200, result);
      } catch (err) {
        return sendJson(500, { error: err.message });
      }
    });
    return;
  }

  // 5b. API: Gerar Kit / Combo de Múltiplos Produtos (Agente 2)
  if (req.method === 'POST' && urlPath === '/api/agents/create-kit') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const { skus, orientacao, model, discountPercent } = payload;
        if (!skus || !Array.isArray(skus) || skus.length < 2) {
          return sendJson(400, { error: 'Informe pelo menos 2 códigos SKUs para gerar o kit.' });
        }
        const { generateKit } = await import('./kit_generator.mjs');
        const kit = await generateKit({
          skus,
          orientacao: orientacao || '',
          model: model || agent2ActiveModel,
          discountPercent: Number(discountPercent) || 0
        });

        // Registra histórico
        try {
          recordExecution({
            agentId: 'agent2',
            agentName: 'Agente 2 — IA Vision & SEO',
            actionName: 'Criação de Kit / Combo',
            summary: `Kit gerado com sucesso: "${kit.titulo_shopee}" (${skus.join(' + ')})`,
            itemsProcessed: skus.length,
            status: 'success',
            details: { kitSku: kit.sku, skus, preco: kit.preco }
          });
        } catch {}

        return sendJson(200, { success: true, kit });
      } catch (err) {
        console.error('Erro ao gerar kit:', err);
        return sendJson(500, { error: err.message });
      }
    });
    return;
  }

  // 5c. API: Gerar Anúncio Multi-Modelo (Estrutura 1 com SKU Pai e Grade de Tamanhos)
  if (req.method === 'POST' && urlPath === '/api/agents/create-multi-model') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const { parentSku, modelos, tamanhos, preco, titulo, genero, autoPublish } = payload;
        
        if (!parentSku || !parentSku.trim()) {
          return sendJson(400, { error: 'O SKU Pai mestre é obrigatório para preencher o campo Dados Gerais do Magis5.' });
        }
        if (!modelos || !Array.isArray(modelos) || modelos.length === 0) {
          return sendJson(400, { error: 'Informe pelo menos 1 modelo (ex: ADV256BL, ADV257BL, ADV341BL).' });
        }

        agentTelemetry.currentAgent = 'agent2';
        agentTelemetry.status = 'running';
        agentTelemetry.currentSku = parentSku;
        agentTelemetry.currentStep = 'Criando Estrutura 1';
        agentTelemetry.stepDetail = `Processando modelos: ${modelos.join(', ')}`;
        agentTelemetry.startTime = Date.now();
        addLog(`🧩 [AGENTE 2] Iniciando geração da Estrutura 1 para SKU Pai: ${parentSku}`);
        addLog(`   • Modelos selecionados (${modelos.length}): ${modelos.join(', ')}`);
        addLog(`   • Grade de tamanhos: ${(tamanhos || ['PP','P','M','G','GG','G1','G2']).join(', ')}`);

        const { generateMultiModelProduct } = await import('./multi_model_generator.mjs');
        const product = await generateMultiModelProduct({
          parentSku,
          modelos,
          tamanhos,
          preco: preco ? Number(preco) : null,
          titulo: titulo || '',
          genero: genero || null
        });

        addLog(`✅ [AGENTE 2] Estrutura 1 criada com sucesso: SKU Pai "${product.sku}" com ${product.total_variacoes} variações`);
        addLog(`   • Título Shopee: ${product.titulo_shopee}`);
        addLog(`   • Arquivo salvo em: produtos/${product.sku}.json`);
        agentTelemetry.status = 'done';
        agentTelemetry.currentStep = 'Estrutura 1 Pronta';
        agentTelemetry.stepDetail = `${product.total_variacoes} variações salvas`;

        // Registra histórico
        try {
          recordExecution({
            agentId: 'agent2',
            agentName: 'Agente 2 — IA Vision & SEO',
            actionName: 'Criação Multi-Modelo (Estrutura 1)',
            summary: `Estrutura 1 gerada com sucesso: SKU Pai "${product.sku}" com ${product.total_variacoes} variações (${modelos.join(', ')})`,
            itemsProcessed: product.total_variacoes,
            status: 'success',
            details: { parentSku: product.sku, modelos, variacoes: product.total_variacoes }
          });
        } catch {}

        return sendJson(200, { success: true, product });
      } catch (err) {
        addLog(`❌ [AGENTE 2 ERROR] Erro na Estrutura 1: ${err.message}`, 'stderr');
        agentTelemetry.status = 'error';
        console.error('Erro ao gerar multi-modelo:', err);
        return sendJson(500, { error: err.message });
      }
    });
    return;
  }

  // 5d. API: Edição em Massa — Pré-visualização (Bulk Preview)
  if (req.method === 'POST' && urlPath === '/api/bulk/preview') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const { previewBulkEdit } = await import('./bulk_editor.mjs');
        const result = previewBulkEdit(payload);
        return sendJson(200, { success: true, ...result });
      } catch (err) {
        console.error('Erro no preview de edição em massa:', err);
        return sendJson(500, { error: err.message });
      }
    });
    return;
  }

  // 5e. API: Edição em Massa — Aplicar (Bulk Apply)
  if (req.method === 'POST' && urlPath === '/api/bulk/apply') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const { applyBulkEdit } = await import('./bulk_editor.mjs');
        const result = applyBulkEdit(payload);
        addLog(`⚡ [EDIÇÃO EM MASSA] ${result.updatedCount} produtos atualizados com sucesso (${payload.targetField || 'campo'}).`);
        return sendJson(200, { success: true, ...result });
      } catch (err) {
        console.error('Erro ao aplicar edição em massa:', err);
        return sendJson(500, { error: err.message });
      }
    });
    return;
  }

  // 5f. API: Preset de Medidas FUSION
  if (req.method === 'POST' && urlPath === '/api/bulk/preset/fusion-measurements') {
    try {
      const { applyFusionMeasurementsPreset } = await import('./bulk_editor.mjs');
      const result = applyFusionMeasurementsPreset();
      addLog(`📏 [PRESET FUSION] ${result.updatedCount} camisas FUSION atualizadas com a tabela de medidas oficial da foto!`);
      return sendJson(200, { success: true, ...result });
    } catch (err) {
      return sendJson(500, { error: err.message });
    }
  }


  // 6. API: Parar Agente
  if (req.method === 'POST' && urlPath === '/api/agents/stop') {
    const stopped = stopCurrentAgent();
    return sendJson(200, { success: true, stopped });
  }

  // 6b. API: Histórico de Ações por Agente
  if (req.method === 'GET' && urlPath === '/api/agents/history') {
    try {
      const history = loadHistory();
      const queryAgent = parsedUrl.searchParams.get('agent');
      if (queryAgent) {
        const filtered = history.filter(h => h.agentId === queryAgent);
        return sendJson(200, { success: true, count: filtered.length, history: filtered });
      }
      return sendJson(200, { success: true, count: history.length, history });
    } catch (e) {
      return sendJson(500, { error: e.message });
    }
  }

  // 6c. API: Abrir Pasta Localmente no Windows Explorer
  if ((req.method === 'POST' || req.method === 'GET') && urlPath === '/api/open-folder') {
    const handleOpen = (folderParam) => {
      try {
        let targetFolder = path.join(SCRAPER_DIR, 'downloads');
        if (folderParam === 'uploads') {
          targetFolder = UPLOADS_DIR;
        } else if (folderParam === 'produtos') {
          targetFolder = PRODUTOS_DIR;
        } else if (folderParam && typeof folderParam === 'string' && !folderParam.includes('..')) {
          const sub = path.join(SCRAPER_DIR, 'downloads', folderParam);
          if (fs.existsSync(sub)) {
            targetFolder = sub;
          }
        }

        if (!fs.existsSync(targetFolder)) {
          fs.mkdirSync(targetFolder, { recursive: true });
        }

        const absPath = path.resolve(targetFolder);

        if (process.platform === 'win32') {
          // No Windows, cmd /c start e Start-Process abrem a pasta no Explorer garantidamente
          exec(`cmd.exe /c start "" "${absPath}"`, (err) => {
            if (err) {
              spawn('powershell.exe', ['-NoProfile', '-Command', `Start-Process '${absPath}'`], { detached: true, stdio: 'ignore' });
            }
          });
        } else if (process.platform === 'darwin') {
          spawn('open', [absPath], { detached: true, stdio: 'ignore' });
        } else {
          spawn('xdg-open', [absPath], { detached: true, stdio: 'ignore' });
        }

        return sendJson(200, {
          success: true,
          path: absPath,
          opened: true,
          message: `Pasta aberta no Windows Explorer: ${absPath}`
        });
      } catch (err) {
        return sendJson(500, { error: err.message });
      }
    };

    if (req.method === 'GET') {
      const qFolder = parsedUrl.searchParams.get('folder');
      return handleOpen(qFolder);
    } else {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          handleOpen(payload.folder);
        } catch {
          handleOpen(null);
        }
      });
      return;
    }
  }

  // 6d. API: Informações da Pasta de Fotos
  if (req.method === 'GET' && urlPath === '/api/downloads/info') {
    try {
      const downloadsDir = path.join(SCRAPER_DIR, 'downloads');
      const absPath = path.resolve(downloadsDir);
      let folderCount = 0;
      let fileCount = 0;
      const subfolders = [];

      if (fs.existsSync(downloadsDir)) {
        const items = fs.readdirSync(downloadsDir, { withFileTypes: true });
        for (const item of items) {
          if (item.isDirectory()) {
            folderCount++;
            const subPath = path.join(downloadsDir, item.name);
            const subFiles = fs.readdirSync(subPath).filter(f => /\.(png|jpe?g|webp|gif)$/i.test(f));
            fileCount += subFiles.length;
            subfolders.push({ name: item.name, imageCount: subFiles.length });
          } else if (/\.(png|jpe?g|webp|gif)$/i.test(item.name)) {
            fileCount++;
          }
        }
      }

      return sendJson(200, {
        success: true,
        path: absPath,
        exists: fs.existsSync(downloadsDir),
        totalFolders: folderCount,
        totalImages: fileCount,
        folders: subfolders
      });
    } catch (err) {
      return sendJson(500, { error: err.message });
    }
  }

  // 6e. API: Últimos códigos com fotos baixadas pelo Agente 1 (para Estrutura 1 e Kits)
  if (req.method === 'GET' && (urlPath === '/api/agent1/recent-skus' || urlPath === '/api/agents/agent1-recent-skus')) {
    try {
      const downloadsDir = path.join(SCRAPER_DIR, 'downloads');
      const nonSkus = new Set(['Planilha', 'Revenda', 'SaoBento', 'São Bento', 'produtos']);
      let items = [];
      if (fs.existsSync(downloadsDir)) {
        items = fs.readdirSync(downloadsDir)
          .filter(f => !nonSkus.has(f))
          .filter(f => {
            try {
              return fs.statSync(path.join(downloadsDir, f)).isDirectory();
            } catch { return false; }
          })
          .map(f => {
            const p = path.join(downloadsDir, f);
            const st = fs.statSync(p);
            let photos = 0;
            try {
              photos = fs.readdirSync(p).filter(x => /\.(jpg|jpeg|png|webp)$/i.test(x)).length;
            } catch {}
            return { sku: f, mtime: st.mtime, photos };
          })
          .filter(item => item.photos > 0)
          .sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime());
      }

      // Se o usuário executou recentemente o Agente 1 com SKUs específicos, dá preferência
      const memorySkus = (agentTelemetry.lastAgent1Skus || []).filter(Boolean);
      let topSkus = [];
      if (memorySkus.length > 0) {
        topSkus = memorySkus;
      } else if (items.length > 0) {
        topSkus = items.slice(0, 3).map(i => i.sku);
      }

      return sendJson(200, {
        success: true,
        skus: topSkus,
        allRecent: items.slice(0, 15)
      });
    } catch (err) {
      return sendJson(500, { error: err.message });
    }
  }

  // 7. API: Atualização manual de status de produto (existente)
  if (req.method === 'POST' && urlPath === '/api/status') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { sku, status } = JSON.parse(body || '{}');
        if (!sku || !status) {
          return sendJson(400, { error: 'sku e status são obrigatórios' });
        }

        const isPublished = status === 'publicado' || status === 'concluido';
        const newStatus = isPublished ? 'concluido' : 'enriched';
        const newCor = isPublished ? '#83E28E' : '#D1FAE5';

        let updatedCount = 0;
        if (fs.existsSync(CSV_PATH)) {
          const content = fs.readFileSync(CSV_PATH, 'utf-8');
          const records = parse(content, { columns: true, skip_empty_lines: true, trim: true, bom: true });
          for (const r of records) {
            const pSku = extractParentSku(r.sku);
            if (r.sku === sku || pSku === sku) {
              r.status = newStatus;
              r.cor = newCor;
              updatedCount++;
            }
          }
          const updatedCsv = stringify(records, { header: true });
          fs.writeFileSync(CSV_PATH, updatedCsv, 'utf-8');
        }

        const jsonPath = path.join(PRODUTOS_DIR, `${sku}.json`);
        if (fs.existsSync(jsonPath)) {
          try {
            const prodData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
            prodData.is_published = isPublished;
            prodData.status = newStatus;
            fs.writeFileSync(jsonPath, JSON.stringify(prodData, null, 2), 'utf-8');
          } catch (e) {
            console.error(`Erro ao atualizar JSON ${sku}.json:`, e);
          }
        }

        return sendJson(200, {
          success: true,
          sku,
          status: newStatus,
          cor: newCor,
          updatedRows: updatedCount
        });
      } catch (err) {
        return sendJson(500, { error: err.message });
      }
    });
    return;
  }

  // 8. API: Quotas e Limites de IA
  if (req.method === 'GET' && urlPath === '/api/quotas') {
    return sendJson(200, { quotas: getQuotaData() });
  }

  // 9. API: Resetar Limites de Quota de IA
  if (req.method === 'POST' && urlPath === '/api/quotas/reset') {
    resetAllQuotas();
    addLog('🔄 Todas as quotas e limites diários de IA foram resetados manualmente.');
    return sendJson(200, { success: true, message: 'Quotas resetadas com sucesso' });
  }

  // 9.1 API: Obter Modelo Ativo do Agente 2 e Opções Disponíveis
  if (req.method === 'GET' && urlPath === '/api/agents/model') {
    return sendJson(200, {
      activeModel: agent2ActiveModel,
      availableModels: [
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', desc: 'Mais Rápido & Estável (Recomendado)', tag: 'Google AI' },
        { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', desc: 'Alta Inteligência & Estabilidade', tag: 'Google AI' },
        { id: 'gemini-flash-latest', name: 'Gemini Flash Latest', desc: 'Google Flash Recente', tag: 'Google AI' },
        { id: 'groq', name: 'Groq / Qwen 3.8', desc: 'Ultra Rápido (Sem Cota do Gemini)', tag: 'Groq Cloud' }
      ]
    });
  }

  // 9.2 API: Mudar Rapidamente de Modelo (com Hot-Swap se estiver rodando)
  if (req.method === 'POST' && urlPath === '/api/agents/change-model') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { model } = JSON.parse(body || '{}');
        if (!model) return sendJson(400, { error: 'Campo "model" é obrigatório' });

        agent2ActiveModel = model;
        agentTelemetry.currentModel = model;
        const wasRunning = Boolean(currentProcess && currentAgent === 'agent2');

        if (wasRunning) {
          addLog(`🔄 Alternando modelo para '${model}' em tempo de execução... Reiniciando enricher imediatamente.`);
          const previousOptions = { ...currentAgentOptions, model };
          stopCurrentAgent();
          setTimeout(() => {
            try {
              startAgent('agent2', previousOptions);
            } catch (err) {
              addLog(`❌ Falha ao reiniciar com o novo modelo: ${err.message}`, 'stderr');
            }
          }, 800);
          return sendJson(200, {
            success: true,
            model,
            restarted: true,
            message: `Modelo trocado para ${model}! O robô foi reiniciado e continuará de onde parou.`
          });
        } else {
          addLog(`⚡ Modelo ativo do Agente 2 configurado para: ${model}`);
          return sendJson(200, {
            success: true,
            model,
            restarted: false,
            message: `Modelo ativo configurado para ${model}. Próxima execução usará esse modelo.`
          });
        }
      } catch (err) {
        return sendJson(500, { error: err.message });
      }
    });
    return;
  }

  // 10. API: Obter Diagnóstico de Rejeições (Agente 4)
  if (req.method === 'GET' && urlPath === '/api/diagnostics') {
    try {
      const diagResultPath = path.resolve(__dirname, '../agent4-diagnostician/diagnostics_result.json');
      const shouldRefresh = req.url.includes('refresh=true') || !fs.existsSync(diagResultPath);
      if (shouldRefresh) {
        const data = await runDiagnostics();
        return sendJson(200, data);
      }
      const data = JSON.parse(fs.readFileSync(diagResultPath, 'utf-8'));
      return sendJson(200, data);
    } catch (err) {
      return sendJson(500, { error: err.message });
    }
  }

  // 9. API: Aplicar Solução Automática a Produto Rejeitado (Agente 4)
  if (req.method === 'POST' && urlPath === '/api/diagnostics/fix') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { sku, fixType } = JSON.parse(body || '{}');
        if (!sku || !fixType) {
          return sendJson(400, { error: 'sku e fixType são obrigatórios' });
        }
        const result = await applySolution(sku, fixType);
        return sendJson(200, result);
      } catch (err) {
        return sendJson(500, { error: err.message });
      }
    });
    return;
  }

  // 9.5. API: Aplicar Correção em Massa de Categorias (Agente 4)
  if (req.method === 'POST' && urlPath === '/api/diagnostics/fix-all') {
    try {
      const result = await applyAllCategoryFixes();
      return sendJson(200, result);
    } catch (err) {
      return sendJson(500, { error: err.message });
    }
  }

  // 10. Servir screenshots do Agente 3
  if (urlPath.startsWith('/screenshots/')) {
    const shotName = path.basename(urlPath);
    const shotPath = path.join(RPA_DIR, 'screenshots', shotName);
    if (fs.existsSync(shotPath) && fs.statSync(shotPath).isFile()) {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      fs.createReadStream(shotPath).pipe(res);
      return;
    }
  }

  // 11. Páginas HTML
  if (urlPath === '/' || urlPath === '/painel' || urlPath === '/painel.html') {
    if (fs.existsSync(PAINEL_PATH)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(PAINEL_PATH).pipe(res);
      return;
    }
  }

  if (urlPath === '/relatorio' || urlPath === '/relatorio.html') {
    if (fs.existsSync(RELATORIO_PATH)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(RELATORIO_PATH).pipe(res);
      return;
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('relatorio.html não encontrado. Execute: node report.mjs');
      return;
    }
  }

  const REJEITADOS_PATH = path.join(__dirname, 'rejeitados.html');
  if (urlPath === '/rejeitados' || urlPath === '/rejeitados.html') {
    if (fs.existsSync(REJEITADOS_PATH)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(REJEITADOS_PATH).pipe(res);
      return;
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('rejeitados.html não encontrado.');
      return;
    }
  }

  // 11.5 Rota para download direto de planilhas geradas e /api/download
  if (urlPath.startsWith('/uploads/') || urlPath === '/api/download') {
    let targetFile = null;
    let fileName = null;

    if (urlPath === '/api/download') {
      const qPath = parsedUrl.searchParams.get('path') || parsedUrl.searchParams.get('file');
      if (qPath) {
        if (path.isAbsolute(qPath) && fs.existsSync(qPath)) {
          targetFile = qPath;
          fileName = path.basename(qPath);
        } else {
          const candidate = path.join(UPLOADS_DIR, path.basename(qPath));
          if (fs.existsSync(candidate)) {
            targetFile = candidate;
            fileName = path.basename(candidate);
          }
        }
      } else {
        const latest = resolveActiveSpreadsheet();
        if (latest && fs.existsSync(latest)) {
          targetFile = latest;
          fileName = path.basename(latest);
        }
      }
    } else {
      fileName = path.basename(urlPath);
      targetFile = path.join(UPLOADS_DIR, fileName);
    }

    if (targetFile && fs.existsSync(targetFile) && fs.statSync(targetFile).isFile()) {
      const ext = path.extname(targetFile).toLowerCase();
      const contentType = ext === '.csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${fileName}"`
      });
      fs.createReadStream(targetFile).pipe(res);
      return;
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Arquivo não encontrado para download.');
      return;
    }
  }

  // 11.6 Servir imagens e arquivos da pasta de downloads do Agente 1
  if (urlPath.startsWith('/downloads/')) {
    const rawSub = decodeURIComponent(urlPath.replace(/^\/downloads\/?/, ''));
    const safePath = path.normalize(path.join(SCRAPER_DIR, 'downloads', rawSub));
    const downloadsBase = path.normalize(path.join(SCRAPER_DIR, 'downloads'));

    if (!safePath.startsWith(downloadsBase)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Acesso negado');
      return;
    }

    if (fs.existsSync(safePath)) {
      const st = fs.statSync(safePath);
      if (st.isFile()) {
        const ext = path.extname(safePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(safePath).pipe(res);
        return;
      } else if (st.isDirectory()) {
        const entries = fs.readdirSync(safePath);
        const subDirs = [];
        const imageFiles = [];
        const otherFiles = [];

        for (const item of entries) {
          try {
            const fullItem = path.join(safePath, item);
            const isDir = fs.statSync(fullItem).isDirectory();
            const relHref = `/downloads/${path.relative(downloadsBase, fullItem).replace(/\\/g, '/')}`;
            if (isDir) {
              const subItems = fs.readdirSync(fullItem);
              const imgCount = subItems.filter(f => /\.(webp|png|jpe?g)$/i.test(f)).length;
              subDirs.push({ name: item, href: relHref, imgCount });
            } else if (/\.(webp|png|jpe?g|gif|svg)$/i.test(item)) {
              imageFiles.push({ name: item, href: relHref });
            } else {
              otherFiles.push({ name: item, href: relHref });
            }
          } catch {}
        }

        const subDirsHtml = subDirs.map(d => `
          <a href="${d.href}" class="folder-card">
            <span class="f-icon">📁</span>
            <div class="f-info">
              <span class="f-name">${escapeHtml(d.name)}</span>
              <span class="f-count">${d.imgCount > 0 ? d.imgCount + ' foto(s)' : 'Pasta'}</span>
            </div>
          </a>
        `).join('');

        const imagesHtml = imageFiles.map(img => `
          <div class="img-card">
            <a href="${img.href}" target="_blank" title="Clique para abrir imagem original">
              <img src="${img.href}" alt="${escapeHtml(img.name)}" loading="lazy" class="img-thumb" />
            </a>
            <div class="img-meta">
              <span class="img-title" title="${escapeHtml(img.name)}">${escapeHtml(img.name)}</span>
              <a href="${img.href}" download class="img-btn-dl">📥 Baixar</a>
            </div>
          </div>
        `).join('');

        const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Galeria de Fotos - Agente 1</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: rgba(30, 41, 59, 0.7);
      --border: rgba(255, 255, 255, 0.1);
      --primary: #38bdf8;
      --text: #f8fafc;
      --muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); padding: 24px; min-height: 100vh; }
    .container { max-width: 1200px; margin: 0 auto; }
    .header-box { background: var(--card-bg); border: 1px solid var(--border); border-radius: 14px; padding: 20px 24px; margin-bottom: 24px; backdrop-filter: blur(12px); }
    .title-row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 12px; }
    h1 { font-size: 1.4rem; color: var(--primary); display: flex; align-items: center; gap: 8px; font-weight: 700; }
    .btn-group { display: flex; gap: 8px; flex-wrap: wrap; }
    .btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 0.85rem; cursor: pointer; border: none; transition: 0.2s; }
    .btn-primary { background: #0284c7; color: #fff; }
    .btn-primary:hover { background: #0369a1; }
    .btn-success { background: #10b981; color: #fff; }
    .btn-success:hover { background: #059669; }
    .btn-secondary { background: rgba(255,255,255,0.08); color: #e2e8f0; border: 1px solid var(--border); }
    .btn-secondary:hover { background: rgba(255,255,255,0.15); }
    .path-bar { background: rgba(0,0,0,0.5); border: 1px solid var(--border); padding: 8px 12px; border-radius: 8px; font-family: monospace; font-size: 0.8rem; color: var(--muted); word-break: break-all; }
    
    .section-title { font-size: 1rem; color: #e2e8f0; font-weight: 700; margin: 24px 0 12px; display: flex; align-items: center; gap: 6px; text-transform: uppercase; letter-spacing: 0.05em; }
    
    .folders-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; margin-bottom: 24px; }
    .folder-card { background: rgba(255,255,255,0.04); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; display: flex; align-items: center; gap: 12px; text-decoration: none; color: var(--text); transition: all 0.2s; }
    .folder-card:hover { background: rgba(56,189,248,0.1); border-color: var(--primary); transform: translateY(-2px); }
    .f-icon { font-size: 1.6rem; }
    .f-info { display: flex; flex-direction: column; overflow: hidden; }
    .f-name { font-weight: 600; font-size: 0.9rem; color: #f1f5f9; text-overflow: ellipsis; white-space: nowrap; overflow: hidden; }
    .f-count { font-size: 0.75rem; color: var(--muted); }

    .images-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px; }
    .img-card { background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; transition: all 0.2s; }
    .img-card:hover { border-color: var(--primary); transform: translateY(-2px); box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    .img-thumb { width: 100%; height: 170px; object-fit: cover; display: block; background: #020617; }
    .img-meta { padding: 10px; display: flex; flex-direction: column; gap: 6px; }
    .img-title { font-size: 0.75rem; color: #cbd5e1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: monospace; }
    .img-btn-dl { display: inline-block; background: rgba(56,189,248,0.15); color: var(--primary); padding: 4px 8px; border-radius: 6px; text-decoration: none; font-size: 0.75rem; font-weight: 600; text-align: center; }
    .img-btn-dl:hover { background: var(--primary); color: #000; }
    
    .empty-state { text-align: center; padding: 40px; color: var(--muted); background: var(--card-bg); border-radius: 12px; border: 1px dashed var(--border); }
  </style>
</head>
<body>
  <div class="container">
    <div class="header-box">
      <div class="title-row">
        <h1>📸 Fotos & Downloads do Agente 1</h1>
        <div class="btn-group">
          <a href="/painel.html" class="btn btn-secondary">&larr; Voltar ao Painel</a>
          <button class="btn btn-success" onclick="openComputerFolder()">💻 Abrir Pasta no Windows</button>
          <a href="/downloads/" class="btn btn-primary">Raiz de Fotos</a>
        </div>
      </div>
      <div class="path-bar">📍 ${safePath}</div>
    </div>

    ${subDirs.length > 0 ? `
      <div class="section-title">📁 Subpastas (${subDirs.length})</div>
      <div class="folders-grid">${subDirsHtml}</div>
    ` : ''}

    ${imageFiles.length > 0 ? `
      <div class="section-title">🖼️ Fotos em Alta Resolução (${imageFiles.length})</div>
      <div class="images-grid">${imagesHtml}</div>
    ` : ''}

    ${subDirs.length === 0 && imageFiles.length === 0 ? `
      <div class="empty-state">
        <div style="font-size: 2.5rem; margin-bottom: 8px;">📂</div>
        <p>Nenhuma foto ou pasta encontrada neste diretório.</p>
      </div>
    ` : ''}
  </div>

  <script>
    async function openComputerFolder() {
      try {
        const res = await fetch('/api/open-folder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
        const data = await res.json();
        if (data.success) {
          alert('Pasta aberta com sucesso no Explorador de Arquivos do Windows!');
        } else {
          alert('Aviso: ' + (data.error || 'Não foi possível abrir localmente'));
        }
      } catch (e) {
        alert('Erro de conexão ao abrir pasta local.');
      }
    }
  </script>
</body>
</html>`;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Pasta ou arquivo de fotos não encontrado.');
    return;
  }

  // 12. Arquivos estáticos gerais
  const filePath = path.join(__dirname, urlPath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 Not Found');
});

server.on('error', (err) => {
  if (err.code === 'EACCES' || err.code === 'EADDRINUSE') {
    console.error(`\n❌ Porta ${PORT} indisponível ou permissão negada (${err.code}).`);
    if (PORT === 80) {
      console.log(`⚠️ Tentando iniciar na porta 3000 como fallback...`);
      server.listen(3000, '0.0.0.0');
    }
  } else {
    console.error('Erro no servidor HTTP:', err.message);
  }
});

process.on('uncaughtException', (err) => {
  console.error('⚠️ [server] uncaughtException interceptado para evitar queda:', err?.message || err);
});

process.on('unhandledRejection', (reason) => {
  console.error('⚠️ [server] unhandledRejection interceptado para evitar queda:', reason?.message || reason);
});

server.listen(PORT, '0.0.0.0', () => {
  const currentPort = server.address()?.port || PORT;
  console.log(`\n=============================================================`);
  console.log(`🚀 Painel de Automação ativo em: http://localhost:${currentPort}`);
  console.log(`🌐 Link Permanente Ngrok:        ${NGROK_URL}`);
  console.log(`📊 Relatório de Auditoria:       ${NGROK_URL}/relatorio.html`);
  console.log(`📂 Pasta de Uploads:             ${UPLOADS_DIR}`);
  console.log(`=============================================================\n`);
});


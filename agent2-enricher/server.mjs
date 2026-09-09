import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { extractParentSku } from './grouping.mjs';
import { runDiagnostics, applySolution, applyAllCategoryFixes } from '../agent4-diagnostician/diagnose.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3000;
const RELATORIO_PATH = path.join(__dirname, 'relatorio.html');
const PAINEL_PATH = path.join(__dirname, 'painel.html');
const CSV_PATH = path.resolve(__dirname, '../agent1-scraper/lote_d1fae5.csv');
const PRODUTOS_DIR = path.join(__dirname, 'produtos');
const SCRAPER_DIR = path.resolve(__dirname, '../agent1-scraper');
const RPA_DIR = path.resolve(__dirname, '../agent3-rpa-magis5');
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
  '.svg': 'image/svg+xml'
};

// ─────────────────────────────────────────────────────────────────────────────
// Gerenciador de Processos dos Agentes e Logs em Tempo Real
// ─────────────────────────────────────────────────────────────────────────────

let currentProcess = null;
let currentAgent = null; // 'agent1', 'agent2', 'agent3'
let agentStatus = 'idle'; // 'idle', 'running', 'done', 'error'
const logBuffer = [];
const MAX_LOGS = 500;

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
    try {
      addLog(`⚠️ Processo do ${currentAgent} interrompido pelo usuário.`, 'stderr');
      currentProcess.kill('SIGTERM');
    } catch (e) {
      addLog(`Erro ao matar processo: ${e.message}`, 'stderr');
    }
    currentProcess = null;
    agentStatus = 'idle';
    currentAgent = null;
    return true;
  }
  return false;
}

function startAgent(agentId, options = {}) {
  if (currentProcess) {
    throw new Error(`Um agente já está em execução (${currentAgent}). Aguarde ou interrompa antes.`);
  }

  logBuffer.length = 0; // Limpa logs anteriores
  currentAgent = agentId;
  agentStatus = 'running';

  let cmd = 'node';
  let args = [];
  let cwd = __dirname;

  if (agentId === 'agent1') {
    cwd = SCRAPER_DIR;
    const action = options.action || 'auto';
    const inputFile = options.inputFile;
    const isExcel = inputFile && /\.(xlsx?)$/i.test(inputFile);

    if (action === 'extract' || (action === 'auto' && isExcel)) {
      args = ['create_lote.mjs'];
      if (inputFile) args.push('--input', inputFile);
      if (options.color && options.color !== 'TODAS') {
        args.push('--color', options.color);
      }
      if (options.limit && parseInt(options.limit, 10) > 0) {
        args.push('--limit', options.limit.toString());
      }
    } else if (action === 'scraper') {
      args = ['scraper.mjs'];
      if (inputFile && !isExcel) args.push('--input', inputFile);
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
    if (options.inputFile) {
      args.push('--input', options.inputFile);
    }
    if (options.model) {
      args.push('--model', options.model);
    }
    if (options.limit && parseInt(options.limit, 10) > 0) {
      args.push('--limit', options.limit.toString());
    }
    if (options.batch && parseInt(options.batch, 10) > 0) {
      args.push('--batch', options.batch.toString());
    }
    if (options.sku) {
      args.push('--sku', options.sku.trim());
    }
  } else if (agentId === 'agent3') {
    cwd = RPA_DIR;
    args = ['src/runner.mjs'];
    if (options.inputFile) {
      args.push('--input', options.inputFile);
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
  } else if (agentId === 'agent4') {
    cwd = path.resolve(__dirname, '../agent4-diagnostician');
    args = ['diagnose.mjs'];
  } else if (agentId === 'sync-report') {
    cwd = __dirname;
    args = ['report.mjs'];
  } else {
    throw new Error(`Agente desconhecido: ${agentId}`);
  }

  addLog(`🚀 Iniciando ${agentId.toUpperCase()}: ${cmd} ${args.join(' ')}`);
  addLog(`📂 Diretório de trabalho: ${cwd}`);

  const child = spawn(cmd, args, {
    cwd,
    shell: true,
    env: { ...process.env, FORCE_COLOR: '1' }
  });

  currentProcess = child;

  child.stdout.on('data', (data) => {
    const text = data.toString();
    addLog(text, 'stdout');
    process.stdout.write(`[${agentId}] ${text}`);
  });

  child.stderr.on('data', (data) => {
    const text = data.toString();
    addLog(text, 'stderr');
    process.stderr.write(`[${agentId} ERROR] ${text}`);
  });

  child.on('close', (code) => {
    addLog(`🏁 ${agentId.toUpperCase()} finalizou com código de saída: ${code}`, code === 0 ? 'stdout' : 'stderr');
    agentStatus = code === 0 ? 'done' : 'error';
    currentProcess = null;
    currentAgent = null;
  });

  child.on('error', (err) => {
    addLog(`❌ Falha ao iniciar processo: ${err.message}`, 'stderr');
    agentStatus = 'error';
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
      result.push({
        ...item,
        ext,
        isExcel: ext === '.xls' || ext === '.xlsx',
        isCsv: ext === '.csv'
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
    { name: 'lote_d1fae5.csv', path: CSV_PATH, source: 'Lote Ativo' },
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

  const sendJson = (status, data) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify(data));
  };

  // 1. API: Obter Status e Métricas
  if (req.method === 'GET' && urlPath === '/api/stats') {
    return sendJson(200, {
      stats: getPipelineStats(),
      agentRunning: Boolean(currentProcess),
      currentAgent,
      agentStatus
    });
  }

  // 2. API: Obter Logs
  if (req.method === 'GET' && urlPath === '/api/agents/logs') {
    return sendJson(200, {
      logs: logBuffer,
      running: Boolean(currentProcess),
      currentAgent,
      agentStatus
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

        return sendJson(200, {
          success: true,
          filename: safeName,
          originalName: filename,
          filePath: targetPath,
          size: buffer.length
        });
      } catch (err) {
        console.error('[Upload] Erro:', err);
        return sendJson(500, { error: err.message });
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
          return sendJson(400, { error: 'Campo "agent" é obrigatório (agent1, agent2, agent3)' });
        }
        const result = startAgent(agent, options || {});
        return sendJson(200, result);
      } catch (err) {
        return sendJson(500, { error: err.message });
      }
    });
    return;
  }

  // 6. API: Parar Agente
  if (req.method === 'POST' && urlPath === '/api/agents/stop') {
    const stopped = stopCurrentAgent();
    return sendJson(200, { success: true, stopped });
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

  // 8. API: Obter Diagnóstico de Rejeições (Agente 4)
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

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n=============================================================`);
  console.log(`🚀 Painel de Automação ativo em: http://localhost:${PORT}`);
  console.log(`📊 Relatório de Auditoria em:     http://localhost:${PORT}/relatorio.html`);
  console.log(`📂 Pasta de Uploads:             ${UPLOADS_DIR}`);
  console.log(`=============================================================\n`);
});

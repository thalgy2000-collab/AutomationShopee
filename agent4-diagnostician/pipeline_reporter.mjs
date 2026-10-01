import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');
const SCRAPER_DIR = path.join(ROOT_DIR, 'agent1-scraper');
const ENRICHER_DIR = path.join(ROOT_DIR, 'agent2-enricher');
const RPA_DIR = path.join(ROOT_DIR, 'agent3-rpa-magis5');

const PRODUTOS_DIR = path.join(ENRICHER_DIR, 'produtos');
const DOWNLOADS_DIR = path.join(SCRAPER_DIR, 'downloads');
const SCREENSHOTS_DIR = path.join(RPA_DIR, 'screenshots');
const ACTIVE_BATCH_FILE = path.join(ENRICHER_DIR, '.active_batch.json');
const LOTE_CSV_FILE = path.join(SCRAPER_DIR, 'lote_d1fae5.csv');
const HISTORY_FILE = path.join(ENRICHER_DIR, 'historico_agentes.json');
const QUOTA_FILE = path.join(ENRICHER_DIR, 'quota_data.json');

const OUTPUT_JSON = path.join(__dirname, 'relatorio_consolidado.json');
const OUTPUT_HTML = path.join(__dirname, 'relatorio_esteira.html');

function parseCsvSync(text) {
  if (!text) return [];
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    const cols = [];
    let inQuote = false;
    let curr = '';
    for (let c = 0; c < row.length; c++) {
      const char = row[c];
      if (char === '"') {
        inQuote = !inQuote;
      } else if (char === ',' && !inQuote) {
        cols.push(curr.trim().replace(/^["']|["']$/g, ''));
        curr = '';
      } else {
        curr += char;
      }
    }
    cols.push(curr.trim().replace(/^["']|["']$/g, ''));
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = cols[idx] !== undefined ? cols[idx] : '';
    });
    records.push(obj);
  }
  return records;
}

function extractParentSku(sku) {
  if (!sku) return '';
  const clean = String(sku).trim().toUpperCase();
  // Se for camisa BL (feminina): remove sufixos de tamanho mantendo o BL
  if (clean.includes('BL')) {
    return clean.replace(/(?:PP|P|M|G|GG|G[1-5]|XXG|EXG|EGG|XG|EG|\d{2}\/\d{2})$/i, '');
  }
  // Se for infantil I: remove sufixos de tamanho mantendo o I
  if (clean.includes('I') && /I(?:PP|P|M|G|GG|\d+)$/i.test(clean)) {
    return clean.replace(/(?:PP|P|M|G|GG|\d+)$/i, '');
  }
  // Padrão masculino / geral: remove sufixos de tamanho
  return clean.replace(/(?:PP|P|M|G|GG|G[1-5]|XXG|EXG|EGG|XG|EG|\d{2}\/\d{2})$/i, '');
}

export function generatePipelineReport() {
  const timestamp = new Date().toISOString();
  const reportTimeBr = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  AGENTE 4 — RELATOR EXECUTIVO & AUDITOR DA ESTEIRA');
  console.log(`  Data: ${reportTimeBr}`);
  console.log('═══════════════════════════════════════════════════════════════');

  // 1. Dados do Agente 0 (Sankhya Scout & Planilhas)
  let activeBatchPath = null;
  let activeBatchName = 'Nenhuma planilha ativa';
  try {
    if (fs.existsSync(ACTIVE_BATCH_FILE)) {
      const activeData = JSON.parse(fs.readFileSync(ACTIVE_BATCH_FILE, 'utf8'));
      if (activeData.path && fs.existsSync(activeData.path)) {
        activeBatchPath = activeData.path;
        activeBatchName = path.basename(activeBatchPath);
      }
    }
  } catch {}

  const uploadedSpreadsheets = [];
  if (fs.existsSync(UPLOADS_DIR)) {
    const uFiles = fs.readdirSync(UPLOADS_DIR).filter(f => /\.(xlsx?|csv)$/i.test(f));
    for (const f of uFiles) {
      try {
        const s = fs.statSync(path.join(UPLOADS_DIR, f));
        uploadedSpreadsheets.push({
          name: f,
          sizeBytes: s.size,
          mtime: s.mtime,
          isActive: activeBatchPath && path.basename(activeBatchPath) === f
        });
      } catch {}
    }
  }
  uploadedSpreadsheets.sort((a, b) => b.mtime - a.mtime);

  // 2. Dados do Agente 1 (Coletor de Fotos)
  let totalPhotos = 0;
  let totalPhotoFolders = 0;
  const photoFoldersMap = new Map();

  if (fs.existsSync(DOWNLOADS_DIR)) {
    const scanFolder = (dirPath, folderName) => {
      try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        const imgs = entries.filter(e => e.isFile() && /\.(jpe?g|png|webp)$/i.test(e.name));
        if (imgs.length > 0) {
          totalPhotoFolders++;
          totalPhotos += imgs.length;
          photoFoldersMap.set(folderName.toUpperCase(), {
            folder: folderName,
            count: imgs.length,
            sample: imgs[0].name,
            hasVariations: imgs.length > 1
          });
        }
        // Subpastas (ex: downloads/CAX/CAX028)
        for (const e of entries) {
          if (e.isDirectory()) {
            const subDirPath = path.join(dirPath, e.name);
            const subImgs = fs.readdirSync(subDirPath).filter(x => /\.(jpe?g|png|webp)$/i.test(x));
            if (subImgs.length > 0 && !photoFoldersMap.has(e.name.toUpperCase())) {
              totalPhotoFolders++;
              totalPhotos += subImgs.length;
              photoFoldersMap.set(e.name.toUpperCase(), {
                folder: e.name,
                count: subImgs.length,
                sample: subImgs[0],
                hasVariations: subImgs.length > 1
              });
            }
          }
        }
      } catch {}
    };

    const folders = fs.readdirSync(DOWNLOADS_DIR, { withFileTypes: true });
    for (const f of folders) {
      if (f.isDirectory()) {
        scanFolder(path.join(DOWNLOADS_DIR, f.name), f.name);
      }
    }
  }

  // 3. Dados do Agente 2 (IA Vision & SEO)
  const enrichedProductsMap = new Map();
  let totalEnriched = 0;
  let modelsUsedStats = {};
  let titlesExceeding60 = 0;

  if (fs.existsSync(PRODUTOS_DIR)) {
    const jsonFiles = fs.readdirSync(PRODUTOS_DIR).filter(f => f.endsWith('.json'));
    totalEnriched = jsonFiles.length;

    for (const jf of jsonFiles) {
      try {
        const pPath = path.join(PRODUTOS_DIR, jf);
        const pData = JSON.parse(fs.readFileSync(pPath, 'utf8'));
        const parentSku = path.basename(jf, '.json').toUpperCase();
        const titleLen = (pData.titulo_shopee || '').length;
        if (titleLen > 60) titlesExceeding60++;

        const modelUsed = pData.modelo_ia || pData.ai_model || 'gemini-2.5-flash';
        modelsUsedStats[modelUsed] = (modelsUsedStats[modelUsed] || 0) + 1;

        enrichedProductsMap.set(parentSku, {
          sku: parentSku,
          title: pData.titulo_shopee || '',
          titleLen,
          brand: pData.marca || 'BRK',
          model: pData.modelo || '',
          variationsCount: (pData.variacoes || []).length,
          price: pData.preco?.preco_atual || pData.preco_atual || null,
          hasFullSpecs: Boolean(pData.atributos && Object.keys(pData.atributos).length > 5),
          filePath: pPath
        });
      } catch {}
    }
  }

  // 4. Dados do Agente 3 (Magis5 RPA & Screenshots)
  const screenshotsList = [];
  const publishedMap = new Map();
  const failedMap = new Map();

  if (fs.existsSync(SCREENSHOTS_DIR)) {
    const scFiles = fs.readdirSync(SCREENSHOTS_DIR).filter(f => f.endsWith('.png'));
    for (const sf of scFiles) {
      try {
        const fullSc = path.join(SCREENSHOTS_DIR, sf);
        const st = fs.statSync(fullSc);
        const isSuccess = sf.startsWith('draft-');
        const isError = sf.startsWith('erro-');
        
        // Extrai SKU do nome do arquivo (ex: draft-CAX016-1789998456032.png)
        const parts = sf.split('-');
        const skuExtracted = parts.length >= 2 ? parts[1].toUpperCase() : null;

        const entry = {
          name: sf,
          isSuccess,
          isError,
          sku: skuExtracted,
          time: st.mtime,
          path: fullSc,
          url: `/screenshots/${encodeURIComponent(sf)}`
        };
        screenshotsList.push(entry);

        if (skuExtracted) {
          if (isSuccess && (!publishedMap.has(skuExtracted) || st.mtime > publishedMap.get(skuExtracted).time)) {
            publishedMap.set(skuExtracted, entry);
          } else if (isError && (!failedMap.has(skuExtracted) || st.mtime > failedMap.get(skuExtracted).time)) {
            failedMap.set(skuExtracted, entry);
          }
        }
      } catch {}
    }
  }
  screenshotsList.sort((a, b) => b.time - a.time);

  // 5. Consolidação do Lote Ativo SKU a SKU (Funil da Esteira)
  const activeBatchFunnel = [];
  let batchTotalRows = 0;
  let batchUniqueParents = new Set();
  let batchPublishedCount = 0;
  let batchEnrichedCount = 0;
  let batchPhotosCount = 0;

  if (fs.existsSync(LOTE_CSV_FILE)) {
    try {
      const csvRaw = fs.readFileSync(LOTE_CSV_FILE, 'utf8');
      const records = parseCsvSync(csvRaw);
      batchTotalRows = records.length;

      const grouped = new Map();
      for (const row of records) {
        const rawSku = (row.sku || row.SKU || '').trim();
        if (!rawSku) continue;
        const parent = extractParentSku(rawSku);
        if (!grouped.has(parent)) {
          grouped.set(parent, {
            parentSku: parent,
            titleSample: row.titulo_bruto || row.descricao || row.titulo || '',
            collection: row.colecao || 'Geral',
            color: row.cor || 'SEM_COR',
            status: row.status || 'pendente',
            items: []
          });
        }
        grouped.get(parent).items.push(row);
        if (row.status === 'publicado') {
          grouped.get(parent).status = 'publicado';
        }
      }

      batchUniqueParents = new Set(grouped.keys());

      for (const [parentSku, grp] of grouped.entries()) {
        const hasPhotos = photoFoldersMap.has(parentSku);
        const photosInfo = photoFoldersMap.get(parentSku) || null;
        const isEnriched = enrichedProductsMap.has(parentSku);
        const enrichedInfo = enrichedProductsMap.get(parentSku) || null;
        
        // Verifica publicação no Magis5 (status do lote ou screenshot de sucesso)
        const isPublished = grp.status === 'publicado' || publishedMap.has(parentSku);
        const hasFailedRPA = failedMap.has(parentSku) && !isPublished;
        const rpaProof = publishedMap.get(parentSku) || failedMap.get(parentSku) || null;

        if (hasPhotos) batchPhotosCount++;
        if (isEnriched) batchEnrichedCount++;
        if (isPublished) batchPublishedCount++;

        // Determina a etapa atual do produto no Funil (0 a 4)
        // 0: Apenas no Sankhya
        // 1: Fotos Prontas
        // 2: Enriquecido com IA
        // 3: Publicado no Magis5 (Completo!)
        let currentStage = '0_sankhya';
        let stageLabel = 'No Catálogo ERP';
        let stageColor = '#64748B';

        if (isPublished) {
          currentStage = '3_publicado';
          stageLabel = '✓ Publicado Magis5';
          stageColor = '#10B981';
        } else if (isEnriched) {
          currentStage = '2_enriquecido';
          stageLabel = '⚡ Pronto para Publicar';
          stageColor = '#8B5CF6';
        } else if (hasPhotos) {
          currentStage = '1_fotos';
          stageLabel = '📸 Fotos Coletadas';
          stageColor = '#3B82F6';
        }

        activeBatchFunnel.push({
          parentSku,
          title: enrichedInfo?.title || grp.titleSample,
          collection: grp.collection,
          totalVariations: grp.items.length,
          hasPhotos,
          photosCount: photosInfo?.count || 0,
          isEnriched,
          enrichedTitleLen: enrichedInfo?.titleLen || 0,
          isPublished,
          hasFailedRPA,
          currentStage,
          stageLabel,
          stageColor,
          rpaProof: rpaProof ? {
            name: rpaProof.name,
            url: rpaProof.url,
            isSuccess: rpaProof.isSuccess,
            time: rpaProof.time
          } : null
        });
      }
    } catch (err) {
      console.error('Erro ao ler lote CSV ativo:', err.message);
    }
  }

  // 6. Resumo Executivo e Métricas da Esteira
  const totalParents = batchUniqueParents.size || enrichedProductsMap.size || 1;
  const completionRate = Math.round((batchPublishedCount / (totalParents || 1)) * 100);
  const enrichmentRate = Math.round((batchEnrichedCount / (totalParents || 1)) * 100);
  const photosRate = Math.round((batchPhotosCount / (totalParents || 1)) * 100);

  // Gargalo identificado
  let currentBottleneck = 'Operação em dia';
  let bottleneckAdvice = 'A esteira está fluindo normalmente.';

  if (batchEnrichedCount > batchPublishedCount + 5) {
    currentBottleneck = 'Publicação Magis5 (Agente 3)';
    bottleneckAdvice = `Há ${batchEnrichedCount - batchPublishedCount} produtos já enriquecidos pela IA aguardando publicação no Magis5.`;
  } else if (batchPhotosCount > batchEnrichedCount + 5) {
    currentBottleneck = 'Enriquecimento IA (Agente 2)';
    bottleneckAdvice = `Há ${batchPhotosCount - batchEnrichedCount} produtos com fotos prontas aguardando títulos SEO e ficha técnica da IA.`;
  } else if (totalParents > batchPhotosCount + 5) {
    currentBottleneck = 'Coleta de Fotos (Agente 1)';
    bottleneckAdvice = `Há ${totalParents - batchPhotosCount} produtos do ERP aguardando download de fotos oficiais na Shopify.`;
  }

  const reportData = {
    generatedAt: timestamp,
    generatedAtBr: reportTimeBr,
    activeBatch: {
      name: activeBatchName,
      path: activeBatchPath,
      totalRows: batchTotalRows,
      uniqueParents: totalParents
    },
    summary: {
      totalParents,
      batchPublishedCount,
      batchEnrichedCount,
      batchPhotosCount,
      completionRate,
      enrichmentRate,
      photosRate,
      currentBottleneck,
      bottleneckAdvice
    },
    agentsStatus: {
      agent0: {
        name: 'Sankhya Scout',
        status: activeBatchPath ? 'Ativo' : 'Aguardando',
        totalPlanilhas: uploadedSpreadsheets.length,
        planilhaAtiva: activeBatchName,
        skusNoLote: batchTotalRows
      },
      agent1: {
        name: 'Coletor de Fotos',
        status: totalPhotos > 0 ? 'Concluído' : 'Pendente',
        totalPastas: totalPhotoFolders,
        totalFotos: totalPhotos,
        coberturaLote: `${batchPhotosCount}/${totalParents} (${photosRate}%)`
      },
      agent2: {
        name: 'IA Vision & SEO',
        status: totalEnriched > 0 ? 'Ativo' : 'Pendente',
        totalEnriquecidos: totalEnriched,
        coberturaLote: `${batchEnrichedCount}/${totalParents} (${enrichmentRate}%)`,
        titulosMais60Carac: titlesExceeding60,
        modelosUsados: modelsUsedStats
      },
      agent3: {
        name: 'Magis5 RPA',
        status: batchPublishedCount > 0 ? 'Ativo' : 'Pendente',
        publicadosSucesso: publishedMap.size,
        publicadosNoLote: `${batchPublishedCount}/${totalParents} (${completionRate}%)`,
        falhasDetectadas: failedMap.size,
        totalComprovantes: screenshotsList.length
      }
    },
    recentEvidences: screenshotsList.slice(0, 12),
    funnel: activeBatchFunnel
  };

  // Salva o JSON estruturado para consumo de APIs
  try {
    fs.writeFileSync(OUTPUT_JSON, JSON.stringify(reportData, null, 2), 'utf8');
    console.log(`✅ Relatório JSON salvo em: ${OUTPUT_JSON}`);
  } catch (err) {
    console.error('Erro ao salvar JSON de relatório:', err.message);
  }

  // Gera o HTML consolidado executivo para visualização
  const htmlContent = renderExecutiveReportHtml(reportData);
  try {
    fs.writeFileSync(OUTPUT_HTML, htmlContent, 'utf8');
    console.log(`✅ Relatório Visual HTML gerado em: ${OUTPUT_HTML}`);
    const rootEsteiraHtml = path.join(ROOT_DIR, 'relatorio-esteira.html');
    fs.writeFileSync(rootEsteiraHtml, htmlContent, 'utf8');
    console.log(`✅ Relatório Visual HTML sincronizado na raiz em: ${rootEsteiraHtml}`);
  } catch (err) {
    console.error('Erro ao salvar HTML de relatório:', err.message);
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`📊 Taxa de Conclusão da Esteira: ${completionRate}% (${batchPublishedCount}/${totalParents} publicados)`);
  console.log(`⚠️ Gargalo Atual: ${currentBottleneck}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  return reportData;
}

function renderExecutiveReportHtml(data) {
  const { summary, activeBatch, agentsStatus, funnel, recentEvidences, generatedAtBr } = data;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Painel Executivo da Esteira — BRK Shopee Automation</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0B0E17;
      --card: #151C2E;
      --card-border: rgba(255, 255, 255, 0.08);
      --primary: #EE4D2D;
      --accent-blue: #3B82F6;
      --accent-green: #10B981;
      --accent-purple: #8B5CF6;
      --accent-amber: #F59E0B;
      --text: #F8FAFC;
      --text-muted: #94A3B8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Inter', -apple-system, sans-serif;
      padding: 24px;
      line-height: 1.5;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 16px;
      flex-wrap: wrap;
      gap: 16px;
    }
    .header-title {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .badge-live {
      background: rgba(16, 185, 129, 0.2);
      color: #34D399;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 700;
      border: 1px solid rgba(16, 185, 129, 0.4);
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .kpi-card {
      background: var(--card);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 16px;
      position: relative;
      overflow: hidden;
    }
    .kpi-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0; height: 3px;
      background: var(--card-color, var(--primary));
    }
    .kpi-num { font-size: 2rem; font-weight: 800; margin: 6px 0; }
    .kpi-label { font-size: 0.8rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase; }
    
    .agents-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .agent-box {
      background: var(--card);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 18px;
    }
    .agent-box-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      padding-bottom: 8px;
    }
    .agent-name { font-weight: 700; font-size: 0.95rem; }
    .agent-metric-row {
      display: flex;
      justify-content: space-between;
      font-size: 0.84rem;
      padding: 4px 0;
      color: var(--text-muted);
    }
    .agent-metric-row strong { color: #fff; }

    .funnel-table-box {
      background: var(--card);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 24px;
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
      text-align: left;
    }
    th {
      background: rgba(0, 0, 0, 0.3);
      padding: 10px 12px;
      color: var(--text-muted);
      font-weight: 600;
      border-bottom: 1px solid var(--card-border);
    }
    td {
      padding: 10px 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    }
    .status-pill {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 700;
    }
    .pill-yes { background: rgba(16, 185, 129, 0.2); color: #34D399; }
    .pill-no { background: rgba(239, 68, 68, 0.2); color: #F87171; }
    .pill-wait { background: rgba(245, 158, 11, 0.2); color: #FBBF24; }
    
    .evidence-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 12px;
      margin-top: 12px;
    }
    .evidence-item {
      background: rgba(0,0,0,0.4);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      overflow: hidden;
      text-decoration: none;
      color: #fff;
    }
    .evidence-item img {
      width: 100%;
      height: 110px;
      object-fit: cover;
      display: block;
      border-bottom: 1px solid var(--card-border);
    }
    .evidence-meta { padding: 8px; font-size: 0.75rem; }
    .evidence-badge {
      display: inline-block;
      font-size: 0.68rem;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      margin-bottom: 4px;
    }
    .badge-success { background: #065F46; color: #A7F3D0; }
    .badge-error { background: #991B1B; color: #FECACA; }
  </style>
</head>
<body>

  <div class="header">
    <div>
      <div class="header-title">
        <h1 style="font-size: 1.4rem; font-weight: 800;">📊 Painel Executivo da Esteira — Agente 4</h1>
        <span class="badge-live">ONLINE • SINCRONIZADO</span>
      </div>
      <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px;">
        Auditoria consolidada dos Agentes 0, 1, 2 e 3 &bull; Gerado em: <strong>${generatedAtBr}</strong>
      </p>
    </div>
    <div>
      <a href="/painel.html" style="background: rgba(255,255,255,0.08); color: #fff; text-decoration: none; padding: 8px 16px; border-radius: 8px; font-size: 0.85rem; font-weight: 600; margin-right: 8px;">&larr; Voltar ao Painel</a>
      <button onclick="window.location.reload()" style="background: var(--primary); color: #fff; border: none; padding: 8px 16px; border-radius: 8px; font-size: 0.85rem; font-weight: 600; cursor: pointer;">🔄 Atualizar Dados</button>
    </div>
  </div>

  <!-- KPIs de Desempenho da Esteira -->
  <div class="kpi-grid">
    <div class="kpi-card" style="--card-color: #3B82F6;">
      <div class="kpi-label">Lote Ativo</div>
      <div class="kpi-num" style="font-size: 1.25rem; word-break: break-all; margin: 10px 0;">${activeBatch.name}</div>
      <div style="font-size: 0.78rem; color: var(--text-muted);">${activeBatch.uniqueParents} anúncios pai (${activeBatch.totalRows} variações)</div>
    </div>

    <div class="kpi-card" style="--card-color: #10B981;">
      <div class="kpi-label">Taxa de Conclusão Geral</div>
      <div class="kpi-num" style="color: #34D399;">${summary.completionRate}%</div>
      <div style="font-size: 0.78rem; color: var(--text-muted);">${summary.batchPublishedCount} de ${summary.totalParents} produtos salvos na Magis5</div>
    </div>

    <div class="kpi-card" style="--card-color: #8B5CF6;">
      <div class="kpi-label">Enriquecimento IA</div>
      <div class="kpi-num" style="color: #A78BFA;">${summary.enrichmentRate}%</div>
      <div style="font-size: 0.78rem; color: var(--text-muted);">${summary.batchEnrichedCount} de ${summary.totalParents} prontos com títulos e SEO</div>
    </div>

    <div class="kpi-card" style="--card-color: #F59E0B;">
      <div class="kpi-label">Diagnóstico de Gargalo</div>
      <div class="kpi-num" style="font-size: 1.15rem; color: #FBBF24; margin: 12px 0;">${summary.currentBottleneck}</div>
      <div style="font-size: 0.78rem; color: var(--text-muted);">${summary.bottleneckAdvice}</div>
    </div>
  </div>

  <!-- Status Resumido por Agente -->
  <h2 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 14px; display: flex; align-items: center; gap: 8px;">
    <span>🤖</span> Desempenho Individual dos Agentes
  </h2>

  <div class="agents-grid">
    <div class="agent-box">
      <div class="agent-box-header">
        <span class="agent-name">Agente 0: Sankhya Scout</span>
        <span class="status-pill pill-yes">OK</span>
      </div>
      <div class="agent-metric-row"><span>Planilhas no sistema:</span> <strong>${agentsStatus.agent0.totalPlanilhas}</strong></div>
      <div class="agent-metric-row"><span>Itens no lote atual:</span> <strong>${agentsStatus.agent0.skusNoLote} SKUs</strong></div>
      <div class="agent-metric-row"><span>Papel:</span> <strong>Mineração ERP</strong></div>
    </div>

    <div class="agent-box">
      <div class="agent-box-header">
        <span class="agent-name">Agente 1: Coletor de Fotos</span>
        <span class="status-pill pill-yes">OK</span>
      </div>
      <div class="agent-metric-row"><span>Pastas no disco:</span> <strong>${agentsStatus.agent1.totalPastas}</strong></div>
      <div class="agent-metric-row"><span>Total de fotos salvas:</span> <strong>${agentsStatus.agent1.totalFotos}</strong></div>
      <div class="agent-metric-row"><span>Cobertura do lote:</span> <strong>${agentsStatus.agent1.coberturaLote}</strong></div>
    </div>

    <div class="agent-box">
      <div class="agent-box-header">
        <span class="agent-name">Agente 2: IA Vision & SEO</span>
        <span class="status-pill pill-yes">OK</span>
      </div>
      <div class="agent-metric-row"><span>Total enriquecidos:</span> <strong>${agentsStatus.agent2.totalEnriquecidos} produtos</strong></div>
      <div class="agent-metric-row"><span>Cobertura do lote:</span> <strong>${agentsStatus.agent2.coberturaLote}</strong></div>
      <div class="agent-metric-row"><span>Títulos > 60 carac:</span> <strong style="color: ${agentsStatus.agent2.titulosMais60Carac > 0 ? '#FBBF24' : '#34D399'}">${agentsStatus.agent2.titulosMais60Carac}</strong></div>
    </div>

    <div class="agent-box">
      <div class="agent-box-header">
        <span class="agent-name">Agente 3: Magis5 RPA</span>
        <span class="status-pill pill-yes">OK</span>
      </div>
      <div class="agent-metric-row"><span>Salvos com Sucesso:</span> <strong>${agentsStatus.agent3.publicadosSucesso}</strong></div>
      <div class="agent-metric-row"><span>Publicados no lote:</span> <strong>${agentsStatus.agent3.publicadosNoLote}</strong></div>
      <div class="agent-metric-row"><span>Comprovantes salvos:</span> <strong>${agentsStatus.agent3.totalComprovantes} prints</strong></div>
    </div>
  </div>

  <!-- Funil SKU a SKU do Lote Ativo -->
  <div class="funnel-table-box">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
      <h2 style="font-size: 1.1rem; font-weight: 700; display: flex; align-items: center; gap: 8px;">
        <span>🎯</span> Funil de Conversão do Lote Ativo (SKU a SKU)
      </h2>
      <span style="font-size: 0.8rem; color: var(--text-muted);">Mostrando ${funnel.length} produtos agrupados</span>
    </div>

    <table>
      <thead>
        <tr>
          <th>Código Pai</th>
          <th>Título Comercial</th>
          <th>Variações</th>
          <th>Fotos (Ag. 1)</th>
          <th>IA SEO (Ag. 2)</th>
          <th>Magis5 (Ag. 3)</th>
          <th>Situação Atual</th>
          <th>Evidência</th>
        </tr>
      </thead>
      <tbody>
        ${funnel.map(item => `
          <tr>
            <td><strong style="font-family: 'JetBrains Mono', monospace;">${item.parentSku}</strong></td>
            <td style="max-width: 320px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${item.title}">${item.title}</td>
            <td>${item.totalVariations} tam.</td>
            <td>${item.hasPhotos ? `<span class="status-pill pill-yes">✓ ${item.photosCount} fotos</span>` : '<span class="status-pill pill-no">Pendente</span>'}</td>
            <td>${item.isEnriched ? `<span class="status-pill pill-yes">✓ Pronto (${item.enrichedTitleLen}c)</span>` : '<span class="status-pill pill-no">Pendente</span>'}</td>
            <td>${item.isPublished ? '<span class="status-pill pill-yes">✓ Publicado</span>' : (item.hasFailedRPA ? '<span class="status-pill pill-no">Falhou</span>' : '<span class="status-pill pill-wait">Pendente</span>')}</td>
            <td><span class="status-pill" style="background: ${item.stageColor}22; color: ${item.stageColor}; border: 1px solid ${item.stageColor}44;">${item.stageLabel}</span></td>
            <td>
              ${item.rpaProof ? `<a href="${item.rpaProof.url}" target="_blank" style="color: #38BDF8; font-size: 0.75rem; text-decoration: underline;">📸 Ver Print</a>` : '-'}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>

  <!-- Galeria de Evidências Recentes -->
  <div class="funnel-table-box">
    <h2 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 6px; display: flex; align-items: center; gap: 8px;">
      <span>📸</span> Últimas Evidências de Salvamento & Auditoria Magis5
    </h2>
    <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px;">Comprovantes reais capturados pelo robô Playwright durante a execução do Agente 3.</p>

    <div class="evidence-grid">
      ${recentEvidences.map(ev => `
        <a href="${ev.url}" target="_blank" class="evidence-item">
          <img src="${ev.url}" alt="${ev.name}" loading="lazy" />
          <div class="evidence-meta">
            <span class="evidence-badge ${ev.isSuccess ? 'badge-success' : 'badge-error'}">${ev.isSuccess ? '✓ SALVO' : '✕ ERRO'}</span>
            <div style="font-weight: 700; font-family: monospace;">${ev.sku || 'PRODUTO'}</div>
            <div style="color: var(--text-muted); font-size: 0.68rem; margin-top: 2px;">${new Date(ev.time).toLocaleTimeString('pt-BR')}</div>
          </div>
        </a>
      `).join('')}
    </div>
  </div>

</body>
</html>`;
}

// Execução direta via CLI: `node pipeline_reporter.mjs`
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  try {
    generatePipelineReport();
  } catch (err) {
    console.error('❌ Erro ao gerar relatório da esteira:', err);
    process.exit(1);
  }
}

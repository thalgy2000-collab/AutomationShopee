import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../agent2-enricher/node_modules/csv-parse/dist/esm/sync.js';
import { stringify } from '../agent2-enricher/node_modules/csv-stringify/dist/esm/sync.js';
import { classifyErrorAndProposeSolution, resolveCorrectShopeeCategory } from './rules.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const SCREENSHOTS_DIR = path.join(ROOT_DIR, 'agent3-rpa-magis5', 'screenshots');
const PRODUTOS_DIR = path.join(ROOT_DIR, 'agent2-enricher', 'produtos');
const CSV_PATH = path.join(ROOT_DIR, 'agent1-scraper', 'lote_d1fae5.csv');
const OUTPUT_FILE = path.join(__dirname, 'diagnostics_result.json');

/**
 * Realiza a auditoria completa de produtos rejeitados e gera propostas de solução.
 */
export async function runDiagnostics() {
  console.log("🔍 [AGENTE 4] Iniciando Investigação e Auditoria de Produtos Rejeitados...");

  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }

  // 1. Carrega produtos enriquecidos
  const productFiles = fs.existsSync(PRODUTOS_DIR)
    ? fs.readdirSync(PRODUTOS_DIR).filter(f => f.endsWith('.json'))
    : [];
  const productsMap = {};
  for (const pf of productFiles) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(PRODUTOS_DIR, pf), 'utf-8'));
      if (data.sku) productsMap[data.sku] = data;
    } catch (_) {}
  }

  // 2. Carrega planilha CSV
  let csvMap = {};
  let csvRecords = [];
  if (fs.existsSync(CSV_PATH)) {
    try {
      const rawCsv = fs.readFileSync(CSV_PATH, 'utf-8');
      csvRecords = parse(rawCsv, { columns: true, skip_empty_lines: true, trim: true, bom: true });
      csvRecords.forEach(r => { if (r.sku) csvMap[r.sku] = r; });
    } catch (_) {}
  }

  // 3. Mapeia screenshots por SKU e analisa falhas
  const allScreenshots = fs.readdirSync(SCREENSHOTS_DIR)
    .map(f => {
      const stat = fs.statSync(path.join(SCREENSHOTS_DIR, f));
      return {
        filename: f,
        filepath: path.join(SCREENSHOTS_DIR, f),
        url: `/screenshots/${f}`,
        mtime: stat.mtimeMs,
        size: stat.size,
        isError: f.startsWith('erro-'),
        isPublished: f.startsWith('published-'),
        sku: f.replace(/^(erro|published|dryrun)-/, '').replace(/-\d+\.png$/, '')
      };
    })
    .sort((a, b) => b.mtime - a.mtime);

  // Agrupa screenshots pelo SKU mais recente
  const skuScreenshotMap = {};
  allScreenshots.forEach(s => {
    if (!skuScreenshotMap[s.sku]) {
      skuScreenshotMap[s.sku] = s;
    }
  });

  // 4. Mapeamento de histórico de erros conhecidos capturados nos logs
  const knownErrorsMap = {
    "ACTIONBIGGAMECINZA": "Finalize a seleção de categorias de todos os marketplaces antes de salvar. | Categoria 'Esportes e Lazer' não mapeada na Shopee",
    "BIGGAMENYLONCINZA100": "SKU já cadastrado em outro produto. | Shopee: 6/1 imagens de variação",
    "COLGUIAREFLETIVOLAR": "Finalize a seleção de categorias de todos os marketplaces antes de salvar. | 'Animais de Estimação' não corresponde a 'Animais Domésticos'",
    "COLGUIAREFLETIVOVERDEAZ": "Finalize a seleção de categorias de todos os marketplaces antes de salvar. | 'Animais de Estimação' não corresponde a 'Animais Domésticos'",
    "11RACON58CHP": "Shopee: 12/1 imagens de variação (Limite excedido)",
    "7794688569241": "O EAN desse produto é inválido. O limite permitido são de 16 caracteres. (Código Sankhya ausente)",
    "7792959130510": "Shopee: 2/1 imagens de variação (Limite excedido)",
    "7899675812338": "Shopee: 2/1 imagens de variação (Limite excedido)",
    "7899675830165": "Shopee: 2/1 imagens de variação (Limite excedido)",
    "7908456417386": "Shopee: 2/1 imagens de variação (Limite excedido)",
    "7908788613401": "Shopee: 2/1 imagens de variação (Limite excedido)"
  };

  const diagnostics = [];
  const processedSkus = new Set();

  // Analisa todos os SKUs que tiveram erros explícitos
  const candidatesForAudit = new Set([
    ...Object.keys(knownErrorsMap),
    ...allScreenshots.filter(s => s.isError).map(s => s.sku)
  ]);

  for (const sku of candidatesForAudit) {
    if (processedSkus.has(sku)) continue;
    processedSkus.add(sku);

    const product = productsMap[sku] || { sku, titulo_shopee: sku };
    const csvRow = csvMap[sku] || {};
    const latestShot = skuScreenshotMap[sku];
    const rawError = knownErrorsMap[sku] || (latestShot?.isError ? "Falha na validação do formulário da Magis5" : "Rejeição detectada");

    // Aplica o classificador de causas e propostas
    const classification = classifyErrorAndProposeSolution(rawError, product);

    // Verifica se já está publicado atualmente na planilha ou no JSON
    const isCurrentlyPublished = Boolean(product.is_published) || product.status === 'publicado' || product.status === 'concluido' ||
      (csvRow.status === 'publicado' && (csvRow.cor === '#83E28E' || csvRow.cor === '#47D359'));

    diagnostics.push({
      sku,
      titulo: product.titulo_shopee || sku,
      marca: product.marca || "N/A",
      modelo: product.modelo || "N/A",
      preco: product.preco?.preco_sem_promocao || product.preco_sem_promocao || product.preco?.preco_atual || 0,
      cod_sankhya: product.cod_sankhya || csvRow.cod_sankhya || "Não vinculado",
      categoria_atual: product.categoria_sugerida || "Não definida",
      categoria_sugerida_correta: resolveCorrectShopeeCategory(product),
      erro_bruto: rawError,
      status_planilha: csvRow.status || "pendente",
      cor_planilha: csvRow.cor || "#D1FAE5",
      isCurrentlyPublished,
      screenshot: latestShot ? latestShot.url : null,
      screenshotFile: latestShot ? latestShot.filename : null,
      diagnostico: classification.diagnostico,
      proposta: classification.proposta,
      classificacao: {
        codigo: classification.codigo,
        tipo: classification.tipo,
        gravidade: classification.gravidade,
        badgeClass: classification.badgeClass,
        icone: classification.icone,
      },
      dataAuditoria: new Date().toISOString()
    });
  }

  // Ordena primeiro os que ainda não foram publicados e por gravidade
  diagnostics.sort((a, b) => {
    if (a.isCurrentlyPublished === b.isCurrentlyPublished) {
      return a.classificacao.gravidade === 'ALTA' ? -1 : 1;
    }
    return a.isCurrentlyPublished ? 1 : -1;
  });

  const summary = {
    totalAuditados: diagnostics.length,
    pendentesResolucao: diagnostics.filter(d => !d.isCurrentlyPublished).length,
    jaResolvidos: diagnostics.filter(d => d.isCurrentlyPublished).length,
    porTipoErro: {
      categoriaIncompativel: diagnostics.filter(d => d.classificacao.codigo === 'CATEGORIA_INCOMPATIVEL').length,
      skuDuplicado: diagnostics.filter(d => d.classificacao.codigo === 'SKU_DUPLICADO').length,
      limiteFotos: diagnostics.filter(d => d.classificacao.codigo === 'LIMITE_FOTOS_VARIACAO').length,
      eanOuSankhya: diagnostics.filter(d => d.classificacao.codigo === 'EAN_OU_SANKHYA_INVALIDO').length,
      outros: diagnostics.filter(d => d.classificacao.codigo === 'VALIDACAO_FORMULARIO').length,
    },
    timestamp: new Date().toISOString(),
    diagnostics
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(summary, null, 2), 'utf-8');

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  📊 Relatório do Agente 4 (Auditor de Rejeições)`);
  console.log(`  Total Investigados:     ${summary.totalAuditados}`);
  console.log(`  Pendentes de Correção:  ${summary.pendentesResolucao}`);
  console.log(`  Já Resolvidos/Ativos:   ${summary.jaResolvidos}`);
  console.log(`═══════════════════════════════════════════════════════════`);

  return summary;
}

/**
 * Aplica uma solução automática a um produto auditado.
 */
export async function applySolution(sku, fixType) {
  console.log(`⚡ [AGENTE 4] Aplicando solução para SKU ${sku} (Tipo: ${fixType})...`);

  const prodPath = path.join(PRODUTOS_DIR, `${sku}.json`);
  if (!fs.existsSync(prodPath)) {
    throw new Error(`Arquivo do produto ${sku}.json não encontrado.`);
  }

  const product = JSON.parse(fs.readFileSync(prodPath, 'utf-8'));
  let modified = false;

  // 1. Correção de Categoria
  if (fixType === 'UPDATE_CATEGORY' || fixType === 'ALL') {
    const correctCat = resolveCorrectShopeeCategory(product);
    product.categoria_sugerida = correctCat;
    modified = true;
    console.log(`  • Categoria atualizada para: "${correctCat}"`);
  }

  // 2. Resolução de SKU Duplicado
  if (fixType === 'RESOLVE_DUPLICATE_SKU') {
    // Marca na planilha como publicado caso já exista no Magis5
    if (fs.existsSync(CSV_PATH)) {
      const rawCsv = fs.readFileSync(CSV_PATH, 'utf-8');
      const records = parse(rawCsv, { columns: true, skip_empty_lines: true, trim: true, bom: true });
      let count = 0;
      records.forEach(r => {
        if (r.sku === sku || r.sku?.startsWith(sku + "_")) {
          r.status = "publicado";
          r.cor = "#83E28E";
          count++;
        }
      });
      if (count > 0) {
        fs.writeFileSync(CSV_PATH, stringify(records, { header: true }), 'utf-8');
        console.log(`  • SKU ${sku} marcado como "publicado" (#83E28E) por já existir no Magis5.`);
      }
    }
    return { success: true, message: `SKU ${sku} sincronizado como já existente no Magis5.` };
  }

  // 3. Sincronização de Código Sankhya
  if (fixType === 'SYNC_SANKHYA_CODE' || fixType === 'ALL') {
    if (fs.existsSync(CSV_PATH)) {
      const rawCsv = fs.readFileSync(CSV_PATH, 'utf-8');
      const records = parse(rawCsv, { columns: true, skip_empty_lines: true, trim: true, bom: true });
      const row = records.find(r => r.sku === sku);
      if (row && row.cod_sankhya) {
        product.cod_sankhya = row.cod_sankhya;
        modified = true;
        console.log(`  • Código Sankhya vinculado: "${row.cod_sankhya}"`);
      }
    }
  }

  // 4. Sanitização de atributos (números inteiros garantidos)
  if (product.atributos) {
    if (product.atributos.quantidade_por_pacote !== undefined) {
      product.atributos.quantidade_por_pacote = parseInt(String(product.atributos.quantidade_por_pacote).replace(/\D/g, ''), 10) || 1;
      modified = true;
    }
    if (product.atributos.quantidade_da_embalagem !== undefined) {
      product.atributos.quantidade_da_embalagem = parseInt(String(product.atributos.quantidade_da_embalagem).replace(/\D/g, ''), 10) || 1;
      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(prodPath, JSON.stringify(product, null, 2), 'utf-8');
  }

  // Re-executa o diagnóstico para atualizar a base
  await runDiagnostics();

  return {
    success: true,
    message: `Correção aplicada com sucesso ao produto ${sku}.`,
    product
  };
}

/**
 * Corrige em lote todas as categorias incompatíveis diagnosticadas.
 */
export async function applyAllCategoryFixes() {
  console.log('⚡ [AGENTE 4] Aplicando correção em massa para todas as categorias incompatíveis...');
  const diag = await runDiagnostics();
  const eligible = (diag.diagnostics || []).filter(p => !p.isCurrentlyPublished && p.classificacao?.codigo === 'CATEGORIA_INCOMPATIVEL');
  const results = [];
  for (const item of eligible) {
    try {
      const res = await applySolution(item.sku, 'UPDATE_CATEGORY');
      results.push({ sku: item.sku, success: true, newCategory: res.product?.categoria_sugerida });
    } catch (err) {
      results.push({ sku: item.sku, success: false, error: err.message });
    }
  }
  const updatedDiag = await runDiagnostics();
  return {
    totalEligible: eligible.length,
    fixed: results.filter(r => r.success).length,
    results,
    diagnostics: updatedDiag
  };
}

// Executa diretamente se invocado via linha de comando
if (process.argv[1] && process.argv[1].endsWith('diagnose.mjs')) {
  runDiagnostics().catch(console.error);
}

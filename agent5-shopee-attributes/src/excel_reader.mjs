import fs from 'node:fs';
import path from 'node:path';

/**
 * Carrega a biblioteca xlsx de forma resiliente
 */
async function loadXlsx() {
  const attempts = [
    'xlsx',
    '../../agent3-rpa-magis5/node_modules/xlsx/xlsx.js',
    '../agent3-rpa-magis5/node_modules/xlsx/xlsx.js',
    './node_modules/xlsx/xlsx.js'
  ];

  for (const pkg of attempts) {
    try {
      const mod = await import(pkg);
      if (mod && mod.readFile) return mod;
      if (mod && mod.default && mod.default.readFile) return mod.default;
    } catch {}
  }
  throw new Error('Módulo "xlsx" não encontrado. Verifique a instalação.');
}

/**
 * Lê uma planilha (.xlsx, .xls ou .csv) e extrai lista estruturada de itens para o Agente 5.
 * Captura SKU, ID do Item da Shopee (se houver) e Título do Produto.
 * @param {string} filePath - Caminho do arquivo da planilha
 * @returns {Promise<Array<{ sku: string, id: string|null, title: string }>>}
 */
export async function extractProductsFromExcel(filePath, options = {}) {
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Arquivo da planilha não encontrado: ${resolvedPath}`);
  }

  const XLSX = await loadXlsx();
  const workbook = XLSX.readFile(resolvedPath);
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (rows.length === 0) {
    console.warn(`⚠️ A planilha está vazia: ${resolvedPath}`);
    return [];
  }

  const sampleRow = rows[0];
  const keys = Object.keys(sampleRow);

  // Identifica colunas-chave
  const idKey = keys.find(k => /id do item|item.?id|shopee.?id|id_shopee/i.test(k.trim()));
  const skuKey = keys.find(k => /sku principal|c[oó]d\.?\s*refer[eê]ncia|sku/i.test(k.trim()))
    || keys.find(k => /c[oó]digo|cod|refer[eê]ncia/i.test(k.trim()));
  const titleKey = keys.find(k => /produto|t[ií]tulo|nome|an[uú]ncio/i.test(k.trim()));
  const statusKey = keys.find(k => /ficha t[eé]cnica|atributos/i.test(k.trim()));
  const stockKey = keys.find(k => /estoque/i.test(k.trim()));
  const clicksKey = keys.find(k => /cliques/i.test(k.trim()));

  console.log(`📑 [Planilha] Mapeamento de colunas:`);
  console.log(`   ID Shopee: ${idKey ? `"${idKey}"` : 'Não detectado'}`);
  console.log(`   SKU:       ${skuKey ? `"${skuKey}"` : 'Não detectado'}`);
  console.log(`   Título:    ${titleKey ? `"${titleKey}"` : 'Não detectado'}`);
  if (statusKey) console.log(`   Ficha:     "${statusKey}"`);

  const itemsMap = new Map();

  for (const row of rows) {
    const rawId = idKey && row[idKey] ? String(row[idKey]).trim() : null;
    const rawSku = skuKey && row[skuKey] ? String(row[skuKey]).trim().toUpperCase() : null;
    const rawTitle = titleKey && row[titleKey] ? String(row[titleKey]).trim() : '';
    const rawStatus = statusKey && row[statusKey] ? String(row[statusKey]).trim() : '';
    const rawStock = stockKey && row[stockKey] ? String(row[stockKey]).trim() : '';
    const rawClicks = clicksKey && row[clicksKey] ? parseInt(String(row[clicksKey]).replace(/\D/g, ''), 10) || 0 : 0;

    // Se solicitado apenas produtos vazios, filtra
    if (options.onlyEmpty && statusKey) {
      const isActuallyEmpty = rawStatus.includes('VAZIA') || rawStatus.includes('SEM ATRIBUTOS');
      if (!isActuallyEmpty) continue;
    }

    // Precisa ter pelo menos ID ou SKU
    const key = rawId || rawSku;
    if (!key) continue;

    if (!itemsMap.has(key)) {
      itemsMap.set(key, {
        sku: rawSku || rawId,
        id: rawId,
        title: rawTitle,
        status: rawStatus,
        stock: rawStock,
        clicks: rawClicks
      });
    }
  }

  let products = Array.from(itemsMap.values());

  // Ordena por estoque > 0 primeiro e maior número de cliques
  products.sort((a, b) => {
    const aStock = parseInt(String(a.stock || '0').replace(/\D/g, ''), 10) || 0;
    const bStock = parseInt(String(b.stock || '0').replace(/\D/g, ''), 10) || 0;
    if ((aStock > 0) !== (bStock > 0)) {
      return aStock > 0 ? -1 : 1;
    }
    return (b.clicks || 0) - (a.clicks || 0);
  });

  console.log(`✅ [Planilha] ${products.length} produto(s) únicos selecionados.`);
  return products;
}

/**
 * Mantém retrocompatibilidade para extração simples de array de strings de SKU
 */
export async function extractSkusFromExcel(filePath) {
  const products = await extractProductsFromExcel(filePath);
  return products.map(p => p.sku);
}

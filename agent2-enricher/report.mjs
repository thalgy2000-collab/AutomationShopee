/**
 * report.mjs — Gerador de Relatório HTML de Validação
 *
 * Lê os JSONs gerados pelo enricher e as imagens originais do Agente 1
 * para criar um relatório visual interativo em HTML standalone.
 *
 * Uso:
 *   node report.mjs                    # gera relatorio.html
 *   node report.mjs --open             # gera e abre no browser
 */

import { readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "csv-parse/sync";
import { calculateSeoAudit } from "./schemas.mjs";
import { extractParentSku, extractBaseTitle } from "./grouping.mjs";
import { fetchAndCacheShopifyPrices, getProductPrices } from "./shopify_prices.mjs";

import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PRODUTOS_DIR = resolve(__dirname, "./produtos");
const DOWNLOADS_DIR = resolve(__dirname, "../agent1-scraper/downloads");
const DEFAULT_CSV = resolve(__dirname, "../agent1-scraper/lote_d1fae5.csv");
const OUTPUT_HTML = resolve(__dirname, "./relatorio.html");
const SANKHYA_MAP_PATH = resolve(__dirname, "./sankhya_map.json");

/**
 * Carrega o mapa de SKU -> Código Sankhya
 */
async function loadSankhyaMap() {
  if (existsSync(SANKHYA_MAP_PATH)) {
    try {
      const content = await readFile(SANKHYA_MAP_PATH, "utf-8");
      return JSON.parse(content);
    } catch {}
  }
  return {};
}

/**
 * Converte uma imagem para base64 data URI para embedding no HTML.
 */
async function imageToDataUri(filePath) {
  try {
    const buffer = await readFile(filePath);
    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Carrega os dados do CSV para mapear título original por SKU e por Código Pai.
 */
async function loadCsvData(csvPath) {
  if (!existsSync(csvPath)) return {};
  const content = await readFile(csvPath, "utf-8");
  const records = parse(content, { columns: true, skip_empty_lines: true, trim: true, bom: true });
  const map = {};
  for (const r of records) {
    map[r.sku] = r;
    const pSku = extractParentSku(r.sku);
    if (pSku) {
      if (!map[pSku]) {
        map[pSku] = {
          ...r,
          sku: pSku,
          titulo_bruto: extractBaseTitle(r.titulo_bruto),
          status: r.status,
          cor: r.cor,
        };
      }
      if (r.status === "publicado" || r.status === "concluido" || r.cor === "#83E28E" || r.cor === "#47D359") {
        map[pSku].status = "concluido";
        map[pSku].cor = r.cor || "#83E28E";
      }
    }
  }
  return map;
}

/**
 * Carrega todos os JSONs de produtos.
 */
async function loadProducts() {
  if (!existsSync(PRODUTOS_DIR)) return [];

  const files = (await readdir(PRODUTOS_DIR))
    .filter((f) => f.endsWith(".json"))
    .sort();

  const products = [];
  for (const file of files) {
    try {
      const content = await readFile(join(PRODUTOS_DIR, file), "utf-8");
      products.push(JSON.parse(content));
    } catch (err) {
      console.error(`Erro ao ler ${file}: ${err.message}`);
    }
  }
  return products;
}

/**
 * Carrega até 3 imagens de um produto (ou suas variações) como data URIs para embedding.
 */
async function loadProductImages(product, maxImages = 3) {
  const images = [];

  // 1. Tentar carregar de product.imagens
  if (Array.isArray(product.imagens) && product.imagens.length > 0) {
    for (const p of product.imagens.slice(0, maxImages)) {
      if (existsSync(p)) {
        const dataUri = await imageToDataUri(p);
        if (dataUri) images.push(dataUri);
      }
    }
    if (images.length > 0) return images;
  }

  // 2. Tentar carregar de product.variacoes
  if (Array.isArray(product.variacoes) && product.variacoes.length > 0) {
    for (const v of product.variacoes) {
      if (Array.isArray(v.imagens) && v.imagens.length > 0) {
        const p = v.imagens[0];
        if (existsSync(p)) {
          const dataUri = await imageToDataUri(p);
          if (dataUri && !images.includes(dataUri)) images.push(dataUri);
        }
      }
      if (images.length >= maxImages) break;
    }
    if (images.length > 0) return images;
  }

  // 3. Fallback: buscar na pasta downloads/{sku} ou em suas subpastas de variação
  const skuDir = join(DOWNLOADS_DIR, product.sku);
  if (existsSync(skuDir)) {
    const entries = await readdir(skuDir, { withFileTypes: true });
    const directFiles = entries
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".jpg"))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, maxImages);

    for (const file of directFiles) {
      const dataUri = await imageToDataUri(join(skuDir, file.name));
      if (dataUri) images.push(dataUri);
    }

    if (images.length === 0) {
      const subdirs = entries.filter((e) => e.isDirectory());
      for (const sub of subdirs) {
        try {
          const subFiles = (await readdir(join(skuDir, sub.name)))
            .filter((f) => f.toLowerCase().endsWith(".jpg"))
            .sort();
          if (subFiles.length > 0) {
            const dataUri = await imageToDataUri(join(skuDir, sub.name, subFiles[0]));
            if (dataUri && !images.includes(dataUri)) images.push(dataUri);
          }
        } catch {}
        if (images.length >= maxImages) break;
      }
    }
  }

  return images;
}

/**
 * Gera o HTML do relatório.
 */
export async function generateReport(
  produtosDir = PRODUTOS_DIR,
  downloadsDir = DOWNLOADS_DIR,
  csvPath = DEFAULT_CSV
) {
  console.log("Carregando dados e catálogo de preços da Shopify...");

  const products = await loadProducts();
  const csvData = await loadCsvData(csvPath);
  const priceCache = await fetchAndCacheShopifyPrices();
  const sankhyaMap = await loadSankhyaMap();

  if (products.length === 0) {
    console.log("Nenhum produto encontrado em ./produtos/");
    return;
  }

  console.log(`${products.length} produtos encontrados. Gerando relatório...`);

  // Carrega imagens para cada produto (limite de 3 por produto para não explodir o HTML)
  const productCards = [];
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const images = await loadProductImages(p);
    const csvRow = csvData[p.sku] || {};

    let codSankhya = p.cod_sankhya || csvRow.cod_sankhya || sankhyaMap[p.sku] || "";
    if (Array.isArray(p.variacoes)) {
      p.variacoes.forEach((v) => {
        if (!v.cod_sankhya) {
          v.cod_sankhya = (csvData[v.sku] && csvData[v.sku].cod_sankhya) || sankhyaMap[v.sku] || "";
        }
      });
      if (!codSankhya) {
        const vCodes = p.variacoes.map((v) => v.cod_sankhya).filter(Boolean);
        if (vCodes.length > 0) codSankhya = vCodes.join(", ");
      }
    }

    let preco = p.preco;
    if (!preco) {
      const priceInfo = getProductPrices(priceCache, p.sku);
      if (priceInfo) {
        preco = {
          preco_sem_promocao: priceInfo.preco_sem_promocao ?? null,
          preco_com_promocao: priceInfo.preco_com_promocao ?? null,
          preco_atual: priceInfo.preco_atual ?? null,
          em_promocao: Boolean(priceInfo.em_promocao),
          desconto_percentual: priceInfo.desconto_percentual || 0,
        };
      }
    }

    const isPublished = Boolean(p.is_published) || p.status === 'publicado' || p.status === 'concluido' || Boolean(p.shopee_product_id) ||
      csvRow.status === 'publicado' || csvRow.status === 'concluido' || csvRow.cor === '#83E28E' || csvRow.cor === '#47D359' ||
      (Array.isArray(p.variacoes) && p.variacoes.some(v => v.is_published || csvData[v.sku]?.status === 'publicado' || csvData[v.sku]?.status === 'concluido' || csvData[v.sku]?.cor === '#83E28E' || csvData[v.sku]?.cor === '#47D359'));

    productCards.push({
      ...p,
      is_published: isPublished,
      cod_sankhya: codSankhya,
      preco,
      _images: images,
      _tituloOriginal: csvRow.titulo_bruto || "N/A"
    });

    if ((i + 1) % 10 === 0) {
      console.log(`  Processando imagens: ${i + 1}/${products.length}...`);
    }
  }

  const html = buildHtml(productCards);
  await writeFile(OUTPUT_HTML, html, "utf-8");
  console.log(`Relatório salvo em: ${OUTPUT_HTML}`);
  return OUTPUT_HTML;
}

/**
 * Constrói o HTML completo do relatório.
 */
function buildHtml(products) {
  // Garante que cada produto possui auditoria de SEO calculada
  products.forEach((p) => {
    if (typeof p.seo_score !== "number" || !Array.isArray(p.seo_checklist)) {
      const audit = calculateSeoAudit(p);
      p.seo_score = audit.score;
      p.seo_checklist = audit.checklist;
    }
  });

  const totalProducts = products.length;
  const totalPublished = products.filter((p) => p.is_published).length;
  const totalPending = totalProducts - totalPublished;
  const totalPromo = products.filter((p) => p.preco && p.preco.em_promocao).length;
  const avgSeo =
    totalProducts > 0
      ? Math.round(products.reduce((acc, p) => acc + (p.seo_score || 0), 0) / totalProducts)
      : 0;
  const now = new Date().toLocaleString("pt-BR");

  const cardsHtml = products
    .map((p, idx) => buildProductCard(p, idx))
    .join("\n");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Relatório de Validação — Agente 2 | BRK Fishing</title>
  <style>
    :root {
      --bg-primary: #0f1117;
      --bg-card: #1a1d27;
      --bg-card-hover: #1f2233;
      --bg-section: #141620;
      --text-primary: #e8eaed;
      --text-secondary: #9aa0a6;
      --text-muted: #6b7280;
      --accent-blue: #4f8cff;
      --accent-green: #34d399;
      --accent-red: #f87171;
      --accent-amber: #fbbf24;
      --accent-purple: #a78bfa;
      --border: #2d3140;
      --border-light: #3d4250;
      --shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
      --radius: 12px;
      --radius-sm: 8px;
      --transition: all 0.2s ease;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.6;
      min-height: 100vh;
    }

    /* ── Header ───────────────────────────────────────── */
    .header {
      background: linear-gradient(135deg, #1a1d27 0%, #0f1117 100%);
      border-bottom: 1px solid var(--border);
      padding: 2rem 2rem 1.5rem;
      position: sticky;
      top: 0;
      z-index: 100;
      backdrop-filter: blur(16px);
    }

    .header-content {
      max-width: 1400px;
      margin: 0 auto;
    }

    .header h1 {
      font-size: 1.5rem;
      font-weight: 700;
      background: linear-gradient(135deg, var(--accent-blue), var(--accent-purple));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 0.5rem;
    }

    .header-meta {
      font-size: 0.85rem;
      color: var(--text-muted);
    }

    /* ── Stats Bar ────────────────────────────────────── */
    .stats-bar {
      display: flex;
      gap: 1rem;
      margin-top: 1rem;
      flex-wrap: wrap;
    }

    .stat {
      background: var(--bg-section);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 0.6rem 1.2rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.9rem;
    }

    .stat-number {
      font-weight: 700;
      font-size: 1.1rem;
    }

    .stat--total .stat-number { color: var(--accent-blue); }
    .stat--published .stat-number { color: #10b981; }
    .stat--rejected .stat-number { color: var(--accent-red); }
    .stat--pending .stat-number { color: var(--accent-amber); }
    .stat--seo .stat-number { color: var(--accent-green); }
    .stat--promo .stat-number { color: #f87171; }

    /* ── Toolbar ──────────────────────────────────────── */
    .toolbar {
      max-width: 1400px;
      margin: 1.5rem auto;
      padding: 0 2rem;
      display: flex;
      gap: 1rem;
      align-items: center;
      flex-wrap: wrap;
    }

    .search-box {
      flex: 1;
      min-width: 250px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 0.7rem 1rem;
      color: var(--text-primary);
      font-size: 0.9rem;
      outline: none;
      transition: var(--transition);
    }

    .search-box:focus {
      border-color: var(--accent-blue);
      box-shadow: 0 0 0 3px rgba(79, 140, 255, 0.15);
    }

    .filter-btn {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 0.7rem 1.2rem;
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 0.85rem;
      transition: var(--transition);
    }

    .filter-btn:hover, .filter-btn.active {
      background: var(--accent-blue);
      color: white;
      border-color: var(--accent-blue);
    }

    /* ── Product Cards ────────────────────────────────── */
    .cards-container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 0 2rem 3rem;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .product-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
      transition: var(--transition);
      box-shadow: var(--shadow);
    }

    .product-card:hover {
      border-color: var(--border-light);
      background: var(--bg-card-hover);
    }

    .product-card.published { border-left: 4px solid #10b981; }
    .product-card.approved { border-left: 4px solid var(--accent-green); }
    .product-card.rejected { border-left: 4px solid var(--accent-red); }

    /* ── Card Header ──────────────────────────────────── */
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 1.5rem;
      border-bottom: 1px solid var(--border);
      cursor: pointer;
    }

    .card-header:hover { background: rgba(79, 140, 255, 0.05); }

    .card-chevron {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-right: 0.6rem;
      transition: transform 0.2s ease;
      display: inline-block;
      user-select: none;
    }

    .product-card.open .card-chevron {
      transform: rotate(180deg);
      color: var(--accent-blue);
    }

    .card-sku {
      font-family: 'Cascadia Code', 'Fira Code', monospace;
      font-size: 0.9rem;
      color: var(--accent-purple);
      font-weight: 600;
    }

    .card-titulo-preview {
      font-size: 0.85rem;
      color: var(--text-secondary);
      margin-left: 1rem;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .card-actions {
      display: flex;
      gap: 0.5rem;
      flex-shrink: 0;
    }

    .btn-approve, .btn-reject {
      border: none;
      border-radius: var(--radius-sm);
      padding: 0.4rem 0.8rem;
      cursor: pointer;
      font-size: 0.85rem;
      font-weight: 600;
      transition: var(--transition);
    }

    .btn-approve {
      background: rgba(52, 211, 153, 0.15);
      color: var(--accent-green);
    }
    .btn-approve:hover { background: rgba(52, 211, 153, 0.3); }
    .btn-approve.active { background: var(--accent-green); color: #000; }

    .btn-reject {
      background: rgba(248, 113, 113, 0.15);
      color: var(--accent-red);
    }
    .btn-reject:hover { background: rgba(248, 113, 113, 0.3); }
    .btn-reject.active { background: var(--accent-red); color: #000; }

    /* ── Card Body ────────────────────────────────────── */
    .card-body {
      display: none;
      padding: 1.5rem;
    }

    .card-body.open { display: grid; grid-template-columns: 320px 1fr; gap: 1.5rem; }

    /* ── Image Gallery ────────────────────────────────── */
    .gallery {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .gallery-main img {
      width: 100%;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border);
      aspect-ratio: 1;
      object-fit: cover;
    }

    .gallery-thumbs {
      display: flex;
      gap: 0.5rem;
    }

    .gallery-thumbs img {
      width: 60px;
      height: 60px;
      border-radius: 6px;
      border: 2px solid transparent;
      object-fit: cover;
      cursor: pointer;
      transition: var(--transition);
    }

    .gallery-thumbs img:hover,
    .gallery-thumbs img.active {
      border-color: var(--accent-blue);
    }

    /* ── Product Details ──────────────────────────────── */
    .details { display: flex; flex-direction: column; gap: 1rem; }

    .detail-section {
      background: var(--bg-section);
      border-radius: var(--radius-sm);
      padding: 1rem 1.2rem;
      border: 1px solid var(--border);
    }

    .detail-label {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-bottom: 0.4rem;
    }

    .detail-value {
      font-size: 0.95rem;
      color: var(--text-primary);
    }

    .detail-value.title-original {
      color: var(--text-muted);
      font-size: 0.85rem;
      text-decoration: line-through;
      text-decoration-color: rgba(255,255,255,0.2);
    }

    .detail-value.title-seo {
      color: var(--accent-green);
      font-weight: 600;
      font-size: 1rem;
    }

    .detail-value .char-count {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-left: 0.5rem;
    }

    .badge {
      display: inline-block;
      background: rgba(79, 140, 255, 0.15);
      color: var(--accent-blue);
      padding: 0.2rem 0.6rem;
      border-radius: 20px;
      font-size: 0.8rem;
      margin-right: 0.3rem;
      margin-bottom: 0.3rem;
    }

    .badge--published { background: rgba(16, 185, 129, 0.18); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.35); font-weight: 700; }
    .badge--llama { background: rgba(245, 158, 11, 0.22); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.5); font-weight: 700; }
    .badge--blue { background: rgba(79, 140, 255, 0.18); color: #60a5fa; border: 1px solid rgba(96, 165, 250, 0.35); }
    .badge--green { background: rgba(52, 211, 153, 0.15); color: var(--accent-green); }
    .badge--purple { background: rgba(167, 139, 250, 0.15); color: var(--accent-purple); }
    .badge--amber { background: rgba(251, 191, 36, 0.15); color: var(--accent-amber); }
    .badge--red { background: rgba(248, 113, 113, 0.15); color: var(--accent-red); }

    /* ── Alternative Titles (A/B Testing) ────────────── */
    .alt-titles {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin-top: 0.5rem;
    }

    .alt-title-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 0.6rem 0.9rem;
      gap: 0.8rem;
    }

    .alt-title-text {
      font-size: 0.85rem;
      color: var(--text-primary);
      flex: 1;
      font-weight: 500;
    }

    .btn-use-alt {
      background: rgba(79, 140, 255, 0.15);
      color: var(--accent-blue);
      border: 1px solid rgba(79, 140, 255, 0.3);
      border-radius: var(--radius-sm);
      padding: 0.3rem 0.7rem;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      transition: var(--transition);
      white-space: nowrap;
    }

    .btn-use-alt:hover {
      background: var(--accent-blue);
      color: white;
    }

    /* ── Price Badge & Section ────────────────────────── */
    .card-price-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--border);
      padding: 0.2rem 0.6rem;
      border-radius: var(--radius-sm);
      font-size: 0.8rem;
      flex-shrink: 0;
      white-space: nowrap;
    }
    .card-price-badge .price-old {
      text-decoration: line-through;
      color: var(--text-muted);
      font-size: 0.75rem;
    }
    .card-price-badge .price-current {
      color: var(--accent-green);
      font-weight: 700;
    }
    .card-price-badge .price-regular {
      color: var(--text-primary);
      font-weight: 600;
    }
    .badge--promo {
      background: rgba(248, 113, 113, 0.15);
      color: var(--accent-red);
      border: 1px solid rgba(248, 113, 113, 0.3);
      font-weight: 700;
      font-size: 0.72rem;
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
    }
    .price-section-box {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 0.8rem 1rem;
    }
    .price-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 0.8rem;
      margin-top: 0.4rem;
    }
    .price-box {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      background: var(--bg-section);
      padding: 0.6rem 0.8rem;
      border-radius: var(--radius-sm);
      border: 1px solid rgba(255, 255, 255, 0.05);
    }
    .price-box-label {
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
    }
    .price-val {
      font-size: 1rem;
      font-weight: 700;
      color: var(--text-primary);
    }
    .price-val.promo-highlight {
      color: var(--accent-green);
    }

    /* ── SEO Checklist & Score ────────────────────────── */
    .seo-checklist {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 0.6rem;
      margin-top: 0.5rem;
    }

    .seo-check-item {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 0.6rem 0.8rem;
      font-size: 0.8rem;
    }

    .seo-check-item.passed { border-left: 3px solid var(--accent-green); }
    .seo-check-item.failed { border-left: 3px solid var(--accent-amber); }

    .seo-check-icon {
      font-size: 0.9rem;
      line-height: 1;
      margin-top: 0.1rem;
    }

    .seo-check-content {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }

    .seo-check-title {
      font-weight: 600;
      color: var(--text-primary);
    }

    .seo-check-desc {
      color: var(--text-muted);
      font-size: 0.75rem;
    }

    .attrs-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 0.5rem;
    }

    .attr-item {
      display: flex;
      flex-direction: column;
    }

    .attr-key {
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    .attr-val {
      font-size: 0.9rem;
      color: var(--text-primary);
    }

    /* ── Editable Fields ──────────────────────────────── */
    .editable {
      outline: none;
      border-bottom: 1px dashed rgba(79, 140, 255, 0.3);
      padding: 2px 4px;
      border-radius: 4px;
      transition: var(--transition);
      cursor: text;
      min-height: 1.2em;
    }

    .editable:hover {
      background: rgba(79, 140, 255, 0.08);
      border-bottom-color: var(--accent-blue);
    }

    .editable:focus {
      background: rgba(79, 140, 255, 0.12);
      border-bottom: 2px solid var(--accent-blue);
      box-shadow: 0 0 0 2px rgba(79, 140, 255, 0.1);
    }

    .editable.modified {
      border-bottom: 2px solid var(--accent-amber);
      position: relative;
    }

    .editable.modified::after {
      content: '✏️';
      position: absolute;
      top: -8px;
      right: -6px;
      font-size: 0.65rem;
    }

    .edit-hint {
      font-size: 0.65rem;
      color: var(--text-muted);
      font-style: italic;
      margin-left: 0.5rem;
    }

    .editable-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 0.3rem;
      align-items: center;
    }

    .editable-tag {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
    }

    .editable-tag .remove-tag {
      cursor: pointer;
      font-size: 0.7rem;
      opacity: 0.5;
      transition: var(--transition);
    }

    .editable-tag .remove-tag:hover {
      opacity: 1;
      color: var(--accent-red);
    }

    .add-tag-btn {
      background: rgba(79, 140, 255, 0.15);
      color: var(--accent-blue);
      border: 1px dashed rgba(79, 140, 255, 0.4);
      border-radius: 20px;
      padding: 0.15rem 0.6rem;
      font-size: 0.8rem;
      cursor: pointer;
      transition: var(--transition);
    }

    .add-tag-btn:hover {
      background: rgba(79, 140, 255, 0.3);
    }

    .btn-save-card {
      background: rgba(79, 140, 255, 0.15);
      color: var(--accent-blue);
      border: 1px solid rgba(79, 140, 255, 0.3);
      border-radius: var(--radius-sm);
      padding: 0.4rem 0.8rem;
      cursor: pointer;
      font-size: 0.85rem;
      font-weight: 600;
      transition: var(--transition);
      display: none;
    }

    .btn-save-card:hover {
      background: var(--accent-blue);
      color: white;
    }

    .btn-save-card.visible { display: inline-flex; }

    .btn-save-card.saved {
      background: rgba(52, 211, 153, 0.2);
      color: var(--accent-green);
      border-color: var(--accent-green);
    }

    .btn-download-card {
      background: rgba(52, 211, 153, 0.12);
      color: var(--accent-green);
      border: 1px solid rgba(52, 211, 153, 0.3);
      border-radius: var(--radius-sm);
      padding: 0.4rem 0.8rem;
      cursor: pointer;
      font-size: 0.85rem;
      font-weight: 600;
      transition: var(--transition);
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
    }

    .btn-download-card:hover {
      background: var(--accent-green);
      color: #0f1117;
    }

    .btn-export-all {
      background: linear-gradient(135deg, var(--accent-blue), var(--accent-purple));
      color: white;
      border: none;
      border-radius: var(--radius-sm);
      padding: 0.7rem 1.3rem;
      cursor: pointer;
      font-size: 0.85rem;
      font-weight: 700;
      transition: var(--transition);
      letter-spacing: 0.02em;
    }

    .btn-export-batch {
      background: linear-gradient(135deg, #059669, #10b981);
      color: white;
      border: none;
      border-radius: var(--radius-sm);
      padding: 0.7rem 1.3rem;
      cursor: pointer;
      font-size: 0.85rem;
      font-weight: 700;
      transition: var(--transition);
      letter-spacing: 0.02em;
    }

    .btn-export-all:hover, .btn-export-batch:hover {
      opacity: 0.9;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }

    .btn-export-all:hover {
      opacity: 0.9;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(79, 140, 255, 0.3);
    }

    /* ── Status Toggle Button ──────────────────────────── */
    .btn-status-toggle {
      border-radius: var(--radius-sm);
      padding: 0.45rem 0.9rem;
      cursor: pointer;
      font-size: 0.85rem;
      font-weight: 700;
      transition: var(--transition);
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      border: 1px solid transparent;
      user-select: none;
    }

    .btn-status-toggle.is-published {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border-color: #10b981;
    }

    .btn-status-toggle.is-published:hover {
      background: rgba(239, 68, 68, 0.18);
      color: #f87171;
      border-color: #ef4444;
    }

    .btn-status-toggle.is-published:hover::after {
      content: ' ➔ Mudar p/ Pendente';
      font-size: 0.72rem;
      font-weight: 500;
      opacity: 0.9;
    }

    .btn-status-toggle.is-pending {
      background: rgba(251, 191, 36, 0.15);
      color: #fbbf24;
      border-color: #f59e0b;
    }

    .btn-status-toggle.is-pending:hover {
      background: rgba(16, 185, 129, 0.2);
      color: #34d399;
      border-color: #10b981;
    }

    .btn-status-toggle.is-pending:hover::after {
      content: ' ➔ Mudar p/ Publicado';
      font-size: 0.72rem;
      font-weight: 500;
      opacity: 0.9;
    }

    .char-counter {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 0.3rem;
    }

    .char-counter.over-limit { color: var(--accent-red); font-weight: 600; }

    /* ── Responsive ───────────────────────────────────── */
    @media (max-width: 768px) {
      .card-body.open {
        grid-template-columns: 1fr;
      }
      .toolbar { padding: 0 1rem; }
      .cards-container { padding: 0 1rem 2rem; }
      .header { padding: 1.5rem 1rem 1rem; }
    }

    /* ── Animations ───────────────────────────────────── */
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .product-card { animation: fadeIn 0.3s ease forwards; }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-content">
      <h1>🎣 Relatório de Validação — Agente 2</h1>
      <div class="header-meta">BRK Fishing × Shopee | Gerado em ${now} | ${totalProducts} produtos</div>
      <div class="stats-bar">
        <div class="stat stat--total">
          <span>📦 Total:</span>
          <span class="stat-number" id="stat-total">${totalProducts}</span>
        </div>
        <div class="stat stat--published">
          <span>🚀 Publicados:</span>
          <span class="stat-number" id="stat-published">${totalPublished}</span>
        </div>
        <div class="stat stat--pending">
          <span>⏳ À Publicar:</span>
          <span class="stat-number" id="stat-pending">${totalPending}</span>
        </div>
        <div class="stat stat--seo">
          <span>🎯 Média SEO:</span>
          <span class="stat-number" id="stat-avg-seo">${avgSeo}/100</span>
        </div>
        <div class="stat stat--promo">
          <span>🔥 Promoções:</span>
          <span class="stat-number" id="stat-promo">${totalPromo}</span>
        </div>
      </div>
    </div>
  </div>

  <div class="toolbar">
    <input type="text" class="search-box" id="searchBox"
           placeholder="🔍 Buscar por SKU, Sankhya, título, marca...">
    <button class="filter-btn active" data-filter="all" onclick="setFilter('all')">Todos (${totalProducts})</button>
    <button class="filter-btn" data-filter="published" onclick="setFilter('published')">🚀 Publicados (${totalPublished})</button>
    <button class="filter-btn" data-filter="pending" onclick="setFilter('pending')">⏳ À Publicar (${totalPending})</button>
    <button class="filter-btn" data-filter="promo" onclick="setFilter('promo')">🔥 Promoções (${totalPromo})</button>
    <button class="filter-btn" data-filter="edited" onclick="setFilter('edited')">✏️ Editados</button>
    <button class="filter-btn" data-filter="expand" onclick="toggleAll()">Expandir Todos</button>
    <button class="btn-export-all" onclick="exportAllJsons()" title="Baixa cada JSON individualmente">💾 Baixar Todos (.json)</button>
    <button class="btn-export-batch" onclick="exportBatchJson()" title="Baixa um único arquivo consolidado com todos os produtos">📦 Baixar Lote (JSON Único)</button>
  </div>

  <div class="cards-container" id="cardsContainer">
    ${cardsHtml}
  </div>

  <script>
    // Estado persistido no localStorage
    const STATE_KEY = 'agente2_validation_state';

    function loadState() {
      try {
        return JSON.parse(localStorage.getItem(STATE_KEY) || '{}');
      } catch { return {}; }
    }

    function saveState(state) {
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
    }

    // Inicializa estado
    const state = loadState();
    document.querySelectorAll('.product-card').forEach(card => {
      const sku = card.dataset.sku;
      if (state[sku] === 'approved') {
        card.classList.add('approved');
      } else if (state[sku] === 'rejected') {
        card.classList.add('rejected');
        const rejBtn = card.querySelector('.btn-reject');
        if (rejBtn) rejBtn.classList.add('active');
      }
    });

    // Toggle card body
    function toggleCard(idx) {
      const body = document.getElementById('body-' + idx);
      if (!body) return;
      const card = body.closest('.product-card');
      body.classList.toggle('open');
      if (card) card.classList.toggle('open');
    }

    // ── Edits tracking ──────────────────────────────────
    const EDITS_KEY = 'agente2_edits';
    const edits = loadEdits();

    function loadEdits() {
      try { return JSON.parse(localStorage.getItem(EDITS_KEY) || '{}'); }
      catch { return {}; }
    }

    function saveEdits() {
      localStorage.setItem(EDITS_KEY, JSON.stringify(edits));
    }

    // Called when any editable field changes
    function onFieldEdit(sku, field, element) {
      if (!edits[sku]) edits[sku] = {};
      const card = document.querySelector('[data-sku="' + sku + '"]');

      if (field === 'palavras_chave') {
        if (card) {
          const kwEls = card.querySelectorAll('[data-keyword]');
          edits[sku]['palavras_chave'] = Array.from(kwEls).map(el => el.innerText.trim()).filter(Boolean);
        }
      } else {
        const val = element.innerText.trim();
        edits[sku][field] = val;
        element.classList.add('modified');
      }
      saveEdits();

      // Show save button
      if (card) {
        card.classList.add('edited');
        const saveBtn = card.querySelector('.btn-save-card');
        if (saveBtn) { saveBtn.classList.add('visible'); saveBtn.classList.remove('saved'); saveBtn.textContent = '💾 Salvar'; }
      }

      // Update char counter for title
      if (field === 'titulo_shopee') {
        const val = element.innerText.trim();
        const counter = document.getElementById('charcount-' + sku);
        if (counter) {
          const len = val.length;
          counter.textContent = len + '/120 chars';
          counter.classList.toggle('over-limit', len > 120);
        }
        // Update header preview
        if (card) {
          const preview = card.querySelector('.card-titulo-preview');
          if (preview) preview.textContent = val;
        }
      }
    }

    // Called when promotional or regular price is edited
    function onPriceEdit(sku, field, element) {
      if (!edits[sku]) edits[sku] = {};
      const card = document.querySelector('[data-sku="' + sku + '"]');
      const val = element.innerText.trim();
      edits[sku][field] = val;
      element.classList.add('modified');
      saveEdits();

      if (card) {
        card.classList.add('edited');
        const saveBtn = card.querySelector('.btn-save-card');
        if (saveBtn) { saveBtn.classList.add('visible'); saveBtn.classList.remove('saved'); saveBtn.textContent = '💾 Salvar'; }

        const semPromoEl = card.querySelector('[data-field="preco_sem_promocao"]');
        const comPromoEl = card.querySelector('[data-field="preco_com_promocao"]');
        const parsePrice = (el) => {
          if (!el) return null;
          const num = parseFloat(el.innerText.replace(/[^\d.,]/g, '').replace(',', '.'));
          return isNaN(num) ? null : num;
        };
        const semPromo = parsePrice(semPromoEl);
        const comPromo = parsePrice(comPromoEl);
        const isPromo = semPromo !== null && comPromo !== null && semPromo > comPromo;
        const discount = isPromo ? Math.round(((semPromo - comPromo) / semPromo) * 100) : 0;

        card.dataset.promo = isPromo ? 'true' : 'false';

        const statusEl = document.getElementById('promo-status-' + sku);
        if (statusEl) {
          statusEl.innerHTML = isPromo
            ? '<span class="badge badge--promo" style="font-size:0.75rem; margin:0;">🔥 Em Promoção</span>'
            : '<span class="badge badge--green" style="font-size:0.75rem; margin:0;">Preço Regular</span>';
        }
        const discEl = document.getElementById('promo-discount-' + sku);
        if (discEl) {
          discEl.style.color = isPromo ? 'var(--accent-red)' : 'var(--text-muted)';
          discEl.textContent = isPromo ? discount + '% OFF (R$ ' + (semPromo - comPromo).toFixed(2).replace('.', ',') + ')' : 'Nenhum';
        }

        const headerBadge = card.querySelector('.card-price-badge');
        if (headerBadge && semPromo !== null) {
          if (isPromo && comPromo !== null) {
            headerBadge.innerHTML = '<span class="price-old">R$ ' + semPromo.toFixed(2).replace('.', ',') + '</span> <span class="price-current">R$ ' + comPromo.toFixed(2).replace('.', ',') + '</span> <span class="badge badge--promo">-' + discount + '%</span>';
          } else {
            headerBadge.innerHTML = '<span class="price-regular">R$ ' + semPromo.toFixed(2).replace('.', ',') + '</span>';
          }
        }
      }
    }

    // Restore saved edits on load
    function restoreEdits() {
      for (const [sku, fields] of Object.entries(edits)) {
        const card = document.querySelector('[data-sku="' + sku + '"]');
        if (!card) continue;
        card.classList.add('edited');

        for (const [field, val] of Object.entries(fields)) {
          if (field.startsWith('attr_')) {
            const attrKey = field.substring(5);
            const el = card.querySelector('[data-attr-key="' + attrKey + '"]');
            if (el) {
              el.innerText = val;
              el.classList.add('modified');
            }
          } else if (field === 'palavras_chave' && Array.isArray(val)) {
            const skuSafe = sku.replace(/[^a-zA-Z0-9]/g, '_');
            const container = card.querySelector('.kw-container-' + skuSafe);
            if (container) {
              const addBtn = container.querySelector('.add-tag-btn');
              container.querySelectorAll('.editable-tag').forEach(t => t.remove());
              val.forEach(k => {
                const span = document.createElement('span');
                span.className = 'editable-tag';
                const badge = document.createElement('span');
                badge.className = 'badge badge--green modified';
                badge.setAttribute('data-keyword', '');
                badge.contentEditable = 'true';
                badge.textContent = k;
                badge.oninput = () => onFieldEdit(sku, 'palavras_chave', badge);
                const rm = document.createElement('span');
                rm.className = 'remove-tag';
                rm.textContent = '✕';
                rm.onclick = () => { span.remove(); onFieldEdit(sku, 'palavras_chave', null); };
                span.appendChild(badge);
                span.appendChild(rm);
                container.insertBefore(span, addBtn);
              });
            }
          } else {
            const el = card.querySelector('[data-field="' + field + '"]');
            if (el) {
              el.innerText = val;
              el.classList.add('modified');
            }
            if (field === 'titulo_shopee') {
              const preview = card.querySelector('.card-titulo-preview');
              if (preview) preview.textContent = val;
              const counter = document.getElementById('charcount-' + sku);
              if (counter) {
                counter.textContent = val.length + '/120 chars';
                counter.classList.toggle('over-limit', val.length > 120);
              }
            }
          }
        }
        const saveBtn = card.querySelector('.btn-save-card');
        if (saveBtn) { saveBtn.classList.add('visible'); saveBtn.textContent = '✅ Salvo'; saveBtn.classList.add('saved'); }
      }
    }
    restoreEdits();

    // Save card edits confirmation
    function saveCard(sku, event) {
      event.stopPropagation();
      const btn = event.target;
      btn.textContent = '✅ Salvo';
      btn.classList.add('saved');
      saveEdits();
    }

    // Helper: download blob
    function downloadBlob(content, filename) {
      const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    // Export single JSON
    function getCardData(sku) {
      const card = document.querySelector('[data-sku="' + sku + '"]');
      if (!card) return null;

      const get = (f) => {
        const el = card.querySelector('[data-field="' + f + '"]');
        return el ? el.innerText.trim() : '';
      };

      // Collect attributes
      const attrEls = card.querySelectorAll('[data-attr-key]');
      const atributos = {};
      attrEls.forEach(el => {
        const key = el.dataset.attrKey;
        atributos[key] = el.innerText.trim();
      });

      // Collect keywords
      const kwEls = card.querySelectorAll('[data-keyword]');
      const palavras_chave = [];
      kwEls.forEach(el => palavras_chave.push(el.innerText.trim()));

      // Collect preco
      const precoRaw = JSON.parse(card.dataset.preco || '{}');
      const semPromoEl = card.querySelector('[data-field="preco_sem_promocao"]');
      const comPromoEl = card.querySelector('[data-field="preco_com_promocao"]');
      const parsePrice = (el, fallback) => {
        if (!el) return fallback;
        const num = parseFloat(el.innerText.replace(/[^\d.,]/g, '').replace(',', '.'));
        return isNaN(num) ? fallback : num;
      };

      const preco_sem_promocao = parsePrice(semPromoEl, precoRaw.preco_sem_promocao ?? null);
      const preco_com_promocao = parsePrice(comPromoEl, precoRaw.preco_com_promocao ?? null);
      const em_promocao = preco_sem_promocao !== null && preco_com_promocao !== null && preco_sem_promocao > preco_com_promocao;
      const desconto_percentual = em_promocao ? Math.round(((preco_sem_promocao - preco_com_promocao) / preco_sem_promocao) * 100) : 0;

      const preco = {
        preco_sem_promocao,
        preco_com_promocao: em_promocao ? preco_com_promocao : null,
        preco_atual: em_promocao ? preco_com_promocao : preco_sem_promocao,
        em_promocao,
        desconto_percentual
      };

      return {
        sku,
        cod_sankhya: card.dataset.codSankhya || '',
        titulo_shopee: get('titulo_shopee'),
        marca: get('marca'),
        modelo: get('modelo'),
        categoria_sugerida: get('categoria_sugerida'),
        preco,
        descricao: get('descricao'),
        atributos,
        variacoes: JSON.parse(card.dataset.variacoes || '[]'),
        titulos_alternativos: JSON.parse(card.dataset.titulosAlternativos || '[]'),
        seo_score: parseInt(card.dataset.seoScore || '0', 10),
        seo_checklist: JSON.parse(card.dataset.seoChecklist || '[]'),
        medidas: JSON.parse(card.dataset.medidas || '{"altura_cm":3,"largura_cm":20,"comprimento_cm":30,"peso_kg":0.25}'),
        palavras_chave,
        imagens: JSON.parse(card.dataset.imagens || '[]')
      };
    }

    // Use alternative title for A/B testing
    function useAltTitle(sku, btn) {
      const item = btn.closest('.alt-title-item');
      const textEl = item ? item.querySelector('.alt-title-text') : null;
      if (!textEl) return;
      const newTitle = textEl.innerText.trim();

      const card = document.querySelector('[data-sku="' + sku + '"]');
      if (!card) return;

      const titleField = card.querySelector('[data-field="titulo_shopee"]');
      if (titleField) {
        titleField.innerText = newTitle;
        onFieldEdit(sku, 'titulo_shopee', titleField);
      }

      btn.textContent = '✅ Aplicado!';
      btn.style.background = 'rgba(52, 211, 153, 0.25)';
      btn.style.borderColor = 'var(--accent-green)';
      btn.style.color = 'var(--accent-green)';
      setTimeout(() => {
        btn.textContent = 'Usar Este';
        btn.style.background = '';
        btn.style.borderColor = '';
        btn.style.color = '';
      }, 2000);
    }

    // Download single JSON for a specific card
    function exportSingleJson(sku, event) {
      if (event) event.stopPropagation();
      const data = getCardData(sku);
      if (!data) return;
      downloadBlob(JSON.stringify(data, null, 2), sku + '.json');
    }

    // Export all JSONs as individual downloads
    function exportAllJsons() {
      const cards = document.querySelectorAll('.product-card');
      let count = 0;
      cards.forEach(card => {
        const sku = card.dataset.sku;
        const data = getCardData(sku);
        if (data) {
          downloadBlob(JSON.stringify(data, null, 2), sku + '.json');
          count++;
        }
      });
      alert('✅ ' + count + ' arquivos JSON exportados! Mova os arquivos baixados para a pasta agent2-enricher/produtos/ para substituir os originais.');
    }

    // Export batch JSON (all products consolidated)
    function exportBatchJson() {
      const cards = document.querySelectorAll('.product-card');
      const all = [];
      cards.forEach(card => {
        const sku = card.dataset.sku;
        const data = getCardData(sku);
        if (data) all.push(data);
      });
      downloadBlob(JSON.stringify(all, null, 2), 'produtos_consolidados.json');
      alert('✅ Arquivo "produtos_consolidados.json" com ' + all.length + ' produtos exportado com sucesso!');
    }

    // Add keyword
    function addKeyword(sku) {
      const val = prompt('Digite a nova palavra-chave:');
      if (!val || !val.trim()) return;
      const card = document.querySelector('[data-sku="' + sku + '"]');
      const container = card.querySelector('.kw-container-' + sku.replace(/[^a-zA-Z0-9]/g, '_'));
      if (!container) return;

      const span = document.createElement('span');
      span.className = 'editable-tag';
      const badge = document.createElement('span');
      badge.className = 'badge badge--green modified';
      badge.setAttribute('data-keyword', '');
      badge.contentEditable = 'true';
      badge.textContent = val.trim();
      badge.oninput = () => onFieldEdit(sku, 'palavras_chave', badge);
      const rm = document.createElement('span');
      rm.className = 'remove-tag';
      rm.textContent = '✕';
      rm.onclick = () => { span.remove(); onFieldEdit(sku, 'palavras_chave', null); };
      span.appendChild(badge);
      span.appendChild(rm);

      const addBtn = container.querySelector('.add-tag-btn');
      container.insertBefore(span, addBtn);
      onFieldEdit(sku, 'palavras_chave', badge);
    }

    // Remove keyword
    function removeKw(el, sku) {
      el.parentElement.remove();
      onFieldEdit(sku, 'palavras_chave', null);
    }

    // Approve/Reject
    function approve(sku, event) {
      event.stopPropagation();
      const card = document.querySelector('[data-sku="' + sku + '"]');
      const wasApproved = card.classList.contains('approved');

      card.classList.remove('approved', 'rejected');
      card.querySelector('.btn-approve').classList.remove('active');
      card.querySelector('.btn-reject').classList.remove('active');

      if (!wasApproved) {
        card.classList.add('approved');
        card.querySelector('.btn-approve').classList.add('active');
        state[sku] = 'approved';
      } else {
        delete state[sku];
      }

      saveState(state);
      updateStats();
    }

    function reject(sku, event) {
      event.stopPropagation();
      const card = document.querySelector('[data-sku="' + sku + '"]');
      if (!card) return;
      const wasRejected = card.classList.contains('rejected');

      card.classList.remove('approved', 'rejected');
      const appBtn = card.querySelector('.btn-approve');
      if (appBtn) appBtn.classList.remove('active');
      const rejBtn = card.querySelector('.btn-reject');
      if (rejBtn) rejBtn.classList.remove('active');

      if (!wasRejected) {
        card.classList.add('rejected');
        if (rejBtn) rejBtn.classList.add('active');
        state[sku] = 'rejected';
      } else {
        delete state[sku];
      }

      saveState(state);
      updateStats();
    }

    // ── Status Manual (Publicado / À Publicar) ───────────
    const STATUS_KEY = 'agente2_status_overrides';

    function loadStatusOverrides() {
      try { return JSON.parse(localStorage.getItem(STATUS_KEY) || '{}'); }
      catch { return {}; }
    }

    function saveStatusOverrides(overrides) {
      localStorage.setItem(STATUS_KEY, JSON.stringify(overrides));
    }

    function restoreStatusOverrides() {
      const overrides = loadStatusOverrides();
      for (const [sku, st] of Object.entries(overrides)) {
        const card = document.querySelector('[data-sku="' + sku + '"]');
        if (!card) continue;
        if (card.dataset.published === 'true') continue;
        const isPub = st === 'publicado';
        const skuSafe = sku.replace(/[^a-zA-Z0-9]/g, '_');
        card.dataset.published = isPub ? 'true' : 'false';
        card.classList.toggle('published', isPub);

        const btn = document.getElementById('status-btn-' + skuSafe);
        if (btn) {
          btn.classList.toggle('is-published', isPub);
          btn.classList.toggle('is-pending', !isPub);
          const txt = btn.querySelector('.status-text');
          if (txt) txt.textContent = isPub ? '🚀 Publicado' : '⏳ À Publicar';
          else btn.textContent = isPub ? '🚀 Publicado' : '⏳ À Publicar';
        }

        const badge = document.getElementById('status-badge-' + skuSafe);
        if (badge) {
          badge.style.display = isPub ? '' : 'none';
        }
      }
    }

    async function toggleStatus(sku, event) {
      if (event) event.stopPropagation();
      const card = document.querySelector('[data-sku="' + sku + '"]');
      if (!card) return;

      const skuSafe = sku.replace(/[^a-zA-Z0-9]/g, '_');
      const currentIsPub = card.dataset.published === 'true';
      const nextIsPub = !currentIsPub;
      const nextStatus = nextIsPub ? 'publicado' : 'pendente';

      // 1. Atualiza visual do card imediatamente
      card.dataset.published = nextIsPub ? 'true' : 'false';
      card.classList.toggle('published', nextIsPub);

      // 2. Atualiza botão de status
      const btn = document.getElementById('status-btn-' + skuSafe);
      if (btn) {
        btn.classList.toggle('is-published', nextIsPub);
        btn.classList.toggle('is-pending', !nextIsPub);
        const txt = btn.querySelector('.status-text');
        if (txt) txt.textContent = nextIsPub ? '🚀 Publicado' : '⏳ À Publicar';
        else btn.textContent = nextIsPub ? '🚀 Publicado' : '⏳ À Publicar';
      }

      // 3. Atualiza badge no título
      const badge = document.getElementById('status-badge-' + skuSafe);
      if (badge) {
        badge.style.display = nextIsPub ? '' : 'none';
      }

      // 4. Persiste no localStorage
      const overrides = loadStatusOverrides();
      overrides[sku] = nextStatus;
      saveStatusOverrides(overrides);

      // 5. Envia para o servidor local (atualiza lote_d1fae5.csv e produtos/{sku}.json)
      try {
        fetch('/api/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sku, status: nextStatus })
        }).then(res => res.json()).then(data => {
          if (data && data.success) {
            console.log('✅ Status sincronizado no CSV e JSON para ' + sku + ': ' + nextStatus);
          }
        }).catch(err => {
          console.warn('Aviso: servidor local offline ou sem rota /api/status', err);
        });
      } catch (e) {}

      // 6. Atualiza contadores e reaplica filtros
      updateStats();
      applyFilterAndSearch();
    }

    // Stats update
    function updateStats() {
      const cards = document.querySelectorAll('.product-card');
      let published = 0, pending = 0, rejected = 0;
      cards.forEach(c => {
        if (c.dataset.published === 'true') published++;
        else pending++;
        if (c.classList.contains('rejected')) rejected++;
      });
      const pubEl = document.getElementById('stat-published');
      if (pubEl) pubEl.textContent = published;
      const pendEl = document.getElementById('stat-pending');
      if (pendEl) pendEl.textContent = pending;
      const rejEl = document.getElementById('stat-rejected');
      if (rejEl) rejEl.textContent = rejected;

      // Atualiza textos das abas
      const totalBtn = document.querySelector('.filter-btn[data-filter="all"]');
      if (totalBtn) totalBtn.textContent = 'Todos (' + cards.length + ')';
      const pubBtn = document.querySelector('.filter-btn[data-filter="published"]');
      if (pubBtn) pubBtn.textContent = '🚀 Publicados (' + published + ')';
      const pendBtn = document.querySelector('.filter-btn[data-filter="pending"]');
      if (pendBtn) pendBtn.textContent = '⏳ À Publicar (' + pending + ')';
    }

    // Filter & Search unificados
    let currentFilter = 'all';

    function applyFilterAndSearch() {
      const q = (document.getElementById('searchBox')?.value || '').toLowerCase().trim();
      document.querySelectorAll('.product-card').forEach(card => {
        const isPub = card.dataset.published === 'true';
        const isRej = card.classList.contains('rejected');
        const isEdited = card.classList.contains('edited');
        const isPromo = card.dataset.promo === 'true';

        // 1. Validar aba/filtro ativo
        let matchesFilter = true;
        if (currentFilter === 'published') {
          matchesFilter = isPub;
        } else if (currentFilter === 'pending') {
          matchesFilter = !isPub;
        } else if (currentFilter === 'rejected') {
          matchesFilter = isRej;
        } else if (currentFilter === 'edited') {
          matchesFilter = isEdited;
        } else if (currentFilter === 'promo') {
          matchesFilter = isPromo;
        }

        // 2. Validar termo de busca (SKU, Sankhya, Título, etc.)
        let matchesSearch = true;
        if (q) {
          const sku = (card.dataset.sku || '').toLowerCase();
          const sankhya = (card.dataset.codSankhya || '').toLowerCase();
          const text = card.textContent.toLowerCase();
          matchesSearch = sku.includes(q) || sankhya.includes(q) || text.includes(q);
        }

        card.style.display = (matchesFilter && matchesSearch) ? '' : 'none';
      });
    }

    // Evento da busca
    const searchInput = document.getElementById('searchBox');
    if (searchInput) {
      searchInput.addEventListener('input', applyFilterAndSearch);
    }

    // Inicialização de status e filtros
    restoreStatusOverrides();
    updateStats();
    applyFilterAndSearch();

    // Evento dos botões de filtro
    function setFilter(filter) {
      currentFilter = filter;
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      const activeBtn = document.querySelector('[data-filter="' + filter + '"]');
      if (activeBtn) activeBtn.classList.add('active');
      applyFilterAndSearch();
    }

    // Toggle All
    let allExpanded = false;
    function toggleAll() {
      allExpanded = !allExpanded;
      document.querySelectorAll('.card-body').forEach(b => {
        const card = b.closest('.product-card');
        if (allExpanded) {
          b.classList.add('open');
          if (card) card.classList.add('open');
        } else {
          b.classList.remove('open');
          if (card) card.classList.remove('open');
        }
      });
      const btn = document.querySelector('[data-filter="expand"]');
      if (btn) btn.textContent = allExpanded ? 'Recolher Todos' : 'Expandir Todos';
    }

    // Gallery thumbnail click
    function selectThumb(cardIdx, imgIdx) {
      const mainImg = document.getElementById('main-img-' + cardIdx);
      const thumb = document.getElementById('thumb-' + cardIdx + '-' + imgIdx);
      if (mainImg && thumb) {
        mainImg.src = thumb.src;
        document.querySelectorAll('#thumbs-' + cardIdx + ' img').forEach(t => t.classList.remove('active'));
        thumb.classList.add('active');
      }
    }
  </script>
</body>
</html>`;
}

/**
 * Constrói o HTML de um card de produto.
 */
function buildProductCard(product, idx) {
  const sku = escHtml(product.sku || "???");
  const skuSafe = sku.replace(/[^a-zA-Z0-9]/g, '_');
  const isPublished = Boolean(product.is_published);
  const codSankhya = escHtml(product.cod_sankhya || "");
  const tituloShopee = escHtml(product.titulo_shopee || "N/A");
  const tituloOriginal = escHtml(product._tituloOriginal || "N/A");
  const marca = escHtml(product.marca || "N/A");
  const modelo = escHtml(product.modelo || "N/A");
  const categoria = escHtml(product.categoria_sugerida || "N/A");
  const descricao = escHtml(product.descricao || "N/A");
  const charCount = (product.titulo_shopee || "").length;

  // Preços Shopify
  const preco = product.preco || null;
  const precoSemPromo = preco && preco.preco_sem_promocao !== null ? Number(preco.preco_sem_promocao) : null;
  const precoComPromo = preco && preco.preco_com_promocao !== null ? Number(preco.preco_com_promocao) : null;
  const emPromocao = Boolean(preco && preco.em_promocao);
  const descontoPercentual = preco && typeof preco.desconto_percentual === "number" && preco.desconto_percentual > 0
    ? preco.desconto_percentual
    : (precoSemPromo && precoComPromo && precoSemPromo > precoComPromo
        ? Math.round(((precoSemPromo - precoComPromo) / precoSemPromo) * 100)
        : 0);

  const fmtMoeda = (v) => (v !== null && v !== undefined && !isNaN(v) ? `R$ ${Number(v).toFixed(2).replace('.', ',')}` : 'N/A');

  let priceHeaderBadge = '';
  if (precoSemPromo !== null) {
    if (emPromocao && precoComPromo !== null) {
      priceHeaderBadge = `<div class="card-price-badge" title="Preço Shopify: De ${fmtMoeda(precoSemPromo)} por ${fmtMoeda(precoComPromo)}"><span class="price-old">${fmtMoeda(precoSemPromo)}</span><span class="price-current">${fmtMoeda(precoComPromo)}</span><span class="badge badge--promo">-${descontoPercentual}%</span></div>`;
    } else {
      priceHeaderBadge = `<div class="card-price-badge" title="Preço Regular Shopify"><span class="price-regular">${fmtMoeda(precoSemPromo)}</span></div>`;
    }
  }

  // Imagens
  const images = product._images || [];
  const mainImage = images[0] || "";
  const thumbsHtml = images
    .map(
      (img, i) =>
        `<img id="thumb-${idx}-${i}" src="${img}" alt="Imagem ${i + 1}"
              class="${i === 0 ? "active" : ""}"
              onclick="selectThumb(${idx}, ${i})">`
    )
    .join("");

  // Atributos — editáveis com rótulos da Ficha Técnica Shopee
  const ATTR_LABELS = {
    pais_de_origem: "País de Origem",
    peso_do_produto: "Peso do Produto",
    duracao_da_garantia: "Duração da Garantia",
    material: "Material",
    estampa: "Estampa",
    condicao: "Condição",
    comprimento: "Comprimento",
    dimensoes_do_produto: "Dimensões do Produto (sem embalagem)",
    quantidade_da_embalagem: "Qtd. da Embalagem",
    tamanho_do_pacote: "Tamanho do Pacote",
    produto_personalizado: "Produto Personalizado",
    quantidade_por_pacote: "Qtd. por Pacote",
    tipo_isca: "Tipo de Isca / Ação",
    flutuabilidade: "Flutuabilidade",
  };

  const formatAttrKey = (k) => ATTR_LABELS[k] || k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const atributos = product.atributos || {};
  const attrsHtml = Object.entries(atributos)
    .map(
      ([k, v]) => `<div class="attr-item">
        <span class="attr-key">${escHtml(formatAttrKey(k))}</span>
        <span class="attr-val editable" contenteditable="true" data-attr-key="${escHtml(k)}"
              oninput="onFieldEdit('${sku}', 'attr_${escHtml(k)}', this)">${escHtml(String(v))}</span>
      </div>`
    )
    .join("");

  // Variações — dados armazenados como JSON para export
  const variacoes = product.variacoes || [];
  const isParentGroup = variacoes.length > 0;
  const variacoesJson = JSON.stringify(variacoes).replace(/"/g, '&quot;');
  const varHtml = isParentGroup
    ? variacoes.map((v) => {
        const nome = v.nome || (v.valor ? `${v.tipo ? v.tipo + ': ' : ''}${v.valor}` : (typeof v === 'string' ? v : ''));
        const skuTag = v.sku ? `<span style="font-size:0.75rem; opacity:0.8; margin-left:4px;">(${escHtml(v.sku)})</span>` : '';
        const vSankhya = v.cod_sankhya ? escHtml(String(v.cod_sankhya)) : '';
        const sankhyaTag = vSankhya ? `<span style="font-size:0.72rem; color:#93c5fd; font-weight:600; margin-left:5px; background:rgba(79,140,255,0.2); padding:1px 6px; border-radius:4px;" title="Cód. Sankhya: ${vSankhya}">🏷️ ${vSankhya}</span>` : '';
        const vHasPromo = v.em_promocao && v.preco_com_promocao;
        const vPriceNum = v.preco_com_promocao ?? v.preco_sem_promocao;
        const vPriceTag = vPriceNum !== null && vPriceNum !== undefined
          ? `<span style="font-size:0.75rem; color:${vHasPromo ? 'var(--accent-green)' : 'var(--text-secondary)'}; font-weight:600; margin-left:5px;">${fmtMoeda(vPriceNum)}</span>`
          : '';
        return `<span class="badge badge--purple">${escHtml(nome)}${skuTag}${sankhyaTag}${vPriceTag}</span>`;
      }).join(" ")
    : '<span style="color: var(--text-muted); font-size: 0.85rem;">Sem variações (Produto Simples)</span>';

  // Palavras-chave — editáveis e removíveis
  const keywords = product.palavras_chave || [];
  const kwHtml = keywords.map((k) =>
    `<span class="editable-tag"><span class="badge badge--green" data-keyword contenteditable="true"
      oninput="onFieldEdit('${sku}', 'palavras_chave', this)">${escHtml(k)}</span><span class="remove-tag" onclick="removeKw(this, '${sku}')">✕</span></span>`
  ).join("");

  // Medidas
  const medidas = product.medidas || {};
  const medidasHtml = `${medidas.altura_cm || 0}×${medidas.largura_cm || 0}×${medidas.comprimento_cm || 0} cm | ${medidas.peso_kg || 0} kg`;
  const medidasJson = JSON.stringify(medidas).replace(/"/g, '&quot;');

  // Imagens JSON para export
  const imagensJson = JSON.stringify(product.imagens || []).replace(/"/g, '&quot;');

  // SEO Score e Auditoria
  const seoScore = typeof product.seo_score === "number" ? product.seo_score : 85;
  const seoChecklist = Array.isArray(product.seo_checklist) ? product.seo_checklist : [];
  const seoBadgeClass = seoScore >= 85 ? "badge--green" : (seoScore >= 70 ? "badge--amber" : "badge--red");

  const checklistHtml = seoChecklist.map((c) => `
    <div class="seo-check-item ${c.passed ? "passed" : "failed"}">
      <span class="seo-check-icon">${c.passed ? "✅" : "⚠️"}</span>
      <div class="seo-check-content">
        <span class="seo-check-title">${escHtml(c.item)} (${c.score}/${c.maxScore} pts)</span>
        <span class="seo-check-desc">${escHtml(c.reason)}</span>
      </div>
    </div>
  `).join("");

  // Títulos alternativos (A/B testing)
  const titulosAlternativos = Array.isArray(product.titulos_alternativos) ? product.titulos_alternativos : [];
  const altTitlesHtml = titulosAlternativos.map((t) => `
    <div class="alt-title-item">
      <span class="alt-title-text">${escHtml(t)}</span>
      <button class="btn-use-alt" onclick="useAltTitle('${sku}', this)">Usar Este</button>
    </div>
  `).join("");

  return `
    <div class="product-card ${isPublished ? 'published' : ''}" data-sku="${sku}" data-published="${isPublished ? 'true' : 'false'}" data-cod-sankhya="${codSankhya}" data-promo="${emPromocao ? 'true' : 'false'}" data-preco="${JSON.stringify(preco || {}).replace(/"/g, '&quot;')}" data-variacoes="${variacoesJson}" data-medidas="${medidasJson}" data-imagens="${imagensJson}" data-titulos-alternativos="${JSON.stringify(titulosAlternativos).replace(/"/g, '&quot;')}" data-seo-score="${seoScore}" data-seo-checklist="${JSON.stringify(seoChecklist).replace(/"/g, '&quot;')}" style="animation-delay: ${idx * 0.05}s">
      <div class="card-header" onclick="toggleCard(${idx})">
        <div style="display: flex; align-items: center; min-width: 0; flex: 1; margin-right: 1rem; gap: 0.5rem;">
          <span class="card-chevron" id="chevron-${idx}">▼</span>
          <span class="card-sku">${sku}</span>
          <span class="badge badge--published" id="status-badge-${skuSafe}" style="${isPublished ? '' : 'display:none;'} margin:0; font-size:0.75rem; flex-shrink:0;" title="${product.shopee_product_id ? `Anúncio ativo na Shopee (ID: ${product.shopee_product_id})` : 'Anúncio publicado na Magis5 (Cor #83E28E)'}">🚀 ${product.shopee_product_id ? `Ativo na Shopee` : 'Publicado'}</span>
          ${product.ia_etiqueta ? `<span class="badge badge--llama" style="margin:0; font-size:0.75rem; flex-shrink:0;" title="Gerado via Groq LLaMA para comparação">${escHtml(product.ia_etiqueta)}</span>` : ""}
          ${codSankhya ? `<span class="badge badge--blue" style="margin:0; font-size:0.75rem; flex-shrink:0; font-weight:600;" title="Código Sankhya (ERP)">🏷️ Sankhya: ${codSankhya}</span>` : ""}
          ${isParentGroup ? `<span class="badge badge--purple" style="margin:0; font-size:0.75rem; flex-shrink:0;">🎨 ${variacoes.length} Variações</span>` : ""}
          <span class="badge ${seoBadgeClass}" style="margin:0; font-size:0.75rem; flex-shrink:0;">🎯 ${seoScore}/100</span>
          ${priceHeaderBadge}
          <span class="card-titulo-preview">${tituloShopee}</span>
        </div>
        <div class="card-actions" onclick="event.stopPropagation()">
          <button class="btn-save-card" onclick="saveCard('${sku}', event)" title="Confirmar alterações">💾 Salvar</button>
          <button class="btn-download-card" onclick="exportSingleJson('${sku}', event)" title="Baixar JSON deste produto corrigido">📥 Baixar JSON</button>
          <button class="btn-status-toggle ${isPublished ? 'is-published' : 'is-pending'}" id="status-btn-${skuSafe}" onclick="toggleStatus('${sku}', event)" title="Clique para alternar status entre Publicado e À Publicar">
            <span class="status-text">${isPublished ? '🚀 Publicado' : '⏳ À Publicar'}</span>
          </button>
          <button class="btn-reject" onclick="reject('${sku}', event)">❌ Rejeitar</button>
        </div>
      </div>
      <div class="card-body" id="body-${idx}">
        ${images.length > 0 ? `
        <div class="gallery">
          <div class="gallery-main">
            <img id="main-img-${idx}" src="${mainImage}" alt="${sku}">
          </div>
          ${images.length > 1 ? `<div class="gallery-thumbs" id="thumbs-${idx}">${thumbsHtml}</div>` : ""}
        </div>` : `<div class="gallery" style="display:flex;align-items:center;justify-content:center;color:var(--text-muted);">Sem imagens</div>`}

        <div class="details">
          <div class="detail-section">
            <div class="detail-label">Título Original (Fornecedor)</div>
            <div class="detail-value title-original">${tituloOriginal}</div>
          </div>

          <div class="detail-section">
            <div class="detail-label">Título SEO (Shopee) <span class="edit-hint">clique para editar</span></div>
            <div class="detail-value title-seo editable" contenteditable="true" data-field="titulo_shopee"
                 oninput="onFieldEdit('${sku}', 'titulo_shopee', this)">${tituloShopee}</div>
            <div class="char-counter" id="charcount-${sku}">${charCount}/120 chars</div>
          </div>

          ${titulosAlternativos.length > 0 ? `
          <div class="detail-section">
            <div class="detail-label">🎯 Títulos Alternativos (Testes A/B) <span class="edit-hint">clique em "Usar Este" para testar no anúncio</span></div>
            <div class="alt-titles">
              ${altTitlesHtml}
            </div>
          </div>` : ''}

          <div class="detail-section price-section-box">
            <div class="detail-label" style="display:flex; justify-content:space-between; align-items:center;">
              <span>💰 Preços Shopify (Normal &amp; Promocional)</span>
              <span class="edit-hint">campos editáveis</span>
            </div>
            <div class="price-grid">
              <div class="price-box">
                <span class="price-box-label">Preço Sem Promoção (De)</span>
                <div class="detail-value editable price-val" contenteditable="true" data-field="preco_sem_promocao"
                     oninput="onPriceEdit('${sku}', 'preco_sem_promocao', this)">
                  ${fmtMoeda(precoSemPromo)}
                </div>
              </div>
              <div class="price-box">
                <span class="price-box-label">Preço Com Promoção (Por)</span>
                <div class="detail-value editable price-val ${emPromocao ? 'promo-highlight' : ''}" contenteditable="true" data-field="preco_com_promocao"
                     oninput="onPriceEdit('${sku}', 'preco_com_promocao', this)">
                  ${precoComPromo !== null ? fmtMoeda(precoComPromo) : 'Sem promoção'}
                </div>
              </div>
              <div class="price-box">
                <span class="price-box-label">Status Promocional</span>
                <div class="detail-value" id="promo-status-${sku}">
                  ${emPromocao 
                    ? `<span class="badge badge--promo" style="font-size:0.75rem; margin:0;">🔥 Em Promoção</span>` 
                    : `<span class="badge badge--green" style="font-size:0.75rem; margin:0;">Preço Regular</span>`}
                </div>
              </div>
              <div class="price-box">
                <span class="price-box-label">Desconto</span>
                <div class="detail-value" id="promo-discount-${sku}" style="font-weight: 700; color: ${emPromocao ? 'var(--accent-red)' : 'var(--text-muted)'};">
                  ${emPromocao ? `${descontoPercentual}% OFF (${fmtMoeda(precoSemPromo - precoComPromo)})` : 'Nenhum'}
                </div>
              </div>
            </div>
          </div>

          <div class="detail-section" style="display:grid; grid-template-columns: auto 1fr 1fr 1.5fr; gap: 0.75rem; align-items: start;">
            <div>
              <div class="detail-label">Cód. Sankhya (ERP)</div>
              <div class="detail-value" style="display:flex; align-items:center; min-height:36px;">
                <span class="badge badge--blue" style="font-size:0.85rem; font-weight:700; margin:0; padding:4px 10px;">🏷️ ${codSankhya || 'N/A'}</span>
              </div>
            </div>
            <div>
              <div class="detail-label">Marca <span class="edit-hint">editável</span></div>
              <div class="detail-value editable" contenteditable="true" data-field="marca"
                   oninput="onFieldEdit('${sku}', 'marca', this)">${marca}</div>
            </div>
            <div>
              <div class="detail-label">Modelo <span class="edit-hint">editável</span></div>
              <div class="detail-value editable" contenteditable="true" data-field="modelo"
                   oninput="onFieldEdit('${sku}', 'modelo', this)">${modelo}</div>
            </div>
            <div>
              <div class="detail-label">Categoria <span class="edit-hint">editável</span></div>
              <div class="detail-value editable" contenteditable="true" data-field="categoria_sugerida"
                   style="font-size:0.85rem"
                   oninput="onFieldEdit('${sku}', 'categoria_sugerida', this)">${categoria}</div>
            </div>
          </div>

          <div class="detail-section">
            <div class="detail-label">Descrição <span class="edit-hint">clique para editar</span></div>
            <div class="detail-value editable" contenteditable="true" data-field="descricao"
                 style="font-size:0.85rem; line-height:1.6; white-space: pre-wrap;"
                 oninput="onFieldEdit('${sku}', 'descricao', this)">${descricao}</div>
          </div>

          <div class="detail-section">
            <div class="detail-label">Atributos <span class="edit-hint">editáveis</span></div>
            <div class="attrs-grid">${attrsHtml || '<span style="color: var(--text-muted)">Nenhum</span>'}</div>
          </div>

          <div class="detail-section">
            <div class="detail-label" style="display:flex; justify-content:space-between; align-items:center;">
              <span>🏆 Checklist de Qualidade SEO</span>
              <span class="badge ${seoBadgeClass}" style="margin:0; font-size:0.8rem;">Score: ${seoScore}/100</span>
            </div>
            <div class="seo-checklist">
              ${checklistHtml}
            </div>
          </div>

          <div class="detail-section">
            <div class="detail-label">Variações ${isParentGroup ? `(${variacoes.length} opções com sufixos)` : ""}</div>
            <div style="display:flex; flex-wrap:wrap; gap:0.4rem;">${varHtml}</div>
          </div>

          <div class="detail-section" style="display:grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
            <div>
              <div class="detail-label">Palavras-chave <span class="edit-hint">editáveis</span></div>
              <div class="editable-tags kw-container-${skuSafe}">
                ${kwHtml || '<span style="color: var(--text-muted)">Nenhuma</span>'}
                <button class="add-tag-btn" onclick="addKeyword('${sku}')">+ Adicionar</button>
              </div>
            </div>
            <div>
              <div class="detail-label">Medidas (Embalagem)</div>
              <div class="detail-value"><span class="badge badge--amber">${medidasHtml}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

/**
 * Escapa HTML para prevenir XSS.
 */
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI: executa diretamente se chamado como script
// ─────────────────────────────────────────────────────────────────────────────

const isMainModule = process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.url.replace("file:///", "").replace("file://", ""));

// Sempre executa quando rodado diretamente
if (process.argv[1] && (process.argv[1].endsWith("report.mjs") || process.argv[1].endsWith("report"))) {
  generateReport().then(() => {
    if (process.argv.includes("--open")) {
      import("node:child_process").then(({ exec }) => {
        exec(`start ${OUTPUT_HTML}`);
      });
    }
  });
}

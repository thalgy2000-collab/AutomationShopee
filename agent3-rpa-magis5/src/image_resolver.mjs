import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join, basename, dirname } from "node:path";
import { DOWNLOADS_DIR } from "./config.mjs";

const KNOWN_SUBDIRS = [
  "",
  "Planilha",
  "Revenda",
  join("Revenda", "Full"),
  "São Bento",
  "SaoBento"
];

/**
 * Normaliza e localiza um arquivo de imagem física no disco de maneira resiliente.
 * Suporta caminhos salvos antigos, divergências de subpastas e barras Windows/Unix.
 *
 * @param {string} declaredPath - Caminho declarado no JSON
 * @param {string} [parentSku] - SKU pai opcional para fallback
 * @returns {string|null} Caminho absoluto se existir ou null
 */
export function resolveLocalImage(declaredPath, parentSku = null) {
  if (!declaredPath) return null;
  if (existsSync(declaredPath)) return resolve(declaredPath);

  const clean = declaredPath.replace(/\\/g, "/");
  const fileName = basename(clean);
  const folderName = basename(dirname(clean));

  // 1. Tenta correspondência com folderName/fileName em todas as subpastas conhecidas
  for (const sub of KNOWN_SUBDIRS) {
    const cand = join(DOWNLOADS_DIR, sub, folderName, fileName);
    if (existsSync(cand)) return resolve(cand);
  }

  // 2. Tenta com parentSku/fileName
  if (parentSku) {
    for (const sub of KNOWN_SUBDIRS) {
      const cand = join(DOWNLOADS_DIR, sub, parentSku, fileName);
      if (existsSync(cand)) return resolve(cand);
    }
  }

  // 3. Tenta extrair a parte após downloads/ caso não tenha subpasta
  const dMatch = clean.match(/downloads\/(.+)$/i);
  if (dMatch) {
    const relPart = dMatch[1];
    for (const sub of KNOWN_SUBDIRS) {
      const cand = join(DOWNLOADS_DIR, sub, relPart);
      if (existsSync(cand)) return resolve(cand);
    }
  }

  return null;
}

/**
 * Coleta todos os caminhos válidos de imagens locais para o produto e suas variações.
 *
 * @param {object} product - Objeto de produto do Agente 2
 * @returns {string[]} Lista de caminhos absolutos válidos
 */
export function resolveAllProductImages(product) {
  const images = new Set();
  const sku = product.sku;

  // 1. Imagens declaradas na raiz
  if (Array.isArray(product.imagens)) {
    for (const p of product.imagens) {
      const found = resolveLocalImage(p, sku);
      if (found) images.add(found);
    }
  }

  // 2. Imagens declaradas nas variações
  if (Array.isArray(product.variacoes)) {
    for (const v of product.variacoes) {
      if (Array.isArray(v.imagens)) {
        for (const p of v.imagens) {
          const found = resolveLocalImage(p, sku);
          if (found) images.add(found);
        }
      }
    }
  }

  // 3. Varredura direta em pastas vinculadas aos SKUs
  if (images.size === 0) {
    const targetSkus = [sku, ...(product.variacoes || []).map(v => v.sku)].filter(Boolean);
    for (const s of targetSkus) {
      for (const sub of KNOWN_SUBDIRS) {
        const targetDir = join(DOWNLOADS_DIR, sub, s);
        if (existsSync(targetDir)) {
          try {
            if (statSync(targetDir).isDirectory()) {
              const files = readdirSync(targetDir).filter(f => /\.(jpe?g|png|webp)$/i.test(f));
              for (const f of files) {
                images.add(resolve(join(targetDir, f)));
              }
            }
          } catch {}
        }
      }
    }
  }

  return Array.from(images);
}

/**
 * Resolve a imagem oficial de uma variação (priorizando 01.jpg da própria variação).
 *
 * @param {object} product
 * @param {object} variant
 * @param {string[]} [productImages]
 * @returns {string|null}
 */
export function resolveVariantImage(product, variant, productImages = []) {
  // 1. Primeira foto das imagens da variação
  if (Array.isArray(variant?.imagens) && variant.imagens.length > 0) {
    for (const p of variant.imagens) {
      const found = resolveLocalImage(p, product.sku);
      if (found) return found;
    }
  }

  // 2. Se a variação tem pasta própria no disco, busca a 01.jpg
  if (variant?.sku) {
    for (const sub of KNOWN_SUBDIRS) {
      const targetDir = join(DOWNLOADS_DIR, sub, variant.sku);
      if (existsSync(targetDir)) {
        try {
          const files = readdirSync(targetDir).filter(f => /\.(jpe?g|png|webp)$/i.test(f));
          if (files.length > 0) {
            const first = files.find(f => f.startsWith("01")) || files[0];
            return resolve(join(targetDir, first));
          }
        } catch {}
      }
    }
  }

  // 3. Fallback: primeira foto das imagens do produto geral
  if (productImages && productImages.length > 0) {
    return productImages[0];
  }

  return null;
}

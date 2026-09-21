/**
 * shopify_fetcher.mjs — Busca e Download sob demanda nos 3 sites oficiais da BRK
 * - BRK Fishing (https://brkfishing.com.br)
 * - BRK Agro (https://www.brkagro.com.br)
 * - BRK Motors (https://www.brkmotors.com.br)
 */

import { writeFile, mkdir } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

export const SHOPIFY_DOMAINS = [
  { name: "BRK Fishing", url: "https://brkfishing.com.br" },
  { name: "BRK Agro", url: "https://www.brkagro.com.br" },
  { name: "BRK Motors", url: "https://www.brkmotors.com.br" },
];

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Busca produto por SKU ou termo nos 3 sites da BRK
 */
export async function fetchProductFromAnyStore(sku) {
  const cleanSku = String(sku).trim();
  const searchSku = cleanSku.includes("_") ? cleanSku.split("_")[0] : cleanSku;

  for (const store of SHOPIFY_DOMAINS) {
    try {
      const suggestUrl = `${store.url}/search/suggest.json?q=${encodeURIComponent(searchSku)}&resources[type]=product`;
      const res = await fetch(suggestUrl, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(6000),
      });

      if (!res.ok) continue;

      const data = await res.json();
      const products = data?.resources?.results?.products || [];
      if (products.length === 0) continue;

      // Encontrou o produto na loja atual! Busca detalhes completos via handle
      const handle = products[0].handle;
      const productRes = await fetch(`${store.url}/products/${handle}.js`, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(6000),
      });

      if (!productRes.ok) continue;

      const product = await productRes.json();
      if (product) {
        product._sourceName = store.name;
        product._sourceDomain = store.url;
        return product;
      }
    } catch (err) {
      // Continua para o próximo site se der erro ou timeout
    }
  }

  return null;
}

/**
 * Baixa as imagens de um produto da Shopify para um diretório local em alta resolução
 */
export async function downloadProductImages(product, destDir, maxImages = 6) {
  await mkdir(destDir, { recursive: true });

  // Se a pasta já tiver imagens baixadas, reaproveita
  if (existsSync(destDir)) {
    const existing = readdirSync(destDir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
    if (existing.length > 0) {
      return existing.map((f) => join(destDir, f));
    }
  }

  const images = (product.images || []).slice(0, maxImages);
  const downloadedPaths = [];

  for (let i = 0; i < images.length; i++) {
    let rawUrl = images[i];
    let fullUrl = rawUrl.startsWith("//") ? `https:${rawUrl}` : rawUrl;
    // Remove redimensionamento da Shopify para pegar a imagem original máxima
    fullUrl = fullUrl.replace(/(_\d+x\d+|\.compact|\.medium|\.large|\.grande)\./g, ".");

    try {
      const res = await fetch(fullUrl, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;

      const buffer = Buffer.from(await res.arrayBuffer());
      const fileName = `foto_${String(i + 1).padStart(2, "0")}.jpg`;
      const filePath = join(destDir, fileName);
      await writeFile(filePath, buffer);
      downloadedPaths.push(filePath);
    } catch (err) {
      console.error(`Erro ao baixar imagem ${i + 1} de ${product.title}:`, err.message);
    }
  }

  return downloadedPaths;
}

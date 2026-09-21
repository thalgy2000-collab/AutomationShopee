/**
 * shopify_prices.mjs — Busca e Mapeia Preços (Normal e Promocional) da Shopify BRK Fishing
 *
 * Mapeia:
 * - preco_original (Preço sem promoção / Preço cheio)
 * - preco_promocional (Preço com promoção / Preço atual com desconto)
 * - em_promocao (boolean)
 */

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { extractParentSku } from "./grouping.mjs";

const CACHE_FILE = resolve("./shopify_prices.json");
const SOURCES = [
  { name: "BRK Fishing", baseUrl: "https://brkfishing.com.br/products.json" },
  { name: "BRK Agro", baseUrl: "https://www.brkagro.com.br/products.json" },
  { name: "BRK Motors", baseUrl: "https://www.brkmotors.com.br/products.json" },
];
const PAGE_SIZE = 250;

/**
 * Baixa todos os produtos da Shopify (BRK Fishing, BRK Agro e BRK Motors) e constrói o mapa de preços por SKU e Código Pai.
 */
export async function fetchAndCacheShopifyPrices(forceRefresh = false) {
  if (!forceRefresh && existsSync(CACHE_FILE)) {
    try {
      const data = JSON.parse(await readFile(CACHE_FILE, "utf-8"));
      return data;
    } catch {
      // Se der erro ao ler cache, baixa novamente
    }
  }

  console.log("Baixando catálogo de preços da Shopify (BRK Fishing e BRK Agro)...");
  const skuPrices = {};
  const parentPrices = {};

  for (const source of SOURCES) {
    let page = 1;
    console.log(`Buscando catálogo de ${source.name}...`);
    while (true) {
      const url = `${source.baseUrl}?limit=${PAGE_SIZE}&page=${page}`;
      let data;
      try {
        const res = await fetch(url);
        if (!res.ok) break;
        data = await res.json();
      } catch (err) {
        console.error(`Erro ao buscar página ${page} de ${source.name}:`, err.message);
        break;
      }

      if (!data.products || data.products.length === 0) break;

      for (const p of data.products) {
        for (const v of p.variants) {
          if (!v.sku) continue;
          const cleanSku = v.sku.trim().toUpperCase();
          const price = parseFloat(v.price) || 0;
          const compareAt = v.compare_at_price ? parseFloat(v.compare_at_price) : 0;

          const hasPromo = compareAt > price && compareAt > 0;
          const priceInfo = {
            sku: cleanSku,
            titulo_shopify: p.title,
            fonte: source.name,
            preco_sem_promocao: hasPromo ? compareAt : price,
            preco_com_promocao: hasPromo ? price : null,
            preco_atual: price,
            em_promocao: hasPromo,
            desconto_percentual: hasPromo ? Math.round(((compareAt - price) / compareAt) * 100) : 0,
          };

          skuPrices[cleanSku] = priceInfo;

          // Mapeia também para o Código Pai
          const pSku = extractParentSku(cleanSku);
          if (pSku) {
            if (!parentPrices[pSku]) {
              parentPrices[pSku] = {
                parent_sku: pSku,
                variantes: [],
                min_preco: price,
                max_preco: price,
                em_promocao: hasPromo,
                preco_sem_promocao: hasPromo ? compareAt : price,
                preco_com_promocao: hasPromo ? price : null,
                preco_atual: price,
                desconto_percentual: hasPromo ? Math.round(((compareAt - price) / compareAt) * 100) : 0,
              };
            }
            const pGroup = parentPrices[pSku];
            pGroup.variantes.push(priceInfo);
            if (price < pGroup.min_preco) pGroup.min_preco = price;
            if (price > pGroup.max_preco) pGroup.max_preco = price;
            if (hasPromo) {
              pGroup.em_promocao = true;
              pGroup.preco_sem_promocao = compareAt;
              pGroup.preco_com_promocao = price;
              pGroup.preco_atual = price;
              pGroup.desconto_percentual = Math.round(((compareAt - price) / compareAt) * 100);
            } else if (!pGroup.desconto_percentual) {
              pGroup.desconto_percentual = 0;
            }
          }
        }
      }

      if (data.products.length < PAGE_SIZE) break;
      page++;
    }
  }

  const result = {
    atualizado_em: new Date().toISOString(),
    por_sku: skuPrices,
    por_pai: parentPrices,
  };

  await writeFile(CACHE_FILE, JSON.stringify(result, null, 2), "utf-8");
  console.log(`✅ ${Object.keys(skuPrices).length} variantes e ${Object.keys(parentPrices).length} produtos pai mapeados com preços!`);
  return result;
}

/**
 * Obtém preços para um SKU específico ou Produto Pai.
 */
export function getProductPrices(priceCache, sku) {
  if (!priceCache) return null;
  const clean = (sku || "").trim().toUpperCase();

  // 1. Tenta match exato de SKU
  if (priceCache.por_sku && priceCache.por_sku[clean]) {
    return priceCache.por_sku[clean];
  }

  // 2. Tenta match por Código Pai
  if (priceCache.por_pai && priceCache.por_pai[clean]) {
    return priceCache.por_pai[clean];
  }

  // 3. Tenta extrair pai
  const pSku = extractParentSku(clean);
  if (pSku && priceCache.por_pai && priceCache.por_pai[pSku]) {
    return priceCache.por_pai[pSku];
  }

  // 4. Preço padrão conforme regra de negócio (FUSION: 219.90 | C0: 169.90)
  if (/^FUSION/i.test(clean)) {
    return {
      preco_sem_promocao: 219.90,
      preco_com_promocao: null,
      preco_atual: 219.90,
      em_promocao: false,
      desconto_percentual: 0,
    };
  }

  if (/^C0/i.test(clean) || /camisa|camiseta|baby\s*look|vestu[aá]rio/i.test(clean)) {
    return {
      preco_sem_promocao: 169.90,
      preco_com_promocao: null,
      preco_atual: 169.90,
      em_promocao: false,
      desconto_percentual: 0,
    };
  }

  return null;
}


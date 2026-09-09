/**
 * update_existing_prices.mjs
 * Atualiza todos os arquivos JSON existentes em ./produtos/ adicionando o objeto preco e os precos nas variacoes.
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fetchAndCacheShopifyPrices, getProductPrices } from "./shopify_prices.mjs";

async function main() {
  const PRODUTOS_DIR = resolve("./produtos");
  const priceCache = await fetchAndCacheShopifyPrices();
  const files = (await readdir(PRODUTOS_DIR)).filter((f) => f.endsWith(".json"));

  console.log(`Atualizando preços em ${files.length} arquivos JSON...`);
  let updatedCount = 0;
  let promoCount = 0;

  for (const file of files) {
    const filePath = join(PRODUTOS_DIR, file);
    try {
      const data = JSON.parse(await readFile(filePath, "utf-8"));
      const parentSku = data.parent_sku || data.sku;
      const parentPrice = getProductPrices(priceCache, parentSku);

      if (parentPrice) {
        data.preco = {
          preco_sem_promocao: parentPrice.preco_sem_promocao ?? null,
          preco_com_promocao: parentPrice.preco_com_promocao ?? null,
          preco_atual: parentPrice.preco_atual ?? null,
          em_promocao: Boolean(parentPrice.em_promocao),
          desconto_percentual: parentPrice.desconto_percentual || 0,
        };
        if (data.preco.em_promocao) promoCount++;
      } else {
        data.preco = data.preco || null;
      }

      // Atualiza variações se existirem
      if (Array.isArray(data.variacoes)) {
        for (const v of data.variacoes) {
          const vPrice = getProductPrices(priceCache, v.sku);
          v.preco_sem_promocao = vPrice?.preco_sem_promocao ?? parentPrice?.preco_sem_promocao ?? null;
          v.preco_com_promocao = vPrice?.preco_com_promocao ?? parentPrice?.preco_com_promocao ?? null;
          v.preco_atual = vPrice?.preco_atual ?? parentPrice?.preco_atual ?? null;
          v.em_promocao = Boolean(vPrice?.em_promocao ?? parentPrice?.em_promocao);
          v.desconto_percentual = vPrice?.desconto_percentual ?? parentPrice?.desconto_percentual ?? 0;
        }
      }

      await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
      updatedCount++;
    } catch (err) {
      console.error(`Erro ao atualizar ${file}:`, err.message);
    }
  }

  console.log(`✅ ${updatedCount} arquivos JSON atualizados com preços! (${promoCount} com promoção ativa)`);
}

main().catch(console.error);

import { SankhyaClient, getCatalogVariations } from "./sankhya_client.mjs";
import { generateSpreadsheet } from "./generator.mjs";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    skus: [],
    collection: null,   // Keyword para buscar coleção inteira (ex: "ARMORX", "SÃO BENTO")
    filterFull: "all",  // "all" = traz tudo, "full" = só FULL, "standard" = só sem FULL
    file: null,
    output: null,
    headless: false,
    onlyLogin: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--skus" || arg === "--sku") {
      const raw = args[++i] || "";
      options.skus = raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    } else if (arg === "--collection" || arg === "--keyword") {
      options.collection = args[++i];
    } else if (arg === "--filter-full") {
      const val = (args[++i] || "all").toLowerCase();
      if (["all", "full", "standard"].includes(val)) {
        options.filterFull = val;
      } else {
        console.warn(`⚠️ Valor inválido para --filter-full: "${val}". Use: all, full, standard. Usando "all".`);
      }
    } else if (arg === "--file") {
      options.file = args[++i];
    } else if (arg === "--output" || arg === "-o") {
      options.output = args[++i];
    } else if (arg === "--headless") {
      options.headless = true;
    } else if (arg === "--only-login") {
      options.onlyLogin = true;
    }
  }

  if (options.file && existsSync(options.file)) {
    const content = readFileSync(options.file, "utf-8");
    const fileSkus = content.split(/[\r\n,]+/).map((s) => s.trim()).filter(Boolean);
    options.skus = [...new Set([...options.skus, ...fileSkus])];
  }

  return options;
}

/**
 * Aplica o filtro FULL nos itens coletados.
 * @param {Array} items - Array de itens com propriedade `sku`
 * @param {string} filterFull - "all" | "full" | "standard"
 * @returns {Array} Itens filtrados
 */
function applyFullFilter(items, filterFull) {
  if (filterFull === "all") return items;

  if (filterFull === "full") {
    const filtered = items.filter(it => it.sku.toUpperCase().includes("FULL"));
    console.log(`   🔽 Filtro FULL aplicado: ${filtered.length}/${items.length} itens mantidos (somente FULL)`);
    return filtered;
  }

  if (filterFull === "standard") {
    const filtered = items.filter(it => !it.sku.toUpperCase().includes("FULL"));
    console.log(`   🔽 Filtro STANDARD aplicado: ${filtered.length}/${items.length} itens mantidos (sem FULL)`);
    return filtered;
  }

  return items;
}

/**
 * Deduplica itens por cod_sankhya (ou por sku se cod_sankhya estiver vazio).
 */
function deduplicateItems(items) {
  const seen = new Set();
  return items.filter(it => {
    const key = it.cod_sankhya || it.sku;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function runAgent0(options = {}) {
  const hasCollection = !!options.collection;
  const hasSkus = options.skus && options.skus.length > 0;

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  🤖 Agente 0 — Gerador de Planilhas via Sankhya Web (RPA)");
  if (hasCollection) {
    console.log(`  📚 Coleção:       "${options.collection}"`);
  }
  if (hasSkus) {
    console.log(`  SKUs a consultar: ${options.skus.length}`);
  }
  console.log(`  Filtro FULL:      ${options.filterFull || "all"}`);
  console.log(`  Navegador:        ${options.headless ? "Headless" : "Visível (com prompt de login)"}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  const client = new SankhyaClient({ headless: options.headless });

  try {
    await client.init();
    await client.authenticate();

    if (options.onlyLogin) {
      console.log("🔒 Modo --only-login concluído com sucesso.");
      await client.close();
      return { success: true, message: "Login salvo com sucesso." };
    }

    if (!hasCollection && !hasSkus) {
      console.warn("⚠️ Nenhum SKU ou coleção informado. Use: --skus C02821I,C02820 ou --collection \"ARMORX\"");
      await client.close();
      return { success: false, error: "Nenhum SKU ou coleção informado" };
    }

    const allItems = [];

    // ═══════════════════════════════════════════════════
    // FASE 1: Busca por Coleção (keyword ou múltiplos termos)
    // ═══════════════════════════════════════════════════
    if (hasCollection) {
      const keywords = options.collection.split(/[,;\n\r]+/).map(k => k.trim()).filter(Boolean);
      console.log(`\n📚 ═══ FASE 1: Buscando ${keywords.length} termo(s) de coleção no Sankhya ═══`);

      for (let kIdx = 0; kIdx < keywords.length; kIdx++) {
        const kw = keywords[kIdx];
        console.log(`\n[${kIdx + 1}/${keywords.length}] 🔍 Consultando coleção: "${kw}"...`);
        if (kIdx > 0) {
          await client.closeProductsScreen().catch(() => {});
          await client.page.waitForTimeout(1000);
        }
        await client.openProductsScreen();
        try {
          const collectionItems = await client.queryByKeyword(kw);
          if (collectionItems && collectionItems.length > 0) {
            // Aplica filtro FULL na coleção
            const filtered = applyFullFilter(collectionItems, options.filterFull);
            allItems.push(...filtered);
            console.log(`   ✅ Termo "${kw}": ${filtered.length} produto(s) coletado(s)`);
          } else {
            console.warn(`   ⚠️ Nenhum produto encontrado para a coleção "${kw}"`);
          }
        } catch (err) {
          console.warn(`   ⚠️ Erro na busca da coleção "${kw}": ${err.message}`);
        }
      }
      await client.closeProductsScreen().catch(() => {});
    }

    // ═══════════════════════════════════════════════════
    // FASE 2: Busca por SKUs individuais
    // ═══════════════════════════════════════════════════
    if (hasSkus) {
      console.log(`\n🔖 ═══ FASE 2: Consultando ${options.skus.length} SKU(s) individual(is) ═══`);
      for (let i = 0; i < options.skus.length; i++) {
        const sku = options.skus[i];
        console.log(`\n[${i + 1}/${options.skus.length}] Consultando SKU: ${sku}`);
        if (i > 0 || hasCollection) {
          await client.closeProductsScreen().catch(() => {});
          await client.page.waitForTimeout(1000);
        }
        await client.openProductsScreen();
        try {
          const items = await client.querySku(sku);
          if (items && items.length > 0) {
            allItems.push(...items);
          } else {
            // Se o grid não detalhou, tenta catálogo oficial antes de fallback vazio
            const cat = getCatalogVariations(sku);
            if (cat && cat.length > 0) {
              console.log(`   ⚡ Utilizando ${cat.length} variações oficiais do catálogo para ${sku}.`);
              allItems.push(...cat);
            } else {
              allItems.push({
                sku,
                cod_sankhya: "",
                descricao: `Produto ${sku}`,
                classificacao: "Camisas",
              });
            }
          }
        } catch (err) {
          console.warn(`   ⚠️ Instabilidade na busca do SKU ${sku}: ${err.message}.`);
          const cat = getCatalogVariations(sku);
          if (cat && cat.length > 0) {
            console.log(`   ⚡ Utilizando ${cat.length} variações oficiais do catálogo para ${sku}.`);
            allItems.push(...cat);
          } else {
            allItems.push({
              sku,
              cod_sankhya: "",
              descricao: `Produto ${sku}`,
              classificacao: "Camisas",
            });
          }
        }
      }
    }
    await client.closeProductsScreen().catch(() => {});

    // Deduplica itens (importante quando coleção + SKUs trazem sobreposição)
    const uniqueItems = deduplicateItems(allItems);
    if (uniqueItems.length < allItems.length) {
      console.log(`\n🔄 Deduplicação: ${allItems.length} → ${uniqueItems.length} itens únicos`);
    }

    console.log(`\n📊 Total de registros coletados: ${uniqueItems.length}`);
    console.log("📑 Gerando planilha Excel (.xlsx)...");

    const uploadsDir = resolve(import.meta.dirname, "../../uploads");
    
    // Define nome da planilha com o nome da coleção ou padrão
    let filePrefix = "planilha_sankhya";
    if (options.collection) {
      // Limpa caracteres inválidos para nome de arquivo no Windows
      const cleanColName = options.collection.trim().toUpperCase().replace(/[^A-Z0-9_-]/gi, "_").replace(/_+/g, "_");
      const fullTag = options.filterFull && options.filterFull !== "all" ? `_${options.filterFull.toUpperCase()}` : "";
      filePrefix = `${cleanColName}${fullTag}`;
    }

    const defaultOutput = resolve(uploadsDir, `${filePrefix}_${Date.now()}.xlsx`);
    const outputPath = options.output || defaultOutput;
    const generatedFile = generateSpreadsheet(uniqueItems, outputPath);

    console.log(`\n✅ Planilha gerada com sucesso em:`);
    console.log(`   📂 ${generatedFile}`);

    await client.close();
    return {
      success: true,
      file: generatedFile,
      total: uniqueItems.length,
      items: uniqueItems,
    };
  } catch (error) {
    console.error(`\n❌ Erro no Agente 0:`, error.message);
    await client.close().catch(() => {});
    throw error;
  }
}

// Execução direta via terminal
if (process.argv[1] && process.argv[1].endsWith("runner.mjs")) {
  const opts = parseArgs();
  runAgent0(opts).catch(() => process.exit(1));
}

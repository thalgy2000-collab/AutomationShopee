/**
 * fix_drafts_runner.mjs — CLI para Correção de Variações em Rascunhos da Magis5
 *
 * Uso:
 *   node fix_drafts_runner.mjs                          # Dry-run de todos os rascunhos
 *   node fix_drafts_runner.mjs --sku FUSION123           # Dry-run de um SKU
 *   node fix_drafts_runner.mjs --sku FUSION123 --publish # Correção real
 *   node fix_drafts_runner.mjs --publish --limit 5       # Corrigir até 5 rascunhos
 *   node fix_drafts_runner.mjs --headed                  # Modo com navegador visível
 */

import { chromium } from "playwright";
import { join } from "node:path";
import {
  HEADLESS,
  SCREENSHOTS_DIR,
} from "./src/config.mjs";
import { getAuthenticatedContext } from "./src/auth.mjs";
import {
  listDraftProducts,
  buildCatalogForSku,
  fixProductVariations,
  findProductEditUrlBySku,
} from "./src/draft_fixer.mjs";

function parseCliArgs() {
  const args = process.argv.slice(2);
  let targetSku = null;
  let limit = null;
  let headed = !HEADLESS;
  let publish = false;
  let onlyFusion = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--sku" && args[i + 1]) {
      targetSku = args[i + 1];
      i++;
    } else if (args[i] === "--limit" && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--headed") {
      headed = true;
    } else if (args[i] === "--headless") {
      headed = false;
    } else if (args[i] === "--publish") {
      publish = true;
    } else if (args[i] === "--dry-run") {
      publish = false;
    } else if (args[i] === "--only-fusion" || args[i] === "--fusion") {
      onlyFusion = true;
    }
  }

  return { targetSku, limit, headed, dryRun: !publish, onlyFusion };
}

async function main() {
  const { targetSku, limit, headed, dryRun, onlyFusion } = parseCliArgs();

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  🔧 Agente 3 — Correção de Variações em Rascunhos Magis5");
  console.log(`  Modo:         ${dryRun ? "🛡️ DRY-RUN (Simulação Segura)" : "🚀 PRODUÇÃO (Salvamento Real)"}`);
  console.log(`  Navegador:    ${headed ? "Visível (Headed)" : "Headless"}`);
  if (targetSku) console.log(`  Filtro SKU:   ${targetSku}`);
  if (onlyFusion) console.log(`  Filtro FUSION: Somente SKUs da linha FUSION`);
  if (limit) console.log(`  Limite:       ${limit} produto(s)`);
  console.log("═══════════════════════════════════════════════════════════\n");

  // 1. Inicializa navegador
  console.log("🚀 Inicializando navegador Chromium via Playwright...");
  const browser = await chromium.launch({
    headless: !headed,
    args: ["--start-maximized", "--no-sandbox"],
  });

  const results = {
    sucesso: [],
    erros: [],
  };

  try {
    // 2. Autenticação na Magis5
    const { context, page } = await getAuthenticatedContext(browser);

    // 3. Localização dos produtos a corrigir
    let toProcess = [];

    if (targetSku) {
      console.log(`🔎 Buscando diretamente pelo SKU: ${targetSku}...`);
      const found = await findProductEditUrlBySku(page, targetSku);
      if (found) {
        toProcess.push(found);
        console.log(`  ✓ Encontrado: ${found.sku} (${found.editUrl})`);
      } else {
        console.log(`  ❌ SKU ${targetSku} não localizado no Magis5.`);
      }
    } else if (onlyFusion) {
      console.log("🎯 Buscando ativamente todos os SKUs da linha FUSION (FUSION123 a FUSION132)...");
      const fusionSkus = [
        "FUSION123", "FUSION124", "FUSION125", "FUSION126", "FUSION127",
        "FUSION128", "FUSION129", "FUSION130", "FUSION131", "FUSION132"
      ];
      const skusToCheck = (limit && limit > 0) ? fusionSkus.slice(0, limit) : fusionSkus;

      for (const sku of skusToCheck) {
        const found = await findProductEditUrlBySku(page, sku);
        if (found) {
          toProcess.push(found);
          console.log(`  ✓ ${sku} encontrado! (${found.editUrl})`);
        } else {
          console.log(`  - ${sku} não encontrado.`);
        }
      }
    } else {
      // Busca geral de rascunhos na consulta
      const drafts = await listDraftProducts(page);
      toProcess = (limit && limit > 0) ? drafts.slice(0, limit) : drafts;
    }

    if (toProcess.length === 0) {
      console.log("\n🎉 Nenhum produto encontrado para corrigir!");
    } else {
      console.log(`\n📋 Processando ${toProcess.length} produto(s)...\n`);

      for (let i = 0; i < toProcess.length; i++) {
        const draft = toProcess[i];
        const progresso = `[${i + 1}/${toProcess.length}]`;
        console.log(`\n${progresso} Preparando correção de: ${draft.sku || draft.productId}`);

        try {
          // Constrói catálogo de variações para o SKU
          const skuToFix = draft.sku || draft.productId;
          const catalog = await buildCatalogForSku(skuToFix);
          console.log(`  📦 Catálogo: ${catalog.variations.length} variações (${catalog.attrName})`);

          if (catalog.variations.length === 0) {
            console.warn(`  ⚠️ Catálogo vazio para ${skuToFix}, pulando...`);
            continue;
          }

          // Corrige as variações
          const editUrl = draft.editUrl;
          if (!editUrl) {
            console.error(`  ❌ URL de edição não encontrada para ${skuToFix}`);
            results.erros.push({ sku: skuToFix, error: "URL de edição não encontrada" });
            continue;
          }

          const result = await fixProductVariations(page, editUrl, skuToFix, catalog, { dryRun });
          if (result.success) {
            results.sucesso.push(result);
          } else {
            results.erros.push(result);
          }
        } catch (err) {
          console.error(`  ❌ ${progresso} Erro: ${err.message}`);
          const errScreenshot = join(SCREENSHOTS_DIR, `fix-error-${draft.sku || "unknown"}-${Date.now()}.png`);
          await page.screenshot({ path: errScreenshot, fullPage: true }).catch(() => {});
          results.erros.push({ sku: draft.sku, error: err.message, screenshot: errScreenshot });
        }
      }
    }

    await context.close();
  } catch (globalErr) {
    console.error("❌ Erro fatal:", globalErr.message);
    process.exit(1);
  } finally {
    await browser.close();
  }

  // 5. Relatório
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  📊 Resumo da Correção de Rascunhos");
  console.log(`  Sucessos:   ${results.sucesso.length}`);
  console.log(`  Falhas:     ${results.erros.length}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  if (results.sucesso.length > 0) {
    console.log("✅ Produtos corrigidos:");
    results.sucesso.forEach((s) =>
      console.log(`  • SKU: ${s.sku} | Variações: ${s.variationsFixed} | Screenshot: ${s.screenshot}`)
    );
  }

  if (results.erros.length > 0) {
    console.log("\n❌ Produtos com erro:");
    results.erros.forEach((e) =>
      console.log(`  • SKU: ${e.sku} | Motivo: ${e.error} | Screenshot: ${e.screenshot || "N/A"}`)
    );
  }

  if (results.sucesso.length === 0 && results.erros.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("❌ Falha inesperada:", err);
  process.exit(1);
});

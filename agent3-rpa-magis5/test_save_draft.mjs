import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getAuthenticatedContext } from "./src/auth.mjs";
import { publishProductToMagis5 } from "./src/publisher.mjs";

async function testSaveDraft() {
  console.log("Iniciando teste de criação de RASCUNHO no Magis5...");
  const browser = await chromium.launch({ headless: true });
  try {
    const { page } = await getAuthenticatedContext(browser);

    // Carrega o JSON de C02820
    const jsonPath = resolve("../agent2-enricher/produtos/C02820.json");
    const raw = await readFile(jsonPath, "utf-8");
    const product = JSON.parse(raw);

    console.log(`Produto carregado: ${product.sku} - ${product.titulo_shopee}`);

    // Executa publishProductToMagis5 com dryRun: false (para clicar em Salvar e criar o rascunho no Magis5)
    const result = await publishProductToMagis5(page, product, { dryRun: false });
    console.log("Resultado do salvamento de rascunho:", JSON.stringify(result, null, 2));

    await page.screenshot({ path: "screenshots/draft_result_c02820.png", fullPage: true });
    console.log("Screenshot final salvo em: screenshots/draft_result_c02820.png");

  } catch (err) {
    console.error("Erro no teste de rascunho:", err);
  } finally {
    await browser.close();
  }
}

testSaveDraft();

import { chromium } from "playwright";
import { resolve } from "node:path";

async function main() {
  const sessionPath = resolve("agent3-rpa-magis5", "session.json");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: sessionPath });
  const page = await context.newPage();

  console.log("Acessando consult.php...");
  await page.goto("https://app.magis5.com.br/v2/admin/product/variations/consult.php", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  const skuInput = page.locator('input[placeholder="Insira o sku"]').first();
  await skuInput.fill("C02846BL");
  await page.click('button:has-text("Buscar")');
  await page.waitForTimeout(3000);

  await page.screenshot({ path: resolve("agent3-rpa-magis5", "screenshots", "consult-filtered-C02846BL.png"), fullPage: true });

  const rows = await page.locator('table tbody tr').evaluateAll(trs => trs.map(tr => tr.innerText.replace(/\s+/g, ' ').trim()));
  console.log("Resultados da busca C02846BL:", rows);

  // Agora buscando C02849BL
  await skuInput.fill("C02849BL");
  await page.click('button:has-text("Buscar")');
  await page.waitForTimeout(3000);

  await page.screenshot({ path: resolve("agent3-rpa-magis5", "screenshots", "consult-filtered-C02849BL.png"), fullPage: true });

  const rows2 = await page.locator('table tbody tr').evaluateAll(trs => trs.map(tr => tr.innerText.replace(/\s+/g, ' ').trim()));
  console.log("Resultados da busca C02849BL:", rows2);

  await browser.close();
}

main().catch(console.error);

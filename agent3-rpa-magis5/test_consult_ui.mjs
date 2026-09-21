import { chromium } from "playwright";
import { resolve } from "node:path";

async function main() {
  const sessionPath = resolve("agent3-rpa-magis5", "session.json");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: sessionPath });
  const page = await context.newPage();

  console.log("Acessando consult.php...");
  await page.goto("https://app.magis5.com.br/v2/admin/product/variations/consult.php", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  // Vamos capturar a screenshot da página de consulta inicial
  await page.screenshot({ path: resolve("agent3-rpa-magis5", "screenshots", "consult-home.png") });

  // Vamos inspecionar os inputs de busca
  const inputs = await page.locator('input').evaluateAll(els => els.map(e => ({ id: e.id, name: e.name, placeholder: e.placeholder, type: e.type, visible: e.offsetParent !== null })));
  console.log("Inputs na página consult.php:", inputs);

  // Buscar por C02846BL
  const searchInput = page.locator('#search, input[name="search"], input[type="search"]').first();
  if (await searchInput.isVisible()) {
    console.log("Preenchendo busca com C02846BL...");
    await searchInput.fill("C02846BL");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(3000);
    await page.screenshot({ path: resolve("agent3-rpa-magis5", "screenshots", "consult-search-C02846BL.png") });

    const rows = await page.locator('table tbody tr').evaluateAll(trs => trs.map(tr => tr.innerText.replace(/\s+/g, ' ').trim()));
    console.log("Linhas encontradas na busca:", rows);
  }

  await browser.close();
}

main().catch(console.error);

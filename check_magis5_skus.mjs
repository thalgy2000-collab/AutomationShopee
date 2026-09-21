import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const SESSION_FILE = path.resolve("agent3-rpa-magis5/session.json");

async function checkSkus() {
  if (!fs.existsSync(SESSION_FILE)) {
    console.error("Sessão não encontrada");
    return;
  }
  const session = JSON.parse(fs.readFileSync(SESSION_FILE, "utf-8"));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: SESSION_FILE });
  const page = await context.newPage();

  console.log("Abrindo consulta Magis5...");
  await page.goto("https://app.magis5.com.br/painel/consult.php", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  const skusToCheck = ["C02846", "C02846BL", "C02849", "C02849BL", "C02830", "C02830BL", "C02824", "C02824BL", "C02829", "C02829BL"];

  for (const sku of skusToCheck) {
    const skuInput = page.locator('input[placeholder*="sku" i], #sku, input[name="sku"]').first();
    await skuInput.fill(sku);
    const searchBtn = page.locator('button:has-text("Buscar"), input[value="Buscar"]').first();
    await searchBtn.click();
    await page.waitForTimeout(2000);

    const rows = await page.locator("a[href*='variation.php?id=']").all();
    console.log(`\n🔎 Busca por "${sku}": ${rows.length} resultado(s)`);
    for (const r of rows) {
      const href = await r.getAttribute("href");
      const card = r.locator('xpath=ancestor::*[contains(@class, "card") or contains(@class, "m-portlet") or self::tr]').first();
      const text = (await card.innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 150);
      console.log(`   - Link: ${href} | Texto: ${text}`);
    }
  }

  await browser.close();
}

checkSkus().catch(console.error);

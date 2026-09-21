import { chromium } from "playwright";
import { getAuthenticatedContext } from "./agent3-rpa-magis5/src/auth.mjs";

async function check() {
  const browser = await chromium.launch({ headless: true });
  const { page } = await getAuthenticatedContext(browser);

  await page.goto("https://app.magis5.com.br/painel/consult.php", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  const skus = [
    "CAX001", "CAX001BL", "CAX002", "CAX002BL", "CAX003", "CAX003BL",
    "CAX004", "CAX004BL", "CAX005", "CAX005BL", "CAX006", "CAX006BL",
    "CAX007", "CAX007BL", "CAX008", "CAX012BL", "CAX013", "CAX013BL",
    "CAX014", "CAX014BL", "CAX015", "CAX015BL", "CAX016"
  ];

  const results = {};

  for (const s of skus) {
    const inp = page.locator('input[placeholder*="sku" i], #sku, input[name="sku"]').first();
    await inp.fill(s);
    const btn = page.locator('button:has-text("Buscar"), input[value="Buscar"]').first();
    await btn.click();
    await page.waitForTimeout(1500);

    const matches = await page.locator(`text="${s}"`).count();
    const isPresent = matches > 0;
    results[s] = isPresent;
    console.log(`[Magis5] SKU: ${s} => ${isPresent ? "EXISTE" : "NÃO EXISTE"}`);
  }

  console.log("\nResultado final:", results);
  await browser.close();
}

check().catch(console.error);

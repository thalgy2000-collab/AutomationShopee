import { chromium } from "playwright";
import { getAuthenticatedContext } from "./src/auth.mjs";

const TARGETS = [
  { id: "58252031133", sku: "C02362" },
  { id: "22498158007", sku: "CORINTHIAS" },
  { id: "23297692074", sku: "C01076" },
  { id: "23998922043", sku: "C01946" },
  { id: "23993590640", sku: "BT000" },
  { id: "23694437282", sku: "C02350" },
];

async function checkMagis5() {
  const browser = await chromium.launch({ headless: true });
  try {
    const { page } = await getAuthenticatedContext(browser);
    const consultUrl = "https://app.magis5.com.br/v2/admin/product/variations/consult.php";
    await page.goto(consultUrl, { waitUntil: "networkidle", timeout: 35000 });
    console.log("Conectado ao Magis5!");

    for (const item of TARGETS) {
      console.log(`\n========================================`);
      console.log(`Consultando SKU: ${item.sku} (Shopee ID: ${item.id})`);

      const skuInput = page.locator('input[placeholder*="sku" i], #sku, input[name="sku"]').first();
      await skuInput.fill(item.sku);
      
      const searchBtn = page.locator('button:has-text("Buscar"), input[value="Buscar"]').first();
      await searchBtn.click();
      await page.waitForTimeout(3000);

      // Screenshot da busca
      await page.screenshot({ path: `screenshots/magis5_${item.sku}.png`, fullPage: false });

      const textSnippet = await page.locator(".m-portlet, .card, table, .table-responsive").first().evaluate(el => el ? el.innerText.trim() : "Não encontrado").catch(() => "Erro no seletor");
      console.log(`Dados encontrados:\n${textSnippet.substring(0, 350)}`);
    }
  } catch (err) {
    console.error("Erro no Magis5:", err);
  } finally {
    await browser.close();
  }
}

checkMagis5();

import { chromium } from "playwright";
import { resolve } from "node:path";

async function main() {
  const sessionPath = resolve("agent3-rpa-magis5", "session.json");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: sessionPath });
  const page = await context.newPage();

  const ids = [
    { sku: "C02846BL", id: "8720" },
    { sku: "C02849BL", id: "8711" }
  ];

  for (const item of ids) {
    console.log(`\n--- Inspecionando ${item.sku} (ID ${item.id}) ---`);
    await page.goto(`https://app.magis5.com.br/v2/admin/product/variations/variation.php?id=${item.id}&mode=edit`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    // Pegar título, status, botões, marketplaces
    const title = await page.locator('#title, input[name="title"]').first().inputValue().catch(() => "N/A");
    const sku = await page.locator('#sku, input[name="sku"]').first().inputValue().catch(() => "N/A");
    const isShopee = await page.locator('text=Shopee').count();
    
    console.log(`SKU campo: ${sku}`);
    console.log(`Título: ${title}`);
    console.log(`Ocorrências de "Shopee": ${isShopee}`);

    const screenshotPath = resolve("agent3-rpa-magis5", "screenshots", `inspect-id-${item.id}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Screenshot salva: ${screenshotPath}`);
  }

  // Agora vamos pesquisar na tabela de consulta de produtos (consult.php) para ver como eles aparecem
  console.log("\n--- Pesquisando na listagem de produtos do Magis5 ---");
  await page.goto("https://app.magis5.com.br/v2/admin/product/variations/consult.php", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  for (const item of ids) {
    const searchInput = page.locator('#search, input[type="search"], input[name="search"], input[placeholder*="Buscar"], input[placeholder*="Pesquisar"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill(item.sku);
      await searchInput.press('Enter');
      await page.waitForTimeout(2000);
      const rows = await page.locator('table tbody tr').evaluateAll(trs => trs.map(tr => tr.innerText.replace(/\n+/g, ' | ').trim()));
      console.log(`Resultados na tabela para ${item.sku}:`);
      console.log(rows.slice(0, 5));
      const listScreenshot = resolve("agent3-rpa-magis5", "screenshots", `list-search-${item.sku}.png`);
      await page.screenshot({ path: listScreenshot });
      console.log(`Screenshot da listagem salva: ${listScreenshot}`);
    }
  }

  await browser.close();
}

main().catch(console.error);

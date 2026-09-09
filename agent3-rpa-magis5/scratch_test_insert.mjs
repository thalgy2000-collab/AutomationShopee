import { chromium } from "playwright";
import { getAuthenticatedContext } from "./src/auth.mjs";

async function run() {
  const browser = await chromium.launch({ headless: true });
  const { page } = await getAuthenticatedContext(browser);

  page.on("response", async (res) => {
    if (res.url().includes("insert") || res.url().includes("product") || res.url().includes("variation")) {
      try {
        const text = await res.text();
        console.log(`📡 [${res.status()}] ${res.url()}`);
        console.log(`📄 Response:`, text);
      } catch {}
    }
  });

  await page.goto("https://app.magis5.com.br/v2/admin/product/variations/variation.php");
  await page.waitForTimeout(2000);

  // Selecionar Shopee
  await page.locator('button[data-id="marketplaces"]').click();
  await page.waitForTimeout(300);
  await page.locator('.dropdown-menu.show a:has-text("Shopee"), .dropdown-menu.show .dropdown-item:has-text("Shopee")').first().click();
  await page.click('button:has-text("Prosseguir")');
  await page.waitForTimeout(2000);

  // Preencher campos básicos
  await page.locator('#sku').fill('BORAPLUS12');
  await page.locator('#title').fill('Isca Artificial Nelson Nakamura Bora Plus 12cm 14g Meia-Agua');
  await page.locator('#brand').fill('Nelson Nakamura');
  await page.locator('#model').fill('Bora Plus');

  // Selecionar categoria
  const cat1 = page.locator('#categorySelect_0');
  if (await cat1.isVisible()) {
    await cat1.selectOption({ label: "Esportes e Atividades ao Ar Livre" });
    await page.waitForTimeout(1000);
    const cat2 = page.locator('#categorySelect_1');
    await cat2.selectOption({ label: "Equipamentos Esportivos e Recreação ao Ar Livre" });
    await page.waitForTimeout(1000);
    const cat3 = page.locator('#categorySelect_2');
    await cat3.selectOption({ label: "Pescaria" });
    await page.waitForTimeout(1000);
    const cat4 = page.locator('#categorySelect_3');
    await cat4.selectOption({ label: "Iscas" });
    await page.waitForTimeout(1000);
  }

  // Atributo e Variação
  await page.locator('#attribute').fill('modelo');
  const tagInput = page.locator('input[placeholder*="Digite e use"]').first();
  await tagInput.fill('208');
  await tagInput.press('Enter');
  await page.waitForTimeout(500);

  // Gerar lista de variações
  await page.click('button:has-text("Gerar lista de variações")');
  await page.waitForTimeout(2000);

  // Preencher SKU com 54317
  await page.locator('#variationSKU-0').fill('54317');
  await page.waitForTimeout(1500);

  // Preencher preço
  const pInput = page.locator('#variationPrice-0');
  await pInput.click();
  await pInput.pressSequentially('4851', { delay: 50 });
  await page.waitForTimeout(500);

  // Clicar em Salvar
  console.log("Clicando em Salvar...");
  const saveBtn = page.locator('button:has-text("Salvar")').last();
  await saveBtn.scrollIntoViewIfNeeded();
  await saveBtn.click();

  await page.waitForTimeout(4000);
  await browser.close();
}

run().catch(console.error);

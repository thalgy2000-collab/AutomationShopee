import { SankhyaClient } from "../src/sankhya_client.mjs";

async function testSearchDirectSku() {
  const client = new SankhyaClient({ headless: true });
  try {
    await client.init();
    await client.authenticate();
    await client.page.waitForTimeout(1500);

    const popupBtn = client.page.locator('button:has-text("Não"), .MessagePopup button:has-text("Não")').first();
    if (await popupBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
      await popupBtn.click();
      await client.page.waitForTimeout(1000);
    }
    await client.page.keyboard.press("Escape").catch(() => {});

    const frame = await client.openProductsScreen();
    const searchInput = frame.locator('input.query-input:visible, input[placeholder*="procura"]:visible, input.search-input:visible, input[type="text"]:visible').first();
    await searchInput.waitFor({ state: "visible", timeout: 15000 });

    // Testa buscar "FUSION123G"
    console.log("Buscando FUSION123G...");
    await searchInput.fill("FUSION123G");
    await searchInput.press("Enter");
    await client.page.waitForTimeout(4000);

    await client.page.screenshot({ path: "./scratch_search_fusion123g.png" });

    const text = await frame.evaluate(() => document.body.innerText);
    console.log("Resultado da busca por FUSION123G:\n", text.slice(0, 1000));

    // Agora testa buscar "FUSION123" e rolar para baixo ou clicar em "ver todos"
    console.log("\nBuscando FUSION123 puro...");
    await searchInput.click({ clickCount: 3 });
    await searchInput.fill("FUSION123");
    await searchInput.press("Enter");
    await client.page.waitForTimeout(4000);

    const text2 = await frame.evaluate(() => document.body.innerText);
    console.log("Resultado da busca por FUSION123:\n", text2.slice(0, 1500));

  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

testSearchDirectSku();

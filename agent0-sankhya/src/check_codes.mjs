import { SankhyaClient } from "../src/sankhya_client.mjs";

async function checkFusionCodes() {
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

    for (const testSku of ["FUSION124", "FUSION125", "FUSION126"]) {
      console.log(`\n--- Buscando ${testSku} ---`);
      // Se estiver na tela de detalhes, clica no botão Home (ícone de casinha 🏠)
      const homeBtn = frame.locator('.btn-start-page, [title*="Início"], .icon-home, div[title*="Área de Cartões"]').first();
      if (await homeBtn.isVisible().catch(() => false)) {
        await homeBtn.click();
        await client.page.waitForTimeout(1500);
      }

      await searchInput.waitFor({ state: "visible", timeout: 15000 });
      await searchInput.click({ clickCount: 3 });
      await searchInput.fill(testSku);
      await searchInput.press("Enter");
      await client.page.waitForTimeout(4000);

      const items = await frame.evaluate(() => {
        const results = [];
        const text = document.body.innerText;
        const regex = /(\d{4,7})\s*-\s*([A-Za-z0-9_]{3,35})\s*-\s*([^\n\r]+)/g;
        let m;
        while ((m = regex.exec(text)) !== null) {
          if (!results.some(r => r.sku === m[2])) {
            results.push({
              cod_sankhya: m[1].trim(),
              sku: m[2].trim(),
              descricao: m[3].split(/Oneroso:|Ativo:|Status/)[0].trim()
            });
          }
        }
        return results;
      });
      console.log(`Itens para ${testSku}:`, JSON.stringify(items, null, 2));
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

checkFusionCodes();

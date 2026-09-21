import { SankhyaClient } from "../src/sankhya_client.mjs";
import { resolve } from "node:path";

async function test() {
  console.log("Iniciando teste de busca para FUSION123...");
  const client = new SankhyaClient({ headless: true }); // headless para rodar em segundo plano
  try {
    await client.init();
    await client.authenticate();
    const frame = await client.openProductsScreen();
    console.log("Tela de produtos aberta. Tirando screenshot inicial...");
    await client.page.screenshot({ path: "./scratch_screen_opened.png" });

    // Clica na busca
    const homeSearch = frame.locator('input.query-input:visible, input[placeholder*="procura"]:visible, input.search-input:visible').first();
    await homeSearch.waitFor({ state: "visible", timeout: 20000 });
    console.log("Digitando FUSION123...");
    await homeSearch.fill("FUSION123");
    await client.page.waitForTimeout(500);
    await homeSearch.press("Enter");
    console.log("Aguardando 6 segundos pós-busca...");
    await client.page.waitForTimeout(6000);

    await client.page.screenshot({ path: "./scratch_search_result.png" });
    console.log("Screenshot pós-busca salvo em ./scratch_search_result.png");

    // Extrai todo texto do frame
    const textContent = await frame.evaluate(() => {
      const allText = document.body.innerText;
      const elements = Array.from(document.querySelectorAll('tr, div[role=row], .slick-row, li, .card, [class*="item"]')).map(el => el.innerText).filter(t => t && t.includes('FUSION'));
      return {
        sampleBody: allText.slice(0, 2000),
        matchingElements: elements.slice(0, 30)
      };
    });

    console.log("Matching Elements:", JSON.stringify(textContent.matchingElements, null, 2));
    console.log("Sample Body:", textContent.sampleBody.slice(0, 500));

    const res = await client.querySku("FUSION123");
    console.log("querySku result:", JSON.stringify(res, null, 2));
  } catch (err) {
    console.error("Erro no teste:", err);
    if (client.page) {
      await client.page.screenshot({ path: "./scratch_error.png" }).catch(() => {});
    }
  } finally {
    await client.close();
  }
}

test();

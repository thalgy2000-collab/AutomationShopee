import { SankhyaClient } from "./agent0-sankhya/src/sankhya_client.mjs";
import { resolve } from "node:path";

async function run() {
  const client = new SankhyaClient({ headless: true });
  try {
    await client.init();
    await client.authenticate();
    await client.page.waitForTimeout(2000);

    const frame = await client.openProductsScreen();
    if (!frame) {
      console.error("Frame não encontrado!");
      return;
    }

    console.log("Frame obtido:", frame.url());

    // Inspeciona inputs dentro do frame
    const inputs = await frame.evaluate(() => {
      return Array.from(document.querySelectorAll('input')).map(i => ({
        tag: i.tagName,
        className: i.className,
        placeholder: i.placeholder,
        id: i.id,
        visible: i.offsetParent !== null
      }));
    });
    console.log("Inputs dentro do frame ProdutoServico:", inputs);

    // Localizar o campo de busca
    const searchInput = frame.locator('input[placeholder*="procura"], input.query-input').first();
    console.log("Campo de busca visível?", await searchInput.isVisible());

    console.log("Digitando C02846BL...");
    await searchInput.click();
    await searchInput.fill("C02846BL");
    await searchInput.press("Enter");
    await client.page.waitForTimeout(4000);

    const shotPath = resolve("agent0-sankhya", "scratch_search_C02846BL.png");
    await client.page.screenshot({ path: shotPath });
    console.log("Screenshot do resultado salvo:", shotPath);

    // Extrair o texto da tela
    const text = await frame.evaluate(() => document.body.innerText);
    console.log("Texto do resultado (primeiros 1000 carac.):\n", text.slice(0, 1000));

  } catch (e) {
    console.error(e);
  } finally {
    await client.close().catch(() => {});
  }
}

run();

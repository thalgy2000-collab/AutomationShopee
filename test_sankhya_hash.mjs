import { SankhyaClient } from "./agent0-sankhya/src/sankhya_client.mjs";
import { resolve } from "node:path";

async function testHashNav() {
  const client = new SankhyaClient({ headless: true });
  try {
    await client.init();
    await client.authenticate();
    await client.page.waitForTimeout(2000);

    console.log("Navegando via hash direto para tela de Produtos...");
    await client.page.evaluate(() => {
      window.location.hash = '#app/YnIuY29tLnNhbmtoeWEuY29yZS5jYWQucHJvZHV0b3M=';
    });

    console.log("Aguardando frame ProdutoServico...");
    let pFrame = null;
    for (let i = 0; i < 20; i++) {
      pFrame = client.page.frames().find(f => f.url().includes("ProdutoServico"));
      if (pFrame) break;
      await client.page.waitForTimeout(1000);
    }

    if (!pFrame) {
      console.error("Frame não apareceu!");
      return;
    }
    console.log("✅ Frame carregado com sucesso:", pFrame.url());

    // Aguardar o campo de busca dentro do frame
    const searchInput = pFrame.locator('input.query-input:visible, input[placeholder*="procura"]:visible, input.search-input:visible').first();
    await searchInput.waitFor({ state: "visible", timeout: 15000 });
    console.log("✅ Campo de busca visível dentro do frame!");

    // Buscar C02846BL
    console.log("Buscando C02846BL...");
    await searchInput.fill("C02846BL");
    await searchInput.press("Enter");
    await client.page.waitForTimeout(5000);

    // Salvar screenshot
    const shot = resolve("agent0-sankhya", "scratch_hash_result.png");
    await client.page.screenshot({ path: shot });
    console.log("Screenshot salva:", shot);

    // Extrair itens
    const items = await pFrame.evaluate(() => {
      const results = [];
      const text = document.body.innerText;
      const regex = /(\d{4,7})\s*-\s*([A-Za-z0-9_]{3,35})\s*-\s*([^\n\r]+)/g;
      let m;
      while ((m = regex.exec(text)) !== null) {
        results.push({
          cod_sankhya: m[1].trim(),
          sku: m[2].trim(),
          descricao: m[3].split(/Oneroso:|Ativo:|Status/)[0].trim()
        });
      }
      return results;
    });

    console.log(`Itens extraídos (${items.length}):`, items);

  } catch (e) {
    console.error("Erro:", e);
  } finally {
    await client.close().catch(() => {});
  }
}

testHashNav();

import { SankhyaClient } from "../src/sankhya_client.mjs";

async function testMoreResults() {
  console.log("Testando clique em 'ver todos' ou 'Mostrar grade' para FUSION123...");
  const client = new SankhyaClient({ headless: true });
  try {
    await client.init();
    await client.authenticate();
    const frame = await client.openProductsScreen();

    // Localiza campo de busca atual
    const searchInput = frame.locator('input.query-input:visible, input[placeholder*="procura"]:visible, input.search-input:visible, input[type="text"]:visible').first();
    await searchInput.waitFor({ state: "visible", timeout: 15000 });
    await searchInput.fill("FUSION123");
    await searchInput.press("Enter");
    await client.page.waitForTimeout(4000);

    // Verifica link "Clique aqui para ver todos"
    const verTodosBtn = frame.locator('text="Clique aqui para ver todos", span:has-text("ver todos"), a:has-text("ver todos")').first();
    const hasVerTodos = await verTodosBtn.isVisible().catch(() => false);
    console.log("Tem link 'ver todos'?", hasVerTodos);

    if (hasVerTodos) {
      console.log("Clicando em 'ver todos'...");
      await verTodosBtn.click();
      await client.page.waitForTimeout(4000);
      await client.page.screenshot({ path: "./scratch_ver_todos.png" });
    }

    // Extrai os itens agora
    const items = await frame.evaluate(() => {
      const results = [];
      const text = document.body.innerText;
      // Procura todas as ocorrências de "número - FUSION... - descrição"
      const regex = /(\d{4,7})\s*-\s*([A-Za-z0-9_]{3,35})\s*-\s*([^\n\r]+)/g;
      let m;
      while ((m = regex.exec(text)) !== null) {
        results.push({
          cod_sankhya: m[1].trim(),
          sku: m[2].trim(),
          descricao: m[3].trim()
        });
      }
      return results;
    });

    console.log("Total de itens encontrados após 'ver todos':", items.length);
    console.log(JSON.stringify(items, null, 2));

    // Agora testa se conseguimos fazer uma SEGUNDA busca sem recarregar a tela
    console.log("\n--- TESTANDO SEGUNDA BUSCA (FUSION124) ---");
    const searchInput2 = frame.locator('input.query-input:visible, input[placeholder*="procura"]:visible, input.search-input:visible, input[type="text"]:visible').first();
    await searchInput2.click({ clickCount: 3 });
    await searchInput2.fill("FUSION124");
    await searchInput2.press("Enter");
    await client.page.waitForTimeout(4000);

    const verTodosBtn2 = frame.locator('text="Clique aqui para ver todos", span:has-text("ver todos"), a:has-text("ver todos")').first();
    if (await verTodosBtn2.isVisible().catch(() => false)) {
      await verTodosBtn2.click();
      await client.page.waitForTimeout(3000);
    }

    const items2 = await frame.evaluate(() => {
      const results = [];
      const text = document.body.innerText;
      const regex = /(\d{4,7})\s*-\s*([A-Za-z0-9_]{3,35})\s*-\s*([^\n\r]+)/g;
      let m;
      while ((m = regex.exec(text)) !== null) {
        results.push({
          cod_sankhya: m[1].trim(),
          sku: m[2].trim(),
          descricao: m[3].trim()
        });
      }
      return results;
    });

    console.log("Total de itens encontrados para FUSION124:", items2.length);
    console.log(JSON.stringify(items2, null, 2));

  } catch (err) {
    console.error("Erro no teste:", err);
  } finally {
    await client.close();
  }
}

testMoreResults();

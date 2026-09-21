import { SankhyaClient } from "../src/sankhya_client.mjs";

async function testDismissAndQuery() {
  console.log("Iniciando teste com descarte de popup de sessão anterior...");
  const client = new SankhyaClient({ headless: true });
  try {
    await client.init();
    await client.authenticate();
    await client.page.waitForTimeout(2000);

    // 1. Trata popup "Restaurar sessão anterior" ou qualquer outro popup
    const popupBtn = client.page.locator('button:has-text("Não"), .MessagePopup button:has-text("Não"), div:has-text("Restaurar sessão") button:has-text("Não")').first();
    if (await popupBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log("Descartando popup 'Restaurar sessão anterior'...");
      await popupBtn.click();
      await client.page.waitForTimeout(1500);
    }
    await client.page.keyboard.press("Escape").catch(() => {});

    // 2. Abre Produtos
    const frame = await client.openProductsScreen();
    console.log("Tela de produtos aberta com sucesso!");

    // 3. Digita FUSION123
    const searchInput = frame.locator('input.query-input:visible, input[placeholder*="procura"]:visible, input.search-input:visible, input[type="text"]:visible').first();
    await searchInput.waitFor({ state: "visible", timeout: 15000 });
    await searchInput.fill("FUSION123");
    await searchInput.press("Enter");
    console.log("Buscando FUSION123...");
    await client.page.waitForTimeout(4000);

    // 4. Clica em "Mostrar grade" para carregar TODOS os itens da tabela
    const btnGrade = frame.locator('text="Mostrar grade", [title*="grade"], button:has-text("grade")').first();
    if (await btnGrade.isVisible().catch(() => false)) {
      console.log("Clicando em 'Mostrar grade'...");
      await btnGrade.click();
      await client.page.waitForTimeout(4000);
      await client.page.screenshot({ path: "./scratch_grade_view.png" });
    } else {
      const verTodos = frame.locator('text="Clique aqui para ver todos"').first();
      if (await verTodos.isVisible().catch(() => false)) {
        console.log("Clicando em 'Clique aqui para ver todos'...");
        await verTodos.click();
        await client.page.waitForTimeout(4000);
      }
    }

    // 5. Extrai linhas
    const items = await frame.evaluate(() => {
      const results = [];
      const text = document.body.innerText;
      // Regex para capturar código sankhya e SKU
      const regex = /(\d{4,7})\s*-\s*([A-Za-z0-9_]{3,35})\s*-\s*([^\n\r]+)/g;
      let m;
      while ((m = regex.exec(text)) !== null) {
        if (!results.some(r => r.sku === m[2])) {
          results.push({
            cod_sankhya: m[1].trim(),
            sku: m[2].trim(),
            descricao: m[3].trim()
          });
        }
      }
      return results;
    });

    console.log(`Sucesso! Total de itens encontrados para FUSION123: ${items.length}`);
    console.log(JSON.stringify(items, null, 2));

  } catch (err) {
    console.error("Erro no teste:", err);
  } finally {
    await client.close();
  }
}

testDismissAndQuery();

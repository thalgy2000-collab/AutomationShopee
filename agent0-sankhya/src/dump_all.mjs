import { SankhyaClient } from "../src/sankhya_client.mjs";

async function dumpAllAfterVerTodos() {
  const client = new SankhyaClient({ headless: true });
  try {
    await client.init();
    await client.authenticate();
    await client.page.waitForTimeout(1500);

    // Fecha popup se houver
    const popupBtn = client.page.locator('button:has-text("Não"), .MessagePopup button:has-text("Não")').first();
    if (await popupBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
      await popupBtn.click();
      await client.page.waitForTimeout(1000);
    }
    await client.page.keyboard.press("Escape").catch(() => {});

    const frame = await client.openProductsScreen();
    const searchInput = frame.locator('input.query-input:visible, input[placeholder*="procura"]:visible, input.search-input:visible, input[type="text"]:visible').first();
    await searchInput.waitFor({ state: "visible", timeout: 15000 });
    await searchInput.fill("FUSION123");
    await searchInput.press("Enter");
    await client.page.waitForTimeout(4000);

    const verTodos = frame.locator('text="Clique aqui para ver todos", a:has-text("ver todos")').first();
    if (await verTodos.isVisible().catch(() => false)) {
      console.log("Clicando no link 'Clique aqui para ver todos'...");
      await verTodos.click();
      await client.page.waitForTimeout(5000);
    }

    await client.page.screenshot({ path: "./scratch_after_ver_todos.png" });
    console.log("Screenshot scratch_after_ver_todos.png salvo!");

    // Extrai linhas usando o método exato de sankhya_client
    const items = await frame.evaluate(() => {
      const list = [];
      const divs = Array.from(document.querySelectorAll("div, li, [role=listitem], tr"));
      for (const el of divs) {
        const text = el.innerText || "";
        const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
        for (const line of lines) {
          const m = line.match(/^(\d{4,7})\s*-\s*([A-Za-z0-9_]{3,35})\s*-\s*(.+)$/);
          if (m && !list.some(it => it.cod_sankhya === m[1])) {
            // Limpa a descrição para pegar só a primeira linha do produto
            const cleanDesc = m[3].split(/Oneroso:|Ativo:|Status|Marca:|Peso/)[0].trim();
            list.push({
              cod_sankhya: m[1].trim(),
              sku: m[2].trim(),
              descricao: cleanDesc
            });
          }
        }
      }
      return list;
    });

    console.log(`Itens capturados (${items.length}):`);
    console.log(JSON.stringify(items, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

dumpAllAfterVerTodos();

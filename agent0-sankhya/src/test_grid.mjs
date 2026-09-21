import { SankhyaClient } from "../src/sankhya_client.mjs";

async function testGrid() {
  const client = new SankhyaClient({ headless: true });
  try {
    await client.init();
    await client.authenticate();
    const frame = await client.openProductsScreen();

    // Se houver SimplePopupGlass, pressiona Escape
    await client.page.keyboard.press("Escape").catch(() => {});

    const searchInput = frame.locator('input.query-input:visible, input[placeholder*="procura"]:visible, input.search-input:visible, input[type="text"]:visible').first();
    await searchInput.waitFor({ state: "visible", timeout: 20000 });
    await searchInput.fill("FUSION123");
    await searchInput.press("Enter");
    await client.page.waitForTimeout(4000);

    // Clica em "Mostrar grade" na barra lateral esquerda
    console.log("Procurando 'Mostrar grade'...");
    const btnGrade = frame.locator('text="Mostrar grade", [title*="grade"], button:has-text("grade")').first();
    if (await btnGrade.isVisible().catch(() => false)) {
      console.log("Clicando em 'Mostrar grade'...");
      await btnGrade.click();
      await client.page.waitForTimeout(4000);
      await client.page.screenshot({ path: "./scratch_grade.png" });
    }

    // Extrai todo texto e linhas da grade
    const data = await frame.evaluate(() => {
      const rows = [];
      const trs = document.querySelectorAll('tr, .slick-row, div[role="row"]');
      for (const tr of trs) {
        const txt = tr.innerText.trim();
        if (txt) rows.push(txt.replace(/\t+/g, ' | ').replace(/\n+/g, ' '));
      }
      return {
        totalRows: rows.length,
        rows: rows.slice(0, 30),
        bodySnippet: document.body.innerText.slice(0, 2000)
      };
    });

    console.log("Total rows na grade:", data.totalRows);
    console.log("Amostra das linhas:", JSON.stringify(data.rows, null, 2));
    console.log("Body snippet:", data.bodySnippet.slice(0, 600));

  } catch (err) {
    console.error("Erro no teste da grade:", err);
  } finally {
    await client.close();
  }
}

testGrid();

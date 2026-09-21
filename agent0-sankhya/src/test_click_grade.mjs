import { SankhyaClient } from "../src/sankhya_client.mjs";

async function testClickGrade() {
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
    await searchInput.fill("FUSION123");
    await searchInput.press("Enter");
    await client.page.waitForTimeout(3000);

    // Clica em "Mostrar grade"
    const gradeBtn = frame.locator('text="Mostrar grade"').first();
    console.log("gradeBtn visivel?", await gradeBtn.isVisible().catch(() => false));
    await gradeBtn.click({ force: true });
    await client.page.waitForTimeout(5000);

    await client.page.screenshot({ path: "./scratch_grade_after_click.png" });
    console.log("Screenshot scratch_grade_after_click.png salvo!");

    // Extrai o conteúdo da grade
    const info = await frame.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('tr, .slick-row, div[role="row"]')).map(r => r.innerText.trim()).filter(Boolean);
      return {
        rowsCount: rows.length,
        rowsSample: rows.slice(0, 30)
      };
    });

    console.log("Grade rows count:", info.rowsCount);
    console.log("Grade sample:", JSON.stringify(info.rowsSample, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

testClickGrade();

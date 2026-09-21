import { SankhyaClient } from "../src/sankhya_client.mjs";

async function testSearchInGrade() {
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

    // Se estiver na tela inicial de busca ou na grade:
    const gradeBtn = frame.locator('text="Mostrar grade"').first();
    if (await gradeBtn.isVisible().catch(() => false)) {
      await gradeBtn.click({ force: true });
      await client.page.waitForTimeout(3000);
    }

    const gridSearch = frame.locator('input[placeholder*="Pesquisar registros"], input.SearchAppText-input, input[name*="search"]').first();
    await gridSearch.waitFor({ state: "visible", timeout: 15000 });
    console.log("Digitando FUSION123 no campo 'Pesquisar registros...' da grade...");
    await gridSearch.fill("FUSION123");
    await gridSearch.press("Enter");
    await client.page.waitForTimeout(6000);

    await client.page.screenshot({ path: "./scratch_grade_searched.png" });
    console.log("Screenshot scratch_grade_searched.png salvo!");

    const rows = await frame.evaluate(() => {
      return Array.from(document.querySelectorAll('.slick-row, tr, div[role="row"]')).map(r => r.innerText.trim()).filter(Boolean);
    });

    console.log("Linhas na grade encontradas:", rows.length);
    console.log(JSON.stringify(rows.slice(0, 30), null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

testSearchInGrade();

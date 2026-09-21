import { SankhyaClient } from "./src/sankhya_client.mjs";

async function run() {
  const client = new SankhyaClient({ headless: true });
  await client.init();
  await client.authenticate();
  const popupBtn = client.page.locator('button:has-text("Não")').first();
  if (await popupBtn.isVisible({ timeout: 4000 }).catch(() => false)) await popupBtn.click();
  const frame = await client.openProductsScreen();
  const searchInput = frame.locator('input.query-input:visible, input[placeholder*="procura"]:visible, input.search-input:visible, input[type="text"]:visible').first();
  await searchInput.waitFor({ state: "visible", timeout: 15000 });
  await searchInput.fill("FUSION130");
  await searchInput.press("Enter");
  await client.page.waitForTimeout(4000);
  const text = await frame.evaluate(() => document.body.innerText);
  console.log("FUSION130 RAW:\n", text.slice(0, 1000));
  await client.close();
}

run();

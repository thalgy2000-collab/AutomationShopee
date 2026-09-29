import { getShopeeBrowserContext } from './agent5-shopee-attributes/src/browser.mjs';

async function checkDomAttributes() {
  const { context, page } = await getShopeeBrowserContext({ headless: true });
  
  const testId = '22198185106';
  console.log(`Navegando para o produto ${testId}...`);
  await page.goto(`https://seller.shopee.com.br/portal/product/${testId}`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(4000);

  const productData = await page.evaluate(() => {
    // Busca os atributos nas seções de formulário da Shopee
    const results = [];
    const formItems = document.querySelectorAll('.product-edit-form-item, .shopee-form-item');
    for (const item of formItems) {
      const label = item.querySelector('.shopee-form-item__label, .product-edit-form-item__label')?.textContent?.trim();
      const input = item.querySelector('input, .shopee-selector, .shopee-input');
      const val = input?.value || input?.textContent?.trim() || '';
      if (label && val) {
        results.push({ label, val: val.substring(0, 100) });
      }
    }
    return results;
  });

  console.log(`Atributos detectados no produto ${testId}:`, productData.length);
  for (const a of productData) {
    console.log(` - ${a.label}: "${a.val}"`);
  }

  await context.close();
}

checkDomAttributes().catch(console.error);

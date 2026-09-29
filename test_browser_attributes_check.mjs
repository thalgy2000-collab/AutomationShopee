import { getShopeeBrowserContext } from './agent5-shopee-attributes/src/browser.mjs';

async function testIntercept() {
  console.log('🚀 Conectando ao navegador persistente...');
  const { context, page } = await getShopeeBrowserContext({ headless: true });
  
  let capturedCds = null;
  page.on('request', req => {
    const u = req.url();
    if (u.includes('SPC_CDS=')) {
      const match = u.match(/SPC_CDS=([a-f0-9\-]+)/);
      if (match && !capturedCds) {
        capturedCds = match[1];
        console.log('🎉 CAPTUROU SPC_CDS AUTOMATICAMENTE DO NAVEGADOR:', capturedCds);
      }
    }
  });

  console.log('Navegando para lista de produtos...');
  await page.goto('https://seller.shopee.com.br/portal/product/list/all', { waitUntil: 'load', timeout: 30000 }).catch(e => console.log('Goto notice:', e.message));
  
  await page.waitForTimeout(3000);
  console.log('URL atual:', page.url());
  console.log('SPC_CDS capturado:', capturedCds);
  
  if (capturedCds) {
    const testId = '22198185106';
    const detail = await page.evaluate(async ({ id, cds }) => {
      const url = `/api/v3/product/get_product_detail/?item_id=${id}&source=seller_center&SPC_CDS=${cds}&SPC_CDS_VER=2`;
      const res = await fetch(url);
      return await res.json();
    }, { id: testId, cds: capturedCds });
    
    console.log('Resultado do get_product_detail dentro da página:');
    console.log('Código:', detail.code);
    console.log('Name:', detail.data?.name);
    console.log('Attributes count:', detail.data?.attribute_list?.length);
    console.log('Attributes:', JSON.stringify(detail.data?.attribute_list, null, 2));
  } else {
    // If not on product list or redirected, check cookies
    const cookies = await context.cookies();
    const cdsCookie = cookies.find(c => c.name === 'SPC_CDS');
    console.log('Cookie SPC_CDS encontrado?', cdsCookie ? cdsCookie.value : 'Não');
  }
  
  await context.close();
}

testIntercept().catch(console.error);

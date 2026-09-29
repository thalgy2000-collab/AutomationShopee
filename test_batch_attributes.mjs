import fs from 'node:fs';
import path from 'node:path';
import XLSX from './agent3-rpa-magis5/node_modules/xlsx/xlsx.js';
import { getShopeeBrowserContext } from './agent5-shopee-attributes/src/browser.mjs';

const COOKIE_STRING = `SPC_F=blbpbXAkN6mwqIUMUol3xcAwuN3jxfZz; REC_T_ID=514c73b8-94d8-11f1-9f12-a26019125554; language=pt-BR; SPC_CLIENTID=YmxicGJYQWtONm13dmtztsuegjpazhvp; SC_DFP=zwhctQoEZMhiUaZvTWOVUbvsYVGIRPUJ; _gcl_au=1.1.1688578987.1786448301; _ga=GA1.1.848442999.1786448301; _fbp=fb.2.1786448301322.185081183116080780; SPC_EC=-; _med=affiliates; _ga_VF5H5BSHNS=GS2.1.s1789479390$o2$g1$t1789479391$j59$l0$h0; SPC_SI=K6GNagAAAABVdFVEZ0k2QrOYNwgAAAAAR0FrdVk5RTQ=; SPC_SC_MAIN_SHOP_SA_UD=0; SPC_CDS_CHAT=cac80750-5aa5-43e1-a610-0ada9691a33c; csrftoken=cx3DXBCncNw9UZOtZMZhQy9k1YKskKz8; _gcl_aw=GCL.1790180946.Cj0KCQjwvJHIBhCgARIsAEQnWlBf8ZBkg0Q9Ch8_YJHpG1P8H8wLXYMpRc25hkryHz1HgSjY2SzUjjgaAh4GEALw_wcB; _gcl_gs=2.1.k1$i1790180942$u53233770; sense_sa_r=s; _ga_T69DLR1QPG=GS2.1.s1790180946$o133$g1$t1790182878$j60$l1$h1524968161; SPC_ST=fm+0/P+hWCE1UiVaYFJM1HQYJuqPyGV23MFI+/OUFY56D3GW/zK8jbwF8myNQNrnanbGq3hd/21+lTJC1L4+7qUWY6yn8+5qQpdeDIplmGJXxwBK/3Z6uCohzm2Vev+4rhpDWuPNK1b0zLAgi+U/WvhSvB6E3cofqoRCh60C6gHzbMc2oY/CZJBSv7HWBYhCgoKsWqoFCpBXI57yXZo1DQ==.APSSA5Gedu7OQxJoCRIR+oK1tNFQ7mhYkXehwd98KAHa; SPC_U=1111933939; SPC_SC_SESSION=gDaXVJ8e5g3wjAYUxN2VvB77T4qfu4+k7JKIhFvD1nj3a4hKDC/36bdrRcyOnTamWE6EkoaU1LS+0hQlDO3my0aHKvOqUxhcZHfXBAtbNQRB9bubNcL6fbjujVm205ODk0gp0j8Dx/wpJ1Odu0jhxlgB+ZzFlZtJKnALkfyEc9r3FMzfrPdc2Uopxd8zPIJLmNvhs8uRP9MBZ3Dy3Ee19+ogYMzEjaz0kyOKIcFhC5bSXrk2vhDPXS48Lx3rrYBTO3kH4lWu6z3avTw8GzEuGTQ==_1_1111933939; SPC_STK=rt23kgzsOewvg8stsqHkHf3uCt55vYUMnNpCBssQPMKrKdUhLpe741XIW0UVB0IcjtzxElTzKBJxBynGXRNfirb9Tq0yBzDPGFrvEPa9eHuWiatfskPwMBaLQwKjoxTYkSf5+5Al2Um8zC8VnahkfvWojZddQydQ1rwVkn0+im/UkHrF5g8KNb4Kp21m8uMpDA+0yoJmInmVIRt3urER7w+20kHqdc2/asMF1Cw3pnGbL/b5NhTsDIUt3yGz4rT+X9WS6d73DRJppM+TsBuM7gYBcm9iVg0li6dAfzL4KGK5VAI4a3OpdUh/TGI8bC84nBC8a8q72Tk2T3JIefDIV5tCgACRHnXQCykVvvtEOZgCCwrqe7I18R6GDToG4yd4q6fbarz2z61LmJIv/NCu1CrmVcdC9Lop20cgyXUSuHUc6YiMGr1FDUmyJICvr0sQk3JS6yFL+bPSIkEoORoMzqQlAegEaE/2i140wQLOVbJ8C4VsCSCeMTLjnf1js1HK; SPC_R_T_ID=UDchGXWFt8Zv6cPwn6+RDIroofS7DQ+XDpavGv7GS3DraGdTBFYtTSNi8HcEG/c8TuQyHz87/wdn11JfvU7mmxIU1vGH36ZN2vJUk58a6EE5p+J1k2ia8QtgyHf34TLqtKAUgoqfn2xeiTLwmNtuv5F2YxXa+6M6qnZc5iq0Lhs=; SPC_R_T_IV=dGtkSkNIWWVobVpCWU0xcw==; SPC_T_ID=UDchGXWFt8Zv6cPwn6+RDIroofS7DQ+XDpavGv7GS3DraGdTBFYtTSNi8HcEG/c8TuQyHz87/wdn11JfvU7mmxIU1vGH36ZN2vJUk58a6EE5p+J1k2ia8QtgyHf34TLqtKAUgoqfn2xeiTLwmNtuv5F2YxXa+6M6qnZc5iq0Lhs=; SPC_T_IV=dGtkSkNIWWVobVpCWU0xcw==; CTOKEN=YxDJV7eHEfGff4rNR2YnFA%3D%3D`;

async function testBatch() {
  const { context, page } = await getShopeeBrowserContext({ headless: true });

  const rawCookies = COOKIE_STRING.split(';').map(c => c.trim()).filter(Boolean);
  const cookieList = [];

  for (const pair of rawCookies) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const name = pair.substring(0, idx).trim();
    const value = pair.substring(idx + 1).trim();
    for (const domain of ['.shopee.com.br', 'seller.shopee.com.br']) {
      cookieList.push({
        name,
        value,
        domain,
        path: '/',
        httpOnly: name === 'SPC_SC_SESSION' || name === 'SPC_ST',
        secure: true,
        sameSite: 'Lax'
      });
    }
  }

  await context.addCookies(cookieList);

  let capturedCds = null;
  page.on('request', req => {
    const u = req.url();
    if (u.includes('SPC_CDS=')) {
      const match = u.match(/SPC_CDS=([a-f0-9\-]+)/);
      if (match && !capturedCds) capturedCds = match[1];
    }
  });

  console.log('Navegando para o Seller Center para obter sessão e SPC_CDS...');
  await page.goto('https://seller.shopee.com.br/portal/product/list/all', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  console.log('SPC_CDS obtido:', capturedCds);

  const sampleIds = ['22198185106', '20097921260', '21599336620', '22793677388', '22694072427'];
  console.log(`Testando lote de ${sampleIds.length} produtos via page.evaluate...`);

  const results = await page.evaluate(async ({ ids, cds }) => {
    const list = [];
    for (const id of ids) {
      try {
        const url = `/api/v3/product/get_product_info?SPC_CDS=${cds}&SPC_CDS_VER=2&product_id=${id}&is_draft=false`;
        const res = await fetch(url);
        const data = await res.json();
        const p = data?.data?.product_info;
        if (p) {
          // Calcula estoque total disponível em todas as variações
          let totalStock = 0;
          if (p.model_list && p.model_list.length > 0) {
            for (const m of p.model_list) {
              totalStock += Number(m.stock_detail?.total_available_stock || 0);
            }
          } else {
            totalStock = Number(p.stock || 0);
          }

          list.push({
            id: p.id,
            name: p.name,
            sku: p.parent_sku,
            attributesCount: p.attributes?.length || 0,
            attributes: p.attributes || [],
            totalStock,
            categoryPath: p.category_path_name_list || []
          });
        } else {
          list.push({ id, error: data?.msg || 'Nao retornou product_info' });
        }
      } catch (e) {
        list.push({ id, error: e.message });
      }
    }
    return list;
  }, { ids: sampleIds, cds: capturedCds });

  console.log('Resultado da amostragem em tempo real:');
  for (const item of results) {
    console.log(`\n📦 [Produto ${item.id}] SKU: ${item.sku || 'N/A'}`);
    console.log(` - Nome: "${item.name}"`);
    console.log(` - Atributos Reais: ${item.attributesCount}`);
    if (item.attributes && item.attributes.length > 0) {
      console.log(`   Valores:`, JSON.stringify(item.attributes));
    }
    console.log(` - Estoque Total Disponível: ${item.totalStock} unidades`);
    console.log(` - Categoria Oficial Shopee:`, item.categoryPath.join(' > '));
  }

  await context.close();
}

testBatch().catch(console.error);

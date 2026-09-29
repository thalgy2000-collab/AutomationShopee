import fs from 'node:fs';
import path from 'node:path';
import XLSX from './agent3-rpa-magis5/node_modules/xlsx/xlsx.js';
import { getShopeeBrowserContext } from './agent5-shopee-attributes/src/browser.mjs';

const COOKIE_STRING = `SPC_F=blbpbXAkN6mwqIUMUol3xcAwuN3jxfZz; REC_T_ID=514c73b8-94d8-11f1-9f12-a26019125554; language=pt-BR; SPC_CLIENTID=YmxicGJYQWtONm13dmtztsuegjpazhvp; SC_DFP=zwhctQoEZMhiUaZvTWOVUbvsYVGIRPUJ; _gcl_au=1.1.1688578987.1786448301; _ga=GA1.1.848442999.1786448301; _fbp=fb.2.1786448301322.185081183116080780; SPC_EC=-; _med=affiliates; _ga_VF5H5BSHNS=GS2.1.s1789479390$o2$g1$t1789479391$j59$l0$h0; SPC_SI=K6GNagAAAABVdFVEZ0k2QrOYNwgAAAAAR0FrdVk5RTQ=; SPC_SC_MAIN_SHOP_SA_UD=0; SPC_CDS_CHAT=cac80750-5aa5-43e1-a610-0ada9691a33c; csrftoken=cx3DXBCncNw9UZOtZMZhQy9k1YKskKz8; _gcl_aw=GCL.1790180946.Cj0KCQjwvJHIBhCgARIsAEQnWlBf8ZBkg0Q9Ch8_YJHpG1P8H8wLXYMpRc25hkryHz1HgSjY2SzUjjgaAh4GEALw_wcB; _gcl_gs=2.1.k1$i1790180942$u53233770; sense_sa_r=s; _ga_T69DLR1QPG=GS2.1.s1790180946$o133$g1$t1790182878$j60$l1$h1524968161; SPC_ST=fm+0/P+hWCE1UiVaYFJM1HQYJuqPyGV23MFI+/OUFY56D3GW/zK8jbwF8myNQNrnanbGq3hd/21+lTJC1L4+7qUWY6yn8+5qQpdeDIplmGJXxwBK/3Z6uCohzm2Vev+4rhpDWuPNK1b0zLAgi+U/WvhSvB6E3cofqoRCh60C6gHzbMc2oY/CZJBSv7HWBYhCgoKsWqoFCpBXI57yXZo1DQ==.APSSA5Gedu7OQxJoCRIR+oK1tNFQ7mhYkXehwd98KAHa; SPC_U=1111933939; SPC_SC_SESSION=gDaXVJ8e5g3wjAYUxN2VvB77T4qfu4+k7JKIhFvD1nj3a4hKDC/36bdrRcyOnTamWE6EkoaU1LS+0hQlDO3my0aHKvOqUxhcZHfXBAtbNQRB9bubNcL6fbjujVm205ODk0gp0j8Dx/wpJ1Odu0jhxlgB+ZzFlZtJKnALkfyEc9r3FMzfrPdc2Uopxd8zPIJLmNvhs8uRP9MBZ3Dy3Ee19+ogYMzEjaz0kyOKIcFhC5bSXrk2vhDPXS48Lx3rrYBTO3kH4lWu6z3avTw8GzEuGTQ==_1_1111933939; SPC_STK=rt23kgzsOewvg8stsqHkHf3uCt55vYUMnNpCBssQPMKrKdUhLpe741XIW0UVB0IcjtzxElTzKBJxBynGXRNfirb9Tq0yBzDPGFrvEPa9eHuWiatfskPwMBaLQwKjoxTYkSf5+5Al2Um8zC8VnahkfvWojZddQydQ1rwVkn0+im/UkHrF5g8KNb4Kp21m8uMpDA+0yoJmInmVIRt3urER7w+20kHqdc2/asMF1Cw3pnGbL/b5NhTsDIUt3yGz4rT+X9WS6d73DRJppM+TsBuM7gYBcm9iVg0li6dAfzL4KGK5VAI4a3OpdUh/TGI8bC84nBC8a8q72Tk2T3JIefDIV5tCgACRHnXQCykVvvtEOZgCCwrqe7I18R6GDToG4yd4q6fbarz2z61LmJIv/NCu1CrmVcdC9Lop20cgyXUSuHUc6YiMGr1FDUmyJICvr0sQk3JS6yFL+bPSIkEoORoMzqQlAegEaE/2i140wQLOVbJ8C4VsCSCeMTLjnf1js1HK; SPC_R_T_ID=UDchGXWFt8Zv6cPwn6+RDIroofS7DQ+XDpavGv7GS3DraGdTBFYtTSNi8HcEG/c8TuQyHz87/wdn11JfvU7mmxIU1vGH36ZN2vJUk58a6EE5p+J1k2ia8QtgyHf34TLqtKAUgoqfn2xeiTLwmNtuv5F2YxXa+6M6qnZc5iq0Lhs=; SPC_R_T_IV=dGtkSkNIWWVobVpCWU0xcw==; SPC_T_ID=UDchGXWFt8Zv6cPwn6+RDIroofS7DQ+XDpavGv7GS3DraGdTBFYtTSNi8HcEG/c8TuQyHz87/wdn11JfvU7mmxIU1vGH36ZN2vJUk58a6EE5p+J1k2ia8QtgyHf34TLqtKAUgoqfn2xeiTLwmNtuv5F2YxXa+6M6qnZc5iq0Lhs=; SPC_T_IV=dGtkSkNIWWVobVpCWU0xcw==; CTOKEN=YxDJV7eHEfGff4rNR2YnFA%3D%3D`;

async function checkDts() {
  const wb = XLSX.readFile('C:/Users/marke/Downloads/Relatorio_Diagnostico_Produtos_Ativos_Shopee_AoVivo.xlsx');
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

  // Filtra produtos SEM _FULL no SKU
  const semFull = rows.filter(r => !String(r['SKU Principal'] || '').toUpperCase().includes('_FULL'));
  console.log(`📦 Total de produtos SEM _FULL para verificar DTS: ${semFull.length}`);

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

  await page.goto('https://seller.shopee.com.br/portal/product/list/all', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  console.log(`🔑 Sessão Ativa | SPC_CDS: ${capturedCds}`);

  const ids = semFull.map(r => String(r['ID do Item'] || '').trim()).filter(Boolean);

  const results = [];
  const BATCH_SIZE = 20;

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    process.stdout.write(`Consultando lote ${Math.floor(i / BATCH_SIZE) + 1} de ${Math.ceil(ids.length / BATCH_SIZE)}...\r`);

    const batchRes = await page.evaluate(async ({ bIds, cds }) => {
      const out = [];
      for (const id of bIds) {
        try {
          const res = await fetch(`/api/v3/product/get_product_info?SPC_CDS=${cds}&SPC_CDS_VER=2&product_id=${id}&is_draft=false`);
          const data = await res.json();
          const p = data?.data?.product_info;
          if (p) {
            // Checa DTS a nivel de produto ou primeiro modelo
            const preOrder = p.pre_order_info?.pre_order ?? p.model_list?.[0]?.pre_order_info?.pre_order ?? false;
            const daysToShip = p.pre_order_info?.days_to_ship ?? p.model_list?.[0]?.pre_order_info?.days_to_ship ?? 2;
            out.push({
              id: String(p.id),
              sku: p.parent_sku,
              nome: p.name,
              preOrder,
              daysToShip
            });
          }
        } catch {}
      }
      return out;
    }, { bIds: batch, cds: capturedCds });

    results.push(...batchRes);
  }

  await context.close();

  console.log(`\n\n✅ Auditoria de DTS concluída para ${results.length} produtos SEM _FULL!`);

  // Identifica produtos SEM _FULL que NÃO estão com prazo de produção (DTS <= 2 dias ou preOrder == false)
  const semPrazoProducao = results.filter(r => !r.preOrder || r.daysToShip <= 2);
  const comPrazoProducao = results.filter(r => r.preOrder && r.daysToShip >= 7);

  console.log(`\n================ RESULTADO DA AUDITORIA DE PRAZO DE PRODUÇÃO ================`);
  console.log(`🚨 Produtos SEM _FULL mas COM PRAZO DE 2 DIAS (SEM prazo de 9 dias): ${semPrazoProducao.length}`);
  console.log(`✅ Produtos SEM _FULL que JÁ ESTÃO com Pré-encomenda (7-9+ dias):      ${comPrazoProducao.length}`);
  console.log(`=============================================================================\n`);

  if (semPrazoProducao.length > 0) {
    console.log('Top 15 Produtos com ERRO CRÍTICO (Sem _FULL, mas configurados como Pronta Entrega de 2 dias):');
    for (let i = 0; i < Math.min(15, semPrazoProducao.length); i++) {
      const p = semPrazoProducao[i];
      console.log(`[${i+1}] ID: ${p.id} | SKU: ${p.sku} | DTS Atual: ${p.daysToShip} dias | Pré-Venda: ${p.preOrder ? 'Sim' : 'NÃO'}`);
      console.log(`    Nome: "${p.nome}"`);
    }
  }

  // Salva relatório detalhado
  const dtsReport = results.map(r => ({
    'ID do Item': r.id,
    'SKU Principal': r.sku,
    'Produto': r.nome,
    'Classificação Interna': 'Produção Sob Encomenda (Sem _FULL)',
    'Status Pré-Encomenda na Shopee': r.preOrder ? '✅ Pré-Encomenda Ativa' : '🚨 PRONTA ENTREGA (ERRO)',
    'Dias para Envio Atual (DTS)': `${r.daysToShip} dias`,
    'Prazo Correto Necessário': '9 dias de produção',
    'Risco Operacional': (!r.preOrder || r.daysToShip <= 2) ? '🔥 CRÍTICO: Risco de cancelamento automático pela Shopee por atraso de envio (48h)' : 'Normal',
    'Ação Recomendada': (!r.preOrder || r.daysToShip <= 2) ? 'Alterar DTS para 9 dias imediatamente na Shopee ou Magis5' : 'Nenhuma alteração necessária'
  }));

  const dtsWb = XLSX.utils.book_new();
  const dtsSheet = XLSX.utils.json_to_sheet(dtsReport);
  XLSX.utils.book_append_sheet(dtsWb, dtsSheet, 'Auditoria_Prazo_DTS');
  
  const outPath = 'C:/Users/marke/Downloads/Auditoria_Prazo_Producao_Sem_FULL.xlsx';
  XLSX.writeFile(dtsWb, outPath);
  console.log(`\n💾 Relatório específico salvo em: ${outPath}`);
}

checkDts().catch(console.error);

import pw from './agent3-rpa-magis5/node_modules/playwright/index.js';
const { chromium } = pw;
import path from 'node:path';
import fs from 'node:fs';

const COOKIE_STRING = `ca_gen_id=7337248455; SPC_F=blbpbXAkN6mwqIUMUol3xcAwuN3jxfZz; REC_T_ID=514c73b8-94d8-11f1-9f12-a26019125554; language=pt-BR; SPC_CLIENTID=YmxicGJYQWtONm13dmtztsuegjpazhvp; SC_DFP=zwhctQoEZMhiUaZvTWOVUbvsYVGIRPUJ; _QPWSDCXHZQA=1c78ac92-edae-4326-d063-40d87ffb77bf; REC7iLP4Q=52ebfc93-06fc-4ceb-90b8-91148d373c64; fulfillment-language=pt-br; _gcl_au=1.1.1688578987.1786448301; _ga=GA1.1.848442999.1786448301; _fbp=fb.2.1786448301322.185081183116080780; SPC_EC=-; _med=affiliates; _ga_VF5H5BSHNS=GS2.1.s1789479390$o2$g1$t1789479391$j59$l0$h0; SPC_SI=K6GNagAAAABVdFVEZ0k2QrOYNwgAAAAAR0FrdVk5RTQ=; SPC_SC_MAIN_SHOP_SA_UD=0; SPC_SEC_SI=v1-TlZvenhjS3BSdUd0SnFqSd+qEJv0mQ+2wg4sPa1M0NTJd5dX8KYk3bpueIpHkDbn+UPaKJT2oG5FIh05QTDAIBxlCVc6HF5w2bScSmwFnyI=; SPC_CDS=e795a440-57e5-4979-9f9d-6790155b4b86; SPC_CDS_CHAT=cac80750-5aa5-43e1-a610-0ada9691a33c; _sapid=b483460b69783f61b1de8a09f2db6182920504e33d91338724076bd0; csrftoken=cx3DXBCncNw9UZOtZMZhQy9k1YKskKz8; SPC_ST=zgqYY9SlZ9U0rTKKi7tg4FafTn5hWSQy5N5DMUBd8s4ryZpnXM4nCWkwdf0JevNVt8lQ3mdp/iI9V0uPEeRYW7c1GM2QkS43/PM9bL/h20SfbdWS1uaCmzoAXI78b/oLsEjzdROLvF6wFxYhbNHXdWOW+4XWqXcneLKjG1/0ASfGwvOIfbAXUz1/rnDRdlAnRaekl4C7bVLiqeEXQOwgDA==.ADicAtvcXpgsdBKAbkvkgU95ebTu+Qw97KoEKn7ZkQg; SPC_U=1111933939; SPC_SC_SESSION=gaBv0err2RbwdZFIW0lrohxoKBQEmW76IgzBssNamHRN+NElqKBpiim+oWHw1T0SCFnfzeE95VnUA7tsKcUg6b6O88OQu5UGUGtc8p4DwufFnk5gEQzTIzxoQfuJZ375cuhZ1+J5p0oyzIe6O0BvaDp7rIldMWEb7wVeQQRxdDKBLxFLBsZrpIHxvU7FmqX1s5fenFY460Uy6WqAQPYOHpi+VrXAF69Gt2rlhQDOoLj85gf+OjV/t+OV4w5UaUcGxgI0+1tE1X0+nWTkx3sAy0w==_1_1111933939; SPC_STK=wZ/E0BnzoFOk9OEtAPaCruEgPaXzqPbF+sZIrZyfVRLkZQc+TPwHIEVqcuMEbvPl+M2jrdCkFn5j4nghNjIwm4/mH6czFNjky8UQ1VqhrzMFR7GNKdSj75M7fsgBZvynKS/f8T2eKIMbpQgw/Kx3I72KvyF2+8sEbWuCeAEYbHAEdLMgBm2GjFGYJWPZK+yqbvH5BgAKGHlEEJi1ziEeFZjFoab9zbPiuTeCdjY5JdhDz8mHmWDAIFvfqjPKYxib862JYypnWmoYy2qn/dKQXwGkyEKwXzqUc8RlQE9X/50kT50q6I3+PyPzfb1TCy++RlSVwganT8UuVsoD48iKnUfk0u0V2zJG6udtmAGhajAj2fFGiqbKhyZC5NP+T0zlWhLgc0QIAa2RvUnROz2mFcREKG1vhCXl/1MFKLHMuFdnUSu58mksdvf9cgiVbs7HTRXo6+AJfj6cPNA+bp3+GX9O1VdEB7MeVvJMre/PSMCXTxHpf5dhrYKMyPhOPqRi; SPC_R_T_ID=vHm2Tkp3HDE3Z6iF+LmXHUIWh7HZwYG1fSUJxap+uMf4tNKXdAKl1kcZbTIh8VnsfPyfHCPTt1G9pX2ftntBw188BEdSR4CyJUCRYPP4njPceMa+itBgYzs+o5phnhznZixJ6+5YnYs2WhiZBd8i+H3hqnl266Aq6270HDqjY5I=; SPC_R_T_IV=clczNXozdWdCRVg0YklySQ==; SPC_T_ID=vHm2Tkp3HDE3Z6iF+LmXHUIWh7HZwYG1fSUJxap+uMf4tNKXdAKl1kcZbTIh8VnsfPyfHCPTt1G9pX2ftntBw188BEdSR4CyJUCRYPP4njPceMa+itBgYzs+o5phnhznZixJ6+5YnYs2WhiZBd8i+H3hqnl266Aq6270HDqjY5I=; SPC_T_IV=clczNXozdWdCRVg0YklySQ==; _gcl_aw=GCL.1790180946.Cj0KCQjwvJHIBhCgARIsAEQnWlBf8ZBkg0Q9Ch8_YJHpG1P8H8wLXYMpRc25hkryHz1HgSjY2SzUjjgaAh4GEALw_wcB; _gcl_gs=2.1.k1$i1790180942$u53233770; sense_sa_r=s; _ga_T69DLR1QPG=GS2.1.s1790180946$o133$g1$t1790182878$j60$l1$h1524968161; shopee_webUnique_ccd=b1QpF1R52Bx1ZfWbH5BFDw%3D%3D|6PX56LV4llfN26XLNjXSbfBP5AYYNsDuPR0kgnxa%2Bq3emOORMyURSUN1qEYqTLJuohYCJMQgkRr3LQ%3D%3D|7fiEnL8GfYrO+eh4|08|3; ds=3177689b2462244076cc1a42ef8742c1; CTOKEN=I69BZ7d4EfGl6ZbAXNzTCQ%3D%3D`;

const USER_DATA_DIR = path.resolve('./browser_profile_shopee');

function parseCookies() {
  const cookies = [];
  const parts = COOKIE_STRING.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const name = trimmed.substring(0, eqIdx).trim();
    const value = trimmed.substring(eqIdx + 1).trim();

    cookies.push({
      name,
      value,
      domain: '.shopee.com.br',
      path: '/'
    });
  }
  return cookies;
}

async function injectAndTestSession() {
  console.log('💉 Injetando cookies da sessão capturada no navegador...');
  const cookies = parseCookies();
  console.log(`Total de cookies a injetar: ${cookies.length}`);

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1440,900'
    ]
  });

  await context.addCookies(cookies);
  const page = context.pages()[0] || await context.newPage();

  console.log('🌐 Navegando para o Shopee Seller Center (portal/product/list)...');
  await page.goto('https://seller.shopee.com.br/portal/product/list', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(6000);

  const currentUrl = page.url();
  console.log('URL após navegação com sessão:', currentUrl);

  await page.screenshot({ path: 'screenshots/seller_session_injected_test.png' });
  console.log('📸 Screenshot capturado: screenshots/seller_session_injected_test.png');

  const title = await page.title();
  console.log('Título da página:', title);

  const bodyText = await page.locator('body').innerText().catch(() => '');
  console.log('Snippet do texto da página:', bodyText.substring(0, 300).replace(/[\r\n]+/g, ' '));

  await context.close();
}

injectAndTestSession().catch(console.error);

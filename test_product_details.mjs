import fs from 'node:fs';

const COOKIE_STRING = `ca_gen_id=7337248455; SPC_F=blbpbXAkN6mwqIUMUol3xcAwuN3jxfZz; REC_T_ID=514c73b8-94d8-11f1-9f12-a26019125554; language=pt-BR; SPC_CLIENTID=YmxicGJYQWtONm13dmtztsuegjpazhvp; SC_DFP=zwhctQoEZMhiUaZvTWOVUbvsYVGIRPUJ; _QPWSDCXHZQA=1c78ac92-edae-4326-d063-40d87ffb77bf; REC7iLP4Q=52ebfc93-06fc-4ceb-90b8-91148d373c64; fulfillment-language=pt-br; _gcl_au=1.1.1688578987.1786448301; _ga=GA1.1.848442999.1786448301; _fbp=fb.2.1786448301322.185081183116080780; SPC_EC=-; _med=affiliates; _ga_VF5H5BSHNS=GS2.1.s1789479390$o2$g1$t1789479391$j59$l0$h0; SPC_SI=K6GNagAAAABVdFVEZ0k2QrOYNwgAAAAAR0FrdVk5RTQ=; SPC_SC_MAIN_SHOP_SA_UD=0; SPC_SEC_SI=v1-TlZvenhjS3BSdUd0SnFqSd+qEJv0mQ+2wg4sPa1M0NTJd5dX8KYk3bpueIpHkDbn+UPaKJT2oG5FIh05QTDAIBxlCVc6HF5w2bScSmwFnyI=; SPC_CDS=e795a440-57e5-4979-9f9d-6790155b4b86; SPC_CDS_CHAT=cac80750-5aa5-43e1-a610-0ada9691a33c; _sapid=b483460b69783f61b1de8a09f2db6182920504e33d91338724076bd0; csrftoken=cx3DXBCncNw9UZOtZMZhQy9k1YKskKz8; SPC_ST=zgqYY9SlZ9U0rTKKi7tg4FafTn5hWSQy5N5DMUBd8s4ryZpnXM4nCWkwdf0JevNVt8lQ3mdp/iI9V0uPEeRYW7c1GM2QkS43/PM9bL/h20SfbdWS1uaCmzoAXI78b/oLsEjzdROLvF6wFxYhbNHXdWOW+4XWqXcneLKjG1/0ASfGwvOIfbAXUz1/rnDRdlAnRaekl4C7bVLiqeEXQOwgDA==.ADicAtvcXpgsdBKAbkvkgU95ebTu+Qw9p7KoEKn7ZkQg; SPC_U=1111933939; SPC_SC_SESSION=gaBv0err2RbwdZFIW0lrohxoKBQEmW76IgzBssNamHRN+NElqKBpiim+oWHw1T0SCFnfzeE95VnUA7tsKcUg6b6O88OQu5UGUGtc8p4DwufFnk5gEQzTIzxoQfuJZ375cuhZ1+J5p0oyzIe6O0BvaDp7rIldMWEb7wVeQQRxdDKBLxFLBsZrpIHxvU7FmqX1s5fenFY460Uy6WqAQPYOHpi+VrXAF69Gt2rlhQDOoLj85gf+OjV/t+OV4w5UaUcGxgI0+1tE1X0+nWTkx3sAy0w==_1_1111933939; SPC_STK=wZ/E0BnzoFOk9OEtAPaCruEgPaXzqPbF+sZIrZyfVRLkZQc+TPwHIEVqcuMEbvPl+M2jrdCkFn5j4nghNjIwm4/mH6czFNjky8UQ1VqhrzMFR7GNKdSj75M7fsgBZvynKS/f8T2eKIMbpQgw/Kx3I72KvyF2+8sEbWuCeAEYbHAEdLMgBm2GjFGYJWPZK+yqbvH5BgAKGHlEEJi1ziEeFZjFoab9zbPiuTeCdjY5JdhDz8mHmWDAIFvfqjPKYxib862JYypnWmoYy2qn/dKQXwGkyEKwXzqUc8RlQE9X/50kT50q6I3+PyPzfb1TCy++RlSVwganT8UuVsoD48iKnUfk0u0V2zJG6udtmAGhajAj2fFGiqbKhyZC5NP+T0zlWhLgc0QIAa2RvUnROz2mFcREKG1vhCXl/1MFKLHMuFdnUSu58mksdvf9cgiVbs7HTRXo6+AJfj6cPNA+bp3+GX9O1VdEB7MeVvJMre/PSMCXTxHpf5dhrYKMyPhOPqRi; SPC_R_T_ID=vHm2Tkp3HDE3Z6iF+LmXHUIWh7HZwYG1fSUJxap+uMf4tNKXdAKl1kcZbTIh8VnsfPyfHCPTt1G9pX2ftntBw188BEdSR4CyJUCRYPP4njPceMa+itBgYzs+o5phnhznZixJ6+5YnYs2WhiZBd8i+H3hqnl266Aq6270HDqjY5I=; SPC_R_T_IV=clczNXozdWdCRVg0YklySQ==; SPC_T_ID=vHm2Tkp3HDE3Z6iF+LmXHUIWh7HZwYG1fSUJxap+uMf4tNKXdAKl1kcZbTIh8VnsfPyfHCPTt1G9pX2ftntBw188BEdSR4CyJUCRYPP4njPceMa+itBgYzs+o5phnhznZixJ6+5YnYs2WhiZBd8i+H3hqnl266Aq6270HDqjY5I=; SPC_T_IV=clczNXozdWdCRVg0YklySQ==; _gcl_aw=GCL.1790180946.Cj0KCQjwvJHIBhCgARIsAEQnWlBf8ZBkg0Q9Ch8_YJHpG1P8H8wLXYMpRc25hkryHz1HgSjY2SzUjjgaAh4GEALw_wcB; _gcl_gs=2.1.k1$i1790180942$u53233770; sense_sa_r=s; _ga_T69DLR1QPG=GS2.1.s1790180946$o133$g1$t1790182878$j60$l1$h1524968161; shopee_webUnique_ccd=b1QpF1R52Bx1ZfWbH5BFDw%3D%3D|6PX56LV4llfN26XLNjXSbfBP5AYYNsDuPR0kgnxa%2Bq3emOORMyURSUN1qEYqTLJuohYCJMQgkRr3LQ%3D%3D|7fiEnL8GfYrO+eh4|08|3; ds=3177689b2462244076cc1a42ef8742c1; CTOKEN=I69BZ7d4EfGl6ZbAXNzTCQ%3D%3D`;

const SPC_CDS = 'e795a440-57e5-4979-9f9d-6790155b4b86';

const HEADERS = {
  'accept': 'application/json, text/plain, */*',
  'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  'caller-source': 'local_pc',
  'cookie': COOKIE_STRING,
  'locale': 'pt-br',
  'referer': 'https://seller.shopee.com.br/portal/product/list/all',
  'sc-fe-session': '385912E9D4DE4715',
  'sc-fe-ver': '21.167392',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36'
};

async function testProductDetails() {
  // 1. Listagem dos produtos
  console.log('1. Listando produtos da loja via search_product_list (buscando item_id_list=22198185106)...');
  const listUrl = `https://seller.shopee.com.br/api/v3/product/search_product_list/?item_id_list=22198185106&SPC_CDS=${SPC_CDS}&SPC_CDS_VER=2`;
  const res1 = await fetch(listUrl, { headers: HEADERS });
  const data1 = await res1.json();

  if (data1.data && data1.data.list) {
    console.log(`✅ ${data1.data.list.length} produtos retornados da loja!`);
    const first = data1.data.list[0];
    console.log('Exemplo de produto retornado:');
    console.log(' - ID:', first.id);
    console.log(' - SKU:', first.parent_sku);
    console.log(' - Nome:', first.name);
    console.log(' - Marca:', first.brand);
    console.log(' - Categoria Path:', first.category_path);
    console.log(' - Atributos:', JSON.stringify(first.attributes, null, 2));
    console.log(' - Variações:', first.model_list ? first.model_list.length : 0);
  } else {
    console.log('Resposta search_product_list:', JSON.stringify(data1, null, 2));
  }
}

testProductDetails().catch(console.error);

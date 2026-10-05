const skus = ['C02887BL', 'C02883', 'C01826BL'];
const domains = ['https://brkfishing.com.br', 'https://www.brkagro.com.br', 'https://www.brkmotors.com.br'];

async function test() {
  for (const sku of skus) {
    console.log('\n=============================================');
    console.log('Testing SKU:', sku);
    for (const d of domains) {
      try {
        const t0 = Date.now();
        const url = `${d}/search/suggest.json?q=${encodeURIComponent(sku)}&resources[type]=product`;
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const dur = Date.now() - t0;
        console.log(`[${d}] HTTP ${res.status} (${dur}ms)`);
        if (res.ok) {
          const json = await res.json();
          const prods = json?.resources?.results?.products || [];
          console.log(`  Found ${prods.length} products`);
          if (prods.length > 0) {
            for (let i = 0; i < Math.min(prods.length, 3); i++) {
              console.log(`    #${i}: handle=${prods[i].handle} title="${prods[i].title}" url=${prods[i].url}`);
            }
            // Testa product json
            const pRes = await fetch(`${d}/products/${prods[0].handle}.js`);
            if (pRes.ok) {
              const pData = await pRes.json();
              const varSkus = (pData.variants || []).map(v => v.sku);
              console.log(`    Product variants SKUs (${varSkus.length}):`, varSkus.slice(0, 5));
              console.log(`    Images count:`, (pData.images || []).length);
              console.log(`    Images[0]:`, (pData.images || [])[0]);
              console.log(`    Images[0] type:`, typeof (pData.images || [])[0]);
            }
          }
        }
      } catch (e) {
        console.log(`[${d}] ERROR: ${e.message}`);
      }
    }
  }
}
test();

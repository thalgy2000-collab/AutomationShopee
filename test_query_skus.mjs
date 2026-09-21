import { SankhyaClient } from "./agent0-sankhya/src/sankhya_client.mjs";

async function testQuery() {
  const client = new SankhyaClient({ headless: true });
  try {
    await client.init();
    await client.authenticate();
    await client.openProductsScreen();

    for (const testSku of ["C02846BL", "C02846BL_FULL", "C02849BL_FULL"]) {
      console.log(`\n================== TESTANDO: ${testSku} ==================`);
      const items = await client.querySku(testSku);
      console.log(`Itens retornados para ${testSku} (${items.length}):`);
      console.dir(items, { depth: null });
    }

  } catch (e) {
    console.error("Erro na busca:", e);
  } finally {
    await client.close().catch(() => {});
  }
}

testQuery();

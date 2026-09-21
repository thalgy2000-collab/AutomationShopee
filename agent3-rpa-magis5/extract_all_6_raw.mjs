import { writeFile } from "node:fs/promises";

const TARGETS = [
  { id: "58252031133", sku: "C02362_FULL", name: "Camisa Cowboy Texas Long Horn", url: "https://shopee.com.br/product/1111622900/58252031133/" },
  { id: "22498158007", sku: "ALL_C0_TIMÃOCORINTHIAS", name: "Camisa Gaviões da Fiel", url: "https://shopee.com.br/product/1111622900/22498158007/" },
  { id: "23297692074", sku: "C01076_FULL", name: "Camisa Agronomia Rodeio", url: "https://shopee.com.br/product/1111622900/23297692074/" },
  { id: "23998922043", sku: "C01946_FULL", name: "Camisa Preta Yellowstone", url: "https://shopee.com.br/product/1111622900/23998922043/" },
  { id: "23993590640", sku: "BT000", name: "Botina Couro Country Trator", url: "https://shopee.com.br/product/1111622900/23993590640/" },
  { id: "23694437282", sku: "C02350_FULL", name: "Camisa Eu Sou do Agro A Paixão de Cristo", url: "https://shopee.com.br/product/1111622900/23694437282/" },
];

async function run() {
  const extracted = [];

  for (const item of TARGETS) {
    console.log(`\n========================================`);
    console.log(`Fetching: ${item.name} (${item.id})`);
    try {
      const res = await fetch(item.url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
          "Cache-Control": "no-cache",
        },
      });

      const html = await res.text();
      console.log(`Status: ${res.status} | HTML Size: ${html.length} bytes`);

      // Title
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      const pageTitle = titleMatch ? titleMatch[1].trim() : "";

      // Meta tags
      const metas = [];
      const metaRegex = /<meta\s+([^>]+)>/gi;
      let m;
      while ((m = metaRegex.exec(html)) !== null) {
        metas.push(m[1]);
      }

      // Open Graph & Twitter & Product tags
      const ogData = {};
      metas.forEach(attrStr => {
        const propMatch = attrStr.match(/(?:property|name)=["']([^"']+)["']/i);
        const contentMatch = attrStr.match(/content=["']([^"']*)["']/i);
        if (propMatch && contentMatch) {
          ogData[propMatch[1]] = contentMatch[1];
        }
      });

      // LD+JSON scripts
      const ldJsons = [];
      const ldRegex = /<script\s+type=["']application\/ld\+json["']>([^<]+)<\/script>/gi;
      let ld;
      while ((ld = ldRegex.exec(html)) !== null) {
        try {
          ldJsons.push(JSON.parse(ld[1]));
        } catch (e) {
          ldJsons.push(ld[1]);
        }
      }

      console.log(`Título da Página: ${pageTitle}`);
      console.log(`OG Title: ${ogData["og:title"] || "N/A"}`);
      console.log(`OG Description: ${ogData["og:description"] || ogData["description"] || "N/A"}`);
      console.log(`OG Image: ${ogData["og:image"] || "N/A"}`);
      console.log(`Preço (OG/Meta/LD): ${ogData["product:price:amount"] || ogData["og:price:amount"] || "N/A"}`);
      console.log(`LD+JSON blocks: ${ldJsons.length}`);
      if (ldJsons.length > 0) {
        console.log("LD Sample:", JSON.stringify(ldJsons[0], null, 2).substring(0, 400));
      }

      extracted.push({
        target: item,
        pageTitle,
        ogData,
        ldJsons,
      });

    } catch (err) {
      console.error(`Erro ao buscar ${item.id}:`, err.message);
    }
  }

  await writeFile("./screenshots/burning_ads/html_extracted_data.json", JSON.stringify(extracted, null, 2), "utf-8");
  console.log("\nDados salvos em screenshots/burning_ads/html_extracted_data.json");
}

run();

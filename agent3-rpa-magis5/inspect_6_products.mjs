import { chromium } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const TARGETS = [
  { id: "58252031133", sku: "C02362_FULL", name: "Camisa Cowboy Texas Long Horn", url: "https://shopee.com.br/product/1111622900/58252031133/" },
  { id: "22498158007", sku: "ALL_C0_TIMÃOCORINTHIAS", name: "Camisa Gaviões da Fiel", url: "https://shopee.com.br/product/1111622900/22498158007/" },
  { id: "23297692074", sku: "C01076_FULL", name: "Camisa Agronomia Rodeio", url: "https://shopee.com.br/product/1111622900/23297692074/" },
  { id: "23998922043", sku: "C01946_FULL", name: "Camisa Preta Yellowstone", url: "https://shopee.com.br/product/1111622900/23998922043/" },
  { id: "23993590640", sku: "BT000", name: "Botina Couro Country Trator", url: "https://shopee.com.br/product/1111622900/23993590640/" },
  { id: "23694437282", sku: "C02350_FULL", name: "Camisa Eu Sou do Agro A Paixão de Cristo", url: "https://shopee.com.br/product/1111622900/23694437282/" },
];

async function run() {
  const screenshotsDir = resolve("./screenshots/burning_ads");
  await mkdir(screenshotsDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled"],
  });

  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    locale: "pt-BR",
  });

  const page = await context.newPage();

  // 1. Acessa Shopee e resolve cookies/idioma uma vez para toda a sessão
  console.log("🌐 Abrindo Shopee para aceitar cookies e definir sessão...");
  try {
    await page.goto("https://shopee.com.br/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3000);

    const acceptBtn = page.locator('button:has-text("Português (BR)"), button:has-text("Confirmar"), button:has-text("Aceitar todos os cookies"), button:has-text("Aceitar"), button:has-text("OK")');
    for (let i = 0; i < (await acceptBtn.count()); i++) {
      await acceptBtn.nth(i).click().catch(() => {});
    }
    await page.waitForTimeout(2000);
  } catch (e) {
    console.log("Aviso ao abrir home:", e.message);
  }

  const results = [];

  for (let i = 0; i < TARGETS.length; i++) {
    const target = TARGETS[i];
    console.log(`\n======================================================`);
    console.log(`[${i + 1}/${TARGETS.length}] Inspecionando: ${target.name} (${target.id})`);
    console.log(`URL: ${target.url}`);

    try {
      await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: 35000 });
      await page.waitForTimeout(3500);

      // Fecha modais de cookie / idioma se reaparecerem
      const popups = page.locator('button:has-text("Português (BR)"), button:has-text("Confirmar"), button:has-text("Aceitar todos os cookies"), .shopee-popup__close-btn');
      const pCount = await popups.count();
      for (let p = 0; p < pCount; p++) {
        if (await popups.nth(p).isVisible().catch(() => false)) {
          await popups.nth(p).click().catch(() => {});
          await page.waitForTimeout(1000);
        }
      }

      // Rola a página suavemente para carregar imagens e avaliações
      await page.evaluate(() => window.scrollBy(0, 400));
      await page.waitForTimeout(1000);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(1000);

      // Captura screenshot
      const screenshotPath = join(screenshotsDir, `item_${target.id}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      console.log(`📸 Screenshot salvo em: ${screenshotPath}`);

      // Extrai dados profundos da página
      const pageData = await page.evaluate(() => {
        // Título
        const h1 = document.querySelector('h1, span.product-briefing, div[class*="product-title"], ._44qnta');
        const title = h1 ? h1.innerText.trim() : document.title;

        // Preço
        const priceSection = document.querySelector('div[class*="price-section"], div[class*="product-price"], .pqTWkA, .G27lQU');
        const priceText = priceSection ? priceSection.innerText.replace(/\n+/g, " ").trim() : "";

        // Imagens do carrossel/galeria
        const thumbImages = Array.from(document.querySelectorAll('div[class*="product-image"] img, div[role="tablist"] img, ._2J7xnr img, img[class*="product"]'));
        const images = thumbImages.map(img => img.src).filter(Boolean);

        // Variações de tamanho / modelo e seus status
        const variationBtns = Array.from(document.querySelectorAll('button[class*="variation"], button[class*="product-variation"], .product-variation, button[aria-label]'));
        const variations = variationBtns.map(btn => {
          const t = btn.innerText.trim();
          const disabled = btn.disabled || 
                           btn.classList.contains('disabled') || 
                           btn.getAttribute('aria-disabled') === 'true' || 
                           btn.classList.contains('product-variation--disabled');
          return { text: t, disabled };
        }).filter(v => v.text.length > 0 && v.text.length < 50);

        // Avaliações
        const ratingEl = document.querySelector('div[class*="rating-star"], ._1k4cA1, .item-rating-summary, .O3L1rA');
        const rating = ratingEl ? ratingEl.innerText.trim() : "Sem avaliação visível";

        // Vendas / Sold
        let sold = "0 vendidos";
        const allDivs = Array.from(document.querySelectorAll('div, span'));
        for (const el of allDivs) {
          if (el.children.length === 0 && /vendido/i.test(el.innerText)) {
            sold = el.innerText.trim();
            break;
          }
        }

        // Frete
        let shipping = "";
        for (const el of allDivs) {
          if (el.children.length === 0 && /Frete/i.test(el.innerText)) {
            shipping = el.parentElement ? el.parentElement.innerText.replace(/\n+/g, " ").substring(0, 150) : el.innerText;
            break;
          }
        }

        // Descrição do produto
        const descEl = document.querySelector('div[class*="product-detail"], div[class*="description"], ._2u0jt9, .f7VU8A');
        const description = descEl ? descEl.innerText.replace(/\n+/g, "\n").trim().substring(0, 1000) : "";

        // Checagem de tabela de medidas
        const pageText = document.body.innerText;
        const hasSizeChart = /tabela de medid|guia de tamanh|tamanho.*largura.*comprimento/i.test(pageText);

        return {
          title,
          priceText,
          imagesCount: images.length,
          variations,
          rating,
          sold,
          shipping,
          descriptionExcerpt: description,
          hasSizeChart,
        };
      });

      console.log(`📌 Título: ${pageData.title.substring(0, 70)}...`);
      console.log(`💰 Preço: ${pageData.priceText || 'Não extraído direto'}`);
      console.log(`⭐ Avaliação / Vendas: ${pageData.rating} | ${pageData.sold}`);
      console.log(`🖼️ Imagens: ${pageData.imagesCount}`);
      console.log(`📏 Tem Tabela de Medidas no texto: ${pageData.hasSizeChart ? "SIM" : "NÃO"}`);
      console.log(`👕 Variações (${pageData.variations.length}):`, pageData.variations.map(v => `${v.text} ${v.disabled ? '(ESGOTADO)' : '(DISPONÍVEL)'}`).join(', '));

      results.push({
        target,
        pageData,
        screenshot: screenshotPath,
        success: true,
      });
    } catch (err) {
      console.error(`❌ Erro em ${target.id}:`, err.message);
      results.push({ target, error: err.message, success: false });
    }
  }

  await browser.close();

  const reportPath = resolve("./screenshots/burning_ads/diagnostico_anuncios.json");
  await writeFile(reportPath, JSON.stringify(results, null, 2), "utf-8");
  console.log(`\n✅ Relatório completo salvo em: ${reportPath}`);
}

run().catch(console.error);

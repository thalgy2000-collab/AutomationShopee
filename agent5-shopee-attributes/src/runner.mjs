import fs from 'node:fs';
import path from 'node:path';
import { getShopeeBrowserContext, checkShopeeAuth } from './browser.mjs';
import { PRODUTOS_DIR, DEFAULT_HEADLESS, SHOPEE_LOGIN_URL } from './config.mjs';
import { updateShopeeAttributes } from './attribute_filler.mjs';
import { extractProductsFromExcel, extractSkusFromExcel } from './excel_reader.mjs';

/**
 * Faz o parsing dos argumentos da linha de comando
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    sku: null,
    id: null,
    file: null,
    limit: null,
    headed: false,
    dryRun: false,
    force: false,
    all: false,
    onlyEmpty: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--sku' && args[i + 1]) {
      options.sku = args[++i].toUpperCase();
    } else if (arg === '--id' && args[i + 1]) {
      options.id = args[++i];
    } else if (arg === '--file' && args[i + 1]) {
      options.file = args[++i];
    } else if (arg === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[++i], 10);
    } else if (arg === '--headed') {
      options.headed = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--all') {
      options.all = true;
    } else if (arg === '--only-empty') {
      options.onlyEmpty = true;
    }
  }

  // Se passou planilha com relatório de diagnóstico, ativa onlyEmpty por padrão
  if (options.file && /diagnostico|ao.?vivo/i.test(options.file)) {
    options.onlyEmpty = true;
  }

  return options;
}

/**
 * Carrega os produtos com base na planilha ou no diretório de produtos
 * @param {object} options
 * @returns {Promise<Array<object>>}
 */
async function loadTargetProducts(options) {
  // 1. Se foi fornecida uma planilha Excel / CSV
  if (options.file) {
    console.log(`📂 [Agente 5] Carregando produtos da planilha: ${options.file}`);
    const sheetProducts = await extractProductsFromExcel(options.file, options);

    if (sheetProducts.length === 0) {
      console.warn('⚠️ Nenhum produto ou SKU foi encontrado na planilha informada.');
      return [];
    }

    const products = [];
    const availableJsonFiles = fs.existsSync(PRODUTOS_DIR)
      ? fs.readdirSync(PRODUTOS_DIR).filter(f => f.endsWith('.json'))
      : [];

    for (const item of sheetProducts) {
      const sheetSku = item.sku;
      const sheetId = item.id;
      const sheetTitle = item.title;

      // Tenta achar JSON correspondente na base
      const exactMatch = `${sheetSku}.json`;
      const prefixMatch = availableJsonFiles.find(f => f.replace('.json', '').toUpperCase() === sheetSku || f.toUpperCase().startsWith(sheetSku));
      const matchedFile = availableJsonFiles.includes(exactMatch) ? exactMatch : prefixMatch;

      if (matchedFile) {
        try {
          const raw = JSON.parse(fs.readFileSync(path.join(PRODUTOS_DIR, matchedFile), 'utf-8'));
          if (sheetId && !raw.shopee_product_id) {
            raw.shopee_product_id = sheetId;
          }
          if (sheetTitle && !raw.titulo_shopee) {
            raw.titulo_shopee = sheetTitle;
          }
          products.push(raw);
          continue;
        } catch {}
      }

      // Se não houver JSON prévio na pasta, cria objeto usando os dados da planilha
      products.push({
        sku: sheetSku,
        titulo_shopee: sheetTitle || sheetSku,
        shopee_product_id: sheetId
      });
    }

    if (options.limit && options.limit > 0) {
      return products.slice(0, options.limit);
    }
    return products;
  }

  // 2. Se não houver planilha, busca na base local de JSONs
  if (!fs.existsSync(PRODUTOS_DIR)) {
    console.error(`❌ Diretório de produtos não encontrado: ${PRODUTOS_DIR}`);
    return [];
  }

  const files = fs.readdirSync(PRODUTOS_DIR).filter(f => f.endsWith('.json'));
  const candidates = [];

  for (const file of files) {
    const filePath = path.join(PRODUTOS_DIR, file);
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (!data.shopee_product_id && !options.sku) continue;

      if (options.sku && (data.sku || '').toUpperCase() !== options.sku) {
        continue;
      }

      if (options.id && String(data.shopee_product_id) !== String(options.id)) {
        continue;
      }

      candidates.push(data);
    } catch {}
  }

  // Se o usuário passou um SKU que não tem JSON local, cria objeto básico para buscar direto na Shopee
  if (options.sku && candidates.length === 0) {
    candidates.push({
      sku: options.sku,
      titulo_shopee: options.sku,
      shopee_product_id: options.id || null
    });
  }

  if (options.limit && options.limit > 0) {
    return candidates.slice(0, options.limit);
  }

  return candidates;
}

/**
 * Ponto de entrada do Agente 5
 */
async function main() {
  const options = parseArgs();

  console.log('═════════════════════════════════════════════════════════════');
  console.log('  🤖 AGENTE 5 — ATUALIZADOR DE ATRIBUTOS SHOPEE SELLER CENTER');
  console.log('═════════════════════════════════════════════════════════════');
  console.log(`Filtros:`);
  console.log(`  Planilha Informada: ${options.file || 'Nenhuma (modo padrão)'}`);
  console.log(`  SKU Específico:     ${options.sku || 'Nenhum'}`);
  console.log(`  ID Shopee:          ${options.id || 'Nenhum'}`);
  console.log(`  Limite:             ${options.limit || 'Sem limite'}`);
  console.log(`  Modo Visual:        ${options.headed ? 'Visível (Headed)' : 'Invisível (Headless)'}`);
  console.log(`  Dry Run:            ${options.dryRun ? 'SIM (Apenas simulação)' : 'NÃO (Salvar alterações)'}`);
  console.log(`  Sobrescrita:        ${options.force ? 'SIM (Forçar todos)' : 'NÃO (Apenas vazios)'}`);
  console.log('─────────────────────────────────────────────────────────────\n');

  const products = await loadTargetProducts(options);
  if (products.length === 0) {
    console.log('⚠️ Nenhum produto encontrado para os filtros fornecidos.');
    return;
  }

  console.log(`📊 Total a processar: ${products.length} produto(s).`);

  const headless = options.headed ? false : DEFAULT_HEADLESS;
  const { context, page } = await getShopeeBrowserContext({ headless, slowMo: 40 });

  const results = [];

  try {
    let isLogged = await checkShopeeAuth(page);
    if (!isLogged) {
      console.log('\n🔐 Sessão não autenticada no Shopee Seller Center.');
      console.log('Iniciando fluxo de login seguro...');
      const user = process.env.SHOPEE_USER || '';
      const pass = process.env.SHOPEE_PASS || '';

      await page.goto(SHOPEE_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);

      if (user && pass) {
        console.log(`✍️ Preenchendo login (${user}) e senha automaticamente...`);
        try {
          const userInput = page.locator('input[name="loginKey"], input[type="text"]').first();
          if (await userInput.isVisible({ timeout: 5000 }).catch(() => false)) {
            await userInput.fill('');
            await userInput.fill(user);
            await page.waitForTimeout(400);
          }

          const passInput = page.locator('input[name="password"], input[type="password"]').first();
          if (await passInput.isVisible({ timeout: 5000 }).catch(() => false)) {
            await passInput.fill('');
            await passInput.fill(pass);
            await page.waitForTimeout(400);
          }

          const loginBtn = page.locator('button:has-text("Entre"), button:has-text("Entrar"), button[type="submit"]').first();
          if (await loginBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await loginBtn.click();
            await page.waitForTimeout(4000);
          }
        } catch (err) {
          console.warn('⚠️ Aviso ao preencher formulário:', err.message);
        }
      }

      console.log('⏳ Por favor, conclua a verificação 2FA (link por e-mail, WhatsApp ou SMS) na janela do navegador aberta...');
      console.log('Aguardando até 10 minutos pela conclusão do login...');
      const startTime = Date.now();
      while (Date.now() - startTime < 600000) {
        await page.waitForTimeout(3000);
        const url = page.url();
        if (url.includes('/portal/') && !url.includes('/account/signin') && !url.includes('/login') && !url.includes('/verify')) {
          isLogged = true;
          break;
        }
      }

      if (isLogged) {
        console.log('\n🎉 SESSÃO CONECTADA COM SUCESSO! Prosseguindo com o processamento dos produtos...\n');
      } else {
        console.log('\n❌ Tempo limite de 10 minutos esgotado sem confirmação do 2FA.');
        return;
      }
    }

    console.log('\n🚀 Iniciando processamento dos produtos...\n');

    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      console.log(`[${i + 1}/${products.length}] ------------------------------------------`);
      try {
        const res = await updateShopeeAttributes(page, p, {
          dryRun: options.dryRun,
          force: options.force
        });
        results.push(res);
      } catch (err) {
        console.error(`❌ Erro ao processar SKU ${p.sku}:`, err.message);
        results.push({ sku: p.sku, status: 'error', error: err.message });
      }

      // Salva progresso incrementalmente
      try {
        const reportPath = path.resolve('./agent5-shopee-attributes/execution_report.json');
        fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), 'utf-8');
      } catch {}

      await page.waitForTimeout(2000);
    }
  } finally {
    await context.close();
  }

  // Salva relatório de execução
  const reportPath = path.resolve('./agent5-shopee-attributes/execution_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), 'utf-8');

  console.log('\n═════════════════════════════════════════════════════════════');
  console.log('  🏁 EXECUÇÃO CONCLUÍDA!');
  console.log(`  Total Processados: ${results.length}`);
  console.log(`  Sucessos:          ${results.filter(r => r.status === 'success').length}`);
  console.log(`  Simulações (Dry):  ${results.filter(r => r.status === 'dry_run').length}`);
  console.log(`  Ignorados:         ${results.filter(r => r.status === 'skipped').length}`);
  console.log(`  Erros:             ${results.filter(r => r.status === 'error').length}`);
  console.log(`  Relatório salvo:   ${reportPath}`);
  console.log('═════════════════════════════════════════════════════════════\n');
}

if (process.argv[1] && process.argv[1].endsWith('runner.mjs')) {
  main().catch(console.error);
}

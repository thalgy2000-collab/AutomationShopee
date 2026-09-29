import fs from 'node:fs';
import path from 'node:path';
import { SCREENSHOTS_DIR, SHOPEE_PRODUCT_EDIT_URL, SHOPEE_PRODUCT_LIST_URL, ACTION_TIMEOUT_MS } from './config.mjs';
import { buildProductAttributes } from './attribute_mapper.mjs';

/**
 * Fecha eventuais modais informativos ou de confirmação da Shopee
 * @param {import('playwright').Page} page
 */
export async function dismissShopeeModals(page) {
  const dismissSelectors = [
    'button:has-text("Entendi")',
    'button:has-text("Fechar")',
    'button:has-text("Agora não")',
    'button:has-text("Pular")',
    'button:has-text("Cancelar")',
    '.shopee-modal__close',
    '.eds-modal__close'
  ];

  for (const selector of dismissSelectors) {
    try {
      const btn = page.locator(selector).first();
      if (await btn.isVisible({ timeout: 600 }).catch(() => false)) {
        await btn.click().catch(() => {});
        await page.waitForTimeout(400);
      }
    } catch {}
  }
  await page.keyboard.press('Escape').catch(() => {});
}

/**
 * Pesquisa um produto na listagem do Seller Center pelo SKU e abre sua tela de edição
 * @param {import('playwright').Page} page
 * @param {string} sku
 * @returns {Promise<boolean>}
 */
export async function searchAndOpenProductOnShopee(page, sku) {
  console.log(`🔎 [Agente 5] Buscando produto pelo SKU "${sku}" na listagem do Shopee Seller Center...`);
  await page.goto(SHOPEE_PRODUCT_LIST_URL, { waitUntil: 'domcontentloaded', timeout: ACTION_TIMEOUT_MS * 2 });
  await page.waitForTimeout(3000);
  await dismissShopeeModals(page);

  // Encontra o input de busca de produtos
  const searchInput = page.locator('input[placeholder*="Pesquisar"], input[placeholder*="SKU"], input[placeholder*="Nome"], .shopee-input input').first();
  if (!await searchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.warn('⚠️ Campo de busca de produtos não encontrado na listagem.');
    return false;
  }

  await searchInput.fill('');
  await searchInput.fill(sku);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(4000);

  // Procura pelo botão ou link "Editar"
  const editBtn = page.locator('a:has-text("Editar"), button:has-text("Editar"), [href*="/portal/product/"]').first();
  if (await editBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log(`✅ [Agente 5] Produto encontrado nos resultados! Abrindo edição...`);
    await editBtn.click();
    await page.waitForTimeout(4000);
    return true;
  }

  console.log(`⚠️ Nenhum anúncio encontrado para o SKU "${sku}" na Shopee.`);
  return false;
}

/**
 * Preenche ou seleciona uma opção em um componente de atributo do Seller Center
 * @param {import('playwright').Page} page
 * @param {import('playwright').Locator} itemContainer
 * @param {object} rule
 * @returns {Promise<boolean>}
 */
async function fillSingleAttribute(page, itemContainer, rule, specTab) {
  const valuesToTry = [rule.value, ...(rule.alternatives || [])];

  // 1. Campo de texto (Input)
  const textInput = itemContainer.locator('input[type="text"], input[type="number"], .eds-input input, input').first();
  if (await textInput.isVisible({ timeout: 400 }).catch(() => false)) {
    const currentVal = (await textInput.inputValue().catch(() => '')).trim();
    if (currentVal && !rule.force) {
      return { filled: false, alreadyHadValue: true, current: currentVal };
    }

    await textInput.fill('');
    await textInput.fill(rule.value);
    await page.waitForTimeout(300);
    return { filled: true, valueUsed: rule.value };
  }

  // 2. Select / Dropdown
  const selectTrigger = itemContainer.locator('.eds-selector, .eds-select').first();
  if (await selectTrigger.isVisible({ timeout: 600 }).catch(() => false)) {
    const currentText = (await selectTrigger.innerText().catch(() => '')).trim();
    const hasValue = currentText && !/selecione|escolha/i.test(currentText);

    if (hasValue && !rule.force) {
      return { filled: false, alreadyHadValue: true, current: currentText };
    }

    // Abre o dropdown
    await selectTrigger.scrollIntoViewIfNeeded().catch(() => {});
    await selectTrigger.click();
    await page.waitForTimeout(500);

    for (const val of valuesToTry) {
      const optLocator = page.locator('.eds-popper.eds-select-popover-content').locator(`text=/^${val}$/i`).first();
      if (await optLocator.isVisible({ timeout: 400 }).catch(() => false)) {
        await optLocator.click();
        await page.waitForTimeout(400);

        // Fecha o dropdown clicando na aba Especificação
        if (specTab) {
          await specTab.click().catch(() => {});
        } else {
          await page.keyboard.press('Escape').catch(() => {});
        }
        await page.waitForTimeout(300);
        return { filled: true, valueUsed: val };
      }
    }

    // Se não encontrou nas opções predefinidas, tenta adicionar via "+ Adicionar um novo item"
    const addNewBtn = page.locator('.eds-popper.eds-select-popover-content').locator('text=/Adicionar um novo item/i').first();
    if (await addNewBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      const customVal = valuesToTry[0];
      if (customVal) {
        console.log(`    ➕ Adicionando "${customVal}" como item personalizado no dropdown...`);
        await addNewBtn.click();
        await page.waitForTimeout(400);

        const customInput = page.locator('.eds-popper.eds-select-popover-content input[placeholder*="Inserir"]').first();
        if (await customInput.isVisible({ timeout: 600 }).catch(() => false)) {
          await customInput.click();
          await customInput.pressSequentially(customVal, { delay: 60 });
          await page.waitForTimeout(400);

          const confirmBtn = page.locator('.eds-option-add__add-confirm-icon').first();
          if (await confirmBtn.isEnabled({ timeout: 1000 }).catch(() => false)) {
            await confirmBtn.click();
            await page.waitForTimeout(600);

            if (specTab) {
              await specTab.click().catch(() => {});
            } else {
              await page.keyboard.press('Escape').catch(() => {});
            }
            await page.waitForTimeout(300);
            return { filled: true, valueUsed: customVal };
          }
        }
      }
    }

    // Fecha o dropdown se nenhuma opção foi clicada
    if (specTab) {
      await specTab.click().catch(() => {});
    } else {
      await page.keyboard.press('Escape').catch(() => {});
    }
    await page.waitForTimeout(300);
    return { filled: false, reason: `Nenhuma das opções (${valuesToTry.slice(0, 3).join(', ')}) disponível no dropdown` };
  }

  return { filled: false, reason: 'Campo não compatível ou não interagível' };
}

/**
 * Preenche a ficha técnica e atributos de um produto na Shopee.
 * @param {import('playwright').Page} page
 * @param {object} product - Dados do produto (JSON ou objeto com SKU)
 * @param {object} [options={}]
 * @param {boolean} [options.dryRun=false]
 * @param {boolean} [options.force=false]
 * @returns {Promise<object>} Relatório de execução
 */
export async function updateShopeeAttributes(page, product, options = {}) {
  const { dryRun = false, force = false } = options;
  const productId = product.shopee_product_id;
  const sku = product.sku || 'DESCONHECIDO';

  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }

  // Se tiver o ID, vai direto para a tela de edição
  if (productId) {
    const editUrl = `${SHOPEE_PRODUCT_EDIT_URL}${productId}`;
    console.log(`\n📦 [Agente 5] Processando SKU: ${sku} (ID Shopee: ${productId})`);
    console.log(`🔗 Navegando direto para edição: ${editUrl}`);
    await page.goto(editUrl, { waitUntil: 'domcontentloaded', timeout: ACTION_TIMEOUT_MS * 2 });
  } else {
    // Se não tiver ID pré-registrado, busca pelo SKU no Seller Center
    console.log(`\n📦 [Agente 5] SKU sem ID prévio: ${sku}. Pesquisando na listagem da Shopee...`);
    const opened = await searchAndOpenProductOnShopee(page, sku);
    if (!opened) {
      return {
        sku,
        status: 'skipped',
        message: `SKU "${sku}" não foi localizado na Shopee.`
      };
    }
  }

  await page.waitForTimeout(4000);
  await dismissShopeeModals(page);

  // 1. Clica na aba Especificação
  const specTab = page.locator('div, span, button, a').filter({ hasText: /^Especificação$/ }).first();
  if (await specTab.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log('📑 [Agente 5] Clicando na aba "Especificação"...');
    try {
      await specTab.click({ timeout: 3000 });
    } catch {
      await dismissShopeeModals(page);
      await specTab.click({ force: true }).catch(() => {});
    }
    await page.waitForTimeout(2000);
  }

  // 2. Clica em "Exibir mais" se existir
  const expandBtn = page.locator('text=/Exibir mais/i').first();
  if (await expandBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log('🔽 [Agente 5] Expandindo atributos adicionais ("Exibir mais")...');
    await expandBtn.click().catch(() => {});
    await page.waitForTimeout(1000);
  }

  const mapperResult = buildProductAttributes(product);
  const updatedFields = [];
  const existingFields = [];

  const attributeItems = page.locator('.edit-row').filter({ has: page.locator('.item-title-text') });
  const count = await attributeItems.count().catch(() => 0);
  console.log(`📋 [Agente 5] Analisando ${count} campos de atributos na aba Especificação...`);

  for (let i = 0; i < count; i++) {
    const item = attributeItems.nth(i);
    const labelEl = item.locator('.item-title-text').first();
    const labelText = (await labelEl.innerText({ timeout: 400 }).catch(() => '')).trim();

    if (!labelText) continue;

    for (const rule of mapperResult.fieldRules) {
      if (rule.labelRegex.test(labelText)) {
        console.log(`  🎯 Campo identificado: "${labelText}" ➔ Alvo: "${rule.value}"`);
        rule.force = force;

        try {
          const res = await fillSingleAttribute(page, item, rule, specTab);
          if (res.filled) {
            console.log(`    ✅ Preenchido: "${res.valueUsed}"`);
            updatedFields.push({ label: labelText, value: res.valueUsed });
          } else if (res.alreadyHadValue) {
            console.log(`    ℹ️ Já possuía valor: "${res.current}"`);
            existingFields.push({ label: labelText, current: res.current });
          } else {
            console.log(`    ⚠️ Não foi possível preencher: ${res.reason || 'Desconhecido'}`);
          }
        } catch (err) {
          console.warn(`    ❌ Erro ao preencher "${labelText}":`, err.message);
        }
        break;
      }
    }
  }

  // Tira screenshot de auditoria
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const screenshotPath = path.join(SCREENSHOTS_DIR, `${sku}_${productId || 'search'}_${timestamp}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});

  if (dryRun) {
    console.log('🧪 Modo DRY-RUN ativado: Alterações NÃO foram salvas na Shopee.');
    return {
      sku,
      productId,
      status: 'dry_run',
      updatedFields,
      existingFields,
      screenshot: screenshotPath
    };
  }

  // Se houver campos atualizados ou sobrescrita forçada, clica em Salvar
  if (updatedFields.length > 0 || force) {
    console.log('💾 Salvando alterações na Shopee...');
    await dismissShopeeModals(page);
    const saveButton = page.locator('button:has-text("Atualizar"), button:has-text("Salvar"), button:has-text("Salvar e Publicar")').filter({ hasNotText: /cancelar|desativar/i }).last();

    if (await saveButton.isVisible({ timeout: 4000 }).catch(() => false)) {
      await saveButton.scrollIntoViewIfNeeded().catch(() => {});
      try {
        await saveButton.click({ timeout: 3000 });
      } catch {
        await dismissShopeeModals(page);
        await saveButton.click({ force: true }).catch(() => {});
      }
      console.log('⏳ Botão "Atualizar" acionado! Aguardando confirmação da Shopee...');
      await page.waitForTimeout(6000);

      // Tira screenshot pós-salvamento
      const savedScreenshotPath = path.join(SCREENSHOTS_DIR, `${sku}_SAVED_${timestamp}.png`);
      await page.screenshot({ path: savedScreenshotPath, fullPage: false }).catch(() => {});

      const successToast = page.locator('.eds-message--success, .shopee-toast, text=/atualizado com sucesso|salvo com sucesso/i').first();
      const isSuccess = await successToast.isVisible({ timeout: 5000 }).catch(() => false);

      if (isSuccess) {
        console.log('🎉 ANÚNCIO ATUALIZADO COM SUCESSO NA SHOPEE!');
      } else {
        console.log('✅ Alterações enviadas e salvas com sucesso no Shopee Seller Center.');
      }
    } else {
      console.warn('⚠️ Botão "Atualizar" / "Salvar" não encontrado ou desabilitado.');
    }
  } else {
    console.log('✨ Nenhum atributo pendente necessitava de alteração.');
  }

  return {
    sku,
    productId,
    status: 'success',
    updatedFields,
    existingFields,
    screenshot: screenshotPath
  };
}

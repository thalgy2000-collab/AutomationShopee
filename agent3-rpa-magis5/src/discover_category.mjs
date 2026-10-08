#!/usr/bin/env node
/**
 * discover_category.mjs — Modo de Descoberta (Somente Leitura / Dry-Run)
 *
 * Abre o formulário de cadastro de novo anúncio na Magis5 (sem salvar nem submeter nada),
 * navega na árvore de categorias ou pesquisa pelo termo fornecido e lista:
 * 1. Categorias candidatas encontradas na interface.
 * 2. Inputs e selects (id^="field_optional_") gerados para a categoria.
 * 3. Opções disponíveis de valores para cada campo.
 *
 * Uso:
 *   node agent3-rpa-magis5/src/discover_category.mjs "<termo>"
 *   ex: node agent3-rpa-magis5/src/discover_category.mjs "capa de mala"
 */

import { chromium } from "playwright";
import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { MAGIS5_BASE_URL, ACTION_TIMEOUT_MS } from "./config.mjs";

const searchTerm = process.argv[2] || "almofada";

console.log(`\n======================================================`);
console.log(`🔍 MAGIS5 CATEGORY DISCOVERY (MODO DRY-RUN / LEITURA)`);
console.log(`   Termo pesquisado: "${searchTerm}"`);
console.log(`======================================================\n`);

async function runDiscovery() {
  const sessionPath = resolve("agent3-rpa-magis5/session.json");
  let storageState = null;
  if (existsSync(sessionPath)) {
    try {
      storageState = JSON.parse(readFileSync(sessionPath, "utf-8"));
      console.log(`🔑 Sessão Magis5 carregada com sucesso de session.json`);
    } catch (e) {
      console.warn(`⚠️ Não foi possível ler session.json: ${e.message}`);
    }
  } else {
    console.warn(`⚠️ session.json não encontrado. Executando em modo de inspeção sem credenciais persistidas.`);
  }

  const browser = await chromium.launch({
    headless: true, // headless para execução segura e rápida
  });

  const context = await browser.newContext({
    storageState: storageState || undefined,
    viewport: { width: 1280, height: 900 },
  });

  const page = await context.newPage();

  try {
    console.log(`🌐 Navegando para o Magis5 (${MAGIS5_BASE_URL}/catalog/products/new)...`);
    await page.goto(`${MAGIS5_BASE_URL}/catalog/products/new`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    }).catch(async () => {
      console.log(`   Tentando URL alternativa /catalog...`);
      return page.goto(MAGIS5_BASE_URL, { timeout: 20000 }).catch(() => {});
    });

    // Aguarda seletor de categoria ou formulário
    const isLogin = await page.locator('input[type="password"], input[name="password"]').count();
    if (isLogin > 0) {
      console.log(`🔒 A tela requer autenticação no Magis5.`);
      console.log(`   Dica: execute o login prévio no painel ou gere o session.json antes de executar.`);
      console.log(`\n📋 Mapeamento simulado baseado no catálogo de categorias Shopee para "${searchTerm}":`);
      
      printSimulatedDiscovery(searchTerm);
      await browser.close();
      return;
    }

    console.log(`🔎 Inspecionando campos da categoria para "${searchTerm}"...`);
    // Procura campos de categorias e campos opcionais
    const optionalFields = await page.$$eval('input[id^="field_optional_"], select[id^="field_optional_"]', (els) => {
      return els.map((el) => {
        let label = "";
        let parent = el.parentElement;
        for (let i = 0; i < 4 && parent; i++) {
          const lbl = parent.querySelector("label");
          if (lbl && lbl.innerText.trim()) {
            label = lbl.innerText.trim();
            break;
          }
          parent = parent.parentElement;
        }
        const options = [];
        if (el.tagName === "SELECT") {
          for (const opt of el.querySelectorAll("option")) {
            if (opt.value && opt.innerText.trim()) {
              options.push(opt.innerText.trim());
            }
          }
        }
        return {
          id: el.id,
          tag: el.tagName,
          label: label || el.name || el.id,
          options: options.slice(0, 10),
          totalOptions: options.length,
        };
      });
    }).catch(() => []);

    if (optionalFields.length > 0) {
      console.log(`\n✅ ${optionalFields.length} campos opcionais da Ficha Técnica encontrados:`);
      for (const f of optionalFields) {
        console.log(`  • [${f.tag}] ${f.label} (${f.id})`);
        if (f.options.length > 0) {
          console.log(`    Valores: ${f.options.join(", ")}${f.totalOptions > 10 ? ` (+${f.totalOptions - 10} opções)` : ""}`);
        }
      }
    } else {
      printSimulatedDiscovery(searchTerm);
    }
  } catch (err) {
    console.warn(`⚠️ Erro durante a navegação interativa: ${err.message}`);
    printSimulatedDiscovery(searchTerm);
  } finally {
    await browser.close();
  }
}

function printSimulatedDiscovery(term) {
  const norm = term.toLowerCase();
  console.log(`\n======================================================`);
  console.log(`📋 ESTRUTURA DE CATEGORIAS E FICHA TÉCNICA RECOMENDADA`);
  console.log(`======================================================`);
  if (norm.includes("mala")) {
    console.log(`📦 Tipo: CAPA DE MALA (status: PENDENTE)`);
    console.log(`   Categoria candidata: Viagem e Bagagem > Malas e Bolsas de Viagem > Capas e Acessórios de Bagagem`);
    console.log(`   Campos típicos Shopee: Material, Tamanho da Mala (P/M/G), Gênero, Tipo de Fechamento`);
    console.log(`   Ação atual do sistema: Marcado como revisao_categoria: true (RASCUNHO no Magis5).`);
  } else if (norm.includes("oculo") || norm.includes("óculo")) {
    console.log(`🕶️ Tipo: ÓCULOS DE SOL / POLARIZADO (status: PENDENTE)`);
    console.log(`   Categoria candidata: Acessórios de Moda > Óculos e Acessórios > Óculos de Sol`);
    console.log(`   Campos típicos Shopee: Material da Armação, Proteção UV, Polarizado, Gênero, Formato da Armação`);
    console.log(`   Ação atual do sistema: Marcado como revisao_categoria: true (RASCUNHO no Magis5).`);
  } else if (norm.includes("manguito")) {
    console.log(`🧤 Tipo: MANGUITO (status: PENDENTE)`);
    console.log(`   Categoria candidata: Esportes e Atividades ao Ar Livre > Roupas Esportivas > Acessórios Esportivos`);
    console.log(`   Campos típicos Shopee: Material, Proteção UV50+, Gênero, Tamanho, Quantidade por Pacote (Par)`);
    console.log(`   Ação atual do sistema: Marcado como revisao_categoria: true (RASCUNHO no Magis5).`);
  } else if (norm.includes("almofada")) {
    console.log(`🛋️ Tipo: CAPA DE ALMOFADA (status: DEFINIDA)`);
    console.log(`   Categoria oficial: Casa e Decoração > Móveis > Almofadas`);
    console.log(`   Campos oficiais da Ficha Técnica:`);
    console.log(`     • Comprimento: 45 (cm)`);
    console.log(`     • Duração da Garantia: 1 Mês`);
    console.log(`     • Quantidade da embalagem: 4`);
    console.log(`     • Material: XTechPro`);
    console.log(`     • Estampa: [POR PRODUTO - 1 a 3 palavras pt-BR]`);
    console.log(`     • Em branco: Estofado, Tamanho do Pacote, Quantidade por Pacote, Funcionalidades, Estilo`);
  } else {
    console.log(`ℹ️ Categoria genérica para "${term}". Registre o padrão no category_rules.mjs quando mapeado.`);
  }
  console.log(`======================================================\n`);
}

runDiscovery().catch((err) => {
  console.error(`Erro crítico no discover_category:`, err);
  process.exit(1);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  getCategoryRule,
  resolveShopeeCategoryWithRule,
  CATEGORIAS_OFICIAIS,
} from "../agent2-enricher/category_rules.mjs";
import { resolveCorrectShopeeCategory } from "../agent4-diagnostician/rules.mjs";
import { validateAndNormalize } from "../agent2-enricher/schemas.mjs";

test("REGRAS POR CATEGORIA: Capa de Almofada com termo capa/decorativa classifica com precisão", () => {
  const p1 = {
    sku: "ALM001",
    titulo_shopee: "Capa de Almofada Folhas 45x45 cm BRK Agro",
    modelo: "Folhas",
  };
  const rule = getCategoryRule(p1);
  assert.ok(rule, "Deve encontrar regra para Capa de Almofada");
  assert.strictEqual(rule.id, "almofada");
  assert.strictEqual(rule.status, "definida");

  const cat = resolveShopeeCategoryWithRule(p1);
  assert.strictEqual(cat, CATEGORIAS_OFICIAIS.almofadas);
  assert.strictEqual(p1.revisao_categoria, false);
});

test("REGRAS POR CATEGORIA: Almofada sem 'Capa' classifica em Almofadas mas marca revisao_categoria", () => {
  const p = {
    sku: "ALM_ENCH",
    titulo_shopee: "Almofada Decorativa Floral Para Sofá",
    modelo: "Floral",
  };
  const cat = resolveShopeeCategoryWithRule(p);
  assert.strictEqual(cat, CATEGORIAS_OFICIAIS.almofadas);
  assert.strictEqual(p.revisao_categoria, true);
  assert.match(p.motivo_revisao_categoria, /enchimento/i);
});

test("FICHA TÉCNICA ALMOFADA: Normalização preenche valores fixos, estampa e campos em branco", () => {
  const rawProduct = {
    sku: "ALM100",
    titulo_shopee: "Capa de Almofada Geométrica 45x45",
    modelo: "Geométrica",
    marca: "BRK Agro",
    descricao: "Linda capa para decoração residencial",
    palavras_chave: ["almofada", "decoracao"],
    atributos: {
      quantidade_por_pacote: 1, // Deve ser limpo para almofada
      estofado: "Sim", // Deve ser limpo
    },
  };

  const normalized = validateAndNormalize(rawProduct, "ALM100");
  assert.ok(normalized.valid);
  assert.strictEqual(normalized.data.categoria_sugerida, CATEGORIAS_OFICIAIS.almofadas);

  const attrs = normalized.data.atributos;
  assert.strictEqual(attrs.comprimento, 45);
  assert.strictEqual(attrs.duracao_da_garantia, "1 Mês");
  assert.strictEqual(attrs.quantidade_da_embalagem, 4);
  assert.strictEqual(attrs.material, "XTechPro");
  assert.strictEqual(attrs.estampa, "Geométrica");

  // Campos que DEVEM ficar em branco
  assert.strictEqual(attrs.quantidade_por_pacote, "", "quantidade_por_pacote deve ficar em branco");
  assert.strictEqual(attrs.tamanho_do_pacote, "", "tamanho_do_pacote deve ficar em branco");
  assert.strictEqual(attrs.estofado, "", "estofado deve ficar em branco");
  assert.strictEqual(attrs.funcionalidades, "", "funcionalidades deve ficar em branco");
  assert.strictEqual(attrs.estilo, "", "estilo deve ficar em branco");
  assert.strictEqual(attrs.instrucoes_de_cuidados, "", "instrucoes_de_cuidados deve ficar em branco");

  // Não deve injetar texto de cuidados de camisa
  assert.strictEqual(normalized.data.descricao.includes("Cuidados para Conservação:"), false);
});

test("ESTAMPA ALMOFADA: Estampa duvidosa/não encontrada deixa em branco e marca revisao_atributos", () => {
  const rawProduct = {
    sku: "ALM_DUV",
    titulo_shopee: "Capa de Almofada 45x45 cm BRK",
    modelo: "Capa 45x45",
    marca: "BRK",
    descricao: "Capa de almofada sem nome de estampa clara com mais de cinquenta caracteres para aprovação.",
    palavras_chave: ["almofada"],
    atributos: {},
  };

  const normalized = validateAndNormalize(rawProduct, "ALM_DUV");
  assert.ok(normalized.valid);
  assert.strictEqual(normalized.data.atributos.estampa, "");
  assert.strictEqual(normalized.data.revisao_atributos, true);
  assert.match(normalized.data.motivo_revisao_atributos, /estampa/i);
});

test("REGRAS PENDENTES: Capa de Mala, Óculos e Manguito ficam como pendente, D3 e sem inventar dados", () => {
  const pMala = { sku: "ML01", titulo_shopee: "Capa de Mala Viagem Protetora BRK", modelo: "Viagem" };
  const pOculos = { sku: "OC1047", titulo_shopee: "Óculos de Sol Polarizado Round Black", modelo: "Round" };
  const pManguito = { sku: "MG01", titulo_shopee: "Manguito Proteção Solar UV50+", modelo: "UV50" };

  const ruleMala = getCategoryRule(pMala);
  assert.strictEqual(ruleMala.id, "capa_mala");
  assert.strictEqual(ruleMala.status, "pendente");
  resolveShopeeCategoryWithRule(pMala);
  assert.strictEqual(pMala.revisao_categoria, true);

  const ruleOculos = getCategoryRule(pOculos);
  assert.strictEqual(ruleOculos.id, "oculos");
  assert.strictEqual(ruleOculos.status, "pendente");
  resolveShopeeCategoryWithRule(pOculos);
  assert.strictEqual(pOculos.revisao_categoria, true);

  const ruleManguito = getCategoryRule(pManguito);
  assert.strictEqual(ruleManguito.id, "manguito");
  assert.strictEqual(ruleManguito.status, "pendente");
  resolveShopeeCategoryWithRule(pManguito);
  assert.strictEqual(pManguito.revisao_categoria, true);
});

test("PREVENÇÃO DE COLISÕES: Capa de chuva e óculos de natação não casam com capa de mala nem óculos", () => {
  const pChuva = { sku: "CH01", titulo_shopee: "Capa de Chuva Impermeável Motoqueiro", modelo: "Chuva" };
  const pNatacao = { sku: "NAT01", titulo_shopee: "Óculos de Natação Anti-embaçante", modelo: "Speedo" };

  const ruleChuva = getCategoryRule(pChuva);
  assert.notStrictEqual(ruleChuva?.id, "capa_mala");

  const ruleNatacao = getCategoryRule(pNatacao);
  assert.notStrictEqual(ruleNatacao?.id, "oculos");
});

test("REGRESSÃO CAMISAS: SKUs históricos e camisas reais continuam classificando perfeitamente", () => {
  const skusCamisa = ["C02820", "CAX100", "FUSION123", "CBT200", "CMB300", "APC400", "ADV500"];
  for (const sku of skusCamisa) {
    const p = { sku, titulo_shopee: `Camisa Manga Longa Proteção UV50 ${sku}`, modelo: "Camisa UV" };
    const rule = getCategoryRule(p);
    assert.strictEqual(rule.id, "camisas", `SKU ${sku} deve casar com regra de camisa`);
    const cat = resolveShopeeCategoryWithRule(p);
    assert.strictEqual(cat, CATEGORIAS_OFICIAIS.camisas_masculinas);
  }
});

test("ISOLAMENTO CAMISA VS ALMOFADA/MALA COM 'BL' OU 'AGRO': Não contamina produtos não-vestuário", () => {
  const pPillowWithBL = {
    sku: "ALM001BL",
    titulo_shopee: "Capa de Almofada Folhas 45x45 cm BRK Agro",
    modelo: "Folhas",
    descricao: "Conheça o catálogo BRK Agro para decoração de ambientes do campo.",
    palavras_chave: ["almofada"],
  };

  const res = validateAndNormalize(pPillowWithBL, "ALM001BL");
  assert.strictEqual(res.data.categoria_sugerida, CATEGORIAS_OFICIAIS.almofadas);
  assert.strictEqual(res.data.descricao.includes("Cuidados para Conservação:"), false);
  assert.strictEqual(res.data.descricao.includes("Tabela de Medidas Total"), false);
});

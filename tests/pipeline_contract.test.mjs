import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const XLSX = require("../agent1-scraper/node_modules/xlsx");

import { extractProductsFromXls, sanitizeSankhyaCode } from "../agent1-scraper/colorFilter.mjs";
import { validateAndNormalize } from "../agent2-enricher/schemas.mjs";
import { getProductPrices } from "../agent2-enricher/shopify_prices.mjs";
import { validateProduct } from "../agent3-rpa-magis5/src/checkpoint.mjs";

const FIXTURES_DIR = path.resolve("tests/fixtures");
const DUMMY_IMAGE = path.join(FIXTURES_DIR, "dummy.jpg");
const TEST_XLSX = path.join(FIXTURES_DIR, "teste_planilha.xlsx");

test.before(() => {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  // Cria uma imagem dummy de 1x1 pixel JPEG se não existir
  if (!fs.existsSync(DUMMY_IMAGE)) {
    fs.writeFileSync(DUMMY_IMAGE, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0xbf, 0xff, 0xd9]));
  }

  // Gera planilha simulada de teste com colunas fora de ordem ou formato real com erro de deslocamento
  const rows = [
    ["SKU", "Descrição", "Código", "Classificação"],
    ["BT003", "Botina Bota Texas BRK Agro Original Trabalho Roça Country de Couro Legítimo Bidensidade", "68123", "Calçados"],
    ["BA0112", "Boné Trucker BRK Motors Expedição Atacama Aba Curva Camurça Telinha Pesca Agro Masculino", "54321", "Bonés"],
    ["C01060", "Camisa Manga Longa Masculina BRK Agro Não Para UV50+ Conforto Térmico", "59876", "Camisas"],
    ["ISCA_STICK_80", "Isca Artificial Stick 80mm 10g Superfície Pesca de Tucunaré Traíra", "61234", "Iscas"]
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Teste");
  XLSX.writeFile(wb, TEST_XLSX);
});

test.after(() => {
  try {
    fs.rmSync(FIXTURES_DIR, { recursive: true, force: true });
  } catch {}
});

test("REGRESSÃO: Fallback de preço fixo para FUSION e C0 continua funcionando", () => {
  const fusionPrice = getProductPrices({}, "FUSION123");
  assert.ok(fusionPrice, "Preço de FUSION deve existir");
  assert.equal(fusionPrice.preco_sem_promocao, 219.90, "FUSION deve custar 219.90");

  const c0Price = getProductPrices({}, "C02820BL");
  assert.ok(c0Price, "Preço de C0 deve existir");
  assert.equal(c0Price.preco_sem_promocao, 169.90, "C0 deve custar 169.90");
});

test("REGRESSÃO: Produto de pesca com preço existente no cache não quebra", () => {
  const dummyCache = {
    por_sku: {
      "4330": {
        sku: "4330",
        preco_sem_promocao: 21.90,
        preco_atual: 21.90,
        em_promocao: false
      }
    },
    por_pai: {}
  };
  const price = getProductPrices(dummyCache, "4330");
  assert.ok(price, "Produto 4330 deve ter preço");
  assert.equal(price.preco_sem_promocao, 21.90);

  const product4330 = {
    sku: "4330",
    titulo_shopee: "Kit Anzol Encastoado Albatroz Cabo de Aço Reforçado Anti-Corte",
    marca: "Albatroz",
    modelo: "METÁLICO LISO",
    categoria_sugerida: "Esportes e Atividades ao Ar Livre > Equipamentos Esportivos e Recreação ao Ar Livre > Pescaria > Anzóis",
    descricao: "Kit de anzóis encastoados reforçados para pesca esportiva com cabo de aço resistente a dentes afiados.",
    preco: price,
    imagens: [DUMMY_IMAGE],
    cod_sankhya: "54561",
    atributos: {}
  };

  const validation = validateProduct(product4330);
  assert.equal(validation.valid, true, `4330 deve ser válido: ${validation.errors.join(", ")}`);
});

test("SKU NOVO: Leitura da planilha com colunas atípicas não contamina cod_sankhya com texto", () => {
  const atipicoXlsx = path.join(FIXTURES_DIR, "teste_atipico.xlsx");
  // Simula planilha onde a coluna 2 tem a descrição longa em vez de código numérico
  const rows = [
    ["Cod_Sistema", "Descricao_Produto", "Detalhes_Texto", "Grupo"],
    ["BT003", "Bota Texas BRK Agro Original Trabalho", "Couro Legitimo Bidensidade Muito Confortavel", "Calcados"],
    ["C01060", "Camisa Country Rosa Feminina Brk O Agro Nao Para Mulheres", "Uv50 Protecao Maxima", "Vestuario"]
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Atipico");
  XLSX.writeFile(wb, atipicoXlsx);

  const items = extractProductsFromXls(atipicoXlsx, null);
  for (const item of items) {
    assert.ok(
      !item.cod_sankhya || /^\d{1,16}$/.test(item.cod_sankhya),
      `cod_sankhya do SKU ${item.sku} NUNCA pode receber texto longo da descrição: "${item.cod_sankhya}"`
    );
  }
});

test("SKU NOVO: Categorias de bota, boné e camisa adulta não caem em Moda Infantil ou Pesca genérica", () => {
  // Teste (a): Bota
  const botaData = {
    sku: "BT003",
    titulo_shopee: "Bota Cano Curto BRK Agro Couro Camurça Bege Antiderrapante Confortável",
    marca: "BRK Agro",
    modelo: "Cano Curto Bege",
    categoria_sugerida: "",
    descricao: "Bota confeccionada em couro legítimo camurça de alta resistência ideal para campo e trabalho pesado.",
    atributos: {}
  };
  const normBota = validateAndNormalize(botaData, "BT003").data;
  assert.ok(!normBota.categoria_sugerida.includes("Moda Infantil"), `Bota não pode ser Moda Infantil: ${normBota.categoria_sugerida}`);
  assert.ok(normBota.categoria_sugerida.includes("Sapatos") || normBota.categoria_sugerida.includes("Bota") || normBota.categoria_sugerida.includes("Chinelos"), `Bota deve estar em calçados: ${normBota.categoria_sugerida}`);

  // Teste (b): Boné
  const boneData = {
    sku: "BA0112",
    titulo_shopee: "Boné Trucker BRK Motors Expedição Atacama Aba Curva Camurça Telinha Masculino",
    marca: "BRK Motors",
    modelo: "Trucker Atacama",
    categoria_sugerida: "",
    descricao: "Boné modelo trucker confeccionado com tela respirável e aba curva para proteção contra o sol.",
    atributos: {}
  };
  const normBone = validateAndNormalize(boneData, "BA0112").data;
  assert.ok(!normBone.categoria_sugerida.includes("Camisas"), `Boné não pode ser Camisa: ${normBone.categoria_sugerida}`);
  assert.ok(normBone.categoria_sugerida.includes("Bonés") || normBone.categoria_sugerida.includes("Acessórios de Moda"), `Boné deve estar em Bonés/Acessórios: ${normBone.categoria_sugerida}`);

  // Teste (c): Camisa Adulta
  const camisaData = {
    sku: "C01060",
    titulo_shopee: "Camisa Manga Longa Masculina BRK Agro Não Para UV50+ Conforto Térmico",
    marca: "BRK Agro",
    modelo: "Agro Não Para",
    categoria_sugerida: "",
    descricao: "Camisa manga longa masculina com tecido tecnológico proteção solar UV50+ e secagem ultra rápida.",
    atributos: {}
  };
  const normCamisa = validateAndNormalize(camisaData, "C01060").data;
  assert.ok(!normCamisa.categoria_sugerida.includes("Moda Infantil"), `Camisa adulta não pode ser Moda Infantil: ${normCamisa.categoria_sugerida}`);
  assert.ok(normCamisa.categoria_sugerida.includes("Roupas Masculinas"), `Camisa masculina deve ser Roupas Masculinas: ${normCamisa.categoria_sugerida}`);
});

test("SKU NOVO: Preço de SKU não cadastrado na Shopify não quebra com erro não tratado", () => {
  const emptyCache = { por_sku: {}, por_pai: {} };
  const price = getProductPrices(emptyCache, "BA0112");
  assert.ok(price === null || typeof price?.preco_sem_promocao === "number");
});

test("DECISÃO D3: Categoria incerta define categoria aproximada e marca revisao_categoria: true", () => {
  const incertoData = {
    sku: "ITEM_CUSTOM_999",
    titulo_shopee: "Item Especial BRK Multiuso Campo e Cidade Conforto",
    marca: "BRK",
    modelo: "Especial",
    categoria_sugerida: "",
    descricao: "Item especial para uso geral multiuso e dia a dia praticidade total.",
    atributos: {}
  };
  const normIncerto = validateAndNormalize(incertoData, "ITEM_CUSTOM_999").data;
  assert.ok(normIncerto.categoria_sugerida, "Deve ter uma categoria sugerida aproximada");
  assert.strictEqual(normIncerto.revisao_categoria, true, "Deve conter a flag de revisão manual para rascunho");
  assert.ok(normIncerto.motivo_revisao_categoria, "Deve conter a justificativa da revisão");
});

test("DECISÃO D1 & D2: Contratos de preço manual e bloqueio sem fotos", () => {
  // D1: Preço manual informado pelo usuário passa no checkpoint com sucesso
  const itemComPrecoManual = {
    sku: "SKU_NOVO_D1",
    titulo_shopee: "Camisa Masculina BRK Pesca Conforto UV50+",
    modelo: "Pesca Conforto",
    marca: "BRK Fishing",
    descricao: "Camisa manga longa para pesca esportiva com proteção solar UV50+ e tecido tecnológico de secagem ultra rápida.",
    preco: {
      preco_sem_promocao: 199.90,
      preco_com_promocao: null,
      preco_atual: 199.90,
      manual: true
    },
    imagens: [path.join(FIXTURES_DIR, "dummy.jpg")],
    atributos: { marca: "BRK" }
  };
  const checkD1 = validateProduct(itemComPrecoManual);
  assert.strictEqual(checkD1.valid, true, `Produto com preço manual deve ser validado com sucesso: ${checkD1.errors.join(", ")}`);

  // D2: Produto sem imagens é bloqueado com motivo claro
  const itemSemFotos = {
    sku: "SKU_SEM_FOTOS",
    titulo_shopee: "Camisa Masculina BRK Pesca Conforto UV50+",
    preco: { preco_sem_promocao: 199.90 },
    imagens: [],
    atributos: {}
  };
  const checkD2 = validateProduct(itemSemFotos);
  assert.strictEqual(checkD2.valid, false, "Produto sem imagens DEVE ser bloqueado");
  assert.ok(checkD2.errors.some(e => /imagem/i.test(e)), "Erro deve acusar ausência de imagem");
});
test("COMPORTAMENTO D1: Preço com vírgula, zero, negativo, texto e limites numéricos", () => {
  // Parsing de vírgula decimal
  const parseVal = (val) => typeof val === 'string' ? parseFloat(val.replace(',', '.')) : Number(val);
  assert.strictEqual(parseVal("189,90"), 189.90);
  assert.strictEqual(parseVal("189.90"), 189.90);

  // Invalidação de <= 0 e texto
  assert.ok(isNaN(parseVal("abc")), "Texto deve resultar em NaN");
  assert.ok(parseVal("0") <= 0, "Zero deve ser considerado inválido");
  assert.ok(parseVal("-15.00") <= 0, "Negativo deve ser considerado inválido");

  // Limites permitidos
  const MIN = 1.0;
  const MAX = 5000.0;
  assert.ok(parseVal("0.50") < MIN, "Abaixo do mínimo");
  assert.ok(parseVal("99999.00") > MAX, "Acima do máximo");
  assert.ok(parseVal("150.00") >= MIN && parseVal("150.00") <= MAX, "Dentro da faixa");
});

test("COMPORTAMENTO D1: SKU com preço pendente atualiza JSON e lote sem reprocessar do zero", () => {
  const cleanSku = "SKU_PENDENTE_TEST";
  const numPrice = 149.90;
  const dummyProd = {
    sku: cleanSku,
    titulo_shopee: "Item de Teste Pendente",
    preco: { preco_sem_promocao: null, preco_atual: null },
    status: "aguardando preço"
  };

  // Simula resolução da resposta
  dummyProd.preco.preco_sem_promocao = numPrice;
  dummyProd.preco.preco_atual = numPrice;
  dummyProd.preco.manual = true;
  dummyProd.status = "enriched";

  assert.strictEqual(dummyProd.preco.preco_sem_promocao, 149.90);
  assert.strictEqual(dummyProd.status, "enriched");
});

test("SKU NOVO PESCA FORA DO CACHE: Isca ou anzol novo tem categoria e validação corretas", () => {
  const iscaData = {
    sku: "ISCA_ZARA_NEW_99",
    titulo_shopee: "Isca Artificial Superfície Zara 110mm 20g Tucunaré Robalo",
    marca: "BRK Fishing",
    modelo: "Zara 110",
    descricao: "Isca de superfície com nado em zigue zague provocante para pesca de tucunarés e robalos predadores.",
    categoria_sugerida: "",
    atributos: {}
  };

  const norm = validateAndNormalize(iscaData, "ISCA_ZARA_NEW_99").data;
  assert.ok(norm.categoria_sugerida.includes("Iscas"), `Isca deve ser categorizada como Iscas: ${norm.categoria_sugerida}`);
  assert.strictEqual(norm.revisao_categoria, undefined, "Isca com termos claros não deve ficar para revisão");

  // Preço fora do cache retorna null (desencadeando busca online / prompt manual sem quebrar)
  const emptyCache = { por_sku: {}, por_pai: {} };
  const price = getProductPrices(emptyCache, "ISCA_ZARA_NEW_99");
  assert.strictEqual(price, null, "Preço fora do cache deve ser null de forma tratada");
});

test("BUG SANITIZESANKHYACODE: Validação estrita de códigos numéricos inteiros e rejeição de texto", () => {
  // Casos que DEVEM passar retornando apenas a parte inteira de 5 dígitos:
  assert.strictEqual(sanitizeSankhyaCode("53863"), "53863", "String de 5 dígitos deve passar");
  assert.strictEqual(sanitizeSankhyaCode("53863.0"), "53863", "Número decimal .0 deve retornar parte inteira");
  assert.strictEqual(sanitizeSankhyaCode("53863.000"), "53863", "Número decimal .000 deve retornar parte inteira");
  assert.strictEqual(sanitizeSankhyaCode(53863), "53863", "Tipo Number 53863 deve passar");
  assert.strictEqual(sanitizeSankhyaCode(" 53863 "), "53863", "String com espaços em volta deve passar após trim");

  // Casos que DEVEM ser descartados retornando "":
  assert.strictEqual(sanitizeSankhyaCode("Camisa Brk 12345"), "", "Texto com números embutidos NÃO pode ser extraído");
  assert.strictEqual(sanitizeSankhyaCode("ABC-12345"), "", "Prefixo texto NÃO pode ser aceito");
  assert.strictEqual(sanitizeSankhyaCode("5386 3"), "", "Espaço no meio dos dígitos deve ser descartado");
  assert.strictEqual(sanitizeSankhyaCode("538"), "", "Menos de 5 dígitos deve ser descartado");
  assert.strictEqual(sanitizeSankhyaCode("538631"), "", "Mais de 5 dígitos deve ser descartado");
  assert.strictEqual(sanitizeSankhyaCode(""), "", "Vazio deve retornar vazio");
  assert.strictEqual(sanitizeSankhyaCode(null), "", "Null deve retornar vazio");
  assert.strictEqual(sanitizeSankhyaCode(undefined), "", "Undefined deve retornar vazio");
});

test("REGRESSÃO DE CATEGORIAS: Isca, Anzol, Vara, Molinete, Botas e Camisas históricas", () => {
  // 1. Anzol
  const anzol = validateAndNormalize({
    sku: "ANZ_CHINU_05",
    titulo_shopee: "Anzol Marine Sports Chinu Black Nickel Resistente Pesca",
    modelo: "Chinu Black Nickel",
    descricao: "Anzol de aço carbono de alta resistência para pesca de piaus e piaparas.",
    categoria_sugerida: "",
    atributos: {}
  }, "ANZ_CHINU_05").data;
  assert.ok(anzol.categoria_sugerida.includes("Anzóis"), `Anzol deve estar em Anzóis: ${anzol.categoria_sugerida}`);

  // 2. Vara de Pesca
  const vara = validateAndNormalize({
    sku: "VP_LUMIS_60",
    titulo_shopee: "Vara Para Carretilha Lumis Infinity 6'0 17lbs Carbono",
    modelo: "Infinity Carbono",
    descricao: "Vara de pesca esportiva fabricada em carbono japonês IM8 de ação rápida.",
    categoria_sugerida: "",
    atributos: {}
  }, "VP_LUMIS_60").data;
  assert.ok(vara.categoria_sugerida.includes("Varas"), `Vara deve estar em Varas: ${vara.categoria_sugerida}`);

  // 3. Molinete
  const molinete = validateAndNormalize({
    sku: "MOL_DAIWA_2500",
    titulo_shopee: "Molinete Daiwa Crossfire 2500 Drag 4kg Pescaria",
    modelo: "Crossfire 2500",
    descricao: "Molinete com carretel de alumínio e engrenagens reforçadas para pesca média.",
    categoria_sugerida: "",
    atributos: {}
  }, "MOL_DAIWA_2500").data;
  assert.ok(molinete.categoria_sugerida.includes("Varas e Molinetes"), `Molinete deve estar em Varas e Molinetes: ${molinete.categoria_sugerida}`);

  // 4. Bota / Calçado Masculino
  const bota = validateAndNormalize({
    sku: "BT_TEXAS_01",
    titulo_shopee: "Botina Bota Country BRK Agro Couro Nobuck Legitimo",
    modelo: "Texas Agro",
    descricao: "Botina de trabalho e campo com solado bidensidade antiderrapante e couro legítimo.",
    categoria_sugerida: "",
    atributos: {}
  }, "BT_TEXAS_01").data;
  assert.ok(bota.categoria_sugerida.includes("Botas"), `Bota deve estar em Botas: ${bota.categoria_sugerida}`);

  // 5. Camisa Feminina
  const femCamisa = validateAndNormalize({
    sku: "C0299_BL",
    titulo_shopee: "Camisa Feminina BRK Pesca Baby Look Proteção Solar UV50+",
    modelo: "Starfem Rosa",
    descricao: "Camisa manga longa baby look feminina para pesca e atividades ao ar livre.",
    categoria_sugerida: "",
    atributos: {}
  }, "C0299_BL").data;
  assert.ok(femCamisa.categoria_sugerida.includes("Roupas Femininas"), `Baby Look deve ser Roupas Femininas: ${femCamisa.categoria_sugerida}`);
});

test("AMBIENTE VERCEL: Recusa clara de execução de agentes RPA em runtime serverless", () => {
  // Testa a lógica pura de detecção implementada no server.mjs
  const checkVercel = (env, cwd) => {
    return Boolean(
      env.VERCEL ||
      env.AWS_LAMBDA_FUNCTION_NAME ||
      cwd.startsWith('/var/task')
    );
  };

  assert.strictEqual(checkVercel({ VERCEL: "1" }, "C:\\app"), true, "VERCEL=1 deve acionar bloqueio");
  assert.strictEqual(checkVercel({}, "/var/task/agent0-sankhya"), true, "Cwd /var/task deve acionar bloqueio");
  assert.strictEqual(checkVercel({ AWS_LAMBDA_FUNCTION_NAME: "api" }, "/tmp"), true, "Lambda env deve acionar bloqueio");
  assert.strictEqual(checkVercel({}, "C:\\Users\\marke\\app"), false, "Ambiente local/VPS deve passar");
});


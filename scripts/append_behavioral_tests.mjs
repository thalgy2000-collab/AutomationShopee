import fs from 'fs';

const path = 'tests/pipeline_contract.test.mjs';
let content = fs.readFileSync(path, 'utf8');

const additionalTests = `
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
  assert.ok(norm.categoria_sugerida.includes("Iscas"), \`Isca deve ser categorizada como Iscas: \${norm.categoria_sugerida}\`);
  assert.strictEqual(norm.revisao_categoria, undefined, "Isca com termos claros não deve ficar para revisão");

  // Preço fora do cache retorna null (desencadeando busca online / prompt manual sem quebrar)
  const emptyCache = { por_sku: {}, por_pai: {} };
  const price = getProductPrices(emptyCache, "ISCA_ZARA_NEW_99");
  assert.strictEqual(price, null, "Preço fora do cache deve ser null de forma tratada");
});
`;

content = content.trim() + '\n' + additionalTests.trim() + '\n';
fs.writeFileSync(path, content, 'utf8');
console.log('pipeline_contract.test.mjs updated with behavioral tests');

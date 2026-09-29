import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { buildProductAttributes } from '../src/attribute_mapper.mjs';

console.log('🧪 Executando testes unitários do Mapeador de Atributos do Agente 5...\n');

// Teste 1: Camisa Masculina Agro
const camisaMasculina = {
  sku: 'C02820',
  titulo_shopee: 'Camisa Agro BRK São Bento Preta Dourada Proteção UV50+ Manga Longa',
  marca: 'BRK',
  atributos: {
    material: 'XTech-Pro',
    gola: 'Gola Alta',
    ocasiao: 'Fazenda',
    comprimento_da_manga: 'Manga Comprida'
  }
};

const resCamisa = buildProductAttributes(camisaMasculina);
assert.strictEqual(resCamisa.isCamisa, true, 'Deve identificar como camisa');
assert.strictEqual(resCamisa.resolvedValues.genero, 'Masculino', 'Gênero deve ser Masculino');
assert.strictEqual(resCamisa.resolvedValues.material, 'XTech-Pro', 'Material deve ser XTech-Pro');
assert.strictEqual(resCamisa.resolvedValues.comprimentoManga, 'Manga Comprida', 'Manga deve ser Manga Comprida');
assert.strictEqual(resCamisa.resolvedValues.gola, 'Gola Alta', 'Gola deve ser Gola Alta');
console.log('✅ Teste 1 (Camisa Masculina Agro) Aprovado!');

// Teste 2: Camisa Feminina Baby Look
const camisaFeminina = {
  sku: 'C02820BL',
  titulo_shopee: 'Camisa Feminina Baby Look BRK São Bento UV50+',
  marca: 'BRK'
};

const resFem = buildProductAttributes(camisaFeminina);
assert.strictEqual(resFem.resolvedValues.genero, 'Feminino', 'Deve detectar gênero Feminino por SKU BL e título');
console.log('✅ Teste 2 (Camisa Feminina Baby Look) Aprovado!');

// Teste 3: Bandana Tubeneck
const bandana = {
  sku: 'ALL_TUBENECK01',
  titulo_shopee: 'Bandana Tubeneck BRK Camuflada Proteção Solar UV50+'
};

const resBandana = buildProductAttributes(bandana);
assert.strictEqual(resBandana.isBandana, true, 'Deve identificar como bandana');
assert.strictEqual(resBandana.resolvedValues.genero, 'Unissex', 'Bandana deve ter gênero Unissex');
assert.strictEqual(resBandana.resolvedValues.material, 'Poliéster', 'Bandana deve ter material Poliéster');
console.log('✅ Teste 3 (Bandana Tubeneck) Aprovado!');

// Teste 4: Copo Térmico
const copo = {
  sku: 'CPT023',
  titulo_shopee: 'Copo Térmico Inox BRK Tucunaré 473ml'
};

const resCopo = buildProductAttributes(copo);
assert.strictEqual(resCopo.isCopo, true, 'Deve identificar como copo térmico');
assert.strictEqual(resCopo.resolvedValues.material, 'Aço Inoxidável', 'Copo deve ter material Aço Inoxidável');
console.log('✅ Teste 4 (Copo Térmico) Aprovado!');

// Teste 5: Isca de Pesca
const isca = {
  sku: 'BRAVA90',
  titulo_shopee: 'Isca Artificial Marine Sports Brava 90 Meia Água'
};

const resIsca = buildProductAttributes(isca);
assert.strictEqual(resIsca.isIsca, true, 'Deve identificar como isca');
assert.strictEqual(resIsca.resolvedValues.marca, 'Marine Sports', 'Deve detectar marca parceira Marine Sports');
console.log('✅ Teste 5 (Isca Artificial) Aprovado!');

// Teste 6: Testar com arquivo real se existir
const sampleFile = path.resolve('./agent2-enricher/produtos/C02820.json');
if (fs.existsSync(sampleFile)) {
  const realJson = JSON.parse(fs.readFileSync(sampleFile, 'utf-8'));
  const resReal = buildProductAttributes(realJson);
  assert.ok(resReal.fieldRules.length >= 7, 'Deve gerar pelo menos 7 regras de atributos para o produto real');
  console.log(`✅ Teste 6 (Arquivo Real C02820.json: ${resReal.fieldRules.length} regras geradas) Aprovado!`);
}

console.log('\n🎉 TODOS OS TESTES DO MAPEADOR PASSARAM COM SUCESSO!\n');

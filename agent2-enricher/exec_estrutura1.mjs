#!/usr/bin/env node
/**
 * exec_estrutura1.mjs — Script CLI para executar a Estrutura 1
 *
 * Uso:
 *   node exec_estrutura1.mjs --parent ADV256_257_341BL --models ADV256BL,ADV257BL,ADV341BL
 *   node exec_estrutura1.mjs --parent ADV256_257_341BL --models ADV256BL,ADV257BL,ADV341BL --publish
 */

import { generateMultiModelProduct } from "./multi_model_generator.mjs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const args = process.argv.slice(2);
let parentSku = null;
let models = [];
let sizes = ["PP", "P", "M", "G", "GG", "G1", "G2"];
let price = null;
let publish = false;
let title = "";

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--parent" && args[i + 1]) {
    parentSku = args[i + 1];
    i++;
  } else if (args[i] === "--models" && args[i + 1]) {
    models = args[i + 1].split(",").map(m => m.trim()).filter(Boolean);
    i++;
  } else if (args[i] === "--sizes" && args[i + 1]) {
    sizes = args[i + 1].split(",").map(s => s.trim()).filter(Boolean);
    i++;
  } else if (args[i] === "--price" && args[i + 1]) {
    price = parseFloat(args[i + 1]);
    i++;
  } else if (args[i] === "--title" && args[i + 1]) {
    title = args[i + 1];
    i++;
  } else if (args[i] === "--publish") {
    publish = true;
  }
}

if (!parentSku || models.length === 0) {
  console.log(`
Uso do Executor de Estrutura 1:
  node exec_estrutura1.mjs --parent <SKU_PAI> --models <MODELO1,MODELO2,...> [opções]

Opções:
  --parent <sku>        SKU Pai mestre (vai no campo Dados Gerais > SKU do Magis5)
  --models <m1,m2>      Lista separada por vírgula dos códigos de modelo
  --sizes <p,m,g>       Lista de tamanhos (padrão: PP,P,M,G,GG,G1,G2)
  --price <num>         Preço sem promoção (opcional)
  --title <txt>         Título SEO (opcional, sem SKU)
  --publish             Ativa o Agente 3 (RPA Magis5) para cadastrar no Magis5 imediatamente

Exemplo:
  node exec_estrutura1.mjs --parent ADV256_257_341BL --models ADV256BL,ADV257BL,ADV341BL --publish
`);
  process.exit(1);
}

async function run() {
  console.log(`\n🧩 Executando Agente - Estrutura 1 (Multi-Modelo com Grade de Tamanhos)...`);
  console.log(`📌 SKU Pai (Campo Dados Gerais): ${parentSku}`);
  console.log(`👕 Modelos selecionados: ${models.join(", ")}`);
  console.log(`📏 Tamanhos por modelo: ${sizes.join(", ")}`);
  console.log(`📊 Total de Variações previstas: ${models.length * sizes.length}`);

  const product = await generateMultiModelProduct({
    parentSku,
    modelos: models,
    tamanhos: sizes,
    preco: price,
    titulo: title,
  });

  console.log(`\n🎉 JSON enriquecido gerado com sucesso!`);
  console.log(`📝 Título Shopee (sem SKU): "${product.titulo_shopee}"`);
  console.log(`📂 Arquivo salvo em: agent2-enricher/produtos/${parentSku}.json`);

  if (publish) {
    console.log(`\n🚀 Disparando Agente 3 (RPA Magis5) para publicação do SKU Pai [${parentSku}]...`);
    const rpaProc = spawn("node", [
      "src/runner.mjs",
      "--sku", parentSku,
      "--publish",
    ], {
      cwd: resolve("../agent3-rpa-magis5"),
      stdio: "inherit",
    });

    rpaProc.on("close", (code) => {
      console.log(`Agente 3 finalizado com código ${code}.`);
    });
  } else {
    console.log(`\n💡 Dica: Para enviar agora para o Magis5, rode com --publish ou use o Painel Web.`);
  }
}

run().catch(console.error);

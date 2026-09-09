/**
 * enrich_existing_attributes.mjs — Atualiza todos os 53 produtos com os atributos da Ficha Técnica Shopee
 * e pesquisa na web quando necessário.
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { normalizeShopeeAttributes } from "./schemas.mjs";
import { searchLureSpecsWeb } from "./web_specs_search.mjs";

async function main() {
  const PRODUTOS_DIR = resolve("./produtos");
  const files = (await readdir(PRODUTOS_DIR)).filter((f) => f.endsWith(".json"));

  console.log(`Verificando e enriquecendo atributos técnicos em ${files.length} produtos...`);
  let iscasCount = 0;
  let webSearched = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = join(PRODUTOS_DIR, file);
    try {
      const data = JSON.parse(await readFile(filePath, "utf-8"));

      // Normaliza atributos
      normalizeShopeeAttributes(data);

      const isIsca = /isca/i.test(data.categoria_sugerida || "");
      if (isIsca) {
        iscasCount++;
        const attrs = data.atributos;

        // Se comprimento ou peso estiverem ausentes ou incertos, busca na web
        if (!attrs.comprimento || !attrs.peso_do_produto || attrs.peso_do_produto === "10g") {
          const web = await searchLureSpecsWeb(data.marca, data.modelo || data.titulo_shopee);
          if (web) {
            webSearched++;
            if (web.comprimento && (!attrs.comprimento || attrs.comprimento === "9 cm")) {
              attrs.comprimento = web.comprimento;
            }
            if (web.peso && (!attrs.peso_do_produto || attrs.peso_do_produto === "10g")) {
              attrs.peso_do_produto = web.peso;
            }
            if (web.material) attrs.material = web.material;
            if (web.acao && !attrs.tipo_isca) attrs.tipo_isca = web.acao;
          }
        }

        // Ordena os atributos conforme a Ficha Técnica da Shopee
        const ordered = {
          pais_de_origem: attrs.pais_de_origem || "Brasil",
          peso_do_produto: attrs.peso_do_produto || "10g",
          duracao_da_garantia: attrs.duracao_da_garantia || "1 Mês",
          material: attrs.material || "Plástico ABS",
          estampa: attrs.estampa || "Holográfica / Realista",
          condicao: "Novo",
          comprimento: attrs.comprimento || "9 cm",
          dimensoes_do_produto: attrs.dimensoes_do_produto || `2 x 2 x ${attrs.comprimento || "9 cm"}`,
          quantidade_da_embalagem: attrs.quantidade_da_embalagem || "1",
          tamanho_do_pacote: attrs.tamanho_do_pacote || "3 x 20 x 30 cm",
          produto_personalizado: "Não",
          quantidade_por_pacote: attrs.quantidade_por_pacote || "1",
        };

        if (attrs.tipo_isca) ordered.tipo_isca = attrs.tipo_isca;
        if (attrs.flutuabilidade) ordered.flutuabilidade = attrs.flutuabilidade;

        // Mantém outros atributos extras que possam existir
        for (const [k, v] of Object.entries(attrs)) {
          if (!(k in ordered) && k !== "peso_produto" && k !== "tamanho") {
            ordered[k] = v;
          }
        }

        data.atributos = ordered;
      }

      await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
      process.stdout.write(`\r[${i + 1}/${files.length}] Processado ${data.sku}...`);
    } catch (err) {
      console.error(`\nErro ao processar ${file}:`, err.message);
    }
  }

  console.log(`\n\n✅ Sucesso!`);
  console.log(`📦 Total de produtos verificados: ${files.length}`);
  console.log(`🎣 Iscas atualizadas com Ficha Técnica completa: ${iscasCount}`);
  if (webSearched > 0) {
    console.log(`🔍 Pesquisas web realizadas com sucesso: ${webSearched}`);
  }
}

main().catch(console.error);

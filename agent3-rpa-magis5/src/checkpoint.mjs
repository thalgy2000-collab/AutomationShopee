import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PRODUTOS_DIR, DOWNLOADS_DIR, SHOPEE_MAX_TITLE_LENGTH } from "./config.mjs";

/**
 * Valida o contrato de dados de um produto enriquecido antes do envio ao Magis5.
 *
 * @param {object} product - Objeto de produto do Agente 2
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateProduct(product) {
  const errors = [];
  const warnings = [];

  // 1. Identificação Básica
  if (!product.sku || typeof product.sku !== "string") {
    errors.push("SKU obrigatório ausente ou inválido");
  }

  if (!product.cod_sankhya) {
    warnings.push("Código Sankhya (ERP) não associado");
  }

  // 2. Título Shopee
  if (!product.titulo_shopee || typeof product.titulo_shopee !== "string") {
    errors.push("Título Shopee obrigatório ausente");
  } else {
    const len = product.titulo_shopee.trim().length;
    if (len === 0) {
      errors.push("Título Shopee está vazio");
    } else if (len > SHOPEE_MAX_TITLE_LENGTH) {
      errors.push(`Título Shopee excede limite de ${SHOPEE_MAX_TITLE_LENGTH} caracteres (${len} chars)`);
    }
  }

  // 3. Marca e Modelo
  if (!product.marca || product.marca === "N/A") {
    warnings.push("Marca não definida ou está como 'N/A'");
  }
  if (!product.modelo || product.modelo === "N/A") {
    warnings.push("Modelo não definido ou está como 'N/A'");
  }

  // 4. Descrição
  if (!product.descricao || product.descricao.trim().length < 50) {
    errors.push("Descrição ausente ou muito curta (mínimo 50 caracteres)");
  }

  // 5. Preços
  let pSem = null;
  if (product.preco && typeof product.preco === "object") {
    pSem = product.preco.preco_sem_promocao ?? product.preco.preco_atual ?? product.preco.preco_venda;
  } else if (typeof product.preco === "number") {
    pSem = product.preco;
  }

  // Fallback para variações se preço da raiz não foi definido
  if ((pSem === null || pSem === undefined) && Array.isArray(product.variacoes) && product.variacoes.length > 0) {
    for (const v of product.variacoes) {
      const vPrice = v.preco_sem_promocao ?? v.preco_atual ?? v.preco;
      if (typeof vPrice === "number" && vPrice > 0) {
        pSem = vPrice;
        break;
      }
    }
  }

  if (pSem === null || pSem === undefined) {
    errors.push("Preço regular não definido");
  } else if (typeof pSem !== "number" || pSem <= 0) {
    errors.push(`Preço regular inválido: ${pSem}`);
  }


  // 6. Imagens
  const images = Array.isArray(product.imagens) ? product.imagens : [];
  const existingImgs = images.filter((p) => existsSync(p));

  // Fallback se não há imagens diretas: verifica pasta downloads/{sku}
  let totalImgs = existingImgs.length;
  if (totalImgs === 0 && product.sku) {
    const fallbackDir = join(DOWNLOADS_DIR, product.sku);
    if (existsSync(fallbackDir)) {
      totalImgs = 1; // Pasta existe
    }
  }

  if (totalImgs === 0) {
    errors.push("Nenhuma imagem física encontrada para o produto");
  }

  // 7. Variações (se aplicável)
  if (Array.isArray(product.variacoes) && product.variacoes.length > 0) {
    product.variacoes.forEach((v, idx) => {
      const vIdent = v.nome || v.sku || `Var #${idx + 1}`;
      if (!v.sku) {
        errors.push(`Variação '${vIdent}' sem SKU`);
      }
      const vPrice = v.preco_com_promocao ?? v.preco_sem_promocao ?? v.preco_atual;
      if (vPrice !== null && vPrice !== undefined && (typeof vPrice !== "number" || vPrice <= 0)) {
        errors.push(`Variação '${vIdent}' com preço inválido: ${vPrice}`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Lê todos os JSONs de produtos e valida em lote.
 */
export async function loadAndValidateAll() {
  if (!existsSync(PRODUTOS_DIR)) {
    return { total: 0, validos: 0, invalidos: 0, items: [] };
  }

  const files = (await readdir(PRODUTOS_DIR)).filter((f) => f.endsWith(".json"));
  const results = [];

  for (const file of files) {
    try {
      const content = await readFile(join(PRODUTOS_DIR, file), "utf-8");
      const product = JSON.parse(content);
      const validation = validateProduct(product);
      results.push({
        file,
        sku: product.sku,
        titulo: product.titulo_shopee,
        cod_sankhya: product.cod_sankhya,
        variacoesCount: product.variacoes?.length || 0,
        ...validation,
        product,
      });
    } catch (err) {
      results.push({
        file,
        sku: file.replace(".json", ""),
        valid: false,
        errors: [`Erro de parsing JSON: ${err.message}`],
        warnings: [],
      });
    }
  }

  const validos = results.filter((r) => r.valid).length;
  const invalidos = results.filter((r) => !r.valid).length;

  return {
    total: results.length,
    validos,
    invalidos,
    items: results,
  };
}

/**
 * Função CLI para visualização rápida no terminal.
 */
export async function runCheckpointCli() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  🔍 Checkpoint de Pré-Voo — Validação para Magis5 / Shopee");
  console.log("═══════════════════════════════════════════════════════════\n");

  const summary = await loadAndValidateAll();
  console.log(`Total de produtos analisados: ${summary.total}`);
  console.log(`✅ Prontos para publicação:   ${summary.validos}`);
  console.log(`❌ Bloqueados por erros:       ${summary.invalidos}\n`);

  if (summary.invalidos > 0) {
    console.log("⚠️  Produtos com inconsistências:");
    summary.items
      .filter((i) => !i.valid)
      .forEach((item) => {
        console.log(`\n  • SKU: ${item.sku} (${item.file})`);
        item.errors.forEach((e) => console.log(`     ❌ ${e}`));
      });
  } else {
    console.log("🎉 100% dos produtos passaram na validação do contrato de dados!");
  }

  console.log("\nAmostra dos primeiros 5 produtos aprovados:");
  summary.items
    .filter((i) => i.valid)
    .slice(0, 5)
    .forEach((item, idx) => {
      console.log(`  ${idx + 1}. [${item.sku}] 🏷️ Sankhya: ${item.cod_sankhya || 'N/A'} | ${item.titulo.substring(0, 55)}...`);
    });
}

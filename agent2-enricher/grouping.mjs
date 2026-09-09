/**
 * grouping.mjs — Lógica de Agrupamento por Código Pai e Variações
 *
 * Agrupa SKUs filhos em um Produto Pai único com base no sufixo do SKU
 * (ex: BONNIE95_SAKURAP, BONNIE95_MATT -> Pai: BONNIE95, Variações: SAKURAP, MATT).
 */

/**
 * Extrai o Código Pai a partir do SKU.
 *
 * @param {string} sku - SKU do produto
 * @returns {string} Código pai
 */
export function extractParentSku(sku) {
  if (!sku) return "";
  const cleanSku = sku.trim();

  // Regra 0: tamanhos duplos de calçados (ex: COLTAZUL_37_38 -> COLTAZUL, BRAVEAZUL_39_40 -> BRAVEAZUL)
  if (/_\d+_\d+$/.test(cleanSku)) {
    return cleanSku.replace(/_\d+_\d+$/, "");
  }

  // Regra 1: separador underscore (ex: BONNIE95_SAKURAP -> BONNIE95)
  if (cleanSku.includes("_")) {
    return cleanSku.substring(0, cleanSku.lastIndexOf("_"));
  }

  // Regra 2: hífen com sufixo de variação (ex: HZ-01-A -> HZ-01, ISCA-SSC-80-095 -> ISCA-SSC-80)
  if (/-[A-Za-z0-9]{1,4}$/.test(cleanSku) && cleanSku.split("-").length > 2) {
    return cleanSku.substring(0, cleanSku.lastIndexOf("-"));
  }

  // Regra 3: produto sem variação de sufixo (o próprio SKU é o pai)
  return cleanSku;
}

/**
 * Extrai o nome/código da variação a partir do sufixo do SKU.
 *
 * @param {string} sku - SKU do produto
 * @returns {string|null} Nome do sufixo ou null se produto simples
 */
export function extractVariationSuffix(sku) {
  if (!sku) return null;
  const cleanSku = sku.trim();

  // Regra 0: tamanhos duplos de calçados (ex: COLTAZUL_37_38 -> 37/38, BRAVEAZUL_39_40 -> 39/40)
  const dualMatch = cleanSku.match(/_(\d+)_(\d+)$/);
  if (dualMatch) {
    return `${dualMatch[1]}/${dualMatch[2]}`;
  }

  if (cleanSku.includes("_")) {
    return cleanSku.substring(cleanSku.lastIndexOf("_") + 1);
  }

  if (/-[A-Za-z0-9]{1,4}$/.test(cleanSku) && cleanSku.split("-").length > 2) {
    return cleanSku.substring(cleanSku.lastIndexOf("-") + 1);
  }

  return null;
}

/**
 * Extrai o título base do produto removendo especificações da variação
 * (ex: "ISCA JACKALL BONNIE 95 - CORES:SAKURA PEARL" -> "ISCA JACKALL BONNIE 95")
 *
 * @param {string} title - Título bruto do fornecedor
 * @returns {string} Título base limpo
 */
export function extractBaseTitle(title) {
  if (!title) return "";
  return title
    .replace(/\s*-\s*CORES?\s*:.*$/i, "")
    .replace(/\s*-\s*MODELOS?\s*:.*$/i, "")
    .replace(/\s*-\s*QUANTIDADE\s*:.*$/i, "")
    .trim();
}

/**
 * Agrupa registros de produtos por Código Pai.
 *
 * @param {Array<object>} records - Linhas do CSV
 * @returns {Array<object>} Lista de grupos agrupados por pai
 */
export function groupRecordsByParent(records) {
  const groupsMap = new Map();

  for (const r of records) {
    const pSku = extractParentSku(r.sku);
    const suffix = extractVariationSuffix(r.sku);

    if (!groupsMap.has(pSku)) {
      groupsMap.set(pSku, {
        parentSku: pSku,
        baseTitle: extractBaseTitle(r.titulo_bruto),
        isGroup: false,
        items: [],
      });
    }

    const group = groupsMap.get(pSku);
    group.items.push({
      sku: r.sku,
      variationName: suffix || r.sku,
      rawTitle: r.titulo_bruto,
      status: r.status,
      record: r,
    });

    // Se tem mais de 1 item ou o SKU tem sufixo explícito, marca como grupo
    if (group.items.length > 1 || suffix !== null) {
      group.isGroup = true;
    }
  }

  return Array.from(groupsMap.values());
}

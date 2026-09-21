/**
 * grouping.mjs — Lógica de Agrupamento por Código Pai e Variações
 *
 * Agrupa SKUs filhos em um Produto Pai único com base no sufixo do SKU ou especificação no título.
 * Ex: BONNIE95_SAKURAP, BONNIE95_MATT -> Pai: BONNIE95, Variações: SAKURAP, MATT.
 * Ex: C02846BLP_FULL, C02846BLM_FULL, C02846BLG_FULL -> Pai: C02846BL, Variações: P, M, G.
 */

/**
 * Extrai o Código Pai a partir do SKU e do título opcional.
 *
 * @param {string} sku - SKU do produto
 * @param {string} [rawTitle] - Título original do produto para desambiguação
 * @returns {string} Código pai
 */
export function extractParentSku(sku, rawTitle = "") {
  if (!sku) return "";
  const cleanSku = sku.trim();

  // Regra 0: tamanhos duplos de calçados (ex: COLTAZUL_37_38 -> COLTAZUL, BRAVEAZUL_39_40 -> BRAVEAZUL)
  if (/_\d+_\d+$/.test(cleanSku)) {
    return cleanSku.replace(/_\d+_\d+$/, "");
  }

  // Regra 1: remove sufixo de canal/fulfillment antes de analisar vestuário (ex: _FULL, _SHOPEE, _ML, _MAGIS5, _BRK)
  const skuWithoutChannel = cleanSku.replace(/_(?:FULL|SHOPEE|ML|MAGIS5|BRK)$/i, "");

  // Regra 2: vestuário com tamanho colado diretamente após o código numérico ou após modificador (BL, I, FEM, MASC)
  // Ex: C02846BLG_FULL -> skuWithoutChannel: C02846BLG -> Pai: C02846BL
  // Ex: C02830P_FULL -> skuWithoutChannel: C02830P -> Pai: C02830
  // Ex: C02820BLPP -> Pai: C02820BL
  if (!skuWithoutChannel.toUpperCase().startsWith("VP")) {
    const sizeMatch = skuWithoutChannel.match(/^([A-Za-z0-9]*\d+(?:BL|I|FEM|MASC)?)(G[1-5]|XXG|EXG|EGG|XG|EG|GG|PP|[PMG])$/i);
    if (sizeMatch && sizeMatch[1].length >= 3) {
      return sizeMatch[1];
    }
  }

  // Regra 2b: Se o título tem TAMANHO explícito e o SKU termina com o tamanho (ou tamanho_FULL)
  if (rawTitle) {
    const titleSizeMatch = rawTitle.match(/-\s*TAMANHOS?\s*:\s*([A-Za-z0-9/]+)/i);
    if (titleSizeMatch) {
      const sizeStr = titleSizeMatch[1].trim();
      const regexEnding = new RegExp(`${sizeStr}(?:_(?:FULL|SHOPEE|ML|MAGIS5|BRK))?$`, "i");
      if (regexEnding.test(cleanSku)) {
        const potentialParent = cleanSku.replace(regexEnding, "");
        if (potentialParent.length >= 3) {
          return potentialParent;
        }
      }
    }
  }

  // Regra 3: separador underscore para cores/modelos (ex: BONNIE95_SAKURAP -> BONNIE95, CBTML042I_8 -> CBTML042I)
  if (skuWithoutChannel.includes("_")) {
    return skuWithoutChannel.substring(0, skuWithoutChannel.lastIndexOf("_"));
  }

  // Regra 4: hífen com sufixo de variação (ex: HZ-01-A -> HZ-01, ISCA-SSC-80-095 -> ISCA-SSC-80, APC0600-PRETO-G2 -> APC0600-PRETO)
  if (/-[A-Za-z0-9]{1,4}$/.test(skuWithoutChannel) && skuWithoutChannel.split("-").length > 2) {
    return skuWithoutChannel.substring(0, skuWithoutChannel.lastIndexOf("-"));
  }

  // Regra 5: produto sem variação de sufixo
  return skuWithoutChannel || cleanSku;
}

/**
 * Extrai o nome/código da variação a partir do sufixo do SKU e do título opcional.
 *
 * @param {string} sku - SKU do produto
 * @param {string} [rawTitle] - Título original do produto para desambiguação
 * @returns {string|null} Nome da variação (ex: P, M, G, SAKURAP) ou null se produto simples
 */
export function extractVariationSuffix(sku, rawTitle = "") {
  if (!sku) return null;
  const cleanSku = sku.trim();

  // Regra 0: se houver '- TAMANHO: <VAL>' explícito no título bruto
  if (rawTitle) {
    const titleSizeMatch = rawTitle.match(/-\s*TAMANHOS?\s*:\s*([A-Za-z0-9/]+?)(?:\s+|$|\r|\n|-)/i);
    if (titleSizeMatch) {
      return titleSizeMatch[1].trim().toUpperCase();
    }
  }

  // Regra 1: tamanhos duplos de calçados (ex: COLTAZUL_37_38 -> 37/38, BRAVEAZUL_39_40 -> 39/40)
  const dualMatch = cleanSku.match(/_(\d+)_(\d+)$/);
  if (dualMatch) {
    return `${dualMatch[1]}/${dualMatch[2]}`;
  }

  // Regra 2: remove sufixo de canal para ver se é vestuário com tamanho
  const skuWithoutChannel = cleanSku.replace(/_(?:FULL|SHOPEE|ML|MAGIS5|BRK)$/i, "");

  // Regra 3: vestuário com tamanho colado diretamente após o código numérico ou após modificador
  if (!skuWithoutChannel.toUpperCase().startsWith("VP")) {
    const sizeMatch = skuWithoutChannel.match(/^([A-Za-z0-9]*\d+(?:BL|I|FEM|MASC)?)(G[1-5]|XXG|EXG|EGG|XG|EG|GG|PP|[PMG])$/i);
    if (sizeMatch && sizeMatch[1].length >= 3) {
      return sizeMatch[2].toUpperCase();
    }
  }

  // Regra 4: se houver cor no título (para produtos que não sejam camisas com _FULL)
  if (rawTitle && !cleanSku.includes("_FULL")) {
    const corMatch = rawTitle.match(/-\s*CORES?\s*:\s*([A-Za-z0-9/_-]+)/i);
    if (corMatch) return corMatch[1].trim().toUpperCase();
  }

  // Regra 5: Underscore tradicional (ex: BONNIE95_SAKURAP -> SAKURAP)
  if (skuWithoutChannel.includes("_")) {
    return skuWithoutChannel.substring(skuWithoutChannel.lastIndexOf("_") + 1);
  }

  // Regra 6: Hífen
  if (/-[A-Za-z0-9]{1,4}$/.test(skuWithoutChannel) && skuWithoutChannel.split("-").length > 2) {
    return skuWithoutChannel.substring(skuWithoutChannel.lastIndexOf("-") + 1);
  }

  return null;
}

/**
 * Extrai o título base do produto removendo especificações da variação
 * (ex: "C02820BLPP - CAMISA AGRO FEMININA BRK SAO BENTO PRETA E DOURADA COM PROTECAO UV50+ - TAMANHO:PP" -> "CAMISA AGRO FEMININA BRK SAO BENTO PRETA E DOURADA COM PROTECAO UV50+")
 *
 * @param {string} title - Título bruto do fornecedor
 * @param {string|null} [sku] - SKU do item para limpeza do prefixo
 * @param {string|null} [parentSku] - SKU pai para limpeza do prefixo
 * @returns {string} Título base limpo
 */
export function extractBaseTitle(title, sku = null, parentSku = null) {
  if (!title) return "";
  let t = title.trim();

  // Remove prefixo de SKU no início do título se presente
  if (sku) {
    t = t.replace(new RegExp(`^${sku}\\s*-\\s*`, "i"), "");
  }
  if (parentSku) {
    t = t.replace(new RegExp(`^${parentSku}\\s*-\\s*`, "i"), "");
  }
  t = t.replace(/^[A-Za-z0-9_.-]{3,25}\s*-\s*/, "");

  return t
    .replace(/\s*-\s*TAMANHOS?\s*:.*$/i, "")
    .replace(/\s*-\s*TAMNHOS?\s*:.*$/i, "")
    .replace(/\s*-\s*CORES?\s*:.*$/i, "")
    .replace(/\s*-\s*MODELOS?\s*:.*$/i, "")
    .replace(/\s*-\s*QUANTIDADES?\s*:.*$/i, "")
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
    const pSku = extractParentSku(r.sku, r.titulo_bruto);
    const suffix = extractVariationSuffix(r.sku, r.titulo_bruto);

    if (!groupsMap.has(pSku)) {
      groupsMap.set(pSku, {
        parentSku: pSku,
        baseTitle: extractBaseTitle(r.titulo_bruto, r.sku, pSku),
        isGroup: false,
        items: [],
      });
    }

    const group = groupsMap.get(pSku);
    // Evita duplicar o mesmo SKU/variação se houver linhas redundantes no CSV
    if (!group.items.some((it) => it.sku === r.sku)) {
      group.items.push({
        sku: r.sku,
        variationName: suffix || r.sku,
        rawTitle: r.titulo_bruto,
        status: r.status,
        record: r,
      });
    }

    // Se tem mais de 1 item ou o SKU tem sufixo explícito, marca como grupo
    if (group.items.length > 1 || suffix !== null) {
      group.isGroup = true;
    }
  }

  return Array.from(groupsMap.values());
}

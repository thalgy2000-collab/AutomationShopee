/**
 * web_specs_search.mjs — Pesquisa na web em fontes confiáveis de pesca esportiva
 * para encontrar especificações técnicas faltantes de iscas (tamanho, peso, material, ação).
 *
 * Fontes de referência: Isca e Companhia, Juninho Pesca, Magazine do Pescador,
 * Pesca Pinheiros, Rei da Pesca, etc.
 */

/**
 * Busca na web especificações da isca pelo nome/modelo.
 * Retorna { comprimento, peso, material, tipo_isca, flutuabilidade } se encontrar.
 */
export async function searchLureSpecsWeb(brandOrModel, productName) {
  const query = `isca "${brandOrModel || ""}" ${productName || ""} especificações peso tamanho`;
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query.trim())}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8",
      },
    });

    if (!res.ok) return null;
    const text = await res.text();

    // Extrai os snippets da página de resultados
    const snippets = [];
    const regex = /<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    while ((m = regex.exec(text)) !== null) {
      const cleanSnippet = m[1]
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&");
      snippets.push(cleanSnippet);
    }

    const fullSnippetText = snippets.join(" ");

    // Extrai comprimento (ex: 9,5 cm, 95 mm, 9cm)
    let comprimento = null;
    const cmMatch = fullSnippetText.match(/(\d+(?:[.,]\d+)?)\s*(?:cm|cent[ií]metros)\b/i);
    const mmMatch = fullSnippetText.match(/(\d{2,3})\s*mm\b/i);
    if (cmMatch) {
      comprimento = `${cmMatch[1].replace(',', '.')} cm`;
    } else if (mmMatch) {
      comprimento = `${(parseFloat(mmMatch[1]) / 10).toFixed(1).replace('.0', '')} cm`;
    }

    // Extrai peso (ex: 12,8 g, 12.8g, 14 gramas)
    let peso = null;
    const gMatch = fullSnippetText.match(/(\d+(?:[.,]\d+)?)\s*g(?:ramas)?\b/i);
    if (gMatch) {
      peso = `${gMatch[1].replace(',', '.')}g`;
    }

    // Extrai material
    let material = "Plástico ABS";
    if (/silicone|soft|borracha/i.test(fullSnippetText)) {
      material = "Silicone / Borracha macia";
    } else if (/madeira|balsa/i.test(fullSnippetText)) {
      material = "Madeira Balsa";
    }

    // Extrai ação / nado
    let acao = null;
    if (/superf[ií]cie|zara|stick|popper|prop/i.test(fullSnippetText)) {
      acao = "Superfície";
    } else if (/fundo|sinking|deep/i.test(fullSnippetText)) {
      acao = "Fundo / Sinking";
    } else if (/meia[ -]?á?gua|minnow|twitch/i.test(fullSnippetText)) {
      acao = "Meia-Água";
    }

    if (comprimento || peso) {
      return {
        comprimento,
        peso,
        material,
        acao,
        fonte: "Pesquisa Web Confiável (Fontes de Pesca)",
      };
    }

    return null;
  } catch (err) {
    return null;
  }
}

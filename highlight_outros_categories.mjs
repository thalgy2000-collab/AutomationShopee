import fs from 'node:fs';
import path from 'node:path';
import XLSX from './agent3-rpa-magis5/node_modules/xlsx/xlsx.js';

function getSuggestedCategory(sku, title, currentCat) {
  const t = title.toLowerCase();
  const s = sku.toUpperCase();

  if (t.includes('fita') || s.startsWith('FT-')) {
    return 'Esportes e Atividades ao Ar Livre > Pescaria > Acessórios de Pesca';
  }
  if (t.includes('alicate')) {
    return 'Esportes e Atividades ao Ar Livre > Pescaria > Ferramentas e Alicates de Pesca';
  }
  if (t.includes('girador') || t.includes('snap') || t.includes('argola') || t.includes('empate') || s.includes('GIRA') || s.includes('EMPATE')) {
    return 'Esportes e Atividades ao Ar Livre > Pescaria > Anzóis, Giradores e Snaps';
  }
  if (t.includes('alça') || t.includes('suporte')) {
    return 'Esportes e Atividades ao Ar Livre > Pescaria > Suportes e Acessórios';
  }
  if (t.includes('manguito') || s.startsWith('MT')) {
    return 'Acessórios de Moda > Luvas e Manguitos Térmicos';
  }
  if (t.includes('babuche') || t.includes('chinelo') || t.includes('sandália') || s.startsWith('EVA') || s.startsWith('FLOW')) {
    return 'Sapatos Masculinos > Sandálias e Chinelos > Chinelos / Babuche';
  }
  if (t.includes('botina') || t.includes('bota') || s.startsWith('BT')) {
    return 'Sapatos Masculinos > Botas > Botinas Country';
  }
  if (t.includes('camisa') || t.includes('camiseta')) {
    return 'Roupas Masculinas > Tops > Camisetas';
  }
  return currentCat.replace('> Outros', '> Categoria Específica');
}

async function highlightOutros() {
  const inputPath = 'uploads/Relatorio_Diagnostico_Produtos_Ativos_Shopee_AoVivo.xlsx';
  const outputPath = 'uploads/Relatorio_Diagnostico_Produtos_Ativos_Shopee_AoVivo.xlsx';
  const downloadsPath = 'C:/Users/marke/Downloads/Relatorio_Diagnostico_Produtos_Ativos_Shopee_AoVivo_Com_DTS.xlsx';
  const downloadsDedicatedPath = 'C:/Users/marke/Downloads/Produtos_Com_Categoria_Outros.xlsx';

  console.log(`📖 Lendo planilha: ${inputPath}...`);
  const wb = XLSX.readFile(inputPath);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

  console.log(`Total de produtos ativos na planilha: ${rows.length}`);

  const outrosItems = [];

  const enrichedRows = rows.map(r => {
    const cat = String(r['Categoria Oficial Shopee (Ao Vivo)'] || '').trim();
    const hasOutros = cat.toLowerCase().includes('outros');
    const sku = String(r['SKU Principal'] || '').toUpperCase();
    const title = String(r['Produto'] || '');

    const alertaOutros = hasOutros 
      ? '🚨 CATEGORIA GENÉRICA "OUTROS" (Mudar para categoria específica!)' 
      : '✅ Categoria Específica OK';

    const catSugerida = hasOutros ? getSuggestedCategory(sku, title, cat) : cat;
    const catDestacada = hasOutros ? `🚨 [OUTROS] ${cat}` : cat;

    const rowObj = {
      'ID do Item': r['ID do Item'],
      'SKU Principal': r['SKU Principal'],
      'Produto': r['Produto'],
      'Alerta Categoria "Outros"': alertaOutros,
      'Categoria Oficial Shopee (Ao Vivo)': catDestacada,
      'Categoria Sugerida Corrigida': catSugerida,
      'Ficha Técnica Shopee (Ao Vivo)': r['Ficha Técnica Shopee (Ao Vivo)'],
      'Atributos Cadastrados na Shopee': r['Atributos Cadastrados na Shopee'],
      'Estoque Disponível Shopee (Ao Vivo)': r['Estoque Disponível Shopee (Ao Vivo)'],
      'Sufixo _FULL': r['Sufixo _FULL'] || (sku.includes('_FULL') ? 'SIM (_FULL)' : 'NÃO (Produção)'),
      'Status Prazo de Produção': r['Status Prazo de Produção'] || (sku.includes('_FULL') ? '✅ Pronta Entrega (_FULL - 2 dias)' : 'A consultar'),
      'Dias para Envio Atual (DTS)': r['Dias para Envio Atual (DTS)'] || (sku.includes('_FULL') ? '2 dias' : '9 dias'),
      'Status Tabela de Medidas': r['Status Tabela de Medidas'],
      'URL Tabela de Medidas': r['URL Tabela de Medidas'],
      'Status Frete Grátis': r['Status Frete Grátis'],
      'Proporção das Fotos': r['Proporção das Fotos'],
      'Prioridade de Recuperação': hasOutros ? 'ALTA (Migração de Categoria Urgente)' : r['Prioridade de Recuperação'],
      'Falha Principal': hasOutros ? 'Preso na Categoria Genérica "Outros"' : r['Falha Principal'],
      'Gargalo no Funil': hasOutros ? 'Topo do Funil (Algoritmo entrega para público errado)' : r['Gargalo no Funil'],
      'Análise Detalhada de Não-Conversão': hasOutros 
        ? `ALERTA DE CATEGORIA: O produto está classificado na Shopee como "${cat}". Anúncios no ramo de "Outros" sofrem forte desindexação e o algoritmo não entrega para compradores qualificados. Sugerido migrar imediatamente para "${catSugerida}". ${r['Análise Detalhada de Não-Conversão']}`
        : r['Análise Detalhada de Não-Conversão'],
      'Ação Recomendada': hasOutros 
        ? `1. Migrar categoria na Shopee de "${cat}" para "${catSugerida}"; 2. ${r['Ação Recomendada']}`
        : r['Ação Recomendada'],
      'Total Impressões': r['Total Impressões'],
      'Total Cliques': r['Total Cliques'],
      'Taxa de Cliques (CTR)': r['Taxa de Cliques (CTR)'],
      'Total Visitantes': r['Total Visitantes'],
      'Pageviews por Visitante': r['Pageviews por Visitante'],
      'Adições ao Carrinho': r['Adições ao Carrinho'],
      'Taxa Conversão Carrinho': r['Taxa Conversão Carrinho'],
      'Pedidos Não Pagos': r['Pedidos Não Pagos'],
      'Valor Realizado Não Pago (R$)': r['Valor Realizado Não Pago (R$)'],
      'Classificação Shopee': r['Classificação Shopee']
    };

    if (hasOutros) {
      outrosItems.push({
        'ID do Item': r['ID do Item'],
        'SKU Principal': r['SKU Principal'],
        'Produto': r['Produto'],
        'Categoria Atual na Shopee': cat,
        'Categoria Sugerida Recomendada': catSugerida,
        'Motivo da Correção': 'A categoria "Outros" impede o ranqueamento orgânico e esconde o anúncio nos filtros laterais da Shopee',
        'Estoque Disponível': r['Estoque Disponível Shopee (Ao Vivo)'],
        'Total Cliques': r['Total Cliques'],
        'Adições ao Carrinho': r['Adições ao Carrinho']
      });
    }

    return rowObj;
  });

  const newWb = XLSX.utils.book_new();

  // Aba 1: Todos os produtos com as colunas de alerta
  const sheetAll = XLSX.utils.json_to_sheet(enrichedRows);
  sheetAll['!cols'] = [
    { wch: 14 }, // ID
    { wch: 18 }, // SKU
    { wch: 55 }, // Produto
    { wch: 42 }, // Alerta Categoria Outros
    { wch: 60 }, // Categoria Oficial
    { wch: 55 }, // Categoria Sugerida
    { wch: 38 }, // Ficha Técnica
    { wch: 45 }, // Atributos
    { wch: 25 }, // Estoque
    { wch: 20 }, // _FULL
    { wch: 45 }, // Status Prazo
    { wch: 18 }, // DTS
    { wch: 45 }, // Tabela
    { wch: 65 }, // URL Tabela
    { wch: 35 }, // Frete
    { wch: 35 }, // Proporção
    { wch: 35 }, // Prioridade
    { wch: 45 }, // Falha
    { wch: 45 }, // Gargalo
    { wch: 95 }, // Análise
    { wch: 85 }  // Ação
  ];
  XLSX.utils.book_append_sheet(newWb, sheetAll, 'Todos_Produtos_Ativos');

  // Aba 2: ABA DEDICADA EXCLUSIVA PARA OS PRODUTOS EM "OUTROS"
  const sheetOutros = XLSX.utils.json_to_sheet(outrosItems);
  sheetOutros['!cols'] = [
    { wch: 14 },
    { wch: 18 },
    { wch: 55 },
    { wch: 65 },
    { wch: 60 },
    { wch: 75 },
    { wch: 20 },
    { wch: 14 },
    { wch: 18 }
  ];
  XLSX.utils.book_append_sheet(newWb, sheetOutros, '🚨_Produtos_Presos_em_OUTROS');

  XLSX.writeFile(newWb, outputPath);
  console.log(`✅ Salvo no projeto: ${outputPath}`);

  try {
    XLSX.writeFile(newWb, downloadsPath);
    console.log(`✅ Salvo em Downloads: ${downloadsPath}`);
  } catch (e) {
    const altPath = 'C:/Users/marke/Downloads/Relatorio_Diagnostico_Com_Destaque_Outros.xlsx';
    XLSX.writeFile(newWb, altPath);
    console.log(`✅ Salvo com nome alternativo em Downloads: ${altPath}`);
  }

  // Gera também a planilha dedicada apenas com os produtos em Outros
  const wbDedicated = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbDedicated, sheetOutros, 'Produtos_Em_Outros');
  XLSX.writeFile(wbDedicated, downloadsDedicatedPath);
  console.log(`✅ Planilha exclusiva de "Outros" salva em: ${downloadsDedicatedPath}`);

  console.log(`\n================ PRODUTOS EM CATEGORIA "OUTROS" ================`);
  console.log(`🚨 Total de produtos presos na categoria "Outros": ${outrosItems.length}`);
  for (const item of outrosItems) {
    console.log(`- [${item['SKU Principal']}] ${item['Produto'].substring(0, 45)}...`);
    console.log(`  Atual:    "${item['Categoria Atual na Shopee']}"`);
    console.log(`  Sugerida: "${item['Categoria Sugerida Recomendada']}"\n`);
  }
}

highlightOutros().catch(console.error);

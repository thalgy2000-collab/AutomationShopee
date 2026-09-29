import fs from 'node:fs';
import { extractProductsFromExcel } from './agent5-shopee-attributes/src/excel_reader.mjs';
import XLSX from './agent3-rpa-magis5/node_modules/xlsx/xlsx.js';

async function analyze() {
  const filePath = 'uploads/relatorio_produtos_sem_venda.xlsx';
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  console.log(`📊 Total de linhas na planilha: ${rows.length}`);

  let totalImpressoes = 0;
  let totalCliques = 0;
  let totalVisitantes = 0;
  let totalCarrinho = 0;
  let totalPedidosNaoPagos = 0;

  let zeroImpressoes = 0;
  let zeroCliquesComImpressao = 0;
  let comCliquesSemCarrinho = 0;
  let comCarrinhoSemVenda = 0;

  const classificacoes = {};
  const categorias = {};

  for (const r of rows) {
    const imp = Number(r['Total Impressões'] || 0);
    const clk = Number(r['Total Cliques'] || 0);
    const vis = Number(r['Total Visitantes'] || 0);
    const car = Number(r['Adições ao Carrinho'] || 0);
    const ped = Number(r['Pedidos Realizados (Não Pagos)'] || 0);
    const clas = r['Classificação'] || 'Sem Classificação';
    const cat = r['Categoria'] || 'Outros';

    totalImpressoes += imp;
    totalCliques += clk;
    totalVisitantes += vis;
    totalCarrinho += car;
    totalPedidosNaoPagos += ped;

    classificacoes[clas] = (classificacoes[clas] || 0) + 1;
    categorias[cat] = (categorias[cat] || 0) + 1;

    if (imp === 0) {
      zeroImpressoes++;
    } else if (clk === 0) {
      zeroCliquesComImpressao++;
    } else if (car === 0) {
      comCliquesSemCarrinho++;
    } else {
      comCarrinhoSemVenda++;
    }
  }

  const ctrMedio = totalImpressoes > 0 ? ((totalCliques / totalImpressoes) * 100).toFixed(2) : 0;
  const taxaConversaoCarrinho = totalCliques > 0 ? ((totalCarrinho / totalCliques) * 100).toFixed(2) : 0;

  console.log('\n=== METRICAS GERAIS DOS ULTIMOS 9 MESES ===');
  console.log(`Total Impressões Geradas: ${totalImpressoes.toLocaleString('pt-BR')}`);
  console.log(`Total Cliques Recebidos:  ${totalCliques.toLocaleString('pt-BR')} (CTR Médio: ${ctrMedio}%)`);
  console.log(`Total Adições ao Carrinho: ${totalCarrinho.toLocaleString('pt-BR')} (Taxa Cliques -> Carrinho: ${taxaConversaoCarrinho}%)`);
  console.log(`Pedidos Gerados (Não Pagos / Boletos abandonados): ${totalPedidosNaoPagos}`);

  console.log('\n=== FUNIL DE FALHAS / GARGALOS ===');
  console.log(`1. Totalmente Invisíveis (0 Impressões): ${zeroImpressoes} anúncios (${((zeroImpressoes/rows.length)*100).toFixed(1)}%)`);
  console.log(`2. Têm Impressões mas 0 Cliques (CTR 0%): ${zeroCliquesComImpressao} anúncios (${((zeroCliquesComImpressao/rows.length)*100).toFixed(1)}%)`);
  console.log(`3. Receberam Cliques mas NENHUM Carrinho: ${comCliquesSemCarrinho} anúncios (${((comCliquesSemCarrinho/rows.length)*100).toFixed(1)}%)`);
  console.log(`4. Tiveram Adições ao Carrinho mas ZERO Vendas: ${comCarrinhoSemVenda} anúncios (${((comCarrinhoSemVenda/rows.length)*100).toFixed(1)}%)`);

  console.log('\n=== DISTRIBUIÇÃO POR CLASSIFICAÇÃO DA SHOPEE ===');
  for (const [k, v] of Object.entries(classificacoes)) {
    console.log(` - ${k}: ${v} anúncios (${((v/rows.length)*100).toFixed(1)}%)`);
  }

  console.log('\n=== TOP 5 CATEGORIAS COM MAIS ANÚNCIOS ENCALHADOS ===');
  const topCat = Object.entries(categorias).sort((a,b) => b[1] - a[1]).slice(0, 5);
  for (const [k, v] of topCat) {
    console.log(` - ${k}: ${v} anúncios`);
  }
}

analyze().catch(console.error);

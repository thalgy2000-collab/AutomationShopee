import XLSX from "xlsx";
import { resolve, dirname } from "node:path";
import { mkdirSync, existsSync } from "node:fs";

/**
 * Gera uma planilha Excel (.xlsx) formatada pronta para o pipeline dos Agentes 1, 2 e 3.
 *
 * @param {Array<{ sku: string, cod_sankhya: string, descricao: string, classificacao?: string }>} items
 * @param {string} [outputPath]
 * @returns {string} Caminho do arquivo gerado
 */
export function generateSpreadsheet(items, outputPath = null) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Nenhum item fornecido para gerar a planilha.");
  }

  const timestamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const targetPath = outputPath || resolve(`./downloads/Lote_Sankhya_${timestamp}.xlsx`);

  const dir = dirname(targetPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Monta linhas com o cabeçalho padrão reconhecido por todos os robôs
  const headers = ["Cód. Referência (SKU)", "Código (Sankhya)", "Descrição", "Classificação"];
  const rows = [headers];

  for (const item of items) {
    rows.push([
      item.sku || "",
      item.cod_sankhya || "",
      item.descricao || "",
      item.classificacao || "Camisas",
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Ajusta larguras de coluna
  ws["!cols"] = [
    { wch: 22 }, // SKU
    { wch: 18 }, // Código Sankhya
    { wch: 65 }, // Descrição
    { wch: 25 }, // Classificação
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Produtos Sankhya");
  XLSX.writeFile(wb, targetPath);

  return targetPath;
}

/**
 * bulk_editor.mjs — Módulo de Edição em Massa (Bulk Editor) de Anúncios
 *
 * Permite localizar e substituir textos em massa (descrição, título, preços,
 * atributos), injetar blocos informativos e aplicar presets específicos como
 * a tabela oficial de medidas das camisas FUSION.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateFriendlyModel } from './schemas.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRODUTOS_DIR = path.join(__dirname, 'produtos');

// Tabela oficial de medidas das camisas FUSION (com capuz e máscara) extraída da foto oficial
export const FUSION_OFFICIAL_MEASUREMENTS_TEXT = `Tabela de Medidas Oficial BRK Fishing (Masculino com Capuz e Máscara):
- Tamanho PP: Tórax: 53cm | Altura: 67cm | Manga (Gola ao Punho): 82cm
- Tamanho P: Tórax: 54cm | Altura: 69cm | Manga (Gola ao Punho): 83,5cm
- Tamanho M: Tórax: 56cm | Altura: 71cm | Manga (Gola ao Punho): 85cm
- Tamanho G: Tórax: 59cm | Altura: 73cm | Manga (Gola ao Punho): 86,5cm
- Tamanho GG: Tórax: 62cm | Altura: 75cm | Manga (Gola ao Punho): 88cm
- Tamanho G1: Tórax: 65cm | Altura: 77cm | Manga (Gola ao Punho): 88cm
- Tamanho G2: Tórax: 68cm | Altura: 79cm | Manga (Gola ao Punho): 88cm`;

/**
 * Lista todos os arquivos de produtos disponíveis em agent2-enricher/produtos/
 * @returns {string[]} Lista de SKUs (sem extensão .json)
 */
export function listAllProductSkus() {
  if (!fs.existsSync(PRODUTOS_DIR)) return [];
  return fs.readdirSync(PRODUTOS_DIR)
    .filter(f => f.endsWith('.json') && !f.startsWith('.'))
    .map(f => f.replace('.json', ''));
}

/**
 * Filtra SKUs com base nas opções informadas:
 * @param {object} options
 * @param {string} [options.filterType] - 'all', 'fusion', 'prefix', 'skus'
 * @param {string} [options.filterValue] - Prefixo (ex: 'FUSION', 'C028') ou lista separada por vírgula
 * @param {string[]} [options.skus] - Lista direta de SKUs
 * @returns {string[]} SKUs filtrados
 */
export function filterSkus(options = {}) {
  const allSkus = listAllProductSkus();
  const { filterType = 'all', filterValue = '', skus = [] } = options;

  if (Array.isArray(skus) && skus.length > 0) {
    const set = new Set(skus.map(s => s.trim().toUpperCase()));
    return allSkus.filter(s => set.has(s.toUpperCase()));
  }

  if (filterType === 'fusion') {
    return allSkus.filter(s => /^FUSION\d+/i.test(s));
  }

  if (filterType === 'fusion_masc') {
    return allSkus.filter(s => /^FUSION\d+$/i.test(s));
  }

  if (filterType === 'prefix' && filterValue) {
    const prefix = filterValue.trim().toUpperCase();
    return allSkus.filter(s => s.toUpperCase().startsWith(prefix));
  }

  if (filterType === 'regex' && filterValue) {
    try {
      const rx = new RegExp(filterValue, 'i');
      return allSkus.filter(s => rx.test(s));
    } catch {
      return [];
    }
  }

  return allSkus;
}

/**
 * Lê o JSON de um produto pelo SKU.
 */
export function loadProductJson(sku) {
  const file = path.join(PRODUTOS_DIR, `${sku}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Salva o JSON de um produto.
 */
export function saveProductJson(sku, data) {
  const file = path.join(PRODUTOS_DIR, `${sku}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Substitui o bloco de tabela de medidas na descrição por um novo bloco formatado.
 */
export function replaceSizeTableInDescription(desc, newTableText) {
  if (!desc) return newTableText;

  // Expressão para localizar blocos antigos de tabela de medidas
  const tableRegex = /(?:Tabela de Medidas Total|Tabela de Medidas Oficial[^\n]*):?\s*\n(?:[^\n]*Tórax[^\n]*\n*)+/gi;

  if (tableRegex.test(desc)) {
    return desc.replace(tableRegex, `${newTableText}\n\n`);
  }

  // Fallback: se encontrar o cabeçalho 'Tabela de Medidas', remove linhas até o aviso legal ou linha vazia
  const headerIdx = desc.indexOf('Tabela de Medidas');
  if (headerIdx !== -1) {
    const legalNoticeIdx = desc.indexOf('Nossa Estampa é protegida');
    if (legalNoticeIdx > headerIdx) {
      return desc.slice(0, headerIdx) + `${newTableText}\n\n` + desc.slice(legalNoticeIdx);
    }
  }

  // Se não encontrou bloco anterior, insere antes do aviso de direitos autorais ou no final
  const copyrightIdx = desc.indexOf('Nossa Estampa é protegida');
  if (copyrightIdx !== -1) {
    return desc.slice(0, copyrightIdx) + `${newTableText}\n\n` + desc.slice(copyrightIdx);
  }

  return `${desc.trim()}\n\n${newTableText}`;
}

/**
 * Simula uma edição em massa sem salvar (Preview).
 *
 * @param {object} options
 * @param {string} options.targetField - 'descricao', 'titulo_shopee', 'marca', 'modelo'
 * @param {string} options.operation - 'replace_text', 'append', 'prepend', 'fusion_measurements'
 * @param {string} [options.findText]
 * @param {string} [options.replaceText]
 * @param {boolean} [options.caseSensitive=false]
 * @returns {{ totalMatched: number, totalChanged: number, items: Array<{ sku: string, before: string, after: string, changed: boolean }> }}
 */
export function previewBulkEdit(options = {}) {
  const targetSkus = filterSkus(options);
  const {
    targetField = 'descricao',
    operation = 'replace_text',
    findText = '',
    replaceText = '',
    caseSensitive = false
  } = options;

  const items = [];
  let totalChanged = 0;

  for (const sku of targetSkus) {
    const prod = loadProductJson(sku);
    if (!prod) continue;

    let before = '';
    let after = '';
    let changed = false;

    if (operation === 'fusion_measurements') {
      before = prod.descricao || '';
      after = replaceSizeTableInDescription(before, FUSION_OFFICIAL_MEASUREMENTS_TEXT);
      changed = before !== after;
    } else if (operation === 'friendly_model') {
      before = prod.modelo || '';
      after = generateFriendlyModel(prod.sku, prod.titulo_shopee, prod.atributos?.estampa, prod.modelo);
      changed = before !== after;
    } else {
      before = String(prod[targetField] || '');
      after = before;

      if (operation === 'replace_text' && findText) {
        if (caseSensitive) {
          after = before.split(findText).join(replaceText);
        } else {
          const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          after = before.replace(new RegExp(escaped, 'gi'), replaceText);
        }
        changed = before !== after;
      } else if (operation === 'append' && replaceText) {
        after = `${before}\n${replaceText}`.trim();
        changed = before !== after;
      } else if (operation === 'prepend' && replaceText) {
        after = `${replaceText}\n${before}`.trim();
        changed = before !== after;
      } else if (operation === 'set_value') {
        after = replaceText;
        changed = before !== after;
      }
    }

    if (changed) totalChanged++;

    items.push({
      sku,
      field: targetField,
      before,
      after,
      changed
    });
  }

  return {
    totalMatched: targetSkus.length,
    totalChanged,
    items
  };
}

/**
 * Aplica a edição em massa gravando nos arquivos JSON.
 *
 * @param {object} options Mesmas opções de previewBulkEdit
 * @returns {{ success: boolean, updatedCount: number, updatedSkus: string[] }}
 */
export function applyBulkEdit(options = {}) {
  const preview = previewBulkEdit(options);
  const updatedSkus = [];

  for (const item of preview.items) {
    if (!item.changed) continue;

    const prod = loadProductJson(item.sku);
    if (!prod) continue;

    if (options.operation === 'fusion_measurements') {
      prod.descricao = item.after;
    } else if (options.operation === 'friendly_model') {
      prod.modelo = item.after;
      if (!prod.atributos) prod.atributos = {};
      prod.atributos.modelo = item.after;
    } else {
      prod[item.field] = item.after;
    }

    saveProductJson(item.sku, prod);
    updatedSkus.push(item.sku);
  }

  return {
    success: true,
    updatedCount: updatedSkus.length,
    updatedSkus
  };
}

/**
 * Preset: Atualiza a Tabela de Medidas Oficial FUSION em todas as camisas FUSION.
 */
export function applyFusionMeasurementsPreset() {
  return applyBulkEdit({
    filterType: 'fusion',
    operation: 'fusion_measurements'
  });
}

/**
 * Preset: Atualiza o campo Modelo para características amigáveis (sem SKU) em lote.
 */
export function applyFriendlyModelPreset(filterOptions = { filterType: 'all' }) {
  return applyBulkEdit({
    ...filterOptions,
    targetField: 'modelo',
    operation: 'friendly_model'
  });
}

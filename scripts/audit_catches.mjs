import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const filesToAudit = [
  'agent1-scraper/scraper.mjs',
  'agent1-scraper/colorFilter.mjs',
  'agent2-enricher/server.mjs',
  'agent2-enricher/enricher.mjs',
  'agent2-enricher/shopify_prices.mjs',
  'agent2-enricher/lock_manager.mjs',
  'agent3-rpa-magis5/src/runner.mjs',
  'agent3-rpa-magis5/src/publisher.mjs',
  'agent4-diagnostician/pipeline_reporter.mjs',
  'agent4-diagnostician/rules.mjs'
];

const results = [];

for (const rel of filesToAudit) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) continue;
  const content = fs.readFileSync(full, 'utf8');
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Check catch patterns
    if (/\bcatch\s*(\([^\)]*\))?\s*\{/.test(line) || /\.catch\s*\(/.test(line)) {
      const lineNum = i + 1;
      const snippet = line.trim();
      const nextLines = lines.slice(i, Math.min(lines.length, i + 5)).map(l => l.trim()).join(' ');

      let classification = 'Tratado com log / propagação';
      let justification = '';

      if (/\bcatch\s*\{\s*\}/.test(nextLines) || /\.catch\(\s*\(\)\s*=>\s*\{\s*\}\s*\)/.test(nextLines) || /\.catch\(\s*\(\)\s*=>\s*null\s*\)/.test(nextLines)) {
        if (/statSync|existsSync|unlinkSync|mkdirSync|readActiveBatch|telemetry/i.test(snippet) || /file|fs|json|history/i.test(nextLines)) {
          classification = 'Fallback inofensivo';
          justification = 'Operação de I/O de arquivo opcional ou verificação prévia de existência que não deve abortar o fluxo principal.';
        } else {
          classification = 'Falha mascarada (Atenção)';
          justification = 'Catch vazio sem tratamento explícito ou fallback rastreado.';
        }
      } else {
        if (/console\.error|console\.warn|addLog|log|logger/i.test(nextLines)) {
          classification = 'Tratado com log';
          justification = 'Erro devidamente capturado, registrado no console ou telemetria para diagnóstico do operador.';
        } else if (/return\s+null|return\s+false|return\s+\{\}|fallback/i.test(nextLines)) {
          classification = 'Fallback inofensivo';
          justification = 'Retorna valor neutro/default controlado sem interromper o pipeline.';
        } else {
          classification = 'Tratado com log / propagação';
          justification = 'Erro tratado ou relançado.';
        }
      }

      results.push({
        file: rel,
        line: lineNum,
        snippet: snippet.substring(0, 80),
        classification,
        justification
      });
    }
  }
}

console.log(`TOTAL CATCH BLOCKS AUDITADOS: ${results.length}\n`);

// Group by classification
const counts = {};
for (const r of results) {
  counts[r.classification] = (counts[r.classification] || 0) + 1;
}
console.log('Resumo por classificação:', JSON.stringify(counts, null, 2));

fs.writeFileSync(path.join(ROOT, 'audit_catches_result.json'), JSON.stringify(results, null, 2), 'utf8');
console.log('Audit results saved to audit_catches_result.json');

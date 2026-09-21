import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRODUTOS_DIR = path.join(__dirname, 'produtos');

function sanitizeDescription(desc, product = {}) {
  if (!desc) return "";
  let text = String(desc);
  const sku = product?.sku ? String(product.sku).trim() : "";

  // 1. Remove linhas que declaram explicitamente o SKU / Código / Referência
  text = text.replace(/^[ \t]*(?:-|\*)*[ \t]*(?:SKU|C[oó]digo(?: do Produto)?|Refer[eê]ncia|Ref)[ \t]*:[ \t]*[^\r\n]+[\r\n]*/gmi, "");

  // 2. Se a linha do Modelo tiver apenas o SKU bruto (ex: "- Modelo: C02829"), substitui pelo nome do modelo comercial
  if (sku) {
    const friendly = (product.modelo && product.modelo !== sku) ? product.modelo : "BRK Especial";
    const escapedSku = sku.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(`^([ \\t]*-[ \\t]*Modelo[ \\t]*:[ \\t]*)${escapedSku}[ \\t]*$`, "gmi"), `$1${friendly}`);
    
    // 3. Remove o SKU se estiver em parênteses ou colchetes: ex: "São Bento Medalhão (C02830)" -> "São Bento Medalhão"
    text = text.replace(new RegExp(`[ \\t]*[\\(\\[]${escapedSku}[\\)\\]]`, "gi"), "");
  }

  // 4. Remove qualquer código alfanumérico que esteja em parênteses na linha de Modelo (ex: "- Modelo: Algo (C02830)")
  text = text.replace(/([ \t]*-[ \t]*Modelo[ \t]*:[ \t]*[^\r\n\(]+)[ \t]*\([A-Za-z0-9_-]+\)/gi, "$1");

  // 5. Remove qualquer menção residual do SKU exato isolado
  if (sku) {
    const escapedSku = sku.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(`\\b${escapedSku}\\b`, "gi"), "");
    // Limpa parênteses vazios resultantes "()"
    text = text.replace(/[ \t]*\(\s*\)/g, "");
  }

  return text;
}

let updated = 0;
const files = fs.readdirSync(PRODUTOS_DIR).filter(f => f.endsWith('.json'));

for (const f of files) {
  const p = path.join(PRODUTOS_DIR, f);
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (data.descricao) {
      const clean = sanitizeDescription(data.descricao, data);
      if (clean !== data.descricao) {
        data.descricao = clean;
        fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
        updated++;
      }
    }
  } catch (e) {
    console.error(`Erro ao processar ${f}:`, e.message);
  }
}

console.log(`✅ Concluído: ${updated} de ${files.length} arquivos JSON atualizados sem SKU na descrição.`);

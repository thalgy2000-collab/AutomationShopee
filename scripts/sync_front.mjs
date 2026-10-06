import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const SOURCE_FILE = path.join(ROOT_DIR, 'agent2-enricher', 'painel.html');

if (!fs.existsSync(SOURCE_FILE)) {
  console.error(`❌ Arquivo fonte não encontrado: ${SOURCE_FILE}`);
  process.exit(1);
}

const content = fs.readFileSync(SOURCE_FILE, 'utf8');

const targets = [
  path.join(ROOT_DIR, 'painel.html'),
  path.join(ROOT_DIR, 'agent0.html'),
  path.join(ROOT_DIR, 'agent1.html'),
  path.join(ROOT_DIR, 'agent2.html'),
  path.join(ROOT_DIR, 'agent3.html'),
  path.join(ROOT_DIR, 'agent4.html')
];

for (const target of targets) {
  fs.writeFileSync(target, content, 'utf8');
  console.log(`✅ Sincronizado: ${path.relative(ROOT_DIR, target)}`);
}

console.log('✨ Sincronização do front concluída com sucesso!');

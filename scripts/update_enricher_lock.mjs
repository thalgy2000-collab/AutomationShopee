import fs from 'fs';

const path = 'agent2-enricher/enricher.mjs';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  'import { sanitizeSankhyaCode } from "../agent1-scraper/colorFilter.mjs";',
  'import { sanitizeSankhyaCode } from "../agent1-scraper/colorFilter.mjs";\nimport { setupLockAutoRelease } from "./lock_manager.mjs";'
);

content = content.replace(
  'async function main() {\n  const { inputFile',
  'async function main() {\n  setupLockAutoRelease("agent2");\n  const { inputFile'
);
if (!content.includes('setupLockAutoRelease("agent2");')) {
  content = content.replace(
    'async function main() {\r\n  const { inputFile',
    'async function main() {\r\n  setupLockAutoRelease("agent2");\r\n  const { inputFile'
  );
}

fs.writeFileSync(path, content, 'utf8');
console.log('enricher.mjs updated with lock setup');

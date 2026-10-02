import fs from 'fs';

const path = 'agent1-scraper/scraper.mjs';
let content = fs.readFileSync(path, 'utf8');

// Ensure stringify is imported
content = content.replace(
  'import { parse } from "csv-parse/sync";',
  'import { parse } from "csv-parse/sync";\nimport { stringify } from "csv-stringify/sync";'
);

// Call setupLockAutoRelease at beginning of main()
content = content.replace(
  'async function main() {\n  const { inputFile',
  'async function main() {\n  setupLockAutoRelease("agent1");\n  const { inputFile'
);
if (!content.includes('setupLockAutoRelease("agent1");')) {
  content = content.replace(
    'async function main() {\r\n  const { inputFile',
    'async function main() {\r\n  setupLockAutoRelease("agent1");\r\n  const { inputFile'
  );
}

fs.writeFileSync(path, content, 'utf8');
console.log('scraper.mjs updated with lock and stringify');

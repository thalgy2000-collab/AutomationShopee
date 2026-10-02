import fs from 'fs';

const path = 'agent3-rpa-magis5/src/runner.mjs';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  'import { extractParentSku } from "../../agent2-enricher/grouping.mjs";',
  'import { extractParentSku } from "../../agent2-enricher/grouping.mjs";\nimport { setupLockAutoRelease } from "../../agent2-enricher/lock_manager.mjs";'
);

content = content.replace(
  'async function main() {\n  const { targetSku',
  'async function main() {\n  setupLockAutoRelease("agent3");\n  const { targetSku'
);
if (!content.includes('setupLockAutoRelease("agent3");')) {
  content = content.replace(
    'async function main() {\r\n  const { targetSku',
    'async function main() {\r\n  setupLockAutoRelease("agent3");\r\n  const { targetSku'
  );
}

fs.writeFileSync(path, content, 'utf8');
console.log('runner.mjs updated with lock setup');

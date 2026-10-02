import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverPath = path.resolve(__dirname, '../agent2-enricher/server.mjs');

let content = fs.readFileSync(serverPath, 'utf8');

const targets = [
  "if (req.method === 'POST' && urlPath === '/api/agents/create-kit') {",
  "if (req.method === 'POST' && urlPath === '/api/agents/create-multi-model') {",
  "if (req.method === 'POST' && urlPath === '/api/bulk/preview') {",
  "if (req.method === 'POST' && urlPath === '/api/bulk/apply') {",
  "if (req.method === 'POST' && urlPath === '/api/bulk/preset/fusion-measurements') {",
  "if (req.method === 'POST' && urlPath === '/api/agents/stop') {",
  "if (req.method === 'POST' && urlPath === '/api/quotas/reset') {",
  "if (req.method === 'POST' && urlPath === '/api/agents/change-model') {",
  "if (req.method === 'POST' && urlPath === '/api/diagnostics/fix') {",
  "if (req.method === 'POST' && urlPath === '/api/diagnostics/fix-all') {"
];

for (const target of targets) {
  if (content.includes(target)) {
    const replacement = target + "\r\n    if (!authenticateRequest(req, res)) return;";
    if (!content.includes(replacement) && !content.includes(target + "\n    if (!authenticateRequest(req, res)) return;")) {
      // Handle both CRLF and LF
      if (content.includes(target + "\r\n")) {
        content = content.replace(target + "\r\n", target + "\r\n    if (!authenticateRequest(req, res)) return;\r\n");
      } else {
        content = content.replace(target + "\n", target + "\n    if (!authenticateRequest(req, res)) return;\n");
      }
      console.log('Protected:', target);
    } else {
      console.log('Already protected:', target);
    }
  } else {
    console.error('Target not found:', target);
  }
}

fs.writeFileSync(serverPath, content, 'utf8');
console.log('Finished updating server.mjs routes!');

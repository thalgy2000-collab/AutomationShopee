import fs from 'fs';

const path = 'agent3-rpa-magis5/src/runner.mjs';
let content = fs.readFileSync(path, 'utf8');

const oldUrl = 'await fetch("http://localhost:3000/api/status", {';
const newUrlLogic = `const statusUrl = process.env.STATUS_API_URL || \`http://localhost:\${process.env.PORT || 3000}/api/status\`;
            const headers = { "Content-Type": "application/json" };
            if (process.env.PANEL_TOKEN) headers["x-panel-token"] = process.env.PANEL_TOKEN;
            await fetch(statusUrl, {`;

// Replace both occurrences
content = content.replace(
  `try {
            await fetch("http://localhost:3000/api/status", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sku: item.sku, status: "publicado" }),
            });
          }`,
  `try {
            const statusUrl = process.env.STATUS_API_URL || \`http://localhost:\${process.env.PORT || 3000}/api/status\`;
            const headers = { "Content-Type": "application/json" };
            if (process.env.PANEL_TOKEN) headers["x-panel-token"] = process.env.PANEL_TOKEN;
            await fetch(statusUrl, {
              method: "POST",
              headers,
              body: JSON.stringify({ sku: item.sku, status: "publicado" }),
            });
          }`
);

content = content.replace(
  `try {
          await fetch("http://localhost:3000/api/status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sku: item.sku, status: errMsg }),
          });
        }`,
  `try {
          const statusUrl = process.env.STATUS_API_URL || \`http://localhost:\${process.env.PORT || 3000}/api/status\`;
          const headers = { "Content-Type": "application/json" };
          if (process.env.PANEL_TOKEN) headers["x-panel-token"] = process.env.PANEL_TOKEN;
          await fetch(statusUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({ sku: item.sku, status: errMsg }),
          });
        }`
);

fs.writeFileSync(path, content, 'utf8');
console.log('runner.mjs updated with configurable status API');

import fs from 'fs';

const path = 'agent3-rpa-magis5/src/runner.mjs';
let content = fs.readFileSync(path, 'utf8');

const targetStr = `      try {
        const res = await publishProductToMagis5(page, item.product, { dryRun });
        if (!res.success) {
          throw new Error(res.error || "Magis5 recusou salvar o anúncio");
        }
        results.sucesso.push(res);

        // Se foi publicação real, atualiza na planilha com a cor #83E28E e status 'publicado'
        if (!dryRun) {`;

const replStr = `      try {
        const isRevisaoCategoria = Boolean(item.product.revisao_categoria);
        const effectiveDryRun = dryRun || isRevisaoCategoria;

        if (isRevisaoCategoria) {
          console.warn(\`⚠️ [DECISÃO D3] SKU \${item.sku} possui 'revisao_categoria: true' (\${item.product.motivo_revisao_categoria || 'categoria incerta'}). Mantido como RASCUNHO seguro, sem publicação definitiva.\`);
        }

        const res = await publishProductToMagis5(page, item.product, { dryRun: effectiveDryRun });
        if (!res.success) {
          throw new Error(res.error || "Magis5 recusou salvar o anúncio");
        }
        results.sucesso.push(res);

        // Se foi publicação real, atualiza na planilha com a cor #83E28E e status 'publicado'
        if (!effectiveDryRun) {`;

if (content.includes(targetStr)) {
  content = content.replace(targetStr, replStr);
  fs.writeFileSync(path, content, 'utf8');
  console.log('runner.mjs updated with D3 draft protection (LF)');
} else {
  const targetCRLF = targetStr.replace(/\n/g, '\r\n');
  const replCRLF = replStr.replace(/\n/g, '\r\n');
  if (content.includes(targetCRLF)) {
    content = content.replace(targetCRLF, replCRLF);
    fs.writeFileSync(path, content, 'utf8');
    console.log('runner.mjs updated with D3 draft protection (CRLF)');
  } else {
    console.log('Target string not found in runner.mjs');
  }
}

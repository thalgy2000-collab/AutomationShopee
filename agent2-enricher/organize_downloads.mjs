/**
 * organize_downloads.mjs — Reorganiza pastas de downloads em Pai / Variação
 *
 * Estrutura:
 * downloads/
 *   ├── BONNIE95/
 *   │   ├── SAKURAP/ (fotos da variação)
 *   │   ├── MATT/    (fotos da variação)
 *   │   └── ...
 *   └── APC0199/     (produto simples)
 */

import { readdir, mkdir, rename, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { extractParentSku, extractVariationSuffix } from "./grouping.mjs";

const DOWNLOADS_DIR = resolve("../agent1-scraper/downloads");
const PRODUTOS_DIR = resolve("./produtos");

async function organize() {
  console.log(`Organizando pastas em: ${DOWNLOADS_DIR}`);

  const entries = await readdir(DOWNLOADS_DIR, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  let moved = 0;
  let simple = 0;

  for (const dirName of dirs) {
    const suffix = extractVariationSuffix(dirName);
    const parent = extractParentSku(dirName);

    // Se tem sufixo de variação e não é o próprio pai
    if (suffix && dirName !== parent) {
      const srcDir = join(DOWNLOADS_DIR, dirName);
      const parentDir = join(DOWNLOADS_DIR, parent);
      const destDir = join(parentDir, suffix);

      await mkdir(parentDir, { recursive: true });

      if (!existsSync(destDir)) {
        await rename(srcDir, destDir);
        moved++;
      } else {
        // Se a pasta destino já existe, move os arquivos individuais
        const files = await readdir(srcDir);
        for (const file of files) {
          const srcFile = join(srcDir, file);
          const destFile = join(destDir, file);
          if (!existsSync(destFile)) {
            await rename(srcFile, destFile);
          }
        }
        moved++;
      }
    } else {
      simple++;
    }
  }

  console.log(`✅ Concluído: ${moved} variações reorganizadas em subpastas de seus pais.`);
  console.log(`ℹ️ ${simple} produtos simples mantidos em suas pastas diretas.`);
}

organize().catch((err) => {
  console.error("Erro na reorganização:", err);
  process.exit(1);
});

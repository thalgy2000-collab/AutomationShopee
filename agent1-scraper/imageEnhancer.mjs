import sharp from "sharp";
import { readFile, writeFile, stat, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, resolve } from "node:path";

/**
 * Pipeline de Melhoria de Qualidade de Imagem (Opção A - Sharp.js)
 *
 * Aplica:
 * 1. Nitidez adaptativa (.sharpen)
 * 2. Realce de brilho e saturação de cor (.modulate)
 * 3. Equalização de histograma (.normalize)
 * 4. Recompressão MozJPEG em alta qualidade (92%)
 *
 * @param {string} inputPath Caminho absoluto ou relativo da imagem
 * @param {string|null} outputPath Caminho para salvar (se null, sobrescreve o input com segurança)
 * @param {object} options Opções adicionais de ajuste
 * @returns {Promise<{success: boolean, inputPath: string, outputPath: string, sizeBefore: number, sizeAfter: number, width: number, height: number}>}
 */
export async function enhanceImage(inputPath, outputPath = null, options = {}) {
  const targetOut = outputPath || inputPath;
  const absInput = resolve(inputPath);
  const absOut = resolve(targetOut);

  if (!existsSync(absInput)) {
    throw new Error(`Arquivo de imagem não encontrado: ${absInput}`);
  }

  const statBefore = await stat(absInput);
  const sizeBefore = statBefore.size;

  // Carrega o arquivo para memória para liberar o file descriptor no Windows
  const inputBuffer = await readFile(absInput);

  // Carrega e obtém metadados
  const image = sharp(inputBuffer);
  const metadata = await image.metadata();

  const sharpenOptions = options.sharpen || {
    sigma: 1.5,
    m1: 1.0,
    m2: 0.5,
  };

  const modulateOptions = options.modulate || {
    brightness: 1.02,
    saturation: 1.08,
  };

  const jpegQuality = options.quality || 92;

  // Processa o pipeline
  let pipeline = sharp(inputBuffer)
    .sharpen(sharpenOptions)
    .modulate(modulateOptions);

  if (options.normalize !== false) {
    pipeline = pipeline.normalize();
  }

  // Converte sempre para JPEG em alta definição com mozjpeg
  const enhancedBuffer = await pipeline
    .jpeg({
      quality: jpegQuality,
      mozjpeg: true,
      chromaSubsampling: "4:4:4", // Retém máximo de detalhe cromático nas cores
    })
    .toBuffer();

  // Salva no destino
  await writeFile(absOut, enhancedBuffer);

  const statAfter = await stat(absOut);
  const sizeAfter = statAfter.size;

  return {
    success: true,
    inputPath: absInput,
    outputPath: absOut,
    sizeBefore,
    sizeAfter,
    width: metadata.width,
    height: metadata.height,
  };
}

/**
 * Processa recursivamente um diretório de imagens aplicando o enhancement
 *
 * @param {string} baseDir Diretório a ser varrido
 * @param {object} options Opções ({ onProgress, limit, skuFilter })
 * @returns {Promise<{totalProcessed: number, totalSavedBytes: number, errors: Array<{file: string, error: string}>}>}
 */
export async function enhanceDirectory(baseDir, options = {}) {
  const absBaseDir = resolve(baseDir);
  if (!existsSync(absBaseDir)) {
    throw new Error(`Diretório não encontrado: ${absBaseDir}`);
  }

  const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
  const allImagePaths = [];

  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (imageExtensions.has(ext)) {
          allImagePaths.push(fullPath);
        }
      }
    }
  }

  await walk(absBaseDir);

  let targets = allImagePaths;
  if (options.skuFilter) {
    const filter = String(options.skuFilter).toLowerCase();
    targets = targets.filter((p) => p.toLowerCase().includes(filter));
  }
  if (options.limit && options.limit > 0) {
    targets = targets.slice(0, options.limit);
  }

  const results = {
    totalProcessed: 0,
    totalErrors: 0,
    errors: [],
  };

  for (let i = 0; i < targets.length; i++) {
    const imgPath = targets[i];
    try {
      const res = await enhanceImage(imgPath, null, options);
      results.totalProcessed++;
      if (typeof options.onProgress === "function") {
        options.onProgress({
          current: i + 1,
          total: targets.length,
          file: imgPath,
          result: res,
        });
      }
    } catch (err) {
      results.totalErrors++;
      results.errors.push({ file: imgPath, error: err.message });
      if (typeof options.onProgress === "function") {
        options.onProgress({
          current: i + 1,
          total: targets.length,
          file: imgPath,
          error: err.message,
        });
      }
    }
  }

  return results;
}

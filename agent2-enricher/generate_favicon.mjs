import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// SVG do Favicon com a logo criada do projeto (Stack Layers 3D em degradê Shopee Flame com fundo escuro e glow)
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#182032" />
      <stop offset="100%" stop-color="#0B0E17" />
    </linearGradient>
    <linearGradient id="flameGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FF6B35" />
      <stop offset="50%" stop-color="#EE4D2D" />
      <stop offset="100%" stop-color="#D03212" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#EE4D2D" flood-opacity="0.45" />
    </filter>
  </defs>

  <!-- Fundo com cantos arredondados e borda sutil -->
  <rect x="2" y="2" width="60" height="60" rx="14" fill="url(#bgGrad)" stroke="rgba(255,255,255,0.12)" stroke-width="1.5" />

  <!-- Logo de Camadas (Layers Stack 3D da Central de Automação) com gradiente Shopee Flame -->
  <g transform="translate(4, 4) scale(0.875)" filter="url(#glow)">
    <!-- Top Polygon -->
    <polygon points="32 10 10 21 32 32 54 21" 
             fill="url(#flameGrad)" 
             stroke="#FFA07A" 
             stroke-width="1.8" 
             stroke-linejoin="round" />
    
    <!-- Middle Polyline -->
    <path d="M10 32 L32 43 L54 32" 
          fill="none" 
          stroke="url(#flameGrad)" 
          stroke-width="4.2" 
          stroke-linecap="round" 
          stroke-linejoin="round" />
    
    <!-- Bottom Polyline -->
    <path d="M10 43 L32 54 L54 43" 
          fill="none" 
          stroke="url(#flameGrad)" 
          stroke-width="4.2" 
          stroke-linecap="round" 
          stroke-linejoin="round" />
  </g>
</svg>`;

const svgPath = path.join(__dirname, 'favicon.svg');
const pngPath = path.join(__dirname, 'favicon.png');
const icoPath = path.join(__dirname, 'favicon.ico');

fs.writeFileSync(svgPath, svgContent, 'utf-8');
console.log('✅ favicon.svg gerado em:', svgPath);

// Gera PNG de 64x64
await sharp(Buffer.from(svgContent))
  .resize(64, 64)
  .png()
  .toFile(pngPath);
console.log('✅ favicon.png (64x64) gerado em:', pngPath);

// Gera favicon.ico (usando o PNG)
await sharp(Buffer.from(svgContent))
  .resize(32, 32)
  .png()
  .toFile(icoPath);
console.log('✅ favicon.ico gerado em:', icoPath);

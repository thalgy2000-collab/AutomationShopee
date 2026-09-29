import path from 'node:path';
import fs from 'node:fs';

// Tenta carregar .env da raiz do projeto ou local
function loadEnv() {
  const envPaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../.env'),
    path.resolve('./.env')
  ];

  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf-8');
        for (const line of content.split(/[\r\n]+/)) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const [k, ...v] = trimmed.split('=');
            if (k && v.length > 0 && !process.env[k.trim()]) {
              process.env[k.trim()] = v.join('=').trim();
            }
          }
        }
        break;
      } catch {}
    }
  }
}

loadEnv();

export const SHOPEE_BASE_URL = process.env.SHOPEE_BASE_URL || 'https://seller.shopee.com.br';
export const SHOPEE_LOGIN_URL = process.env.SHOPEE_LOGIN_URL || `${SHOPEE_BASE_URL}/account/signin`;
export const SHOPEE_PRODUCT_LIST_URL = `${SHOPEE_BASE_URL}/portal/product/list`;
export const SHOPEE_PRODUCT_EDIT_URL = `${SHOPEE_BASE_URL}/portal/product/`;

export const USER_DATA_DIR = path.resolve(process.env.SHOPEE_USER_DATA_DIR || './browser_profile_shopee');
export const PRODUTOS_DIR = path.resolve(process.env.PRODUTOS_DIR || './agent2-enricher/produtos');
export const SCREENSHOTS_DIR = path.resolve(process.env.SCREENSHOTS_DIR || './screenshots/shopee_attributes');

export const ACTION_TIMEOUT_MS = parseInt(process.env.ACTION_TIMEOUT_MS || '20000', 10);
export const NAVIGATION_TIMEOUT_MS = parseInt(process.env.NAVIGATION_TIMEOUT_MS || '45000', 10);
export const DEFAULT_HEADLESS = process.env.HEADLESS === 'true';

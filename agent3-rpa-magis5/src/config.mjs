import dotenv from "dotenv";
import { resolve, join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";

import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const AGENT_DIR = resolve(__dirname, "..");
dotenv.config({ path: join(AGENT_DIR, ".env") });

export const ROOT_DIR = resolve(AGENT_DIR, "..");
export const PRODUTOS_DIR = resolve(ROOT_DIR, "agent2-enricher/produtos");
export const DOWNLOADS_DIR = resolve(ROOT_DIR, "agent1-scraper/downloads");
export const CSV_PATH = resolve(ROOT_DIR, "agent1-scraper/lote_d1fae5.csv");
export const SESSION_FILE = resolve(AGENT_DIR, "session.json");
export const SCREENSHOTS_DIR = resolve(AGENT_DIR, "screenshots");

// Garante que o diretório de screenshots exista
if (!existsSync(SCREENSHOTS_DIR)) {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

// Configurações do Magis5
export const MAGIS5_LOGIN_URL = process.env.MAGIS5_LOGIN_URL || "https://app.magis5.com.br/v2/admin/autenticacao/login.php";
export const MAGIS5_BASE_URL = process.env.MAGIS5_BASE_URL || "https://app.magis5.com.br";
export const MAGIS5_EMAIL = process.env.MAGIS5_EMAIL || "";
export const MAGIS5_PASSWORD = process.env.MAGIS5_PASSWORD || "";
export const MAGIS5_INTEGRATION_NAME = process.env.MAGIS5_INTEGRATION_NAME || "Shopee";

// Configurações do Playwright
export const HEADLESS = process.env.HEADLESS !== "false";
export const ACTION_TIMEOUT_MS = parseInt(process.env.ACTION_TIMEOUT_MS || "15000", 10);
export const NAVIGATION_TIMEOUT_MS = parseInt(process.env.NAVIGATION_TIMEOUT_MS || "30000", 10);

// Regras de negócio fixas (Shopee / Magis5)
export const FIXED_DIMENSIONS = {
  altura_cm: 3,
  largura_cm: 20,
  comprimento_cm: 30,
  peso_kg: 0.25,
};

export const SHOPEE_MAX_TITLE_LENGTH = 120;

// Gestão de Status por Cores na Planilha Excel
export const COLOR_TO_PUBLISH = "#D1FAE5"; // Verde claro: Anúncios à publicar (ativo c/ estoque)
export const COLOR_PUBLISHED = "#83E28E";  // Verde escuro: Anúncios já publicados na Magis5

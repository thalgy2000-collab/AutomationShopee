/**
 * supabase_db.mjs — Módulo de integração e sincronização com o banco Supabase
 */

import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

let pool = null;

export function getDbPool() {
  if (!pool) {
    const connectionString = process.env.SUPABASE_DATABASE_URL;
    if (!connectionString) {
      throw new Error("SUPABASE_DATABASE_URL não configurada no .env");
    }
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
    });
  }
  return pool;
}

/**
 * Testa a conexão com o banco de dados Supabase
 */
export async function testConnection() {
  const p = getDbPool();
  const client = await p.connect();
  try {
    const res = await client.query("SELECT current_database(), current_user, version()");
    return {
      success: true,
      database: res.rows[0].current_database,
      user: res.rows[0].current_user,
    };
  } finally {
    client.release();
  }
}

/**
 * Cria a tabela de produtos e variações no Supabase caso ainda não existam
 */
export async function initTables() {
  const p = getDbPool();
  const client = await p.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS produtos_shopee (
        id SERIAL PRIMARY KEY,
        sku VARCHAR(100) UNIQUE NOT NULL,
        parent_sku VARCHAR(100) NOT NULL,
        titulo_shopee VARCHAR(255) NOT NULL,
        marca VARCHAR(100),
        modelo VARCHAR(100),
        categoria_sugerida TEXT,
        preco_sem_promocao NUMERIC(10, 2),
        preco_com_promocao NUMERIC(10, 2),
        preco_atual NUMERIC(10, 2),
        em_promocao BOOLEAN DEFAULT FALSE,
        desconto_percentual INTEGER DEFAULT 0,
        descricao TEXT,
        atributos JSONB DEFAULT '{}'::jsonb,
        variacoes JSONB DEFAULT '[]'::jsonb,
        titulos_alternativos JSONB DEFAULT '[]'::jsonb,
        medidas JSONB DEFAULT '{}'::jsonb,
        palavras_chave JSONB DEFAULT '[]'::jsonb,
        imagens JSONB DEFAULT '[]'::jsonb,
        seo_score INTEGER DEFAULT 0,
        status_aprovacao VARCHAR(50) DEFAULT 'pendente',
        criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_produtos_shopee_sku ON produtos_shopee(sku);
      CREATE INDEX IF NOT EXISTS idx_produtos_shopee_parent_sku ON produtos_shopee(parent_sku);
      CREATE INDEX IF NOT EXISTS idx_produtos_shopee_em_promocao ON produtos_shopee(em_promocao);
    `);
    return true;
  } finally {
    client.release();
  }
}

/**
 * Salva ou atualiza um produto enriquecido no Supabase (Upsert)
 */
export async function upsertProduct(product) {
  const p = getDbPool();
  const client = await p.connect();
  try {
    const sku = product.sku || product.parent_sku;
    const parentSku = product.parent_sku || product.sku;
    const preco = product.preco || {};

    const query = `
      INSERT INTO produtos_shopee (
        sku, parent_sku, titulo_shopee, marca, modelo, categoria_sugerida,
        preco_sem_promocao, preco_com_promocao, preco_atual, em_promocao, desconto_percentual,
        descricao, atributos, variacoes, titulos_alternativos, medidas, palavras_chave, imagens,
        seo_score, atualizado_em
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW()
      )
      ON CONFLICT (sku) DO UPDATE SET
        titulo_shopee = EXCLUDED.titulo_shopee,
        marca = EXCLUDED.marca,
        modelo = EXCLUDED.modelo,
        categoria_sugerida = EXCLUDED.categoria_sugerida,
        preco_sem_promocao = EXCLUDED.preco_sem_promocao,
        preco_com_promocao = EXCLUDED.preco_com_promocao,
        preco_atual = EXCLUDED.preco_atual,
        em_promocao = EXCLUDED.em_promocao,
        desconto_percentual = EXCLUDED.desconto_percentual,
        descricao = EXCLUDED.descricao,
        atributos = EXCLUDED.atributos,
        variacoes = EXCLUDED.variacoes,
        titulos_alternativos = EXCLUDED.titulos_alternativos,
        medidas = EXCLUDED.medidas,
        palavras_chave = EXCLUDED.palavras_chave,
        imagens = EXCLUDED.imagens,
        seo_score = EXCLUDED.seo_score,
        atualizado_em = NOW()
      RETURNING id, sku;
    `;

    const values = [
      sku,
      parentSku,
      product.titulo_shopee || "",
      product.marca || "",
      product.modelo || "",
      product.categoria_sugerida || "",
      preco.preco_sem_promocao ?? null,
      preco.preco_com_promocao ?? null,
      preco.preco_atual ?? null,
      Boolean(preco.em_promocao),
      preco.desconto_percentual || 0,
      product.descricao || "",
      JSON.stringify(product.atributos || {}),
      JSON.stringify(product.variacoes || []),
      JSON.stringify(product.titulos_alternativos || []),
      JSON.stringify(product.medidas || {}),
      JSON.stringify(product.palavras_chave || []),
      JSON.stringify(product.imagens || []),
      product.seo_score || 0,
    ];

    const res = await client.query(query, values);
    return res.rows[0];
  } finally {
    client.release();
  }
}

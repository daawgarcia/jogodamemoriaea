const express = require('express');
const { Pool } = require('pg');
const { timingSafeEqual } = require('node:crypto');
const { z } = require('zod');
const { syncRecordSchema } = require('../shared/validation.cjs');
const { addLeadsPanel } = require('./leads.cjs');

const batchSchema = z.object({ deviceId: z.uuid(), records: z.array(syncRecordSchema).min(1).max(100) });

function databaseOptions(connectionString) {
  const url = new URL(connectionString);
  const externalRender = url.hostname.endsWith('-postgres.render.com');
  return {
    connectionString, max: 5, connectionTimeoutMillis: 10000,
    ...(externalRender ? { ssl: { rejectUnauthorized: true } } : {})
  };
}

async function createApp(pool, key, options = {}) {
  if (!key || key.length < 32 || key.length > 256) throw new Error('Configure CLOUD_SYNC_KEY com 32 a 256 caracteres.');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ea_leads (
      device_id UUID NOT NULL, id UUID NOT NULL, version INTEGER NOT NULL,
      payload JSONB NOT NULL, synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (device_id, id)
    )
  `);
  const api = express();
  api.disable('x-powered-by');
  api.set('trust proxy', 'loopback');
  api.use(express.json({ limit: '1mb' }));
  api.use((_req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    next();
  });
  api.get('/', (_req, res) => res.json({ app: 'Jogo da Memória EA', service: 'API de sincronização do aplicativo Windows', health: '/health' }));
  api.get('/health', async (_req, res) => {
    try { await pool.query('SELECT 1'); res.json({ status: 'ok' }); }
    catch (error) { console.error('Banco indisponível:', error.message); res.status(503).json({ error: 'Banco indisponível.' }); }
  });
  api.post('/api/sync', async (req, res, next) => {
    const received = Buffer.from(req.headers.authorization || '');
    const expected = Buffer.from(`Bearer ${key}`);
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return res.status(401).json({ error: 'Não autorizado.' });
    const parsed = batchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Lote de sincronização inválido.' });
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      for (const record of parsed.data.records) {
        await client.query(`
          INSERT INTO ea_leads (device_id, id, version, payload) VALUES ($1, $2, $3, $4)
          ON CONFLICT (device_id, id) DO UPDATE SET
            version = EXCLUDED.version, payload = EXCLUDED.payload, synced_at = NOW()
          WHERE ea_leads.version < EXCLUDED.version
        `, [parsed.data.deviceId, record.id, record.version, JSON.stringify(record)]);
      }
      await client.query('COMMIT');
      res.json({ accepted: parsed.data.records.length });
    } catch (error) {
      if (client) {
        try { await client.query('ROLLBACK'); }
        catch (rollbackError) { console.error('Falha no rollback:', rollbackError.message); }
      }
      next(error);
    } finally { client?.release(); }
  });
  addLeadsPanel(api, pool, { user: options.leadsUser, password: options.leadsPassword });
  api.use((error, _req, res, _next) => {
    console.error('Erro na API:', error.message);
    res.status(error.type === 'entity.parse.failed' ? 400 : 500).json({ error: 'Não foi possível processar a requisição.' });
  });
  return api;
}

if (require.main === module) {
  if (!process.env.DATABASE_URL) { console.error('Configure DATABASE_URL.'); process.exitCode = 1; }
  else {
    let pool;
    try { pool = new Pool(databaseOptions(process.env.DATABASE_URL)); }
    catch (error) { console.error('Configuração de banco inválida:', error.message); process.exitCode = 1; }
    if (pool) createApp(pool, process.env.CLOUD_SYNC_KEY, { leadsUser: process.env.LEADS_USER, leadsPassword: process.env.LEADS_PASSWORD }).then(api => {
      const server = api.listen(process.env.PORT || 3000, '0.0.0.0', () => console.log('API EA iniciada.'));
      const shutdown = () => server.close(() => pool.end().then(() => process.exit(0)));
      process.on('SIGTERM', shutdown);
      process.on('SIGINT', shutdown);
    }).catch(error => { console.error('Falha ao iniciar:', error.message); pool.end(); process.exitCode = 1; });
  }
}

module.exports = { createApp, databaseOptions };

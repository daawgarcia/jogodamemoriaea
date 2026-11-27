const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createApp, databaseOptions } = require('../server/index.cjs');

const key = 'x'.repeat(40);
const record = () => ({
  id: randomUUID(), version: 1,
  lead: { name: 'Pessoa Teste', email: 'teste@example.com', whatsapp: '5511999999999', city: 'São Paulo / SP', student: true, cro: '', acknowledged: true, marketing: false },
  createdAt: new Date().toISOString(), status: 'won', prize: 'Kit EA', moves: 6, delivered: false, noticeVersion: '2026-11-v1'
});

async function fixture(t, options = {}) {
  const queries = [];
  const client = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (options.failInsert && sql.includes('INSERT INTO')) throw new Error('Banco offline');
      return { rows: [] };
    },
    release() { queries.push({ sql: 'RELEASE' }); }
  };
  const pool = {
    async query(sql) { queries.push({ sql }); if (options.failHealth && sql === 'SELECT 1') throw new Error('Banco offline'); return { rows: [] }; },
    async connect() { if (options.failConnect) throw new Error('Sem conexão'); return client; }
  };
  const api = await createApp(pool, key);
  const server = api.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return {
    queries,
    request: (body, auth = key) => fetch(`http://127.0.0.1:${server.address().port}/api/sync`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` }, body: JSON.stringify(body)
    }),
    health: () => fetch(`http://127.0.0.1:${server.address().port}/health`)
  };
}

test('API exige chave, valida dados e confirma lote somente após COMMIT', async t => {
  const { request, queries, health } = await fixture(t);
  assert.equal((await health()).status, 200);
  assert.equal((await request({ records: [] }, 'incorreta')).status, 401);
  assert.equal((await request({ deviceId: randomUUID(), records: [] })).status, 400);
  const response = await request({ deviceId: randomUUID(), records: [record()] });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { accepted: 1 });
  assert.deepEqual(queries.slice(-4).map(q => q.sql.includes('INSERT INTO') ? 'INSERT' : q.sql), ['BEGIN', 'INSERT', 'COMMIT', 'RELEASE']);
  const insert = queries.find(q => q.sql.includes('INSERT INTO'));
  assert.ok(insert.sql.includes('WHERE ea_leads.version < EXCLUDED.version'));
  assert.equal(insert.params.length, 4);
});

test('falha no banco retorna erro e faz rollback sem confirmar dados', async t => {
  const { request, queries } = await fixture(t, { failInsert: true });
  const response = await request({ deviceId: randomUUID(), records: [record()] });
  assert.equal(response.status, 500);
  assert.ok(queries.some(q => q.sql === 'ROLLBACK'));
  assert.ok(!queries.some(q => q.sql === 'COMMIT'));
});

test('falha ao adquirir conexão e health indisponível são explícitos', async t => {
  const { request, health } = await fixture(t, { failConnect: true, failHealth: true });
  assert.equal((await health()).status, 503);
  assert.equal((await request({ deviceId: randomUUID(), records: [record()] })).status, 500);
});

test('API rejeita chave não configurada', async () => {
  await assert.rejects(() => createApp({}, 'curta'), /CLOUD_SYNC_KEY/);
});

test('URL externa Render habilita TLS com certificado verificado; interna usa rede privada', () => {
  assert.deepEqual(databaseOptions('postgresql://test:test@db.oregon-postgres.render.com/ea').ssl, { rejectUnauthorized: true });
  assert.equal(databaseOptions('postgresql://test:test@dpg-exemplo-a/ea').ssl, undefined);
  assert.throws(() => databaseOptions('endereço inválido'));
});

test('painel de leads exige usuário e senha, lista e exporta CSV', async t => {
  const stored = record();
  stored.lead.marketing = true;
  const pool = {
    async query(sql) { return sql.includes('FROM ea_leads') ? { rows: [{ payload: stored }] } : { rows: [] }; },
    async connect() { throw new Error('não usado'); }
  };
  const api = await createApp(pool, key, { leadsUser: 'equipe', leadsPassword: 'senha-forte-123' });
  const server = api.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const basic = pass => ({ Authorization: 'Basic ' + Buffer.from(`equipe:${pass}`).toString('base64') });
  assert.equal((await fetch(`${base}/leads`)).status, 401);
  assert.equal((await fetch(`${base}/leads`, { headers: basic('errada') })).status, 401);
  const html = await fetch(`${base}/leads`, { headers: basic('senha-forte-123') });
  assert.equal(html.status, 200);
  assert.ok((await html.text()).includes('Pessoa Teste'));
  const csv = await fetch(`${base}/leads.csv?marketing=1`, { headers: basic('senha-forte-123') });
  const text = await csv.text();
  assert.ok(text.startsWith('﻿Data;Nome;'));
  assert.ok(text.includes('teste@example.com'));
});

test('painel de leads fica desligado sem senha configurada', async t => {
  const { health } = await fixture(t);
  const base = (await health()).url.replace('/health', '');
  assert.equal((await fetch(`${base}/leads`)).status, 404);
});

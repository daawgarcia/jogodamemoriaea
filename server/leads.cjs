// Painel web de leads (somente leitura), protegido por usuário e senha (HTTP Basic).
// Ativado apenas quando LEADS_PASSWORD estiver configurada no servidor.
const { timingSafeEqual } = require('node:crypto');

const FAIL_LIMIT = 5;
const FAIL_WINDOW_MS = 60 * 1000;

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const STATUS = { active: 'Em andamento', won: 'Conquistou brinde', cancelled: 'Partida cancelada' };

function toRow(row) {
  const p = row.payload || {};
  const lead = p.lead || {};
  return {
    data: p.createdAt ? new Date(p.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '',
    nome: lead.name, email: lead.email, whatsapp: lead.whatsapp, cidade: lead.city,
    cro: lead.student ? 'Estudante' : lead.cro,
    contato: lead.marketing ? 'Sim' : 'Não',
    status: STATUS[p.status] || p.status, brinde: p.status === 'won' ? p.prize : '',
    entregue: p.delivered ? 'Sim' : 'Não', jogadas: p.moves
  };
}

const COLUMNS = [
  ['data', 'Data'], ['nome', 'Nome'], ['email', 'E-mail'], ['whatsapp', 'WhatsApp'], ['cidade', 'Cidade/UF'],
  ['cro', 'CRO/UF'], ['contato', 'Contato autorizado'], ['status', 'Situação'], ['brinde', 'Brinde'], ['entregue', 'Entregue']
];

function page(rows, onlyMarketing) {
  const total = rows.length;
  const authorized = rows.filter(r => r.contato === 'Sim').length;
  const winners = rows.filter(r => r.brinde).length;
  const body = rows.map(r => `<tr>${COLUMNS.map(([k]) => `<td>${escapeHtml(r[k])}</td>`).join('')}</tr>`).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Leads — Jogo da Memória Esthetic Aligner</title>
<style>
body{font-family:system-ui,Segoe UI,Arial,sans-serif;margin:0;background:#f4f6fa;color:#1d2433}
header{background:#0b2a5b;color:#fff;padding:18px 24px}header h1{margin:0;font-size:20px}header p{margin:4px 0 0;opacity:.8;font-size:13px}
main{padding:20px 24px}.cards{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px}
.card{background:#fff;border-radius:10px;padding:12px 16px;box-shadow:0 1px 3px rgba(0,0,0,.08);min-width:150px}.card b{display:block;font-size:24px}
.bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px}
a.btn{background:#0b2a5b;color:#fff;text-decoration:none;padding:9px 14px;border-radius:8px;font-size:14px}a.btn.alt{background:#fff;color:#0b2a5b;border:1px solid #0b2a5b}
.wrap{overflow:auto;background:#fff;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
table{border-collapse:collapse;width:100%;font-size:13px}th,td{padding:8px 10px;border-bottom:1px solid #e6e9f0;text-align:left;white-space:nowrap}
th{background:#eef2f9;position:sticky;top:0}.empty{padding:24px;text-align:center;color:#667}
</style></head><body>
<header><h1>Leads — Jogo da Memória Esthetic Aligner</h1><p>Somente leitura. Use para marketing apenas quem marcou “Contato autorizado: Sim”.</p></header>
<main>
<div class="cards"><div class="card"><b>${total}</b>${onlyMarketing ? 'com contato autorizado' : 'cadastros'}</div><div class="card"><b>${authorized}</b>contato autorizado</div><div class="card"><b>${winners}</b>ganharam brinde</div></div>
<div class="bar">
${onlyMarketing ? '<a class="btn alt" href="/leads">Ver todos</a>' : '<a class="btn alt" href="/leads?marketing=1">Somente contato autorizado</a>'}
<a class="btn" href="/leads.csv${onlyMarketing ? '?marketing=1' : ''}">Baixar CSV${onlyMarketing ? ' (contato autorizado)' : ''}</a>
</div>
<div class="wrap">${total ? `<table><thead><tr>${COLUMNS.map(([, t]) => `<th>${t}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>` : '<p class="empty">Nenhum cadastro recebido ainda.</p>'}</div>
</main></body></html>`;
}

function addLeadsPanel(api, pool, { user = 'equipe', password } = {}) {
  if (!password || password.length < 12) return false;
  const failures = new Map();

  function auth(req, res, next) {
    const ip = req.ip || 'desconhecido';
    const now = Date.now();
    const entry = failures.get(ip);
    if (entry && entry.count >= FAIL_LIMIT && now - entry.first < FAIL_WINDOW_MS) {
      return res.status(429).send('Muitas tentativas. Aguarde um minuto e tente novamente.');
    }
    const header = req.headers.authorization || '';
    const [scheme, encoded] = header.split(' ');
    if (scheme === 'Basic' && encoded) {
      const decoded = Buffer.from(encoded, 'base64').toString('utf8');
      const sep = decoded.indexOf(':');
      const userOk = sep > 0 && safeEqual(decoded.slice(0, sep), user);
      const passOk = sep > 0 && safeEqual(decoded.slice(sep + 1), password);
      if (userOk && passOk) {
        failures.delete(ip);
        return next();
      }
      if (!entry || now - entry.first >= FAIL_WINDOW_MS) failures.set(ip, { count: 1, first: now });
      else entry.count += 1;
    }
    res.set('WWW-Authenticate', 'Basic realm="Leads Jogo da Memoria", charset="UTF-8"');
    return res.status(401).send('Acesso restrito à equipe da Esthetic Aligner.');
  }

  async function load(req) {
    const onlyMarketing = req.query.marketing === '1';
    const { rows } = await pool.query(
      `SELECT payload FROM ea_leads
       ${onlyMarketing ? "WHERE (payload->'lead'->>'marketing')::boolean = true" : ''}
       ORDER BY payload->>'createdAt' DESC`
    );
    return { onlyMarketing, rows: rows.map(toRow) };
  }

  api.get('/leads', auth, async (req, res, next) => {
    try {
      const { onlyMarketing, rows } = await load(req);
      res.set({ 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow', 'X-Frame-Options': 'DENY' });
      res.send(page(rows, onlyMarketing));
    } catch (error) { next(error); }
  });

  api.get('/leads.csv', auth, async (req, res, next) => {
    try {
      const { onlyMarketing, rows } = await load(req);
      const lines = [COLUMNS.map(([, t]) => csvCell(t)).join(';'), ...rows.map(r => COLUMNS.map(([k]) => csvCell(r[k])).join(';'))];
      const stamp = new Date().toISOString().slice(0, 10);
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="leads-jogo-memoria-${onlyMarketing ? 'autorizados-' : ''}${stamp}.csv"`
      });
      res.send('﻿' + lines.join('\r\n') + '\r\n');
    } catch (error) { next(error); }
  });

  return true;
}

module.exports = { addLeadsPanel, toRow, escapeHtml, csvCell };

const initSqlJs = require('sql.js');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, randomInt, scryptSync, timingSafeEqual } = require('node:crypto');
const { leadSchema, prizeSchema } = require('../shared/validation.cjs');
const cardFaces = require('../shared/cards.json');

const NOTICE_VERSION = '2026-11-v1';

class Store {
  static async open(file) {
    const SQL = await initSqlJs();
    const db = new SQL.Database(fs.existsSync(file) ? fs.readFileSync(file) : undefined);
    return new Store(db, file);
  }

  constructor(db, file) {
    this.db = db;
    this.Database = db.constructor;
    this.file = file;
    db.run(`
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS prizes (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, available INTEGER NOT NULL CHECK(available >= 0),
        total INTEGER NOT NULL CHECK(total >= 0)
      );
      CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY, lead TEXT NOT NULL, created_at TEXT NOT NULL,
        status TEXT NOT NULL, prize_id TEXT NOT NULL, board TEXT NOT NULL,
        matched TEXT NOT NULL DEFAULT '[]', flipped TEXT NOT NULL DEFAULT '[]',
        mismatch_until INTEGER NOT NULL DEFAULT 0, moves INTEGER NOT NULL DEFAULT 0,
        delivered INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, version INTEGER NOT NULL);
    `);
    if (!this.setting('deviceId')) this.setSetting('deviceId', randomUUID());
    this.persist();
  }

  all(sql, args = []) {
    const statement = this.db.prepare(sql);
    try {
      statement.bind(args);
      const rows = [];
      while (statement.step()) rows.push(statement.getAsObject());
      return rows;
    } finally { statement.free(); }
  }

  one(sql, args = []) { return this.all(sql, args)[0]; }
  setting(key) { return this.one('SELECT value FROM settings WHERE key = ?', [key])?.value || ''; }
  setSetting(key, value) { this.db.run('INSERT OR REPLACE INTO settings VALUES (?, ?)', [key, value]); }

  persist() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    const fd = fs.openSync(temporary, 'w', 0o600);
    try { fs.writeFileSync(fd, this.db.export()); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    fs.renameSync(temporary, this.file);
  }

  transaction(work) {
    const snapshot = this.db.export();
    this.db.run('BEGIN IMMEDIATE');
    let result;
    try { result = work(); this.db.run('COMMIT'); }
    catch (error) { this.db.run('ROLLBACK'); throw error; }
    try { this.persist(); }
    catch (error) {
      this.db.close();
      this.db = new this.Database(snapshot);
      throw new Error(`Não foi possível salvar no disco. Confira o espaço e as permissões: ${error.message}`);
    }
    return result;
  }

  setup(password, contact) {
    if (this.setting('password')) throw new Error('O administrador já foi configurado.');
    if (typeof password !== 'string' || password.length < 10 || password.length > 200) throw new Error('Use uma senha de 10 a 200 caracteres.');
    if (typeof contact !== 'string' || contact.trim().length < 5 || contact.length > 180) throw new Error('Informe um contato de privacidade da Esthetic Aligner.');
    return this.transaction(() => {
      const salt = randomUUID();
      this.setSetting('password', `${salt}:${scryptSync(password, salt, 64).toString('hex')}`);
      this.setSetting('privacyContact', contact.trim());
    });
  }

  authenticate(password) {
    if (typeof password !== 'string' || password.length > 200) return false;
    const stored = this.setting('password');
    if (!stored) return false;
    const [salt, hash] = stored.split(':');
    return timingSafeEqual(Buffer.from(hash, 'hex'), scryptSync(password, salt, 64));
  }

  publicInfo() {
    return {
      configured: Boolean(this.setting('password')),
      privacyContact: this.setting('privacyContact'),
      available: Number(this.one('SELECT COALESCE(SUM(available), 0) AS count FROM prizes').count),
      game: this.activeGame()
    };
  }

  addPrize(input) {
    const prize = prizeSchema.parse(input);
    this.transaction(() => this.db.run('INSERT INTO prizes VALUES (?, ?, ?, ?)', [randomUUID(), prize.name, prize.quantity, prize.quantity]));
  }

  addStock(id, quantity) {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100000) throw new Error('Informe uma quantidade entre 1 e 100.000.');
    if (!this.one('SELECT id FROM prizes WHERE id = ?', [id])) throw new Error('Brinde não encontrado.');
    this.transaction(() => this.db.run('UPDATE prizes SET available = available + ?, total = total + ? WHERE id = ?', [quantity, quantity, id]));
  }

  removeStock(id) {
    if (!this.one('SELECT id FROM prizes WHERE id = ?', [id])) throw new Error('Brinde não encontrado.');
    this.transaction(() => this.db.run('UPDATE prizes SET total = total - available, available = 0 WHERE id = ?', [id]));
  }

  start(input) {
    if (!this.setting('password')) throw new Error('Peça à equipe para configurar o aplicativo.');
    if (this.one("SELECT id FROM games WHERE status = 'active'")) throw new Error('Já existe uma partida em andamento.');
    const lead = leadSchema.parse(input);
    if (this.all("SELECT lead FROM games WHERE status != 'cancelled'").some(row => {
      const previous = JSON.parse(row.lead);
      return previous.whatsapp === lead.whatsapp || previous.email === lead.email;
    })) throw new Error('Este WhatsApp ou e-mail já participou. Procure a equipe do estande.');
    return this.transaction(() => {
      const prizes = this.all('SELECT * FROM prizes WHERE available > 0 ORDER BY id');
      const total = prizes.reduce((sum, item) => sum + item.available, 0);
      if (!total) throw new Error('Os brindes esgotaram. Procure a equipe do estande.');
      let ticket = randomInt(total);
      const prize = prizes.find(item => { ticket -= item.available; return ticket < 0; });
      const board = Array.from({ length: cardFaces.length * 2 }, (_, i) => i % cardFaces.length);
      for (let i = board.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [board[i], board[j]] = [board[j], board[i]];
      }
      const id = randomUUID();
      this.db.run('UPDATE prizes SET available = available - 1 WHERE id = ?', [prize.id]);
      this.db.run('INSERT INTO games (id, lead, created_at, status, prize_id, board) VALUES (?, ?, ?, ?, ?, ?)', [
        id, JSON.stringify(lead), new Date().toISOString(), 'active', prize.id, JSON.stringify(board)
      ]);
      this.queue(id);
      return this.gameView(id);
    });
  }

  queue(id) {
    this.db.run('INSERT OR REPLACE INTO outbox SELECT id, version FROM games WHERE id = ?', [id]);
  }

  activeGame() {
    const row = this.one("SELECT id FROM games WHERE status = 'active' ORDER BY created_at DESC LIMIT 1");
    return row ? this.gameView(row.id) : null;
  }

  gameView(id) {
    const row = this.one('SELECT g.*, p.name AS prize_name FROM games g JOIN prizes p ON p.id = g.prize_id WHERE g.id = ?', [id]);
    if (!row) throw new Error('Partida não encontrada.');
    const board = JSON.parse(row.board);
    const matched = JSON.parse(row.matched);
    const flipped = row.mismatch_until && Date.now() >= row.mismatch_until ? [] : JSON.parse(row.flipped);
    return {
      id, status: row.status, moves: row.moves, pairs: matched.length / 2, totalPairs: board.length / 2,
      cards: board.map((face, index) => ({ index, face: matched.includes(index) || flipped.includes(index) ? face : null, matched: matched.includes(index) })),
      mismatchUntil: row.mismatch_until > Date.now() ? row.mismatch_until : 0,
      prize: row.status === 'won' ? row.prize_name : null
    };
  }

  flip(id, index) {
    if (!Number.isInteger(index) || index < 0) throw new Error('Peça inválida.');
    const row = this.one("SELECT * FROM games WHERE id = ? AND status = 'active'", [id]);
    if (!row) throw new Error('Esta partida não está ativa.');
    if (index >= JSON.parse(row.board).length) throw new Error('Peça inválida.');
    if (row.mismatch_until > Date.now()) return this.gameView(id);
    return this.transaction(() => {
      const board = JSON.parse(row.board);
      const matched = JSON.parse(row.matched);
      let flipped = row.mismatch_until ? [] : JSON.parse(row.flipped);
      if (matched.includes(index) || flipped.includes(index)) return this.gameView(id);
      flipped.push(index);
      let moves = row.moves;
      let mismatchUntil = 0;
      if (flipped.length === 2) {
        moves++;
        if (board[flipped[0]] === board[flipped[1]]) { matched.push(...flipped); flipped = []; }
        else mismatchUntil = Date.now() + 1100;
      }
      const status = matched.length === board.length ? 'won' : 'active';
      this.db.run('UPDATE games SET matched = ?, flipped = ?, mismatch_until = ?, moves = ?, status = ?, version = version + 1 WHERE id = ?', [
        JSON.stringify(matched), JSON.stringify(flipped), mismatchUntil, moves, status, id
      ]);
      this.queue(id);
      return this.gameView(id);
    });
  }

  cancel(id) {
    const game = this.one("SELECT * FROM games WHERE id = ? AND status = 'active'", [id]);
    if (!game) throw new Error('Partida ativa não encontrada.');
    this.transaction(() => {
      this.db.run('UPDATE prizes SET available = available + 1 WHERE id = ?', [game.prize_id]);
      this.db.run("UPDATE games SET status = 'cancelled', version = version + 1 WHERE id = ?", [id]);
      this.queue(id);
    });
  }

  deliver(id) {
    if (!this.one("SELECT id FROM games WHERE id = ? AND status = 'won'", [id])) throw new Error('Somente prêmios conquistados podem ser entregues.');
    this.transaction(() => {
      this.db.run('UPDATE games SET delivered = 1, version = version + 1 WHERE id = ?', [id]);
      this.queue(id);
    });
  }

  records() {
    return this.all('SELECT g.*, p.name AS prize FROM games g JOIN prizes p ON p.id = g.prize_id ORDER BY created_at DESC').map(row => ({
      id: row.id, version: row.version, lead: JSON.parse(row.lead), createdAt: row.created_at,
      status: row.status, prize: row.prize, moves: row.moves, delivered: Boolean(row.delivered), noticeVersion: NOTICE_VERSION
    }));
  }

  adminInfo() {
    return {
      deviceId: this.setting('deviceId'),
      prizes: this.all('SELECT * FROM prizes ORDER BY name'),
      records: this.records(),
      pending: this.one('SELECT COUNT(*) AS count FROM outbox').count,
      cloudUrl: this.setting('cloudUrl'),
      cloudConfigured: Boolean(this.setting('cloudKey')),
      lastSync: this.setting('lastSync')
    };
  }

  configureCloud(url, key) {
    if (url === '') {
      this.transaction(() => { this.setSetting('cloudUrl', ''); this.setSetting('cloudKey', ''); });
      return;
    }
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('Use a URL HTTPS do servidor, sem credenciais ou parâmetros.');
    if (typeof key !== 'string' || key.length < 32 || key.length > 256) throw new Error('A chave de sincronização deve ter de 32 a 256 caracteres.');
    this.transaction(() => {
      this.setSetting('cloudUrl', parsed.origin);
      this.setSetting('cloudKey', key);
      this.db.run('INSERT OR REPLACE INTO outbox SELECT id, version FROM games');
    });
  }

  pendingRecords() {
    const queued = new Map(this.all('SELECT * FROM outbox').map(row => [row.id, row.version]));
    return this.records().filter(row => queued.has(row.id)).slice(0, 100);
  }

  acknowledge(records) {
    this.transaction(() => {
      for (const record of records) this.db.run('DELETE FROM outbox WHERE id = ? AND version = ?', [record.id, record.version]);
      this.setSetting('lastSync', new Date().toISOString());
    });
  }

  close() { this.db.close(); }
}

function csv(records) {
  const escape = value => `"${String(value).replace(/^[=+\-@\t\r]/, "'$&").replaceAll('"', '""')}"`;
  const headers = ['ID', 'Data', 'Nome', 'E-mail', 'WhatsApp', 'Cidade', 'Estudante', 'CRO', 'Contato autorizado', 'Aviso de privacidade', 'Status', 'Brinde', 'Jogadas', 'Entregue'];
  return '\uFEFF' + [headers, ...records.map(r => [r.id, r.createdAt, r.lead.name, r.lead.email, r.lead.whatsapp, r.lead.city, r.lead.student ? 'Sim' : 'Não', r.lead.cro, r.lead.marketing ? 'Sim' : 'Não', r.noticeVersion, r.status, r.prize, r.moves, r.delivered ? 'Sim' : 'Não'])].map(row => row.map(escape).join(';')).join('\r\n');
}

module.exports = { Store, csv };

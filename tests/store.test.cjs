const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store, csv } = require('../desktop/store.cjs');
const cardFaces = require('../shared/cards.json');

const lead = overrides => ({
  name: 'Pessoa de Teste', email: 'teste@example.com', whatsapp: '(11) 99999-1234',
  city: 'São Paulo / SP', student: false, cro: 'CRO-SP 123456',
  acknowledged: true, marketing: false, ...overrides
});

async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ea-memory-test-'));
  const file = path.join(dir, 'database.sqlite');
  const store = await Store.open(file);
  t.after(() => { store.close(); fs.rmSync(file, { force: true }); fs.rmSync(`${file}.tmp`, { force: true }); fs.rmdirSync(dir); });
  store.setup('senha-de-teste-segura', 'privacidade@example.com');
  return { store, file };
}

function win(store, id) {
  const board = JSON.parse(store.one('SELECT board FROM games WHERE id = ?', [id]).board);
  for (let face = 0; face < cardFaces.length; face++) {
    board.forEach((value, index) => { if (face === value) store.flip(id, index); });
  }
  return store.gameView(id);
}

test('configuração administrativa, senha e configuração duplicada', async t => {
  const { store } = await fixture(t);
  assert.equal(store.authenticate('senha-de-teste-segura'), true);
  assert.equal(store.authenticate('errada'), false);
  assert.throws(() => store.setup('outra-senha', 'contato'), /já foi/);
  assert.equal(store.publicInfo().configured, true);
});

test('validação: estudante não exige CRO; dados inválidos e aviso recusado não entram', async t => {
  const { store } = await fixture(t);
  store.addPrize({ name: 'Kit', quantity: 3 });
  for (const invalid of [{ email: 'inválido' }, { whatsapp: '123' }, { cro: '' }, { acknowledged: false }]) assert.throws(() => store.start(lead(invalid)));
  assert.equal(store.records().length, 0);
  assert.equal(store.publicInfo().available, 3);
  const game = store.start(lead({ student: true, cro: '' }));
  assert.equal(game.status, 'active');
  assert.equal(store.records()[0].lead.marketing, false);
  assert.equal(store.records()[0].lead.whatsapp, '5511999991234');
});

test('partida reserva estoque, oculta faces e revela prêmio só na vitória', async t => {
  const { store } = await fixture(t);
  store.addPrize({ name: 'Kit EA', quantity: 1 });
  const game = store.start(lead());
  assert.equal(game.cards.length, 8);
  assert.equal(game.totalPairs, 4);
  const board = JSON.parse(store.one('SELECT board FROM games WHERE id = ?', [game.id]).board);
  for (let face = 0; face < cardFaces.length; face++) assert.equal(board.filter(value => value === face).length, 2);
  assert.ok(game.cards.every(card => card.face === null));
  assert.equal(game.prize, null);
  assert.equal(store.publicInfo().available, 0);
  const finished = win(store, game.id);
  assert.equal(finished.status, 'won');
  assert.equal(finished.pairs, 4);
  assert.equal(finished.moves, 4);
  assert.equal(finished.prize, 'Kit EA');
  assert.equal(store.publicInfo().available, 0);
  assert.throws(() => store.flip(game.id, 0), /não está ativa/);
  assert.throws(() => store.start(lead({ email: 'outro@example.com', whatsapp: '11999991235' })), /esgotaram/);
  assert.equal(store.records().length, 1);
  store.deliver(game.id);
  assert.equal(store.records()[0].delivered, true);
});

test('duplicidade de e-mail ou WhatsApp não consome novo brinde', async t => {
  const { store } = await fixture(t);
  store.addPrize({ name: 'Kit', quantity: 4 });
  const game = store.start(lead());
  assert.throws(() => store.start(lead({ email: 'outro@example.com' })), /em andamento/);
  win(store, game.id);
  assert.throws(() => store.start(lead({ email: 'outro@example.com', whatsapp: '+55 (11) 99999-1234' })), /já participou/);
  assert.throws(() => store.start(lead({ email: 'TESTE@example.com', whatsapp: '11999991235' })), /já participou/);
  assert.equal(store.publicInfo().available, 3);
});

test('cancelamento devolve exatamente uma unidade e permite nova tentativa', async t => {
  const { store } = await fixture(t);
  store.addPrize({ name: 'Kit', quantity: 1 });
  const game = store.start(lead());
  assert.throws(() => store.deliver(game.id), /conquistados/);
  store.cancel(game.id);
  assert.equal(store.publicInfo().available, 1);
  assert.throws(() => store.cancel(game.id), /não encontrada/);
  assert.equal(store.publicInfo().available, 1);
  assert.equal(store.start(lead()).status, 'active');
});

test('pares errados travam temporariamente e não contam como acertos', async t => {
  const { store } = await fixture(t);
  store.addPrize({ name: 'Kit', quantity: 1 });
  const game = store.start(lead());
  const board = JSON.parse(store.one('SELECT board FROM games WHERE id = ?', [game.id]).board);
  const second = board.findIndex(value => value !== board[0]);
  store.flip(game.id, 0);
  const mismatch = store.flip(game.id, second);
  assert.equal(mismatch.pairs, 0);
  assert.equal(mismatch.moves, 1);
  assert.equal(mismatch.cards.filter(card => card.face !== null).length, 2);
  assert.equal(store.flip(game.id, (second + 1) % game.cards.length).moves, 1);
  store.db.run('UPDATE games SET mismatch_until = 1 WHERE id = ?', [game.id]);
  assert.equal(store.gameView(game.id).cards.filter(card => card.face !== null).length, 0);
  assert.equal(store.flip(game.id, 0).cards.filter(card => card.face !== null).length, 1);
});

test('persistência e retomada após reiniciar sem internet', async t => {
  const { store, file } = await fixture(t);
  store.addPrize({ name: 'Brinde offline', quantity: 2 });
  const game = store.start(lead());
  store.flip(game.id, 3);
  const reopened = await Store.open(file);
  try {
    assert.equal(reopened.publicInfo().available, 1);
    assert.equal(reopened.activeGame().id, game.id);
    assert.notEqual(reopened.activeGame().cards[3].face, null);
    assert.equal(reopened.records().length, 1);
    assert.equal(reopened.adminInfo().pending, 1);
  } finally { reopened.close(); }
});

test('fila idempotente não apaga alteração posterior ao envio', async t => {
  const { store } = await fixture(t);
  store.addPrize({ name: 'Kit', quantity: 1 });
  const game = store.start(lead());
  const sent = store.pendingRecords();
  store.flip(game.id, 0);
  store.acknowledge(sent);
  assert.equal(store.pendingRecords().length, 1);
  store.acknowledge(store.pendingRecords());
  assert.equal(store.pendingRecords().length, 0);
  assert.ok(store.adminInfo().lastSync);
});

test('falha de gravação reverte memória, estoque e cadastro e permite tentar de novo', async t => {
  const { store } = await fixture(t);
  store.addPrize({ name: 'Kit', quantity: 1 });
  const persist = store.persist;
  store.persist = () => { throw new Error('disco cheio'); };
  assert.throws(() => store.start(lead()), /Não foi possível salvar no disco/);
  assert.equal(store.publicInfo().available, 1);
  assert.equal(store.records().length, 0);
  store.persist = persist;
  assert.equal(store.start(lead()).status, 'active');
});

test('estoque inválido, retirada de saldo e reposição preservam reservas', async t => {
  const { store } = await fixture(t);
  assert.throws(() => store.addPrize({ name: 'Kit', quantity: -1 }));
  store.addPrize({ name: 'Kit', quantity: 4 });
  const id = store.adminInfo().prizes[0].id;
  const game = store.start(lead());
  store.removeStock(id);
  assert.equal(store.publicInfo().available, 0);
  store.cancel(game.id);
  assert.equal(store.publicInfo().available, 1);
  store.addStock(id, 2);
  assert.equal(store.publicInfo().available, 3);
  assert.throws(() => store.addStock(id, -2));
  assert.throws(() => store.addStock('não-existe', 2));
});

test('sorteio distribui exatamente o estoque sem exceder nenhuma opção', async t => {
  const { store } = await fixture(t);
  store.addPrize({ name: 'Caneta', quantity: 15 });
  store.addPrize({ name: 'Kit especial', quantity: 5 });
  const results = new Map();
  for (let i = 0; i < 20; i++) {
    const game = store.start(lead({ email: `pessoa${i}@example.com`, whatsapp: `1199999${String(i).padStart(4, '0')}` }));
    const result = win(store, game.id);
    results.set(result.prize, (results.get(result.prize) || 0) + 1);
  }
  assert.equal(results.get('Caneta'), 15);
  assert.equal(results.get('Kit especial'), 5);
  assert.equal(store.publicInfo().available, 0);
  assert.equal(store.records().filter(row => row.status === 'won').length, 20);
});

test('configuração de nuvem exige HTTPS e chave e enfileira histórico', async t => {
  const { store } = await fixture(t);
  assert.throws(() => store.configureCloud('http://example.com', 'x'.repeat(32)), /HTTPS/);
  assert.throws(() => store.configureCloud('https://example.com', 'curta'), /chave/);
  assert.throws(() => store.configureCloud('https://usuario:senha@example.com', 'x'.repeat(32)), /HTTPS/);
  store.addPrize({ name: 'Kit', quantity: 1 });
  store.start(lead());
  store.acknowledge(store.pendingRecords());
  store.configureCloud('https://ea.example.com/', 'x'.repeat(32));
  assert.equal(store.adminInfo().pending, 1);
  assert.equal(store.adminInfo().cloudUrl, 'https://ea.example.com');
  assert.equal(store.adminInfo().cloudKey, undefined);
  store.configureCloud('', '');
  assert.equal(store.adminInfo().cloudConfigured, false);
});

test('CSV preserva acentos, aspas, consentimento e neutraliza fórmulas', async t => {
  const { store } = await fixture(t);
  store.addPrize({ name: 'Kit "EA"', quantity: 1 });
  store.start(lead({ name: '=HYPERLINK("malicioso")' }));
  const output = csv(store.records());
  assert.ok(output.startsWith('\uFEFF'));
  assert.ok(output.includes("'=HYPERLINK"));
  assert.ok(output.includes('Kit ""EA""'));
  assert.ok(output.includes('"Não"'));
  assert.ok(output.includes('São Paulo'));
});

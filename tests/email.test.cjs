const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { Store } = require('../desktop/store.cjs');
const { EmailDelivery } = require('../desktop/email.cjs');
const defaults = require('../shared/email-defaults.json');

const config = { ...defaults, username: 'congresso@example.com', password: 'senha-ficticia-de-teste', enabled: true };
const lead = overrides => ({
  name: 'Pessoa de Teste', email: 'participante@example.com', whatsapp: '11999991234',
  city: 'São Paulo / SP', cro: 'CRO-SP 123456', student: false, acknowledged: true, marketing: true, ...overrides
});
const secrets = {
  encrypt: value => `encrypted:${value}`,
  decrypt: value => {
    assert.ok(value.startsWith('encrypted:'));
    return value.slice(10);
  }
};

async function fixture(t, send = async message => ({ accepted: [message.to.address] })) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ea-email-test-'));
  const file = path.join(directory, 'database.sqlite');
  const store = await Store.open(file);
  t.after(() => {
    store.close();
    fs.rmSync(file, { force: true });
    fs.rmSync(`${file}.tmp`, { force: true });
    fs.rmdirSync(directory);
  });
  store.setup('senha-administrativa-teste', 'privacidade@example.com');
  store.addPrize({ name: 'Kit EA', quantity: 5 });
  const messages = [];
  const transports = [];
  const emails = new EmailDelivery(store, secrets, options => {
    transports.push(options);
    return { sendMail: async message => { messages.push(message); return send(message); }, close() {} };
  });
  return { store, emails, messages, transports, file };
}

test('fila é atômica com cadastro; somente consentimento, sem inclusão retroativa ou duplicação', async t => {
  const { store, emails, file } = await fixture(t);
  const game = store.start(lead({ marketing: false }));
  assert.equal(emails.info().queue.length, 0);
  store.cancel(game.id);
  const consented = store.start(lead());
  assert.equal(emails.info().queue.length, 1);
  store.flip(consented.id, 0);
  const reopened = await Store.open(file);
  assert.equal(reopened.one('SELECT COUNT(*) AS count FROM email_outbox').count, 1);
  reopened.close();
  store.cancel(consented.id);
  store.start(lead());
  assert.equal(emails.info().queue.length, 1);
  assert.equal(emails.info().queue[0].status, 'cancelled');
});

test('SMTP seguro, modelo de dentista, pausa e não reenvia após confirmação', async t => {
  const { store, emails, messages, transports } = await fixture(t);
  store.start(lead());
  await emails.process();
  assert.equal(messages.length, 0);
  emails.configure({ ...config, enabled: false });
  await emails.process();
  assert.equal(messages.length, 0);
  emails.configure({ ...config, password: '' });
  await emails.process();
  await emails.process();
  assert.equal(messages.length, 1);
  assert.equal(messages[0].to.address, 'participante@example.com');
  assert.equal(messages[0].subject, defaults.dentistSubject);
  assert.match(messages[0].text, /Olá, Pessoa de Teste!/);
  assert.match(messages[0].text, /prática clínica/);
  assert.match(messages[0].text, /Para não receber/);
  assert.equal(emails.info().counts.sent, 1);
  assert.equal(transports[0].host, 'smtp.hostinger.com');
  assert.equal(transports[0].port, 465);
  assert.equal(transports[0].secure, true);
  assert.equal(transports[0].tls.rejectUnauthorized, true);
  assert.equal(transports[0].disableFileAccess, true);
  assert.equal(transports[0].disableUrlAccess, true);
  assert.equal('password' in emails.info().config, false);
  assert.equal(JSON.stringify(emails.info()).includes(config.password), false);
});

test('estudante recebe modelo correto; testes enviam apenas à própria caixa mesmo pausado', async t => {
  const { store, emails, messages } = await fixture(t);
  emails.configure(config);
  store.start(lead({ student: true, cro: '' }));
  await emails.process();
  assert.equal(messages[0].subject, defaults.studentSubject);
  assert.match(messages[0].text, /jornada na Odontologia/);
  emails.configure({ ...config, enabled: false });
  await emails.test(false);
  await emails.test(true);
  assert.equal(messages[1].to.address, config.username);
  assert.equal(messages[2].to.address, config.username);
  assert.equal(messages[1].subject, `[TESTE] ${defaults.dentistSubject}`);
  assert.equal(messages[2].subject, `[TESTE] ${defaults.studentSubject}`);
});

test('sem conexão preserva fila, aplica espera e limita tentativas', async t => {
  const { store, emails, messages } = await fixture(t, async () => { throw Object.assign(new Error('offline'), { code: 'ECONNECTION' }); });
  emails.configure(config);
  const game = store.start(lead());
  await emails.process();
  assert.equal(emails.info().counts.pending, 1);
  assert.equal(emails.info().queue[0].attempts, 1);
  assert.match(emails.info().error, /ECONNECTION/);
  await emails.process();
  assert.equal(messages.length, 1);
  store.transaction(() => store.db.run('UPDATE email_outbox SET next_attempt = 0, attempts = 7'));
  await emails.process();
  assert.equal(emails.info().counts.failed, 1);
  emails.retry(game.id);
  assert.equal(emails.info().counts.pending, 1);
});

test('timeout após iniciar SMTP é incerto e exige decisão explícita, com Message-ID estável', async t => {
  const { store, emails, messages } = await fixture(t, async () => { throw Object.assign(new Error('timeout'), { code: 'ETIMEDOUT', command: 'DATA' }); });
  emails.configure(config);
  const game = store.start(lead());
  await emails.process();
  assert.equal(emails.info().counts.uncertain, 1);
  await emails.process();
  assert.equal(messages.length, 1);
  emails.retry(game.id);
  await emails.process();
  assert.equal(messages.length, 2);
  assert.equal(messages[0].messageId, messages[1].messageId);
});

test('interrupção de energia não reenvia automaticamente; retirada bloqueia próximos contatos', async t => {
  const { store, emails, messages } = await fixture(t);
  emails.configure(config);
  const game = store.start(lead());
  store.transaction(() => store.db.run("UPDATE email_outbox SET status = 'sending'"));
  const resumed = new EmailDelivery(store, secrets);
  assert.equal(resumed.info().counts.uncertain, 1);
  emails.suppress(game.id);
  assert.equal(emails.info().counts.cancelled, 1);
  assert.ok(store.one('SELECT email FROM email_suppressions WHERE email = ?', [lead().email]));
  assert.equal(store.records()[0].lead.marketing, false);
  assert.equal(store.pendingRecords()[0].lead.marketing, false);
  await emails.process();
  assert.equal(messages.length, 0);
  assert.throws(() => emails.retry(game.id), /não pode/);
});

test('partidas canceladas não enviam e o trabalhador não faz envios concorrentes', async t => {
  let release;
  const { store, emails, messages } = await fixture(t, () => new Promise(resolve => { release = resolve; }));
  emails.configure(config);
  const cancelled = store.start(lead());
  store.cancel(cancelled.id);
  await emails.process();
  assert.equal(messages.length, 0);
  store.start(lead({ email: 'outro@example.com', whatsapp: '11999991235' }));
  const pending = emails.process();
  await emails.process();
  assert.equal(messages.length, 1);
  assert.throws(() => emails.configure(config), /Aguarde/);
  release({ accepted: ['outro@example.com'] });
  await pending;
  assert.equal(emails.info().counts.sent, 1);
});

test('configuração valida cabeçalhos, protege senha e mantém configurações se proteção falhar', async t => {
  const { store, emails } = await fixture(t);
  assert.throws(() => emails.configure({ ...config, dentistSubject: 'Olá\r\nBcc: outra@example.com' }));
  assert.throws(() => emails.configure({ ...config, username: 'inválido' }));
  emails.configure(config);
  assert.ok(store.setting('emailPassword').startsWith('encrypted:'));
  assert.throws(() => emails.configure({ ...config, username: 'nova@example.com', password: '' }), /senha/);
  const broken = new EmailDelivery(store, { ...secrets, encrypt() { throw new Error('proteção indisponível'); } });
  assert.throws(() => broken.configure(config), /proteção indisponível/);
  assert.equal(emails.config().username, config.username);
});

test('falha de persistência do cadastro não deixa e-mail órfão na fila', async t => {
  const { store, emails } = await fixture(t);
  const persist = store.persist;
  store.persist = () => { throw new Error('Disco cheio'); };
  assert.throws(() => store.start(lead()), /Não foi possível salvar/);
  store.persist = persist;
  assert.equal(emails.info().queue.length, 0);
  assert.equal(store.records().length, 0);
});

test('Nodemailer compõe os dois modelos como texto, sem destinatários extras', async t => {
  const { store, emails } = await fixture(t);
  emails.configure(config);
  const transport = require('nodemailer').createTransport({ jsonTransport: true });
  for (const student of [false, true]) {
    const message = emails.message(lead({ student, name: 'Pessoa <Teste> & EA' }), 'composicao-teste');
    const result = await transport.sendMail(message);
    const composed = JSON.parse(result.message);
    assert.deepEqual(composed.to, [{ address: lead().email, name: '' }]);
    assert.equal(composed.subject, student ? defaults.studentSubject : defaults.dentistSubject);
    assert.ok(composed.text.includes('Pessoa <Teste> & EA'));
    assert.equal(composed.html, undefined);
    assert.equal(composed.cc, undefined);
    assert.equal(composed.bcc, undefined);
  }
  transport.close();
  assert.ok(store.setting('emailPassword'));
});

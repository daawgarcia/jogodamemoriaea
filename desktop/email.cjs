const { z } = require('zod');
const defaults = require('../shared/email-defaults.json');

const subject = z.string().trim().min(1).max(180).regex(/^[^\r\n]+$/, 'O assunto não pode conter quebras de linha.');
const configSchema = z.object({
  enabled: z.boolean(),
  username: z.email().max(180).transform(value => value.toLowerCase()),
  fromName: subject,
  dentistSubject: subject,
  dentistBody: z.string().trim().min(10).max(10000),
  studentSubject: subject,
  studentBody: z.string().trim().min(10).max(10000)
});

function smtpError(error) {
  const code = typeof error.code === 'string' ? error.code.replace(/[^A-Z0-9_]/g, '').slice(0, 40) : 'ERRO';
  return `Falha no envio SMTP (${code}${Number.isInteger(error.responseCode) ? ` / ${error.responseCode}` : ''}). Confira a conexão, a conta e os limites de envio da Hostinger.`;
}

class EmailDelivery {
  constructor(store, secrets, createTransport = options => require('nodemailer').createTransport(options)) {
    this.store = store;
    this.secrets = secrets;
    this.createTransport = createTransport;
    this.busy = false;
    this.error = '';
    if (store.one("SELECT id FROM email_outbox WHERE status = 'sending'")) {
      store.transaction(() => store.db.run(`UPDATE email_outbox SET status = 'uncertain',
        last_error = 'O aplicativo foi encerrado durante o envio. Confirme com o destinatário ou o provedor antes de tentar novamente.'
        WHERE status = 'sending'`));
    }
  }

  config() {
    return { ...defaults, ...JSON.parse(this.store.setting('emailConfig') || '{}') };
  }

  info() {
    return {
      config: this.config(),
      passwordConfigured: Boolean(this.store.setting('emailPassword')),
      sending: this.busy,
      error: this.error,
      counts: Object.fromEntries(this.store.all('SELECT status, COUNT(*) AS count FROM email_outbox GROUP BY status').map(row => [row.status, row.count])),
      queue: this.store.all(`SELECT id, email, status, attempts, last_error AS lastError, sent_at AS sentAt
        FROM email_outbox ORDER BY rowid DESC LIMIT 100`)
    };
  }

  configure(input) {
    if (this.busy) throw new Error('Aguarde o envio atual terminar antes de alterar os e-mails.');
    const config = configSchema.parse(input);
    if (typeof input.password !== 'string' || input.password.length > 500) throw new Error('Informe uma senha válida.');
    let encrypted = this.store.setting('emailPassword');
    const previous = this.config();
    if (input.password) encrypted = this.secrets.encrypt(input.password);
    else if (config.username !== previous.username || !encrypted) throw new Error('Informe a senha desta caixa de e-mail.');
    this.store.transaction(() => {
      this.store.setSetting('emailConfig', JSON.stringify(config));
      this.store.setSetting('emailPassword', encrypted);
    });
    this.error = '';
  }

  transport() {
    const config = this.config();
    if (!config.username || !this.store.setting('emailPassword')) throw new Error('Configure e salve a caixa Hostinger primeiro.');
    return this.createTransport({
      host: 'smtp.hostinger.com', port: 465, secure: true,
      auth: { user: config.username, pass: this.secrets.decrypt(this.store.setting('emailPassword')) },
      connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
      tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
      disableFileAccess: true, disableUrlAccess: true
    });
  }

  message(lead, id) {
    const config = this.config();
    const render = value => value.replaceAll('{nome}', lead.name);
    return {
      from: { name: config.fromName, address: config.username },
      to: { address: lead.email }, replyTo: config.username,
      subject: render(lead.student ? config.studentSubject : config.dentistSubject).replace(/[\r\n]/g, ' '),
      text: `${render(lead.student ? config.studentBody : config.dentistBody)}\n\nVocê recebeu esta mensagem porque autorizou o contato da Esthetic Aligner na ação do congresso. Para não receber mais informações, responda a este e-mail solicitando a retirada.`,
      messageId: `<ea-${this.store.setting('deviceId')}-${id}@${config.username.split('@')[1]}>`
    };
  }

  async test(student) {
    if (typeof student !== 'boolean') throw new Error('Selecione dentista ou estudante.');
    if (this.busy) throw new Error('Aguarde o envio atual terminar.');
    this.busy = true;
    let transport;
    try {
      transport = this.transport();
      const config = this.config();
      const message = this.message({ name: 'Equipe EA (teste)', email: config.username, student }, `teste-${Date.now()}`);
      message.subject = `[TESTE] ${message.subject}`;
      const result = await transport.sendMail(message);
      if (!result.accepted?.length) throw new Error('O SMTP não confirmou o destinatário de teste.');
      this.error = '';
    } catch (error) {
      this.error = smtpError(error);
      throw new Error(this.error);
    } finally { transport?.close(); this.busy = false; }
  }

  retry(id) {
    if (this.busy) throw new Error('Aguarde o envio atual terminar.');
    const row = this.store.one("SELECT id FROM email_outbox WHERE id = ? AND status IN ('pending', 'uncertain', 'failed')", [id]);
    if (!row) throw new Error('Este e-mail não pode ser reenviado.');
    this.store.transaction(() => this.store.db.run("UPDATE email_outbox SET status = 'pending', attempts = 0, next_attempt = 0, last_error = '' WHERE id = ?", [id]));
  }

  suppress(id) {
    if (this.busy) throw new Error('Aguarde o envio atual terminar para interromper o contato.');
    const row = this.store.one('SELECT email FROM email_outbox WHERE id = ?', [id]);
    if (!row) throw new Error('E-mail não encontrado.');
    this.store.transaction(() => {
      this.store.db.run('INSERT OR IGNORE INTO email_suppressions VALUES (?, ?)', [row.email, new Date().toISOString()]);
      this.store.db.run("UPDATE email_outbox SET status = 'cancelled', last_error = 'Contato interrompido pela equipe.' WHERE email = ? AND status != 'sent'", [row.email]);
      for (const game of this.store.all('SELECT id, lead FROM games')) {
        const lead = JSON.parse(game.lead);
        if (lead.email !== row.email || !lead.marketing) continue;
        this.store.db.run('UPDATE games SET lead = ?, version = version + 1 WHERE id = ?', [JSON.stringify({ ...lead, marketing: false }), game.id]);
        this.store.queue(game.id);
      }
    });
  }

  async process() {
    if (this.busy || !this.config().enabled) return;
    this.busy = true;
    let row;
    let transport;
    let attempted = false;
    try {
      row = this.store.one(`SELECT e.*, g.lead, g.status AS game_status FROM email_outbox e
        JOIN games g ON g.id = e.id WHERE e.status = 'pending' AND e.next_attempt <= ? ORDER BY e.rowid LIMIT 1`, [Date.now()]);
      if (!row) return;
      const lead = JSON.parse(row.lead);
      if (!lead.marketing || row.game_status === 'cancelled' || this.store.one('SELECT email FROM email_suppressions WHERE email = ?', [row.email])) {
        this.store.transaction(() => this.store.db.run("UPDATE email_outbox SET status = 'cancelled' WHERE id = ?", [row.id]));
        return;
      }
      const message = this.message(lead, row.id);
      this.store.transaction(() => this.store.db.run("UPDATE email_outbox SET status = 'sending', attempts = attempts + 1 WHERE id = ?", [row.id]));
      transport = this.transport();
      attempted = true;
      const result = await transport.sendMail(message);
      if (!result.accepted?.length) throw new Error('O SMTP não confirmou o destinatário.');
      this.store.transaction(() => this.store.db.run("UPDATE email_outbox SET status = 'sent', sent_at = ?, last_error = '' WHERE id = ?", [new Date().toISOString(), row.id]));
      this.error = '';
    } catch (error) {
      this.error = smtpError(error);
      if (row) {
        const safeToRetry = !attempted || ['EAUTH', 'EDNS', 'ECONNECTION', 'EENVELOPE'].includes(error.code) ||
          error.command === 'CONN' || (Number.isInteger(error.responseCode) && error.responseCode >= 400 && error.responseCode < 600);
        const status = !safeToRetry ? 'uncertain' : row.attempts >= 7 ? 'failed' : 'pending';
        const detail = status === 'uncertain' ? `${this.error} Entrega incerta: verifique antes de reenviar para evitar duplicidade.` : this.error;
        this.store.transaction(() => this.store.db.run('UPDATE email_outbox SET status = ?, last_error = ?, next_attempt = ? WHERE id = ?', [
          status, detail, Date.now() + Math.min(60 * 60 * 1000, 60000 * 2 ** row.attempts), row.id
        ]));
      }
      console.error(this.error);
    } finally { transport?.close(); this.busy = false; }
  }
}

module.exports = { EmailDelivery };

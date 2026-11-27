const { app, BrowserWindow, ipcMain, dialog, powerSaveBlocker, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { Store, csv } = require('./store.cjs');
const { EmailDelivery } = require('./email.cjs');

let store;
let emails;
let window;
let adminToken = '';
let adminExpires = 0;
let loginFailures = 0;
let loginBlockedUntil = 0;
let syncing = false;
let syncError = '';

app.setAppUserModelId('br.com.estheticaligner.memoria');

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { window.show(); window.focus(); } });
  app.whenReady().then(start).catch(error => {
    dialog.showErrorBox('Não foi possível iniciar o Jogo da Memória EA', error.message);
    app.quit();
  });
}

async function sync() {
  if (syncing || !store.setting('cloudUrl')) return;
  syncing = true;
  try {
    let records = store.pendingRecords();
    while (records.length) {
      const response = await fetch(`${store.setting('cloudUrl')}/api/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${store.setting('cloudKey')}` },
        body: JSON.stringify({ deviceId: store.setting('deviceId'), records }),
        signal: AbortSignal.timeout(20000),
        redirect: 'error'
      });
      if (!response.ok) throw new Error(`O servidor respondeu HTTP ${response.status}. Confira a URL e a chave.`);
      const receipt = await response.json();
      if (receipt.accepted !== records.length) throw new Error('O servidor não confirmou todos os registros. A fila foi preservada.');
      store.acknowledge(records);
      records = store.pendingRecords();
    }
    syncError = '';
  } catch (error) {
    syncError = `Sincronização pendente: ${error.message}. Os dados continuam salvos neste computador.`;
    console.error(syncError);
  } finally { syncing = false; }
}

async function start() {
  store = await Store.open(path.join(app.getPath('userData'), 'ea-congresso.sqlite'));
  emails = new EmailDelivery(store, {
    encrypt(password) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('O Windows não disponibilizou a proteção da senha. Não foi possível salvar.');
      return safeStorage.encryptString(password).toString('base64');
    },
    decrypt(encrypted) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('A proteção de senha do Windows não está disponível.');
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
    }
  });
  const processEmails = () => emails.process().catch(error => {
    emails.error = `Não foi possível atualizar a fila de e-mails: ${error.message}`;
    console.error(emails.error);
  });
  window = new BrowserWindow({
    width: 720, height: 1100, minWidth: 480, minHeight: 700,
    fullscreen: app.isPackaged, autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    title: 'Jogo da Memória EA', backgroundColor: '#f7f9f9',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F11' && input.type === 'keyDown') { event.preventDefault(); window.setFullScreen(!window.isFullScreen()); }
  });
  ipcMain.handle('ea:call', async (event, action, data = {}) => {
    try {
      if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Origem não autorizada.');
      if (typeof action !== 'string') throw new Error('Ação inválida.');
      const adminActions = ['admin', 'prize.add', 'prize.stock', 'prize.remove', 'game.cancel', 'game.deliver', 'cloud', 'sync', 'export', 'backup', 'fullscreen', 'quit', 'email.configure', 'email.test', 'email.retry', 'email.suppress'];
      if (adminActions.includes(action) && (!adminToken || data.token !== adminToken || Date.now() > adminExpires)) throw new Error('Acesso administrativo expirado. Entre novamente.');
      if (adminActions.includes(action)) adminExpires = Date.now() + 15 * 60 * 1000;
      let result;
      switch (action) {
        case 'info': result = store.publicInfo(); break;
        case 'setup': store.setup(data.password, data.contact); result = true; break;
        case 'login':
          if (Date.now() < loginBlockedUntil) throw new Error('Aguarde um minuto antes de tentar novamente.');
          if (!store.authenticate(data.password)) {
            if (++loginFailures >= 5) { loginBlockedUntil = Date.now() + 60000; loginFailures = 0; }
            throw new Error('Senha incorreta.');
          }
          loginFailures = 0; adminToken = randomUUID(); adminExpires = Date.now() + 15 * 60 * 1000; result = adminToken; break;
        case 'logout': adminToken = ''; result = true; break;
        case 'start': result = store.start(data); break;
        case 'flip': result = store.flip(data.id, data.index); break;
        case 'game': result = store.gameView(data.id); break;
        case 'admin': result = { ...store.adminInfo(), syncError, syncing, emails: emails.info() }; break;
        case 'email.configure': emails.configure(data); result = true; break;
        case 'email.test': await emails.test(data.student); result = true; break;
        case 'email.retry': emails.retry(data.id); result = true; break;
        case 'email.suppress': emails.suppress(data.id); result = true; break;
        case 'prize.add': store.addPrize(data); result = true; break;
        case 'prize.stock': store.addStock(data.id, data.quantity); result = true; break;
        case 'prize.remove': store.removeStock(data.id); result = true; break;
        case 'game.cancel': store.cancel(data.id); result = true; break;
        case 'game.deliver': store.deliver(data.id); result = true; break;
        case 'cloud': store.configureCloud(data.url, data.key); await sync(); result = true; break;
        case 'sync': await sync(); if (syncError) throw new Error(syncError); result = true; break;
        case 'export': {
          const output = await dialog.showSaveDialog(window, { defaultPath: `leads-ea-${new Date().toISOString().slice(0, 10)}.csv`, filters: [{ name: 'CSV', extensions: ['csv'] }] });
          if (!output.canceled && output.filePath) fs.writeFileSync(output.filePath, csv(store.records()), 'utf8');
          result = !output.canceled; break;
        }
        case 'backup': {
          const output = await dialog.showSaveDialog(window, { defaultPath: `backup-ea-${new Date().toISOString().slice(0, 10)}.sqlite` });
          if (!output.canceled && output.filePath) fs.copyFileSync(store.file, output.filePath);
          result = !output.canceled; break;
        }
        case 'fullscreen': window.setFullScreen(!window.isFullScreen()); result = true; break;
        case 'quit': app.quit(); return { ok: true, data: true };
        default: throw new Error('Ação desconhecida.');
      }
      return { ok: true, data: result };
    } catch (error) {
      return { ok: false, error: error.issues ? error.issues.map(issue => issue.message).join(' ') : error.message };
    }
  });
  powerSaveBlocker.start('prevent-display-sleep');
  await window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  setInterval(sync, 30000).unref();
  setInterval(processEmails, 30000).unref();
  void sync();
  void processEmails();
}

app.on('window-all-closed', () => app.quit());

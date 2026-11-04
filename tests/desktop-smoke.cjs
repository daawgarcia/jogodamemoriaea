const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const directory = process.env.EA_SMOKE_DIR;
if (!directory) throw new Error('Execute o teste pelo comando npm run test:desktop.');
app.setPath('userData', directory);
let exitCode = 1;
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

app.on('browser-window-created', (_event, window) => {
  window.webContents.once('did-finish-load', async () => {
    try {
      const call = (action, data) => window.webContents.executeJavaScript(`window.ea.call(${JSON.stringify(action)}, ${JSON.stringify(data)})`);
      const info = await call('info');
      assert.equal(info.ok, true);
      assert.equal(info.data.configured, false);
      assert.equal((await call('admin', { token: 'invalid' })).ok, false);
      assert.equal((await call('setup', { password: 'senha-de-teste-segura', contact: 'teste@example.com' })).ok, true);
      const login = await call('login', { password: 'senha-de-teste-segura' });
      assert.equal(login.ok, true);
      const token = login.data;
      assert.equal((await call('prize.add', { token, name: 'Kit EA Teste', quantity: 2 })).ok, true);
      await window.webContents.reload();
      await new Promise(resolve => window.webContents.once('did-finish-load', resolve));
      window.setContentSize(1080, 1920);
      await wait(300);
      const welcome = await window.webContents.executeJavaScript(`({
        title: document.querySelector('h1')?.textContent,
        width: innerWidth, height: innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        nodeAvailable: typeof require !== 'undefined'
      })`);
      assert.match(welcome.title, /Memória EA/);
      assert.equal(welcome.nodeAvailable, false);
      assert.equal(welcome.scrollWidth, welcome.width);
      assert.equal(welcome.scrollHeight, welcome.height);
      await window.webContents.executeJavaScript(`document.querySelector('.start-button').click()`);
      await wait(100);
      await window.webContents.executeJavaScript(`document.querySelector('input').focus()`);
      await wait(100);
      await window.webContents.executeJavaScript(`document.querySelector('.touch-keyboard .key-row button').click()`);
      assert.equal(await window.webContents.executeJavaScript(`document.querySelector('input').value`), 'q');
      await window.webContents.executeJavaScript(`document.querySelector('.keyboard-heading button').click()`);
      assert.equal(await window.webContents.executeJavaScript(`document.querySelector('.touch-keyboard') === null`), true);
      const started = await call('start', {
        name: 'Teste Electron', email: 'electron@example.com', whatsapp: '11999998888',
        city: 'São Paulo / SP', student: true, cro: '', acknowledged: true, marketing: false
      });
      assert.equal(started.ok, true);
      const id = started.data.id;
      await window.webContents.reload();
      await new Promise(resolve => window.webContents.once('did-finish-load', resolve));
      await wait(300);
      const layout = await window.webContents.executeJavaScript(`({
        cards: document.querySelectorAll('.memory-card').length,
        columns: getComputedStyle(document.querySelector('.memory-grid')).gridTemplateColumns.split(' ').length,
        width: innerWidth, height: innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        bottom: document.querySelector('.memory-grid').getBoundingClientRect().bottom
      })`);
      console.log('Layout TV:', JSON.stringify(layout));
      assert.equal(layout.cards, 8);
      assert.equal(layout.columns, 2);
      assert.equal(layout.scrollWidth, layout.width);
      assert.equal(layout.scrollHeight, layout.height);
      assert.ok(layout.bottom < layout.height);
      const cardFiles = require('../shared/cards.json').map(card => `./cards/${card.image}`);
      const loadedPhotos = await window.webContents.executeJavaScript(`Promise.all(${JSON.stringify(cardFiles)}.map(src => new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => reject(new Error('Foto ausente: ' + src));
        img.src = src;
      })))`);
      assert.equal(loadedPhotos.length, 4);
      assert.ok(loadedPhotos.every(photo => photo.width > 0 && photo.height > 0 && Math.max(photo.width, photo.height) <= 1280));
      for (const [width, height] of [[768, 1366], [720, 1280], [480, 854]]) {
        window.webContents.enableDeviceEmulation({
          screenPosition: 'mobile', screenSize: { width, height },
          viewSize: { width, height }, deviceScaleFactor: 1, scale: 1
        });
        for (let attempt = 0; attempt < 30; attempt++) {
          await wait(100);
          const viewport = await window.webContents.executeJavaScript(`({ width: innerWidth, height: innerHeight })`);
          if (Math.abs(viewport.width - width) <= 2 && Math.abs(viewport.height - height) <= 2) break;
        }
        const responsive = await window.webContents.executeJavaScript(`({
          width: innerWidth, height: innerHeight,
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
          bottom: document.querySelector('.memory-grid').getBoundingClientRect().bottom,
          cardHeight: document.querySelector('.memory-card').getBoundingClientRect().height
        })`);
        console.log('Layout responsivo:', JSON.stringify(responsive));
        assert.ok(Math.abs(responsive.width - width) <= 2, `Largura esperada ${width}, recebida ${responsive.width}`);
        assert.ok(Math.abs(responsive.height - height) <= 2, `Altura esperada ${height}, recebida ${responsive.height}`);
        assert.equal(responsive.scrollWidth, responsive.width);
        assert.equal(responsive.scrollHeight, responsive.height);
        assert.ok(responsive.bottom < responsive.height);
        assert.ok(responsive.cardHeight >= 48);
      }
      await call('flip', { id, index: 0 });
      await window.webContents.reload();
      await new Promise(resolve => window.webContents.once('did-finish-load', resolve));
      await wait(200);
      const photoStyle = await window.webContents.executeJavaScript(`({
        fit: getComputedStyle(document.querySelector('.card-front .product-photo img')).objectFit,
        loaded: document.querySelector('.card-front .product-photo img').naturalWidth > 0,
        width: document.querySelector('.card-front .product-photo img').getBoundingClientRect().width,
        containerWidth: document.querySelector('.card-front .product-photo').getBoundingClientRect().width,
        height: document.querySelector('.card-front .product-photo img').getBoundingClientRect().height,
        containerHeight: document.querySelector('.card-front .product-photo').getBoundingClientRect().height
      })`);
      assert.equal(photoStyle.fit, 'contain');
      assert.equal(photoStyle.loaded, true);
      assert.ok(photoStyle.width <= photoStyle.containerWidth + 1);
      assert.ok(photoStyle.height <= photoStyle.containerHeight + 1);
      const faces = new Map();
      const matched = new Set();
      while (matched.size < 8) {
        const first = Array.from({ length: 8 }, (_, i) => i).find(i => !matched.has(i));
        const firstResult = await call('flip', { id, index: first });
        assert.equal(firstResult.ok, true);
        const face = firstResult.data.cards[first].face;
        faces.set(first, face);
        const known = [...faces.entries()].find(([index, value]) => index !== first && !matched.has(index) && value === face);
        let found = false;
        const candidates = known ? [known[0]] : Array.from({ length: 8 }, (_, i) => i).filter(i => i !== first && !matched.has(i));
        for (const second of candidates) {
          await call('flip', { id, index: first });
          const result = await call('flip', { id, index: second });
          assert.equal(result.ok, true);
          faces.set(second, result.data.cards[second].face);
          if (result.data.cards[second].matched) { matched.add(first); matched.add(second); found = true; break; }
          await wait(1150);
        }
        assert.equal(found, true);
      }
      const result = await call('game', { id });
      assert.equal(result.data.status, 'won');
      assert.equal(result.data.prize, 'Kit EA Teste');
      const admin = await call('admin', { token });
      assert.equal(admin.data.records.length, 1);
      assert.equal(admin.data.prizes[0].available, 1);
      assert.equal(admin.data.pending, 1);
      assert.ok(fs.statSync(path.join(directory, 'ea-congresso.sqlite')).size > 0);
      console.log('PASS: Electron real, teclado touch, preload isolado, IPC autenticado, banco local, retomada, quatro resoluções verticais, grade 2x4 e vitória.');
      exitCode = 0;
    } catch (error) {
      console.error('FAIL:', error);
    } finally { app.exit(exitCode); }
  });
});

setTimeout(() => { console.error('FAIL: tempo limite do teste Electron.'); app.exit(1); }, 90000).unref();
require('../desktop/main.cjs');

const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const L = require('../core.js');
const G = require('../drive-store.js');
const localKey = 'minimalist-ledger-v1';
const clientId = '123456789-test.apps.googleusercontent.com';
const accountKey = localKey + '-drive-' + clientId + '-A';
const data = savings => ({ ...L.initial(), savings });

function browser({ local = new Map([[localKey, JSON.stringify(data(123))]]), session = new Map(), remote = new Map() } = {}) {
  const elements = new Map(), events = new Map(), exports = [];
  const storage = map => ({ getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) });
  const element = () => ({ open: false, textContent: '', innerHTML: '', value: '', classList: { toggle() {} }, setAttribute() {}, addEventListener() {}, querySelectorAll: () => [], close() { this.open = false; } });
  let userId = 'A', listener = () => {}, readGate, saveGate, fail = false;
  const window = { navigator: { onLine: true }, addEventListener: (name, fn) => events.set(name, fn) };
  const connection = {
    signIn: async () => ({ user: { uid: userId, email: userId + '@example.test' } }),
    signOut: async () => listener(null),
    observe(fn) { listener = fn; return () => { listener = () => {}; }; },
    store(user) {
      return {
        uid: user.uid, projectId: clientId, revision: undefined,
        accept(snapshot) { this.revision = snapshot.revision; },
        async read() {
          if (readGate) await readGate;
          if (fail) throw Error('offline');
          return remote.get(user.uid) || { revision: '', data: null };
        },
        async save(book) {
          if (saveGate) await saveGate;
          if (fail) throw Error('offline');
          const latest = remote.get(user.uid) || { revision: '', data: null };
          if (JSON.stringify(book) === JSON.stringify(latest.data)) { this.revision = latest.revision; return; }
          if (latest.revision !== this.revision) throw Error('另一裝置已更新帳目');
          this.revision = String(Number(latest.revision) + 1);
          remote.set(user.uid, { revision: this.revision, data: book });
        }
      };
    }
  };
  const context = vm.createContext({
    Ledger: L, DailyLedger: require('../daily.js'), LedgerInsights: require('../insights.js'), GoogleLedger: G, connection, exports,
    document: { querySelector(key) { if (!elements.has(key)) elements.set(key, element()); return elements.get(key); } },
    localStorage: storage(local), sessionStorage: storage(session), window, Intl, Date, JSON, Error, setTimeout, clearTimeout, confirm: () => true
  });
  const run = code => vm.runInContext(code, context);
  for (const file of ['../app.js', '../google-sync.js']) run(fs.readFileSync(require.resolve(file), 'utf8'));
  run('googleConnection=connection;download=contents=>exports.push(contents)');
  return {
    run, local, session, remote, exports, events, elements, window, login: () => run('loginGoogle()'),
    change: amount => run('commit({...state,savings:'+amount+'});clearTimeout(googleTimer)'),
    amount: () => run('state.savings'), user: id => { userId = id; }, fail: value => { fail = value; },
    gateRead: promise => { readGate = promise; }, gateSave: promise => { saveGate = promise; }, expire: () => listener(null)
  };
}

test('首次登入空白 Drive 後第一次儲存自動上傳，原本帳本獨立', async () => {
  const tab = browser();
  await tab.login();
  assert.equal(tab.amount(), null);
  assert.equal(tab.run('googleAuto'), true);
  tab.change(10);
  await tab.run('flushGoogle()');
  assert.equal(tab.remote.get('A').data.savings, 10);
  assert.equal(JSON.parse(tab.local.get(localKey)).savings, 123);
});

test('關閉分頁前尚未上傳的金額，重開並登入同一帳號後接續同步', async () => {
  const first = browser();
  await first.login();
  first.change(10);
  await first.run('flushGoogle()');
  first.change(20);
  assert.equal(first.remote.get('A').data.savings, 10);
  assert.equal(JSON.parse(first.local.get(accountKey)).savings, 20);
  const reopened = browser({ local: first.local, remote: first.remote });
  assert.equal(reopened.session.size, 0);
  assert.equal(reopened.amount(), 123);
  await reopened.login();
  assert.equal(reopened.amount(), 20);
  assert.equal(reopened.remote.get('A').data.savings, 20);
});

test('網路請求失敗後，online 事件補傳保存在本機的帳目', async () => {
  const tab = browser();
  await tab.login();
  tab.fail(true);
  tab.change(30);
  await tab.run('flushGoogle()');
  assert.equal(tab.run('googleAuto'), false);
  assert.equal(tab.remote.has('A'), false);
  assert.equal(JSON.parse(tab.local.get(accountKey)).savings, 30);
  tab.fail(false);
  await tab.events.get('online')();
  assert.equal(tab.remote.get('A').data.savings, 30);
});

test('首次 Drive 讀取失敗後新增帳目，重連遇到既有雲端時保留兩邊', async () => {
  const tab = browser({ remote: new Map([['A', { revision: '1', data: data(10) }]]) });
  tab.fail(true);
  await tab.login();
  tab.change(20);
  tab.fail(false);
  await tab.events.get('online')();
  assert.equal(tab.amount(), 20);
  assert.equal(tab.remote.get('A').data.savings, 10);
  assert.match(tab.elements.get('#googleStatus').textContent, /未同步帳目/);
});

test('登出後本機仍保留待同步資料，另一個登入帳號看不到它', async () => {
  const tab = browser();
  await tab.login();
  tab.change(40);
  await tab.run('logoutGoogle()');
  assert.equal(JSON.parse(tab.local.get(accountKey)).savings, 40);
  assert.equal(tab.amount(), 123);
  tab.user('B');
  await tab.login();
  assert.equal(tab.amount(), null);
  await tab.run('logoutGoogle()');
  tab.user('A');
  await tab.login();
  assert.equal(tab.amount(), 40);
  assert.equal(tab.remote.get('A').data.savings, 40);
});

test('仍開著的舊分頁帳目升級後移入本機，基準不變才補傳', async () => {
  const tab = browser({
    session: new Map([[accountKey, JSON.stringify(data(99))], [accountKey+'-sync', JSON.stringify({revision:'1',synced:JSON.stringify(data(10))})]]),
    remote: new Map([['A', { revision: '1', data: data(10) }]])
  });
  await tab.login();
  assert.equal(tab.amount(), 99);
  assert.equal(JSON.parse(tab.local.get(accountKey)).savings, 99);
  assert.equal(tab.remote.get('A').data.savings, 99);
});

test('本機與舊分頁已有不同版本時，舊分頁另供匯出', async () => {
  const tab = browser({
    local: new Map([[accountKey, JSON.stringify(data(77))]]),
    session: new Map([[accountKey, JSON.stringify(data(99))]]),
    remote: new Map([['A', { revision: '1', data: data(10) }]])
  });
  await tab.login();
  assert.equal(tab.amount(), 77);
  assert.equal(tab.elements.get('#googleRecover').hidden, false);
  tab.elements.get('#googleRecover').onclick();
  assert.equal(JSON.parse(tab.exports[0]).savings, 99);
});

test('雲端已被另一台裝置修改，不覆蓋重開後的待同步帳目', async () => {
  const first = browser();
  await first.login();
  first.change(10);
  await first.run('flushGoogle()');
  first.change(20);
  first.remote.set('A', { revision: '2', data: data(90) });
  const next = browser({ local: first.local, remote: first.remote });
  await next.login();
  assert.equal(next.amount(), 20);
  assert.equal(next.remote.get('A').data.savings, 90);
  assert.match(next.elements.get('#googleStatus').textContent, /另一裝置/);
});

test('已同步的本機帳目比 Drive 回傳版本新時，重開不自動倒退', async () => {
  const first = browser();
  await first.login();
  first.change(60);
  await first.run('flushGoogle()');
  first.remote.set('A', { revision: 'stale', data: data(10), extendsLocal: false });
  const next = browser({ local: first.local, remote: first.remote });
  await next.login();
  assert.equal(next.amount(), 60);
  assert.match(next.elements.get('#googleStatus').textContent, /歷史不一致/);
});

test('上傳途中再記一筆，已上傳的快照不會標成最新本機版本', async () => {
  const tab = browser();
  await tab.login();
  tab.change(10);
  let release;
  tab.gateSave(new Promise(resolve => { release = resolve; }));
  const uploading = tab.run('flushGoogle()');
  tab.change(20);
  release();
  await uploading;
  tab.run('clearTimeout(googleTimer)');
  assert.equal(tab.remote.get('A').data.savings, 10);
  assert.equal(JSON.parse(tab.local.get(accountKey)).savings, 20);
  assert.equal(tab.run('googleDirty()'), true);
  await tab.run('flushGoogle()');
  assert.equal(tab.remote.get('A').data.savings, 20);
});

test('讀取雲端期間更改本機或開啟編輯表單時保留本機', async () => {
  const tab = browser();
  await tab.login();
  tab.change(10);
  await tab.run('flushGoogle()');
  tab.remote.set('A', { revision: '2', data: data(90) });
  let release;
  tab.gateRead(new Promise(resolve => { release = resolve; }));
  const pending = tab.run('pullGoogle(false)');
  tab.change(20);
  release();
  await pending;
  assert.equal(tab.amount(), 20);
  assert.match(tab.elements.get('#googleStatus').textContent, /已儲存本機變更/);
  tab.gateRead(new Promise(resolve => { release = resolve; }));
  const pendingAgain = tab.run('pullGoogle(false)');
  tab.run('$("#editor").open=true');
  release();
  await pendingAgain;
  assert.equal(tab.amount(), 20);
  assert.match(tab.elements.get('#googleStatus').textContent, /編輯視窗/);
});

test('登入失效後，延遲的雲端回應不能回填另一個帳本', async () => {
  const tab = browser();
  await tab.login();
  let release;
  tab.gateRead(new Promise(resolve => { release = resolve; }));
  const pending = tab.run('pullGoogle(false)');
  tab.expire();
  release();
  await pending;
  assert.equal(tab.run('googleMode'), false);
  assert.equal(tab.amount(), 123);
});

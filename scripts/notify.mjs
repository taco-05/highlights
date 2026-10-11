// 7時・11時・16時(日本時間)に、前回のお知らせ以降に増えた試合をまとめて通知する。
// 30分ごとの自動更新のたびに呼ばれ、お知らせの時刻を過ぎていて、まだ送っていなければ送る(自動更新が遅れても取りこぼさない)。
// 使い方: VAPID_PRIVATE_KEY=... PUSH_SUBSCRIPTION=... node scripts/notify.mjs
//   NOTIFY_TEST=true のときは、時刻に関係なくテスト通知を1通送るだけ(記録は変えない)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vapidKey, sendPush } from './webpush.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE_URL = 'https://taco-05.github.io/highlights/';
const SLOTS_JST = [7, 11, 16];
const JST = 9 * 3600000;
const STATE_FILE = path.join(ROOT, 'state/notify.json');

const now = Date.now();
const test = process.env.NOTIFY_TEST === 'true';

// 直近の「お知らせ時刻」(今より前で一番新しいもの)
function latestSlot(t) {
  const j = new Date(t + JST);
  const midnight = Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate()) - JST;
  for (const back of [0, 1]) {
    for (const h of [...SLOTS_JST].reverse()) {
      const s = midnight - back * 86400000 + h * 3600000;
      if (s <= t) return s;
    }
  }
}

const readGlobal = (file, name) => {
  const window = {};
  new Function('window', fs.readFileSync(file, 'utf8'))(window);
  return window[name];
};
const data = readGlobal(path.join(ROOT, 'site/data.js'), 'HIGHLIGHTS');
const publicKey = readGlobal(path.join(ROOT, 'site/push-config.js'), 'PUSH_PUBLIC_KEY');
const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {};

// 通知の対象(config/notify.json)。teams が空なら全試合
const rule = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/notify.json'), 'utf8'));
const wanted = (m) =>
  !rule.teams.length ||
  rule.teams.includes(m.home.id) || rule.teams.includes(m.away.id) ||
  (rule.japanesePlayers && m.jp.length > 0);

const subscriptions = (process.env.PUSH_SUBSCRIPTION || '')
  .split('\n').map((s) => s.trim()).filter(Boolean)
  .flatMap((s) => { try { return [JSON.parse(s)]; } catch { console.log('通知先の登録コードが読めませんでした(コピーし直してください)'); return []; } });

async function sendAll(payload) {
  if (!subscriptions.length) { console.log('通知先がまだ登録されていません'); return; }
  if (!process.env.VAPID_PRIVATE_KEY) { console.log('通知用の秘密鍵がありません'); return; }
  const keyObject = vapidKey(publicKey, process.env.VAPID_PRIVATE_KEY);
  for (const sub of subscriptions) {
    const r = await sendPush(sub, payload, { publicKey, keyObject, subject: SITE_URL });
    const where = new URL(sub.endpoint).host;
    if (r.status >= 200 && r.status < 300) console.log(`送信OK (${where})`);
    else if (r.status === 404 || r.status === 410) console.log(`通知先が無効になっています。サイトの🔔から登録し直してください (${where} ${r.status})`);
    else console.log(`送信できませんでした (${where} ${r.status} ${r.text})`);
  }
}

// 通知の文面: チーム名だけ(結果は書かない)
function message(matches) {
  const lines = matches.slice(0, 4).map((m) => `${m.home.name} vs ${m.away.name}${m.jp.length ? ' 🇯🇵' : ''}`);
  if (matches.length > 4) lines.push(`ほか${matches.length - 4}試合`);
  return { title: `ハイライトが${matches.length}試合届きました`, body: lines.join('\n'), url: SITE_URL };
}

if (test) {
  await sendAll({ title: '通知のテストです', body: `いま${data.matches.length}試合のハイライトがあります`, url: SITE_URL });
  process.exit(0);
}

const slot = latestSlot(now);
if (state.lastSlot && Date.parse(state.lastSlot) >= slot) {
  console.log('お知らせの時刻ではありません');
  process.exit(0);
}

const ids = data.matches.map((m) => m.id);
if (!state.notified) {
  // 初回は今ある試合を「お知らせ済み」として記録するだけ(いきなり大量に届かないように)
  console.log(`初回のため記録だけしました(${ids.length}試合)`);
} else {
  // 対象外のチームの新着は、通知せずに「お知らせ済み」として記録だけする
  const fresh = data.matches.filter((m) => !state.notified.includes(m.id) && wanted(m));
  console.log(`お知らせ時刻 ${new Date(slot + JST).toISOString().slice(5, 16).replace('T', ' ')}: 通知対象の新着 ${fresh.length}試合`);
  if (fresh.length) await sendAll(message(fresh));
}

fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
fs.writeFileSync(STATE_FILE, JSON.stringify({ lastSlot: new Date(slot).toISOString(), notified: ids }, null, 1) + '\n');

// タイトルで分からなかった日本人選手の出場を、YouTubeのコメントから補う(100%ではない、補足のための判定)。
// 自動更新で、コメント取得(fetch-comments.mjs)のあとに呼ぶ。site/data.js の jp を書き足す。
//
// 1. 所属クラブを自動で覚える: タイトルでJPNが付いた試合を state/jp-clubs.json に記録し、
//    最近60日で2試合以上出ているチームを、その選手の所属クラブとみなす(移籍しても新しいチームの試合が増えれば切り替わる)
// 2. タイトルにない選手のうち、所属クラブがその試合のどちらかのチームの選手だけを対象に、
//    「出場したと読めるコメント」(名前のすぐ後ろがプレーへの感想で、否定の言い回しがない)が2件以上あればJPNを付ける
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_FILE = path.join(ROOT, 'site/data.js');
const STATE_FILE = path.join(ROOT, 'state/jp-clubs.json');
const REVIEW_FILE = path.join(ROOT, 'review.json');
const KEEP_DAYS = 60;
const MIN_COMMENTS = 2;

const POS = /ゴール|得点|決め|アシスト|ナイス|良かった|よかった|良い|いい|上手|うま|最高|素晴らし|すご|凄|キレ|ドリブル|守備|パス|クロス|シュート|セーブ|入って|投入|交代|出場|先発|スタメン|活躍|躍動|輝|仕掛|突破|頑張|がんば|効いて|存在感|惜し|おしい|起点|好プレー|調子|動き|ボール奪|カバー|ヘディング/;
const NEG = /出せ|出して|出さ|使え|使って|使わ|出番|ベンチ|いない|居ない|いなかった|出てない|出なかった|出場しなかった|出場なし|出てれば|出ていれば|かと思っ|思ったら|欠場|怪我|ケガ|負傷|メンバー外|見たかった|ほしい|欲しい|待って|いれば|居れば|戻って|復帰|移籍|代表で|代表戦|来季|来年|昔|去年|前節|先週|みたいな/;

const window = {};
new Function('window', fs.readFileSync(DATA_FILE, 'utf8'))(window);
const data = window.HIGHLIGHTS;
const jpCfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/japanese-players.json'), 'utf8'));
const names = new Set(jpCfg.names);
const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : { players: {} };
const now = Date.now();

// ---- 1. 所属クラブを覚える(タイトルでJPNが付いた試合から) ----
const teamIds = (m) => [m.home.id, m.away.id].filter(Boolean);
let changed = false;
for (const m of data.matches) {
  for (const n of m.jp) {
    if (!names.has(n) || !teamIds(m).length) continue;
    const obs = (state.players[n] ||= []);
    if (obs.some((o) => o.match === m.id)) continue;
    obs.push({ match: m.id, date: m.publishedAt.slice(0, 10), teams: teamIds(m) });
    changed = true;
  }
}
for (const [n, obs] of Object.entries(state.players)) {
  const kept = obs.filter((o) => now - Date.parse(o.date) < KEEP_DAYS * 86400000);
  if (kept.length !== obs.length) { state.players[n] = kept; changed = true; }
  if (!kept.length) delete state.players[n];
}
const clubOf = (n) => {
  const count = {};
  for (const o of state.players[n] || []) for (const t of o.teams) count[t] = (count[t] || 0) + 1;
  const [best, second] = Object.entries(count).sort((a, b) => b[1] - a[1]);
  return best && best[1] >= 2 && (!second || second[1] < best[1]) ? best[0] : null;
};
const clubs = {};
for (const n of Object.keys(state.players)) { const c = clubOf(n); if (c) clubs[n] = c; }

// ---- 2. コメントから補う ----
const keys = [...jpCfg.names.map((n) => [n, n]), ...Object.entries(jpCfg.surnames), ...Object.entries(jpCfg.variants)];
const noJp = (m) => m.group === 'j1' || m.group === 'national' || ['ACLE', 'ACL2'].includes(m.compShort);
const added = [];
for (const m of data.matches) {
  if (noJp(m)) continue;
  const candidates = Object.entries(clubs).filter(([n, c]) => teamIds(m).includes(c) && !m.jp.includes(n)).map(([n]) => n);
  if (!candidates.length) continue;
  const file = path.join(ROOT, 'site/comments', `${m.id}.json`);
  if (!fs.existsSync(file)) continue;
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (d.disabled) continue;
  const texts = [...new Set([...(d.top || []), ...(d.new || [])].map((c) => c.t))];
  for (const n of candidates) {
    const myKeys = keys.filter(([, full]) => full === n).map(([k]) => k);
    const hits = texts.filter((t) => myKeys.some((k) => {
      const i = t.indexOf(k);
      if (i < 0) return false;
      const after = t.slice(i + k.length, i + k.length + 18);
      const around = t.slice(Math.max(0, i - 6), i + k.length + 18);
      return POS.test(after) && !NEG.test(around) && !(t.length < 40 && NEG.test(t));
    }));
    if (hits.length >= MIN_COMMENTS) {
      m.jp.push(n);
      added.push({ match: `${m.home.name}×${m.away.name}`, name: n, comments: hits.length, examples: hits.slice(0, 2).map((t) => t.slice(0, 60)) });
    }
  }
}

fs.writeFileSync(DATA_FILE, `window.HIGHLIGHTS = ${JSON.stringify(data, null, 1)};\n`);
if (changed) fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 1) + '\n');
// AIの点検用に、コメントから足した選手と根拠のコメント例を残す(画面には出さない)
if (fs.existsSync(REVIEW_FILE)) {
  const review = JSON.parse(fs.readFileSync(REVIEW_FILE, 'utf8'));
  review.jpFromComments = added;
  review.jpClubs = clubs;
  fs.writeFileSync(REVIEW_FILE, JSON.stringify(review, null, 2));
}
console.log(`所属が分かっている選手 ${Object.keys(clubs).length}人 / コメントから補った出場 ${added.length}件${added.length ? ': ' + added.map((a) => `${a.name}(${a.match})`).join('、') : ''}`);

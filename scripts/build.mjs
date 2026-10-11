// 集めたYouTubeの動画一覧から、対象チームのハイライトだけを選んでサイト用データを作る。
// 使い方: node scripts/build.mjs <YouTubeページを保存したフォルダ>
// ファイル名の先頭(dazn_ / unext_ / wowow_)で配信元を判別する。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rawDir = process.argv[2];
if (!rawDir) {
  console.error('使い方: node scripts/build.mjs <取得データのフォルダ>');
  process.exit(1);
}
const now = Date.now();

const teamsCfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/teams.json'), 'utf8'));
const jpCfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/japanese-players.json'), 'utf8'));

// 表記ゆれ吸収: 全角半角・中黒・イコール・空白などを取り除いて比べる
const norm = (s) => s.normalize('NFKC').replace(/[\s・･=.'’‐\-]/g, '').toLowerCase();

const aliasMap = new Map();
for (const t of teamsCfg.teams) for (const a of t.aliases) aliasMap.set(norm(a), t);
const aliasesLongestFirst = [...aliasMap.entries()].sort((a, b) => b[0].length - a[0].length);

const SOURCES = { dazn: 'DAZN', unext: 'U-NEXT', wowow: 'WOWOW' };

// 上から順に判定する(女子・親善試合などは除外)
const COMPS = [
  { re: /女子|WSL/, skip: true },
  { re: /プレシーズン|親善|フレンドリー/, skip: true },
  { re: /ブンデスリーガ\s*2部/, skip: true },
  { re: /UEFAスーパーカップ/, id: 'uefasuper', label: 'UEFAスーパーカップ', group: 'europe' },
  { re: /チャンピオンズリーグ/, id: 'cl', label: 'チャンピオンズリーグ', group: 'europe' },
  { re: /ヨーロッパリーグ/, id: 'el', label: 'ヨーロッパリーグ', group: 'europe' },
  { re: /カンファレンスリーグ/, id: 'ecl', label: 'カンファレンスリーグ', group: 'europe' },
  { re: /プレミアリーグ/, id: 'premier', label: 'プレミアリーグ', group: 'premier' },
  { re: /ラ・リーガ/, id: 'laliga', label: 'ラ・リーガ', group: 'laliga' },
  { re: /DFLスーパーカップ/, id: 'dflsuper', label: 'DFLスーパーカップ', group: 'cup' },
  { re: /ブンデスリーガ/, id: 'bundesliga', label: 'ブンデスリーガ', group: 'bundesliga' },
  { re: /リーグアン|リーグ・アン/, id: 'ligue1', label: 'リーグアン', group: 'ligue1' },
  { re: /セリエA/, id: 'seriea', label: 'セリエA', group: 'seriea' },
  { re: /エールディヴィジ/, id: 'eredivisie', label: 'エールディヴィジ', group: 'eredivisie' },
  { re: /ポルトガルリーグ|リーガ・ポルトガル/, id: 'portugal', label: 'ポルトガルリーグ', group: 'portugal' },
  { re: /ベルギーリーグ|ジュピラー/, id: 'belgium', label: 'ベルギーリーグ', group: 'belgium' },
  { re: /FAカップ/, id: 'facup', label: 'FAカップ', group: 'cup' },
  { re: /カラバオカップ|EFLカップ/, id: 'eflcup', label: 'カラバオカップ', group: 'cup' },
  { re: /コパ・デル・レイ/, id: 'copadelrey', label: 'コパ・デル・レイ', group: 'cup' },
  { re: /スーペルコパ/, id: 'supercopa', label: 'スーペルコパ', group: 'cup' },
  { re: /DFBポカール/, id: 'dfbpokal', label: 'DFBポカール', group: 'cup' },
  { re: /クープ・ドゥ・フランス/, id: 'cdf', label: 'クープ・ドゥ・フランス', group: 'cup' },
  { re: /コッパ・イタリア/, id: 'coppa', label: 'コッパ・イタリア', group: 'cup' },
  { re: /KNVB/, id: 'knvb', label: 'KNVBカップ', group: 'cup' },
  { re: /コミュニティ・シールド/, id: 'shield', label: 'コミュニティ・シールド', group: 'cup' },
];
const SEASON_RE = /2026[-/]27|26[-/]27/;
const NOT_HIGHLIGHT_RE = /ゴール集|プレー集|トピック|ふりかえり|振り返り|特集|切り抜き|インタビュー|速報|ピッチレベル|全ゴール|プロファイル/;
const PAIR_RE = /^\s*(.+?)\s*(?:×|✕|\s+v\s+|\s+vs\.?\s+)\s*(.+?)\s*$/i;
const NEGATIVE_RE = /出番なし|ベンチ外|欠場|メンバー外|離脱|出場なし/;
// 名前ではない言葉(「先発出場」「2点目」など)を名前候補から外す
const NOT_NAME_RE = /出場|先発|途中|記録|選手|点目|得点|ゴール|アシスト|活躍|初|今季|正真正銘|圧巻|劇的|待望/;

// ---- YouTubeページから動画(ID・タイトル・公開からの時間)を取り出す ----
function extractVideos(html) {
  const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!m) return [];
  const out = [];
  (function walk(o) {
    if (!o || typeof o !== 'object') return;
    if (o.lockupViewModel) {
      const l = o.lockupViewModel;
      const md = l.metadata?.lockupMetadataViewModel;
      let ago = '';
      JSON.stringify(md?.metadata || {}).replace(/"content":"([^"]*前)"/g, (_, x) => (ago = x));
      out.push({ id: l.contentId, title: md?.title?.content || '', ago });
      return;
    }
    if (o.videoRenderer) {
      const v = o.videoRenderer;
      out.push({ id: v.videoId, title: (v.title?.runs || []).map((r) => r.text).join(''), ago: v.publishedTimeText?.simpleText || '' });
      return;
    }
    for (const k in o) walk(o[k]);
  })(JSON.parse(m[1]));
  return out;
}

const UNIT_MIN = { 秒: 1 / 60, 分: 1, 時間: 60, 日: 1440, 週間: 10080, か月: 43200, ヶ月: 43200, 年: 525600 };
function agoToMinutes(ago) {
  const m = ago.match(/(\d+)\s*(秒|分|時間|日|週間|か月|ヶ月|年)前/);
  return m ? Number(m[1]) * UNIT_MIN[m[2]] : null;
}

// ---- タイトルの分解 ----
function detectComp(text) {
  for (const c of COMPS) if (c.re.test(text)) return c;
  return null;
}

function detectRound(compText) {
  let r = '';
  const sec = compText.match(/第\s*(\d+)\s*節/) || compText.match(/MD\s*(\d+)/i);
  if (sec) r = `第${sec[1]}節`;
  else {
    const stage = compText.match(/プレーオフ|準々決勝|準決勝|ラウンド\s*\d+|\d+回戦|決勝(?![弾ゴール点])/);
    if (stage) r = stage[0].replace(/\s/g, '');
  }
  const leg = compText.match(/(\d)(?:st|nd|rd|th)\s*leg/i);
  if (leg) r += ` 第${leg[1]}戦`;
  if (/延期分/.test(compText)) r += '(延期分)';
  return r;
}

function splitTitle(title) {
  const first = title.match(/【([^】]*)】/);
  const compText = title.replace(/^.*?【[^】]*】/, '') || title;
  const segments = first ? first[1].split(/[｜|]/).map((s) => s.trim()).filter(Boolean) : [];
  let pair = null;
  const blurb = [];
  for (const s of segments) {
    const p = !pair && !/ハイライト/.test(s) && s.match(PAIR_RE);
    if (p) pair = [p[1].trim(), p[2].trim()];
    else if (!/ハイライト/.test(s)) blurb.push(s);
  }
  return { compText, pair, blurb: blurb.join('｜') };
}

// ---- 日本人選手の名前探し ----
const knownNames = new Set(jpCfg.names);
const stopwords = new Set(jpCfg.stopwords);
const review = { newNameCandidates: [], unparsed: [] };

function findJapanese(rawText, titleForReview) {
  let text = rawText;
  for (const [v, canon] of Object.entries(jpCfg.variants)) text = text.split(v).join(canon);
  const found = new Set();
  const playedAt = (idx, len) => !NEGATIVE_RE.test(text.slice(idx + len).split(/[｜|、。]/)[0].slice(0, 15));

  for (const name of knownNames) {
    const i = text.indexOf(name);
    if (i >= 0 && playedAt(i, name.length)) found.add(name);
  }
  for (const [sur, full] of Object.entries(jpCfg.surnames)) {
    if (found.has(full)) continue;
    const m = text.match(new RegExp(sur + '(?=[がはもと、の・&＆!！\\s]|$)'));
    if (m && playedAt(m.index, sur.length)) found.add(full);
  }
  // 🇯🇵 が付いている未登録の名前(U-NEXTの表記)
  for (const re of [/🇯🇵\s*([一-龯々][一-龯々ァ-ヶー]{1,7}?)(?=が|は|と|、|\s|（|\(|$)/gu, /([一-龯々][一-龯々ァ-ヶー]{1,7})\s*🇯🇵/gu]) {
    for (const m of text.matchAll(re)) {
      const n = m[1];
      if (NOT_NAME_RE.test(n)) continue;
      if (![...found].some((f) => f.includes(n) || n.includes(f))) {
        found.add(n);
        review.newNameCandidates.push({ name: n, title: titleForReview, reason: '🇯🇵付き・未登録' });
      }
    }
  }
  // 未登録の漢字の名前らしきもの → AIの点検リストへ(表示はしない)
  for (const m of text.matchAll(/([一-龯々][一-龯々ァ-ヶー]{1,7})(?=が|は|と|、|も)/gu)) {
    const n = m[1];
    if (stopwords.has(n) || NOT_NAME_RE.test(n) || [...found].some((f) => f.includes(n) || n.includes(f))) continue;
    if ([...stopwords].some((s) => n.includes(s))) continue;
    review.newNameCandidates.push({ name: n, title: titleForReview, reason: '未登録の漢字名?' });
  }
  return [...found];
}

// ---- チーム ----
function resolveTeam(rawName) {
  const t = aliasMap.get(norm(rawName));
  return t
    ? { key: t.id, id: t.id, name: t.name, code: t.code, colors: t.colors, target: !!t.target }
    : { key: norm(rawName), id: null, name: rawName, code: '', colors: null, target: false };
}
function teamsInText(text) {
  const n = norm(text);
  const hits = new Set();
  for (const [a, t] of aliasesLongestFirst) if (a.length >= 2 && n.includes(a)) hits.add(t.id);
  return hits;
}

// ---- 1. 全ファイルから動画を集める ----
const videos = new Map();
for (const f of fs.readdirSync(rawDir).filter((f) => f.endsWith('.html'))) {
  const src = SOURCES[f.split('_')[0]];
  if (!src) continue;
  for (const v of extractVideos(fs.readFileSync(path.join(rawDir, f), 'utf8'))) {
    if (v.id && v.title && !videos.has(v.id)) videos.set(v.id, { ...v, src, ageMin: agoToMinutes(v.ago) });
  }
}

// ---- 2. ハイライトと「情報だけ使う動画」に分ける ----
const highlights = [];
const clips = [];
for (const v of videos.values()) {
  if (!SEASON_RE.test(v.title) || v.ageMin == null) continue;
  const { compText, pair, blurb } = splitTitle(v.title);
  const comp = detectComp(compText) || detectComp(v.title);
  if (!comp || comp.skip) continue;
  const round = detectRound(compText);
  const isHighlight = /ハイライト/.test(v.title) && !NOT_HIGHLIGHT_RE.test(v.title);
  if (isHighlight && pair) {
    highlights.push({ v, comp, round, home: resolveTeam(pair[0]), away: resolveTeam(pair[1]), blurb });
  } else if (isHighlight) {
    review.unparsed.push(v.title);
  } else {
    clips.push({ v, comp, round });
  }
}

// プレミアは「大会に出ている全チーム」が対象。カップ戦・欧州カップでも使う
const premierKeys = new Set();
for (const h of highlights) if (h.comp.id === 'premier') premierKeys.add(h.home.key).add(h.away.key);
const isTarget = (t) => t.target || (teamsCfg.premierAllTeams && premierKeys.has(t.key));

// ---- 3. 対象試合だけ残し、同じ試合は「先に出た方」を採用 ----
const matches = new Map();
for (const h of highlights) {
  if (h.comp.id !== 'premier' && !isTarget(h.home) && !isTarget(h.away)) continue;
  const known = [h.home, h.away].filter((t) => t.id).map((t) => t.id).sort();
  const key = [h.comp.id, h.round, ...(known.length ? known : [h.home.key, h.away.key].sort())].join('|');
  const jp = findJapanese(h.blurb, h.v.title);
  const prev = matches.get(key);
  if (!prev) {
    matches.set(key, { ...h, jp: new Set(jp) });
  } else {
    jp.forEach((n) => prev.jp.add(n));
    if (h.v.ageMin > prev.v.ageMin) Object.assign(prev, { v: h.v, home: h.home, away: h.away });
  }
}

// ---- 4. 選手特集・速報などの動画から「日本人出場」の情報だけ足す ----
for (const c of clips) {
  const jp = findJapanese(c.v.title, c.v.title);
  if (!jp.length || !c.round) continue;
  const teams = teamsInText(c.v.title);
  for (const m of matches.values()) {
    if (m.comp.id === c.comp.id && m.round === c.round && (teams.has(m.home.id) || teams.has(m.away.id))) {
      jp.forEach((n) => m.jp.add(n));
    }
  }
}

// ---- 5. 書き出し(動画タイトル・サムネイル・長さは出さない) ----
const pub = (t) => ({ name: t.name, code: t.code, colors: t.colors });
const list = [...matches.values()]
  .map((m) => ({
    id: m.v.id,
    src: m.v.src,
    comp: m.comp.label,
    group: m.comp.group,
    round: m.round,
    publishedAt: new Date(now - m.v.ageMin * 60000).toISOString(),
    home: pub(m.home),
    away: pub(m.away),
    jp: [...m.jp],
  }))
  .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

const data = { generatedAt: new Date(now).toISOString(), matches: list };
fs.writeFileSync(path.join(ROOT, 'site/data.js'), `window.HIGHLIGHTS = ${JSON.stringify(data, null, 1)};\n`);

const uniq = (arr) => [...new Map(arr.map((x) => [x.name, x])).values()];
review.newNameCandidates = uniq(review.newNameCandidates);
fs.writeFileSync(path.join(ROOT, 'review.json'), JSON.stringify(review, null, 2));

console.log(`動画 ${videos.size}本 → ハイライト候補 ${highlights.length}本 → 対象試合 ${list.length}試合`);
console.log(`日本人の印あり: ${list.filter((m) => m.jp.length).length}試合 / 点検リスト: 名前候補 ${review.newNameCandidates.length}件・分解できず ${review.unparsed.length}件`);

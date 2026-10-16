// 集めたYouTubeの動画一覧から、対象チームのハイライトだけを選んでサイト用データを作る。
// 使い方: node scripts/build.mjs data/videos.json (fetch-youtube.mjs が作ったファイル)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = process.argv[2];
if (!input) {
  console.error('使い方: node scripts/build.mjs <動画一覧のJSON>');
  process.exit(1);
}
const now = Date.now();
const SHOW_DAYS = 14; // 一覧に出すのは過去2週間
const since = now - SHOW_DAYS * 86400000;

const teamsCfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/teams.json'), 'utf8'));
const jpCfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/japanese-players.json'), 'utf8'));
const natCfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/national-teams.json'), 'utf8'));

// 表記ゆれ吸収: 全角半角・中黒・イコール・空白などを取り除いて比べる
const norm = (s) => s.normalize('NFKC').replace(/[\s・･=.'’‐\-]/g, '').toLowerCase();

const aliasMap = new Map();
for (const t of teamsCfg.teams) for (const a of t.aliases) aliasMap.set(norm(a), t);
const aliasesLongestFirst = [...aliasMap.entries()].sort((a, b) => b[0].length - a[0].length);

// 上から順に判定する(女子・クラブの親善試合などは除外)
const COMPS = [
  { re: /女子|WSL|なでしこ/, skip: true },
  { re: /クラブワールドカップ/, skip: true },
  // 代表戦(national)。「代表」タブにまとめる。対象国は config/national-teams.json
  { re: /ワールドカップ.{0,12}予選|W杯.{0,6}予選|アジア最終予選|アジア2次予選|欧州予選|南米予選/, id: 'wcq', label: 'W杯予選', short: 'W杯予選', national: true },
  { re: /ワールドカップ|W杯/, id: 'wc', label: 'ワールドカップ', short: 'W杯', national: true },
  { re: /ネーションズリーグ/, id: 'nations', label: 'ネーションズリーグ', short: 'ネーションズL', national: true },
  { re: /(EURO|ユーロ|欧州選手権).{0,12}予選/, id: 'euroq', label: 'EURO予選', short: 'EURO予選', national: true },
  { re: /EURO\s*20\d\d|ユーロ\s*20\d\d|欧州選手権/, id: 'euro', label: 'EURO', short: 'EURO', national: true },
  { re: /コパ・?アメリカ/, id: 'copa', label: 'コパ・アメリカ', short: 'コパ', national: true },
  { re: /アフリカ・?ネーションズカップ/, id: 'afcon', label: 'アフリカ・ネーションズカップ', short: 'アフリカ杯', national: true },
  { re: /ゴールドカップ/, id: 'goldcup', label: 'ゴールドカップ', short: 'ゴールドC', national: true },
  { re: /アジアカップ/, id: 'asiancup', label: 'アジアカップ', short: 'アジアカップ', national: true },
  { re: /E-1|EAFF/, id: 'e1', label: 'E-1選手権', short: 'E-1', national: true },
  { re: /オリンピック|五輪/, id: 'olympic', label: 'オリンピック', short: '五輪', national: true },
  { re: /キリンチャレンジカップ/, id: 'kirinchallenge', label: 'キリンチャレンジカップ', short: '親善試合', national: true },
  { re: /キリンカップ/, id: 'kirincup', label: 'キリンカップ', short: 'キリンカップ', national: true },
  { re: /国際親善試合|国際試合/, id: 'friendly', label: '国際親善試合', short: '親善試合', national: true },
  { re: /プレシーズン|親善|フレンドリー/, skip: true },
  { re: /ブンデスリーガ\s*2部/, skip: true },
  // Jリーグのチームが出る大会(J1のチームの試合だけ)。ACLは「チャンピオンズリーグ」を含むので欧州CLより先に判定する
  { re: /AFCチャンピオンズリーグ\s*2|ACL\s*2/, id: 'acl2', label: 'ACL2', short: 'ACL2', group: 'other', j1Only: true },
  { re: /AFCチャンピオンズリーグ|ACLエリート|ACLE/, id: 'acle', label: 'ACLエリート', short: 'ACLE', group: 'other', j1Only: true },
  { re: /ルヴァンカップ/, id: 'levain', label: 'ルヴァンカップ', short: 'ルヴァン', group: 'j1', j1Only: true },
  { re: /天皇杯/, id: 'emperor', label: '天皇杯', short: '天皇杯', group: 'j1', j1Only: true },
  { re: /UEFAスーパーカップ/, id: 'uefasuper', label: 'UEFAスーパーカップ', short: 'スーパー杯', group: 'other' },
  { re: /チャンピオンズリーグ/, id: 'cl', label: 'チャンピオンズリーグ', short: 'CL', group: 'cl' },
  { re: /ヨーロッパリーグ/, id: 'el', label: 'ヨーロッパリーグ', short: 'EL', group: 'el' },
  { re: /カンファレンスリーグ/, id: 'ecl', label: 'カンファレンスリーグ', short: 'ECL', group: 'other' },
  { re: /プレミアリーグ/, id: 'premier', label: 'プレミアリーグ', short: 'プレミア', group: 'premier' },
  { re: /ラ・リーガ/, id: 'laliga', label: 'ラ・リーガ', short: 'ラ・リーガ', group: 'laliga' },
  { re: /DFLスーパーカップ/, id: 'dflsuper', label: 'DFLスーパーカップ', short: 'スーパー杯', group: 'bundesliga' },
  { re: /ブンデスリーガ/, id: 'bundesliga', label: 'ブンデスリーガ', short: 'ブンデス', group: 'bundesliga' },
  { re: /リーグアン|リーグ・アン/, id: 'ligue1', label: 'リーグアン', short: 'リーグアン', group: 'ligue1' },
  { re: /セリエA/, id: 'seriea', label: 'セリエA', short: 'セリエA', group: 'seriea' },
  { re: /エールディヴィジ/, id: 'eredivisie', label: 'エールディヴィジ', short: 'オランダ', group: 'eredivisie' },
  { re: /ポルトガルリーグ|リーガ・ポルトガル/, id: 'portugal', label: 'ポルトガルリーグ', short: 'ポルトガル', group: 'portugal' },
  { re: /ベルギーリーグ|ジュピラー/, id: 'belgium', label: 'ベルギーリーグ', short: 'ベルギー', group: 'belgium' },
  { re: /FAカップ/, id: 'facup', label: 'FAカップ', short: 'FA杯', group: 'premier' },
  { re: /カラバオカップ|EFLカップ/, id: 'eflcup', label: 'カラバオカップ', short: 'カラバオ杯', group: 'premier' },
  { re: /コパ・デル・レイ/, id: 'copadelrey', label: 'コパ・デル・レイ', short: '国王杯', group: 'laliga' },
  { re: /スーペルコパ/, id: 'supercopa', label: 'スーペルコパ', short: 'スーペルコパ', group: 'laliga' },
  { re: /DFBポカール/, id: 'dfbpokal', label: 'DFBポカール', short: 'DFB杯', group: 'bundesliga' },
  { re: /クープ・ドゥ・フランス/, id: 'cdf', label: 'クープ・ドゥ・フランス', short: 'フランス杯', group: 'ligue1' },
  { re: /コッパ・イタリア/, id: 'coppa', label: 'コッパ・イタリア', short: 'イタリア杯', group: 'seriea' },
  { re: /KNVB/, id: 'knvb', label: 'KNVBカップ', short: 'KNVB杯', group: 'eredivisie' },
  { re: /コミュニティ・シールド/, id: 'shield', label: 'コミュニティ・シールド', short: 'シールド', group: 'premier' },
  { re: /J1リーグ/, id: 'j1', label: 'J1リーグ', short: 'J1', group: 'j1' },
];
for (const c of COMPS) if (c.national) c.group = 'national';
// J1とJ1チームのカップ戦・ACL、代表戦は日本人選手ばかり(または日本人が出ない)なので、JPNマークは付けない
const noJpMark = (comp) => comp.id === 'j1' || !!comp.j1Only || !!comp.national;
// 代表戦は「2026」のような年の表記(クラブの「2026-27」とは違う)。2026年以降の大会だけ
const NATIONAL_YEAR_RE = /20(2[6-9]|[3-9]\d)/;
// 世代別の代表(日本だけ対象): U-23・U-20・五輪など
const YOUTH_RE = /U-?\s?(\d{2})|五輪|オリンピック/;
const SEASON_RE = /2026[-/]27|26[-/]27/;
const NOT_HIGHLIGHT_RE = /ゴール集|プレー集|トピック|ふりかえり|振り返り|特集|切り抜き|インタビュー|速報|ピッチレベル|全ゴール|プロファイル/;
const PAIR_RE = /^\s*(.+?)\s*(?:×|✕|\s+v\s+|\s+vs\.?\s+)\s*(.+?)\s*$/i;
const NEGATIVE_RE = /出番なし|ベンチ外|欠場|メンバー外|離脱|出場なし/;
// 名前ではない言葉(「先発出場」「2点目」など)を名前候補から外す
const NOT_NAME_RE = /出場|先発|途中|記録|選手|点目|得点|ゴール|アシスト|活躍|初|今季|正真正銘|圧巻|劇的|待望/;

// ---- タイトルの分解 ----
function detectComp(text) {
  for (const c of COMPS) if (c.re.test(text)) return c;
  return null;
}
// 大会名は、タイトルの後ろの方の区切り(｜・／)に入っていることが多い。後ろから順に探し、
// 一言コメント(「W杯後初ゴール」「代表帰りの…」など)に大会らしい言葉があっても、大会名の方を優先する
function detectCompFromEnd(text) {
  const segs = text.split(/[｜|／]/);
  for (let i = segs.length - 1; i >= 0; i--) { const c = detectComp(segs[i]); if (c) return c; }
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
// 代表チーム: 「代表」「U-23」などを取り除いて対象国の表と照らす。世代別は名前の前に年代を付ける(例: U-23日本)
const natMap = new Map();
for (const t of natCfg.teams) for (const a of t.aliases) natMap.set(norm(a), t);
function resolveNational(rawName, age) {
  const base = rawName.replace(/U-?\s?\d{2}|五輪|オリンピック|代表/g, '').trim();
  const t = natMap.get(norm(base));
  const name = (t ? t.name : base) || rawName;
  const shown = age ? `${age}${name}` : name;
  return t
    ? { key: t.id + (age ? '-' + age : ''), id: t.id, name: shown, code: t.code, colors: t.colors, target: true }
    : { key: norm(shown), id: null, name: shown, code: '', colors: null, target: false };
}
function teamsInText(text) {
  const n = norm(text);
  const hits = new Set();
  for (const [a, t] of aliasesLongestFirst) if (a.length >= 2 && n.includes(a)) hits.add(t.id);
  return hits;
}

// ---- 1. 動画一覧を読む ----
const videos = new Map();
for (const v of JSON.parse(fs.readFileSync(input, 'utf8')).videos) {
  if (v.id && v.title && !videos.has(v.id)) videos.set(v.id, { ...v, time: Date.parse(v.publishedAt) });
}

// ---- 2. ハイライトと「情報だけ使う動画」に分ける ----
const highlights = [];
const clips = [];
for (const v of videos.values()) {
  if (!(v.time >= since)) continue;
  if (v.playable === false) continue; // 埋め込み不可・日本で見られない動画は使わない
  const { compText, pair, blurb } = splitTitle(v.title);
  const comp = detectCompFromEnd(compText) || detectComp(compText) || detectComp(v.title);
  if (!comp || comp.skip) continue;
  // 「2026-27」などのシーズン表記で古い動画を除く(国内カップ戦は表記が違うことがあるので見ない。代表戦は年の表記)
  if (comp.national ? !NATIONAL_YEAR_RE.test(v.title) : !comp.j1Only && !SEASON_RE.test(v.title)) continue;
  const round = detectRound(compText);
  const isHighlight = /ハイライト/.test(v.title) && !NOT_HIGHLIGHT_RE.test(v.title);
  if (isHighlight && pair && comp.national) {
    const youth = v.title.match(YOUTH_RE);
    const age = youth ? (youth[1] ? `U-${youth[1]}` : 'U-23') : '';
    highlights.push({ v, comp, round, home: resolveNational(pair[0], age), away: resolveNational(pair[1], age), blurb, youth: !!youth });
  } else if (isHighlight && pair) {
    highlights.push({ v, comp, round, home: resolveTeam(pair[0]), away: resolveTeam(pair[1]), blurb });
  } else if (isHighlight) {
    review.unparsed.push(v.title);
  } else {
    clips.push({ v, comp, round });
  }
}

// プレミア・J1は「大会に出ている全チーム」が対象。カップ戦・欧州カップでも使う
const allTeamsComps = new Set(teamsCfg.allTeamsComps || []);
const allTeamsKeys = new Set();
for (const h of highlights) if (allTeamsComps.has(h.comp.id)) allTeamsKeys.add(h.home.key).add(h.away.key);
const isTarget = (t) => t.target || allTeamsKeys.has(t.key);

// 今季のJ1チームか(teams.json で league が j1、またはJ1リーグの試合に出ている)。ACL・国内カップ戦の絞り込みに使う
const leagueOf = new Map(teamsCfg.teams.map((t) => [t.id, t.league]));
const j1LeagueKeys = new Set();
for (const h of highlights) if (h.comp.id === 'j1') j1LeagueKeys.add(h.home.key).add(h.away.key);
const isJ1Team = (t) => (t.id && leagueOf.get(t.id) === 'j1') || j1LeagueKeys.has(t.key);
const included = (h) =>
  h.comp.national ? (h.youth ? h.home.id === 'jpn' || h.away.id === 'jpn' : h.home.target || h.away.target)
    : h.comp.j1Only ? isJ1Team(h.home) || isJ1Team(h.away)
    : allTeamsComps.has(h.comp.id) || isTarget(h.home) || isTarget(h.away);

// ---- 3. 対象試合だけ残し、同じ試合は「先に出た方」を採用 ----
// 配信会社によって「第◯節」の数え方が違うことがある(延期分など)ので、節では比べない。
// 「同じ大会・同じチーム・3日以内」なら同じ試合とみなす(リーグ戦で3日以内に同じチームが2試合することはない)
const NEAR = 3 * 86400000;
const knownIds = new Set([...teamsCfg.teams, ...natCfg.teams].map((t) => t.id));
const teamKeys = (h) => [h.home, h.away].map((t) => t.key);
const sameMatch = (a, b) => {
  if (a.comp.id !== b.comp.id || Math.abs(a.v.time - b.v.time) >= NEAR) return false;
  const ka = teamKeys(a), kb = teamKeys(b);
  // 代表戦は代表ウィーク中に3日おきで試合があるので、両チームとも一致したときだけ同じ試合
  if (a.comp.national) return ka.every((k) => kb.includes(k));
  // 登録済みのチームが1つでも共通なら同じ試合。登録されていないチーム同士なら、名前が両方一致したときだけ
  return ka.some((k) => knownIds.has(k) && kb.includes(k)) || ka.every((k) => kb.includes(k));
};
const matches = [];
for (const h of highlights) {
  if (!included(h)) continue;
  const jp = noJpMark(h.comp) ? [] : findJapanese(h.blurb, h.v.title);
  const prev = matches.find((m) => sameMatch(m, h));
  if (!prev) {
    matches.push({ ...h, jp: new Set(jp) });
  } else {
    jp.forEach((n) => prev.jp.add(n));
    if (h.v.time < prev.v.time) Object.assign(prev, { v: h.v, home: h.home, away: h.away, round: h.round });
  }
}

// ---- 4. 選手特集・速報などの動画から「日本人出場」の情報だけ足す ----
for (const c of clips) {
  if (noJpMark(c.comp)) continue;
  const jp = findJapanese(c.v.title, c.v.title);
  if (!jp.length) continue;
  const teams = teamsInText(c.v.title);
  for (const m of matches) {
    if (m.comp.id === c.comp.id && Math.abs(m.v.time - c.v.time) < NEAR && (teams.has(m.home.id) || teams.has(m.away.id))) {
      jp.forEach((n) => m.jp.add(n));
    }
  }
}

// ---- 5. 書き出し(動画タイトル・サムネイル・長さは出さない) ----
const pub = (t) => ({ id: t.id, name: t.name, code: t.code, colors: t.colors });
const list = matches
  .map((m) => ({
    id: m.v.id,
    src: m.v.src,
    comp: m.comp.label,
    compShort: m.comp.short || m.comp.label,
    group: m.comp.group,
    round: m.round,
    publishedAt: new Date(m.v.time).toISOString(),
    home: pub(m.home),
    away: pub(m.away),
    jp: [...m.jp],
    ...(m.v.comments != null && { commentCount: m.v.comments }),
  }))
  .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

const data = { generatedAt: new Date(now).toISOString(), matches: list };
fs.writeFileSync(path.join(ROOT, 'site/data.js'), `window.HIGHLIGHTS = ${JSON.stringify(data, null, 1)};\n`);

const uniq = (arr) => [...new Map(arr.map((x) => [x.name, x])).values()];
review.newNameCandidates = uniq(review.newNameCandidates);
fs.writeFileSync(path.join(ROOT, 'review.json'), JSON.stringify(review, null, 2));

console.log(`動画 ${videos.size}本 → ハイライト候補 ${highlights.length}本 → 対象試合 ${list.length}試合`);
console.log(`日本人の印あり: ${list.filter((m) => m.jp.length).length}試合 / 点検リスト: 名前候補 ${review.newNameCandidates.length}件・分解できず ${review.unparsed.length}件`);

// 一覧に載っている動画の YouTube コメントを取ってきて site/comments/<動画ID>.json に保存する。
// 新しい動画ほどこまめに取り直す(公開から 24時間以内: 毎回(30分ごと) / 24〜48時間: 2時間ごと /
// 48〜72時間: 6時間ごと / それ以降: 24時間ごと)。「前回取ってからの時間」で判断するので、自動更新が飛んでも遅れない。
// 取り直さない回は、公開中のサイトにある前回の分をそのまま使う(無料枠を節約するため)。
// 72時間以降も1日1回は取り直すのは、YouTube側で消されたコメントをいつまでも表示しないため。
// 人気順・新しい順をそれぞれ最大100件。1動画あたり使用量2。
// 使い方: YOUTUBE_API_KEY=... node scripts/fetch-comments.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE_URL = 'https://taco-05.github.io/highlights/';
const OUT = path.join(ROOT, 'site/comments');
const MAX = 100;

const key = process.env.YOUTUBE_API_KEY;
if (!key) {
  console.error('使い方: YOUTUBE_API_KEY=... node scripts/fetch-comments.mjs');
  process.exit(1);
}

const window = {};
new Function('window', fs.readFileSync(path.join(ROOT, 'site/data.js'), 'utf8'))(window);
const matches = window.HIGHLIGHTS.matches;

const now = Date.now();
const HOUR = 3600000;
// 動画の公開からの時間に応じた「取り直す間隔」
function refreshInterval(m) {
  const hours = (now - Date.parse(m.publishedAt)) / HOUR;
  if (hours < 24) return 0;
  if (hours < 48) return 2 * HOUR;
  if (hours < 72) return 6 * HOUR;
  return 24 * HOUR;
}
// 自動更新の開始時刻は毎回少しずれるので、10分の余裕を見る
const SLACK = 10 * 60000;

async function commentThreads(videoId, order) {
  const url = new URL('https://www.googleapis.com/youtube/v3/commentThreads');
  for (const [k, v] of Object.entries({ part: 'snippet', videoId, order, maxResults: MAX, textFormat: 'plainText', key })) url.searchParams.set(k, v);
  const res = await fetch(url);
  // URLにはキーが入っているので、エラーでもURLは表示しない
  if (res.status === 403) {
    const body = await res.text();
    if (body.includes('commentsDisabled')) return null;
    throw new Error(`HTTP 403 ${body.slice(0, 200)}`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).items.map((it) => {
    const s = it.snippet.topLevelComment.snippet;
    return { a: s.authorDisplayName, t: s.textDisplay, l: s.likeCount, p: s.publishedAt, r: it.snippet.totalReplyCount };
  });
}

async function fetchFresh(id) {
  const top = await commentThreads(id, 'relevance');
  if (!top) return { fetchedAt: new Date(now).toISOString(), disabled: true };
  const latest = await commentThreads(id, 'time');
  return { fetchedAt: new Date(now).toISOString(), top, new: latest };
}

async function previous(id) {
  try {
    const res = await fetch(`${SITE_URL}comments/${id}.json?t=${now}`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

fs.mkdirSync(OUT, { recursive: true });
let fresh = 0, reused = 0, failed = 0;
for (const m of matches) {
  let data = null;
  const interval = refreshInterval(m);
  if (interval > 0) {
    const prev = await previous(m.id);
    if (prev && now - Date.parse(prev.fetchedAt) < interval - SLACK) {
      data = prev;
      reused++;
    }
  }
  if (!data) {
    try {
      data = await fetchFresh(m.id);
      fresh++;
    } catch (err) {
      failed++;
      console.log(`コメントを取れませんでした (${m.home.name} vs ${m.away.name}): ${err.message}`);
      data = await previous(m.id);
    }
  }
  if (data) fs.writeFileSync(path.join(OUT, `${m.id}.json`), JSON.stringify(data));
}
console.log(`コメント: 取り直し ${fresh}本(使用量 約${fresh * 2}) / 前回分をそのまま ${reused}本 / 失敗 ${failed}本`);

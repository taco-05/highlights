// YouTube公式の窓口(YouTube Data API)から、3社の最近の動画一覧を取ってくる。
// 使い方: YOUTUBE_API_KEY=... node scripts/fetch-youtube.mjs data/videos.json
// 使う量の目安: 1回あたり20前後(1日の無料枠は10,000)
import fs from 'node:fs';
import path from 'node:path';

const CHANNELS = [
  { src: 'DAZN', id: 'UCoFLB_Gw_AoxUuuzKjXrc_Q' },
  { src: 'U-NEXT', id: 'UCMjvvElkdLRTgcTKklAUkSw' },
  { src: 'WOWOW', id: 'UCJQj2lbG_3w8UrncJd7JZXw' },
];
const DAYS = 15; // 表示は14日分。境目の取りこぼしがないよう1日多めに取る
const MAX_PAGES = 12;

const out = process.argv[2];
const key = process.env.YOUTUBE_API_KEY;
if (!out || !key) {
  console.error('使い方: YOUTUBE_API_KEY=... node scripts/fetch-youtube.mjs <出力先>');
  process.exit(1);
}

async function api(endpoint, params) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  for (const [k, v] of Object.entries({ ...params, key })) url.searchParams.set(k, v);
  const res = await fetch(url);
  // URLにはキーが入っているので、エラーでもURLは表示しない
  if (!res.ok) throw new Error(`${endpoint}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

const cutoff = Date.now() - DAYS * 86400000;
const videos = [];

for (const ch of CHANNELS) {
  // チャンネルの「アップロード動画」一覧は UC… を UU… に変えたID
  const playlistId = 'UU' + ch.id.slice(2);
  let pageToken = '';
  for (let page = 0; page < MAX_PAGES; page++) {
    const r = await api('playlistItems', { part: 'snippet,contentDetails', playlistId, maxResults: 50, ...(pageToken && { pageToken }) });
    let reachedOld = false;
    for (const it of r.items) {
      const publishedAt = it.contentDetails.videoPublishedAt || it.snippet.publishedAt;
      if (Date.parse(publishedAt) < cutoff) { reachedOld = true; continue; }
      videos.push({ id: it.contentDetails.videoId, src: ch.src, title: it.snippet.title, publishedAt });
    }
    pageToken = r.nextPageToken;
    if (reachedOld || !pageToken) break;
  }
}

// ハイライトらしい動画だけ、「埋め込み再生できるか」「日本で見られるか」を確かめる
const candidates = videos.filter((v) => /ハイライト/.test(v.title));
for (let i = 0; i < candidates.length; i += 50) {
  const batch = candidates.slice(i, i + 50);
  const r = await api('videos', { part: 'status,contentDetails', id: batch.map((v) => v.id).join(',') });
  const info = new Map(r.items.map((x) => [x.id, x]));
  for (const v of batch) {
    const x = info.get(v.id);
    const rr = x?.contentDetails?.regionRestriction;
    const blockedInJapan = !!rr && ((rr.blocked || []).includes('JP') || (rr.allowed && !rr.allowed.includes('JP')));
    v.playable = !!x && x.status.embeddable && x.status.privacyStatus === 'public' && !blockedInJapan;
  }
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ fetchedAt: new Date().toISOString(), videos }, null, 1));
const bySrc = CHANNELS.map((c) => `${c.src} ${videos.filter((v) => v.src === c.src).length}本`).join(' / ');
console.log(`取得: ${bySrc}(ハイライト候補 ${candidates.length}本、再生できないもの ${candidates.filter((v) => !v.playable).length}本)`);

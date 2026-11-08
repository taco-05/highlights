// API-Football の無料枠で「今季の試合の出場メンバー」が取れるかを確かめる(手動で1回だけ動かす確認用)。
// 使い方: API_FOOTBALL_KEY=... node scripts/check-api-football.mjs
// 鍵はログに出さない。使う回数は3回(1日の無料枠は100回の見込み)
const key = process.env.API_FOOTBALL_KEY;
if (!key) { console.log('API_FOOTBALL_KEY が登録されていません'); process.exit(1); }

async function api(pathAndQuery) {
  const res = await fetch(`https://v3.football.api-sports.io/${pathAndQuery}`, { headers: { 'x-apisports-key': key } });
  const body = await res.json().catch(() => ({}));
  const errors = body.errors && Object.keys(body.errors).length ? JSON.stringify(body.errors) : 'なし';
  console.log(`\n[${pathAndQuery}] HTTP ${res.status} / エラー: ${errors}`);
  return body;
}

// 1. 契約の状態(プランと、今日使った回数)
const st = await api('status');
const r = st.response || {};
console.log(`プラン: ${r.subscription?.plan ?? '不明'} / 今日の利用: ${r.requests?.current ?? '?'} / 上限: ${r.requests?.limit_day ?? '?'}`);

// 2. バルセロナ(id 529)の今季(2026-27 = season 2026)の直近の試合
const fx = await api('fixtures?team=529&season=2026&last=1');
const f = fx.response?.[0];
if (!f) { console.log('今季の試合が取れませんでした(無料枠では今季が見られない可能性)'); process.exit(0); }
console.log(`試合: ${f.fixture.date} ${f.teams.home.name} vs ${f.teams.away.name}(結果は表示しない)`);

// 3. その試合の出場メンバー(先発・控え)
const lu = await api(`fixtures/lineups?fixture=${f.fixture.id}`);
for (const t of lu.response || []) {
  console.log(`${t.team.name}: 先発 ${t.startXI?.length ?? 0}人 / 控え ${t.substitutes?.length ?? 0}人 / 例: ${(t.startXI || []).slice(0, 3).map((p) => p.player.name).join(', ')}`);
}
console.log(lu.response?.length ? '\n→ 今季の出場メンバーが取れました' : '\n→ 出場メンバーは取れませんでした');

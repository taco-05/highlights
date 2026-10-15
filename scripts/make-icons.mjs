// ホーム画面用のアイコン(PNG)を作る。外部の部品は使わない。
// 使い方: node scripts/make-icons.mjs → site/icon-180.png, icon-192.png, icon-512.png
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const SITE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const NAVY = hex('#11242d'), WHITE = hex('#f8fafc'), TEAL = hex('#14b8a6');

// デザイン(512×512の座標で考える。2026-10-15 に taku が決定)
//   紺の背景に大きな白い丸(=「.Digest」の「.」)。丸にはごく薄く緑でサッカーボールの柄
//   丸の中に「.Digest」: 「.」と「igest」は紺、「D」は緑(中を▶の形にくりぬき)。Dは見出しと同じくほかの文字より大きい
const CIRCLE = { x: 256, y: 256, r: 212 };
const TEXT_SCALE = 1.2; // 「.Digest」の文字は、下の形(丸の大きさ190のときの形)を丸の中心から1.2倍に広げて使う
const BALL_OPACITY = 0.09;

// 「igest」の文字の形(見出しと同じ Montserrat Black。書体ファイルから取り出した輪郭。1000単位・上向きが正)
// Montserrat は SIL Open Font License 1.1(Copyright 2011 The Montserrat Project Authors)
const GLYPHS = {
  i: { adv: 326, d: 'M50 0L50 547L276 547L276 0ZM163 591Q101 591 64 624Q27 657 27 706Q27 755 64 788Q101 821 163 821Q225 821 262 790Q299 759 299 710Q299 658 262 624.5Q225 591 163 591Z' },
  g: { adv: 711, d: 'M328 -204Q247 -204 176 -187Q105 -170 54 -136L130 18Q162 -7 211.5 -21.5Q261 -36 305 -36Q375 -36 405 -6.5Q435 23 435 78L435 124L445 294L446 464L446 547L661 547L661 109Q661 -50 573 -127Q485 -204 328 -204ZM284 30Q215 30 155 62.5Q95 95 58 154Q21 213 21 294Q21 375 58 434Q95 493 155 525Q215 557 284 557Q355 557 400.5 529Q446 501 468 442.5Q490 384 490 294Q490 204 468 145.5Q446 87 400.5 58.5Q355 30 284 30ZM344 206Q371 206 392 217Q413 228 425 248Q437 268 437 294Q437 321 425 340.5Q413 360 392 370.5Q371 381 344 381Q318 381 296.5 370.5Q275 360 262.5 340.5Q250 321 250 294Q250 268 262.5 248Q275 228 296.5 217Q318 206 344 206Z' },
  e: { adv: 653, d: 'M352 -10Q252 -10 177.5 27Q103 64 62 128.5Q21 193 21 274Q21 357 61.5 421Q102 485 172.5 521Q243 557 331 557Q412 557 480.5 525Q549 493 590.5 430Q632 367 632 274Q632 262 631 247.5Q630 233 629 221L208 221L208 330L509 330L424 301Q424 333 412.5 355.5Q401 378 381 390.5Q361 403 333 403Q305 403 284.5 390.5Q264 378 253 355.5Q242 333 242 301L242 267Q242 232 256 207Q270 182 296 169.5Q322 157 359 157Q397 157 421.5 167Q446 177 473 197L591 78Q551 35 492.5 12.5Q434 -10 352 -10Z' },
  s: { adv: 565, d: 'M264 -10Q194 -10 126 5Q58 20 16 44L78 193Q117 170 168.5 157Q220 144 269 144Q310 144 324.5 151Q339 158 339 170Q339 182 322 187.5Q305 193 277 196Q249 199 215.5 203.5Q182 208 148 217Q114 226 86 244Q58 262 41 292.5Q24 323 24 370Q24 422 55.5 464Q87 506 149.5 531.5Q212 557 304 557Q364 557 424 546Q484 535 527 512L465 363Q423 386 382.5 394.5Q342 403 307 403Q264 403 248.5 395Q233 387 233 377Q233 365 250 359Q267 353 295 350Q323 347 356.5 342.5Q390 338 423.5 328.5Q457 319 485 301Q513 283 530 252.5Q547 222 547 175Q547 126 516 83.5Q485 41 422 15.5Q359 -10 264 -10Z' },
  t: { adv: 460, d: 'M314 -10Q201 -10 138 44.5Q75 99 75 212L75 670L301 670L301 214Q301 189 314.5 175Q328 161 348 161Q377 161 399 176L453 19Q427 4 390.5 -3Q354 -10 314 -10ZM0 382L0 547L413 547L413 382Z' },
};

// ---- 形の当たり判定 ----
const inTriangle = (x, y, [ax, ay], [bx, by], [cx, cy]) => {
  const side = (px, py, qx, qy) => (x - qx) * (py - qy) - (px - qx) * (y - qy);
  const s1 = side(ax, ay, bx, by), s2 = side(bx, by, cx, cy), s3 = side(cx, cy, ax, ay);
  return (s1 <= 0 && s2 <= 0 && s3 <= 0) || (s1 >= 0 && s2 >= 0 && s3 >= 0);
};
const inPolygon = (x, y, pts) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const nearSegment = (x, y, [ax, ay], [bx, by], half) => {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - ax - t * dx, y - ay - t * dy) <= half;
};

// ---- 「.Digest」の文字(見出しと同じ比率: 「.」とDは120、igestは62の大きさ。丸の真ん中に置く) ----
const BIG = 120, SMALL = 62, ORIGIN_X = 113.7, BASE = 301;
const DOT = { x: ORIGIN_X + 0.095 * BIG, y: BASE - 0.095 * BIG, r: 0.095 * BIG };
const D_X = ORIGIN_X + 0.19 * BIG + 0.07 * BIG, D_H = 0.88 * BIG, D_SCALE = D_H / 240, D_Y = BASE - D_H;
// Dの形(240の高さで考えた形を縮める): 縦棒+右が半円、中を▶でくりぬき
const inD = (x, y) => {
  const u = (x - D_X) / D_SCALE, v = (y - D_Y) / D_SCALE;
  const shape = (u >= 0 && u <= 90 && v >= 0 && v <= 240) || (u > 90 && (u - 90) ** 2 + (v - 120) ** 2 <= 120 ** 2);
  return shape && !inTriangle(u, v, [54, 44], [54, 196], [174, 120]);
};
// igest: 文字の輪郭を細かい折れ線にして、0-1の当たり判定(重なりは「内側の数」で判定)に使う
const textEdges = [];
{
  const s = SMALL / 1000;
  let x0 = D_X + 210 * D_SCALE + 0.03 * BIG;
  for (const ch of 'igest') {
    const g = GLYPHS[ch];
    const tok = g.d.match(/[MLQZ]|-?[\d.]+/g);
    let cur = null, start = null, i = 0;
    const P = (gx, gy) => [x0 + gx * s, BASE - gy * s];
    const num = () => Number(tok[i++]);
    while (i < tok.length) {
      const c = tok[i++];
      if (c === 'M') { cur = start = P(num(), num()); }
      else if (c === 'L') { const p = P(num(), num()); textEdges.push([cur, p]); cur = p; }
      else if (c === 'Q') {
        const q = P(num(), num()), p = P(num(), num());
        let prev = cur;
        for (let k = 1; k <= 8; k++) {
          const t = k / 8, a = (1 - t) ** 2, b = 2 * (1 - t) * t, cc = t * t;
          const pt = [a * cur[0] + b * q[0] + cc * p[0], a * cur[1] + b * q[1] + cc * p[1]];
          textEdges.push([prev, pt]); prev = pt;
        }
        cur = p;
      } else if (c === 'Z') { if (cur[0] !== start[0] || cur[1] !== start[1]) textEdges.push([cur, start]); cur = start; }
    }
    x0 += g.adv * s - 0.035 * SMALL;
  }
}
const textBox = textEdges.flat().reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [1e9, 1e9, -1e9, -1e9]);
const inText = (x, y) => {
  if (x < textBox[0] || x > textBox[2] || y < textBox[1] || y > textBox[3]) return false;
  let wind = 0;
  for (const [[ax, ay], [bx, by]] of textEdges) {
    if (ay <= y) { if (by > y && (bx - ax) * (y - ay) - (x - ax) * (by - ay) > 0) wind++; }
    else if (by <= y && (bx - ax) * (y - ay) - (x - ax) * (by - ay) < 0) wind--;
  }
  return wind !== 0;
};

// ---- サッカーボールの柄(丸の大きさを1とした形。真ん中の五角形+まわりの五角形+縫い目) ----
const ball = (() => {
  const P = (r, deg) => [r * Math.cos((deg * Math.PI) / 180), r * Math.sin((deg * Math.PI) / 180)];
  const pent = (cx, cy, r, rot) => [0, 1, 2, 3, 4].map((j) => { const [x, y] = P(r, rot + 72 * j); return [cx + x, cy + y]; });
  const polys = [pent(0, 0, 0.34, -90)], segs = [], outer = [];
  for (let k = 0; k < 5; k++) {
    const a = -90 + 72 * k, [cx, cy] = P(1, a), o = pent(cx, cy, 0.34, a + 180);
    outer.push(o); polys.push(o);
    segs.push([P(0.34, a), o[0]]);
  }
  for (let k = 0; k < 5; k++) {
    const a = -90 + 72 * k + 36, m = P(0.84, a);
    const near = (v) => v.reduce((b, q) => (Math.hypot(q[0] - m[0], q[1] - m[1]) < Math.hypot(b[0] - m[0], b[1] - m[1]) ? q : b));
    segs.push([near(outer[k]), m], [m, near(outer[(k + 1) % 5])], [m, P(1.1, a)]);
  }
  return { polys, segs, half: 0.0175 };
})();
const onBall = (x, y) => {
  const u = (x - CIRCLE.x) / CIRCLE.r, v = (y - CIRCLE.y) / CIRCLE.r;
  return ball.polys.some((p) => inPolygon(u, v, p)) || ball.segs.some(([a, b]) => nearSegment(u, v, a, b, ball.half));
};

// 0〜1の座標で、その点が何色かを返す
function colorAt(uu, vv) {
  const x = uu * 512, y = vv * 512;
  if ((x - CIRCLE.x) ** 2 + (y - CIRCLE.y) ** 2 > CIRCLE.r ** 2) return NAVY;
  const tx = CIRCLE.x + (x - CIRCLE.x) / TEXT_SCALE, ty = CIRCLE.y + (y - CIRCLE.y) / TEXT_SCALE;
  if ((tx - DOT.x) ** 2 + (ty - DOT.y) ** 2 <= DOT.r ** 2) return NAVY;
  if (inD(tx, ty)) return TEAL;
  if (inText(tx, ty)) return NAVY;
  if (onBall(x, y)) return WHITE.map((c, i) => c * (1 - BALL_OPACITY) + TEAL[i] * BALL_OPACITY);
  return WHITE;
}

function png(size) {
  const N = 4; // 1ピクセルを4×4に分けて平均し、ふちを滑らかにする
  const row = size * 4 + 1;
  const raw = Buffer.alloc(row * size);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const sum = [0, 0, 0];
      for (let sy = 0; sy < N; sy++) for (let sx = 0; sx < N; sx++) {
        const c = colorAt((px + (sx + 0.5) / N) / size, (py + (sy + 0.5) / N) / size);
        c.forEach((v, i) => (sum[i] += v));
      }
      const o = py * row + 1 + px * 4;
      sum.forEach((v, i) => (raw[o + i] = Math.round(v / (N * N))));
      raw[o + 3] = 255;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8bit・RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [180, 192, 512]) fs.writeFileSync(path.join(SITE, `icon-${size}.png`), png(size));
console.log('アイコンを作りました: 180 / 192 / 512');

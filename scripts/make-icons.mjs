// ホーム画面用のアイコン(PNG)を作る。外部の部品は使わない。
// 使い方: node scripts/make-icons.mjs → site/icon-180.png, icon-192.png, icon-512.png
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const SITE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const BG_TOP = hex('#12313a'), BG_BOTTOM = hex('#0f1720'), BALL = hex('#f8fafc'), PLAY = hex('#14b8a6');

// 0〜1の座標で、その点が何色かを返す(背景 → 白いボール → 緑の再生マーク)
function colorAt(x, y) {
  const inBall = (x - 0.5) ** 2 + (y - 0.5) ** 2 <= 0.31 ** 2;
  const [ax, ay, bx, by, cx, cy] = [0.43, 0.36, 0.43, 0.64, 0.67, 0.5];
  const side = (px, py, qx, qy) => (x - qx) * (py - qy) - (px - qx) * (y - qy);
  const s1 = side(ax, ay, bx, by), s2 = side(bx, by, cx, cy), s3 = side(cx, cy, ax, ay);
  const inPlay = (s1 <= 0 && s2 <= 0 && s3 <= 0) || (s1 >= 0 && s2 >= 0 && s3 >= 0);
  if (inBall && inPlay) return PLAY;
  if (inBall) return BALL;
  return BG_TOP.map((c, i) => Math.round(c + (BG_BOTTOM[i] - c) * y));
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

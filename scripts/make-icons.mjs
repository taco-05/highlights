// ホーム画面用のアイコン(PNG)を作る。外部の部品は使わない。
// 使い方: node scripts/make-icons.mjs → site/icon-180.png, icon-192.png, icon-512.png
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const SITE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const BG = hex('#11242d'), WHITE = hex('#f8fafc'), TEAL = hex('#14b8a6');
const LINE = BG.map((c) => Math.round(c * 0.9 + 255 * 0.1)); // ピッチのラインは背景に白を10%重ねた色

// デザイン「.H」(512×512の座標で考える)
//   背景: ピッチのライン(外枠・センターライン・センターサークル)をうっすら
//   「.」: 緑の丸 / 「H」: 白の縦棒2本 / Hの横棒の代わりに緑の▶
const inRoundRect = (x, y, x0, y0, x1, y1, r) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const dx = Math.max(x0 + r - x, 0, x - (x1 - r)), dy = Math.max(y0 + r - y, 0, y - (y1 - r));
  return dx * dx + dy * dy <= r * r;
};
const inTriangle = (x, y, [ax, ay], [bx, by], [cx, cy]) => {
  const side = (px, py, qx, qy) => (x - qx) * (py - qy) - (px - qx) * (y - qy);
  const s1 = side(ax, ay, bx, by), s2 = side(bx, by, cx, cy), s3 = side(cx, cy, ax, ay);
  return (s1 <= 0 && s2 <= 0 && s3 <= 0) || (s1 >= 0 && s2 >= 0 && s3 >= 0);
};

// 0〜1の座標で、その点が何色かを返す
function colorAt(u, v) {
  const x = u * 512, y = v * 512;
  if (inTriangle(x, y, [258, 196], [258, 316], [352, 256])) return TEAL;
  if ((x >= 196 && x <= 258 || x >= 352 && x <= 414) && y >= 136 && y <= 376) return WHITE;
  if ((x - 128) ** 2 + (y - 346) ** 2 <= 30 ** 2) return TEAL;
  const pitchFrame = inRoundRect(x, y, 40, 40, 472, 472, 14) && !inRoundRect(x, y, 48, 48, 464, 464, 6);
  const halfway = Math.abs(y - 256) <= 4 && x >= 44 && x <= 468;
  const centerCircle = Math.abs(Math.hypot(x - 256, y - 256) - 92) <= 4;
  if (pitchFrame || halfway || centerCircle) return LINE;
  return BG;
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

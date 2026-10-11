// iPhone(ホーム画面に追加したサイト)へ通知を送るための仕組み。外部の部品は使わず、Node標準の暗号機能だけで作っている。
// 仕様: RFC 8291(通知の中身の暗号化 aes128gcm)と RFC 8292(送り主の証明 VAPID)
import crypto from 'node:crypto';

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fromB64u = (s) => Buffer.from(s, 'base64url');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

// 公開鍵(0x04 + x + y の65バイト)と秘密鍵(d)から、署名用の鍵を作る
export function vapidKey(publicKey, privateKey) {
  const pub = fromB64u(publicKey);
  return crypto.createPrivateKey({
    format: 'jwk',
    key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)), d: privateKey },
  });
}

// 送り主の証明(通知サーバーごとに作る)
export function vapidAuthorization(endpoint, publicKey, keyObject, subject) {
  const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = { aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject };
  const unsigned = `${header}.${b64u(JSON.stringify(claims))}`;
  const sig = crypto.sign('sha256', Buffer.from(unsigned), { key: keyObject, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${unsigned}.${b64u(sig)}, k=${publicKey}`;
}

// 通知の中身を、受け取る端末だけが読めるように暗号化する
export function encrypt(subscription, plaintext) {
  const uaPublic = fromB64u(subscription.keys.p256dh);
  const authSecret = fromB64u(subscription.keys.auth);
  const ecdh = crypto.createECDH('prime256v1');
  const asPublic = ecdh.generateKeys();
  const shared = ecdh.computeSecret(uaPublic);

  const prkKey = hmac(authSecret, shared);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]));
  const salt = crypto.randomBytes(16);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);

  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const record = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(plaintext), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);

  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, record]);
}

export async function sendPush(subscription, payload, { publicKey, keyObject, subject }) {
  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      TTL: String(12 * 3600),
      Urgency: 'normal',
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      Authorization: vapidAuthorization(subscription.endpoint, publicKey, keyObject, subject),
    },
    body: encrypt(subscription, JSON.stringify(payload)),
  });
  return { status: res.status, text: res.ok ? '' : (await res.text()).slice(0, 200) };
}

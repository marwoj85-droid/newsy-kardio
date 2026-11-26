// Szyfrowanie danych aplikacji hasłem (AES-256-GCM, klucz z PBKDF2-SHA256).
// Ten sam format odszyfrowuje przeglądarka (public/index.html).
//
//   KARDIO_PASSWORD=... node scripts/crypt.mjs encrypt data/articles.json public/data/articles.enc.json
//   KARDIO_PASSWORD=... node scripts/crypt.mjs decrypt public/data/articles.enc.json data/articles.json
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ITER = 250000;
const { subtle } = globalThis.crypto;
const b64 = buf => Buffer.from(buf).toString('base64');
const unb64 = s => new Uint8Array(Buffer.from(s, 'base64'));

async function keyFor(password, salt, iter) {
  const base = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encrypt(plainJson, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFor(password, salt, ITER);
  const data = await subtle.encrypt({ name: 'AES-GCM', iv }, key, zlib.gzipSync(Buffer.from(plainJson)));
  return JSON.stringify({ v: 1, alg: 'PBKDF2-SHA256/AES-256-GCM/gzip', iter: ITER, salt: b64(salt), iv: b64(iv), data: b64(data) });
}

export async function decrypt(encJson, password) {
  const e = JSON.parse(encJson);
  const key = await keyFor(password, unb64(e.salt), e.iter);
  const plain = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(e.iv) }, key, unb64(e.data));
  return zlib.gunzipSync(Buffer.from(plain)).toString('utf8');
}

const [, , mode, input, output] = process.argv;
if (mode) {
  const pw = process.env.KARDIO_PASSWORD;
  if (!pw) { console.error('Brak hasła: ustaw zmienną KARDIO_PASSWORD (w GitHub: secret KARDIO_PASSWORD).'); process.exit(1); }
  const src = fs.readFileSync(input, 'utf8');
  let out;
  try { out = mode === 'encrypt' ? await encrypt(src, pw) : await decrypt(src, pw); }
  catch { console.error('Nie udało się odszyfrować — złe hasło albo uszkodzony plik.'); process.exit(2); }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, out);
  console.log(`${mode === 'encrypt' ? 'Zaszyfrowano' : 'Odszyfrowano'}: ${output} (${(out.length / 1024).toFixed(0)} KB)`);
}

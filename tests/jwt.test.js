import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { decodeJwt, describeClaims, signHs256, verifyHs256 } from '../src/lib/jwt.js';

const b64url = (value) => Buffer.from(value).toString('base64url');

/** Builds a token with Node's own HMAC, so the code under test is checked against something independent. */
function makeToken(header, payload, secret) {
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = createHmac('sha256', secret).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
}

const HEADER = { alg: 'HS256', typ: 'JWT' };
const PAYLOAD = { sub: '1234567890', name: 'Ada Lovelace', iat: 1700000000 };

test('decodes header, payload and signature', () => {
  const token = makeToken(HEADER, PAYLOAD, 'secret');
  const decoded = decodeJwt(token);
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.header, HEADER);
  assert.deepEqual(decoded.payload, PAYLOAD);
  assert.equal(decoded.algorithm, 'HS256');
  assert.equal(decoded.signature, token.split('.')[2]);
  assert.equal(decoded.signingInput, token.split('.').slice(0, 2).join('.'));
});

test('ignores a Bearer prefix and surrounding whitespace', () => {
  const token = makeToken(HEADER, PAYLOAD, 'secret');
  assert.equal(decodeJwt(`  Bearer ${token}\n`).ok, true);
  assert.equal(decodeJwt(`bearer   ${token}`).ok, true);
});

test('explains what is wrong with a malformed token', () => {
  const good = makeToken(HEADER, PAYLOAD, 'secret').split('.');
  const cases = [
    ['', /Paste a token/],
    ['a.b', /3 dot-separated parts, but this has 2/],
    ['a.b.c.d', /3 dot-separated parts, but this has 4/],
    [`!!!.${good[1]}.${good[2]}`, /header is not valid Base64URL/],
    [`${b64url('not json')}.${good[1]}.sig`, /header is not valid JSON/],
    [`${good[0]}.${b64url('[1]')}.sig`, /payload must be a JSON object/],
    [`${good[0]}.${Buffer.from([0xff, 0xfe]).toString('base64url')}.sig`, /payload is not valid UTF-8/],
  ];
  for (const [token, message] of cases) {
    const result = decodeJwt(token);
    assert.equal(result.ok, false, token);
    assert.match(result.error, message, token);
  }
});

test('verifies an HS256 signature made by an independent implementation', async () => {
  const token = makeToken(HEADER, PAYLOAD, 'correct horse');
  assert.deepEqual(await verifyHs256(token, 'correct horse'), { ok: true, valid: true });
  assert.deepEqual(await verifyHs256(token, 'wrong secret'), { ok: true, valid: false });
});

test('detects a tampered payload', async () => {
  const [header, , signature] = makeToken(HEADER, PAYLOAD, 'k').split('.');
  const forged = `${header}.${b64url(JSON.stringify({ ...PAYLOAD, admin: true }))}.${signature}`;
  assert.deepEqual(await verifyHs256(forged, 'k'), { ok: true, valid: false });
});

test('refuses to "verify" algorithms it cannot check', async () => {
  for (const alg of ['none', 'RS256', 'HS512']) {
    const result = await verifyHs256(makeToken({ alg, typ: 'JWT' }, PAYLOAD, 'k'), 'k');
    assert.equal(result.ok, false, alg);
    assert.match(result.error, /only HS256/, alg);
  }
});

test('signHs256 produces tokens that Node verifies', async () => {
  const token = await signHs256({}, PAYLOAD, 'shhh');
  const [header, payload, signature] = token.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url').toString()), HEADER);
  assert.deepEqual(JSON.parse(Buffer.from(payload, 'base64url').toString()), PAYLOAD);
  assert.equal(signature, createHmac('sha256', 'shhh').update(`${header}.${payload}`).digest('base64url'));
  assert.deepEqual(await verifyHs256(token, 'shhh'), { ok: true, valid: true });
});

test('describes exp, nbf and iat relative to a fixed "now"', () => {
  const now = 1_700_000_000_000;
  const rows = describeClaims(
    { exp: 1_700_003_600, nbf: 1_700_000_060, iat: 1_699_999_000 },
    now,
  );
  const by = Object.fromEntries(rows.map((row) => [row.name, row]));
  assert.equal(by.exp.status, 'valid for another 1 hour');
  assert.equal(by.exp.expired, false);
  assert.equal(by.exp.iso, '2023-11-14T23:13:20.000Z');
  assert.equal(by.nbf.status, 'not valid yet (starts in 1 minute)');
  assert.equal(by.iat.status, 'issued 16 minutes ago');

  const expired = describeClaims({ exp: 1_699_999_000 }, now)[0];
  assert.equal(expired.status, 'expired 16 minutes ago');
  assert.equal(expired.expired, true);
});

test('flags claims that are not usable dates', () => {
  const rows = describeClaims({ exp: 'soon', nbf: 1e20 }, 0);
  assert.match(rows.find((r) => r.name === 'exp').error, /number of seconds/);
  assert.match(rows.find((r) => r.name === 'nbf').error, /outside the range/);
  assert.deepEqual(describeClaims({ sub: 'x' }, 0), []);
});

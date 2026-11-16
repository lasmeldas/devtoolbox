import test from 'node:test';
import assert from 'node:assert/strict';
import { base64ToBytes, bytesToBase64, decodeToText, encodeText } from '../src/lib/base64.js';

test('encodes the RFC 4648 test vectors', () => {
  const vectors = [
    ['', ''],
    ['f', 'Zg=='],
    ['fo', 'Zm8='],
    ['foo', 'Zm9v'],
    ['foob', 'Zm9vYg=='],
    ['fooba', 'Zm9vYmE='],
    ['foobar', 'Zm9vYmFy'],
  ];
  for (const [text, expected] of vectors) assert.equal(encodeText(text), expected);
});

test('uses the URL-safe alphabet and can leave out padding', () => {
  assert.equal(bytesToBase64(Uint8Array.of(0xfb, 0xff, 0xfe)), '+//+');
  assert.equal(bytesToBase64(Uint8Array.of(0xfb, 0xff, 0xfe), { urlSafe: true }), '-__-');
  assert.equal(bytesToBase64(Uint8Array.of(0xff)), '/w==');
  assert.equal(bytesToBase64(Uint8Array.of(0xff), { urlSafe: true, pad: false }), '_w');
});

test('matches Node for every length from 0 to 70', () => {
  for (let length = 0; length <= 70; length++) {
    const data = Uint8Array.from({ length }, (_, i) => (i * 37 + length * 11) & 0xff);
    assert.equal(bytesToBase64(data), Buffer.from(data).toString('base64'), `standard, length ${length}`);
    assert.equal(
      bytesToBase64(data, { urlSafe: true, pad: false }),
      Buffer.from(data).toString('base64url'),
      `url-safe, length ${length}`,
    );
    const back = base64ToBytes(Buffer.from(data).toString('base64'));
    assert.equal(back.ok, true);
    assert.deepEqual(Array.from(back.bytes), Array.from(data), `round trip, length ${length}`);
  }
});

test('decodes URL-safe input, ignores whitespace and accepts missing padding', () => {
  assert.deepEqual(Array.from(base64ToBytes('-__-').bytes), [0xfb, 0xff, 0xfe]);
  assert.deepEqual(Array.from(base64ToBytes(' Zm9v\n YmFy ').bytes), Array.from(Buffer.from('foobar')));
  assert.deepEqual(Array.from(base64ToBytes('Zm8').bytes), Array.from(Buffer.from('fo')));
});

test('reports clear errors', () => {
  const cases = [
    ['ab$d', /character "\$" at position 3/],
    ['ab=d', /"=" in the middle at position 3/],
    ['A', /single leftover character/],
    ['QQ=', /Incorrect padding/],
    ['ab+_', /Mixes standard/],
  ];
  for (const [input, pattern] of cases) {
    const result = base64ToBytes(input);
    assert.equal(result.ok, false, input);
    assert.match(result.error, pattern, input);
  }
});

test('round-trips Unicode text', () => {
  for (const text of ['', 'hello', 'héllo wörld', 'Ünïcödé ✓', '日本語のテキスト', 'emoji 😀🚀', 'line1\nline2\r\n']) {
    const decoded = decodeToText(encodeText(text));
    assert.equal(decoded.ok, true, JSON.stringify(text));
    assert.equal(decoded.text, text);
  }
});

test('says so when the decoded bytes are not text', () => {
  const result = decodeToText('/w==');
  assert.equal(result.ok, false);
  assert.match(result.error, /not valid UTF-8/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ALGORITHMS, hashAll, hashText, md5, toHex } from '../src/lib/hash.js';

const NODE_NAME = { MD5: 'md5', 'SHA-1': 'sha1', 'SHA-256': 'sha256', 'SHA-384': 'sha384', 'SHA-512': 'sha512' };

test('md5 matches the RFC 1321 test suite', () => {
  const suite = {
    '': 'd41d8cd98f00b204e9800998ecf8427e',
    a: '0cc175b9c0f1b6a831c399e269772661',
    abc: '900150983cd24fb0d6963f7d28e17f72',
    'message digest': 'f96b697d7cb7938d525a2f31aaf161d0',
    abcdefghijklmnopqrstuvwxyz: 'c3fcd3d76192e4007dfb496cca67e13b',
  };
  for (const [input, expected] of Object.entries(suite)) {
    assert.equal(md5(input), expected, JSON.stringify(input));
  }
});

test('md5 agrees with Node for every length up to 300 (all padding boundaries)', () => {
  for (let length = 0; length <= 300; length++) {
    const text = 'x'.repeat(length);
    assert.equal(md5(text), createHash('md5').update(text).digest('hex'), `length ${length}`);
  }
});

test('md5 accepts bytes as well as text and reads text as UTF-8', () => {
  const bytes = Uint8Array.from({ length: 200 }, (_, i) => (i * 7) & 0xff);
  assert.equal(md5(bytes), createHash('md5').update(bytes).digest('hex'));
  assert.equal(md5('héllo ✓ 😀'), createHash('md5').update('héllo ✓ 😀', 'utf8').digest('hex'));
});

test('every algorithm matches Node', async () => {
  for (const text of ['', 'abc', 'The quick brown fox jumps over the lazy dog', 'héllo ✓ 😀']) {
    for (const algorithm of ALGORITHMS) {
      const expected = createHash(NODE_NAME[algorithm]).update(text, 'utf8').digest('hex');
      assert.equal(await hashText(algorithm, text), expected, `${algorithm} of ${JSON.stringify(text)}`);
    }
  }
});

test('hashAll returns all five digests in order', async () => {
  const all = await hashAll('abc');
  assert.deepEqual(Object.keys(all), ALGORITHMS);
  assert.equal(all['SHA-256'], 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('rejects algorithms it does not know', async () => {
  await assert.rejects(() => hashText('SHA-3', 'x'), /Unsupported algorithm/);
});

test('toHex pads single digits', () => {
  assert.equal(toHex(Uint8Array.of(0, 1, 15, 16, 255)), '00010f10ff');
});

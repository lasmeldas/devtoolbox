import test from 'node:test';
import assert from 'node:assert/strict';
import { createUuidv7Generator, parseUuid, uuidv4, uuidv7 } from '../src/lib/uuid.js';

const SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const zeros = (n) => new Uint8Array(n);

test('uuidv4 sets the version and variant bits on fixed input', () => {
  const sequence = (n) => Uint8Array.from({ length: n }, (_, i) => i);
  assert.equal(uuidv4(sequence), '00010203-0405-4607-8809-0a0b0c0d0e0f');
  const allOnes = (n) => new Uint8Array(n).fill(0xff);
  assert.equal(uuidv4(allOnes), 'ffffffff-ffff-4fff-bfff-ffffffffffff');
});

test('uuidv4 from the system random source is well formed and unique', () => {
  const seen = new Set();
  for (let i = 0; i < 1000; i++) {
    const id = uuidv4();
    assert.match(id, SHAPE);
    assert.equal(id[14], '4');
    assert.match(id[19], /[89ab]/);
    seen.add(id);
  }
  assert.equal(seen.size, 1000);
});

test('uuidv7 puts the timestamp first and sorts in creation order', () => {
  const next = createUuidv7Generator({ now: () => 0x0123456789ab, random: zeros });
  assert.equal(next(), '01234567-89ab-7000-8000-000000000000');
  assert.equal(next(), '01234567-89ab-7001-8000-000000000000');
});

test('uuidv7 keeps order across a counter overflow within one millisecond', () => {
  const random = (n) => (n === 2 ? Uint8Array.of(0x07, 0xff) : zeros(n)); // start the counter at 0x7ff
  const next = createUuidv7Generator({ now: () => 1_000_000, random });
  const ids = Array.from({ length: 2100 }, () => next());
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual([...ids].sort(), ids);
  assert.ok(parseUuid(ids.at(-1)).timestampMs > 1_000_000, 'the timestamp moved forward when the counter ran out');
});

test('uuidv7 stays increasing even if the clock goes backwards', () => {
  const clock = [5000, 4999, 4000, 6000];
  const next = createUuidv7Generator({ now: () => clock.shift(), random: zeros });
  const ids = [next(), next(), next(), next()];
  assert.deepEqual([...ids].sort(), ids);
  assert.equal(parseUuid(ids[3]).timestampMs, 6000);
});

test('uuidv7 from the default generator is well formed and increasing', () => {
  const ids = Array.from({ length: 200 }, () => uuidv7());
  for (const id of ids) {
    assert.match(id, SHAPE);
    assert.equal(id[14], '7');
  }
  assert.deepEqual([...ids].sort(), ids);
});

test('parseUuid explains version and variant', () => {
  const parsed = parseUuid('00010203-0405-4607-8809-0a0b0c0d0e0f');
  assert.equal(parsed.ok, true);
  assert.equal(parsed.version, 4);
  assert.equal(parsed.variant, 'RFC 4122 / RFC 9562');
  assert.equal(parsed.special, null);
  assert.equal(parsed.timestampMs, null);
});

test('parseUuid accepts braces, urn: prefix and capitals', () => {
  const expected = '00010203-0405-4607-8809-0a0b0c0d0e0f';
  assert.equal(parseUuid('{00010203-0405-4607-8809-0A0B0C0D0E0F}').normalized, expected);
  assert.equal(parseUuid('urn:uuid:00010203-0405-4607-8809-0A0B0C0D0E0F').normalized, expected);
  assert.equal(parseUuid('  00010203-0405-4607-8809-0A0B0C0D0E0F  ').normalized, expected);
});

test('parseUuid recognises the nil and max UUIDs', () => {
  const nil = parseUuid('00000000-0000-0000-0000-000000000000');
  assert.equal(nil.special, 'nil UUID');
  assert.equal(nil.version, 0);
  const max = parseUuid('FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF');
  assert.equal(max.special, 'max UUID');
  assert.equal(max.version, 15);
});

test('parseUuid reads the timestamp out of a version 7 UUID', () => {
  const next = createUuidv7Generator({ now: () => 1_700_000_000_123, random: zeros });
  const parsed = parseUuid(next());
  assert.equal(parsed.version, 7);
  assert.equal(parsed.timestampMs, 1_700_000_000_123);
});

test('parseUuid rejects things that are not UUIDs', () => {
  for (const input of ['', 'not-a-uuid', '1234', '00010203-0405-4607-8809-0a0b0c0d0e0', '00010203040546078809-0a0b0c0d0e0f', 'g0010203-0405-4607-8809-0a0b0c0d0e0f']) {
    const result = parseUuid(input);
    assert.equal(result.ok, false, input);
    assert.match(result.error, /Not a UUID/);
  }
});

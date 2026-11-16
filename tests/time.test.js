import test from 'node:test';
import assert from 'node:assert/strict';
import {
  describeTimestamp,
  parseEpoch,
  parseIsoDate,
  parseTimestampInput,
  relativeTime,
} from '../src/lib/time.js';

test('guesses the unit of an epoch number from its size', () => {
  const expectations = [
    ['1700000000', 'seconds'],
    ['1700000000000', 'milliseconds'],
    ['1700000000000000', 'microseconds'],
    ['1700000000000000000', 'nanoseconds'],
  ];
  for (const [input, unit] of expectations) {
    const result = parseEpoch(input);
    assert.equal(result.ok, true, input);
    assert.equal(result.unit, unit, input);
    assert.equal(result.ms, 1_700_000_000_000, input);
  }
});

test('epoch unit boundaries, decimals, signs and spaces', () => {
  assert.equal(parseEpoch('99999999999').unit, 'seconds');
  assert.equal(parseEpoch('100000000000').unit, 'milliseconds');
  assert.equal(parseEpoch('1700000000.5').ms, 1_700_000_000_500);
  assert.equal(parseEpoch('-1').ms, -1000);
  assert.equal(parseEpoch(' 12 ').ms, 12_000);
});

test('rejects things that are not epoch numbers or are out of range', () => {
  assert.equal(parseEpoch('abc').ok, false);
  assert.equal(parseEpoch('1e9').ok, false);
  assert.equal(parseEpoch('').ok, false);
  assert.match(parseEpoch('99999999999999999999999').error, /outside the range/);
});

test('reads ISO dates, times and offsets', () => {
  assert.equal(parseIsoDate('2024-02-29').ms, Date.UTC(2024, 1, 29));
  assert.equal(parseIsoDate('2024-02-29T10:30:00Z').ms, Date.UTC(2024, 1, 29, 10, 30));
  assert.equal(parseIsoDate('2024-02-29t10:30:00z').ms, Date.UTC(2024, 1, 29, 10, 30));
  assert.equal(parseIsoDate('2024-02-29 10:30:00+03:00').ms, Date.UTC(2024, 1, 29, 7, 30));
  assert.equal(parseIsoDate('2024-02-29T10:30:00-05:30').ms, Date.UTC(2024, 1, 29, 16, 0));
  assert.equal(parseIsoDate('2024-02-29T10:30:00+0300').ms, Date.UTC(2024, 1, 29, 7, 30));
  assert.equal(parseIsoDate('2024-02-29T10:30:00.123456Z').ms, Date.UTC(2024, 1, 29, 10, 30, 0, 123));
  assert.equal(parseIsoDate('2024-02-29T10:30:00,5Z').ms, Date.UTC(2024, 1, 29, 10, 30, 0, 500));
  assert.equal(parseIsoDate('2024-02-29T10:30').ms, Date.UTC(2024, 1, 29, 10, 30));
});

test('handles years before 100 without the usual Date quirk', () => {
  assert.equal(parseIsoDate('0099-01-01').ms, Date.parse('0099-01-01T00:00:00.000Z'));
});

test('explains why a date is wrong', () => {
  const cases = [
    ['2023-02-29', /Day 29 does not exist in 2023-02/],
    ['2024-04-31', /Day 31 does not exist in 2024-04/],
    ['2024-00-10', /Month 0 does not exist/],
    ['2024-13-01', /Month 13 does not exist/],
    ['2024-02-29T24:00:00Z', /time of day is out of range/],
    ['2024-02-29T10:60:00Z', /time of day is out of range/],
    ['2024-02-29T10:30:00+25:00', /offset is out of range/],
    ['2024-02-29T10:30:00+03:60', /offset is out of range/],
    ['next tuesday', /Not a recognised date/],
  ];
  for (const [input, message] of cases) {
    const result = parseIsoDate(input);
    assert.equal(result.ok, false, input);
    assert.match(result.error, message, input);
  }
});

test('parseTimestampInput accepts either form', () => {
  assert.equal(parseTimestampInput('1700000000').kind, 'epoch');
  assert.equal(parseTimestampInput('2024-02-29').kind, 'date');
  assert.equal(parseTimestampInput('2024-02-29').unit, 'ISO date');
  assert.equal(parseTimestampInput('   ').ok, false);
  assert.equal(parseTimestampInput('hello').ok, false);
});

test('relativeTime in plain English', () => {
  const now = 1_700_000_000_000;
  const minute = 60_000;
  const hour = 3_600_000;
  const day = 86_400_000;
  assert.equal(relativeTime(now, now), 'now');
  assert.equal(relativeTime(now + 90_000, now), 'in 1 minute');
  assert.equal(relativeTime(now - 2 * hour, now), '2 hours ago');
  assert.equal(relativeTime(now + 3 * day, now), 'in 3 days');
  assert.equal(relativeTime(now + day, now), 'tomorrow');
  assert.equal(relativeTime(now - day, now), 'yesterday');
  assert.equal(relativeTime(now + 2 * 365 * day, now), 'in 2 years');
  assert.equal(relativeTime(now - 45 * minute, now), '45 minutes ago');
});

test('describeTimestamp shows one instant several ways', () => {
  const ms = 1_700_000_000_000;
  const utc = describeTimestamp(ms, { nowMs: ms, timeZone: 'UTC' });
  assert.equal(utc.iso, '2023-11-14T22:13:20.000Z');
  assert.equal(utc.utc, 'Tue, 14 Nov 2023 22:13:20 GMT');
  assert.equal(utc.seconds, 1_700_000_000);
  assert.equal(utc.milliseconds, ms);
  assert.equal(utc.timeZone, 'UTC');
  assert.equal(utc.relative, 'now');
  assert.match(utc.local, /14 Nov 2023/);
  assert.match(utc.local, /22:13:20/);

  const addis = describeTimestamp(ms, { nowMs: ms, timeZone: 'Africa/Addis_Ababa' });
  assert.equal(addis.timeZone, 'Africa/Addis_Ababa');
  assert.match(addis.local, /15 Nov 2023/);
  assert.match(addis.local, /01:13:20/);
});

test('describeTimestamp floors seconds for dates before 1970', () => {
  assert.equal(describeTimestamp(-1500, { nowMs: 0, timeZone: 'UTC' }).seconds, -2);
});

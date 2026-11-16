import test from 'node:test';
import assert from 'node:assert/strict';
import { findMatches, highlightSegments, validateFlags } from '../src/lib/regex.js';

test('validates flags', () => {
  assert.equal(validateFlags('').ok, true);
  assert.equal(validateFlags('dgimsuy').ok, true);
  assert.match(validateFlags('x').error, /Unknown flag "x"/);
  assert.match(validateFlags('gg').error, /repeated/);
  assert.match(validateFlags('uv').error, /cannot be used together/);
});

test('lists every match with its position, even without the g flag', () => {
  const result = findMatches('\\d+', '', 'a1b22c333');
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.matches.map((m) => [m.index, m.end, m.text]),
    [
      [1, 2, '1'],
      [3, 5, '22'],
      [6, 9, '333'],
    ],
  );
  assert.equal(result.truncated, false);
  assert.equal(findMatches('a', 'g', 'aaa').matches.length, 3);
});

test('returns numbered and named groups', () => {
  const numbered = findMatches('(\\w)(\\d)?', '', 'a1b').matches;
  assert.deepEqual(numbered[0].groups, ['a', '1']);
  assert.deepEqual(numbered[1].groups, ['b', null]);

  const named = findMatches('(?<year>\\d{4})-(?<month>\\d{2})', '', 'on 2024-05 and 1999-12').matches;
  assert.deepEqual(named[0].named, { year: '2024', month: '05' });
  assert.deepEqual(named[1].named, { year: '1999', month: '12' });
});

test('empty matches do not loop forever', () => {
  assert.equal(findMatches('', '', 'abc').matches.length, 4);
  assert.equal(findMatches('x*', '', 'abc').matches.length, 4);
});

test('empty matches step over a whole emoji only in unicode mode', () => {
  assert.equal(findMatches('', 'u', '😀').matches.length, 2);
  assert.equal(findMatches('', '', '😀').matches.length, 3);
});

test('reports invalid patterns and flags as errors, not exceptions', () => {
  const bad = findMatches('(', '', 'x');
  assert.equal(bad.ok, false);
  assert.match(bad.error, /Invalid regular expression|Unterminated group/i);
  assert.equal(findMatches('a', 'q', 'a').ok, false);
});

test('stops at maxMatches and says it was cut short', () => {
  const result = findMatches('a', '', 'a'.repeat(10), { maxMatches: 3 });
  assert.equal(result.matches.length, 3);
  assert.equal(result.truncated, true);
});

test('honours the sticky flag', () => {
  assert.equal(findMatches('a', 'y', 'aab').matches.length, 2);
});

test('splits text into plain and highlighted pieces', () => {
  const { matches } = findMatches('\\d+', '', 'a1b22c');
  assert.deepEqual(highlightSegments('a1b22c', matches), [
    { text: 'a', matched: false },
    { text: '1', matched: true, number: 1 },
    { text: 'b', matched: false },
    { text: '22', matched: true, number: 2 },
    { text: 'c', matched: false },
  ]);
  const empty = findMatches('', '', 'abc').matches;
  assert.deepEqual(highlightSegments('abc', empty), [{ text: 'abc', matched: false }]);
});

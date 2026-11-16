import test from 'node:test';
import assert from 'node:assert/strict';
import { findJsonError, formatJson, minifyJson, parseJson, positionToLineColumn } from '../src/lib/json.js';

test('formats with 2 spaces, 4 spaces or tabs', () => {
  const text = '{"a":[1,2],"b":{"c":null}}';
  const value = JSON.parse(text);
  assert.equal(formatJson(text, { indent: 2 }).output, JSON.stringify(value, null, 2));
  assert.equal(formatJson(text, { indent: 4 }).output, JSON.stringify(value, null, 4));
  assert.equal(formatJson(text, { indent: 'tab' }).output, JSON.stringify(value, null, '\t'));
});

test('minifies and can sort keys at every depth', () => {
  assert.equal(minifyJson('{ "b": 1,\n "a": [ 1, 2 ] }').output, '{"b":1,"a":[1,2]}');
  assert.equal(minifyJson('{"b":1,"a":{"d":1,"c":2}}', { sortKeys: true }).output, '{"a":{"c":2,"d":1},"b":1}');
  assert.equal(
    formatJson('[{"z":1,"y":2}]', { indent: 2, sortKeys: true }).output,
    JSON.stringify([{ y: 2, z: 1 }], null, 2),
  );
});

test('keeps a "__proto__" key as an ordinary key', () => {
  const result = formatJson('{"a":2,"__proto__":1}', { sortKeys: true });
  assert.equal(result.ok, true);
  assert.match(result.output, /"__proto__": 1/);
  assert.equal(Object.prototype.polluted, undefined);
});

test('valid documents have no error', () => {
  const valid = [
    '{}',
    '[]',
    '0',
    '"text"',
    'true',
    'null',
    '-0.5e+10',
    ' \n\t[1, 2.5, -3e2, true, false, null, "\\u00e9\\n\\"", {"k": []}]\r\n',
  ];
  for (const text of valid) assert.equal(findJsonError(text), null, text);
});

test('reports the exact line and column of the first problem', () => {
  const cases = [
    ['{"a":1,}', /Trailing comma/, 1, 8],
    ['[1,2,]', /Trailing comma/, 1, 6],
    ["{'a':1}", /double quotes/, 1, 2],
    ['{"a":01}', /Leading zeros/, 1, 6],
    ['{"a":1} x', /after the end/, 1, 9],
    ['{"a":"b', /Unterminated string/, 1, 6],
    ['{"a":tru}', /Unexpected character "t"/, 1, 6],
    ['{\n  "a": 1,\n  "b": }\n', /Unexpected character "}"/, 3, 8],
    ['[1, // note\n2]', /Comments are not allowed/, 1, 5],
    ['"\\x"', /Invalid escape sequence/, 1, 2],
    ['{"a" 1}', /Expected ":"/, 1, 6],
    ['{"a":1 "b":2}', /Expected "," or "}"/, 1, 8],
    ['[1 2]', /Expected "," or "\]"/, 1, 4],
    ['{"a":', /Unexpected end of input/, 1, 6],
    ['', /input is empty/, 1, 1],
  ];
  for (const [text, message, line, column] of cases) {
    const found = findJsonError(text);
    assert.ok(found, `expected an error for ${JSON.stringify(text)}`);
    assert.match(found.message, message, JSON.stringify(text));
    assert.equal(found.line, line, `line for ${JSON.stringify(text)}`);
    assert.equal(found.column, column, `column for ${JSON.stringify(text)}`);
  }
});

test('parseJson returns the value or a located error', () => {
  assert.deepEqual(parseJson('{"a":[1]}'), { ok: true, value: { a: [1] } });
  const bad = parseJson('{"a":1,}');
  assert.equal(bad.ok, false);
  assert.equal(bad.error.line, 1);
  assert.equal(bad.error.column, 8);
  assert.equal(formatJson('{"a":1,}').ok, false);
  assert.equal(minifyJson('nope').ok, false);
});

test('very deep nesting is reported instead of crashing', () => {
  const deep = '['.repeat(600) + ']'.repeat(600);
  assert.match(findJsonError(deep).message, /too deep/);
});

test('positionToLineColumn counts from 1', () => {
  assert.deepEqual(positionToLineColumn('a\nbc', 0), { line: 1, column: 1 });
  assert.deepEqual(positionToLineColumn('a\nbc', 3), { line: 2, column: 2 });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { diffLines, opsToText, splitLines } from '../src/lib/diff.js';

test('splitLines handles final line breaks and every newline style', () => {
  assert.deepEqual(splitLines(''), []);
  assert.deepEqual(splitLines('a'), ['a']);
  assert.deepEqual(splitLines('a\n'), ['a']);
  assert.deepEqual(splitLines('a\n\n'), ['a', '']);
  assert.deepEqual(splitLines('a\r\nb\rc\nd'), ['a', 'b', 'c', 'd']);
});

test('identical texts have no changes', () => {
  const result = diffLines('one\ntwo\nthree', 'one\ntwo\nthree');
  assert.equal(result.ok, true);
  assert.deepEqual(result.stats, { added: 0, removed: 0, unchanged: 3 });
  assert.ok(result.ops.every((op) => op.type === 'equal'));
});

test('finds a removal and an addition', () => {
  const result = diffLines('a\nb\nc', 'a\nc\nd');
  assert.deepEqual(result.ops, [
    { type: 'equal', line: 'a' },
    { type: 'remove', line: 'b' },
    { type: 'equal', line: 'c' },
    { type: 'add', line: 'd' },
  ]);
  assert.deepEqual(result.stats, { added: 1, removed: 1, unchanged: 2 });
});

test('handles empty sides', () => {
  assert.deepEqual(diffLines('', 'x').ops, [{ type: 'add', line: 'x' }]);
  assert.deepEqual(diffLines('x', '').ops, [{ type: 'remove', line: 'x' }]);
  assert.deepEqual(diffLines('', '').ops, []);
});

test('lists removals before additions when a line is replaced', () => {
  const result = diffLines('keep\nold\nkeep2', 'keep\nnew\nkeep2');
  assert.deepEqual(
    result.ops.map((op) => op.type),
    ['equal', 'remove', 'add', 'equal'],
  );
});

test('applying the ops to the old text rebuilds the new text', () => {
  const oldText = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n');
  const newLines = Array.from({ length: 40 }, (_, i) => `line ${i}`).filter((_, i) => i % 5 !== 0);
  newLines.splice(10, 0, 'inserted A', 'inserted B');
  const result = diffLines(oldText, newLines.join('\n'));
  const rebuilt = result.ops.filter((op) => op.type !== 'remove').map((op) => op.line);
  const original = result.ops.filter((op) => op.type !== 'add').map((op) => op.line);
  assert.deepEqual(rebuilt, newLines);
  assert.deepEqual(original, oldText.split('\n'));
});

test('opsToText marks each line', () => {
  const { ops } = diffLines('a\nb', 'a\nc');
  assert.equal(opsToText(ops), '  a\n- b\n+ c');
});

test('refuses inputs that would need too much memory', () => {
  const a = Array.from({ length: 3000 }, (_, i) => `a${i}`).join('\n');
  const b = Array.from({ length: 3000 }, (_, i) => `b${i}`).join('\n');
  const result = diffLines(a, b);
  assert.equal(result.ok, false);
  assert.match(result.error, /too many lines/);
});

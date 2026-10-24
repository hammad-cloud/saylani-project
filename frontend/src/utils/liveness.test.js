import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBlinkDetector, eyeAspectRatio } from './liveness.js';

const run = (ears) => {
  const update = createBlinkDetector();
  return ears.some((e) => update(e));
};

test('eye aspect ratio: open eye is larger than closed eye', () => {
  const eye = (h) => [{ x: 0, y: 0 }, { x: 1, y: -h }, { x: 2, y: -h }, { x: 3, y: 0 }, { x: 2, y: h }, { x: 1, y: h }];
  assert.ok(eyeAspectRatio(eye(1)) > eyeAspectRatio(eye(0.2)));
  assert.equal(eyeAspectRatio(eye(0)), 0);
});

test('blink detector', () => {
  assert.equal(run([0.3, 0.31, 0.3, 0.3, 0.12, 0.29]), true, 'open → closed → open is a blink');
  assert.equal(run([0.3, 0.31, 0.3, 0.3, 0.29, 0.3, 0.31]), false, 'eyes always open (a photo) is not');
  assert.equal(run([0.3, 0.3, 0.3, 0.3, 0.1, 0.1, 0.1]), false, 'closing without reopening is not');
  assert.equal(run([0.1, 0.3, 0.3]), false, 'no decision during warm-up');
  assert.equal(run([0.22, 0.22, 0.22, 0.22, 0.13, 0.21]), true, 'works for naturally narrow eyes');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFaceScan, headPose, segmentFor } from './faceScan.js';

// A synthetic 68-point face: jaw 0..100 wide, eyes at y=40, chin at y=100, nose tip where we put it.
function face({ noseX = 50, noseY = 65 } = {}) {
  const p = Array.from({ length: 68 }, () => ({ x: 50, y: 50 }));
  p[0] = { x: 0, y: 50 };
  p[16] = { x: 100, y: 50 };
  p[8] = { x: 50, y: 100 };
  for (let i = 36; i < 42; i++) p[i] = { x: 30, y: 40 };
  for (let i = 42; i < 48; i++) p[i] = { x: 70, y: 40 };
  p[30] = { x: noseX, y: noseY };
  return p;
}

const base = headPose(face());

test('headPose: straight ahead has no yaw; turning moves the nose', () => {
  assert.equal(base.yaw, 0);
  assert.ok(headPose(face({ noseX: 70 })).yaw > 0.15);
  assert.ok(headPose(face({ noseX: 30 })).yaw < -0.15);
  assert.ok(headPose(face({ noseY: 75 })).pitch > base.pitch); // tilted down
  assert.ok(headPose(face({ noseY: 55 })).pitch < base.pitch); // tilted up
});

test('segmentFor: centred is null; directions map to ring segments (mirrored preview)', () => {
  const opts = { segments: 8, mirror: true };
  assert.equal(segmentFor(headPose(face({ noseX: 52 })), base, opts), null); // tiny wobble
  // Nose to the image's right shows as a turn to the left on the mirrored preview: segment 4 (left).
  assert.equal(segmentFor(headPose(face({ noseX: 70 })), base, opts), 4);
  assert.equal(segmentFor(headPose(face({ noseX: 30 })), base, opts), 0); // right
  assert.equal(segmentFor(headPose(face({ noseY: 75 })), base, opts), 2); // down (SVG y grows downwards)
  assert.equal(segmentFor(headPose(face({ noseY: 55 })), base, opts), 6); // up
  assert.equal(segmentFor(headPose(face({ noseX: 70 })), base, { segments: 8, mirror: false }), 0);
});

test('createFaceScan: front first, then each direction once, done after enough of the circle', () => {
  const scan = createFaceScan({ segments: 8, required: 3, warmup: 2 });
  const add = (f) => scan.add(headPose(face(f)));
  assert.equal(add({}), null); // warming up
  assert.equal(add({}), 'center');
  assert.equal(add({ noseX: 30 }), 0);
  assert.equal(add({ noseX: 30 }), null); // same direction again: nothing new
  assert.equal(add({ noseY: 75 }), 2);
  assert.equal(scan.done, false);
  assert.equal(add({ noseX: 70 }), 4);
  assert.equal(scan.done, true);
  assert.deepEqual([...scan.filled].sort(), [0, 2, 4]);
});

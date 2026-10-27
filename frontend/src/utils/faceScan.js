// Face set-up like a phone's: the person moves their head in a slow circle and each direction they reach
// fills a segment of a ring. Pure maths on the 68 face landmarks, so it can be unit-tested without a camera.

const avg = (points) => ({ x: points.reduce((t, p) => t + p.x, 0) / points.length, y: points.reduce((t, p) => t + p.y, 0) / points.length });

// Rough head angle from 2D landmarks (68-point model: 0/16 jaw ends, 8 chin, 30 nose tip, 36-47 eyes).
// yaw: nose offset from the face's middle, as a share of face width (+ = towards the image's right).
// pitch: nose position between the eye line and the chin (larger = head tilted down).
export function headPose(points) {
  const [jawL, jawR, chin, nose] = [points[0], points[16], points[8], points[30]];
  const eyes = avg(points.slice(36, 48));
  const width = Math.hypot(jawR.x - jawL.x, jawR.y - jawL.y) || 1;
  return {
    yaw: (nose.x - (jawL.x + jawR.x) / 2) / width,
    pitch: (nose.y - eyes.y) / (chin.y - eyes.y || 1),
  };
}

// Which ring segment a pose points at, relative to the person's own straight-ahead pose; null = still centred.
// Segment 0 is on the right, numbering runs clockwise (SVG angles). mirror: the preview is shown mirrored,
// so the segment lights on the side the person actually turns towards on screen.
export function segmentFor(pose, base, { segments = 8, threshold = 0.1, pitchScale = 2, mirror = true } = {}) {
  const dx = (pose.yaw - base.yaw) * (mirror ? -1 : 1);
  const dy = (pose.pitch - base.pitch) * pitchScale; // pitch moves less than yaw for the same head turn
  if (Math.hypot(dx, dy) < threshold) return null;
  const step = (2 * Math.PI) / segments;
  return ((Math.round(Math.atan2(dy, dx) / step) % segments) + segments) % segments;
}

// Tracks one set-up: the first frames fix "straight ahead", then each newly reached direction is reported once.
// add(pose) returns 'center' when the front is captured, a segment number when a new one fills, else null.
export function createFaceScan({ segments = 8, required = 6, warmup = 3, ...options } = {}) {
  const filled = new Set();
  const warm = [];
  let base = null;
  return {
    segments,
    filled,
    add(pose) {
      if (!base) {
        warm.push(pose);
        if (warm.length < warmup) return null;
        base = { yaw: warm.reduce((t, p) => t + p.yaw, 0) / warm.length, pitch: warm.reduce((t, p) => t + p.pitch, 0) / warm.length };
        return 'center';
      }
      const seg = segmentFor(pose, base, { segments, ...options });
      if (seg === null || filled.has(seg)) return null;
      filled.add(seg);
      return seg;
    },
    get done() {
      return Boolean(base) && filled.size >= required;
    },
  };
}

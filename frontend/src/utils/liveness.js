const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Eye aspect ratio from the 6 eye landmarks of the 68-point model: drops sharply when the eye closes.
export function eyeAspectRatio(eye) {
  return (dist(eye[1], eye[5]) + dist(eye[2], eye[4])) / (2 * dist(eye[0], eye[3]));
}

// Blink = eyes clearly closed relative to the person's own open-eye level, then open again.
// Relative thresholds work across faces and cameras where a fixed EAR cut-off does not.
export function createBlinkDetector({ closeRatio = 0.7, openRatio = 0.85, warmupFrames = 3 } = {}) {
  let baseline = 0;
  let frames = 0;
  let closed = false;
  return (ear) => {
    frames++;
    if (!closed) baseline = Math.max(baseline, ear);
    if (frames <= warmupFrames) return false;
    if (!closed && ear < baseline * closeRatio) closed = true;
    else if (closed && ear > baseline * openRatio) return true;
    return false;
  };
}

import { useEffect, useRef, useState } from 'react';
import { Camera, Clock, LogIn, LogOut, MapPin, ScanFace } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../api/client';
import { Badge, Modal, Spinner, fmtTime, useApi } from './ui';
import { createBlinkDetector, eyeAspectRatio } from '../utils/liveness';
import { createFaceScan, headPose } from '../utils/faceScan';

// shortcut: models come from the public CDN; copy them into /public if the app must work offline.
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model';
const BLINK_TIMEOUT_MS = 10000;
let faceApiPromise;

// face-api is large, so it loads only when someone opens the camera.
function loadFaceApi() {
  faceApiPromise ??= import('@vladmandic/face-api').then(async (faceapi) => {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    return faceapi;
  });
  return faceApiPromise.catch((err) => {
    faceApiPromise = null;
    throw err;
  });
}

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location is not available in this browser'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => reject(new Error(e.code === 1 ? 'Location permission was denied' : 'Could not read your location')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

const SEGMENTS = 8; // directions around the face set-up ring
const REQUIRED_SEGMENTS = 6; // how much of the circle must be covered
const SETUP_TIMEOUT_MS = 40000;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Ring of ticks around the circular preview (phone-style face set-up); a tick lights when its direction is scanned.
function FaceRing({ filled, done }) {
  const ticks = 60;
  const step = (2 * Math.PI) / SEGMENTS;
  return (
    <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
      {Array.from({ length: ticks }, (_, i) => {
        const a = (i / ticks) * 2 * Math.PI;
        const segment = Math.round(a / step) % SEGMENTS;
        const lit = done || filled.has(segment);
        return (
          <line
            key={i}
            x1={50 + 44 * Math.cos(a)}
            y1={50 + 44 * Math.sin(a)}
            x2={50 + (lit ? 49 : 47.5) * Math.cos(a)}
            y2={50 + (lit ? 49 : 47.5) * Math.sin(a)}
            strokeWidth="1.4"
            strokeLinecap="round"
            className={`transition-all duration-300 ${lit ? 'stroke-teal' : 'stroke-slate-300 dark:stroke-slate-600'}`}
          />
        );
      })}
    </svg>
  );
}

// Camera check-in: the browser only detects the face and reads GPS; the server checks distance, accuracy and face match.
// The first time (no face set up yet) it opens the face set-up: the person turns their head in a slow circle and
// one face descriptor is saved per direction, so later check-ins match from any angle.
function CameraCheckIn({ open, onClose, onDone, faceEnrolled, onEnrolled }) {
  const videoRef = useRef(null);
  const closedRef = useRef(false);
  const [status, setStatus] = useState('Starting camera...');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState('checkin'); // 'setup' | 'checkin'
  const [filled, setFilled] = useState(() => new Set());
  const [setupDone, setSetupDone] = useState(false);
  // Read when the dialog opens only: finishing set-up flips faceEnrolled, which must not restart the camera.
  const enrolledRef = useRef(faceEnrolled);
  enrolledRef.current = faceEnrolled;

  useEffect(() => {
    if (!open) return;
    const enrolled = enrolledRef.current;
    let stream;
    closedRef.current = false;
    setReady(false);
    setFilled(new Set());
    setSetupDone(false);
    setMode(enrolled ? 'checkin' : 'setup');
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        if (closedRef.current) return stream.getTracks().forEach((t) => t.stop());
        videoRef.current.srcObject = stream;
        setStatus('Loading face detection...');
        await loadFaceApi();
        if (!closedRef.current) {
          setReady(true);
          setStatus(enrolled ? 'Look at the camera, then press Check in.' : 'First time: set up your face, then check in.');
        }
      } catch (err) {
        if (!closedRef.current) setStatus(err.name === 'NotAllowedError' ? 'Camera permission was denied.' : `Camera unavailable: ${err.message}`);
      }
    })();
    return () => {
      closedRef.current = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open]);

  const scan = async () => {
    const faceapi = await loadFaceApi();
    const faces = await faceapi.detectAllFaces(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 320 })).withFaceLandmarks().withFaceDescriptors();
    return { faceCount: faces.length, descriptor: faces.length === 1 ? Array.from(faces[0].descriptor) : undefined };
  };

  // Liveness: watch the eye landmarks until the person blinks once (a printed photo cannot).
  const waitForBlink = async () => {
    const faceapi = await loadFaceApi();
    const blinked = createBlinkDetector();
    const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224 });
    const deadline = Date.now() + BLINK_TIMEOUT_MS;
    while (Date.now() < deadline && !closedRef.current) {
      const faces = await faceapi.detectAllFaces(videoRef.current, options).withFaceLandmarks();
      if (faces.length === 1) {
        const { landmarks } = faces[0];
        const ear = (eyeAspectRatio(landmarks.getLeftEye()) + eyeAspectRatio(landmarks.getRightEye())) / 2;
        if (blinked(ear)) return true;
      }
      await wait(60);
    }
    return false;
  };

  const checkIn = async () => {
    setBusy(true);
    try {
      setStatus('Blink once to prove you are live...');
      const blinked = await waitForBlink();
      if (!blinked) throw new Error('No blink detected. Look at the camera and blink once, then try again.');
      setStatus('Detecting face...');
      const { faceCount, descriptor } = await scan();
      setStatus('Reading your location...');
      const pos = await getPosition();
      setStatus('Verifying with the server...');
      await api.post('/attendance/check-in', { source: 'camera', faceCount, descriptor, liveness: blinked, ...pos });
      toast.success('Checked in with camera');
      onDone();
      onClose();
    } catch (err) {
      setStatus(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // Face set-up: front first, then one descriptor for each new direction reached while circling the head.
  const setUpFace = async () => {
    setBusy(true);
    setSetupDone(false);
    setFilled(new Set());
    try {
      const faceapi = await loadFaceApi();
      const track = createFaceScan({ segments: SEGMENTS, required: REQUIRED_SEGMENTS });
      const fast = new faceapi.TinyFaceDetectorOptions({ inputSize: 224 });
      const sharp = new faceapi.TinyFaceDetectorOptions({ inputSize: 320 });
      const descriptors = [];
      const deadline = Date.now() + SETUP_TIMEOUT_MS;
      setStatus('Look straight at the camera...');
      while (!track.done && Date.now() < deadline && !closedRef.current) {
        const faces = await faceapi.detectAllFaces(videoRef.current, fast).withFaceLandmarks();
        if (faces.length !== 1) {
          setStatus(faces.length ? 'Only one face in the circle, please.' : 'Move your face into the circle.');
          await wait(80);
          continue;
        }
        const step = track.add(headPose(faces[0].landmarks.positions));
        if (step !== null) {
          const face = await faceapi.detectSingleFace(videoRef.current, sharp).withFaceLandmarks().withFaceDescriptor();
          if (face) descriptors.push(Array.from(face.descriptor));
          setFilled(new Set(track.filled));
          setStatus(`Move your head slowly in a circle (${track.filled.size}/${REQUIRED_SEGMENTS})`);
        }
        await wait(60);
      }
      if (closedRef.current) return;
      if (!track.done || descriptors.length < 3) {
        throw new Error('Not enough of the circle was scanned. Move your head slowly in a full circle and try again.');
      }
      setStatus('Saving your face...');
      await api.post('/attendance/face/enroll', { descriptors });
      setSetupDone(true);
      toast.success('Face set up. Camera check-ins will now match your face.');
      onEnrolled();
      setMode('checkin');
      setStatus('Face set up. Now check in: you will be asked to blink once.');
    } catch (err) {
      setStatus(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const setup = mode === 'setup';
  return (
    <Modal open={open} onClose={onClose} title={setup ? 'Set up your face' : 'Camera check-in'}>
      <div className="space-y-3">
        <div className="relative mx-auto aspect-square w-full max-w-72">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-[7%] h-[86%] w-[86%] rounded-full bg-slate-900 object-cover ring-1 ring-slate-300 dark:ring-slate-600"
            style={{ transform: 'scaleX(-1)' }}
          />
          <FaceRing filled={filled} done={setupDone || (!setup && faceEnrolled)} />
        </div>
        <p className="flex items-center justify-center gap-2 text-center text-sm text-slate-600 dark:text-slate-400" role="status">
          {(busy || !ready) && <Spinner className="h-4 w-4" />} {status}
        </p>
        <p className="text-xs text-slate-500">
          <MapPin className="mr-1 inline h-3 w-3" />
          {setup
            ? 'Set-up saves a face fingerprint (numbers, not a photo) from several angles. No image is stored.'
            : 'You will be asked to blink once (liveness). We send your location and a face fingerprint (numbers, not a photo). No image is stored.'}
        </p>
        <div className="flex flex-wrap gap-2">
          {setup ? (
            <button className="btn-primary flex-1" onClick={setUpFace} disabled={!ready || busy}>
              <ScanFace className="h-4 w-4" /> {busy ? 'Scanning...' : 'Start face set-up'}
            </button>
          ) : (
            <>
              <button className="btn-primary flex-1" onClick={checkIn} disabled={!ready || busy}>
                <Camera className="h-4 w-4" /> Check in
              </button>
              <button className="btn-secondary" onClick={() => setMode('setup')} disabled={!ready || busy} title="Scan your face again from all angles">
                <ScanFace className="h-4 w-4" /> Set up again
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

function useNow(intervalMs) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

const formatDuration = (ms) => {
  const mins = Math.max(0, Math.floor(ms / 60000));
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
};

export default function CheckInWidget({ onChange }) {
  const today = useApi('/attendance/today');
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);

  const refresh = () => {
    today.reload();
    onChange?.();
  };

  const act = async (path, body) => {
    setBusy(true);
    try {
      await api.post(path, body);
      toast.success(path.endsWith('in') ? 'Checked in' : 'Checked out');
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const record = today.data?.record;
  const working = record && !record.checkOut;
  // Display only: the server stamps the real check-in/out time.
  const now = useNow(1000);
  const workedMs = record ? (record.checkOut ? new Date(record.checkOut) : now) - new Date(record.checkIn) : 0;

  return (
    <div className="card flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand dark:bg-brand/15">
          <Clock className="h-7 w-7" />
        </span>
        <div>
          <p className="text-3xl font-bold text-navy tabular-nums dark:text-white" aria-live="off">
            {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
          <p className="text-xs text-slate-500">{now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
      </div>
      {/* min-w-48: on a phone this wraps under the clock at full width instead of squeezing beside it */}
      <div className="min-w-48 flex-1 sm:text-center">
        {today.loading && !today.data ? (
          <Spinner />
        ) : !record ? (
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">You have not checked in yet</p>
        ) : (
          <>
            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold sm:justify-center">
              In {fmtTime(record.checkIn)} · Out {fmtTime(record.checkOut)} <Badge value={record.status} />
            </p>
            <p className={`mt-0.5 flex flex-wrap items-center gap-x-2 text-sm tabular-nums sm:justify-center ${working ? 'text-teal-700 dark:text-teal' : 'text-muted'}`}>
              {working && <span className="h-2 w-2 animate-live rounded-full bg-teal" aria-hidden="true" />}
              {working ? 'Working for ' : 'Worked '}
              <strong>{formatDuration(workedMs)}</strong>
              <span className="text-xs text-slate-400"> · via {record.source}</span>
            </p>
          </>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {!record && (
          <>
            <button className="btn-primary" onClick={() => act('/attendance/check-in', { source: 'web' })} disabled={busy || today.loading}>
              <LogIn className="h-4 w-4" /> Check in
            </button>
            <button className="btn-secondary" onClick={() => setCamera(true)} disabled={busy}>
              <Camera className="h-4 w-4" /> Camera
            </button>
          </>
        )}
        {record && !record.checkOut && (
          <button className="btn-secondary" onClick={() => act('/attendance/check-out')} disabled={busy}>
            <LogOut className="h-4 w-4" /> Check out
          </button>
        )}
      </div>
      <CameraCheckIn open={camera} onClose={() => setCamera(false)} onDone={refresh} faceEnrolled={Boolean(today.data?.faceEnrolled)} onEnrolled={today.reload} />
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Camera, Clock, LogIn, LogOut, MapPin, ScanFace } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../api/client';
import { Badge, Modal, Spinner, fmtTime, useApi } from './ui';
import { createBlinkDetector, eyeAspectRatio } from '../utils/liveness';

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

// Camera check-in: the browser only detects the face and reads GPS; the server checks distance, accuracy and face match.
function CameraCheckIn({ open, onClose, onDone }) {
  const videoRef = useRef(null);
  const [status, setStatus] = useState('Starting camera...');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!open) return;
    let stream;
    let cancelled = false;
    setReady(false);
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        videoRef.current.srcObject = stream;
        setStatus('Loading face detection...');
        await loadFaceApi();
        if (!cancelled) {
          setReady(true);
          setStatus('Look at the camera, then press the button.');
        }
      } catch (err) {
        if (!cancelled) setStatus(err.name === 'NotAllowedError' ? 'Camera permission was denied.' : `Camera unavailable: ${err.message}`);
      }
    })();
    return () => {
      cancelled = true;
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
    while (Date.now() < deadline) {
      const faces = await faceapi.detectAllFaces(videoRef.current, options).withFaceLandmarks();
      if (faces.length === 1) {
        const { landmarks } = faces[0];
        const ear = (eyeAspectRatio(landmarks.getLeftEye()) + eyeAspectRatio(landmarks.getRightEye())) / 2;
        if (blinked(ear)) return true;
      }
      await new Promise((r) => setTimeout(r, 60));
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

  const enroll = async () => {
    setBusy(true);
    try {
      const { faceCount, descriptor } = await scan();
      if (faceCount !== 1) throw new Error(faceCount ? 'More than one face in the frame' : 'No face detected');
      await api.post('/attendance/face/enroll', { descriptor });
      toast.success('Face enrolled. Future camera check-ins must match it.');
      setStatus('Face enrolled.');
    } catch (err) {
      setStatus(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Camera check-in">
      <div className="space-y-3">
        <video ref={videoRef} autoPlay playsInline muted className="aspect-[4/3] w-full rounded-lg bg-slate-900 object-cover" style={{ transform: 'scaleX(-1)' }} />
        <p className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400" role="status">
          {(busy || !ready) && <Spinner className="h-4 w-4" />} {status}
        </p>
        <p className="text-xs text-slate-500">
          <MapPin className="mr-1 inline h-3 w-3" />
          You will be asked to blink once (liveness). We send your location and a face fingerprint (numbers, not a photo). No image is stored.
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary flex-1" onClick={checkIn} disabled={!ready || busy}>
            <Camera className="h-4 w-4" /> Check in
          </button>
          <button className="btn-secondary" onClick={enroll} disabled={!ready || busy} title="Save your face so check-ins must match it">
            <ScanFace className="h-4 w-4" /> Enroll my face
          </button>
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
      <CameraCheckIn open={camera} onClose={() => setCamera(false)} onDone={refresh} />
    </div>
  );
}

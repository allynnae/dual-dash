import { useEffect, useRef } from "react";
import { useSettings, InputMode } from "../state";
import { FilesetResolver, HandLandmarker, HandLandmarkerResult } from "@mediapipe/tasks-vision";
import modelUrl from "/mediapipe/hand_landmarker.task?url";

type JumpListener = () => void;
type LevelListener = (level: number) => void;
type PreviewTargets = { video: HTMLVideoElement | null; canvas: HTMLCanvasElement | null };

const jumpSubscribers = new Set<JumpListener>();
const levelSubscribers = new Set<LevelListener>();
let previewTargets: PreviewTargets = { video: null, canvas: null };

// Simple hand connections (Mediapipe Hands index pairs)
const HAND_CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4], // thumb
  [0, 5], [5, 6], [6, 7], [7, 8], // index
  [0, 9], [9, 10], [10, 11], [11, 12], // middle
  [0, 13], [13, 14], [14, 15], [15, 16], // ring
  [0, 17], [17, 18], [18, 19], [19, 20], // pinky
  [5, 9], [9, 13], [13, 17] // palm connections
];

export const emitJump = () => {
  jumpSubscribers.forEach((fn) => fn());
};

const emitLevel = (level: number) => {
  levelSubscribers.forEach((fn) => fn(level));
};

export const useInputBus = (mode: InputMode) => {
  useMotion(mode === "motion");
  useAudio(mode === "audio");
};

export const useJumpSubscription = (fn: JumpListener) => {
  useEffect(() => {
    jumpSubscribers.add(fn);
    return () => {
      jumpSubscribers.delete(fn);
    };
  }, [fn]);
};

export const useLevelSubscription = (fn: LevelListener) => {
  useEffect(() => {
    levelSubscribers.add(fn);
    return () => {
      levelSubscribers.delete(fn);
    };
  }, [fn]);
};

export const setMotionPreviewTargets = (video: HTMLVideoElement | null, canvas: HTMLCanvasElement | null) => {
  previewTargets = { video, canvas };
};

/* Audio */
const useAudio = (active: boolean) => {
  const threshold = useSettings((s) => s.audioThreshold);
  const setMode = useSettings((s) => s.setMode);
  useEffect(() => {
    if (!active) return;
    let ctx: AudioContext | null = null;
    let cleanup = () => {};
    const start = async () => {
      try {
        ctx = new AudioContext();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        let cooldown = 0;
        let lastEmit = 0;
        const tick = () => {
          if (!ctx) return;
          analyser.getByteTimeDomainData(data);
          const rms =
            Math.sqrt(
              data.reduce((acc, v) => {
                const centered = (v - 128) / 128;
                return acc + centered * centered;
              }, 0) / data.length
            ) || 0;
          const now = performance.now();
          if (now - lastEmit > 60) {
            emitLevel(Math.min(1, rms * 4)); // scale for UI visibility
            lastEmit = now;
          }
          if (rms > threshold && now > cooldown) {
            emitJump();
            cooldown = now + 200; // ms
          }
          raf = requestAnimationFrame(tick);
        };
        let raf = requestAnimationFrame(tick);
        cleanup = () => {
          cancelAnimationFrame(raf);
          stream.getTracks().forEach((t) => t.stop());
          ctx?.close();
          ctx = null;
        };
      } catch (err) {
        console.warn("Mic permission denied or unavailable", err);
        setMode("motion");
        window.dispatchEvent(new CustomEvent("input-fallback", { detail: "microphone denied, switched to motion" }));
        emitLevel(0);
      }
    };
    void start();
    return () => cleanup();
  }, [active, threshold]);
};

/* Motion (pinch) */
const useMotion = (active: boolean) => {
  const motionOn = useSettings((s) => s.motionOn);
  const motionOff = useSettings((s) => s.motionOff);
  const setMode = useSettings((s) => s.setMode);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const state = useRef({ active: false });
  const streamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!active) return;
    let mounted = true;
    let video: HTMLVideoElement | null = null;
    let cleanup = () => {};
    let triedRetry = false;

    const load = async () => {
      try {
        // Refresh stream if it died between runs
        if (streamRef.current && !streamRef.current.active) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }

        const fileset = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm"
        );
        const landmarker = await HandLandmarker.createFromOptions(fileset, {
          numHands: 1,
          runningMode: "VIDEO",
          baseOptions: {
            modelAssetPath: modelUrl
          }
        });
        landmarkerRef.current = landmarker;
        const ensureStream = async () => {
          if (!streamRef.current) {
            streamRef.current = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
              audio: false
            });
          }
          return streamRef.current;
        };
        const attachToPreview = async () => {
          const vid = previewTargets.video ?? localVideoRef.current ?? document.createElement("video");
          video = vid;
          if (!localVideoRef.current) {
            localVideoRef.current = vid;
            vid.style.position = "absolute";
            vid.style.opacity = "0";
          }
          vid.autoplay = true;
          vid.playsInline = true;
          vid.muted = true;
          const stream = await ensureStream();
          vid.srcObject = stream;
          await new Promise<void>((resolve) => {
            if (vid.readyState >= 1 && vid.videoWidth > 0) return resolve();
            const handler = () => {
              vid.removeEventListener("loadedmetadata", handler);
              resolve();
            };
            vid.addEventListener("loadedmetadata", handler);
            setTimeout(resolve, 400);
          });
          try {
            await vid.play();
          } catch (e: any) {
            if (e?.name === "AbortError") {
              console.warn("Video play aborted (benign), continuing.");
            } else {
              throw e;
            }
          }
          // If a preview target exists and wasn't the video we used, also pipe the stream there.
          if (previewTargets.video && previewTargets.video !== vid) {
            const pv = previewTargets.video;
            pv.srcObject = stream;
            pv.autoplay = true;
            pv.playsInline = true;
            pv.muted = true;
            try {
              await pv.play();
            } catch (e) {
              console.warn("Preview video play failed (non-fatal)", e);
            }
          }
        };

        await attachToPreview();

        let last = performance.now();
        const loop = async () => {
          if (!mounted) return;
          const currentVideo = video;
          if (!currentVideo) {
            raf = requestAnimationFrame(loop);
            return;
          }
          const now = performance.now();
          if (currentVideo.readyState < 2 || currentVideo.videoWidth === 0 || currentVideo.videoHeight === 0) {
            raf = requestAnimationFrame(loop);
            return;
          }
          currentVideo.width = currentVideo.videoWidth;
          currentVideo.height = currentVideo.videoHeight;
          const res: HandLandmarkerResult | null = landmarker.detectForVideo(currentVideo, now) as any;
          const landmarks = res?.landmarks?.[0];
          const canvas = previewTargets.canvas;
          const ctx = canvas?.getContext("2d");
          if (canvas && ctx && currentVideo.videoWidth > 0 && currentVideo.videoHeight > 0) {
            canvas.width = currentVideo.videoWidth;
            canvas.height = currentVideo.videoHeight;
            ctx.drawImage(currentVideo, 0, 0, canvas.width, canvas.height);
            if (landmarks) {
              ctx.lineWidth = 2;
              ctx.strokeStyle = "#1af8ff";
              HAND_CONNECTIONS.forEach(([a, b]) => {
                const pa = landmarks[a];
                const pb = landmarks[b];
                if (pa && pb) {
                  ctx.beginPath();
                  ctx.moveTo(pa.x * canvas.width, pa.y * canvas.height);
                  ctx.lineTo(pb.x * canvas.width, pb.y * canvas.height);
                  ctx.stroke();
                }
              });
              ctx.fillStyle = "#ff55aa";
              landmarks.forEach((p) => {
                ctx.beginPath();
                ctx.arc(p.x * canvas.width, p.y * canvas.height, 3, 0, Math.PI * 2);
                ctx.fill();
              });
            }
          }
          if (landmarks) {
            const thumb = landmarks[4];
            const index = landmarks[8];
            const dx = thumb.x - index.x;
            const dy = thumb.y - index.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (!state.current.active && dist < motionOn) {
              state.current.active = true;
              emitJump();
            } else if (state.current.active && dist > motionOff) {
              state.current.active = false;
            }
          }
          last = now;
          raf = requestAnimationFrame(loop);
        };
        let raf = requestAnimationFrame(loop);
        cleanup = () => {
          cancelAnimationFrame(raf);
          landmarker.close();
          landmarkerRef.current = null;
          streamRef.current?.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          if (video) {
            video.pause();
            video.srcObject = null;
          }
        };
      } catch (err: any) {
        console.warn("Camera permission denied or motion setup failed", err);
        if (err?.name === "AbortError") {
          console.warn("Ignoring AbortError during video play");
        } else {
          const stream = streamRef.current;
          stream?.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          if (!triedRetry && mounted) {
            triedRetry = true;
            setTimeout(() => {
              if (mounted) void load();
            }, 600);
          } else {
            setMode("audio");
            window.dispatchEvent(new CustomEvent("input-fallback", { detail: "camera denied, switched to audio" }));
          }
        }
      }
    };
    void load();
    return () => {
      mounted = false;
      cleanup();
    };
  }, [active, motionOn, motionOff]);
};

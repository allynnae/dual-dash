import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { GameCanvas } from "./components/GameCanvas";
import { Difficulty, InputMode, useSettings, useStats } from "./state";
import ParticleBackground from "./components/ParticleBackground";
import GameTitle from "./components/GameTitle";

const modes: { id: InputMode; label: string; desc: string; requires: string }[] = [
  { id: "motion", label: "Motion Tracking", desc: "Pinch (thumb + index)", requires: "Requires camera" },
  { id: "audio", label: "Audio Tracking", desc: "Clap or shout", requires: "Requires microphone" }
];

const diffs: Difficulty[] = ["Easy", "Medium", "Hard"];

export default function App() {
  const settings = useSettings();
  const stats = useStats();
  const [showStats, setShowStats] = useState(false);
  const [showTuning, setShowTuning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [stage, setStage] = useState<"landing" | "select" | "playing">("landing");
  const [permissionState, setPermissionState] = useState<"idle" | "requesting" | "error">("idle");
  const [permissionMessage, setPermissionMessage] = useState("");

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as string;
      setToast(detail);
      setTimeout(() => setToast(null), 3200);
    };
    window.addEventListener("input-fallback", handler as EventListener);
    return () => window.removeEventListener("input-fallback", handler as EventListener);
  }, []);

  const resetPermissionState = () => {
    setPermissionState("idle");
    setPermissionMessage("");
  };

  const startGame = () => {
    resetPermissionState();
    setStage("select");
  };

  const startRun = async () => {
    if (permissionState === "requesting") return;
    const mode = settings.mode;
    const label = mode === "motion" ? "camera" : "microphone";
    setPermissionState("requesting");
    setPermissionMessage(`Requesting ${label} permission...`);
    const constraints = mode === "motion" ? { video: { facingMode: "user" }, audio: false } : { audio: true, video: false };

    // Race the request against a short timeout so the button can't get stuck if the browser suppresses the prompt.
    const controller = { cancelled: false };
    const request = navigator.mediaDevices.getUserMedia(constraints);
    request.catch(() => {
      /* handled below to avoid unhandled rejection */
    });

    const timeoutMs = 7000;
    const timeout = new Promise<MediaStream>((_, reject) => {
      setTimeout(() => {
        controller.cancelled = true;
        reject(new Error("permission-timeout"));
      }, timeoutMs);
    });

    try {
      const stream = await Promise.race([request, timeout]);
      if (!controller.cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        resetPermissionState();
        setStage("playing");
      }
    } catch (err: any) {
      console.warn("Permission request failed", err);
      const timedOut = err?.message === "permission-timeout";
      const msg = timedOut
        ? `Browser didn't show the ${label} prompt. Please try again and allow access.`
        : `Please allow ${label} access to start the run.`;
      setPermissionState("error");
      setPermissionMessage(msg);
      setToast(msg);
    }
  };

  const exitToHome = () => {
    resetPermissionState();
    setStage("landing");
  };

  return (
    <>
      <ParticleBackground />
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-10">
        {stage === "landing" && (
          <div className="text-center space-y-10">
            <GameTitle />
            <div className="flex justify-center gap-3">
              <button
                className="px-8 py-3 rounded-full bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 text-slate-900 font-semibold shadow-lg hover:scale-105 transition"
                onClick={startGame}
              >
                ▶ Play
              </button>
              <button className="px-6 py-3 rounded-full bg-white/5 border border-white/10 text-white" onClick={() => setShowStats(true)}>
                Stats
              </button>
              <button className="px-6 py-3 rounded-full bg-white/5 border border-white/10 text-white" onClick={() => setShowTuning(true)}>
                Tuning
              </button>
            </div>
            <p className="text-slate-300">Tap to start your journey</p>
          </div>
        )}

        {stage === "select" && (
          <div className="w-full max-w-4xl bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-md space-y-8">
            <button className="text-slate-300" onClick={() => { resetPermissionState(); setStage("landing"); }}>
              ← Back
            </button>
            <div className="text-center space-y-2">
              <h2 className="text-4xl font-display text-glow-pink">
                <span className="text-neon-cyan">Select</span> <span className="text-neon-pink">Level</span>
              </h2>
              <p className="text-slate-400">Configure your run</p>
            </div>

            <div className="space-y-4">
              <p className="text-slate-300">Difficulty</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {diffs.map((d) => (
                  <button
                    key={d}
                    onClick={() => settings.setDifficulty(d)}
                    className={`rounded-2xl border px-6 py-6 text-left transition ${
                      settings.difficulty === d ? "neon-border-cyan bg-white/5" : "border-white/10 bg-white/5"
                    }`}
                  >
                    <div className="text-lg font-semibold">{d}</div>
                    <div className="text-slate-400 text-sm">{d === "Easy" ? "Chill ride" : d === "Medium" ? "Balanced" : "Spicy"}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-slate-300">Controller</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {modes.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => settings.setMode(m.id)}
                    className={`rounded-2xl border px-6 py-5 text-left transition ${
                      settings.mode === m.id ? "neon-border-pink bg-white/5" : "border-white/10 bg-white/5"
                    }`}
                  >
                    <div className="text-lg font-semibold">{m.label}</div>
                    <div className="text-slate-400 text-sm">{m.desc}</div>
                    <div className="text-xs uppercase tracking-wide mt-2 text-slate-400">{m.requires}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="text-center">
              <button
                className="w-full md:w-auto px-10 py-3 rounded-full bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 text-slate-900 font-bold shadow-lg hover:scale-105 transition"
                onClick={startRun}
                disabled={permissionState === "requesting"}
              >
                {permissionState === "requesting" ? "Requesting..." : "START RUN"}
              </button>
              {permissionMessage && (
                <p className={`mt-3 text-sm ${permissionState === "error" ? "text-rose-300" : "text-slate-300"}`}>
                  {permissionMessage}
                </p>
              )}
            </div>
          </div>
        )}

        {stage === "playing" && <GameCanvas mode={settings.mode} difficulty={settings.difficulty} onHome={exitToHome} />}
      </div>

      {showStats && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowStats(false)}>
          <div className="absolute inset-0 pointer-events-none">
            <ParticleBackground />
          </div>
          <motion.div
            className="relative z-10 w-full max-w-4xl bg-black/60 border border-white/10 rounded-3xl p-8 space-y-6"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="text-slate-300" onClick={() => setShowStats(false)}>← Back</button>
            <div className="space-y-1">
              <h2 className="text-4xl font-display text-glow-cyan">Stats</h2>
              <p className="text-slate-400">Your performance across all levels</p>
            </div>
            <div className="space-y-4">
              {diffs.map((d) => (
                <div key={d} className={`rounded-2xl p-5 border bg-white/5 ${d === "Easy" ? "neon-border-cyan" : d === "Medium" ? "neon-border-purple" : "neon-border-pink"}`}>
                  <div className="flex items-center justify-between text-lg font-semibold">
                    <span className="font-display">{d}</span>
                  </div>
                  <p className="text-slate-400 text-sm">
                    Best motion run: {stats.bestByMode[d]?.motion ?? "—"} attempts
                  </p>
                  <p className="text-slate-400 text-sm">
                    Best audio run: {stats.bestByMode[d]?.audio ?? "—"} attempts
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      )}

      {showTuning && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowTuning(false)}>
          <div className="absolute inset-0 pointer-events-none">
            <ParticleBackground />
          </div>
          <motion.div
            className="relative z-10 w-full max-w-4xl bg-black/60 border border-white/10 rounded-3xl p-8 space-y-6"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="text-slate-300" onClick={() => setShowTuning(false)}>← Back</button>
            <div className="space-y-1">
              <h2 className="text-4xl font-display text-glow-pink">Tuning</h2>
              <p className="text-slate-400">Controller sensitivity settings</p>
            </div>

            <div className="space-y-5">
              <div className="rounded-2xl p-5 border bg-white/5 neon-border-cyan">
                <div className="text-lg font-display mb-3 text-neon-cyan">🖐 Motion Pinch Thresholds</div>
                <p className="text-slate-400 text-sm mb-3">Smaller = more sensitive</p>
                <label className="text-slate-300 text-sm">
                  On <span className="float-right text-slate-200">{settings.motionOn.toFixed(3)}</span>
                </label>
                <p className="text-slate-400 text-xs mb-2">Distance where a pinch fires a jump. Lower = more sensitive.</p>
                <input
                  type="range"
                  min="0.01"
                  max="0.1"
                  step="0.005"
                  value={settings.motionOn}
                  onChange={(e) => settings.setMotion(Number(e.target.value), settings.motionOff)}
                  className="w-full accent-cyan-300"
                />
                <label className="text-slate-300 text-sm mt-3 block">
                  Off <span className="float-right text-slate-200">{settings.motionOff.toFixed(3)}</span>
                </label>
                <p className="text-slate-400 text-xs mb-2">Distance to release the pinch. Higher = keeps “pressed” longer.</p>
                <input
                  type="range"
                  min="0.02"
                  max="0.12"
                  step="0.005"
                  value={settings.motionOff}
                  onChange={(e) => settings.setMotion(settings.motionOn, Number(e.target.value))}
                  className="w-full accent-purple-400"
                />
              </div>

              <div className="rounded-2xl p-5 border bg-white/5 neon-border-pink">
                <div className="text-lg font-display mb-3 text-neon-pink">🎤 Audio Threshold</div>
                <p className="text-slate-400 text-sm mb-3">Higher = less sensitive</p>
                <label className="text-slate-300 text-sm">Threshold <span className="float-right text-slate-200">{settings.audioThreshold.toFixed(2)}</span></label>
                <input
                  type="range"
                  min="0.02"
                  max="0.2"
                  step="0.005"
                  value={settings.audioThreshold}
                  onChange={(e) => settings.setAudioThreshold(Number(e.target.value))}
                  className="w-full accent-pink-400"
                />
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {toast && (
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 10, opacity: 0 }}
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            background: "rgba(0,0,0,0.65)",
            border: "1px solid var(--stroke)",
            borderRadius: 10,
            padding: "12px 16px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
            zIndex: 10
          }}
        >
          {toast}
        </motion.div>
      )}
    </>
  );
}



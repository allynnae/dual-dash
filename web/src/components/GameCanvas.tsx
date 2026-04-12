import { useEffect, useMemo, useRef, useState } from "react";
import { createGame, GameHandles } from "../game/createGame";
import { Difficulty, InputMode, useSettings, useStats } from "../state";
import { useInputBus, useJumpSubscription } from "../input/useInputBus";
import { useAudioLevel } from "../hooks/useAudioLevel";
import { useMotionPreviewRefs } from "../hooks/useMotionPreview";
import ParticleBackground from "./ParticleBackground";

type Props = {
  mode: InputMode;
  difficulty: Difficulty;
  onHome: () => void;
};

export const GameCanvas = ({ mode, difficulty, onHome }: Props) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<GameHandles | null>(null);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const setAttempts = useStats((s) => s.setAttempts);
  const setBest = useStats((s) => s.setBest);
  const difficultyRef = useRef<Difficulty>(difficulty);
  const attemptsMap = useStats((s) => s.attempts);
  const attemptsByMode = useStats((s) => s.attemptsByMode);
  const audioLevel = useAudioLevel();
  const { videoRef, canvasRef } = useMotionPreviewRefs();
  const setDifficulty = useSettings((s) => s.setDifficulty);
  const difficulties = useMemo<Difficulty[]>(() => ["Easy", "Medium", "Hard"], []);
  const formattedMode = useMemo(() => (mode === "motion" ? "Motion" : "Audio"), [mode]);
  const nextDifficulty = useMemo(() => {
    const idx = difficulties.indexOf(difficulty);
    return idx >= 0 && idx < difficulties.length - 1 ? difficulties[idx + 1] : null;
  }, [difficulty, difficulties]);
  const [showComplete, setShowComplete] = useState(false);

  useInputBus(mode);

  useJumpSubscription(() => {
    gameRef.current?.jump();
  });

  useEffect(() => {
    if (!containerRef.current) return;
    gameRef.current = createGame(
      containerRef.current,
      difficulty,
      (p) => setProgress(p),
      (n) => {
        setAttempts(difficultyRef.current, mode, n);
      },
      () => {
        setShowComplete(true);
        setProgress(1);
        const attemptsVal = Math.max(
          1,
          attemptsByMode[difficultyRef.current]?.[mode] ?? attemptsMap[difficultyRef.current] ?? 1
        );
        setBest(difficultyRef.current, mode, attemptsVal);
      }
    );
    return () => {
      gameRef.current?.destroy();
    };
  }, []);

  useEffect(() => {
    difficultyRef.current = difficulty;
    gameRef.current?.setDifficulty(difficulty);
  }, [difficulty]);

  const handleHome = () => {
    gameRef.current?.goHome();
    onHome();
    setShowComplete(false);
    setPaused(false);
  };

  const handleNext = () => {
    if (!nextDifficulty) return;
    setShowComplete(false);
    setPaused(false);
    setDifficulty(nextDifficulty);
    gameRef.current?.setDifficulty(nextDifficulty);
  };

  return (
    <div className="relative w-full max-w-5xl aspect-[16/9] rounded-2xl border border-white/10 bg-transparent overflow-hidden shadow-2xl backdrop-blur">
      <ParticleBackground />
      <div ref={containerRef} className="w-full h-full" style={{ background: "transparent" }} />
      <div className="absolute top-3 left-3 right-3 flex flex-col gap-2 text-white text-sm pointer-events-none">
        <div className="flex items-center gap-3 pointer-events-auto">
          <div className="flex gap-2">
            <span className="px-3 py-1 rounded-full bg-white/10 border border-white/15">Mode: <strong>{formattedMode}</strong></span>
            <span className="px-3 py-1 rounded-full bg-white/10 border border-white/15">Difficulty: {difficulty}</span>
            <span className="px-3 py-1 rounded-full bg-white/10 border border-white/15">Attempt {attemptsMap[difficulty] ?? 0}</span>
          </div>
          <div className="flex gap-2 ml-2">
            <button
              className="w-10 h-10 rounded-full flex items-center justify-center border border-white/20 bg-white/10 hover:bg-white/20 transition"
              aria-label="Pause/Play"
              onClick={() => {
                gameRef.current?.togglePause();
                setPaused((p) => !p);
              }}
            >
              {paused ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              )}
            </button>
            <button
              className="w-10 h-10 rounded-full flex items-center justify-center border border-white/20 bg-white/10 hover:bg-white/20 transition"
              aria-label="Home"
              onClick={() => {
                gameRef.current?.goHome();
                onHome();
                setPaused(false);
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 10.5 12 4l9 6.5" />
                <path d="M5 12v8h5v-5h4v5h5v-8" />
              </svg>
            </button>
          </div>
          <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden pointer-events-auto">
            <div className="h-full bg-gradient-to-r from-cyan-400 to-pink-500" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
        {mode === "audio" && (
          <div className="flex items-center gap-3 text-xs text-slate-200 pointer-events-auto pl-1">
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-white/10 border border-white/15 text-slate-200">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 9v6h4l5 4V5l-5 4H5z" />
                <path d="M15.5 8.5a4.5 4.5 0 0 1 0 7" />
              </svg>
            </div>
            <div className="w-40 h-2 rounded-full bg-white/10 overflow-hidden border border-white/10">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-pink-400 transition-[width] duration-75"
                style={{ width: `${Math.min(100, Math.round(audioLevel * 100))}%` }}
              />
            </div>
          </div>
        )}
        {mode === "motion" && (
          <div className="flex items-center gap-3 text-xs text-slate-200 pointer-events-auto pl-1">
            <div className="relative w-40 h-24 rounded-lg overflow-hidden border border-cyan-400/40 bg-black/30">
              <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted playsInline />
              <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
            </div>
          </div>
        )}
      </div>

      {showComplete && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-sm pointer-events-auto">
          <div className="relative w-full max-w-xl bg-white/5 border border-white/15 rounded-3xl p-8 shadow-2xl">
            <div className="absolute -top-16 left-0 right-0 flex justify-center">
              <div className="font-display text-4xl md:text-5xl font-black tracking-[0.16em] drop-shadow-[0_0_18px_rgba(26,248,255,0.65)] flex items-center justify-center gap-3">
                <span className="text-neon-cyan">LEVEL</span>
                <span className="text-neon-pink">COMPLETE!</span>
              </div>
            </div>
            <div className="mt-6 text-center space-y-4 text-white">
              <p className="text-sm text-slate-300">
                Nice run. Ready for {nextDifficulty ? `${nextDifficulty}` : "a breather"}?
              </p>
              <div className="flex items-center justify-center gap-4 mt-2">
                <button
                  className="px-5 py-3 rounded-2xl bg-white/10 border border-white/20 text-white font-semibold hover:bg-white/15 transition shadow-lg"
                  onClick={handleHome}
                >
                  Home
                </button>
                {nextDifficulty && (
                  <button
                    className="px-5 py-3 rounded-2xl bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 text-slate-900 font-bold shadow-lg hover:scale-105 transition flex items-center gap-2"
                    onClick={handleNext}
                  >
                    Next
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 12h14" />
                      <path d="m13 6 6 6-6 6" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import { create } from "zustand";

export type InputMode = "motion" | "audio";
export type Difficulty = "Easy" | "Medium" | "Hard";

export interface SettingsState {
  mode: InputMode;
  difficulty: Difficulty;
  audioThreshold: number;
  motionOn: number;
  motionOff: number;
  setMode: (m: InputMode) => void;
  setDifficulty: (d: Difficulty) => void;
  setAudioThreshold: (t: number) => void;
  setMotion: (on: number, off: number) => void;
}

export interface StatsState {
  attempts: Record<Difficulty, number>;
  attemptsByMode: Record<Difficulty, Record<InputMode, number>>;
  bestByMode: Record<Difficulty, Record<InputMode, number | null>>;
  setAttempts: (d: Difficulty, mode: InputMode, n: number) => void;
  setBest: (d: Difficulty, mode: InputMode, attempts: number) => void;
  resetAttempts: (d?: Difficulty, mode?: InputMode) => void;
}

const SETTINGS_KEY = "dual-dash-web-settings";

const loadSettings = (): Partial<SettingsState> => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

const persist = (s: SettingsState) => {
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({
      mode: s.mode,
      difficulty: s.difficulty,
      audioThreshold: s.audioThreshold,
      motionOn: s.motionOn,
      motionOff: s.motionOff
    })
  );
};

export const useSettings = create<SettingsState>((set, get) => ({
  mode: "motion",
  difficulty: "Easy",
  audioThreshold: 0.08,
  motionOn: 0.03,
  motionOff: 0.05,
  ...loadSettings(),
  setMode: (mode) => set((state) => {
    const next = { ...state, mode };
    persist(next as SettingsState);
    return next;
  }),
  setDifficulty: (difficulty) => set((state) => {
    const next = { ...state, difficulty };
    persist(next as SettingsState);
    return next;
  }),
  setAudioThreshold: (audioThreshold) => set((state) => {
    const next = { ...state, audioThreshold };
    persist(next as SettingsState);
    return next;
  }),
  setMotion: (on, off) => set((state) => {
    const next = { ...state, motionOn: on, motionOff: off };
    persist(next as SettingsState);
    return next;
  })
}));

export const useStats = create<StatsState>((set) => ({
  attempts: {
    Easy: 0,
    Medium: 0,
    Hard: 0
  },
  attemptsByMode: {
    Easy: { motion: 0, audio: 0 },
    Medium: { motion: 0, audio: 0 },
    Hard: { motion: 0, audio: 0 }
  },
  bestByMode: {
    Easy: { motion: null, audio: null },
    Medium: { motion: null, audio: null },
    Hard: { motion: null, audio: null }
  },
  setAttempts: (d, mode, n) =>
    set((s) => ({
      attempts: { ...s.attempts, [d]: n },
      attemptsByMode: {
        ...s.attemptsByMode,
        [d]: { ...s.attemptsByMode[d], [mode]: n }
      }
    })),
  setBest: (d, mode, attempts) =>
    set((s) => {
      const current = s.bestByMode[d][mode];
      if (current !== null && current <= attempts) return s;
      return {
        ...s,
        bestByMode: {
          ...s.bestByMode,
          [d]: { ...s.bestByMode[d], [mode]: attempts }
        }
      };
    }),
  resetAttempts: (d, mode) =>
    set((s) => {
      const nextAttempts = { ...s.attempts };
      const nextByMode = {
        Easy: { ...s.attemptsByMode.Easy },
        Medium: { ...s.attemptsByMode.Medium },
        Hard: { ...s.attemptsByMode.Hard }
      };
      const nextBest = {
        Easy: { ...s.bestByMode.Easy },
        Medium: { ...s.bestByMode.Medium },
        Hard: { ...s.bestByMode.Hard }
      };
      if (!d) {
        nextAttempts.Easy = nextAttempts.Medium = nextAttempts.Hard = 0;
        nextByMode.Easy = { motion: 0, audio: 0 };
        nextByMode.Medium = { motion: 0, audio: 0 };
        nextByMode.Hard = { motion: 0, audio: 0 };
        nextBest.Easy = { motion: null, audio: null };
        nextBest.Medium = { motion: null, audio: null };
        nextBest.Hard = { motion: null, audio: null };
      } else {
        nextAttempts[d] = 0;
        if (!mode) {
          nextByMode[d] = { motion: 0, audio: 0 };
          nextBest[d] = { motion: null, audio: null };
        } else {
          nextByMode[d][mode] = 0;
          nextBest[d][mode] = null;
        }
      }
      return { attempts: nextAttempts, attemptsByMode: nextByMode, bestByMode: nextBest };
    })
}));

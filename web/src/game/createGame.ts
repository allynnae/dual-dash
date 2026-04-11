import Phaser from "phaser";
import { RunnerScene } from "./RunnerScene";
import { Difficulty } from "../state";
import bgmUrl from "/assets/arcade-background.mp3";
import startUrl from "/assets/game-start.mp3";
import overUrl from "/assets/game-over.mp3";

export type GameHandles = {
  setDifficulty: (d: Difficulty) => void;
  getAttempts: () => number;
  togglePause: () => void;
  goHome: () => void;
  jump: () => void;
  destroy: () => void;
};

export const createGame = (
  parent: HTMLElement,
  difficulty: Difficulty,
  onProgress: (p: number) => void,
  onAttempt: (n: number) => void,
  onComplete: () => void
): GameHandles => {
  const audioKeys = {
    bgm: bgmUrl,
    start: startUrl,
    over: overUrl
  };
  let audioUnlockCleanup: (() => void) | null = null;

  const installAudioUnlock = (game: Phaser.Game, tryPlayBgm: () => void) => {
    if (audioUnlockCleanup) return;
    const unlock = async () => {
      const sm = game.sound as Phaser.Sound.WebAudioSoundManager;
      const ctx = sm?.context;
      if (!ctx) return;
      try {
        if (sm.locked) sm.unlock();
        if (ctx.state === "suspended") await ctx.resume();
        const buffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
        source.stop(0);
        tryPlayBgm();
        cleanup();
      } catch (err) {
        console.warn("Audio unlock failed, will retry on next gesture", err);
        window.dispatchEvent(new CustomEvent("input-fallback", { detail: "Click to enable sound" }));
      }
    };
    const resumeIfVisible = () => {
      const sm = game.sound as Phaser.Sound.WebAudioSoundManager;
      const ctx = sm?.context;
      if (!ctx) return;
      if (document.visibilityState === "visible") {
        ctx.resume().catch(() => {});
        tryPlayBgm();
      }
    };
    const events: Array<[Window | Document, string, EventListener]> = [
      [window, "pointerdown", unlock],
      [window, "touchstart", unlock],
      [window, "keydown", unlock],
      [document, "visibilitychange", resumeIfVisible],
      [window, "pageshow", resumeIfVisible]
    ];
    const cleanup = () => {
      events.forEach(([target, evt, handler]) => target.removeEventListener(evt, handler));
      audioUnlockCleanup = null;
    };
    events.forEach(([target, evt, handler]) => target.addEventListener(evt, handler, { passive: true } as any));
    audioUnlockCleanup = cleanup;
  };

  class PreloadScene extends Phaser.Scene {
    constructor() {
      super("preload");
    }
    preload() {
      const g = this.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0xffffff, 1);
      g.fillCircle(32, 32, 32);
      g.generateTexture("glow", 64, 64);
      this.load.audio("bgm", audioKeys.bgm);
      this.load.audio("start", audioKeys.start);
      this.load.audio("over", audioKeys.over);

      this.load.on("loaderror", (file: any) => {
        if (file?.key && audioKeys[file.key as keyof typeof audioKeys]) {
          window.dispatchEvent(new CustomEvent("input-fallback", { detail: `Audio load failed for ${file.key}, retrying` }));
        }
      });
    }
    create() {
      const keys = Object.keys(audioKeys);
      const reloadIfMissing = () => {
        const missing = keys.filter((k) => !this.sound.get(k));
        if (missing.length === 0) {
          this.scene.start("runner");
          return;
        }
        missing.forEach((k) => this.load.audio(k, audioKeys[k as keyof typeof audioKeys]));
        this.load.once("complete", () => {
          const stillMissing = keys.filter((k) => !this.sound.get(k));
          if (stillMissing.length) {
            window.dispatchEvent(
              new CustomEvent("input-fallback", { detail: `Audio load failed for: ${stillMissing.join(", ")}` })
            );
          }
          this.scene.start("runner");
        });
        this.load.start();
      };
      reloadIfMissing();
    }
  }

  const runner = new RunnerScene({ difficulty, onProgress, onAttempt, onComplete });

  const tryPlayBgm = () => {
    const s = runner.sound;
    if (!(s instanceof Phaser.Sound.WebAudioSoundManager)) return;
    const ctx = s.context;
    if (ctx?.state === "suspended") ctx.resume().catch(() => {});
    const existing = s.get("bgm") as Phaser.Sound.WebAudioSound | undefined;
    if (existing) {
      if (!existing.isPlaying) existing.play();
      else existing.resume();
    }
  };

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    width: 960,
    height: 540,
    parent,
    backgroundColor: "#0b0d1c",
    audio: {
      disableWebAudio: false,
      noAudio: false
    },
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    pixelArt: true,
    physics: { default: "arcade" },
    scene: [PreloadScene, runner]
  });

  installAudioUnlock(game, tryPlayBgm);

  return {
    setDifficulty: (d: Difficulty) => runner.setDifficulty(d),
    getAttempts: () => runner.attempts,
    togglePause: () => runner.togglePause(),
    goHome: () => runner.goHome(),
    jump: () => runner.externalJump(),
    destroy: () => {
      audioUnlockCleanup?.();
      game.destroy(true);
    }
  };
};

import Phaser from "phaser";
import { RunnerScene } from "./RunnerScene";
import { Difficulty } from "../state";

const bgmUrl = `${import.meta.env.BASE_URL}assets/arcade-background.mp3`;
const startUrl = `${import.meta.env.BASE_URL}assets/game-start.mp3`;
const overUrl = `${import.meta.env.BASE_URL}assets/game-over.mp3`;
const jumpUrl = `${import.meta.env.BASE_URL}assets/jump.mp3`;

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
    over: overUrl,
    jump: jumpUrl
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
        window.dispatchEvent(
          new CustomEvent("input-fallback", { detail: "Click to enable sound" })
        );
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
      events.forEach(([target, evt, handler]) =>
        target.removeEventListener(evt, handler)
      );
      audioUnlockCleanup = null;
    };

    events.forEach(([target, evt, handler]) =>
      target.addEventListener(evt, handler, { passive: true } as AddEventListenerOptions)
    );

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
      this.load.audio("jump", audioKeys.jump);

      this.load.on("loaderror", (file: Phaser.Loader.File) => {
        console.error("Audio load error:", file?.key, file?.src);
        window.dispatchEvent(
          new CustomEvent("input-fallback", {
            detail: `Audio load failed for ${file?.key ?? "unknown"}`
          })
        );
      });
    }

    create() {
      this.scene.start("runner");
    }
  }

  const runner = new RunnerScene({ difficulty, onProgress, onAttempt, onComplete });

  const tryPlayBgm = () => {
    const s = runner.sound;
    if (!(s instanceof Phaser.Sound.WebAudioSoundManager)) return;

    const ctx = s.context;
    if (ctx?.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    if (runner.bgm && !runner.bgm.isPlaying) {
      runner.bgm.play();
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

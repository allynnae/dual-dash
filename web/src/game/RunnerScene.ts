import Phaser from "phaser";
import { Difficulty } from "../state";

type RunnerOpts = {
  difficulty: Difficulty;
  onProgress: (p: number) => void;
  onAttempt: (attempts: number) => void;
  onComplete: () => void;
};

type DifficultyConf = {
  speed: number;
  levelSeconds: number;
  patterns: Array<"single" | "double" | "triple" | "stair" | "tall" | "platform">;
  gap: [number, number];
};

const configs: Record<Difficulty, DifficultyConf> = {
  Easy: { speed: 280, levelSeconds: 45, patterns: ["single", "double"], gap: [190, 230] },
  Medium: {
    speed: 330,
    levelSeconds: 40,
    patterns: ["single", "double", "triple", "platform"],
    gap: [190, 230]
  },
  Hard: {
    speed: 360,
    levelSeconds: 38,
    patterns: ["single", "double", "triple", "stair", "tall", "platform"],
    gap: [200, 250]
  }
};

type Obstacle = (Phaser.GameObjects.Rectangle | Phaser.GameObjects.Triangle) & {
  kind: "spike" | "platform";
};

export class RunnerScene extends Phaser.Scene {
  opts: RunnerOpts;
  conf: DifficultyConf;
  difficultyLevel: Difficulty;
  stairsSince = 0;
  player!: Phaser.GameObjects.Rectangle;
  pendingDifficulty: Difficulty | null = null;
  startX = 140;
  vy = 0;
  onGround = true;
  obstacles: Obstacle[] = [];
  distance = 0;
  goal = 1;
  attempts = 0;
  dead = false;
  paused = false;

  bgm?: Phaser.Sound.BaseSound;
  startSfx?: Phaser.Sound.BaseSound;
  overSfx?: Phaser.Sound.BaseSound;
  jumpSfx?: Phaser.Sound.BaseSound;

  visibilityHandler?: () => void;
  pageShowHandler?: () => void;
  startSfxAt = 0;

  constructor(opts: RunnerOpts) {
    super("runner");
    this.opts = opts;
    this.conf = configs[opts.difficulty];
    this.difficultyLevel = opts.difficulty;
  }

  get WIDTH() {
    return this.scale.width || 960;
  }

  get HEIGHT() {
    return this.scale.height || 540;
  }

  get GROUND_Y() {
    return this.HEIGHT - 90;
  }

  setDifficulty(diff: Difficulty) {
    this.conf = configs[diff];
    this.difficultyLevel = diff;
    this.pendingDifficulty = diff;
    this.attempts = 0;
    this.opts.onAttempt(this.attempts);

    if (this.player) this.reset(true);
  }

  create() {
    const sm = this.sound as Phaser.Sound.WebAudioSoundManager;

    if ("pauseOnBlur" in sm) (sm as any).pauseOnBlur = false;
    if ("pauseOnHide" in sm) (sm as any).pauseOnHide = false;
    if ("mute" in sm) (sm as any).mute = false;
    if ("volume" in sm) (sm as any).volume = 1;

    this.goal = this.conf.speed * this.conf.levelSeconds;

    this.add.rectangle(500000, this.HEIGHT / 2, 1000000, this.HEIGHT, 0x0c1026).setDepth(-20);

    const bg = this.add.graphics({ x: 0, y: 0 });
    bg.fillGradientStyle(0x0c1026, 0x101437, 0x0b0e24, 0x0f132e, 1, 1, 1, 1);
    bg.fillRect(-100000, 0, 200000, this.HEIGHT);
    bg.setDepth(-15);

    this.add.particles(0, 0, "glow", {
      x: { min: 0, max: this.WIDTH },
      y: { min: 0, max: this.HEIGHT },
      speedX: -20,
      scale: { min: 0.04, max: 0.12 },
      alpha: { min: 0.08, max: 0.22 },
      lifespan: 8000,
      quantity: 2,
      frequency: 120
    });

    this.player = this.add
      .rectangle(this.startX, this.GROUND_Y, 44, 44, 0xe9f0ff, 1)
      .setStrokeStyle(3, 0x101018)
      .setOrigin(0.5, 1);

    this.add.rectangle(500000, this.GROUND_Y - 45 + 90, 1000000, 90, 0x1a1f3b, 1).setDepth(-5);

    this.cameras.main.setBounds(0, 0, 1000000, this.HEIGHT);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12, 0, 120);

    try {
      if (this.sound instanceof Phaser.Sound.WebAudioSoundManager) {
        this.sound.unlock();
      }
    } catch {
      // ignore
    }

    this.bgm = this.sound.add("bgm", { loop: true, volume: 0.0 }); // muted; global BGM handles audio
    this.startSfx = this.sound.add("start", { volume: 0.8 });
    this.overSfx = this.sound.add("over", { volume: 0.8 });
    this.jumpSfx = this.sound.add("jump", { volume: 0.75 });

    this.ensureBgm();
    this.playStartSfx();

    if (this.pendingDifficulty) {
      this.conf = configs[this.pendingDifficulty];
      this.pendingDifficulty = null;
    }

    this.reset(true);
    this.bumpAttempt();
    this.attachVisibilityHandlers();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.shutdownHandlers();
      this.bgm?.stop();
    });
  }

  handleJump() {
    if (this.dead || this.paused) return;

    if (this.onGround) {
      this.vy = -900;
      this.onGround = false;
      this.jumpSfx?.play();
    }
  }

  externalJump() {
    this.handleJump();
  }

  reset(fromDifficultyChange = false) {
    if (!this.player) return;

    this.obstacles.forEach((o) => o.destroy());
    this.obstacles = [];

    this.stairsSince = 0;
    this.vy = 0;
    this.onGround = true;
    this.player.setPosition(this.startX, this.GROUND_Y);
    this.distance = 0;
    this.goal = this.conf.speed * this.conf.levelSeconds;

    this.ensureBgm();

    if (!fromDifficultyChange) {
      this.bumpAttempt();
      this.playStartSfx();
    }

    this.dead = false;
    this.paused = false;
  }

  bumpAttempt() {
    this.attempts += 1;
    this.opts.onAttempt(this.attempts);
  }

  togglePause() {
    this.paused = !this.paused;
  }

  goHome() {
    this.reset(true);
    this.distance = 0;
    this.opts.onProgress(0);
  }

  spawnPattern(startX: number) {
    let x = startX;
    const gap = Phaser.Math.Between(this.conf.gap[0], this.conf.gap[1]);
    let pattern = Phaser.Utils.Array.GetRandom(this.conf.patterns);

    if (this.difficultyLevel === "Hard") {
      if (this.stairsSince >= 3) {
        pattern = "stair";
      }
      this.stairsSince = pattern === "stair" ? 0 : this.stairsSince + 1;
    }

    const color = 0x76d1ff;

    const addSpike = (width = 28, height = 56) => {
      const ob = this.add.triangle(
        x,
        this.GROUND_Y,
        -width / 2,
        height,
        width / 2,
        height,
        0,
        0,
        color,
        1
      ) as Obstacle;

      ob.kind = "spike";
      ob.setOrigin(0.5, 1);
      ob.setStrokeStyle(2, 0x101018);

      const tri = new Phaser.Geom.Triangle(
        x - width / 2,
        this.GROUND_Y,
        x + width / 2,
        this.GROUND_Y,
        x,
        this.GROUND_Y - height
      );

      ob.setData("triangle", tri);
      this.obstacles.push(ob);
      x += gap;
    };

    const addPlatform = (width = 140, height = 14, elevation = 80) => {
      const ob = this.add.rectangle(
        x,
        this.GROUND_Y - elevation,
        width,
        height,
        0x7890c0,
        1
      ) as Obstacle;

      ob.kind = "platform";
      ob.setOrigin(0, 1);
      this.obstacles.push(ob);

      if (this.difficultyLevel !== "Easy") {
        const stripCount = Math.max(2, Math.floor(width / 26));
        const gapIndex = Phaser.Math.Between(1, stripCount - 2);

        for (let i = 0; i < stripCount; i++) {
          if (i === gapIndex) continue;

          const spike = this.add.rectangle(
            x + i * 26 + 12,
            this.GROUND_Y,
            22,
            44,
            color,
            1
          ) as Obstacle;

          spike.kind = "spike";
          spike.setOrigin(0.5, 1);
          this.obstacles.push(spike);
        }
      }

      x += width + Phaser.Math.Between(60, 100);
    };

    if (pattern === "single") addSpike();
    else if (pattern === "double") {
      addSpike(26, 52);
      addSpike(26, 52);
    } else if (pattern === "triple") {
      addSpike(24, 50);
      addSpike(24, 50);
      addSpike(24, 50);
    } else if (pattern === "stair") {
      addSpike(26, 48);
      addSpike(26, 60);
      addSpike(26, 72);
    } else if (pattern === "tall") {
      addSpike(26, 64);
    } else if (pattern === "platform") {
      addPlatform();
    }
  }

  update(_time: number, delta: number) {
    if (this.dead || this.paused) return;

    const dt = delta / 1000;
    const prevBottom = this.player.y;

    this.vy += 3300 * dt;
    this.player.y += this.vy * dt;
    this.player.x += this.conf.speed * dt;
    this.distance = Math.max(0, this.player.x - this.startX);
    this.opts.onProgress(Math.min(1, this.distance / this.goal));

    if (this.player.y >= this.GROUND_Y) {
      this.player.y = this.GROUND_Y;
      this.vy = 0;
      this.onGround = true;
    }

    if (this.obstacles.length === 0 || this.obstacles[this.obstacles.length - 1].x - this.player.x < 500) {
      this.spawnPattern(this.player.x + 800);
    }

    this.obstacles = this.obstacles.filter((o) => {
      if (o.x < this.player.x - 1200) {
        o.destroy();
        return false;
      }
      return true;
    });

    const prect = new Phaser.Geom.Rectangle(this.player.x - 22, this.player.y - 44, 44, 44);

    for (const ob of this.obstacles) {
      if (ob.kind === "platform") {
        const orect = new Phaser.Geom.Rectangle(
          ob.getBounds().x,
          ob.getBounds().y,
          ob.displayWidth,
          ob.displayHeight
        );

        const platformTop = orect.y;
        const platformLeft = orect.x;
        const platformRight = orect.right;
        const currBottom = this.player.y;
        const overlapX = prect.right > platformLeft && prect.left < platformRight;
        const falling = this.vy >= 0;

        if (falling && overlapX && prevBottom <= platformTop && currBottom >= platformTop) {
          this.player.y = platformTop;
          this.vy = 0;
          this.onGround = true;
        }

        continue;
      }

      const tri = ob.getData("triangle") as Phaser.Geom.Triangle | undefined;
      const spikeHit = tri
        ? Phaser.Geom.Intersects.RectangleToTriangle(prect, tri)
        : Phaser.Geom.Intersects.RectangleToRectangle(prect, ob.getBounds());

      if (spikeHit) {
        this.dead = true;
        this.overSfx?.play();
        this.time.delayedCall(650, () => this.reset(), undefined, this);
        break;
      }
    }

    if (this.distance >= this.goal) {
      this.opts.onProgress(1);
      this.opts.onComplete();
      this.paused = true;
    }
  }

  playStartSfx() {
    const now = performance.now();
    if (now - this.startSfxAt < 150) return;

    if (this.startSfx) {
      this.startSfx.play();
      this.startSfxAt = now;
    } else if (import.meta.env.DEV) {
      console.warn("Start SFX missing");
    }
  }

  ensureBgm() {
    const sm = this.sound as Phaser.Sound.BaseSoundManager & { context?: AudioContext };
    const ctx = sm.context;

    if (ctx?.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    if (!this.bgm) {
      if (import.meta.env.DEV) {
        console.warn("BGM sound object was not created");
      }
      return;
    }

    // Keep the Phaser BGM instance alive (muted) to satisfy loader expectations, but rely on global BGM for sound
    if (!this.bgm.isPlaying) this.bgm.play();
  }

  attachVisibilityHandlers() {
    this.visibilityHandler = () => {
      if (document.visibilityState === "visible") {
        if (this.sound instanceof Phaser.Sound.WebAudioSoundManager) {
          this.sound.context?.resume().catch(() => {});
          this.bgm?.resume();
        }
      }
    };

    this.pageShowHandler = () => {
      if (this.sound instanceof Phaser.Sound.WebAudioSoundManager) {
        this.sound.context?.resume().catch(() => {});
        this.bgm?.resume();
      }
    };

    document.addEventListener("visibilitychange", this.visibilityHandler);
    window.addEventListener("pageshow", this.pageShowHandler);
  }

  shutdownHandlers() {
    if (this.visibilityHandler) {
      document.removeEventListener("visibilitychange", this.visibilityHandler);
      this.visibilityHandler = undefined;
    }

    if (this.pageShowHandler) {
      window.removeEventListener("pageshow", this.pageShowHandler);
      this.pageShowHandler = undefined;
    }
  }
}

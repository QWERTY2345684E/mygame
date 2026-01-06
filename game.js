(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const statusEl = document.getElementById("status");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;

  const PLAYER_SPEED = 280;
  const INVULN_TIME = 1.0;
  const TRAIL_LENGTH = 12;

  const SPRITE_TILE = 16;
  const PLAYER_SPRITE_SCALE = 3;
  const ITEM_SPRITE_SCALE = 3;

  const COMBO_WINDOW = 1.25;
  const COMBO_BONUS_STEP = 2;
  const COMBO_BONUS_CAP = 14;

  const HIGHSCORE_KEY = "mouse_dash_high_score";

  const DIFFICULTIES = [
    { name: "Easy", lives: 5, time: 60, hazards: 3, items: 8, hazardSpeed: [120, 170] },
    { name: "Normal", lives: 4, time: 50, hazards: 4, items: 10, hazardSpeed: [150, 210] },
    { name: "Hard", lives: 3, time: 40, hazards: 10, items: 12, hazardSpeed: [190, 260] },
  ];

  const COLORS = {
    bgTop: [20, 160, 200],
    bgBottom: [10, 90, 140],
    player: [250, 245, 230],
    playerOutline: [80, 80, 80],
    item: [250, 210, 70],
    hazard: [250, 120, 60],
    hud: [245, 245, 245],
    shadow: [0, 0, 0],
    heart: [255, 95, 109],
    gold: [255, 226, 120],
  };

  const FONT = `26px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const BIG_FONT = `42px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const HUGE_FONT = `54px system-ui, -apple-system, "Segoe UI", sans-serif`;

  const TAU = Math.PI * 2;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function rgb([r, g, b], alpha = 1) {
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  class Vec2 {
    constructor(x = 0, y = 0) {
      this.x = x;
      this.y = y;
    }
    copy() {
      return new Vec2(this.x, this.y);
    }
    len2() {
      return this.x * this.x + this.y * this.y;
    }
    len() {
      return Math.hypot(this.x, this.y);
    }
    normalize() {
      const length = this.len();
      if (length > 0) {
        this.x /= length;
        this.y /= length;
      }
      return this;
    }
    distanceTo(other) {
      return Math.hypot(this.x - other.x, this.y - other.y);
    }
  }

  function normalizeKey(event) {
    const key = event.key;
    return key.length === 1 ? key.toLowerCase() : key;
  }

  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function buildBackground() {
    const bg = document.createElement("canvas");
    bg.width = WIDTH;
    bg.height = HEIGHT;
    const bctx = bg.getContext("2d");

    const grad = bctx.createLinearGradient(0, 0, 0, HEIGHT);
    grad.addColorStop(0, rgb(COLORS.bgTop));
    grad.addColorStop(1, rgb(COLORS.bgBottom));
    bctx.fillStyle = grad;
    bctx.fillRect(0, 0, WIDTH, HEIGHT);

    const tile = 60;
    bctx.fillStyle = "rgba(255, 255, 255, 0.05)";
    for (let x = 0; x < WIDTH; x += tile) {
      for (let y = 40; y < HEIGHT; y += tile) {
        if (((x / tile + y / tile) | 0) % 2 === 0) {
          bctx.fillRect(x, y, tile, tile);
        }
      }
    }

    return bg;
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load ${url}`));
      img.src = url;
    });
  }

  async function tryLoadFirst(urls) {
    for (const url of urls) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const img = await loadImage(url);
        return { img, url };
      } catch {
        // ignore
      }
    }
    return { img: null, url: null };
  }

  function sliceSheet(img, tileSize) {
    const cols = Math.floor(img.width / tileSize);
    const rows = Math.floor(img.height / tileSize);
    const frames = [];

    const tmp = document.createElement("canvas");
    tmp.width = tileSize;
    tmp.height = tileSize;
    const tctx = tmp.getContext("2d", { willReadFrequently: true });
    tctx.imageSmoothingEnabled = false;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        tctx.clearRect(0, 0, tileSize, tileSize);
        tctx.drawImage(
          img,
          col * tileSize,
          row * tileSize,
          tileSize,
          tileSize,
          0,
          0,
          tileSize,
          tileSize,
        );
        const data = tctx.getImageData(0, 0, tileSize, tileSize).data;
        let hasAlpha = false;
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] !== 0) {
            hasAlpha = true;
            break;
          }
        }
        if (!hasAlpha) continue;

        const frame = document.createElement("canvas");
        frame.width = tileSize;
        frame.height = tileSize;
        const fctx = frame.getContext("2d");
        fctx.imageSmoothingEnabled = false;
        fctx.drawImage(tmp, 0, 0);
        frames.push(frame);
      }
    }

    return frames;
  }

  function scaleCanvas(src, scale) {
    const dst = document.createElement("canvas");
    dst.width = src.width * scale;
    dst.height = src.height * scale;
    const dctx = dst.getContext("2d");
    dctx.imageSmoothingEnabled = false;
    dctx.drawImage(src, 0, 0, dst.width, dst.height);
    return dst;
  }

  function flipCanvas(src) {
    const dst = document.createElement("canvas");
    dst.width = src.width;
    dst.height = src.height;
    const dctx = dst.getContext("2d");
    dctx.imageSmoothingEnabled = false;
    dctx.translate(dst.width, 0);
    dctx.scale(-1, 1);
    dctx.drawImage(src, 0, 0);
    return dst;
  }

  async function loadAssets() {
    const messages = [];

    const { img: cheeseImg, url: cheeseUrl } = await tryLoadFirst([
      "sprite_mouse/cheese.png",
      "sprites/cheese.png",
    ]);
    if (!cheeseImg) {
      messages.push("Missing cheese sprite. Expected sprite_mouse/cheese.png");
    }

    const mouseSheetCandidates = [
      "sprite_mouse/mouse.png",
      "sprite_mouse/mouse_sheet.png",
      "sprite_mouse/mouse_sprites.png",
      "sprite_mouse/sprites.png",
      "sprite_mouse/sprite.png",
      "sprites/mouse.png",
      "sprites/mouse_sheet.png",
      "sprites/mouse_sprites.png",
      "sprites/sprites.png",
      "sprites/sprite.png",
    ];

    let mouseFrames = [];
    let mouseUrl = null;
    for (const candidate of mouseSheetCandidates) {
      if (candidate.toLowerCase().endsWith("/cheese.png")) continue;
      try {
        // eslint-disable-next-line no-await-in-loop
        const img = await loadImage(candidate);
        const frames = sliceSheet(img, SPRITE_TILE);
        if (frames.length === 0) continue;
        mouseFrames = frames.map((f) => scaleCanvas(f, PLAYER_SPRITE_SCALE));
        mouseUrl = candidate;
        break;
      } catch {
        // ignore
      }
    }

    if (mouseFrames.length === 0) {
      messages.push("Missing mouse sprite sheet. Put a 16x16 sheet in sprite_mouse/ (e.g. sprite_mouse/mouse.png).");
    }

    const cheese = cheeseImg ? scaleCanvas(cheeseImg, ITEM_SPRITE_SCALE) : null;

    return {
      cheese,
      cheeseUrl,
      mouseFrames,
      mouseFramesFlipped: mouseFrames.map((f) => flipCanvas(f)),
      mouseUrl,
      messages,
    };
  }

  class Player {
    constructor(pos, frames, framesFlipped) {
      this.pos = pos;
      this.frames = frames || [];
      this.framesFlipped = framesFlipped || [];
      this.radius = this.frames.length ? this.frames[0].width / 2 : 18;
      this.hitCooldown = 0;
      this.trail = [];
      this.animTime = 0;
      this.animIndex = 0;
      this.lastMove = new Vec2(1, 0);
    }

    update(keys, dt) {
      const direction = new Vec2(0, 0);
      if (keys.has("ArrowLeft") || keys.has("a")) direction.x -= 1;
      if (keys.has("ArrowRight") || keys.has("d")) direction.x += 1;
      if (keys.has("ArrowUp") || keys.has("w")) direction.y -= 1;
      if (keys.has("ArrowDown") || keys.has("s")) direction.y += 1;

      if (direction.len2() > 0) {
        direction.normalize();
        this.lastMove = direction.copy();
      }

      this.pos.x += direction.x * PLAYER_SPEED * dt;
      this.pos.y += direction.y * PLAYER_SPEED * dt;

      this.pos.x = clamp(this.pos.x, this.radius, WIDTH - this.radius);
      this.pos.y = clamp(this.pos.y, this.radius + 40, HEIGHT - this.radius);

      if (this.hitCooldown > 0) {
        this.hitCooldown = Math.max(0, this.hitCooldown - dt);
      }

      this.trail.push(this.pos.copy());
      if (this.trail.length > TRAIL_LENGTH) this.trail.shift();

      if (this.frames.length) {
        const moving = direction.len2() > 0;
        if (moving) {
          this.animTime += dt;
          if (this.animTime >= 0.08) {
            this.animTime = 0;
            this.animIndex = (this.animIndex + 1) % this.frames.length;
          }
        } else {
          this.animTime = 0;
          this.animIndex = 0;
        }
      }
    }

    canTakeHit() {
      return this.hitCooldown <= 0;
    }

    markHit() {
      this.hitCooldown = INVULN_TIME;
    }

    draw(ctx, offset) {
      const px = this.pos.x + offset.x;
      const py = this.pos.y + offset.y;

      if (this.frames.length) {
        const facingLeft = this.lastMove.x < 0;
        const frames = facingLeft ? this.framesFlipped : this.frames;
        const frame = frames[this.animIndex % frames.length];

        const x = Math.round(px - frame.width / 2);
        const y = Math.round(py - frame.height / 2);

        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
        ctx.shadowOffsetX = 3;
        ctx.shadowOffsetY = 4;
        ctx.shadowBlur = 0;

        if (this.hitCooldown > 0) {
          ctx.globalAlpha = (Math.floor(this.hitCooldown * 12) % 2 === 0) ? 0.45 : 0.85;
        }

        ctx.drawImage(frame, x, y);
        ctx.restore();
        return;
      }

      // Fallback (no sprites): simple mouse shape with trail.
      ctx.save();
      ctx.fillStyle = rgb(COLORS.shadow, 0.75);
      ctx.beginPath();
      ctx.arc(px + 3, py + 4, this.radius + 2, 0, TAU);
      ctx.fill();

      for (let i = 0; i < this.trail.length; i++) {
        const t = this.trail[i];
        const alpha = (120 * (i / Math.max(1, this.trail.length))) / 255;
        if (alpha <= 0) continue;
        ctx.fillStyle = rgb(COLORS.player, alpha);
        ctx.beginPath();
        ctx.arc(t.x + offset.x, t.y + offset.y, this.radius - 4, 0, TAU);
        ctx.fill();
      }

      ctx.fillStyle = rgb(COLORS.player);
      ctx.strokeStyle = rgb(COLORS.playerOutline);
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.arc(px, py, this.radius, 0, TAU);
      ctx.fill();
      ctx.stroke();

      // Ears
      ctx.beginPath();
      ctx.arc(px - 8, py - 10, this.radius / 2, 0, TAU);
      ctx.arc(px + 8, py - 10, this.radius / 2, 0, TAU);
      ctx.fill();
      ctx.stroke();

      // Eyes
      ctx.fillStyle = rgb(COLORS.playerOutline);
      ctx.beginPath();
      ctx.arc(px - 5, py - 3, 3, 0, TAU);
      ctx.arc(px + 5, py - 3, 3, 0, TAU);
      ctx.fill();

      // Nose
      ctx.fillStyle = "rgb(240, 140, 140)";
      ctx.beginPath();
      ctx.arc(px, py + 8, 3, 0, TAU);
      ctx.fill();

      // Whiskers
      ctx.strokeStyle = rgb(COLORS.playerOutline);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px - 3, py + 6);
      ctx.lineTo(px - 12, py + 4);
      ctx.moveTo(px + 3, py + 6);
      ctx.lineTo(px + 12, py + 4);
      ctx.stroke();

      // Tail
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(px, py + 10);
      ctx.lineTo(px, py + 24);
      ctx.stroke();

      ctx.restore();
    }
  }

  class Item {
    constructor(pos, sprite) {
      this.pos = pos;
      this.sprite = sprite;
      this.radius = sprite ? sprite.width / 2 : 10;
      this.wobble = rand(0, TAU);
    }

    draw(ctx, timeAcc, offset) {
      const bob = Math.sin(timeAcc * 4 + this.wobble) * 2;
      const cx = this.pos.x + offset.x;
      const cy = this.pos.y + offset.y + bob;

      if (this.sprite) {
        const angle = (Math.sin(timeAcc * 4 + this.wobble) * 10 * Math.PI) / 180;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.imageSmoothingEnabled = false;
        ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 3;
        ctx.shadowBlur = 0;
        ctx.drawImage(this.sprite, -this.sprite.width / 2, -this.sprite.height / 2);
        ctx.restore();
        return;
      }

      ctx.save();
      ctx.fillStyle = rgb(COLORS.shadow, 0.75);
      ctx.beginPath();
      ctx.arc(cx + 2, cy + 2, this.radius, 0, TAU);
      ctx.fill();

      ctx.fillStyle = rgb(COLORS.item);
      ctx.beginPath();
      ctx.arc(cx, cy, this.radius, 0, TAU);
      ctx.fill();

      ctx.fillStyle = "rgb(230, 180, 40)";
      ctx.beginPath();
      ctx.arc(cx, cy, Math.floor(this.radius / 2), 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  class Hazard {
    constructor(pos, speedRange) {
      this.pos = pos;
      this.size = 24;
      this.vel = Hazard.randomVelocity(speedRange);
    }

    static randomVelocity([minSpeed, maxSpeed]) {
      while (true) {
        const vx = rand(-1, 1);
        const vy = rand(-1, 1);
        const len2 = vx * vx + vy * vy;
        if (len2 <= 0.1) continue;
        const len = Math.sqrt(len2);
        const speed = rand(minSpeed, maxSpeed);
        return new Vec2((vx / len) * speed, (vy / len) * speed);
      }
    }

    update(dt) {
      this.pos.x += this.vel.x * dt;
      this.pos.y += this.vel.y * dt;

      let bounced = false;
      if (this.pos.x < this.size || this.pos.x > WIDTH - this.size) {
        this.vel.x *= -1;
        bounced = true;
      }
      if (this.pos.y < this.size + 40 || this.pos.y > HEIGHT - this.size) {
        this.vel.y *= -1;
        bounced = true;
      }
      if (bounced) {
        this.pos.x = clamp(this.pos.x, this.size, WIDTH - this.size);
        this.pos.y = clamp(this.pos.y, this.size + 40, HEIGHT - this.size);
      }
    }

    nudgeAwayFrom(point) {
      let dx = this.pos.x - point.x;
      let dy = this.pos.y - point.y;
      if (dx === 0 && dy === 0) {
        dx = rand(-1, 1);
        dy = rand(-1, 1);
      }
      const len = Math.hypot(dx, dy) || 1;
      this.pos.x += (dx / len) * 18;
      this.pos.y += (dy / len) * 18;
    }

    draw(ctx, offset) {
      const cx = this.pos.x + offset.x;
      const cy = this.pos.y + offset.y;
      const x = Math.round(cx - this.size / 2);
      const y = Math.round(cy - this.size / 2);

      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
      ctx.shadowOffsetX = 3;
      ctx.shadowOffsetY = 4;
      ctx.shadowBlur = 0;
      ctx.fillStyle = rgb(COLORS.hazard);
      roundRect(ctx, x, y, this.size, this.size, 6);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = rgb(COLORS.playerOutline);
      ctx.beginPath();
      ctx.arc(x + this.size / 2 - 6, y + this.size / 2 - 3, 4, 0, TAU);
      ctx.arc(x + this.size / 2 + 6, y + this.size / 2 - 3, 4, 0, TAU);
      ctx.fill();
      ctx.fillRect(x + this.size / 2 - 6, y + this.size / 2 + 5, 12, 3);

      ctx.strokeStyle = "rgb(255, 170, 120)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 6);
      ctx.lineTo(x + 10, y + 16);
      ctx.moveTo(x + this.size - 4, y + 6);
      ctx.lineTo(x + this.size - 10, y + 16);
      ctx.stroke();
    }
  }

  class Particle {
    constructor(pos, vel, lifetime, color, size) {
      this.pos = pos.copy();
      this.vel = vel.copy();
      this.life = lifetime;
      this.total = lifetime;
      this.color = color;
      this.size = size;
    }

    update(dt) {
      this.pos.x += this.vel.x * dt;
      this.pos.y += this.vel.y * dt;
      this.life -= dt;
    }

    draw(ctx, offset) {
      if (this.life <= 0) return;
      const alpha = clamp(this.life / this.total, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.pos.x + offset.x, this.pos.y + offset.y, this.size, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  class FloatingText {
    constructor(pos, text, color) {
      this.pos = pos.copy();
      this.text = text;
      this.color = color;
      this.life = 1.0;
    }

    update(dt) {
      this.life -= dt;
      this.pos.y -= 30 * dt;
    }

    draw(ctx, offset) {
      if (this.life <= 0) return;
      ctx.save();
      ctx.globalAlpha = clamp(this.life, 0, 1);
      ctx.fillStyle = this.color;
      ctx.font = FONT;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(this.text, this.pos.x + offset.x, this.pos.y + offset.y);
      ctx.restore();
    }
  }

  class Game {
    constructor(assets) {
      this.assets = assets;
      this.background = buildBackground();

      this.state = "menu";
      this.difficultyIndex = 0;
      this.timeAcc = 0;

      this.score = 0;
      this.lives = DIFFICULTIES[0].lives;
      this.timeLeft = DIFFICULTIES[0].time;

      this.combo = 0;
      this.comboTimer = 0;

      this.player = new Player(
        new Vec2(WIDTH / 2, HEIGHT / 2),
        assets.mouseFrames,
        assets.mouseFramesFlipped,
      );
      this.items = [];
      this.hazards = [];

      this.particles = [];
      this.floaters = [];

      this.shakeTimer = 0;
      this.shakeStrength = 10;

      this.highScore = Game.loadHighScore();
      this.newHighScore = false;

      this.resetRun();
    }

    static loadHighScore() {
      try {
        const v = Number.parseInt(localStorage.getItem(HIGHSCORE_KEY) || "0", 10);
        return Number.isFinite(v) ? v : 0;
      } catch {
        return 0;
      }
    }

    static saveHighScore(score) {
      try {
        localStorage.setItem(HIGHSCORE_KEY, String(score));
      } catch {
        // ignore
      }
    }

    resetRun(difficultyIndex = null) {
      if (difficultyIndex !== null) this.difficultyIndex = difficultyIndex;
      const diff = DIFFICULTIES[this.difficultyIndex];

      this.score = 0;
      this.lives = diff.lives;
      this.timeLeft = diff.time;

      this.combo = 0;
      this.comboTimer = 0;

      this.player = new Player(
        new Vec2(WIDTH / 2, HEIGHT / 2),
        this.assets.mouseFrames,
        this.assets.mouseFramesFlipped,
      );
      this.items = [];
      this.hazards = [];

      this.particles = [];
      this.floaters = [];
      this.shakeTimer = 0;
      this.newHighScore = false;

      this.spawnHazards(diff.hazards, diff.hazardSpeed);
      this.spawnItems(diff.items);

      this.state = "menu";
    }

    startGame() {
      const diff = DIFFICULTIES[this.difficultyIndex];

      this.state = "playing";
      this.timeLeft = diff.time;
      this.score = 0;
      this.lives = diff.lives;

      this.combo = 0;
      this.comboTimer = 0;

      this.player.pos = new Vec2(WIDTH / 2, HEIGHT / 2);
      this.player.hitCooldown = 0;

      this.items = [];
      this.hazards = [];
      this.particles = [];
      this.floaters = [];
      this.shakeTimer = 0;
      this.newHighScore = false;

      this.spawnHazards(diff.hazards, diff.hazardSpeed);
      this.spawnItems(diff.items);
    }

    enterGameOver() {
      this.state = "game_over";
      if (this.score > this.highScore) {
        this.highScore = this.score;
        this.newHighScore = true;
        Game.saveHighScore(this.highScore);
      } else {
        this.newHighScore = false;
      }
    }

    spawnItems(count) {
      const cheese = this.assets.cheese;
      const newItemRadius = cheese ? cheese.width / 2 : 10;

      let attempts = 0;
      while (this.items.length < count && attempts < count * 20) {
        attempts++;
        const pos = new Vec2(rand(40, WIDTH - 40), rand(80, HEIGHT - 40));

        const tooClosePlayer = pos.distanceTo(this.player.pos) < 80;
        const tooCloseOther = this.items.some((it) => pos.distanceTo(it.pos) < it.radius + newItemRadius + 8);
        const tooCloseHazard = this.hazards.some((hz) => pos.distanceTo(hz.pos) < hz.size + newItemRadius + 12);

        if (!tooClosePlayer && !tooCloseOther && !tooCloseHazard) {
          this.items.push(new Item(pos, cheese));
        }
      }
    }

    spawnHazards(count, speedRange) {
      let attempts = 0;
      while (this.hazards.length < count && attempts < count * 25) {
        attempts++;
        const pos = new Vec2(rand(60, WIDTH - 60), rand(100, HEIGHT - 60));
        if (pos.distanceTo(this.player.pos) < 120) continue;
        if (this.hazards.some((h) => pos.distanceTo(h.pos) < 60)) continue;
        this.hazards.push(new Hazard(pos, speedRange));
      }
    }

    spawnCollectEffect(pos, points, combo) {
      for (let i = 0; i < 12; i++) {
        const angle = rand(0, TAU);
        const speed = rand(80, 160);
        const vel = new Vec2(Math.cos(angle) * speed, Math.sin(angle) * speed);
        this.particles.push(new Particle(pos, vel, 0.4, rgb(COLORS.gold), 3));
      }
      this.floaters.push(new FloatingText(pos, `+${points}`, rgb(COLORS.gold)));
      if (combo >= 2) {
        this.floaters.push(new FloatingText(new Vec2(pos.x, pos.y - 18), `Combo x${combo}`, rgb(COLORS.item)));
      }
    }

    spawnHitEffect(pos) {
      for (let i = 0; i < 18; i++) {
        const angle = rand(0, TAU);
        const speed = rand(120, 220);
        const vel = new Vec2(Math.cos(angle) * speed, Math.sin(angle) * speed);
        this.particles.push(new Particle(pos, vel, 0.5, rgb(COLORS.hazard), 4));
      }
      this.shakeTimer = 0.25;
    }

    updateEffects(dt) {
      for (const p of this.particles) p.update(dt);
      this.particles = this.particles.filter((p) => p.life > 0);

      for (const ft of this.floaters) ft.update(dt);
      this.floaters = this.floaters.filter((ft) => ft.life > 0);
    }

    cameraOffset() {
      if (this.shakeTimer <= 0) return new Vec2(0, 0);
      const power = this.shakeTimer / 0.25;
      return new Vec2(
        rand(-1, 1) * this.shakeStrength * power,
        rand(-1, 1) * this.shakeStrength * power,
      );
    }

    update(dt, keys) {
      this.timeAcc += dt;

      if (this.shakeTimer > 0) this.shakeTimer = Math.max(0, this.shakeTimer - dt);
      this.updateEffects(dt);

      if (this.state !== "playing") return;

      if (this.comboTimer > 0) {
        this.comboTimer = Math.max(0, this.comboTimer - dt);
        if (this.comboTimer === 0) this.combo = 0;
      }

      this.player.update(keys, dt);
      for (const hazard of this.hazards) hazard.update(dt);
      this.handleCollisions();

      this.timeLeft = Math.max(0, this.timeLeft - dt);
      if (this.timeLeft <= 0 || this.lives <= 0) this.enterGameOver();
    }

    handleCollisions() {
      const collected = [];
      for (const item of this.items) {
        if (this.player.pos.distanceTo(item.pos) <= this.player.radius + item.radius) {
          collected.push(item);

          if (this.comboTimer > 0) this.combo += 1;
          else this.combo = 1;
          this.comboTimer = COMBO_WINDOW;

          const bonus = Math.min(COMBO_BONUS_CAP, (this.combo - 1) * COMBO_BONUS_STEP);
          const points = 10 + bonus;
          this.score += points;
          this.spawnCollectEffect(item.pos, points, this.combo);
        }
      }
      if (collected.length) {
        this.items = this.items.filter((it) => !collected.includes(it));
      }
      if (this.items.length === 0) {
        const diff = DIFFICULTIES[this.difficultyIndex];
        this.spawnItems(diff.items);
      }

      if (!this.player.canTakeHit()) return;
      for (const hazard of this.hazards) {
        if (this.player.pos.distanceTo(hazard.pos) <= this.player.radius + hazard.size * 0.5) {
          this.lives -= 1;
          this.player.markHit();
          hazard.nudgeAwayFrom(this.player.pos);
          this.spawnHitEffect(this.player.pos.copy());
          break;
        }
      }
    }

    onKeyDown(key) {
      if (key === "q") {
        this.resetRun(this.difficultyIndex);
        return;
      }

      if ((this.state === "playing" || this.state === "paused") && (key === "p" || key === "Escape")) {
        this.state = this.state === "playing" ? "paused" : "playing";
        return;
      }

      if (this.state === "playing" && key === "r") {
        this.startGame();
        return;
      }

      if (this.state === "paused") {
        if (key === "r") this.startGame();
        if (key === "m") this.resetRun(this.difficultyIndex);
        return;
      }

      if (this.state === "menu") {
        if (key === "ArrowUp") {
          this.difficultyIndex = (this.difficultyIndex - 1 + DIFFICULTIES.length) % DIFFICULTIES.length;
        }
        if (key === "ArrowDown") {
          this.difficultyIndex = (this.difficultyIndex + 1) % DIFFICULTIES.length;
        }
        if (key === "1" || key === "2" || key === "3") {
          const idx = Number.parseInt(key, 10) - 1;
          this.difficultyIndex = clamp(idx, 0, DIFFICULTIES.length - 1);
          this.startGame();
          return;
        }
        if (key === "Enter" || key === " ") {
          this.startGame();
          return;
        }
      }

      if (this.state === "game_over") {
        if (key === "Enter" || key === " ") this.startGame();
        if (key === "r" || key === "m") this.resetRun(this.difficultyIndex);
      }
    }

    drawHud(ctx) {
      const diff = DIFFICULTIES[this.difficultyIndex];

      ctx.save();
      ctx.font = FONT;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillStyle = rgb(COLORS.hud);
      ctx.fillText(`Score: ${this.score}`, 14, 10);
      ctx.fillText(`Time: ${Math.floor(this.timeLeft)}s`, 14, 34);
      ctx.fillText(`Difficulty: ${diff.name}`, WIDTH - 200, 34);
      ctx.fillText(`High: ${this.highScore}`, WIDTH - 200, 58);
      if (this.combo > 1 && this.state === "playing") {
        ctx.fillStyle = rgb(COLORS.item);
        ctx.fillText(`Combo x${this.combo}`, WIDTH - 200, 82);
        ctx.fillStyle = rgb(COLORS.hud);
      }
      ctx.fillText(`Lives: ${this.lives}`, WIDTH - 120, 10);
      ctx.restore();

      this.drawLivesIcons(ctx);

      if (this.player.hitCooldown > 0 && this.state === "playing") {
        ctx.save();
        ctx.fillStyle = "rgba(255, 255, 255, 0.14)";
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.restore();
      }
    }

    drawLivesIcons(ctx) {
      for (let i = 0; i < this.lives; i++) {
        const x = 14 + i * 26;
        const y = 60;
        ctx.save();
        ctx.fillStyle = rgb(COLORS.heart);
        ctx.beginPath();
        ctx.arc(x + 10, y + 10, 10, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
        ctx.beginPath();
        ctx.arc(x + 10, y + 8, 4, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }

    drawMenu(ctx) {
      ctx.drawImage(this.background, 0, 0);

      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "top";

      ctx.font = HUGE_FONT;
      ctx.fillStyle = rgb(COLORS.hud);
      ctx.fillText("Mouse Dash!", WIDTH / 2, 110);

      ctx.font = FONT;
      ctx.fillText("Collect cheese, dodge cats, beat the clock.", WIDTH / 2, 170);
      ctx.fillText(`High Score: ${this.highScore}`, WIDTH / 2, 195);

      for (let idx = 0; idx < DIFFICULTIES.length; idx++) {
        const diff = DIFFICULTIES[idx];
        ctx.font = BIG_FONT;
        ctx.fillStyle = idx === this.difficultyIndex ? rgb(COLORS.item) : rgb(COLORS.hud);
        ctx.fillText(
          `${idx + 1}. ${diff.name} - ${diff.lives} lives, ${diff.time}s, ${diff.hazards} cats`,
          WIDTH / 2,
          230 + idx * 50,
        );
      }

      ctx.font = FONT;
      ctx.fillStyle = rgb(COLORS.hud);
      ctx.fillText("1/2/3: level   Enter/Space: start   Arrows/WASD: move   Q: reset", WIDTH / 2, HEIGHT - 80);
      ctx.restore();
    }

    drawGame(ctx) {
      ctx.drawImage(this.background, 0, 0);
      const offset = this.cameraOffset();

      for (const item of this.items) item.draw(ctx, this.timeAcc, offset);
      for (const hazard of this.hazards) hazard.draw(ctx, offset);
      this.player.draw(ctx, offset);
      for (const p of this.particles) p.draw(ctx, offset);
      for (const ft of this.floaters) ft.draw(ctx, offset);

      this.drawHud(ctx);
    }

    drawPause(ctx) {
      this.drawGame(ctx);
      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = rgb(COLORS.hud);
      ctx.font = HUGE_FONT;
      ctx.fillText("Paused", WIDTH / 2, HEIGHT / 2 - 60);
      ctx.font = FONT;
      ctx.fillText("P/Esc: resume   R: restart   M/Q: menu", WIDTH / 2, HEIGHT / 2 - 10);
      ctx.restore();
    }

    drawGameOver(ctx) {
      this.drawGame(ctx);
      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = rgb(COLORS.hud);
      ctx.font = HUGE_FONT;
      ctx.fillText("Game Over", WIDTH / 2, HEIGHT / 2 - 90);
      ctx.font = BIG_FONT;
      ctx.fillText(`Score: ${this.score}`, WIDTH / 2, HEIGHT / 2 - 30);
      ctx.font = FONT;
      ctx.fillText(`High Score: ${this.highScore}`, WIDTH / 2, HEIGHT / 2 + 5);
      if (this.newHighScore) {
        ctx.fillStyle = rgb(COLORS.item);
        ctx.fillText("New High Score!", WIDTH / 2, HEIGHT / 2 - 5);
        ctx.fillStyle = rgb(COLORS.hud);
      }
      ctx.fillText("Enter/Space: restart   R/M/Q: menu", WIDTH / 2, HEIGHT / 2 + 35);
      ctx.restore();
    }

    draw(ctx) {
      if (this.state === "menu") return this.drawMenu(ctx);
      if (this.state === "playing") return this.drawGame(ctx);
      if (this.state === "paused") return this.drawPause(ctx);
      if (this.state === "game_over") return this.drawGameOver(ctx);
      return this.drawMenu(ctx);
    }
  }

  // Input + bootstrapping below

  let game = null;
  const keys = new Set();

  window.addEventListener("keydown", (event) => {
    const key = normalizeKey(event);
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) {
      event.preventDefault();
    }
    keys.add(key);
    if (game) game.onKeyDown(key);
  });

  window.addEventListener("keyup", (event) => {
    keys.delete(normalizeKey(event));
  });

  function setStatus(text) {
    if (!statusEl) return;
    statusEl.textContent = text || "";
  }

  async function boot() {
    setStatus("Loading sprites…");
    const assets = await loadAssets();
    if (assets.messages.length) {
      setStatus(assets.messages[0]);
    } else {
      const details = [];
      if (assets.cheeseUrl) details.push(`Cheese: ${assets.cheeseUrl}`);
      if (assets.mouseUrl) details.push(`Mouse: ${assets.mouseUrl}`);
      setStatus(details.length ? details.join(" · ") : "");
    }

    game = new Game(assets);

    let last = performance.now();
    function tick(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      game.update(dt, keys);
      game.draw(ctx);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  boot();
})();

"""
"""

import json
import math
import random
import sys
from pathlib import Path
from typing import List, Optional, Tuple

import pygame

WIDTH, HEIGHT = 900, 600
FPS = 60
PLAYER_SPEED = 280  # pixels per second
INVULN_TIME = 1.0   # seconds after a hit
TRAIL_LENGTH = 12
SPRITE_TILE = 16
PLAYER_SPRITE_SCALE = 3
ITEM_SPRITE_SCALE = 3
HIGHSCORE_FILENAME = "mouse_dash_highscore.json"
COMBO_WINDOW = 1.25
COMBO_BONUS_STEP = 2
COMBO_BONUS_CAP = 14

DIFFICULTIES = [
    {
        "name": "Easy",
        "lives": 5,
        "time": 60,
        "hazards": 3,
        "items": 8,
        "hazard_speed": (120, 170),
    },
    {
        "name": "Normal",
        "lives": 4,
        "time": 50,
        "hazards": 4,
        "items": 10,
        "hazard_speed": (150, 210),
    },
    {
        "name": "Hard",
        "lives": 3,
        "time": 40,
        "hazards": 10,
        "items": 12,
        "hazard_speed": (190, 260),
    },
]

COLORS = {
    "bg_top": (20, 160, 200),
    "bg_bottom": (10, 90, 140),
    "player": (250, 245, 230),
    "player_outline": (80, 80, 80),
    "item": (250, 210, 70),
    "hazard": (250, 120, 60),
    "hud": (245, 245, 245),
    "shadow": (0, 0, 0),
    "hit_flash": (255, 255, 255),
    "heart": (255, 95, 109),
    "gold": (255, 226, 120),
}


def _try_load_image(path: Path) -> Optional[pygame.Surface]:
    try:
        return pygame.image.load(str(path)).convert_alpha()
    except Exception:
        return None


def _slice_sheet(sheet: pygame.Surface, tile_size: int) -> List[pygame.Surface]:
    width, height = sheet.get_size()
    cols = max(1, width // tile_size)
    rows = max(1, height // tile_size)
    frames: List[pygame.Surface] = []
    for row in range(rows):
        for col in range(cols):
            rect = pygame.Rect(col * tile_size, row * tile_size, tile_size, tile_size)
            if rect.right > width or rect.bottom > height:
                continue
            frame = sheet.subsurface(rect).copy()
            if pygame.mask.from_surface(frame).count() == 0:
                continue
            frames.append(frame)
    return frames


def _scale_surface(surface: pygame.Surface, scale: int) -> pygame.Surface:
    return pygame.transform.scale(
        surface,
        (surface.get_width() * scale, surface.get_height() * scale),
    )


def _make_shadow(surface: pygame.Surface, alpha: int = 140) -> pygame.Surface:
    shadow = surface.copy()
    shadow.fill((0, 0, 0, alpha), special_flags=pygame.BLEND_RGBA_MULT)
    return shadow


class Assets:
    def __init__(self, base_dir: Path):
        self.base_dir = base_dir
        self.cheese: Optional[pygame.Surface] = None
        self.cheese_shadow: Optional[pygame.Surface] = None
        self.mouse_frames: List[pygame.Surface] = []
        self.mouse_shadows: List[pygame.Surface] = []
        self._load()

    def _load(self):
        sprite_dirs = [self.base_dir / "sprite_mouse", self.base_dir / "sprites"]
        for sprite_dir in sprite_dirs:
            cheese_path = sprite_dir / "cheese.png"
            cheese = _try_load_image(cheese_path)
            if cheese is not None:
                self.cheese = _scale_surface(cheese, ITEM_SPRITE_SCALE)
                self.cheese_shadow = _make_shadow(self.cheese)
                break

        for sprite_dir in sprite_dirs:
            frames = self._load_mouse_frames(sprite_dir)
            if frames:
                self.mouse_frames = frames
                self.mouse_shadows = [_make_shadow(frame) for frame in frames]
                break

    def _load_mouse_frames(self, sprite_dir: Path) -> List[pygame.Surface]:
        if not sprite_dir.exists():
            return []

        candidates = [p for p in sprite_dir.glob("*.png") if p.name.lower() != "cheese.png"]
        candidates.sort(key=lambda p: (0 if "mouse" in p.stem.lower() else 1, p.name.lower()))
        for path in candidates:
            sheet = _try_load_image(path)
            if sheet is None:
                continue
            frames = _slice_sheet(sheet, SPRITE_TILE)
            if not frames:
                continue
            return [_scale_surface(frame, PLAYER_SPRITE_SCALE) for frame in frames]
        return []


class Player:
    def __init__(
        self,
        pos: Tuple[int, int],
        frames: Optional[List[pygame.Surface]] = None,
        shadows: Optional[List[pygame.Surface]] = None,
    ):
        self.pos = pygame.Vector2(pos)
        self.frames = frames or []
        self.shadows = shadows or []
        self.frames_flipped = [pygame.transform.flip(frame, True, False) for frame in self.frames]
        self.shadows_flipped = [pygame.transform.flip(shadow, True, False) for shadow in self.shadows]
        self.radius = (self.frames[0].get_width() // 2) if self.frames else 18
        self.hit_cooldown = 0.0
        self.trail: List[pygame.Vector2] = []
        self.anim_time = 0.0
        self.anim_index = 0
        self.last_move = pygame.Vector2(1, 0)

    def update(self, keys, dt: float):
        direction = pygame.Vector2(0, 0)
        if keys[pygame.K_LEFT] or keys[pygame.K_a]:
            direction.x -= 1
        if keys[pygame.K_RIGHT] or keys[pygame.K_d]:
            direction.x += 1
        if keys[pygame.K_UP] or keys[pygame.K_w]:
            direction.y -= 1
        if keys[pygame.K_DOWN] or keys[pygame.K_s]:
            direction.y += 1
        if direction.length_squared() > 0:
            direction = direction.normalize()
            self.last_move = direction
        self.pos += direction * PLAYER_SPEED * dt
        self.pos.x = max(self.radius, min(WIDTH - self.radius, self.pos.x))
        self.pos.y = max(self.radius + 40, min(HEIGHT - self.radius, self.pos.y))
        if self.hit_cooldown > 0:
            self.hit_cooldown = max(0.0, self.hit_cooldown - dt)
        self.trail.append(self.pos.copy())
        if len(self.trail) > TRAIL_LENGTH:
            self.trail.pop(0)

        if self.frames:
            moving = direction.length_squared() > 0
            if moving:
                self.anim_time += dt
                if self.anim_time >= 0.08:
                    self.anim_time = 0.0
                    self.anim_index = (self.anim_index + 1) % len(self.frames)
            else:
                self.anim_time = 0.0
                self.anim_index = 0

    def can_take_hit(self) -> bool:
        return self.hit_cooldown <= 0

    def mark_hit(self):
        self.hit_cooldown = INVULN_TIME

    def draw(self, surface, offset: pygame.Vector2):
        if self.frames:
            pos = self.pos + offset
            facing_left = self.last_move.x < 0
            frames = self.frames_flipped if facing_left else self.frames
            shadows = self.shadows_flipped if facing_left else self.shadows
            frame = frames[self.anim_index % len(frames)]
            shadow = shadows[self.anim_index % len(shadows)] if shadows else None

            if self.hit_cooldown > 0:
                alpha = 110 if int(self.hit_cooldown * 12) % 2 == 0 else 220
                frame = frame.copy()
                frame.set_alpha(alpha)
            rect = frame.get_rect(center=(int(pos.x), int(pos.y)))
            if shadow is not None:
                shadow_rect = rect.move(3, 4)
                surface.blit(shadow, shadow_rect)
            surface.blit(frame, rect)
            return

        pos = self.pos + offset
        body_color = COLORS["player"]
        outline = COLORS["player_outline"]
        # Shadow
        pygame.draw.circle(surface, COLORS["shadow"], pos + pygame.Vector2(3, 4), self.radius + 2)
        # Trail with fading circles
        for idx, tpos in enumerate(self.trail):
            alpha = int(120 * (idx / len(self.trail))) if self.trail else 0
            if alpha <= 0:
                continue
            shade = (body_color[0], body_color[1], body_color[2], alpha)
            trail_surface = pygame.Surface((self.radius * 2, self.radius * 2), pygame.SRCALPHA)
            pygame.draw.circle(trail_surface, shade, (self.radius, self.radius), self.radius - 4)
            trail_rect = trail_surface.get_rect(center=(int(tpos.x + offset.x), int(tpos.y + offset.y)))
            surface.blit(trail_surface, trail_rect)
        # Body
        pygame.draw.circle(surface, body_color, pos, self.radius)
        # Ears
        pygame.draw.circle(surface, body_color, pos + pygame.Vector2(-8, -10), self.radius // 2)
        pygame.draw.circle(surface, body_color, pos + pygame.Vector2(8, -10), self.radius // 2)
        # Eyes
        eye_dir = (self.trail[-1] - self.trail[-2]) if len(self.trail) >= 2 else pygame.Vector2(0, 0)
        eye_dir = eye_dir.normalize() * 2 if eye_dir.length_squared() > 0 else pygame.Vector2(0, 0)
        pygame.draw.circle(surface, outline, pos + pygame.Vector2(-5, -3) + eye_dir, 3)
        pygame.draw.circle(surface, outline, pos + pygame.Vector2(5, -3) + eye_dir, 3)
        # Nose
        pygame.draw.circle(surface, (240, 140, 140), pos + pygame.Vector2(0, 8), 3)
        # Whiskers
        pygame.draw.line(surface, outline, pos + pygame.Vector2(-3, 6), pos + pygame.Vector2(-12, 4), 2)
        pygame.draw.line(surface, outline, pos + pygame.Vector2(3, 6), pos + pygame.Vector2(12, 4), 2)
        # Tail
        pygame.draw.line(surface, outline, pos + pygame.Vector2(0, 10), pos + pygame.Vector2(0, 24), 3)
        # Outline
        pygame.draw.circle(surface, outline, pos, self.radius, 2)


class Item:
    def __init__(
        self,
        pos: pygame.Vector2,
        sprite: Optional[pygame.Surface] = None,
        shadow: Optional[pygame.Surface] = None,
    ):
        self.pos = pos
        self.sprite = sprite
        self.shadow = shadow
        self.radius = (self.sprite.get_width() // 2) if self.sprite else 10
        self.wobble = random.uniform(0, math.pi * 2)

    def draw(self, surface, time_accum: float, offset: pygame.Vector2):
        # Small bobbing animation
        bob = math.sin(time_accum * 4 + self.wobble) * 2
        center = (int(self.pos.x + offset.x), int(self.pos.y + offset.y + bob))

        if self.sprite is not None:
            angle = math.sin(time_accum * 4 + self.wobble) * 10
            sprite = pygame.transform.rotate(self.sprite, angle)
            shadow = pygame.transform.rotate(self.shadow, angle) if self.shadow is not None else None
            rect = sprite.get_rect(center=center)
            if shadow is not None:
                surface.blit(shadow, rect.move(2, 3))
            surface.blit(sprite, rect)
            return

        pygame.draw.circle(surface, COLORS["shadow"], (center[0] + 2, center[1] + 2), self.radius)
        pygame.draw.circle(surface, COLORS["item"], center, self.radius)
        pygame.draw.circle(surface, (230, 180, 40), center, self.radius // 2)
        shine = pygame.Surface((self.radius * 2, self.radius * 2), pygame.SRCALPHA)
        pygame.draw.polygon(
            shine,
            (255, 255, 255, 120),
            [(self.radius, 2), (self.radius + 6, self.radius + 3), (self.radius - 6, self.radius + 3)],
        )
        shine_rect = shine.get_rect(center=center)
        surface.blit(shine, shine_rect)


class Hazard:
    def __init__(self, pos: pygame.Vector2, speed_range: Tuple[int, int]):
        self.pos = pos
        self.size = 24
        self.vel = self._random_velocity(speed_range)

    def _random_velocity(self, speed_range: Tuple[int, int]) -> pygame.Vector2:
        while True:
            vel = pygame.Vector2(random.uniform(-1, 1), random.uniform(-1, 1))
            if vel.length_squared() > 0.1:
                vel = vel.normalize() * random.uniform(speed_range[0], speed_range[1])
                return vel

    def update(self, dt: float):
        self.pos += self.vel * dt
        bounced = False
        if self.pos.x < self.size or self.pos.x > WIDTH - self.size:
            self.vel.x *= -1
            bounced = True
        if self.pos.y < self.size + 40 or self.pos.y > HEIGHT - self.size:
            self.vel.y *= -1
            bounced = True
        if bounced:
            self.pos.x = max(self.size, min(WIDTH - self.size, self.pos.x))
            self.pos.y = max(self.size + 40, min(HEIGHT - self.size, self.pos.y))

    def nudge_away_from(self, point: pygame.Vector2):
        direction = self.pos - point
        if direction.length_squared() == 0:
            direction = pygame.Vector2(random.uniform(-1, 1), random.uniform(-1, 1))
        self.pos += direction.normalize() * 18

    def draw(self, surface, offset: pygame.Vector2):
        rect = pygame.Rect(0, 0, self.size, self.size)
        rect.center = (int(self.pos.x + offset.x), int(self.pos.y + offset.y))
        pygame.draw.rect(surface, COLORS["shadow"], rect.move(3, 4))
        pygame.draw.rect(surface, COLORS["hazard"], rect, border_radius=6)
        # Face
        eye_offset = 6
        eye_size = 4
        pygame.draw.circle(surface, COLORS["player_outline"], (rect.centerx - eye_offset, rect.centery - 3), eye_size)
        pygame.draw.circle(surface, COLORS["player_outline"], (rect.centerx + eye_offset, rect.centery - 3), eye_size)
        pygame.draw.rect(surface, COLORS["player_outline"], (rect.centerx - 6, rect.centery + 5, 12, 3))
        # Stripes for movement flair
        stripe_color = (255, 170, 120)
        pygame.draw.line(surface, stripe_color, (rect.left + 4, rect.top + 6), (rect.left + 10, rect.top + 16), 3)
        pygame.draw.line(surface, stripe_color, (rect.right - 4, rect.top + 6), (rect.right - 10, rect.top + 16), 3)


class Particle:
    def __init__(self, pos: pygame.Vector2, vel: pygame.Vector2, lifetime: float, color: Tuple[int, int, int], size: int):
        self.pos = pygame.Vector2(pos)
        self.vel = pygame.Vector2(vel)
        self.life = lifetime
        self.total = lifetime
        self.color = color
        self.size = size

    def update(self, dt: float):
        self.pos += self.vel * dt
        self.life -= dt

    def draw(self, surface, offset: pygame.Vector2):
        if self.life <= 0:
            return
        alpha = max(0, min(255, int((self.life / self.total) * 255)))
        surf = pygame.Surface((self.size * 2, self.size * 2), pygame.SRCALPHA)
        pygame.draw.circle(surf, (*self.color, alpha), (self.size, self.size), self.size)
        rect = surf.get_rect(center=(int(self.pos.x + offset.x), int(self.pos.y + offset.y)))
        surface.blit(surf, rect)


class FloatingText:
    def __init__(self, pos: pygame.Vector2, text: str, color: Tuple[int, int, int]):
        self.pos = pygame.Vector2(pos)
        self.text = text
        self.color = color
        self.life = 1.0

    def update(self, dt: float):
        self.life -= dt
        self.pos.y -= 30 * dt

    def draw(self, surface, font, offset: pygame.Vector2):
        if self.life <= 0:
            return
        alpha = max(0, min(255, int(self.life * 255)))
        txt_surf = font.render(self.text, True, self.color)
        txt_surf.set_alpha(alpha)
        rect = txt_surf.get_rect(center=(int(self.pos.x + offset.x), int(self.pos.y + offset.y)))
        surface.blit(txt_surf, rect)


class Game:
    def __init__(self):
        pygame.init()
        self.screen = pygame.display.set_mode((WIDTH, HEIGHT))
        pygame.display.set_caption("Mouse Dash!")
        self.clock = pygame.time.Clock()
        self.background = self.build_background()
        self.font = pygame.font.SysFont(None, 26)
        self.big_font = pygame.font.SysFont(None, 42)
        self.huge_font = pygame.font.SysFont(None, 54)
        self.base_dir = Path(__file__).resolve().parent
        self.assets = Assets(self.base_dir)
        self.high_score = self._load_high_score()
        self.new_high_score = False
        self.state = "menu"
        self.difficulty_index = 0
        self.particles: List[Particle] = []
        self.floaters: List[FloatingText] = []
        self.shake_timer = 0.0
        self.shake_strength = 10
        self.reset_run()

    def _load_high_score(self) -> int:
        path = self.base_dir / HIGHSCORE_FILENAME
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            return int(data.get("high_score", 0))
        except Exception:
            return 0

    def _save_high_score(self):
        path = self.base_dir / HIGHSCORE_FILENAME
        try:
            path.write_text(json.dumps({"high_score": self.high_score}, indent=2), encoding="utf-8")
        except Exception:
            pass

    def _enter_game_over(self):
        self.state = "game_over"
        if self.score > self.high_score:
            self.high_score = self.score
            self.new_high_score = True
            self._save_high_score()
        else:
            self.new_high_score = False

    def reset_run(self, difficulty_index: int = None):
        if difficulty_index is not None:
            self.difficulty_index = difficulty_index
        diff = DIFFICULTIES[self.difficulty_index]
        self.score = 0
        self.lives = diff["lives"]
        self.time_left = float(diff["time"])
        self.player = Player((WIDTH // 2, HEIGHT // 2), self.assets.mouse_frames, self.assets.mouse_shadows)
        self.items: List[Item] = []
        self.hazards: List[Hazard] = []
        self.time_accum = 0.0
        self.combo = 0
        self.combo_timer = 0.0
        self.particles.clear()
        self.floaters.clear()
        self.shake_timer = 0.0
        self.new_high_score = False
        self.spawn_hazards(diff["hazards"], diff["hazard_speed"])
        self.spawn_items(diff["items"])
        self.state = "menu"  # show menu before first start

    def spawn_items(self, count: int):
        attempts = 0
        new_item_radius = (self.assets.cheese.get_width() // 2) if self.assets.cheese else 10
        while len(self.items) < count and attempts < count * 20:
            attempts += 1
            pos = pygame.Vector2(
                random.randint(40, WIDTH - 40),
                random.randint(80, HEIGHT - 40),
            )
            too_close_player = pos.distance_to(self.player.pos) < 80
            too_close_other = any(pos.distance_to(item.pos) < (item.radius + new_item_radius + 8) for item in self.items)
            too_close_hazard = any(pos.distance_to(h.pos) < (h.size + new_item_radius + 12) for h in self.hazards)
            if not too_close_player and not too_close_other and not too_close_hazard:
                self.items.append(Item(pos, self.assets.cheese, self.assets.cheese_shadow))

    def spawn_hazards(self, count: int, speed_range: Tuple[int, int]):
        attempts = 0
        while len(self.hazards) < count and attempts < count * 25:
            attempts += 1
            pos = pygame.Vector2(
                random.randint(60, WIDTH - 60),
                random.randint(100, HEIGHT - 60),
            )
            if pos.distance_to(self.player.pos) < 120:
                continue
            if any(pos.distance_to(h.pos) < 60 for h in self.hazards):
                continue
            self.hazards.append(Hazard(pos, speed_range))

    def start_game(self):
        self.state = "playing"
        self.time_left = float(DIFFICULTIES[self.difficulty_index]["time"])
        self.score = 0
        self.lives = DIFFICULTIES[self.difficulty_index]["lives"]
        self.new_high_score = False
        self.combo = 0
        self.combo_timer = 0.0
        self.player.pos = pygame.Vector2(WIDTH // 2, HEIGHT // 2)
        self.player.hit_cooldown = 0.0
        self.items.clear()
        self.hazards.clear()
        self.particles.clear()
        self.floaters.clear()
        self.shake_timer = 0.0
        diff = DIFFICULTIES[self.difficulty_index]
        self.spawn_hazards(diff["hazards"], diff["hazard_speed"])
        self.spawn_items(diff["items"])

    def handle_events(self):
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()
            if event.type != pygame.KEYDOWN:
                continue

            if event.key == pygame.K_q:
                pygame.quit()
                sys.exit()

            if self.state in ("playing", "paused") and event.key in (pygame.K_p, pygame.K_ESCAPE):
                self.state = "paused" if self.state == "playing" else "playing"
                continue

            if self.state == "playing" and event.key == pygame.K_r:
                self.start_game()
                continue

            if self.state == "paused":
                if event.key == pygame.K_r:
                    self.start_game()
                elif event.key == pygame.K_m:
                    self.state = "menu"
                continue

            if self.state == "menu":
                if event.key in (pygame.K_1, pygame.K_2, pygame.K_3):
                    self.difficulty_index = int(event.unicode) - 1
                    self.start_game()
                elif event.key in (pygame.K_RETURN, pygame.K_SPACE):
                    self.start_game()
                elif event.key == pygame.K_UP:
                    self.difficulty_index = (self.difficulty_index - 1) % len(DIFFICULTIES)
                elif event.key == pygame.K_DOWN:
                    self.difficulty_index = (self.difficulty_index + 1) % len(DIFFICULTIES)
                elif event.key == pygame.K_ESCAPE:
                    pygame.quit()
                    sys.exit()

            if self.state == "game_over":
                if event.key in (pygame.K_RETURN, pygame.K_SPACE):
                    self.start_game()
                elif event.key in (pygame.K_r, pygame.K_m):
                    self.state = "menu"

    def update(self, dt: float):
        self.time_accum += dt
        if self.shake_timer > 0:
            self.shake_timer = max(0.0, self.shake_timer - dt)
        self.update_effects(dt)
        if self.state != "playing":
            return
        if self.combo_timer > 0:
            self.combo_timer = max(0.0, self.combo_timer - dt)
            if self.combo_timer == 0:
                self.combo = 0
        keys = pygame.key.get_pressed()
        self.player.update(keys, dt)
        for hazard in self.hazards:
            hazard.update(dt)
        self.handle_collisions()
        self.time_left = max(0.0, self.time_left - dt)
        if self.time_left <= 0 or self.lives <= 0:
            self._enter_game_over()

    def handle_collisions(self):
        # Player vs items
        collected = []
        for item in self.items:
            if self.player.pos.distance_to(item.pos) <= self.player.radius + item.radius:
                collected.append(item)
                if self.combo_timer > 0:
                    self.combo += 1
                else:
                    self.combo = 1
                self.combo_timer = COMBO_WINDOW
                bonus = min(COMBO_BONUS_CAP, (self.combo - 1) * COMBO_BONUS_STEP)
                points = 10 + bonus
                self.score += points
                self.spawn_collect_effect(item.pos, points, self.combo)
        for item in collected:
            self.items.remove(item)
        if not self.items:
            diff = DIFFICULTIES[self.difficulty_index]
            self.spawn_items(diff["items"])
        # Player vs hazards
        if not self.player.can_take_hit():
            return
        for hazard in self.hazards:
            if self.player.pos.distance_to(hazard.pos) <= self.player.radius + hazard.size * 0.5:
                self.lives -= 1
                self.player.mark_hit()
                hazard.nudge_away_from(self.player.pos)
                self.spawn_hit_effect(self.player.pos)
                break

    def build_background(self) -> pygame.Surface:
        top = pygame.Surface((WIDTH, HEIGHT))
        for y in range(HEIGHT):
            blend = y / HEIGHT
            r = int(COLORS["bg_top"][0] * (1 - blend) + COLORS["bg_bottom"][0] * blend)
            g = int(COLORS["bg_top"][1] * (1 - blend) + COLORS["bg_bottom"][1] * blend)
            b = int(COLORS["bg_top"][2] * (1 - blend) + COLORS["bg_bottom"][2] * blend)
            pygame.draw.line(top, (r, g, b), (0, y), (WIDTH, y))
        # Add subtle floor pattern
        tile = 60
        shade = pygame.Surface((tile, tile), pygame.SRCALPHA)
        shade.fill((255, 255, 255, 12))
        for x in range(0, WIDTH, tile):
            for y in range(40, HEIGHT, tile):
                if (x // tile + y // tile) % 2 == 0:
                    top.blit(shade, (x, y))
        return top

    def draw_background(self):
        self.screen.blit(self.background, (0, 0))

    def draw_hud(self):
        diff = DIFFICULTIES[self.difficulty_index]
        score_text = self.font.render(f"Score: {self.score}", True, COLORS["hud"])
        timer_text = self.font.render(f"Time: {int(self.time_left)}s", True, COLORS["hud"])
        lives_text = self.font.render(f"Lives: {self.lives}", True, COLORS["hud"])
        diff_text = self.font.render(f"Difficulty: {diff['name']}", True, COLORS["hud"])
        high_text = self.font.render(f"High: {self.high_score}", True, COLORS["hud"])
        self.screen.blit(score_text, (14, 10))
        self.screen.blit(timer_text, (14, 34))
        self.screen.blit(diff_text, (WIDTH - 200, 34))
        self.screen.blit(high_text, (WIDTH - 200, 58))
        if self.combo > 1 and self.state == "playing":
            combo_text = self.font.render(f"Combo x{self.combo}", True, COLORS["item"])
            self.screen.blit(combo_text, (WIDTH - 200, 82))
        self.screen.blit(lives_text, (WIDTH - 120, 10))
        self.draw_lives_icons()
        if self.player.hit_cooldown > 0 and self.state == "playing":
            flash = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
            flash.fill((255, 255, 255, 35))
            self.screen.blit(flash, (0, 0))

    def draw_menu(self):
        self.draw_background()
        title = self.huge_font.render("Mouse Dash!", True, COLORS["hud"])
        self.screen.blit(title, (WIDTH // 2 - title.get_width() // 2, 110))
        subtitle = self.font.render("Collect cheese, dodge cats, beat the clock.", True, COLORS["hud"])
        self.screen.blit(subtitle, (WIDTH // 2 - subtitle.get_width() // 2, 170))
        best = self.font.render(f"High Score: {self.high_score}", True, COLORS["hud"])
        self.screen.blit(best, (WIDTH // 2 - best.get_width() // 2, 195))
        for idx, diff in enumerate(DIFFICULTIES):
            color = COLORS["hud"] if idx != self.difficulty_index else COLORS["item"]
            line = self.big_font.render(
                f"{idx+1}. {diff['name']} - {diff['lives']} lives, {diff['time']}s, {diff['hazards']} cats",
                True,
                color,
            )
            self.screen.blit(line, (WIDTH // 2 - line.get_width() // 2, 230 + idx * 50))
        hint = self.font.render("1/2/3: level  Enter/Space: start  Arrows/WASD: move  Q: quit", True, COLORS["hud"])
        self.screen.blit(hint, (WIDTH // 2 - hint.get_width() // 2, HEIGHT - 80))

    def draw_game(self):
        self.draw_background()
        offset = self.camera_offset()
        for item in self.items:
            item.draw(self.screen, self.time_accum, offset)
        for hazard in self.hazards:
            hazard.draw(self.screen, offset)
        self.player.draw(self.screen, offset)
        self.draw_particles(offset)
        self.draw_floaters(offset)
        self.draw_hud()

    def draw_game_over(self):
        self.draw_game()
        overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
        overlay.fill((0, 0, 0, 140))
        self.screen.blit(overlay, (0, 0))
        txt = self.huge_font.render("Game Over", True, COLORS["hud"])
        self.screen.blit(txt, (WIDTH // 2 - txt.get_width() // 2, HEIGHT // 2 - 90))
        summary = self.big_font.render(f"Score: {self.score}", True, COLORS["hud"])
        self.screen.blit(summary, (WIDTH // 2 - summary.get_width() // 2, HEIGHT // 2 - 30))
        best = self.font.render(f"High Score: {self.high_score}", True, COLORS["hud"])
        self.screen.blit(best, (WIDTH // 2 - best.get_width() // 2, HEIGHT // 2 + 5))
        if self.new_high_score:
            new_best = self.font.render("New High Score!", True, COLORS["item"])
            self.screen.blit(new_best, (WIDTH // 2 - new_best.get_width() // 2, HEIGHT // 2 - 5))
        hint = self.font.render("Enter/Space: restart   R/M: menu   Q: quit", True, COLORS["hud"])
        self.screen.blit(hint, (WIDTH // 2 - hint.get_width() // 2, HEIGHT // 2 + 30))

    def draw_pause(self):
        self.draw_game()
        overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
        overlay.fill((0, 0, 0, 140))
        self.screen.blit(overlay, (0, 0))
        txt = self.huge_font.render("Paused", True, COLORS["hud"])
        self.screen.blit(txt, (WIDTH // 2 - txt.get_width() // 2, HEIGHT // 2 - 70))
        hint = self.font.render("P/Esc: resume   R: restart   M: menu   Q: quit", True, COLORS["hud"])
        self.screen.blit(hint, (WIDTH // 2 - hint.get_width() // 2, HEIGHT // 2 - 10))

    def draw_lives_icons(self):
        for i in range(self.lives):
            x = 14 + i * 26
            y = 60
            pygame.draw.circle(self.screen, COLORS["heart"], (x + 10, y + 10), 10)
            pygame.draw.circle(self.screen, (255, 255, 255), (x + 10, y + 8), 4)

    def spawn_collect_effect(self, pos: pygame.Vector2, points: int, combo: int):
        for _ in range(12):
            angle = random.uniform(0, math.pi * 2)
            speed = random.uniform(80, 160)
            vel = pygame.Vector2(math.cos(angle), math.sin(angle)) * speed
            self.particles.append(Particle(pos, vel, 0.4, COLORS["gold"], 3))
        self.floaters.append(FloatingText(pos, f"+{points}", COLORS["gold"]))
        if combo >= 2:
            self.floaters.append(FloatingText(pos + pygame.Vector2(0, -18), f"Combo x{combo}", COLORS["item"]))

    def spawn_hit_effect(self, pos: pygame.Vector2):
        for _ in range(18):
            angle = random.uniform(0, math.pi * 2)
            speed = random.uniform(120, 220)
            vel = pygame.Vector2(math.cos(angle), math.sin(angle)) * speed
            self.particles.append(Particle(pos, vel, 0.5, COLORS["hazard"], 4))
        self.shake_timer = 0.25

    def update_effects(self, dt: float):
        for p in list(self.particles):
            p.update(dt)
            if p.life <= 0:
                self.particles.remove(p)
        for ft in list(self.floaters):
            ft.update(dt)
            if ft.life <= 0:
                self.floaters.remove(ft)

    def draw_particles(self, offset: pygame.Vector2):
        for p in self.particles:
            p.draw(self.screen, offset)

    def draw_floaters(self, offset: pygame.Vector2):
        for ft in self.floaters:
            ft.draw(self.screen, self.font, offset)

    def camera_offset(self) -> pygame.Vector2:
        if self.shake_timer <= 0:
            return pygame.Vector2(0, 0)
        power = self.shake_timer / 0.25
        return pygame.Vector2(
            random.uniform(-1, 1) * self.shake_strength * power,
            random.uniform(-1, 1) * self.shake_strength * power,
        )

    def run(self):
        while True:
            dt = self.clock.tick(FPS) / 1000.0
            self.handle_events()
            self.update(dt)
            if self.state == "menu":
                self.draw_menu()
            elif self.state == "playing":
                self.draw_game()
            elif self.state == "paused":
                self.draw_pause()
            elif self.state == "game_over":
                self.draw_game_over()
            pygame.display.flip()


if __name__ == "__main__":
    Game().run()

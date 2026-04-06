"""
GD-ish clone tuned for the hand controller.
Visual tweaks: gradient BG, spikes, rotation, progress %, attempts.
Controls: space/left click to jump. Esc to quit.
"""

import argparse
import math
import random
import sys
import time
from dataclasses import dataclass

import pygame


WHITE = (245, 245, 245)
BLACK = (20, 20, 28)
BG_TOP = (40, 15, 65)
BG_BOT = (18, 10, 30)
ACCENT = (120, 200, 255)
ACCENT2 = (200, 120, 255)  # bright purple for alternate spikes
NEON = (0, 255, 180)
CRASH_RED = (255, 120, 120)

WIDTH, HEIGHT = 900, 520
GROUND_Y = HEIGHT - 80
LEVEL_TIME = 40.0  # seconds to reach 100%
GROUND_TILE_W = 64
GROUND_TILE_H = 20
ground_scroll = 0.0


@dataclass
class Player:
    x: float = 140
    y: float = GROUND_Y
    vy: float = 0.0  # pixels/sec
    size: int = 40
    on_ground: bool = True
    angle: float = 0.0
    coyote_timer: float = 0.0   # small grace time after leaving ground

    def rect(self):
        return pygame.Rect(int(self.x), int(self.y) - self.size, self.size, self.size)

    def jump(self):
        if self.on_ground:
            self.vy = -950  # jump impulse (pixels/sec)
            self.on_ground = False
            self.coyote_timer = 0.0

    def update(self, dt: float, gravity: float):
        self.vy += gravity * dt
        self.y += self.vy * dt
        if self.y >= GROUND_Y:
            self.y = GROUND_Y
            self.vy = 0
            self.on_ground = True
            self.angle = 0
            self.coyote_timer = 0.08  # reset coyote on landing
        else:
            self.angle -= 560 * dt  # spin in air
            self.coyote_timer = max(0.0, self.coyote_timer - dt)


@dataclass
class Obstacle:
    x: float
    y: float
    w: int
    h: int
    color: tuple
    kind: str = "spike"  # "spike" or "platform"

    def rect(self):
        return pygame.Rect(int(self.x), int(self.y) - self.h, self.w, self.h)


def spawn_pattern(start_x: float, allowed_patterns: list[str], gap_range=(100, 140)) -> list[Obstacle]:
    """Generate a small pattern of spikes/blocks; patterns limited by difficulty."""
    obstacles: list[Obstacle] = []
    gap = random.randint(gap_range[0], gap_range[1])
    pattern = random.choice(allowed_patterns)

    def add_spike(ix, height_scale=1.0, width=None):
        width = width or random.choice([24, 26, 28])
        height = random.choice([42, 50, 58])
        height = int(height * height_scale)
        color = ACCENT if random.random() < 0.5 else ACCENT2
        obstacles.append(Obstacle(x=ix, y=GROUND_Y, w=width, h=height, color=color, kind="spike"))

    def add_platform(ix, width=140, height=16, elevation=80):
        color = (120, 140, 190)
        obstacles.append(Obstacle(x=ix, y=GROUND_Y - elevation, w=width, h=height, color=color, kind="platform"))

    def add_spike_strip(start_x, end_x, spacing=28):
        x = start_x
        while x < end_x:
            add_spike(x, height_scale=1.0, width=26)
            x += spacing

    x = start_x
    if pattern == "single":
        add_spike(x)
        x += gap
    elif pattern == "double":
        spacing = 8  # keep clustered
        w = random.choice([24, 26])
        add_spike(x, width=w); x += w + spacing
        add_spike(x, width=w)
        x += gap
    elif pattern == "triple":
        spacing = 6  # very close to act like one obstacle
        w = random.choice([22, 24, 26])
        for _ in range(3):
            add_spike(x, width=w, height_scale=0.85)  # shorter for fairness
            x += w + spacing
        x += gap
    elif pattern == "stair":
        add_spike(x, 0.9); x += 45
        add_spike(x, 1.1); x += 45
        add_spike(x, 1.25); x += gap
    elif pattern == "tall":
        add_spike(x, 1.35); x += gap
    elif pattern == "platform":
        width = random.randint(120, 180)
        elev = random.randint(60, 110)
        add_platform(x, width=width, height=18, elevation=elev)
        # Ground hazard beneath platform to encourage using it.
        add_spike_strip(x, x + width - 10, spacing=26)
        x += width + random.randint(60, 100)

    return obstacles, x


def draw_ground(surface):
    global ground_scroll
    pygame.draw.rect(surface, (55, 55, 95), (0, GROUND_Y, WIDTH, HEIGHT - GROUND_Y))


def draw_parallax(surface, t):
    for i in range(14):
        y = 110 + 22 * math.sin(t * 0.5 + i)
        x = (t * -70 + i * 140) % (WIDTH + 140) - 140
        pygame.draw.circle(surface, (45, 55, 100), (int(x), int(y)), 18)


def main():
    parser = argparse.ArgumentParser(description="GD-style clone (space/left click to jump).")
    parser.add_argument("--width", type=int, default=900)
    parser.add_argument("--height", type=int, default=520)
    parser.add_argument("--fullscreen", action="store_true")
    parser.add_argument("--speed", type=float, default=330.0, help="Base obstacle speed (pixels/sec). (overridden by difficulty selection)")
    parser.add_argument("--level-seconds", type=float, default=LEVEL_TIME, help="Seconds to finish a run (for % bar). (overridden by difficulty selection)")
    parser.add_argument(
        "--behavior",
        choices=["tap", "hold"],
        default="tap",
        help="Kept for compatibility with hand controller flags (game always uses tap-style jumps).",
    )
    parser.add_argument(
        "--sfx-start",
        default="assets/game-start.mp3",
        help="Path to start-round sound.",
    )
    parser.add_argument(
        "--sfx-gameover",
        default="assets/game-over.mp3",
        help="Path to game-over sound.",
    )
    parser.add_argument(
        "--music",
        default="assets/arcade-background.mp3",
        help="Path to background music.",
    )
    args = parser.parse_args()

    pygame.init()
    try:
        pygame.mixer.init()
    except Exception:
        pass
    flags = pygame.FULLSCREEN if args.fullscreen else 0
    screen = pygame.display.set_mode((args.width, args.height), flags)
    try:
        icon = pygame.image.load("assets/dualdash.png").convert_alpha()
        pygame.display.set_icon(icon)
    except Exception:
        pass
    pygame.display.set_caption("Dual Dash")
    clock = pygame.time.Clock()
    font_small = pygame.font.SysFont("bahnschrift", 20)
    font_big = pygame.font.SysFont("bahnschrift", 32, bold=True)

    difficulties = [
        {"name": "Easy", "speed": 280.0, "level_seconds": 45.0, "patterns": ["single", "double"], "gap": (120, 150)},
        {"name": "Medium", "speed": 330.0, "level_seconds": 40.0, "patterns": ["single", "double", "triple", "platform"], "gap": (110, 140)},
        {"name": "Hard", "speed": 360.0, "level_seconds": 38.0, "patterns": ["single", "double", "triple", "stair", "tall", "platform"], "gap": (100, 135)},
    ]
    selected_idx = 0
    swipe_start_x = None
    left_arrow_rect = None
    right_arrow_rect = None
    mouse_pos = (0, 0)

    def current_conf():
        return difficulties[selected_idx]

    player = Player()
    obstacles: list[Obstacle] = []
    next_pattern_x = WIDTH + 200
    score = 0.0
    best = 0.0
    running = True
    dead = False
    paused = False
    completed = False
    attempts = 0
    stats_modal = False
    best_attempts = [None for _ in difficulties]
    gravity = 3200.0  # pixels/sec^2 (tune with jump)
    speed = current_conf()["speed"]
    level_seconds = current_conf()["level_seconds"]
    distance = 0.0
    distance_goal = level_seconds * speed
    ground_scroll = 0.0
    jump_buffer = 0.0  # seconds
    start_sfx = None
    over_sfx = None
    def reset():
        nonlocal obstacles, next_pattern_x, score, dead, player, speed, distance, ground_scroll, distance_goal, level_seconds, jump_buffer, paused, completed
        player = Player()
        obstacles = []
        score = 0.0
        speed = current_conf()["speed"]
        level_seconds = current_conf()["level_seconds"]
        distance = 0.0
        ground_scroll = 0.0
        next_pattern_x = WIDTH + 200
        distance_goal = level_seconds * speed
        jump_buffer = 0.0
        dead = False
        paused = False
        completed = False
        return

    # Load sounds/music
    if pygame.mixer.get_init():
        try:
            start_sfx = pygame.mixer.Sound(args.sfx_start)
        except Exception:
            start_sfx = None
        try:
            over_sfx = pygame.mixer.Sound(args.sfx_gameover)
        except Exception:
            over_sfx = None
        try:
            pygame.mixer.music.load(args.music)
            pygame.mixer.music.set_volume(0.15)
            pygame.mixer.music.play(-1)
        except Exception:
            pass

    reset()
    start_time = time.time()
    menu = True

    while running:
        dt = clock.tick(60) / 1000.0
        t = time.time() - start_time
        mouse_pos = pygame.mouse.get_pos()
        # Precompute menu layout rects for hit-testing
        card_w, card_h = 260, 150
        card_x = args.width / 2 - card_w / 2
        card_y = args.height / 2 - card_h / 2
        stats_rect = pygame.Rect(args.width / 2 - 80, card_y + card_h + 20, 160, 36)

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type in (pygame.KEYDOWN, pygame.MOUSEBUTTONDOWN, pygame.MOUSEBUTTONUP):
                # Stats modal consumes inputs
                if stats_modal:
                    if (event.type == pygame.KEYDOWN and event.key in (pygame.K_SPACE, pygame.K_RETURN, pygame.K_ESCAPE)) or (
                        event.type == pygame.MOUSEBUTTONDOWN and event.button == 1
                    ):
                        stats_modal = False
                    continue

                if event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
                    if completed:
                        menu = True
                        reset()
                    else:
                        running = False
                elif menu and event.type == pygame.KEYDOWN and event.key in (pygame.K_LEFT, pygame.K_a):
                    selected_idx = max(0, selected_idx - 1)
                elif menu and event.type == pygame.KEYDOWN and event.key in (pygame.K_RIGHT, pygame.K_d):
                    selected_idx = min(len(difficulties) - 1, selected_idx + 1)
                elif event.type == pygame.KEYDOWN and event.key in (pygame.K_1, pygame.K_2, pygame.K_3):
                    selected_idx = {pygame.K_1: 0, pygame.K_2: 1, pygame.K_3: 2}[event.key]
                elif event.type == pygame.KEYDOWN and event.key == pygame.K_SPACE:
                    if stats_modal:
                        stats_modal = False
                    elif menu:
                        menu = False
                        start_time = time.time()
                        reset()
                        attempts = 1  # first run attempt
                        if start_sfx:
                            start_sfx.play()
                    elif dead:
                        dead = False
                        attempts += 1
                        reset()
                        if start_sfx:
                            start_sfx.play()
                    elif completed:
                        # space acts as continue (go home on last level)
                        if selected_idx >= len(difficulties) - 1:
                            menu = True
                            reset()
                        else:
                            selected_idx = min(len(difficulties) - 1, selected_idx + 1)
                            reset()
                            attempts = 1
                            if start_sfx:
                                start_sfx.play()
                    else:
                        jump_buffer = 0.12  # buffer a jump
                # swipe / click on menu
                if stats_modal:
                    if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                        stats_modal = False
                    continue

                if menu and event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                    # arrow hit takes precedence and does NOT start game
                    if left_arrow_rect and left_arrow_rect.collidepoint(event.pos):
                        selected_idx = max(0, selected_idx - 1)
                        swipe_start_x = None
                        continue
                    if right_arrow_rect and right_arrow_rect.collidepoint(event.pos):
                        selected_idx = min(len(difficulties) - 1, selected_idx + 1)
                        swipe_start_x = None
                        continue
                    if stats_rect.collidepoint(event.pos):
                        stats_modal = True
                        continue
                    swipe_start_x = event.pos[0]
                if menu and event.type == pygame.MOUSEBUTTONUP and event.button == 1 and swipe_start_x is not None:
                    delta = event.pos[0] - swipe_start_x
                    if delta > 50:
                        selected_idx = max(0, selected_idx - 1)
                    elif delta < -50:
                        selected_idx = min(len(difficulties) - 1, selected_idx + 1)
                    else:
                        # tap -> start game
                        menu = False
                        start_time = time.time()
                        attempts = 1
                        reset()
                    swipe_start_x = None
                # clicks when not in menu
                if not menu and event.type == pygame.MOUSEBUTTONDOWN and event.button == 1 and not dead and not completed:
                    # pause button click handled later; jump otherwise
                    jump_buffer = 0.12
                elif dead and event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                    dead = False
                    attempts += 1
                    reset()

        # Pause button rect (top-right)
        pause_rect = pygame.Rect(args.width - 60, 10, 40, 40)
        pause_hover = pause_rect.collidepoint(mouse_pos)
        home_rect = pygame.Rect(args.width - 110, 10, 40, 40)
        home_hover = home_rect.collidepoint(mouse_pos)

        # Handle pause clicks (only when running)
        if not menu and not dead and not completed:
            if pygame.mouse.get_pressed()[0] and pause_hover:
                paused = not paused
                pygame.time.wait(120)  # debounce
            if pygame.mouse.get_pressed()[0] and home_hover:
                menu = True
                reset()
                attempts = 0
                pygame.time.wait(120)

        if not menu and not dead and not paused and not completed:
            player.update(dt, gravity)
            # jump buffer + coyote time
            if jump_buffer > 0:
                jump_buffer -= dt
            can_jump = player.on_ground or player.coyote_timer > 0
            if can_jump and jump_buffer > 0:
                player.jump()
                jump_buffer = 0

            # Distance / ground scroll
            distance += speed * dt
            ground_scroll = (ground_scroll + speed * dt) % GROUND_TILE_W

            # Pattern generation
            while next_pattern_x < WIDTH + 260:
                new_obs, next_pattern_x = spawn_pattern(
                    next_pattern_x,
                    allowed_patterns=current_conf()["patterns"],
                    gap_range=current_conf()["gap"],
                )
                obstacles.extend(new_obs)
                next_pattern_x += random.uniform(140, 220)
            # Move and cull
            for ob in obstacles:
                ob.x -= speed * dt
            obstacles = [ob for ob in obstacles if ob.x + ob.w > -120]
            next_pattern_x -= speed * dt

            # Difficulty curve
            speed = min(speed + 6 * dt, current_conf()["speed"] + 150)

            # Collision
            prect = player.rect()
            for ob in list(obstacles):
                if not prect.colliderect(ob.rect()):
                    continue
                if ob.kind == "platform":
                    r = ob.rect()
                    # Landing check (coming from above)
                    if player.vy >= 0 and prect.bottom <= r.top + 12:
                        player.y = r.top
                        player.vy = 0
                        player.on_ground = True
                        player.coyote_timer = 0.08
                        jump_buffer = 0.0
                        break
                    else:
                        # Slide player sideways instead of killing on platform side/bottom collisions
                        if prect.centerx < r.centerx:
                            player.x = r.left - player.size - 1
                        else:
                            player.x = r.right + 1
                        continue
                else:
                    dead = True
                    best = max(best, score)
                    if over_sfx:
                        over_sfx.play()
                    break

            # Score / progress
            score += dt * 10
            if distance >= distance_goal and not completed:
                completed = True
                paused = True
                # record best attempts
                if attempts == 0:
                    attempts = 1
                best_attempts[selected_idx] = attempts if best_attempts[selected_idx] is None else min(best_attempts[selected_idx], attempts)
                attempts = 0  # reset for next level menu display

        # Draw
        # gradient BG
        for y in range(args.height):
            blend = y / args.height
            r = int(BG_TOP[0] * (1 - blend) + BG_BOT[0] * blend)
            g = int(BG_TOP[1] * (1 - blend) + BG_BOT[1] * blend)
            b = int(BG_TOP[2] * (1 - blend) + BG_BOT[2] * blend)
            pygame.draw.line(screen, (r, g, b), (0, y), (args.width, y))

        draw_parallax(screen, t)
        draw_ground(screen)

        # Obstacles as spikes
        for ob in obstacles:
            r = ob.rect()
            if ob.kind == "spike":
                points = [(r.left, r.bottom), (r.right, r.bottom), (r.centerx, r.bottom - ob.h)]
                pygame.draw.polygon(screen, ob.color, points)
                pygame.draw.polygon(screen, BLACK, points, width=2)
            else:
                pygame.draw.rect(screen, ob.color, r, border_radius=3)
                pygame.draw.rect(screen, BLACK, r, width=1, border_radius=3)

        # Player (rotating cube)
        prect = player.rect()
        cube_surface = pygame.Surface((player.size, player.size), pygame.SRCALPHA)
        pygame.draw.rect(cube_surface, WHITE if not dead else CRASH_RED, cube_surface.get_rect(), border_radius=6)
        pygame.draw.rect(cube_surface, BLACK, cube_surface.get_rect(), width=2, border_radius=6)
        rotated = pygame.transform.rotozoom(cube_surface, player.angle, 1)
        screen.blit(rotated, rotated.get_rect(center=prect.center))

        # HUD
        percent = 0 if (menu or dead) else min(100, int((distance / distance_goal) * 100))
        bar_w = args.width * 0.5
        pygame.draw.rect(screen, (50, 60, 90), (args.width * 0.25, 18, bar_w, 10), border_radius=5)
        pygame.draw.rect(screen, NEON, (args.width * 0.25, 18, bar_w * (percent / 100), 10), border_radius=5)
        screen.blit(font_small.render(f"{percent}%", True, WHITE), (args.width * 0.25 + bar_w + 10, 12))
        screen.blit(font_small.render(f"Attempt {attempts}", True, WHITE), (20, 12))
        screen.blit(font_small.render(f"Level: {current_conf()['name']}", True, WHITE), (20, 34))

        # Pause/play button
        pygame.draw.rect(screen, (90, 100, 150) if pause_hover else (70, 80, 120), pause_rect, border_radius=8)
        if paused or menu or completed:
            # play icon
            tri = [
                (pause_rect.x + 12, pause_rect.y + 10),
                (pause_rect.x + 12, pause_rect.y + 30),
                (pause_rect.x + 28, pause_rect.y + 20),
            ]
            pygame.draw.polygon(screen, WHITE, tri)
        else:
            # pause icon
            pygame.draw.rect(screen, WHITE, (pause_rect.x + 10, pause_rect.y + 10, 6, 20), border_radius=2)
            pygame.draw.rect(screen, WHITE, (pause_rect.x + 24, pause_rect.y + 10, 6, 20), border_radius=2)

        # Home button
        pygame.draw.rect(screen, (90, 100, 150) if home_hover else (70, 80, 120), home_rect, border_radius=8)
        # simple house icon: triangle roof + square base
        roof = [
            (home_rect.x + 8, home_rect.y + 20),
            (home_rect.centerx, home_rect.y + 8),
            (home_rect.right - 8, home_rect.y + 20),
        ]
        pygame.draw.polygon(screen, WHITE, roof)
        pygame.draw.rect(screen, WHITE, (home_rect.x + 10, home_rect.y + 20, 20, 14), border_radius=2)

        if dead:
            msg = font_big.render("Crashed! Space/Click to restart. Esc to quit.", True, CRASH_RED)
            screen.blit(msg, (args.width / 2 - msg.get_width() / 2, args.height * 0.55))
        if completed:
            overlay = pygame.Surface((args.width, args.height), pygame.SRCALPHA)
            overlay.fill((0, 0, 0, 160))
            screen.blit(overlay, (0, 0))
            box_w, box_h = 420, 200
            box = pygame.Rect(args.width / 2 - box_w / 2, args.height / 2 - box_h / 2, box_w, box_h)
            pygame.draw.rect(screen, (40, 50, 90), box, border_radius=16)
            pygame.draw.rect(screen, WHITE, box, width=3, border_radius=16)
            title = font_big.render("Level Complete!", True, WHITE)
            screen.blit(title, (box.centerx - title.get_width() / 2, box.y + 24))

            if selected_idx < len(difficulties) - 1:
                yes_rect = pygame.Rect(box.centerx - 150, box.y + 100, 120, 46)
                no_rect = pygame.Rect(box.centerx + 30, box.y + 100, 120, 46)
                yes_hover = yes_rect.collidepoint(mouse_pos)
                no_hover = no_rect.collidepoint(mouse_pos)
                pygame.draw.rect(screen, (110, 180, 110) if yes_hover else (90, 150, 90), yes_rect, border_radius=10)
                pygame.draw.rect(screen, WHITE, yes_rect, width=2 if yes_hover else 1, border_radius=10)
                pygame.draw.rect(screen, (180, 110, 110) if no_hover else (150, 90, 90), no_rect, border_radius=10)
                pygame.draw.rect(screen, WHITE, no_rect, width=2 if no_hover else 1, border_radius=10)
                ytxt = font_small.render("Yes", True, WHITE)
                ntxt = font_small.render("No", True, WHITE)
                screen.blit(ytxt, (yes_rect.centerx - ytxt.get_width() / 2, yes_rect.centery - ytxt.get_height() / 2))
                screen.blit(ntxt, (no_rect.centerx - ntxt.get_width() / 2, no_rect.centery - ntxt.get_height() / 2))
                prompt = font_small.render("Move to the next level?", True, WHITE)
                screen.blit(prompt, (box.centerx - prompt.get_width() / 2, box.y + 60))
                # click handling
                if pygame.mouse.get_pressed()[0]:
                    if yes_rect.collidepoint(mouse_pos):
                        selected_idx += 1
                        reset()
                        menu = False
                        attempts = 1
                        start_time = time.time()
                    elif no_rect.collidepoint(mouse_pos):
                        menu = True
                        reset()
                        attempts = 0
            else:
                home_rect = pygame.Rect(box.centerx - 100, box.y + 110, 200, 50)
                home_hover = home_rect.collidepoint(mouse_pos)
                pygame.draw.rect(screen, (110, 180, 230) if home_hover else (90, 150, 200), home_rect, border_radius=12)
                pygame.draw.rect(screen, WHITE, home_rect, width=2 if home_hover else 1, border_radius=12)
                htxt = font_small.render("Back to Home", True, WHITE)
                screen.blit(htxt, (home_rect.centerx - htxt.get_width() / 2, home_rect.centery - htxt.get_height() / 2))
                if pygame.mouse.get_pressed()[0] and home_rect.collidepoint(mouse_pos):
                    menu = True
                    reset()
                    attempts = 0

        # Stats modal (only from menu)
        if stats_modal:
            overlay = pygame.Surface((args.width, args.height), pygame.SRCALPHA)
            overlay.fill((0, 0, 0, 180))
            screen.blit(overlay, (0, 0))
            box_w, box_h = 440, 260
            box = pygame.Rect(args.width / 2 - box_w / 2, args.height / 2 - box_h / 2, box_w, box_h)
            pygame.draw.rect(screen, (40, 50, 90), box, border_radius=16)
            pygame.draw.rect(screen, WHITE, box, width=3, border_radius=16)
            title = font_big.render("Stats", True, WHITE)
            screen.blit(title, (box.centerx - title.get_width() / 2, box.y + 18))
            for idx, conf in enumerate(difficulties):
                row_y = box.y + 70 + idx * 50
                name = font_small.render(conf["name"], True, WHITE)
                val = best_attempts[idx]
                val_txt = "--" if val is None else f"{val} attempt(s)"
                best_txt = font_small.render(f"Best: {val_txt}", True, WHITE)
                screen.blit(name, (box.x + 30, row_y))
                screen.blit(best_txt, (box.x + 200, row_y))
            tip = font_small.render("Click or press Esc/Space to close", True, WHITE)
            screen.blit(tip, (box.centerx - tip.get_width() / 2, box.bottom - 40))

        if menu and not stats_modal:
            title = font_big.render("DUAL DASH", True, WHITE)
            screen.blit(title, (args.width / 2 - title.get_width() / 2, args.height / 2 - 120))

            # Single card carousel (one card visible at a time)
            card_w, card_h = 260, 150
            x = args.width / 2 - card_w / 2
            y = args.height / 2 - card_h / 2
            rect = pygame.Rect(x, y, card_w, card_h)
            hovered_card = rect.collidepoint(mouse_pos)
            fill = (100, 120, 190) if hovered_card else (90, 110, 170)
            border_col = (255, 255, 255) if hovered_card else (220, 220, 240)
            pygame.draw.rect(screen, fill, rect, border_radius=18)
            pygame.draw.rect(screen, border_col, rect, width=4 if hovered_card else 3, border_radius=18)
            name = font_big.render(current_conf()["name"], True, WHITE)
            screen.blit(name, (rect.centerx - name.get_width() / 2, rect.centery - name.get_height() / 2))

            # Stats button
            stats_hover = stats_rect.collidepoint(mouse_pos)
            pygame.draw.rect(
                screen,
                (120, 140, 210) if stats_hover else (90, 110, 170),
                stats_rect,
                border_radius=10,
            )
            pygame.draw.rect(screen, WHITE, stats_rect, width=2 if stats_hover else 1, border_radius=10)
            stxt = font_small.render("Stats", True, WHITE)
            screen.blit(stxt, (stats_rect.centerx - stxt.get_width() / 2, stats_rect.centery - stxt.get_height() / 2))

            # Dots indicator
            dots_y = args.height - 40
            dot_spacing = 18
            dot_start = args.width / 2 - dot_spacing * (len(difficulties) - 1) / 2
            for idx in range(len(difficulties)):
                dx = dot_start + idx * dot_spacing
                pygame.draw.circle(screen, WHITE if idx == selected_idx else (120, 120, 150), (int(dx), int(dots_y)), 5)

            # Arrows for swipe/click
            arrow_size = 22
            left_points = [
                (x - 40, y + card_h / 2),
                (x - 20, y + card_h / 2 - arrow_size),
                (x - 20, y + card_h / 2 + arrow_size),
            ]
            right_points = [
                (x + card_w + 40, y + card_h / 2),
                (x + card_w + 20, y + card_h / 2 - arrow_size),
                (x + card_w + 20, y + card_h / 2 + arrow_size),
            ]
            hover_left = menu and left_arrow_rect and left_arrow_rect.collidepoint(mouse_pos)
            hover_right = menu and right_arrow_rect and right_arrow_rect.collidepoint(mouse_pos)
            pygame.draw.polygon(screen, (255, 255, 255) if hover_left else (200, 200, 220), left_points)
            pygame.draw.polygon(screen, (255, 255, 255) if hover_right else (200, 200, 220), right_points)

            # Clickable arrow hitboxes
            left_hit = pygame.Rect(x - 60, y + card_h / 2 - 30, 40, 60)
            right_hit = pygame.Rect(x + card_w + 20, y + card_h / 2 - 30, 40, 60)
            # Store for event handling
            left_arrow_rect = left_hit
            right_arrow_rect = right_hit

        pygame.display.flip()

    pygame.quit()
    sys.exit()


if __name__ == "__main__":
    main()

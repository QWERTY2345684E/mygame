# Mouse Dash! - Design, Testing, and Evaluation

## User Requirements (8-12 year olds)
- Fun, fast rounds with clear goals: collect cheese for points, avoid cats.
- Simple controls (WASD/arrow keys), readable UI, colorful visuals.
- Timed sessions; score measured by cheese collected before the clock ends.
- Lives that shrink on hazard collisions; game over when lives run out or time hits zero.
- Difficulty levels that change time, lives, and hazard pressure.
- Stable performance on modest school PCs; no external assets required.

## Concept and Core Loop
- Theme: A mouse sprints around a house grabbing cheese while dodging patrolling cats.
- Core loop: Move -> Collect cheese (+10 points) -> Dodge cats -> Repeat until timer ends or lives are gone.
- Feedback: Screen flash on hits, score pop via HUD, clear timer/lives display, restart prompt.

## Mechanics and Rules
- Movement: Arrow keys or WASD. Player speed is constant and clamped to the play area.
- Collectibles: Small cheese pieces scattered randomly. Clearing all cheese respawns a fresh batch to keep the run active.
- Hazards: Cats wander with bouncing movement. Contact costs one life and briefly grants invulnerability to avoid rapid life loss.
- Timer: Counts down per level; reaching zero triggers game over.
- Scoring: +10 per cheese. Future extensions: streak/bonus cheese spawn.
- Lives: Shown as icons; when lives reach zero the game ends.
- Difficulty levels:
  - Easy: 5 lives, 60s, 3 hazards, 8 cheese, slower cats.
  - Normal: 4 lives, 50s, 4 hazards, 10 cheese, mid-speed cats.
  - Hard: 3 lives, 40s, 6 hazards, 12 cheese, fastest cats.
- Win/lose: Run ends on timer out or lives out. Player can restart from game over.

## Visual and Audio Design
- Bright, high-contrast palette: teal background, yellow cheese, orange cats, white HUD.
- Shapes instead of external art to avoid asset management issues in schools.
- HUD: Timer, score, lives, and difficulty label at the top. Clear restart hint on game over.
- Motion: Hazards bounce off walls; small bob on cheese icons; flash on player hit for clarity.
- Accessibility: Large fonts, no rapid flicker, optional muted sound (sound not required to play).

## Controls
- Move: Arrow keys or WASD.
- Start/Restart: Enter or Space from menu; R from game over.
- Quit: Close window.

## Technical Design
- Tech: Python 3 with Pygame.
- Architecture:
  - `Player` class: position, speed, radius, hit-cooldown handling, drawing.
  - `Item` class: position and draw routine.
  - `Hazard` class: position, velocity, wall-bounce movement, draw routine.
  - `Game` class: state machine (menu, playing, game over), difficulty selection, spawning, collisions, HUD, and loop.
- Data: In-memory lists of items/hazards. No external files or assets.
- Performance: Fixed 60 FPS cap; lightweight math/drawing only.

## Test Plan (manual)
| ID | Area | Steps | Expected |
|----|------|-------|----------|
| T1 | Start/menu | Launch game, pick each difficulty | Game starts with correct lives/time/hazard counts per difficulty |
| T2 | Movement bounds | Hold movement into each wall | Player stays inside play area; no jitter |
| T3 | Collectibles | Collect one cheese; clear all cheese | Score +10 per cheese; new cheese batch spawns when empty |
| T4 | Hazard collision | Touch a cat repeatedly | Life -1 on first hit; brief invulnerability prevents instant double hits |
| T5 | Timer end | Let timer expire without losing all lives | Game over triggers; final score shown; restart works |
| T6 | Game over/restart | Lose all lives; press R | State resets to menu; choosing a level starts a fresh run |
| T7 | Performance | Play full Hard round | No frame drops or crash; hazards bounce correctly |
| T8 | Usability | New user plays 1 round | Understands controls from on-screen prompts |

## Design Review Feedback (two reviewers)
- Reviewer A (classmate): "Timer felt generous on Easy; add more cheese resets so rounds stay lively."  
  - Action: Added automatic cheese respawn when the board is cleared; kept Easy timer but ensured continuous play.
- Reviewer B (sibling, 11): "Got hit twice in a row by the same cat; frustrating."  
  - Action: Added short post-hit invulnerability and hazard shove-back to reduce stacked damage.

## Optimization Log
- Added invulnerability window (1.0s) after a hit to smooth difficulty spikes.
- Slightly reduced cat speed variance on Easy; increased on Hard for a sharper skill ceiling.
- Ensured new cheese batch spawns immediately after clearing the board to keep pacing.
- HUD spacing tightened and font size increased for readability on 720p screens.
- Visual polish pass: particle bursts and floating score text on cheese pickup, screen shake and burst on hits, mouse trail, hazard stripes, shiny cheese highlights, and tiled background pattern for depth.

## Justification of Key Decisions
- Pygame + shape art: Runs without asset downloads; good for school PCs and quick iteration.
- Difficulty scaling via time, lives, hazard speed/count: Simple to tune and clearly felt by players.
- Continuous cheese respawn: Keeps flow high during timed rounds; prevents downtime.
- Invulnerability cooldown: Fairness for younger players; still punishes mistakes without instant game overs.
- Colorful, non-violent theme: Suits 8-12 age group and keeps classroom-friendly tone.

## User Testing Summary
- Tester 1 (age 12): Understood controls immediately; requested clearer restart hint. Added "Press R to restart" on game over.
- Tester 2 (age 10): Preferred Easy; liked seeing score grow quickly. No action needed; confirmed readability of HUD.

## Evaluation vs Requirements
- Timed scoring with hazards and lives implemented; difficulty levels adjust time/lives/hazard pressure.
- Visual appeal through bright palette and motion; no external assets required.
- Usability: Simple controls, on-screen prompts, readable HUD; tested with target-age users.
- Stability/performance: Lightweight drawing and 60 FPS cap; no disk/network dependencies.
- Optimization and feedback integrated (cheese respawn, invulnerability, HUD tweaks), improving fairness and pacing.

## Evidence to Provide with Submission
- Code listing: `py.py`.
- Annotated screenshots: Take during gameplay (HUD, cheese collection, cat collision, game over).
- Test documentation: Use the table above; record pass/fail and notes.
- Feedback evidence: Reviewer notes (A/B) and tester quotes (age 12/10) with implemented actions.
- Self-management: Task list, time log, and tutor witness statement (template below).

## Self-Management (template)
- Tasks: design -> implement -> test -> optimize -> evaluate.
- Time log: record date/start/end/duration and work done.
- Risks: unclear controls (mitigated with on-screen help); difficulty spikes (mitigated with cooldown tuning).
- Tutor witness statement:  
  - "I observed [student name] planning, implementing, testing, and iterating the game between [dates]. They acted on peer feedback and maintained their own task list."

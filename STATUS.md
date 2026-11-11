# Hosted server concurrency & WebKit iPhone verification — 11 November 2026

- Hosted server keeps hands strictly private and rejects duplicate/simultaneous actions safely.
- Fixed WebKit launch in `tests/iphone.spec.ts` by explicitly providing `{ channel: undefined }` to prevent inheritance of the global `PW_CHANNEL=chrome` setting.
- Completed and passed the full Playwright suite (4 tests):
  - `iphone.spec.ts`: iPhone Safari layouts (4 viewports), draw arrow, 20s glow, and expiry popup (WebKit).
  - `multiplayer.spec.ts`: Full four-browser round with peek, elimination, and Chancellor choice (Chrome, ~3.1 min).
  - `multiplayer.spec.ts`: Mobile home and rules viewport check.
  - `multiplayer.spec.ts`: Four-seat mobile table with reduced motion and live card tracker.
- Verification: 68 unit/integration tests passed, 10,000 full games simulated (1,459,315 actions), typecheck passed, ESLint passed, and production builds succeeded.

---

# Four-player manual draw update — 11 November 2026

- Rooms now allow 2–4 players. Hosting shows four invitation seats; a fifth guest receives “Room full.” Removing a lobby guest reopens a seat.
- Every round shuffles 21 cards, sets exactly one aside face down, and deals one opening card to each player. No extra cards are removed for two-player games.
- Each turn draw, Prince replacement and individual Chancellor draw waits for the receiving player's deck click. Out-of-turn clicks, repeated draws and plays before drawing are rejected by the server. The optional clock does not draw automatically.
- Preserved face-down travel, landing and flip animations. The deck glows only when the local player can draw.
- Verified: 64 unit/integration tests, 10,000 full games across 2–4 players (1,459,315 actions), all 3 multiplayer/mobile browser checks, typecheck, lint and production builds. Desktop and mobile screenshots inspected. Local web and server health checks passed.

---

# Supplied card artwork update — 11 November 2026

- Integrated all ten supplied card faces and the supplied reference card, preserving the original image files. Display cropping hides the outer photographic background while retaining the gold card borders.
- Added an expandable side reference card, matching purple/gold backs, and staged face-down draw, arrival, reveal and table-play animations. Opponent draws remain concealed.
- Fixed King swap/draw identification and face-down reveals when a Chancellor-returned card is drawn again.
- Verification: 61 unit/integration tests, all 10,000 simulated games (660,081 actions), all 3 multiplayer/mobile browser checks, typecheck, lint and production builds passed. Desktop/mobile screenshots inspected.

---
# Latest UI verification — 11 November 2026

- Rebuilt the interface to match the supplied table reference and extended the burgundy/gold styling across the home, lobby, dialogs and cards.
- Added seat-to-seat and deck-to-hand card travel, 3D flips, selection glow/sheen, protection effects and victory sparks. Public last-play metadata and real round-score history drive the new panels.
- Fixed the opening-deal mount timing, text encoding and crowded six-player mobile layout.
- 60 unit/integration tests passed, including 6 animation/privacy cases.
- All 10,000 simulated games passed (660,081 actions).
- All 3 Playwright checks passed using Chrome: animated four-player round with Priest, Guard and Chancellor; mobile home/rules; six-player mobile and desktop layouts with reduced motion.
- Typecheck, lint and production builds passed. Screenshots inspected.
- Local game remains available at http://localhost:5173. Cloud deployment status is unchanged below.

---

# Delivery status — 10 November 2026

Implemented the requested M1–M8 scope locally. Public deployment remains outstanding.

| Milestone | Delivered |
| --- | --- |
| M1 | pnpm workspace, strict types, shared definitions, seeded setup, working instructions |
| M2 | All ten roles, legality, scoring, Spy bonus, shared wins, event stream, simulation |
| M3 | Validated rooms, safe codes, host controls and transfer, socket integration tests |
| M4 | Personalized snapshots, targeted private results, privacy tests, four-client full match |
| M5 | Responsive home/lobby/table, original SVG cards, selection/target/guess/order flows, results, rules, logs, optional sound and reduced-motion behavior |
| M6 | Secret-based recovery, disconnected state, optional timers, idle cleanup, limits and validation |
| M7 | Production builds, Dockerfile, Render/Fly configuration, environment settings, health check, deployment guide |
| M8 | Four-browser round covering Priest/Guard/Chancellor, mobile layout/rules test, GitHub Actions workflow |

## Verified

- 54 engine/server tests passed.
- 10,000 full games across 2–6 players passed, totaling 660,081 actions. Invariants verify conservation of all 21 card instances, legal hand sizes, progress, scores, and valid individual/shared winners.
- TypeScript typecheck and ESLint passed.
- Web and server production builds passed.
- Two Playwright tests passed using installed Chrome: four independent browser contexts complete a round with Priest peek, Guard elimination and Chancellor choice; mobile home has no horizontal overflow and rules dialog supports keyboard dismissal.
- Screenshots inspected; dialog centering and mobile decorative-card overflow corrected and browser tests rerun successfully.
- Local web responds HTTP 200; server `/health` responds `{"status":"ok"}`.

## Remaining external verification

- No public server or static-host deployment has been provisioned. Public WSS and four physical devices have not been tested. Supply hosting access and a server origin to finish that part of the definition of done.
- Docker is not installed in this environment; the Docker image has not been built here. Node/web build outputs were verified.
- GitHub Actions is configured but has not run on a remote repository.
- Playwright's bundled Chromium download timed out; local browser tests passed against installed Google Chrome. CI installs bundled Chromium.

## Operational decisions

`PLAN.md` documents the supplied discard-sum tie-break, shared-winner seating-order starter, configurable rotating starts, and match wins after Spy scoring. No other rules are intentionally deferred.

Rooms are memory-only and require one server instance. Private reveal notifications are ephemeral. With timers off, a disconnected seat pauses progress until it returns; the default deliberately remains off. README explains recovery, voluntary departures, restart behavior, rate-limit scope and deployment.


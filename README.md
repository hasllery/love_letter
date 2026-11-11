# Crimson Court

An original royal-court themed, server-authoritative multiplayer card game for 2–4 friends. No accounts; create a court, share the four-letter code, and play from separate browsers. The card faces and reference sheet use artwork supplied by the user; the matching card back is rendered in code.

## Run

Install Node 20.19+ and pnpm 10.28+.

```sh
pnpm install
# Copy .env.example to .env if you need different defaults.
pnpm dev
```

Open http://localhost:5173. The game server runs on port 3001. Open separate browser profiles or devices for separate seats; a saved seat in the same browser profile resumes automatically. The host starts with 2–4 connected guests.

For devices on your local network, open `http://YOUR_LAN_IP:5173`, configure `CORS_ORIGIN=http://YOUR_LAN_IP:5173,http://localhost:5173`, and restart. With no explicit `VITE_SERVER_URL`, the client uses the browser hostname on port 3001. Allow those ports in your firewall for private-network use.

## Checks

```sh
pnpm test            # Engine and actual socket-client integration tests
pnpm typecheck
pnpm lint
pnpm simulate        # 10,000 seeded full games across 2–4 players
pnpm build
pnpm exec playwright install chromium
pnpm e2e             # Four independent browser contexts; mobile layout check
```

Browser tests use separate ports 3002 and 5174 so the normal preview can stay open. They start a deterministic test server, search for a seed that exercises Priest, Guard and Chancellor in one round, and interact with real UI controls. Production never uses this test harness or a client-supplied seed. CI runs the checks and uploads browser traces/screenshots.

## Project map

- `packages/shared`: original card descriptions, title, constants, socket contracts, Zod schemas.
- `packages/engine`: pure seeded setup, immutable move resolution, legality, scoring and personalized views.
- `apps/server`: Express health endpoint and Socket.IO room lifecycle, validation, secret seat recovery, timers and limits.
- `apps/web`: responsive React interface, Zustand connection state, supplied-image cards, Framer Motion transitions, optional synthesized sound.
- `PLAN.md`: rules, decisions, milestone scope and event contracts.

Change `CONFIG.title` in `packages/shared/src/index.ts` to rename the game. The reference table theme, layout, and animation styling live in `apps/web/src/court.css`; base page styles are in `apps/web/src/style.css`. Card abilities, values, counts and accents live in the shared card definition. Supplied artwork is in `apps/web/public/cards`; the rank mapping is in `cardAssets.ts`, and display-only background clipping is in `artwork.css`.

## Environment

| Variable          | Purpose                                                | Default                 |
| ----------------- | ------------------------------------------------------ | ----------------------- |
| `PORT`            | Server listen port                                     | `3001`                  |
| `HOST`            | Server bind address                                    | `0.0.0.0`               |
| `CORS_ORIGIN`     | Comma-separated allowed web origins; no trailing slash | `http://localhost:5173` |
| `VITE_SERVER_URL` | Public server origin, baked into web build             | browser host, port 3001 |
| `VITE_BASE_PATH`  | Static site's URL base path, with trailing slash       | `/`                     |

`pnpm dev` loads the root `.env` for the server. Vite also loads the root `.env` (see `envDir`). Production server variables are runtime settings; `VITE_*` variables must be present when building. Secrets must never use the `VITE_` prefix.

## Deploy the server

The server requires a persistent Node process and WebSocket support. Use a single instance. Build the root Dockerfile with the entire repository as context:

```sh
docker build -t crimson-court .
docker run --rm -p 3001:3001 -e CORS_ORIGIN=https://your-web.example crimson-court
```

- **Render:** connect this repository and use `render.yaml`, or create a Docker web service. Set `CORS_ORIGIN` to your static site's exact HTTPS origin. Health path: `/health`. Keep one instance running.
- **Railway:** connect the repository, select the root Dockerfile, generate a public domain, set `CORS_ORIGIN`, and configure `/health` as the health check. Expose the runtime `PORT`.
- **Fly.io:** change the app name in `fly.toml`, create that app in your account, set `CORS_ORIGIN` with `fly secrets set`, and run `fly deploy`. Keep one machine; do not scale out without shared room state and a socket adapter.

Use the host's HTTPS endpoint. Socket.IO upgrades to WSS automatically for an HTTPS server URL. The host's reverse proxy must pass WebSocket upgrade requests to `/socket.io/` and keep long-lived connections open.

## Deploy the web app

Set `VITE_SERVER_URL=https://your-server.example` and optionally `VITE_BASE_PATH=/court/`, then run:

```sh
pnpm --filter @court/web build
```

Upload `apps/web/dist` to your static host. For an existing site at `/court/`, copy the directory contents to that subdirectory. Room invitations use a query parameter, so no router rewrite is required. The web site and server must both use HTTPS in production. Set server CORS to the web **origin** without the sub-path.

No cloud account, public server URL, or hosting credentials were supplied with this project. Deployment files are included; a public multi-device deployment still needs to be provisioned and checked on real devices.

## Rules and operations

The implementation follows the supplied 21-card rules and discard-total tie-break. A shared round's first winner in seating order opens next; hosts can instead choose rotating starts before creating a room. Spy awards happen before testing match victory, and all players reaching the target share the match win.

Each play has a fixed 20-second timer that starts after drawing. Expiration resolves the first legal play or Chancellor choice. Drawing always requires the receiving player to click, so a disconnected player pauses at their next draw until they return. A voluntary mid-game leave invalidates recovery for that seat; the UI warns before leaving. The existing seat participates in later rounds until the match ends. Start a fresh court if a player permanently leaves an untimed match.

Resume credentials are cryptographically random, stored only in that player's browser, and never broadcast. A room code alone cannot reclaim a seat. Disconnecting transfers hosting to a connected player. Private card reveals are ephemeral and delivered only to eligible recipients; after reconnect the player's hand and pending choices are restored, but past reveal popups are not replayed. Public logs never contain private reveals.

Rooms are held in memory and expire after 30 minutes without room activity. Restarts and deployments clear rooms. This release has no persistent database, spectators, account system or multi-server state replication. IP rate limiting is process-local; behind a shared proxy, configure an edge limiter for per-client limits if needed. Names are validated and rendered as plain text. All gameplay mutations validate authority, payload schema, revision, and engine legality.


## Reference table and card motion

The UI follows the supplied Game table reference: burgundy radial background, gold-edged cards, clockwise opponent seats, discard trays, a public card tracker, and round score history. The Crimson Court title is preserved, with the four-player and manual-draw rules described below.

Card animations include opening deals to all seats, draw-to-hand travel, plays to the center, revealed discards, face-down King exchanges, Chancellor draws/returns, 3D hand/reveal flips, selection sheen and glow, protection effects, and victory sparks. Animation positions are measured from the current responsive layout. Reduced-motion preferences disable travel and decorative motion. Unknown cards have no face information in the animation plan.

The animation planner is in `apps/web/src/motionPlan.ts`, the flight renderer in `TableMotion.tsx`, and the table in `Table.tsx`. Seven privacy/motion tests supplement the rules and socket tests. Browser tests verify actual deal/play/draw/return flight elements, complete a round, and check the four-seat mobile layout with reduced motion.


## Supplied cards and reference sheet

All ten provided faces are used directly, including their frame, illustration and text. `public/cards` holds unchanged copies of the supplied originals. A rounded CSS crop excludes the outer dark tabletop in the game; the original source files are not modified. The player reference image is pinned beside the table and opens at full size (a compact side tab on phones).

Drawing now has explicit stages: a face-down card travels from the deck, lands in its reserved hand slot, briefly shows its back, then flips to the actual artwork. Played cards travel to the central table before the static card appears. Returned Chancellor cards are concealed again if drawn later. Opponents' hidden cards never contain face images. Reduced-motion mode presents the state immediately.

### Four seats and manual draws
Host a room and share its code or invite link to add up to three friends before starting. A fifth guest sees “Room full.” Each round uses all 21 cards, with exactly one hidden reserve removed and one opening card dealt per player. Click the glowing deck for each turn draw, Prince replacement, and each Chancellor draw. Other players cannot draw for you; playing is disabled until your draw is complete. The 20-second clock applies to play/choice actions only.

## Online edition
The hosted edition builds with `node scripts/build-hosted.mjs`. It uses a same-origin Worker API and D1 (`apps/server/src/hosted.ts`), with server-owned rooms, secret seat credentials, personalized views, and version-checked updates. Active browsers poll every 800ms; expired play deadlines are resolved once on the next request. A disconnected player still must return to click for their next draw. Room data expires after 24 hours of inactivity. Local `pnpm dev` retains Socket.IO.
End-of-round results reveal every remaining hand and show card totals separately from gold-coin scores. Winner + lone-surviving-Spy bonus = two coins.

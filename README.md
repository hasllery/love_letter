# Crimson Court

An original royal-court themed, server-authoritative multiplayer card game for 2–4 players. No accounts required: create a court, share the four-letter invite code or direct link, and play instantly across desktop or mobile browsers. Features authentic court artwork, rich flight animations, synthesized audio, dual real-time transports (WebSocket & HTTP Serverless), and comprehensive round leaderboards.

---

## Table of Contents

- [Game Rules & Scoring](#game-rules--scoring)
  - [The 21-Card Royal Deck](#the-21-card-royal-deck)
  - [Turn Mechanics](#turn-mechanics)
  - [Round Conclusion & Winner Determination](#round-conclusion--winner-determination)
  - [Post-Round Leaderboard](#post-round-leaderboard)
- [Key Features & UI Enhancements](#key-features--ui-enhancements)
  - [Mobile Responsive Layout](#mobile-responsive-layout)
  - [Top-Center Court Controls](#top-center-court-controls)
  - [Card Animations & Visual Effects](#card-animations--visual-effects)
  - [Sound & Atmosphere](#sound--atmosphere)
- [Hosting & Deployment Guide](#hosting--deployment-guide)
  - [Option 1: Instant Free Tunnel (Cloudflare Quick Tunnel)](#option-1-instant-free-tunnel-cloudflare-quick-tunnel)
  - [Option 2: 24/7 Permanent Serverless Hosting (Vercel)](#option-2-247-permanent-serverless-hosting-vercel)
  - [Option 3: Cloudflare Pages & Workers (Edge + D1)](#option-3-cloudflare-pages--workers-edge--d1)
  - [Option 4: Dedicated Node / Docker Server (Render, Railway, Fly.io)](#option-4-dedicated-node--docker-server-render-railway-flyio)
- [Local Development](#local-development)
- [Verification & Quality Suite](#verification--quality-suite)
- [Architecture & Project Map](#architecture--project-map)
- [Changelog & Evolution](#changelog--evolution)

---

## Game Rules & Scoring

Crimson Court is played in rounds until a player accumulates enough tokens of affection to win the court.

### The 21-Card Royal Deck

| Rank | Card | Count | Value | Effect Summary |
|:---:|:---|:---:|:---:|:---|
| **0** | **Spy** | 2 | 0 | If you played or discarded a Spy and survived the round, gain a bonus token (unless another survivor also played a Spy). |
| **1** | **Guard** | 6 | 1 | Guess an opponent's hand (ranks 0 or 2–9). If correct, that player is eliminated. |
| **2** | **Priest** | 2 | 2 | Privately look at another player's hand. |
| **3** | **Baron** | 2 | 3 | Privately compare hands with another player; the player with the lower card rank is eliminated. |
| **4** | **Handmaid** | 2 | 4 | Gain immunity from all card effects until your next turn. |
| **5** | **Prince** | 2 | 5 | Choose any player (including yourself) to discard their hand and draw a new card from the deck. |
| **6** | **Chancellor** | 2 | 6 | Draw 2 cards from the deck, examine all 3 in hand, keep 1, and return the other 2 to the bottom in any order. |
| **7** | **King** | 1 | 7 | Trade hands with another player. |
| **8** | **Countess** | 1 | 8 | Must be played if your other card is a Prince (5) or King (7). |
| **9** | **Princess** | 1 | 9 | If you play or discard the Princess for any reason, you are immediately eliminated. |

### Turn Mechanics

1. Exactly one card is set aside face-down at the start of each round as the secret reserve.
2. Each player is dealt 1 card.
3. On your turn, you draw 1 card from the deck (giving you 2 cards in hand).
4. Choose and play 1 card into your discard tray, resolving its ability.
5. Turns proceed clockwise until a round conclusion condition is met.

### Round Conclusion & Winner Determination

The game features dual victory paths:

1. **Last Man Standing**: If all other players are eliminated through deductions, duels, or penalties (`alive.length <= 1`), the surviving player wins the round immediately and earns a royal token.
2. **Placed Deck Score (Deck Depleted)**: When the draw deck is exhausted (`deck.length === 0`), the round ends immediately. The winner is determined by the **sum of card values in their placed discard tray** (`Σ discard values`).
   - If two or more surviving players tie on placed deck score, the higher rank of their held hand card breaks the tie.
   - If both placed deck score and held card rank are tied, the tied survivors share the victory.
   - Surviving players who uniquely played a Spy also claim their bonus token.

### Post-Round Leaderboard

At the end of each round, an immersive **Leaderboard Modal** breaks down the results:
- **Placement Ranks**: 🥇 1st, 🥈 2nd, 🥉 3rd, and 4th place.
- **Player Status**: Visual tags showing *Winner*, *Eliminated*, or *Survivor*.
- **Placed Deck Score**: Prominently displays the total points scored from cards placed during the round (`Σ <score> pts`).
- **Placed Card Tray Preview**: Mini visual chips displaying every card played into the player's discard tray.
- **Held Hand Card**: Revealed hand card with its rank and name.
- **Total Card Score**: Combined score of placed cards plus held hand card.
- **Royal Tokens**: Cumulative win tokens tracked toward match victory.

---

## Key Features & UI Enhancements

### Mobile Responsive Layout
- **Side-by-Side Placed Deck**: In mobile portrait and landscape viewports (`@media (max-width: 760px)`), each player's placed cards are positioned neatly on the side of their player plate rather than hidden, providing full visibility into opponents' discards.
- **Real-Time Placed Score Badge**: Discard trays feature a live score badge (`Σ <score>`) showing the current placed card sum in real time.
- **Touch-Friendly Controls**: Large tap targets for drawing, card selection, and targeting prompts.

### Top-Center Court Controls
A persistent utility cluster is pinned at the top-center of the table:
- **`↪ Exit Court`**: Leave the room gracefully with confirmation dialog.
- **`☷ Activity`**: Slide-out activity drawer with timestamped game logs and private reveal history.
- **`↗ Invite`**: One-click invite link copy or QR display.

### Card Animations & Visual Effects
- **Physics-Based Flight**: Smooth Framer Motion transitions for dealing, drawing, playing to table center, and discarding.
- **3D Card Flips**: Realistic card reveal animations when drawing or inspecting opponent hands.
- **Immunity Shimmer**: Golden protective barrier visual for players sheltered by the Handmaid.
- **Reduced Motion Support**: Full `prefers-reduced-motion` accessibility support instantly disables travel animations while preserving state integrity.

### Sound & Atmosphere
- Synthesized Web Audio API sound effects for card deals, flips, button taps, and victory fanfares (toggleable via the audio icon).
- Original royal court dark-burgundy visual theme with antique gold borders.

---

## Hosting & Deployment Guide

Crimson Court supports multiple deployment patterns depending on your needs.

### Option 1: Instant Free Tunnel (Cloudflare Quick Tunnel)
The fastest way to play with friends over the internet without setting up domain names, DNS, or VPS accounts:

1. Start your local dev server:
   ```sh
   pnpm dev
   ```
2. In a separate terminal, launch a free Cloudflare tunnel:
   ```sh
   npx cloudflared tunnel --url http://localhost:5173
   ```
3. Cloudflare will output a public HTTPS URL (e.g., `https://random-name.trycloudflare.com`). Share this link with your friends to play immediately. Both WebSocket and HTTP polling work out of the box with zero firewall configuration.

### Option 2: 24/7 Permanent Serverless Hosting (Vercel)
Deploy as a 100% free, permanent, serverless web app on Vercel:

1. **Architecture**: Uses Vercel Edge / Serverless Functions (`api/court.ts`, `api/oracle.ts`, `api/health.ts`) with client HTTP polling (`HostedTransport`).
2. **Build Settings in Vercel**:
   - **Framework Preset**: Other / Vite
   - **Root Directory**: `./`
   - **Build Command**: `pnpm --filter @court/web build`
   - **Output Directory**: `apps/web/dist`
   - **Install Command**: `pnpm install`
3. **SPA Routing**: The repository includes `vercel.json` configured with negative-lookahead rewrites (`/((?!api/|health).*) -> /index.html`) ensuring API endpoints are never hijacked by the single-page application fallback.

### Option 3: Cloudflare Pages & Workers (Edge + D1)
For edge-native global low latency:
```sh
node scripts/build-hosted.mjs
```
Uses Cloudflare Workers with D1 database storage (`apps/server/src/hosted.ts`) for stateless room persistence and 800ms client polling.

### Option 4: Dedicated Node / Docker Server (Render, Railway, Fly.io)
For traditional stateful WebSocket deployments:

```sh
docker build -t crimson-court .
docker run --rm -p 3001:3001 -e CORS_ORIGIN=https://your-domain.com crimson-court
```

| Platform | Configuration |
|:---|:---|
| **Render** | Connect repository, use `render.yaml` Docker web service, set `CORS_ORIGIN`, health check `/health`. |
| **Railway** | Connect repo, select Dockerfile, generate public domain, expose `PORT=3001`. |
| **Fly.io** | Use root `fly.toml`, set `CORS_ORIGIN` via `fly secrets set`, deploy with `fly deploy`. |

---

## Local Development

### Prerequisites
- Node.js 20.19+
- pnpm 10.28+

### Setup
```sh
# Clone repository
git clone https://github.com/hasllery/love_letter.git
cd love_letter

# Install dependencies
pnpm install

# Start web client and socket server
pnpm dev
```

- Web UI: [http://localhost:5173](http://localhost:5173)
- Game Server: [http://localhost:3001](http://localhost:3001)

To test multiplayer locally, open multiple browser profiles or incognito windows.

### Environment Variables

| Variable | Description | Default |
|:---|:---|:---|
| `PORT` | Game server port | `3001` |
| `HOST` | Server bind host | `0.0.0.0` |
| `CORS_ORIGIN` | Allowed CORS origins (comma-separated) | `http://localhost:5173` |
| `VITE_SERVER_URL` | Public backend origin (baked into client build) | Browser hostname on port `3001` |
| `VITE_BASE_PATH` | Static subpath prefix | `/` |

---

## Verification & Quality Suite

The codebase enforces strict invariants, pure state transitions, and comprehensive test coverage:

```sh
# Run unit and integration tests (engine, server, hosted transport)
pnpm test

# Run 10,000-game seeded simulation verifying game-engine invariants
pnpm simulate

# Strict TypeScript typechecking across all packages
pnpm typecheck

# Code quality and style linting
pnpm lint

# Production build test
pnpm build

# End-to-end multi-seat browser tests with Playwright
pnpm e2e
```

---

## Architecture & Project Map

```
love_letter/
├── api/                     # Vercel Serverless Edge endpoints
│   ├── court.ts             # Serverless room management & action polling
│   ├── oracle.ts            # AI court advisor / hints
│   └── health.ts            # Uptime & health check
├── apps/
│   ├── server/              # Node.js + Express + Socket.IO server
│   │   ├── src/server.ts    # Socket room lifecycle, rate limiting, and HTTP fallback
│   │   └── src/hosted.ts    # Stateless hosted worker implementation
│   └── web/                 # React 19 + Vite frontend
│       ├── src/Table.tsx    # Interactive game table, player seats, leaderboard
│       ├── src/motionPlan.ts# Animation planning engine
│       ├── src/court.css    # Royal theme layout & animations
│       └── public/cards/    # Supplied card face artwork
├── packages/
│   ├── engine/              # Pure game engine (deterministic, zero side-effects)
│   │   └── src/index.ts     # Card legality, state transitions, win checks
│   └── shared/              # Shared types, Zod schemas, constants, deck definitions
│       └── src/index.ts     # Protocol contracts, card metadata
├── vercel.json              # Vercel deployment routing & output configuration
└── Dockerfile               # Production container definition
```

---

## Changelog & Evolution

Summary of major architectural improvements and feature additions since the initial version:

1. **Vercel Serverless & Edge API Integration**:
   - Added serverless endpoints (`api/court.ts`, `api/oracle.ts`, `api/health.ts`) allowing 24/7 permanent free hosting on Vercel without requiring a dedicated server.
   - Fixed Vercel SPA routing conflicts by introducing negative-lookahead rewrites (`/((?!api/|health).*) -> /index.html`) so API routes return proper JSON instead of HTML fallbacks.
   - Fixed output directory configuration (`apps/web/dist`) across monorepo build scripts.

2. **Dual-Transport Architecture & Tunnel Support**:
   - Mounted `/api/court` directly onto the local Express server, enabling automatic fallback between WebSockets and HTTP long-polling across Cloudflare tunnels, ngrok, local LAN, and serverless environments.
   - Configured `allowedHosts: true` in Vite 6 to support Cloudflare tunnel URLs (`*.trycloudflare.com`) without host-header blocks.
   - Broadened CORS and Origin verification for LAN IPs and tunnel subdomains.

3. **Mobile Layout & Discard Visibility**:
   - Fixed hidden discard trays on mobile screens (`display: none` replaced with responsive row layout).
   - Placed card decks are now visible on the side of both the active player and opponents.
   - Added real-time placed deck score badges (`Σ <score> pts`) directly above each player's tray.

4. **Navigation & Court Management**:
   - Pinned top-center controls (`↪ Exit Court`, `☷ Activity`, `↗ Invite`) for fast access to court departure, action logs, and room sharing across all screen sizes.

5. **Round Scoring & Victory Rules Revamp**:
   - **Deck Depletion Rule**: When the draw deck runs out, the round winner is determined by the **sum of card values in their placed discard tray** (`Σ discard values`). Hand card rank serves as tiebreaker.
   - **Last Man Standing**: Surviving player automatically wins when all opponents are eliminated.
   - **Leaderboard Redesign**: Built a complete post-round leaderboard showcasing rank placements, player badges, placed deck point totals, mini card chips, held hand cards, total scores, and royal token tallies.

6. **Stability & Invariant Verification**:
   - Synchronized engine transition rules (`finishTurn`) with strict simulation invariant checks (`assertInvariants`).
   - Verified across 10,000 automated simulated games (over 1.45M gameplay actions) with 100% invariant passes.

# Crimson Court implementation plan

Source: user's master prompt; PLAN.md was absent. User subsequently authorized building through the final milestone.

## 1. Rules

21 cards: 0x2, 1x6, 2x2, 3x2, 4x2, 5x2, 6x2, 7x1, 8x1, 9x1.
2–6 players. Targets: 6/5/4/3/3 tokens. Burn one hidden card; also expose three set-asides for two players. Deal one per player, draw for the starter.
Spy bonus counts non-eliminated players who discarded/played Spy. Guard cannot guess Guard. Priest reveals only to actor. Baron compares surviving hands privately. Handmaid protection expires at start of owner's next turn. Prince can self-target, discards without effect except Princess, draws from burn when deck empty. Chancellor draws up to two, then returns unkept cards to bottom in chosen order. King swaps. Countess compulsory alongside Prince/King. Princess discarding eliminates.
Resolve entire turn, including Chancellor choice, before empty-deck round end. Highest hand, then discard sum, then shared win. Award independent Spy token before match target check. All players at target share match win.
Interpretations: starter for shared round wins is first winner in seating order (configurable to rotating instead); initial starter seat zero. Previous-winner starting is configurable. Chancellor choice identifies card instances to handle duplicates. Returned order is next-drawn-first. Eliminated hands enter discard pile. A disconnected turn timer chooses a legal action, never requests private choices from other clients. Host can advance a finished round.

## 2. Architecture

pnpm monorepo, strict TypeScript. Pure immutable engine with injected RNG; shared public contracts and card definitions. Express/Socket.IO authority with Zod inputs. React/Vite/Zustand/Tailwind/Framer Motion client. No accounts; crypto-generated secret resume credentials separate from public player IDs. Rooms are memory-only, single server instance.

## 3. Milestones / task lists

- M1: workspace, shared contracts, seeded shuffle, round setup, verification.
- M2: legal moves and immutable resolution, card effects, private/public events, scoring, exhaustive cases and 10,000 simulations.
- M3: validated room lifecycle, safe codes, host transfer, socket tests.
- M4: personalized snapshots, targeted reveals, full headless match and privacy tests.
- M5: responsive home/lobby/table, SVG card system, interaction flows, rules, score, animation and optional sound.
- M6: resume secrets, disconnection, optional timers, cleanup, limits, errors.
- M7: production build, Docker, environment/CORS/health, deployment documentation.
- M8: multi-context browser coverage and CI.

## 4. State and views

Engine state includes deck/burn/public set-asides, seats, hands, discards, protection, score, pending Chancellor, round/match results and event stream. Public views expose only the requesting seat's hand, legal intents, own Chancellor cards, public seats/discards, deck count and public events. Private results delivered only to participant recipients and not put into room broadcasts.

## 5. Socket contracts

Client events (ack returns `{ok:true,...}` or `{ok:false,error}`): `room:create` {name,turnSeconds,previousWinnerStarts}; `room:join` {name,code}; `room:resume` {code,playerId,secret}; `room:leave` {}; `room:kick` {playerId}; `game:start` {}; `game:move` {move}; `game:next` {}.
Server events: `room:view` personalized RoomView; `game:private` {message}; `room:removed` {message}. No full engine state in socket payloads. Use revision in move intents to reject stale/replayed actions.

## 6. Screens and visual system

Warm parchment, burgundy and muted gold. Original flat SVG symbols for each court role. One reusable Card. Home hosts/joins; lobby shares code and settings; table shows opponents, personal hand, deck, public set-asides, activity, score, rules and private modal. Keyboard controls, reduced motion, touch sizing, live announcements and mute control.

## 7. Verification and deployment

Unit/integration tests, strict typecheck/lint, simulation, production build, Playwright multi-client scenarios. Node server deployed separately from static web; WSS behind hosting proxy. Room state is not persisted across server restarts; sticky single instance required. Public deployment needs a provisioned server URL and hosting access.

## Four-player manual draw update
User request supersedes original 2–6-player rules: rooms support 2–4 humans, invited before start. Full rooms reject a fifth guest with “Room full.” Every round shuffles all 21 cards, removes exactly one hidden reserve (no additional two-player set-aside), and deals one opening card each. Turn draws, Prince replacements, and each Chancellor draw require an explicit deck click by the receiving player. Initial setup remains a deal animation. The optional turn clock only auto-resolves play/choice actions; drawing always waits for a click.

## 20-second clock, result reveal and online hosting
The play/choice clock is now fixed at 20 seconds and starts only after required draws are complete. Expiry executes one legal move and stores a timeout notice for that player. Setup/draw phases have no deadline. End-of-round views reveal final hands and list hand value, discard total, combined total (informational), winner coin, Spy coin and cumulative coins. Scoring remains highest surviving hand, discard-sum tie-break; a winning sole surviving Spy user earns two coins total.
The online edition uses a Cloudflare Worker and D1 rooms with optimistic concurrency control. Browsers poll their personalized view; authenticated commands share the same schemas and pure engine as the local Socket.IO edition. Public access is requested for friends to test.

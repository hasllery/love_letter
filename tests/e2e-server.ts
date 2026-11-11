import { createCourtServer } from '../apps/server/src/server';
import {
  activePlayerId,
  applyMove,
  legalMoves,
  seededRng,
  setupRound,
  toPlayerView,
} from '../packages/engine/src/index';
import { chooseMove } from './game-policy';
const seats = Array.from({ length: 4 }, (_, i) => ({
  id: `p${i}`,
  name: `Player ${i}`,
}));
let selected = 1;
for (let seed = 1; seed < 10000; seed++) {
  let state = setupRound(seats, seededRng(seed));
  const seen = new Set<string>();
  let turns = 0;
  while (['draw', 'turn', 'chancellor'].includes(state.phase)) {
    if (++turns > 100) break;
    const actor = state.players.find((p) => p.id === activePlayerId(state))!;
    let move = chooseMove(
      seats.map((p) => toPlayerView(state, p.id)),
      seen,
    );
    if (move.kind === 'play') {
      const cardId = move.cardId;
      const rank = actor.hand.find((c) => c.id === cardId)!.rank;
      if (rank === 1 && seen.has('priest') && seen.has('chancellor')) {
        move =
          legalMoves(state, actor.id).find(
            (m) =>
              m.kind === 'play' &&
              m.cardId === cardId &&
              state.players.find((p) => p.id === m.targetId)?.hand[0]?.rank ===
                m.guess,
          ) ?? move;
      }
      if (rank === 2 && move.kind === 'play' && move.targetId)
        seen.add('priest');
      if (rank === 6) seen.add('chancellor');
      if (rank === 1 && move.kind === 'play') {
        const targetId = move.targetId;
        if (
          state.players.find((p) => p.id === targetId)?.hand[0]?.rank ===
          move.guess
        )
          seen.add('guard');
      }
    }
    state = applyMove(state, actor.id, move);
  }
  if (seen.size === 3) {
    selected = seed;
    break;
  }
}
const server = createCourtServer({
  seed: () => selected,
  origins: ['http://127.0.0.1:5174', 'http://localhost:5174'],
});
await server.listen(3002);
console.log(`E2E server ready; deterministic seed ${selected}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });

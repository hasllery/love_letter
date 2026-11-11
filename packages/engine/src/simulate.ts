import {
  activePlayerId,
  applyMove,
  assertInvariants,
  legalMoves,
  nextRound,
  seededRng,
  setupRound,
} from './index';
const total = Number(process.argv[2] ?? 10000);
let turns = 0;
for (let seed = 1; seed <= total; seed++) {
  const rng = seededRng(seed);
  const count = 2 + ((seed - 1) % 3);
  let s = setupRound(
    Array.from({ length: count }, (_, i) => ({
      id: `p${i}`,
      name: `Player ${i}`,
    })),
    rng,
  );
  let steps = 0;
  while (s.phase !== 'gameOver') {
    assertInvariants(s);
    if (++steps > 10000) throw new Error(`Nonterminating game ${seed}`);
    if (s.phase === 'roundEnd') s = nextRound(s, rng);
    else {
      const id = activePlayerId(s);
      const moves = legalMoves(s, id);
      s = applyMove(s, id, moves[Math.floor(rng() * moves.length)]!);
      turns++;
    }
  }
  assertInvariants(s);
}
console.log(
  `${total.toLocaleString()} full games passed across 2–4 players; ${turns.toLocaleString()} actions; all invariants held.`,
);

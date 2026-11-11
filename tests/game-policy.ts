import type { GameView, Move } from '../packages/shared/src/index';
export function chooseMove(views: GameView[], seen: Set<string>): Move {
  const view = views.find((v) => v.legalMoves.length)!;
  const cards = new Map(
    views.flatMap((v) => v.hand.map((c) => [c.id, c.rank] as const)),
  );
  function score(m: Move) {
    if (m.kind === 'draw') return 1000;
    if (m.kind === 'choose') return (cards.get(m.keepId) ?? 0) * 5;
    const rank = cards.get(m.cardId)!;
    if (rank === 2 && !seen.has('priest')) return 100;
    if (rank === 6 && !seen.has('chancellor')) return 100;
    if (rank === 9) return -100;
    if (rank === 3 || rank === 5) return -20;
    if (rank === 1) {
      return seen.has('priest') && seen.has('chancellor') ? 10 : 2;
    }
    return rank === 4
      ? 8
      : rank === 0
        ? 7
        : rank === 8
          ? 6
          : rank === 2
            ? 5
            : rank === 6
              ? 4
              : 1;
  }
  return [...view.legalMoves].sort((a, b) => score(b) - score(a))[0]!;
}

import { describe, expect, it } from 'vitest';
import {
  applyMove,
  createDeck,
  setupRound,
  seededRng,
  toPlayerView,
  type State,
} from '../../../packages/engine/src/index';
import type { Rank } from '@court/shared';
import { planFlights } from './motionPlan';
function state(hands: Rank[][]): State {
  const s = setupRound(
    hands.map((_, i) => ({ id: `p${i}`, name: `Player ${i}` })),
    seededRng(42),
  );
  const deck = createDeck();
  s.players.forEach((p, i) => {
    p.hand = hands[i]!.map(
      (rank) =>
        deck.splice(
          deck.findIndex((c) => c.rank === rank),
          1,
        )[0]!,
    );
    p.discards = [];
  });
  s.burn = deck.pop()!;
  s.deck = deck;
  s.setAside = [];
  s.phase = 'turn';
  s.pendingDraw = null;
  return s;
}
describe('privacy-safe table animation planning', () => {
  it('deals to every seat but only contains the viewer’s own card faces', () => {
    const s = state([[2, 4], [9], [1]]);
    const v = toPlayerView(s, 'p0');
    const flights = planFlights(null, v, 'p0');
    expect(flights).toHaveLength(4);
    expect(new Set(flights.map((f) => f.to))).toEqual(
      new Set(['hand:p0', 'hand:p1', 'hand:p2']),
    );
    expect(flights.filter((f) => f.card).map((f) => f.card)).toEqual(v.hand);
    expect(
      flights
        .filter((f) => f.to !== 'hand:p0')
        .every((f) => !f.card && !f.flip),
    ).toBe(true);
  });
  it('flies a public play to the center and the next draw face down to its seat', () => {
    const s = state([[2, 4], [9], [1]]);
    const next = applyMove(s, 'p0', {
      kind: 'play',
      cardId: s.players[0]!.hand[0]!.id,
      targetId: 'p1',
    });
    const flights = planFlights(
      toPlayerView(s, 'p2'),
      toPlayerView(next, 'p2'),
      'p2',
    );
    expect(flights.find((f) => f.kind === 'play')).toMatchObject({
      from: 'hand:p0',
      to: 'center',
      card: { rank: 2 },
      flip: true,
    });
    expect(flights.some((f) => f.kind === 'draw')).toBe(false);
    const drawn = applyMove(next, 'p1', { kind: 'draw' });
    const drawFlights = planFlights(
      toPlayerView(next, 'p2'),
      toPlayerView(drawn, 'p2'),
      'p2',
    );
    expect(drawFlights.find((f) => f.kind === 'draw')).toMatchObject({
      from: 'deck',
      to: 'hand:p1',
      card: undefined,
      flip: false,
    });
    expect(flights.some((f) => f.card?.rank === 9)).toBe(false);
  });
  it('sends both King exchange cards face down, even to an involved player', () => {
    const s = state([[7, 4], [9], [1]]);
    const next = applyMove(s, 'p0', {
      kind: 'play',
      cardId: s.players[0]!.hand[0]!.id,
      targetId: 'p1',
    });
    const swaps = planFlights(
      toPlayerView(s, 'p0'),
      toPlayerView(next, 'p0'),
      'p0',
    ).filter((f) => f.kind === 'swap');
    expect(swaps).toHaveLength(2);
    expect(swaps.every((f) => !f.card)).toBe(true);
    expect(swaps.map((f) => [f.from, f.to])).toEqual([
      ['hand:p0', 'hand:p1'],
      ['hand:p1', 'hand:p0'],
    ]);
  });
  it('animates Chancellor draws and face-down ordered returns without exposing them', () => {
    const s = state([[6, 4], [9], [1]]);
    const pending = applyMove(s, 'p0', {
      kind: 'play',
      cardId: s.players[0]!.hand[0]!.id,
    });
    const first = applyMove(pending, 'p0', { kind: 'draw' });
    const next = applyMove(first, 'p0', { kind: 'draw' });
    const draws = [
      ...planFlights(
        toPlayerView(pending, 'p1'),
        toPlayerView(first, 'p1'),
        'p1',
      ),
      ...planFlights(toPlayerView(first, 'p1'), toPlayerView(next, 'p1'), 'p1'),
    ].filter((f) => f.kind === 'draw');
    expect(draws).toHaveLength(2);
    expect(draws.every((f) => !f.card)).toBe(true);
    const hand = next.players[0]!.hand;
    const done = applyMove(next, 'p0', {
      kind: 'choose',
      keepId: hand[0]!.id,
      bottomIds: hand.slice(1).map((c) => c.id),
    });
    const returns = planFlights(
      toPlayerView(next, 'p1'),
      toPlayerView(done, 'p1'),
      'p1',
    ).filter((f) => f.kind === 'return');
    expect(returns).toHaveLength(2);
    expect(returns.every((f) => !f.card && f.to === 'deck')).toBe(true);
  });
  it('does not replay same-revision snapshots or mid-round reconnects', () => {
    const s = state([[2, 4], [9], [1]]);
    const next = applyMove(s, 'p0', {
      kind: 'play',
      cardId: s.players[0]!.hand[0]!.id,
      targetId: 'p1',
    });
    const v = toPlayerView(next, 'p0');
    expect(planFlights(v, v, 'p0')).toEqual([]);
    expect(planFlights(null, v, 'p0')).toEqual([]);
  });
  it('uses the drawn card rather than the swapped card when King target draws next', () => {
    const s = state([[7, 4], [9], [1]]);
    const next = applyMove(s, 'p0', {
      kind: 'play',
      cardId: s.players[0]!.hand[0]!.id,
      targetId: 'p1',
    });
    const drawn = applyMove(next, 'p1', { kind: 'draw' });
    const flights = planFlights(
      toPlayerView(next, 'p1'),
      toPlayerView(drawn, 'p1'),
      'p1',
    );
    expect(flights.find((f) => f.kind === 'draw')?.card).toEqual(
      drawn.players[1]!.hand[1],
    );
  });
  it('last-play metadata contains only a discarded public card', () => {
    const s = state([[2, 4], [9], [1]]);
    const next = applyMove(s, 'p0', {
      kind: 'play',
      cardId: s.players[0]!.hand[0]!.id,
      targetId: 'p1',
    });
    const publicPlay = toPlayerView(next, 'p2').lastPlay!;
    expect(publicPlay).toEqual({
      playerId: 'p0',
      targetId: 'p1',
      card: s.players[0]!.hand[0],
    });
    expect(next.players[0]!.discards).toContainEqual(publicPlay.card);
  });
});

import { describe, expect, it } from 'vitest';
import { CARDS, type Rank, type Move } from '@court/shared';
import {
  activePlayerId,
  applyMove,
  assertInvariants,
  createDeck,
  legalMoves,
  nextRound,
  seededRng,
  setupRound,
  toPlayerView,
  tokenTarget,
  type State,
} from './index';
const seats = Array.from({ length: 4 }, (_, i) => ({
  id: `p${i}`,
  name: `Seat ${i}`,
}));
function fixture(hands: Rank[][]): State {
  const s = setupRound(seats.slice(0, hands.length), seededRng(1));
  const deck = createDeck();
  s.players.forEach((p, i) => {
    p.hand = hands[i]!.map((rank) => {
      const index = deck.findIndex((c) => c.rank === rank);
      if (index < 0) throw new Error('Fixture exhausted rank');
      return deck.splice(index, 1)[0]!;
    });
    p.discards = [];
  });
  s.burn = deck.pop()!;
  s.deck = deck;
  s.setAside = [];
  s.phase = 'turn';
  s.pendingDraw = null;
  return s;
}
function play(s: State, rank: Rank, targetId?: string, guess?: number) {
  while (s.phase === 'draw')
    s = applyMove(s, activePlayerId(s), { kind: 'draw' });
  let out = applyMove(s, s.players[s.current]!.id, {
    kind: 'play',
    cardId: s.players[s.current]!.hand.find((c) => c.rank === rank)!.id,
    ...(targetId ? { targetId } : {}),
    ...(guess === undefined ? {} : { guess }),
  });
  while (out.phase === 'draw' && out.pendingDraw?.after !== 'turn')
    out = applyMove(out, activePlayerId(out), { kind: 'draw' });
  return out;
}
function emptyDeck(s: State) {
  s.setAside.push(...s.deck);
  s.deck = [];
}
describe('foundation', () => {
  it('has exactly the required 21 original card instances', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(21);
    for (const c of CARDS)
      expect(deck.filter((x) => x.rank === c.value)).toHaveLength(c.count);
  });
  it.each([2, 3, 4])('sets up %i seats reproducibly', (n) => {
    const people = Array.from({ length: n }, (_, i) => ({
      id: String(i),
      name: String(i),
    }));
    const s = setupRound(people, seededRng(123));
    expect(s).toEqual(setupRound(people, seededRng(123)));
    expect(s.setAside).toHaveLength(0);
    expect(s.deck).toHaveLength(21 - 1 - n);
    assertInvariants(s);
  });
  it('rejects bad seat counts and duplicates', () => {
    expect(() => setupRound([], seededRng(1))).toThrow();
    expect(() => setupRound([seats[0]!, seats[0]!], seededRng(1))).toThrow();
  });
  it('has correct token targets', () =>
    expect([2, 3, 4, 5, 6].map(tokenTarget)).toEqual([6, 5, 4, 3, 3]));
});
describe('effects', () => {
  it('Guard eliminates a correct guess and forbids guessing Guard', () => {
    const s = fixture([[1, 4], [9], [2]]);
    expect(
      legalMoves(s, 'p0').some((m) => m.kind === 'play' && m.guess === 1),
    ).toBe(false);
    const out = play(s, 1, 'p1', 9);
    expect(out.players[1]!.alive).toBe(false);
    assertInvariants(out);
    expect(s.players[1]!.alive).toBe(true);
  });
  it('incorrect Guard guess does nothing', () =>
    expect(
      play(fixture([[1, 4], [9], [2]]), 1, 'p1', 8).players[1]!.alive,
    ).toBe(true));
  it('Priest reveals to actor only', () => {
    const out = play(fixture([[2, 4], [9], [1]]), 2, 'p1');
    expect(out.events.find((e) => e.recipients)?.recipients).toEqual(['p0']);
    expect(toPlayerView(out, 'p2').events.join()).not.toContain('holds');
  });
  it.each([
    [3, 8, 1],
    [3, 1, 8],
  ])('Baron eliminates lower hand (%i %i %i)', (_baron, own, other) => {
    const out = play(
      fixture([[3, own as Rank], [other as Rank], [4]]),
      3,
      'p1',
    );
    expect(out.players[own < other ? 0 : 1]!.alive).toBe(false);
    expect(out.events.find((e) => e.recipients)?.recipients).toEqual([
      'p0',
      'p1',
    ]);
  });
  it('Baron tie eliminates nobody', () =>
    expect(
      play(fixture([[3, 1], [1], [4]]), 3, 'p1').players.every((p) => p.alive),
    ).toBe(true));
  it('Handmaid protects until the next turn begins', () => {
    let s = play(fixture([[4, 8], [0], [0]]), 4);
    expect(s.players[0]!.protected).toBe(true);
    expect(
      legalMoves(s, 'p1').some((m) => m.kind === 'play' && m.targetId === 'p0'),
    ).toBe(false);
    s = play(s, 0);
    s = play(s, 0);
    expect(s.players[0]!.protected).toBe(false);
  });
  it('Prince replaces a card without resolving its ability', () => {
    const out = play(fixture([[5, 4], [6], [1]]), 5, 'p1');
    expect(out.players[1]!.discards.map((c) => c.rank)).toContain(6);
    expect(out.phase).toBe('draw');
  });
  it('Prince can self-target', () => {
    const s = fixture([[5, 4], [1], [2]]);
    expect(legalMoves(s, 'p0')).toContainEqual({
      kind: 'play',
      cardId: s.players[0]!.hand[0]!.id,
      targetId: 'p0',
    });
    const out = play(s, 5, 'p0');
    expect(out.players[0]!.discards.map((c) => c.rank)).toEqual([5, 4]);
  });
  it('Prince discarding Princess eliminates', () =>
    expect(play(fixture([[5, 4], [9], [1]]), 5, 'p1').players[1]!.alive).toBe(
      false,
    ));
  it('Prince uses the burn when deck is empty', () => {
    const s = fixture([[5, 4], [1], [2]]);
    const burn = s.burn;
    emptyDeck(s);
    const out = play(s, 5, 'p1');
    expect(out.burn).toBeNull();
    expect(out.players[1]!.hand).toEqual([burn]);
    assertInvariants(out);
  });
  it.each([0, 1, 2])(
    'Chancellor handles %i cards available and conserves their ordered return',
    (count) => {
      const s = fixture([[6, 4], [1], [2]]);
      s.setAside.push(...s.deck.splice(count));
      let out = play(s, 6);
      expect(out.phase).toBe('chancellor');
      expect(out.players[0]!.hand).toHaveLength(1 + count);
      const move = legalMoves(out, 'p0').at(-1)!;
      expect(move.kind).toBe('choose');
      out = applyMove(out, 'p0', move);
      assertInvariants(out);
      expect(out.phase).toBe(count === 0 ? 'roundEnd' : 'draw');
      if (move.kind === 'choose')
        expect(out.players[0]!.hand[0]!.id).toBe(move.keepId);
    },
  );
  it('King swaps hands with private notices', () => {
    const s = fixture([[7, 4], [9], [1]]);
    const out = play(s, 7, 'p1');
    expect(out.players[0]!.hand[0]!.rank).toBe(9);
    expect(out.players[1]!.hand[0]!.rank).toBe(4);
    expect(out.events.filter((e) => e.recipients)).toHaveLength(2);
  });
  it.each([5, 7])('Countess is mandatory with %i', (rank) => {
    const s = fixture([[8, rank as Rank], [1], [2]]);
    expect(legalMoves(s, 'p0')).toEqual([
      { kind: 'play', cardId: s.players[0]!.hand[0]!.id },
    ]);
  });
  it('Countess may be kept with another rank', () =>
    expect(legalMoves(fixture([[8, 4], [1], [2]]), 'p0')).toHaveLength(2));
  it('Princess eliminates the actor and discards remaining hand', () => {
    const out = play(fixture([[9, 4], [1], [2]]), 9);
    expect(out.players[0]!.alive).toBe(false);
    expect(out.players[0]!.discards.map((c) => c.rank)).toEqual([9, 4]);
    assertInvariants(out);
  });
  it.each([1, 2, 3, 7])(
    'targeted rank %i becomes a no-op when all rivals are protected',
    (rank) => {
      const s = fixture([[rank as Rank, 4], [0], [0]]);
      s.players.slice(1).forEach((p) => (p.protected = true));
      const move = legalMoves(s, 'p0').find(
        (m) => m.kind === 'play' && m.cardId === s.players[0]!.hand[0]!.id,
      )!;
      expect(move).toEqual({ kind: 'play', cardId: s.players[0]!.hand[0]!.id });
      expect(() => applyMove(s, 'p0', move)).not.toThrow();
    },
  );
  it('protected rivals still allow Prince self-target', () => {
    const s = fixture([[5, 4], [1], [2]]);
    s.players.slice(1).forEach((p) => (p.protected = true));
    expect(
      legalMoves(s, 'p0')
        .filter((m) => m.kind === 'play' && m.targetId)
        .map((m) => m.kind === 'play' && m.targetId),
    ).toEqual(['p0']);
  });
  it('rejects wrong actor, nonexistent cards, and protected targets', () => {
    const s = fixture([[1, 4], [9], [2]]);
    s.players[1]!.protected = true;
    expect(() => play(s, 1, 'p1', 9)).toThrow();
    expect(() => applyMove(s, 'p1', { kind: 'play', cardId: 'bad' })).toThrow();
  });
});
describe('scores and privacy', () => {
  it('ends immediately with one survivor', () => {
    const s = fixture([[1, 4], [9]]);
    const out = play(s, 1, 'p1', 9);
    expect(out.phase).toBe('roundEnd');
    expect(out.roundWinners).toEqual(['p0']);
  });
  it('Spy awards independently of winning', () => {
    const s = fixture([[0, 1], [9], [2]]);
    emptyDeck(s);
    const out = play(s, 0);
    expect(out.players[0]!.tokens).toBe(1);
    expect(out.players[1]!.tokens).toBe(1);
  });
  it('two surviving Spy users receive no bonus', () => {
    const s = fixture([[0, 1], [9], [2]]);
    const spy = s.deck.find((c) => c.rank === 0)!;
    s.deck = s.deck.filter((c) => c.id !== spy.id);
    s.players[1]!.discards.push(spy);
    emptyDeck(s);
    const out = play(s, 0);
    expect(out.players[0]!.tokens).toBe(0);
    expect(out.players[1]!.tokens).toBe(1);
  });
  it('eliminated Spy user does not block surviving Spy bonus', () => {
    const s = fixture([[0, 1], [9], [2]]);
    const spy = s.deck.find((c) => c.rank === 0)!;
    s.deck = s.deck.filter((c) => c.id !== spy.id);
    s.players[2]!.discards.push(spy, ...s.players[2]!.hand);
    s.players[2]!.hand = [];
    s.players[2]!.alive = false;
    emptyDeck(s);
    expect(play(s, 0).players[0]!.tokens).toBe(1);
  });
  it('discard total breaks a hand tie', () => {
    const s = fixture([[4, 1], [1], [0]]);
    emptyDeck(s);
    const out = play(s, 4);
    expect(out.roundWinners).toEqual(['p0']);
  });
  it('equal discard totals allow shared wins', () => {
    const s = fixture([[0, 1], [1], [0]]);
    emptyDeck(s);
    const out = play(s, 0);
    expect(out.roundWinners).toEqual(['p0', 'p1']);
  });
  it('Spy can end a match and all qualifying players share match win', () => {
    const s = fixture([[0, 1], [9], [2]]);
    s.players[0]!.tokens = 4;
    s.players[1]!.tokens = 4;
    emptyDeck(s);
    const out = play(s, 0);
    expect(out.phase).toBe('gameOver');
    expect(out.gameWinners).toEqual(['p0', 'p1']);
  });
  it('next round preserves scores and chooses previous winner or rotation', () => {
    const s = fixture([[0, 1], [9], [2]]);
    emptyDeck(s);
    const ended = play(s, 0);
    const next = nextRound(ended, seededRng(2));
    expect(next.current).toBe(1);
    expect(next.players[1]!.tokens).toBe(1);
    assertInvariants(next);
    ended.previousWinnerStarts = false;
    ended.starter = 1;
    expect(nextRound(ended, seededRng(2)).current).toBe(2);
  });
  it('views contain no deck, burn, other hands, private events, or opponents legal options', () => {
    const s = fixture([[2, 4], [9], [1]]);
    const out = play(s, 2, 'p1');
    for (const p of out.players) {
      const v = toPlayerView(out, p.id);
      expect(v.hand).toEqual(p.hand);
      expect(v).not.toHaveProperty('deck');
      expect(v).not.toHaveProperty('burn');
      for (const publicP of v.players)
        expect(publicP).not.toHaveProperty('hand');
      expect(v.events.some((e) => e.includes('holds'))).toBe(false);
      if (p.id !== out.players[out.current]!.id)
        expect(v.legalMoves).toEqual([]);
    }
  });
  it('Chancellor cards and choices are visible only to actor', () => {
    const s = play(fixture([[6, 4], [9], [1]]), 6);
    expect(toPlayerView(s, 'p0').hand).toHaveLength(3);
    expect(toPlayerView(s, 'p1').hand).toHaveLength(1);
    expect(toPlayerView(s, 'p1').legalMoves).toEqual([]);
  });
  it('random full matches preserve invariants', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const rng = seededRng(seed);
      let s = setupRound(seats, rng);
      let count = 0;
      while (s.phase !== 'gameOver') {
        assertInvariants(s);
        expect(++count).toBeLessThan(3000);
        if (s.phase === 'roundEnd') s = nextRound(s, rng);
        else {
          const p = activePlayerId(s);
          const moves = legalMoves(s, p);
          s = applyMove(s, p, moves[Math.floor(rng() * moves.length)] as Move);
        }
      }
      assertInvariants(s);
    }
  });
});

describe('manual deck draws', () => {
  it('removes exactly one card, deals one per seat and waits for the opening click', () => {
    for (const count of [2, 3, 4]) {
      const s = setupRound(seats.slice(0, count), seededRng(12));
      expect(s.burn).not.toBeNull();
      expect(s.setAside).toEqual([]);
      expect(s.deck).toHaveLength(20 - count);
      expect(s.players.every((p) => p.hand.length === 1)).toBe(true);
      expect(legalMoves(s, 'p0')).toEqual([{ kind: 'draw' }]);
      expect(() => applyMove(s, 'p1', { kind: 'draw' })).toThrow();
      expect(() =>
        applyMove(s, 'p0', { kind: 'play', cardId: s.players[0]!.hand[0]!.id }),
      ).toThrow();
      const drawn = applyMove(s, 'p0', { kind: 'draw' });
      expect(drawn.players[0]!.hand).toHaveLength(2);
      expect(drawn.deck).toHaveLength(19 - count);
      expect(() => applyMove(drawn, 'p0', { kind: 'draw' })).toThrow();
      expect(s.players[0]!.hand).toHaveLength(1);
      assertInvariants(drawn);
    }
  });
  it('rejects a fifth seat', () => {
    expect(() =>
      setupRound([...seats, { id: 'p4', name: 'Extra' }], seededRng(1)),
    ).toThrow('2–4');
  });
  it('requires the Prince target to click before a replacement is dealt', () => {
    const s = fixture([[5, 4], [6], [1]]);
    const pending = applyMove(s, 'p0', {
      kind: 'play',
      cardId: s.players[0]!.hand[0]!.id,
      targetId: 'p2',
    });
    expect(pending.players[2]!.hand).toHaveLength(0);
    expect(pending.deck).toHaveLength(s.deck.length);
    expect(toPlayerView(pending, 'p2').currentPlayerId).toBe('p2');
    expect(legalMoves(pending, 'p0')).toEqual([]);
    assertInvariants(pending);
    const drawn = applyMove(pending, 'p2', { kind: 'draw' });
    expect(drawn.players[2]!.hand).toHaveLength(1);
    expect(activePlayerId(drawn)).toBe('p1');
    expect(drawn.phase).toBe('draw');
    assertInvariants(drawn);
  });
  it('requires two separate clicks for Chancellor and prevents early choices', () => {
    const s = fixture([[6, 4], [1], [2]]);
    const pending = applyMove(s, 'p0', {
      kind: 'play',
      cardId: s.players[0]!.hand[0]!.id,
    });
    expect(pending.players[0]!.hand).toHaveLength(1);
    const first = applyMove(pending, 'p0', { kind: 'draw' });
    expect(first.players[0]!.hand).toHaveLength(2);
    expect(legalMoves(first, 'p0')).toEqual([{ kind: 'draw' }]);
    const second = applyMove(first, 'p0', { kind: 'draw' });
    expect(second.players[0]!.hand).toHaveLength(3);
    expect(second.phase).toBe('chancellor');
    assertInvariants(first);
    assertInvariants(second);
  });
});

it('reveals results only at round end and awards two coins to the winning lone Spy user', () => {
  const s = fixture([[0, 9], [1], [2]]);
  expect(toPlayerView(s, 'p1').results).toEqual([]);
  emptyDeck(s);
  const ended = play(s, 0);
  const results = toPlayerView(ended, 'p1').results;
  expect(results).toHaveLength(3);
  expect(results[0]).toMatchObject({
    playerId: 'p0',
    handValue: 9,
    discardTotal: 0,
    cardTotal: 9,
    winnerCoins: 1,
    spyCoins: 1,
    earnedCoins: 2,
    totalCoins: 2,
  });
  expect(results[0]!.hand[0]!.rank).toBe(9);
  expect(results[1]!.earnedCoins).toBe(0);
});

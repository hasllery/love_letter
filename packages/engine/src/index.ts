import {
  CARDS,
  CONFIG,
  type Card,
  type Rank,
  type Seat,
  type Move,
  type GameEvent,
  type GameView,
} from '@court/shared';

export type RNG = () => number;
export function seededRng(seed: number): RNG {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function createDeck(): Card[] {
  return CARDS.flatMap((c) =>
    Array.from({ length: c.count }, (_, i) => ({
      id: `${c.value}-${i}`,
      rank: c.value,
    })),
  );
}
export function shuffle<T>(items: readonly T[], rng: RNG): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
export interface Player extends Seat {
  hand: Card[];
  discards: Card[];
  alive: boolean;
  protected: boolean;
  tokens: number;
}
export interface State {
  pendingDraw: {
    playerId: string;
    remaining: number;
    after: 'turn' | 'chancellor' | 'finish';
  } | null;
  lastPlay: GameView['lastPlay'];
  scoreHistory: Record<string, number[]>;
  players: Player[];
  deck: Card[];
  burn: Card | null;
  setAside: Card[];
  current: number;
  phase: GameView['phase'];
  round: number;
  revision: number;
  events: GameEvent[];
  roundWinners: string[];
  gameWinners: string[];
  previousWinnerStarts: boolean;
  starter: number;
}
export function tokenTarget(count: number): number {
  return count === 2 ? 6 : count === 3 ? 5 : count === 4 ? 4 : 3;
}
export function setupRound(
  seats: Seat[],
  rng: RNG,
  options: { previousWinnerStarts?: boolean } = {},
): State {
  if (
    seats.length < 2 ||
    seats.length > CONFIG.maxPlayers ||
    new Set(seats.map((p) => p.id)).size !== seats.length
  )
    throw new Error('Need 2–4 unique players.');
  const s: State = {
    pendingDraw: null,
    lastPlay: null,
    scoreHistory: Object.fromEntries(seats.map((p) => [p.id, []])),
    players: seats.map((p) => ({
      ...p,
      hand: [],
      discards: [],
      alive: true,
      protected: false,
      tokens: 0,
    })),
    deck: [],
    burn: null,
    setAside: [],
    current: 0,
    phase: 'turn',
    round: 0,
    revision: 0,
    events: [],
    roundWinners: [],
    gameWinners: [],
    previousWinnerStarts: options.previousWinnerStarts ?? true,
    starter: 0,
  };
  return deal(s, rng, 0);
}
function deal(s: State, rng: RNG, starter: number): State {
  s.deck = shuffle(createDeck(), rng);
  s.burn = s.deck.shift()!;
  s.setAside = [];
  for (const p of s.players) {
    p.hand = [s.deck.shift()!];
    p.discards = [];
    p.alive = true;
    p.protected = false;
  }
  s.current = starter;
  s.starter = starter;
  s.pendingDraw = {
    playerId: s.players[starter]!.id,
    remaining: 1,
    after: 'turn',
  };
  s.round++;
  s.revision++;
  s.phase = 'draw';
  s.roundWinners = [];
  s.lastPlay = null;
  s.events = [
    {
      message: `Round ${s.round} begins. ${s.players[starter]!.name} opens the court.`,
    },
  ];
  return s;
}
export function nextRound(state: State, rng: RNG): State {
  if (state.phase !== 'roundEnd') throw new Error('Round is not ready.');
  const s = structuredClone(state);
  const starter = s.previousWinnerStarts
    ? s.players.findIndex((p) => s.roundWinners.includes(p.id))
    : (s.starter + 1) % s.players.length;
  return deal(s, rng, starter);
}
function permutations<T>(items: T[]): T[][] {
  if (!items.length) return [[]];
  return items.flatMap((v, i) =>
    permutations(items.filter((_, j) => j !== i)).map((rest) => [v, ...rest]),
  );
}
export function legalMoves(s: State, playerId: string): Move[] {
  if (s.phase === 'draw')
    return s.pendingDraw?.playerId === playerId ? [{ kind: 'draw' }] : [];
  const p = s.players[s.current]!;
  if (p.id !== playerId || !['draw', 'turn', 'chancellor'].includes(s.phase))
    return [];
  if (s.phase === 'chancellor')
    return p.hand.flatMap((c) =>
      permutations(p.hand.filter((x) => x.id !== c.id).map((x) => x.id)).map(
        (bottomIds) => ({ kind: 'choose' as const, keepId: c.id, bottomIds }),
      ),
    );
  const forced =
    p.hand.some((c) => c.rank === 8) &&
    p.hand.some((c) => c.rank === 5 || c.rank === 7);
  return p.hand
    .filter((c) => !forced || c.rank === 8)
    .flatMap((c): Move[] => {
      if (![1, 2, 3, 5, 7].includes(c.rank))
        return [{ kind: 'play', cardId: c.id }];
      const targets = s.players.filter(
        (t) => t.alive && !t.protected && (c.rank === 5 || t.id !== p.id),
      );
      if (!targets.length) return [{ kind: 'play', cardId: c.id }];
      return targets.flatMap((t) =>
        c.rank === 1
          ? CARDS.filter((d) => d.value !== 1).map((d) => ({
              kind: 'play' as const,
              cardId: c.id,
              targetId: t.id,
              guess: d.value,
            }))
          : [{ kind: 'play' as const, cardId: c.id, targetId: t.id }],
      );
    });
}
function equalMove(a: Move, b: Move): boolean {
  if (a.kind === 'draw' || b.kind === 'draw') return a.kind === b.kind;
  return a.kind === 'choose' && b.kind === 'choose'
    ? a.keepId === b.keepId && a.bottomIds.join(',') === b.bottomIds.join(',')
    : a.kind === 'play' &&
        b.kind === 'play' &&
        a.cardId === b.cardId &&
        a.targetId === b.targetId &&
        a.guess === b.guess;
}
function eliminate(s: State, p: Player): void {
  p.alive = false;
  p.protected = false;
  p.discards.push(...p.hand);
  p.hand = [];
  s.events.push({ message: `${p.name} leaves the round.` });
}
function privateEvent(s: State, message: string, recipients: string[]): void {
  s.events.push({ message, recipients });
}
function finishTurn(s: State): void {
  const alive = s.players.filter((p) => p.alive);
  if (alive.length <= 1 || !s.deck.length) {
    const before = s.players.map((p) => p.tokens);
    const best = Math.max(...alive.map((p) => p.hand[0]!.rank));
    const top = alive.filter((p) => p.hand[0]!.rank === best);
    const sum = (p: Player) => p.discards.reduce((a, c) => a + c.rank, 0);
    const highestDiscards = Math.max(...top.map(sum));
    const winners = top.filter((p) => sum(p) === highestDiscards);
    s.roundWinners = winners.map((p) => p.id);
    for (const p of winners) p.tokens++;
    s.events.push({
      message: `${winners.map((p) => p.name).join(' & ')} ${winners.length === 1 ? 'wins' : 'share'} the round (+1 token).`,
    });
    const spies = alive.filter((p) => p.discards.some((c) => c.rank === 0));
    if (spies.length === 1) {
      spies[0]!.tokens++;
      s.events.push({
        message: `${spies[0]!.name} earns the Spy bonus (+1 token).`,
      });
    }
    s.players.forEach((p, i) =>
      s.scoreHistory[p.id]!.push(p.tokens - before[i]!),
    );
    s.gameWinners = s.players
      .filter((p) => p.tokens >= tokenTarget(s.players.length))
      .map((p) => p.id);
    s.phase = s.gameWinners.length ? 'gameOver' : 'roundEnd';
    return;
  }
  do {
    s.current = (s.current + 1) % s.players.length;
  } while (!s.players[s.current]!.alive);
  const next = s.players[s.current]!;
  next.protected = false;
  s.pendingDraw = { playerId: next.id, remaining: 1, after: 'turn' };
  s.phase = 'draw';
}
export function applyMove(state: State, playerId: string, move: Move): State {
  if (!legalMoves(state, playerId).some((m) => equalMove(m, move)))
    throw new Error('That move is not legal.');
  const s = structuredClone(state);
  s.revision++;
  const p = s.players[s.current]!;
  if (move.kind === 'draw') {
    const pending = s.pendingDraw!;
    const receiver = s.players.find((x) => x.id === pending.playerId)!;
    const card = s.deck.shift() ?? (pending.after === 'finish' ? s.burn : null);
    if (!card) throw new Error('No card to draw.');
    if (s.burn?.id === card.id) s.burn = null;
    receiver.hand.push(card);
    s.events.push({ message: `${receiver.name} draws a card.` });
    if (--pending.remaining === 0) {
      s.pendingDraw = null;
      if (pending.after === 'finish') finishTurn(s);
      else s.phase = pending.after;
    }
    return s;
  }
  if (move.kind === 'choose') {
    const cards = [...p.hand];
    p.hand = [cards.find((c) => c.id === move.keepId)!];
    s.deck.push(...move.bottomIds.map((id) => cards.find((c) => c.id === id)!));
    s.events.push({
      message: `${p.name} places ${move.bottomIds.length} card(s) beneath the deck.`,
    });
    finishTurn(s);
    return s;
  }
  const card = p.hand.find((c) => c.id === move.cardId)!;
  s.lastPlay = {
    playerId,
    card: { ...card },
    ...(move.targetId ? { targetId: move.targetId } : {}),
  };
  p.hand = p.hand.filter((c) => c.id !== card.id);
  p.discards.push(card);
  const t = s.players.find((x) => x.id === move.targetId);
  s.events.push({
    message: `${p.name} plays ${CARDS[card.rank].name}${t ? ` on ${t.name}` : ''}${card.rank === 1 && move.guess !== undefined ? `, naming ${CARDS[move.guess as Rank].name}` : ''}.`,
  });
  switch (card.rank) {
    case 0:
    case 8:
      break;
    case 1:
      if (t && t.hand[0]!.rank === move.guess) eliminate(s, t);
      break;
    case 2:
      if (t)
        privateEvent(
          s,
          `${t.name} holds ${CARDS[t.hand[0]!.rank].name} (${t.hand[0]!.rank}).`,
          [p.id],
        );
      break;
    case 3:
      if (t) {
        privateEvent(
          s,
          `${p.name}: ${CARDS[p.hand[0]!.rank].name}. ${t.name}: ${CARDS[t.hand[0]!.rank].name}.`,
          [p.id, t.id],
        );
        if (p.hand[0]!.rank < t.hand[0]!.rank) eliminate(s, p);
        else if (p.hand[0]!.rank > t.hand[0]!.rank) eliminate(s, t);
      }
      break;
    case 4:
      p.protected = true;
      break;
    case 5:
      if (t) {
        const discarded = t.hand.shift()!;
        t.discards.push(discarded);
        s.events.push({
          message: `${t.name} discards ${CARDS[discarded.rank].name}.`,
        });
        if (discarded.rank === 9) eliminate(s, t);
        else {
          s.pendingDraw = { playerId: t.id, remaining: 1, after: 'finish' };
          s.phase = 'draw';
          return s;
        }
      }
      break;
    case 6:
      s.pendingDraw = s.deck.length
        ? {
            playerId: p.id,
            remaining: Math.min(2, s.deck.length),
            after: 'chancellor',
          }
        : null;
      s.phase = s.pendingDraw ? 'draw' : 'chancellor';
      return s;
    case 7:
      if (t) {
        [p.hand, t.hand] = [t.hand, p.hand];
        privateEvent(
          s,
          `Hands exchanged with ${t.name}. You now hold ${CARDS[p.hand[0]!.rank].name}.`,
          [p.id],
        );
        privateEvent(
          s,
          `Hands exchanged with ${p.name}. You now hold ${CARDS[t.hand[0]!.rank].name}.`,
          [t.id],
        );
      }
      break;
    case 9:
      eliminate(s, p);
      break;
  }
  finishTurn(s);
  return s;
}
export function toPlayerView(
  s: State,
  playerId: string,
  connected: (id: string) => boolean = () => true,
): GameView {
  const ended = s.phase === 'roundEnd' || s.phase === 'gameOver';
  const spies = s.players.filter(
    (p) => p.alive && p.discards.some((c) => c.rank === 0),
  );
  return {
    results: ended
      ? s.players.map((p) => {
          const handValue = p.hand[0]?.rank ?? 0;
          const discardTotal = p.discards.reduce((sum, c) => sum + c.rank, 0);
          const winnerCoins = s.roundWinners.includes(p.id) ? 1 : 0;
          const spyCoins = spies.length === 1 && spies[0]!.id === p.id ? 1 : 0;
          return {
            playerId: p.id,
            hand: structuredClone(p.hand),
            handValue,
            discardTotal,
            cardTotal: handValue + discardTotal,
            survived: p.alive,
            winnerCoins,
            spyCoins,
            earnedCoins: winnerCoins + spyCoins,
            totalCoins: p.tokens,
          };
        })
      : [],
    lastPlay: structuredClone(s.lastPlay),
    scoreHistory: structuredClone(s.scoreHistory),
    phase: s.phase,
    round: s.round,
    revision: s.revision,
    players: s.players.map((p) => ({
      id: p.id,
      name: p.name,
      discards: structuredClone(p.discards),
      alive: p.alive,
      protected: p.protected,
      tokens: p.tokens,
      connected: connected(p.id),
      handCount: p.hand.length,
    })),
    hand: structuredClone(s.players.find((p) => p.id === playerId)?.hand ?? []),
    deckCount: s.deck.length,
    setAside: structuredClone(s.setAside),
    currentPlayerId: activePlayerId(s),
    legalMoves: legalMoves(s, playerId),
    events: s.events.filter((e) => !e.recipients).map((e) => e.message),
    roundWinners: [...s.roundWinners],
    gameWinners: [...s.gameWinners],
    tokenTarget: tokenTarget(s.players.length),
  };
}
export function activePlayerId(s: State): string {
  return s.pendingDraw?.playerId ?? s.players[s.current]!.id;
}
export function assertInvariants(s: State): void {
  const cards = [
    ...s.deck,
    ...(s.burn ? [s.burn] : []),
    ...s.setAside,
    ...s.players.flatMap((p) => [...p.hand, ...p.discards]),
  ];
  if (cards.length !== 21 || new Set(cards.map((c) => c.id)).size !== 21)
    throw new Error('Card conservation failed.');
  for (const p of s.players) {
    if (!p.alive && p.hand.length)
      throw new Error('Eliminated player has cards.');
    if (p.tokens < 0 || !Number.isInteger(p.tokens))
      throw new Error('Invalid score.');
    if (p.alive) {
      const max =
        p.id === s.players[s.current]!.id && s.phase === 'chancellor'
          ? 3
          : p.id === s.players[s.current]!.id && s.phase === 'turn'
            ? 2
            : 1;
      if (s.phase === 'draw' && s.pendingDraw?.playerId === p.id) {
        const pending = s.pendingDraw;
        const expected =
          pending.after === 'finish'
            ? 0
            : pending.after === 'chancellor'
              ? 3 - pending.remaining
              : 1;
        // Chancellor may have only one card left to draw.
        if (
          p.hand.length > expected ||
          p.hand.length < (pending.after === 'finish' ? 0 : 1)
        )
          throw new Error('Invalid drawing hand.');
        continue;
      }
      if (
        p.hand.length !== max &&
        !(
          s.phase === 'chancellor' &&
          p.id === s.players[s.current]!.id &&
          p.hand.length >= 1 &&
          p.hand.length <= 3
        )
      )
        throw new Error('Invalid hand size.');
    }
  }
  if (
    ['draw', 'turn', 'chancellor'].includes(s.phase) &&
    !legalMoves(s, activePlayerId(s)).length
  )
    throw new Error('Stuck turn.');
  if (
    s.phase === 'gameOver' &&
    (!s.gameWinners.length ||
      s.gameWinners.some(
        (id) =>
          s.players.find((p) => p.id === id)!.tokens <
          tokenTarget(s.players.length),
      ))
  )
    throw new Error('Invalid match winners.');
  if (s.phase === 'roundEnd' || s.phase === 'gameOver') {
    const alive = s.players.filter((p) => p.alive);
    const scores = alive.map(
      (p) =>
        p.hand[0]!.rank * 1000 + p.discards.reduce((sum, c) => sum + c.rank, 0),
    );
    const best = Math.max(...scores);
    const expected = alive
      .filter((_, i) => scores[i] === best)
      .map((p) => p.id);
    if (!expected.length || expected.join(',') !== s.roundWinners.join(','))
      throw new Error('Invalid round winners or shared tie.');
    const match = s.players
      .filter((p) => p.tokens >= tokenTarget(s.players.length))
      .map((p) => p.id);
    if (match.join(',') !== s.gameWinners.join(','))
      throw new Error('Invalid shared match win.');
  }
}

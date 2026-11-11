import type { Card, GameView } from '@court/shared';

export interface CardFlight {
  id: string;
  from: string;
  to: string;
  delay: number;
  duration: number;
  card?: Card;
  flip: boolean;
  kind: 'deal' | 'draw' | 'play' | 'discard' | 'return' | 'swap';
}
// Receives only a personalized public view; no animation can inspect hidden state.
export function planFlights(
  previous: GameView | null,
  next: GameView,
  you: string,
): CardFlight[] {
  const flights: CardFlight[] = [];
  const add = (
    kind: CardFlight['kind'],
    from: string,
    to: string,
    delay: number,
    card?: Card,
    flip = false,
  ) => {
    flights.push({
      id: `${next.round}-${next.revision}-${flights.length}`,
      kind,
      from,
      to,
      delay,
      duration: kind === 'swap' ? 0.85 : 0.65,
      card,
      flip,
    });
  };
  const initial =
    !previous ||
    previous.round !== next.round ||
    next.revision < previous.revision;
  if (initial) {
    // A mid-round reconnect restores the hand without re-enacting historical moves.
    if (!previous && next.players.some((p) => p.discards.length)) return [];
    let index = 0;
    for (const p of next.players)
      for (let i = 0; i < p.handCount; i++) {
        const card = p.id === you ? next.hand[i] : undefined;
        add('deal', 'deck', `hand:${p.id}`, index++ * 0.16, card, !!card);
      }
    return flights;
  }
  if (previous.revision === next.revision) return [];
  const play = next.lastPlay;
  const played = !!play && play.card.id !== previous.lastPlay?.card.id;
  if (played)
    add(
      'play',
      `hand:${play.playerId}`,
      'center',
      0,
      play.card,
      play.playerId !== you,
    );
  for (const p of next.players) {
    const old = previous.players.find((x) => x.id === p.id);
    for (const card of p.discards.filter(
      (c) => !old?.discards.some((x) => x.id === c.id),
    )) {
      if (played && card.id === play.card.id) continue;
      add('discard', `hand:${p.id}`, `tray:${p.id}`, 0.35, card, p.id !== you);
    }
  }
  const ownAdded = next.hand.filter(
    (c) => !previous.hand.some((x) => x.id === c.id),
  );
  if (
    played &&
    play.card.rank === 7 &&
    (play.playerId === you || play.targetId === you)
  ) {
    const received = ownAdded.findIndex((c) => c.id === next.hand[0]?.id);
    if (received >= 0) ownAdded.splice(received, 1);
  }
  const draw = (
    playerId: string,
    delay: number,
    kind: 'draw' | 'deal' = 'draw',
  ) => {
    const card = playerId === you ? ownAdded.shift() : undefined;
    add(kind, 'deck', `hand:${playerId}`, delay, card, !!card);
  };
  if (played && play.card.rank === 7 && play.targetId) {
    // Exchange travels face down even for the observer who knows one of the cards.
    add('swap', `hand:${play.playerId}`, `hand:${play.targetId}`, 0.55);
    add('swap', `hand:${play.targetId}`, `hand:${play.playerId}`, 0.65);
  }
  if (previous.phase === 'draw') {
    const receiver = previous.currentPlayerId;
    const before =
      previous.players.find((p) => p.id === receiver)?.handCount ?? 0;
    const after = next.players.find((p) => p.id === receiver)?.handCount ?? 0;
    if (after > before) draw(receiver, 0);
  }
  if (previous.phase === 'chancellor' && next.phase !== 'chancellor') {
    const actor = previous.currentPlayerId;
    const oldCount = previous.players.find((p) => p.id === actor)!.handCount;
    for (let i = 0; i < oldCount - 1; i++)
      add('return', `hand:${actor}`, 'deck', i * 0.16);
  }
  return flights;
}

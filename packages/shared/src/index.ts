import { z } from 'zod';

export const CONFIG = {
  title: 'Crimson Court',
  subtitle: 'A game of secrets & succession',
  maxPlayers: 4,
  turnSeconds: 20,
} as const;
export const CARDS = [
  {
    name: 'Spy',
    value: 0,
    count: 2,
    text: 'At round end, earn a token if you are the only survivor who used a Spy.',
    color: '#556b67',
  },
  {
    name: 'Guard',
    value: 1,
    count: 6,
    text: 'Name a rival’s card, except Guard. A correct guess removes them.',
    color: '#8e453c',
  },
  {
    name: 'Priest',
    value: 2,
    count: 2,
    text: 'Secretly discover the card in another player’s hand.',
    color: '#75718b',
  },
  {
    name: 'Baron',
    value: 3,
    count: 2,
    text: 'Compare hands in secret. The lower value leaves the round.',
    color: '#56677e',
  },
  {
    name: 'Handmaid',
    value: 4,
    count: 2,
    text: 'Remain safe from card effects until your next turn.',
    color: '#567b65',
  },
  {
    name: 'Prince',
    value: 5,
    count: 2,
    text: 'Choose anyone to discard their card and draw a replacement.',
    color: '#b07b36',
  },
  {
    name: 'Chancellor',
    value: 6,
    count: 2,
    text: 'Draw up to two. Keep one card; order the rest beneath the deck.',
    color: '#536d80',
  },
  {
    name: 'King',
    value: 7,
    count: 1,
    text: 'Exchange your remaining card with another player’s hand.',
    color: '#967741',
  },
  {
    name: 'Countess',
    value: 8,
    count: 1,
    text: 'Must be played when your other card is Prince or King.',
    color: '#a15865',
  },
  {
    name: 'Princess',
    value: 9,
    count: 1,
    text: 'Keep this secret close. Playing or discarding it eliminates you.',
    color: '#7d354c',
  },
] as const;
export type Rank = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export interface Card {
  id: string;
  rank: Rank;
}
export interface Seat {
  id: string;
  name: string;
}
export interface PublicPlayer extends Seat {
  discards: Card[];
  alive: boolean;
  protected: boolean;
  tokens: number;
  connected: boolean;
  handCount: number;
}
export const moveSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('draw') }).strict(),
  z
    .object({
      kind: z.literal('play'),
      cardId: z.string().max(16),
      targetId: z.string().max(64).optional(),
      guess: z.number().int().min(0).max(9).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('choose'),
      keepId: z.string().max(16),
      bottomIds: z.array(z.string().max(16)).max(2),
    })
    .strict(),
]);
export type Move = z.infer<typeof moveSchema>;
export interface GameEvent {
  message: string;
  recipients?: string[];
}
export interface RoundResult {
  playerId: string;
  hand: Card[];
  discards?: Card[];
  discardTotal: number;
  handValue: number;
  cardTotal: number;
  survived: boolean;
  winnerCoins: number;
  spyCoins: number;
  earnedCoins: number;
  totalCoins: number;
}
export interface GameView {
  results: RoundResult[];

  lastPlay: { playerId: string; card: Card; targetId?: string } | null;
  scoreHistory: Record<string, number[]>;
  phase: 'draw' | 'turn' | 'chancellor' | 'roundEnd' | 'gameOver';
  round: number;
  revision: number;
  players: PublicPlayer[];
  hand: Card[];
  deckCount: number;
  setAside: Card[];
  currentPlayerId: string;
  legalMoves: Move[];
  events: string[];
  roundWinners: string[];
  gameWinners: string[];
  tokenTarget: number;
}
export interface RoomView {
  code: string;
  hostId: string;
  you: string;
  players: (Seat & { connected: boolean })[];
  game: GameView | null;
  turnSeconds: number;
  deadline: number | null;
  lastTimeout: { playerId: string; revision: number } | null;
  previousWinnerStarts: boolean;
}
export type Ack =
  | { ok: true; playerId?: string; secret?: string; code?: string }
  | { ok: false; error: string };
export const nameSchema = z
  .string()
  .trim()
  .min(1)
  .max(24)
  .regex(
    /^[\p{L}\p{N} ._'-]+$/u,
    'Use letters, numbers, spaces, or simple punctuation.',
  );
export const schemas = {
  'room:create': z
    .object({
      name: nameSchema,
      turnSeconds: z.literal(20).default(20),
      previousWinnerStarts: z.boolean().default(true),
    })
    .strict(),
  'room:join': z
    .object({
      name: nameSchema,
      code: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z]{4}$/),
    })
    .strict(),
  'room:resume': z
    .object({
      code: z.string().regex(/^[A-Z]{4}$/),
      playerId: z.string().uuid(),
      secret: z.string().length(64),
    })
    .strict(),
  'room:leave': z.object({}).strict(),
  'room:kick': z.object({ playerId: z.string().uuid() }).strict(),
  'game:start': z.object({}).strict(),
  'game:next': z.object({}).strict(),
  'game:move': z
    .object({ move: moveSchema, revision: z.number().int().nonnegative() })
    .strict(),
};
export interface ServerEvents {
  'room:view': (view: RoomView) => void;
  'game:private': (event: { message: string }) => void;
  'room:removed': (event: { message: string }) => void;
}
export type ClientEvents = {
  [K in keyof typeof schemas]: (
    payload: z.input<(typeof schemas)[K]>,
    ack: (result: Ack) => void,
  ) => void;
};

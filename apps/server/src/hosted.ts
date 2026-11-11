import { z } from 'zod';
import { CONFIG, schemas, type RoomView, type Ack } from '@court/shared';
import {
  activePlayerId,
  applyMove,
  legalMoves,
  nextRound,
  seededRng,
  setupRound,
  toPlayerView,
  type State,
} from '@court/engine';
interface Statement {
  bind(...args: unknown[]): Statement;
  first<T>(): Promise<T | null>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface Database {
  prepare(sql: string): Statement;
}
interface Env {
  DB: Database;
  ASSETS: { fetch(request: Request): Promise<Response> };
}
type Player = { id: string; name: string; secret: string; seen: number };
interface Room {
  code: string;
  hostId: string;
  players: Player[];
  game: State | null;
  previousWinnerStarts: boolean;
  deadline: number | null;
  lastTimeout: RoomView['lastTimeout'];
  touched: number;
}
const credentials = z.object({
  code: z.string().regex(/^[A-Z]{4}$/),
  playerId: z.string().uuid(),
  secret: z.string().length(64),
});
const envelope = z.object({
  event: z.string(),
  payload: z.unknown().optional(),
  credentials: credentials.nullable().optional(),
  cursor: z
    .object({ round: z.number().int(), index: z.number().int() })
    .optional(),
});
const random = () => crypto.getRandomValues(new Uint32Array(1))[0]!;
const secret = () =>
  [...crypto.getRandomValues(new Uint8Array(32))]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
function schedule(room: Room, now: number) {
  room.deadline =
    room.game && ['turn', 'chancellor'].includes(room.game.phase)
      ? now + CONFIG.turnSeconds * 1000
      : null;
}
function view(room: Room, player: Player, now: number): RoomView {
  return {
    code: room.code,
    hostId: room.hostId,
    you: player.id,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      connected: now - p.seen < 20000,
    })),
    game: room.game
      ? toPlayerView(
          room.game,
          player.id,
          (id) => now - room.players.find((p) => p.id === id)!.seen < 20000,
        )
      : null,
    turnSeconds: 20,
    deadline: room.deadline,
    lastTimeout: room.lastTimeout,
    previousWinnerStarts: room.previousWinnerStarts,
  };
}
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export async function api(
  request: Request,
  db: Database,
  now = Date.now(),
): Promise<Response> {
  try {
    if (request.method !== 'POST')
      return json({ ack: { ok: false, error: 'Use POST.' } }, 405);
    if (
      request.headers.get('origin') &&
      request.headers.get('origin') !== new URL(request.url).origin
    )
      return json({ ack: { ok: false, error: 'Invalid origin.' } }, 403);
    const text = await request.text();
    if (text.length > 16384)
      return json({ ack: { ok: false, error: 'Request too large.' } }, 413);
    const input = envelope.parse(JSON.parse(text));
    const event = input.event;
    const data =
      event === 'poll'
        ? null
        : schemas[event as keyof typeof schemas]?.parse(input.payload);
    if (event !== 'poll' && !data) throw new Error('Unknown action.');
    if (event === 'room:create') {
      const settings = schemas['room:create'].parse(data);
      const p: Player = {
        id: crypto.randomUUID(),
        name: settings.name,
        secret: secret(),
        seen: now,
      };
      for (let attempt = 0; attempt < 12; attempt++) {
        const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ';
        const code = Array.from(
          { length: 4 },
          () => alphabet[random() % alphabet.length],
        ).join('');
        const room: Room = {
          code,
          hostId: p.id,
          players: [p],
          game: null,
          previousWinnerStarts: settings.previousWinnerStarts,
          deadline: null,
          lastTimeout: null,
          touched: now,
        };
        const result = await db
          .prepare(
            'INSERT OR IGNORE INTO rooms (code, version, body, touched) VALUES (?, 1, ?, ?)',
          )
          .bind(code, JSON.stringify(room), now)
          .run();
        if (result.meta.changes)
          return json({
            ack: { ok: true, code, playerId: p.id, secret: p.secret },
            view: view(room, p, now),
            cursor: { round: 0, index: 0 },
            privateEvents: [],
          });
      }
      throw new Error('The court is busy. Try again.');
    }
    const join =
      event === 'room:join' ? schemas['room:join'].parse(data) : null;
    const auth =
      event === 'room:resume' ? credentials.parse(data) : input.credentials;
    const code = join?.code ?? auth?.code;
    if (!code) throw new Error('Join a room first.');
    for (let retry = 0; retry < 8; retry++) {
      const row = await db
        .prepare('SELECT version, body FROM rooms WHERE code = ?')
        .bind(code)
        .first<{ version: number; body: string }>();
      if (!row) throw new Error('That court was not found.');
      const room = JSON.parse(row.body) as Room;
      if (now - room.touched > 86400000)
        throw new Error('This room has expired. Create a new court.');
      let player = room.players.find(
        (p) => p.id === auth?.playerId && p.secret === auth?.secret,
      );
      if (!join && !player)
        return json({
          ack: { ok: false, error: 'This saved seat has expired.' },
          removed: true,
        });
      let dirty = false;
      let ack: Ack = { ok: true };
      // Resolve an expired play before accepting any late intent. CAS below makes this happen once.
      if (room.game && room.deadline && now >= room.deadline) {
        const actor = activePlayerId(room.game);
        const move = legalMoves(room.game, actor)[0];
        if (move) {
          room.game = applyMove(room.game, actor, move);
          room.lastTimeout = { playerId: actor, revision: room.game.revision };
          schedule(room, now);
          dirty = true;
        }
      }
      if (player && now - player.seen > 5000) {
        player.seen = now;
        room.touched = now;
        dirty = true;
      }
      const host = room.players.find((p) => p.id === room.hostId);
      if (host && now - host.seen > 20000) {
        const successor = room.players.find((p) => now - p.seen < 20000);
        if (successor) {
          room.hostId = successor.id;
          dirty = true;
        }
      }
      if (join) {
        if (room.players.length >= CONFIG.maxPlayers)
          throw new Error('Room full.');
        if (room.game) throw new Error('This court has already started.');
        player = {
          id: crypto.randomUUID(),
          name: join.name,
          secret: secret(),
          seen: now,
        };
        room.players.push(player);
        ack = { ok: true, code, playerId: player.id, secret: player.secret };
        dirty = true;
      }
      if (!player) throw new Error('Join a room first.');
      if (
        ['game:start', 'game:next', 'room:kick'].includes(event) &&
        room.hostId !== player.id
      )
        throw new Error('Only the host can do that.');
      if (event === 'game:start') {
        if (room.game && room.game.phase !== 'gameOver')
          throw new Error('Game already started.');
        if (room.players.some((p) => now - p.seen > 20000))
          throw new Error('Wait for all players to reconnect.');
        room.game = setupRound(
          room.players.map((p) => ({ id: p.id, name: p.name })),
          seededRng(random()),
          { previousWinnerStarts: room.previousWinnerStarts },
        );
        room.lastTimeout = null;
        schedule(room, now);
        dirty = true;
      } else if (event === 'game:next') {
        if (!room.game) throw new Error('Start a game first.');
        room.game = nextRound(room.game, seededRng(random()));
        schedule(room, now);
        dirty = true;
      } else if (event === 'game:move') {
        const move = schemas['game:move'].parse(data);
        if (!room.game) throw new Error('Start a game first.');
        if (room.game.revision !== move.revision)
          ack = {
            ok: false,
            error: 'The table changed. Choose your move again.',
          };
        else {
          room.game = applyMove(room.game, player.id, move.move);
          schedule(room, now);
          dirty = true;
        }
      } else if (event === 'room:kick' || event === 'room:leave') {
        const target =
          event === 'room:leave'
            ? player.id
            : schemas['room:kick'].parse(data).playerId;
        if (event === 'room:kick' && (room.game || target === player.id))
          throw new Error('Choose another player in the lobby.');
        if (room.game && room.game.phase !== 'gameOver') {
          const leaving = room.players.find((p) => p.id === target);
          if (leaving) {
            leaving.secret = secret();
            leaving.seen = 0;
          }
        } else {
          room.players = room.players.filter((p) => p.id !== target);
          room.game = null;
        }
        if (room.hostId === target)
          room.hostId =
            room.players.find((p) => p.id !== target)?.id ?? room.hostId;
        dirty = true;
      }
      if (dirty) {
        room.touched = now;
        const result = await db
          .prepare(
            'UPDATE rooms SET body = ?, version = version + 1, touched = ? WHERE code = ? AND version = ?',
          )
          .bind(JSON.stringify(room), now, code, row.version)
          .run();
        if (!result.meta.changes) continue;
      }
      if (event === 'room:leave') return json({ ack, removed: true });
      const game = room.game;
      const cursor = {
        round: game?.round ?? 0,
        index: game?.events.length ?? 0,
      };
      const offset =
        input.cursor?.round === cursor.round ? input.cursor.index : 0;
      const privateEvents =
        event === 'room:resume'
          ? []
          : (game?.events
              .slice(offset)
              .filter((e) => e.recipients?.includes(player.id))
              .map((e) => e.message) ?? []);
      return json({
        ack,
        view: view(room, player, now),
        cursor,
        privateEvents,
      });
    }
    throw new Error('The table is busy. Try again.');
  } catch (error) {
    return json({
      ack: {
        ok: false,
        error:
          error instanceof z.ZodError
            ? 'Invalid request.'
            : error instanceof Error
              ? error.message
              : 'Request failed.',
      },
    });
  }
}
export default {
  async fetch(request: Request, env: Env) {
    const path = new URL(request.url).pathname;
    if (path === '/health') return json({ status: 'ok' });
    if (path === '/api/court') return api(request, env.DB);
    return env.ASSETS.fetch(request);
  },
};

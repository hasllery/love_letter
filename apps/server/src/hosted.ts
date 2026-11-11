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
export interface R2Bucket {
  put(
    key: string,
    value: ReadableStream | ArrayBuffer | string,
  ): Promise<unknown>;
  get(
    key: string,
  ): Promise<{ body: ReadableStream; text(): Promise<string> } | null>;
}
export interface Ai {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}
export interface Env {
  DB: Database;
  ASSETS?: { fetch(request: Request): Promise<Response> };
  STORAGE?: R2Bucket;
  AI?: Ai;
  GEMINI_API_KEY?: string;
  GROQ_API_KEY?: string;
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
const json = (body: unknown, status = 200, origin?: string | null) => {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
  });
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Credentials', 'true');
    headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  }
  return new Response(JSON.stringify(body), { status, headers });
};
export async function api(
  request: Request,
  db: Database,
  now = Date.now(),
): Promise<Response> {
  const origin = request.headers.get('origin');
  try {
    if (request.method !== 'POST')
      return json({ ack: { ok: false, error: 'Use POST.' } }, 405, origin);
    if (origin) {
      const reqUrl = new URL(request.url);
      const isAllowed =
        origin === reqUrl.origin ||
        origin.endsWith('.pages.dev') ||
        origin.endsWith('.workers.dev') ||
        origin.endsWith('.vercel.app') ||
        origin.endsWith('.trycloudflare.com') ||
        origin.endsWith('.ngrok-free.app') ||
        origin.endsWith('.loca.lt') ||
        ['localhost', '127.0.0.1'].some((h) => origin.includes(h)) ||
        /^https?:\/\/(192\.168|10\.|172\.(1[6-9]|2\d|3[0-1]))\./.test(origin);
      if (!isAllowed)
        return json({ ack: { ok: false, error: 'Invalid origin.' } }, 403, origin);
    }
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
async function handleAi(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST')
    return json({ error: 'Method not allowed' }, 405);
  try {
    const body = (await request.json().catch(() => ({}))) as {
      prompt?: string;
      provider?: 'cf' | 'gemini' | 'groq';
    };
    const systemPrompt =
      'You are the Court Oracle of Crimson Court, a royal card game of deduction and deception. Give witty, concise tactical advice or commentary in 2-3 sentences.';
    const userPrompt = body.prompt || 'Offer royal wisdom for the court today.';

    if ((!body.provider || body.provider === 'cf') && env.AI) {
      try {
        const result = (await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        })) as { response?: string };
        return json({
          provider: 'cloudflare-workers-ai',
          model: '@cf/meta/llama-3.1-8b-instruct',
          advice: result.response ?? 'The Court Oracle remains contemplative.',
        });
      } catch (err) {
        if (body.provider === 'cf') throw err;
      }
    }

    if ((!body.provider || body.provider === 'groq') && env.GROQ_API_KEY) {
      try {
        const res = await fetch(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${env.GROQ_API_KEY}`,
            },
            body: JSON.stringify({
              model: 'llama-3.3-70b-versatile',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              max_tokens: 150,
            }),
          },
        );
        if (res.ok) {
          const data = (await res.json()) as {
            choices?: [{ message?: { content?: string } }];
          };
          return json({
            provider: 'groq',
            model: 'llama-3.3-70b-versatile',
            advice: data.choices?.[0]?.message?.content ?? '',
          });
        }
      } catch (err) {
        if (body.provider === 'groq') throw err;
      }
    }

    if ((!body.provider || body.provider === 'gemini') && env.GEMINI_API_KEY) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: `${systemPrompt}\n\nUser: ${userPrompt}` }],
              },
            ],
          }),
        },
      );
      if (res.ok) {
        const data = (await res.json()) as {
          candidates?: [{ content?: { parts?: [{ text?: string }] } }];
        };
        return json({
          provider: 'gemini',
          model: 'gemini-1.5-flash',
          advice: data.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
        });
      }
    }

    return json({
      provider: 'default',
      advice:
        'Keep your Princess hidden, watch the Baron closely, and never let the King swap your secrets away.',
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'AI request failed' },
      500,
    );
  }
}

async function handleStorage(
  request: Request,
  storage?: R2Bucket,
): Promise<Response> {
  if (!storage) return json({ error: 'R2 storage is not configured' }, 503);
  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  if (!key) return json({ error: 'Missing key parameter' }, 400);

  if (request.method === 'GET') {
    const object = await storage.get(key);
    if (!object) return json({ error: 'Object not found' }, 404);
    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    return new Response(object.body, { headers });
  }

  if (request.method === 'PUT' || request.method === 'POST') {
    const data = await request.arrayBuffer();
    await storage.put(key, data);
    return json({ ok: true, key });
  }

  return json({ error: 'Method not allowed' }, 405);
}

class MemoryDB implements Database {
  private rows = new Map<string, { version: number; body: string }>();
  prepare(sql: string) {
    let args: unknown[] = [];
    const rows = this.rows;
    const statement = {
      bind(...values: unknown[]) {
        args = values;
        return statement;
      },
      async first<T>() {
        const row = rows.get(String(args[0]));
        return row ? (structuredClone(row) as T) : null;
      },
      async run() {
        if (sql.startsWith('INSERT')) {
          const key = String(args[0]);
          if (rows.has(key)) return { meta: { changes: 0 } };
          rows.set(key, { version: 1, body: String(args[1]) });
        } else {
          const key = String(args[2]);
          const row = rows.get(key);
          if (!row || row.version !== args[3]) return { meta: { changes: 0 } };
          rows.set(key, { version: row.version + 1, body: String(args[0]) });
        }
        return { meta: { changes: 1 } };
      },
    };
    return statement;
  }
}
const fallbackDb = new MemoryDB();

export default {
  async fetch(request: Request, env: Env) {
    const origin = request.headers.get('origin');
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin || '*',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
          'Access-Control-Allow-Headers':
            'Content-Type,Authorization,X-Requested-With',
        },
      });
    }
    const path = new URL(request.url).pathname;
    if (path === '/health' || path.endsWith('/health')) return json({ status: 'ok' }, 200, origin);
    if (path === '/api/court' || path.endsWith('/court') || path.endsWith('/api/court')) return api(request, env.DB ?? fallbackDb);
    if (path === '/api/oracle' || path === '/api/ai' || path.endsWith('/oracle') || path.endsWith('/ai'))
      return handleAi(request, env);
    if (path === '/api/storage' || path.endsWith('/storage')) return handleStorage(request, env.STORAGE);
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not Found', { status: 404 });
  },
};

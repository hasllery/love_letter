import express from 'express';
import { createServer } from 'node:http';
import {
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { Server, type Socket } from 'socket.io';
import {
  CONFIG,
  schemas,
  type Ack,
  type ClientEvents,
  type ServerEvents,
  type RoomView,
} from '@court/shared';
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

type Client = {
  id: string;
  name: string;
  secret: string;
  socketId: string | null;
};
export interface Room {
  code: string;
  hostId: string;
  players: Client[];
  game: State | null;
  turnSeconds: number;
  previousWinnerStarts: boolean;
  touched: number;
  deadline: number | null;
  lastTimeout: RoomView['lastTimeout'];
  timer?: ReturnType<typeof setTimeout>;
}
type CourtSocket = Socket<ClientEvents, ServerEvents>;
export function createCourtServer(
  options: {
    origins?: string[];
    now?: () => number;
    seed?: () => number;
    idleMs?: number;
  } = {},
) {
  const now = options.now ?? Date.now;
  const seed = options.seed ?? (() => randomInt(0, 0x7fffffff));
  const app = express();
  const http = createServer(app);
  const origins = options.origins ?? ['http://localhost:5173'];
  function isAllowedOrigin(origin: string | undefined): boolean {
    if (!origin) return true;
    if (origins.includes('*') || origins.includes(origin)) return true;
    try {
      const url = new URL(origin);
      if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)) return true;
      if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(url.hostname)) return true;
      if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(url.hostname)) return true;
      if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(url.hostname))
        return true;
      if (
        url.hostname.endsWith('.pages.dev') ||
        url.hostname.endsWith('.vercel.app') ||
        url.hostname.endsWith('.workers.dev')
      )
        return true;
    } catch {
      return false;
    }
    return false;
  }
  const io = new Server<ClientEvents, ServerEvents>(http, {
    cors: {
      origin: (requestOrigin, callback) =>
        callback(null, isAllowedOrigin(requestOrigin)),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    maxHttpBufferSize: 16384,
    allowRequest: (request, done) =>
      done(null, isAllowedOrigin(request.headers.origin)),
  });
  const rooms = new Map<string, Room>();
  const membership = new Map<string, { room: Room; player: Client }>();
  const rates = new Map<string, { count: number; since: number }>();
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.disable('x-powered-by');
  function view(room: Room, player: Client): RoomView {
    return {
      code: room.code,
      hostId: room.hostId,
      you: player.id,
      players: room.players.map((p) => ({
        id: p.id,
        name: p.name,
        connected: !!p.socketId,
      })),
      game: room.game
        ? toPlayerView(
            room.game,
            player.id,
            (id) => !!room.players.find((p) => p.id === id)?.socketId,
          )
        : null,
      turnSeconds: room.turnSeconds,
      deadline: room.deadline,
      lastTimeout: room.lastTimeout,
      previousWinnerStarts: room.previousWinnerStarts,
    };
  }
  function broadcast(room: Room) {
    for (const p of room.players)
      if (p.socketId) io.to(p.socketId).emit('room:view', view(room, p));
  }
  function deliverPrivate(room: Room, from: number) {
    for (const e of room.game!.events.slice(from))
      for (const id of e.recipients ?? []) {
        const p = room.players.find((p) => p.id === id);
        if (p?.socketId)
          io.to(p.socketId).emit('game:private', { message: e.message });
      }
  }
  function schedule(room: Room) {
    clearTimeout(room.timer);
    room.deadline = null;
    if (
      !room.turnSeconds ||
      !room.game ||
      !['turn', 'chancellor'].includes(room.game.phase)
    )
      return;
    room.deadline = now() + room.turnSeconds * 1000;
    room.timer = setTimeout(() => {
      if (!room.game) return;
      const actor = activePlayerId(room.game);
      const moves = legalMoves(room.game, actor);
      const move = moves[0];
      if (move) {
        const previous = room.game.events.length;
        room.game = applyMove(room.game, actor, move);
        room.lastTimeout = { playerId: actor, revision: room.game.revision };
        room.touched = now();
        deliverPrivate(room, previous);
        schedule(room);
        broadcast(room);
      }
    }, room.turnSeconds * 1000);
    room.timer.unref();
  }
  function limited(socket: CourtSocket, scope: string, max: number) {
    const key = `${socket.handshake.address}:${scope}`;
    let rate = rates.get(key);
    if (!rate || now() - rate.since > 60000) {
      rate = { count: 0, since: now() };
      rates.set(key, rate);
    }
    if (++rate.count > max)
      throw new Error('Too many requests. Please wait a minute.');
  }
  function current(socket: CourtSocket) {
    const m = membership.get(socket.id);
    if (!m) throw new Error('Join a room first.');
    m.room.touched = now();
    return m;
  }
  function host(socket: CourtSocket) {
    const m = current(socket);
    if (m.room.hostId !== m.player.id)
      throw new Error('Only the host can do that.');
    return m;
  }
  function attach(socket: CourtSocket, room: Room, player: Client) {
    if (membership.has(socket.id))
      throw new Error('Leave your current room first.');
    player.socketId = socket.id;
    membership.set(socket.id, { room, player });
    room.touched = now();
  }
  function transfer(room: Room) {
    if (!room.players.find((p) => p.id === room.hostId)?.socketId)
      room.hostId = room.players.find((p) => p.socketId)?.id ?? room.hostId;
  }
  function remove(room: Room, player: Client) {
    if (player.socketId) {
      membership.delete(player.socketId);
      io.to(player.socketId).emit('room:removed', {
        message: 'You left the court.',
      });
    }
    player.socketId = null;
    if (!room.game || room.game.phase === 'gameOver') {
      room.players = room.players.filter((p) => p.id !== player.id);
      if (room.game) room.game = null;
    } else player.secret = randomBytes(32).toString('hex');
    transfer(room);
    room.touched = now();
    if (!room.players.length) {
      clearTimeout(room.timer);
      rooms.delete(room.code);
    } else broadcast(room);
  }
  function code() {
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ';
    for (let attempt = 0; attempt < 1000; attempt++) {
      const result = Array.from(
        { length: 4 },
        () => alphabet[randomInt(alphabet.length)],
      ).join('');
      if (!rooms.has(result)) return result;
    }
    throw new Error('Court is busy. Try again.');
  }
  io.on('connection', (socket) => {
    for (const event of Object.keys(schemas) as (keyof typeof schemas)[]) {
      // Socket.IO's union-event overload cannot retain each schema's correlated input type;
      // the boundary handler accepts unknown and validates it before dispatch.
      const register = socket.on.bind(socket) as (
        event: string,
        listener: (payload: unknown, ack?: (result: Ack) => void) => void,
      ) => void;
      register(event, (payload, ack) => {
        const respond = (result: Ack) => {
          if (typeof ack === 'function') ack(result);
        };
        try {
          limited(socket, 'all', 240);
          const parsed = schemas[event].safeParse(payload);
          if (!parsed.success)
            throw new Error(
              parsed.error.issues[0]?.message ?? 'Invalid request.',
            );
          if (event === 'room:create') {
            limited(socket, 'entry', 20);
            if (membership.has(socket.id))
              throw new Error('Leave your current room first.');
            const data = schemas['room:create'].parse(payload);
            const player = {
              id: randomUUID(),
              name: data.name,
              secret: randomBytes(32).toString('hex'),
              socketId: null,
            };
            const room: Room = {
              code: code(),
              hostId: player.id,
              players: [player],
              game: null,
              turnSeconds: data.turnSeconds,
              previousWinnerStarts: data.previousWinnerStarts,
              touched: now(),
              deadline: null,
              lastTimeout: null,
            };
            rooms.set(room.code, room);
            attach(socket, room, player);
            respond({
              ok: true,
              code: room.code,
              playerId: player.id,
              secret: player.secret,
            });
            broadcast(room);
            return;
          }
          if (event === 'room:join') {
            limited(socket, 'entry', 20);
            const data = schemas['room:join'].parse(payload);
            const room = rooms.get(data.code);
            if (!room) throw new Error('That court was not found.');
            if (room.players.length >= CONFIG.maxPlayers)
              throw new Error('Room full.');
            if (room.game) throw new Error('This court has already started.');
            if (membership.has(socket.id))
              throw new Error('Leave your current room first.');
            const player: Client = {
              id: randomUUID(),
              name: data.name,
              secret: randomBytes(32).toString('hex'),
              socketId: null,
            };
            attach(socket, room, player);
            room.players.push(player);
            respond({
              ok: true,
              code: room.code,
              playerId: player.id,
              secret: player.secret,
            });
            broadcast(room);
            return;
          }
          if (event === 'room:resume') {
            limited(socket, 'resume', 30);
            const data = schemas['room:resume'].parse(payload);
            const room = rooms.get(data.code);
            const player = room?.players.find((p) => p.id === data.playerId);
            if (
              !room ||
              !player ||
              !timingSafeEqual(
                Buffer.from(player.secret),
                Buffer.from(data.secret),
              )
            )
              throw new Error('This saved seat has expired.');
            if (membership.has(socket.id))
              throw new Error('Already connected to a court.');
            if (player.socketId) {
              const old = io.sockets.sockets.get(player.socketId);
              membership.delete(player.socketId);
              old?.emit('room:removed', {
                message: 'Your seat was opened in another window.',
              });
              old?.disconnect(true);
            }
            attach(socket, room, player);
            transfer(room);
            respond({ ok: true });
            broadcast(room);
            return;
          }
          if (event === 'room:leave') {
            const { room, player } = current(socket);
            remove(room, player);
            respond({ ok: true });
            return;
          }
          if (event === 'room:kick') {
            const { room, player } = host(socket);
            if (room.game)
              throw new Error('Players can only be removed in the lobby.');
            const target = room.players.find(
              (p) => p.id === schemas['room:kick'].parse(payload).playerId,
            );
            if (!target || target.id === player.id)
              throw new Error('Choose another player.');
            remove(room, target);
            respond({ ok: true });
            return;
          }
          if (event === 'game:start') {
            const { room } = host(socket);
            if (room.game && room.game.phase !== 'gameOver')
              throw new Error('Game already started.');
            if (room.players.some((p) => !p.socketId))
              throw new Error('Wait for all players to reconnect.');
            room.game = setupRound(
              room.players.map((p) => ({ id: p.id, name: p.name })),
              seededRng(seed()),
              { previousWinnerStarts: room.previousWinnerStarts },
            );
            schedule(room);
            broadcast(room);
            respond({ ok: true });
            return;
          }
          if (event === 'game:next') {
            const { room } = host(socket);
            if (!room.game) throw new Error('Start a game first.');
            room.game = nextRound(room.game, seededRng(seed()));
            schedule(room);
            broadcast(room);
            respond({ ok: true });
            return;
          }
          const { room, player } = current(socket);
          const data = schemas['game:move'].parse(payload);
          if (!room.game) throw new Error('Start a game first.');
          if (data.revision !== room.game.revision)
            throw new Error('The table changed. Choose your move again.');
          const previous = room.game.events.length;
          room.game = applyMove(room.game, player.id, data.move);
          deliverPrivate(room, previous);
          schedule(room);
          broadcast(room);
          respond({ ok: true });
        } catch (error) {
          respond({
            ok: false,
            error: error instanceof Error ? error.message : 'Request failed.',
          });
        }
      });
    }
    socket.on('disconnect', () => {
      const m = membership.get(socket.id);
      if (!m) return;
      membership.delete(socket.id);
      m.player.socketId = null;
      m.room.touched = now();
      transfer(m.room);
      broadcast(m.room);
    });
  });
  function sweep() {
    for (const [key, r] of rates)
      if (now() - r.since > 60000) rates.delete(key);
    for (const [key, room] of rooms)
      if (now() - room.touched > (options.idleMs ?? 30 * 60000)) {
        clearTimeout(room.timer);
        for (const p of room.players)
          if (p.socketId) {
            membership.delete(p.socketId);
            io.to(p.socketId).emit('room:removed', {
              message: 'This court closed after 30 minutes of inactivity.',
            });
          }
        rooms.delete(key);
      }
  }
  const cleanup = setInterval(sweep, 60000);
  cleanup.unref();
  return {
    app,
    http,
    io,
    rooms,
    sweep,
    listen: (port = 3001, hostname = '0.0.0.0') =>
      new Promise<number>((resolve) => {
        http.listen(port, hostname, () => {
          const a = http.address();
          resolve(typeof a === 'object' && a ? a.port : port);
        });
      }),
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(cleanup);
        for (const room of rooms.values()) clearTimeout(room.timer);
        io.close(() => resolve());
      }),
  };
}

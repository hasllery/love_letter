import { afterEach, describe, expect, it, vi } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import type { Ack, ClientEvents, RoomView, ServerEvents } from '@court/shared';
import { activePlayerId } from '@court/engine';
import { createCourtServer } from './server';
type ClientSocket = Socket<ServerEvents, ClientEvents>;
const servers: ReturnType<typeof createCourtServer>[] = [];
const sockets: ClientSocket[] = [];
afterEach(async () => {
  for (const s of sockets.splice(0)) s.disconnect();
  await Promise.all(servers.splice(0).map((s) => s.close()));
});
async function server(options: Parameters<typeof createCourtServer>[0] = {}) {
  const s = createCourtServer(options);
  servers.push(s);
  const port = await s.listen(0, '127.0.0.1');
  return { s, url: `http://127.0.0.1:${port}` };
}
async function client(url: string) {
  const socket: ClientSocket = io(url, {
    transports: ['websocket'],
    forceNew: true,
  });
  sockets.push(socket);
  await new Promise<void>((resolve) => socket.on('connect', resolve));
  const state: { view: RoomView | null; private: string[] } = {
    view: null,
    private: [],
  };
  socket.on('room:view', (v) => {
    state.view = v;
  });
  socket.on('game:private', (e) => state.private.push(e.message));
  return { socket, state };
}
function emit<K extends keyof ClientEvents>(
  socket: ClientSocket,
  event: K,
  payload: Parameters<ClientEvents[K]>[0],
): Promise<Ack> {
  return new Promise((resolve) => {
    const send = socket.emit.bind(socket) as (
      event: K,
      payload: unknown,
      callback: (result: Ack) => void,
    ) => void;
    send(event, payload, resolve);
  });
}
async function eventually(check: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('Expected state did not arrive');
}
async function roomOf(
  count = 4,
  options: Parameters<typeof createCourtServer>[0] = { seed: () => 42 },
) {
  const { s, url } = await server(options);
  const clients = await Promise.all(
    Array.from({ length: count }, () => client(url)),
  );
  const auth = await emit(clients[0]!.socket, 'room:create', { name: 'Host' });
  if (!auth.ok || !auth.code) throw new Error('create failed');
  for (let i = 1; i < count; i++)
    expect(
      (
        await emit(clients[i]!.socket, 'room:join', {
          name: `Guest ${i}`,
          code: auth.code,
        })
      ).ok,
    ).toBe(true);
  await eventually(() =>
    clients.every((c) => c.state.view?.players.length === count),
  );
  return { s, url, clients, auth, room: s.rooms.get(auth.code)! };
}
describe('room authority and resilience', () => {
  it('creates safe codes, validates payloads, and restricts host controls', async () => {
    const { clients, auth } = await roomOf(2);
    expect(auth.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
    expect(await emit(clients[1]!.socket, 'game:start', {})).toMatchObject({
      ok: false,
    });
    const bad = await emit(clients[0]!.socket, 'room:join', {
      name: '<script>',
      code: auth.code!,
    });
    expect(bad.ok).toBe(false);
    expect((await emit(clients[0]!.socket, 'game:start', {})).ok).toBe(true);
    expect((await emit(clients[0]!.socket, 'game:start', {})).ok).toBe(false);
  });
  it('supports kick and host transfer', async () => {
    const { clients, room } = await roomOf(3);
    const kicked = room.players[2]!.id;
    expect(
      (await emit(clients[0]!.socket, 'room:kick', { playerId: kicked })).ok,
    ).toBe(true);
    expect(room.players).toHaveLength(2);
    clients[0]!.socket.disconnect();
    await eventually(() => room.hostId === room.players[1]!.id);
  });
  it('requires the secret to resume and preserves the hand', async () => {
    const { clients, auth, url, room } = await roomOf(2);
    await emit(clients[0]!.socket, 'game:start', {});
    const hand = structuredClone(room.game!.players[0]!.hand);
    clients[0]!.socket.disconnect();
    await eventually(() => room.players[0]!.socketId === null);
    const next = await client(url);
    expect(
      (
        await emit(next.socket, 'room:resume', {
          code: auth.code!,
          playerId: auth.playerId!,
          secret: '0'.repeat(64),
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await emit(next.socket, 'room:resume', {
          code: auth.code!,
          playerId: auth.playerId!,
          secret: auth.secret!,
        })
      ).ok,
    ).toBe(true);
    await eventually(() => next.state.view?.game !== null);
    expect(next.state.view!.game!.hand).toEqual(hand);
  });
  it('rejects forged and stale moves', async () => {
    const { clients, room } = await roomOf(2);
    await emit(clients[0]!.socket, 'game:start', {});
    await eventually(() => !!clients[0]!.state.view?.game);
    const revision = room.game!.revision;
    expect(
      (
        await emit(clients[1]!.socket, 'game:move', {
          revision,
          move: { kind: 'play', cardId: '1-0' },
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await emit(clients[0]!.socket, 'game:move', {
          revision: revision - 1,
          move: clients[0]!.state.view!.game!.legalMoves[0]!,
        })
      ).ok,
    ).toBe(false);
  });
  it('limits room entry attempts', async () => {
    const { url } = await server();
    const c = await client(url);
    let result: Ack = { ok: true };
    for (let i = 0; i < 21; i++)
      result = await emit(c.socket, 'room:join', {
        name: 'Test',
        code: 'AAAA',
      });
    expect(result).toMatchObject({
      ok: false,
      error: 'Too many requests. Please wait a minute.',
    });
  });
  it('expires inactive rooms and cleans their timers', async () => {
    let now = 100;
    const { s, room } = await roomOf(2, { now: () => now, idleMs: 1000 });
    now += 1001;
    s.sweep();
    expect(s.rooms.has(room.code)).toBe(false);
  });
  it('serves a health check', async () => {
    const { url } = await server();
    expect(await (await fetch(`${url}/health`)).json()).toEqual({
      status: 'ok',
    });
  });
  it('auto-resolves a disconnected turn when the optional timer expires', async () => {
    const { clients, room } = await roomOf(2);
    expect(room.turnSeconds).toBe(20);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      await emit(clients[0]!.socket, 'game:start', {});
      expect(room.deadline).toBeNull();
      await vi.advanceTimersByTimeAsync(20001);
      expect(room.game!.phase).toBe('draw');
      await emit(clients[0]!.socket, 'game:move', {
        revision: room.game!.revision,
        move: { kind: 'draw' },
      });
      const revision = room.game!.revision;
      clients[0]!.socket.disconnect();
      await vi.advanceTimersByTimeAsync(20001);
      expect(room.game!.revision).toBeGreaterThan(revision);
    } finally {
      vi.useRealTimers();
    }
  });
});
describe('socket gameplay and privacy', () => {
  it('plays a full four-client match through personalized views', async () => {
    let clock = 0;
    const { clients, room } = await roomOf(4, {
      seed: () => 123,
      now: () => clock,
    });
    await emit(clients[0]!.socket, 'game:start', {});
    let actions = 0;
    while (room.game!.phase !== 'gameOver') {
      clock += 1000;
      await eventually(() =>
        clients.every(
          (c) => c.state.view?.game?.revision === room.game!.revision,
        ),
      );
      if (++actions > 2000) throw new Error('Match stalled');
      if (room.game!.phase === 'roundEnd') {
        expect((await emit(clients[0]!.socket, 'game:next', {})).ok).toBe(true);
        continue;
      }
      const actor = clients.find(
        (c) => c.state.view!.you === activePlayerId(room.game!),
      )!;
      for (const c of clients) {
        const view = c.state.view!;
        expect(view.game).not.toHaveProperty('deck');
        expect(view.game).not.toHaveProperty('burn');
        expect(JSON.stringify(view)).not.toContain('secret');
        expect(view.game!.hand).toEqual(
          room.game!.players.find((p) => p.id === view.you)!.hand,
        );
        for (const p of view.game!.players)
          expect(p).not.toHaveProperty('hand');
      }
      const game = actor.state.view!.game!;
      expect(
        (
          await emit(actor.socket, 'game:move', {
            revision: game.revision,
            move: game.legalMoves[actions % game.legalMoves.length]!,
          })
        ).ok,
      ).toBe(true);
    }
    expect(room.game!.gameWinners.length).toBeGreaterThan(0);
  });
  it('never broadcasts Priest reveals to uninvolved sockets', async () => {
    const { clients, room } = await roomOf(3);
    await emit(clients[0]!.socket, 'game:start', {});
    await emit(clients[0]!.socket, 'game:move', {
      revision: room.game!.revision,
      move: { kind: 'draw' },
    });
    const game = room.game!;
    const actor = game.players[0]!;
    const priest =
      game.deck.find((c) => c.rank === 2) ??
      game.players.flatMap((p) => p.hand).find((c) => c.rank === 2)!;
    const owner = game.players.find((p) =>
      p.hand.some((c) => c.id === priest.id),
    );
    if (owner) {
      const replacement = actor.hand[0]!;
      owner.hand = owner.hand.map((c) =>
        c.id === priest.id ? replacement : c,
      );
      actor.hand[0] = priest;
    } else {
      const i = game.deck.findIndex((c) => c.id === priest.id);
      game.deck[i] = actor.hand[0]!;
      actor.hand[0] = priest;
    }
    expect(
      (
        await emit(clients[0]!.socket, 'game:move', {
          revision: game.revision,
          move: {
            kind: 'play',
            cardId: priest.id,
            targetId: game.players[1]!.id,
          },
        })
      ).ok,
    ).toBe(true);
    await eventually(() => clients[0]!.state.private.length === 1);
    expect(clients[1]!.state.private).toEqual([]);
    expect(clients[2]!.state.private).toEqual([]);
    expect(
      clients[0]!.state.view!.game!.events.some((e) => e.includes('holds')),
    ).toBe(false);
  });
});

it('fills four seats, rejects a fifth and reopens a lobby seat after removal', async () => {
  const { clients, url, auth, room } = await roomOf(4);
  const extra = await client(url);
  expect(
    await emit(extra.socket, 'room:join', { name: 'Extra', code: auth.code! }),
  ).toEqual({ ok: false, error: 'Room full.' });
  expect(room.players).toHaveLength(4);
  expect(
    (
      await emit(clients[0]!.socket, 'room:kick', {
        playerId: room.players[3]!.id,
      })
    ).ok,
  ).toBe(true);
  expect(
    (await emit(extra.socket, 'room:join', { name: 'Extra', code: auth.code! }))
      .ok,
  ).toBe(true);
  expect(room.players).toHaveLength(4);
});

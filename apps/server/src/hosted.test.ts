import { describe, expect, it } from 'vitest';
import { api, type Database } from './hosted';
import type { RoomView, Ack } from '@court/shared';
class MemoryDB implements Database {
  rows = new Map<string, { version: number; body: string }>();
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
type Auth = { code: string; playerId: string; secret: string };
type Reply = { ack: Ack; view: RoomView; removed?: boolean };
async function send(
  db: Database,
  event: string,
  payload: unknown,
  auth?: Auth,
  now = 100000,
) {
  const response = await api(
    new Request('https://court.test/api/court', {
      method: 'POST',
      headers: { origin: 'https://court.test' },
      body: JSON.stringify({ event, payload, credentials: auth }),
    }),
    db,
    now,
  );
  return (await response.json()) as Reply;
}
async function create(db: Database) {
  const r = await send(db, 'room:create', { name: 'Host' });
  if (!r.ack.ok) throw new Error('Create failed');
  return {
    code: r.ack.code!,
    playerId: r.ack.playerId!,
    secret: r.ack.secret!,
  };
}
describe('hosted multiplayer', () => {
  it('enforces capacity even when joins race', async () => {
    const db = new MemoryDB();
    const auth = await create(db);
    const joins = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        send(db, 'room:join', { code: auth.code, name: `Guest ${i}` }),
      ),
    );
    expect(joins.filter((r) => r.ack.ok)).toHaveLength(3);
    expect(
      joins
        .filter((r) => !r.ack.ok)
        .every((r) => !r.ack.ok && r.ack.error === 'Room full.'),
    ).toBe(true);
  });
  it('keeps hands private, rejects forged seats and resolves the timer only once', async () => {
    const db = new MemoryDB();
    const auth = await create(db);
    await send(db, 'room:join', { code: auth.code, name: 'Guest' });
    const start = await send(db, 'game:start', {}, auth);
    expect(start.view.deadline).toBeNull();
    expect(start.view.game!.hand).toHaveLength(1);
    expect(start.view.game!.results).toEqual([]);
    expect(JSON.stringify(start.view)).not.toContain(auth.secret);
    expect(start.view.game).not.toHaveProperty('deck');
    expect(start.view.game!.players[1]).not.toHaveProperty('hand');
    const forged = await send(
      db,
      'poll',
      {},
      { ...auth, secret: '0'.repeat(64) },
    );
    expect(forged.ack.ok).toBe(false);
    const draw = await send(
      db,
      'game:move',
      { revision: start.view.game!.revision, move: { kind: 'draw' } },
      auth,
    );
    expect(draw.view.deadline).toBe(120000);
    const before = await send(db, 'poll', {}, auth, 119999);
    expect(before.view.game!.revision).toBe(draw.view.game!.revision);
    const raced = await Promise.all([
      send(db, 'poll', {}, auth, 120001),
      send(db, 'poll', {}, auth, 120001),
    ]);
    expect(raced[0]!.view.game!.revision).toBe(draw.view.game!.revision + 1);
    expect(raced[1]!.view.game!.revision).toBe(raced[0]!.view.game!.revision);
    expect(raced[0]!.view.lastTimeout?.playerId).toBe(auth.playerId);
  });
  it('rejects duplicate draw intents with an unchanged revision', async () => {
    const db = new MemoryDB();
    const auth = await create(db);
    await send(db, 'room:join', { code: auth.code, name: 'Guest' });
    const start = await send(db, 'game:start', {}, auth);
    const payload = {
      revision: start.view.game!.revision,
      move: { kind: 'draw' },
    };
    const results = await Promise.all([
      send(db, 'game:move', payload, auth),
      send(db, 'game:move', payload, auth),
    ]);
    expect(results.filter((r) => r.ack.ok)).toHaveLength(1);
  });
});

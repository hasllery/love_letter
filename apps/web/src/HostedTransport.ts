import type { Ack, RoomView } from '@court/shared';
interface Reply {
  ack: Ack;
  view?: RoomView;
  removed?: boolean;
  cursor?: { round: number; index: number };
  privateEvents?: string[];
}
// Same event vocabulary as the local Socket.IO server; hosted rooms use authenticated HTTP polling.
export class HostedTransport {
  connected = false;
  private running = false;
  private generation = 0;
  private handlers = new Map<string, ((value?: unknown) => void)[]>();
  private cursor = { round: 0, index: 0 };
  private queue: Promise<unknown> = Promise.resolve();
  private timer?: ReturnType<typeof setTimeout>;
  on(event: string, callback: (value?: unknown) => void) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), callback]);
    return this;
  }
  private notify(event: string, value?: unknown) {
    this.handlers.get(event)?.forEach((fn) => fn(value));
  }
  connect() {
    if (this.running) return this;
    this.running = true;
    const generation = ++this.generation;
    void fetch('/health')
      .then((r) => {
        if (!r.ok) throw new Error();
        if (!this.running || generation !== this.generation) return;
        this.connected = true;
        this.notify('connect');
        this.poll();
      })
      .catch(() => {
        this.notify('connect_error');
        this.timer = setTimeout(() => {
          this.running = false;
          this.connect();
        }, 2000);
      });
    return this;
  }
  disconnect() {
    this.running = false;
    this.generation++;
    this.connected = false;
    clearTimeout(this.timer);
    this.notify('disconnect');
    return this;
  }
  private poll() {
    if (!this.running) return;
    this.timer = setTimeout(() => {
      if (!this.running) return;
      if (!this.connected && !localStorage.getItem('court-seat')) {
        this.running = false;
        this.connect();
        return;
      }
      if (localStorage.getItem('court-seat'))
        this.emit('poll', {}, () => this.poll());
      else this.poll();
    }, 800);
  }
  emit(event: string, payload: unknown, callback: (ack: Ack) => void) {
    this.queue = this.queue
      .catch(() => undefined)
      .then(async () => {
        try {
          const auth = JSON.parse(
            localStorage.getItem('court-seat') ?? 'null',
          ) as unknown;
          const response = await fetch('/api/court', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event,
              payload,
              credentials: auth,
              cursor: this.cursor,
            }),
            signal: AbortSignal.timeout(8000),
          });
          if (!response.ok)
            throw new Error('The court is temporarily unavailable.');
          const body = (await response.json()) as Reply;
          if (!this.running) return;
          if (!this.connected) {
            this.connected = true;
            this.notify('connect');
          }
          if (body.cursor) this.cursor = body.cursor;
          if (body.view) this.notify('room:view', body.view);
          for (const message of body.privateEvents ?? [])
            this.notify('game:private', { message });
          if (body.removed)
            this.notify('room:removed', {
              message: body.ack.ok ? 'You left the court.' : body.ack.error,
            });
          callback(body.ack);
        } catch {
          this.connected = false;
          this.notify('disconnect');
          callback({
            ok: false,
            error: 'Connection interrupted. Reconnecting…',
          });
        }
      });
    return this;
  }
}

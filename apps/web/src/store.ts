import { create } from 'zustand';
import { HostedTransport } from './HostedTransport';
import { io, type Socket } from 'socket.io-client';
import type { Ack, ClientEvents, RoomView, ServerEvents } from '@court/shared';
type Credentials = { code: string; playerId: string; secret: string };
function saved(): Credentials | null {
  try {
    return JSON.parse(
      localStorage.getItem('court-seat') ?? 'null',
    ) as Credentials | null;
  } catch {
    return null;
  }
}
function isCloudDomain(): boolean {
  if (typeof location === 'undefined') return false;
  const host = location.hostname;
  return (
    host.endsWith('.pages.dev') ||
    host.endsWith('.vercel.app') ||
    host.endsWith('.workers.dev') ||
    host.includes('vercel.app') ||
    host.includes('vercel.sh')
  );
}

const useHosted =
  import.meta.env.VITE_HOSTED === 'true' ||
  (isCloudDomain() && !import.meta.env.VITE_SERVER_URL);

export const socket: Socket<ServerEvents, ClientEvents> = useHosted
  ? (new HostedTransport() as unknown as Socket<ServerEvents, ClientEvents>)
  : io(import.meta.env.VITE_SERVER_URL || undefined, { autoConnect: false });
interface Store {
  room: RoomView | null;
  connected: boolean;
  error: string | null;
  reveals: string[];
  muted: boolean;
  motionBusy: boolean;
  setError: (s: string | null) => void;
  dismissReveal: () => void;
  toggleMute: () => void;
}
export const useCourt = create<Store>((set) => ({
  room: null,
  motionBusy: false,
  connected: false,
  error: null,
  reveals: [],
  muted: localStorage.getItem('court-muted') !== 'false',
  setError: (error) => set({ error }),
  dismissReveal: () => set((s) => ({ reveals: s.reveals.slice(1) })),
  toggleMute: () =>
    set((s) => {
      localStorage.setItem('court-muted', String(!s.muted));
      return { muted: !s.muted };
    }),
}));
let previousRevision: number | undefined;
let audio: AudioContext | null = null;
export function unlockAudio() {
  audio ??= new AudioContext();
  void audio.resume();
}
function chime() {
  if (useCourt.getState().muted || !audio) return;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(440, audio.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(
    660,
    audio.currentTime + 0.12,
  );
  gain.gain.setValueAtTime(0.05, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.22);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start();
  oscillator.stop(audio.currentTime + 0.23);
}
socket.on('connect', () => {
  useCourt.setState({ connected: true, error: null });
  const seat = saved();
  if (seat)
    socket.emit('room:resume', seat, (result) => {
      if (!result.ok) {
        localStorage.removeItem('court-seat');
        useCourt.setState({ room: null, error: result.error });
      }
    });
});
socket.on('disconnect', () => useCourt.setState({ connected: false }));
socket.on('connect_error', () =>
  useCourt.setState({
    connected: false,
    error: 'The court server is unavailable. Reconnecting…',
  }),
);
socket.on('room:view', (room) => {
  if (room.game?.revision !== previousRevision) {
    previousRevision = room.game?.revision;
    chime();
  }
  useCourt.setState({ room });
});
socket.on('game:private', (event) =>
  useCourt.setState((s) => ({ reveals: [...s.reveals, event.message] })),
);
socket.on('room:removed', (event) => {
  localStorage.removeItem('court-seat');
  useCourt.setState({ room: null, reveals: [], error: event.message });
});
type Event = keyof ClientEvents;
export function send<K extends Event>(
  event: K,
  payload: Parameters<ClientEvents[K]>[0],
): Promise<Ack> {
  return new Promise((resolve) => {
    if (!socket.connected) {
      const result: Ack = {
        ok: false,
        error: 'Reconnect to the court before continuing.',
      };
      useCourt.setState({ error: result.error });
      resolve(result);
      return;
    }
    const timer = setTimeout(() => {
      useCourt.setState({
        error: 'No response yet. Please check your connection.',
      });
      resolve({ ok: false, error: 'Request timed out.' });
    }, 8000);
    const emit = socket.emit.bind(socket) as (
      event: Event,
      payload: unknown,
      ack: (result: Ack) => void,
    ) => void;
    emit(event, payload, (result) => {
      clearTimeout(timer);
      if (!result.ok) useCourt.setState({ error: result.error });
      else if (result.secret && result.playerId && result.code)
        localStorage.setItem(
          'court-seat',
          JSON.stringify({
            code: result.code,
            playerId: result.playerId,
            secret: result.secret,
          }),
        );
      resolve(result);
    });
  });
}

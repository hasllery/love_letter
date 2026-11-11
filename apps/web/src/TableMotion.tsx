import { useEffect, useRef, useState, type RefObject } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { GameView } from '@court/shared';
import { CardFace, CardBack } from './Card';
import { planFlights, type CardFlight } from './motionPlan';

type PositionedFlight = CardFlight & {
  start: { x: number; y: number };
  end: { x: number; y: number };
  width: number;
  height: number;
};
export function TableMotion({
  game,
  you,
  arena,
  onBusy,
  onArrive,
  onReveal,
  onPlayLanded,
}: {
  game: GameView;
  you: string;
  arena: RefObject<HTMLDivElement | null>;
  onBusy: (busy: boolean) => void;
  onArrive: (round: number, id: string) => void;
  onReveal: (round: number, id: string) => void;
  onPlayLanded: (round: number, id: string) => void;
}) {
  const previous = useRef<GameView | null>(null);
  const lastPlan = useRef<CardFlight[]>([]);
  const previousRects = useRef<Map<string, DOMRect>>(new Map());
  const [flights, setFlights] = useState<PositionedFlight[]>([]);
  const reduced = useReducedMotion();
  useEffect(() => {
    const old = previous.current;
    previous.current = game;
    const root = arena.current;
    if (!root) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, seconds: number) =>
      timers.push(setTimeout(fn, seconds * 1000));
    const revealAll = () => {
      for (const c of game.hand) {
        onArrive(game.round, c.id);
        onReveal(game.round, c.id);
      }
      if (game.lastPlay) onPlayLanded(game.round, game.lastPlay.card.id);
    };
    const planned =
      old?.revision === game.revision && old.round === game.round
        ? lastPlan.current
        : planFlights(old, game, you);
    lastPlan.current = planned;
    const bounds = root.getBoundingClientRect();
    const currentRects = new Map<string, DOMRect>();
    root
      .querySelectorAll<HTMLElement>('[data-motion-anchor]')
      .forEach((e) =>
        currentRects.set(e.dataset.motionAnchor!, e.getBoundingClientRect()),
      );
    const oldRects = previousRects.current;
    previousRects.current = currentRects;
    if (reduced || !planned.length) {
      setFlights([]);
      revealAll();
      onBusy(false);
      return;
    }
    const point = (
      name: string,
      width: number,
      height: number,
      old = false,
    ) => {
      const rect =
        (old ? oldRects.get(name) : undefined) ??
        currentRects.get(name) ??
        bounds;
      return {
        x: rect.left - bounds.left + rect.width / 2 - width / 2,
        y: rect.top - bounds.top + rect.height / 2 - height / 2,
      };
    };
    setFlights(
      planned.map((f) => {
        const personalArrival =
          !!f.card &&
          (f.kind === 'draw' || f.kind === 'deal') &&
          f.to === `hand:${you}`;
        const target = personalArrival ? `card:${f.card!.id}` : f.to;
        const rect = currentRects.get(target);
        const large = personalArrival || f.kind === 'play';
        const width = large ? Math.min(rect?.width ?? 110, 155) : 60;
        const height = width * 1.4;
        const source =
          f.kind === 'play' && f.card && f.from === `hand:${you}`
            ? `card:${f.card.id}`
            : f.from;
        return {
          ...f,
          width,
          height,
          start: point(source, width, height, true),
          end: point(target, width, height),
        };
      }),
    );
    onBusy(true);
    const end = Math.max(...planned.map((f) => f.delay + f.duration));
    const scheduled = new Set<string>();
    for (const f of planned) {
      const arrival = f.delay + f.duration;
      if (
        f.card &&
        (f.kind === 'draw' || f.kind === 'deal') &&
        f.to === `hand:${you}`
      ) {
        const id = f.card.id;
        scheduled.add(id);
        later(() => onArrive(game.round, id), arrival);
        later(() => onReveal(game.round, id), arrival + 0.16);
      }
      if (f.kind === 'play' && f.card) {
        const id = f.card.id;
        later(() => onPlayLanded(game.round, id), arrival);
      }
    }
    // Exchanges also land face down, then reveal only the recipient's new hand.
    for (const c of game.hand)
      if (!scheduled.has(c.id)) {
        later(() => onArrive(game.round, c.id), end);
        later(() => onReveal(game.round, c.id), end + 0.16);
      }
    later(() => {
      setFlights([]);
      onBusy(false);
    }, end + 0.8);
    return () => {
      timers.forEach(clearTimeout);
      setFlights([]);
      onBusy(false);
    };
  }, [
    game.round,
    game.revision,
    you,
    reduced,
    arena,
    onBusy,
    onArrive,
    onReveal,
    onPlayLanded,
  ]);
  return (
    <div
      className="flight-layer"
      aria-hidden="true"
      data-testid="flight-layer"
      data-active={flights.length > 0}
    >
      {flights.map((f) => {
        const travelBack = ['draw', 'deal', 'return', 'swap'].includes(f.kind);
        return (
          <motion.div
            key={f.id}
            className={`flying-card flight-${f.kind}`}
            data-flight-kind={f.kind}
            data-flight-face={travelBack ? 'back' : 'public'}
            style={{ width: f.width, height: f.height }}
            initial={{
              x: f.start.x,
              y: f.start.y,
              opacity: 0,
              scale: 0.7,
              rotate: -7,
            }}
            animate={{
              x: [f.start.x, (f.start.x + f.end.x) / 2, f.end.x],
              y: [f.start.y, Math.min(f.start.y, f.end.y) - 40, f.end.y],
              opacity: [0, 1, 1, 0],
              scale: [0.7, 1.04, 1],
              rotate: [-7, f.kind === 'swap' ? 18 : 5, 0],
            }}
            transition={{
              duration: f.duration,
              delay: f.delay,
              times: [0, 0.45, 1],
              ease: [0.22, 0.7, 0.25, 1],
              opacity: {
                duration: f.duration,
                delay: f.delay,
                times: [0, 0.08, 0.98, 1],
              },
            }}
          >
            <motion.div
              className="flight-flipper"
              initial={{ rotateY: !travelBack && f.flip ? 180 : 0 }}
              animate={{ rotateY: 0 }}
              transition={{ duration: 0.4, delay: f.delay + 0.2 }}
            >
              <div className="flight-face">
                {!travelBack && f.card ? (
                  <CardFace card={f.card} />
                ) : (
                  <CardBack />
                )}
              </div>
              <div className="flight-reverse">
                <CardBack />
              </div>
            </motion.div>
          </motion.div>
        );
      })}
    </div>
  );
}

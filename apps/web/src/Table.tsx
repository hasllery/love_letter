import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  CARDS,
  type Card as CardData,
  type GameView,
  type Move,
  type PublicPlayer,
  type RoomView,
} from '@court/shared';
import { Card, CardFace } from './Card';
import { Modal } from './Modal';
import { TableMotion } from './TableMotion';
import { ReferenceCard } from './ReferenceCard';
import { send, useCourt } from './store';

function Tracker({ game }: { game: GameView }) {
  const [open, setOpen] = useState(false);
  const rows = CARDS.map((c) => {
    const out = [
      ...game.setAside,
      ...game.players.flatMap((p) => p.discards),
    ].filter((x) => x.rank === c.value).length;
    const mine = game.hand.filter((x) => x.rank === c.value).length;
    return { ...c, out, mine, left: c.count - out - mine };
  });
  return (
    <section className={`card-tracker glass-panel ${open ? 'expanded' : ''}`}>
      <button
        className="panel-toggle"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <strong>CARD TRACKER</strong>
        <span>
          {rows.reduce((n, r) => n + r.left, 0)} unseen{' '}
          <i>{open ? '⌃' : '⌄'}</i>
        </span>
      </button>
      {open && (
        <div className="tracker-content">
          {rows.map((c) => (
            <div className="tracker-row" key={c.value}>
              <b>{c.value}</b>
              <span>{c.name}</span>
              <div className="pips">
                {Array.from({ length: c.count }, (_, i) => (
                  <i
                    key={i}
                    className={
                      i < c.out ? 'out' : i < c.out + c.mine ? 'mine' : 'unseen'
                    }
                  />
                ))}
              </div>
              <strong>{c.left}</strong>
            </div>
          ))}
          <div className="tracker-legend">
            <span>
              <i className="out" />
              Public
            </span>
            <span>
              <i className="mine" />
              Yours
            </span>
            <span>
              <i className="unseen" />
              Unseen
            </span>
          </div>
          <p>Unseen includes opponents’ hands and the hidden reserve.</p>
        </div>
      )}
    </section>
  );
}
function Scores({ game, you }: { game: GameView; you: string }) {
  const [open, setOpen] = useState(
    () => window.innerWidth > 760 && game.players.length <= 4,
  );
  const rounds = Array.from(
    { length: Math.min(3, game.round) },
    (_, i) => Math.max(1, game.round - 2) + i,
  );
  return (
    <section className="point-table glass-panel">
      <button
        className="panel-toggle"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <strong>POINT TABLE</strong>
        <span>
          Round {game.round} <i>{open ? '⌃' : '⌄'}</i>
        </span>
      </button>
      {open && (
        <>
          <table>
            <thead>
              <tr>
                <th>Player</th>
                {rounds.map((r) => (
                  <th key={r}>
                    <span className={r === game.round ? 'current-round' : ''}>
                      R{r}
                    </span>
                  </th>
                ))}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {game.players.map((p) => (
                <tr className={p.id === you ? 'my-score' : ''} key={p.id}>
                  <th>{p.name}</th>
                  {rounds.map((r) => (
                    <td key={r}>{game.scoreHistory[p.id]?.[r - 1] ?? '—'}</td>
                  ))}
                  <td>
                    <strong>{p.tokens}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            First to <b>{game.tokenTarget} tokens</b> claims the crown.
          </p>
        </>
      )}
    </section>
  );
}
function Discards({ player }: { player: PublicPlayer }) {
  const latest = player.discards.slice(-6);
  const placedScore = player.discards.reduce((sum, c) => sum + c.rank, 0);
  return (
    <div
      className="played-tray"
      data-motion-anchor={`tray:${player.id}`}
      aria-label={`${player.name} placed cards, score ${placedScore}`}
    >
      <div className="tray-score-badge" title={`Placed deck score: ${placedScore}`}>
        <span className="tray-score-lbl">Placed</span>
        <b className="tray-score-num">Σ {placedScore}</b>
      </div>
      {Array.from({ length: 6 }, (_, i) => (
        <div
          className="tray-slot"
          key={`slot${i}`}
          style={{ left: 5 + i * 25 }}
        />
      ))}
      {latest.map((c, i) => (
        <motion.div
          key={c.id}
          initial={{ opacity: 0, scale: 0.6, y: -15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="mini-card"
          style={{
            left: 5 + i * 25,
            zIndex: i + 1,
            borderTopColor: CARDS[c.rank].color,
          }}
          title={`${CARDS[c.rank].name} (${c.rank})`}
        >
          <CardFace card={c} />
          <b>{c.rank}</b>
        </motion.div>
      ))}
      {player.discards.length > 6 && (
        <span className="tray-overflow">+{player.discards.length - 6}</span>
      )}
    </div>
  );
}
function Plate({
  player,
  active,
  you,
  targetable,
  chosen,
  onTarget,
}: {
  player: PublicPlayer;
  active: boolean;
  you: boolean;
  targetable?: boolean;
  chosen?: boolean;
  onTarget?: () => void;
}) {
  return (
    <button
      type="button"
      className={`player-plate ${active ? 'active' : ''} ${player.protected ? 'shielded' : ''} ${!player.alive ? 'eliminated' : ''} ${targetable ? 'targetable' : ''} ${chosen ? 'target-chosen' : ''}`}
      disabled={!targetable}
      onClick={onTarget}
      aria-label={
        targetable
          ? `Target ${player.name}`
          : `${player.name}, ${player.tokens} tokens${player.protected ? ', protected' : ''}`
      }
    >
      <div className="player-avatar">{player.name[0]?.toUpperCase()}</div>
      <div className="plate-copy">
        <strong>
          {player.name}
          {you && <small> YOU</small>}
        </strong>
        <div>
          <span className="coin">✦</span>
          <b>{player.tokens}</b>
          {!player.connected ? (
            <span className="status-pill away">AWAY</span>
          ) : !player.alive ? (
            <span className="status-pill out">OUT</span>
          ) : player.protected ? (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="status-pill protected"
            >
              ⛨ PROTECTED
            </motion.span>
          ) : active ? (
            <span className="status-pill turn">
              {you ? 'YOUR TURN' : 'THINKING'}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}
function positions(count: number): string[] {
  return count === 1
    ? ['north']
    : count === 2
      ? ['northwest', 'northeast']
      : count === 3
        ? ['west', 'north', 'east']
        : count === 4
          ? ['west', 'northwest', 'northeast', 'east']
          : ['west', 'northwest', 'north', 'northeast', 'east'];
}
export function Table({ room }: { room: RoomView }) {
  const game = room.game!;
  const arena = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [selected, setSelected] = useState<string | null>(null);
  const [target, setTarget] = useState('');
  const [guess, setGuess] = useState('');
  const [keep, setKeep] = useState('');
  const [bottom, setBottom] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const [dismissedTimeout, setDismissedTimeout] = useState<number | null>(null);
  const [leave, setLeave] = useState(false);
  const [resultsClosed, setResultsClosed] = useState(false);
  const [log, setLog] = useState(false);
  const [copied, setCopied] = useState(false);
  const [arrived, setArrived] = useState<{ round: number; ids: string[] }>({
    round: 0,
    ids: [],
  });
  const [revealed, setRevealed] = useState<{ round: number; ids: string[] }>({
    round: 0,
    ids: [],
  });
  const [landedPlay, setLandedPlay] = useState('');
  const onArrive = useCallback(
    (round: number, id: string) =>
      setArrived((old) =>
        old.round === round
          ? old.ids.includes(id)
            ? old
            : { round, ids: [...old.ids, id] }
          : { round, ids: [id] },
      ),
    [],
  );
  const onReveal = useCallback(
    (round: number, id: string) =>
      setRevealed((old) =>
        old.round === round
          ? old.ids.includes(id)
            ? old
            : { round, ids: [...old.ids, id] }
          : { round, ids: [id] },
      ),
    [],
  );
  const onPlayLanded = useCallback(
    (round: number, id: string) => setLandedPlay(`${round}-${id}`),
    [],
  );
  const setBusy = useCallback((busy: boolean) => {
    setAnimating(busy);
    useCourt.setState({ motionBusy: busy });
  }, []);
  const myTurn =
    game.currentPlayerId === room.you &&
    ['draw', 'turn', 'chancellor'].includes(game.phase);
  const me = game.players.find((p) => p.id === room.you)!;
  const actor = game.players.find((p) => p.id === game.currentPlayerId)!;
  const end = game.phase === 'roundEnd' || game.phase === 'gameOver';
  const seatIndex = game.players.findIndex((p) => p.id === room.you);
  const others = [
    ...game.players.slice(seatIndex + 1),
    ...game.players.slice(0, seatIndex),
  ];
  const slots = positions(others.length);
  useEffect(() => {
    const currentIds = new Set(game.hand.map((c) => c.id));
    setArrived((old) =>
      old.round === game.round
        ? { ...old, ids: old.ids.filter((id) => currentIds.has(id)) }
        : old,
    );
    setRevealed((old) =>
      old.round === game.round
        ? { ...old, ids: old.ids.filter((id) => currentIds.has(id)) }
        : old,
    );
    setSelected(null);
    setTarget('');
    setGuess('');
    setKeep('');
    setBottom([]);
    setSubmitting(false);
    setResultsClosed(false);
  }, [game.revision]);
  useEffect(() => {
    setClock(Date.now());
    if (!room.deadline) return;
    const interval = setInterval(() => setClock(Date.now()), 100);
    return () => clearInterval(interval);
  }, [room.deadline]);
  const options = game.legalMoves.filter(
    (m): m is Extract<Move, { kind: 'play' }> =>
      m.kind === 'play' && m.cardId === selected,
  );
  const targets = [
    ...new Set(options.flatMap((m) => (m.targetId ? [m.targetId] : []))),
  ];
  const needsGuess = options.some((m) => m.guess !== undefined);
  const chosen = options.find(
    (m) =>
      (!m.targetId || m.targetId === target) &&
      (!needsGuess || String(m.guess) === guess),
  );
  async function move(m: Move) {
    setSubmitting(true);
    await send('game:move', { move: m, revision: game.revision });
    setSubmitting(false);
  }
  const busy = animating || submitting;
  const secondsLeft = room.deadline
    ? Math.max(0, Math.ceil((room.deadline - clock) / 1000))
    : 20;
  const timedTurn = myTurn && !!room.deadline;
  const showTimeout =
    room.lastTimeout?.playerId === room.you &&
    room.lastTimeout.revision !== dismissedTimeout;

  const selectedCard = game.hand.find((c) => c.id === selected);
  const keptCard = game.hand.find((c) => c.id === keep);
  const resultIds =
    game.phase === 'gameOver' ? game.gameWinners : game.roundWinners;
  const choose = (c: CardData) => {
    if (game.phase === 'chancellor') {
      setKeep(c.id);
      setBottom(game.hand.filter((x) => x.id !== c.id).map((x) => x.id));
    } else {
      setSelected(c.id);
      setTarget('');
      setGuess('');
    }
  };
  return (
    <main className="game-screen">
      <div
        ref={arena}
        className={`arena seats-${game.players.length} ${myTurn ? 'is-your-turn' : ''} ${animating ? 'is-animating' : ''} ${timedTurn ? 'timed-turn' : ''} ${timedTurn && secondsLeft <= 5 ? 'timer-urgent' : ''}`}
        style={
          { '--time-left': `${(secondsLeft / 20) * 100}%` } as CSSProperties
        }
        data-testid="game-table"
      >
        <div className="arena-burst" />
        {timedTurn && <div className="turn-glow" aria-hidden="true" />}
        <Tracker game={game} />
        <Scores game={game} you={room.you} />
        <div className="table-top-center-buttons">
          <button
            className="top-court-btn exit-court-btn"
            onClick={() => setLeave(true)}
            aria-label="Leave court"
          >
            ↪ Exit Court
          </button>
          <button
            className="top-court-btn activity-btn"
            onClick={() => setLog(true)}
            aria-label="Court activity"
          >
            ☷ Activity
          </button>
          <button
            className="top-court-btn invite-btn"
            onClick={() => {
              const url = new URL(location.href);
              url.searchParams.set('room', room.code);
              void navigator.clipboard
                .writeText(url.toString())
                .then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                })
                .catch(() =>
                  useCourt.getState().setError(`Share room code ${room.code}`),
                );
            }}
            aria-label="Invite friends"
          >
            {copied ? 'Copied ✓' : '↗ Invite'}
          </button>
        </div>
        <div className="direction-ring" aria-hidden="true">
          <svg viewBox="0 0 300 300">
            <circle cx="150" cy="150" r="130" />
            <path d="m247 58-15 4 12 12Zm-194 184 15-4-12-12Z" />
          </svg>
        </div>
        {others.map((p, i) => (
          <div
            className={`opponent-seat seat-${slots[i]} ${!p.alive ? 'seat-out' : ''}`}
            key={p.id}
            data-player-id={p.id}
          >
            <Plate
              player={p}
              active={p.id === game.currentPlayerId && !end}
              you={false}
              targetable={targets.includes(p.id) && !busy}
              chosen={target === p.id}
              onTarget={() => setTarget(p.id)}
            />
            <div
              className="opponent-hand"
              data-motion-anchor={`hand:${p.id}`}
              aria-label={`${p.name}: ${p.handCount} hidden cards`}
            >
              <AnimatePresence>
                {Array.from({ length: p.handCount }, (_, j) => (
                  <div
                    className="opponent-card-slot"
                    key={j}
                    style={
                      { '--offset': j - (p.handCount - 1) / 2 } as CSSProperties
                    }
                  >
                    <Card back small reveal={false} />
                  </div>
                ))}
              </AnimatePresence>
              {!p.alive && <span className="out-mark">✕</span>}
            </div>
            <Discards player={p} />
            {p.protected && (
              <div className="protection-aura" aria-hidden="true" />
            )}
          </div>
        ))}
        <div
          className={`arena-banner ${myTurn ? 'my-turn' : ''}`}
          role="status"
        >
          <span>
            {animating
              ? 'The cards are in motion…'
              : end
                ? 'The round is complete'
                : myTurn
                  ? game.phase === 'chancellor'
                    ? 'Keep one. Return the rest.'
                    : game.phase === 'draw'
                      ? 'Your turn: click the deck to draw'
                      : 'Your turn: pick a card'
                  : `${actor.name} is choosing…`}
          </span>
          {room.deadline && !end && (
            <b
              className="turn-clock"
              aria-label={`${secondsLeft} seconds left`}
            >
              ◷ {secondsLeft}s
            </b>
          )}
          {end && resultsClosed && (
            <button onClick={() => setResultsClosed(false)}>
              View results →
            </button>
          )}
        </div>
        <div className="arena-deck">
          {myTurn && game.phase === 'draw' && (
            <div className="draw-prompt">
              <span>Draw your card</span>
              <b aria-hidden="true">↓</b>
            </div>
          )}
          <button
            type="button"
            className="deck-pile"
            data-motion-anchor="deck"
            aria-label="Draw a card"
            disabled={!myTurn || game.phase !== 'draw' || busy}
            onClick={() => void move({ kind: 'draw' })}
          >
            <div className="deck-shadow second" />
            <div className="deck-shadow first" />
            <Card back reveal={false} />
            <span className="deck-counter">{game.deckCount}</span>
          </button>
          <span className="pile-label">
            {myTurn && game.phase === 'draw' ? 'Click to draw' : 'Draw deck'}
          </span>
        </div>
        <div className="center-seal" aria-hidden="true">
          ✦<span>THE COURT</span>
        </div>
        <div className="last-play">
          <div
            className="last-play-card"
            data-motion-anchor="center"
            data-awaiting-play={
              !!game.lastPlay &&
              !reduced &&
              landedPlay !== `${game.round}-${game.lastPlay.card.id}`
            }
          >
            {game.lastPlay ? (
              <Card
                key={`${game.round}-${game.lastPlay.card.id}`}
                card={game.lastPlay.card}
                reveal={false}
              />
            ) : (
              <div className="empty-play">
                ✦
                <span>
                  The intrigue
                  <br />
                  begins here
                </span>
              </div>
            )}
          </div>
          <span className="pile-label">
            {game.lastPlay ? 'Last played' : 'Play a card'}
          </span>
        </div>
        <div className="reserve-cards">
          <span>RESERVE</span>
          <i title="Hidden reserve">?</i>
          {game.setAside.map((c) => (
            <i key={c.id} title={CARDS[c.rank].name}>
              {c.rank}
            </i>
          ))}
        </div>
        <div className="self-seat">
          <Plate
            player={me}
            active={myTurn}
            you
            targetable={targets.includes(me.id) && !busy}
            chosen={target === me.id}
            onTarget={() => setTarget(me.id)}
          />
          <Discards player={me} />
        </div>
        <div
          className={`hand-zone ${me.protected ? 'protected-hand' : ''}`}
          data-motion-anchor={`hand:${me.id}`}
        >
          <div className="hand-label">
            {me.alive
              ? game.phase === 'chancellor' && myTurn
                ? 'CHANCELLOR’S CHOICE'
                : 'YOUR HAND'
              : 'OUT THIS ROUND'}
          </div>
          <div className="hand-fan">
            <AnimatePresence>
              {game.hand.map((c, i) => (
                <div
                  className="hand-slot"
                  data-motion-anchor={`card:${c.id}`}
                  key={`${game.round}-${c.id}`}
                  style={
                    {
                      '--fan-angle': `${(i - (game.hand.length - 1) / 2) * 12}deg`,
                      '--fan-index': i,
                    } as CSSProperties
                  }
                >
                  <Card
                    card={c}
                    reveal={false}
                    waiting={
                      !reduced &&
                      (arrived.round !== game.round ||
                        !arrived.ids.includes(c.id))
                    }
                    concealed={
                      !reduced &&
                      (revealed.round !== game.round ||
                        !revealed.ids.includes(c.id))
                    }
                    selected={
                      game.phase === 'chancellor'
                        ? keep === c.id
                        : selected === c.id
                    }
                    disabled={
                      !myTurn ||
                      busy ||
                      (game.phase !== 'chancellor' &&
                        !game.legalMoves.some(
                          (m) => m.kind === 'play' && m.cardId === c.id,
                        ))
                    }
                    onClick={() => choose(c)}
                  />
                </div>
              ))}
            </AnimatePresence>
          </div>
          {!me.alive && (
            <div className="eliminated-hand">
              <span>✧</span>
              <h2>Your secret is out.</h2>
              <p>You return next round.</p>
            </div>
          )}
        </div>
        <div className={`action-dock ${selected || keep ? 'has-choice' : ''}`}>
          {myTurn && game.phase === 'turn' && selectedCard ? (
            <>
              <div className="action-instruction">
                PLAYING <strong>{CARDS[selectedCard.rank].name}</strong>
              </div>
              {targets.length > 0 && (
                <label>
                  Target
                  <select
                    aria-label="Target"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                  >
                    <option value="">Choose a player</option>
                    {targets.map((id) => (
                      <option value={id} key={id}>
                        {game.players.find((p) => p.id === id)!.name}
                        {id === room.you ? ' (yourself)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {needsGuess && (
                <label>
                  Your guess
                  <select
                    aria-label="Your guess"
                    value={guess}
                    onChange={(e) => setGuess(e.target.value)}
                  >
                    <option value="">Name their card</option>
                    {CARDS.filter((c) => c.value !== 1).map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.value} · {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                className="gold-button"
                disabled={!chosen || busy}
                onClick={() => chosen && void move(chosen)}
              >
                Play {CARDS[selectedCard.rank].name} <span>➜</span>
              </button>
            </>
          ) : myTurn && game.phase === 'chancellor' && keptCard ? (
            <>
              <div className="action-instruction">
                BOTTOM OF DECK <small>First returned → first drawn</small>
              </div>
              <ol className="return-order">
                {bottom.map((id, i) => (
                  <li key={id}>
                    <span>
                      {i + 1}.{' '}
                      {CARDS[game.hand.find((c) => c.id === id)!.rank].name}
                    </span>
                    {bottom.length > 1 && (
                      <button
                        aria-label={`Move ${CARDS[game.hand.find((c) => c.id === id)!.rank].name} ${i === 0 ? 'later' : 'earlier'}`}
                        onClick={() => setBottom([...bottom].reverse())}
                      >
                        {i === 0 ? '↓' : '↑'}
                      </button>
                    )}
                  </li>
                ))}
              </ol>
              <button
                className="gold-button"
                disabled={busy}
                onClick={() =>
                  void move({ kind: 'choose', keepId: keep, bottomIds: bottom })
                }
              >
                Keep {CARDS[keptCard.rank].name} ➜
              </button>
            </>
          ) : (
            <div className="idle-action">
              {end ? (
                <button
                  className="gold-button"
                  onClick={() => setResultsClosed(false)}
                >
                  Round results ✦
                </button>
              ) : myTurn ? (
                <>
                  <span>✦</span>
                  <p>
                    {busy
                      ? 'Dealing your next move…'
                      : game.phase === 'draw'
                        ? 'Click the deck to draw your card.'
                        : 'Select a card to begin.'}
                  </p>
                </>
              ) : (
                <p>Every hand hides a story.</p>
              )}
            </div>
          )}
        </div>
        <TableMotion
          game={game}
          you={room.you}
          arena={arena}
          onBusy={setBusy}
          onArrive={onArrive}
          onReveal={onReveal}
          onPlayLanded={onPlayLanded}
        />
        {end && !resultsClosed && !animating && (
          <Modal
            title={
              game.phase === 'gameOver'
                ? 'The crown is claimed'
                : 'A secret well kept'
            }
            onClose={() => setResultsClosed(true)}
          >
            <div className="victory-burst" aria-hidden="true">
              {!reduced &&
                Array.from({ length: 12 }, (_, i) => (
                  <i
                    key={i}
                    style={
                      {
                        '--spark-angle': `${i * 30}deg`,
                        '--spark-delay': `${i * 0.04}s`,
                      } as CSSProperties
                    }
                  />
                ))}
              <span>♛</span>
            </div>
            <h3>
              {resultIds
                .map((id) => game.players.find((p) => p.id === id)?.name ?? id)
                .join(' & ')}
            </h3>
            <p className="result-copy">
              {game.phase === 'gameOver'
                ? 'The court is yours. Shall we play again?'
                : 'A secret protected. A token earned.'}
            </p>
            <p className="result-reason">
              {game.deckCount === 0
                ? '🏆 Card Score Champion: The deck was exhausted. The winner is decided by the sum of card score of the placed deck!'
                : '⚔️ Last Man Standing: All rivals were defeated. The last player standing wins!'}
            </p>
            <p className="result-rule">
              {game.deckCount === 0
                ? 'When the card deck is over, the winner is announced by the sum of card score of the placed deck. Hand rank breaks ties.'
                : 'When a player defeats all opponents, the last man standing claims victory.'}
            </p>
            <div className="round-leaderboard">
              <div className="leaderboard-table-header">
                <span className="col-rank">Rank & Player</span>
                <span className="col-placed">Placed Deck Score</span>
                <span className="col-hand">Hand Card</span>
                <span className="col-total">Total Score</span>
                <span className="col-tokens">Tokens</span>
              </div>
              {(() => {
                const sorted = [...game.results].sort((a, b) => {
                  if (a.winnerCoins !== b.winnerCoins) return b.winnerCoins - a.winnerCoins;
                  if (a.survived !== b.survived) return (b.survived ? 1 : 0) - (a.survived ? 1 : 0);
                  if (a.discardTotal !== b.discardTotal) return b.discardTotal - a.discardTotal;
                  if (a.cardTotal !== b.cardTotal) return b.cardTotal - a.cardTotal;
                  return b.totalCoins - a.totalCoins;
                });
                const rankBadges = ['🥇 1st', '🥈 2nd', '🥉 3rd', '4th', '5th', '6th'];
                return sorted.map((r, idx) => {
                  const p = game.players.find((pl) => pl.id === r.playerId);
                  const isWinner = r.winnerCoins > 0;
                  const isMe = r.playerId === room.you;
                  return (
                    <section
                      className={`leaderboard-card ${isWinner ? 'round-winner' : ''} ${!r.survived ? 'is-eliminated' : ''}`}
                      key={r.playerId}
                    >
                      <div className="card-primary-col">
                        <span className={`rank-chip ${idx === 0 ? 'rank-gold' : ''}`}>
                          {rankBadges[idx] ?? `${idx + 1}th`}
                        </span>
                        <div className="player-meta">
                          <strong className="name-text">
                            {p?.name ?? 'Player'} {isMe && <small className="you-pill">YOU</small>}
                          </strong>
                          <span className={`status-pill ${isWinner ? 'win' : r.survived ? 'alive' : 'out'}`}>
                            {isWinner ? '👑 Winner' : r.survived ? '⚔️ Survived' : '💀 Defeated'}
                          </span>
                        </div>
                      </div>

                      <div className="card-score-col">
                        <span className="metric-label">Placed Deck Score</span>
                        <div className="placed-score-pill">
                          <span className="deck-sigma">Σ</span>
                          <strong>{r.discardTotal}</strong>
                          <small>pts</small>
                        </div>
                        {r.discards && r.discards.length > 0 && (
                          <div className="placed-cards-preview" title="Cards placed in deck">
                            {r.discards.map((c) => (
                              <span
                                key={c.id}
                                className="mini-chip"
                                style={{ borderColor: CARDS[c.rank].color }}
                                title={`${CARDS[c.rank].name} (${c.rank})`}
                              >
                                {c.rank}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="card-hand-col">
                        <span className="metric-label">Hand Card</span>
                        {r.hand.length > 0 ? (
                          <div className="hand-card-display">
                            <b>{r.hand[0]!.rank}</b>
                            <span>{CARDS[r.hand[0]!.rank].name}</span>
                          </div>
                        ) : (
                          <span className="no-hand-text">Eliminated</span>
                        )}
                      </div>

                      <div className="card-total-col">
                        <span className="metric-label">Total Score</span>
                        <strong className="card-total-value">{r.cardTotal} pts</strong>
                      </div>

                      <div className="card-tokens-col">
                        <span className="metric-label">Tokens</span>
                        <div className="tokens-stack">
                          {r.earnedCoins > 0 ? (
                            <span className="round-coin-award">+{r.earnedCoins} 🟡</span>
                          ) : (
                            <span className="zero-coin">+0</span>
                          )}
                          <strong className="total-coins-score">★ {r.totalCoins}</strong>
                        </div>
                      </div>
                    </section>
                  );
                });
              })()}
            </div>
            {room.hostId === room.you ? (
              <button
                className="gold-button full"
                onClick={() =>
                  void send(
                    game.phase === 'gameOver' ? 'game:start' : 'game:next',
                    {},
                  )
                }
              >
                {game.phase === 'gameOver' ? 'Play again' : 'Begin next round'}{' '}
                →
              </button>
            ) : (
              <p className="muted">Waiting for the host to continue…</p>
            )}
            <button
              className="text-button"
              onClick={() => void send('room:leave', {})}
            >
              Leave the court
            </button>
          </Modal>
        )}
        {showTimeout && !animating && (
          <Modal
            title="Time’s up"
            onClose={() => setDismissedTimeout(room.lastTimeout!.revision)}
          >
            <div className="timeout-symbol">◷</div>
            <p>
              Your 20 seconds are over. A legal{' '}
              {game.phase === 'chancellor' ? 'choice' : 'move'} was completed
              automatically so the game can continue.
            </p>
            <button
              className="gold-button full"
              onClick={() => setDismissedTimeout(room.lastTimeout!.revision)}
            >
              Back to the table
            </button>
          </Modal>
        )}
        {leave && (
          <Modal title="Leave this court?" onClose={() => setLeave(false)}>
            <p>
              Your seat stays in the current match.{' '}
              {room.turnSeconds
                ? 'The clock can play your held cards, but your next draw will wait for you to return.'
                : 'Without a timer, the game will wait on your turns.'}
            </p>
            <button
              className="gold-button"
              onClick={() => void send('room:leave', {})}
            >
              Leave court
            </button>
          </Modal>
        )}
        {log && (
          <Modal title="Whispers at court" onClose={() => setLog(false)}>
            <ol className="court-log" aria-label="Game activity">
              {game.events
                .slice()
                .reverse()
                .map((message, i) => (
                  <li key={i}>
                    <span>✦</span>
                    {message}
                  </li>
                ))}
            </ol>
          </Modal>
        )}
      </div>
      <ReferenceCard />
    </main>
  );
}

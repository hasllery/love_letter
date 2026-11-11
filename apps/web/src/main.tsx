import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import { CARDS, CONFIG, type RoomView } from '@court/shared';
import { Card, Illustration } from './Card';
import { send, socket, unlockAudio, useCourt } from './store';
import { Table } from './Table';
import { Modal } from './Modal';
import './style.css';
import './court.css';
import './artwork.css';
import './improvements.css';
import { preloadCardArt } from './cardAssets';

function Rules({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="The rules of court" onClose={onClose}>
      <p>
        Draw a card, play a card, keep your secret. Survive with the highest
        hand to earn a token. If hands tie, the higher discard total wins; a
        further tie shares the token.
      </p>
      <p>
        Win with 6 tokens for 2 players, 5 for 3, 4 for 4. The lone surviving
        Spy user earns an extra token.
      </p>
      <div className="rules-list">
        {CARDS.map((c) => (
          <div key={c.value}>
            <b>{c.value}</b>
            <section>
              <strong>
                {c.name} <small>×{c.count}</small>
              </strong>
              <p>{c.text}</p>
            </section>
          </div>
        ))}
      </div>
      <p className="muted">
        The deck has 21 cards. Exactly one is hidden before each round; every
        player receives one opening card. Click the deck for every later draw.
        Protection lasts until your next turn. Prince may target yourself and
        uses the hidden card if the deck is empty. A round finishes after the
        final effect when the deck is empty, or only one player remains.
      </p>
    </Modal>
  );
}
function Home() {
  const [name, setName] = useState(localStorage.getItem('court-name') || '');
  const [code, setCode] = useState(
    new URLSearchParams(location.search).get('room')?.toUpperCase() || '',
  );
  const [mode, setMode] = useState<'create' | 'join'>(code ? 'join' : 'create');
  const timer = CONFIG.turnSeconds;
  const [previous, setPrevious] = useState(true);
  const [busy, setBusy] = useState(false);
  const connected = useCourt((s) => s.connected);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    localStorage.setItem('court-name', name);
    try {
      if (mode === 'create')
        await send('room:create', {
          name,
          turnSeconds: timer,
          previousWinnerStarts: previous,
        });
      else await send('room:join', { name, code });
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="home">
      <section className="hero-copy">
        <div className="eyebrow">
          <span /> THE COURT IS IN SESSION
        </div>
        <h1>
          A little charm.
          <br />A dangerous
          <br />
          <em>secret.</em>
        </h1>
        <p className="hero-description">
          Behind every gracious smile, a hidden ambition.
          <br className="desktop" /> Outwit your friends. Protect your hand. Win
          the court.
        </p>
        <div className="game-facts">
          <span>
            ♙ <b>2–4</b> players
          </span>
          <span>
            ◷ <b>15</b> minutes
          </span>
          <span>✦ No accounts</span>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-orbit" />
          <div className="art-card art-left">
            <Card card={{ id: 'hero-4', rank: 4 }} />
          </div>
          <div className="art-card art-middle">
            <Card card={{ id: 'hero-8', rank: 8 }} />
          </div>
          <div className="art-card art-right">
            <Card card={{ id: 'hero-1', rank: 1 }} />
          </div>
          <span className="art-caption">
            TEN ROLES. TWENTY-ONE CARDS. ONE CROWN.
          </span>
        </div>
      </section>
      <section className="entry-panel">
        <div className="panel-crest">♜</div>
        <h2>Your seat awaits</h2>
        <p className="muted">Gather your people. Let the intrigue begin.</p>
        <div className="tabs" role="tablist" aria-label="Room action">
          <button
            role="tab"
            aria-selected={mode === 'create'}
            onClick={() => setMode('create')}
          >
            Create a court
          </button>
          <button
            role="tab"
            aria-selected={mode === 'join'}
            onClick={() => setMode('join')}
          >
            Join friends
          </button>
        </div>
        <form onSubmit={(e) => void submit(e)}>
          <label htmlFor="name">YOUR DISPLAY NAME</label>
          <input
            id="name"
            placeholder="How shall we address you?"
            autoComplete="nickname"
            maxLength={24}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          {mode === 'join' ? (
            <>
              <label htmlFor="room-code">FOUR-LETTER COURT CODE</label>
              <input
                id="room-code"
                className="code-input"
                placeholder="ABCD"
                maxLength={4}
                minLength={4}
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))
                }
                required
              />
            </>
          ) : (
            <details className="settings">
              <summary>
                Court settings <span>Optional</span>
              </summary>
              <p className="clock-setting">
                20 seconds per play · starts after you draw.
              </p>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={previous}
                  onChange={(e) => setPrevious(e.target.checked)}
                />{' '}
                Round winner opens the next round
              </label>
            </details>
          )}
          <button className="primary full" disabled={busy || !connected}>
            {busy
              ? 'Preparing your seat…'
              : mode === 'create'
                ? 'Open your court'
                : 'Enter the court'}{' '}
            <span>→</span>
          </button>
        </form>
        <div className="entry-note">
          {mode === 'create'
            ? 'A private room. A simple code. Just your friends.'
            : 'Your host will share a four-letter court code.'}
        </div>
        <div className="panel-bottom">
          <span>✧</span> Easy to learn. Delightfully hard to trust.
        </div>
      </section>
      <div className="home-bottom">
        <span>
          01 <strong>Draw a secret</strong>
        </span>
        <span>
          02 <strong>Make your move</strong>
        </span>
        <span>
          03 <strong>Claim the crown</strong>
        </span>
      </div>
    </main>
  );
}
function Share({ room }: { room: RoomView }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="secondary"
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
            useCourt.getState().setError(`Share this code: ${room.code}`),
          );
      }}
    >
      {copied ? 'Link copied ✓' : 'Copy invite link ↗'}
    </button>
  );
}
function Lobby({ room }: { room: RoomView }) {
  return (
    <main className="lobby">
      <div className="eyebrow">YOUR PRIVATE COURT</div>
      <h1>
        The company
        <br />
        <em>makes the game.</em>
      </h1>
      <p className="muted">
        Invite up to three friends using your room code or invite link.
      </p>
      <section className="lobby-box">
        <div className="invite">
          <span className="eyebrow">COURT CODE</span>
          <strong data-testid="room-code">{room.code}</strong>
          <Share room={room} />
        </div>
        <div className="seats">
          <div className="section-label">
            THE GUEST LIST{' '}
            <span>
              {room.players.length} / {CONFIG.maxPlayers}
            </span>
          </div>
          {room.players.length === CONFIG.maxPlayers && (
            <p role="status" className="muted">
              Room full · all four seats are taken.
            </p>
          )}
          {room.players.map((p, i) => (
            <div className="guest" key={p.id}>
              <span className="avatar">{p.name[0]?.toUpperCase()}</span>
              <strong>
                {p.name}
                {p.id === room.you ? ' (you)' : ''}
              </strong>
              <small>
                {p.id === room.hostId ? 'Host' : `Seat ${i + 1}`}
                {!p.connected ? ' · away' : ''}
              </small>
              {room.you === room.hostId && p.id !== room.you && (
                <button
                  className="text-button"
                  onClick={() => void send('room:kick', { playerId: p.id })}
                  aria-label={`Remove ${p.name}`}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          {Array.from(
            { length: Math.max(0, CONFIG.maxPlayers - room.players.length) },
            (_, i) => (
              <div key={i} className="guest empty">
                Open seat · share the invite link to add a player
              </div>
            ),
          )}
          <p className="muted small-text">
            {room.turnSeconds
              ? `${room.turnSeconds}s per move · starts after drawing · expired plays resolve automatically`
              : 'No turn timer · play at your own pace'}
            <br />
            {room.previousWinnerStarts
              ? 'Round winner starts next'
              : 'Starting seat rotates each round'}
          </p>
          <button
            className="primary full"
            disabled={room.you !== room.hostId || room.players.length < 2}
            onClick={() => void send('game:start', {})}
          >
            {room.you !== room.hostId
              ? 'Waiting for the host'
              : room.players.length < 2
                ? 'Waiting for one more guest'
                : 'Begin the game →'}
          </button>
        </div>
      </section>
      <button
        className="text-button"
        onClick={() => void send('room:leave', {})}
      >
        Leave this court
      </button>
    </main>
  );
}
function App() {
  const {
    room,
    connected,
    error,
    reveals,
    muted,
    motionBusy,
    setError,
    dismissReveal,
    toggleMute,
  } = useCourt();
  const [rules, setRules] = useState(false);
  useEffect(() => {
    document.title = CONFIG.title;
    preloadCardArt();
    socket.connect();
    return () => {
      socket.disconnect();
    };
  }, []);
  return (
    <MotionConfig reducedMotion="user">
      <div className={`app-shell ${room?.game ? 'in-game' : 'in-welcome'}`}>
        <header>
          <a
            className="brand"
            href={import.meta.env.BASE_URL}
            onClick={(e) => {
              if (room) e.preventDefault();
            }}
          >
            <span>♜</span>
            <div>
              {CONFIG.title}
              <small>SECRETS & SUCCESSION</small>
            </div>
          </a>
          <nav>
            {room && <span className="room-badge">ROOM {room.code}</span>}
            <span className={`connection ${connected ? 'online' : ''}`}>
              {connected ? 'The court is open' : 'Connecting…'}
            </span>
            <button
              className="text-button"
              onClick={() => {
                unlockAudio();
                toggleMute();
              }}
              aria-label={muted ? 'Enable sound' : 'Mute sound'}
            >
              {muted ? '♪ Sound off' : '♫ Sound on'}
            </button>
            <button className="rules-button" onClick={() => setRules(true)}>
              How to play <span>↗</span>
            </button>
          </nav>
        </header>
        {room ? (
          room.game ? (
            <Table room={room} />
          ) : (
            <Lobby room={room} />
          )
        ) : (
          <Home />
        )}
        <footer>
          <span>♜ {CONFIG.title}</span>
          <p>A little strategy. A little suspicion. A lovely evening.</p>
          <span>MADE FOR GOOD COMPANY</span>
        </footer>
        {error && (
          <div role="alert" className="toast">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        )}
        {rules && <Rules onClose={() => setRules(false)} />}{' '}
        {!!reveals.length && !motionBusy && (
          <Modal title="For your eyes only" onClose={dismissReveal}>
            <div className="private-icon private-flip">
              <Illustration rank={2} />
            </div>
            <p className="private-message">{reveals[0]}</p>
            <button className="primary full" onClick={dismissReveal}>
              Keep the secret
            </button>
          </Modal>
        )}
      </div>
    </MotionConfig>
  );
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

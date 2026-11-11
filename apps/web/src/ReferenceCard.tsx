import { useState } from 'react';
import { CARDS } from '@court/shared';
import { referenceImage } from './cardAssets';
import { Modal } from './Modal';

export function ReferenceCard() {
  const [expanded, setExpanded] = useState(false);
  return (
    <aside className="reference-rail" aria-label="Player reference card">
      <div className="reference-heading">
        <span>YOUR REFERENCE</span>
        <small>All 10 roles · always beside you</small>
      </div>
      <button
        className="reference-thumb"
        onClick={() => setExpanded(true)}
        aria-label="Enlarge reference card"
      >
        <span className="supplied-artwork reference-artwork">
          <img
            src={referenceImage}
            alt="Card reference showing all ten roles and their abilities"
            draggable={false}
          />
        </span>
        <span className="reference-expand">⤢ Read full size</span>
      </button>
      <p className="reference-help">
        Keep this beside your hand. Tap any time for a closer look.
      </p>
      {expanded && (
        <Modal title="Your card reference" onClose={() => setExpanded(false)}>
          <div className="reference-full supplied-artwork">
            <img
              src={referenceImage}
              alt="Full-size card reference"
              draggable={false}
            />
          </div>
          <details className="reference-accessible">
            <summary>Read abilities as text</summary>
            {[...CARDS].reverse().map((c) => (
              <p key={c.value}>
                <strong>
                  {c.value} · {c.name} ×{c.count}
                </strong>{' '}
                — {c.text}
              </p>
            ))}
          </details>
        </Modal>
      )}
    </aside>
  );
}

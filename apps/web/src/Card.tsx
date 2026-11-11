import { motion, useReducedMotion } from 'framer-motion';
import { CARDS, CONFIG, type Card as CardData, type Rank } from '@court/shared';
import { cardImage } from './cardAssets';

export function Illustration({ rank }: { rank: Rank; light?: boolean }) {
  return (
    <div className="supplied-artwork">
      <img src={cardImage(rank)} alt={CARDS[rank].name} draggable={false} />
    </div>
  );
}
export function CardBack() {
  return (
    <div className="card-back ornate-back">
      <div className="back-frame">
        <span className="back-corner tl">❦</span>
        <span className="back-corner tr">❦</span>
        <span className="back-corner bl">❦</span>
        <span className="back-corner br">❦</span>
        <div className="back-medallion">
          <span>✉</span>
          <i>✦</i>
        </div>
        <small>{CONFIG.title}</small>
      </div>
    </div>
  );
}
export function CardFace({ card }: { card: CardData }) {
  return (
    <div className="card-front supplied-artwork" data-artwork-rank={card.rank}>
      <img
        src={cardImage(card.rank)}
        alt={`${CARDS[card.rank].name}, ${card.rank}. ${CARDS[card.rank].text}`}
        draggable={false}
      />
    </div>
  );
}
export function Card({
  card,
  back = false,
  selected = false,
  onClick,
  disabled = false,
  small = false,
  reveal = true,
  concealed = false,
  waiting = false,
}: {
  card?: CardData;
  back?: boolean;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  small?: boolean;
  reveal?: boolean;
  concealed?: boolean;
  waiting?: boolean;
}) {
  const reduced = useReducedMotion();
  const faceDown = back || !card;
  const rotate = concealed && !reduced ? 180 : 0;
  const content = (
    <motion.div
      className="card-flipper"
      initial={!faceDown && reveal && !reduced ? { rotateY: 180 } : false}
      animate={{ rotateY: rotate }}
      transition={{ duration: reduced ? 0 : 0.58, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <div className="card-visible-face">
        {faceDown ? <CardBack /> : <CardFace card={card} />}
      </div>
      {!faceDown && (
        <div className="card-hidden-face">
          <CardBack />
        </div>
      )}
    </motion.div>
  );
  return (
    <motion.div
      layout={!reduced}
      data-card-id={card?.id}
      data-face={faceDown || concealed ? 'back' : 'front'}
      data-arriving={waiting && !reduced}
      initial={{ opacity: 0 }}
      animate={{ opacity: waiting && !reduced ? 0 : 1, y: selected ? -22 : 0 }}
      exit={{ opacity: 0, scale: reduced ? 1 : 0.8 }}
      transition={{ duration: reduced ? 0 : 0.15 }}
      className={`card ${small ? 'small' : ''} ${faceDown ? 'back' : ''} ${selected ? 'selected' : ''} ${onClick && !disabled ? 'playable' : ''}`}
    >
      {onClick ? (
        <button
          className="card-button"
          onClick={onClick}
          disabled={disabled}
          aria-pressed={selected}
          aria-label={`${card ? CARDS[card.rank].name : 'Hidden card'}, value ${card?.rank}`}
        >
          {content}
        </button>
      ) : (
        content
      )}
    </motion.div>
  );
}

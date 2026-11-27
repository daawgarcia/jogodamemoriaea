import { useState } from 'react';
import cards from '../shared/cards.json';

export function ProductImage({ face }: { face: number }) {
  const [failed, setFailed] = useState(false);
  const card = cards[face];
  if (!card || failed) return <span className="photo-error" role="alert">Não foi possível carregar a foto. Chame a equipe.</span>;
  return <span className="product-photo">
    <img src={`./cards/${card.image}`} alt={card.label} draggable={false} onError={() => setFailed(true)} />
  </span>;
}

import { useState } from 'react';
import cards from '../shared/cards.json';

export function ProductImage({ face }: { face: number }) {
  const [failed, setFailed] = useState(false);
  const card = cards[face];
  if (!card || failed) return <div className="photo-error" role="alert">Não foi possível carregar a foto. Chame a equipe.</div>;
  return <div className="product-photo">
    <img src={`./cards/${card.image}`} alt={card.label} draggable={false} onError={() => setFailed(true)} />
  </div>;
}

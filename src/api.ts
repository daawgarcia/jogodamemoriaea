import type { Actions, Game, Lead, PublicInfo } from './types';
import cards from '../shared/cards.json';

export const isDemo = !window.ea && new URLSearchParams(location.search).get('demo') === '1';

let demoGame: Game | null = null;
const demoBoard = [0, 3, 1, 2, 3, 0, 2, 1];
let demoFlipped: number[] = [];
const demoMatched = new Set<number>();

function demoView(): Game {
  if (!demoGame) throw new Error('Partida de demonstração não iniciada.');
  if (demoGame.mismatchUntil && Date.now() >= demoGame.mismatchUntil) demoFlipped = [];
  return {
    ...demoGame,
    cards: demoBoard.map((face, index) => ({ index, face: demoFlipped.includes(index) || demoMatched.has(index) ? face : null, matched: demoMatched.has(index) }))
  };
}

function preview(action: keyof Actions, input: unknown): unknown {
  if (action === 'info') return { configured: true, available: 30, privacyContact: 'Equipe Esthetic Aligner no estande', game: demoGame?.status === 'active' ? demoView() : null } satisfies PublicInfo;
  if (action === 'start') {
    const lead = input as Lead;
    if (!lead.name || !lead.email || !lead.whatsapp || !lead.city || !lead.acknowledged || (!lead.student && !lead.cro)) throw new Error('Preencha os campos para testar a demonstração.');
    demoFlipped = []; demoMatched.clear();
    demoGame = { id: 'preview', status: 'active', moves: 0, pairs: 0, totalPairs: cards.length, cards: [], mismatchUntil: 0, prize: null };
    return demoView();
  }
  if (action === 'game') return demoView();
  if (action === 'flip') {
    if (!demoGame) throw new Error('Partida não iniciada.');
    const { index } = input as Actions['flip']['input'];
    if (Date.now() < demoGame.mismatchUntil || demoMatched.has(index) || demoFlipped.includes(index)) return demoView();
    if (demoGame.mismatchUntil) { demoFlipped = []; demoGame.mismatchUntil = 0; }
    demoFlipped.push(index);
    if (demoFlipped.length === 2) {
      demoGame.moves++;
      if (demoBoard[demoFlipped[0]] === demoBoard[demoFlipped[1]]) { demoFlipped.forEach(i => demoMatched.add(i)); demoFlipped = []; }
      else demoGame.mismatchUntil = Date.now() + 1100;
    }
    demoGame.pairs = demoMatched.size / 2;
    if (demoGame.pairs === cards.length) { demoGame.status = 'won'; demoGame.prize = 'Brinde de demonstração'; }
    return demoView();
  }
  throw new Error('O painel administrativo e o banco estão disponíveis no aplicativo Windows. Esta tela é apenas uma demonstração visual.');
}

export async function call<K extends keyof Actions>(action: K, input: Actions[K]['input']): Promise<Actions[K]['output']> {
  if (window.ea) {
    const response = await window.ea.call(action, input);
    if (!response.ok) throw new Error(response.error);
    return response.data;
  }
  if (isDemo) return preview(action, input) as Actions[K]['output'];
  throw new Error('Abra o Jogo da Memória EA pelo aplicativo Windows. O navegador não tem acesso ao banco local.');
}

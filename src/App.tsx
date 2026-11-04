import { useEffect, useRef, useState } from 'react';
import { call, isDemo } from './api';
import { Admin } from './Admin';
import { CardIcon } from './icons';
import { ProductImage } from './ProductImage';
import cards from '../shared/cards.json';
import { Field, useKeyboard } from './keyboard';
import { playMusic, setMusicVolume, stopMusic } from './music';
import type { Game, Lead, PublicInfo } from './types';

const emptyLead: Lead = { name: '', email: '', whatsapp: '', city: '', student: false, cro: '', acknowledged: false, marketing: false };
const faceNames = cards.map(card => card.label);

export default function App() {
  const [info, setInfo] = useState<PublicInfo | null>(null);
  const [screen, setScreen] = useState<'welcome' | 'register' | 'game' | 'admin'>('welcome');
  const [game, setGame] = useState<Game | null>(null);
  const [lead, setLead] = useState<Lead>(emptyLead);
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [music, setMusic] = useState(false);
  const [volume, setVolume] = useState(0.55);
  const [help, setHelp] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [resultCountdown, setResultCountdown] = useState(60);
  const { setActive } = useKeyboard();
  const adminTaps = useRef({ count: 0, at: 0 });
  const errorRef = useRef<HTMLDivElement>(null);

  async function reload() {
    const state = await call('info', undefined);
    setInfo(state);
    setGame(state.game);
    setScreen(state.game ? 'game' : 'welcome');
    return state;
  }

  useEffect(() => { reload().catch(error => setError(error.message)); }, []);
  useEffect(() => {
    if (screen !== 'register') return;
    let lastActivity = Date.now();
    const activity = () => { lastActivity = Date.now(); };
    document.addEventListener('pointerdown', activity);
    document.addEventListener('keydown', activity);
    const timeout = setInterval(() => {
      if (Date.now() - lastActivity > 120000 && !busyRef.current) {
        setLead(emptyLead); setStep(1); setActive(null); setPrivacy(false); setScreen('welcome');
      }
    }, 5000);
    return () => {
      clearInterval(timeout);
      document.removeEventListener('pointerdown', activity);
      document.removeEventListener('keydown', activity);
    };
  }, [screen]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => {
    if (game?.status !== 'active' || !game.mismatchUntil) return;
    const timeout = setTimeout(() => {
      call('game', { id: game.id }).then(setGame).catch(error => setError(error.message));
    }, Math.max(0, game.mismatchUntil - Date.now()) + 50);
    return () => clearTimeout(timeout);
  }, [game]);

  useEffect(() => {
    if (game?.status !== 'won' || screen !== 'game') return;
    setResultCountdown(60);
    const interval = setInterval(() => setResultCountdown(value => Math.max(0, value - 1)), 1000);
    return () => clearInterval(interval);
  }, [game?.status, screen]);

  useEffect(() => {
    if (game?.status === 'won' && resultCountdown === 0 && screen === 'game') void nextParticipant();
  }, [resultCountdown]);

  async function nextParticipant() {
    setActive(null); setLead(emptyLead); setStep(1); setHelp(false);
    try { await reload(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Não foi possível abrir o próximo cadastro.'); }
  }

  function field<K extends keyof Lead>(key: K, value: Lead[K]) { setLead(previous => ({ ...previous, [key]: value })); }

  async function begin() {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setActive(null); setError('');
    try {
      const next = await call('start', lead);
      setLead(emptyLead); setGame(next); setScreen('game');
      if (!music) {
        try { await playMusic(volume); setMusic(true); }
        catch (error) { setError(error instanceof Error ? error.message : 'Não foi possível iniciar o som.'); }
      }
    } catch (error) { setError(error instanceof Error ? error.message : 'Não foi possível salvar seu cadastro.'); }
    finally { setBusy(false); busyRef.current = false; }
  }

  async function flip(index: number) {
    if (!game || busyRef.current) return;
    busyRef.current = true;
    try { setGame(await call('flip', { id: game.id, index })); }
    catch (error) { setError(error instanceof Error ? error.message : 'Não foi possível virar a peça.'); }
    finally { busyRef.current = false; }
  }

  async function toggleMusic() {
    try {
      if (music) { stopMusic(); setMusic(false); }
      else { await playMusic(volume); setMusic(true); }
    } catch (error) { setError(error instanceof Error ? error.message : 'Falha ao reproduzir áudio.'); }
  }

  function adminAccess() {
    const now = Date.now();
    const taps = adminTaps.current;
    taps.count = now - taps.at < 1800 ? taps.count + 1 : 1;
    taps.at = now;
    if (taps.count >= 5) { setActive(null); setScreen('admin'); taps.count = 0; }
  }

  return <>
    {isDemo && <div className="demo-banner">DEMONSTRAÇÃO VISUAL · Não salva leads nem distribui brindes reais</div>}
    <header className="brand-header">
      <button className="brand" onClick={adminAccess} aria-label="Esthetic Aligner. Cinco toques abrem o acesso da equipe."><img src="./logo-esthetic-aligner.png" alt="Esthetic Aligner" /></button>
      <div className="live-tag"><span /> EXPERIÊNCIA EA</div>
    </header>
    <main className={`main-content screen-${screen}`}>
      {!info && !error && <div className="panel"><h1>Preparando sorrisos…</h1></div>}
      {info && screen === 'welcome' && <section className="welcome">
        <div className="event-pill">ENCONTRE OS PARES. CONQUISTE SEU BRINDE.</div>
        <p className="eyebrow">UMA CONEXÃO QUE VAI ALÉM DO SORRISO</p>
        <h1>Jogo da<br /><span>Memória EA<span className="title-dot">.</span></span></h1>
        <p className="hero-description">Um desafio para sua memória.<br />Uma surpresa para você levar.</p>
        <div className="hero-cards" aria-hidden="true"><div className="hero-card back">EA<span>ESTHETIC ALIGNER</span></div><div className="hero-card front"><ProductImage face={0} /><span>CONEXÕES QUE SORRIEM</span></div><div className="hero-card back">EA<span>ESTHETIC ALIGNER</span></div></div>
        <div className="how-it-works"><div><b>01</b><span>Preencha<br />seus dados</span></div><div><b>02</b><span>Encontre<br />os {cards.length} pares</span></div><div><b>03</b><span>Retire seu<br />brinde na equipe</span></div></div>
        <button className="primary start-button" disabled={!info.configured || info.available === 0} onClick={() => { setScreen('register'); setStep(1); setLead(emptyLead); }}>Toque para jogar <span>↗</span></button>
        {!info.configured && <button className="secondary" onClick={() => setScreen('admin')}>Equipe: configurar aplicativo</button>}
        {info.configured && info.available === 0 && <p className="stock-notice">Os brindes estão esgotados. Consulte a equipe do estande.</p>}
        <p className="welcome-note">Participação gratuita · Um brinde por pessoa · Enquanto durar o estoque</p>
      </section>}
      {info && screen === 'register' && <section className="registration">
        <div className="section-heading"><div><p className="eyebrow">ANTES DA DIVERSÃO</p><h1>Vamos nos conhecer?</h1></div><span className="step-count">0{step}<span> / 02</span></span></div>
        <div className="step-progress"><span className="filled" /><span className={step === 2 ? 'filled' : ''} /></div>
        <p className="muted">Preencha seus dados para liberar o jogo.</p>
        <form className="panel registration-form" onSubmit={event => { event.preventDefault(); setActive(null); if (step === 1) setStep(2); else void begin(); }}>
          {step === 1 ? <>
            <Field label="Nome completo" value={lead.name} onChange={value => field('name', value)} placeholder="Como podemos chamar você?" required autoComplete="name" />
            <Field label="E-mail" type="email" value={lead.email} onChange={value => field('email', value)} placeholder="voce@exemplo.com" required autoComplete="email" />
            <Field label="WhatsApp com DDD" type="tel" value={lead.whatsapp} onChange={value => field('whatsapp', value)} placeholder="(11) 99999-9999" required autoComplete="tel" />
          </> : <>
            <Field label="Cidade e UF" value={lead.city} onChange={value => field('city', value)} placeholder="Ex.: São Paulo / SP" required />
            <fieldset className="professional"><legend>Você é:</legend>
              <button type="button" className={!lead.student ? 'selected' : ''} aria-pressed={!lead.student} onClick={() => { setActive(null); field('student', false); }}>Cirurgião-dentista</button>
              <button type="button" className={lead.student ? 'selected' : ''} aria-pressed={lead.student} onClick={() => { setActive(null); setLead(previous => ({ ...previous, student: true, cro: '' })); }}>Estudante</button>
            </fieldset>
            {!lead.student && <Field label="CRO e UF" value={lead.cro} onChange={value => field('cro', value)} placeholder="Ex.: CRO-SP 123456" required />}
            <label className="checkbox"><input type="checkbox" checked={lead.acknowledged} required onChange={event => field('acknowledged', event.target.checked)} /><span>Li o aviso de privacidade e estou ciente do uso dos dados para registrar a participação e a entrega do brinde. *</span></label>
            <label className="checkbox"><input type="checkbox" checked={lead.marketing} onChange={event => field('marketing', event.target.checked)} /><span>Quero receber novidades e contato da Esthetic Aligner por e-mail e WhatsApp. <small>Opcional. Não interfere na participação.</small></span></label>
            <button type="button" className="privacy-link" onClick={() => { setActive(null); setPrivacy(true); }}>Ler aviso de privacidade</button>
          </>}
          <div className="data-notice"><span>ⓘ</span><p><strong>Seus dados precisam ser reais.</strong><br />Eles serão usados para identificar sua participação e registrar a entrega do brinde.</p></div>
          <button className="primary" disabled={busy}>{busy ? 'Salvando seu cadastro…' : step === 1 ? 'Continuar →' : 'Salvar e liberar meu jogo →'}</button>
          <button type="button" className="text-button" onClick={() => { setActive(null); if (step === 2) setStep(1); else { setLead(emptyLead); setScreen('welcome'); } }}>← Voltar</button>
        </form>
      </section>}
      {screen === 'game' && game && (game.status === 'won' ? <section className="result">
        <div className="confetti" aria-hidden="true">{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ left: `${(i * 17) % 100}%`, animationDelay: `${(i % 5) * 0.3}s`, rotate: `${i * 29}deg` }} />)}</div>
        <p className="eyebrow">{game.totalPairs} PARES. UM SORRISO A MAIS.</p><div className="winner-icon"><CardIcon face={3} /></div>
        <h1>Deu match.<br /><span>Você ganhou!</span></h1><p>Memória afiada merece uma surpresa.</p>
        <div className="prize-reveal"><span>SEU BRINDE É</span><h2>{game.prize}</h2><div className="prize-code">CÓDIGO {game.id.slice(0, 8).toUpperCase()}</div></div>
        <p>Mostre esta tela para a equipe<br />e retire seu brinde aqui no estande.</p>
        <button className="primary" onClick={() => void nextParticipant()}>Próximo participante →</button><small>Esta tela volta ao início em {resultCountdown}s. A equipe também pode consultar seu prêmio no painel.</small>
      </section> : <section className="game-screen">
        <p className="eyebrow">AGORA É COM VOCÊ</p><h1>Encontre os <span>{game.totalPairs} pares.</span></h1><p className="game-instruction">Toque em duas peças. Combine os produtos EA.</p>
        <div className="game-score"><div><strong>{game.pairs}<span>/{game.totalPairs}</span></strong><span>PARES ENCONTRADOS</span></div><div className="score-progress"><span style={{ width: `${game.pairs / game.totalPairs * 100}%` }} /></div><div><strong>{game.moves}</strong><span>JOGADAS</span></div></div>
        <div className="memory-grid" aria-label={`Tabuleiro de ${game.totalPairs} pares`} style={{ gridTemplateColumns: `repeat(${game.totalPairs <= 4 ? 2 : 3}, 1fr)`, gridTemplateRows: `repeat(${Math.ceil(game.cards.length / (game.totalPairs <= 4 ? 2 : 3))}, minmax(0, 1fr))` }}>
          {game.cards.map(card => <button type="button" key={card.index} className={`memory-card ${card.face !== null ? 'flipped' : ''} ${card.matched ? 'matched' : ''}`}
            aria-label={`Peça ${card.index + 1}${card.face !== null ? `: ${faceNames[card.face]}` : ': virar'}${card.matched ? ', par encontrado' : ''}`}
            disabled={card.matched || card.face !== null || game.mismatchUntil > Date.now()} onClick={() => void flip(card.index)}>
            <span className="card-inner"><span className="card-back"><span>EA</span><small>ESTHETIC ALIGNER</small><i>+</i></span>
              <span className="card-front">{card.face !== null && <><ProductImage face={card.face} /><small>{faceNames[card.face]}</small></>}{card.matched && <b>✓</b>}</span></span>
          </button>)}
        </div>
        <div className="game-bottom"><span>✓ Seu brinde já está reservado</span><button className="text-button" onClick={() => setHelp(true)}>Preciso de ajuda</button></div>
      </section>)}
      {screen === 'admin' && <Admin configured={info?.configured ?? true} onClose={() => void nextParticipant()} onError={setError} />}
    </main>
    <footer className="app-footer"><span>ESTHETIC ALIGNER <span className="footer-divider">/</span> CONEXÕES QUE TRANSFORMAM</span><div className="sound-controls"><button onClick={() => void toggleMusic()} aria-pressed={music}>{music ? '♫ Som ligado' : '♫ Ligar som'}</button>{music && <input aria-label="Volume da música" type="range" min="0" max="1" step="0.05" value={volume} onChange={event => { const value = Number(event.target.value); setVolume(value); setMusicVolume(value); }} />}</div></footer>
    {error && <div className="modal-backdrop"><div className="modal" role="alertdialog" aria-labelledby="error-title" tabIndex={-1} ref={errorRef}><p className="eyebrow">ATENÇÃO</p><h2 id="error-title">Vamos conferir?</h2><p>{error}</p><button className="primary" onClick={() => setError('')}>Entendi</button></div></div>}
    {privacy && <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="privacy-title"><h2 id="privacy-title">Seus dados, com transparência</h2><p>A Esthetic Aligner utiliza nome, e-mail, WhatsApp, cidade e informação profissional para identificar participantes, impedir participações repetidas e registrar a entrega dos brindes nesta ação.</p><p>O cadastro é salvo neste computador e pode ser sincronizado com o banco da ação no Render. O contato comercial por e-mail e WhatsApp só será realizado se você marcar a autorização opcional, que pode ser revogada.</p><p>Para solicitar acesso, correção, exclusão ou revogação do consentimento, procure: <strong>{info?.privacyContact}</strong>.</p><p>A equipe responsável deve informar o prazo de retenção e excluir os dados quando não forem mais necessários. Aviso: 2026-11-v1.</p><button className="primary" onClick={() => setPrivacy(false)}>Voltar ao cadastro</button></div></div>}
    {help && <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="help-title"><h2 id="help-title">A equipe pode ajudar</h2><p>Você pode jogar sem limite de tempo. Procure as fotos iguais e encontre todos os {game?.totalPairs ?? cards.length} pares.</p><p>Se precisar encerrar, chame a equipe para cancelar a partida no painel e liberar o brinde reservado.</p><button className="primary" onClick={() => setHelp(false)}>Continuar jogando</button></div></div>}
  </>;
}

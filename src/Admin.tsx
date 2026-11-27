import { useEffect, useState } from 'react';
import { call } from './api';
import { Field, useKeyboard } from './keyboard';
import type { AdminInfo } from './types';

const DEFAULT_CLOUD_URL = 'https://jogo.estheticaligner.com.br';

export function Admin({ configured, onClose, onError }: { configured: boolean; onClose: () => void; onError: (message: string) => void }) {
  const [password, setPassword] = useState('');
  const [hasSetup, setHasSetup] = useState(configured);
  const [contact, setContact] = useState('marketing@estheticaligner.com.br');
  const [token, setToken] = useState('');
  const [data, setData] = useState<AdminInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'prizes' | 'leads' | 'settings'>('prizes');
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState<{ label: string; run: () => Promise<unknown> } | null>(null);
  const { setActive } = useKeyboard();

  async function refresh(auth = token) {
    const info = await call('admin', { token: auth });
    setData(info);
    return info;
  }

  useEffect(() => {
    if (!token) return;
    const timer = setInterval(() => { refresh().catch(error => onError(error.message)); }, 15000);
    const idle = setTimeout(() => { setToken(''); setData(null); setActive(null); onError('Por segurança, entre novamente no painel.'); }, 14 * 60 * 1000);
    return () => { clearInterval(timer); clearTimeout(idle); };
  }, [token]);

  async function execute(work: () => Promise<unknown>, message = '') {
    setBusy(true); setNotice(''); setActive(null);
    try { await work(); await refresh(); if (message) setNotice(message); }
    catch (error) { onError(error instanceof Error ? error.message : 'Não foi possível concluir a operação.'); }
    finally { setBusy(false); }
  }

  async function login() {
    setBusy(true); setActive(null);
    try {
      if (!hasSetup) {
        await call('setup', { password, contact });
        setHasSetup(true);
      }
      const auth = await call('login', { password });
      setToken(auth); setPassword('');
      const info = await refresh(auth);
      setUrl(info.cloudUrl || DEFAULT_CLOUD_URL);
    } catch (error) { onError(error instanceof Error ? error.message : 'Não foi possível entrar.'); }
    finally { setBusy(false); }
  }

  function close() {
    setActive(null);
    call('logout', undefined).then(onClose).catch(error => onError(error.message));
  }

  if (!token || !data) return <section className="admin-login panel">
    <p className="eyebrow">ACESSO RESTRITO</p>
    <h1>{hasSetup ? 'Área da equipe' : 'Preparar o aplicativo'}</h1>
    <p>{hasSetup ? 'Entre para gerenciar os brindes e os cadastros.' : 'Crie a senha da equipe e informe o contato responsável pela privacidade dos participantes.'}</p>
    <form onSubmit={event => { event.preventDefault(); void login(); }}>
      {!hasSetup && <Field label="Contato de privacidade" value={contact} onChange={setContact} placeholder="E-mail ou canal oficial da Esthetic Aligner" required />}
      <Field label={hasSetup ? 'Senha administrativa' : 'Crie uma senha (mínimo 10 caracteres)'} type="password" value={password} onChange={setPassword} required />
      <button className="primary" disabled={busy}>{busy ? 'Aguarde…' : hasSetup ? 'Entrar no painel' : 'Configurar e entrar'}</button>
      <button className="text-button" type="button" onClick={() => { setActive(null); onClose(); }}>Voltar ao jogo</button>
    </form>
  </section>;

  const won = data.records.filter(record => record.status === 'won');
  return <section className="admin-panel">
    <div className="section-heading"><div><p className="eyebrow">ESTHETIC ALIGNER</p><h1>Painel da equipe</h1></div><button className="secondary small" onClick={close}>Sair</button></div>
    <div className="stats">
      <div><strong>{data.records.length}</strong><span>cadastros</span></div>
      <div><strong>{won.length}</strong><span>concluídos</span></div>
      <div><strong>{data.prizes.reduce((sum, p) => sum + p.available, 0)}</strong><span>brindes livres</span></div>
    </div>
    <nav className="tabs" aria-label="Administração">
      <button aria-pressed={tab === 'prizes'} onClick={() => { setActive(null); setTab('prizes'); }}>Brindes</button>
      <button aria-pressed={tab === 'leads'} onClick={() => { setActive(null); setTab('leads'); }}>Leads</button>
      <button aria-pressed={tab === 'settings'} onClick={() => { setActive(null); setTab('settings'); }}>Configurações</button>
    </nav>
    {notice && <p className="success" role="status">{notice}</p>}
    {confirm && <div className="confirm-box" role="alertdialog" aria-label="Confirmar operação"><p>{confirm.label}</p><div className="button-row"><button className="danger" disabled={busy} onClick={() => { const task = confirm.run; setConfirm(null); void execute(task, 'Operação concluída.'); }}>Confirmar</button><button className="secondary" onClick={() => setConfirm(null)}>Voltar</button></div></div>}
    {tab === 'prizes' && <>
      <form className="panel" onSubmit={event => { event.preventDefault(); void execute(async () => { await call('prize.add', { token, name, quantity: Number(quantity) }); setName(''); setQuantity(''); }, 'Brinde cadastrado.'); }}>
        <h2>Cadastrar brinde</h2>
        <Field label="Nome do brinde" value={name} onChange={setName} placeholder="Ex.: Kit Esthetic Aligner" required />
        <Field label="Quantidade disponível" type="number" value={quantity} onChange={setQuantity} required />
        <button className="primary" disabled={busy}>Adicionar ao estoque</button>
      </form>
      <p className="muted">O sorteio é proporcional às unidades disponíveis. Uma unidade é reservada por partida; ao cancelar uma partida incompleta, ela volta ao estoque.</p>
      {data.prizes.map(prize => <article className="list-item" key={prize.id}>
        <div><h3>{prize.name}</h3><p>{prize.available} livres · {prize.total - prize.available} reservados ou conquistados</p></div>
        <div className="button-row"><button className="secondary small" disabled={busy} onClick={() => void execute(() => call('prize.stock', { token, id: prize.id, quantity: Number(quantity) }), 'Estoque reposto.')}>Repor {Number(quantity) > 0 ? quantity : ''}</button>
          <button className="text-button" disabled={busy || prize.available === 0} onClick={() => setConfirm({ label: `Retirar do sorteio as ${prize.available} unidades livres de ${prize.name}?`, run: () => call('prize.remove', { token, id: prize.id }) })}>Retirar saldo</button></div>
      </article>)}
      <p className="muted">Para repor um item, informe a quantidade no campo acima e toque em “Repor” no brinde desejado.</p>
    </>}
    {tab === 'leads' && <>
      <div className="button-row"><button className="primary" disabled={busy} onClick={() => void execute(async () => { if (await call('export', { token })) setNotice('CSV exportado. Proteja o arquivo: ele contém dados pessoais.'); })}>Exportar CSV</button><button className="secondary" disabled={busy} onClick={() => void execute(() => call('backup', { token }))}>Salvar backup</button></div>
      {data.records.length === 0 && <p className="panel">Nenhum participante cadastrado ainda.</p>}
      {data.records.map(record => <article className="list-item lead-item" key={record.id}>
        <div><h3>{record.lead.name}</h3><p>{record.lead.email}<br />{record.lead.whatsapp} · {record.lead.city}<br />{record.lead.student ? 'Estudante' : `CRO ${record.lead.cro}`}</p>
          <p>Contato comercial: <strong>{record.lead.marketing ? 'autorizado' : 'não autorizado'}</strong></p>
          <p>{record.status === 'active' ? 'Em andamento' : record.status === 'won' ? `Conquistou: ${record.prize}` : 'Partida cancelada'}{record.delivered ? ' · Entregue ✓' : ''}</p>
          <small>{new Date(record.createdAt).toLocaleString('pt-BR')} · {record.id.slice(0, 8).toUpperCase()}</small></div>
        {record.status === 'won' && !record.delivered && <button className="secondary small" disabled={busy} onClick={() => setConfirm({ label: `Confirmar entrega de ${record.prize} para ${record.lead.name}?`, run: () => call('game.deliver', { token, id: record.id }) })}>Marcar entregue</button>}
        {record.status === 'active' && <button className="danger small" disabled={busy} onClick={() => setConfirm({ label: 'Cancelar esta partida e devolver a unidade reservada ao estoque? O cadastro será preservado.', run: () => call('game.cancel', { token, id: record.id }) })}>Cancelar partida</button>}
      </article>)}
    </>}
    {tab === 'settings' && <>
      <form className="panel" onSubmit={event => { event.preventDefault(); void execute(async () => { await call('cloud', { token, url, key }); setKey(''); }, 'Configuração salva. Confira o status abaixo.'); }}>
        <h2>Sincronização com o servidor</h2>
        <p>O aplicativo funciona mesmo sem internet. O banco deste computador é a origem do estoque; o servidor da Esthetic Aligner recebe uma cópia dos leads e resultados.</p>
        <Field label="URL HTTPS da API" value={url} onChange={setUrl} placeholder={DEFAULT_CLOUD_URL} />
        <Field label={data.cloudConfigured ? 'Nova chave (obrigatória para alterar a conexão)' : 'Chave de sincronização'} value={key} onChange={setKey} type="password" />
        <button className="primary" disabled={busy}>Salvar conexão</button>
        <p className="muted">Para desligar a sincronização, salve a URL vazia. A chave não aparece novamente no painel.</p>
      </form>
      <div className="panel"><h2>Estado dos dados</h2><p>{data.pending} registros aguardando envio.<br />Último envio: {data.lastSync ? new Date(data.lastSync).toLocaleString('pt-BR') : 'Ainda não realizado'}</p>
        {data.syncError && <p className="error-inline">{data.syncError}</p>}
        {!data.cloudConfigured && <p className="muted">Sincronização ainda não configurada. Dados salvos somente neste computador.</p>}
        <button className="secondary" disabled={busy || !data.cloudConfigured} onClick={() => void execute(() => call('sync', { token }), 'Sincronização concluída.')}>Sincronizar agora</button>
        <p className="muted">Identificador da instalação: {data.deviceId}</p></div>
      <div className="panel"><h2>Aplicativo e TV</h2><p>Configure a TV como retrato no Windows e use a resolução nativa. F11 alterna a tela cheia. A música depende do volume do computador.</p><div className="button-row">
        <button className="secondary" onClick={() => void execute(() => call('fullscreen', { token }))}>Alternar tela cheia</button>
        <button className="danger" onClick={() => setConfirm({ label: 'Fechar o aplicativo? Os cadastros e a partida em andamento permanecem salvos.', run: () => call('quit', { token }) })}>Fechar aplicativo</button>
      </div></div>
    </>}
  </section>;
}

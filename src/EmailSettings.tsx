import { useState } from 'react';
import { call } from './api';
import { Field, useKeyboard } from './keyboard';
import type { EmailConfig, EmailInfo, EmailStatus } from './types';

const statusNames: Record<EmailStatus, string> = {
  pending: 'Aguardando envio', sending: 'Enviando', sent: 'Aceito pelo SMTP',
  uncertain: 'Entrega incerta', failed: 'Requer atenção', cancelled: 'Cancelado'
};

export function EmailSettings({ token, info, busy, execute }: {
  token: string; info: EmailInfo; busy: boolean;
  execute: (work: () => Promise<unknown>, message?: string) => Promise<void>;
}) {
  const [config, setConfig] = useState<EmailConfig>(info.config);
  const [password, setPassword] = useState('');
  const [retry, setRetry] = useState<string | null>(null);
  const { setActive } = useKeyboard();
  function field<K extends keyof EmailConfig>(key: K, value: EmailConfig[K]) {
    setConfig(previous => ({ ...previous, [key]: value }));
  }
  const disabled = busy || info.sending;
  return <section className="email-settings">
    <form className="panel" onSubmit={event => {
      event.preventDefault();
      void execute(async () => {
        await call('email.configure', { ...config, password, token });
        setPassword('');
      }, 'Configuração de e-mail salva. Faça os testes antes de ativar o envio automático.');
    }}>
      <h2>E-mails automáticos · Hostinger</h2>
      <p>Um modelo para dentistas e outro para estudantes. Somente cadastros feitos a partir desta atualização, com autorização de contato, entram na fila. O envio acontece a cada 30 segundos, um destinatário por vez, com o aplicativo aberto e conectado.</p>
      <p className="muted">Servidor: smtp.hostinger.com · Porta 465 · TLS. A senha é protegida pela conta do Windows e nunca é enviada ao servidor.</p>
      <Field label="E-mail remetente Hostinger" type="email" value={config.username} onChange={value => field('username', value)} required />
      <Field label="Nome do remetente" value={config.fromName} onChange={value => field('fromName', value)} required />
      <Field label={info.passwordConfigured ? 'Nova senha da caixa (deixe vazia para manter)' : 'Senha da caixa Hostinger'} type="password" value={password} onChange={setPassword} required={!info.passwordConfigured} />
      <p>Use <strong>{'{nome}'}</strong> no texto para personalizar. A instrução para deixar de receber informações será acrescentada automaticamente.</p>
      {(['dentist', 'student'] as const).map(profile => {
        const subjectKey = profile === 'dentist' ? 'dentistSubject' : 'studentSubject';
        const bodyKey = profile === 'dentist' ? 'dentistBody' : 'studentBody';
        return <div className="email-template" key={profile}>
          <h3>{profile === 'dentist' ? 'Cirurgião-dentista' : 'Estudante'}</h3>
          <Field label={`Assunto para ${profile === 'dentist' ? 'dentista' : 'estudante'}`} value={config[subjectKey]} onChange={value => field(subjectKey, value)} required />
          <label className="field"><span>Mensagem para {profile === 'dentist' ? 'dentista' : 'estudante'}</span>
            <textarea required value={config[bodyKey]} maxLength={10000} onFocus={() => setActive(null)} onChange={event => field(bodyKey, event.target.value)} />
          </label>
        </div>;
      })}
      <label className="checkbox"><input type="checkbox" checked={config.enabled} onChange={event => field('enabled', event.target.checked)} /><span>Ativar envio automático dos e-mails pendentes e dos próximos cadastros autorizados.</span></label>
      <button className="primary" disabled={disabled}>Salvar e-mails</button>
      <p className="muted">Os testes usam a configuração salva e vão somente para a própria caixa remetente. O campo de mensagem aceita teclado físico ou o teclado do Windows.</p>
      <div className="button-row">
        <button type="button" className="secondary small" disabled={disabled || !info.passwordConfigured} onClick={() => void execute(() => call('email.test', { token, student: false }), 'Teste de dentista aceito pelo SMTP. Confira a caixa de entrada e o spam.')}>Testar dentista</button>
        <button type="button" className="secondary small" disabled={disabled || !info.passwordConfigured} onClick={() => void execute(() => call('email.test', { token, student: true }), 'Teste de estudante aceito pelo SMTP. Confira a caixa de entrada e o spam.')}>Testar estudante</button>
      </div>
    </form>
    <div className="panel">
      <h2>Fila de e-mails</h2>
      <p>{info.config.enabled ? 'Envio automático ativo' : 'Envio automático pausado'} · {info.counts.pending ?? 0} aguardando · {info.counts.sent ?? 0} aceitos pelo SMTP · {(info.counts.uncertain ?? 0) + (info.counts.failed ?? 0)} precisam de atenção.</p>
      <p className="muted">Aceito pelo SMTP não confirma leitura nem entrega na caixa de entrada. Pedidos de retirada devem ser tratados pela equipe usando “Interromper contato”. Os limites do plano da Hostinger continuam valendo.</p>
      {info.error && <p className="error-inline" role="alert">{info.error}</p>}
      {retry && <div className="confirm-box" role="alertdialog" aria-label="Confirmar nova tentativa de e-mail">
        <p>Uma entrega incerta pode já ter ocorrido. Verifique antes de liberar outra tentativa para evitar e-mail duplicado.</p>
        <div className="button-row"><button className="danger small" disabled={disabled} onClick={() => {
          const id = retry; setRetry(null);
          void execute(() => call('email.retry', { token, id }), 'E-mail liberado para outra tentativa.');
        }}>Liberar tentativa</button><button className="secondary small" onClick={() => setRetry(null)}>Voltar</button></div>
      </div>}
      {info.queue.length === 0 && <p>Nenhum e-mail na fila. Cadastros antigos não são incluídos retroativamente.</p>}
      {info.queue.map(item => <article className="list-item" key={item.id}>
        <div><h3>{item.email}</h3><p>{statusNames[item.status]} · {item.attempts} tentativa(s)</p>
          {item.lastError && <p className="error-inline">{item.lastError}</p>}
          {item.sentAt && <small>{new Date(item.sentAt).toLocaleString('pt-BR')}</small>}
        </div>
        <div className="button-row">
          {(item.status === 'failed' || item.status === 'uncertain') && <button className="secondary small" disabled={disabled} onClick={() => setRetry(item.id)}>Revisar tentativa</button>}
          <button className="text-button" disabled={disabled} onClick={() => void execute(() => call('email.suppress', { token, id: item.id }), 'Contato interrompido. Este endereço não receberá novos envios automáticos nesta instalação.')}>Interromper contato</button>
        </div>
      </article>)}
      {info.queue.length === 100 && <p className="muted">Exibindo os últimos 100 registros. Os totais acima incluem toda a fila.</p>}
    </div>
  </section>;
}

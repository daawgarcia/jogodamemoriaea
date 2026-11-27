# Jogo da Memória EA

Aplicativo Windows para uma TV vertical touchscreen da Esthetic Aligner, com
cadastro, quatro pares de fotos dos produtos, música original gerada no próprio aplicativo, brindes,
painel administrativo e sincronização opcional com o servidor da Esthetic Aligner
(https://jogo.estheticaligner.com.br).

## Modelo de funcionamento

- **Um computador é a origem dos dados e do estoque.** O jogo não depende da
  conexão com o Render para captar leads ou entregar prêmios.
- Nome, e-mail, WhatsApp, cidade/UF e CRO/UF são solicitados. Estudantes não
  precisam informar CRO.
- Os dados devem ser reais, conforme aviso no cadastro. O aplicativo valida
  formato, mas não confirma titularidade de telefone, e-mail ou registro no CRO.
- O aviso de privacidade é obrigatório; a autorização para contato comercial é
  **opcional** e não interfere no prêmio. O consentimento fica no CSV e na nuvem.
- Cada e-mail ou WhatsApp pode participar uma vez nesta instalação. Isso não
  verifica identidade civil nem impede uma pessoa de usar dados diferentes.
- Ao salvar o cadastro, o aplicativo sorteia e reserva uma unidade. A chance de
  cada brinde é proporcional à quantidade disponível naquele momento.
- Os quatro pares podem ser encontrados sem limite de tempo. O prêmio só é
  revelado ao concluir. Não existem horários secretos nem distribuição
  disfarçada: a aleatoriedade usa o gerador criptográfico do sistema.
- A equipe pode cancelar partidas incompletas: a reserva volta ao estoque e o
  cadastro é preservado. Prêmios conquistados não voltam ao estoque.
- O estado da partida é salvo após cada toque. Ao reiniciar, a partida incompleta
  é retomada. O resultado de uma partida concluída permanece no painel.
- A tela de resultado volta ao início em 60 segundos. Cadastros não enviados são
  apagados da tela após dois minutos sem interação.
- Sem estoque livre, não é possível começar uma nova partida.

## Desenvolvimento

Requer Windows 10/11 x64 e Node.js 24 LTS.

```powershell
npm ci
npm test
npm run test:desktop
npm run build
npm run desktop
```

O comando `desktop` constrói a interface e abre o aplicativo. Para inspecionar
somente a aparência em navegador:

```powershell
npm exec vite preview -- --host 127.0.0.1 --port 4173
```

Abra `http://127.0.0.1:4173/?demo=1`. Essa demonstração tem identificação visível,
dados apenas em memória e nenhum prêmio real. O painel e a persistência só
funcionam no Electron. Não use a demonstração para captar participantes.

`npm run test:desktop` abre uma instância temporária real do Electron e verifica
isolamento do preload, login/IPC, persistência, retomada, tabuleiro 2 × 4 sem
rolagem em 1080 × 1920 e vitória com reserva de estoque. Os testes da API usam
um cliente PostgreSQL simulado para confirmar transações e erros; a conexão ao
PostgreSQL real é validada pelo `/health` depois do deploy no Render.

### Fotos das peças

As quatro imagens fornecidas estão otimizadas em `public/cards`. Cada foto
aparece exatamente duas vezes no tabuleiro, que tem oito peças. A lista em
[shared/cards.json](shared/cards.json) define as imagens e legendas; o banco
gera dois exemplares de cada item e embaralha a ordem a cada partida.

As fotos mantêm a proporção original e são exibidas com `object-fit: contain`,
em molduras claras, sem recortar nem esticar os produtos. O processamento
reduz somente a resolução para no máximo 1280 pixels no lado maior e usa JPEG
com qualidade 92; os arquivos originais não são modificados.

Para gerar novamente as imagens a partir da pasta fornecida:

```powershell
.\scripts\prepare-images.ps1 -SourceDirectory "C:\caminho\JOGO DA MEMORIA"
```

## Instalador e preparação da TV

O instalador é gerado automaticamente pelo GitHub a cada atualização do `main`
(workflow **Gerar instalador Windows**). Baixe o `.exe` mais recente na página
**Releases** do repositório. Para gerar localmente:

```powershell
npm run dist:win
```

O instalador fica em `release`. Ele não é assinado digitalmente: o Windows pode
exibir um aviso de editor desconhecido. Para distribuição pública, obtenha um
certificado e configure a assinatura no electron-builder.

1. Instale no computador que será conectado à TV.
2. No Windows, selecione a resolução nativa da TV e a orientação **Retrato**.
   A interface prioriza 1080 × 1920 e se adapta a outras resoluções.
3. Configure e calibre o touchscreen no Windows, especialmente se houver
   mais de um monitor.
4. Abra pelo ícone **Jogo da Memória EA**. A versão instalada inicia em tela
   cheia. F11 alterna a tela cheia.
5. Toque em **Equipe: configurar aplicativo** no primeiro acesso. Crie uma senha
   de pelo menos dez caracteres. O contato de privacidade já vem preenchido com
   marketing@estheticaligner.com.br.
6. Cadastre nomes e quantidades dos brindes; confira o estoque físico.
7. Saia do painel e faça um teste completo. Toque cinco vezes no logotipo para
   voltar ao login administrativo. Não há senha padrão.
8. Use o teclado virtual incluído no aplicativo ou um teclado físico.

A música é uma sequência instrumental original sintetizada com Web Audio:
nenhum streaming, download ou arquivo protegido de terceiros. Começa após uma
interação e pode ser desligada. O volume final depende da TV/Windows e deve
respeitar as regras e os limites de som do congresso.

O modo tela cheia não é um bloqueio do Windows. Para impedir acesso ao sistema,
configure uma conta Windows dedicada e as políticas de quiosque apropriadas.

## Painel da equipe

- **Brindes:** cadastrar itens, repor quantidades e retirar saldo livre do sorteio.
  Para repor, preencha a quantidade no campo e toque em Repor no item.
- **Leads:** consultar cadastro e resultado, cancelar partida incompleta,
  confirmar entrega e exportar CSV com separador `;` e BOM UTF-8.
- **Backup:** salvar uma cópia completa do banco local. Não exporte o banco
  para pastas públicas: ele contém dados pessoais e a chave de sincronização.
- **Configurações:** a URL do servidor já vem preenchida; cole a chave de
  sincronização, verifique pendências,
  sincronizar, alternar tela cheia e encerrar.

O login bloqueia tentativas por um minuto depois de cinco senhas incorretas.
O painel solicita novo login periodicamente. Não compartilhe a senha com
participantes e não deixe o painel aberto no totem.

## Banco local, troca de computador e operação offline

O banco SQLite fica na pasta `userData` do Electron, normalmente:

```text
%APPDATA%\Jogo da Memória EA\ea-congresso.sqlite
```

O caminho exato depende do nome da aplicação atribuído pelo Electron. O backup
pelo painel é a maneira recomendada de obter o arquivo.

O arquivo não tem criptografia própria. Proteja a conta do Windows com senha,
ative BitLocker e restrinja acesso físico e backups. Não o coloque no Git.

Instalar o aplicativo em outro computador cria um banco, identificador e
estoque **independentes**. Para transferir uma ação:

1. Pare o atendimento no computador antigo.
2. Salve um backup e feche o aplicativo.
3. Instale e abra uma vez no novo computador; depois feche.
4. Substitua o banco da pasta `userData` pelo backup.
5. Abra e confira estoque, leads e a conexão Render.
6. **Não volte a atender no computador antigo.** Duas cópias do mesmo banco
   não podem operar simultaneamente. Não há controle multiestação nesta versão.

Cadastros, estoque, partida, imagens, teclado e música funcionam sem internet.
O envio ao Render é tentado a cada 30 segundos, com confirmação por lote,
fila persistente e reenvio idempotente. Quedas não apagam registros locais.
Alterações feitas enquanto um lote é enviado permanecem na fila.

## Servidor de sincronização (VPS Esthetic Aligner)

Em produção, a API roda na VPS da Esthetic Aligner em
https://jogo.estheticaligner.com.br, com PostgreSQL local, HTTPS e backup diário.
A chave de sincronização fica somente no servidor e no aplicativo.

### Painel de leads

https://jogo.estheticaligner.com.br/leads mostra os cadastros recebidos (somente
leitura) e permite baixar o CSV, inclusive só os que autorizaram contato. O acesso
pede usuário e senha (`LEADS_USER`, padrão `equipe`, e `LEADS_PASSWORD`, mínimo de
12 caracteres). Sem `LEADS_PASSWORD`, o painel fica desligado. Cinco senhas
erradas bloqueiam o acesso por um minuto.

### Hospedagem alternativa (Render)

O serviço na nuvem é uma API de sincronização, **não** o aplicativo do
participante nem um painel web. A administração acontece no Windows.

Publique este repositório e crie um Blueprint usando [render.yaml](render.yaml).
O arquivo provisiona somente o serviço web, em plano pago, e solicita
`DATABASE_URL` para usar o PostgreSQL que você já criou. Prefira a URL interna,
com serviço e banco na mesma região (Oregon). Ele não cria um segundo banco.
Confira os valores e planos no Render antes de confirmar.

Se criar manualmente:

- Runtime: Node; versão: 24.14.0.
- Build: `npm ci --omit=dev`.
- Start: `npm run server`.
- Health check: `/health`.
- `DATABASE_URL`: URL interna do PostgreSQL no Render.
- `CLOUD_SYNC_KEY`: segredo aleatório de 32 a 256 caracteres.
- O servidor usa `PORT` fornecida pelo Render.

No aplicativo, em Configurações, copie a URL HTTPS do serviço e o mesmo segredo.
Não coloque segredos no repositório. A primeira conexão reenvia o histórico.
Deixe a URL vazia para desativar a sincronização.

O servidor cria a tabela `ea_leads`. A chave `(device_id, id)` impede duplicação
em reenvios e a versão impede que um lote antigo sobrescreva dados novos.
Todos os dados de um lote são confirmados em uma transação PostgreSQL.
O endpoint de sincronização não oferece leitura pública de leads.

Para executar a API localmente com PostgreSQL:

```powershell
$env:DATABASE_URL = "postgresql://usuario:senha@localhost:5432/ea_memoria"
$env:CLOUD_SYNC_KEY = "uma-chave-aleatoria-com-pelo-menos-32-caracteres"
npm run server
```

As variáveis de [.env.example](.env.example) são exemplos; o servidor lê o
ambiente e não carrega arquivos `.env` automaticamente.

## Privacidade e preparação da ação

Antes do congresso, a Esthetic Aligner deve validar o regulamento e as
obrigações aplicáveis à distribuição de brindes com sua assessoria jurídica,
aprovar a base legal e o aviso de privacidade, definir prazo de retenção e
procedimentos para solicitações de titulares e registrar um contato real.
Este aplicativo não substitui essa análise.

Use para marketing somente cadastros com `marketing: true` / “Contato autorizado:
Sim”. A simples participação não autoriza mensagens comerciais.

Não há exclusão automatizada nem gestão de solicitações de titulares nesta
primeira versão. A equipe deve tratar exclusões no banco local, na fila, na
nuvem e nos backups de forma coordenada; não basta apagar um CSV. Defina esse
procedimento antes de captar dados reais. Remoções isoladas na nuvem podem ser
recriadas por reenvios do banco local.

Faça backups durante a ação e após o encerramento. Teste o processo de
transferência com dados fictícios antes de depender dele em produção.

## Why

O contrate já faz o trabalho pesado: extrai o ETP/TR, verifica cada regra contra a Lei 14.133 e os modelos da AGU e entrega os achados com severidade e fundamento. Mas ninguém conversa com isso. Quem recebe um achado GRAVE quer perguntar o que está errado, o que a norma exige de fato e como reescrever o trecho. Hoje essas perguntas vão para o NotebookLM ou para o ChatGPT: o usuário copia o documento para uma ferramenta que não conhece os achados, não cita a norma certa e fica fora da rede da FAB.

O contrate é a ferramenta nova. Se ele obriga a pessoa a sair para conversar sobre o documento, ele acrescenta um passo em vez de tirar um. O chat precisa estar onde o documento já está, e precisa servir também a quem só quer arrastar um PDF e perguntar, sem abrir processo, como no NotebookLM.

## What Changes

- **Chat do processo** (contrate, tela do processo, nos três perfis que leem o processo: Requisitante, Licitações e ACI da OM). A conversa já sabe:
  - o texto do documento enviado;
  - os achados da execução mais recente, com a triagem;
  - o parecer vigente.

  Ela também busca no corpus normativo que o α já tem: Lei 14.133, decretos, IN SEGES, modelos da AGU e RADA-e. Cada achado ganha um botão **"Perguntar sobre este achado"** que abre o chat com a pergunta pronta.
- **Chat avulso** (contrate, rota nova `/conversar`). O usuário arrasta até 5 PDF/DOCX e conversa sobre eles com o mesmo motor e o mesmo corpus, sem criar processo. É o substituto direto do NotebookLM.
- **Redação sugerida, nunca aplicada.** Quando o assunto é corrigir, o chat:
  - explica o problema;
  - cita o dispositivo;
  - devolve a redação proposta num bloco próprio, com botão de copiar e o aviso de que é sugestão.

  O documento oficial continua sendo editado fora (Word/SEI) e reenviado para verificação.
- **Citações verificáveis.** A resposta só pode citar o que entrou no contexto do turno:
  - trecho do corpus (resolvido por `GET /api/v1/chunks/:id`, como no ChatRADA);
  - trecho do próprio documento, localizado no texto por `locateEvidence`;
  - achado da execução.

  Citação que não corresponde a uma fonte do turno é descartada no servidor, nunca exibida como se existisse.
- **Resposta em streaming de texto** (SSE com eventos `delta`). A resposta aparece enquanto é gerada, como nas ferramentas que o usuário já usa. O ChatRADA só entrega a resposta pronta.
- **Conversa persistida e com dono desde a criação.** Tabelas novas `alpha.chat_thread`, `alpha.chat_message` e `alpha.chat_attachment`. Diferente da sessão do ChatRADA, que não tem dono até o primeiro registro em `query_log`, a conversa aqui é privada de quem a abriu desde o início. No chat do processo, cada turno volta a exigir `canReadSubmission`: quem perde o acesso ao processo perde a conversa sobre ele.
- **Teto de consumo por pessoa**: turnos por dia, verificados antes de abrir o SSE, com resposta 429 legível. Hoje o α não tem teto nenhum, e o chat com o documento inteiro no contexto é a chamada mais cara do app.
- **Bucket privado novo `alpha-chat-attachments`** para os anexos do chat avulso. Apagar a conversa apaga os anexos.
- **Guarda de 180 dias, com opção de salvar.** Conversa avulsa sem atividade há 180 dias é apagada automaticamente, junto com os anexos, por uma rotina diária do α. O usuário pode **salvar** a conversa, e aí ela fica até ele mesmo apagar. A lista mostra, em cada conversa não salva, a data em que ela será apagada. Conversa de processo segue a vida do processo e não entra no expurgo.

## Capabilities

### New Capabilities

- `alpha-document-chat`: o motor e a API de chat sobre documento no α. Abrange:
  - conversas de processo e avulsas;
  - montagem de contexto (documento, achados, parecer e anexos, tratados como conteúdo não confiável);
  - busca no corpus;
  - citações validadas no servidor;
  - redação sugerida;
  - streaming SSE;
  - persistência com dono;
  - autorização por turno;
  - teto de consumo e anexos;
  - salvar conversa e expurgo da avulsa não salva após 180 dias sem uso.
- `contrate-document-chat`: a interface no contrate. Abrange:
  - painel de chat na tela do processo, com o atalho a partir do achado;
  - tela `/conversar`, com envio de anexos, lista de conversas, citações abríveis e bloco de redação copiável.

### Modified Capabilities

_(nenhuma: `alpha-aci-platform` segue sem spec arquivada em `openspec/specs/`; a tela do processo só ganha um ponto de entrada, sem mudar triagem, parecer ou fila.)_

## Impact

- **Apps**:
  - `alpha`: módulo novo `src/chat/`, com contexto, prompt, agente, citações e limites; rotas `/api/v1/chats/*`; exportar `loadSubmissionText`; novo teto de corpo para o upload de anexo em `body-limits.ts`; `llms.txt`.
  - `contrate`: `lib/alpha/chat.ts`, `components/chat/*`, painel no `ProcessView`, rota `/conversar` e entrada de navegação em `lib/modules.ts`.
  - `portal`: nada. O ChatRADA permanece como está.
- **Banco** (`packages/database`, schema `alpha`): uma migration com as três tabelas, RLS ligada sem policy (só `service_role`, como o resto do schema), bucket `alpha-chat-attachments` e índices por dono. Segue a regra declara → aplica → mergeia: o α seleciona as tabelas novas, então a migration tem que estar aplicada antes do deploy. Não há grant a cliente, e o navegador fala só com o α. Nada entra nas allowlists de `audit-rls.ts`.
- **Env** (opcionais, com default):
  - `ALPHA_CHAT_AI_MODEL` (vazio = `ALPHA_AI_MODEL`);
  - `ALPHA_CHAT_MAX_TURNS_PER_DAY`;
  - `ALPHA_CHAT_DOC_MAX_CHARS`;
  - `ALPHA_CHAT_PURGE_ENABLED` (default ligado).

  Nenhuma é obrigatória. O boot não muda.
- **LGPD**: anexos e conversas são dado novo guardado. A Política de Privacidade tem que declarar a guarda (180 dias sem uso para conversa avulsa não salva; conversa salva até o usuário apagar; conversa de processo enquanto o processo existir) antes do deploy: versão nova em `iefa.legal_documents`, linha nova. O destinatário (Bedrock) já está declarado.
- **Custo**: cada turno leva o documento no contexto. Sobre isso atuam o teto diário e o cache de prompt do Bedrock sobre o bloco do documento.

## Não-objetivos

- **Editar o documento ou gerar versão nova (DOCX revisado).** O chat sugere a redação, e quem aplica é o usuário.
- **Criar processo a partir do chat avulso** ("verificar este anexo"). Fica como evolução natural, fora deste change.
- **Compartilhar conversa** entre pessoas da OM. A conversa é de quem a abriu, inclusive no processo, como a sessão do ChatRADA.
- **Mexer no ChatRADA** do portal, no grafo dele ou no `query_log`. O motor novo não reaproveita o grafo `router → rada_agent → grader`: ele não serve a conversa ancorada em documento.
- **Alterar a triagem ou o parecer pelo chat.** O chat lê achados e parecer, não os muda. A palavra final segue sendo do ACI na tela própria.
- **Áudio, resumo em podcast, mapas mentais** e demais recursos do NotebookLM além de conversar com fontes.
- **Expurgo de conversa de processo.** Ela vive enquanto o processo existir (`on delete cascade`). Prazo próprio para ela, se vier, é outro change.

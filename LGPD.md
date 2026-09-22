# LGPD — mapa de conformidade da suíte

Referência operacional. O que tem valor jurídico é o texto publicado em
`iefa.legal_documents`; este arquivo diz **onde** cada peça vive e o que ainda
falta.

## Canal único

| Item | Valor |
|---|---|
| Controlador | Instituto de Economia, Finanças e Administração da Aeronáutica (IEFA) |
| Encarregado (art. 41) | **Secretaria do IEFA** — cargo, não pessoa |
| E-mail | **iefa@fab.mil.br** |
| Prazo de resposta | **7 dias corridos** (compromisso próprio; art. 19, §1º dá 15) |
| Exclusão | **Manual.** Não existe autoexclusão em nenhum app — com uma exceção: o usuário apaga pela tela as próprias conversas do assistente do Contrate e os anexos delas (Privacidade 2.3.0, seção 9) |
| Expurgo | Só a conversa avulsa não salva do Contrate: apagada com os anexos após 180 dias sem uso (`apps/alpha/src/jobs/purge-chats.ts`). Nenhum outro dado é apagado por idade |

Esses valores são constantes em `@iefa/legal-kit` (`src/contact.ts`) e o teste
`contact.test.ts` falha se o texto da migration divergir delas. Ao mudar o
e-mail ou o prazo, mude nos dois lugares — o teste é o que impede o rodapé
apontar para um endereço e a política para outro.

## Documentos

Três tipos, versionados, em `iefa.legal_documents`; a view
`legal_documents_current` resolve o vigente por maior `effective_date`.

| doc_type | pt-BR | en-US |
|---|---|---|
| `terms_of_use` | `/termos-de-uso` | `/terms-of-use` |
| `privacy_policy` | `/politica-de-privacidade` | `/privacy-policy` |
| `cookie_policy` | `/politica-de-cookies` | `/cookie-policy` |

Versão nova = **linha nova**, nunca `UPDATE`, e nunca reescrita do arquivo de
migration que já entrou na `main`. `user_legal_acceptances.document_id` é FK
`ON DELETE RESTRICT`: reescrever a versão antiga destruiria a prova de quem deu
ciência dela, e apagar a linha falha. Mesmo com a migration ainda não aplicada em
produção, editá-la no lugar faria o número nomear dois textos — quem já a tivesse
rodado localmente nunca receberia o novo (`ON CONFLICT … DO NOTHING`), e os testes
leem o `.sql`, não o banco, então continuariam verdes. Vigente no repositório:
**Termos e Privacidade 2.2.0, Cookies 1.3.0**, em
`20260921120000_legal_documents_v2_2.sql`, **aplicada em produção em 2026-09-19**
(vigência nessa data; substitui 2.1.0 / cookies 1.2.0 de
`20260907120000_legal_documents_cookies_v1_2.sql`). A 2.2.0 existe porque o
Contrate foi ao ar sem constar de documento nenhum.

## Cobertura por app

| App | Rotas legais | Links | Registro de ciência |
|---|---|---|---|
| sisub | `_public/*` | rodapé público + rodapé da sidebar | sim (`_protected`) |
| portal | `_public/_pt/*` + `_public/_en/*` | rodapé do `AppLayout` | sim |
| forms | raiz | landing, layout autenticado e **tela de resposta** | sim |
| rumaer | `_public/*` | rodapé do `AppLayout` | sim |
| sucont | raiz | rodapé da sidebar do `HubLayout` + tela de login | sim |
| assignment-selection | raiz | rodapé fixo no `__root` (cobre o telão público) | sim |
| contrate | raiz | rodapé do `AppLayout` + rodapé da sidebar do `ModuleShell` | sim (`AppLayout` e `ModuleShell`) |
| api | `GET /legal`, `GET /legal/{doc_type}` | `info.contact` do OpenAPI | n/a (sem sessão) |
| alpha | `GET /legal`, `GET /legal/{doc_type}` | — | n/a (sem sessão) |
| docs | — | links externos para o Portal | n/a (sem sessão) |
| pdf | — | — | n/a (não trata dado pessoal) |

`docs` é o único app sem credencial de Supabase. Dar uma a ele só para renderizar
dois documentos públicos ampliaria a superfície de credencial sem ganho — ele
aponta para a versão canônica no Portal.

`pdf` (BentoPDF) fica fora das três rotas porque não trata dado pessoal: todo
processamento de PDF roda no navegador, o arquivo nunca chega ao servidor, e o app
não usa cookie (WASM e OCR são servidos do próprio domínio). A única saída para
terceiro é iniciada pelo usuário: a assinatura digital consulta o servidor de
carimbo de tempo e a cadeia do certificado que ele mesmo escolher. Ver
`apps/pdf/README.md`. Se um dia ganhar login ou upload, passa a precisar delas.

## As duas declarações que abrem os documentos

- **Dado pessoal nunca é vendido.** Nem alugado, cedido ou trocado para fim
  comercial, publicitário ou de perfilamento. Declarado na abertura da Política de
  Privacidade, na seção 6, na seção 10 dos Termos e na seção 1 da Política de
  Cookies — sempre com o motivo junto (órgão público, dado da União, exploração
  comercial vedada por lei), porque promessa sem fundamento envelhece mal.
- **A finalidade é pesquisa.** O IEFA é instituição de ensino e pesquisa, e a lista
  de finalidades da seção 5 se declara **exaustiva** — sem isso ela lê como
  exemplificativa, e uma finalidade nova entraria na prática sem passar por versão
  nova do documento. Declarar "exaustiva" obriga a lista a estar completa: ela
  precisa incluir preferência de interface e telemetria de erro/desempenho, que a
  política descreve em outras seções. Lista incompleta com a palavra "exaustiva" é
  a mesma falha do incidente do Faro, só que auto-infligida.

Ambas estão presas por teste (`contact.test.ts`), nos dois idiomas e nos três
documentos, e expostas no JSON de `GET /legal` (`data_sale: "never"`) para quem
consulta por agente em vez de ler a página.

## O que a política declara e que costuma passar batido

- **Base legal é art. 7º, III / art. 23**, não consentimento. Por isso o aviso de
  ciência **não bloqueia** a navegação: exigir "aceitar" para prosseguir pediria
  uma escolha que o usuário não tem.
- **Retenção é indeterminada, com expectativa de permanência.** Não existe rotina
  de expurgo em lugar nenhum — nenhum `DELETE` por idade, nenhum `pg_cron`. A
  política diz isso porque anunciar um prazo de descarte que ninguém executa é
  informação falsa.
- **Transferência internacional existe**: Amazon Bedrock em `us-east-1` processa o
  conteúdo das conversas com IA (`AI-PROVIDERS.md`), e o Grafana Cloud recebe os
  eventos do Faro no SISUB. Ambos declarados sob art. 33, III.
- **O telão do CPAINT exibe nome, classificação e localidade sem autenticação**
  (`getBoardFn`, marcado `nosemgrep: server-fn-missing-auth-guard`) — e isso está
  correto: são dados **já publicados** no Boletim Ostensivo do COMAER e, em parte,
  no DOU. O telão reproduz publicidade oficial preexistente, não cria exposição
  nova. Declarado na seção 13 da política, sob art. 37 da Constituição, LAI e art.
  23 da LGPD, com a ressalva de que eliminação não alcança boletim nem DOU.
  Fechar a rota não protegeria nada e quebraria a projeção da sessão.

## Ao mexer

- **Novo app com dado pessoal**: `@iefa/legal-kit` na dependência, `legal.fn.ts`
  copiando o do app mais próximo, três rotas, link no rodapé. Se tiver sessão,
  monte também o aviso de ciência. O app entra também na lista de sistemas
  cobertos (seção 1 dos Termos, seção 2 da Privacidade) e no `APP_NAMES` de
  `cookie-inventory.test.ts` — foi por faltar isso que o Contrate rodou sob
  documentos que não o nomeavam.
- **Novo cookie ou novo destinatário de dado**: entra no inventário da seção 3 da
  Política de Cookies **antes** de entrar em uso. O guard
  (`packages/legal-kit/src/cookie-inventory.test.ts`) varre `apps/*/src` e
  `packages/*/src`, inclusive chave montada em template, e exige que a linha da
  chave **nomeie o app** que a grava — chave já inventariada num app novo não
  passa mais em silêncio. Chave declarada em package (o `auth_rate_limit` do
  `@iefa/auth-kit`) é atribuída a todo app que importa, como valor, o export que
  chega até ela (`cookie-inventory-scan.ts` segue o grafo de import do package até
  o `exports` do `package.json`): quem adota o `useLoginRateLimiter` precisa estar
  na linha, quem só importa `safeRedirect` ou um tipo do mesmo package não. O que
  ele não vê é armazenamento feito por dependência de terceiro (o `theme` do
  Fumadocs na Documentação, o identificador do Faro): esse entra à mão.
- **Nova versão de documento**: migration nova com `effective_date` posterior. O
  aviso de ciência reaparece sozinho para todo mundo.

## Pendências conhecidas

- Sem política de retenção implementada — a permanência é decisão declarada, não
  ausência de decisão, mas segue sem revisão periódica agendada.
- `xlsx` congelado no npm com 2 advisories `high` insolúveis, e ele parseia upload
  de usuário em `api` e `sucont`.

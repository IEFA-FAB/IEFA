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
| Exclusão | **Manual.** Não existe autoexclusão em nenhum app |

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

Versão nova = **linha nova**, nunca `UPDATE`. `user_legal_acceptances.document_id`
é FK `ON DELETE RESTRICT`: reescrever a versão antiga destruiria a prova de quem
deu ciência dela, e apagar a linha falha.

## Cobertura por app

| App | Rotas legais | Links | Registro de ciência |
|---|---|---|---|
| sisub | `_public/*` | rodapé público + rodapé da sidebar | sim (`_protected`) |
| portal | `_public/_pt/*` + `_public/_en/*` | rodapé do `AppLayout` | sim |
| forms | raiz | landing, layout autenticado e **tela de resposta** | sim |
| rumaer | `_public/*` | rodapé do `AppLayout` | sim |
| sucont | raiz | rodapé do `HubLayout` | sim |
| assignment-selection | raiz | rodapé fixo no `__root` (cobre o telão público) | sim |
| api | `GET /legal`, `GET /legal/{doc_type}` | `info.contact` do OpenAPI | n/a (sem sessão) |
| alpha | `GET /legal`, `GET /legal/{doc_type}` | — | n/a (sem sessão) |
| docs | — | links externos para o Portal | n/a (sem sessão) |

`docs` é o único app sem credencial de Supabase. Dar uma a ele só para renderizar
dois documentos públicos ampliaria a superfície de credencial sem ganho — ele
aponta para a versão canônica no Portal.

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
  monte também o aviso de ciência.
- **Novo cookie ou novo destinatário de dado**: entra no inventário da seção 3 da
  Política de Cookies **antes** de entrar em uso.
- **Nova versão de documento**: migration nova com `effective_date` posterior. O
  aviso de ciência reaparece sozinho para todo mundo.

## Pendências conhecidas

- Sem política de retenção implementada — a permanência é decisão declarada, não
  ausência de decisão, mas segue sem revisão periódica agendada.
- `xlsx` congelado no npm com 2 advisories `high` insolúveis, e ele parseia upload
  de usuário em `api` e `sucont`.

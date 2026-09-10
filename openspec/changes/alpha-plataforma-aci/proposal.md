## Why

O Projeto α entregou as Etapas 1.1 e 1.3½–1.7 (ChatRADA, fontes federais, extrator, comparador estrutural e verificador de conformidade), mas tudo isso é operado por um **console de calibração** (`/alpha/*`): fontes, bancada de regras, upload avulso e relatório por execução. Não existe a visão do analista — a Etapa 1.8 do roteiro, "Plataforma ACI": interface com persona ACI integrando as etapas 1–7, com dashboard do analista, acesso aos chats e fluxo de verificação com relatório final para aprovação.

Duas lacunas concretas impedem que o α seja usado no processo real:

1. **Não há fila.** O analista não tem como saber quais documentos foram submetidos, em que ponto cada um está (só enviado? extraído? verificado?) e quais têm achado crítico esperando decisão. `GET /submissions` lista linhas; ninguém deriva a etapa.
2. **O relatório termina onde a máquina termina.** A Etapa 1.7 produz os achados, mas não há como o ACI registrar o que acatou, o que descartou (e por quê) nem o parecer. O projeto declara "a palavra final é do gestor" e não tem onde o gestor dar a palavra final.

## What Changes

- **Triagem por achado** em `alpha.compliance_finding`: `triage` (`acatado` | `descartado` | nulo), `triage_note`, `triaged_by`, `triaged_at`. Descartar exige motivo.
- **Parecer** em tabela nova `alpha.compliance_review` (`run_id`, `reviewer_id`, `decision`, `notes`, `snapshot`): append-only, a linha mais recente é a vigente. Regra de emissão pura em `apps/alpha/src/aci/review.ts`.
- **Rotas ACI no α**: `GET /api/v1/aci/queue` (fila com etapa derivada e contagens), `GET /api/v1/submissions/:id` (processo inteiro), `PATCH /api/v1/compliance/findings/:id` (triagem), `GET|POST /api/v1/compliance/runs/:id/reviews` (parecer), `GET /api/v1/compliance/runs/:id/report` (relatório final, JSON ou Markdown).
- **Plataforma no portal** (`/aci/*`, autenticada, guard por perfil amplo): painel com a fila, nova análise, processo (trilha de etapas, extração, achados com triagem, parecer), relatório final imprimível e hub dos chats.
- **Componentes compartilhados** entre console e plataforma: formulário de envio/extração e visão de campos com trecho de origem, extraídos de `/alpha/analise/nova`.
- **Roadmap e docs**: 1.8 passa a `in-progress`; a página de fontes e conformidade ganha a seção da plataforma.

## Capabilities

### New Capabilities

- `alpha-aci-platform`: fila do analista, triagem de achado, parecer append-only com regra de emissão, relatório final e interface `/aci/*` no portal.

### Modified Capabilities

- `alpha-compliance-verification`: o relatório por execução passa a devolver a triagem de cada achado. Nenhuma mudança no que a verificação produz.

## Impact

- **Apps**: `alpha` (rotas e módulos puros em `src/aci/`) e `portal` (rotas `/aci/*`, libs `lib/alpha/aci.ts`, `role.ts`, `chat-session.ts`, componentes em `components/aci/` e `components/alpha/SubmissionIntake.tsx`). `docs` só texto.
- **Banco** (`packages/database`, schema `alpha`): migration `20260911100000_alpha_compliance_review.sql` — colunas de triagem em `compliance_finding` + tabela `compliance_review`. **Tem que estar aplicada antes do deploy do α**: `GET /compliance/runs/:id` passa a selecionar as colunas novas e devolveria erro sem elas.
- **Perfis**: nada novo. A fila usa os perfis amplos que já existem (`app_aci`, `app_licitacoes`); triagem e parecer exigem `app_aci`, como a promoção de regra.
- **Sem variável de ambiente nova.**

## Não-objetivos

- **Etapas 1.2 e 1.3 (ChatSistemasSEFA, ChatLicitaçõesSEFA)**: o hub de chats os lista como planejados; nenhum chat novo é construído.
- **Ler a conversa de outro servidor**: sessão de chat segue dono-ou-ninguém no α, por desenho. "Acesso a todos os chats" significa acesso a todos os *assistentes*, não a todas as conversas.
- **Fluxo de aprovação com múltiplos revisores, assinatura digital ou integração com o SIGADAER**: o relatório sai em Markdown/impressão; quem o anexa ao processo é o analista.
- **Notificação ao requisitante**: o parecer fica visível para quem pode ler a submissão; não há e-mail.
- **Paginação da fila**: teto de 200 processos por leitura, declarado no código. Paginação entra quando o volume pedir.
- **Calibração das regras (H.3/H.4 do change anterior)**: continuam bloqueadas por revisão humana; a plataforma não as substitui.

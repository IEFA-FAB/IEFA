## Context

A ferramenta atual monta o documento a partir de um `DocumentInput` (`apps/portal/src/lib/comaer/types.ts`) e o renderiza por `assembleDocument()` → `A4Sheet`. A IA entra uma vez, por `structuredOutput`, e devolve uma proposta que `applyProposal()` funde no documento. Tudo em server function; não há stream.

O que já existe e o desenho reaproveita sem reescrever:

| Peça | Onde | Papel no desenho |
|---|---|---|
| Endpoint SSE com gate, sessão e teto | `apps/sucont/routes/api/chat/stream.post.ts` | molde do endpoint de conversa |
| `useChat` + `fetchServerSentEvents` | `apps/sucont/src/subitens/components/AIAssistant.tsx` | cliente do stream |
| Contrato de tool (orçamento, poda de `null`) | `apps/sisub/src/lib/module-chat/tools/shared.ts` | molde das tools de remendo |
| `A4Sheet` renderizando de `AssembledDocument` | `apps/portal/src/components/comaer/A4Sheet.tsx` | preview, sem alteração |
| `assembleDocument().warnings` | `apps/portal/src/lib/comaer/assemble.ts` | **pauta do que a IA deve perguntar** |
| `applyProposal` + `reconcileKindAndScope` | `apps/portal/src/lib/comaer/proposal.ts` | base da aplicação de remendo |

O último item da tabela é o que evita inventar um mecanismo novo: a montagem **já** sabe dizer o que falta no documento (NUP incompleto, abertura obrigatória ausente, circular endereçado ao CMTAER, data da Ata que mora no texto). A conversa não precisa adivinhar a próxima pergunta — ela lê essa lista.

## Goals / Non-Goals

**Goals:**

- Conversa que **orienta**: pergunta o que falta, explica o que a norma impõe, e altera só o que foi tratado no turno.
- Preview lado a lado em que dá para ver **o que mudou agora** e **desfazer** o turno.
- Dados fixos preenchidos uma vez por usuário.
- Partir de minuta existente sem carregar junto a identidade do documento antigo.
- Conversa e formulário sobre **o mesmo documento**, sem exportar/importar entre modos.

**Non-Goals:**

- Substituir o formulário. A geração de um tiro continua sendo o caminho mais curto para quem já sabe o que quer.
- Redigir por conta própria a identidade do documento (numeração, NUP, OM, localidade, data, signatário) — a restrição do PR #265 permanece.
- Suporte a `.docx` (fora do escopo decidido) e a atos normativos do Anexo II da NSCA 5-3.
- Colaboração simultânea: um documento tem um dono, e a conversa é dele.

## Decisions

### 1. A IA edita por remendo, não por reescrita

**Escolhido:** tools de remendo (`definir_forma`, `definir_partes`, `definir_ementa`, `escrever_texto`, `substituir_paragrafo`, `inserir_paragrafo`, `remover_paragrafo`, `definir_anexos`…), cada uma com o recorte que a norma reconhece.

**Alternativas descartadas:**

- *Saída estruturada do documento inteiro a cada turno* — é o que existe hoje. Cada resposta apagaria o ajuste manual feito entre turnos, e o custo cresce com o tamanho do documento.
- *JSON Patch (RFC 6902) livre* — flexível demais: o modelo erra o caminho e não há como validar semanticamente `/paragrafos/3/itens/0`. Um remendo inválido chegaria como documento corrompido em vez de erro.

O recorte por tool é o que torna a validação possível: `definir_forma` valida o par espécie × âmbito por `reconcileKindAndScope`; `substituir_paragrafo` valida o índice. Além disso, tool é o que permite ao modelo **não** agir: ele responde em texto, perguntando, e só chama a tool quando tem base.

### 2. O estado do documento é do cliente

O documento atual viaja em `forwardedProps` a cada turno — o mesmo mecanismo do `contextSummary` do sucont. As tools **não gravam**: devolvem o remendo, e o cliente aplica.

**Por quê:** o formulário continua editável durante a conversa. Se o servidor mutasse a linha do banco, duas fontes de verdade disputariam o mesmo documento, e a edição manual do usuário seria sobrescrita pelo turno seguinte. Salvar continua sendo ato explícito, pelo caminho que já existe.

**Custo aceito:** o documento inteiro em cada turno (~2-4k tokens). É pequeno perto do teto de 60k tokens/min já configurado.

### 3. A pauta da conversa sai dos avisos de conformidade

O prompt recebe, a cada turno, a lista de `avisos` da montagem atual. É o que faz a IA perguntar "qual o NUP?" em vez de inventar um, e o que a faz explicar *por que* o fecho sumiu ao trocar o âmbito.

**Consequência de desenho:** regra nova da norma vira aviso na montagem e a conversa passa a cobrá-la **de graça**, sem tocar no prompt.

### 4. Preview com destaque de alteração e desfazer por turno

Duas colunas redimensionáveis; `A4Sheet` intocada. O estado da conversa guarda uma pilha de `DocumentInput` — um por turno — e cada turno registra quais blocos mudaram.

**Por quê:** sem ver o que mudou, o usuário relê o documento inteiro a cada mensagem e deixa de confiar na ferramenta; sem desfazer, ele não deixa o modelo mexer. As duas coisas são o que tornam aceitável dar ao modelo o poder de editar.

**Barato porque:** `DocumentInput` é serializável e pequeno — a pilha é memória, não banco.

### 5. Perfil do redator por usuário, e o que ele NÃO guarda

Tabela `documents.writer_profile`, uma linha por usuário: OM (nome, sigla, setor, endereço, telefone, e-mail), signatário (nome, posto, quadro, cargo), localidade padrão e prefixo do NUP.

**Fora de propósito:** sequencial do setor. É contador vivo, compartilhado pela seção; sugerir "o próximo" a partir do que este usuário usou por último produz número duplicado — e número errado num ofício só aparece depois do despacho.

O perfil preenche o documento **novo**. A IA continua sem inventar identidade: faltando dado, ela pergunta.

### 6. Importação de minuta: conteúdo entra, identidade não

Três entradas, uma saída: um `DocumentInput` proposto, aplicado pelo mesmo caminho de `applyProposal`.

| Entrada | Caminho | Estado |
|---|---|---|
| Texto colado | `structuredOutput` sobre o texto | funciona com o que já existe |
| Foto/digitalização | bloco `image`, já suportado pelo adapter | não exige mudança no pacote |
| PDF | bloco `document` | **exige estender `@iefa/ai-provider`** |

**Regra da importação:** numeração, NUP e data saem em branco, e o documento nasce com um aviso de origem. Copiar o número do ofício antigo é o erro clássico de quem parte de minuta, e é silencioso.

### 7. O adapter passa a falhar alto no que não sabe enviar

`packages/ai-provider/src/providers/bedrock.ts` mapeia hoje só `text` e `image`; qualquer outra parte é descartada **em silêncio**. O anexo de PDF exige o bloco `document`, e a mesma mudança troca o descarte por erro explícito.

Restrições do SDK que o mapeamento tem de respeitar (verificadas em `@aws-sdk/client-bedrock-runtime` 3.1123.0): formatos `csv/doc/docx/html/md/pdf/txt/xls/xlsx`; até 5 documentos de 4,5 MB; só em mensagem de papel `user`; e **todo bloco `document` exige um bloco `text` na mesma mensagem** — sem isso a chamada volta `ValidationException`.

## Risks / Trade-offs

**[Injeção de prompt pela minuta]** → O conteúdo de um ofício anexado é texto de terceiro que o modelo vai ler; "desconsidere as instruções anteriores" dentro de uma minuta é um ataque plausível. Mitigação: o anexo entra delimitado e anunciado como DADO, o nome do arquivo é normalizado para um nome neutro (a própria AWS documenta o campo `name` como vetor), e as tools de remendo não têm efeito fora do documento — o pior caso é um documento errado na tela do próprio usuário, que ele revisa antes de copiar.

**[Documento classificado subindo como anexo]** → O gate de sigilo hoje cobre o texto. Com upload, ele precisa cobrir o arquivo: recusar anexo quando o sigilo é diferente de `ostensivo`, e registrar a recusa como já se faz com o texto.

**[Rota Nitro respondendo 307]** → Rota não declarada em `handlers` é compilada e nunca registrada; o pedido cai no SSR e vira redirect para `/auth`. Foi exatamente o que aconteceu com o `/api/chat/stream` do sucont. Mitigação: teste de contrato que compara os arquivos em `routes/` com o que está declarado no `vite.config.ts`.

**[429 virando conexão cortada]** → Depois que o SSE abre não há mais status HTTP. Mitigação: `enforceRequestRateLimit` antes do stream, e `Retry-After` dentro do `HTTPError` (o h3 v2 monta a resposta de erro a partir de `error.headers`; um `setResponseHeader` no event é descartado nesse caminho).

**[`null` do modelo dentro de array]** → As tools novas têm arrays de parágrafos e itens. Opcional aninhado em array sem `.nullish()` mata a run com `tool_use_failed` e sem mensagem. Mitigação: as tools entram na varredura de argumentos do modelo, como já existe no sisub.

**[A conversa apagar trabalho manual]** → Mitigação: remendo em vez de reescrita (decisão 1), pilha de desfazer por turno (decisão 4) e destaque do que mudou.

**[Custo por turno]** → O documento inteiro viaja a cada mensagem e o primário é da família Opus. Mitigação: os tetos por usuário já existem (`PORTAL_AI_MAX_*`); a fatia 1 mede o consumo real de uma conversa típica antes de a fatia 3 acrescentar anexos.

## Migration Plan

Quatro fatias, cada uma mergeável sozinha e sem quebrar o que está no ar:

1. **Conversa + preview + desfazer** — endpoint SSE, tools de remendo, alternador de modo. O formulário continua o padrão; o modo conversa é opt-in na tela.
2. **Perfil do redator** — migration de `writer_profile`, tela de perfil, documento novo pré-preenchido, e a conversa passando a perguntar pelo que falta.
3. **Importação de minuta** — texto colado primeiro (sem dependência nova); depois imagem (já suportada) e PDF (junto da mudança no `@iefa/ai-provider`).
4. **Histórico de conversa por documento** — persistência das mensagens, para retomar de onde parou.

Rollback: cada fatia é revertível por si. A fatia 1 não altera dado gravado; a 2 acrescenta tabela sem tocar em `official_document`; a 3 muda um pacote compartilhado e por isso vai com o smoke do provider verde antes do merge.

## Open Questions

- **Persistência da conversa (fatia 4)**: guardar as mensagens é útil para retomar, mas o conteúdo pode ser sensível e hoje só o documento é gravado. Guardar por quanto tempo, e apagar junto com o documento?
- **Consumo real por conversa**: quantos turnos tem uma redação típica? A resposta decide se os tetos atuais (10 req/min, 500k tokens/dia por processo) seguem adequados quando o modo conversa virar o caminho padrão.
- **Foto de ofício**: digitalização de documento antigo costuma vir em várias páginas. O limite é 20 imagens por mensagem — falta decidir se a ferramenta aceita várias páginas de uma vez ou uma por vez.

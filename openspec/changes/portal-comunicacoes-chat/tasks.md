## 1. Fatia 1 — Endpoint da conversa

- [ ] 1.1 Adicionar `@tanstack/ai` e `@tanstack/ai-react` ao `apps/portal`, e rodar `bun run generate:deploy` se o gate de drift acusar
- [ ] 1.2 Criar `apps/portal/src/lib/nitro-auth.server.ts` — sessão em rota Nitro, espelhando o do sucont (o guard de rota do TanStack não alcança rota Nitro)
- [ ] 1.3 Criar `apps/portal/routes/api/comunicacoes/chat.post.ts`: capability gate 503 → sessão → `enforceRequestRateLimit` com `Retry-After` dentro do `HTTPError` → `chat()` → `toServerSentEventsResponse`
- [ ] 1.4 Declarar a rota em `handlers` no `apps/portal/vite.config.ts`
- [ ] 1.5 Teste de contrato de rotas Nitro: todo arquivo em `routes/` está declarado em `handlers` (sem isso o pedido vira 307 em vez de SSE)
- [ ] 1.6 Estender o contrato de acesso à IA (`src/test/ai-access.contract.test.ts`) para cobrir a rota Nitro: gate, sessão, teto antes do stream e recusa de documento classificado

## 2. Fatia 1 — Tools de remendo

- [ ] 2.1 Criar `src/lib/comaer/tools/` com o wrapper de tool: orçamento de resultado, poda de `null` do modelo e erro de tool legível pelo modelo
- [ ] 2.2 Implementar `definir_forma` (espécie e âmbito, validando por `reconcileKindAndScope`)
- [ ] 2.3 Implementar `definir_partes` (remetente, destinatários com `via`, endereçamento, vocativo, precedência)
- [ ] 2.4 Implementar `definir_ementa` (assunto, referências, anexos)
- [ ] 2.5 Implementar as tools de texto: `escrever_texto`, `substituir_paragrafo`, `inserir_paragrafo`, `remover_paragrafo`, `definir_itens`
- [ ] 2.6 Garantir que toda tool devolve remendo e nunca grava — a aplicação é do cliente
- [ ] 2.7 Teste de argumentos do modelo: toda tool aceita chamada sem opcionais e com opcionais em `null`, inclusive dentro de array
- [ ] 2.8 Teste: remendo com índice inexistente devolve erro de tool e não altera o documento

## 3. Fatia 1 — Prompt e pauta

- [ ] 3.1 Montar o prompt do sistema da conversa a partir das regras da NSCA 5-3 já usadas na geração de um tiro, mais o catálogo derivado de `DOCUMENT_KINDS`
- [ ] 3.2 Passar o documento atual e os `avisos` da montagem em `forwardedProps` a cada turno
- [ ] 3.3 Instruir o modelo a perguntar quando faltar dado de identidade, em vez de preencher
- [ ] 3.4 Teste: com o documento sem NUP, o prompt recebe o aviso correspondente

## 4. Fatia 1 — Interface: conversa, preview e desfazer

- [ ] 4.1 Alternador de modo (formulário | conversa) na mesma rota, sobre o mesmo `DocumentInput`
- [ ] 4.2 Painel de conversa com `useChat` + `fetchServerSentEvents`, incluindo estado de erro para 429 e 503
- [ ] 4.3 Layout de duas colunas redimensionáveis, com `A4Sheet` sem alteração
- [ ] 4.4 Aplicar os remendos que chegam pelo stream ao documento do cliente
- [ ] 4.5 Registrar por turno quais blocos mudaram e destacá-los no preview
- [ ] 4.6 Pilha de desfazer por turno, com botão no cabeçalho do turno
- [ ] 4.7 Teste da aplicação de remendo: alteração pontual preserva o resto e edição manual entre turnos sobrevive

## 5. Fatia 2 — Perfil do redator

- [ ] 5.1 Migration `documents.writer_profile` (uma linha por usuário, RLS ligada sem policy permissiva, acesso só por `service_role`)
- [ ] 5.2 Regenerar os tipos do `@iefa/database` e acrescentar o helper de schema
- [ ] 5.3 Server functions de leitura e gravação do perfil, com dono vindo da sessão e nunca do payload
- [ ] 5.4 Tela de perfil e pré-preenchimento do documento novo
- [ ] 5.5 Garantir que o perfil não guarda nem sugere sequencial do setor
- [ ] 5.6 Teste de autorização: perfil alheio não é lido nem alterado, qualquer que seja o id enviado

## 6. Fatia 3 — Importação de minuta

- [ ] 6.1 Importar por texto colado: extração para `DocumentInput` por saída estruturada, com numeração, NUP e data em branco
- [ ] 6.2 Aviso de documento derivado de minuta na conferência de conformidade
- [ ] 6.3 Upload de imagem (foto ou digitalização) usando o bloco `image`, já suportado pelo adapter
- [ ] 6.4 Gate de sigilo cobrindo o arquivo anexado, com a recusa registrada como a do texto
- [ ] 6.5 Delimitar o conteúdo importado como dado e normalizar o nome do arquivo antes de enviar
- [ ] 6.6 Teste: minuta com número e NUP no cabeçalho produz documento sem numeração e sem NUP

## 7. Fatia 3 — Anexo de documento no `@iefa/ai-provider`

- [ ] 7.1 Mapear parte de documento para bloco `document` no adapter do Bedrock, com formato, nome neutro e bytes
- [ ] 7.2 Garantir o bloco de texto acompanhante exigido pelo serviço
- [ ] 7.3 Validar limites antes da chamada: até 5 documentos, 4,5 MB cada, só em mensagem do usuário
- [ ] 7.4 Trocar o descarte silencioso de parte não suportada por erro explícito
- [ ] 7.5 Teste de regressão do descarte silencioso, e smoke opt-in enviando um PDF real ao Bedrock
- [ ] 7.6 Ligar o upload de PDF na ferramenta, depois do smoke verde

## 8. Fatia 4 — Histórico da conversa

- [ ] 8.1 Decidir e registrar a política de retenção das mensagens (a pergunta em aberto do design)
- [ ] 8.2 Migration do histórico por documento, com o mesmo desenho de acesso do restante do schema
- [ ] 8.3 Persistir e retomar a conversa de um documento
- [ ] 8.4 Excluir o histórico junto com o documento

## 9. Fechamento

- [ ] 9.1 `bun run lint`, `bun run typecheck`, suíte e `build` verdes no `apps/portal` e no `packages/ai-provider`
- [ ] 9.2 Medir o consumo real de uma conversa típica e revisar os tetos `PORTAL_AI_MAX_*` se necessário
- [ ] 9.3 Atualizar `AI-PROVIDERS.md` com a conversa como consumidor e com o suporte a anexo
- [ ] 9.4 Rodar `/code-review` e relatar os achados no PR antes de pedir merge

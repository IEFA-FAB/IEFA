## 0. Verificações prévias (bloqueiam tudo o que vem depois)

- [ ] 0.1 [spike] V1 — num projeto Supabase de teste, confirmar se `mfa.challenge` + `verify` numa sessão **já em AAL2** emite token novo com o timestamp de `totp` atualizado em `amr`. Registrar o resultado em `design.md`
- [ ] 0.2 [spike] V2 — confirmar que `mfa.enroll` a partir de sessão AAL1 é recusado quando a conta já tem fator verificado
- [ ] 0.3 [spike] V3 — descobrir se o projeto assina o JWT com signing key assimétrica (`getClaims()` valida local) ou segredo simétrico (`getClaims()` vira round-trip); decidir se a leitura de AAL reaproveita o `getUser()` já cacheado
- [ ] 0.4 [spike] Confirmar que `auth.reauthenticate()` está disponível na versão do GoTrue do projeto e qual erro ele devolve com senha errada
- [ ] 0.5 [design] Se V1 falhar, reabrir o grau `fresh` antes de qualquer código — o desenho muda de forma, não de detalhe

## 1. Banco e auditoria (entrega valor sozinha, independe das spikes)

- [x] 1.1 [database] `supabase migration new` para `access_control.sensitive_operation_log` (`actor_id`/FK `on delete restrict`, `operation`, `assurance`, `target jsonb`, `created_at`) com índice por ator e por data
- [x] 1.2 [database] `supabase migration new` para `access_control.mfa_recovery_code` (`code_hash` único, `used_at`, FK `on delete cascade`) e `access_control.mfa_reset_log` (`target_user_id`/`performed_by` `on delete restrict`, `method` com check, `reason`)
- [x] 1.3 [database] RLS nas três tabelas: dono em `mfa_recovery_code`, leitura `admin` nível 3 nos dois logs, nenhuma escrita por `anon`, nenhuma exposta ao PostgREST anônimo
- [ ] 1.4 [database] Conferir o carimbo das migrations contra o remoto antes de aplicar — o repo já tem drift dos arquivos `documents_*` aplicados por MCP
- [ ] 1.5 [database] `db:types` e conferência do `generated.ts`
- [x] 1.6 [sisub-domain] `operations/audit.ts`: `recordSensitiveOperation(db, ctx, { operation, assurance, target })`, apenas-inserção, sem update nem delete expostos
- [x] 1.7 [sisub-domain] Teste: FK `restrict` impede apagar usuário com histórico; nenhuma superfície de update/delete no log

## 2. Registro de classificação (fonte única)

- [x] 2.1 [sisub] `server/assurance-registry.ts` classificando **toda** server function de mutação como `"none" | "session" | "fresh"`, com o `reason` legível de cada operação classificada
- [x] 2.2 [sisub] Teste de contrato que varre `src/server/*.fn.ts` e reprova função de mutação não classificada
- [x] 2.3 [sisub] Classificar `"fresh"`: permissões, chave MCP, parceiro externo, reset de treino, exportação nominal, remoção de MFA de terceiro
- [x] 2.4 [sisub] Classificar `"session"`: empenho, liquidação, pagamento, conciliação
- [x] 2.5 [pbac] Função pura `isProtectedAccount(permissions, registry)` — deriva a conta protegida do registro, sem lista paralela; teste com `unit` nível 2 alcançando empenho
- [x] 2.6 [root] Regra em `.opengrep/rules/` para server fn de mutação nova sem entrada no registro

## 3. Ligar a auditoria (ainda sem exigir MFA de ninguém)

- [x] 3.1 [sisub] Gravar `sensitive_operation_log` em toda execução bem-sucedida de operação classificada, no mesmo ponto onde a garantia será avaliada
- [x] 3.2 [sisub] Teste: operação rejeitada não gera linha de sucesso; operação de rotina não gera linha
- [x] 3.3 [sisub] Tela de consulta do log em `/admin`, exigindo `admin` nível 3, com limite e total
- [ ] 3.4 [root] `bun run check` + `bun run test`; abrir PR desta fatia isolada — ela vale mesmo se o MFA parar aqui

## 4. Fundação de garantia no package (inerte)

- [x] 4.1 [pbac] Estender `UserContext` com `aal: 1 | 2`, `lastFactorAt: number | null`, `origin: "session" | "api-key"`, com defaults seguros
- [x] 4.2 [pbac] `src/jwt-claims.ts` conforme o resultado de V3: extrair `aal` e o timestamp da entrada de `amr` com `method === "totp"` — **nunca** `amr[0]`
- [x] 4.3 [pbac] Testar `jwt-claims.ts`: `token_refresh` mais recente que `totp`, `amr` ausente, `aal` ausente, múltiplas entradas `totp`
- [x] 4.4 [pbac] `src/assurance.ts` — `assertAssurance(ctx, requirement)` puro, com a janela de 15 min
- [x] 4.5 [pbac] `src/errors.ts` — `AssuranceRequiredError` com `code`, `nextStep`, `reason`, sinalizando o status HTTP antes do `throw`
- [x] 4.6 [pbac] Popular AAL e origem em `createRequestAuth`; testar que payload com `aal: 2` não altera o contexto
- [x] 4.7 [pbac] Ligar a exigência em `requireLevel`/`requireAnyLevel` (para os outros apps), avaliando **depois** do gate de módulo/nível
- [x] 4.8 [sisub] Ligar a exigência em `requireAuthWithPermission` (`lib/auth.server.ts`) — cobre `requireUnitScope` e `requireStorageForKitchen`
- [x] 4.9 [sisub-domain] `guards/require-assurance.ts` e ligação nas operations classificadas
- [x] 4.10 [sisub] Teste que varre os guards de rota e falha se algum `beforeLoad` passar a exigir garantia
- [x] 4.11 [root] `bun run check` + `bun run test` — 6 apps compilam, nenhum comportamento muda com o registro todo em `"none"`

## 5. Cadastro de fator (sisub)

- [x] 5.1 [sisub] `server/mfa.fn.ts`: listar fatores, iniciar cadastro com `reauthenticate()` obrigatório antes de `enroll`, verificar, remover
- [x] 5.2 [sisub] Registrar cadastro e remoção de fator em `sensitive_operation_log`
- [x] 5.3 [sisub] Rota `/_protected/_modules/diner/security`, guard `diner` nível 1, **sem** exigência de garantia
- [x] 5.4 [sisub] Componente de cadastro: campo de senha, QR + chave em texto, campo de 6 dígitos, aviso de desconexão das outras sessões antes do botão final
- [x] 5.5 [sisub] Mensagem de relógio dessincronizado após dois códigos recusados
- [x] 5.6 [sisub] Fator reserva: convite após o primeiro fator; obrigatório e sem opção de pular para conta protegida (usa `isProtectedAccount`)
- [x] 5.7 [sisub] Lista de fatores com substituir/remover e `refreshSession()` após remover o último verificado
- [x] 5.8 [sisub] Lista de sessões ativas com "Encerrar todas as outras sessões"
- [x] 5.9 [sisub] Cartão discreto de segurança em `/diner/profile`
- [x] 5.10 [sisub] Tela de desafio de segundo fator no login
- [x] 5.11 [sisub] Bloquear cadastro/remoção de fator a partir de sessão originada de recuperação de senha; testar
- [x] 5.12 [auth-kit] Traduzir as mensagens de erro de MFA e de reautenticação do GoTrue em `errors.ts`, com teste
- [x] 5.13 [sisub] Conferir as telas contra `apps/sisub/docs/STYLE_CONTRACT.md` (flat, sem faixa de acento lateral, ponteiro pela regra de `@layer base`)

## 6. Recuperação

- [x] 6.1 [sisub-domain] `operations/mfa-recovery.ts`: gerar 10 códigos de alta entropia, hash SHA-256 via `crypto.subtle` (padrão de `mcp-keys.ts`), persistir só o hash
- [x] 6.2 [sisub-domain] `consumeRecoveryCode`: valida hash, marca `used_at`, devolve para o chamador remover os fatores — **não** produz AAL2
- [x] 6.3 [sisub-domain] Regeração invalida os códigos anteriores; conta que **vira** protegida tem os códigos invalidados; testes
- [x] 6.4 [sisub] Não gerar códigos para conta protegida; ocultar o atalho no desafio
- [x] 6.5 [sisub] Tela de códigos: copiar, baixar, imprimir, confirmação obrigatória antes de concluir
- [x] 6.6 [sisub] Fluxo de consumo: `deleteFactor` + `refreshSession` + `mfa_reset_log` + `sensitive_operation_log` + tela obrigatória de recadastro
- [x] 6.7 [sisub] Limite de tentativas por (usuário, origem) com teto global; teste de que um terceiro não tranca a recuperação da vítima e de que o reset administrativo nunca é bloqueado
- [x] 6.8 [sisub] Envio de e-mail best-effort (padrão do `apps/portal/src/lib/journal/email.server.ts`) e reporte da indisponibilidade do provider em `capabilities.server.ts`

## 7. Reset administrativo

- [x] 7.1 [sisub] Server fn de reset: `admin` nível 3 + grau `fresh`, justificativa obrigatória, `deleteFactor`, `mfa_reset_log` + `sensitive_operation_log`, e-mail best-effort
- [x] 7.2 [sisub] UI em `/admin/permissions`: ação destacada, confirmação de verificação por canal alternativo, campo de justificativa
- [x] 7.3 [sisub] Testes: justificativa vazia rejeitada, administrador sem elevação fresca barrado, log gravado com `performed_by`, operação conclui sem provider de e-mail
- [x] 7.4 [docs] Procedimento de último recurso pelo dashboard do Supabase (quem tem acesso, com MFA próprio, mais de uma pessoa)

## 8. Elevação sem perder trabalho

- [ ] 8.1 [sisub] Wrapper de mutação que captura `MFA_REQUIRED`, guarda o payload e abre o modal sobre a tela atual — sem redirecionar para `/auth`
- [ ] 8.2 [sisub] Modal com os três caminhos (`enroll`, `challenge`, `step-up`) e o `reason` da operação visível
- [ ] 8.3 [sisub] Reexecutar a mesma mutação com o payload original após a verificação; cancelar preserva o formulário e não desloga
- [ ] 8.4 [sisub] Caminho `enroll` no meio de um formulário preenchido: sessão promovida, formulário sobrevive
- [ ] 8.5 [sisub] Teste e2e: concessão de permissão com elevação vencida → modal → reenvio → permissão gravada → linha no log

## 9. Ativar os pisos

- [ ] 9.1 [sisub] Ativar `"fresh"` nas operações críticas e validar em ambiente de treino
- [ ] 9.2 [sisub] Ativar `"session"` nas operações financeiras e validar com um turno real de liquidações (contagem de prompts deve ser zero)
- [ ] 9.3 [sisub] Painel de adoção para o administrador: quem tem fator, quem tem reserva, quem não tem nenhum
- [ ] 9.4 [sisub] Faixa dispensável de aviso de obrigatoriedade, com data configurável
- [ ] 9.5 [sisub] Tela de cadastro obrigatório após o prazo, com a ação de sair sempre visível

## 10. Fechar a chave de API

- [ ] 10.1 [sisub-mcp] `resolveApiKey` devolve `origin: "api-key"`, `aal: 1`
- [ ] 10.2 [sisub-mcp] Despacho de tool rejeita operação classificada, com mensagem que o modelo consiga ler e corrigir
- [ ] 10.3 [sisub] `createMcpKeyFn` exige grau `fresh` e prazo (30d/90d/1a)
- [ ] 10.4 [sisub] UI de `/diner/mcp-keys`: seletor de prazo, aviso do que a chave não executa, destaque de vencimento próximo
- [ ] 10.5 [sisub] Backfill de prazo nas chaves existentes com aviso prévio — não expirar chave em produção sem avisar
- [ ] 10.6 [sisub-mcp] Teste de contrato: chave de API nunca satisfaz `"session"` nem `"fresh"`

## 11. Fechamento

- [ ] 11.1 [root] Suíte de integração contra banco real cobrindo as três tabelas novas
- [ ] 11.2 [root] `bun run check` + `bun run test` verdes
- [ ] 11.3 [root] `/code-review` rodado e relatado no PR antes de pedir merge

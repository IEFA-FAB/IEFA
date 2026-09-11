## Context

O ERP autentica por e-mail + senha no GoTrue (Supabase) e autoriza por `@iefa/pbac` — módulo + nível (0–3) + escopo. Os seis apps com UI resolvem a mesma `access_control.user_permissions` e passam pelo mesmo chokepoint: `createRequestAuth` em `packages/pbac/src/start.ts`, que monta o `UserContext { userId, permissions }` de cada request.

Não há **nenhum** segundo fator no monorepo — a varredura por `mfa|aal|totp` em `apps/` e `packages/` não retorna nada. A trava de tentativas de login (`packages/auth-kit/src/rate-limiter.ts`) é `sessionStorage` e o próprio comentário do arquivo a classifica como "freio de UX, não controle de segurança". O controle real é o rate limit do GoTrue.

Três fatos da plataforma, confirmados na documentação do Supabase, moldam todo o desenho:

1. O JWT já carrega `aal` (`"aal1" | "aal2"`) e `amr` (`[{ method, timestamp }]`, mais recente primeiro). Não é preciso inventar transporte de estado de MFA.
2. Os fatores disponíveis são `totp` e `phone`. **Não existe e-mail como fator**, e não há **códigos de recuperação nativos** — o troubleshooting oficial diz que a conta é irrecuperável se todos os fatores forem perdidos, e recomenda cadastrar um fator reserva.
3. `mfa.unenroll()` **exige AAL2**. Quem perdeu o dispositivo não consegue remover o próprio fator. Só `auth.admin.mfa.deleteFactor()` (service-role) alcança.

Restrição estrutural do repo: as server functions do sisub falam com o banco por Drizzle com **service-role**, e RLS não se aplica a esse caminho. Portanto o gate de AAL precisa estar no guard da aplicação; política RLS de `aal2` é cinto adicional, nunca o cinto principal.

Partes interessadas: administradores de permissão (dezenas), operadores de execução orçamentária (dezenas), gestores de rancho/cozinha (centenas), comensais (~800, sem impacto), parceiro externo GS1 (poucos), e a integração MCP (chaves de API).

## Goals / Non-Goals

**Goals:**
- Impedir que senha comprometida — ou caixa de e-mail comprometida — baste para conceder permissão, empenhar recurso ou exportar dado nominal.
- Introduzir a garantia de identidade como eixo **ortogonal** ao PBAC, sem tocar a semântica de nenhum `hasPermission` existente.
- Manter a experiência do comensal **idêntica à de hoje**.
- Concentrar o atrito nas operações raras e de alto impacto, e mantê-lo perto de zero nas operações de volume.
- Garantir que perder o dispositivo seja um problema de 2 minutos para o usuário comum, e um procedimento auditado — nunca um beco sem saída — para o administrador.
- Fechar a chave MCP como via de contorno permanente do segundo fator.
- Responder "quem fez o quê" nas operações sensíveis — hoje não há registro algum de quem concedeu permissão ou quem empenhou.

**Non-Goals:**
- MFA obrigatório para comensal; fator por SMS/telefone; passkey/WebAuthn; nível 4 no PBAC; forjar AAL2 por hook de token; adoção obrigatória nos demais apps do ERP nesta etapa. (Justificativas em `proposal.md`.)

## Verificações prévias (bloqueiam o início da implementação)

Três premissas sustentam o desenho e **nenhuma foi confirmada contra o ambiente real**. São spikes curtas; o resultado de V1 pode mudar a forma do desenho, não apenas um detalhe.

- **V1 — RESOLVIDA (2026-09-11): o grau `fresh` funciona.** Medido contra o GoTrue do projeto, com usuário descartável (criado, usado e apagado): `challenge` + `verify` numa sessão **já em AAL2** é aceito (200) e emite token novo com o timestamp de `totp` atualizado — `1789137344` → `1789137375`. A janela de elevação reinicia como o desenho supunha.
  **Achado colateral que vira requisito**: no token logo após o primeiro `verify`, o `amr` veio `[{password, …}, {totp, …}]` — ou seja, `amr[0]` era **password**. Ler a posição zero não é só frágil na presença de `token_refresh`: ela já está errada no caso mais comum. A extração por `method === "totp"` está confirmada empiricamente.
- **V4 — RESOLVIDA na implementação: `auth.reauthenticate()` NÃO serve.** A tipagem do `@supabase/auth-js@2.115.0` instalado é `reauthenticate(): Promise<AuthResponse>` — sem argumentos: ele dispara um *nonce por e-mail* (etapa da "Secure password change"), não confere senha. O que D14 pede é a senha. A conferência é feita por `signInWithPassword` num client **sem estado** (`createStatelessAuthClient`), com a sessão descartável revogada em escopo `local` — pelo client SSR isso gravaria a sessão nova nos cookies do usuário, e escopo global derrubaria todas as sessões do titular, que é justamente o que a spec proíbe. O e-mail sai de `requireUser()`, nunca do payload: aceitá-lo do cliente transformaria o endpoint num oráculo de senha de qualquer conta.
- **V2 — RESOLVIDA (2026-09-11): o GoTrue já fecha o segundo fator em diante.** Sessão AAL1 de conta com fator verificado tentando `POST /factors` recebe `403 insufficient_aal — "AAL2 required to enroll a new factor"`. Consequência para D14: o ataque de sessão roubada existe **apenas enquanto a conta não tem nenhum fator**, e é exatamente aí que a reautenticação por senha é obrigatória. Para os fatores seguintes, a plataforma basta.
- **V3 — RESOLVIDA (2026-09-11): o projeto usa segredo simétrico.** `https://jgigqdpdjgnnuwajtayh.supabase.co/auth/v1/.well-known/jwks.json` devolve `{"keys":[]}`. Portanto `getClaims()` **não** pode ser usado no caminho de request: ele mandaria uma requisição por chamada, dobrando o custo de auth num repo com histórico de 502 por TTFB. A leitura de AAL SHALL decodificar o payload do access token **localmente, sem verificar assinatura**, e somente depois de `getUser()` ter validado esse mesmo token contra o GoTrue — é o token da mesma sessão, já provado autêntico, e o custo é zero requisição adicional.

## Decisions

### D1 — AAL e origem da credencial entram no `UserContext`, lidos do JWT validado

```ts
export interface UserContext {
  userId: string
  permissions: UserPermission[]
  /** Garantia de identidade da sessão. `api-key` e MCP sempre 1. */
  aal: 1 | 2
  /** Instante da última verificação de segundo fator (epoch s), do `amr`. `null` se nunca. */
  lastFactorAt: number | null
  /** Por onde a credencial entrou. */
  origin: "session" | "api-key"
}
```

O `aal` sai das claims do token da sessão, obtidas por `supabase.auth.getClaims()` — que valida a assinatura. **Nunca** do payload da server function, e **nunca** de `getSession()`, cuja própria tipagem avisa que os valores vindos de cookie não são autênticos.

**Decidido por V3**: o projeto assina com segredo simétrico, então `getClaims()` está **fora** — ele custaria uma requisição por chamada. A leitura é local: decodificar o payload do access token (base64, sem verificar assinatura) **depois** de `getUser()` ter validado o mesmo token, reaproveitando o `WeakMap` por request de `createRequestAuth`. Custo: zero round-trip adicional.

`lastFactorAt` sai da entrada de `amr` cujo `method` é `totp`, **não** de `amr[0]`: a lista tem `token_refresh` e outros métodos, e ler a posição zero faria um refresh de token parecer uma verificação de fator — janela de elevação que se renova sozinha, silenciosamente.

*Alternativa descartada*: manter uma tabela própria de "elevações ativas". Duplicaria estado que o JWT já carrega assinado, e ficaria dessincronizada no logout.

### D2 — Dois graus de exigência, e é isso que resolve o atrito

Este é o ponto onde desenhos de MFA costumam morrer. Um único grau ("toda operação sensível pede código fresco") transforma um operador de liquidação que trabalha 4 horas seguidas em alguém que digita 6 dígitos **umas 16 vezes por turno**. Ele vai deixar o aplicativo aberto ao lado do teclado, e o controle vira teatro.

| Grau | Regra | Custo para o usuário |
|---|---|---|
| `session` | a sessão precisa estar em AAL2 | digitou uma vez **no login**; nunca mais no turno |
| `fresh` | AAL2 **e** `lastFactorAt` há no máximo 15 min | um modal de 6 dígitos na hora da ação |

- **`fresh`** só para o que é **raro e irreversível ou escalável**: conceder/alterar permissão, criar chave MCP, conceder acesso a parceiro externo, resetar o ambiente de treino, exportar dado nominal, remover o MFA de outra pessoa.
- **`session`** para o que é **sensível mas de volume**: empenho, liquidação, pagamento, conciliação. Exige que a conta tenha segundo fator e o tenha usado no login — mas não interrompe o trabalho.

*Alternativa descartada*: janela deslizante renovada a cada operação sensível. Na prática nunca expira num turno de trabalho, o que é o mesmo que `session` — mas com a aparência enganosa de frescor.

### D3 — O gate vive na server function. Rota e leitura **nunca** disparam elevação

`requirePermission(opts, "admin", 3)` no `beforeLoad` das rotas continua **cego a AAL**. Se o guard de rota exigisse elevação, abrir `/admin/permissions` para *consultar* pediria o código — e navegação que pede senha é exatamente o que treina as pessoas a digitar código sem ler o motivo.

Regra: `minAal` **apenas** em `createServerFn({ method: "POST" })` e em ações explícitas de exportação. Nenhuma leitura de tela é gated.

Alinha com a recomendação do próprio Supabase para SSR: encontrar AAL menor no servidor frequentemente **não é** ataque (aba esquecida aberta, usuário que fechou o desafio) — a resposta certa é conduzir ao desafio, não devolver 401.

### D4 — Erro tipado, com o próximo passo declarado

`forbidden()` hoje devolve 403 com string. A UI precisa distinguir três situações que exigem telas diferentes:

```ts
class AssuranceRequiredError extends Error {
  code = "MFA_REQUIRED"
  nextStep: "enroll" | "challenge" | "step-up"
  reason: string   // "Esta operação altera permissões de acesso."
}
```

- `enroll` — a conta **não tem** fator: o modal oferece o cadastro ali mesmo (2 min) e a ação segue depois. Verificar um fator promove a **sessão atual** a AAL2 (as *outras* é que caem), então o formulário aberto na aba sobrevive.
- `challenge` — tem fator, sessão em AAL1 (fechou o desafio no login): pede o código.
- `step-up` — sessão AAL2, elevação vencida: pede o código.

Sem esse campo, o usuário veria "acesso negado" numa operação que ele pode fazer — o pior desfecho possível de um controle de segurança.

### D5 — O gate mora onde a autorização do sisub realmente acontece

Correção de um erro de leitura da primeira versão deste desenho: o sisub **não usa** `requireLevel`/`requireAnyLevel` de `@iefa/pbac/start`. Ele autoriza por dois caminhos, e os dois precisam do eixo de garantia:

1. **`requireAuthWithPermission`** (`apps/sisub/src/lib/auth.server.ts:69`) — por onde passam `requireUnitScope` (execução orçamentária) e `requireStorageForKitchen` (estoque).
2. **Os guards de domínio** em `packages/sisub-domain/src/guards/require-permission.ts` (`requirePermission`, `requireUnit`, `requireKitchen`, `requireAssetWriteForScope`) — chamados de dentro das operations, que recebem o `ctx` da server function.

Portanto: a avaliação de garantia é uma função pura em `@iefa/pbac` (`assertAssurance(ctx, requirement)`), **chamada nos três lugares** — `requireLevel` do `start.ts` (para os outros apps), `requireAuthWithPermission` do sisub e um `guards/require-assurance.ts` novo no `sisub-domain`. Pendurar o gate só no `start.ts` teria produzido uma fase 1 inteira que não protege nada no sisub.

*Alternativa descartada*: migrar o sisub para os guards do `pbac/start`. É refatoração grande, de risco próprio, e ortogonal a esta mudança.

### D6 — Uma fonte única de classificação, em código

A classificação vive **por operação**, num registro único versionado do sisub (`server/assurance-registry.ts`), e tudo o mais é derivado dele:

```ts
export const ASSURANCE_REGISTRY = {
  createUserPermissionFn: { require: "fresh",   reason: "Esta operação altera permissões de acesso." },
  recordLiquidationFn:    { require: "session", reason: "Esta operação registra uma liquidação." },
  upsertForecastFn:       { require: "none" },
  // …toda fn de mutação, sem exceção
} as const
```

A primeira versão deste desenho mantinha **duas** listas — uma política por módulo/nível em `@iefa/pbac` e um registro por função no sisub. Duas listas sobre o mesmo assunto se contradizem em silêncio, e a contradição só aparece quando alguém é barrado (ou passa) sem explicação. Quem precisa da visão por módulo — o cálculo de conta protegida da D9 — a **computa** do registro cruzado com as permissões efetivas.

Versionado, revisável em PR, coberto por teste. Uma coluna em banco poderia **elevar** a exigência de um grant específico, nunca rebaixá-la: piso ajustável em runtime é piso que alguém desliga às 23h de uma sexta para destravar um empenho.

### D7 — Classificação exaustiva por server function, com teste que falha no esquecimento

O repo já tem o precedente que provou funcionar: `security-contracts.test.ts` e `server-fn-auth.contract.test.ts` em `apps/sisub/src/server/`, e a cobertura exaustiva que fechou o IDOR do `fetchUserPermissionsFn`.

Um registro declarativo — **fonte única**, sem política paralela por módulo — mapeia cada fn de mutação para `"none" | "session" | "fresh"`, e o teste varre o diretório: **fn de mutação não classificada reprova a suíte**. A visão por módulo (usada para decidir quem precisa de fator reserva) é **derivada** desse registro, nunca escrita à mão em segundo lugar: duas listas se contradizem em silêncio. É o mesmo formato do gate que impediu a reincidência do `kitchen:2`. Padrão que causou bug vira regra em `.opengrep/rules/` — aqui, "server fn de mutação nova sem classificação de garantia".

### D8 — Código de recuperação **remove o fator**; não finge AAL2

Não temos como fazer o GoTrue aceitar um código nosso como fator, e um hook de token que emitisse `aal2` mentiria sobre a garantia — contaminando toda decisão a jusante, inclusive RLS.

```
senha (AAL1) → desafio TOTP → "Usar um código de recuperação" → valida hash,
marca uso único → admin.mfa.deleteFactor() → refreshSession() →
conta sem MFA, sessão AAL1 → tela obrigatória de recadastro → AAL2 → novos códigos
```

Enquanto não recadastrar, o usuário **não alcança** nenhuma operação `session`/`fresh` — correto, porque ele ainda não provou o segundo fator.

Consequência assumida: quem tem a senha **e** os códigos entra e cadastra o próprio TOTP. Os códigos são, na prática, um segundo fator de papel. Por isso: uso único, hash, limite agressivo server-side, e-mail de aviso a cada consumo, e **indisponíveis para nível 3** — lá o caminho é fator reserva ou reset administrativo.

### D9 — Fator reserva obrigatório para conta que alcança operação classificada

Correção de recorte. A primeira versão amarrou fator reserva e ausência de códigos de recuperação a "nível 3". Isso cegou para o dinheiro: a execução orçamentária passa por `requireUnitScope(2, …)` (`apps/sisub/src/server/empenho.fn.ts:137`, `budget.fn.ts:157`) — módulo `unit`, **nível 2**. Pelo recorte antigo, o operador que empenha teria códigos de recuperação, guardaria no e-mail, e "senha + caixa de e-mail" voltaria a valer empenho: exatamente o que a proposta diz fechar.

O critério passa a ser **derivado do registro de classificação**, não do número do nível: a conta que alcança qualquer operação classificada como `"session"` ou `"fresh"` é uma **conta protegida**, e para ela valem (a) fator reserva obrigatório e (b) ausência de códigos de recuperação. O cálculo é uma função pura sobre permissões efetivas × registro, com teste — nada digitado à mão.

### D10 — Reset administrativo: `deleteFactor` com quatro travas

`auth.admin.mfa.deleteFactor({ id, userId })` desloga o alvo de todas as sessões. Travas: (1) o administrador precisa estar ele mesmo em elevação `fresh`; (2) confirmação explícita de identidade verificada **fora do e-mail** — se o adversário já tem a caixa, confirmar por e-mail é confirmar com o adversário; (3) justificativa obrigatória gravada em `access_control.mfa_reset_log`, no mesmo formato do `training_reset_log` (`20260730260000`) já existente; (4) e-mail automático ao alvo.

### D11 — Chave de API nunca satisfaz `minAal`

`resolveApiKey` em `apps/sisub-mcp/src/auth.ts` devolve hoje o `UserContext` completo do dono: uma chave criada por um administrador executa em AAL0 permanente tudo que o step-up deveria proteger. Passa a marcar `origin: "api-key"`, `aal: 1`, e o guard rejeita `minAal` com mensagem clara. Some-se prazo obrigatório na criação e teto de nível.

### D12 — Banco: três tabelas, e RLS de `aal2` **não** aplicada em massa

```sql
create table access_control.mfa_recovery_code (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  code_hash   text not null unique,       -- SHA-256, mesmo padrão do key_hash
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

create table access_control.mfa_reset_log (
  id             uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references auth.users(id) on delete restrict,
  performed_by   uuid not null references auth.users(id) on delete restrict,
  method         text not null check (method in ('recovery-code','admin-reset')),
  reason         text,
  created_at     timestamptz not null default now()
);
```

```sql
create table access_control.sensitive_operation_log (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid not null references auth.users(id) on delete restrict,
  operation    text not null,              -- nome da server function
  assurance    text not null,              -- grau exigido na execução
  target       jsonb,                      -- identificação do alvo (ids, escopo)
  created_at   timestamptz not null default now()
);
```

`on delete restrict` no log porque prova de quem removeu o MFA de quem não pode sumir junto com o usuário — é a mesma razão pela qual `user_legal_acceptances.document_id` é restrict no `LGPD.md`.

Hash SHA-256 via `crypto.subtle` reaproduz exatamente o padrão de `packages/sisub-domain/src/operations/mcp-keys.ts`. Código de recuperação é aleatório de alta entropia, então SHA-256 basta — não é senha de humano.

RLS restritiva de `aal2` (`using ((select auth.jwt()->>'aal') = 'aal2')`) fica **só nessas duas tabelas**. Aplicá-la em massa não protegeria o caminho real (service-role ignora RLS) e quebraria o catálogo público anônimo em `api.iefa.com.br`.

Migrations por `supabase migration new`, com o carimbo do remoto — o repo já tem drift de quatro arquivos `documents_*` aplicados por MCP que vão estourar o próximo `db push`. Não aumentar a dívida.

### D13 — `refreshSession()` obrigatório após qualquer unenroll

A documentação avisa: o downgrade de AAL2 para AAL1 só acontece **depois do intervalo de refresh**. Sem chamada explícita, a sessão segue AAL2 por até uma hora com o fator já removido — janela real numa conta administrativa.

### D14 — Cadastro de fator exige a senha novamente

Cadastrar o primeiro fator só pode exigir AAL1 — a conta ainda não tem fator. Combinado com o comportamento documentado (*"upon verifying a factor, all other sessions are logged out"*), isso cria um ataque que a versão anterior deste desenho **introduzia**: quem rouba uma sessão cadastra o próprio TOTP, a vítima é desconectada de tudo e o atacante fica em AAL2 — com a vítima sem caminho de volta. Hoje, sem MFA, a vítima ainda conseguiria trocar a senha.

Mitigação: `auth.reauthenticate()` (senha novamente) **antes** do `mfa.enroll` do **primeiro** fator, e registro + aviso ao titular a cada cadastro. Do segundo fator em diante a plataforma já exige AAL2 por conta própria (V2: `403 insufficient_aal`), então a exigência de senha ali seria atrito sem ganho. Custo de UX: um campo de senha numa tela que a pessoa visita uma vez.

### D15 — Auditoria das operações sensíveis entra nesta mudança

O histórico de incidentes do repo é de **autorização e exposição**, não de credencial roubada — `#288`, `#228`, o IDOR de permissões, o `kitchen:2`, as 18 escritas sem `_ctx`. MFA não teria impedido nenhum deles. Isso não torna o MFA errado; torna incompleto entregar segundo fator sem responder *"o que o invasor fez"*.

Toda operação classificada como `"session"` ou `"fresh"` grava `access_control.sensitive_operation_log` (ator, operação, grau, alvo). É a mesma migration, a mesma revisão, e provavelmente mais valor por hora que o próprio segundo fator. O gravador vive no mesmo ponto do gate (D5), então não há caminho que passe pelo gate e escape do log.

### D16 — Aviso de segurança: o canal garantido é o log; e-mail é best-effort declarado

O sisub **não tem** e-mail transacional. O único do monorepo é `apps/portal/src/lib/journal/email.server.ts` (Resend), e o próprio cabeçalho diz: *"Sem provider configurado, a função é best-effort e não faz nada"*. Prometer quatro avisos de segurança por e-mail criaria uma garantia de detecção que falha em silêncio — pior que não prometer.

Decisão: o registro em banco é o canal **garantido**; o e-mail é entrega adicional, explicitamente best-effort, e a ausência de provider configurado aparece em `capabilities.server.ts` (mesmo padrão do "Em breve" dos fluxos de IA) em vez de sumir. Nenhuma spec afirma que o titular *será notificado por e-mail* — afirma que o evento *é registrado*.

### D17 — Limite de tentativas que não vira botão de bloqueio

Limite de código de recuperação apenas por `user_id` entrega ao atacante uma negação de serviço: queimar tentativas contra o e-mail da vítima tranca a recuperação dela. O limite SHALL ser por par (usuário, origem) com teto global mais alto, e SHALL NOT bloquear o caminho de reset administrativo — que é o caminho de socorro.

## Auditoria de atrito (o que o usuário sente, operação por operação)

| Operação | Grau | Frequência real | Pessoas | Prompts/mês estimados | Veredito |
|---|---|---|---|---|---|
| Conceder/alterar permissão | `fresh` | raro, em lotes | ~dezenas | 1–3 (a janela cobre o lote) | desprezível |
| Criar chave MCP | `fresh` | raríssimo | poucos | <1 | desprezível |
| Grant a parceiro externo | `fresh` | raríssimo | poucos | <1 | desprezível |
| Reset do ambiente de treino | `fresh` | raro | poucos | <1 | desprezível |
| Exportar dado nominal | `fresh` | eventual | dezenas | 1–4 | aceitável — **só a ação de exportar, a tela abre livre** |
| Remover MFA de outra pessoa | `fresh` | raro | poucos | <1 | desejável que doa um pouco |
| Empenho / liquidação / pagamento / conciliação | `session` | **volume diário** | dezenas | **0** | **zero atrito no turno** — é a decisão D2 |
| Lançar produção, cardápio, estoque | — | volume diário | centenas | 0 | intocado |
| Consultar qualquer tela | — | contínuo | todos | 0 | intocado (D3) |
| Login | — | 1×/sessão | quem tem fator | ~1/semana | 6 dígitos |

Pontos de atrito residual, e o que cada um recebe:

- **Modal no meio de um formulário longo** → o wrapper de mutação guarda o payload, abre o modal por cima do formulário preenchido e **reenvia a mesma ação**. Nunca redireciona para `/auth`. Cancelar volta ao formulário intacto, sem deslogar.
- **Usuário sem fator esbarrando num gate** → `nextStep: "enroll"`, cadastro ali mesmo, e a ação segue — o formulário sobrevive porque verificar promove a sessão atual.
- **Relógio do celular dessincronizado** → após dois códigos recusados, a mensagem muda para orientar data/hora automáticas. É a causa nº 1 de TOTP "quebrado" e, sem essa frase, vira chamado.
- **Cadastrar fator desloga as outras sessões** → aviso explícito **antes** do botão final, senão o usuário conclui que quebrou o sistema.
- **Quem não tem celular** → TOTP em gerenciador de senhas no desktop institucional ou token físico programável. Só alcança as dezenas de contas com nível ≥2, não os ~800 comensais.
- **Obrigatoriedade** → aviso em faixa (não modal — mesmo espírito do aviso de ciência da LGPD, que não bloqueia navegação) por ~30 dias antes de qualquer bloqueio.

## Risks / Trade-offs

- **Engenharia social contra quem faz o reset** → é o ataque principal contra MFA. Mitigação: D9 (administrador em elevação `fresh`, verificação fora do e-mail declarada na tela, justificativa, log nominal, aviso ao alvo) + D8 (fator reserva obrigatório no nível 3 reduz a frequência do procedimento a quase zero).
- **Código de recuperação vaza e vira bypass** → restrito a nível ≤2, uso único, hash, limite server-side, aviso por e-mail, e o fluxo só **remove** o fator (D7), exigindo recadastro visível.
- **Único administrador perde tudo** → o recurso final é o dashboard do Supabase, que tem service-role e alcança qualquer fator. Isso torna a conta do projeto Supabase a raiz de confiança real: precisa ter MFA próprio e mais de uma pessoa com acesso, escrito em procedimento e não descoberto no dia.
- **Reset de senha por e-mail vira contorno** → o fluxo de recovery autentica em AAL1; o fator **não** pode ser removido a partir de sessão só-recovery. É a linha que sustenta o valor inteiro do 2FA: sem ela, o e-mail continua sendo fator único.
- **`lastFactorAt` lido de `amr[0]`** → renovaria a elevação a cada refresh de token. Mitigação: ler a entrada de método `totp`, com teste dedicado.
- **Adoção rejeitada pela organização** → faseamento (voluntário → nível 3 → step-up → nível ≥2), e a válvula de escape do plano: manter obrigatório só no nível 3 e usar `fresh` no resto. Segurança menor que o plano cheio, infinitamente maior que um plano cheio que ninguém implanta.
- **`UserContext` ganha campos** → os 6 apps recompilam. Campos com default seguro (`aal: 1`, `origin: "session"`) e nenhum piso ativo no início: o comportamento de autorização não muda até a política ser preenchida.
- **Sessão roubada cadastra o próprio fator e expulsa a vítima** → D14 (reautenticação por senha antes do `enroll`, registro e aviso do cadastro). Sem isso, a mudança **piora** o cenário de sessão roubada em relação ao estado atual.
- **Grau `session` não resiste a roubo de sessão** → é o custo explícito de D2. Uma sessão AAL2 sequestrada executa toda a execução orçamentária sem novo desafio. Aceito conscientemente em troca de zero atrito no turno; quem quiser fechar isso troca finanças para `fresh` e paga ~16 desafios por turno. A compensação real é D15 (auditoria), que não previne mas responde.
- **Um administrador comprometido derruba os demais** → quem tem `admin` nível 3 remove o MFA de qualquer outro administrador. Mitigação parcial: D10 (elevação fresca, justificativa, log) + D15 (registro) + fator reserva obrigatório reduzindo a frequência legítima do procedimento a quase zero. Mitigação completa exigiria duas pessoas para o reset — fora de escopo, e anotado em Open Questions.
- **Negação de serviço na recuperação** → D17 (limite por usuário **e** origem, nunca bloqueando o reset administrativo).
- **A confirmação "verifiquei por canal alternativo" é lembrete, não trava** → nenhum checkbox impediu alguém apressado. O que sustenta D10 é o registro nominal + aviso + revisão posterior: é detecção, e está declarado como tal.
- **`sucont` fica fora e é onde está o dinheiro contábil** → mesmo PBAC, mesmo banco, sem MFA: o atacante escolhe a porta sem tranca. A avaliação de garantia nasce compartilhada em `@iefa/pbac` justamente para que a adoção no `sucont` seja uma proposta curta, não uma reescrita.
- **Entregar fases 1–2 e parar é só custo** → cadastro voluntário sem nenhum gate não protege nada. Se o projeto for interrompido, o corte aceitável é *depois* do grupo de step-up, nunca antes.
- **Verde local, vermelho no CI** → as tabelas novas entram na suíte de integração, que roda contra banco real; e o `.env` local não pode voltar a mascarar credencial ausente (a trava `--no-env-file`/`loadEnv` já está no repo).

## Migration Plan

0. **Spikes V1–V3** contra um projeto Supabase de teste. Resultado registrado aqui antes de qualquer código.
1. **Package + banco, inertes.** `UserContext` estendido, registro todo em `"none"`, erro tipado e a avaliação ligada nos três pontos de autorização. Nada muda para ninguém — registro sem exigências é o rollback natural.
1b. **Auditoria das operações sensíveis (D15)** ligada desde já, com o registro de classificação preenchido e nenhum piso de garantia ativo. Entrega valor sozinha e independe do resultado das spikes.
2. **Cadastro voluntário.** `/diner/security` no sisub, cartão discreto em `/diner/profile`, códigos de recuperação, fator reserva. Métrica: quantos cadastraram.
3. **Nível 3 obrigatório**, com fator reserva obrigatório. Poucas dezenas de contas, as que entendem o motivo. Tela de reset administrativo entra junto — é pré-requisito, não sequela.
4. **Step-up `fresh` nas operações críticas** e `session` nas financeiras. Quem já cadastrou só vê a caixa de 6 dígitos.
5. **Nível ≥2 obrigatório**, com prazo anunciado e faixa de aviso por 30 dias.
6. **Chave MCP**: origem `api-key` + prazo obrigatório. Chaves existentes ganham prazo por backfill com aviso prévio — expirar chave em produção sem aviso quebra integração numa terça de manhã.

**Rollback**: zerar as exigências do registro devolve o sistema ao comportamento atual sem migration reversa e sem deploy de banco. Os fatores cadastrados permanecem, inertes.

## Open Questions

- **Data da obrigatoriedade do nível ≥2** — depende de decisão organizacional, não técnica.
- **Token físico para quem não pode portar celular** — quantas pessoas, e se a aquisição (importado, programável) cabe no processo. Enquanto não houver, gerenciador de senhas no desktop cobre o caso.
- **Passkey/WebAuthn** — o Supabase documenta como método de login; falta confirmar se promove a AAL2 como fator. Se promover, é o melhor caminho para conta administrativa em máquina institucional fixa.
- **Adoção pelos demais apps** — o gate nasce em `@iefa/pbac`, compartilhado. Ativar em `sucont` (execução contábil) e `portal` é decisão de proposta própria; deixar para depois arrisca repetir o padrão do `cursor: pointer`, corrigido em seis lugares porque nasceu em um.
- **Reset administrativo por duas pessoas** — fecharia o risco do administrador único comprometido, ao custo de tornar o socorro dependente de duas agendas. Decisão organizacional.
- **Retenção do `sensitive_operation_log`** — por quanto tempo, e se entra no inventário de dados da política de privacidade (registra ator e alvo, ambos identificados).
- **Confirmar o rótulo de `amr` do fluxo de recuperação de senha** — o bloqueio de "sessão de recovery não mexe em fator" procura `method === "recovery"`, que a referência de claims do Supabase lista entre os métodos reconhecidos. Falta ver um token real de recuperação deste projeto. A implementação **falha aberto** de propósito (sem `amr`, não bloqueia): bloquear todo mundo do cadastro seria pior que a janela que fica aberta.
- **Traduzir as mensagens de erro de MFA do GoTrue** em `@iefa/auth-kit/errors.ts` — confirmar a lista de códigos (`mfa_challenge_expired`, `mfa_verification_failed`, …) contra a versão do GoTrue do projeto.

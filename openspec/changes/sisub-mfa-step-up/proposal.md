## Why

Hoje a conta de qualquer usuário do ERP — inclusive a que concede permissões, empenha recurso público e exporta dados nominais de 68 mil militares — é protegida **apenas por senha**, e a única trava de tentativas (`packages/auth-kit/src/rate-limiter.ts`) vive no `sessionStorage` do navegador e se declara, no próprio comentário, "freio de UX, não controle de segurança". Quem obtém a senha de um administrador obtém tudo o que o PBAC concede a ele, sem segundo obstáculo; e quem obtém a caixa de e-mail obtém a senha, porque a recuperação é só por e-mail.

O incidente `#288` (dado pessoal de 68k militares servido anonimamente por mais de oito meses) mostrou que a autorização escrita certa não basta quando um único caminho a contorna. Segundo fator e elevação de identidade fecham o caminho que sobra: o do credencial roubado.

## What Changes

- **Cadastro de segundo fator (TOTP)** — nova tela `/diner/security` no sisub, com cadastro por QR code, gestão de fatores, **fator reserva** (segundo TOTP) e lista de sessões ativas. Reaproveita `supabase.auth.mfa.*`, que já existe no GoTrue do projeto.
- **Garantia de identidade (AAL) no `UserContext`** — `@iefa/pbac` passa a carregar `aal` e `amr` (do JWT, já assinado e validado) e a origem da credencial (`session` | `api-key`). O `UserContext` de hoje só tem `userId` + `permissions`.
- **Gate de elevação nos três pontos de autorização** — a avaliação de garantia é função pura de `@iefa/pbac`, aplicada em `requireLevel`/`requireAnyLevel` (`@iefa/pbac/start`, para os outros apps), em `requireAuthWithPermission` (`apps/sisub/src/lib/auth.server.ts:69` — por onde passam execução orçamentária e estoque) e nos guards de `packages/sisub-domain/src/guards/`. A classificação vive **em código**, num registro único versionado e testável.
- **Erro tipado `MFA_REQUIRED`** — hoje `forbidden()` devolve 403 com uma string, e a UI não distingue "você não pode" de "eleve sua identidade". Sem isso, o modal de elevação nunca abre e o usuário vê "acesso negado" numa operação que ele pode fazer.
- **Step-up por operação, com janela de 15 minutos** — modal de confirmação que **preserva o formulário preenchido** e reenvia a ação; nunca redireciona para `/auth`.
- **Reautenticação por senha antes de cadastrar fator** — sem isso a mudança *piora* o cenário de sessão roubada: verificar um fator desconecta todas as outras sessões, então quem rouba uma sessão cadastra o próprio TOTP e tranca o titular para fora.
- **Registro de operações sensíveis** — nova tabela `access_control.sensitive_operation_log`. Hoje não existe registro de quem concedeu qual permissão nem de quem empenhou; segundo fator reduz a chance de invasão, mas só a auditoria responde "o que foi feito".
- **Códigos de recuperação** — o Supabase **não** os tem nativamente, e `mfa.unenroll()` exige AAL2: sem construção própria, perder o dispositivo é perder a conta. Nova tabela `access_control.mfa_recovery_code` (código hasheado, uso único) e fluxo que **remove o fator** e obriga recadastro — ele não forja AAL2. Indisponíveis para **conta protegida**, definida por alcançar operação classificada (e não por número de nível: a execução orçamentária é `unit` nível **2**).
- **Reset administrativo auditado** — `supabase.auth.admin.mfa.deleteFactor`, exigindo que o administrador esteja ele mesmo em AAL2, com justificativa e registro nominal em `access_control.mfa_reset_log` (mesmo formato do `training_reset_log` já existente).
- **Chave MCP deixa de ser bypass** — `apps/sisub-mcp/src/auth.ts` (`resolveApiKey`) devolve hoje o `UserContext` **completo** do dono: uma chave é elevação permanente sem segundo fator. Passa a marcar origem `api-key`, que **nunca** satisfaz `minAal`, e ganha prazo obrigatório.
- **BREAKING (interno)**: a assinatura de `UserContext` em `@iefa/pbac` ganha campos. Os 6 apps que o consomem recompilam; nenhum comportamento de autorização existente muda enquanto o piso de AAL não for ativado por módulo.

## Capabilities

### New Capabilities
- `mfa-enrollment`: cadastro, verificação e remoção de fatores TOTP; fator reserva; tela de segurança da conta; desafio de segundo fator no login; gestão de sessões ativas.
- `mfa-recovery`: códigos de recuperação (geração, hash, uso único, limite de tentativas), autoatendimento de perda de dispositivo, reset administrativo auditado e os avisos por e-mail de cada um.
- `sensitive-operation-audit`: registro apenas-inserção das operações classificadas, consulta restrita a `admin` nível 3, e a regra de que o canal garantido de aviso de segurança é o banco — e-mail é best-effort declarado.
- `identity-assurance-guards`: AAL e origem da credencial no `UserContext`; piso `minAal` por módulo/nível; janela de elevação; erro tipado `MFA_REQUIRED`; teste de contrato exaustivo que classifica toda server function.

### Modified Capabilities
- `server-auth-guards`: os guards ganham o eixo de garantia de identidade. As server functions de alto impacto (permissões, empenho/liquidação/pagamento, chave MCP, grant a parceiro externo, reset de treino, exportação de dados nominais) passam a exigir AAL2 **além** do nível PBAC que já exigem.

## Impact

**Apps afetados**: `sisub` (todas as telas novas e o step-up), `sisub-mcp` (origem da credencial), e — por herança do package — `portal`, `sucont`, `rumaer`, `forms`, `assignment-selection`, que recompilam sem mudança de comportamento.

**Packages**: `@iefa/pbac` (`types.ts`, `start.ts`, `guards.ts`, tabela de política de AAL), `@iefa/auth-kit` (ações de MFA e tradução das mensagens do GoTrue), `@iefa/database` (duas migrations).

**Banco**: `access_control.mfa_recovery_code`, `access_control.mfa_reset_log` e `access_control.sensitive_operation_log` (tabelas novas); `access_control.mcp_api_keys` ganha prazo obrigatório. Nenhuma tabela existente muda de forma incompatível.

**Pré-requisitos de verificação**: três premissas do desenho ainda não foram confirmadas contra o ambiente real (renovação de `amr` em sessão já AAL2, comportamento de `enroll` com fator existente, e se o projeto assina o JWT com chave assimétrica). Estão listadas em `design.md` como V1–V3 e bloqueiam o início da implementação.

**Externo**: nenhuma dependência nova. O `supabase.auth.mfa.*` e o `auth.admin.mfa.deleteFactor` já estão no `@supabase/supabase-js` em uso. Nenhum custo de gateway, porque o fator é TOTP — e nenhum dado pessoal novo é coletado, o que evita acionar a revisão da Política de Cookies exigida pelo `LGPD.md`.

**Operacional**: o dashboard do Supabase passa a ser o recurso de último caso para destravar conta administrativa — precisa estar em procedimento escrito, com MFA próprio e mais de uma pessoa com acesso.

## Não-objetivos

- **Não** tornar MFA obrigatório para os ~800 comensais. Comensal segue entrando com senha; o cadastro é voluntário para quem tem só `diner`.
- **Não** implementar SMS/telefone como fator. Custa gateway, é vulnerável a SIM swap e — decisivo — obrigaria a guardar telefone de militar, criando dado pessoal e destinatário novos que o `LGPD.md` manda inventariar antes do uso.
- **Não** implementar passkey/WebAuthn nesta etapa. O Supabase documenta passkey como método de login, não como fator de MFA; entra em avaliação futura.
- **Não** criar um "nível 4 = MFA" no PBAC. Autorização e garantia de identidade são eixos ortogonais; fundi-los faria todo call site de `hasPermission` mentir.
- **Não** forjar AAL2 a partir de código de recuperação ou de hook de token. O código de recuperação remove o fator e obriga recadastro.
- **Não** migrar os demais apps (`sucont`, `portal`, `rumaer`, `forms`) para MFA obrigatório nesta etapa. O gate nasce compartilhado no package e os pisos por módulo deles ficam vazios até serem propostos separadamente.
- **Não** substituir a trava de tentativas do GoTrue por implementação própria de rate limit de login.

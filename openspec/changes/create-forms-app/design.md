## Context

O monorepo IEFA já possui 6 apps com diferentes responsabilidades. O app `portal` (React 19 + TanStack Start + Vite + Nitro SSR) é a referência de design e stack. O banco de dados é Supabase e já existem os schemas `sisub`, `iefa` e `journal`. O deploy é feito no Fly.io via `fly.toml` por app.

O app `forms` será um produto independente dentro do monorepo, com tela de resposta de questionários para usuários autenticados, persistência imediata de respostas (draft) e envio oficial (sent).

## Goals / Non-Goals

**Goals:**
- App `forms` autônomo, deployável independentemente
- Mesmo design system do `portal` (Pale Brutalism 2026, zero border-radius, Base UI)
- Autenticação Supabase (email + password) idêntica ao portal
- Schema `forms` isolado no Supabase
- Auto-save por pergunta (status `draft`) com recuperação de estado ao retornar
- Envio único por questionário (`sent`) com bloqueio de reenvio
- Integração no Turborepo sem quebrar os outros apps

**Non-Goals:**
- Editor visual de questionários (criação via SQL/migrations apenas)
- Relatórios e analytics de respostas
- Notificações (e-mail, push)
- Multi-tenancy ou ACL granular por questionário

## Decisions

### 1. Stack idêntica ao portal (TanStack Start + Nitro SSR)

**Decisão**: usar `@tanstack/react-start` + Nitro SSR, igual ao `portal`.

**Alternativa considerada**: SPA puro (Vite + TanStack Router sem SSR). Mais simples, mas o portal já tem o padrão com SSR e o user quer "interface igual".

**Motivo**: reutilizar configuração de vite, tailwind, componentes UI e padrão de auth do portal sem adaptações. SSR também ajuda com o primeiro carregamento da tela de resposta.

---

### 2. Auto-save com `upsert` no Supabase via client-side

**Decisão**: ao sair de um campo (onBlur) ou ao selecionar opção (onChange para radio/checkbox), fazer `upsert` direto via `@supabase/supabase-js` (client-side).

**Alternativa considerada**: server function ou endpoint Hono. Adiciona latência e complexidade sem ganho real — o Supabase tem RLS para isolar dados por usuário.

**Motivo**: simplicidade, latência mínima (client → Supabase direto), RLS garante que cada usuário só escreve suas próprias respostas.

---

### 3. Schema `forms` isolado no Supabase

**Decisão**: criar schema `forms` no Supabase. Tabelas: `questionnaires`, `sessions`, `questions`, `answers`.

**Alternativa considerada**: usar schema `iefa` genérico. Acoplaria dados de formulários com outros dados do iefa, dificultando migrações e RLS.

**Motivo**: isolamento, autonomia de migração, RLS por schema mais claro.

---

### 4. Status de resposta: `draft` / `sent` na tabela `answers`

**Decisão**: cada `answer` tem `status: 'draft' | 'sent'`. Submit = `UPDATE answers SET status='sent' WHERE questionnaire_id=? AND user_id=?`.

**Alternativa considerada**: tabela separada `submissions` com status. Mais normalizada, mas a query de recuperação fica mais complexa e o auto-save precisa de um join extra.

**Motivo**: simplicidade de query, recovery trivial (`SELECT * FROM answers WHERE ... AND status='draft'`), sem JOIN extra no caminho crítico.

---

### 5. Bloqueio de reenvio via constraint + verificação de frontend

**Decisão**: na tela de questionário, verificar se já existe alguma `answer` com `status='sent'` para o par `(questionnaire_id, user_id)`. Se sim, exibir tela de "já respondido".

**Alternativa considerada**: constraint UNIQUE no banco em tabela de submissions. Mais robusto, mas o design com status `draft/sent` já exige lógica de verificação no frontend de qualquer forma.

**Motivo**: a verificação no frontend é suficiente e evita erro silencioso de violação de constraint.

---

### 6. Componentes UI copiados do portal (não shared package)

**Decisão**: copiar `src/components/ui/` do portal para `apps/forms/src/components/ui/` manualmente.

**Alternativa considerada**: extrair para package `@iefa/ui`. Seria a solução ideal a longo prazo, mas está fora do escopo desta task — o portal não usa packages compartilhados de UI atualmente.

**Motivo**: sem scope creep; os design systems de sisub e portal são intencionalmente incompatíveis — um shared package precisaria de configuração adicional.

## Modelo de Dados

```sql
-- Schema: forms

CREATE TYPE forms.answer_status AS ENUM ('draft', 'sent');
CREATE TYPE forms.question_type AS ENUM ('text', 'single_choice', 'multiple_choice', 'rating', 'date');

CREATE TABLE forms.questionnaires (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  description text,
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE forms.sessions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  questionnaire_id   uuid NOT NULL REFERENCES forms.questionnaires(id) ON DELETE CASCADE,
  title              text NOT NULL,
  "order"            int NOT NULL DEFAULT 0
);

CREATE TABLE forms.questions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES forms.sessions(id) ON DELETE CASCADE,
  text        text NOT NULL,
  type        forms.question_type NOT NULL DEFAULT 'text',
  required    bool NOT NULL DEFAULT false,
  "order"     int NOT NULL DEFAULT 0,
  options     jsonb  -- array de {value: string, label: string} para choice questions
);

CREATE TABLE forms.answers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id       uuid NOT NULL REFERENCES forms.questions(id) ON DELETE CASCADE,
  questionnaire_id  uuid NOT NULL REFERENCES forms.questionnaires(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id),
  value             jsonb NOT NULL,
  status            forms.answer_status NOT NULL DEFAULT 'draft',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, user_id)
);
```

**RLS**:
- `answers`: usuário só lê/escreve suas próprias respostas (`user_id = auth.uid()`)
- `questionnaires`, `sessions`, `questions`: todos autenticados podem ler

## Estrutura do App

```
apps/forms/
├── src/
│   ├── auth/
│   │   ├── config.ts          # Supabase client (igual portal)
│   │   ├── service.ts         # signIn, signOut, getSession
│   │   └── view/
│   │       └── AuthScreen.tsx # Tela de login
│   ├── components/
│   │   └── ui/               # Cópia dos componentes Base UI do portal
│   ├── routes/
│   │   ├── __root.tsx        # Root layout + auth guard
│   │   ├── index.tsx         # Lista de questionários disponíveis
│   │   ├── login.tsx         # Rota pública de login
│   │   └── questionnaires/
│   │       └── $id.tsx       # Tela de resposta
│   ├── lib/
│   │   └── supabase.ts       # Cliente Supabase (browser)
│   ├── client.tsx
│   ├── router.tsx
│   └── app.css
├── public/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.ts (se necessário)
├── .env.example
├── .env.schema
└── fly.toml
```

## Fluxo de Auto-save e Recovery

```
Usuário acessa /questionnaires/:id
  → busca respostas draft do usuário para esse questionário
  → popula estado local com os valores recuperados
  → renderiza perguntas com valores preenchidos

Usuário responde uma pergunta (onBlur / onChange)
  → upsert em forms.answers com status='draft'
  → estado local atualizado otimisticamente

Usuário clica "Enviar"
  → verificar se há perguntas required sem resposta
  → UPDATE forms.answers SET status='sent' WHERE questionnaire_id=? AND user_id=?
  → redirecionar para tela de confirmação
```

## Risks / Trade-offs

- **Race condition no auto-save**: dois eventos rápidos podem gerar upserts concorrentes. Mitigação: debounce de 300ms nos campos de texto; para choice é imediato (idempotente).
- **RLS mal configurada expõe respostas**: mitigação — testar RLS com usuário diferente antes de deploy.
- **Usuário recarrega página com draft**: recovery deve ser transparente e não gerar UX confusa. Mitigação: exibir indicador "respostas salvas automaticamente".
- **Copiar UI do portal**: drift ao longo do tempo se o portal evoluir. Aceitável — escopo deliberado desta task.

## Migration Plan

1. Criar migration SQL em `packages/database/migrations/` (ou diretamente via Supabase dashboard)
2. Habilitar RLS nas tabelas `answers`, `questionnaires`, `sessions`, `questions`
3. Scaffold do app `forms`
4. Integrar no `turbo.json` e `package.json` raiz
5. Deploy no Fly.io (`fly launch` ou `fly deploy`)

## Open Questions

- O app `forms` precisará de admin para criar questionários na UI (futuro)? → Fora de escopo agora, mas o modelo de dados suporta.
- Fly.io app name: usar `iefa-forms` ou outro? → Decisão na hora do `fly launch`.

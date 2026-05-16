## Context

O `apps/forms` é uma aplicação full-stack (React 19 + TanStack Start + Nitro SSR) com design "Pale Brutalism" que gerencia questionários genéricos. O programa 5S da FAB precisa de uma versão visualmente diferenciada — institucional, com landing page própria — sem duplicar lógica. A tabela `forms.questionnaire` não possui campo de categorização, e o Turborepo já orquestra builds individuais por app.

**Estado atual:**
- `apps/forms/src/styles.css` — tokens de design brutalista (radius 0, sombras hard, paleta acromática)
- `apps/forms/src/routes/index.tsx` — landing page genérica "Formulários IEFA"
- `apps/forms/src/routes/_authenticated/dashboard.tsx` — lista todos os questionários sem filtro
- `apps/forms/src/server/forms.fn.ts` — CRUD sem filtro por tag
- `packages/database/supabase/migrations/20260507_create_forms_schema.sql` — schema sem coluna `tags`

## Goals / Non-Goals

**Goals:**
- Permitir que o mesmo codebase sirva duas identidades visuais (forms genérico e 5S institucional)
- Landing page 5S com conteúdo educacional sobre a metodologia
- Filtragem automática de questionários por tenant
- Manter um único ponto de debug para toda a lógica de formulários

**Non-Goals:**
- Sistema genérico de multi-tenancy (apenas 2 tenants hardcoded)
- Alteração na lógica de auth, auto-save, ou resposta de questionários
- Suporte a 4S e 5S como checklists digitais
- Extração de pacote compartilhado (`packages/forms-core`)

## Decisions

### 1. Multi-tenancy via variável de ambiente (não hostname)

**Escolha**: `VITE_APP_TENANT` env var com valores `"forms"` (default) | `"cinco-s"`

**Alternativas descartadas:**
- **Detecção por hostname**: mais elegante em produção, mas requer configuração DNS e complica dev local. Pode ser adicionado depois como fallback.
- **Rota prefixada (`/5s/*`)**: mistura dois estilos visuais no mesmo deploy, URL poluída.

**Racional**: env var é o mecanismo mais simples — zero overhead em runtime, zero configuração DNS, funciona identicamente em dev e prod. Cada deploy do Fly.io recebe seu próprio `VITE_APP_TENANT`.

### 2. TenantProvider com React Context

**Implementação**: `src/lib/tenant.tsx`

```tsx
type Tenant = "forms" | "cinco-s"
type TenantConfig = {
  id: Tenant
  name: string
  tagFilter: string[] | null // null = sem filtro (mostra tudo)
}

const TENANTS: Record<Tenant, TenantConfig> = {
  "forms": { id: "forms", name: "Formulários IEFA", tagFilter: null },
  "cinco-s": { id: "cinco-s", name: "Programa 5S", tagFilter: ["5s"] },
}
```

Disponível via `useTenant()` hook em qualquer componente. O `__root.tsx` instancia o provider lendo `import.meta.env.VITE_APP_TENANT`.

### 3. Tema 5S via CSS condicional (classe no `<html>`)

**Escolha**: Novo arquivo `src/styles/cinco-s.css` com override das CSS vars. Aplicado via classe `data-tenant="cinco-s"` no `<html>`.

**Alternativas descartadas:**
- **Dois arquivos styles.css com import condicional**: Vite não suporta import condicional de CSS em build time sem plugin custom.
- **Tailwind config diferente**: mesmos componentes precisam funcionar com ambos os temas, então as CSS vars precisam ter os mesmos nomes.

**Racional**: O sistema atual já usa CSS vars para tudo (cores, radius, shadows, fonts). Basta um seletor `[data-tenant="cinco-s"]` que sobrescreve as vars relevantes. Os componentes UI não mudam — só os tokens.

**Direção visual — "Programa VETOR 5S" (baseado nos infográficos de referência em `apps/5s/docs/`):**
- **Nome oficial**: "Programa VETOR 5S — Melhoria Contínua"
- **Slogan**: "Direção clara. Esforços alinhados. Excelência contínua."
- **Organização**: SEFA — Secretaria de Economia, Finanças e Administração da Aeronáutica
- **Primary**: azul-marinho escuro (navy ~`oklch(0.22 0.05 260)`) — cor dominante dos infográficos
- **Accent/highlight**: dourado/âmbar (~`oklch(0.75 0.15 85)`) — usado no "5S" do logo e banner "MELHORIA CONTÍNUA"
- **Icons/secondary**: teal/azul-esverdeado (~`oklch(0.55 0.12 200)`) — ícones de fases
- **Background**: branco com padrão sutil de halftone dots (estilo dos infográficos)
- **Separadores**: curva azul ondulada (wave) entre hero e conteúdo
- **Radius**: `0.5rem` (suave, institucional — não zero como Pale Brutalism)
- **Sombras**: sutis com blur leve (não hard offset)
- **Tipografia**: IBM Plex Sans mantida, mas tracking menos agressivo; headers bold condensed

### 4. Landing page 5S como rota condicional

**Escolha**: A rota `/` (`src/routes/index.tsx`) renderiza condicionalmente: `useTenant().id === "cinco-s"` → componente `CincoSLanding`, senão → componente `Home` atual.

**Alternativa descartada:**
- **Arquivos de rota separados**: TanStack Router file-based routing não suporta rotas condicionais por file. Teria que criar um wrapper.

**Racional**: Um `if` no componente da rota é a solução mais direta. A landing page 5S é um componente isolado em `src/components/cinco-s/Landing.tsx`.

### 5. Coluna `tags text[]` em `forms.questionnaire`

**Escolha**: Migração aditiva — `ALTER TABLE forms.questionnaire ADD COLUMN tags text[] NOT NULL DEFAULT '{}'`

**Alternativas descartadas:**
- **Tabela de tags separada (N:N)**: overengineering para ~2 tags
- **Coluna `category text`**: menos flexível, questionnaire pode pertencer a múltiplas categorias

**Racional**: `text[]` com GIN index é a solução mais Postgres-idiomática para tags simples. A filtragem usa `@>` (array contains).

**Server function atualizada (`getQuestionnairesFn`):**
```ts
// Se receber tags[], filtra com .contains('tags', tags)
// Se não receber, retorna tudo (comportamento atual)
```

O `TenantProvider` injeta o filtro automaticamente via hook wrapper `useQuestionnaires()`.

### 6. Dois scripts Turborepo (não dois apps)

**Escolha**: Adicionar no `package.json` raiz:
```json
"cinco-s:dev": "VITE_APP_TENANT=cinco-s bun --cwd ./apps/forms dev -- --port 3002"
```

**Alternativa descartada:**
- **Novo diretório `apps/cinco-s`** com symlink: overhead de manutenção, confunde Turborepo workspace detection.

**Racional**: É literalmente o mesmo app com uma env var diferente. Não precisa de nada mais.

## Risks / Trade-offs

| Risco | Mitigação |
|-------|-----------|
| Dev esquece de testar no tenant `cinco-s` | Script `cinco-s:dev` explícito + check visual no PR |
| CSS vars do tema 5S divergem dos nomes esperados | Tema 5S sobrescreve exatamente as mesmas vars de `:root` — componentes não mudam |
| Coluna `tags` sem enum — valores livres | Validação no server function via Zod (`z.array(z.enum(["5s"]))`) — extensível depois |
| Landing page 5S fica grande demais no bundle genérico | Componente lazy-loaded (`React.lazy`) — só carrega no tenant 5S |
| Hostname detection futura pode conflitar com env var | Prioridade definida: env var > hostname > default "forms" |

## Migration Plan

1. **Migration DB**: `ALTER TABLE forms.questionnaire ADD COLUMN tags text[] NOT NULL DEFAULT '{}'` + GIN index
2. **Código**: TenantProvider → tema CSS → landing page → filtro no dashboard → server function com filtro
3. **Turborepo**: novo script `cinco-s:dev` no `package.json` raiz
4. **Deploy**: novo app Fly.io (ou machine) com `VITE_APP_TENANT=cinco-s`
5. **Rollback**: remover classe `data-tenant`, provider retorna sempre `"forms"` — zero impacto funcional

## Conteúdo Institucional (extraído de `apps/5s/docs/`)

O programa se chama **"Programa VETOR 5S"** e opera em **7 fases cíclicas** (NITI DUS):

| Fase | Nome | Descrição |
|------|------|-----------|
| 1 - N | Nivelar | Sensibilização, estruturação e preparação para implantação |
| 2 - I | Implementar | Execução prática dos 3 primeiros S (1S Utilização, 2S Ordenação, 3S Limpeza) |
| 3 - T | Tornar Padrão (Padronização) | Estabelecer padrões e rotinas para qualidade e uniformidade |
| 4 - I | Inspecionar | Verificação sistemática dos resultados e conformidade |
| 5 - D | Demonstrar | Apresentação dos resultados, reconhecimento dos esforços |
| 6 - U | Utilizar | Integração do 5S à rotina diária, manutenção dos padrões |
| 7 - S | Sofisticar | Busca contínua pela excelência, inovação e geração de valor |

**Base 5S**: 1° Utilização, 2° Ordenação, 3° Limpeza, 4° Padronização, 5° Disciplina

**Propósito**: "Promover ambientes organizados, padronizados e sustentáveis, impulsionando a eficiência, a qualidade e a melhoria contínua em todas as unidades."

**Benefícios**: Mais Eficiência, Menos Desperdícios, Mais Qualidade, Engajamento, Melhoria Contínua

**Princípios**: Simplicidade, Disciplina, Continuidade

Todo esse conteúdo está disponível nos infográficos e DEVE ser utilizado na landing page.

## Open Questions

1. **Nome do deploy Fly.io para o 5S** — usar `cinco-s` ou reutilizar o app `forms` com hostname detection?
2. **Logo SEFA** — extrair como SVG dos infográficos ou já existe em formato vetorial?
3. **Questionnaires existentes** — marcar algum questionnaire existente com tag `5s` retroativamente?

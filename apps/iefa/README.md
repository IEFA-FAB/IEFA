# IEFA Journal Management System

Sistema completo de gestão de periódico científico desenvolvido com TanStack Start, React Query, e Supabase.

## 🎯 Visão Geral

O IEFA Journal é um sistema moderno de gestão de publicações científicas que cobre todo o fluxo editorial:
- Submissão de artigos (bilíngue PT/EN)
- Revisão por pares
- Gestão editorial (Kanban + Table view)
- Publicação com DOI e metadados
- Exportação para Crossref/JATS/Dublin Core

## 🚀 Quick Start

```bash
# Instalar dependências
pnpm install

# Configurar variáveis de ambiente
cp .env.example .env.local
# Editar .env.local com suas credenciais Supabase

# Rodar em desenvolvimento
pnpm iefa:dev

# Build para produção
pnpm iefa:build
```

## 📁 Estrutura do Projeto

```
src/
├── routes/
│   └── journal/              # Todas as rotas do sistema de periódico
│       ├── index.tsx         # Homepage do journal
│       ├── submit.tsx        # Formulário de submissão
│       ├── articles/         # Artigos públicos
│       ├── submissions/      # Submissões do usuário
│       ├── review/           # Sistema de revisão
│       └── editorial/        # Dashboard editorial (protegido)
├── components/
│   └── journal/              # Componentes do journal
│       ├── SubmissionForm/   # Multi-step submission
│       └── editorial/        # Kanban, filters, metrics
├── lib/
│   └── journal/              # Lógica de negócio
│       ├── client.ts         # Funções Supabase
│       ├── hooks.ts          # React Query hooks
│       └── types.ts          # TypeScript types
└── lib/
    └── i18n.tsx              # Sistema de traduções PT/EN
```

## 🔑 Features Principais

### Para Autores
- ✅ Submissão de artigos com metadados bilíngues
- ✅ Upload de PDF e arquivos fonte
- ✅ Acompanhamento de status das submissões
- ✅ Visualização de artigos publicados

### Para Revisores
- ✅ Aceitação/recusa de convites via token
- ✅ Dashboard de revisões pendentes
- ✅ Formulário completo de revisão com scoring
- ✅ Comentários para autores e editores

### Para Editores
- ✅ Dashboard com Kanban drag-and-drop
- ✅ Visualização em tabela com ordenação
- ✅ Filtros avançados (busca, status, tipo, data)
- ✅ Workflow de publicação em 4 etapas
- ✅ Atribuição de DOI
- ✅ Exportação de metadados
- ✅ Gerenciamento de volumes/edições

## 🛠️ Stack Tecnológica

### Frontend
- **Framework:** TanStack Start (React)
- **Routing:** TanStack Router (file-based)
- **State:** TanStack Query (server state)
- **Styling:** Tailwind CSS + @iefa/ui
- **Forms:** TanStack Form + Zod
- **Drag & Drop:** @dnd-kit
- **i18n:** Custom type-safe system

### Backend
- **Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth
- **Storage:** Supabase Storage (file uploads)
- **Schema:** `journal.*` (dedicated schema)

## 📊 Fluxos de Trabalho

### Submissão de Artigo
1. Autor preenche formulário em 6 etapas
2. Upload de PDF e arquivos fonte
3. Sistema gera número de submissão automático
4. Status inicial: `submitted`

### Revisão por Pares
1. Editor convida revisor (token via email)
2. Revisor aceita/recusa convite
3. Revisor preenche formulário com scores e feedback
4. Submissão atualiza status da revisão

### Publicação
1. Editor seleciona artigo aceito
2. Atribui volume, edição, páginas, data
3. Gera/atribui DOI
4. Publica artigo (visível publicamente)

## 🎨 Design System

O projeto usa o design system `@iefa/ui` com:
- Tema claro/escuro
- Componentes acessíveis
- Glassmorphism effects
- Micro-animations
- Loading skeletons
- Empty states informativos

## 🔐 Proteção de Rotas

```typescript
// Rotas públicas
/journal                    # Homepage
/journal/articles           # Browse articles
/journal/articles/:id       # Article detail

// Autenticadas
/journal/submit             # Submit article
/journal/submissions        # My submissions
/journal/profile            # User profile
/journal/review             # Reviewer dashboard

// Apenas editores
/journal/editorial/*        # Editorial features
```

## 📝 Desenvolvimento

### Adicionando Nova Feature

1. **Criar tipo** em `lib/journal/types.ts`
```typescript
export interface NewFeature {
  id: string;
  // ...
}
```

2. **Adicionar client function** em `lib/journal/client.ts`
```typescript
/**
 * Description of what this does
 * @param param - Description
 * @returns Description
 */
export async function getNewFeature(id: string) {
  const { data, error } = await supabase
    .schema('journal')
    .from('table_name')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) throw error;
  return data;
}
```

3. **Criar query option** em `lib/journal/hooks.ts`
```typescript
export const newFeatureQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ['journal', 'new-feature', id],
    queryFn: () => getNewFeature(id),
    staleTime: 1000 * 60 * 5, // 5 min
  });
```

4. **Usar em rota** com `useSuspenseQuery`
```typescript
export const Route = createFileRoute('/journal/feature/$id')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      newFeatureQueryOptions(params.id)
    ),
  component: FeatureComponent,
});

function FeatureComponent() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(newFeatureQueryOptions(id));
  
  return <div>{data.name}</div>;
}
```

### Error Handling

O TanStack Query já fornece error handling automático:

```typescript
// Em componentes
const { data, error, isLoading } = useSuspenseQuery(query);

// Error boundaries catch erros
// Adicione <ErrorBoundary> nos layouts
```

### Internacionalização

```typescript
import { useT } from '@/lib/i18n';

function MyComponent() {
  const t = useT();
  
  return (
    <div>
      <button>{t.common.save}</button>
      <p>{t.status.published}</p>
      <ErrorMessage>{t.forms.required}</ErrorMessage>
    </div>
  );
}
```

## 🧪 Testes

### Integration Tests (Recomendado)
```bash
# Setup
pnpm add -D vitest @testing-library/react @testing-library/user-event

# Rodar testes
pnpm test
```

### E2E Tests (Fluxos Críticos)
```bash
# Setup
pnpm add -D @playwright/test

# Rodar E2E
pnpm test:e2e
```

## 🚀 Deploy

### Pré-requisitos
1. Database migrations aplicadas
2. Supabase Storage bucket configurado
3. Variáveis de ambiente setadas
4. RLS policies verificadas

### Build
```bash
pnpm iefa:build
```

### Variáveis de Ambiente Necessárias
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

## 📚 Documentação Adicional

- **PRD:** `PRD.md` - Product Requirements Document
- **Design System:** `design-system.md` - Padrões e guidelines
- **Steps:** `steps.md` - Plano de implementação
- **Audit Report:** `.gemini/*/audit_report.md` - Issues e melhorias

## 🤝 Contribuindo

1. Seguir padrões do design system
2. Adicionar JSDoc em funções públicas
3. Fazer testes de integração para flows críticos
4. Usar TypeScript strict
5. Testar em mobile e desktop

## 📄 Licença

Propriedade do IEFA (Instituto de Estudos e Formação Avançada).

---

**Desenvolvido com ❤️ pela equipe IEFA**

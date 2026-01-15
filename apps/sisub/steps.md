# Fase 1: Setup e Infraestrutura (Foundation)

O objetivo é preparar o terreno para o desenvolvimento, garantindo que a tipagem e a autenticação estejam sólidas antes de criar telas.

- [X] **1.1. Inicialização do Projeto**
  - Inicializar projeto com TanStack Start.
  - Configurar Tailwind CSS v4.
  - Instalar dependências core: `@tanstack/react-query`, `@tanstack/react-router`, `@tanstack/react-form`, `zod`, `@supabase/supabase-js`, `lucide-react`, `sonner`.
  - Configurar alias de importação (`@/*` apontando para `./src`).

- [X] **1.2. Integração com Supabase**
  - Criar cliente Supabase Singleton em `src/lib/supabase.ts`.
  - Gerar tipos do banco de dados (Database Types) via CLI do Supabase e salvar em `src/types/database.types.ts`.
  - **Ação Crítica:** Criar o arquivo `src/types/domain.ts` para exportar interfaces limpas que estendem ou compõem os tipos do banco (ex: `RecipeWithIngredients`, `DailyMenuWithItems`).

- [X] **1.3. Configuração do TanStack Query**
  - Configurar o `QueryClient` com `staleTime` padrão.
  - Configurar o `PersistQueryClient` (plugin) para persistência em `localStorage` (necessário para o RF03 - Cache de Insumos).

- [X] **1.4. Autenticação e Contexto de Usuário**
  - Criar Hook `useAuth` que encapsula a sessão do Supabase.
  - Criar um `AuthProvider` para envolver a aplicação.
  - Implementar lógica de proteção de rotas (Redirecionar para `/login` se não autenticado).

---

## Fase 2: Design System e Layout (Shell)

Implementação da estrutura visual e navegação baseada em papéis.

- [X] **2.1. UI Kit Base (`@iefa/ui`)**
  - Como o PRD cita um pacote interno, criar a pasta `src/components/ui` e implementar os componentes primitivos usando Shadcn/Radix (Button, Input, Label, Card, Dialog, Drawer, Select, Table, Toast).
  - Configurar o componente `Toaster` (Sonner) na raiz.

- [X] **2.2. Estrutura de Rotas (File-based Routing)**
  - Criar layout raiz `__root.tsx` (Providers, Toaster).
  - Criar layout de autenticação `_auth.tsx` (Login).
  - Criar layout protegido `_app.tsx` (Sidebar, Header).

- [X] **2.3. Navegação por Perfil (ACL)**
  - Implementar Sidebar dinâmica baseada no `DisplayLevel` do usuário (Comensal, Admin, Superadmin).
  - Criar as rotas base vazias para validar a navegação:
    - `/forecast` (Comensal)
    - `/admin/dashboard`, `/admin/planning`, `/admin/recipes` (Gestor)
    - `/superadmin/ingredients`, `/superadmin/users` (SDAB)

---

### Fase 3: Módulo de Insumos (Superadmin)

Este é o alicerce dos dados. Sem insumos, não há receitas.

- [x] **3.1. Hook de Dados (`useProducts`)**
  - Criar hook que busca a árvore completa de `folder` → `product` → `product_item`.
  - Implementar lógica de cache persistente (RF03).

- [x] **3.2. Componente `ProductsTreeManager`**
  - Implementar visualização de árvore hierárquica (Tree View).
  - Integrar `@tanstack/react-virtual` para renderizar listas longas com performance.
  - Implementar filtro client-side (busca instantânea).
  - **Estrutura:** Folder (categoria) → Product (genérico) → Product Item (compra).

- [x] **3.3. Gestão da Hierarquia de 3 Níveis**
  - Criar formulários com TanStack Form + Zod para:
    - Criar/Editar Folder (permite hierarquia - folder dentro de folder).
    - Criar/Editar Product (produto genérico vinculado a folder).
    - Criar/Editar Product Item (item de compra com barcode, marca, embalagem).

---

### Fase 4: Engenharia de Receitas (Admin/Superadmin)

Implementação do coração técnico do sistema (Versionamento e Snapshots).

- [x] **4.1. Listagem de Receitas**
  - Criar tabela com filtros (Global vs Local por Kitchen).
  - Adicionar indicadores visuais de versão e kitchen de origem.
  - **Visibilidade:** Receitas globais (`kitchen_id` NULL) vs receitas locais (kitchen específica).

- [x] **4.2. Formulário de Receita (TanStack Form)**
  - Criar formulário Mestre-Detalhe:
    - **Cabeçalho:** Nome, Modo de Preparo, Rendimento, Kitchen (opcional), `cooking_factor`, `rational_id` (futuro).
    - **Detalhes:** Lista de Ingredientes (`recipe_ingredients`).
  - **Seletor de Produtos:** Reutilizar `ProductsTreeManager` em modo de seleção (apenas nível Product).
  - **Campos novos:** `cooking_factor` (fator de cocção), `rational_id` (integração fornos).

- [x] **4.3. Lógica de Versionamento (Imutabilidade)**
  - No submit de edição, garantir que o frontend envie um `INSERT` (nova versão) e não um `UPDATE`.
  - Campo `version` é obrigatório e deve ser incrementado manualmente.
  - `upstream_version_snapshot` rastreia versão original para alertas de atualização.

- [x] **4.4. Funcionalidade de Fork**
  - Implementar botão "Personalizar" em receitas globais.
  - Preencher o formulário com dados da receita base e setar `base_recipe_id` e `kitchen_id`.

- [x] **4.5. Componente `RecipeDiffViewer`**
  - Criar visualização lado a lado de duas versões.
  - Destacar mudanças em ingredientes, quantidades e campos especiais (`cooking_factor`).

---

### Fase 5: Planejamento de Cardápio (Admin)

O módulo operacional mais complexo, com snapshots e substituições.

- [x] **5.1. Componente `PlanningBoard`**
  - Implementar visualização de Calendário (Mensal/Semanal).
  - Fetch de `daily_menus` por intervalo de datas e kitchen.

- [x] **5.2. Editor de Dia (Drawer)**
  - Criar Drawer que abre ao clicar em um dia.
  - Listar refeições (Café, Almoço, Jantar, Ceia) baseadas em `meal_type`.
  - Permitir adicionar receitas ao dia.
  - **Snapshot:** Ao adicionar receita, criar snapshot JSON completo no campo `recipe` de `menu_items`.

- [x] **5.3. Gestão de Substituições via Snapshot (RF09)**
  - Criar Modal de Substituição.
  - Trabalhar com o snapshot JSON já existente no `menu_items.recipe`.
  - Implementar lógica que manipula campo `substitutions` (JSON) localmente.
  - Opção 1: Select de alternativos cadastrados (`recipe_ingredient_alternatives`).
  - Opção 2: Busca livre na árvore de produtos (substituição ad-hoc).

- [x] **5.4. Templates e Aplicação de Cardápio**
  - Implementar modo de seleção múltipla no calendário (Shift+Click).
  - Criar modal "Aplicar Template".
  - **Frontend cuida da aplicação:** Não usar função SQL, implementar lógica no frontend para flexibilidade.

- [x] **5.5. Lixeira (Trash Bin)**
  - Criar Drawer lateral para listar itens com `deleted_at` preenchido no mês corrente.
  - Ação de "Restaurar" (Setar `deleted_at` para NULL).

---

### Fase 6: Previsão e Adesão (Comensal)

Interface simplificada para o usuário final.

- [x] **6.1. Tela de Forecast**
  - Criar seletor de datas (Hoje + Próximos dias).
  - Renderizar Cards de Refeição.

- [ ] **6.2. Detalhes do Prato**
  - Accordion para mostrar composição da receita (Ingredientes principais).

- [x] **6.3. Ação de Check-in**
  - Implementar Toggle/Checkbox "Vou consumir".
  - Validar regra de horário de corte (desabilitar se passou da hora).
  - Persistir a escolha (Update no `forecasted_headcount` ou tabela auxiliar de adesão, dependendo da granularidade definida no backend - assumindo aqui atualização direta ou tabela de adesão individual).

---

### Fase 7: Dashboards e Compras

Visualização de dados consolidados.

- [x] **7.1. Dashboard Admin**
  - Criar Widgets de KPIs (Custo, Desperdício).
  - Gráfico de evolução do Headcount.

- [x] **7.2. Lista de Compras (Procurement)**
  - Tela que permite selecionar um período (ex: Próxima Semana).
  - Chamar RPC ou View do Supabase que calcula a necessidade de compra (`vw_realized_consumption`).
  - Exibir tabela agrupada por Grupo de Produto.

---

### Fase 8: Refinamento e Realtime (Finalização)

Polimento final e requisitos não-funcionais.

- [x] **8.1. Implementação do Realtime (RF10)**
  - Criar hook `useRealtimeSubscription`.
  - Escutar mudanças na tabela `daily_menus` e `recipes`.
  - Ao receber evento:
        1. Disparar Toast (`sonner`): "O cardápio foi atualizado por outro usuário".
        2. Invalidar queries do TanStack Query (`queryClient.invalidateQueries`) para recarregar dados frescos.

- [x] **8.2. Otimização de Performance**
  - Verificar re-renders desnecessários no Calendário.
  - Garantir que a árvore de produtos está virtualizada corretamente.

- [x] **8.3. Revisão de Acessibilidade**
  - Adicionar `aria-labels` em botões de ícone.
  - Testar navegação por teclado nos formulários.

---

### Fase 9: Template Management & Custom Meal Types (Planejamento Avançado)

Expansão do módulo de planejamento para suportar templates semanais reutilizáveis e tipos de refeição customizados por kitchen.

- [ ] **9.1. Kitchen Selector no Planning Board**
  - Adicionar dropdown de seleção de kitchen no topo da página `/admin/planning`.
  - Hook `useUserKitchens()` para listar kitchens disponíveis para o usuário.
  - Persistir kitchen selecionada em query param ou local storage.
  - Recarregar calendário ao trocar kitchen selecionada.

- [ ] **9.2. Custom Meal Types Management**
  - Criar hook `useMealTypes(kitchenId)` que retorna meal_types genéricos + específicos da kitchen.
  - Criar componente `MealTypeManager` para CRUD de meal_types:
    - Form com campos: Nome, Sort Order.
    - Lista de meal_types customizados com ações editar/soft-delete.
    - Mostrar meal_types genéricos como read-only.
  - Integrar no Planning Board como botão/dialog "Gerenciar Tipos de Refeição".

- [ ] **9.3. Template CRUD - Data Layer**
  - Criar hooks de data:
    - `useMenuTemplates(kitchenId)` - fetch templates disponíveis (NULL + kitchen específica).
    - `useTemplateItems(templateId)` - fetch itens de um template com receitas.
    - `useCreateTemplate()` - mutation para criar template.
    - `useUpdateTemplate()` - mutation para atualizar template.
    - `useDeleteTemplate()` - soft-delete de template.

- [ ] **9.4. Template Editor UI**
  - Criar componente `TemplateEditor`:
    - Grid de 7 colunas (dias) x N linhas (meal_types disponíveis).
    - Cell clicável que abre selector de receitas.
    - Permitir adicionar múltiplas receitas por célula (refeição + dia).
    - Form header com Nome e Descrição do template.
  - Integrar como modal/drawer acessível do Planning Board.

- [ ] **9.5. Template Application Logic**
  - Implementar lógica de aplicação de template em `ApplyTemplateDialog`:
    - Selector de template disponível.
    - Selector de "Starting Day" (qual dia do template = primeiro dia selecionado).
    - Preview de quais dias serão afetados.
    - Confirmação com soft-delete + insert logic.
  - Implementar função que mapeia template items → daily_menus + menu_items.

- [ ] **9.6. Flexible Portioning in DayDrawer**
  - Atualizar `DayDrawer` para mostrar campo `forecasted_headcount` por daily_menu.
  - Adicionar campo editável `planned_portion_quantity` por menu_item.
  - Valor padrão de `planned_portion_quantity` = `forecasted_headcount` do daily_menu.
  - Permitir override manual de quantidade de porções por preparação.
  - Adicionar toggle `excluded_from_procurement` por menu_item.

- [ ] **9.7. Enhanced Trash Bin**
  - Atualizar `TrashDrawer` para incluir:
    - Tabs: Daily Menus, Menu Items, Templates, Meal Types.
    - Filtro por mês corrente.
    - Ação de restaurar (set deleted_at = NULL).
  - Implementar mutations de restore para cada entidade.

---

### Ordem de Desenvolvimento Sugerida para o Desenvolvedor

1. **Setup & Auth** (Fase 1 e 2) - Para ter o app rodando.
2. **Insumos** (Fase 3) - Dados mestres necessários.
3. **Receitas** (Fase 4) - Core do negócio.
4. **Planejamento** (Fase 5) - Onde o usuário Admin passa mais tempo.
5. **Forecast** (Fase 6) - Interface do usuário final.
6. **Realtime & Dashboards** (Fase 7 e 8) - A cereja do bolo.
7. **Template Management** (Fase 9) - Planejamento avançado e reutilização de ciclos.

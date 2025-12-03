### Fase 1: Setup e Infraestrutura (Foundation)

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

### Fase 2: Design System e Layout (Shell)

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

- [ ] **3.1. Hook de Dados (`useIngredients`)**
    - Criar hook que busca a árvore completa de `product_groups`.
    - Implementar lógica de cache persistente (RF03).

- [ ] **3.2. Componente `IngredientsTreeManager`**
    - Implementar visualização de árvore (Tree View).
    - Integrar `@tanstack/react-virtual` para renderizar listas longas com performance.
    - Implementar filtro client-side (busca instantânea).

- [ ] **3.3. Gestão de Folder/Leaf**
    - Criar formulários com TanStack Form + Zod para:
        - Criar Grupo (Folder).
        - Criar Família (Leaf) - *Validar regra: só dentro de Folder*.
        - Criar Ingrediente (Item de Compra) - *Validar regra: só dentro de Leaf*.

---

### Fase 4: Engenharia de Receitas (Admin/Superadmin)

Implementação do coração técnico do sistema (Versionamento e Forks).

- [ ] **4.1. Listagem de Receitas**
    - Criar tabela com filtros (Global vs Local).
    - Adicionar indicadores visuais de status e versão.

- [ ] **4.2. Formulário de Receita (TanStack Form)**
    - Criar formulário Mestre-Detalhe:
        - Cabeçalho: Nome, Modo de Preparo, Rendimento.
        - Detalhes: Lista de Ingredientes (`recipe_ingredients`).
    - **Seletor de Insumos:** Reutilizar o `IngredientsTreeManager` em modo de seleção (apenas Leaf).

- [ ] **4.3. Lógica de Versionamento (Imutabilidade)**
    - No submit de edição, garantir que o frontend envie um `INSERT` (nova versão) e não um `UPDATE`, conforme RF05.

- [ ] **4.4. Funcionalidade de Fork**
    - Implementar botão "Personalizar" em receitas globais.
    - Preencher o formulário com os dados da receita base e setar `base_recipe_id`.

- [ ] **4.5. Componente `RecipeDiffViewer`**
    - Criar visualização lado a lado de duas versões.
    - Implementar lógica visual (verde/vermelho) para destacar mudanças de quantidade ou ingredientes.

---

### Fase 5: Planejamento de Cardápio (Admin)

O módulo operacional mais complexo.

- [ ] **5.1. Componente `PlanningBoard`**
    - Implementar visualização de Calendário (Mensal/Semanal).
    - Fetch de `daily_menus` por intervalo de datas.

- [ ] **5.2. Editor de Dia (Drawer)**
    - Criar Drawer que abre ao clicar em um dia.
    - Listar refeições (Café, Almoço, Jantar).
    - Permitir adicionar receitas ao dia.

- [ ] **5.3. Gestão de Substituições (RF09)**
    - Criar Modal de Substituição.
    - Implementar lógica que manipula o JSONB `substitutions` localmente antes de enviar ao banco.
    - Opção 1: Select de alternativos cadastrados.
    - Opção 2: Busca livre na árvore de produtos (Ad-hoc).

- [ ] **5.4. Templates e Ações em Massa**
    - Implementar modo de seleção múltipla no calendário (Shift+Click).
    - Criar modal "Aplicar Template" (Selecionar template -> Aplicar nos dias selecionados).

- [ ] **5.5. Lixeira (Trash Bin)**
    - Criar Drawer lateral para listar itens com `deleted_at` preenchido.
    - Ação de "Restaurar" (Setar `deleted_at` para NULL).

---

### Fase 6: Previsão e Adesão (Comensal)

Interface simplificada para o usuário final.

- [ ] **6.1. Tela de Forecast**
    - Criar seletor de datas (Hoje + Próximos dias).
    - Renderizar Cards de Refeição.

- [ ] **6.2. Detalhes do Prato**
    - Accordion para mostrar composição da receita (Ingredientes principais).

- [ ] **6.3. Ação de Check-in**
    - Implementar Toggle/Checkbox "Vou consumir".
    - Validar regra de horário de corte (desabilitar se passou da hora).
    - Persistir a escolha (Update no `forecasted_headcount` ou tabela auxiliar de adesão, dependendo da granularidade definida no backend - assumindo aqui atualização direta ou tabela de adesão individual).

---

### Fase 7: Dashboards e Compras

Visualização de dados consolidados.

- [ ] **7.1. Dashboard Admin**
    - Criar Widgets de KPIs (Custo, Desperdício).
    - Gráfico de evolução do Headcount.

- [ ] **7.2. Lista de Compras (Procurement)**
    - Tela que permite selecionar um período (ex: Próxima Semana).
    - Chamar RPC ou View do Supabase que calcula a necessidade de compra (`vw_realized_consumption`).
    - Exibir tabela agrupada por Grupo de Produto.

---

### Fase 8: Refinamento e Realtime (Finalização)

Polimento final e requisitos não-funcionais.

- [ ] **8.1. Implementação do Realtime (RF10)**
    - Criar hook `useRealtimeSubscription`.
    - Escutar mudanças na tabela `daily_menus` e `recipes`.
    - Ao receber evento:
        1. Disparar Toast (`sonner`): "O cardápio foi atualizado por outro usuário".
        2. Invalidar queries do TanStack Query (`queryClient.invalidateQueries`) para recarregar dados frescos.

- [ ] **8.2. Otimização de Performance**
    - Verificar re-renders desnecessários no Calendário.
    - Garantir que a árvore de produtos está virtualizada corretamente.

- [ ] **8.3. Revisão de Acessibilidade**
    - Adicionar `aria-labels` em botões de ícone.
    - Testar navegação por teclado nos formulários.

---

### Ordem de Desenvolvimento Sugerida para o Desenvolvedor

1.  **Setup & Auth** (Fase 1 e 2) - Para ter o app rodando.
2.  **Insumos** (Fase 3) - Dados mestres necessários.
3.  **Receitas** (Fase 4) - Core do negócio.
4.  **Planejamento** (Fase 5) - Onde o usuário Admin passa mais tempo.
5.  **Forecast** (Fase 6) - Interface do usuário final.
6.  **Realtime & Dashboards** (Fase 7 e 8) - A cereja do bolo.
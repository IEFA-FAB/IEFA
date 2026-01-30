# Product Requirements Document (PRD)
## Sistema de Gestão de Alimentação da FAB (SISUB - Módulo de Alimentação)

| **Versão** | 3.2 |
| :--- | :--- |
| **Status** | **Especificação Técnica Final (Revisada)** |
| **Data** | 03/12/2025 |
| **Autor** | Nanni |
| **Stack** | TanStack Start, Supabase, PostgreSQL, Tailwind v4 |

---

### 1. Introdução e Objetivo

#### 1.1 Contexto
A Força Aérea Brasileira (FAB) necessita modernizar seu sistema de ranchos. O sistema atual é fragmentado. A nova solução deve centralizar a inteligência normativa (SDAB) mas descentralizar a operação (Unidades), utilizando uma arquitetura moderna e resiliente.

#### 1.2 Objetivo do Projeto
Migrar o módulo de engenharia de cardápio para uma arquitetura **Multi-Tenant** baseada em Supabase (PostgreSQL). O sistema adota uma abordagem de **"Repositório de Receitas" (Git-like)**, onde a SDAB define o padrão e as unidades consomem diretamente ou customizam (Fork).

#### 1.3 Escopo da Migração (MVP)
*   **Incluso:** Cadastro de Insumos (Árvore Global), Engenharia de Receitas (Versionamento Imutável), Planejamento de Cardápio (Diário e Templates), Cálculo de Necessidade de Aquisição, Gestão de Substituições e Realtime.
*   **Não Incluso:** Controle Financeiro/Custos (preço derivado do estoque futuro).

---

### 2. Premissas e Dependências

*   **P01 - Hierarquia de Produtos (Três Níveis):**
    *   **Folder (Categoria):** Agrupamento lógico de produtos (ex: "Grãos").
    *   **Product (Produto Genérico):** Item técnico usado em receitas (ex: "Arroz Branco", "Feijão Carioca"). São ingredientes genéricos com mínima especificidade necessária para fazer a comida.
    *   **Product Item (Item de Compra):** Item físico específico com marca e embalagem (ex: "Arroz Marca X Saco 5kg"). Possui barcode e especificações de aquisição.
    *   *Justificativa:* As receitas trabalham com produtos genéricos, permitindo flexibilidade na compra. O pregão compra itens específicos, mas a receita não fica refém da marca ou embalagem do momento.
*   **P02 - Integridade de Histórico:** Nenhum dado transacional ou de engenharia deve ser excluído fisicamente. O sistema deve utilizar **Soft Deletes** (`deleted_at`) globalmente.
*   **P03 - Concorrência (Last Write Wins):** O sistema deve suportar múltiplos usuários (300+) editando simultaneamente. A interface deve reagir a mudanças externas via Realtime.

---

### 3. Requisitos Funcionais

#### 3.1 Arquitetura de Dados
*   **RF00 - UUID:** Todas as chaves primárias e estrangeiras devem ser `UUID` (v4).

#### 3.2 Gestão de Insumos (Hierarquia de 3 Níveis)
*   **RF01 - Padronização Global:** Insumos são estritamente globais (SDAB).
*   **RF02 - Hierarquia Folder → Product → Product Item:**
    *   **FOLDER:** Categoria lógica (ex: "Grãos", "Carnes"). Permite hierarquia (folders dentro de folders).
    *   **PRODUCT:** Produto genérico usado em receitas (ex: "Arroz Branco", "Feijão Carioca"). **É aqui que a Receita se conecta.**
    *   **PRODUCT ITEM:** Item físico de compra com marca e embalagem (ex: "Arroz Marca X Saco 5kg"). Possui barcode e unidade de compra.
*   **RF03 - Performance de Catálogo:** A árvore de produtos deve utilizar cache local persistente (TanStack Query Persist) e virtualização (TanStack Virtual) para permitir filtragem instantânea de milhares de itens.

#### 3.3 Engenharia de Receitas (Git-like & Imutabilidade)
*   **RF04 - Visibilidade:** Receitas globais (SDAB) têm `kitchen_id` NULL e são visíveis para todos. Receitas locais são vinculadas a uma kitchen específica.
*   **RF05 - Versionamento Imutável (Append-Only):**
    *   Receitas publicadas nunca são editadas (`UPDATE`).
    *   Qualquer alteração gera uma nova versão (`INSERT`) com incremento de `version`.
    *   O histórico completo (v1, v2, v3) permanece no banco.
    *   Campo `rational_id` reservado para integração futura com fornos Rational.
*   **RF06 - Diff Viewer:** O sistema deve permitir comparar visualmente duas versões de uma receita, destacando diferenças.

#### 3.4 Planejamento Operacional
*   **RF07 - Templates Semanais e Ações em Massa:**
    *   Permitir criar templates de cardápio semanal (7 dias) que podem ser aplicados em múltiplos períodos.
    *   Cada template pertence a uma kitchen específica ou é global (kitchen_id NULL).
    *   Templates possuem nome, descrição e collection de itens organizados por dia da semana (1-7) e tipo de refeição.
    *   Permitir selecionar múltiplos dias no calendário e aplicar templates escolhidos.
    *   Lógica de aplicação: Soft Delete nos dias selecionados -> Insert dos novos dados baseados no template.
    *   Ao aplicar template, permitir seleção de qual dia do template corresponde ao primeiro dia selecionado.

*   **RF08 - Tipos de Refeição Customizados:**
    *   O sistema possui 4 tipos de refeição genéricos (kitchen_id NULL): **Café, Almoço, Jantar, Ceia**.
    *   Kitchens podem criar tipos de refeição customizados (ex: "Jantar Especial", "Lanche da Tarde").
    *   Ao planejar para uma kitchen, usuário pode adicionar:
        *   Qualquer tipo de refeição com kitchen_id NULL (genéricos).
        *   Tipos de refeição criados pela kitchen específica (kitchen_id = X).
    *   Tipos de refeição podem ser ordenados via campo `sort_order`.
    *   Interface deve permitir criar, editar e soft-delete tipos de refeição customizados.

*   **RF09 - Seleção de Kitchen no Planejamento:**
    *   A página de planejamento deve permitir seleção da kitchen para a qual está sendo feito o planejamento.
    *   Apenas usuários com permissão para aquela kitchen podem visualizar/editar seu planejamento.
    *   Cada kitchen possui sua própria linha do tempo de cardápios (daily_menu.kitchen_id).
    *   Filtros de meal_types disponíveis são baseados na kitchen selecionada (genéricos + específicos da kitchen).

*   **RF10 - Gestão de Porcionamento Flexível:**
    *   Ao definir um daily_menu, especificar `forecasted_headcount` (total de pessoas previstas).
    *   Este valor se torna o padrão para `planned_portion_quantity` de cada preparação (menu_item).
    *   Usuário pode ajustar manualmente a quantidade de porções para cada preparação individualmente.
    *   **Exemplo:** 300 pessoas previstas -> Arroz: 300 porções, Macarrão: 150 porções (divisão manual).
    *   Campo `excluded_from_procurement` permite marcar preparações que não devem entrar no cálculo de compras.

*   **RF11 - Lixeira (Trash Bin):** 
    *   Interface para visualizar e restaurar itens removidos logicamente (`deleted_at`) no mês corrente.
    *   Aplica-se a: daily_menus, menu_items, menu_templates, meal_types.

*   **RF12 - Gestão de Substituições via Snapshot:**
    *   Quando uma receita é aplicada ao `menu_items`, um snapshot JSON completo da receita é armazenado.
    *   Substituições ad-hoc são salvas em campo `substitutions` (JSON).
    *   Isso garante que alterações futuras na receita original não afetem o planejamento já executado (imutabilidade).

#### 3.5 UX e Concorrência
*   **RF13 - Realtime Feedback:** Se o Usuário A alterar o cardápio que o Usuário B está vendo, o Usuário B deve receber um Toast (`sonner`) e a interface deve atualizar automaticamente.

---

### 4. Banco de Dados (SQL Final v4.0 - Implementação Atual)

> [!NOTE]
> Esta seção reflete o schema **implementado** em `database.types.ts`. As tabelas de Forecast e Presença não estão documentadas aqui pois fazem parte de módulos já implementados.

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS sisub;

-- =============================================================================
-- 0. ESTRUTURA ORGANIZACIONAL (Units, Kitchens, Mess Halls)
-- =============================================================================

-- Uma organização militar pode ter múltiplas units
CREATE TABLE sisub.units (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL,
    display_name TEXT,
    type TEXT CHECK (type IN ('consumption', 'purchase')) -- Unit de compra ou consumo
);

-- Uma unit pode ter múltiplas kitchens
-- Uma kitchen pode ser `production` (prepara comida) ou `consumption` (finaliza/aquece - pista quente)
CREATE TABLE sisub.kitchen (
    id INTEGER PRIMARY KEY,
    created_at TIMESTAMP DEFAULT NOW(),
    type TEXT CHECK (type IN ('consumption', 'production')),
    
    unit_id INTEGER, -- Unit dona da kitchen
    purchase_unit_id INTEGER, -- Unit que compra insumos para esta kitchen
    kitchen_id INTEGER, -- Auto-referência para hierarquia de kitchens
    
    FOREIGN KEY (unit_id) REFERENCES sisub.units(id),
    FOREIGN KEY (purchase_unit_id) REFERENCES sisub.units(id),
    FOREIGN KEY (kitchen_id) REFERENCES sisub.kitchen(id)
);

-- Uma kitchen serve múltiplos mess_halls (refeitórios)
CREATE TABLE sisub.mess_halls (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL,
    display_name TEXT,
    unit_id INTEGER NOT NULL,
    kitchen_id INTEGER,
    
    FOREIGN KEY (unit_id) REFERENCES sisub.units(id),
    FOREIGN KEY (kitchen_id) REFERENCES sisub.kitchen(id)
);

-- =============================================================================
-- 1. ESTRUTURA DE PRODUTOS (Três Níveis: Folder → Product → Product Item)
-- =============================================================================

-- NÍVEL 1: Folder (Categoria) - ex: "Grãos", "Carnes", "Laticínios"
CREATE TABLE sisub.folder (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    parent_id UUID, -- Permite hierarquia de folders
    created_at TIMESTAMP DEFAULT NOW(),
    
    FOREIGN KEY (parent_id) REFERENCES sisub.folder(id)
);

-- NÍVEL 2: Product (Produto Genérico) - ex: "Arroz Branco", "Feijão Carioca"
-- Este é o nível usado pelas RECEITAS (mínima especificidade para preparar comida)
CREATE TABLE sisub.product (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    description TEXT NOT NULL,
    folder_id UUID,
    
    measure_unit TEXT, -- UN, KG, LT
    correction_factor DECIMAL(10, 4) DEFAULT 1.00, -- Fator nutricional/correção
    
    created_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    FOREIGN KEY (folder_id) REFERENCES sisub.folder(id)
);

-- NÍVEL 3: Product Item (Item de Compra) - ex: "Arroz Marca X Saco 5kg"
-- Item físico específico com marca e embalagem (usado em licitações)
CREATE TABLE sisub.product_item (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    description TEXT NOT NULL,
    product_id UUID NOT NULL, -- Link para o produto genérico
    
    barcode TEXT, -- Código de barras
    purchase_measure_unit TEXT, -- "SACO", "CAIXA", etc
    unit_content_quantity DECIMAL(10,4), -- Ex: 5.000 (5kg por saco)
    correction_factor DECIMAL(10, 4) DEFAULT 1.00,
    
    created_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    FOREIGN KEY (product_id) REFERENCES sisub.product(id)
);

-- =============================================================================
-- 2. ENGENHARIA DE RECEITAS (Versionamento + Snapshots)
-- =============================================================================

CREATE TABLE sisub.recipes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    preparation_method TEXT,
    portion_yield DECIMAL(10, 2) NOT NULL, 
    preparation_time_minutes INTEGER,
    
    kitchen_id INTEGER, -- Kitchen responsável (NULL = Global/SDAB)
    base_recipe_id UUID, -- Se for fork, aponta para receita original
    
    version INTEGER NOT NULL, -- Versão da receita (imutável)
    upstream_version_snapshot INTEGER, -- Tracking de versão upstream (para alertas)
    
    cooking_factor DECIMAL(10,4), -- Fator de cocção
    rational_id TEXT, -- ID da receita no sistema Rational (forno) - futuro
    
    created_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    FOREIGN KEY (kitchen_id) REFERENCES sisub.kitchen(id),
    FOREIGN KEY (base_recipe_id) REFERENCES sisub.recipes(id)
);

-- Ingredientes de uma receita
-- IMPORTANTE: Aponta para `product` (genérico), não para product_item
CREATE TABLE sisub.recipe_ingredients (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    recipe_id UUID NOT NULL,
    product_id UUID NOT NULL, -- Produto genérico (ex: "Arroz Branco")
    
    net_quantity DECIMAL(12, 4) NOT NULL,
    is_optional BOOLEAN DEFAULT FALSE,
    priority_order INTEGER,
    
    created_at TIMESTAMP DEFAULT NOW(),
    
    FOREIGN KEY (recipe_id) REFERENCES sisub.recipes(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES sisub.product(id)
);

-- Alternativas de ingredientes (ex: Manteiga ↔ Margarina)
-- Substitui um product por outro, com quantidade diferente se necessário
CREATE TABLE sisub.recipe_ingredient_alternatives (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    recipe_ingredient_id UUID NOT NULL, 
    product_id UUID NOT NULL, -- Produto substituto
    
    net_quantity DECIMAL(12, 4) NOT NULL, -- Quantidade específica do substituto
    priority_order INTEGER DEFAULT 1,
    
    created_at TIMESTAMP DEFAULT NOW(),
    
    FOREIGN KEY (recipe_ingredient_id) REFERENCES sisub.recipe_ingredients(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES sisub.product(id)
);

-- =============================================================================
-- 3. PLANEJAMENTO & EXECUÇÃO (Templates & Daily Menus)
-- =============================================================================

-- Tipos de refeição (Café, Almoço, Jantar, Ceia)
CREATE TABLE sisub.meal_type (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    kitchen_id INTEGER,
    sort_order INTEGER DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    FOREIGN KEY (kitchen_id) REFERENCES sisub.kitchen(id)
);

-- 3.1 Templates Semanais (Ciclos de Cardápio)
CREATE TABLE sisub.menu_template (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    kitchen_id INTEGER,
    base_template_id UUID, -- Se for fork de outro template
    
    created_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    FOREIGN KEY (kitchen_id) REFERENCES sisub.kitchen(id),
    FOREIGN KEY (base_template_id) REFERENCES sisub.menu_template(id)
);

CREATE TABLE sisub.menu_template_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    menu_template_id UUID NOT NULL,
    day_of_week INTEGER CHECK (day_of_week BETWEEN 1 AND 7), -- 1=Segunda
    meal_type_id UUID NOT NULL,
    recipe_id UUID NOT NULL,
    
    created_at TIMESTAMP DEFAULT NOW(),
    
    FOREIGN KEY (menu_template_id) REFERENCES sisub.menu_template(id) ON DELETE CASCADE,
    FOREIGN KEY (meal_type_id) REFERENCES sisub.meal_type(id),
    FOREIGN KEY (recipe_id) REFERENCES sisub.recipes(id)
);

-- 3.2 Cardápio Diário (Planejamento Real)
CREATE TABLE sisub.daily_menu (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    service_date DATE,
    meal_type_id UUID,
    kitchen_id INTEGER, -- Kitchen responsável
    
    forecasted_headcount INTEGER, -- Previsão de comensais
    status TEXT DEFAULT 'PLANNED', -- PLANNED, PUBLISHED, EXECUTED
    
    created_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    FOREIGN KEY (kitchen_id) REFERENCES sisub.kitchen(id),
    FOREIGN KEY (meal_type_id) REFERENCES sisub.meal_type(id)
);

-- Itens do cardápio diário
-- IMPORTANTE: Armazena SNAPSHOT da receita em JSON para imutabilidade
CREATE TABLE sisub.menu_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    daily_menu_id UUID NOT NULL,
    recipe_origin_id UUID, -- Referência à receita original (para tracking)
    
    recipe JSON, -- SNAPSHOT: Cópia da receita no momento do planejamento
    planned_portion_quantity INTEGER, -- Quantidade de porções planejadas
    excluded_from_procurement INTEGER, -- Mapeamento numérico (0/1) para excluir de compras
    
    substitutions JSON, -- Substituições ad-hoc realizadas
    
    created_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    FOREIGN KEY (daily_menu_id) REFERENCES sisub.daily_menu(id) ON DELETE CASCADE,
    FOREIGN KEY (recipe_origin_id) REFERENCES sisub.recipes(id)
);

-- =============================================================================
-- 4. PERFIS E CONTROLE DE ACESSO
-- =============================================================================

-- Perfis administrativos (Fiscal, Admin, Superadmin)
-- Comensais NÃO têm registro aqui (role = NULL significa comensal)
CREATE TABLE sisub.profiles_admin (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL,
    saram TEXT NOT NULL, -- Identificação militar
    name TEXT,
    om TEXT, -- Organização Militar
    role TEXT CHECK (role IN ('user', 'admin', 'superadmin')),
    -- user = Fiscal (módulo de presença)
    -- admin = Gestor da unidade
    -- superadmin = SDAB (visão global do sistema)
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE
);
```

----

### 5. Especificação de Frontend (UX/UI & TanStack Architecture)

Esta seção detalha as interfaces necessárias para operacionalizar as regras de negócio, mapeadas para os níveis de acesso definidos na aplicação (`DisplayLevel`).

#### 5.1 Mapa de Navegação Expandido
Embora as rotas base sejam fixas (`/admin`, `/superadmin`), o sistema deve implementar sub-navegação (Tabs ou Menu Lateral) para organizar os módulos.

| Nível (DisplayLevel) | Rota Base | Módulo (Sub-rota sugerida) | Funcionalidade Principal |
| :--- | :--- | :--- | :--- |
| **Comensal** | `/forecast` | `Index` | Visualização do Cardápio e **Seleção de Refeições (Adesão)**. |
| **Gestor (Admin)** | `/admin` | `/dashboard` | **Dashboard Gerencial (KPIs da Unidade).** |
| | | `/planning` | Calendário, Headcount Consolidado, Aplicação de Templates. |
| | | `/recipes` | Lista de Receitas (Globais + Locais), Fork e Edição. |
| | | `/procurement` | Geração de Lista de Compras (Cálculo). |
| **SDAB (Superadmin)** | `/superadmin` | `/dashboard` | **Dashboard Estratégico (Visão Global da Força).** |
| | | `/users` | **Gestão de Usuários e Perfis (Fiscal, Admin, Super).** |
| | | `/ingredients` | Gestão de Insumos (Folder/Leaf) e Fatores. |
| | | `/global-recipes` | Criação de Receitas Padrão (Upstream). |
| | | `/templates` | Criação de Ciclos de Cardápio (Verão/Inverno). |

#### 5.2 Detalhamento das Telas

#### A. Perfil Comensal (`/forecast`)
*Objetivo:* Transparência, informação nutricional e **definição de demanda (Forecast Individual)**.

1.  **Tela de Previsão e Adesão:**
    *   **Componentes:**
        *   **Seletor de Data:** Padrão "Hoje", com navegação para dias futuros.
        *   **Cards de Refeição do Dia:** Exibição sequencial ou em abas de: **Café da Manhã, Almoço, Jantar e Ceia**.
        *   **Ação de Adesão (Check-in):**
            *   Dentro de cada card de refeição, existe um **Toggle/Checkbox** ou Botão de Ação: *"Irei consumir esta refeição"*.
            *   O estado padrão (marcado/desmarcado) deve respeitar a regra de negócio da unidade (ex: padrão marcado para internos, desmarcado para externos).
        *   **Detalhes do Prato (Accordion):** Ao expandir, mostra a receita principal, guarnições e alertas (ex: "Contém Glúten").
    *   **Regra de Negócio:**
        *   Apenas exibe cardápios com status `PUBLISHED`.
        *   O somatório dessas seleções individuais alimenta a sugestão de `forecasted_headcount` para o Gestor.
        *   Bloqueio de alteração após horário de corte (ex: não pode desmarcar almoço após as 10h).

#### B. Perfil Gestor (`/admin`)
*Objetivo:* Operação diária, ajuste fino e planejamento.

1.  **Dashboard Gerencial (Landing Page):**
    *   **Visão Geral:** KPIs da unidade (Custo previsto vs. Realizado, Desperdício, Total de Comensais previstos para hoje).
    *   **Atalhos:** Acesso rápido para o Planejamento e Lista de Compras.

2.  **Painel de Planejamento (The Planning Board):**
    *   **Seletor de Kitchen:** Dropdown no topo da página para escolher qual kitchen está sendo planejada.
        *   Lista apenas kitchens que o usuário tem permissão para acessar.
        *   Ao trocar kitchen, todo o calendário é recarregado com os dados daquela kitchen específica.
    *   **Visualização:** Calendário Mensal/Semanal exibindo daily_menus filtrados pela kitchen selecionada.
    *   **Ação "Pintar Template":** 
        *   Botão "Aplicar Template" (habilitado apenas quando há dias selecionados via Shift+Click).
        *   Abre modal para escolher um template disponível (templates com kitchen_id NULL ou kitchen_id da kitchen selecionada).
        *   Permite escolher qual dia do template (1-7) corresponde ao primeiro dia selecionado.
        *   Aplica o template com soft-delete dos dados existentes nos dias selecionados.
    *   **Gerenciamento de Templates:**
        *   Botão/Tab "Gerenciar Templates" que abre lista de templates existentes.
        *   Interface para criar novo template com nome, descrição e definir preparações para cada dia/refeição.
        *   Permitir edição e soft-delete de templates da kitchen atual.
        *   Templates globais (kitchen_id NULL) são visíveis mas não editáveis por kitchens.
    *   **Edição do Dia (Drawer/Modal):** Ao clicar em um dia:
        *   **Seletor de Tipos de Refeição:** Dropdown mostrando meal_types disponíveis (genéricos + customizados da kitchen).
        *   **Botão "Adicionar Refeição":** Cria um novo daily_menu para o tipo de refeição selecionado.
        *   **Input Headcount:** Campo numérico para definir o efetivo final (forecasted_headcount). *Deve exibir ao lado o número consolidado de adesões dos comensais para auxiliar a decisão.*
        *   **Lista de Itens:** Lista as receitas/preparações do dia agrupadas por refeição.
        *   **Porcionamento por Preparação:** Cada preparação mostra:
            *   Quantidade de porções (editável, padrão = forecasted_headcount).
            *   Toggle "Excluir da Compra" (`excluded_from_procurement`).
            *   Botão "Substituir" para abrir modal de substituição.
    *   **Gerenciamento de Tipos de Refeição Customizados:**
        *   Botão "Criar Tipo de Refeição" que abre modal/dialog.
        *   Form com campos: Nome, Sort Order.
        *   Lista de tipos customizados da kitchen com opções de editar/soft-delete.
        *   Tipos genéricos (kitchen_id NULL) são exibidos mas não editáveis.

3.  **Modal de Substituição (Gestão de Crise):**
    *   **Contexto:** O usuário está editando o item "Arroz Branco" do dia 12/05.
    *   **Lista de Ingredientes da Receita:** Mostra os ingredientes originais.
    *   **Dropdown de Alternativas:**
        *   Se o ingrediente tem alternativas cadastradas (tabela `recipe_ingredient_alternatives`), mostra um Select: "Manteiga (Padrão)" vs "Margarina (Substituto)".
        *   Ao selecionar, o sistema recalcula a quantidade visualmente baseada na proporção definida no banco.
    *   **Substituição Manual (Ad-hoc):** Um botão "Busca Avançada" para trocar por qualquer insumo do estoque (ex: trocar Mignon por Alcatra). Isso gera o JSONB de substituição manual.

4.  **Gerenciador de Receitas (Local & Forks):**
    *   **Listagem:** Tabela com todas as receitas. Coluna "Origem" mostra ícone "Global" (SDAB) ou "Local" (Unidade).
    *   **Ação de Edição:**
        *   Se a receita for **Local**: Abre formulário de edição normal.
        *   Se a receita for **Global**: O botão diz "Personalizar (Fork)". Ao clicar, exibe alerta: *"Você está criando uma cópia local desta receita. Atualizações futuras da SDAB não serão aplicadas automaticamente."*
    *   **Formulário de Receita:**
        *   Inputs: Nome, Modo de Preparo, Rendimento.
        *   Tabela de Ingredientes: Busca insumos globais. Permite definir Quantidade Líquida e marcar "Opcional".

#### C. Perfil SDAB (`/superadmin`)
*Objetivo:* Padronização, Governança e Gestão de Acessos.

1.  **Dashboard Estratégico (Landing Page):**
    *   **Visão Macro:** Gráficos consolidados de todas as unidades.
    *   **Alertas:** Unidades com planejamento atrasado ou custos desviantes.

2.  **Gestão de Usuários e Acessos (ACL):**
    *   **Listagem:** Tabela de usuários do sistema.
    *   **Atribuição de Papéis:**
        *   **Fiscal:** Acesso de auditoria/visualização.
        *   **Admin (Gestor):** Acesso operacional à unidade vinculada.
        *   **Superadmin (SDAB):** Acesso irrestrito e configurações globais.
    *   **Vínculo:** Associação do usuário a uma ou mais `Units` (OMs).

3.  **Gestão de Insumos (Árvore de Produtos):**
    *   **Visualização:** Componente de Tree View (Árvore).
    *   **Regra Folder/Leaf:**
        *   Botão "Novo Grupo": Só permite criar dentro de outro Grupo.
        *   Botão "Novo Insumo": Só habilita se o grupo selecionado for do tipo `LEAF`.
    *   **Formulário de Insumo:**
        *   Campos críticos: Unidade de Consumo (Select: KG, LT, UN) e Unidade de Compra (Texto livre + Fator de Conversão).

4.  **Editor de Templates (Ciclos):**
    *   **Interface:** Uma grade de 7 colunas (Segunda a Domingo) x N linhas (Tipos de Refeição disponíveis).
    *   **Tipos de Refeição Dinâmicos:** As linhas são geradas baseadas nos meal_types genéricos (kitchen_id NULL) + meal_types da kitchen selecionada (se aplicável).
    *   **Interação:** O usuário clica na célula (ex: "Segunda - Almoço") e busca uma ou mais receitas para associar.
    *   **Snapshot de Receitas:** Ao adicionar receitas ao template, armazenar referência (`recipe_id`) - o snapshot JSON completo só é criado ao aplicar o template ao daily_menu.
    *   **Salvar como Template:** Salva com nome e descrição. Se criado por kitchen específica, `kitchen_id` é preenchido. Templates globais (SDAB) têm `kitchen_id` NULL.
    *   **Aplicação:** Templates ficam disponíveis para todas as kitchens "pintarem" em seus calendários conforme regras de visibilidade (global vs local).

#### 5.3 Componentes Chave (TanStack)

**A. `IngredientsTreeManager` (Performance Crítica)**
*   **Requisito:** Renderizar e filtrar milhares de itens/grupos.
*   **Implementação:**
    *   `useQuery` com `persistQueryClient` (localStorage) para cachear a árvore.
    *   `@tanstack/react-virtual` para renderização virtualizada da lista.
    *   Filtragem client-side para resposta imediata.

**B. `RecipeDiffViewer`**
*   **Requisito:** Comparar versões de receitas.
*   **Implementação:** Layout de duas colunas. Cores semânticas (`bg-red-50` removido, `bg-green-50` adicionado) para destacar diferenças em ingredientes e quantidades.

**C. `PlanningBoard` (Bulk Actions & Lixeira)**
*   **Requisito:** Seleção múltipla de dias e recuperação de dados.
*   **Implementação:**
    *   Seleção via Click/Shift+Click.
    *   Action Bar flutuante: "Aplicar Template", "Limpar".
    *   **TrashBin:** Drawer lateral listando itens com `deleted_at` não nulo, permitindo restauração.

**D. `RealtimeManager` (Concorrência)**
*   **Requisito:** Last Write Wins com feedback.
*   **Implementação:** Hook global que assina o canal `daily_menus` do Supabase. Ao receber evento, invalida o cache do TanStack Query e exibe Toast (`sonner`).

---

### 6. Design System & Architecture Guide (System Prompt)

Este guia deve ser seguido rigorosamente no desenvolvimento do Frontend.

## 1. Stack Tecnológica (Strict Mode)
*   **Framework:** TanStack Start (React).
*   **Roteamento:** `@tanstack/react-router` (File-based routing).
*   **Estilização:** Tailwind CSS v4 (Variáveis CSS nativas).
*   **UI Kit:** `@iefa/ui` (Wrapper interno do Shadcn UI). **NUNCA** instale componentes via CLI. Use os existentes.
*   **Ícones:** `lucide-react`.
*   **Backend/Auth:** Supabase (Client-side integration via Hooks).
*   **State/Data:** TanStack Query (v5).
*   **Forms:** **TanStack Form** + **Zod** (Validação).

## 2. Regras de Tipagem (Strict Types)
*   **Centralização:** Todos os tipos compartilhados (Entidades do Banco, DTOs, Enums) devem residir em `/src/types`.
*   **Verificação:** Antes de criar uma nova interface, **verifique** se ela já existe em `/src/types`.
*   **Convenção:**
    *   `src/types/database.types.ts` (Tipos gerados do Supabase).
    *   `src/types/domain.ts` (Tipos de negócio, ex: `Meal`, `OmSettings`).
*   **Proibido:** Não use `any`. Não declare interfaces de domínio dentro de componentes (`.tsx`).

## 3. Regras de Importação e Componentes
*   **UI Components:**
    ```typescript
    import { Button, Card, Input, Label } from "@iefa/ui";
    ```
*   **Acessibilidade (ARIA):**
    *   Todos os elementos interativos devem ter `aria-label` se não tiverem texto visível.
    *   Use `aria-expanded`, `aria-controls` e `role` corretamente em componentes customizados.
    *   Garanta foco visível (`focus-visible:ring`) em todos os inputs e botões.

## 4. Padrões de Design Visual (Tailwind v4)
*   **Cores Semânticas:** `bg-primary`, `bg-destructive`, `bg-muted`.
*   **Layout:** Container padrão `max-w-[1200px] mx-auto`.
*   **Feedback:** Use Toasts (`sonner`) para sucesso/erro e Skeletons para loading.

## 5. Arquitetura de Dados (Client-Side Pattern)
*   **Data Fetching:** Utilize Hooks customizados que encapsulam o TanStack Query e o cliente do Supabase.
*   **Exemplo de Hook:**
    ```typescript
    // src/hooks/useMeals.ts
    import { useQuery } from "@tanstack/react-query";
    import { supabase } from "@/lib/supabase";
    import type { Meal } from "@/src/types/domain";

    export function useMeals(date: Date) {
      return useQuery({
        queryKey: ["meals", date],
        queryFn: async (): Promise<Meal[]> => {
          // Lógica do Supabase
        }
      });
    }
    ```

## 6. Padrão de Formulários (TanStack Form + Zod)
Utilize a biblioteca `@tanstack/react-form` com validação Zod.

```tsx
import { useForm } from '@tanstack/react-form';
import { zodValidator } from '@tanstack/zod-form-adapter';
import { z } from 'zod';
import { Button, Input, Label } from "@iefa/ui";

const mealSchema = z.object({
  quantity: z.number().min(1),
});

export function MealForm() {
  const form = useForm({
    defaultValues: { quantity: 1 },
    validatorAdapter: zodValidator(),
    validators: { onChange: mealSchema },
    onSubmit: async ({ value }) => { /* Handle submit */ },
  });
  // ... renderização do form
}
```
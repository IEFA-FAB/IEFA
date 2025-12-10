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

*   **P01 - Dualidade Técnica vs. Logística:**
    *   **Receita (Técnica):** Define a necessidade genérica (ex: "Arroz Branco"). Aponta para um **Grupo Folha (Leaf)**.
    *   **Compra/Estoque (Logística):** Define o item físico específico (ex: "Saco de Arroz Tio João 5kg"). Aponta para o mesmo Grupo Leaf.
    *   *Justificativa:* O pregão compra itens específicos, mas a receita não pode ficar refém da marca ou embalagem do momento.
*   **P02 - Integridade de Histórico:** Nenhum dado transacional ou de engenharia deve ser excluído fisicamente. O sistema deve utilizar **Soft Deletes** (`deleted_at`) globalmente.
*   **P03 - Concorrência (Last Write Wins):** O sistema deve suportar múltiplos usuários (300+) editando simultaneamente. A interface deve reagir a mudanças externas via Realtime.

---

### 3. Requisitos Funcionais

#### 3.1 Arquitetura de Dados
*   **RF00 - UUID:** Todas as chaves primárias e estrangeiras devem ser `UUID` (v4).

#### 3.2 Gestão de Insumos (Folder vs. Leaf)
*   **RF01 - Padronização Global:** Insumos são estritamente globais (SDAB).
*   **RF02 - Padrão Folder/Leaf:**
    *   **FOLDER:** Agrupador lógico.
    *   **LEAF (Família):** O nível mais baixo da árvore (ex: "Arroz Branco"). **É aqui que a Receita se conecta.**
    *   **ITEM (Ingredient):** O item físico de estoque. Conecta-se à LEAF.
*   **RF03 - Performance de Catálogo:** A árvore de produtos deve utilizar cache local persistente (TanStack Query Persist) e virtualização (TanStack Virtual) para permitir filtragem instantânea de milhares de itens.

#### 3.3 Engenharia de Receitas (Git-like & Imutabilidade)
*   **RF04 - Visibilidade:** Receitas SDAB (`unit_id` NULL) visíveis para todos. Receitas Locais apenas para a unidade.
*   **RF05 - Versionamento Imutável (Append-Only):**
    *   Receitas publicadas nunca são editadas (`UPDATE`).
    *   Qualquer alteração gera uma nova versão (`INSERT`) com incremento de `version`.
    *   O histórico completo (v1, v2, v3) permanece no banco.
*   **RF06 - Diff Viewer:** O sistema deve permitir comparar visualmente duas versões de uma receita, destacando diferenças.

#### 3.4 Planejamento Operacional
*   **RF07 - Templates e Ações em Massa:**
    *   Permitir selecionar múltiplos dias e aplicar templates.
    *   Lógica de substituição: Soft Delete nos dias selecionados -> Insert dos novos dados.
*   **RF08 - Lixeira (Trash Bin):** Interface para visualizar e restaurar itens removidos logicamente (`deleted_at`) no mês corrente.
*   **RF09 - Gestão de Substituições (Realizado vs. Planejado):**
    *   Substituições são salvas em JSONB no item do cardápio.
    *   Uma **View de Banco de Dados** deve explodir esse JSON para relatórios, priorizando a substituição sobre o planejado.

#### 3.5 UX e Concorrência
*   **RF10 - Realtime Feedback:** Se o Usuário A alterar o cardápio que o Usuário B está vendo, o Usuário B deve receber um Toast (`sonner`) e a interface deve atualizar automaticamente.

---

### 4. Banco de Dados (SQL Final v3.2)

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS sisub;

-- Mocks
CREATE TABLE IF NOT EXISTS sisub.units (id UUID PRIMARY KEY, name TEXT);
CREATE TABLE IF NOT EXISTS sisub.mess_halls (id UUID PRIMARY KEY, unit_id UUID, name TEXT);

-- =============================================================================
-- 1. ESTRUTURA DE PRODUTOS (Árvore & Itens de Compra)
-- =============================================================================

CREATE TABLE sisub.product_groups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    description TEXT NOT NULL,
    parent_group_id UUID,
    group_type TEXT NOT NULL CHECK (group_type IN ('FOLDER', 'LEAF')),
    deleted_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT fk_parent_group FOREIGN KEY (parent_group_id) REFERENCES sisub.product_groups(id)
);

-- O Item de Compra (Logístico/Pregão) - Ex: "Arroz Tio João 5kg"
CREATE TABLE sisub.ingredients (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    description TEXT NOT NULL, 
    product_group_id UUID NOT NULL, -- Link para a LEAF "Arroz Branco"
  
    -- Unidade usada na Ficha Técnica (Nutricional)
    consumption_unit TEXT NOT NULL CHECK (consumption_unit IN ('KG', 'LT', 'UN')), 
  
    -- Unidade usada na Licitação/Compra (Logística)
    purchase_unit TEXT NOT NULL, -- "SACO", "CAIXA"
    unit_content_qty DECIMAL(10,4) NOT NULL, -- Ex: 5.000 (Fator de conversão implícito)
  
    correction_factor DECIMAL(10, 4) DEFAULT 1.00, -- Fator de Limpeza/Cocção
  
    deleted_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT fk_ing_group FOREIGN KEY (product_group_id) REFERENCES sisub.product_groups(id)
);

-- Trigger para garantir integridade Folder/Leaf
CREATE OR REPLACE FUNCTION fn_check_group_leaf() RETURNS TRIGGER AS $$
DECLARE v_type TEXT;
BEGIN
    SELECT group_type INTO v_type FROM sisub.product_groups WHERE id = NEW.product_group_id;
    IF v_type <> 'LEAF' THEN RAISE EXCEPTION 'Itens só podem ser vinculados a grupos LEAF.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_check_ing_leaf BEFORE INSERT OR UPDATE ON sisub.ingredients FOR EACH ROW EXECUTE FUNCTION fn_check_group_leaf();

-- =============================================================================
-- 2. ENGENHARIA DE RECEITAS (Imutável & Alternativas)
-- =============================================================================

CREATE TABLE sisub.recipes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    preparation_method TEXT,
    portion_yield DECIMAL(10, 2) NOT NULL, 
    preparation_time_minutes INTEGER,
  
    unit_id UUID, -- NULL = Global
    base_recipe_id UUID, -- Aponta para a receita original (se for fork)
  
    version INTEGER DEFAULT 1,
    upstream_version_snapshot INTEGER, -- Rastreia versão original para alertas de update
  
    created_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,

    CONSTRAINT fk_recipe_unit FOREIGN KEY (unit_id) REFERENCES sisub.units(id),
    CONSTRAINT fk_recipe_base FOREIGN KEY (base_recipe_id) REFERENCES sisub.recipes(id)
);

CREATE TABLE sisub.recipe_ingredients (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    recipe_id UUID NOT NULL,
  
    -- VÍNCULO TÉCNICO: Aponta para o Grupo Leaf (Necessidade), não para o Item de Compra
    product_group_id UUID NOT NULL, 
  
    net_quantity DECIMAL(12, 4) NOT NULL, 
    is_optional BOOLEAN DEFAULT FALSE,
  
    CONSTRAINT fk_ri_recipe FOREIGN KEY (recipe_id) REFERENCES sisub.recipes(id) ON DELETE CASCADE,
    CONSTRAINT fk_ri_group FOREIGN KEY (product_group_id) REFERENCES sisub.product_groups(id)
);

-- Tabela de Alternativas (RF06)
-- Resolve o problema da Manteiga vs Margarina (quantidades diferentes)
CREATE TABLE sisub.recipe_ingredient_alternatives (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    recipe_ingredient_id UUID NOT NULL, -- Link com o item principal da receita
    product_group_id UUID NOT NULL, -- O grupo substituto (ex: Margarina)

    net_quantity DECIMAL(12, 4) NOT NULL, -- Quantidade específica para ESTE substituto
    priority_order INTEGER DEFAULT 1, 

    CONSTRAINT fk_ria_parent FOREIGN KEY (recipe_ingredient_id) REFERENCES sisub.recipe_ingredients(id) ON DELETE CASCADE,
    CONSTRAINT fk_ria_group FOREIGN KEY (product_group_id) REFERENCES sisub.product_groups(id)
);

-- =============================================================================
-- 3. PLANEJAMENTO & EXECUÇÃO (Templates & Diário)
-- =============================================================================

CREATE TABLE sisub.meal_types (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    description TEXT NOT NULL, -- Café, Almoço, Jantar
    unit_id UUID, 
    sort_order INTEGER DEFAULT 0,
    deleted_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT fk_meal_type_unit FOREIGN KEY (unit_id) REFERENCES sisub.units(id)
);

-- 3.1 Templates Semanais (RF07)
CREATE TABLE sisub.menu_templates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL, 
    description TEXT,
    unit_id UUID, 
    base_template_id UUID,
    deleted_at TIMESTAMP WITH TIME ZONE,

    CONSTRAINT fk_template_unit FOREIGN KEY (unit_id) REFERENCES sisub.units(id),
    CONSTRAINT fk_template_base FOREIGN KEY (base_template_id) REFERENCES sisub.menu_templates(id)
);

CREATE TABLE sisub.menu_template_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    menu_template_id UUID NOT NULL,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7), -- 1=Segunda
    meal_type_id UUID NOT NULL,
    recipe_id UUID NOT NULL,

    CONSTRAINT fk_mti_template FOREIGN KEY (menu_template_id) REFERENCES sisub.menu_templates(id) ON DELETE CASCADE,
    CONSTRAINT fk_mti_meal_type FOREIGN KEY (meal_type_id) REFERENCES sisub.meal_types(id),
    CONSTRAINT fk_mti_recipe FOREIGN KEY (recipe_id) REFERENCES sisub.recipes(id)
);
CREATE UNIQUE INDEX idx_template_day_meal ON sisub.menu_template_items (menu_template_id, day_of_week, meal_type_id);

-- 3.2 Cardápio Diário Real
CREATE TABLE sisub.daily_menus (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    mess_hall_id UUID NOT NULL,
    service_date DATE NOT NULL,
    meal_type_id UUID NOT NULL, 
  
    forecasted_headcount INTEGER NOT NULL,
    status TEXT DEFAULT 'PLANNED',
    deleted_at TIMESTAMP WITH TIME ZONE,
  
    CONSTRAINT uq_menu_hall_date UNIQUE(mess_hall_id, service_date, meal_type_id),
    CONSTRAINT fk_menu_mess_hall FOREIGN KEY (mess_hall_id) REFERENCES sisub.mess_halls(id),
    CONSTRAINT fk_menu_meal_type FOREIGN KEY (meal_type_id) REFERENCES sisub.meal_types(id)
);

CREATE TABLE sisub.menu_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    daily_menu_id UUID NOT NULL,
    recipe_id UUID NOT NULL,
    planned_portions_qty INTEGER NOT NULL,
    exclude_from_procurement BOOLEAN DEFAULT FALSE,
  
    -- Substituições: [{"product_group_id": "...", "quantity_override": 10.5, "manual_ingredient_id": "..."}]
    substitutions JSONB DEFAULT '[]'::JSONB,
  
    deleted_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT fk_mi_menu FOREIGN KEY (daily_menu_id) REFERENCES sisub.daily_menus(id) ON DELETE CASCADE,
    CONSTRAINT fk_mi_recipe FOREIGN KEY (recipe_id) REFERENCES sisub.recipes(id)
);

-- =============================================================================
-- 4. FUNÇÕES DE NEGÓCIO & VIEWS
-- =============================================================================

-- Função de "Pintura" (RF08)
CREATE OR REPLACE FUNCTION fn_apply_menu_template(
    p_template_id UUID,
    p_target_mess_hall_id UUID,
    p_start_date DATE, -- Segunda-feira
    p_default_headcount INTEGER
)
RETURNS VOID 
LANGUAGE plpgsql
AS $$
DECLARE
    v_item RECORD;
    v_target_date DATE;
    v_daily_menu_id UUID;
BEGIN
    FOR v_item IN 
        SELECT * FROM sisub.menu_template_items WHERE menu_template_id = p_template_id
    LOOP
        v_target_date := p_start_date + (v_item.day_of_week - 1);

        INSERT INTO sisub.daily_menus (mess_hall_id, service_date, meal_type_id, forecasted_headcount, status) 
        VALUES (p_target_mess_hall_id, v_target_date, v_item.meal_type_id, p_default_headcount, 'PLANNED')
        ON CONFLICT (mess_hall_id, service_date, meal_type_id) 
        DO UPDATE SET deleted_at = NULL
        RETURNING id INTO v_daily_menu_id;

        -- Limpa anterior e insere novo (Sobrescrita)
        DELETE FROM sisub.menu_items WHERE daily_menu_id = v_daily_menu_id;
        INSERT INTO sisub.menu_items (daily_menu_id, recipe_id, planned_portions_qty) 
        VALUES (v_daily_menu_id, v_item.recipe_id, p_default_headcount);
    END LOOP;
END;
$$;

-- View que consolida o que foi REALMENTE consumido (Planejado vs Substituído)
CREATE OR REPLACE VIEW sisub.vw_realized_consumption AS
SELECT 
    mi.daily_menu_id,
    mi.recipe_id,
    -- Lógica: Se existe override no JSON, usa ele. Senão, usa o cálculo da receita.
    COALESCE(
        (sub.value->>'quantity_override')::DECIMAL, 
        ri.net_quantity * mi.planned_portions_qty
    ) as final_quantity,
  
    -- Lógica: Se trocou o insumo (ex: Manteiga -> Margarina), pega o ID novo.
    COALESCE(
        (sub.value->>'product_group_id')::UUID,
        ri.product_group_id
    ) as final_product_group_id,
  
    CASE WHEN sub.value IS NOT NULL THEN 'SUBSTITUTED' ELSE 'PLANNED' END as source_type
FROM sisub.menu_items mi
JOIN sisub.recipe_ingredients ri ON ri.recipe_id = mi.recipe_id
LEFT JOIN LATERAL jsonb_array_elements(mi.substitutions) sub ON TRUE
WHERE mi.deleted_at IS NULL AND mi.exclude_from_procurement IS FALSE;

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
    *   **Visualização:** Calendário Mensal/Semanal.
    *   **Ação "Pintar Template":** Botão "Aplicar Ciclo". Abre modal para escolher um Template (ex: "Ciclo Verão SDAB") e a data de início.
    *   **Edição do Dia (Drawer/Modal):** Ao clicar em um dia:
        *   **Input Headcount:** Campo numérico para definir o efetivo final. *Deve exibir ao lado o número consolidado de adesões dos comensais para auxiliar a decisão.*
        *   **Lista de Itens:** Lista as receitas do dia.
        *   **Ações por Item:** Toggle "Excluir da Compra" e Botão Substituir.

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
    *   **Interface:** Uma grade fixa de Segunda a Domingo (Colunas) x Refeições (Linhas).
    *   **Interação:** O usuário clica na célula (ex: "Segunda - Almoço") e busca uma Receita Global para associar.
    *   **Salvar:** Salva como um "Template Mestre" que ficará disponível para todas as unidades "pintarem" em seus calendários.

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
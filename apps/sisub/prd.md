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

-- =============================================================================
-- 0. ESTRUTURA ORGANIZACIONAL (OMs e Ranchos)
-- =============================================================================

CREATE TABLE IF NOT EXISTS sisub.unidades_militares (
    id UUID PRIMARY KEY, 
    nome TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sisub.ranchos (
    id UUID PRIMARY KEY, 
    unidade_militar_id UUID, 
    nome TEXT NOT NULL,
    CONSTRAINT fk_rancho_om FOREIGN KEY (unidade_militar_id) REFERENCES sisub.unidades_militares(id)
);

-- =============================================================================
-- 1. CATÁLOGO DE INSUMOS E NUTRIÇÃO
-- =============================================================================

-- 1.1 Categorias (Antigo Folder)
CREATE TABLE sisub.categorias_insumos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    descricao TEXT NOT NULL,
    categoria_pai_id UUID,
    deletado_em TIMESTAMP WITH TIME ZONE,
    CONSTRAINT fk_categoria_pai FOREIGN KEY (categoria_pai_id) REFERENCES sisub.categorias_insumos(id)
);

-- 1.2 Insumos (Antigo Gênero Alimentício / Leaf)
-- Ex: "Arroz Agulhinha Tipo 1", "Feijão Preto", "Carne Bovina Coxão Mole"
CREATE TABLE sisub.insumos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    descricao TEXT NOT NULL,
    categoria_id UUID NOT NULL,
    
    -- Unidade usada na Ficha Técnica
    unidade_consumo TEXT NOT NULL CHECK (unidade_consumo IN ('KG', 'LT', 'UN', 'MC')), 
    
    fator_correcao_padrao DECIMAL(10, 4) DEFAULT 1.00,
    deletado_em TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT fk_insumo_categoria FOREIGN KEY (categoria_id) REFERENCES sisub.categorias_insumos(id)
);

-- 1.3 Nutrientes do Insumo (Alterado para ser flexível)
-- Permite cadastrar N nutrientes para 1 insumo
CREATE TABLE sisub.nutrientes_insumo (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    insumo_id UUID NOT NULL,
    
    nome_nutriente TEXT NOT NULL, -- Ex: "Proteína", "Sódio", "Vitamina C"
    quantidade DECIMAL(10, 4) NOT NULL, -- Valor numérico
    unidade_medida TEXT NOT NULL, -- Ex: "g", "mg", "kcal", "mcg"
    
    fonte_dados TEXT, -- Ex: "TACO", "Rótulo"
    
    CONSTRAINT fk_nutri_insumo FOREIGN KEY (insumo_id) REFERENCES sisub.insumos(id) ON DELETE CASCADE,
    -- Garante que não duplique o mesmo nutriente para o mesmo insumo
    CONSTRAINT uq_insumo_nutriente UNIQUE (insumo_id, nome_nutriente)
);

-- 1.4 Itens de Compra / Pregão
CREATE TABLE sisub.itens_compra (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    descricao TEXT NOT NULL, 
    insumo_id UUID NOT NULL, -- Link atualizado para Insumo
    
    unidade_compra TEXT NOT NULL, 
    quantidade_conteudo DECIMAL(10,4) NOT NULL, 
    
    codigo_catmat TEXT,
    deletado_em TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT fk_item_insumo FOREIGN KEY (insumo_id) REFERENCES sisub.insumos(id)
);

-- =============================================================================
-- 2. ENGENHARIA DE CARDÁPIOS (Fichas Técnicas)
-- =============================================================================

CREATE TABLE sisub.fichas_tecnicas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nome TEXT NOT NULL,
    modo_preparo TEXT,
    rendimento_porcoes DECIMAL(10, 2) NOT NULL, 
    tempo_preparo_minutos INTEGER,
    
    unidade_militar_id UUID,
    ficha_base_id UUID,
    
    versao INTEGER DEFAULT 1,
    criado_em TIMESTAMP DEFAULT NOW(),
    deletado_em TIMESTAMP WITH TIME ZONE,

    CONSTRAINT fk_ficha_om FOREIGN KEY (unidade_militar_id) REFERENCES sisub.unidades_militares(id),
    CONSTRAINT fk_ficha_base FOREIGN KEY (ficha_base_id) REFERENCES sisub.fichas_tecnicas(id)
);

CREATE TABLE sisub.insumos_ficha_tecnica (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ficha_tecnica_id UUID NOT NULL,
    
    -- VÍNCULO TÉCNICO: Aponta para o Insumo
    insumo_id UUID NOT NULL, 
    
    quantidade_liquida DECIMAL(12, 4) NOT NULL,
    e_opcional BOOLEAN DEFAULT FALSE,
    
    CONSTRAINT fk_insumo_ficha FOREIGN KEY (ficha_tecnica_id) REFERENCES sisub.fichas_tecnicas(id) ON DELETE CASCADE,
    CONSTRAINT fk_ift_insumo FOREIGN KEY (insumo_id) REFERENCES sisub.insumos(id)
);

-- Substituições / Equivalentes
CREATE TABLE sisub.substituicoes_ficha_tecnica (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    insumo_ficha_tecnica_id UUID NOT NULL,
    insumo_id UUID NOT NULL, -- O insumo substituto
  
    quantidade_liquida DECIMAL(12, 4) NOT NULL,
    ordem_prioridade INTEGER DEFAULT 1, 
  
    CONSTRAINT fk_subst_pai FOREIGN KEY (insumo_ficha_tecnica_id) REFERENCES sisub.insumos_ficha_tecnica(id) ON DELETE CASCADE,
    CONSTRAINT fk_subst_insumo FOREIGN KEY (insumo_id) REFERENCES sisub.insumos(id)
);

-- =============================================================================
-- 3. PLANEJAMENTO & ARRANCHAMENTO
-- =============================================================================

CREATE TABLE sisub.etapas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    descricao TEXT NOT NULL,
    unidade_militar_id UUID, 
    ordem_exibicao INTEGER DEFAULT 0,
    deletado_em TIMESTAMP WITH TIME ZONE,
    CONSTRAINT fk_etapa_om FOREIGN KEY (unidade_militar_id) REFERENCES sisub.unidades_militares(id)
);

CREATE TABLE sisub.modelos_cardapio (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nome TEXT NOT NULL,
    descricao TEXT,
    unidade_militar_id UUID, 
    modelo_base_id UUID,
    deletado_em TIMESTAMP WITH TIME ZONE,

    CONSTRAINT fk_modelo_om FOREIGN KEY (unidade_militar_id) REFERENCES sisub.unidades_militares(id),
    CONSTRAINT fk_modelo_base FOREIGN KEY (modelo_base_id) REFERENCES sisub.modelos_cardapio(id)
);

CREATE TABLE sisub.itens_modelo_cardapio (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    modelo_cardapio_id UUID NOT NULL,
    dia_da_semana INTEGER NOT NULL CHECK (dia_da_semana BETWEEN 1 AND 7),
    etapa_id UUID NOT NULL,
    ficha_tecnica_id UUID NOT NULL,
  
    CONSTRAINT fk_imc_modelo FOREIGN KEY (modelo_cardapio_id) REFERENCES sisub.modelos_cardapio(id) ON DELETE CASCADE,
    CONSTRAINT fk_imc_etapa FOREIGN KEY (etapa_id) REFERENCES sisub.etapas(id),
    CONSTRAINT fk_imc_ficha FOREIGN KEY (ficha_tecnica_id) REFERENCES sisub.fichas_tecnicas(id)
);
CREATE UNIQUE INDEX idx_modelo_dia_etapa ON sisub.itens_modelo_cardapio (modelo_cardapio_id, dia_da_semana, etapa_id);

CREATE TABLE sisub.cardapios_diarios (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    rancho_id UUID NOT NULL,
    data_servico DATE NOT NULL,
    etapa_id UUID NOT NULL, 
    
    efetivo_previsto INTEGER NOT NULL,
    status TEXT DEFAULT 'PLANEJADO',
    deletado_em TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT uq_cardapio_rancho_data UNIQUE(rancho_id, data_servico, etapa_id),
    CONSTRAINT fk_cardapio_rancho FOREIGN KEY (rancho_id) REFERENCES sisub.ranchos(id),
    CONSTRAINT fk_cardapio_etapa FOREIGN KEY (etapa_id) REFERENCES sisub.etapas(id)
);

CREATE TABLE sisub.preparacoes_cardapio (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cardapio_diario_id UUID NOT NULL,
    ficha_tecnica_id UUID NOT NULL,
    porcoes_planejadas INTEGER NOT NULL,
    excluir_do_pedido BOOLEAN DEFAULT FALSE,
    
    -- Substituições pontuais: [{"insumo_id": "...", "qtd_manual": 10.5}]
    substituicoes JSONB DEFAULT '[]'::JSONB,
    
    deletado_em TIMESTAMP WITH TIME ZONE,
    CONSTRAINT fk_pc_cardapio FOREIGN KEY (cardapio_diario_id) REFERENCES sisub.cardapios_diarios(id) ON DELETE CASCADE,
    CONSTRAINT fk_pc_ficha FOREIGN KEY (ficha_tecnica_id) REFERENCES sisub.fichas_tecnicas(id)
);

-- =============================================================================
-- 4. FUNÇÕES & VIEWS
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_aplicar_modelo_cardapio(
    p_modelo_id UUID,
    p_rancho_alvo_id UUID,
    p_data_inicio DATE,
    p_efetivo_padrao INTEGER
)
RETURNS VOID 
LANGUAGE plpgsql
AS $$
DECLARE
    v_item RECORD;
    v_data_alvo DATE;
    v_cardapio_id UUID;
BEGIN
    FOR v_item IN 
        SELECT * FROM sisub.itens_modelo_cardapio WHERE modelo_cardapio_id = p_modelo_id
    LOOP
        v_data_alvo := p_data_inicio + (v_item.dia_da_semana - 1);

        INSERT INTO sisub.cardapios_diarios (rancho_id, data_servico, etapa_id, efetivo_previsto, status) 
        VALUES (p_rancho_alvo_id, v_data_alvo, v_item.etapa_id, p_efetivo_padrao, 'PLANEJADO')
        ON CONFLICT (rancho_id, data_servico, etapa_id) 
        DO UPDATE SET deletado_em = NULL
        RETURNING id INTO v_cardapio_id;

        DELETE FROM sisub.preparacoes_cardapio WHERE cardapio_diario_id = v_cardapio_id;
        
        INSERT INTO sisub.preparacoes_cardapio (cardapio_diario_id, ficha_tecnica_id, porcoes_planejadas) 
        VALUES (v_cardapio_id, v_item.ficha_tecnica_id, p_efetivo_padrao);
    END LOOP;
END;
$$;

-- View de Consumo Realizado (Atualizada para usar Insumos)
CREATE OR REPLACE VIEW sisub.vw_previsao_consumo AS
SELECT 
    pc.cardapio_diario_id,
    pc.ficha_tecnica_id,
    -- Lógica: Se existe override no JSON, usa ele. Senão, usa o cálculo da ficha.
    COALESCE(
        (sub.value->>'qtd_manual')::DECIMAL, 
        ift.quantidade_liquida * pc.porcoes_planejadas
    ) as quantidade_final,
    
    -- Lógica: Se trocou o insumo (ex: Manteiga -> Margarina), pega o ID novo.
    COALESCE(
        (sub.value->>'insumo_id')::UUID,
        ift.insumo_id
    ) as insumo_final_id,
    
    CASE WHEN sub.value IS NOT NULL THEN 'SUBSTITUIDO' ELSE 'PLANEJADO' END as tipo_origem
FROM sisub.preparacoes_cardapio pc
JOIN sisub.insumos_ficha_tecnica ift ON ift.ficha_tecnica_id = pc.ficha_tecnica_id
LEFT JOIN LATERAL jsonb_array_elements(pc.substituicoes) sub ON TRUE
WHERE pc.deletado_em IS NULL AND pc.excluir_do_pedido IS FALSE;

```
---

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
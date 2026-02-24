# Documento de Referência para Desenvolvimento - SISUB

## 1\. Visão Geral e Personas

### 1.1 Comensal (Diner)

Militar ou civil autorizado que realiza refeições nos ranchos da FAB.\
**Objetivo Principal:** Consultar o cardápio e informar se irá comer (adesão/forecast) para evitar desperdício e garantir sua refeição.\
**Papel no sistema:** `comensal`\
**Módulo:** `diner` → rotas `/diner/*`

### 1.2 Fiscal de Rancho (Ranch Inspector)

Militar designado responsável pelo controle de presença nas refeições da Unidade.\
**Objetivo Principal:** Registrar a presença dos comensais via leitura de QR Code, identificar comensais não previstos e reportar presenças extras anônimas ("outros").\
**Escopo:** Opera em qualquer mess hall da sua unidade.\
**Dispositivo principal:** Mobile (celular com câmera).\
**Papel no sistema:** `user`\
**Módulo:** `messhall` → rotas `/messhall/*`

### 1.3 Gestor do Rancho (Ranch Manager)

Oficial ou graduado responsável pela administração geral do rancho de uma Unidade Militar.\
**Objetivo Principal:** Garantir a eficiência operacional, evitar desperdícios, cumprir o orçamento e gerenciar o fluxo de suprimentos (aquisição/ATA).\
**Papel no sistema:** `admin`\
**Módulos:** `local` → `/local/*` · `analytics` → `/analytics/local`

### 1.4 Nutricionista do Rancho (Local Nutritionist)

Profissional técnico responsável pela elaboração dos cardápios locais, adequação nutricional e supervisão da produção na cozinha da Unidade.\
**Objetivo Principal:** Planejar cardápios equilibrados usando as Preparações padrão, realizar substituições quando necessário e garantir a qualidade das refeições.\
**Papel no sistema:** `admin`\
**Módulos:** `local` → `/local/*` · `analytics` → `/analytics/local`

### 1.5 Gestor da SDAB (SDAB Manager)

Oficial superior ou gestor na Subdiretoria de Abastecimento (SDAB), com visão estratégica de toda a Força.\
**Objetivo Principal:** Monitorar KPIs globais (custo, desperdício, adesão), padronizar processos entre as unidades e auditar o desempenho dos ranchos.\
**Papel no sistema:** `superadmin`\
**Módulos:** `global` → `/global/*` · `analytics` → `/analytics/global`

### 1.6 Nutricionista da SDAB (Global Nutritionist)

Responsável técnica normativa que define os padrões alimentares para toda a FAB.\
**Objetivo Principal:** Criar e manter a base global de insumos e Preparações (Engenharia de Cardápio), definir Planos Semanais padrão e assegurar a qualidade técnica das fichas técnicas.\
**Papel no sistema:** `superadmin`\
**Módulos:** `global` → `/global/*` · `analytics` → `/analytics/global`

---

## 2\. Conceitos-Chave

### 2.1 Hierarquia Organizacional

* **Unidade (Unit):** Organização Militar (OM). Possui múltiplas kitchens.

* **Kitchen (Cozinha):** Local de produção. Cada kitchen pode servir múltiplos mess halls.

* **Mess Hall (Refeitório):** Local onde os comensais realizam as refeições. Cada mess hall está vinculado a uma kitchen.

### 2.2 Fluxo de Dados: Forecast → Headcount

O comensal faz adesão (forecast) por **mess hall**. O planejamento do cardápio (daily_menu) é por **kitchen**. O headcount de uma kitchen é a agregação dos forecasts de todos os mess halls vinculados àquela kitchen.

### 2.3 Presença e Registro

* **Presença identificada:** Registrada via QR Code (scan do fiscal ou self check-in). Armazenada em `meal_presences` com campo `registered_by` (UUID).

  * Se `registered_by == user_id` → self check-in.

  * Se `registered_by != user_id` → registrado pelo fiscal.

* **Presença anônima ("outros"):** Registrada pelo fiscal para pessoas não identificáveis no sistema. Armazenada em `other_presences` (1 registro = 1 pessoa).

### 2.4 Comensais Externos

Militar que come em um mess hall de uma unidade diferente da sua (`user_military_data.unit_id` ≠ unit do mess hall). O forecast por `mess_hall_id` permite isso tecnicamente. O gestor tem visibilidade sobre comensais externos na sua unidade.

### 2.5 CEAFA

Catálogo normativo da FAB. Relação: `product.ceafa_id` (nullable) → `ceafa.id`. Nem todo produto pertence à CEAFA. O campo `ceafa.quantidade` representa a quantidade per capita normativa e será útil para análises futuras, sem interação no MVP.

### 2.6 Versionamento de Preparações

Modelo append-only (imutável). Qualquer edição em uma Preparação gera um novo registro com versão incrementada. Histórico completo acessível via diff viewer.

### 2.7 Repositório de Receitas (Git-like)

A SDAB define Preparações globais (padrão). Unidades podem "forkar" uma Preparação global para criar versões locais adaptadas à realidade regional. Forks são independentes — atualizações na global não propagam automaticamente.

### 2.8 Paradigma de Rotas e Módulos

A aplicação é organizada em **módulos funcionais**, cada um mapeado a um papel de acesso. O acesso é **acumulativo**: um `admin` acessa tudo que `user` e `comensal` acessam, e assim por diante.

| Módulo      | ID          | Papel mínimo  | Prefixo de rota    |
|-------------|-------------|---------------|--------------------|
| Comensal    | `diner`     | `comensal`    | `/diner/`          |
| Fiscal      | `messhall`  | `user`        | `/messhall/`       |
| Gestão Local| `local`     | `admin`       | `/local/`          |
| SDAB        | `global`    | `superadmin`  | `/global/`         |
| Análises    | `analytics` | `admin`       | `/analytics/`      |

O ponto de entrada após login é o **Hub** (`/hub`), que exibe os módulos disponíveis para o nível do usuário. A barra lateral (sidebar) reflete o módulo ativo e seus itens de navegação.

A autorização é verificada em `beforeLoad` de cada rota via `adminProfileQueryOptions`. Redireciona para `/auth` se não autenticado e para `/hub` se sem permissão.

---

## 3\. Histórias de Usuário

### 3.1 Módulo Diner (`/diner/*`) — Comensal

**História 1: Visualizar Cardápio e Informar Adesão (Forecast)**

* **Como** Comensal,
* **Quero** ver as refeições dos próximos dias e marcar/desmarcar minha presença em cada uma,
* **Para** que o rancho prepare a quantidade certa e eu garanta minha refeição.

**Rota:** `/diner/forecast`

**Critérios de Aceite:**

1. Exibir refeições do dia atual por padrão, com navegação para dias futuros.
2. Cada refeição mostra Preparação Principal e Guarnições.
3. Permitir marcar/desmarcar "Vou consumir" por refeição futura.
4. Respeitar o horário de corte configurado pela unidade.
5. Adesão persistida imediatamente e alimenta `forecasted_headcount`.
6. Breadcrumb: Comensal > Previsão.

---

**História 2: Visualizar Detalhes da Preparação**

* **Como** Comensal,
* **Quero** ver os detalhes de uma Preparação (ingredientes principais, alertas de alérgenos),
* **Para** tomar decisões alimentares seguras e informadas.

**Rota:** `/diner/forecast` (accordion/modal inline)

**Critérios de Aceite:**

1. Ao clicar na Preparação, exibir detalhes em accordion ou modal.
2. Exibir alertas de alérgenos se cadastrados na ficha técnica.

---

**História 3: Selecionar Mess Hall para Refeição**

* **Como** Comensal,
* **Quero** escolher em qual mess hall irei comer, incluindo de outras unidades,
* **Para** ter flexibilidade quando estiver em trânsito ou em serviço em outra OM.

**Rota:** `/diner/forecast`

**Critérios de Aceite:**

1. Exibir o `default_mess_hall_id` do comensal como seleção inicial.
2. Permitir alterar para qualquer mess hall disponível.
3. O cardápio reflete a kitchen vinculada ao mess hall selecionado.
4. O forecast é registrado com o `mess_hall_id` escolhido.

---

**História 4: Gerenciar Perfil e Dados Militares**

* **Como** Comensal,
* **Quero** cadastrar meu "Nr. da Ordem" e visualizar meus dados militares vinculados (posto, OM, nome, CPF),
* **Para** garantir que o sistema me identifique corretamente nos registros de presença.

**Rota:** `/diner/profile`

**Critérios de Aceite:**

1. Campo editável para "Nr. da Ordem".
2. Ao salvar, o sistema busca e exibe automaticamente os dados militares vinculados.
3. Dados militares (posto, OM, nome, CPF) são somente leitura.
4. Breadcrumb: Comensal > Perfil.

---

**História 5: Exibir QR Code Pessoal**

* **Como** Comensal,
* **Quero** acessar meu QR Code pessoal (UUID) facilmente,
* **Para** apresentá-lo ao Fiscal de Rancho no momento da refeição.

**Rota:** `/diner/forecast` (dialog/modal acessível pela homepage do módulo)

**Critérios de Aceite:**

1. QR Code acessível via dialog na página principal do módulo Comensal.
2. Codifica o UUID do usuário.
3. Exibe nome e posto/graduação junto ao QR Code para conferência visual.

---

**História 6: Self Check-in**

* **Como** Comensal,
* **Quero** registrar minha própria presença em uma refeição sem depender do Fiscal,
* **Para** confirmar minha presença de forma autônoma.

**Rota:** `/diner/selfCheckIn`

**Critérios de Aceite:**

1. Página de self check-in acessível via sidebar do módulo Comensal.
2. Usuário indica se estava na previsão e se comparecerá.
3. Registro grava `registered_by = user_id` (self check-in).
4. Só permitido dentro da janela de horário configurável da refeição.
5. Detecção de registro duplicado.
6. Após submissão, redireciona para `/hub`.
7. Breadcrumb: Comensal > Auto Check-in.

---

### 3.2 Módulo Messhall (`/messhall/*`) — Fiscal de Rancho

> **Contexto:** Todas as telas do Fiscal são **mobile-first**. O Fiscal opera com celular e câmera.

**História 1: Registrar Presença via QR Code**

* **Como** Fiscal de Rancho,
* **Quero** escanear o QR Code de um comensal usando a câmera,
* **Para** registrar sua presença rapidamente.

**Rota:** `/messhall/presence`

**Critérios de Aceite:**

1. Tela abre câmera para leitura de QR Code.
2. Ao escanear, exibe dialog com: nome, posto/graduação e status de previsão (estava previsto ✅ / não previsto ⚠️).
3. Registro persistido em `meal_presences` com `registered_by = fiscal.user_id`.
4. Feedback visual/sonoro de sucesso ou erro (QR inválido, já registrado).
5. Opção de fechar o dialog automaticamente após scan bem-sucedido.
6. Breadcrumb: Fiscal > Presenças.

---

**História 2: Visualizar Lista de Presença em Tempo Real**

* **Como** Fiscal de Rancho,
* **Quero** ver a lista de comensais já registrados na refeição atual,
* **Para** acompanhar o fluxo de entrada.

**Rota:** `/messhall/presence` (tabela abaixo do scanner)

**Critérios de Aceite:**

1. Lista aparece abaixo do viewfinder na mesma tela.
2. Cada item mostra: nome, posto/graduação e status (previsto ✅ / não previsto ⚠️).
3. Filtrável por data, refeição e unidade.

---

**História 3: Registrar Presença Anônima ("Outros")**

* **Como** Fiscal de Rancho,
* **Quero** registrar a presença de alguém sem QR Code ou sem cadastro no sistema,
* **Para** manter a contagem total precisa.

**Rota:** `/messhall/presence`

**Critérios de Aceite:**

1. Botão "+1 Outro" acessível na tela principal do Fiscal.
2. Cada clique gera 1 registro em `other_presences` com `mess_hall_id`, `meal_type_id`, `date`, `registered_by`.
3. Total de "outros" visível como contador na tela.
4. Registro anônimo — sem identificação do comensal.

---

**História 4: Selecionar Mess Hall e Refeição Ativa**

* **Como** Fiscal de Rancho,
* **Quero** selecionar o mess hall e o tipo de refeição em que estou operando,
* **Para** que os registros sejam vinculados ao local e refeição corretos.

**Rota:** `/messhall/presence`

**Critérios de Aceite:**

1. Fiscal seleciona mess hall (dentre os da sua unidade) e tipo de refeição ao iniciar.
2. O sistema pode sugerir com base no horário atual.
3. Seleção alterável durante a operação.

---

### 3.3 Módulo Local (`/local/*`) — Gestor e Nutricionista do Rancho

**História 1: Painel Administrativo da Unidade**

* **Como** Gestor do Rancho,
* **Quero** ter uma visão geral das funções administrativas disponíveis,
* **Para** navegar rapidamente para o que preciso gerenciar.

**Rota:** `/local/`

**Critérios de Aceite:**

1. Dashboard com cards de acesso rápido para: Receitas, Planejamento, Suprimentos, QR Check-in.
2. Cada card com ícone, título e descrição da função.
3. Breadcrumb: Gestão Local > Painel.

---

**História 2: Planejar Cardápio Operacional**

* **Como** Nutricionista do Rancho,
* **Quero** visualizar o calendário do mês e associar Preparações a cada dia e refeição,
* **Para** criar a programação alimentar real da unidade.

**Rota:** `/local/planning`

**Critérios de Aceite:**

1. Interface de calendário mensal com navegação por mês.
2. Permitir importar Planos Semanais para um período de datas.
3. Sistema preenche os dias com as Preparações do plano.
4. Permitir ajustes pontuais por dia (snapshot).
5. Breadcrumb: Gestão Local > Planejamento.

---

**História 3: Gerenciar Catálogo de Receitas da Unidade**

* **Como** Nutricionista do Rancho,
* **Quero** criar, editar e visualizar Preparações da minha unidade ou "forkar" globais,
* **Para** manter um catálogo atualizado e adaptado à realidade regional.

**Rotas:** `/local/recipes` · `/local/recipes/new` · `/local/recipes/$recipeId`

**Critérios de Aceite:**

1. Listagem com busca e filtro por tipo (todas / globais / locais).
2. Criar Preparação do zero ou via fork de uma global.
3. Fork é independente — alterações na global não propagam.
4. Qualquer edição gera nova versão (append-only).
5. Diff viewer disponível para comparar versões.
6. Breadcrumb: Gestão Local > Receitas.

---

**História 4: Projetar Necessidade de Compra (Suprimentos / ATA)**

* **Como** Gestor do Rancho,
* **Quero** calcular a necessidade de insumos com base nos cardápios e efetivo previsto,
* **Para** gerar uma relação consolidada para licitação (Pregão/ATA).

**Rota:** `/local/procurement`

**Critérios de Aceite:**

1. Selecionar intervalo de datas (padrão: próxima semana).
2. Calcular total de cada insumo: (Per Capita × Efetivo × Repetições) + Margem de Segurança.
3. Campo para definir Margem de Segurança (%).
4. Exportar em CSV com colunas: Código, Descrição, Unidade, Qtd. Total, Preço Unitário Estimado, Preço Total Máximo.
5. Breadcrumb: Gestão Local > Suprimentos.

---

**História 5: Gerar QR Code para Check-in Automático**

* **Como** Gestor do Rancho,
* **Quero** gerar e exibir um QR Code para check-in automático de comensais na minha unidade,
* **Para** agilizar o processo de entrada sem depender exclusivamente do Fiscal.

**Rota:** `/local/qrCode`

**Critérios de Aceite:**

1. Página exibe QR Code gerado para a unidade/mess hall selecionado.
2. Permite selecionar a unidade operacional (OM) antes de gerar.
3. QR Code atualizável / regenerável.
4. Restrito a papéis `admin` e `superadmin`.
5. Breadcrumb: Gestão Local > QR Check-in.

---

### 3.4 Módulo Global (`/global/*`) — SDAB (superadmin)

**História 1: Gerenciar Catálogo Global de Insumos**

* **Como** Nutricionista da SDAB,
* **Quero** criar e organizar a hierarquia de Grupos, Subgrupos e Produtos do catálogo global,
* **Para** manter base padronizada e facilitar busca.

**Rota:** `/global/ingredients`

**Critérios de Aceite:**

1. Estrutura em árvore: Grupo Pai → Grupo Filho → Produto → Item de Compra.
2. Campo `ceafa_id` (nullable) no cadastro de produto, vinculando a item da tabela CEAFA.
3. Filtro por "Pertence à CEAFA" na listagem.
4. Exportação em CSV.
5. Breadcrumb: SDAB > Insumos.

---

**História 2: Gerenciar Usuários e Permissões**

* **Como** Gestor da SDAB,
* **Quero** atribuir papéis (`admin`, `user`) a usuários vinculados a uma OM,
* **Para** garantir que cada unidade tenha os responsáveis designados.

**Rota:** `/global/permissions`

**Critérios de Aceite:**

1. Listar usuários com busca por nome ou unidade.
2. Atribuir ou alterar papel: `comensal`, `user` (Fiscal), `admin` (Gestor/Nutricionista Local), `superadmin`.
3. Vincular usuário a uma OM.
4. Breadcrumb: SDAB > Permissões.

---

**História 3: Configurar Pergunta de Avaliação Global**

* **Como** Gestor da SDAB,
* **Quero** ativar/desativar e definir o texto da pergunta de avaliação exibida aos comensais,
* **Para** coletar feedback de forma centralizada e controlada.

**Rota:** `/global/evaluation`

**Critérios de Aceite:**

1. Toggle para ativar/desativar a pergunta globalmente.
2. Campo de texto para a pergunta (máx. 240 caracteres, com contador).
3. Quando ativa, comensais que ainda não responderam verão a pergunta.
4. Salvar/reverter com feedback de sucesso ou erro via toast.
5. Breadcrumb: SDAB > Avaliação.

---

**História 4: Criar Preparações Globais (Padrão)**

* **Como** Nutricionista da SDAB,
* **Quero** criar fichas técnicas oficiais (Preparações) visíveis para todas as unidades,
* **Para** garantir padrão de qualidade em toda a Força.

**Rota:** `/global/ingredients` (futuro: `/global/recipes`)

**Critérios de Aceite:**

1. Preparações criadas têm visibilidade global.
2. Definir ingredientes, quantidades per capita e fator de cocção.
3. Qualquer edição gera nova versão (append-only).
4. Histórico e diff viewer acessíveis.

---

**História 5: Criar Planos Semanais Modelo (Globais)**

* **Como** Nutricionista da SDAB,
* **Quero** criar Planos Semanais modelo visíveis para todas as unidades,
* **Para** oferecer templates padronizados que as unidades possam adotar ou adaptar.

**Critérios de Aceite:**

1. Planos Semanais da SDAB visíveis para todas as unidades.
2. Unidades podem importar um plano modelo para o calendário local.
3. Importação cria cópia local — alterações no modelo não propagam.

---

### 3.5 Módulo Analytics (`/analytics/*`) — Análises

**História 1: Análise Local da Unidade**

* **Como** Gestor do Rancho,
* **Quero** visualizar métricas e indicadores consolidados da minha unidade,
* **Para** ter controle rápido sobre a saúde operacional e financeira do meu rancho.

**Rota:** `/analytics/local`

**Critérios de Aceite:**

1. Exibir total de comensais previstos para o dia e semana.
2. Gráfico comparativo de adesão vs. realizado.
3. Indicadores de custo e desperdício da unidade.
4. Restrito a `admin` e `superadmin`.
5. Breadcrumb: Análises > Análise Local.

---

**História 2: Visão Global (SDAB)**

* **Como** Gestor da SDAB,
* **Quero** ver indicadores consolidados de todas as unidades,
* **Para** identificar desvios e tomar decisões estratégicas.

**Rota:** `/analytics/global`

**Critérios de Aceite:**

1. Dashboard com KPIs de todas as unidades (custo, desperdício, adesão).
2. Filtro por unidade ou região.
3. Alertas para unidades com custos acima do esperado.
4. Restrito a `superadmin`.
5. Breadcrumb: Análises > Visão Global.

---

### 3.6 Hub de Módulos (`/hub`)

**História 1: Selecionar Módulo de Trabalho**

* **Como** Qualquer usuário autenticado,
* **Quero** ver na tela inicial os módulos disponíveis para o meu papel,
* **Para** navegar rapidamente para onde preciso trabalhar.

**Rota:** `/hub`

**Critérios de Aceite:**

1. Exibe cards apenas dos módulos acessíveis ao papel do usuário (acesso acumulativo).
2. Cada card mostra: ícone do módulo, nome, lista de itens de navegação e botão "Acessar".
3. "Acessar" navega para a primeira rota do módulo.
4. Estado de carregamento com skeleton cards.
5. Mensagem adequada quando não há módulos disponíveis para o perfil.

---

## 4\. Alterações Sugeridas no Schema

### 4.1 `meal_presences` — Novo campo `registered_by`

```sql
ALTER TABLE public.meal_presences
ADD COLUMN registered_by UUID NOT NULL REFERENCES auth.users(id);
```

* Se `registered_by = user_id` → self check-in.

* Se `registered_by ≠ user_id` → registrado pelo Fiscal.

### 4.2 Nova tabela `other_presences`

```sql
CREATE TABLE public.other_presences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mess_hall_id UUID NOT NULL REFERENCES public.mess_halls(id),
  meal_type_id UUID NOT NULL REFERENCES public.meal_type(id),
  date DATE NOT NULL,
  registered_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

* Cada registro = 1 presença anônima.

### 4.3 `product` — Novo campo `ceafa_id`

```sql
ALTER TABLE public.product
ADD COLUMN ceafa_id INTEGER REFERENCES public.ceafa(id_ceafa);
```

* Nullable. Nem todo produto pertence à CEAFA.

### 4.4 Migração da tabela `ceafa`

```sql
CREATE TABLE public.ceafa (
  id_ceafa INTEGER PRIMARY KEY,
  quantidade NUMERIC NOT NULL,
  descricao VARCHAR NOT NULL
);
```

* `quantidade` = per capita normativa. Sem interação no MVP, útil para análises futuras.

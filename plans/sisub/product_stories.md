# Documento de Referência para Desenvolvimento - SISUB

## 1\. Visão Geral e Personas

### 1.1 Comensal (Diner)

Militar ou civil autorizado que realiza refeições nos ranchos da FAB.\
**Objetivo Principal:** Consultar o cardápio e informar se irá comer (adesão/forecast) para evitar desperdício e garantir sua refeição.

### 1.2 Fiscal de Rancho (Ranch Inspector)

Militar designado (role `user`) responsável pelo controle de presença nas refeições da Unidade.\
**Objetivo Principal:** Registrar a presença dos comensais via leitura de QR Code, identificar comensais não previstos e reportar presenças extras anônimas ("outros").\
**Escopo:** Opera em qualquer mess hall da sua unidade.\
**Dispositivo principal:** Mobile (celular com câmera).

### 1.3 Gestor do Rancho (Ranch Manager)

Oficial ou graduado responsável pela administração geral do rancho de uma Unidade Militar.\
**Objetivo Principal:** Garantir a eficiência operacional, evitar desperdícios, cumprir o orçamento e gerenciar o fluxo de suprimentos (aquisição/ATA).

### 1.4 Nutricionista do Rancho (Local Nutritionist)

Profissional técnico responsável pela elaboração dos cardápios locais, adequação nutricional e supervisão da produção na cozinha da Unidade.\
**Objetivo Principal:** Planejar cardápios equilibrados usando as Preparações padrão, realizar substituições quando necessário e garantir a qualidade das refeições.

### 1.5 Gestor da SDAB (SDAB Manager)

Oficial superior ou gestor na Subdiretoria de Abastecimento (SDAB), com visão estratégica de toda a Força.\
**Objetivo Principal:** Monitorar KPIs globais (custo, desperdício, adesão), padronizar processos entre as unidades e auditar o desempenho dos ranchos.

### 1.6 Nutricionista da SDAB (Global Nutritionist)

Responsável técnica normativa que define os padrões alimentares para toda a FAB.\
**Objetivo Principal:** Criar e manter a base global de insumos e Preparações (Engenharia de Cardápio), definir Planos Semanais padrão e assegurar a qualidade técnica das fichas técnicas.

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

---

## 3\. Histórias de Usuário

### 3.1 Módulo: Comensal (Adesão e Previsão)

**História 1: Visualizar Cardápio Digital**

* **Como** Comensal,

* **Quero** ver as Preparações do dia e dos próximos dias (café, almoço, jantar, ceia),

* **Para** saber o que será servido e decidir se irei comer no rancho.

**Critérios de Aceite:**

1. O sistema deve exibir as refeições do dia atual por padrão.

2. Deve ser possível navegar para datas futuras.

3. Cada refeição deve mostrar a Preparação Principal e Guarnições.

4. Breadcrumb: Início > Cardápio Digital.

---

**História 2: Informar Adesão (Check-in/Forecast)**

* **Como** Comensal,

* **Quero** marcar ou desmarcar minha presença em uma refeição específica,

* **Para** que o rancho possa preparar a quantidade correta de comida (evitando desperdício).

**Critérios de Aceite:**

1. O usuário deve poder marcar/desmarcar o checkbox "Vou consumir" para cada refeição futura.

2. O sistema deve respeitar o horário de corte configurado pela unidade (não permitir alteração após o corte).

3. O estado da adesão deve ser persistido imediatamente.

4. O valor da adesão alimenta automaticamente o `forecasted_headcount` do Gestor.

---

**História 3: Visualizar Detalhes da Preparação**

* **Como** Comensal,

* **Quero** ver os detalhes da Preparação (ingredientes principais, alertas de alérgenos),

* **Para** tomar decisões alimentares seguras e informadas.

**Critérios de Aceite:**

1. Ao clicar na Preparação, um accordion ou modal deve abrir com detalhes.

2. Deve exibir alertas de alérgenos (ex: contém glúten, lactose) se cadastrados na ficha técnica.

---

**História 4: Selecionar Mess Hall para Refeição**

* **Como** Comensal,

* **Quero** escolher em qual mess hall irei comer uma refeição específica (incluindo mess halls de outras unidades),

* **Para** ter flexibilidade quando estiver em trânsito, em serviço em outra OM ou por preferência pessoal.

**Critérios de Aceite:**

1. O sistema deve exibir o mess hall padrão do comensal (`default_mess_hall_id`) como seleção inicial.

2. Deve ser possível alterar o mess hall para qualquer mess hall disponível no sistema ao fazer a adesão.

3. O cardápio exibido deve refletir o cardápio do mess hall selecionado (via kitchen vinculada).

4. O forecast deve ser registrado com o `mess_hall_id` escolhido.

---

**História 5: Exibir QR Code Pessoal**

* **Como** Comensal,

* **Quero** acessar meu QR Code pessoal (UUID) na homepage do sistema,

* **Para** apresentá-lo ao Fiscal de Rancho no momento da refeição e registrar minha presença.

**Critérios de Aceite:**

1. O QR Code deve estar acessível via dialog/modal na homepage.

2. O QR Code deve codificar o UUID do usuário.

3. O dialog deve exibir o nome e posto/graduação do comensal junto ao QR Code para conferência visual.

---

**História 6: Self Check-in**

* **Como** Comensal,

* **Quero** registrar minha própria presença em uma refeição através de uma página de self check-in,

* **Para** confirmar que compareci à refeição sem depender exclusivamente do Fiscal.

**Critérios de Aceite:**

1. Deve existir uma página/botão de self check-in acessível ao comensal.

2. O registro deve gravar `registered_by = user_id` (mesmo UUID), identificando como self check-in.

3. O self check-in só deve ser permitido dentro do horário da refeição (janela configurável).

4. O registro deve ser persistido em `meal_presences`.

---

### 3.2 Módulo: Fiscal de Rancho (Controle de Presença)

> **Contexto:** Todas as telas do Fiscal são **mobile-first**. O Fiscal opera com celular e câmera.

**História 1: Escanear QR Code do Comensal**

* **Como** Fiscal de Rancho,

* **Quero** escanear o QR Code de um comensal usando a câmera do celular,

* **Para** registrar sua presença na refeição de forma rápida e confiável.

**Critérios de Aceite:**

1. A tela principal do Fiscal deve abrir a câmera para leitura de QR Code.

2. Ao escanear, o sistema deve exibir um dialog com: nome, posto/graduação e foto (se disponível) do comensal.

3. O dialog deve indicar se o comensal **estava previsto** (tinha forecast) ou **não estava previsto** para aquela refeição.

4. O registro deve ser persistido em `meal_presences` com `registered_by = fiscal.user_id`.

5. Deve haver feedback visual/sonoro de sucesso ou erro (QR inválido, já registrado).

---

**História 2: Visualizar Lista de Presença em Tempo Real**

* **Como** Fiscal de Rancho,

* **Quero** ver a lista de comensais já registrados na refeição atual, logo abaixo da câmera de leitura,

* **Para** acompanhar o fluxo de entrada e identificar rapidamente quem já passou.

**Critérios de Aceite:**

1. A lista deve aparecer abaixo do viewfinder da câmera na mesma tela.

2. Cada item deve mostrar: nome, posto/graduação e status (previsto ✅ / não previsto ⚠️).

3. A lista deve atualizar em tempo real conforme novos scans são realizados.

4. Deve ser possível filtrar/buscar por nome na lista.

---

**História 3: Registrar Presença Anônima ("Outros")**

* **Como** Fiscal de Rancho,

* **Quero** registrar a presença de uma pessoa que não possui QR Code ou não está cadastrada no sistema,

* **Para** manter a contagem total de refeições servidas precisa, mesmo para casos excepcionais.

**Critérios de Aceite:**

1. Deve haver um botão "+1 Outro" acessível na tela principal do Fiscal.

2. Cada clique gera 1 registro em `other_presences` com: `mess_hall_id`, `meal_type_id`, `date`, `registered_by` (fiscal UUID), `created_at`.

3. O total de "outros" deve ser visível na tela do Fiscal como contador.

4. O registro é anônimo — não há identificação do comensal.

---

**História 4: Selecionar Mess Hall e Refeição Ativa**

* **Como** Fiscal de Rancho,

* **Quero** selecionar o mess hall e o tipo de refeição (café, almoço, jantar, ceia) em que estou operando,

* **Para** que os registros de presença sejam vinculados ao local e refeição corretos.

**Critérios de Aceite:**

1. Ao abrir a tela de presença, o Fiscal deve selecionar o mess hall (dentre os da sua unidade) e o tipo de refeição.

2. O sistema pode sugerir automaticamente com base no horário atual.

3. A seleção deve ser alterável durante a operação.

---

### 3.3 Módulo: Gestor do Rancho (Gestão e Aquisição)

**História 1: Acompanhar KPIs do Rancho (Dashboard)**

* **Como** Gestor do Rancho,

* **Quero** visualizar um dashboard com custos previstos, desperdício e número de comensais,

* **Para** ter controle rápido sobre a saúde operacional e financeira do meu rancho.

**Critérios de Aceite:**

1. O dashboard deve exibir o total de comensais previstos para o dia.

2. Deve mostrar um gráfico comparativo de adesão vs realizado.

3. Breadcrumb: Início > Gestão > Dashboard.

---

**História 2: Projetar Necessidade de Compra (ATA)**

* **Como** Gestor do Rancho,

* **Quero** selecionar Planos Semanais, definir o efetivo (headcount) e a frequência de repetição,

* **Para** gerar uma previsão consolidada de insumos para a licitação (Pregão/ATA) com margem de segurança.

**Critérios de Aceite:**

1. Interface deve permitir selecionar um ou mais "Planos Semanais".

2. Para cada plano, definir: Quantidade de Repetições e Efetivo Previsto.

3. Campo para definir **Margem de Segurança** (%) que será adicionada à quantidade total.

4. O sistema deve calcular o total de cada insumo: (Per Capita × Efetivo × Repetições) + Margem.

---

**História 3: Exportar Relação para ATA (CSV)**

* **Como** Gestor do Rancho,

* **Quero** exportar a lista consolidada em CSV, incluindo o "Preço Máximo Aceitável",

* **Para** instruir o processo de registro de preço (ATA).

**Critérios de Aceite:**

1. O arquivo CSV deve conter colunas: Código, Descrição do Insumo (com atributo CEAFA), Unidade, Quantidade Total, Preço Unitário Estimado, Preço Total Máximo.

2. O "Preço Máximo" deve considerar a margem de segurança definida.

---

**História 4: Configurar Unidade e Kitchen**

* **Como** Gestor do Rancho,

* **Quero** configurar os horários de corte para adesão dos comensais,

* **Para** garantir que a cozinha tenha tempo hábil para ajustar a produção.

**Critérios de Aceite:**

1. O sistema deve permitir definir um horário limite para adesão ao almoço do dia seguinte ou do próprio dia.

---

**História 5: Visualizar Relatório de Presença**

* **Como** Gestor do Rancho,

* **Quero** visualizar e exportar um relatório de presença por refeição/dia,

* **Para** ter controle sobre quem comeu, quem aderiu e não foi, e quem foi sem aderir.

**Critérios de Aceite:**

1. O relatório deve categorizar os comensais em:

* **Aderiu e compareceu:** forecast ✅ + presença ✅

* **Aderiu e não compareceu:** forecast ✅ + presença ❌

* **Não aderiu e compareceu:** forecast ❌ + presença ✅

1. Deve exibir o total de "outros" (presenças anônimas) registrados pelo Fiscal.

2. Deve ser possível filtrar por data, refeição e mess hall.

3. Deve ser possível exportar o relatório em CSV.

---

**História 6: Visualizar Comensais Externos**

* **Como** Gestor do Rancho,

* **Quero** ver uma aba/seção dedicada aos comensais que comeram na minha unidade mas pertencem a outra unidade,

* **Para** ter visibilidade sobre o consumo de recursos por militares externos e subsidiar eventuais acertos entre unidades.

**Critérios de Aceite:**

1. O critério de "externo" é: `user_military_data.unit_id` ≠ unit do mess hall onde a presença foi registrada.

2. A lista deve exibir: nome, posto/graduação, unidade de origem, data, refeição, mess hall.

3. Deve ser possível filtrar por período.

4. Deve ser possível exportar em CSV.

---

**História 7: Autorizar Previamente Comensais Externos (Nice-to-Have)**

* **Como** Gestor do Rancho,

* **Quero** autorizar previamente militares de outras unidades a comerem no meu rancho,

* **Para** ter controle antecipado sobre comensais externos e facilitar o planejamento.

**Critérios de Aceite:**

1. O gestor deve poder buscar um militar por nome ou identidade e autorizá-lo para um período/refeição específica.

2. Autorizações prévias devem aparecer na lista de forecasts como "externo autorizado".

3. **Prioridade:** Nice-to-have (não bloqueia MVP).

---

### 3.4 Módulo: Nutricionista do Rancho (Planejamento e Operação)

**História 1: Gerenciar Planos Semanais (Templates)**

* **Como** Nutricionista do Rancho,

* **Quero** criar **Planos Semanais** (Rotinas) em uma página dedicada,

* **Para** ter um banco de cardápios prontos para uso recorrente sem misturar com o calendário de execução.

**Critérios de Aceite:**

1. Deve existir uma página específica "Meus Planos Semanais".

2. O usuário define um nome e preenche 7 dias de refeições (Segunda a Domingo).

3. Não deve haver datas vinculadas.

4. Breadcrumb: Planejamento > Planos Semanais.

---

**História 2: Planejar Calendário Operacional (Diário)**

* **Como** Nutricionista do Rancho,

* **Quero** visualizar o calendário do mês e importar Planos Semanais para datas específicas,

* **Para** criar a programação alimentar real da unidade.

**Critérios de Aceite:**

1. Interface de calendário focada em datas reais.

2. Permitir arrastar ou selecionar um "Plano Semanal" e aplicar a um período (ex: semana de 10 a 16 de maio).

3. O sistema deve preencher os dias com as Preparações do plano.

---

**História 3: Realizar Ajustes no Cardápio Diário (Snapshot)**

* **Como** Nutricionista do Rancho,

* **Quero** substituir um ingrediente em uma Preparação específica para um dia (ex: trocar manteiga por margarina),

* **Para** lidar com falta de estoque sem alterar a Preparação padrão permanentemente.

**Critérios de Aceite:**

1. A alteração afeta apenas o dia específico (snapshot).

2. Permitir escolher um ingrediente substituto da lista de alternativas ou da árvore global.

---

**História 4: Ajustar Porcionamento (Headcount Diário)**

* **Como** Nutricionista do Rancho,

* **Quero** ajustar quantas porções serão produzidas para cada preparação do dia, baseando-me na previsão de comensais,

* **Para** orientar a cozinha sobre a quantidade exata a ser produzida.

**Critérios de Aceite:**

1. O sistema sugere a quantidade baseada no total de adesões (forecast agregado de todos os mess halls da kitchen).

2. Permitir sobrescrever manualmente a quantidade a produzir.

---

**História 5: Criar/Editar Preparações Locais**

* **Como** Nutricionista do Rancho,

* **Quero** criar Preparações específicas da minha unidade ou "forkar" uma Preparação global,

* **Para** adaptar o cardápio à realidade regional.

**Critérios de Aceite:**

1. O usuário deve poder criar uma Preparação do zero ou copiar uma global.

2. A nova Preparação deve ficar visível apenas para a unidade do usuário.

3. Forks são independentes — atualizações na Preparação global original não propagam automaticamente para o fork.

---

### 3.5 Módulo: Gestor da SDAB (Governança)

**História 1: Monitorar Visão Global**

* **Como** Gestor da SDAB,

* **Quero** ver indicadores consolidados de todas as unidades,

* **Para** identificar desvios e tomar decisões estratégicas.

**Critérios de Aceite:**

1. O dashboard deve permitir filtrar por unidade ou região.

2. Exibir alertas para unidades com custos acima do esperado.

---

**História 2: Gerenciar Usuários e Permissões**

* **Como** Gestor da SDAB,

* **Quero** cadastrar novos gestores de rancho e atribuí-los às suas respectivas unidades,

* **Para** garantir que cada quartel tenha um responsável designado.

**Critérios de Aceite:**

1. Permitir atribuir perfis (Admin, Fiscal) a usuários vinculados a uma OM.

2. O perfil `admin` corresponde ao Gestor/Nutricionista do Rancho.

3. O perfil `user` corresponde ao Fiscal de Rancho (módulo de presença).

---

### 3.6 Módulo: Nutricionista da SDAB (Engenharia e Padronização)

**História 1: Gerenciar Grupos de Insumos (Catálogo Global)**

* **Como** Nutricionista da SDAB,

* **Quero** criar e organizar a hierarquia de **Grupos** e Subgrupos de alimentos,

* **Para** manter o catálogo organizado e facilitar a busca.

**Critérios de Aceite:**

1. Usar termo "Grupo" em vez de "Pasta".

2. Permitir criar hierarquia (Grupo Pai → Grupo Filho).

---

**História 2: Cadastrar Insumos com Atributo CEAFA**

* **Como** Nutricionista da SDAB,

* **Quero** cadastrar insumos vinculando-os opcionalmente a um item da **CEAFA**,

* **Para** garantir compliance com normas militares e rastreabilidade normativa.

**Critérios de Aceite:**

1. Campo `ceafa_id` (nullable) no cadastro de produto, vinculando a um item da tabela CEAFA.

2. Filtro por "Pertence à CEAFA" na listagem de insumos.

3. Exibir a descrição do item CEAFA vinculado quando aplicável.

---

**História 3: Criar Preparações Globais (Padrão)**

* **Como** Nutricionista da SDAB,

* **Quero** criar fichas técnicas oficiais (Preparações) visíveis para todas as unidades,

* **Para** garantir padrão de qualidade.

**Critérios de Aceite:**

1. Preparações criadas devem ter visibilidade global.

2. Definir ingredientes, quantidades per capita e fator de cocção.

---

**História 4: Versionar Preparações**

* **Como** Nutricionista da SDAB,

* **Quero** que qualquer alteração em uma Preparação gere uma nova versão (histórico),

* **Para** manter a rastreabilidade.

**Critérios de Aceite:**

1. Editar uma Preparação pública gera novo registro com versão incrementada (append-only).

2. Histórico de versões acessível.

3. Diff viewer disponível para comparar versões.

---

**História 5: Criar Planos Semanais Modelo (Globais)**

* **Como** Nutricionista da SDAB,

* **Quero** criar Planos Semanais modelo visíveis para todas as unidades,

* **Para** oferecer templates padronizados que as unidades possam adotar ou adaptar.

**Critérios de Aceite:**

1. Planos Semanais criados pela SDAB devem ser visíveis para todas as unidades.

2. Unidades podem importar um plano modelo para seu calendário local.

3. A importação cria uma cópia local — alterações no modelo não propagam para planos já importados.

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
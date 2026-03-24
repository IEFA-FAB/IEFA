# **SISUB — Histórias de Usuário & Modelo de Acesso (PBAC)**

**Sistema de Gestão de Subsistência da FAB** Versão 2.1 · Fevereiro 2026 · Subdiretoria de Abastecimento – SDAB · **IEFA**

---

## Sumário

1. [Visão Geral e Personas](#1-visão-geral-e-personas)  
2. [Conceitos-Chave do Negócio](#2-conceitos-chave-do-negócio)  
3. [Histórias de Usuário](#3-histórias-de-usuário)  
   - 3.1 [Módulo Comensal](#31-módulo-comensal--quem-usa-comensal)  
   - 3.2 [Módulo Fiscal de Rancho](#32-módulo-fiscal-de-rancho--quem-usa-fiscal-de-rancho)  
   - 3.3 [Módulo Gestão Local](#33-módulo-gestão-local--quem-usa-gestor-e-nutricionista-do-rancho)  
   - 3.4 [Módulo SDAB (Global)](#34-módulo-sdab-global--quem-usa-gestor-e-nutricionista-da-sdab)  
   - 3.5 [Módulo Análises](#35-módulo-análises--quem-usa-analista-e-gestor-do-rancho-e-da-sdab)  
   - 3.6 [Hub de Módulos](#36-hub-de-módulos--quem-usa-todos-os-usuários-autenticados)  
4. [Modelo de Acesso (PBAC)](#4-modelo-de-acesso-pbac)  
   - 4.1 [Estrutura de Permissões](#41-estrutura-de-permissões)  
   - 4.2 [Regras de Negócio de Acesso](#42-regras-de-negócio-de-acesso)  
   - 4.3 [Histórias de Usuário — Controle de Acesso](#43-histórias-de-usuário--controle-de-acesso)

---

## 1\. Visão Geral e Personas

O SISUB atende oito perfis de usuário com responsabilidades distintas, organizados em dois níveis: **operacional** (unidade) e **estratégico** (SDAB). O acesso é baseado em políticas granulares (PBAC) — cada perfil possui permissões explícitas por módulo, nível e escopo de localidade.

| Persona | Objetivo Principal | Módulos Principais |
| :---- | :---- | :---- |
| **Comensal** — Militar ou civil autorizado | Consultar cardápio, informar adesão e registrar presença para evitar desperdício e garantir sua refeição. | `diner` |
| **Fiscal de Rancho** — Militar designado | Registrar presença dos comensais via QR Code, identificar não previstos e contabilizar presenças anônimas. | `messhall` |
| **Gestor do Rancho** — Oficial/Graduado responsável | Garantir eficiência operacional, controlar orçamento e gerenciar suprimentos da unidade. | `local` · `analytics` (local) |
| **Nutricionista do Rancho** — Profissional técnico local | Planejar cardápios equilibrados, realizar substituições e garantir qualidade das refeições na unidade. | `local` · `analytics` (local) |
| **Analista do Rancho** — Perfil analítico local | Acessar relatórios e indicadores operacionais da unidade sem permissão de escrita. | `analytics` (local) |
| **Gestor da SDAB** — Oficial superior / SDAB | Monitorar KPIs globais, padronizar processos entre unidades e auditar desempenho dos ranchos. | `global` · `analytics` (global) |
| **Nutricionista da SDAB** — Responsável técnica normativa | Criar e manter base global de insumos e Preparações, definir Planos Semanais padrão para toda a FAB. | `global` · `analytics` (global) |
| **Analista da SDAB** — Perfil analítico estratégico | Acessar relatórios e indicadores consolidados de todas as unidades sem permissão de escrita. | `analytics` (global) |

**Nota:** Todo usuário autenticado possui acesso implícito ao módulo `diner` (nível 1), conforme Regra 1 do modelo PBAC. Os módulos listados acima representam permissões adicionais atribuídas explicitamente.

---

## 2\. Conceitos-Chave do Negócio

### **Hierarquia Organizacional**

**Unidade (OM)** possui múltiplas **Cozinhas (Kitchens)**. Cada Cozinha pode servir múltiplos **Refeitórios (Mess Halls)**. O planejamento de cardápio ocorre na Cozinha; o registro de presença e adesão ocorre no Refeitório.

Unidade (OM)

└── Cozinha (Kitchen)

    └── Refeitório (Mess Hall)

### **Fluxo Forecast → Headcount**

O Comensal faz adesão (forecast) por Refeitório. O headcount de uma Cozinha é a soma dos forecasts de todos os Refeitórios vinculados a ela. Esse número orienta o planejamento de produção e compras.

### **Presença Identificada vs. Anônima**

- **Identificada:** registrada via QR Code (pelo Fiscal ou pelo próprio Comensal via self check-in).  
- **Anônima ("Outros"):** registrada pelo Fiscal para pessoas sem cadastro ou QR Code — cada registro equivale a 1 pessoa, sem identificação.

### **Comensais Externos**

Militar que realiza refeição em uma unidade diferente da sua. O sistema suporta esse cenário: o Comensal pode fazer forecast em qualquer Refeitório disponível, e o Gestor tem visibilidade sobre comensais externos na sua unidade.

### **Versionamento de Preparações (Append-Only)**

Qualquer edição em uma Preparação gera um novo registro com versão incrementada. O histórico completo é preservado e acessível via comparador de versões (diff viewer). Nenhuma versão é deletada.

### **Repositório de Preparações (Modelo Git-like)**

A SDAB define Preparações globais (padrão). Unidades podem "forkar" uma Preparação global para criar versões locais adaptadas. Forks são independentes — atualizações na Preparação global original **não** propagam automaticamente para os forks.

---

## 3\. Histórias de Usuário

---

### **3.1 Módulo Comensal — Quem usa: Comensal**

Permite ao Comensal consultar o cardápio, informar sua adesão às refeições e registrar sua presença de forma autônoma.

---

#### DINER-01 · Visualizar Cardápio do Dia

**Como** Comensal, **Quero** visualizar as refeições programadas para o dia atual e os próximos dias, **Para** saber o que será servido e planejar minha alimentação.

**Critérios de Aceite**

- Exibir as refeições do dia atual por padrão, com navegação para dias futuros.  
- Cada refeição apresenta a Preparação Principal e as Guarnições.  
- O cardápio reflete a Cozinha vinculada ao Refeitório selecionado pelo Comensal.  
- Quando não houver cardápio planejado para o dia, exibir mensagem informativa adequada.

---

#### DINER-02 · Informar Adesão (Forecast) a uma Refeição

**Como** Comensal, **Quero** marcar ou desmarcar minha intenção de comparecer a uma refeição futura, **Para** que o rancho prepare a quantidade certa e eu garanta minha refeição.

**Critérios de Aceite**

- Permitir marcar/desmarcar "Vou consumir" por refeição futura.  
- Respeitar o horário de corte configurado pela unidade — após o corte, a adesão é bloqueada com mensagem explicativa.  
- A adesão é registrada imediatamente e alimenta o headcount previsto da cozinha.  
- Exibir confirmação visual após a ação.  
- Exibir o horário de corte vigente para que o Comensal saiba até quando pode alterar sua adesão.

---

#### DINER-03 · Selecionar Refeitório para Refeição

**Como** Comensal, **Quero** escolher em qual Refeitório irei realizar minha refeição, inclusive de outras unidades, **Para** ter flexibilidade quando estiver em trânsito ou em serviço em outra OM.

**Critérios de Aceite**

- Exibir o Refeitório padrão do Comensal como seleção inicial.  
- Permitir alterar para qualquer Refeitório disponível no sistema.  
- O cardápio exibido reflete a Cozinha vinculada ao Refeitório selecionado.  
- O forecast é registrado com o Refeitório escolhido.  
- Refeitórios de outras unidades são identificados visualmente como "externos".

---

#### DINER-04 · Visualizar Detalhes e Alérgenos de uma Preparação

**Como** Comensal, **Quero** ver os ingredientes principais e alertas de alérgenos de uma Preparação, **Para** tomar decisões alimentares seguras e informadas.

**Critérios de Aceite**

- Ao selecionar uma Preparação, exibir seus detalhes (ingredientes principais e alérgenos).  
- Alertas de alérgenos são destacados visualmente quando cadastrados na ficha técnica.  
- Informação acessível sem sair da tela de cardápio.  
- Quando não houver alérgenos cadastrados, exibir aviso de "informação não disponível" (não omitir silenciosamente).

---

#### DINER-05 · Gerenciar Perfil e Número de Ordem

**Como** Comensal, **Quero** cadastrar meu Número de Ordem e visualizar meus dados militares vinculados, **Para** garantir que o sistema me identifique corretamente nos registros de presença.

**Critérios de Aceite**

- Campo editável para "Nr. de Ordem".  
- Ao salvar, o sistema busca e exibe automaticamente os dados militares vinculados (posto, OM, nome, CPF).  
- Dados militares são exibidos em modo somente leitura — não editáveis pelo Comensal.  
- Exibir mensagem de erro clara caso o Número de Ordem não seja encontrado na base.

---

#### DINER-06 · Acessar QR Code Pessoal

**Como** Comensal, **Quero** acessar meu QR Code pessoal de forma rápida, **Para** apresentá-lo ao Fiscal de Rancho no momento da refeição.

**Critérios de Aceite**

- QR Code acessível diretamente na página principal do módulo Comensal.  
- Exibe nome e posto/graduação junto ao QR Code para conferência visual.  
- QR Code codifica o identificador único do usuário no sistema.  
- QR Code deve ser exibido em tamanho adequado para leitura por câmera de dispositivo móvel.

---

#### DINER-07 · Realizar Self Check-in

**Como** Comensal, **Quero** registrar minha própria presença em uma refeição sem depender do Fiscal, **Para** confirmar minha presença de forma autônoma.

**Critérios de Aceite**

- Self check-in disponível apenas dentro da janela de horário configurável da refeição.  
- O Comensal indica se estava na previsão e se está comparecendo.  
- O sistema detecta e bloqueia o registro duplicado para a mesma refeição, exibindo mensagem informativa.  
- Registro identificado como auto check-in (diferenciado do registro pelo Fiscal).  
- Fora da janela de horário, o botão de self check-in é desabilitado com indicação do motivo.

---

### **3.2 Módulo Fiscal de Rancho — Quem usa: Fiscal de Rancho**

Operado principalmente via dispositivo móvel. Permite ao Fiscal registrar presenças, acompanhar o fluxo de entrada e contabilizar comensais não identificados.

---

#### MESSHALL-01 · Selecionar Refeitório e Refeição Ativa

**Como** Fiscal de Rancho, **Quero** selecionar o Refeitório e o tipo de refeição em que estou operando, **Para** que todos os registros sejam vinculados ao local e refeição corretos.

**Critérios de Aceite**

- Fiscal seleciona o Refeitório (dentre os da sua unidade) e o tipo de refeição ao iniciar o turno.  
- O sistema sugere automaticamente o Refeitório e refeição com base no horário atual.  
- A seleção pode ser alterada durante a operação sem perda dos registros já realizados.  
- Exibir confirmação da seleção ativa de forma persistente na tela durante a operação.

---

#### MESSHALL-02 · Registrar Presença via QR Code

**Como** Fiscal de Rancho, **Quero** escanear o QR Code de um Comensal com a câmera do celular, **Para** registrar sua presença de forma rápida e precisa.

**Critérios de Aceite**

- A tela abre a câmera para leitura de QR Code.  
- Após o scan, exibe nome, posto/graduação e status de previsão do Comensal (previsto ✅ / não previsto ⚠️).  
- Feedback visual e/ou sonoro imediato de sucesso ou erro (QR inválido, já registrado).  
- O registro é vinculado ao Fiscal que realizou o scan.  
- Opção de fechar o diálogo automaticamente após scan bem-sucedido para agilizar o fluxo.  
- Em caso de falha de conectividade, o registro deve ser enfileirado localmente e sincronizado quando a conexão for restabelecida.

---

#### MESSHALL-03 · Acompanhar Lista de Presença em Tempo Real

**Como** Fiscal de Rancho, **Quero** visualizar a lista de Comensais já registrados na refeição atual, **Para** acompanhar o fluxo de entrada e identificar inconsistências.

**Critérios de Aceite**

- Lista exibida na mesma tela do scanner, atualizada a cada novo registro.  
- Cada item mostra: nome, posto/graduação e status (previsto ✅ / não previsto ⚠️).  
- Filtrável por data, tipo de refeição e unidade.  
- Exibir contador total de presenças registradas (identificadas \+ anônimas) em destaque.

---

#### MESSHALL-04 · Registrar Presença Anônima ("Outros")

**Como** Fiscal de Rancho, **Quero** registrar a presença de alguém sem QR Code ou sem cadastro no sistema, **Para** manter a contagem total de refeições servidas precisa.

**Critérios de Aceite**

- Botão "+1 Outro" acessível na tela principal do Fiscal.  
- Cada acionamento registra 1 presença anônima vinculada ao Refeitório, tipo de refeição e data.  
- Contador de "outros" visível na tela, atualizado em tempo real.  
- Registro sem identificação do Comensal — apenas contagem.  
- Permitir desfazer o último registro anônimo em caso de acionamento acidental (undo com janela de tempo configurável).

---

### **3.3 Módulo Gestão Local — Quem usa: Gestor e Nutricionista do Rancho**

Centraliza as funções administrativas e de planejamento da unidade: cardápio, Preparações, suprimentos e controle de acesso ao Refeitório.

---

#### LOCAL-01 · Acessar Painel Administrativo da Unidade

**Como** Gestor do Rancho, **Quero** ter uma visão geral das funções administrativas disponíveis, **Para** navegar rapidamente para o que preciso gerenciar.

**Critérios de Aceite**

- Dashboard com cards de acesso rápido para: Preparações, Planejamento, Suprimentos e QR Check-in.  
- Cada card exibe ícone, título e descrição da função.  
- Cards são exibidos apenas para funcionalidades às quais o usuário possui permissão de acesso.

---

#### LOCAL-02 · Planejar Cardápio Operacional da Unidade

**Como** Nutricionista do Rancho, **Quero** visualizar o calendário mensal e associar Preparações a cada dia e refeição, **Para** criar a programação alimentar real da unidade.

**Critérios de Aceite**

- Interface de calendário mensal com navegação por mês.  
- Permitir importar Planos Semanais modelo para um período de datas, preenchendo os dias automaticamente.  
- Permitir ajustes pontuais por dia após a importação (substituição de Preparação).  
- Alterações no Plano Semanal modelo não afetam o calendário já importado.  
- Dias com cardápio planejado são visualmente diferenciados dos dias sem planejamento.

---

#### LOCAL-03 · Consultar Catálogo de Preparações da Unidade

**Como** Nutricionista do Rancho, **Quero** consultar as Preparações disponíveis para minha unidade, **Para** selecionar as mais adequadas ao planejamento do cardápio.

**Critérios de Aceite**

- Listagem com busca por nome e filtro por origem (todas / globais / locais).  
- Exibir informações resumidas: nome, tipo, versão atual e origem (global ou local).  
- Preparações globais e forks locais são visualmente diferenciados na listagem.

---

#### LOCAL-04 · Criar Preparação Local

**Como** Nutricionista do Rancho, **Quero** criar uma nova Preparação do zero para minha unidade, **Para** registrar Preparações específicas da realidade regional.

**Critérios de Aceite**

- Formulário para cadastro de nova Preparação com ingredientes, quantidades per capita e fator de cocção.  
- Preparação criada fica disponível apenas para a unidade.  
- Qualquer edição posterior gera nova versão (append-only) — versão anterior preservada.  
- Validação de campos obrigatórios antes de salvar, com mensagens de erro claras.

---

#### LOCAL-05 · Adaptar Preparação Global (Fork)

**Como** Nutricionista do Rancho, **Quero** criar uma versão local de uma Preparação global da SDAB, **Para** adaptá-la à realidade regional sem perder a referência original.

**Critérios de Aceite**

- Opção de "Forkar" disponível em qualquer Preparação global.  
- O fork cria uma cópia independente vinculada à unidade.  
- Atualizações na Preparação global original não propagam para o fork.  
- O fork é versionado de forma independente (append-only).  
- O fork mantém referência visual à Preparação global de origem (rastreabilidade).

---

#### LOCAL-06 · Comparar Versões de uma Preparação

**Como** Nutricionista do Rancho, **Quero** comparar versões diferentes de uma Preparação, **Para** entender o que mudou entre revisões e auditar o histórico.

**Critérios de Aceite**

- Diff viewer disponível para qualquer Preparação com mais de uma versão.  
- Exibe claramente o que foi adicionado, removido ou alterado entre versões (destaque por cor).  
- Histórico completo de versões acessível, com data, hora e autor de cada alteração.

---

#### LOCAL-07 · Projetar Necessidade de Compra (Suprimentos)

**Como** Gestor do Rancho, **Quero** calcular a necessidade de insumos com base nos cardápios planejados e no efetivo previsto, **Para** gerar uma relação consolidada para licitação (Pregão/ATA).

**Critérios de Aceite**

- Selecionar intervalo de datas (padrão: próxima semana).  
- Calcular total de cada insumo considerando: Per Capita × Efetivo × Repetições \+ Margem de Segurança.  
- Campo configurável para definir a Margem de Segurança (%).  
- Exportar relatório em CSV com: Código, Descrição, Unidade, Qtd. Total, Preço Unitário Estimado e Preço Total Máximo.  
- Alertar quando algum insumo do cardápio planejado não possuir preço unitário estimado cadastrado.

---

#### LOCAL-08 · Gerar QR Code para Check-in Automático

**Como** Gestor do Rancho, **Quero** gerar e exibir um QR Code fixo para check-in autônomo dos Comensais, **Para** agilizar o processo de entrada sem depender exclusivamente do Fiscal.

**Critérios de Aceite**

- Selecionar o Refeitório antes de gerar o QR Code.  
- QR Code gerado e exibido para impressão ou exibição em tela.  
- QR Code pode ser regenerado quando necessário; o QR Code anterior é invalidado automaticamente.  
- Funcionalidade restrita a perfis de Gestor e superiores.

---

### **3.4 Módulo SDAB (Global) — Quem usa: Gestor e Nutricionista da SDAB**

Centraliza a gestão normativa e estratégica para toda a Força: catálogo de insumos, Preparações padrão, Planos Semanais modelo, usuários e configurações globais.

---

#### GLOBAL-01 · Gerenciar Catálogo Global de Insumos

**Como** Nutricionista da SDAB, **Quero** criar e organizar a hierarquia de Grupos, Subgrupos e Produtos do catálogo global, **Para** manter uma base padronizada e facilitar a busca por todas as unidades.

**Critérios de Aceite**

- Estrutura em árvore: Grupo Pai → Grupo Filho → Produto → Item de Compra.  
- Produto pode ser vinculado opcionalmente a um item do catálogo normativo CEAFA.  
- Filtro por "Pertence à CEAFA" na listagem.  
- Exportação do catálogo em CSV.  
- Impedir exclusão de Produtos que estejam vinculados a Preparações ativas — exibir mensagem de dependência.

---

#### GLOBAL-02 · Criar Preparação Global (Padrão FAB)

**Como** Nutricionista da SDAB, **Quero** criar fichas técnicas oficiais (Preparações) visíveis para todas as unidades, **Para** garantir padrão de qualidade e referência técnica em toda a Força.

**Critérios de Aceite**

- Preparações criadas têm visibilidade global — acessíveis por todas as unidades.  
- Definir ingredientes, quantidades per capita e fator de cocção.  
- Qualquer edição gera nova versão (append-only) — histórico preservado.  
- Diff viewer disponível para comparar versões.  
- Exibir indicador de quantas unidades possuem forks ativos da Preparação.

---

#### GLOBAL-03 · Criar Plano Semanal Modelo (Global)

**Como** Nutricionista da SDAB, **Quero** criar Planos Semanais modelo visíveis para todas as unidades, **Para** oferecer templates padronizados que as unidades possam adotar ou adaptar.

**Critérios de Aceite**

- Planos Semanais criados pela SDAB ficam visíveis para todas as unidades.  
- Unidades podem importar um plano modelo para o calendário local — criando uma cópia independente.  
- Alterações no plano modelo após a importação não afetam os calendários já gerados nas unidades.  
- Exibir contador de quantas unidades já importaram o plano modelo.

---

#### GLOBAL-04 · Gerenciar Usuários e Permissões

**Como** Gestor da SDAB, **Quero** atribuir e gerenciar permissões de acesso dos usuários por módulo e unidade, **Para** garantir que cada responsável tenha acesso adequado ao seu escopo de atuação.

**Critérios de Aceite**

- Listar usuários com busca por nome ou unidade.  
- Atribuir ou alterar permissões por módulo (`diner`, `messhall`, `local`, `global`, `analytics`, `storage`) e nível de acesso (0, 1 ou 2).  
- Vincular permissão a um escopo: global, por unidade, por Cozinha ou por Refeitório.  
- Permissão de nível 0 nega explicitamente o acesso ao módulo (inclusive o acesso implícito de Comensal).  
- Registrar log de auditoria para toda alteração de permissão (quem alterou, quando e o que foi alterado).

---

#### GLOBAL-05 · Configurar Pergunta de Avaliação Global

**Como** Gestor da SDAB, **Quero** ativar/desativar e definir o texto da pergunta de avaliação exibida aos Comensais, **Para** coletar feedback de forma centralizada e controlada.

**Critérios de Aceite**

- Toggle para ativar/desativar a pergunta globalmente.  
- Campo de texto para a pergunta (máx. 240 caracteres, com contador visível).  
- Quando ativa, Comensais que ainda não responderam verão a pergunta ao acessar o sistema.  
- Salvar ou reverter alterações com feedback de sucesso ou erro.  
- Exibir data e autor da última alteração na configuração.

---

### **3.5 Módulo Análises — Quem usa: Analista e Gestor do Rancho e da SDAB**

---

#### ANALYTICS-01 · Visualizar Análise Operacional da Unidade

**Como** Gestor ou Analista do Rancho, **Quero** visualizar métricas e indicadores consolidados da minha unidade, **Para** ter controle rápido sobre a saúde operacional e financeira do meu rancho.

**Critérios de Aceite**

- Exibir total de Comensais previstos para o dia e para a semana.  
- Gráfico comparativo de adesão prevista vs. presença realizada.  
- Indicadores de custo e desperdício da unidade.  
- Acesso restrito a perfis com permissão no módulo `analytics` com escopo de unidade ou superior.  
- Permitir exportação dos dados exibidos em CSV ou PDF.

---

#### ANALYTICS-02 · Visualizar Visão Global (SDAB)

**Como** Gestor ou Analista da SDAB, **Quero** ver indicadores consolidados de todas as unidades da Força, **Para** identificar desvios e tomar decisões estratégicas.

**Critérios de Aceite**

- Dashboard com KPIs de todas as unidades: custo, desperdício e adesão.  
- Filtro por unidade ou região.  
- Alertas destacados para unidades com custos acima do esperado.  
- Acesso restrito a perfis com permissão no módulo `analytics` com escopo global.  
- Permitir exportação dos dados exibidos em CSV ou PDF.

---

### **3.6 Hub de Módulos — Quem usa: Todos os usuários autenticados**

---

#### HUB-01 · Selecionar Módulo de Trabalho

**Como** Usuário autenticado, **Quero** ver na tela inicial os módulos disponíveis para o meu perfil de acesso, **Para** navegar rapidamente para onde preciso trabalhar.

**Critérios de Aceite**

- Exibe apenas os módulos acessíveis ao perfil do usuário (baseado nas permissões PBAC).  
- Cada card mostra: ícone do módulo, nome, lista de itens de navegação e botão "Acessar".  
- Estado de carregamento com skeleton cards enquanto as permissões são verificadas.  
- Mensagem adequada quando nenhum módulo está disponível para o perfil.  
- Ao detectar permissão revogada (via invalidação de cache), redirecionar o usuário ao Hub com notificação.

---

## 4\. Modelo de Acesso (PBAC)

O SISUB adota um modelo de controle de acesso baseado em políticas (Policy-Based Access Control), substituindo o antigo modelo de papéis cumulativos. As permissões são granulares: definem **o quê** (módulo e nível) e **onde** (escopo de localidade) o usuário pode acessar.

### **4.1 Estrutura de Permissões**

Cada permissão é composta por três dimensões:

| Dimensão | Campo | Valores / Descrição |
| :---- | :---- | :---- |
| **O Quê — Módulo** | `module` | `diner` · `messhall` · `local` · `global` · `analytics` · `storage` |
| **O Quê — Nível** | `level` | `0` \= Acesso Negado (deny explícito) · `1` \= Leitura/Acesso básico · `2` \= Escrita/Edição |
| **Onde — Escopo** | `mess_hall_id` / `kitchen_id` / `unit_id` | Apenas 1 campo preenchido por vez (arcos exclusivos). Todos nulos \= escopo global. |

**Arcos Exclusivos:** Uma permissão pode ter escopo de Refeitório, Cozinha **ou** Unidade — nunca mais de um ao mesmo tempo. Todos nulos significa acesso global (sem restrição de localidade).

**Resolução de Conflitos:** Quando um usuário possui múltiplas permissões para o mesmo módulo (ex.: uma global e uma por unidade), a permissão mais restritiva (menor `level`) prevalece. O deny explícito (`level: 0`) sempre tem precedência sobre qualquer outra regra.

---

### **4.2 Regras de Negócio de Acesso**

#### Regra 1 — Implicit Allow (Comensal)

- Todo usuário válido do sistema possui acesso implícito ao módulo `diner` (nível 1), mesmo sem registro explícito na tabela de permissões.  
- Para revogar esse acesso, é necessário cadastrar explicitamente uma permissão com `level: 0` para o módulo `diner`.

#### Regra 2 — Escopo Global

- Uma permissão com todos os campos de escopo nulos (`mess_hall_id`, `kitchen_id` e `unit_id` \= null) concede acesso a **qualquer** localidade para aquele módulo e nível.  
- Utilizado para perfis SDAB (superadmin) que precisam de visibilidade sobre toda a Força.

#### Regra 3 — Escopo Restrito

- Uma permissão com escopo preenchido (ex.: `unit_id = 42`) concede acesso apenas àquela localidade específica.  
- Utilizado para Gestores e Fiscais que operam em uma única unidade ou refeitório.

#### Regra 4 — Deny Explícito (Nível 0\)

- Uma permissão com `level: 0` nega explicitamente o acesso ao módulo, sobrepondo qualquer regra de acesso implícito.  
- Caso de uso principal: revogar o acesso de Comensal (`diner`) de um usuário específico.

#### Regra 5 — Validação Real no Servidor

- O cache de permissões no cliente tem validade de 30 minutos (apenas para UX e navegação fluida).  
- Toda ação que altera dados (criar, editar, excluir) valida a permissão diretamente no servidor no momento da execução — o cache do cliente não é suficiente para autorizar mutações.  
- Em caso de permissão revogada detectada pelo servidor, o cache do cliente é invalidado imediatamente e o usuário é redirecionado ao Hub.

#### Regra 6 — Auditoria de Permissões

- Toda alteração de permissão (concessão, revogação ou modificação de nível/escopo) é registrada em log de auditoria imutável.  
- O log contém: usuário afetado, módulo, nível anterior, nível novo, escopo, responsável pela alteração e timestamp.

---

### **4.3 Histórias de Usuário — Controle de Acesso**

---

#### PBAC-01 · Acessar Módulo com Base nas Permissões

**Como** Usuário autenticado, **Quero** que o sistema verifique automaticamente minhas permissões ao navegar entre módulos, **Para** que eu acesse apenas o que estou autorizado, sem precisar gerenciar isso manualmente.

**Critérios de Aceite**

- Ao acessar qualquer rota protegida, o sistema verifica se o usuário possui permissão para o módulo e nível exigidos.  
- Usuário sem permissão é redirecionado ao Hub com mensagem adequada.  
- Usuário não autenticado é redirecionado à tela de login.  
- A verificação considera o escopo da permissão (global, unidade, cozinha ou refeitório).

---

#### PBAC-02 · Ter Acesso Implícito como Comensal

**Como** Usuário autenticado sem permissões explícitas cadastradas, **Quero** acessar automaticamente o módulo Comensal, **Para** poder consultar o cardápio e informar minha adesão sem depender de configuração manual.

**Critérios de Aceite**

- Usuário sem nenhuma permissão cadastrada acessa o módulo `diner` com nível 1 automaticamente.  
- O acesso implícito é suprimido apenas se houver uma permissão explícita com `level: 0` para o módulo `diner`.  
- O Hub exibe o card do módulo Comensal para esses usuários.

---

#### PBAC-03 · Ter Acesso Negado Explicitamente

**Como** Gestor da SDAB, **Quero** revogar o acesso de um usuário a um módulo específico, **Para** garantir que usuários desligados ou com restrições não acessem funcionalidades indevidas.

**Critérios de Aceite**

- Ao atribuir `level: 0` a um módulo para um usuário, o acesso é negado mesmo que haja regra de acesso implícito.  
- O módulo negado não aparece no Hub do usuário afetado.  
- A revogação tem efeito imediato no servidor — o cache do cliente é invalidado.  
- A ação é registrada no log de auditoria (Regra 6).

---

#### PBAC-04 · Ter Permissão com Escopo de Unidade

**Como** Gestor do Rancho, **Quero** que minhas permissões de gestão sejam restritas à minha unidade, **Para** que eu não visualize nem altere dados de outras unidades.

**Critérios de Aceite**

- Permissões com `unit_id` preenchido concedem acesso apenas aos dados daquela unidade.  
- Tentativas de acessar ou modificar dados de outras unidades são bloqueadas pelo servidor com resposta HTTP 403\.  
- O sistema exibe apenas os dados da unidade autorizada nas listagens e relatórios.

---

#### PBAC-05 · Ter Permissão com Escopo Global (SDAB)

**Como** Gestor da SDAB, **Quero** que minhas permissões abranjam todas as unidades da Força, **Para** ter visibilidade e controle estratégico sem restrição de localidade.

**Critérios de Aceite**

- Permissões com todos os campos de escopo nulos concedem acesso a dados de qualquer unidade.  
- Filtros de unidade/região nos dashboards permitem segmentar a visão quando necessário.  
- Ações de escrita (ex.: criar Preparação global) são validadas no servidor com a permissão global.

---

#### PBAC-06 · Auditar Alterações de Permissão

**Como** Gestor da SDAB, **Quero** consultar o histórico de alterações de permissões de acesso, **Para** garantir rastreabilidade e conformidade com as políticas de segurança da Força.

**Critérios de Aceite**

- Log de auditoria acessível via interface administrativa.  
- Filtrável por usuário afetado, módulo, responsável pela alteração e período.  
- Cada entrada exibe: usuário afetado, módulo, nível anterior, nível novo, escopo, responsável e timestamp.  
- Log é imutável — nenhuma entrada pode ser editada ou excluída.  
- Exportação do log em CSV para fins de auditoria externa.

---

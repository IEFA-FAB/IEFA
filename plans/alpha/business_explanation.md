# **ATLAS**

## Agente de Transformação para Licitações Ágeis

### Plano de Projeto — IEFA | Força Aérea Brasileira

---

## 1\. Problema

O processo de contratação pública na FAB, regido pela Lei 14.133/21 e suas Instruções Normativas, exige dos oficiais intendentes um volume expressivo de trabalho operacional: montagem, revisão e alinhamento de documentos como ETP, Termo de Referência e Edital com modelos normativos da AGU/CJU. Esse esforço consome tempo estratégico do intendente, que deveria estar focado em **como prover melhor e comprar com mais inteligência**, não em formalidades documentais.

Problemas centrais identificados:

- **Retrabalho** entre Requisitante, Licitações e ACI por falta de estruturação prévia da demanda  
- **Inconsistências legais** não detectadas antes da revisão do ACI  
- **Baixo aproveitamento** do conhecimento acumulado em jurisprudências TCU e pareceres CJU  
- **Ausência de guia estruturado** para o requisitante descrever sua necessidade com qualidade

---

## 2\. Solução

O **Projeto α** é uma plataforma de IA aplicada ao ciclo de contratações públicas da FAB, composta por módulos autônomos e integráveis, que cobrem desde a estruturação da demanda pelo requisitante até a revisão jurídica pelo ACI — com o humano sempre como decisor final.

*"A IA aumenta a produtividade e apura o olhar. A palavra final é sempre do gestor."*

Cada módulo é capaz de receber um processo em qualquer estágio e conduzi-lo do início ao fim de forma independente.

---

## 3\. Público-Alvo e Perfis de Acesso (RBAC)

| Perfil | Acesso | Função |
| :---- | :---- | :---- |
| **Requisitante** | Somente seu processo | Descreve a necessidade, preenche ETP guiado |
| **Licitações** | Todo o fluxo, pode modificar | Confere, ajusta e encaminha |
| **ACI** | Todo o fluxo, pode modificar | Único com poder de aprovação final |

Arquitetura multiorganização: normas sistêmicas da FAB como base, com camada de customização por OM sem possibilidade de suplantar normas superiores.

---

## 4\. Arquitetura de Entrega — Roadmap em 13 Etapas

### 🔵 Fase 1 — Módulo ACI *(Etapas 1 a 8 | Prioridade máxima)*

Lógica: validar o núcleo jurídico antes de escalar. Mais vale fazer pouco muito bem.

| Etapa | Entrega | Descrição |
| :---- | :---- | :---- |
| 1 | **ChatRADA** | RAG híbrido (semântico \+ BM25) sobre o Regulamento de Administração da Aeronáutica. LLM: Meta Llama 3 70B. Inclui **painel de visualização da documentação fonte**: ao lado do chat, o usuário vê os trechos exatos do RADA que embasaram cada resposta, com navegação direta ao artigo — similar ao detalhamento do NotebookLM |
| 2 | **ChatSistemasSEFA** | RAG com memória em grafo sobre sistemas internos da SEFA |
| 3 | **ChatLicitaçõesSEFA** | RAG com busca em acórdãos TCU, pareceres CJU e Web |
| 4 | **AppAnalista** | Extrator: transforma ETP/TR em JSON estruturado com todos os atributos da contratação |
| 5 | **ComparadorEstrutural** | Compara a estrutura do documento com o modelo oficial da AGU/CJU |
| 6 | **AppVerificadorRestrito** | Parser bloco a bloco: verifica inconformidades legais item a item com base no JSON |
| 7 | **VerificadorAmplo** | Integra etapas 4–6: conformidade legislativa subjetiva \+ estrutural, gera relatório com erro, referência e sugestão |
| 8 | **Plataforma ACI** | Interface completa com persona ACI, integra etapas 1–7 |

---

### 🟢 Fase 2 — Módulo Requisitante *(Etapas 9 a 12\)*

| Etapa | Entrega | Descrição |
| :---- | :---- | :---- |
| 9 | **AppMontaDoc** | Monta documentos no formato CJU a partir do JSON \+ dados do requisitante |
| 10 | **ChatAnaliseProblema** | Guia o requisitante na estruturação da necessidade via Value Focused Thinking; interface híbrida: formulário \+ conversa |
| 11 | **AppRefinador** | Ciclo de aprimoramento da solução com boas práticas da FAB; retorna JSON para o MontaDoc |
| 12 | **Plataforma Requisitante** | Interface integrada das etapas 9–11 |

---

### 🟡 Fase 3 — Copiloto Integrado *(Etapa 13\)*

| Etapa | Entrega | Descrição |
| :---- | :---- | :---- |
| 13 | **Copiloto α** | Agente com acesso a todos os módulos ACI e Requisitante, ativa ferramentas sob demanda, conduz o fluxo completo de planejamento de contratações |

---

## 5\. Decisões Técnicas Relevantes

- **LLM base:** Meta Llama 3 70B — código aberto, uso comercial permitido, compatível com NVIDIA, pode rodar localmente  
- **RAG híbrido:** busca semântica \+ sintática (BM25 ou superior)  
- **Memória em grafo:** para o módulo de sistemas SEFA (Etapa 2\)  
- **JSON como espinha dorsal:** o schema do AppAnalista alimenta todas as etapas seguintes — seu mapeamento é pré-requisito crítico  
- **Verificador Restrito:** lógica de loop item a item com validação cruzada contra o JSON  
- **Ingestão via Markdown:** toda documentação é ingerida a partir de arquivos `.md`, sem dependência de Python ou pipeline de PDF  
- **Painel de documentação original:** o chat exibirá um painel lateral com os trechos exatos das fontes que embasaram cada resposta, com navegação direta ao artigo, similar ao detalhamento do NotebookLM  
- **Infraestrutura:** a definir entre local (on-premise) e nuvem, a ser dimensionada conforme volume por OM (40 a 1.500 processos/ano)

---

## 6\. Modelo de Financiamento

- **Fonte primária:** SINAER — Sistema de Inovação da Aeronáutica  
- **Fonte secundária:** FINEP — Financiadora de Estudos e Projetos  
- **Instituição proponente:** IEFA — Instituto de Economia, Finanças e Administração da Aeronáutica

---

## 7\. Equipe

| Papel | Responsável |
| :---- | :---- |
| Idealizador e Desenvolvedor | Ten. Nanni |
| Gestor do Projeto | Ten. Cel. Laurienne |
| Instituição | IEFA / FAB |

---

## 8\. Prazo e Estratégia de Implantação

- **Horizonte total:** 48 meses  
- **Piloto (Fase 1):** uma OM — validação do módulo ACI  
- **Expansão:** abertura progressiva para demais OMs da FAB  
- **Visão de longo prazo:** outros órgãos públicos

Cronograma detalhado por fase a ser definido em etapa subsequente do planejamento.

---

## 9\. Gestão de Riscos

| Risco | Mitigação |
| :---- | :---- |
| Resistência institucional ao uso de IA | Posicionamento como *"auxiliado por IA"* — decisão final sempre humana |
| Acesso a sistemas externos (TCU, CJU) | Planejamento da integração antecipado; execução após validação interna |
| Qualidade do JSON schema | Mapeamento do modelo CJU como pré-requisito antes das etapas 4–9 |
| Variação de volume entre OMs | Arquitetura escalável; dimensionamento de infraestrutura por fase |
| Normas locais conflitantes | Camada de customização por OM subordinada às normas sistêmicas da FAB |
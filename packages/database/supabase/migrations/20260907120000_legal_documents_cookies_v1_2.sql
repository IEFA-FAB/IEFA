-- Política de Cookies 1.2.0 (pt-BR + en-US). Vigência: 2026-09-07.
--
-- Supersede a 1.1.0 de `20260817120000_legal_documents_v2_1.sql`, cujo conteúdo é a base
-- desta. Termos de Uso e Política de Privacidade NÃO mudam: seguem 2.1.0, e são
-- reinseridos aqui inalterados apenas para que este arquivo continue sendo o conjunto
-- vigente completo — é dele que os guards do `@iefa/legal-kit` leem o texto publicado. O
-- `ON CONFLICT DO NOTHING` do fim garante que a reinserção não cria versão nova daqueles
-- dois, e portanto não pede ciência de documento que ninguém alterou.
--
-- Por que a Política de Cookies muda: as PRs #264 e #265 puseram no ar o módulo de
-- comunicações oficiais do Portal com CINCO chaves de armazenamento que nunca entraram no
-- inventário — `iefa.comaer.draft.v2` (e a família `…:<id>`), `iefa.comaer.editor-mode`,
-- `iefa.comaer.sheet-visible`, `iefa.comaer.library-layout` e `iefa.comaer.just-created`.
-- O guard `cookie-inventory.test.ts` acusa isso desde então; ele não roda no CI porque
-- `@iefa/legal-kit` não tem job próprio no `deploy.yml`, e por isso a divergência
-- sobreviveu a dois merges. É a mesma forma do incidente do Grafana Faro que o CLAUDE.md
-- registra: documento que afirma listar tudo, e não lista.
--
-- Uma das cinco não é preferência de interface, e é o que obriga a mexer no texto e não só
-- na tabela. `iefa.comaer.draft.v2` guarda o RASCUNHO do documento oficial em redação —
-- nome, posto e cargo de quem assina, cargo de quem recebe e o corpo do expediente. É dado
-- pessoal no dispositivo, como o e-mail de "lembrar", e pode ser conteúdo classificado
-- (Anexo I da NSCA 5-3/2026, art. 7º § 2º). Três consequências no documento:
--   * a frase "os dois itens em negrito são os únicos que guardam dado pessoal" passou a
--     ser falsa no instante em que o rascunho foi ao ar. Ela é reescrita, e o rascunho
--     entra em negrito junto com os dois e-mails;
--   * as seções 1 e 2 diziam "manter você autenticado e lembrar preferências", o que já
--     não descreve o conjunto. Guardar rascunho é uma terceira finalidade, e está dita;
--   * a seção 5 passa a avisar que limpar o armazenamento descarta rascunho ainda não
--     gravado no servidor — consequência que o titular precisa saber ANTES de limpar.
--
-- O rascunho continua sem sair do navegador: nada aqui muda o tratamento, só a declaração
-- dele. Quem envia dado para fora segue sendo apenas o Grafana Faro, na seção 4.

INSERT INTO iefa.legal_documents (doc_type, version, locale, content_md, effective_date, published_at)
VALUES

-- ============================================================
-- Termos de Uso — pt-BR 2.1.0
-- ============================================================
(
  'terms_of_use',
  '2.1.0',
  'pt-BR',
  $doc$# Termos de Uso

## 1. Objeto

Este documento regula o uso dos sistemas digitais do Instituto de Economia, Finanças e Administração da Aeronáutica (IEFA), organização militar do Comando da Aeronáutica vinculada à Secretaria de Economia, Finanças e Administração da Aeronáutica (SEFA).

Estes Termos valem para: SISUB (Sistema de Subsistência), Portal IEFA, SUCONT-4, RUMAER, Formulários IEFA, Escolha de Vagas (CPAINT), Projeto α, API IEFA e Documentação IEFA.

## 2. Aceitação

O acesso ao sistema implica a aceitação integral destes Termos de Uso. Caso não concorde com as condições aqui estabelecidas, o usuário deve abster-se de utilizar a plataforma.

A publicação de nova versão destes Termos é comunicada no próximo acesso, e o registro de ciência fica armazenado conforme descrito na Política de Privacidade.

## 3. Acesso e cadastro

O acesso é restrito a militares e servidores civis autorizados pelo IEFA. O usuário é responsável pela confidencialidade de suas credenciais e por todas as ações realizadas com sua conta.

Não há autocadastro aberto: o vínculo do usuário a módulos e perfis é concedido pela administração de cada sistema.

## 4. Uso permitido

O sistema destina-se exclusivamente ao suporte às atividades institucionais do IEFA e da SEFA. É vedado o uso para fins pessoais, comerciais ou que contrariem as normas do Comando da Aeronáutica.

É vedado, em especial:

- compartilhar credenciais ou permitir o uso da conta por terceiros;
- extrair dados em massa para finalidade alheia ao serviço;
- tentar contornar controles de acesso, de perfil ou de escopo;
- inserir informação sigilosa ou classificada em campos de texto livre, anexos ou mensagens enviadas aos assistentes de inteligência artificial.

## 5. Assistentes de inteligência artificial

Alguns módulos oferecem assistentes baseados em modelos de linguagem. As respostas são **sugestões** e podem conter erro. Nenhuma delas constitui decisão administrativa, parecer técnico ou orientação normativa: a conferência e a responsabilidade pelo ato permanecem do usuário.

O conteúdo enviado aos assistentes é armazenado e processado por fornecedor externo, inclusive fora do Brasil. Os detalhes estão na Política de Privacidade, seções 6 e 7.

## 6. Disponibilidade

Os sistemas são disponibilizados no estado em que se encontram, sem garantia de disponibilidade ininterrupta. Manutenções, indisponibilidades e mudanças de funcionalidade podem ocorrer sem aviso prévio.

## 7. Propriedade intelectual

Todo o conteúdo disponibilizado — incluindo textos, dados, software e interfaces — é de titularidade da União Federal e protegido pela legislação vigente. É proibida a reprodução ou distribuição não autorizada.

## 8. Suspensão de acesso

O IEFA pode suspender ou revogar o acesso, a qualquer tempo, em caso de descumprimento destes Termos, encerramento do vínculo funcional ou determinação da autoridade competente.

## 9. Limitação de responsabilidade

O IEFA não se responsabiliza por danos decorrentes do uso indevido do sistema, indisponibilidades técnicas ou ações de terceiros não autorizados.

## 10. Dados pessoais

O tratamento de dados pessoais é regido pela **Política de Privacidade** e pela **Política de Cookies**, que integram estes Termos.

O IEFA é uma instituição pública de ensino e pesquisa, e é para operar o serviço e produzir pesquisa institucional que os dados existem nos sistemas. **O IEFA não vende dados pessoais, em nenhuma hipótese**, e não os cede a terceiros para exploração comercial.

Pedidos de acesso, correção ou exclusão de dados devem ser enviados para **iefa@fab.mil.br**. Não existe exclusão automática pela interface — o procedimento está descrito na seção 10 da Política de Privacidade.

## 11. Alterações

Estes Termos poderão ser atualizados a qualquer momento. O uso continuado após a publicação de nova versão constitui aceitação das alterações. Cada versão fica registrada com número e data de vigência.

## 12. Foro

Fica eleito o foro da Justiça Federal da Seção Judiciária do Rio de Janeiro para dirimir quaisquer questões decorrentes destes Termos.

## 13. Contato

**iefa@fab.mil.br**$doc$,
  '2026-08-17',
  now()
),

-- ============================================================
-- Política de Privacidade — pt-BR 2.1.0
-- ============================================================
(
  'privacy_policy',
  '2.1.0',
  'pt-BR',
  $doc$# Política de Privacidade

> **Em resumo, e sem letra miúda:**
>
> O IEFA é uma instituição pública de **ensino e pesquisa**. Os seus dados existem nos nossos sistemas para operar o serviço e para **produzir estudo, indicador e pesquisa institucional** — não há outra finalidade por trás.
>
> **Nós nunca vendemos os seus dados pessoais.** Nunca os alugamos, cedemos ou trocamos com terceiros para fim comercial, publicitário ou de perfilamento, e não existe hipótese futura em que isso passe a valer: somos órgão da Administração Pública Federal, os dados são da União e a exploração comercial deles é vedada por lei, não por escolha nossa.
>
> **Não existe autoexclusão nos sistemas.** Pedidos de acesso, correção ou eliminação são atendidos manualmente pela Secretaria do IEFA — escreva para **iefa@fab.mil.br** e você tem resposta em até **7 dias corridos** (seção 10).

## 1. Quem trata os seus dados

**Controlador:** Instituto de Economia, Finanças e Administração da Aeronáutica (IEFA), organização militar do Comando da Aeronáutica vinculada à Secretaria de Economia, Finanças e Administração da Aeronáutica (SEFA).

**Encarregado pelo tratamento de dados pessoais** (art. 41 da Lei nº 13.709/2018 — LGPD): **Secretaria do IEFA**, pelo e-mail **iefa@fab.mil.br**.

O encarregado é identificado pelo cargo, não por nome pessoal. O endereço acima é o canal oficial e permanente, independentemente de quem ocupe a função.

## 2. Sistemas cobertos

Esta Política vale para todos os sistemas digitais mantidos pelo IEFA:

- **SISUB** — Sistema de Subsistência (cardápios, receitas, planejamento, análises);
- **Portal IEFA** — portal institucional, acervo e periódico científico;
- **SUCONT-4** — acompanhamento contábil;
- **RUMAER** — consulta ao Regulamento de Uniformes da Aeronáutica;
- **Formulários IEFA** — questionários e pesquisas internas;
- **Escolha de Vagas (CPAINT)** — apoio à sessão de escolha de vagas;
- **Projeto α** — assistente de inteligência artificial para contratações públicas;
- **API IEFA** — interface pública de dados de alimentos e preços;
- **Documentação IEFA** — documentação técnica.

## 3. Base legal

O tratamento **não se apoia em consentimento**. Ele é fundado em:

- **art. 7º, III e art. 23** da LGPD — tratamento e uso compartilhado necessários à execução de políticas públicas e ao cumprimento de atribuições legais do Comando da Aeronáutica;
- **art. 7º, II** — cumprimento de obrigação legal ou regulatória;
- **art. 7º, V** — execução de contrato, quando aplicável.

Consequência prática: não há consentimento a revogar. Isso não reduz os seus direitos — todos os da seção 10 continuam disponíveis, inclusive o de se opor a tratamento que considere irregular.

## 4. Dados coletados

**Cadastro e identificação** — nome, e-mail institucional, posto ou graduação, organização militar (OM), seção, número de ordem (RUMAER) e identificador de conta.

**Registros de acesso e uso** — data e hora de autenticação, endereço IP, agente de usuário (navegador), páginas acessadas, ações realizadas nos módulos e registro de ciência dos documentos legais.

**Conteúdo produzido pelo usuário** — respostas a questionários (incluindo OM e seção do respondente), escolhas registradas na sessão de vagas, cardápios, receitas, planilhas e documentos enviados, e mensagens trocadas com os assistentes de inteligência artificial.

**Preferências de uso** — tema claro ou escuro, estado da barra lateral, última cozinha selecionada, favoritos.

Não coletamos deliberadamente dado pessoal sensível (art. 5º, II). Se você inserir esse tipo de informação em campo de texto livre, anexo ou mensagem para a IA, ela será armazenada como qualquer outro conteúdo. Não insira.

## 5. Finalidades — operar o serviço e fazer pesquisa

O IEFA é uma instituição de ensino e pesquisa da Aeronáutica, e é isso que define para que os dados servem:

- **produzir estudos, séries históricas, indicadores e pesquisa institucional** — esta é a finalidade central e permanente, e é a razão pela qual os dados não são descartados (seção 9);
- autenticar usuários e controlar acesso por perfil;
- executar as atividades institucionais do IEFA e da SEFA;
- guardar as suas preferências de uso (tema, barra lateral, seleções recentes), para que a interface volte como você deixou — detalhe na Política de Cookies;
- monitorar erro e desempenho da aplicação, para manter o serviço disponível e corrigir falha (seção 6);
- auditoria, rastreabilidade e apuração de uso indevido;
- cumprir obrigação legal ou regulatória.

Esta lista é exaustiva. Dado pessoal tratado por nós não é usado para nada fora dela — em especial, **não é usado para publicidade, para formação de perfil comercial nem para qualquer forma de exploração econômica**.

## 6. Operadores e compartilhamento

**O IEFA não vende dados pessoais.** Em nenhuma hipótese, a nenhum comprador, por nenhum preço. Também não os aluga, cede, troca ou disponibiliza a terceiros para finalidade própria destes, e não os utiliza para publicidade.

Isso não é uma política que possa ser revista por conveniência: o IEFA é órgão da Administração Pública Federal, os dados são da União, e a exploração comercial de dado pessoal sob custódia do Estado é vedada pelo ordenamento jurídico.

Há, no entanto, **operadores** que processam dados por conta do IEFA — prestadores que executam uma tarefa técnica sob nossa instrução, sem qualquer direito de uso próprio sobre os dados:

- **Supabase** — banco de dados e autenticação de todos os sistemas;
- **Amazon Web Services (AWS)** — hospedagem das aplicações na região América do Sul (São Paulo, `sa-east-1`) e **Amazon Bedrock**, que executa os modelos de linguagem dos assistentes de IA;
- **Grafana Labs (Grafana Cloud)** — monitoramento de erros e desempenho no navegador, **apenas no SISUB**, por meio do Grafana Faro. Recebe mensagens de erro, métricas de carregamento, o endereço da página visitada e um identificador de sessão gerado no próprio navegador;
- **Sanity** — gerenciamento do conteúdo editorial do Portal.

Dentro do COMAER, o acesso é restrito às áreas com necessidade funcional e controlado por perfil. Fora disso, o compartilhamento ocorre apenas por determinação legal, judicial ou de autoridade competente.

## 7. Transferência internacional

Parte do tratamento ocorre fora do Brasil:

- **Amazon Bedrock** — os modelos de linguagem utilizados não estão disponíveis na região de São Paulo. As mensagens enviadas aos assistentes de IA, e o contexto que as acompanha, são processados na região `us-east-1` (Norte da Virgínia, Estados Unidos). **Não utilize os assistentes para tratar informação sigilosa ou dado pessoal de terceiros.**
- **Grafana Cloud** — os dados de monitoramento do SISUB são armazenados na infraestrutura do fornecedor, fora do território nacional.

Fundamento: **art. 33, III** da LGPD — transferência necessária à execução de política pública e ao exercício de atribuição legal de serviço público.

## 8. Cookies e armazenamento local

Os sistemas usam cookies de sessão e armazenamento local do navegador. Não há cookies de publicidade nem rastreamento entre sites. O inventário completo está na **Política de Cookies**.

## 9. Por quanto tempo guardamos os dados

**Não existe rotina de expurgo automático em nenhum dos sistemas.** Nenhum dado é apagado por idade. Sendo direto sobre o que isso significa:

- **a retenção é por prazo indeterminado, e a expectativa é que seja permanente.** A base do IEFA sustenta estudos, séries históricas e indicadores institucionais, e uma série histórica perde valor se truncada. Esta versão da Política não fixa prazo de descarte;
- **registros de acesso** têm guarda mínima de 6 meses por força do art. 15 do Marco Civil da Internet (Lei nº 12.965/2014) e, na prática, são mantidos além desse mínimo, pelo motivo acima;
- **o histórico de conversas com os assistentes de IA** é armazenado junto ao registro do usuário e segue a mesma regra.

Declaramos isso expressamente porque a alternativa — anunciar um prazo de descarte que nenhuma rotina executa — seria informação falsa. Caso uma política de expurgo venha a ser implementada, ela será publicada aqui com a respectiva data de início.

Você pode solicitar a eliminação dos seus dados a qualquer momento (seção 10). O pedido é atendido nos limites do **art. 16** da LGPD, que autoriza a conservação para cumprimento de obrigação legal, estudo por órgão de pesquisa — com anonimização sempre que possível — e uso exclusivo do controlador.

## 10. Seus direitos e como exercê-los

O art. 18 da LGPD assegura: confirmação da existência de tratamento; acesso aos dados; correção de dados incompletos, inexatos ou desatualizados; anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade; portabilidade; informação sobre compartilhamento; e revisão de decisões automatizadas.

**Canal único: iefa@fab.mil.br**

**Não existe botão de autoexclusão nos sistemas do IEFA.** Nenhum usuário consegue apagar a própria conta ou os próprios dados pela interface. Toda solicitação — inclusive a de exclusão — é recebida por e-mail e **processada manualmente** pela Secretaria do IEFA.

Como solicitar:

1. envie mensagem para **iefa@fab.mil.br**;
2. informe nome completo, e-mail institucional cadastrado e, se possível, a OM;
3. descreva o que pretende (acesso, correção, exclusão, portabilidade, informação sobre compartilhamento) e a qual sistema se refere.

**Prazo de resposta: 7 (sete) dias corridos**, contados do recebimento da mensagem. É um compromisso do IEFA, mais curto que os 15 dias previstos no art. 19, §1º da LGPD.

Se o pedido de exclusão não puder ser atendido, integral ou parcialmente, você recebe no mesmo prazo a justificativa e a indicação da hipótese do art. 16 que se aplica.

Você também pode peticionar diretamente à **Autoridade Nacional de Proteção de Dados (ANPD)**.

## 11. Segurança

Adotamos medidas técnicas e administrativas compatíveis com as normas de segurança do Comando da Aeronáutica: credencial individual, controle de acesso por perfil e escopo, tráfego cifrado em trânsito (TLS), segregação de dados por domínio e registro das ações realizadas.

Nenhuma medida elimina completamente o risco. Incidente de segurança com risco relevante aos titulares é comunicado à ANPD e aos afetados, na forma do art. 48 da LGPD.

## 12. Inteligência artificial e decisões automatizadas

Os assistentes de IA **não tomam decisões sobre pessoas**. Não avaliam, classificam nem definem direito, benefício ou situação funcional de ninguém. Produzem texto e sugestões submetidos a revisão humana, e não configuram tratamento automatizado de perfil pessoal na acepção do art. 20 da LGPD.

O conteúdo das mensagens é armazenado (seção 4) e processado fora do Brasil (seção 7).

## 13. Público e publicidade de atos oficiais

Os sistemas são de uso restrito a militares e servidores autorizados e não são dirigidos a crianças ou adolescentes.

Um ponto merece registro explícito: o **painel da Escolha de Vagas (CPAINT)** exibe, **sem exigir autenticação**, o nome, a classificação e a localidade dos participantes durante a sessão de escolha.

Essas informações **já são públicas por publicação oficial** — constam do Boletim Ostensivo do Comando da Aeronáutica e, em parte, do Diário Oficial da União. O painel apenas reproduz, no momento da sessão, dado que a Administração já tornou público: não há aqui divulgação nova nem ampliação da publicidade existente.

Fundamento: princípio da publicidade dos atos administrativos (art. 37, *caput*, da Constituição), Lei de Acesso à Informação (Lei nº 12.527/2011) e art. 23 da LGPD.

Pedidos relativos a esses dados seguem o canal da seção 10. Registre-se, porém, que a **eliminação não alcança a publicação oficial**: boletim e Diário Oficial são atos da Administração, com regime jurídico próprio, fora do controle desta plataforma.

## 14. Alterações

Esta Política é versionada. O número da versão e a data de vigência constam no topo desta página, e cada versão publicada fica arquivada. Em caso de alteração material, uma nova ciência é solicitada no acesso seguinte.

## 15. Contato

Dúvidas, pedidos e reclamações relacionados a esta Política: **iefa@fab.mil.br**$doc$,
  '2026-08-17',
  now()
),

-- ============================================================
-- Política de Cookies — pt-BR 1.1.0
-- ============================================================
(
  'cookie_policy',
  '1.2.0',
  'pt-BR',
  $doc$# Política de Cookies

## 1. O que usamos, em uma frase

Os sistemas do IEFA usam cookies e armazenamento local do navegador **para manter você autenticado, lembrar suas preferências de interface e guardar, no seu próprio dispositivo, o rascunho do que você está redigindo**. Não há cookies de publicidade, de rastreamento entre sites ou de perfilamento comercial.

**O IEFA nunca vende esses dados**, e não os aluga, cede nem troca com terceiros para fim comercial. Somos uma instituição pública de ensino e pesquisa: o que fazemos com dado é operar o serviço e produzir estudo.

## 2. Por que não existe banner de consentimento

Todos os itens listados abaixo são **necessários ao funcionamento**, registram uma **preferência sua** definida na própria interface ou guardam **no seu dispositivo** o rascunho do que você está escrevendo, para que ele sobreviva a um recarregamento da página. Nenhum deles depende de consentimento prévio, e por isso não exibimos um aviso que interrompa a navegação para pedir algo que não seria uma escolha real — bloquear o cookie de sessão simplesmente impede o login.

O único item que envia dados para fora dos sistemas do IEFA é o identificador de sessão do Grafana Faro, descrito na seção 4.

## 3. Inventário

| Nome | Onde fica | Sistemas | Validade | Para que serve |
| --- | --- | --- | --- | --- |
| `sb-<projeto>-auth-token` | cookie | todos os sistemas com login | duração da sessão, com renovação | manter a sessão autenticada; sem ele não há login |
| `fab_remember_email` | armazenamento local | SISUB, Portal, RUMAER, Formulários | até ser limpo pelo usuário | **guarda o seu e-mail institucional** para preencher a tela de login; só é gravado se você marcar "lembrar" |
| `sucont_remember_email` | armazenamento local | SUCONT-4 | até ser limpo pelo usuário | **guarda o seu e-mail institucional** para preencher a tela de login; só é gravado se você marcar "lembrar" |
| `sidebar_state` | cookie | SISUB, Formulários | 7 dias | lembrar se a barra lateral está recolhida |
| `theme` | cookie | SISUB, Portal, RUMAER, Formulários | 1 ano | tema claro ou escuro; é lido pelo servidor para já enviar a página no tema certo |
| `sisub:selected_kitchen_id` | armazenamento local | SISUB | até ser limpo pelo usuário | última cozinha selecionada |
| `places-graph-positions-v1` | armazenamento local | SISUB | até ser limpo pelo usuário | posição dos nós no fluxo de produção |
| `sisub:stale-chunk-reloads` | armazenamento local | SISUB | transitória | evitar laço de recarregamento após uma publicação |
| `sisub:global-ingredients:scroll`, `sisub:global-preparations:*` | armazenamento de sessão | SISUB | fim da aba | posição de rolagem e ordenação das listas de insumos e preparações |
| `iefa_app_favorites_v1` | armazenamento local | Portal | até ser limpo pelo usuário | aplicações marcadas como favoritas |
| `pregoeiro_preferences_v1` | armazenamento local | Portal | até ser limpo pelo usuário | preferências do painel do pregoeiro |
| `pregoeiro_table_settings_v1` | armazenamento local | Portal | até ser limpo pelo usuário | colunas e ordenação das tabelas do pregoeiro |
| `iefa.comaer.draft.v2` e `iefa.comaer.draft.v2:<id>` | armazenamento local | Portal | até ser limpo pelo usuário, ou até você salvar o documento | **guarda o rascunho da comunicação oficial que você está redigindo** — nome, posto e cargo de quem assina, cargo de quem recebe, assunto e corpo do expediente. Existe para que um recarregamento da página não apague o que foi escrito; fica apenas no seu dispositivo e não é enviado a terceiro |
| `iefa.comaer.editor-mode`, `iefa.comaer.sheet-visible`, `iefa.comaer.library-layout` | armazenamento local | Portal | até ser limpo pelo usuário | preferências da tela de comunicações oficiais: começar pelo formulário ou pela conversa, exibir ou ocultar a folha, e a disposição da biblioteca |
| `iefa.comaer.just-created` | armazenamento de sessão | Portal | fim da aba | mostrar a confirmação do documento recém-criado depois que a página muda de endereço |
| identificador de sessão do Grafana Faro | armazenamento do navegador | SISUB | duração da visita | agrupar erros e métricas de desempenho de uma mesma visita |

Os itens em negrito são os que guardam **dado pessoal** no seu navegador: o e-mail institucional que você digitou na tela de login e o rascunho da comunicação oficial em redação, que carrega nome, posto e cargo de quem assina e de quem recebe. Todos ficam apenas no seu dispositivo e não são enviados a terceiros. Limpar o armazenamento do navegador remove todos eles; no caso do e-mail, desmarcar "lembrar" já basta.

O rascunho pode conter assunto classificado como reservado, secreto ou ultrassecreto (NSCA 5-3/2026, Anexo I, art. 7º § 2º). Ele permanece no navegador justamente por isso: não é enviado ao servidor enquanto você não salvar o documento. Em computador compartilhado, salve ou descarte o rascunho antes de encerrar a sessão.

## 4. Grafana Faro (apenas no SISUB)

O SISUB carrega o Grafana Faro para monitoramento de erros e desempenho. Ele gera um identificador de sessão no navegador e envia ao **Grafana Cloud**, fornecedor externo com infraestrutura fora do Brasil: mensagens de erro de JavaScript, métricas de carregamento da página (Web Vitals) e o endereço da página visitada.

O identificador é aleatório, não é vinculado ao seu cadastro e serve para agrupar os eventos de uma mesma visita. Ainda assim, é um dado enviado a terceiro, e por isso está declarado aqui e na seção 6 da Política de Privacidade.

Os demais sistemas do IEFA não carregam o Faro.

## 5. Como recusar ou remover

Você pode bloquear cookies e limpar o armazenamento local nas configurações do seu navegador.

Consequência: **o login deixa de funcionar** — sem o cookie de sessão não é possível manter a autenticação. As preferências de interface voltam ao padrão a cada acesso.

Atenção antes de limpar: o rascunho de comunicação oficial que ainda não foi salvo vive no armazenamento local. Limpá-lo descarta o que não tiver sido gravado no servidor, e não há como recuperá-lo.

## 6. Alterações

Esta Política é versionada, e a versão vigente e a data de vigência aparecem no topo desta página. Novos cookies ou novos destinatários de dados serão incluídos no inventário da seção 3 antes de entrarem em uso.

## 7. Contato

**iefa@fab.mil.br**$doc$,
  '2026-09-07',
  now()
),

-- ============================================================
-- Terms of Use — en-US 2.1.0
-- ============================================================
(
  'terms_of_use',
  '2.1.0',
  'en-US',
  $doc$# Terms of Use

> Reference text: the Brazilian Portuguese version. In case of divergence, the pt-BR version prevails.

## 1. Purpose

This document governs the use of the digital systems maintained by the Institute of Economics, Finance and Administration of the Brazilian Air Force (IEFA), a military organisation of the Brazilian Air Force Command subordinated to the Secretariat of Economics, Finance and Administration (SEFA).

These Terms apply to: SISUB, IEFA Portal, SUCONT-4, RUMAER, IEFA Forms, Assignment Selection (CPAINT), Project α, IEFA API and IEFA Documentation.

## 2. Acceptance

Accessing the system implies full acceptance of these Terms of Use. Users who do not agree with these conditions must refrain from using the platform.

New versions are announced on the next sign-in, and the acknowledgement record is stored as described in the Privacy Policy.

## 3. Access and registration

Access is restricted to military personnel and civil servants authorised by IEFA. Users are responsible for keeping their credentials confidential and for every action taken with their account.

There is no open self-registration: module and role assignments are granted by each system's administration.

## 4. Permitted use

The systems exist solely to support the institutional activities of IEFA and SEFA. Personal or commercial use, or any use contrary to Brazilian Air Force Command regulations, is prohibited.

In particular, users must not:

- share credentials or allow third parties to use their account;
- perform bulk data extraction for purposes unrelated to the service;
- attempt to bypass access, role or scope controls;
- enter classified or restricted information into free-text fields, attachments or messages sent to the artificial intelligence assistants.

## 5. Artificial intelligence assistants

Some modules offer assistants based on language models. Their answers are **suggestions** and may contain errors. They do not constitute administrative decisions, technical opinions or regulatory guidance: verification and responsibility remain with the user.

Content sent to the assistants is stored and processed by an external provider, including outside Brazil. Details are in sections 6 and 7 of the Privacy Policy.

## 6. Availability

The systems are provided as is, with no guarantee of uninterrupted availability. Maintenance windows, outages and functionality changes may occur without prior notice.

## 7. Intellectual property

All content made available — including text, data, software and interfaces — belongs to the Brazilian Federal Union and is protected by applicable law. Unauthorised reproduction or distribution is prohibited.

## 8. Suspension of access

IEFA may suspend or revoke access at any time in case of breach of these Terms, termination of the user's functional relationship, or upon determination by a competent authority.

## 9. Limitation of liability

IEFA is not liable for damages arising from misuse of the systems, technical unavailability or actions by unauthorised third parties.

## 10. Personal data

The processing of personal data is governed by the **Privacy Policy** and the **Cookie Policy**, which form part of these Terms.

IEFA is a public teaching and research institution, and running the service and producing institutional research is why the data exists in these systems. **IEFA does not sell personal data under any circumstances**, and does not assign it to third parties for commercial exploitation.

Requests for access, correction or deletion of data must be sent to **iefa@fab.mil.br**. There is no automated deletion through the interface — the procedure is described in section 10 of the Privacy Policy.

## 11. Amendments

These Terms may be updated at any time. Continued use after a new version is published constitutes acceptance of the changes. Every version is recorded with a number and an effective date.

## 12. Jurisdiction

The Federal Court of the Judiciary Section of Rio de Janeiro is elected to settle any disputes arising from these Terms.

## 13. Contact

**iefa@fab.mil.br**$doc$,
  '2026-08-17',
  now()
),

-- ============================================================
-- Privacy Policy — en-US 2.1.0
-- ============================================================
(
  'privacy_policy',
  '2.1.0',
  'en-US',
  $doc$# Privacy Policy

> Reference text: the Brazilian Portuguese version. In case of divergence, the pt-BR version prevails.

> **In short, with no fine print:**
>
> IEFA is a public **teaching and research** institution. Your data exists in our systems to run the service and to **produce studies, indicators and institutional research** — there is no other purpose behind it.
>
> **We never sell your personal data.** We never rent, assign or trade it to third parties for commercial, advertising or profiling purposes, and there is no future scenario in which that changes: we are a body of the Brazilian Federal Public Administration, the data belongs to the Federal Union, and its commercial exploitation is forbidden by law, not merely by our choice.
>
> **There is no self-service deletion.** Requests for access, correction or deletion are handled manually by the IEFA Secretariat — write to **iefa@fab.mil.br** and you get an answer within **7 calendar days** (section 10).

## 1. Who processes your data

**Controller:** Institute of Economics, Finance and Administration of the Brazilian Air Force (IEFA), a military organisation of the Brazilian Air Force Command subordinated to the Secretariat of Economics, Finance and Administration (SEFA).

**Data Protection Officer** (art. 41 of Law 13.709/2018 — LGPD, the Brazilian General Data Protection Law): the **IEFA Secretariat**, at **iefa@fab.mil.br**.

The officer is identified by office rather than by personal name. The address above is the official and permanent channel, regardless of who holds the position.

## 2. Systems covered

This Policy applies to every digital system maintained by IEFA:

- **SISUB** — food service system (menus, recipes, planning, analytics);
- **IEFA Portal** — institutional portal, repository and scientific journal;
- **SUCONT-4** — accounting follow-up;
- **RUMAER** — Brazilian Air Force uniform regulation reference;
- **IEFA Forms** — internal questionnaires and surveys;
- **Assignment Selection (CPAINT)** — support for the assignment selection session;
- **Project α** — artificial intelligence assistant for public procurement;
- **IEFA API** — public interface for food and price data;
- **IEFA Documentation** — technical documentation.

## 3. Legal basis

Processing is **not based on consent**. It relies on:

- **art. 7, III and art. 23** of the LGPD — processing necessary for the execution of public policies and the legal duties of the Brazilian Air Force Command;
- **art. 7, II** — compliance with a legal or regulatory obligation;
- **art. 7, V** — performance of a contract, where applicable.

Practical consequence: there is no consent to withdraw. This does not reduce your rights — every right listed in section 10 remains available, including objecting to processing you consider unlawful.

## 4. Data collected

**Identification and account** — name, institutional e-mail, military rank, military organisation (OM), section, order number (RUMAER) and account identifier.

**Access and usage records** — sign-in date and time, IP address, user agent, pages visited, actions performed in the modules, and the acknowledgement record for legal documents.

**User-generated content** — questionnaire answers (including the respondent's OM and section), choices recorded during the assignment selection session, menus, recipes, uploaded spreadsheets and documents, and messages exchanged with the artificial intelligence assistants.

**Preferences** — light or dark theme, sidebar state, last selected kitchen, favourites.

We do not deliberately collect sensitive personal data (art. 5, II). If you enter such information into a free-text field, an attachment or a message to the AI assistants, it will be stored like any other content. Please do not.

## 5. Purposes — running the service and doing research

IEFA is a teaching and research institution of the Brazilian Air Force, and that is what defines what the data is for:

- **producing studies, historical series, indicators and institutional research** — this is the central and permanent purpose, and the reason data is not discarded (section 9);
- authenticating users and enforcing role-based access;
- carrying out the institutional activities of IEFA and SEFA;
- storing your usage preferences (theme, sidebar, recent selections) so the interface comes back as you left it — detailed in the Cookie Policy;
- monitoring application errors and performance, to keep the service available and fix faults (section 6);
- auditing, traceability and investigation of misuse;
- complying with legal or regulatory obligations.

This list is exhaustive. Personal data we process is not used for anything outside it — in particular, it is **not used for advertising, for building commercial profiles, or for any form of economic exploitation**.

## 6. Processors and sharing

**IEFA does not sell personal data.** Under no circumstances, to no buyer, at no price. Nor does it rent, assign, trade or make it available to third parties for those parties' own purposes, and it does not use it for advertising.

This is not a policy that could be revisited out of convenience: IEFA is a body of the Brazilian Federal Public Administration, the data belongs to the Federal Union, and the commercial exploitation of personal data held by the State is forbidden by law.

There are, however, **processors** acting on IEFA's behalf — providers performing a technical task under our instruction, with no right of their own to use the data:

- **Supabase** — database and authentication for every system;
- **Amazon Web Services (AWS)** — application hosting in the South America (São Paulo, `sa-east-1`) region, and **Amazon Bedrock**, which runs the language models behind the AI assistants;
- **Grafana Labs (Grafana Cloud)** — browser error and performance monitoring, **in SISUB only**, through Grafana Faro. It receives JavaScript error messages, page-load metrics, the address of the visited page and a session identifier generated in the browser;
- **Sanity** — editorial content management for the Portal.

Within the Air Force Command, access is restricted to units with a functional need and controlled by role. Beyond that, sharing occurs only under a legal or judicial order, or an order from a competent authority.

## 7. International transfer

Part of the processing takes place outside Brazil:

- **Amazon Bedrock** — the language models in use are not available in the São Paulo region. Messages sent to the AI assistants, and the context accompanying them, are processed in the `us-east-1` region (Northern Virginia, United States). **Do not use the assistants to handle classified information or third parties' personal data.**
- **Grafana Cloud** — SISUB monitoring data is stored on the vendor's infrastructure, outside Brazilian territory.

Legal ground: **art. 33, III** of the LGPD — transfer necessary for the execution of a public policy and the exercise of a legal public-service duty.

## 8. Cookies and local storage

The systems use session cookies and browser local storage. There are no advertising cookies and no cross-site tracking. The full inventory is in the **Cookie Policy**.

## 9. How long we keep data

**There is no automated data-purge routine in any of the systems.** No data is deleted based on age. To be direct about what that means:

- **retention is indefinite, and the expectation is that it is permanent.** The IEFA database supports studies, historical series and institutional indicators, and a historical series loses value if truncated. This version of the Policy does not set a disposal deadline;
- **access records** must be kept for at least 6 months under art. 15 of the Brazilian Civil Rights Framework for the Internet (Law 12.965/2014) and, in practice, are kept beyond that minimum for the reason above;
- **AI assistant conversation history** is stored alongside the user record and follows the same rule.

We state this explicitly because the alternative — announcing a disposal deadline that no routine enforces — would be false information. If a purge policy is implemented, it will be published here with its start date.

You may request deletion of your data at any time (section 10). Requests are honoured within the limits of **art. 16** of the LGPD, which allows retention for compliance with legal obligations, research by a research body — anonymised whenever possible — and exclusive use by the controller.

## 10. Your rights and how to exercise them

Art. 18 of the LGPD guarantees: confirmation that processing exists; access to the data; correction of incomplete, inaccurate or outdated data; anonymisation, blocking or deletion of unnecessary or unlawfully processed data; portability; information about sharing; and review of automated decisions.

**Single channel: iefa@fab.mil.br**

**There is no self-service deletion button in IEFA systems.** No user can delete their own account or data through the interface. Every request — deletion included — is received by e-mail and **processed manually** by the IEFA Secretariat.

How to file a request:

1. write to **iefa@fab.mil.br**;
2. state your full name, the institutional e-mail on record and, if possible, your OM;
3. describe what you want (access, correction, deletion, portability, information about sharing) and which system it concerns.

**Response time: 7 (seven) calendar days** from receipt of the message. This is a commitment by IEFA, shorter than the 15 days set out in art. 19, §1 of the LGPD.

If a deletion request cannot be fulfilled, in whole or in part, you will receive the justification within the same period, indicating which art. 16 exception applies.

You may also petition the **Brazilian National Data Protection Authority (ANPD)** directly.

## 11. Security

We apply technical and administrative measures consistent with Brazilian Air Force Command security regulations: individual credentials, role- and scope-based access control, encrypted traffic in transit (TLS), data segregation by domain, and action logging.

No measure eliminates risk entirely. Security incidents posing relevant risk to data subjects are reported to the ANPD and to those affected, under art. 48 of the LGPD.

## 12. Artificial intelligence and automated decisions

The AI assistants **do not make decisions about people**. They do not evaluate, rank or determine anyone's rights, benefits or functional status. They produce text and suggestions subject to human review, and do not constitute automated processing of personal profiles within the meaning of art. 20 of the LGPD.

Message content is stored (section 4) and processed outside Brazil (section 7).

## 13. Audience and publicity of official acts

The systems are restricted to authorised military personnel and civil servants and are not directed at children or adolescents.

One point deserves explicit mention: the **Assignment Selection board (CPAINT)** displays, **without requiring authentication**, the name, ranking and location of participants during the selection session.

This information is **already public through official publication** — it appears in the Brazilian Air Force Command's unclassified bulletin (Boletim Ostensivo) and, in part, in the Federal Official Gazette (Diário Oficial da União). The board merely reproduces, during the session, data the Administration has already made public: it is neither a new disclosure nor an expansion of existing publicity.

Legal ground: the constitutional principle of publicity of administrative acts (art. 37, *caput*), the Brazilian Access to Information Act (Law 12.527/2011) and art. 23 of the LGPD.

Requests concerning this data follow the channel in section 10. Note, however, that **deletion does not reach the official publication**: the bulletin and the Official Gazette are acts of the Administration, governed by their own legal regime and outside this platform's control.

## 14. Amendments

This Policy is versioned. The version number and effective date appear at the top of this page, and every published version is archived. In case of material change, a new acknowledgement is requested on the next sign-in.

## 15. Contact

Questions, requests and complaints regarding this Policy: **iefa@fab.mil.br**$doc$,
  '2026-08-17',
  now()
),

-- ============================================================
-- Cookie Policy — en-US 1.1.0
-- ============================================================
(
  'cookie_policy',
  '1.2.0',
  'en-US',
  $doc$# Cookie Policy

> Reference text: the Brazilian Portuguese version. In case of divergence, the pt-BR version prevails.

## 1. What we use, in one sentence

IEFA systems use cookies and browser local storage **to keep you signed in, to remember your interface preferences and to hold, on your own device, the draft of what you are writing**. There are no advertising cookies, no cross-site tracking and no commercial profiling.

**IEFA never sells this data**, and does not rent, assign or trade it to third parties for commercial purposes. We are a public teaching and research institution: what we do with data is run the service and produce research.

## 2. Why there is no consent banner

Every item listed below is either **strictly necessary** for the systems to work, records a **preference you set** in the interface, or holds **on your device** the draft of what you are writing, so that it survives a page reload. None of them depends on prior consent, so we do not interrupt navigation to ask for something that would not be a real choice — blocking the session cookie simply prevents sign-in.

The only item that sends data outside IEFA systems is the Grafana Faro session identifier, described in section 4.

## 3. Inventory

| Name | Stored as | Systems | Lifetime | Purpose |
| --- | --- | --- | --- | --- |
| `sb-<project>-auth-token` | cookie | all systems with sign-in | session lifetime, refreshed | keeping the session authenticated; without it there is no sign-in |
| `fab_remember_email` | local storage | SISUB, Portal, RUMAER, Forms | until cleared by the user | **stores your institutional e-mail** to prefill the sign-in screen; only written if you tick "remember" |
| `sucont_remember_email` | local storage | SUCONT-4 | until cleared by the user | **stores your institutional e-mail** to prefill the sign-in screen; only written if you tick "remember" |
| `sidebar_state` | cookie | SISUB, Forms | 7 days | remembering whether the sidebar is collapsed |
| `theme` | cookie | SISUB, Portal, RUMAER, Forms | 1 year | light or dark theme; read by the server so the page is sent already in the right theme |
| `sisub:selected_kitchen_id` | local storage | SISUB | until cleared by the user | last selected kitchen |
| `places-graph-positions-v1` | local storage | SISUB | until cleared by the user | node positions in the production flow |
| `sisub:stale-chunk-reloads` | local storage | SISUB | transient | preventing a reload loop after a deployment |
| `sisub:global-ingredients:scroll`, `sisub:global-preparations:*` | session storage | SISUB | until the tab closes | scroll position and sort order of the ingredient and preparation lists |
| `iefa_app_favorites_v1` | local storage | Portal | until cleared by the user | applications marked as favourites |
| `pregoeiro_preferences_v1` | local storage | Portal | until cleared by the user | preferences for the procurement officer dashboard |
| `pregoeiro_table_settings_v1` | local storage | Portal | until cleared by the user | column and sort settings for the procurement officer tables |
| `iefa.comaer.draft.v2` and `iefa.comaer.draft.v2:<id>` | local storage | Portal | until cleared by the user, or until you save the document | **holds the draft of the official communication you are writing** — the name, rank and position of the signer, the position of the addressees, the subject and the body of the document. It exists so that a page reload does not erase what was written; it stays on your device and is not sent to any third party |
| `iefa.comaer.editor-mode`, `iefa.comaer.sheet-visible`, `iefa.comaer.library-layout` | local storage | Portal | until cleared by the user | preferences of the official communications screen: whether to open on the form or on the chat, whether to show the sheet, and the library layout |
| `iefa.comaer.just-created` | session storage | Portal | until the tab closes | showing the confirmation for a newly created document after the page changes address |
| Grafana Faro session identifier | browser storage | SISUB | visit lifetime | grouping errors and performance metrics from the same visit |

The entries in bold are the ones that keep **personal data** in your browser: the institutional e-mail you typed on the sign-in screen, and the draft of the official communication being written, which carries the name, rank and position of the signer and of the addressees. All of them stay on your device and are not sent to third parties. Clearing browser storage removes them all; for the e-mail, unticking "remember" is enough.

A draft may cover a subject classified as restricted, secret or top secret (NSCA 5-3/2026, Annex I, art. 7 § 2). It stays in the browser precisely for that reason: it is not sent to the server until you save the document. On a shared computer, save or discard the draft before ending your session.

## 4. Grafana Faro (SISUB only)

SISUB loads Grafana Faro for error and performance monitoring. It generates a session identifier in the browser and sends the following to **Grafana Cloud**, an external vendor with infrastructure outside Brazil: JavaScript error messages, page-load metrics (Web Vitals) and the address of the visited page.

The identifier is random, is not linked to your account record and exists to group events from a single visit. It is nonetheless data sent to a third party, which is why it is declared here and in section 6 of the Privacy Policy.

No other IEFA system loads Faro.

## 5. How to refuse or remove

You can block cookies and clear local storage in your browser settings.

Consequence: **sign-in will stop working** — without the session cookie, authentication cannot be maintained. Interface preferences will reset on every visit.

One warning before clearing: the draft of an official communication that has not been saved lives in local storage. Clearing it discards whatever was not written to the server, and it cannot be recovered.

## 6. Amendments

This Policy is versioned; the current version and effective date appear at the top of this page. New cookies or new data recipients will be added to the inventory in section 3 before they come into use.

## 7. Contact

**iefa@fab.mil.br**$doc$,
  '2026-09-07',
  now()
)

ON CONFLICT (doc_type, version, locale) DO NOTHING;

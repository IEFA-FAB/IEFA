# Comensal e Fiscal

Hipóteses a verificar.

### COM-PRV-01 — "Marquei que ia almoçar e não fui (ou o contrário)"
- **O sistema precisa:** arranchamento x presença reconciliados sem punir quem avisou tarde por motivo de serviço.
- **Cobertura:** hipótese.

### COM-ARR-02 — "Salvei o link da antiga tela 'Previsão' (ou procuro por esse nome)"
- **O sistema precisa:** a tela chama-se Arranchamento (lote 7 de `sisub-ubiquitous-language`), mas o
  favorito antigo e a busca pelo termo antigo continuam chegando nela.
- **UX:** `/diner/forecast` redireciona para `/diner/arranchamento` com a query intacta; "previsão"
  segue como palavra-chave da busca do menu.
- **Cobertura:** `apps/sisub/src/lib/legacy-routes.test.ts` (redirect) e `NavItems.tsx` (palavra-chave).

### COM-PRF-01 — "Cheguei à OM depois da última carga do cadastro de pessoal"
- **O sistema precisa:** sem a pessoa no espelho (`core.user_military_data`, patch manual do
  mantenedor, sem FK de propósito), nem a chave do e-mail nem o CPF conferem. Desde
  `saram-verified-link` o SARAM não é mais gravado como veio: vira **pedido de vínculo** para o
  administrador (`admin:2`), que pode aprovar mesmo fora do espelho. A pessoa continua arranchando.
- **UX:** "Meu cadastro militar" (`/diner/military-record`; no sucont, diálogo pelo aviso ou pelo
  menu do usuário) → "Pedir o vínculo à administração" com SARAM e justificativa (exemplo no campo).
  Depois, o estado é `pending_request`: o aviso de entrada vira "pedido em análise" (dispensável), a
  tela mostra o que foi pedido, quando e quem decide, e "Desistir do pedido" (com confirmação). O
  arranchamento continua, com lembrete discreto. Nome de exibição e rótulos caem no e-mail. O
  administrador decide em Administração do Sistema → Cadastro Militar → Pedidos.
- **Cobertura:** `apps/sisub/src/test/operations/user.operations.test.ts` (número fora da chave vira
  pedido e não abre cadastro), `saram-link.operations.test.ts` (pedido, desistência, vínculo manual
  do admin), `packages/database/scripts/access-audit/saram-link.test.sql`. Tela (frases e ações por
  estado): `packages/database/src/saram-link.test.ts`. e2e do pedido: **LACUNA** (task 4.5; conferido
  no navegador no PR da FASE 2).

### COM-PRF-02 — "Troquei de nome (casamento) ou de nome de guerra, e o e-mail não bate mais"
- **O sistema precisa:** a chave do e-mail (nome de guerra + iniciais) não acha a pessoa, ou acha
  outra. O caminho é SARAM + CPF completo, conferidos no banco (`verified_by = 'cpf'`), com 5
  tentativas por hora por conta (e 20 de outras contas por SARAM, para ninguém trancar o dono). Vínculo verificado não muda depois por troca de nome
  ou de e-mail (write-once).
- **UX:** estado `no_match` (ou "Não sou eu" na sugestão) → "Conferir pelo SARAM e o CPF" (CPF com
  máscara e teclado numérico); erro único "Os dados não conferem", com as tentativas restantes
  visíveis ANTES de bloquear; bloqueio (`locked_out`) diz até que horas (hora local) e oferece o
  pedido à administração.
- **Cobertura:** `saram-link.operations.test.ts` (erro genérico, bloqueio, vínculo por CPF),
  `saram-link.test.sql`, `packages/database/src/saram-link.test.ts` (tentativas e hora do bloqueio).

### COM-PRF-03 — "Tenho homônimo: o Zimbra me deu o e-mail com número"
- **O sistema precisa:** chave com mais de um militar, ou e-mail com dígito final (o Zimbra sabia
  do homônimo, o espelho pode não ter o outro): mostrar só posto, nome de guerra e OM dos
  candidatos da PRÓPRIA chave e desempatar pelos 4 últimos dígitos do CPF. Nunca SARAM, CPF ou
  nome completo de candidato.
- **UX:** estado `homonyms`: lista de candidatos (posto, nome de guerra, OM; "já vinculado a outra
  conta" quando é o caso), campo dos 4 dígitos com tentativas restantes; "Nenhum destes sou eu" leva
  às alternativas.
- **Cobertura:** `saram-link.operations.test.ts` (homônimos e e-mail com dígito),
  `saram-link.test.sql`, `packages/sisub-domain/src/operations/saram-link.authz.test.ts`.

### COM-PRF-04 — "Meu e-mail é antigo (de outro padrão) ou não é @fab.mil.br"
- **O sistema precisa:** sem chave (domínio diferente, e-mail não confirmado, ponto ou hífen na
  parte local), não há sugestão; CPF ou pedido continuam abertos.
- **UX:** estado `no_match` com o motivo em linguagem simples (`describeEmailEligibility`: domínio,
  e-mail não confirmado, fora do padrão, ou nome que mudou) e as três saídas na mesma tela.
- **Cobertura:** `saram-link.test.sql` (domínio exato, `tp.`, dígito, só letras).

### COM-PRF-05 — "Esta conta é da seção, não de uma pessoa"
- **O sistema precisa:** conta `institucional`: sem SARAM (CHECK), sem arranchamento nem presença
  própria (recusa no domínio e trigger no banco); permissões, perfil, senha e MFA continuam. Ao
  virar institucional, os arranchamentos de hoje em diante deixam de contar. A própria conta marca
  e desmarca; o admin também, com log. Conta @fab.mil.br que não bate com ninguém aparece na fila
  do admin como candidata.
- **UX:** "Esta é uma conta de seção ou OM" nas alternativas, com confirmação que diz o efeito
  (arranchamentos de hoje em diante cancelados; módulos e permissões continuam). Arranchamento e
  auto check-in mostram, no lugar, "conta de seção" e o caminho de volta; "Na verdade, esta é uma
  conta pessoal" desfaz, com confirmação. O aviso de entrada não aparece para conta de seção. O
  administrador marca e desmarca em Cadastro Militar (Candidatas a seção, inclusive em lote, uma
  operação auditada por conta; Contas de seção).
- **Cobertura:** `saram-link.operations.test.ts` (conta institucional), `saram-link.test.sql`.
  Tela: conferida no navegador no PR da FASE 2; e2e **LACUNA**.

### COM-PRF-06 — "Meu SARAM está em outra conta"
- **O sistema precisa:** quem verifica (e-mail ou CPF) um SARAM de titular `legacy` ou sem
  verificação leva o vínculo na hora, com linha em `sensitive_operation_log`; titular verificado →
  contestação para o admin, que decide olhando os dois. O legacy repetido de um SARAM verificado em
  outra conta deixa de ver os dados.
- **UX:** confirmar a sugestão ou o CPF de um SARAM com titular verificado abre a contestação; o
  estado vira `contested` ("Sua contestação está com a administração", com desistência). O console
  mostra as duas contas, quem provou o quê, e a aprovação diz quem deixa de ver os dados.
- **Cobertura:** `saram-link.operations.test.ts` (transferência de legacy com log; contestação
  aprovada com log; segunda decisão é conflito), `saram-link.test.sql`.

### COM-PRF-07 — "Meu vínculo é antigo (legacy) e o e-mail não bate"
- **O sistema precisa:** o vínculo anterior à verificação continua valendo (ninguém perde acesso
  no deploy) e vai para a fila "a revisar" do admin, que confirma (vira `admin`) ou desvincula. A
  pessoa pode subir para `cpf` conferindo o próprio SARAM, ou trocar o legacy provando outra
  identidade (e-mail ou CPF); o legacy que não localiza ninguém (digitado errado) também pode pedir
  outro número.
- **UX:** a pessoa lê "vínculo antigo em revisão pela administração, nada a fazer agora" (ou, se o
  dono verificou em outra conta, por que os dados sumiram); a conferência pelo CPF é opcional. O
  console lista os vínculos antigos com "Confirmar" e "Desvincular" (motivo obrigatório; o efeito é
  dito no diálogo).
- **Cobertura:** `saram-link.test.sql` (backfill e confirmação de legacy).

### COM-PRF-08 — "Ninguém me avisou que faltava confirmar o cadastro"
- **O sistema precisa:** quem tem algo a fazer ou a acompanhar no vínculo (sugestão, homônimos, sem
  identificação, bloqueio, pedido ou contestação) descobre sem procurar, e sem ser bloqueado.
- **UX:** aviso no topo do conteúdo (sisub: todas as páginas de módulo e o hub; sucont: o hub) com o
  botão que leva direto à ação; "Agora não" dispensa até a próxima sessão, e o aviso volta se o
  estado muda (pedido recusado, bloqueio vencido). No RUMAER, o menu do usuário mostra o mesmo
  texto e leva à tela do SISUB. Ação a no máximo 2 cliques de qualquer página.
- **Cobertura:** `packages/database/src/saram-link.test.ts` (quais estados avisam e o texto de
  cada um).

### ADM-SAR-01 — "Dois administradores decidiram o mesmo pedido ao mesmo tempo"
- **O sistema precisa:** a segunda decisão é recusada (versão que a tela viu: pedido pendente,
  SARAM esperado, tipo esperado) e nada é gravado por cima.
- **UX:** o diálogo mostra "Não foi gravado" com o motivo, a fila é relida e o diálogo diz que o
  item saiu da fila; o botão de confirmar fica desabilitado.
- **Cobertura:** `saram-link.operations.test.ts` (segunda decisão é conflito);
  `packages/sisub-domain/src/operations/saram-link.authz.test.ts` (pedido que já não está pendente
  vira conflito com mensagem). Tela: conferida no navegador (pré-visualização) no PR da FASE 2.

### COM-CRD-01 — "O cardápio mudou depois que eu vi"
- **Relacionado:** GC-AGD-12 (publicado mudou sem aviso).
- **Cobertura:** **LACUNA** (ver GC-AGD-12).

### FIS-PRS-01 — "Grupo de fora (comitiva) comeu sem estar arranchado"
- **O sistema precisa:** registrar "outras presenças" no dia sem cadastro individual.
- **Cobertura:** `other_presences` — verificar teste.

### FIS-PRS-02 — "O refeitório fechou (falta de água)"
- **Relacionado:** GC-AGD-07; o comensal precisa saber que não haverá refeição quente.
- **Cobertura:** hipótese.

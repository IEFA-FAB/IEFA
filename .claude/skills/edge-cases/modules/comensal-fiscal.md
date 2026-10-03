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
- **UX:** o estado é `pending_request`; o perfil mostra "pedido em análise", sem dados militares, e
  o primeiro acesso não insiste no SARAM a cada sessão. Nome de exibição e rótulos caem no e-mail.
- **Cobertura:** `apps/sisub/src/test/operations/user.operations.test.ts` (número fora da chave vira
  pedido e não abre cadastro), `saram-link.operations.test.ts` (pedido, desistência, vínculo manual
  do admin), `packages/database/scripts/access-audit/saram-link.test.sql`. Tela: FASE 2.

### COM-PRF-02 — "Troquei de nome (casamento) ou de nome de guerra, e o e-mail não bate mais"
- **O sistema precisa:** a chave do e-mail (nome de guerra + iniciais) não acha a pessoa, ou acha
  outra. O caminho é SARAM + CPF completo, conferidos no banco (`verified_by = 'cpf'`), com 5
  tentativas por hora por conta e por SARAM. Vínculo verificado não muda depois por troca de nome
  ou de e-mail (write-once).
- **UX:** estado `no_match` (ou sugestão errada) → "Informar SARAM e CPF"; erro único "SARAM e CPF
  não conferem", com as tentativas restantes; bloqueio diz até que horas.
- **Cobertura:** `saram-link.operations.test.ts` (erro genérico, bloqueio, vínculo por CPF),
  `saram-link.test.sql`. Tela: FASE 2.

### COM-PRF-03 — "Tenho homônimo: o Zimbra me deu o e-mail com número"
- **O sistema precisa:** chave com mais de um militar, ou e-mail com dígito final (o Zimbra sabia
  do homônimo, o espelho pode não ter o outro): mostrar só posto, nome de guerra e OM dos
  candidatos da PRÓPRIA chave e desempatar pelos 4 últimos dígitos do CPF. Nunca SARAM, CPF ou
  nome completo de candidato.
- **UX:** estado `homonyms`, lista de candidatos, campo dos 4 dígitos; errar conta tentativa.
- **Cobertura:** `saram-link.operations.test.ts` (homônimos e e-mail com dígito),
  `saram-link.test.sql`, `packages/sisub-domain/src/operations/saram-link.authz.test.ts`.

### COM-PRF-04 — "Meu e-mail é antigo (de outro padrão) ou não é @fab.mil.br"
- **O sistema precisa:** sem chave (domínio diferente, e-mail não confirmado, ponto ou hífen na
  parte local), não há sugestão; CPF ou pedido continuam abertos.
- **UX:** estado `no_match` com `emailEligibility` dizendo o motivo.
- **Cobertura:** `saram-link.test.sql` (domínio exato, `tp.`, dígito, só letras).

### COM-PRF-05 — "Esta conta é da seção, não de uma pessoa"
- **O sistema precisa:** conta `institucional`: sem SARAM (CHECK), sem arranchamento nem presença
  própria (recusa no domínio e trigger no banco); permissões, perfil, senha e MFA continuam. Ao
  virar institucional, os arranchamentos de hoje em diante deixam de contar. A própria conta marca
  e desmarca; o admin também, com log. Conta @fab.mil.br que não bate com ninguém aparece na fila
  do admin como candidata.
- **UX:** "Esta conta é de uma seção" no primeiro acesso; o diálogo de SARAM não volta.
- **Cobertura:** `saram-link.operations.test.ts` (conta institucional), `saram-link.test.sql`.
  Tela: FASE 2.

### COM-PRF-06 — "Meu SARAM está em outra conta"
- **O sistema precisa:** quem verifica (e-mail ou CPF) um SARAM de titular `legacy` ou sem
  verificação leva o vínculo na hora, com linha em `sensitive_operation_log`; titular verificado →
  contestação para o admin, que decide olhando os dois. O legacy repetido de um SARAM verificado em
  outra conta deixa de ver os dados.
- **UX:** "Este SARAM é meu" abre a contestação; o estado vira `contested` até a decisão.
- **Cobertura:** `saram-link.operations.test.ts` (transferência de legacy com log; contestação
  aprovada com log; segunda decisão é conflito), `saram-link.test.sql`.

### COM-PRF-07 — "Meu vínculo é antigo (legacy) e o e-mail não bate"
- **O sistema precisa:** o vínculo anterior à verificação continua valendo (ninguém perde acesso
  no deploy) e vai para a fila "a revisar" do admin, que confirma (vira `admin`) ou desvincula. A
  pessoa pode subir para `cpf` conferindo o próprio SARAM.
- **Cobertura:** `saram-link.test.sql` (backfill e confirmação de legacy). Tela: FASE 2.

### COM-CRD-01 — "O cardápio mudou depois que eu vi"
- **Relacionado:** GC-AGD-12 (publicado mudou sem aviso).
- **Cobertura:** **LACUNA** (ver GC-AGD-12).

### FIS-PRS-01 — "Grupo de fora (comitiva) comeu sem estar arranchado"
- **O sistema precisa:** registrar "outras presenças" no dia sem cadastro individual.
- **Cobertura:** `other_presences` — verificar teste.

### FIS-PRS-02 — "O refeitório fechou (falta de água)"
- **Relacionado:** GC-AGD-07; o comensal precisa saber que não haverá refeição quente.
- **Cobertura:** hipótese.

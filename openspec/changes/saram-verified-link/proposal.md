## Why

O SARAM da conta decide de quem são os dados militares que ela vê (posto, nome de guerra, OM, CPF mascarado) e quem ela é para os outros (rótulos, auditoria, arranchamento). Hoje o vínculo é write-once e exclusivo (`syncUserSaram` no sisub, `core.link_own_saram` no sucont), mas o número é **digitado**: quem pede primeiro leva. Nada confere que o SARAM é da pessoa da conta. Uma conta pode reivindicar o SARAM de outro militar (e passar a ver os dados dele), e o dono verdadeiro fica trancado do lado de fora com `SARAM_TAKEN`.

O cadastro de pessoal (`core.user_military_data`) permite conferir sem perguntar nada a ninguém: o e-mail Zimbra segue o padrão nome de guerra + iniciais do nome completo. Medido no banco em 2026-10-02: 1.255 de 1.273 vínculos atuais batem com a chave do e-mail (70 deles só depois de tirar o dígito de homônimo do Zimbra), e 64 das 72 contas FAB sem SARAM batem com exatamente um militar.

Além disso, contas de seção (a do refeitório do GAP-SJ, a do IEFA, a da subsistência da DIRAD) são tratadas como pessoa: pedem SARAM a cada sessão e podem se arranchar, o que infla a previsão.

## What Changes

- **Vínculo verificado em camadas**, registrado em `core.user_data.saram_verified_by`:
  1. **e-mail** (automático): o servidor calcula a chave do e-mail da sessão (`@fab.mil.br` exato, e-mail confirmado) e oferece o candidato do cadastro ("Identificamos você como 3S SILVA. Confirmar?"). Homônimos (vários candidatos, ou e-mail com dígito de homônimo) desempatam pelos 4 últimos dígitos do CPF. Só aparecem candidatos da chave do próprio e-mail: acaba a enumeração;
  2. **CPF**: SARAM + CPF completo conferidos no banco, com limite de tentativas persistido (por conta e por SARAM) e erro genérico;
  3. **admin**: pedido de vínculo (SARAM + justificativa) ou contestação ("este SARAM é meu"), decididos por `admin:2`;
  4. **legacy**: vínculos anteriores que não batem com a chave; continuam valendo e entram na fila "a revisar".
- **Tipo de conta** `pessoal` (padrão) ou `institucional`: institucional não tem SARAM (CHECK) nem arranchamento/presença própria (recusa no domínio e no banco); o resto continua.
- **Dados militares só para vínculo verificado** (ou legacy ainda não revisado) no sisub, no rumaer e no sucont.
- **Ferramenta de admin**: fila (pedidos, contestações, legacy, candidatas a institucional), aprovar/recusar, desvincular, vincular manualmente, marcar tipo — tudo com `access_control.sensitive_operation_log` na mesma transação.
- **Formulários antigos** (sisub e sucont) deixam de gravar SARAM sem verificação: o número digitado só vincula se for o candidato do e-mail; senão vira pedido para o admin.

Fases: **FASE 1** (este PR) banco, domínio, server functions, sucont/rumaer e testes, sem telas novas. **FASE 2** (outro PR) as telas do comensal e do console, montadas só a partir de `fetchMySaramStatusFn` e das fns de admin.

## Capabilities

### New Capabilities
- `saram-link`: vínculo do SARAM à conta, verificado por e-mail, CPF ou administrador; tipo de conta pessoal/institucional; visibilidade dos dados militares pelo estado do vínculo.

### Modified Capabilities
- Nenhuma spec arquivada cobre o vínculo; a change `lgpd-military-roster-key` (view `core.military_identity`, CPF fora dos apps) continua valendo e é a base desta.

## Impact

- **Apps:** `sisub` (server fns novas, `fetchMilitaryDataFn`, onboarding), `sucont` (`saveMySaramFn`, `fetchMyIdentityFn`), `rumaer` (`getMyMilitaryProfileFn`). **Packages:** `database` (migration, harness SQL), `sisub-domain` (operações).
- **Banco:** colunas novas em `core.user_data`; tabelas `core.saram_link_request` e `core.saram_verification_attempt`; índice de expressão no espelho; funções `core.*` só para `service_role`; triggers em `core.user_data`, `kitchen.arranchamento` e `kitchen.meal_presences`; backfill. Espera o mantenedor (migration).
- **LGPD:** a tabela de tentativas guarda conta, SARAM tentado e horário (nunca o CPF digitado). A Política de Privacidade descreve registros de segurança; conferir com o mantenedor se precisa de versão nova (documento legal é decisão dele).

## Não-objetivos

- Telas (FASE 2).
- Mapear `sgOrg` para `core.units` para delegar a aprovação a `unit:2`: medido, só 17 de 51 unidades casam e nenhum GAP (as unidades que operam cozinha); fica `admin:2`.
- Revalidar vínculo verificado quando a pessoa troca de nome ou de e-mail: o vínculo é write-once.
- Mudar os rótulos de identidade que terceiros veem (`v_user_identity`, console de permissões): depois desta change o SARAM só é gravado por fluxo verificado; o resíduo são os legacy, revisados pelo admin.
- Remover `core.link_own_saram`: o sucont em produção a chama até o deploy; sai num PR seguinte.

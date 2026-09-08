# Proposal: sisub-equipment-condition-maintenance

## Why

O parque de equipamentos existe no sisub desde 2026-08-25 (PRs #225/#230/#231): papel × modelo × unidade, com `simultaneous_slots`, exigência por preparação e cálculo de atendimento. O que ele **não** tem é estado.

Hoje o sistema sabe que a cozinha 12 tem dois fornos combinados. Não sabe se algum deles está quebrado, quando foi a última limpeza da coifa, nem quantas cozinhas da FAB estão sem forno combinado funcionando. As três consequências:

1. **O parque envelhece em silêncio.** `equipment_unit.status` tem `maintenance`, mas ninguém tem tela para colocá-lo lá — e mesmo que tivesse, não há campo para dizer *o quê* quebrou, *quando* e se voltou.
2. **Não há rotina.** Manutenção preventiva de equipamento de cozinha industrial é obrigação de conservação patrimonial e de segurança alimentar (coifa, gás, temperatura de câmara). Hoje vive em planilha de cada cozinha, ou não vive.
3. **Quem decide não enxerga.** A Gestão Cozinha não vê as panes relatadas pela praça, e a Análise Global não tem nenhum corte de frota — não dá para responder "onde investir" nem "que modelo está dando problema".

Este change fecha a camada de estado: **ficha padrão → rotina de manutenção → relato de pane pela produção → relatório de condição na gestão → relatório de frota na análise global**.

## What Changes

Afeta **sisub** (4 telas, server fns, PBAC) e **packages/database** (migration no schema `kitchen`). Nenhum outro app.

- **Ficha técnica padrão**: `kitchen.equipment_model` ganha os campos de ficha (fonte de energia, tensão, dimensões, peso, exigências de instalação, manual, vida útil esperada); `kitchen.equipment_unit` ganha o que é da peça (`installed_on`, `warranty_until`, `supplier`).
- **Rotina de manutenção**: tabelas novas `kitchen.equipment_maintenance_plan` (o que fazer e de quanto em quanto tempo, ancorado no papel XOR no modelo) e `kitchen.equipment_maintenance_log` (o que foi feito, em qual unidade, por quem). Vencimento é **derivado**, nunca armazenado.
- **Pane**: tabela nova `kitchen.equipment_issue` com severidade (`degraded` | `inoperative`) e ciclo de vida (`open` → `in_repair` → `resolved` | `dismissed`).
- **Condição derivada**: a condição exibida de uma unidade passa a ser função de `status` + panes abertas, calculada num único lugar do domínio. Não existe campo "condição" gravado.
- **Efeito no planejamento**: unidade com pane inoperante aberta sai do cálculo de atendimento (`evaluateRecipeEquipmentFitness` / `evaluateMenuEquipmentFitness`), do mesmo modo que `status <> 'active'`.
- **Tela nova em Produção Cozinha** (`/kitchen-production/$kitchenId/equipment`): a praça vê o parque, relata pane, registra execução de rotina e cadastra unidade que existe e não estava cadastrada.
- **Abas novas em Gestão Cozinha** (`/kitchen/$kitchenId/equipment`): **Condição** (panes abertas, tempo em aberto, histórico) e **Manutenção** (matriz unidade × rotina).
- **Aba nova em Catálogo Global** (`/global/equipment`): **Rotinas** — os planos padrão por papel/modelo.
- **Tela nova em Análises Globais** (`/analytics/equipment`): frota da FAB agregada **por papel**, somente leitura.
- **PBAC**: `kitchen-production` nível 1 passa a poder criar `equipment_unit`, `equipment_issue` e `equipment_maintenance_log` no escopo da sua cozinha. Excluir, dar baixa, descartar pane e editar catálogo seguem exigindo `kitchen` nível 2.

## Capabilities

### New Capabilities

- `equipment-technical-sheet`: ficha técnica padrão no modelo e dados patrimoniais na unidade.
- `equipment-maintenance-routine`: planos de manutenção por papel/modelo, registro de execução e cálculo derivado de vencimento.
- `equipment-condition-reporting`: relato de pane pela produção, condição derivada da unidade e efeito no cálculo de atendimento.
- `equipment-fleet-report`: relatório de frota na Análise Global e relatório de condição na Gestão Cozinha.

### Modified Capabilities

Nenhuma — não há specs em `openspec/specs/`. O comportamento alterado de `evaluate*EquipmentFitness` está descrito em `equipment-condition-reporting`.

## Impact

- **packages/database**: uma migration em `kitchen` (3 tabelas novas + colunas em `equipment_model`/`equipment_unit`), RLS ligada sem policy igual às irmãs; regenerar `generated.ts` e o schema Drizzle.
- **packages/sisub-domain**: `operations/equipment.ts` ganha as operations de pane e manutenção; `utils/` ganha `equipment-condition.ts` (condição derivada) e `maintenance-due.ts` (vencimento derivado), ambos puros e testáveis sem banco. `operations/training.ts` ganha os passos de reset das tabelas novas.
- **apps/sisub**: 2 rotas novas, 2 telas estendidas, `server/equipment.fn.ts` estendido, `hooks/data/useEquipment.ts` estendido, `NavItems.tsx` (2 itens).
- **PBAC**: nenhum módulo novo; afrouxamento pontual do guard de criação de unidade, coberto por teste de authz.
- **Comportamento existente que muda**: o alerta de equipamento do `DayDrawer` passa a reagir a pane relatada. É o objetivo do change, mas é mudança visível em tela publicada — precisa de nota no PR.
- **Riscos**: (a) migration precisa ser aplicada **antes ou junto** do merge — foi assim que a #225 derrubou produção com `42P01`; (b) o gate de integração passa vazio quando a tabela não existe (`setupIntegration` faz early-return), então o teste novo precisa falhar sob `SISUB_INTEGRATION_REQUIRED`; (c) as tabelas novas entram em `RESET_STEPS` **antes** de `kitchen.equipment_unit`, senão o reset de treino dá rollback por FK NO ACTION.

## Não-objetivos

- **Ordem de serviço / fluxo de aprovação com terceiro.** Registrar que a manutenção foi feita e por quem (própria, contrato, fabricante) basta para o relatório. Workflow de contratação é outro problema.
- **Custo de manutenção integrado ao módulo financeiro.** O log guarda um valor informativo; não empenha, não liquida, não concilia.
- **Foto/anexo na pane.** Puxa bucket, política de retenção e revisão LGPD (foto de praça pode conter pessoa). Fica para um change próprio.
- **Notificação ativa de rotina vencida** (e-mail/push). O relatório mostra; ninguém é avisado automaticamente nesta entrega.
- **Medição de horas de uso / telemetria do equipamento.** Vencimento é por calendário, não por horímetro.
- **Reconciliação com o patrimônio da OM (SILOMS).** `asset_tag` continua sendo texto digitado.
- **Exposição às tools de IA (chat + MCP).** Fora do corte; quando entrar, segue o contrato de `@iefa/sisub-domain/agent` (`limit` + `total`, `.nullish()`, teto de 60k).

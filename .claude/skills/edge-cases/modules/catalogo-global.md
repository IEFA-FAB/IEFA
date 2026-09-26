# Catálogo Global — modelos da SDAB

Menu: **Catálogo Global → Modelos de cardápio** (Eventos Modelo, Apoios Modelo, Planos Semanais).
Ler exige `global:1`; editar exige `global:2`. Na cozinha, o modelo se ADAPTA (cópia local).

### CG-EVT-01 — "A cozinha adapta um evento modelo"
- **O sistema precisa:** a cópia chega com as refeições do evento, efetivo e % de cada preparação; o
  nome já vem preenchido com o do modelo.
- **UX:** Eventos → "Modelos Globais da SDAB" → "Adaptar" → "Criar Adaptação".
- **Cobertura:** `e2e/tests/global-catalog-events.spec.ts`

### CG-EVT-02 — "A SDAB edita o modelo global"
- **O sistema precisa:** edição in-place no escopo global; refeições com ids próprios; a cópia de
  cada cozinha não muda.
- **Cobertura:** `templates.operations.test.ts › evento global editado na cozinha…` (domínio).
  E2E da tela global: **LACUNA** — a conta dedicada do e2e não tem `global:2`.

### CG-EVT-03 — "O modelo global mudou depois que a cozinha adaptou"
- **Hoje:** a cópia não sabe que o modelo mudou.
- **Caminho proposto:** selo "modelo atualizado" na cópia, como o de versão de preparação.
- **Cobertura:** **LACUNA**

### CG-TIP-01 — "Tipo de refeição global de teste aparecendo para todas as cozinhas"
- **Realidade:** fixture `[TEST] Refeição …` vazada de suíte de integração aparece nos seletores de horário.
- **O sistema precisa:** o faxineiro (`apps/sisub/scripts/purge-test-fixtures.ts`) recolher; suíte não pode vazar.
- **Cobertura:** o faxineiro roda antes/depois da suíte completa no CI; vazamento visto em 2026-09-26.

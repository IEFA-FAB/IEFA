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

### COM-CRD-01 — "O cardápio mudou depois que eu vi"
- **Relacionado:** GC-AGD-12 (publicado mudou sem aviso).
- **Cobertura:** **LACUNA** (ver GC-AGD-12).

### FIS-PRS-01 — "Grupo de fora (comitiva) comeu sem estar arranchado"
- **O sistema precisa:** registrar "outras presenças" no dia sem cadastro individual.
- **Cobertura:** `other_presences` — verificar teste.

### FIS-PRS-02 — "O refeitório fechou (falta de água)"
- **Relacionado:** GC-AGD-07; o comensal precisa saber que não haverá refeição quente.
- **Cobertura:** hipótese.

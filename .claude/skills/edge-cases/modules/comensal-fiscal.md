# Comensal e Fiscal

Hipóteses a verificar.

### COM-PRV-01 — "Marquei que ia almoçar e não fui (ou o contrário)"
- **O sistema precisa:** previsão x presença reconciliadas sem punir quem avisou tarde por motivo de serviço.
- **Cobertura:** hipótese.

### COM-CRD-01 — "O cardápio mudou depois que eu vi"
- **Relacionado:** GC-AGD-12 (publicado mudou sem aviso).
- **Cobertura:** **LACUNA** (ver GC-AGD-12).

### FIS-PRS-01 — "Grupo de fora (comitiva) comeu sem constar na previsão"
- **O sistema precisa:** registrar "outras presenças" no dia sem cadastro individual.
- **Cobertura:** `other_presences` — verificar teste.

### FIS-PRS-02 — "O rancho fechou (falta de água)"
- **Relacionado:** GC-AGD-07; o comensal precisa saber que não haverá refeição quente.
- **Cobertura:** hipótese.

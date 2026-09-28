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
- **O sistema precisa:** o SARAM continua gravável na conta mesmo ausente do espelho
  (`core.user_military_data`, patch manual do mantenedor, sem FK de propósito); o militar aparece
  sem posto até o patch seguinte (`lgpd-military-roster-key`). Enquanto isso o SARAM que não
  localiza cadastro segue corrigível (não revelou dado de ninguém).
- **UX:** o perfil mostra o SARAM sem os dados militares; nome de exibição e rótulos caem no e-mail.
  Nada de nome completo nem CPF inteiro: o perfil mostra só posto, nome de guerra e o CPF mascarado.
- **Cobertura:** `apps/sisub/src/test/operations/user.operations.test.ts` (SARAM que não localiza
  cadastro é gravado e corrigível; `fetchMaskedCpf`; identificação sem CPF nem nome completo).

### COM-CRD-01 — "O cardápio mudou depois que eu vi"
- **Relacionado:** GC-AGD-12 (publicado mudou sem aviso).
- **Cobertura:** **LACUNA** (ver GC-AGD-12).

### FIS-PRS-01 — "Grupo de fora (comitiva) comeu sem estar arranchado"
- **O sistema precisa:** registrar "outras presenças" no dia sem cadastro individual.
- **Cobertura:** `other_presences` — verificar teste.

### FIS-PRS-02 — "O refeitório fechou (falta de água)"
- **Relacionado:** GC-AGD-07; o comensal precisa saber que não haverá refeição quente.
- **Cobertura:** hipótese.

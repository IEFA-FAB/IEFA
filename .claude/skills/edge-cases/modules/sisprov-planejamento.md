# SISPROV — Planejamento (elo na OM: previsão de incorporação, coleta de tamanhos, curva)

Hipóteses a verificar. O módulo está em fundação (`openspec/changes/sisprov-foundation`); os casos
abaixo são os imprevistos que o legado e a análise do projeto já conhecem, registrados ANTES das
telas para que cada change os cubra ou os declare lacuna.

### PLN-ACE-01 — "Entrei no SISPROV e não tenho módulo nenhum"
- **Realidade:** a conta existe no ERP, mas o administrador ainda não concedeu o papel.
- **O sistema precisa:** dizer que o acesso não foi concedido, a quem pedir e por qual canal; não mostrar grade vazia nem "sem acesso" como se fosse erro.
- **UX:** o hub mostra o aviso com o e-mail do IEFA; nenhum card.
- **Cobertura:** hipótese (tela conferida no navegador no PR de fundação; e2e pendente).

### PLN-ACE-02 — "A leitura das minhas permissões falhou"
- **Realidade:** 502 do gateway, cold start, banco instável.
- **O sistema precisa:** distinguir "não consegui ler" de "você não tem acesso"; a próxima navegação tenta de novo.
- **UX:** o hub diz que a consulta falhou, com botão de tentar de novo; o `_protected` grava conjunto vazio stale.
- **Cobertura:** `apps/sisprov/src/routes/_protected/route.tsx` (comportamento); teste pendente.

### PLN-ACE-03 — "Sou elo do GAP-SJ e preciso informar a previsão do IAE"
- **Realidade:** o IAE é apoiado pelo GAP-SJ; o elo do GAP responde pelas apoiadas.
- **O sistema precisa:** grant na apoiadora cobre a apoiada; o inverso não.
- **Cobertura:** `packages/sisprov-domain/src/guards/require-permission.test.ts › grant na apoiadora cobre a apoiada`.

### PLN-PRV-01 — "A turma prevista não veio" / "veio o dobro"
- **Realidade:** a incorporação prevista de 200 virou 80, ou 350, depois que a OF foi aprovada.
- **O sistema precisa:** a previsão tem cenários (mínimo, esperado, máximo); a OF emitida registra qual cenário usou; a divergência aparece na aderência previsão × real, não some.
- **Cobertura:** **LACUNA** (change `sisprov-engine`).

### PLN-PRV-02 — "O SIGPES não tem a data de praça" / "o acesso ao SIGPES não chegou"
- **Realidade:** DEP-D sem data; a regressão da incorporação precisa de histórico.
- **O sistema precisa:** dizer que a estimativa não tem histórico suficiente, em vez de exibir número com cara de confiável; o elo informa a previsão à mão enquanto isso.
- **Cobertura:** **LACUNA** (changes `core-sigpes-sync` e `sisprov-engine`).

### PLN-TAM-01 — "O militar mudou de tamanho" / "errou o tamanho na ficha"
- **Realidade:** ficha preenchida no ingresso; dois anos depois o tamanho é outro.
- **O sistema precisa:** nova ficha com origem e data; a curva usa a mais recente; a anterior fica no histórico.
- **Cobertura:** **LACUNA** (change `sisprov-size-records`).

### PLN-TAM-02 — "A OM é pequena: 12 militares cadastrados na família"
- **Realidade:** amostra abaixo do mínimo; o legado descartava a OM e usava a região (constante 20, fixa).
- **O sistema precisa:** fallback em cascata (OM → região → global) com amostra mínima parametrizada e o nível usado registrado.
- **Cobertura:** **LACUNA** (change `sisprov-size-curve`, teste contra a OS 16 §3.9).

### PLN-TAM-03 — "Cadastrei tamanhos na OM de treino"
- **Realidade:** almoxarife treinando no ambiente de treino preenche fichas.
- **O sistema precisa:** a OM sentinela não entra no recálculo da curva; o reset de treino apaga as fichas.
- **Cobertura:** **LACUNA** (change `sisprov-size-curve`, teste de integração).

### PLN-GRP-01 — "A tabela de enxovais da SDAB ainda não foi revisada"
- **Realidade:** a Fase 0 não entregou a revisão; o piloto precisa começar.
- **O sistema precisa:** a tabela vigente entra com a flag "não revisada" visível; o recálculo é automático quando a revisão chegar.
- **Cobertura:** **LACUNA** (change `sisprov-demand-groups`).

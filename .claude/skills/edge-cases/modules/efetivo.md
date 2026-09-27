# Efetivo dos Refeitórios — matriz de efetivo da SDAB (Análises da Unidade e Análises Globais)

O levantamento responde, por competência, quantos militares guarnecem cada refeitório, por quadro.
A linha do roster é o refeitório visto pelo levantamento (`kitchen.mess_hall_workforce`, antiga
`kitchen.rancho`, lote 8b da linguagem ubíqua); ela se liga ao refeitório cadastrado em Locais por
`mess_hall_id`. Os dois cadastros ainda são separados: a fusão é a change
`sisub-workforce-by-mess-hall`.

### EF-ROS-01 — "O refeitório que eu gerencio não aparece na matriz"
- **Realidade:** a matriz de gestores de agosto/2026 tinha 66 pontos; 7 refeitórios cadastrados em
  Locais não têm linha no levantamento, e um refeitório novo cadastrado em Locais não entra nele.
- **O sistema precisa:** todo refeitório ativo de Locais aparece no levantamento da unidade, sem
  cadastro paralelo.
- **UX:** nenhum passo além do cadastro em Locais.
- **Cobertura:** **LACUNA.** O roster só se cria por `createMessHallWorkforceFn` (`admin:2`), sem
  tela; resolve-se com a fusão (`sisub-workforce-by-mess-hall`).

### EF-ROS-02 — "O ponto da matriz não tem refeitório no sistema (ICIA, II COMAR, NuHANT)"
- **Realidade:** o gestor responde pelo efetivo de um ponto que não está em Locais.
- **O sistema precisa:** aceitar o efetivo e dizer que falta o vínculo, sem inventar a carga de
  refeições.
- **UX:** a linha diz "sem vínculo no cadastro de refeitórios" e "Refeições/militar" fica "—".
- **Cobertura:** `packages/sisub-domain/src/utils/workforce-metrics.test.ts › mealsPerWorker › sem
  refeitório vinculado devolve null, não zero`; o rótulo, hipótese.

### EF-ROS-03 — "Renomearam o refeitório em Locais e a matriz ainda mostra o nome antigo"
- **Realidade:** o nome do levantamento (`display_name`, "EEAR (cozinha central)") é do roster, não
  do cadastro; o refeitório "Rancho" da EEAR vai ser renomeado pela tela Locais (tarefa 8.7).
- **O sistema precisa:** um nome só para o refeitório.
- **UX:** a linha mostra o nome do levantamento e, ao lado, o do cadastro ("cadastro: …").
- **Cobertura:** **LACUNA** até a fusão; hoje os dois nomes aparecem juntos e podem divergir.

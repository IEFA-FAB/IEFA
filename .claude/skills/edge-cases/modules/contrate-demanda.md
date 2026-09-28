# Contrate — demanda do requisitante (do problema às peças do Compras.gov.br)

Casos tirados dos processos reais do IEFA-SJ em 2026 (forno, janelas e cerca do E-102). A
cobertura de domínio está em `packages/alpha-client/src/demand/demand.test.ts`; a da rota, em
`apps/alpha/src/lib/alpha-access.test.ts` (quem edita) e `apps/alpha/src/demand/docx.test.ts`
(o documento que vai à ACI).

### CT-DEM-01 — "A proposta do fornecedor venceu antes de eu concluir o ETP"
- **Realidade:** a proposta da Luganno (janelas) valia até 30/09; o processo passou disso.
- **O sistema precisa:** a cotação vencida continua registrada e é apontada, sem sair da conta sozinha.
- **UX:** pendência "atenção" no passo Preços, com o fornecedor e a data; a pessoa pede a renovação ou afasta a cotação com o motivo.
- **Cobertura:** `demand.test.ts › proposta vencida é apontada e continua na conta até ser afastada`.

### CT-DEM-02 — "Duas cotações eram da mesma empresa"
- **Realidade:** forno: duas "concorrentes" com texto idêntico, e-mail no mesmo domínio e R$ 480 de diferença.
- **O sistema precisa:** apontar o par (mesma raiz de CNPJ ou domínio de e-mail não genérico).
- **UX:** pendência no passo Preços; a pessoa afasta uma delas com o motivo, que vai ao relatório da pesquisa.
- **Cobertura:** `demand.test.ts › mesma raiz de CNPJ ou mesmo domínio indicam cotações dependentes`.

### CT-DEM-03 — "Um fornecedor cotou com instalação e o objeto não tem instalação"
- **Realidade:** janelas: uma proposta trazia instalação; o objeto foi só fornecimento.
- **O sistema precisa:** registrar a exclusão com o motivo no objeto, e avisar que o modelo de TR de compras põe a instalação a cargo do contratado em texto fixo.
- **UX:** exclusão no passo Solução; nota no campo 8 do TR no guia.
- **Cobertura:** `demand.test.ts › sem instalação no objeto, o TR aponta o trecho fixo do recebimento`. **LACUNA:** o ajuste do preço da proposta com escopo a mais (dedução por SINAPI) é feito fora e lançado como preço já ajustado.

### CT-DEM-04 — "A demanda mudou depois de enviada à ACI"
- **Realidade:** o requisitante corrige o objeto depois do primeiro parecer.
- **O sistema precisa:** a demanda continua editável; o novo envio gera novas submissões, e as antigas ficam no histórico.
- **UX:** botão "enviar nova versão" no passo Documentos, com a lista das enviadas antes.
- **Cobertura:** hipótese (rota `POST /api/v1/demands/:id/submissions` sem teste de integração). O envio reserva a demanda pelo `updated_at`: envio duplo da mesma versão recebe 409.

### CT-DEM-05 — "Um colega editou a mesma demanda ao mesmo tempo"
- **O sistema precisa:** não sobrescrever em silêncio.
- **UX:** a gravação automática para, a tela diz que outra pessoa gravou e oferece recarregar.
- **Cobertura:** hipótese (409 `DEMAND_CHANGED` sem teste de rota).

### CT-DEM-06 — "O DFD já foi criado no sistema com valor e natureza de despesa antigos"
- **Realidade:** janelas: DFD 1076 com R$ 43.901,71 e 4.4.90.52; ETP e TR com R$ 50.946,28 e 3.3.90.30.24.
- **O sistema precisa:** mostrar a divergência entre o que está no Compras.gov.br e a demanda.
- **Cobertura:** **LACUNA.** A demanda não lê o sistema; o guia só traz o valor certo. Caminho: registrar no passo Planejamento o valor do DFD cadastrado e comparar.

### CT-DEM-07 — "A demanda surgiu depois do prazo do PCA"
- **O sistema precisa:** o DFD sai com o Acompanhamento de fato superveniente e o ETP não narra a inclusão tardia.
- **Cobertura:** `demand.test.ts › fato superveniente vai ao Acompanhamento do DFD`.

### CT-DEM-08 — "O código do catálogo não bate com o item (4 folhas no catálogo, 3 na janela)"
- **O sistema precisa:** a especificação completa vai ao TR; o DFD avisa que a descrição exibida é a do catálogo.
- **Cobertura:** nota do campo Materiais/Serviços do DFD. **LACUNA:** sem consulta ao catálogo para comparar atributos.

### CT-DEM-09 — "A soma do exercício passa do limite da dispensa"
- **O sistema precisa:** o enquadramento considera o já gasto com a mesma natureza (art. 75, § 1º).
- **Cobertura:** `demand.test.ts › o já gasto no exercício soma no limite (art. 75, § 1º)`.

### CT-DEM-EDT-01 — "Outra pessoa gravou a demanda enquanto eu digitava"
- **Realidade:** o 409 do `expected_updated_at` funciona, mas a tela continua editável e não
  grava mais nada; o aviso é um rótulo pequeno e o `beforeunload` não arma no conflito. Quem
  digita 30 min depois disso perde tudo ao recarregar.
- **O sistema precisa:** congelar os campos no conflito, guardar a edição local e oferecer
  levá-la para a versão atual (merge por passo), como a preparação do SISUB.
- **Cobertura:** **LACUNA** (auditoria de 2026-09-28).

### CT-DEM-EDT-02 — "Saí da demanda logo depois de digitar"
- **Realidade:** sem `useBlocker`; o autosave de 1,2 s é descartado ao desmontar e o SIGNED_OUT
  limpa o cache e redireciona, levando o que não foi gravado. Rascunho ilegível abre editável e
  nada do que se digita é gravado.
- **Cobertura:** **LACUNA** (auditoria de 2026-09-28).

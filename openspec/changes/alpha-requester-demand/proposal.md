## Why

O contrate hoje só confere documento pronto: o requisitante envia um ETP, TR ou edital e a ACI
verifica. Quem nunca fez um processo não tem por onde começar. Nos processos reais do IEFA-SJ em
2026 (forno, janelas e cerca do E-102), o que funcionou foi um agente de IA com uma skill local
(`fase-preparatoria-contratacao`, no vault do mantenedor) que estruturava a demanda, redigia as
peças campo a campo na ordem do Compras.gov.br e as conferia entre si. Esse conhecimento (60
lições registradas, o mapa campo a campo do ETP Digital, do Mapa de Riscos e do TR da AGU, os
atritos do sistema) está fora do produto.

Os atritos observados no Compras.gov.br em 2026-09-25/26:

- valor do campo 8 do ETP com máscara (`5094628` virou R$ 5.094.628,00);
- "Item da Contratação" do Mapa de Riscos só aceita número, e o salvar falha sem aviso;
- "Contratada" exige CNPJ, que não existe no planejamento;
- responsáveis exigem CPF, e-mail e cargo;
- o TR de compras põe instalação a cargo do contratado em texto fixo;
- pesquisa automática do sistema com CV de 491,94% (forno);
- DFD já cadastrado divergente do ETP (janelas: R$ 43.901,71 e 4.4.90.52 contra R$ 50.946,28 e
  3.3.90.30.24).

## What Changes

- **Demanda do requisitante** no módulo Requisitante do contrate: nove passos, do problema às
  peças. Os três primeiros estruturam o problema pelo Value-Focused Thinking (Keeney, 1992):
  contexto da decisão, objetivos fundamentais (com atributo e meta) separados dos objetivos-meio,
  e alternativas geradas a partir dos objetivos, avaliadas contra eles. Depois: solução
  (requisitos ligados a objetivos, exclusões com motivo), itens com memória de cálculo, cotações,
  riscos e dados do processo.
- **Domínio puro** em `@iefa/alpha-client/demand`: schema, enquadramento (art. 75, I/II com os
  limites de 2025 e 2026, art. 74, I, licitação), estatística de preços (média; mediana com CV
  acima de 25%; cotações dependentes e vencidas), conferências (estrutura VFT, Lei nº 14.133,
  INs, e as lições dos processos reais) e geração das peças: DFD (PGC), ETP Digital (16 campos),
  Mapa de Riscos, TR (seções do modelo da AGU), memória de cálculo e relatório de preços.
- **Guia de preenchimento** em HTML autônomo, um bloco por campo com botão Copiar (HTML e texto),
  na ordem dos formulários, com os cuidados de navegação do sistema.
- **Envio à ACI**: o α gera o ETP e o TR em `.docx` com as mesmas funções e os grava como
  submissões comuns (`submission.demand_id`), que seguem extração, verificação, triagem e parecer.
  O contrate encadeia extração e verificação depois do envio.
- **Aba "Demanda de origem"** no processo, para a ACI conferir o documento contra a estrutura
  que o originou.

## Capabilities

### New Capabilities

- `alpha-requester-demand`: demanda estruturada, conferências, peças, guia e envio à ACI.

### Modified Capabilities

- `alpha-aci-platform`: o processo mostra a demanda de origem quando o documento foi gerado no
  contrate.

## Impact

- **Apps**: `contrate` (rotas `/requisitante/$unitId/demandas`, componentes em
  `components/demand/`, aba no `ProcessView`), `alpha` (`api/demands.ts`, `demand/docx.ts`,
  `decideDemandEdit`).
- **Packages**: `alpha-client` ganha o subpath `./demand`.
- **Banco**: migration `20260926210000_alpha_requester_demand.sql` (tabela `alpha.demand`, coluna
  `alpha.submission.demand_id`). **Aplicar antes do deploy do α**: as rotas de submissão e de
  processo passam a selecionar `demand_id`. `alpha.demand` declarada no guard do reset do sisub
  antes de aplicada.
- **LGPD**: sem dado pessoal novo além de nome e cargo da equipe; o CPF não é guardado.

## Não-objetivos

- **Operar o Compras.gov.br**: o contrate gera o texto e o guia; quem cadastra é a pessoa. Sem
  robô, sem credencial gov.br.
- **Consultar o catálogo ou a pesquisa de preços do Compras.gov.br** a partir da demanda (CT-DEM-06
  e CT-DEM-08 ficam como lacuna no catálogo de edge cases).
- **Gerar parecer, autorização, justificativas relevantes e relatório de diligência**: seguem pela
  skill e pelos modelos do GAP-SJ.
- **Redação por modelo de linguagem**: as peças saem por regra, da estrutura. O assistente
  "Conversar" continua disponível para reescrever trechos.
- **Ajuste de preço por SINAPI com BDI** dentro da demanda: o preço entra já ajustado.

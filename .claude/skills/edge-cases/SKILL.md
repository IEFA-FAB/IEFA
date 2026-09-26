---
name: edge-cases
description: Catálogo de edge cases do sisub por módulo — a vida real que desmonta o planejado (cancelou, adiou, surgiu, faltou, quebrou). Cada caso tem o que o sistema precisa absorver, o critério de UX para o usuário não manter controle paralelo, e onde está (ou falta) o teste. Use ao planejar, revisar ou testar uma feature de módulo; quando o pedido for "testar edge cases do módulo X", "ver se a tela aguenta imprevisto", "cenários reais", "situações de borda"; ou ao descobrir um imprevisto novo (ele entra no catálogo).
---

# Edge cases do sisub

O sisub só é usado enquanto espelha a realidade. Cada imprevisto que não tem caminho na tela —
a viagem que adiou, o alimento que faltou, a luz que caiu — vira um caderno, uma planilha, um
grupo de mensagens. A partir daí o sistema descola do que acontece na cozinha, os números dele
deixam de valer, e ele é abandonado. Este catálogo existe para que isso não aconteça: é a lista
do que a realidade faz, módulo a módulo, com o que o sistema tem de oferecer em resposta.

## Catálogo

Um arquivo por módulo, com o nome que aparece no seletor de módulos do app:

| Módulo | Arquivo |
|---|---|
| Gestão Cozinha (planejamento da produção) | `modules/gestao-cozinha.md` |
| Produção Cozinha (turno) | `modules/producao-cozinha.md` |
| Pedidos de Lanche (Módulo 7) | `modules/pedidos-de-lanche.md` |
| Estoque | `modules/estoque.md` |
| Comensal e Fiscal | `modules/comensal-fiscal.md` |
| Gestão Unidade (anexo quantitativo, ARP, empenho) | `modules/gestao-unidade.md` |
| Catálogo Global (modelos da SDAB) | `modules/catalogo-global.md` |

## Formato de um caso

```
### <MÓDULO>-<ÁREA>-<nn> — <situação em uma linha, na voz do usuário>
- **Realidade:** o que aconteceu, com números quando ajudam ("viagem de 100 kits na terça").
- **O sistema precisa:** o efeito esperado nos dados.
- **UX:** o caminho que o usuário faz e o que ele vê — onde clica, o que é preservado, como desfaz.
- **Cobertura:** `arquivo › teste` (integração/e2e) — ou **LACUNA** com o que falta.
```

A cobertura é o contrato: caso marcado como coberto aponta para um teste que falha se ele
quebrar. Caso sem teste é **hipótese** ou **lacuna**, e diz isso.

## Critério de UX (vale para todo caso)

Um imprevisto está resolvido quando o usuário consegue refletir a realidade:

1. **Onde ele já está.** O ajuste do dia se faz no dia; não em outra tela, nem refazendo o modelo.
2. **Numa ação do tamanho do fato.** "A viagem adiou" é UM gesto (adiar), não 12 remoções e 12 inclusões.
3. **Preservando o que já foi decidido.** Porções ajustadas, trocas, substitutos e o vínculo com a
   origem (evento/apoio) sobrevivem a adiar e a trocar.
4. **Reversível.** O que sai vai para a lixeira ou para um histórico; nada some de verdade por engano.
5. **Com o efeito dito.** A confirmação diz quanto mudou e para onde ("2 preparações foram para 03/10").
6. **Recusando com instrução.** Quando não pode (produção já começou), a mensagem diz o que fazer em vez disso.
7. **Deixando rastro para o próximo módulo.** Motivo de troca ou substituição chega ao turno da produção.

Se um caso só se resolve fora do sistema, ele é uma **lacuna** — mesmo que "dê para fazer" com
cinco passos manuais. Cinco passos manuais sob pressão é exatamente o que empurra o usuário para
o caderno.

## Procedimento

1. **Escolha o módulo** da feature e leia o arquivo dele.
2. **Para cada caso**, confira o caminho na tela e o teste apontado em "Cobertura":
   - teste de domínio contra o banco real: `apps/sisub/src/test/operations/*.operations.test.ts`
     (`SISUB_RUN_INTEGRATION=true`; rodam no job de integração do CI);
   - e2e pela tela: `apps/sisub/e2e/tests/*.spec.ts` (ver abaixo).
3. **Lacuna** → proponha o menor caminho que atende o critério de UX, implemente, e troque a
   linha de Cobertura pelo teste novo.
4. **Imprevisto novo** que apareceu no uso ou na conversa → entra no arquivo do módulo, mesmo
   que ainda como lacuna. O catálogo é a memória do que a realidade já fez.
5. **Revisão de PR** de módulo: a pergunta é "qual caso deste catálogo esta mudança quebra, e
   qual ela passa a cobrir?".

## Rodando os testes de edge case

- `.env` do sisub: `bun run env:pull sisub` (produção + sobreposição `/iefa/dev/sisub`, que traz
  a conta dedicada do e2e e a cozinha sentinela 920).
- Integração: `cd apps/sisub && SISUB_RUN_INTEGRATION=true bunx vitest run --config vitest.config.ts --no-file-parallelism src/test/operations/<arquivo>`.
- E2E: `cd apps/sisub && E2E_PORT=<porta livre> bun run test:e2e -- e2e/tests/<spec>`. A porta
  própria importa: a 3000 costuma ser do `vite dev` de outro checkout.
- **E2E que escreve** só escreve na cozinha sentinela do treino (`E2E_KITCHEN_ID`), monta o
  cenário com a chave de serviço (`e2e/helpers/service.ts`) e desmonta no `afterAll`. Toda
  AÇÃO testada passa pela tela.

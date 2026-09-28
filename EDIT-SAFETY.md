# Edição sem perda — padrão do monorepo

Duas garantias para toda tela que edita dado que importa, em qualquer app:

1. **Ninguém perde o que digitou.** Sair, recarregar, fechar o navegador, perder a sessão ou
   receber um erro de gravação não apaga a edição.
2. **Ninguém grava por cima de outra pessoa sem saber.** Quem salva a partir de um estado
   velho é recusado, e a tela oferece levar a edição para o estado atual.

A referência implementada é a preparação do SISUB (`apps/sisub/src/components/features/shared/RecipeForm.tsx`
+ `saveRecipeEdit`). O detalhe por modo de salvar do SISUB está em `apps/sisub/docs/SAVE_BEHAVIOR.md`.

## As regras

**Perda local (o que o usuário digitou):**

- **Autosave** grava com debounce curto e **descarrega no `pagehide` e ao desmontar**. Cancelar o
  timer no unmount perde os últimos segundos. O status fica visível (`Salvando… / Salvo às 14:32 /
  Não salvou — Tentar de novo`) e o erro nunca é silencioso nem descarta a pendência: ela fica na
  fila até gravar ou até o usuário decidir.
- **Salvar explícito** guarda rascunho local **por conta** enquanto a edição difere do salvo
  (sobrevive a F5, fechar o navegador e trocar de conta; validade de 7 dias). Chave nova de
  armazenamento entra no inventário da Política de Cookies antes de ir ao ar.
- **Editor sem rascunho** (ainda) usa guarda de saída (`useBlocker` + `beforeunload`) enquanto
  houver alteração. Guarda de saída é o piso, não o padrão: ela não protege de sessão expirada
  nem de aba fechada pelo sistema.
- Campo inválido fica visível como inválido; a tela não mostra "tudo gravado" com texto que não
  foi gravado.

**Gravação por cima (concorrência):**

- Toda escrita de registro compartilhado leva **a versão que a tela viu** (`updated_at`,
  número de versão, id da versão vigente) e o servidor confere **na mesma transação** (sob lock
  ou no `WHERE`). Divergiu: recusa com erro de conflito que a tela reconhece. Campo opcional de
  versão na API é brecha: cliente que não mandar grava por cima.
- **Nunca trocar um conjunto inteiro a partir do estado do cliente** (delete-all + reinsert,
  upsert do documento inteiro) sem conferir a versão. Prefira mandar só o que mudou.
- **No conflito**, a tela congela a edição (não deixa digitar no vazio), guarda o que o usuário
  mudou e oferece **abrir a versão atual levando as alterações**, por merge de três vias
  (`rebaseDraftValues`): só o que o usuário mudou sai da edição dele, o resto vem da atual, e o
  que os dois mudaram fica sinalizado para conferência.
- A versão atual é relida no foco da janela, para a aba esquecida descobrir **antes** de o
  usuário digitar.

## Onde estamos (auditoria de 2026-09-28)

| App / tela | Perda local | Gravação por cima | Estado |
|---|---|---|---|
| SISUB — preparação | rascunho por conta; guarda e descarte no Fluxo/Equipamentos | versão vigente conferida sob o lock da linhagem na ficha, no fluxo e nos equipamentos; merge de três vias | **feito** |
| SISUB — cardápio semanal da cozinha, eventos, apoios | guarda de saída | autosave troca o conjunto inteiro, sem versão | **alto** |
| SISUB — plano semanal global | guarda de saída; F5 perde | Salvar troca o conjunto inteiro | **alto** |
| SISUB — assistente do anexo quantitativo | nenhuma; autosave cancelado ao sair | envio regrava a lista inteira com preço velho | **alto** |
| SISUB — previsão de demanda, configurações da cozinha/unidade/estoque, grupos de cardápio, gerenciador de locais | nenhuma | UPDATE inteiro / delete+insert | médio |
| SISUB — insumo | rascunho | só avisa; o servidor grava por cima | médio |
| Contrate — demanda | autosave sem `useBlocker`, descartado ao desmontar | 409 correto, mas a tela segue editável e não grava mais | **alto** |
| Contrate — parecer e triagem da ACI, pregoeiro | texto some ao trocar de aba; erro silencioso | triagem último-vence | médio |
| Forms — resposta e editor de questionário | autosave que descarta pendência no erro | `onBlur` regrava valor antigo do coeditor | **alto** |
| Portal — submissão e parecer do Journal | autosave que nunca dispara digitando; parecer sem proteção | autores delete+reinsert | **alto** |
| RUMAER — uniforme e composição | debounce cancelado ao sair | linha inteira / delete+reinsert | **alto** |
| SUCONT — nota do workspace | debounce cancelado ao sair | upsert do texto inteiro | **alto** |
| Escolha de Vagas — controlador | `defaultValue` não acompanha o realtime | `onBlur` regrava o valor antigo; updates fora de transação | **alto** |
| Portal — ofício COMAER | rascunho local + guarda | só dono | baixo (referência de rascunho) |

Cada linha "alto" vira um PR próprio, na ordem da tabela. O caso de edge case de cada uma fica
no catálogo do módulo (`.claude/skills/edge-cases/modules/`) como **LACUNA** até ser coberto.

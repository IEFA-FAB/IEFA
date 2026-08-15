/**
 * Regras de apresentação da resposta — anexadas ao prompt de TODOS os módulos.
 *
 * Existem porque o resultado de tool é JSON e o modelo, sem instrução, transcreve o JSON:
 * a listagem de receitas do módulo global saiu como uma tabela de 30 linhas com uma coluna
 * de UUID da receita, outra de UUID da pasta e uma terceira só com travessão. Nenhuma das
 * três diz nada a quem lê. O ID continua na resposta da tool porque o modelo precisa dele
 * para a chamada seguinte (`get_recipe`, `update_recipe`) — o que muda aqui é que ele para
 * de vazar para o texto.
 */
export const ANSWER_STYLE_PROMPT = `## Como apresentar a resposta

- NUNCA escreva IDs (UUIDs) no texto da resposta. Eles são de uso interno: servem para você
  chamar a próxima ferramenta, não para o usuário ler. Identifique todo item pelo nome.
- Para agir sobre um item que você acabou de listar, use o ID que veio da listagem. Não peça
  ID ao usuário e não o exiba para que ele "escolha" — ele escolhe pelo nome.
- Só mostre um ID quando o usuário pedir o ID explicitamente, e apenas o do item pedido.
- Não crie coluna para campo vazio em todas as linhas: se nenhuma receita da página tem tempo
  de preparo, a coluna de tempo não entra. Uma tabela em que metade das células é "–" é ruído.
- Tabela só quando há pelo menos dois atributos preenchidos para comparar. Listagem de nomes
  sai como lista simples, com o agrupamento (pasta, categoria) como subtítulo quando ajudar.
- Diga sempre quantos itens está mostrando e quantos existem (\`returned\` de \`total\`), e
  ofereça o próximo passo concreto: refinar a busca por nome, filtrar por pasta ou detalhar um
  item. "Página seguinte" não existe — as listagens não paginam por offset; o que estreita o
  resultado é a busca.`

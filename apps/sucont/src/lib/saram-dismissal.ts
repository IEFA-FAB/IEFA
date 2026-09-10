/**
 * @module saram-dismissal
 * Dispensa do pedido de SARAM, guardada FORA do componente de propósito.
 *
 * O `HubLayout` — que monta o diálogo — é renderizado por CADA uma das nove rotas
 * do hub; não é um layout compartilhado do roteador. Em estado de componente,
 * "Agora não" morreria na primeira navegação e o diálogo reabriria sobre a tela
 * seguinte. Estado de módulo sobrevive à remontagem porque a navegação do
 * TanStack Router não recarrega o bundle.
 *
 * **Nada é gravado no dispositivo, e isso é a decisão, não um descuido.**
 * `sessionStorage` seria o encaixe literal de "vale enquanto a aba estiver
 * aberta" — e cobriria também o F5, que aqui volta a perguntar. Mas chave de
 * armazenamento entra no inventário da Política de Cookies ANTES de entrar em uso
 * (regra do CLAUDE.md, com guard em `@iefa/legal-kit`), e versão nova de documento
 * legal é linha nova publicada em prod, que pede nova ciência de TODO usuário de
 * TODOS os apps. Um flag de conveniência de uma tela do sucont não paga esse
 * preço. Perguntar de novo depois de um recarregamento é o custo, e ele é barato:
 * o pedido é dispensável e leva um clique.
 *
 * Mora em `lib/` para que o `__root` possa esquecer a dispensa no logout sem
 * importar um componente de tela.
 */

/**
 * Só do lado do cliente. No servidor o valor é sempre `false`: um módulo é
 * compartilhado entre requisições, e um `true` deixado por uma sessão calaria o
 * pedido na renderização da seguinte.
 */
let dismissedInThisTab = false

export function readSaramDismissal(): boolean {
	if (typeof window === "undefined") return false
	return dismissedInThisTab
}

export function rememberSaramDismissal(): void {
	if (typeof window === "undefined") return
	dismissedInThisTab = true
}

/**
 * Esquece a dispensa. Chamado no `SIGNED_OUT` pela mesma razão que o cache de
 * identidade é descartado ali: numa máquina compartilhada, o "agora não" de quem
 * saiu calaria o pedido para quem entra em seguida — e trocar de conta sem
 * recarregar a página é o caminho normal de saída do hub.
 */
export function forgetSaramDismissal(): void {
	dismissedInThisTab = false
}

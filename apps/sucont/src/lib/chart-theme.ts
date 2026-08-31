/**
 * @module chart-theme
 * Cromo de gráfico compartilhado entre os módulos que usam recharts.
 *
 * O recharts pinta em atributo/prop de estilo, não em classe, então não enxerga
 * `dark:`. A saída é `var(--token)`: atributo de apresentação SVG e `style`
 * resolvem custom property, e a folha redefine os tokens sob `.dark`.
 *
 * Os nomes são os das variáveis BASE (`--card`, `--foreground`), e NÃO os
 * utilitários `--color-*` do `@theme inline`. A diferença não é cosmética: o
 * Tailwind emite `--color-card: var(--card)` no `:root`, e uma custom property é
 * computada no elemento em que é declarada — então `--color-card` congela o valor
 * do tema claro e todo descendente herda esse valor já resolvido, inclusive
 * dentro de `.dark`.
 *
 * Vive em `lib/` e não em `auditor/` porque o auditor não é o único consumidor:
 * os painéis do analista de saldo alongado plotavam o mesmo cromo com hex
 * literal (`stroke="#64748b"`, `backgroundColor: "white"`), o que já é uma
 * segunda fonte de verdade para a mesma decisão.
 */

/** Eixo, grade, superfície. Papel semântico, não cor. */
export const chartChrome = {
	/** Linhas da grade e bordas de célula. */
	grid: "var(--border)",
	/** Rótulos de eixo e legenda. */
	axis: "var(--muted-foreground)",
	/** Superfície desenhada sobre o gráfico: tooltip, rótulo de valor. */
	surface: "var(--card)",
	/** Superfície rebaixada: cursor do tooltip, faixa alternada. */
	surfaceMuted: "var(--muted)",
	/** Texto sobre `surface`. */
	label: "var(--foreground)",
} as const

/**
 * Escala institucional FAB, para série categórica.
 *
 * Aqui `--color-*` é seguro, ao contrário do cromo acima: estas cores são fixas
 * e não têm variante por tema, então não há valor para congelar.
 */
export const fabScale = ["var(--color-fab-700)", "var(--color-fab-500)", "var(--color-fab-300)", "var(--color-fab-200)", "var(--color-fab-100)"] as const

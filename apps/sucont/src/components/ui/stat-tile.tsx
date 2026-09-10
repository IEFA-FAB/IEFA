import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"
import { cn } from "#/lib/utils"

/**
 * Indicador numérico: rótulo em cima, valor embaixo. O KPI do sucont.
 *
 * Cinco telas desenhavam o seu: `p-4`, `p-5` e `p-6`; `shadow-sm`, `shadow-lg`
 * e `shadow-xl`; um deles com quarto-de-círculo decorativo no canto e outro com
 * `border-b-4 border-b-emerald-600` — paleta crua e faixa de acento de um lado
 * só, as duas proibidas pelo §6. O valor ora era `.text-display`, ora
 * `.text-heading`, ora `.text-subheading`, sem que o tamanho dissesse nada sobre
 * a importância do número.
 *
 * `status` é o único eixo de cor, e é semântico: pinta o VALOR, não a superfície.
 * Um indicador vermelho inteiro compete com o `Alert` destrutivo ao lado.
 */
const statValueVariants = cva("text-display truncate", {
	variants: {
		status: {
			default: "text-foreground",
			destructive: "text-destructive",
			warning: "text-warning",
			success: "text-success",
			action: "text-action",
		},
	},
	defaultVariants: { status: "default" },
})

interface StatTileProps extends React.ComponentProps<"div">, VariantProps<typeof statValueVariants> {
	label: string
	value: React.ReactNode
	/** Ícone ao lado do rótulo. Muda a leitura, não a cor. */
	icon?: React.ReactNode
	/** Uma linha sob o valor: unidade, recorte, comparação. */
	hint?: string
}

export function StatTile({ label, value, icon, hint, status, className, ...props }: StatTileProps) {
	return (
		<div data-slot="stat-tile" className={cn("flex flex-col gap-1 rounded-xl border border-border bg-card p-4", className)} {...props}>
			<div className="flex items-center gap-2 text-muted-foreground [&>svg]:size-4 [&>svg]:shrink-0">
				{icon}
				<span className="text-label">{label}</span>
			</div>
			<p className={statValueVariants({ status })}>{value}</p>
			{hint && <p className="text-caption text-muted-foreground">{hint}</p>}
		</div>
	)
}

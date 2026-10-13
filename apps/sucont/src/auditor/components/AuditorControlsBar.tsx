// Extraído de routes/auditor.tsx (port do SIAFI-x-SILOMS-Auditor): barra grudada de grupo, período e zerados.

import { AlertTriangle, Database } from "lucide-react"
import type { TimeFilter } from "#/auditor/types"
import { AccountGroup } from "#/auditor/types"

interface AuditorControlsBarProps {
	selectedGroup: string
	onSelectGroup: (group: string) => void
	timeFilter: TimeFilter
	onSelectTimeFilter: (timeFilter: TimeFilter) => void
	totalUGsCount: number
	hideZeros: boolean
	onToggleHideZeros: () => void
}

export function AuditorControlsBar({
	selectedGroup,
	onSelectGroup,
	timeFilter,
	onSelectTimeFilter,
	totalUGsCount,
	hideZeros,
	onToggleHideZeros,
}: AuditorControlsBarProps) {
	/*
	  `top-14` acompanha o cabeçalho do hub, que tem `h-14`. Com `top-16`
	  sobrava uma fresta de 8px entre as duas barras grudadas, e o conteúdo
	  rolava por dentro dela.

	  Flex, e não `grid-cols-12`: cada bloco aqui tem largura própria (as
	  quatro pílulas de período somam ~345px) e num slot de 4/12 colunas o
	  conteúdo transbordava a célula SEM recortar — de 768px a ~1400px os três
	  blocos se imprimiam uns por cima dos outros. Em flex o bloco que não cabe
	  desce de linha.
	*/
	return (
		<div className={`sticky top-14 z-30 pt-4 pb-2 transition-colors bg-background/95 backdrop-blur-md -mx-4 px-4 sm:-mx-6 sm:px-6`}>
			<div className="flex flex-col gap-2 py-1 xl:flex-row xl:flex-wrap xl:items-center xl:justify-between xl:gap-4">
				{/* Group Filters */}
				<div className="flex min-w-0 items-center gap-2 p-1 bg-transparent rounded-lg overflow-x-auto custom-scrollbar">
					{[
						{
							id: "ALL",
							label: "VISÃO GERAL",
							activeClass: "text-foreground border border-border",
						},
						{
							id: AccountGroup.BMP,
							label: "BMP",
							activeClass: "text-destructive border border-destructive shadow-[0_0_10px_rgba(220,38,38,0.2)]",
						},
						{
							id: AccountGroup.CONSUMO,
							label: "CONSUMO",
							activeClass: "text-action border border-action shadow-[0_0_10px_rgba(37,99,235,0.2)]",
						},
						{
							id: AccountGroup.INTANGIVEL,
							label: "INTANGÍVEL",
							activeClass: "text-success border border-success shadow-[0_0_10px_rgba(5,150,105,0.2)]",
						},
					].map((tab) => (
						<button
							key={tab.id}
							type="button"
							onClick={() => onSelectGroup(tab.id)}
							className={`px-4 py-2 text-label rounded-lg transition-all whitespace-nowrap border border-transparent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 
                        ${selectedGroup === tab.id ? tab.activeClass : "text-muted-foreground hover:text-foreground hover:bg-muted"}
                      `}
						>
							{tab.label}
						</button>
					))}
				</div>

				{/* Time Filters + Toggles */}
				<div className="flex flex-wrap items-center gap-2 xl:shrink-0 xl:justify-end xl:gap-3">
					<div className={`flex max-w-full shrink-0 overflow-x-auto custom-scrollbar p-1 rounded-lg bg-muted`}>
						{(["MENSAL", "TRIMESTRAL", "SEMESTRAL", "ANUAL"] as TimeFilter[]).map((tf) => (
							<button
								key={tf}
								type="button"
								onClick={() => onSelectTimeFilter(tf)}
								className={`px-3 py-2 text-label rounded-lg whitespace-nowrap transition-all focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50
                          ${timeFilter === tf ? "bg-action text-action-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}
                        `}
							>
								{tf}
							</button>
						))}
					</div>

					<div className="flex shrink-0 items-center gap-2 px-3 py-2 rounded-lg border bg-muted border-border">
						<span className="sr-only">Quantidade de UGs consideradas na visualização atual</span>
						<Database className="w-3.5 h-3.5 text-action" />
						{/* Abaixo de `sm` fica só a contagem: o rótulo custava uma linha inteira
						    da barra grudada, que já ocupa boa parte da tela pequena. O texto
						    completo continua no `sr-only` acima. */}
						<div className="flex flex-col leading-none">
							<span className="hidden sm:block text-label text-muted-foreground">Registros Totais</span>
							<span className={`text-caption text-foreground`}>{totalUGsCount} UGs</span>
						</div>
					</div>

					<button
						type="button"
						onClick={onToggleHideZeros}
						className={`flex shrink-0 items-center gap-2 px-4 py-2 rounded-lg text-label whitespace-nowrap border transition-all focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50
                      ${hideZeros ? "bg-warning/10 text-warning border-warning/50" : "text-muted-foreground border-border hover:text-foreground"}
                    `}
					>
						<AlertTriangle className="w-4 h-4" />
						{hideZeros ? "Ocultando Zerados" : "Mostrar Zerados"}
					</button>
				</div>
			</div>
		</div>
	)
}

import { Button } from "@iefa/ui";
import { BarChart3, ExternalLink, Maximize2 } from "lucide-react";
import { useState } from "react";

export default function IndicatorsCard() {
	const [expanded, setExpanded] = useState(false);
	const frameHeight = "clamp(520px, 78vh, 1000px)";
	const toggleExpanded = () => setExpanded((e) => !e);

	const powerBiUrl =
		"https://app.powerbi.com/view?r=eyJrIjoiOTMwNzQxODYtMjc0OS00Y2U2LThjMWItMTU5MGZkZjk2ZmE3IiwidCI6IjNhMzY0ZGI2LTg2NmEtNDRkOS1iMzY5LWM1ODk1OWQ0NDhmOCJ9";

	return (
		<div
			className={` rounded-2xl border shadow-sm ${expanded ? "p-0" : "p-6"}`}
		>
			{/* Barra superior */}
			<div
				className={`${expanded ? "px-4 py-3" : "mb-4"} flex items-center justify-between`}
			>
				<div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs border">
					<BarChart3 className="h-4 w-4" aria-hidden="true" />
					Indicadores
				</div>

				<div className="flex items-center gap-2">
					<Button
						onClick={() =>
							window.open(powerBiUrl, "_blank", "noopener,noreferrer")
						}
						className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border hover:bg-gray-50"
						aria-label="Abrir relatório em nova aba"
						title="Abrir em nova aba"
					>
						<ExternalLink className="h-4 w-4" aria-hidden="true" />
						Abrir
					</Button>

					<Button
						onClick={toggleExpanded}
						className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border hover:bg-gray-50 "
						aria-pressed={expanded}
						aria-label={expanded ? "Reduzir" : "Expandir"}
						title={expanded ? "Reduzir" : "Expandir"}
					>
						<Maximize2 className="h-4 w-4" aria-hidden="true" />
						{expanded ? "Reduzir" : "Expandir"}
					</Button>
				</div>
			</div>

			{/* Wrapper full-bleed quando expandido */}
			<div className={expanded ? "" : "px-0"}>
				{/* Cabeçalho do card (quando não expandido) */}
				<div className={`${expanded ? "" : "px-6"} pb-4 flex flex-col gap-3`}>
					{!expanded && (
						<>
							<h2 className="text-xl font-bold ">Indicadores da Unidade</h2>
							<p className=" text-sm">
								Acompanhe métricas e relatórios consolidados. Expanda para tela
								cheia para melhor visualização.
							</p>
						</>
					)}
				</div>

				{/* Container do iframe */}
				<div className={`${expanded ? "" : "px-6"} pb-6`}>
					<div className="rounded-2xl border  overflow-hidden ">
						<iframe
							title="Indicadores SISUB - Power BI"
							src={powerBiUrl}
							className="w-full"
							style={{ height: frameHeight }}
							allowFullScreen
							loading="lazy"
							referrerPolicy="no-referrer-when-downgrade"
						/>
					</div>
					<div className="mt-3 text-xs  px-1">
						Dica: use o botão de tela cheia dentro do relatório para melhor
						experiência.
					</div>
				</div>
			</div>
		</div>
	);
}

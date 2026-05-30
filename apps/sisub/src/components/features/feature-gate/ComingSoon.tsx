import { Clock } from "lucide-react"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

/**
 * Placeholder "Em breve" para telas de fluxos não-essenciais cujos secrets não
 * estão configurados neste ambiente (ex.: IA sem MODULE_CHAT_AI_* / ANALYTICS_AI_*).
 * Mantém a tela navegável sem quebrar o deploy nem expor um erro 500.
 */
export function ComingSoon({
	title = "Em breve",
	description = "Este recurso ainda não está disponível neste ambiente. Estamos finalizando a configuração — volte em breve.",
}: {
	title?: string
	description?: string
}) {
	return (
		<div className="flex h-full w-full flex-1 items-center justify-center p-6">
			<Empty className="max-w-md border">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<Clock />
					</EmptyMedia>
					<EmptyTitle>{title}</EmptyTitle>
					<EmptyDescription>{description}</EmptyDescription>
				</EmptyHeader>
			</Empty>
		</div>
	)
}

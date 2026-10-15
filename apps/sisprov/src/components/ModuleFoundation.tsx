import { Construction } from "lucide-react"
import type { ReactNode } from "react"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"

export type UpcomingFeature = { title: string; description: string; change: string }

/**
 * Estado honesto do módulo em fundação: o que ainda não existe e em que change chega. Não é um
 * "nenhum resultado" (isso mentiria sobre dado que ainda não pode existir) nem uma capa.
 */
export function ModuleFoundation({
	title,
	description,
	upcoming,
	children,
}: {
	title: string
	description: string
	upcoming: UpcomingFeature[]
	children?: ReactNode
}) {
	return (
		<div className="space-y-6">
			<Empty>
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<Construction />
					</EmptyMedia>
					<EmptyTitle>{title}</EmptyTitle>
					<EmptyDescription>{description}</EmptyDescription>
				</EmptyHeader>
				{children && <EmptyContent>{children}</EmptyContent>}
			</Empty>

			<section className="space-y-3">
				<h2 className="text-label text-muted-foreground">O que vem a seguir</h2>
				<ItemGroup>
					{upcoming.map((feature) => (
						<Item key={feature.change} variant="outline">
							<ItemMedia variant="icon">
								<Construction />
							</ItemMedia>
							<ItemContent>
								<ItemTitle>{feature.title}</ItemTitle>
								<ItemDescription>
									{feature.description} <span className="font-mono">{feature.change}</span>
								</ItemDescription>
							</ItemContent>
						</Item>
					))}
				</ItemGroup>
			</section>
		</div>
	)
}

import { createFileRoute } from "@tanstack/react-router"
import { ChevronRight, ExternalLink, Search, Star } from "lucide-react"
import { useMemo, useState } from "react"
import { HubLayout } from "#/components/hub-layout"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "#/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "#/components/ui/empty"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs"
import type { SectionId } from "#/lib/centro-monitoramento-data"
import { modulesData, routingKeywords } from "#/lib/centro-monitoramento-data"
import { useHubFilters } from "#/lib/hub-filters"

export const Route = createFileRoute("/centro-monitoramento")({
	component: RouteComponent,
})

interface ModuleItem {
	id: string
	name: string
	purpose: string
	examples: readonly string[]
	url?: string
	group: string
	highlighted?: boolean
}

const SECTIONS: Array<{ id: SectionId; label: string }> = [
	{ id: "3.1", label: "Acompanhamento contábil" },
	{ id: "3.2", label: "Suporte ao usuário" },
	{ id: "geral", label: "Sistemas e guias" },
]

const SECTION_BADGE: Record<SectionId, string> = {
	"3.1": "SUCONT-3.1",
	"3.2": "SUCONT-3.2",
	geral: "Âmbito geral",
}

function sectionOf(itemId: string): SectionId {
	for (const section of SECTIONS) {
		if (modulesData[section.id].items.some((i) => i.id === itemId)) return section.id
	}
	return "3.1"
}

/**
 * Inventário dos módulos e oráculos da SUCONT-3.
 *
 * Esta tela era uma segunda aplicação dentro do app: barra lateral própria com
 * quatro itens, campo de busca próprio, uma capa com chamada em 5xl e três cards
 * de proposta de valor — ou seja, um SEGUNDO catálogo, competindo com o do hub e
 * inalcançável por ele (a rota nunca esteve em `sucontTools`, nem na barra).
 *
 * Agora é uma ferramenta como as outras: a busca é a `?q=` do hub, as três seções
 * são abas, e a capa saiu. O que sobrou é o que só existia aqui — o inventário.
 */
function RouteComponent() {
	const { query } = useHubFilters()
	const [section, setSection] = useState<SectionId>("3.1")
	const trimmedQuery = query.trim()

	const searchResults = useMemo(() => {
		if (!trimmedQuery) return null
		const needle = trimmedQuery.toLowerCase()
		const results: Array<ModuleItem & { sectionId: SectionId }> = []

		for (const { id: sectionId } of SECTIONS) {
			for (const item of modulesData[sectionId].items) {
				const route = routingKeywords.find((r) => r.moduleId === item.id)
				const matches =
					item.name.toLowerCase().includes(needle) ||
					item.purpose.toLowerCase().includes(needle) ||
					route?.keywords.some((kw) => kw.toLowerCase().includes(needle))
				if (matches) results.push({ ...(item as ModuleItem), sectionId })
			}
		}
		return results
	}, [trimmedQuery])

	if (searchResults) {
		return (
			<HubLayout searchable>
				<div className="mb-6 flex items-center justify-between gap-4 border-b border-border pb-4">
					<h2 className="text-heading text-foreground">Resultados da busca</h2>
					<Badge variant="muted">{searchResults.length} encontrado(s)</Badge>
				</div>

				{searchResults.length > 0 ? (
					<ModuleGrid items={searchResults.map((item) => ({ item, sectionId: item.sectionId }))} />
				) : (
					<Empty>
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<Search />
							</EmptyMedia>
							<EmptyTitle>Nenhum módulo encontrado</EmptyTitle>
							<EmptyDescription>Não há ferramenta correspondente a "{trimmedQuery}". Tente outro termo ou a sigla da questão do RAC.</EmptyDescription>
						</EmptyHeader>
					</Empty>
				)}
			</HubLayout>
		)
	}

	return (
		<HubLayout searchable>
			<Tabs value={section} onValueChange={(value) => setSection(value as SectionId)}>
				<TabsList>
					{SECTIONS.map((s) => (
						<TabsTrigger key={s.id} value={s.id}>
							{s.label}
						</TabsTrigger>
					))}
				</TabsList>

				{SECTIONS.map((s) => (
					<TabsContent key={s.id} value={s.id} className="pt-4">
						<h2 className="text-heading text-foreground">{modulesData[s.id].title}</h2>
						<div className="mt-6 space-y-8">
							{groupItems(modulesData[s.id].items as readonly ModuleItem[]).map(([groupName, items]) => (
								<section key={groupName} className="space-y-4">
									{groupName !== "Geral" && <h3 className="text-label text-muted-foreground">{groupName}</h3>}
									<ModuleGrid items={items.map((item) => ({ item, sectionId: s.id }))} />
								</section>
							))}
						</div>
					</TabsContent>
				))}
			</Tabs>
		</HubLayout>
	)
}

function groupItems(items: readonly ModuleItem[]): Array<[string, ModuleItem[]]> {
	const groups = items.reduce<Record<string, ModuleItem[]>>((acc, item) => {
		const group = item.group || "Geral"
		acc[group] ??= []
		acc[group].push(item)
		return acc
	}, {})
	return Object.entries(groups)
}

function ModuleGrid({ items }: { items: Array<{ item: ModuleItem; sectionId?: SectionId }> }) {
	return (
		<div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
			{items.map(({ item, sectionId }) => (
				<ModuleCard key={item.id} item={item} sectionId={sectionId} />
			))}
		</div>
	)
}

function ModuleCard({ item, sectionId }: { item: ModuleItem; sectionId?: SectionId }) {
	const resolved = sectionId ?? sectionOf(item.id)

	return (
		<Card className="h-full">
			<CardHeader className="gap-2">
				{item.highlighted && (
					<Badge variant="warning">
						<Star />
						Destaque operacional
					</Badge>
				)}
				<CardTitle>{item.name}</CardTitle>
				<Badge variant={resolved === "geral" ? "success" : "action"} className="mt-1 w-fit">
					{SECTION_BADGE[resolved]}
				</Badge>
			</CardHeader>

			<CardContent className="flex-1 space-y-4">
				<p className="text-body text-muted-foreground leading-relaxed">{item.purpose}</p>

				<div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
					<span className="text-label flex items-center gap-1.5 text-muted-foreground">
						<Search className="size-3" /> Exemplos de consulta
					</span>
					<ul className="space-y-1.5">
						{item.examples.map((ex) => (
							<li key={ex} className="text-caption flex items-start gap-2 text-muted-foreground">
								<ChevronRight className="mt-0.5 size-3 shrink-0 text-muted-foreground/60" aria-hidden="true" />
								{ex}
							</li>
						))}
					</ul>
				</div>
			</CardContent>

			<CardFooter>
				{item.url ? (
					<Button className="w-full" nativeButton={false} render={<a href={item.url} target="_blank" rel="noopener noreferrer" />}>
						Acessar ferramenta
						<ExternalLink className="size-4" />
					</Button>
				) : (
					<Button className="w-full" disabled variant="secondary">
						Link indisponível
					</Button>
				)}
			</CardFooter>
		</Card>
	)
}

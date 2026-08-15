import { useRouter } from "@tanstack/react-router"
import { useEffect } from "react"
import { PUBLIC_PAGES } from "@/lib/agent-discovery"
import { type CommandPaletteItem, rankCommandItem } from "@/lib/command-palette"
import { getAppsFn } from "@/server/pregoeiro.fn"
import type { DbApp } from "@/types/domain"

/**
 * Tipagem mínima da WebMCP (`navigator.modelContext`). A API ainda é proposta,
 * então tudo aqui é defensivo: sem o objeto, o componente não faz nada.
 */
interface WebMcpTool {
	name: string
	description: string
	inputSchema: Record<string, unknown>
	execute: (input: Record<string, unknown>) => Promise<{ content: Array<{ type: "text"; text: string }> }>
}

interface ModelContext {
	provideContext?: (context: { tools: WebMcpTool[] }) => void
}

function getModelContext(): ModelContext | undefined {
	if (typeof navigator === "undefined") return undefined
	return (navigator as Navigator & { modelContext?: ModelContext }).modelContext
}

function text(value: string) {
	return { content: [{ type: "text" as const, text: value }] }
}

export function WebMcpTools() {
	const router = useRouter()

	useEffect(() => {
		const modelContext = getModelContext()
		if (!modelContext?.provideContext) return

		/**
		 * Só rotas públicas. As descrições das tools podem sair do navegador para
		 * um modelo de terceiros, então o mapa de rotas autenticadas (editorial,
		 * submissões, revisão) fica de fora de propósito.
		 */
		const searchable: CommandPaletteItem[] = []
		for (const route of Object.values(router.routesByPath)) {
			const nav = route.options.staticData?.nav
			if (!nav || route.to.includes("$")) continue
			if (nav.access && nav.access !== "public") continue
			searchable.push({
				id: `route:${route.id}`,
				kind: "route",
				title: nav.title,
				section: nav.section,
				subtitle: nav.subtitle,
				keywords: nav.keywords,
				href: route.to,
				order: nav.order,
				perform: () => {},
			})
		}

		const tools: WebMcpTool[] = [
			{
				name: "buscar_no_portal",
				description:
					"Busca páginas públicas do Portal IEFA por título, palavra-chave ou assunto e devolve os caminhos correspondentes. Use antes de navegar, para descobrir onde está a informação.",
				inputSchema: {
					type: "object",
					properties: {
						consulta: { type: "string", description: "Termo de busca, em português. Ex.: 'pregoeiro', 'política de inovação'." },
					},
					required: ["consulta"],
				},
				execute: async (input) => {
					const consulta = String(input.consulta ?? "")
					const results = searchable
						.map((item) => ({ item, score: rankCommandItem(item, consulta) }))
						.filter((entry) => entry.score >= 0)
						.sort((a, b) => b.score - a.score)
						.slice(0, 10)

					if (results.length === 0) {
						return text(`Nenhuma página encontrada para "${consulta}". Consulte /llms.txt para o índice completo do portal.`)
					}

					const lines = results.map(({ item }) => `- ${item.title} (${item.href}) — ${item.subtitle ?? item.section}`)
					return text(`Páginas encontradas para "${consulta}":\n${lines.join("\n")}`)
				},
			},
			{
				name: "listar_aplicacoes",
				description:
					"Lista a suíte de aplicações mantidas pelo IEFA para o Comando da Aeronáutica (SISUB, RUMAER, SUCONT e outras), com descrição e endereço de cada uma.",
				inputSchema: { type: "object", properties: {} },
				execute: async () => {
					const apps = (await getAppsFn({ data: { limit: 50 } })) as DbApp[]
					if (apps.length === 0) return text("Nenhuma aplicação cadastrada no momento.")

					const lines = apps.map((app) => `- ${app.title} (${app.href ?? app.to_path ?? "sem endereço"}) — ${app.description}`)
					return text(`Aplicações da suíte IEFA:\n${lines.join("\n")}`)
				},
			},
			{
				name: "abrir_pagina",
				description: "Navega o portal para um caminho público. Use um caminho devolvido por buscar_no_portal ou um dos caminhos canônicos do portal.",
				inputSchema: {
					type: "object",
					properties: {
						caminho: { type: "string", description: "Caminho canônico iniciado por barra. Ex.: /facilities/pregoeiro" },
					},
					required: ["caminho"],
				},
				execute: async (input) => {
					const caminho = String(input.caminho ?? "")
					const allowed = new Set<string>([...PUBLIC_PAGES.map((page) => page.path), ...searchable.flatMap((item) => (item.href ? [item.href] : []))])

					if (!allowed.has(caminho)) {
						return text(`Caminho "${caminho}" não é uma página pública conhecida. Use buscar_no_portal para descobrir o caminho correto.`)
					}

					await router.navigate({ to: caminho })
					return text(`Portal navegado para ${caminho}.`)
				},
			},
		]

		modelContext.provideContext({ tools })
	}, [router])

	return null
}

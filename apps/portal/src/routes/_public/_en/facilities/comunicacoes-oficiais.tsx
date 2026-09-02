import { createFileRoute, redirect } from "@tanstack/react-router"
import { Printer, RefreshDouble } from "iconoir-react"
import { useEffect, useMemo, useState } from "react"
import { authQueryOptions } from "@/auth/service"
import { A4Sheet } from "@/components/comaer/A4Sheet"
import { AiPanel } from "@/components/comaer/AiPanel"
import { DocumentForm } from "@/components/comaer/DocumentForm"
import { DocumentsPanel } from "@/components/comaer/DocumentsPanel"
import { ExportPanel } from "@/components/comaer/ExportPanel"
import { Button } from "@/components/ui/button"
import { assembleDocument } from "@/lib/comaer/assemble"
import { findKind } from "@/lib/comaer/catalog"
import { clearDraft, loadDraft, newDocument, saveDraft } from "@/lib/comaer/draft"
import { applyProposal } from "@/lib/comaer/proposal"
import type { AiProposal } from "@/lib/comaer/schema"
import type { DocumentInput } from "@/lib/comaer/types"

export const Route = createFileRoute("/_public/_en/facilities/comunicacoes-oficiais")({
	staticData: {
		nav: {
			title: "Comunicações Oficiais",
			section: "Facilidades",
			subtitle: "Redigir ofício, despacho, parecer e demais espécies conforme a NSCA 5-3",
			keywords: ["oficio", "despacho", "parecer", "requerimento", "nsca", "sigadaer", "redacao oficial"],
			order: 21,
		},
	},
	/**
	 * Exige sessão: a ferramenta grava documento no schema `documents` e chama modelo, e as
	 * duas coisas têm dono. O guard real está nas server functions — este `beforeLoad` só
	 * evita mostrar uma tela que não funcionaria.
	 */
	beforeLoad: async ({ context }) => {
		const auth = await context.queryClient.query({ ...authQueryOptions(), staleTime: "static" })
		if (!auth.isAuthenticated) throw redirect({ to: "/auth" })
		return { auth }
	},
	component: ComunicacoesOficiais,
	head: () => {
		const baseUrl = import.meta.env.VITE_PUBLIC_URL ?? ""
		const title = "Comunicações Oficiais — Portal IEFA"
		const description =
			"Redação de comunicações oficiais do COMAER conforme a NSCA 5-3/2026: ofício, despacho, parecer, requerimento, ata e demais espécies, com saída pronta para colar no SIGADAER."
		return {
			meta: [
				{ title },
				{ name: "description", content: description },
				{ property: "og:title", content: title },
				{ property: "og:description", content: description },
				{ property: "og:url", content: `${baseUrl}/facilities/comunicacoes-oficiais` },
			],
		}
	},
})

/**
 * Redator de comunicações oficiais (NSCA 5-3/2026, Anexo I).
 *
 * A saída principal é a área de transferência, não o papel: o despacho acontece no
 * SIGADAER. A impressão existe, mas é o caminho secundário.
 *
 * O rascunho em edição vive no navegador; salvar é ato explícito e leva o documento para o
 * schema `documents`, sob o dono da sessão. A redação assistida é opcional e recusa
 * documento classificado (art. 7º § 2º) antes de qualquer chamada a provider.
 */
function ComunicacoesOficiais() {
	const [input, setInput] = useState<DocumentInput>(newDocument)
	const [documentId, setDocumentoId] = useState<string | null>(null)
	const [restaurado, setRestaurado] = useState(false)

	// O rascunho só é lido no cliente: ler no SSR entregaria HTML diferente do que o
	// navegador montaria e a hidratação descartaria a árvore.
	useEffect(() => {
		const salvo = loadDraft()
		if (salvo) setInput(salvo)
		setRestaurado(true)
	}, [])

	useEffect(() => {
		if (restaurado) saveDraft(input)
	}, [input, restaurado])

	const kind = findKind(input.kind) ?? findKind("oficio-comaer")
	const doc = useMemo(() => (kind ? assembleDocument({ ...input, kind: kind.id }) : null), [input, kind])

	const updateField = (patch: Partial<DocumentInput>) => setInput((current) => ({ ...current, ...patch }))

	// A regra do que a proposta pode sobrescrever mora em `aplicarRedacao`, fora do
	// componente: é a decisão mais importante da ferramenta e precisa de teste.
	const applyAiProposal = (proposal: AiProposal) => setInput((current) => applyProposal(current, proposal))

	const startNewDocument = () => {
		clearDraft()
		setInput(newDocument())
		setDocumentoId(null)
	}

	if (!kind || !doc) return null

	return (
		<div className="w-full py-10">
			<style>{`
				@media print {
					@page { size: A4; margin: 2cm 2cm 2cm 3cm; }
					body * { visibility: hidden; }
					[data-folha], [data-folha] * { visibility: visible; }
					[data-folha] { position: absolute; left: 0; top: 0; width: 100%; }
				}
			`}</style>

			<header data-imprimir-oculto className="flex flex-wrap items-end justify-between gap-4 mb-8">
				<div>
					<h1 className="text-3xl md:text-4xl font-bold tracking-tight text-balance">Comunicações Oficiais</h1>
					<p className="text-muted-foreground mt-2 text-pretty max-w-2xl">
						Redação conforme a{" "}
						<a href="/docs/NSCA 5-3.pdf" className="underline underline-offset-4" target="_blank" rel="noreferrer">
							NSCA 5-3/2026
						</a>{" "}
						(Portaria GABAER/GC3 nº 1.574, de 4 de fevereiro de 2026), que revogou a NSCA 10-2/2019. A saída é pronta para colar no SIGADAER, field a field.
					</p>
				</div>
				<div className="flex gap-2">
					<Button type="button" variant="outline" size="sm" onClick={startNewDocument}>
						<RefreshDouble className="size-4" /> Novo
					</Button>
					<Button type="button" size="sm" onClick={() => window.print()}>
						<Printer className="size-4" /> Imprimir
					</Button>
				</div>
			</header>

			<div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_auto] gap-8 items-start">
				<div data-imprimir-oculto className="flex flex-col gap-8 min-w-0">
					<DocumentsPanel
						input={input}
						documentId={documentId}
						onAbrir={(document, id) => {
							setInput(document)
							setDocumentoId(id)
						}}
						onNovo={startNewDocument}
						onSalvo={setDocumentoId}
					/>
					<AiPanel input={input} onAplicar={applyAiProposal} />
					<DocumentForm input={input} kind={kind} onChange={updateField} />
					<ExportPanel doc={doc} />
				</div>

				{/* A folha acompanha a rolagem do formulário: conferir o efeito de um campo
				    exige vê-lo, e no desktop há largura de sobra para os dois. */}
				<div className="overflow-x-auto xl:sticky xl:top-20">
					<A4Sheet doc={doc} />
				</div>
			</div>
		</div>
	)
}

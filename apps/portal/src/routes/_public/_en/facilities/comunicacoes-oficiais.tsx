import { useQuery } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { Printer, RefreshDouble } from "iconoir-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { authQueryOptions } from "@/auth/service"
import { A4Sheet } from "@/components/comaer/A4Sheet"
import { AiPanel } from "@/components/comaer/AiPanel"
import { ChatPanel } from "@/components/comaer/ChatPanel"
import { DocumentForm } from "@/components/comaer/DocumentForm"
import { DocumentsPanel } from "@/components/comaer/DocumentsPanel"
import { ExportPanel } from "@/components/comaer/ExportPanel"
import { ImportPanel } from "@/components/comaer/ImportPanel"
import { WriterProfilePanel } from "@/components/comaer/WriterProfilePanel"
import { Button } from "@/components/ui/button"
import { assembleDocument } from "@/lib/comaer/assemble"
import { findKind } from "@/lib/comaer/catalog"
import { clearDraft, loadDraft, newDocument, saveDraft } from "@/lib/comaer/draft"
import {
	applyChatPatch,
	beginTurn,
	type EditorState,
	editDocument,
	initialEditorState,
	lastTurnChanges,
	touchedBlocks,
	undoTurn,
} from "@/lib/comaer/editor-state"
import { applyProposal } from "@/lib/comaer/proposal"
import type { AiProposal } from "@/lib/comaer/schema"
import type { DocumentInput } from "@/lib/comaer/types"
import { seedFromProfile, type WriterProfile } from "@/lib/comaer/writer-profile"
import { loadWriterProfileFn } from "@/server/writer-profile.fn"

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
	// Um estado só: documento + pilha de turnos da conversa. Separar os dois exigiria
	// escrever num `setState` de dentro do outro, e é assim que o destaque do turno passa a
	// mostrar o turno anterior.
	const [state, setState] = useState<EditorState>(() => initialEditorState(newDocument()))
	const [documentId, setDocumentId] = useState<string | null>(null)
	const [restored, setRestored] = useState(false)
	const [mode, setMode] = useState<"form" | "chat">("form")
	const [profile, setProfile] = useState<WriterProfile | null>(null)

	const input = state.document

	// O rascunho só é lido no cliente: ler no SSR entregaria HTML diferente do que o
	// navegador montaria e a hidratação descartaria a árvore.
	useEffect(() => {
		const saved = loadDraft()
		if (saved) setState(initialEditorState(saved))
		setRestored(true)
	}, [])

	useEffect(() => {
		if (restored) saveDraft(input)
	}, [input, restored])

	// A mesma query do painel de perfil — o React Query desduplica. Serve para o documento
	// em branco nascer preenchido já na primeira visita, sem esperar um clique em "Novo".
	const storedProfile = useQuery({ queryKey: ["writer-profile"], queryFn: () => loadWriterProfileFn() })
	useEffect(() => {
		const loaded = storedProfile.data
		if (!loaded || !restored) return
		setProfile(loaded)
		setState((current) =>
			current.document.om.name.trim() === "" && current.document.signer.name.trim() === ""
				? initialEditorState(seedFromProfile(current.document, loaded))
				: current
		)
	}, [storedProfile.data, restored])

	const kind = findKind(input.kind) ?? findKind("oficio-comaer")
	const doc = useMemo(() => (kind ? assembleDocument({ ...input, kind: kind.id }) : null), [input, kind])

	const updateField = (patch: Partial<DocumentInput>) => setState((current) => editDocument(current, patch))

	// A regra do que a proposta pode sobrescrever mora em `applyProposal`, fora do
	// componente: é a decisão mais importante da ferramenta e precisa de teste.
	const applyAiProposal = (proposal: AiProposal) => setState((current) => ({ ...current, document: applyProposal(current.document, proposal) }))

	// `useCallback` porque o painel de conversa aplica remendos dentro de um efeito sobre
	// as mensagens: uma função nova a cada render reexecutaria o efeito e reaplicaria tudo.
	const applyPatchFromChat = useCallback((name: string, args: Record<string, unknown>) => setState((current) => applyChatPatch(current, name, args)), [])

	// Documento novo nasce com os dados fixos. Documento já existente não é remendado pelo
	// perfil: quem abre o que salvou espera encontrá-lo como deixou.
	const startNewDocument = () => {
		clearDraft()
		setState(initialEditorState(seedFromProfile(newDocument(), profile)))
		setDocumentId(null)
	}

	if (!kind || !doc) return null

	return (
		<div className="w-full py-10">
			<style>{`
				@media print {
					@page { size: A4; margin: 2cm 2cm 2cm 3cm; }
					body * { visibility: hidden; }
					[data-sheet], [data-sheet] * { visibility: visible; }
					[data-sheet] { position: absolute; left: 0; top: 0; width: 100%; }
				}
			`}</style>

			<header className="flex flex-wrap items-end justify-between gap-4 mb-8">
				<div>
					<h1 className="text-3xl md:text-4xl font-bold tracking-tight text-balance">Comunicações Oficiais</h1>
					<p className="text-muted-foreground mt-2 text-pretty max-w-2xl">
						Redação conforme a{" "}
						<a href="/docs/NSCA 5-3.pdf" className="underline underline-offset-4" target="_blank" rel="noreferrer">
							NSCA 5-3/2026
						</a>{" "}
						(Portaria GABAER/GC3 nº 1.574, de 4 de fevereiro de 2026), que revogou a NSCA 10-2/2019. A saída é pronta para colar no SIGADAER, campo a campo.
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
				<div className="flex flex-col gap-8 min-w-0">
					{/* Formulário e conversa são dois modos do MESMO documento: trocar de modo não
					    salva, não descarta e não converte nada. */}
					<div className="flex border border-border w-fit">
						{(["form", "chat"] as const).map((option) => (
							<button
								key={option}
								type="button"
								onClick={() => setMode(option)}
								aria-pressed={mode === option}
								className={`px-4 h-9 text-sm transition-colors ${mode === option ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
							>
								{option === "form" ? "Formulário" : "Conversa"}
							</button>
						))}
					</div>

					<WriterProfilePanel
						onSaved={(saved) => {
							setProfile(saved)
							// Perfil salvo com o documento ainda em branco preenche na hora: é o caso de
							// quem acabou de abrir a ferramenta pela primeira vez.
							setState((current) => (current.document.om.name.trim() === "" ? initialEditorState(seedFromProfile(current.document, saved)) : current))
						}}
					/>

					<DocumentsPanel
						input={input}
						documentId={documentId}
						onOpen={(document, id) => {
							// Documento novo, pilha nova: desfazer não pode ressuscitar o anterior.
							setState(initialEditorState(document))
							setDocumentId(id)
						}}
						onNew={startNewDocument}
						onSaved={setDocumentId}
					/>
					{mode === "chat" ? (
						<ChatPanel
							document={input}
							documentId={documentId}
							changes={lastTurnChanges(state)}
							canUndo={state.turns.length > 0}
							onBeginTurn={() => setState(beginTurn)}
							onPatch={applyPatchFromChat}
							onUndo={() => setState(undoTurn)}
						/>
					) : (
						<>
							<ImportPanel
								input={input}
								onImported={(proposal) =>
									setState((current) => ({
										...current,
										// Identidade em branco: o conteúdo veio da minuta, o número do
										// expediente novo é do redator.
										document: {
											...applyProposal(current.document, proposal),
											numbering: { ...current.document.numbering, sequence: null },
											nup: "",
											derivedFromDraft: true,
										},
									}))
								}
							/>
							<AiPanel input={input} onApply={applyAiProposal} />
							<DocumentForm input={input} kind={kind} onChange={updateField} />
						</>
					)}
					<ExportPanel doc={doc} />
				</div>

				{/* A folha acompanha a rolagem do formulário: conferir o efeito de um campo
				    exige vê-lo, e no desktop há largura de sobra para os dois. */}
				<div className="overflow-x-auto xl:sticky xl:top-20">
					<A4Sheet doc={doc} highlight={touchedBlocks(state)} />
				</div>
			</div>
		</div>
	)
}

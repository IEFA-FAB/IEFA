import { useQuery } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, Eye, EyeClosed, FloppyDisk, Printer } from "iconoir-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { A4Sheet } from "@/components/comaer/A4Sheet"
import { AiPanel } from "@/components/comaer/AiPanel"
import { ChatPanel } from "@/components/comaer/ChatPanel"
import { DocumentForm } from "@/components/comaer/DocumentForm"
import { ExportPanel } from "@/components/comaer/ExportPanel"
import { ImportPanel } from "@/components/comaer/ImportPanel"
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
import { applyInlineEdit } from "@/lib/comaer/inline-edit"
import { applyProposal } from "@/lib/comaer/proposal"
import type { AiProposal } from "@/lib/comaer/schema"
import { toPayload } from "@/lib/comaer/schema"
import type { DocumentInput, EditTarget } from "@/lib/comaer/types"
import { seedFromProfile } from "@/lib/comaer/writer-profile"
import { saveDocumentFn } from "@/server/documents.fn"
import { loadWriterProfileFn } from "@/server/writer-profile.fn"

const PREVIEW_KEY = "iefa.comaer.preview"

/**
 * Editor de um documento.
 *
 * Documento SALVO chega pronto por `initialDocument`, vindo do loader da rota. Documento
 * novo começa do rascunho do navegador — é o que sobrevive a um F5 no meio da redação — e
 * ganha id ao ser salvo pela primeira vez, quando a rota passa a ser a dele.
 *
 * A saída principal é a área de transferência, não o papel: o despacho acontece no
 * SIGADAER. A impressão existe, mas é o caminho secundário.
 */
export function DocumentEditor({ documentId, initialDocument }: { documentId: string | null; initialDocument: DocumentInput | null }) {
	const navigate = useNavigate()
	const [state, setState] = useState<EditorState>(() => initialEditorState(initialDocument ?? newDocument()))
	const [restored, setRestored] = useState(Boolean(initialDocument))
	// Conversa é o modo primário: ela orienta, pergunta o que falta e explica a norma. O
	// formulário fica para o ajuste fino de quem já sabe onde mexer.
	const [mode, setMode] = useState<"form" | "chat">("chat")
	const [showPreview, setShowPreview] = useState(true)
	const [saving, setSaving] = useState(false)
	const [saveError, setSaveError] = useState<string | null>(null)

	const input = state.document
	const isDraft = documentId === null

	// `localStorage` só existe no cliente; ler no SSR entregaria HTML diferente do que o
	// navegador montaria.
	useEffect(() => {
		setShowPreview(localStorage.getItem(PREVIEW_KEY) !== "hidden")
	}, [])

	const togglePreview = () => {
		setShowPreview((visible) => {
			localStorage.setItem(PREVIEW_KEY, visible ? "hidden" : "visible")
			return !visible
		})
	}

	// O rascunho do navegador só vale para documento novo, e só é lido no cliente: ler no
	// SSR entregaria HTML diferente do que o navegador montaria e a hidratação descartaria
	// a árvore.
	useEffect(() => {
		if (!isDraft) return
		const saved = loadDraft()
		if (saved) setState(initialEditorState(saved))
		setRestored(true)
	}, [isDraft])

	useEffect(() => {
		if (isDraft && restored) saveDraft(input)
	}, [input, restored, isDraft])

	// Mesma query do painel de perfil — o React Query desduplica. Serve para o documento em
	// branco nascer preenchido já na primeira visita.
	const storedProfile = useQuery({ queryKey: ["writer-profile"], queryFn: () => loadWriterProfileFn() })
	useEffect(() => {
		const loaded = storedProfile.data
		if (!loaded || !isDraft || !restored) return
		setState((current) =>
			current.document.om.name.trim() === "" && current.document.signer.name.trim() === ""
				? initialEditorState(seedFromProfile(current.document, loaded))
				: current
		)
	}, [storedProfile.data, restored, isDraft])

	const kind = findKind(input.kind) ?? findKind("oficio-comaer")
	const doc = useMemo(() => (kind ? assembleDocument({ ...input, kind: kind.id }) : null), [input, kind])

	const updateField = (patch: Partial<DocumentInput>) => setState((current) => editDocument(current, patch))
	const applyAiProposal = (proposal: AiProposal) => setState((current) => ({ ...current, document: applyProposal(current.document, proposal) }))

	// Edição no próprio papel. Vale para os dois modos: trocar um número é correção que se
	// faz olhando o documento, não abrindo uma conversa.
	const editInSheet = (target: EditTarget, value: string) => setState((current) => editDocument(current, applyInlineEdit(current.document, target, value)))

	// `useCallback` porque o painel de conversa aplica remendos dentro de um efeito sobre as
	// mensagens: uma função nova a cada render reexecutaria o efeito e reaplicaria tudo.
	const applyPatchFromChat = useCallback((name: string, args: Record<string, unknown>) => setState((current) => applyChatPatch(current, name, args)), [])

	const save = async () => {
		setSaving(true)
		setSaveError(null)
		try {
			const { id } = await saveDocumentFn({ data: { id: documentId ?? undefined, payload: toPayload(input) } })
			// Primeira gravação: o rascunho do navegador vira documento com endereço próprio.
			if (isDraft) {
				clearDraft()
				await navigate({ to: "/facilities/comunicacoes-oficiais/$documentId", params: { documentId: id } })
			}
		} catch (error) {
			setSaveError(error instanceof Error ? error.message : "Falha ao salvar o documento.")
		} finally {
			setSaving(false)
		}
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
				<div className="min-w-0">
					<Button variant="ghost" size="sm" className="-ml-2 mb-2" nativeButton={false} render={<Link to="/facilities/comunicacoes-oficiais" />}>
						<ArrowLeft className="size-4" /> Meus documentos
					</Button>
					<EditableTitle value={input.subject ?? ""} onChange={(subject) => updateField({ subject })} />
					<p className="text-muted-foreground mt-1 text-sm">
						{kind.label} · <span className="font-mono text-xs">{kind.legalBasis}</span>
						{isDraft && " · não salvo"}
					</p>
				</div>
				<div className="flex gap-2">
					<Button type="button" variant="outline" size="sm" onClick={togglePreview} aria-pressed={!showPreview}>
						{showPreview ? <EyeClosed className="size-4" /> : <Eye className="size-4" />}
						{showPreview ? "Ocultar preview" : "Mostrar preview"}
					</Button>
					<Button type="button" size="sm" onClick={save} disabled={saving}>
						<FloppyDisk className="size-4" /> {saving ? "Salvando…" : isDraft ? "Salvar documento" : "Salvar alterações"}
					</Button>
					<Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
						<Printer className="size-4" /> Imprimir
					</Button>
				</div>
			</header>

			{saveError && <p className="text-sm text-destructive mb-4">{saveError}</p>}

			<div className={`grid grid-cols-1 gap-8 items-start ${showPreview ? "xl:grid-cols-[minmax(0,1fr)_auto]" : ""}`}>
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

				{/* A folha acompanha a rolagem: conferir o efeito de um campo exige vê-lo. Some
				    quando o redator pede — em tela estreita ela rouba a largura da conversa.
				    Oculta ela sai da TELA, não do DOM: a impressão é a própria folha, e
				    desmontá-la faria "Imprimir" sair em branco com o preview fechado. */}
				<div className={`overflow-x-auto xl:sticky xl:top-20 ${showPreview ? "" : "hidden print:block"}`}>
					<A4Sheet doc={doc} highlight={touchedBlocks(state)} onEdit={editInSheet} />
				</div>
			</div>
		</div>
	)
}

/**
 * Título do documento — que é o ASSUNTO da ementa (art. 37).
 *
 * Clicar e escrever, como em qualquer editor: antes ele era só um rótulo, e trocar o
 * assunto obrigava a descer até o formulário. Enter confirma, Escape descarta.
 */
function EditableTitle({ value, onChange }: { value: string; onChange: (value: string) => void }) {
	const [editing, setEditing] = useState(false)
	const [draft, setDraftValue] = useState(value)

	useEffect(() => {
		if (!editing) setDraftValue(value)
	}, [value, editing])

	if (!editing) {
		return (
			<button
				type="button"
				onClick={() => setEditing(true)}
				className="text-2xl md:text-3xl font-bold tracking-tight text-balance text-left hover:bg-accent px-1 -mx-1 max-w-full truncate"
				title="Clique para renomear"
			>
				{value.trim() || "Documento sem assunto"}
			</button>
		)
	}

	return (
		<input
			// biome-ignore lint/a11y/noAutofocus: o campo só existe depois do clique do usuário
			autoFocus
			value={draft}
			onChange={(e) => setDraftValue(e.target.value)}
			onBlur={() => {
				setEditing(false)
				if (draft !== value) onChange(draft)
			}}
			onKeyDown={(e) => {
				if (e.key === "Enter") e.currentTarget.blur()
				if (e.key === "Escape") {
					setDraftValue(value)
					setEditing(false)
				}
			}}
			aria-label="Assunto do documento"
			placeholder="Assunto do documento"
			className="text-2xl md:text-3xl font-bold tracking-tight bg-transparent border-b border-border outline-none w-full max-w-xl"
		/>
	)
}

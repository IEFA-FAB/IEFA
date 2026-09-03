import { useQuery } from "@tanstack/react-query"
import { Link, useBlocker, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, Eye, EyeClosed, FloppyDisk, Printer, WarningTriangle } from "iconoir-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { A4Sheet } from "@/components/comaer/A4Sheet"
import { ChatPanel } from "@/components/comaer/ChatPanel"
import { DocumentForm } from "@/components/comaer/DocumentForm"
import { ExportPanel } from "@/components/comaer/ExportPanel"
import { IdentityPanel } from "@/components/comaer/IdentityPanel"
import { ImportPanel } from "@/components/comaer/ImportPanel"
import { Button } from "@/components/ui/button"
import { assembleDocument } from "@/lib/comaer/assemble"
import { findKind } from "@/lib/comaer/catalog"
import { clearDraft, documentDraftKey, isDirty, loadDraft, newDocument, saveDraft } from "@/lib/comaer/draft"
import {
	applyChatPatch,
	beginTurn,
	canUndo as canUndoTurn,
	type EditorState,
	editDocument,
	initialEditorState,
	lastTurnChanges,
	touchedBlocks,
	undoTurn,
} from "@/lib/comaer/editor-state"
import { applyInlineEdit } from "@/lib/comaer/inline-edit"
import { applyProposal } from "@/lib/comaer/proposal"
import { toPayload } from "@/lib/comaer/schema"
import type { DocumentInput, EditTarget } from "@/lib/comaer/types"
import { seedFromProfile } from "@/lib/comaer/writer-profile"
import { saveDocumentFn } from "@/server/documents.fn"
import { loadWriterProfileFn } from "@/server/writer-profile.fn"

const SHEET_KEY = "iefa.comaer.sheet-visible"
const MODE_KEY = "iefa.comaer.editor-mode"

/**
 * Editor de um documento.
 *
 * Documento SALVO chega pronto por `initialDocument`, vindo do loader da rota. Documento
 * novo começa do rascunho do navegador e ganha id ao ser salvo pela primeira vez.
 *
 * A saída principal é a área de transferência, não o papel: o despacho acontece no
 * SIGADAER. A impressão existe, mas é o caminho secundário.
 */
export function DocumentEditor({
	documentId,
	initialDocument,
	startInImport = false,
}: {
	documentId: string | null
	initialDocument: DocumentInput | null
	/** Chegou pelo atalho "Partir de uma minuta": abre no formulário, com a importação. */
	startInImport?: boolean
}) {
	const navigate = useNavigate()
	const [state, setState] = useState<EditorState>(() => initialEditorState(initialDocument ?? newDocument()))
	const [restored, setRestored] = useState(Boolean(initialDocument))
	const [mode, setMode] = useState<"form" | "chat">("chat")
	const [showSheet, setShowSheet] = useState(true)
	const [saving, setSaving] = useState(false)
	const [saveError, setSaveError] = useState<string | null>(null)
	const [savedAt, setSavedAt] = useState<string | null>(null)
	const [streaming, setStreaming] = useState(false)
	/** Última versão gravada — base da comparação de "alterações não salvas". */
	const [baseline, setBaseline] = useState<DocumentInput | null>(initialDocument)

	const input = state.document
	const isDraft = documentId === null
	const draftKey = documentId ? documentDraftKey(documentId) : undefined

	// `localStorage` só existe no cliente; ler no SSR entregaria HTML diferente do que o
	// navegador montaria e a hidratação descartaria a árvore.
	useEffect(() => {
		setShowSheet(localStorage.getItem(SHEET_KEY) !== "hidden")
		const savedMode = localStorage.getItem(MODE_KEY)
		// Documento que já tem texto abre no formulário: quem volta a ele vai ajustar, não
		// redigir do zero.
		const hasBody = (initialDocument?.paragraphs ?? []).some((p) => p.text.trim() !== "")
		setMode(startInImport ? "form" : savedMode === "form" || savedMode === "chat" ? savedMode : hasBody ? "form" : "chat")
	}, [initialDocument, startInImport])

	// Rascunho local dos DOIS casos: o documento novo e o já salvo. Antes só o novo tinha
	// rede, e meia hora de reescrita num documento salvo vivia apenas em memória.
	useEffect(() => {
		if (isDraft) {
			const saved = loadDraft()
			if (saved) setState(initialEditorState(saved))
			setRestored(true)
			return
		}
		if (!draftKey) return
		const pending = loadDraft(draftKey)
		if (pending && initialDocument && isDirty(pending, initialDocument)) setState(initialEditorState(pending))
		setRestored(true)
	}, [isDraft, draftKey, initialDocument])

	useEffect(() => {
		if (!restored) return
		saveDraft(input, draftKey)
	}, [input, restored, draftKey])

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

	const dirty = isDraft ? false : isDirty(input, baseline)

	// Sair com alteração pendente perde o trabalho: o loader recarrega o payload do banco.
	useBlocker({
		shouldBlockFn: () => dirty && !window.confirm("Há alterações não salvas neste documento. Sair mesmo assim?"),
		enableBeforeUnload: () => dirty,
	})

	const updateField = (patch: Partial<DocumentInput>) => setState((current) => editDocument(current, patch))

	// `useCallback` porque o painel de conversa aplica remendos dentro de um efeito sobre as
	// mensagens: uma função nova a cada render reexecutaria o efeito e reaplicaria tudo.
	const applyPatchFromChat = useCallback((name: string, args: Record<string, unknown>) => setState((current) => applyChatPatch(current, name, args)), [])
	const handleStreaming = useCallback((value: boolean) => setStreaming(value), [])

	// Edição no próprio papel. Vale para os dois modos: trocar um número é correção que se
	// faz olhando o documento, não abrindo uma conversa.
	const editInSheet = (target: EditTarget, value: string) => setState((current) => editDocument(current, applyInlineEdit(current.document, target, value)))

	const save = useCallback(async () => {
		if (saving || streaming) return
		setSaving(true)
		setSaveError(null)
		try {
			const { id } = await saveDocumentFn({ data: { id: documentId ?? undefined, payload: toPayload(input) } })
			setBaseline(input)
			setSavedAt(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }))
			if (draftKey) clearDraft(draftKey)
			if (isDraft) {
				// Primeira gravação: o rascunho do navegador vira documento com endereço próprio.
				clearDraft()
				await navigate({ to: "/facilities/comunicacoes-oficiais/$documentId", params: { documentId: id } })
			}
		} catch (error) {
			setSaveError(
				error instanceof Error && /não encontrado/i.test(error.message)
					? "Este documento não está mais disponível para gravação."
					: "Não deu para salvar. O texto continua nesta tela — tente de novo; se persistir, copie o documento inteiro antes de fechar a aba."
			)
		} finally {
			setSaving(false)
		}
	}, [documentId, draftKey, input, isDraft, navigate, saving, streaming])

	// Ctrl/Cmd+S: o gesto que todo mundo já tem no dedo.
	const saveRef = useRef(save)
	saveRef.current = save
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
				e.preventDefault()
				void saveRef.current()
			}
		}
		window.addEventListener("keydown", onKey)
		return () => window.removeEventListener("keydown", onKey)
	}, [])

	const toggleSheet = () => {
		setShowSheet((visible) => {
			localStorage.setItem(SHEET_KEY, visible ? "hidden" : "visible")
			return !visible
		})
	}

	const chooseMode = (next: "form" | "chat") => {
		setMode(next)
		localStorage.setItem(MODE_KEY, next)
	}

	if (!kind || !doc) return null

	const nonCompliant = doc.warnings.filter((w) => w.severity === "nonCompliant").length
	const pendingCount = doc.warnings.length

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
						<ArrowLeft className="size-4" /> Comunicações Oficiais
					</Button>
					<h1 className="text-3xl md:text-4xl font-bold tracking-tight text-balance">
						<EditableTitle value={input.subject ?? ""} printed={kind.blocks.includes("ementa")} onChange={(subject) => updateField({ subject })} />
					</h1>
					<p className="text-muted-foreground mt-1 text-sm flex flex-wrap items-center gap-x-2">
						<span>{kind.label}</span>
						<span aria-hidden>·</span>
						<span className="font-mono text-xs">{kind.legalBasis}</span>
						{pendingCount > 0 && (
							<>
								<span aria-hidden>·</span>
								<a href="#conferencia" className={`inline-flex items-center gap-1 underline underline-offset-4 ${nonCompliant > 0 ? "text-destructive" : ""}`}>
									{nonCompliant > 0 && <WarningTriangle className="size-3.5" />}
									{pendingCount} {pendingCount === 1 ? "pendência" : "pendências"}
								</a>
							</>
						)}
					</p>
				</div>
				<div className="flex flex-wrap gap-2 items-center">
					<span className="text-label text-muted-foreground" role="status">
						{dirty ? "Alterações não salvas" : savedAt ? `Salvo às ${savedAt}` : isDraft ? "Ainda não salvo" : ""}
					</span>
					<Button type="button" variant="outline" size="sm" onClick={toggleSheet}>
						{showSheet ? <EyeClosed className="size-4" /> : <Eye className="size-4" />}
						{showSheet ? "Ocultar a folha" : "Mostrar a folha"}
					</Button>
					<Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
						<Printer className="size-4" /> Imprimir
					</Button>
					<Button
						type="button"
						size="sm"
						onClick={() => void save()}
						disabled={saving || streaming}
						title={streaming ? "Aguardando a redação assistida terminar" : "Ctrl+S"}
					>
						<FloppyDisk className="size-4" />
						{saving ? "Salvando…" : streaming ? "Aguardando a IA…" : isDraft ? "Salvar documento" : "Salvar alterações"}
					</Button>
				</div>
			</header>

			{saveError && (
				<p role="alert" className="text-sm text-destructive mb-4">
					{saveError}
				</p>
			)}

			<div className={`grid grid-cols-1 gap-8 items-start ${showSheet ? "lg:grid-cols-[minmax(0,1fr)_auto]" : ""}`}>
				<div className="flex flex-col gap-8 min-w-0">
					{/* A identidade do documento fica nos DOIS modos: a redação assistida pergunta
					    por ela e não pode preenchê-la. */}
					<IdentityPanel input={input} kind={kind} onChange={updateField} />

					<fieldset className="flex border border-border w-fit">
						<legend className="sr-only">Modo de edição</legend>
						{(["chat", "form"] as const).map((option) => (
							<button
								key={option}
								type="button"
								onClick={() => chooseMode(option)}
								aria-pressed={mode === option}
								className={`px-4 h-9 text-sm transition-colors ${mode === option ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
							>
								{option === "chat" ? "Redação assistida" : "Formulário"}
							</button>
						))}
					</fieldset>

					{mode === "chat" ? (
						<ChatPanel
							document={input}
							documentId={documentId}
							changes={lastTurnChanges(state)}
							canUndo={canUndoTurn(state)}
							onBeginTurn={() => setState(beginTurn)}
							onPatch={applyPatchFromChat}
							onUndo={() => setState(undoTurn)}
							onStreamingChange={handleStreaming}
						/>
					) : (
						<>
							{(startInImport || input.paragraphs.every((p) => p.text.trim() === "")) && (
								<ImportPanel
									input={input}
									onImported={(proposal) =>
										// Entra como TURNO: import e conversa passam a caber no mesmo desfazer.
										setState((current) => {
											const opened = beginTurn(current)
											return {
												document: {
													...applyProposal(opened.document, proposal),
													numbering: { ...opened.document.numbering, sequence: null },
													nup: "",
													derivedFromDraft: true,
												},
												turns: opened.turns.map((turn, i) =>
													i === opened.turns.length - 1 ? { ...turn, changes: turn.changes + 1, touched: ["ementa", "texto", "preambulo"] } : turn
												),
											}
										})
									}
								/>
							)}
							<DocumentForm input={input} kind={kind} onChange={updateField} />
						</>
					)}

					<div id="conferencia">
						<ExportPanel doc={doc} />
					</div>
				</div>

				{/* A folha acompanha a rolagem: conferir o efeito de um campo exige vê-lo. Oculta
				    ela sai da TELA, não do DOM: a impressão é a própria folha, e desmontá-la faria
				    "Imprimir" sair em branco com a folha fechada. */}
				<div className={`lg:sticky lg:top-20 flex flex-col gap-2 ${showSheet ? "" : "hidden print:block"}`}>
					{/* O atalho mais útil da ferramenta vivia só num `title=`: não existe em toque
					    e não é lido por quem varre a tela. */}
					<p className="text-xs text-muted-foreground max-w-[210mm]">
						Clique em qualquer linha da folha para corrigi-la aqui mesmo. Ctrl+Enter confirma, Esc descarta.
					</p>
					<div className="overflow-x-auto">
						<A4Sheet doc={doc} highlight={touchedBlocks(state)} onEdit={editInSheet} />
					</div>
				</div>
			</div>
		</div>
	)
}

/**
 * Título do documento.
 *
 * Nas espécies com ementa ele é o ASSUNTO (art. 37) e sai impresso. Nas demais — despacho,
 * ata, certidão, declaração… — a norma não tem ementa, e o campo serve só para achar o
 * documento na lista. Dizer isso evita a busca frustrada pelo assunto na folha.
 */
function EditableTitle({ value, printed, onChange }: { value: string; printed: boolean; onChange: (value: string) => void }) {
	const [editing, setEditing] = useState(false)
	const [draft, setDraftValue] = useState(value)
	const trigger = useRef<HTMLButtonElement>(null)

	useEffect(() => {
		if (!editing) setDraftValue(value)
	}, [value, editing])

	const finish = (commit: boolean) => {
		setEditing(false)
		if (commit && draft !== value) onChange(draft)
		trigger.current?.focus()
	}

	if (!editing) {
		return (
			<button
				ref={trigger}
				type="button"
				onClick={() => setEditing(true)}
				className="text-left hover:bg-accent px-1 -mx-1 max-w-full truncate"
				aria-label={`${value.trim() || "Documento sem assunto"} — ${printed ? "editar o assunto" : "renomear (não é impresso)"}`}
			>
				{value.trim() || (printed ? "Documento sem assunto" : "Documento sem nome")}
			</button>
		)
	}

	return (
		<input
			// biome-ignore lint/a11y/noAutofocus: o campo só existe depois do clique do usuário
			autoFocus
			value={draft}
			onChange={(e) => setDraftValue(e.target.value)}
			onBlur={() => finish(true)}
			onKeyDown={(e) => {
				if (e.key === "Enter") finish(true)
				if (e.key === "Escape") {
					setDraftValue(value)
					finish(false)
				}
			}}
			aria-label={printed ? "Assunto do documento" : "Nome do documento — só para localizá-lo na lista"}
			placeholder={printed ? "Assunto do documento" : "Nome do documento"}
			className="bg-transparent border-b border-border w-full max-w-xl"
		/>
	)
}

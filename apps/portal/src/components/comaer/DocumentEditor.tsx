import { useQuery } from "@tanstack/react-query"
import { Link, useBlocker, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, Eye, EyeClosed, FloppyDisk, Printer, Undo, WarningTriangle } from "iconoir-react"
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
import { clearDraft, documentDraftKey, hasContent, isDirty, loadDraft, newDocument, saveDraft } from "@/lib/comaer/draft"
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
/** Marca da criação, para a confirmação sobreviver ao remonte que a navegação provoca. */
const CREATED_KEY = "iefa.comaer.just-created"

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
	const keepAnonymousDraft = useRef(true)
	/** Abriu com alterações locais que nunca chegaram ao banco: a pessoa precisa poder recusá-las. */
	const [restoredFromDraft, setRestoredFromDraft] = useState(false)
	const [justCreated, setJustCreated] = useState(false)
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
		if (documentId && sessionStorage.getItem(CREATED_KEY) === documentId) {
			sessionStorage.removeItem(CREATED_KEY)
			setJustCreated(true)
		}
		setShowSheet(localStorage.getItem(SHEET_KEY) !== "hidden")
		const savedMode = localStorage.getItem(MODE_KEY)
		// Documento que já tem texto abre no formulário: quem volta a ele vai ajustar, não
		// redigir do zero.
		const hasBody = (initialDocument?.paragraphs ?? []).some((p) => p.text.trim() !== "")
		setMode(startInImport ? "form" : savedMode === "form" || savedMode === "chat" ? savedMode : hasBody ? "form" : "chat")
	}, [initialDocument, startInImport, documentId])

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
		if (pending && initialDocument && isDirty(pending, initialDocument)) {
			setState(initialEditorState(pending))
			setRestoredFromDraft(true)
		}
		setRestored(true)
	}, [isDraft, draftKey, initialDocument])

	// O rascunho local só nasce quando há o que salvar. Antes, abrir "Novo documento" e voltar
	// já deixava um documento fantasma na biblioteca, que a pessoa tinha de descartar sem
	// nunca ter digitado nada.
	useEffect(() => {
		if (!restored) return
		if (isDraft) {
			// Depois da primeira gravação o rascunho anônimo não volta: o efeito ainda roda uma
			// vez antes da navegação, e reescrevia o que `save()` acabou de limpar — a biblioteca
			// ficava com o documento salvo E um cartão "em edição, ainda sem salvar" idêntico.
			if (keepAnonymousDraft.current && hasContent(input)) saveDraft(input)
			return
		}
		// Documento salvo: guarda só o que DIVERGE do banco, e limpa quando volta a coincidir.
		// Gravar em toda abertura enchia o `localStorage` com cópias idênticas ao que já está
		// gravado, até a cota estourar e o rascunho parar de existir para quem precisa dele.
		if (!draftKey) return
		if (baseline && isDirty(input, baseline)) saveDraft(input, draftKey)
		else clearDraft(draftKey)
	}, [input, restored, draftKey, isDraft, baseline])

	// Mesma query do painel de perfil — o React Query desduplica. Serve para o documento em
	// branco nascer preenchido já na primeira visita.
	const storedProfile = useQuery({ queryKey: ["writer-profile"], queryFn: () => loadWriterProfileFn() })
	useEffect(() => {
		const loaded = storedProfile.data
		if (!loaded || !isDraft || !restored) return
		// `seedFromProfile` só preenche campo vazio, então dá para semear sem perguntar se o
		// documento foi tocado: nada do que já está escrito é substituído.
		setState((current) => initialEditorState(seedFromProfile(current.document, loaded)))
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
				// A rota remonta o editor e zeraria o "Salvo às…", justamente na gravação que mais
				// merece confirmação; a marca atravessa a navegação pela sessão.
				keepAnonymousDraft.current = false
				clearDraft()
				sessionStorage.setItem(CREATED_KEY, id)
				await navigate({ to: "/facilities/comunicacoes-oficiais/$documentId", params: { documentId: id } })
			}
		} catch (error) {
			setSaveError(
				error instanceof Error && /não encontrado/i.test(error.message)
					? "Este documento não está mais disponível para gravação."
					: "Não deu para salvar. O texto continua nesta tela: tente de novo; se persistir, copie o documento inteiro antes de fechar a aba."
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

	// A conferência separa "falta preencher" de "contraria a norma"; o contador do cabeçalho
	// chamava as duas coisas de "pendência" e desfazia a separação na única linha que a
	// pessoa lê antes de descer até lá.
	const nonCompliant = doc.warnings.filter((w) => w.severity === "nonCompliant").length
	const missing = doc.warnings.length - nonCompliant
	const checkLabel = [nonCompliant > 0 ? `${nonCompliant} a corrigir` : "", missing > 0 ? `${missing} a preencher` : ""].filter(Boolean).join(" · ")

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
					<h1 className="text-headline text-balance">
						<EditableTitle value={input.subject ?? ""} printed={kind.blocks.includes("ementa")} onChange={(subject) => updateField({ subject })} />
					</h1>
					<p className="text-muted-foreground mt-1 text-sm flex flex-wrap items-center gap-x-2">
						<span>{kind.label}</span>
						<span aria-hidden>·</span>
						<span className="font-mono text-xs">{kind.legalBasis}</span>
						{checkLabel && (
							<>
								<span aria-hidden>·</span>
								<a href="#conferencia" className={`inline-flex items-center gap-1 underline underline-offset-4 ${nonCompliant > 0 ? "text-destructive" : ""}`}>
									{nonCompliant > 0 && <WarningTriangle className="size-3.5" />}
									{checkLabel}
								</a>
							</>
						)}
					</p>
				</div>
				<div className="flex flex-wrap gap-2 items-center">
					<span className="text-label text-muted-foreground" role="status">
						{dirty ? "Alterações não salvas" : savedAt ? `Salvo às ${savedAt}` : justCreated ? "Documento criado" : isDraft ? "Ainda não salvo" : ""}
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

			{restoredFromDraft && (
				<div className="border border-border px-4 py-3 mb-4 flex flex-wrap items-center justify-between gap-3" role="status">
					<span className="text-sm">Este documento abriu com alterações que ficaram só neste navegador, de uma sessão anterior.</span>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => {
							if (!initialDocument) return
							if (draftKey) clearDraft(draftKey)
							setState(initialEditorState(initialDocument))
							setRestoredFromDraft(false)
						}}
					>
						Voltar à versão salva
					</Button>
				</div>
			)}

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

					{/* Contagem do turno e desfazer ficam FORA do painel de conversa: o import também
					    abre turno e acontece no formulário, e ali a volta atrás não existia. */}
					<div className="flex flex-wrap items-center gap-3 justify-between">
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

						<div className="flex items-center gap-3">
							{lastTurnChanges(state) > 0 && (
								<span className="text-label text-muted-foreground" role="status">
									{lastTurnChanges(state)} {lastTurnChanges(state) === 1 ? "alteração" : "alterações"} neste turno
								</span>
							)}
							{canUndoTurn(state) && (
								<Button type="button" variant="outline" size="sm" onClick={() => setState(undoTurn)}>
									<Undo className="size-4" /> Desfazer turno
								</Button>
							)}
						</div>
					</div>

					{state.rejectedPatch && (
						<p role="alert" className="text-sm text-destructive">
							A redação assistida tentou uma alteração que não cabe neste documento e ela foi recusada. O documento continua como estava; peça de novo, dizendo
							qual parágrafo alterar.
						</p>
					)}

					{mode === "chat" ? (
						<ChatPanel
							document={input}
							documentId={documentId}
							onBeginTurn={() => setState(beginTurn)}
							onPatch={applyPatchFromChat}
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

					{/* `tabIndex={-1}`: sem ele o link do cabeçalho rola a página e deixa o foco lá em cima,
					    e o Tab seguinte devolve quem usa teclado ao começo. */}
					<div id="conferencia" tabIndex={-1} className="scroll-mt-24 outline-hidden focus-visible:outline-2 focus-visible:outline-ring">
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
	// O botão está desmontado enquanto o campo existe: chamar `.focus()` dentro do `finish`
	// acerta um ref já nulo e o foco cai no `<body>`. Só depois do render ele volta a existir.
	const returnFocus = useRef(false)

	useEffect(() => {
		if (!editing) setDraftValue(value)
	}, [value, editing])

	useEffect(() => {
		if (editing || !returnFocus.current) return
		returnFocus.current = false
		trigger.current?.focus()
	}, [editing])

	// `restoreFocus` é falso no `blur`: ali o navegador já levou o foco para onde a pessoa
	// clicou, e devolvê-lo ao título arrancaria o cursor do campo seguinte.
	const finish = (commit: boolean, restoreFocus = true) => {
		returnFocus.current = restoreFocus
		setEditing(false)
		if (commit && draft !== value) onChange(draft)
	}

	if (!editing) {
		return (
			<button
				ref={trigger}
				type="button"
				onClick={() => setEditing(true)}
				className="text-left hover:bg-accent px-1 -mx-1 max-w-full truncate"
				aria-label={`${printed ? "Editar o assunto" : "Renomear (não é impresso)"}: ${value.trim() || "Documento sem assunto"}`}
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
			onBlur={() => finish(true, false)}
			onKeyDown={(e) => {
				// `preventDefault` porque o foco volta para o BOTÃO que abre este campo: sem ele o
				// mesmo Enter que confirma reabre a edição, e o título nunca fecha.
				if (e.key === "Enter") {
					e.preventDefault()
					finish(true)
				}
				if (e.key === "Escape") {
					e.preventDefault()
					setDraftValue(value)
					finish(false)
				}
			}}
			aria-label={printed ? "Assunto do documento" : "Nome do documento, só para localizá-lo na lista"}
			placeholder={printed ? "Assunto do documento" : "Nome do documento"}
			className="bg-transparent border-b border-border w-full max-w-xl"
		/>
	)
}

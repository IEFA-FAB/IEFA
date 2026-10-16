// UI & Icons
import { createFileRoute, useParams } from "@tanstack/react-router"
import { Camera, ClipboardList, RefreshCw, UserPlus } from "lucide-react"
import QrScanner from "qr-scanner"
import { useCallback, useEffect, useReducer, useRef, useState } from "react"
import Filters from "@/components/features/messhall/Filters"
import FiscalDialog from "@/components/features/messhall/FiscalDialog"
import PresenceTable from "@/components/features/messhall/PresenceTable"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/components/ui/toast"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useAuth } from "@/hooks/auth/useAuth"
import { useAddOtherPresence, useOtherPresencesCount, useScanProcessor } from "@/hooks/business/useFiscalOps"
import { usePresenceManagement } from "@/hooks/data/usePresenceManagement"
import { cn } from "@/lib/cn"
import {
	createScanCache,
	generateRestrictedDates,
	inferDefaultMeal,
	isPresenceRecorded,
	openScanDialogDefaults,
	type ScanCache,
	type ScanDialogOutcome,
	type ScanScope,
	settleClosedScan,
	toScanDialogOutcome,
} from "@/lib/fiscal"
import { resolveDisplayNameFn } from "@/server/messhall.fn"
import type { MealKey } from "@/types/domain/meal"
import type { DialogState, FiscalFilters, FiscalPresenceRecord } from "@/types/domain/presence"

export const Route = createFileRoute("/_protected/_modules/messhall/$messHallId/")({
	// Refeição e dia padrão saem do relógio LOCAL (`inferDefaultMeal`, `generateRestrictedDates`).
	// No SSR o relógio é o do servidor, em UTC: o HTML vinha com outra refeição e a hidratação
	// quebrava (React #418). A tela é o scanner da fiscalização — não ganha nada com SSR.
	ssr: false,
	component: PresencePage,
	head: () => ({
		meta: [{ name: "description", content: "Scanner QR e lista de presenças" }],
	}),
})

// Cache de nomes em memória (evita fetches repetidos por sessão)
const displayNameCache = new Map<string, string>()

async function resolveDisplayName(userId: string, messHallId: number): Promise<string | null> {
	if (!userId) return null
	const cached = displayNameCache.get(userId)
	if (cached) return cached

	const name = await resolveDisplayNameFn({ data: { userId, messHallId } })
	if (name) displayNameCache.set(userId, name)
	return name
}

const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

function extractUuid(payload: string): string | null {
	const match = payload.match(UUID_REGEX)
	return match ? match[0].toLowerCase() : null
}

// A câmera decodifica o mesmo crachá várias vezes por segundo: o cooldown segura a rajada entre
// leituras e o scanCache (por OM + data + refeição) impede reabrir o diálogo de quem já foi lido.
const SCAN_COOLDOWN_MS = 800

// O decodificador chama a cada frame: um erro persistente viraria um log por frame (e o Faro
// captura o console). Cada mensagem distinta sai uma vez por carga da página.
const loggedScanErrors = new Set<string>()

// "Nenhum QR no quadro" é o estado normal; o resto é falha real de decodificação.
function onScanFail(err: string | Error) {
	if (err === QrScanner.NO_QR_CODE_FOUND) return
	const message = String(err)
	if (loggedScanErrors.has(message)) return
	loggedScanErrors.add(message)
	// biome-ignore lint/suspicious/noConsole: intencional — falha de decodificação não tem outro canal
	console.error("[scanner] falha ao decodificar QR:", err)
}

interface ScannerState {
	isReady: boolean
	isScanning: boolean
	hasPermission: boolean
	error?: string
}

type ScannerAction =
	| { type: "INITIALIZE_SUCCESS"; hasPermission: boolean }
	| { type: "INITIALIZE_ERROR"; error: string }
	| { type: "TOGGLE_SCAN"; isScanning: boolean }
	| { type: "REFRESH" }

const scannerReducer = (state: ScannerState, action: ScannerAction): ScannerState => {
	switch (action.type) {
		case "INITIALIZE_SUCCESS":
			return {
				...state,
				isReady: true,
				isScanning: action.hasPermission,
				hasPermission: action.hasPermission,
				error: undefined,
			}
		case "INITIALIZE_ERROR":
			return {
				...state,
				isReady: true,
				isScanning: false,
				hasPermission: false,
				error: action.error,
			}
		case "TOGGLE_SCAN":
			return { ...state, isScanning: action.isScanning }
		case "REFRESH":
			return { ...state, isScanning: state.hasPermission, error: undefined }
		default:
			return state
	}
}

/* =====================================================================
   Tab: Scanner QR + Presença Anônima (MESSHALL-02 + MESSHALL-04)
   ===================================================================== */
function ScannerTab({ filters, onFiltersChange, scanCache }: { filters: FiscalFilters; onFiltersChange: (f: FiscalFilters) => void; scanCache: ScanCache }) {
	"use no memo"
	const scannerRef = useRef<QrScanner | null>(null)
	const videoRef = useRef<HTMLVideoElement>(null)
	const qrBoxRef = useRef<HTMLDivElement>(null)

	const [autoCloseDialog, setAutoCloseDialog] = useState(true)
	const [isProcessing, setIsProcessing] = useState(false)
	const [lastScanResult, setLastScanResult] = useState<string>("")

	const { user } = useAuth()
	const { processScan } = useScanProcessor()

	const isMountedRef = useRef(true)
	useEffect(() => {
		return () => {
			isMountedRef.current = false
		}
	}, [])

	const { data: othersCount } = useOtherPresencesCount(filters)
	const addOtherMutation = useAddOtherPresence()
	const { confirmPresence } = usePresenceManagement(filters)

	const lastScanAtRef = useRef(0)
	// Leitura do diálogo aberto: data, refeição e refeitório do instante do scan valem para a
	// previsão, a gravação e o cache, mesmo que o fiscal troque os filtros com o diálogo aberto.
	// `outcome` é o que a confirmação decidiu; `null` ao fechar = Cancelar/Esc.
	const openScanRef = useRef<{ scope: ScanScope; uuid: string; outcome: ScanDialogOutcome } | null>(null)

	const [scannerState, dispatch] = useReducer(scannerReducer, {
		isReady: false,
		isScanning: false,
		hasPermission: false,
	})

	const [dialog, setDialog] = useState<DialogState>({
		open: false,
		uuid: null,
		willEat: null,
		willEnter: "sim",
	})

	// Refs estáveis para callbacks do scanner (evita re-inicialização)
	const filtersRef = useRef(filters)
	useEffect(() => {
		filtersRef.current = filters
	}, [filters])

	const isProcessingRef = useRef(isProcessing)
	useEffect(() => {
		isProcessingRef.current = isProcessing
	}, [isProcessing])

	const processScanRef = useRef(processScan)
	useEffect(() => {
		processScanRef.current = processScan
	}, [processScan])

	const onScanSuccess = useCallback(
		(result: QrScanner.ScanResult) => {
			const raw = (result?.data || "").trim()
			if (!raw) return
			const uuid = extractUuid(raw)
			if (!uuid) return

			// Escopo da leitura: os filtros do instante do scan, não os de quando a resposta chegar.
			const scope = filtersRef.current
			const now = Date.now()
			if (now - lastScanAtRef.current < SCAN_COOLDOWN_MS) return
			if (scanCache.has(scope, uuid)) return
			if (isProcessingRef.current) return

			lastScanAtRef.current = now
			setIsProcessing(true)

			;(async () => {
				try {
					const { willEat } = await processScanRef.current(uuid, scope)
					if (!isMountedRef.current) return
					setLastScanResult(uuid)
					openScanRef.current = { scope, uuid, outcome: null }
					// Recusado ou cancelado antes nesta refeição: reabre com "Não" e só fecha com toque,
					// para o fechamento automático nunca gravar "Sim" sem o fiscal decidir de novo.
					setDialog({ open: true, uuid, willEat, ...openScanDialogDefaults(scanCache, scope, uuid) })
					if (isMountedRef.current) setIsProcessing(false)
				} catch (_err) {
					if (isMountedRef.current) toast.error("Erro", { description: "Falha ao processar QR." })
					if (isMountedRef.current) setIsProcessing(false)
				}
			})()
		},
		[scanCache]
	)

	useEffect(() => {
		let isCancelled = false
		const startScanner = async () => {
			if (!videoRef.current) return
			const overlay = qrBoxRef.current ?? undefined
			try {
				const hasPermission = await QrScanner.hasCamera()
				if (!hasPermission) {
					if (!isCancelled) dispatch({ type: "INITIALIZE_ERROR", error: "Permissão da câmera não concedida." })
					return
				}
				const scanner = new QrScanner(videoRef.current, onScanSuccess, {
					onDecodeError: onScanFail,
					preferredCamera: "environment",
					highlightScanRegion: true,
					highlightCodeOutline: true,
					overlay,
				})
				scannerRef.current = scanner
				await scanner.start()
				if (!isCancelled) dispatch({ type: "INITIALIZE_SUCCESS", hasPermission: true })
			} catch (err) {
				if (!isCancelled) dispatch({ type: "INITIALIZE_ERROR", error: String(err ?? "Erro desconhecido.") })
			}
		}
		startScanner()
		return () => {
			isCancelled = true
			scannerRef.current?.stop()
			scannerRef.current?.destroy()
			scannerRef.current = null
		}
	}, [onScanSuccess])

	const handleConfirmDialog = useCallback(async () => {
		const open = openScanRef.current
		if (!dialog.uuid || !open) return
		try {
			const { status } = await confirmPresence(dialog.uuid, dialog.willEnter === "sim", open.scope)
			// Só presença gravada neste refeitório entra no cache. "Não entra" e presença em outro
			// refeitório ficam lembrados como recusa (não há linha aqui para excluir, e a releitura
			// não pode se autoconfirmar).
			open.outcome = toScanDialogOutcome(status)
			if (isPresenceRecorded(status)) scanCache.mark(open.scope, open.uuid)
		} catch {
			// Não gravou: o crachá fica livre para nova leitura (o fechamento só dá a pausa curta).
			// O toast do motivo sai do onError da mutation.
			open.outcome = "unsaved"
		}
		if (isMountedRef.current) setDialog((d) => ({ ...d, open: false, uuid: null }))
	}, [confirmPresence, dialog.uuid, dialog.willEnter, scanCache])

	useEffect(() => {
		if (!dialog.open || !autoCloseDialog || !dialog.uuid || dialog.manual) return
		const timerId = setTimeout(() => {
			handleConfirmDialog()
		}, 3000)
		return () => clearTimeout(timerId)
	}, [dialog.open, dialog.uuid, dialog.manual, autoCloseDialog, handleConfirmDialog])

	useEffect(() => {
		const scanner = scannerRef.current
		if (!scanner) return
		if (dialog.open) {
			scanner.stop()
			return
		}
		// Diálogo fechado sem gravar: pausa curta para o crachá ainda parado na câmera não
		// reabrir o diálogo na hora; depois ele é lido de novo. Cancelar/Esc (outcome null) e
		// "não entra" ficam lembrados como recusa: a releitura exige toque.
		const closed = openScanRef.current
		if (closed) {
			settleClosedScan(scanCache, closed.scope, closed.uuid, closed.outcome)
			openScanRef.current = null
		}
		if (scannerState.hasPermission) {
			scanner.start().catch((_err) => {})
		}
	}, [dialog.open, scannerState.hasPermission, scanCache])

	const toggleScan = async () => {
		const scanner = scannerRef.current
		if (!scanner) return
		try {
			if (scannerState.isScanning) {
				await scanner.stop()
				dispatch({ type: "TOGGLE_SCAN", isScanning: false })
			} else {
				await scanner.start()
				dispatch({ type: "TOGGLE_SCAN", isScanning: true })
			}
		} catch (_err) {}
	}

	const refresh = async () => {
		const scanner = scannerRef.current
		if (!scanner) return
		try {
			await scanner.stop()
		} catch {}
		try {
			await scanner.start()
			dispatch({ type: "REFRESH" })
		} catch (_err) {}
	}

	const handleAddOtherPresence = async () => {
		if (!user?.id) {
			toast.error("Erro", { description: "Usuário não autenticado." })
			return
		}
		if (!filters.date || !filters.meal) {
			toast.error("Filtros incompletos", { description: "Selecione data e refeição." })
			return
		}
		try {
			await addOtherMutation.mutateAsync({ filters, adminId: user.id })
		} catch (_err) {}
	}

	return (
		<div className="space-y-4">
			{/* Seleção de data/refeição — sem seletor de OM (vem da URL) */}
			<div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
				<Filters
					selectedDate={filters.date}
					setSelectedDate={(d: string) => onFiltersChange({ ...filters, date: d })}
					selectedMeal={filters.meal}
					setSelectedMeal={(m: MealKey) => onFiltersChange({ ...filters, meal: m })}
					dates={generateRestrictedDates()}
				/>

				<div className="w-full sm:w-auto flex flex-wrap items-center gap-2 sm:justify-end">
					<div className="flex items-center gap-2 shrink-0">
						<Switch id="autoClose" checked={autoCloseDialog} onCheckedChange={setAutoCloseDialog} />
						<Label htmlFor="autoClose" className="whitespace-nowrap">
							{autoCloseDialog ? "Fechar Auto." : "Fechar Manual"}
						</Label>
					</div>

					<Button variant="outline" size="sm" onClick={toggleScan} disabled={!scannerState.hasPermission} className="shrink-0">
						<Camera className="size-4 mr-2" />
						{scannerState.isScanning ? "Pausar" : "Ler"}
					</Button>

					<Tooltip>
						<TooltipTrigger
							render={
								<Button variant="outline" size="sm" onClick={refresh} disabled={!scannerState.hasPermission} aria-label="Reiniciar câmera" className="shrink-0">
									<RefreshCw className={cn("size-4", scannerState.isScanning && "animate-spin")} />
								</Button>
							}
						/>
						<TooltipContent>Reiniciar câmera</TooltipContent>
					</Tooltip>

					{lastScanResult && (
						<Button variant="secondary" size="sm" onClick={() => setLastScanResult("")} className="shrink-0">
							Limpar
						</Button>
					)}

					{/* MESSHALL-04: +1 Outro */}
					<Button variant="default" size="sm" onClick={handleAddOtherPresence} disabled={addOtherMutation.isPending} className="shrink-0">
						<UserPlus className="size-4 mr-2" />
						Outros {othersCount ? `(${othersCount})` : ""}
					</Button>
				</div>
			</div>

			{/* Leitor de QR (MESSHALL-02) */}
			<div className="qr-reader relative rounded-lg overflow-hidden bg-muted">
				{/** biome-ignore lint/a11y/useMediaCaption: QR Code reader */}
				<video ref={videoRef} className="w-full h-auto object-cover" />
				{!scannerState.hasPermission && scannerState.isReady && (
					<div className="mt-3 text-center p-4 text-sm text-muted-foreground">{scannerState.error || "Câmera não disponível."}</div>
				)}
				<div ref={qrBoxRef} className="qr-box pointer-events-none" />
				{lastScanResult && (
					<p className="absolute top-2 left-2 z-50 rounded px-2 py-1 bg-accent/90 text-accent-foreground text-xs">Último UUID: {lastScanResult}</p>
				)}
			</div>

			<FiscalDialog
				setDialog={setDialog}
				dialog={dialog}
				confirmDialog={handleConfirmDialog}
				resolveDisplayName={(userId) => resolveDisplayName(userId, filters.messHallId)}
			/>
		</div>
	)
}

/* =====================================================================
   Tab: Lista de Presenças em Tempo Real (MESSHALL-03)
   ===================================================================== */
function AttendanceTab({ filters, onFiltersChange, scanCache }: { filters: FiscalFilters; onFiltersChange: (f: FiscalFilters) => void; scanCache: ScanCache }) {
	const { presences, arranchamentoMap, removePresence: deletePresence } = usePresenceManagement(filters)

	// Presença excluída libera o militar para ser lido de novo nesta refeição; sem isto o
	// scanner ignoraria o QR dele até sair da página.
	const removePresence = async (row: FiscalPresenceRecord) => {
		try {
			await deletePresence(row)
			// O escopo vem da própria linha. `meal` é texto no tipo gerado; quem grava (fiscal e
			// self check-in) só manda MealKey, então o cast casa com a chave que o scanner marcou.
			scanCache.forget({ date: row.date, meal: row.meal as MealKey, messHallId: row.mess_hall_id }, row.user_id)
		} catch {
			// O toast de falha já sai do onError da mutation; o militar continua presente.
		}
	}

	return (
		<div className="space-y-4">
			<Filters
				selectedDate={filters.date}
				setSelectedDate={(d: string) => onFiltersChange({ ...filters, date: d })}
				selectedMeal={filters.meal}
				setSelectedMeal={(m: MealKey) => onFiltersChange({ ...filters, meal: m })}
				dates={generateRestrictedDates()}
			/>

			<PresenceTable
				selectedDate={filters.date}
				selectedMeal={filters.meal}
				presences={presences}
				arranchamentoMap={arranchamentoMap}
				actions={{ removePresence }}
			/>
		</div>
	)
}

/* =====================================================================
   Componente principal — orquestra as duas tabs
   ===================================================================== */
function PresencePage() {
	"use no memo"
	const { messHallId: messHallIdParam } = useParams({
		from: "/_protected/_modules/messhall/$messHallId/",
	})
	const messHallId = Number(messHallIdParam)

	const dates = generateRestrictedDates()
	const defaultMeal = inferDefaultMeal()

	// Estado de filtros compartilhado entre as tabs (sem seletor de OM — vem da URL)
	const [filters, setFilters] = useState<FiscalFilters>({
		date: dates[1],
		meal: defaultMeal,
		messHallId,
	})

	// Sincroniza messHallId quando o param muda (navegação entre escopos)
	if (filters.messHallId !== messHallId) {
		setFilters((f) => ({ ...f, messHallId }))
	}

	// Aqui, e não no ScannerTab: as abas desmontam ao trocar, e a exclusão na lista precisa
	// liberar o UUID no mesmo cache que o scanner consulta.
	const [scanCache] = useState(createScanCache)

	return (
		<div className="space-y-6">
			<PageHeader title="Presenças" />

			<Tabs defaultValue="scanner" className="w-full">
				<TabsList className="mb-4">
					<TabsTrigger value="scanner" className="gap-2">
						<Camera className="size-4" />
						Scanner QR
					</TabsTrigger>
					<TabsTrigger value="attendance" className="gap-2">
						<ClipboardList className="size-4" />
						Lista de Presenças
					</TabsTrigger>
				</TabsList>

				<TabsContent value="scanner">
					<ScannerTab filters={filters} onFiltersChange={setFilters} scanCache={scanCache} />
				</TabsContent>

				<TabsContent value="attendance">
					<AttendanceTab filters={filters} onFiltersChange={setFilters} scanCache={scanCache} />
				</TabsContent>
			</Tabs>
		</div>
	)
}

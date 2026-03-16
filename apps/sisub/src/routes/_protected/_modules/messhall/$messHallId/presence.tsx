// UI & Icons
import { createFileRoute, useParams } from "@tanstack/react-router"
import { Camera, ClipboardList, RefreshCw, UserPlus } from "lucide-react"
import QrScanner from "qr-scanner"
import { useCallback, useEffect, useReducer, useRef, useState } from "react"
import { toast } from "sonner"
import { PageHeader } from "@/components/common/layout/PageHeader"
import Filters from "@/components/features/messhall/Filters"
import FiscalDialog from "@/components/features/messhall/FiscalDialog"
import PresenceTable from "@/components/features/messhall/PresenceTable"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/hooks/auth/useAuth"
import { useAddOtherPresence, useOtherPresencesCount, useScanProcessor } from "@/hooks/business/useFiscalOps"
import { usePresenceManagement } from "@/hooks/data/usePresenceManagement"
import { generateRestrictedDates, inferDefaultMeal } from "@/lib/fiscal"
import { cn } from "@/lib/utils"
import { resolveDisplayNameFn } from "@/server/messhall.fn"
import type { MealKey } from "@/types/domain/meal"
import type { DialogState, FiscalFilters } from "@/types/domain/presence"

export const Route = createFileRoute("/_protected/_modules/messhall/$messHallId/presence")({
	component: PresencePage,
	head: () => ({
		meta: [{ title: "Fiscalização - SISUB" }, { name: "description", content: "Scanner QR e lista de presenças" }],
	}),
})

// Cache de nomes em memória (evita fetches repetidos por sessão)
const displayNameCache = new Map<string, string>()

async function resolveDisplayName(userId: string): Promise<string | null> {
	if (!userId) return null
	const cached = displayNameCache.get(userId)
	if (cached) return cached

	const name = await resolveDisplayNameFn({ data: { userId } })
	if (name) displayNameCache.set(userId, name)
	return name
}

const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

function extractUuid(payload: string): string | null {
	const match = payload.match(UUID_REGEX)
	return match ? match[0].toLowerCase() : null
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
function ScannerTab({ filters, onFiltersChange }: { filters: FiscalFilters; onFiltersChange: (f: FiscalFilters) => void }) {
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

	// Cooldown + LRU cache
	const COOLDOWN_MS = 800
	const MAX_CACHE = 300
	const lastScanAtRef = useRef(0)
	const recentlyScannedRef = useRef(new Set<string>())
	const scannedQueueRef = useRef<string[]>([])

	const markScanned = useCallback((uuid: string) => {
		const set = recentlyScannedRef.current
		const queue = scannedQueueRef.current
		if (!set.has(uuid)) {
			set.add(uuid)
			queue.push(uuid)
			if (queue.length > MAX_CACHE) {
				const oldest = queue.shift()
				if (oldest) set.delete(oldest)
			}
		}
	}, [])

	const [scannerState, dispatch] = useReducer(scannerReducer, {
		isReady: false,
		isScanning: false,
		hasPermission: false,
	})

	const [dialog, setDialog] = useState<DialogState>({
		open: false,
		uuid: null,
		systemForecast: null,
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

	const markScannedRef = useRef(markScanned)
	useEffect(() => {
		markScannedRef.current = markScanned
	}, [markScanned])

	const onScanSuccess = useCallback((result: QrScanner.ScanResult) => {
		"use no memo"
		const raw = (result?.data || "").trim()
		if (!raw) return
		const uuid = extractUuid(raw)
		if (!uuid) return

		const now = Date.now()
		if (now - lastScanAtRef.current < COOLDOWN_MS) return
		if (recentlyScannedRef.current.has(uuid)) return
		if (isProcessingRef.current) return

		lastScanAtRef.current = now
		setIsProcessing(true)

		;(async () => {
			"use no memo"
			try {
				const { systemForecast } = await processScanRef.current(uuid, filtersRef.current)
				if (!isMountedRef.current) return
				setLastScanResult(uuid)
				setDialog({ open: true, uuid, systemForecast, willEnter: "sim" })
				markScannedRef.current(uuid)
				if (isMountedRef.current) setIsProcessing(false)
			} catch (err) {
				console.error("Erro ao preparar diálogo:", err)
				if (isMountedRef.current) toast.error("Erro", { description: "Falha ao processar QR." })
				if (isMountedRef.current) setIsProcessing(false)
			}
		})()
	}, [])

	const onScanFail = useCallback((err: string | Error) => {
		if (String(err) !== "No QR code found") console.warn("QR Scan Error:", err)
	}, [])

	useEffect(() => {
		let isCancelled = false
		const startScanner = async () => {
			"use no memo"
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
				console.error("Erro ao iniciar scanner:", err)
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
	}, [onScanFail, onScanSuccess])

	const handleConfirmDialog = useCallback(async () => {
		"use no memo"
		if (!dialog.uuid) return
		try {
			await confirmPresence(dialog.uuid, dialog.willEnter === "sim")
			if (isMountedRef.current) setDialog((d) => ({ ...d, open: false, uuid: null }))
		} catch (err) {
			console.error("Falha ao confirmar presença:", err)
			if (isMountedRef.current) setDialog((d) => ({ ...d, open: false, uuid: null }))
		}
	}, [confirmPresence, dialog.uuid, dialog.willEnter])

	useEffect(() => {
		if (!dialog.open || !autoCloseDialog || !dialog.uuid) return
		const timerId = setTimeout(() => {
			handleConfirmDialog()
		}, 3000)
		return () => clearTimeout(timerId)
	}, [dialog.open, dialog.uuid, autoCloseDialog, handleConfirmDialog])

	useEffect(() => {
		const scanner = scannerRef.current
		if (!scanner) return
		if (dialog.open) {
			scanner.stop()
		} else if (scannerState.hasPermission) {
			scanner.start().catch((err) => console.error("Erro ao retomar scanner:", err))
		}
	}, [dialog.open, scannerState.hasPermission])

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
		} catch (err) {
			console.error("Erro ao alternar scanner:", err)
		}
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
		} catch (err) {
			console.error("Erro no refresh do scanner:", err)
		}
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
		} catch (err) {
			console.error("Erro ao adicionar presença anônima:", err)
		}
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
						<Camera className="h-4 w-4 mr-2" />
						{scannerState.isScanning ? "Pausar" : "Ler"}
					</Button>

					<Button variant="outline" size="sm" onClick={refresh} disabled={!scannerState.hasPermission} className="shrink-0">
						<RefreshCw className={cn("h-4 w-4", scannerState.isScanning && "animate-spin")} />
					</Button>

					{lastScanResult && (
						<Button variant="secondary" size="sm" onClick={() => setLastScanResult("")} className="shrink-0">
							Limpar
						</Button>
					)}

					{/* MESSHALL-04: +1 Outro */}
					<Button variant="default" size="sm" onClick={handleAddOtherPresence} disabled={addOtherMutation.isPending} className="shrink-0">
						<UserPlus className="h-4 w-4 mr-2" />
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

			<FiscalDialog setDialog={setDialog} dialog={dialog} confirmDialog={handleConfirmDialog} resolveDisplayName={resolveDisplayName} />
		</div>
	)
}

/* =====================================================================
   Tab: Lista de Presenças em Tempo Real (MESSHALL-03)
   ===================================================================== */
function AttendanceTab({ filters, onFiltersChange }: { filters: FiscalFilters; onFiltersChange: (f: FiscalFilters) => void }) {
	const { presences, forecastMap, removePresence } = usePresenceManagement(filters)

	return (
		<div className="space-y-4">
			<Filters
				selectedDate={filters.date}
				setSelectedDate={(d: string) => onFiltersChange({ ...filters, date: d })}
				selectedMeal={filters.meal}
				setSelectedMeal={(m: MealKey) => onFiltersChange({ ...filters, meal: m })}
				dates={generateRestrictedDates()}
			/>

			<PresenceTable selectedDate={filters.date} selectedMeal={filters.meal} presences={presences} forecastMap={forecastMap} actions={{ removePresence }} />
		</div>
	)
}

/* =====================================================================
   Componente principal — orquestra as duas tabs
   ===================================================================== */
function PresencePage() {
	"use no memo"
	const { messHallId: messHallIdParam } = useParams({
		from: "/_protected/_modules/messhall/$messHallId/presence",
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

	return (
		<div className="space-y-6">
			<PageHeader title="Fiscalização" />

			<Tabs defaultValue="scanner" className="w-full">
				<TabsList className="mb-4">
					<TabsTrigger value="scanner" className="gap-2">
						<Camera className="h-4 w-4" />
						Scanner QR
					</TabsTrigger>
					<TabsTrigger value="attendance" className="gap-2">
						<ClipboardList className="h-4 w-4" />
						Lista de Presenças
					</TabsTrigger>
				</TabsList>

				<TabsContent value="scanner">
					<ScannerTab filters={filters} onFiltersChange={setFilters} />
				</TabsContent>

				<TabsContent value="attendance">
					<AttendanceTab filters={filters} onFiltersChange={setFilters} />
				</TabsContent>
			</Tabs>
		</div>
	)
}

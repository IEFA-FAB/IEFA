// UI & Icons
import { Button, Label, Switch } from "@iefa/ui";
import { createFileRoute } from "@tanstack/react-router";
import { Camera, RefreshCw, UserPlus } from "lucide-react";
import QrScanner from "qr-scanner";
import { useEffect, useReducer, useRef, useState } from "react";
import { toast } from "sonner";
import Filters from "@/components/features/forecast/Filters";
import FiscalDialog from "@/components/features/presence/FiscalDialog";
import PresenceTable from "@/components/features/presence/PresenceTable";
import { useAuth } from "@/hooks/auth/useAuth";
import {
	useAddOtherPresence,
	useOtherPresencesCount,
	useScanProcessor,
} from "@/hooks/business/useFiscalOps";
import { usePresenceManagement } from "@/hooks/data/usePresenceManagement";
import type { DialogState, FiscalFilters, MealKey } from "@/types/domain";
import { generateRestrictedDates, inferDefaultMeal } from "@/lib/fiscal";
import supabase from "@/lib/supabase";

export const Route = createFileRoute("/_protected/presence")({
	component: Qr,
	head: () => ({
		meta: [
			{ title: "Fiscalização - Leitor de QR" },
			{
				name: "description",
				content: "Fiscalize a refeição escaneando o QR do militar",
			},
		],
	}),
});

// Cache for display names to avoid repeated fetch
const displayNameCache = new Map<string, string>();

async function resolveDisplayName(userId: string): Promise<string | null> {
	if (!userId) return null;

	const cached = displayNameCache.get(userId);
	if (cached) return cached;

	const { data, error } = await supabase
		.schema("sisub")
		.from("v_user_identity")
		.select("display_name")
		.eq("id", userId)
		.maybeSingle();

	if (error) {
		console.warn("Falha ao buscar display_name:", error);
		return null;
	}

	const name = data?.display_name?.trim() || null;
	if (name) displayNameCache.set(userId, name);
	return name;
}

// ===== Regex de UUID e helper de extração =====
const UUID_REGEX =
	/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;

function extractUuid(payload: string): string | null {
	if (!payload) return null;
	const match = payload.match(UUID_REGEX);
	return match ? match[0].toLowerCase() : null;
}

// Tipos de estado e ação para o scanner
interface ScannerState {
	isReady: boolean;
	isScanning: boolean;
	hasPermission: boolean;
	error?: string;
}

type ScannerAction =
	| { type: "INITIALIZE_SUCCESS"; hasPermission: boolean }
	| { type: "INITIALIZE_ERROR"; error: string }
	| { type: "TOGGLE_SCAN"; isScanning: boolean }
	| { type: "REFRESH" };

const scannerReducer = (
	state: ScannerState,
	action: ScannerAction,
): ScannerState => {
	switch (action.type) {
		case "INITIALIZE_SUCCESS":
			return {
				...state,
				isReady: true,
				isScanning: action.hasPermission,
				hasPermission: action.hasPermission,
				error: undefined,
			};
		case "INITIALIZE_ERROR":
			return {
				...state,
				isReady: true,
				isScanning: false,
				hasPermission: false,
				error: action.error,
			};
		case "TOGGLE_SCAN":
			return { ...state, isScanning: action.isScanning };
		case "REFRESH":
			return { ...state, isScanning: state.hasPermission, error: undefined };
		default:
			return state;
	}
};

function Qr() {
	const scannerRef = useRef<QrScanner | null>(null);
	const videoRef = useRef<HTMLVideoElement>(null);
	const qrBoxRef = useRef<HTMLDivElement>(null);

	// No explicit types needed for useState where inferred
	const [autoCloseDialog, setAutoCloseDialog] = useState(true);
	const [isProcessing, setIsProcessing] = useState(false);

	// Removed useMemo for dates and meal - React Compiler handles this
	const dates = generateRestrictedDates();
	const defaultMeal = inferDefaultMeal();

	const { user } = useAuth();
	const { processScan } = useScanProcessor();

	// Mantém controle de montagem para evitar setState após unmount
	const isMountedRef = useRef(true);
	useEffect(() => {
		return () => {
			isMountedRef.current = false;
		};
	}, []);

	const [filters, setFilters] = useState<FiscalFilters>({
		date: dates[1],
		meal: defaultMeal,
		unit: "DIRAD - DIRAD",
	});

	// Queries & Mutations
	const { data: othersCount } = useOtherPresencesCount(filters);
	const addOtherMutation = useAddOtherPresence();
	const { presences, forecastMap, confirmPresence, removePresence } =
		usePresenceManagement(filters);

	// Cooldown + cache de UUIDs (LRU simples)
	const COOLDOWN_MS = 800;
	const MAX_CACHE = 300;
	const lastScanAtRef = useRef(0);
	const recentlyScannedRef = useRef<Set<string>>(new Set());
	const scannedQueueRef = useRef<string[]>([]); // LRU

	// Removed useCallback - React Compiler handles this
	const markScanned = (uuid: string) => {
		const set = recentlyScannedRef.current;
		const queue = scannedQueueRef.current;
		if (!set.has(uuid)) {
			set.add(uuid);
			queue.push(uuid);
			if (queue.length > MAX_CACHE) {
				const oldest = queue.shift();
				if (oldest) set.delete(oldest);
			}
		}
	};

	const initialState: ScannerState = {
		isReady: false,
		isScanning: false,
		hasPermission: false,
	};

	const [scannerState, dispatch] = useReducer(scannerReducer, initialState);
	const [lastScanResult, setLastScanResult] = useState<string>("");

	const [dialog, setDialog] = useState<DialogState>({
		open: false,
		uuid: null,
		systemForecast: null,
		willEnter: "sim",
	});

	const handleAddOtherPresence = async () => {
		if (!user?.id) {
			toast.error("Erro", { description: "Usuário não autenticado." });
			return;
		}

		if (!filters.date || !filters.meal || !filters.unit) {
			toast.error("Filtros incompletos", {
				description: "Selecione data, refeição e unidade.",
			});
			return;
		}

		try {
			await addOtherMutation.mutateAsync({
				filters,
				adminId: user.id,
			});
		} catch {}
	};

	const onScanSuccess = async (result: QrScanner.ScanResult) => {
		const raw = (result?.data || "").trim();
		if (!raw) return;

		const uuid = extractUuid(raw);
		if (!uuid) return;

		const now = Date.now();
		if (now - lastScanAtRef.current < COOLDOWN_MS) return;
		if (recentlyScannedRef.current.has(uuid)) return;
		if (isProcessing) return;

		lastScanAtRef.current = now;
		setIsProcessing(true);

		try {
			await scannerRef.current?.stop();
		} catch {}

		try {
			const { systemForecast } = await processScan(uuid, filters);

			if (!isMountedRef.current) return;

			setLastScanResult(uuid);
			setDialog({
				open: true,
				uuid,
				systemForecast,
				willEnter: "sim",
			});

			markScanned(uuid);
		} catch (err) {
			console.error("Erro ao preparar diálogo:", err);
			if (isMountedRef.current) {
				toast.error("Erro", { description: "Falha ao processar QR." });
			}
		} finally {
			if (isMountedRef.current) {
				setIsProcessing(false);
			}
		}
	};

	const onScanFail = (err: string | Error) => {
		if (String(err) !== "No QR code found") {
			console.warn("QR Scan Error:", err);
		}
	};

	// Scanner initialization
	useEffect(() => {
		let isCancelled = false;

		const startScanner = async () => {
			if (!videoRef.current) return;

			try {
				const hasPermission = await QrScanner.hasCamera();
				if (!hasPermission) {
					if (!isCancelled) {
						dispatch({
							type: "INITIALIZE_ERROR",
							error: "Permissão da câmera não concedida.",
						});
					}
					return;
				}

				const scanner = new QrScanner(
					videoRef.current,
					(result) => onScanSuccess(result),
					{
						onDecodeError: (err) => onScanFail(err),
						preferredCamera: "environment",
						highlightScanRegion: true,
						highlightCodeOutline: true,
						overlay: qrBoxRef.current ?? undefined,
					},
				);
				scannerRef.current = scanner;

				await scanner.start();
				if (!isCancelled) {
					dispatch({ type: "INITIALIZE_SUCCESS", hasPermission: true });
				}
			} catch (err) {
				console.error("Erro ao iniciar o scanner:", err);
				if (!isCancelled) {
					dispatch({
						type: "INITIALIZE_ERROR",
						error: String(err ?? "Erro desconhecido ao iniciar a câmera."),
					});
				}
			}
		};

		startScanner();

		return () => {
			isCancelled = true;
			scannerRef.current?.stop();
			scannerRef.current?.destroy();
			scannerRef.current = null;
		};
	}, []); // Removed deps as function stability is handled by compiler and scope

	// Função de confirmação do diálogo
	const handleConfirmDialog = async () => {
		if (!dialog.uuid) return;
		try {
			await confirmPresence(dialog.uuid, dialog.willEnter === "sim");
		} catch (err) {
			console.error("Falha ao confirmar presença:", err);
		} finally {
			if (isMountedRef.current) {
				setDialog((d) => ({ ...d, open: false, uuid: null }));
			}
		}
	};

	// Auto-close dialog
	useEffect(() => {
		if (!dialog.open || !autoCloseDialog || !dialog.uuid) return;

		const timerId = setTimeout(() => {
			handleConfirmDialog();
		}, 3000);
		return () => clearTimeout(timerId);
	}, [dialog.open, dialog.uuid, autoCloseDialog]); // Handlers are stable

	// Pausar/retomar scanner quando o diálogo abre/fecha
	useEffect(() => {
		const scanner = scannerRef.current;
		if (!scanner) return;

		if (dialog.open) {
			scanner.stop();
		} else if (scannerState.hasPermission) {
			scanner.start().catch((err) => {
				console.error("Erro ao iniciar scanner:", err);
			});
		}
	}, [dialog.open, scannerState.hasPermission]);

	const toggleScan = async () => {
		const scanner = scannerRef.current;
		if (!scanner) return;

		try {
			if (scannerState.isScanning) {
				await scanner.stop();
				dispatch({ type: "TOGGLE_SCAN", isScanning: false });
			} else {
				await scanner.start();
				dispatch({ type: "TOGGLE_SCAN", isScanning: true });
			}
		} catch (err) {
			console.error("Erro ao alternar scanner:", err);
		}
	};

	const refresh = async () => {
		const scanner = scannerRef.current;
		if (!scanner) return;
		try {
			await scanner.stop();
		} catch {}
		try {
			await scanner.start();
			dispatch({ type: "REFRESH" });
		} catch (err) {
			console.error("Erro no refresh do scanner:", err);
		}
	};

	const clearResult = () => setLastScanResult("");

	const actions = {
		toggleScan,
		refresh,
		clearResult,
		removePresence,
	};

	return (
		<div className="h-full w-full mx-auto flex-col px-4 sm:px-6 md:px-8 py-4 sm:py-6 space-y-6">
			<div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
				<Filters
					selectedDate={filters.date}
					setSelectedDate={(newDate: string) =>
						setFilters((f) => ({ ...f, date: newDate }))
					}
					selectedMeal={filters.meal}
					setSelectedMeal={(newMeal: MealKey) =>
						setFilters((f) => ({ ...f, meal: newMeal }))
					}
					selectedUnit={filters.unit}
					setSelectedUnit={(newUnit: string) =>
						setFilters((f) => ({ ...f, unit: newUnit }))
					}
					dates={dates}
				/>
				<div className="w-full sm:w-auto flex flex-wrap items-center gap-2 sm:justify-end">
					<div className="flex items-center gap-2 shrink-0">
						<Switch
							id="autoClose"
							checked={autoCloseDialog}
							onCheckedChange={setAutoCloseDialog}
						/>
						<Label htmlFor="autoClose" className="whitespace-nowrap">
							{autoCloseDialog ? "Fechar Auto." : "Fechar Manual"}
						</Label>
					</div>

					<Button
						variant="outline"
						size="sm"
						onClick={actions.toggleScan}
						disabled={!scannerState.hasPermission}
						className="shrink-0"
					>
						<Camera className="h-4 w-4 mr-2" />
						{scannerState.isScanning ? "Pausar" : "Ler"}
					</Button>

					<Button
						variant="outline"
						size="sm"
						onClick={actions.refresh}
						disabled={!scannerState.hasPermission}
						className="shrink-0"
					>
						<RefreshCw
							className={`h-4 w-4 ${scannerState.isScanning ? "animate-spin" : ""}`}
						/>
					</Button>

					{lastScanResult && (
						<Button
							variant="secondary"
							size="sm"
							onClick={actions.clearResult}
							className="shrink-0"
						>
							Limpar
						</Button>
					)}

					<Button
						variant="default"
						size="sm"
						onClick={handleAddOtherPresence}
						disabled={addOtherMutation.isPending}
						className="shrink-0"
					>
						<UserPlus className="h-4 w-4 mr-2" />
						Outros {othersCount ? `(${othersCount})` : ""}
					</Button>
				</div>
			</div>

			{/* Leitor de QR em card */}
			<div className="qr-reader relative rounded-xl border border-border bg-card text-card-foreground p-3">
				{/** biome-ignore lint/a11y/useMediaCaption: explanation */}
				<video
					ref={videoRef}
					className="rounded-md w-full max-h-[60vh] object-cover"
				/>
				{!scannerState.hasPermission && scannerState.isReady && (
					<div className="mt-3 text-center p-4 border border-border rounded-md bg-destructive/10 text-destructive text-sm">
						<p>{scannerState.error || "Acesso à câmera negado."}</p>
					</div>
				)}
				<div ref={qrBoxRef} className="qr-box pointer-events-none" />
				{lastScanResult && (
					<p className="absolute top-2 left-2 z-50 rounded px-2 py-1 bg-accent/90 text-accent-foreground text-xs shadow">
						Último UUID: {lastScanResult}
					</p>
				)}
			</div>

			<PresenceTable
				selectedDate={filters.date}
				selectedMeal={filters.meal}
				presences={presences}
				forecastMap={forecastMap}
				actions={actions}
			/>

			<FiscalDialog
				setDialog={setDialog}
				dialog={dialog}
				confirmDialog={handleConfirmDialog}
				selectedUnit={filters.unit}
				resolveDisplayName={resolveDisplayName}
			/>
		</div>
	);
}

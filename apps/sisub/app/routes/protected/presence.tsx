import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  useReducer,
} from "react";
import QrScanner from "qr-scanner";
import supabase from "~/utils/supabase";

// UI & Icons
import { Button, Switch, Label } from "@iefa/ui";
import { Camera, RefreshCw, UserPlus } from "lucide-react";
import { toast } from "sonner";

import Filters from "~/components/Filters";
import {
  MealKey,
  DialogState,
  generateRestrictedDates,
} from "~/utils/FiscalUtils";
import FiscalDialog from "~/components/presence/FiscalDialog";
import PresenceTable from "~/components/presence/PresenceTable";
import { usePresenceManagement } from "~/components/hooks/usePresenceManagement";
import { useAuth } from "@iefa/auth";
import { checkUserLevel } from "~/services/AdminService";
import { Navigate } from "react-router";

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

interface FiscalFilters {
  date: string;
  meal: MealKey;
  unit: string; // mess hall code
}

export function meta() {
  return [
    { title: "Fiscalização - Leitor de QR" },
    {
      name: "description",
      content: "Fiscalize a refeição escaneando o QR do militar",
    },
  ];
}

export function inferDefaultMeal(now: Date = new Date()): MealKey {
  const toMin = (h: number, m = 0) => h * 60 + m;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const inRange = (start: number, end: number) =>
    minutes >= start && minutes < end;

  if (inRange(toMin(4), toMin(9))) return "cafe";
  if (inRange(toMin(9), toMin(15))) return "almoco";
  if (inRange(toMin(15), toMin(20))) return "janta";
  return "ceia";
}

const scannerReducer = (
  state: ScannerState,
  action: ScannerAction
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

export default function Qr() {
  const scannerRef = useRef<QrScanner | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const qrBoxRef = useRef<HTMLDivElement>(null);
  const [autoCloseDialog, setAutoCloseDialog] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const dates = useMemo(() => generateRestrictedDates(), []);
  const defaultMeal = useMemo(() => inferDefaultMeal(), []);
  const [isAddingOther, setIsAddingOther] = useState(false);

  const { user } = useAuth();
  const [shouldRedirect, setShouldRedirect] = useState(false);

  useEffect(() => {
    const fetchUserLevel = async () => {
      if (user?.id) {
        const level = await checkUserLevel(user.id);
        if (level === null) {
          setShouldRedirect(true);
        }
      }
    };
    fetchUserLevel();
  }, [user]);

  if (shouldRedirect) {
    return <Navigate to="/rancho" replace />;
  }

  const [filters, setFilters] = useState<FiscalFilters>({
    date: dates[1],
    meal: defaultMeal,
    unit: "DIRAD - DIRAD",
  });

  // Cooldown + cache de UUIDs (LRU simples)
  const COOLDOWN_MS = 800;
  const MAX_CACHE = 300;
  const lastScanAtRef = useRef(0);
  const recentlyScannedRef = useRef<Set<string>>(new Set());
  const scannedQueueRef = useRef<string[]>([]); // LRU

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

  const currentFiltersRef = useRef(filters);
  useEffect(() => {
    currentFiltersRef.current = filters;
  }, [filters]);

  const [dialog, setDialog] = useState<DialogState>({
    open: false,
    uuid: null,
    systemForecast: null,
    willEnter: "sim",
  });

  // Cache simples de code -> mess_hall_id para reduzir round-trips
  const messHallIdCacheRef = useRef<Map<string, number>>(new Map());
  const getMessHallIdByCode = useCallback(
    async (code: string): Promise<number | undefined> => {
      if (!code) return undefined;
      const cached = messHallIdCacheRef.current.get(code);
      if (cached) return cached;

      const { data, error } = await supabase
        .schema("sisub")
        .from("mess_halls")
        .select("id")
        .eq("code", code)
        .maybeSingle();

      if (error) {
        console.warn("Falha ao buscar mess_hall_id:", error);
        return undefined;
      }
      const id = data?.id as number | undefined;
      if (id) messHallIdCacheRef.current.set(code, id);
      return id;
    },
    []
  );

  

  const [othersCount, setOthersCount] = useState<number>(0);

  const loadOthersCount = useCallback(async () => {
    const { date, meal, unit } = currentFiltersRef.current;
    if (!date || !meal || !unit) return;

    // Converte CODE -> ID antes de contar
    const messHallId = await getMessHallIdByCode(unit);
    if (!messHallId) {
      setOthersCount(0);
      return;
    }

    const { error, count } = await supabase
      .schema("sisub")
      .from("other_presences")
      .select("*", { count: "exact", head: true })
      .eq("date", date)
      .eq("meal", meal)
      .eq("mess_hall_id", messHallId);

    if (!error) setOthersCount(count ?? 0);
  }, [getMessHallIdByCode]);

  const addOtherPresence = useCallback(async () => {
    if (!user?.id) {
      toast.error("Erro", { description: "Usuário não autenticado." });
      return;
    }

    const { date, meal, unit } = currentFiltersRef.current;

    if (!date || !meal || !unit) {
      toast.error("Filtros incompletos", {
        description: "Selecione data, refeição e unidade.",
      });
      return;
    }

    setIsAddingOther(true);
    try {
      // Converte CODE -> ID conforme schema da tabela
      const messHallId = await getMessHallIdByCode(unit);
      if (!messHallId) {
        toast.error("Unidade inválida", {
          description:
            "Não foi possível mapear o código de rancho para o ID. Verifique a unidade selecionada.",
        });
        return;
      }

      const { error } = await supabase
        .schema("sisub")
        .from("other_presences")
        .insert({
          admin_id: user.id,
          date,
          meal,
          mess_hall_id: messHallId,
        });

      if (error) throw error;

      toast.success("Outro registrado", {
        description: "Entrada sem cadastro adicionada com sucesso.",
      });
    } catch (err: any) {
      console.error("Erro ao registrar Outros:", err);
      toast.error("Erro", {
        description: "Não foi possível registrar a entrada.",
      });
    } finally {
      await loadOthersCount();
      setIsAddingOther(false);
    }
  }, [user?.id, getMessHallIdByCode, loadOthersCount]);

  useEffect(() => {
    loadOthersCount();
  }, [filters.date, filters.meal, filters.unit, loadOthersCount]);

  const { presences, forecastMap, confirmPresence, removePresence } =
    usePresenceManagement(filters);

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
            onDecodeError: onScanFail,
            preferredCamera: "environment",
            highlightScanRegion: true,
            highlightCodeOutline: true,
            overlay: qrBoxRef.current ?? undefined,
          }
        );
        scannerRef.current = scanner;

        await scanner.start();
        if (!isCancelled) {
          dispatch({ type: "INITIALIZE_SUCCESS", hasPermission: true });
        }
      } catch (err: any) {
        console.error("Erro ao iniciar o scanner:", err);
        if (!isCancelled) {
          dispatch({
            type: "INITIALIZE_ERROR",
            error: String(
              err?.message ?? "Erro desconhecido ao iniciar a câmera."
            ),
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
  }, []);

  const onScanSuccess = async (result: QrScanner.ScanResult) => {
    const raw = (result?.data || "").trim();
    if (!raw) return;

    const uuid = extractUuid(raw);
    if (!uuid) {
      return;
    }

    const now = Date.now();
    if (now - lastScanAtRef.current < COOLDOWN_MS) return;
    if (recentlyScannedRef.current.has(uuid)) return;
    if (isProcessing) return;

    lastScanAtRef.current = now;
    setIsProcessing(true);

    try {
      await scannerRef.current?.stop();
    } catch {}

    const { date, meal, unit } = currentFiltersRef.current;

    try {
      // Buscar mess_hall_id pelo code e depois a previsão em sisub.meal_forecasts
      let systemForecast: boolean | null = null;
      const messHallId = await getMessHallIdByCode(unit);

      if (messHallId) {
        const { data: forecast, error: fErr } = await supabase
          .schema("sisub")
          .from("meal_forecasts")
          .select("will_eat")
          .eq("user_id", uuid)
          .eq("date", date)
          .eq("meal", meal)
          .eq("mess_hall_id", messHallId)
          .maybeSingle();

        if (!fErr && forecast) {
          systemForecast = !!forecast.will_eat;
        }
      } else {
        console.warn(`Código de rancho não encontrado: ${unit}`);
      }

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
      toast.error("Erro", { description: "Falha ao processar QR." });
    } finally {
      setIsProcessing(false);
    }
  };

  const onScanFail = (err: string | Error) => {
    if (String(err) !== "No QR code found") {
      console.warn("QR Scan Error:", err);
    }
  };

  const handleConfirmDialog = useCallback(async () => {
    if (!dialog.uuid) return;

    try {
      await confirmPresence(dialog.uuid, dialog.willEnter === "sim");
    } catch (err) {
      console.error("Falha ao confirmar presença:", err);
    } finally {
      setDialog((d) => ({ ...d, open: false, uuid: null }));
    }
  }, [dialog.uuid, dialog.willEnter, confirmPresence]);

  const toggleScan = useCallback(async () => {
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
  }, [scannerState.isScanning]);

  const refresh = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    if (!dialog.open || !autoCloseDialog || !dialog.uuid) return;

    const timerId = setTimeout(() => {
      handleConfirmDialog();
    }, 3000);

    return () => clearTimeout(timerId);
  }, [dialog.open, dialog.uuid, autoCloseDialog, handleConfirmDialog]);

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

  const clearResult = useCallback(() => setLastScanResult(""), []);

  const actions = useMemo(
    () => ({
      toggleScan,
      refresh,
      clearResult,
      removePresence,
    }),
    [toggleScan, refresh, clearResult, removePresence]
  );

  return (
    <div className="pt-10 space-y-6 min-h-screen container mx-auto max-w-screen-2xl px-4">
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
            onClick={addOtherPresence}
            disabled={isAddingOther}
            className="shrink-0"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Outros {othersCount ? `(${othersCount})` : ""}
          </Button>
        </div>
      </div>

      {/* Leitor de QR em card */}
      <div className="qr-reader relative rounded-xl border border-border bg-card text-card-foreground p-3">
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
      />
    </div>
  );
}

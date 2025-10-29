// routes/protected/presence/selfCheckin.tsx
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import supabase from "~/utils/supabase";
import { toast } from "sonner";
import type { MealKey } from "~/utils/FiscalUtils";
import { Button } from "@iefa/ui";

// Mesmas regras usadas no presence
function inferDefaultMeal(now: Date = new Date()): MealKey {
  const toMin = (h: number, m = 0) => h * 60 + m;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const inRange = (start: number, end: number) =>
    minutes >= start && minutes < end;

  if (inRange(toMin(4), toMin(9))) return "cafe";
  if (inRange(toMin(9), toMin(15))) return "almoco";
  if (inRange(toMin(15), toMin(20))) return "janta";
  return "ceia";
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

// Monta o redirectTo com base na URL atual e faz sanitização simples
function buildRedirectTo(
  pathname: string,
  search: string,
  fallback = "/rancho"
) {
  const raw = `${pathname}${search || ""}`;
  const safe = raw.startsWith("/") && !raw.startsWith("//") ? raw : fallback;
  return encodeURIComponent(safe);
}

type WillEnter = "sim" | "nao";
const REDIRECT_DELAY_SECONDS = 3;

function isDuplicateOrConflict(err: unknown): boolean {
  const e = err as any;
  const code = e?.code;
  const status = e?.status;
  const msg = String(e?.message || "").toLowerCase();

  return (
    code === "23505" ||
    code === 23505 ||
    code === "409" ||
    status === 409 ||
    msg.includes("duplicate key") ||
    msg.includes("conflict")
  );
}

export default function SelfCheckin() {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const redirectedRef = useRef(false); // evita múltiplos navigates em strict mode
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );

  // ÚNICO parâmetro esperado no QR: unidade
  const unitParam = search.get("unit") ?? search.get("u");
  const unidade = useMemo(() => unitParam ?? "DIRAD - DIRAD", [unitParam]);

  // Autoinferência de data e refeição (mesmas regras do presence)
  const date = useMemo(() => todayISO(), []);
  const meal = useMemo<MealKey>(() => inferDefaultMeal(), []);

  // Estado local
  const [uuid, setUuid] = useState<string | null>(null);
  // Se não encontrar previsão, considerar como NÃO previsto (false)
  const [systemForecast, setSystemForecast] = useState<boolean>(false);
  const [willEnter, setWillEnter] = useState<WillEnter>("sim");
  const [submitting, setSubmitting] = useState(false);

  // Countdown de redirecionamento
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(
    null
  );

  // Limpa interval de countdown ao desmontar
  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

  const scheduleRedirect = useCallback(
    (seconds = REDIRECT_DELAY_SECONDS) => {
      if (redirectedRef.current) return; // já indo redirecionar

      setRedirectCountdown(seconds);
      // Atualiza countdown
      countdownIntervalRef.current = setInterval(() => {
        setRedirectCountdown((s) => {
          const next = (s ?? 1) - 1;
          if (next <= 0) {
            if (countdownIntervalRef.current) {
              clearInterval(countdownIntervalRef.current);
            }
            if (!redirectedRef.current) {
              redirectedRef.current = true;
              navigate("/rancho", { replace: true });
            }
            return null;
          }
          return next;
        });
      }, 1000);
    },
    [navigate]
  );

  // Autenticação + busca de previsão
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      // Early return: autenticação
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr || !authData?.user) {
        if (!redirectedRef.current) {
          const redirectTo = buildRedirectTo(
            location.pathname,
            location.search
          );
          redirectedRef.current = true;
          navigate(`/login?redirectTo=${redirectTo}`, { replace: true });
        }
        return;
      }

      const userId = authData.user.id;

      // Early return: unidade ausente
      if (!unidade) {
        toast.error("QR inválido", {
          description: "A unidade não foi informada.",
        });
        return;
      }

      // Busca previsão do sistema — se falhar, segue com defaults
      try {
        const { data: previsao, error } = await supabase
          .from("rancho_previsoes")
          .select("vai_comer")
          .eq("user_id", userId)
          .eq("data", date)
          .eq("refeicao", meal)
          .eq("unidade", unidade)
          .maybeSingle();

        if (cancelled) return;

        setUuid(userId);

        if (error) {
          // Resiliente: loga, mantém systemForecast=false e segue
          console.error("Erro ao buscar previsão:", error);
          toast.message(
            "Não foi possível carregar a previsão. Seguindo sem ela."
          );
          setSystemForecast(false);
          setWillEnter("sim");
          return;
        }

        // Não encontrado => false (não previsto)
        setSystemForecast(previsao ? !!previsao.vai_comer : false);
        setWillEnter("sim");
      } catch (err) {
        if (cancelled) return;
        console.error("Erro inesperado ao preparar informações:", err);
        toast.error("Erro", { description: "Falha ao carregar informações." });
        // Mantém estados default (uuid só se auth ok)
        setUuid(userId);
        setSystemForecast(false);
        setWillEnter("sim");
        return;
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [date, meal, unidade, navigate, location.pathname, location.search]);

  const handleSubmit = useCallback(async () => {
    // Early returns
    if (submitting) return;
    if (!uuid) {
      toast.error("Usuário não carregado.");
      return;
    }

    setSubmitting(true);

    try {
      // Se não vai entrar, apenas registrar decisão localmente (toast) e sair
      if (willEnter !== "sim") {
        toast.info("Decisão registrada", {
          description: "Você optou por não entrar para a refeição.",
        });
        return; // early return
      }

      // Tenta inserir presença
      const { error } = await supabase.from("rancho_presencas").insert({
        user_id: uuid,
        date,
        meal,
        unidade,
      });

      if (!error) {
        toast.success("Presença registrada", {
          description: `Bom apetite! Redirecionando em ${REDIRECT_DELAY_SECONDS}s...`,
        });
        scheduleRedirect(REDIRECT_DELAY_SECONDS);
        return; // early return
      }

      // Trata conflitos/duplicados: 23505 (unique) e 409 (conflict)
      if (isDuplicateOrConflict(error)) {
        toast.info("Já registrado", {
          description: `Sua presença já está registrada para esta refeição. Redirecionando em ${REDIRECT_DELAY_SECONDS}s...`,
        });
        scheduleRedirect(REDIRECT_DELAY_SECONDS);
        return; // early return
      }

      // Outros erros
      console.error("Erro ao registrar presença:", error);
      toast.error("Erro", {
        description: "Não foi possível registrar sua presença.",
      });
      return; // early return
    } catch (err) {
      console.error("Falha inesperada no envio:", err);
      toast.error("Erro", {
        description: "Falha inesperada ao enviar a presença.",
      });
      return; // early return
    } finally {
      setSubmitting(false);
    }
  }, [uuid, willEnter, date, meal, unidade, submitting, scheduleRedirect]);

  const goHome = useCallback(() => {
    if (redirectCountdown !== null) return; // evita interromper countdown
    navigate("/rancho");
  }, [navigate, redirectCountdown]);

  return (
    <div className="max-w-md mx-auto p-6 text-center space-y-6">
      <h1 className="text-xl font-semibold">Check-in de Refeição</h1>

      <p className="text-sm text-muted-foreground">
        Unidade: <b>{unidade}</b> • Data: <b>{date}</b> • Refeição:{" "}
        <b>{meal}</b>
      </p>

      <div className="rounded-md border p-4 text-left space-y-4">
        {/* Está na previsão? — desabilitado, mas selecionado conforme a previsão */}
        <div className="space-y-2">
          <div className="text-sm font-medium">Está na previsão?</div>
          <div className="flex gap-2">
            <Button
              disabled
              variant={systemForecast ? "default" : "outline"}
              size="sm"
            >
              Sim
            </Button>
            <Button
              disabled
              variant={!systemForecast ? "default" : "outline"}
              size="sm"
            >
              Não
            </Button>
          </div>
          {uuid && (
            <div className="text-xs text-muted-foreground mt-1">
              UUID: {uuid}
            </div>
          )}
        </div>

        {/* Vai entrar? — interação do usuário */}
        <div className="space-y-2">
          <div className="text-sm font-medium">Vai entrar?</div>
          <div className="flex gap-2">
            <Button
              variant={willEnter === "sim" ? "default" : "outline"}
              size="sm"
              onClick={() => setWillEnter("sim")}
              disabled={!uuid || submitting || redirectCountdown !== null}
            >
              Sim
            </Button>
            <Button
              variant={willEnter === "nao" ? "default" : "outline"}
              size="sm"
              onClick={() => setWillEnter("nao")}
              disabled={!uuid || submitting || redirectCountdown !== null}
            >
              Não
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center gap-2">
        <div className="flex items-center justify-center gap-3">
          <Button
            onClick={handleSubmit}
            disabled={!uuid || submitting || redirectCountdown !== null}
          >
            {submitting ? "Enviando..." : "Enviar"}
          </Button>
          <Button
            variant="outline"
            onClick={goHome}
            disabled={submitting || redirectCountdown !== null}
          >
            Voltar
          </Button>
        </div>

        {redirectCountdown !== null && (
          <div className="text-xs text-muted-foreground">
            Redirecionando para o rancho em {redirectCountdown}s...
          </div>
        )}
      </div>
    </div>
  );
}

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  Badge,
  Separator,
} from "@iefa/ui";
import {
  RefreshCcw,
  ExternalLink,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  AlertCircle,
  Clock,
  Globe,
  Server,
} from "lucide-react";

type RawHealthPayload =
  | {
      status?: string;
      services?: Array<
        string | { name?: string; url?: string; healthPath?: string }
      >;
      [k: string]: any;
    }
  | Array<string | { name?: string; url?: string; healthPath?: string }>
  | Record<string, any>;

type ServiceTarget = {
  name: string;
  url: string;
  healthPath?: string;
};

type ProbeStatus = "loading" | "ok" | "degraded" | "down" | "unknown" | "error";

type ProbeResult = {
  status: ProbeStatus;
  httpStatus?: number;
  latencyMs?: number;
  bodyStatus?: string;
  lastCheckedAt?: number;
  note?: string; // CORS, timeout, etc.
};

const API_BASE = "https://iefa-rag.fly.dev";
const AUTO_REFRESH_MS = 60_000;
const REQ_TIMEOUT_MS = 8_000;

function StatusDot({ status }: { status: ProbeStatus }) {
  const map = {
    ok: "bg-emerald-500",
    degraded: "bg-amber-500",
    down: "bg-rose-600",
    error: "bg-rose-600",
    unknown: "bg-slate-400",
    loading: "bg-amber-400 animate-pulse",
  };
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full shadow-sm ${map[status]}`}
      aria-hidden="true"
    />
  );
}

function statusLabel(s: ProbeStatus) {
  switch (s) {
    case "ok":
      return "Online";
    case "degraded":
      return "Degradado";
    case "down":
      return "Offline";
    case "unknown":
      return "Desconhecido";
    case "error":
      return "Erro";
    case "loading":
      return "Verificando…";
  }
}

function hostToName(u: string) {
  try {
    const { hostname } = new URL(u);
    return hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
}

function joinUrl(base: string, path: string) {
  try {
    const u = new URL(base);
    if (path.startsWith("/")) {
      u.pathname = path;
    } else {
      u.pathname = [u.pathname.replace(/\/+$/, ""), path].join("/");
    }
    return u.toString();
  } catch {
    // fallback tos concatenation
    return base.replace(/\/+$/, "") + "/" + path.replace(/^\/+/, "");
  }
}

async function fetchWithTimeout(
  input: RequestInfo,
  init: RequestInit = {},
  timeoutMs = REQ_TIMEOUT_MS
) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(input, { ...init, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

async function probeService(target: ServiceTarget): Promise<ProbeResult> {
  const started = performance.now();
  const stamp = Date.now();

  const tryUrls: string[] = [];
  if (target.healthPath) {
    tryUrls.push(joinUrl(target.url, target.healthPath));
  } else {
    // tentar health explícito e depois a raiz
    tryUrls.push(joinUrl(target.url, "/health"));
    tryUrls.push(target.url);
  }

  for (let i = 0; i < tryUrls.length; i++) {
    const url = tryUrls[i];
    const method: "GET" | "HEAD" = i === 0 ? "GET" : "HEAD";

    try {
      const res = await fetchWithTimeout(url, { method, cache: "no-store" });
      const latencyMs = Math.max(1, Math.round(performance.now() - started));
      const httpStatus = res.status;

      let bodyStatus: string | undefined;
      if (method === "GET") {
        // tentar extrair { status: "ok" } do JSON
        try {
          const json = await res.clone().json();
          bodyStatus =
            typeof json?.status === "string" ? json.status : undefined;
        } catch {
          // ignore JSON errors
        }
      }

      // Heurística de status
      if (httpStatus >= 200 && httpStatus < 300) {
        if (bodyStatus && bodyStatus.toLowerCase() !== "ok") {
          return {
            status: "degraded",
            httpStatus,
            latencyMs,
            bodyStatus,
            lastCheckedAt: stamp,
          };
        }
        return {
          status: "ok",
          httpStatus,
          latencyMs,
          bodyStatus,
          lastCheckedAt: stamp,
        };
      }
      if (httpStatus === 503 || httpStatus === 502 || httpStatus === 500) {
        return {
          status: "down",
          httpStatus,
          latencyMs,
          bodyStatus,
          lastCheckedAt: stamp,
        };
      }
      // HTTP fora do 2xx mas não hard-down
      return {
        status: "error",
        httpStatus,
        latencyMs,
        bodyStatus,
        lastCheckedAt: stamp,
      };
    } catch (e: any) {
      const latencyMs = Math.max(1, Math.round(performance.now() - started));
      if (e?.name === "AbortError") {
        // timeout
        return {
          status: "down",
          httpStatus: undefined,
          latencyMs,
          lastCheckedAt: stamp,
          note: "timeout",
        };
      }
      // Pode ser CORS/network
      // Tente próxima estratégia, a menos que seja o último fallback
      if (i === tryUrls.length - 1) {
        return {
          status: "unknown",
          httpStatus: undefined,
          latencyMs,
          lastCheckedAt: stamp,
          note: "cors/network",
        };
      }
    }
  }

  // fallback final
  return { status: "unknown", lastCheckedAt: Date.now(), note: "no-attempt" };
}

function deriveTargetsFromHealth(
  data: RawHealthPayload | undefined
): ServiceTarget[] {
  if (!data) return [];

  // Caso 1: objeto com `services: [...]`
  if (typeof (data as any)?.services !== "undefined") {
    const arr = (data as any).services;
    if (Array.isArray(arr)) {
      return arr
        .map((item) => {
          if (typeof item === "string") {
            return { name: hostToName(item), url: item } as ServiceTarget;
          }
          if (item && typeof item === "object") {
            const url = (item as any).url || "";
            const name = (item as any).name || hostToName(url);
            const healthPath = (item as any).healthPath;
            if (url) return { name, url, healthPath };
          }
          return null;
        })
        .filter(Boolean) as ServiceTarget[];
    }
  }

  // Caso 2: o payload inteiro é um array
  if (Array.isArray(data)) {
    return data
      .map((item) => {
        if (typeof item === "string")
          return { name: hostToName(item), url: item } as ServiceTarget;
        if (item && typeof item === "object") {
          const url = (item as any).url || "";
          const name = (item as any).name || hostToName(url);
          const healthPath = (item as any).healthPath;
          if (url) return { name, url, healthPath };
        }
        return null;
      })
      .filter(Boolean) as ServiceTarget[];
  }

  // Caso 3: objeto genérico com chaves possivelmente sendo serviços
  if (data && typeof data === "object") {
    const entries = Object.entries(data as Record<string, any>);
    const candidates: ServiceTarget[] = [];
    for (const [k, v] of entries) {
      // { sisub: "https://..." } ou { sisub: { url: "https://...", name: "SISUB" } }
      if (typeof v === "string" && v.startsWith("http")) {
        candidates.push({ name: k, url: v });
      } else if (v && typeof v === "object" && typeof v.url === "string") {
        candidates.push({
          name: v.name || k,
          url: v.url,
          healthPath: v.healthPath,
        });
      }
    }
    return candidates;
  }

  return [];
}

function defaultTargets(): ServiceTarget[] {
  const portal =
    typeof window !== "undefined"
      ? { name: "Portal IEFA", url: window.location.origin }
      : { name: "Portal IEFA", url: "https://portal.iefa.com.br" };

  return [
    portal,
    { name: "SISUB", url: "https://app.previsaosisub.com.br" },
    { name: "RAG API", url: "https://iefa-rag.fly.dev" },
  ];
}

export function meta() {
  return [
    { title: "Overseer Dashboard" },
    {
      name: "description",
      content: "Monitoramento de saúde dos serviços (health checks)",
    },
  ];
}

export default function OverseerDashboard() {
  const [targets, setTargets] = useState<ServiceTarget[]>([]);
  const [results, setResults] = useState<Record<string, ProbeResult>>({});
  const [loadingTargets, setLoadingTargets] = useState(true);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const timerRef = useRef<number | null>(null);

  const loadTargets = useCallback(async () => {
    setLoadingTargets(true);
    try {
      const res = await fetch(`${API_BASE}/health`, {
        method: "GET",
        cache: "no-store",
      });
      const data: RawHealthPayload | undefined = await res
        .json()
        .catch(() => undefined);
      const derived = deriveTargetsFromHealth(data);
      setTargets(derived.length > 0 ? derived : defaultTargets());
    } catch {
      setTargets(defaultTargets());
    } finally {
      setLoadingTargets(false);
    }
  }, []);

  const refreshOne = useCallback(async (t: ServiceTarget) => {
    setResults((prev) => ({
      ...prev,
      [t.url]: { ...(prev[t.url] ?? {}), status: "loading" } as ProbeResult,
    }));
    const r = await probeService(t);
    setResults((prev) => ({ ...prev, [t.url]: r }));
  }, []);

  const refreshAll = useCallback(async () => {
    setRefreshingAll(true);
    await Promise.all(targets.map((t) => refreshOne(t)));
    setRefreshingAll(false);
  }, [targets, refreshOne]);

  useEffect(() => {
    loadTargets();
  }, [loadTargets]);

  useEffect(() => {
    if (targets.length > 0) {
      // primeira carga
      refreshAll();
      // polling
      timerRef.current = window.setInterval(refreshAll, AUTO_REFRESH_MS);
      return () => {
        if (timerRef.current) window.clearInterval(timerRef.current);
      };
    }
  }, [targets, refreshAll]);

  const summary = useMemo(() => {
    const total = targets.length;
    let ok = 0,
      degraded = 0,
      down = 0,
      unknown = 0,
      error = 0,
      loading = 0;

    for (const t of targets) {
      const r = results[t.url];
      switch (r?.status) {
        case "ok":
          ok++;
          break;
        case "degraded":
          degraded++;
          break;
        case "down":
          down++;
          break;
        case "unknown":
          unknown++;
          break;
        case "error":
          error++;
          break;
        case "loading":
        default:
          loading++;
          break;
      }
    }
    return { total, ok, degraded, down, unknown, error, loading };
  }, [targets, results]);

  return (
    <div className="relative w-full text-foreground">
      <header className="mb-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20">
              <Server className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                Overseer Dashboard
              </h1>
              <p className="text-xs text-muted-foreground">
                Monitoramento de saúde (health) dos serviços do IEFA
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            
            <Button
              onClick={refreshAll}
              disabled={refreshingAll || loadingTargets}
              size="sm"
              className="gap-2"
            >
              <RefreshCcw
                className={refreshingAll ? "h-4 w-4 animate-spin" : "h-4 w-4"}
              />
              Verificar tudo
            </Button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="rounded-xl border border-border/60 bg-card p-3 flex items-center gap-2">
            <StatusDot status="ok" />
            <span className="text-xs text-muted-foreground">Online</span>
            <span className="ml-auto text-sm font-semibold">{summary.ok}</span>
          </div>
          <div className="rounded-xl border border-border/60 bg-card p-3 flex items-center gap-2">
            <StatusDot status="degraded" />
            <span className="text-xs text-muted-foreground">Degradado</span>
            <span className="ml-auto text-sm font-semibold">
              {summary.degraded}
            </span>
          </div>
          <div className="rounded-xl border border-border/60 bg-card p-3 flex items-center gap-2">
            <StatusDot status="down" />
            <span className="text-xs text-muted-foreground">Offline</span>
            <span className="ml-auto text-sm font-semibold">
              {summary.down}
            </span>
          </div>
          <div className="rounded-xl border border-border/60 bg-card p-3 flex items-center gap-2">
            <StatusDot status="unknown" />
            <span className="text-xs text-muted-foreground">Desconhecido</span>
            <span className="ml-auto text-sm font-semibold">
              {summary.unknown}
            </span>
          </div>
          <div className="rounded-xl border border-border/60 bg-card p-3 flex items-center gap-2">
            <StatusDot status="error" />
            <span className="text-xs text-muted-foreground">Erro</span>
            <span className="ml-auto text-sm font-semibold">
              {summary.error}
            </span>
          </div>
          <div className="rounded-xl border border-border/60 bg-card p-3 flex items-center gap-2">
            <StatusDot status="loading" />
            <span className="text-xs text-muted-foreground">Verificando…</span>
            <span className="ml-auto text-sm font-semibold">
              {summary.loading}
            </span>
          </div>
        </div>
      </header>

      <Separator className="my-6" />

      {loadingTargets ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="h-40 animate-pulse rounded-xl bg-muted" />
          <div className="h-40 animate-pulse rounded-xl bg-muted" />
          <div className="h-40 animate-pulse rounded-xl bg-muted" />
        </div>
      ) : targets.length === 0 ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3">
          <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-500" />
          </div>
          <div className="text-sm">
            Não foi possível derivar nenhum serviço do endpoint{" "}
            <code className="px-1 rounded bg-muted">/health</code>. Defina
            serviços no payload ou ajuste a lista padrão em código.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {targets.map((t) => {
            const r = results[t.url] as ProbeResult | undefined;
            const st = r?.status ?? "loading";
            const isUp = st === "ok" || st === "degraded";
            const colorHeader =
              st === "ok"
                ? "from-emerald-500/15 to-transparent"
                : st === "degraded"
                  ? "from-amber-500/15 to-transparent"
                  : st === "down" || st === "error"
                    ? "from-rose-500/15 to-transparent"
                    : "from-slate-400/10 to-transparent";

            return (
              <Card
                key={t.url}
                className={`group h-full border border-border bg-card text-card-foreground transition-all hover:border-primary/40 hover:shadow-lg focus-within:ring-2 focus-within:ring-primary/40`}
              >
                <CardHeader
                  className={`pb-2 bg-gradient-to-r ${colorHeader} rounded-t-xl`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span aria-hidden="true">
                        {isUp ? (
                          <CheckCircle2
                            className={`h-5 w-5 ${st === "ok" ? "text-emerald-600" : "text-amber-600"}`}
                          />
                        ) : st === "down" || st === "error" ? (
                          <XCircle className="h-5 w-5 text-rose-600" />
                        ) : (
                          <AlertTriangle className="h-5 w-5 text-slate-500" />
                        )}
                      </span>
                      <h3 className="text-base md:text-lg font-semibold leading-tight">
                        {t.name}
                      </h3>
                    </div>
                    <Badge variant="secondary" className="gap-2">
                      <StatusDot status={st} />
                      {statusLabel(st)}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 pt-3">
                  <div className="text-sm flex items-center gap-2 text-muted-foreground break-all">
                    <Globe className="h-4 w-4" aria-hidden="true" />
                    <a
                      href={t.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="hover:underline underline-offset-4"
                      aria-label={`Abrir ${t.url} em nova aba`}
                    >
                      {t.url}
                      <ExternalLink
                        className="inline ml-1 h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                    </a>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                      <div className="text-xs text-muted-foreground">HTTP</div>
                      <div className="mt-1 font-semibold">
                        {typeof r?.httpStatus === "number" ? r.httpStatus : "—"}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                      <div className="text-xs text-muted-foreground">
                        Latência
                      </div>
                      <div className="mt-1 font-semibold">
                        {typeof r?.latencyMs === "number"
                          ? `${r.latencyMs} ms`
                          : "—"}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                      <div className="text-xs text-muted-foreground">
                        Body status
                      </div>
                      <div className="mt-1 font-semibold">
                        {r?.bodyStatus ? r.bodyStatus : "—"}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" /> Última verificação
                      </div>
                      <div className="mt-1 font-semibold">
                        {r?.lastCheckedAt
                          ? new Date(r.lastCheckedAt).toLocaleTimeString(
                              "pt-BR",
                              {
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                              }
                            )
                          : "—"}
                      </div>
                    </div>
                  </div>

                  {r?.note ? (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-700 dark:text-amber-300">
                      Observação: {r.note}
                    </div>
                  ) : null}
                </CardContent>

                <CardFooter className="flex items-center justify-between gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refreshOne(t)}
                    className="gap-2"
                    aria-label={`Reverificar ${t.name}`}
                  >
                    <RefreshCcw
                      className={
                        st === "loading" ? "h-4 w-4 animate-spin" : "h-4 w-4"
                      }
                    />
                    Verificar
                  </Button>
                  <div className="text-xs text-muted-foreground">
                    {t.healthPath
                      ? `healthPath: ${t.healthPath}`
                      : "auto: /health → /"}
                  </div>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

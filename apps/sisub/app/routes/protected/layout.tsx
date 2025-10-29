import { Outlet, Navigate, useNavigate, useLocation } from "react-router";
import { useAuth } from "@iefa/auth";
import RanchoHeader from "~/components/rancho/RanchoHeader";
import { useState, useEffect, useRef } from "react";
import supabase from "~/utils/supabase";
import type { User } from "@supabase/supabase-js";

// shadcn/ui
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@iefa/ui";
import { Button, Input } from "@iefa/ui";

type EvaluationResult = {
  shouldAsk: boolean;
  question: string | null;
};

async function syncIdEmail(user: User) {
  try {
    const { error } = await supabase.from("user_data").upsert(
      {
        id: user.id,
        email: user.email,
      },
      { onConflict: "id" }
    );
    if (error) {
      console.error("Erro ao sincronizar email do usuário:", error);
    }
  } catch (e) {
    console.error("Erro ao sincronizar usuário:", e);
  }
}

async function syncIdNrOrdem(user: User, nrOrdem: string) {
  try {
    const { error } = await supabase.from("user_data").upsert(
      {
        id: user.id,
        email: user.email,
        nrOrdem: nrOrdem,
      },
      { onConflict: "id" }
    );
    if (error) {
      console.error("Erro ao sincronizar nrOrdem:", error);
    }
  } catch (e) {
    console.error("Erro ao sincronizar usuário:", e);
  }
}

async function fetchUserNrOrdem(userId: User["id"]): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("user_data")
      .select("nrOrdem")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("Erro ao buscar nrOrdem:", error);
      return null;
    }

    const value = data?.nrOrdem as string | number | null | undefined;
    const asString = value != null ? String(value) : null;
    return asString && asString.trim().length > 0 ? asString : null;
  } catch (e) {
    console.error("Erro inesperado ao buscar nrOrdem:", e);
    return null;
  }
}

async function fetchEvaluationForUser(
  userId: User["id"]
): Promise<EvaluationResult> {
  try {
    const { data: config, error: configError } = await supabase
      .from("super_admin_controller")
      .select("key, active, value")
      .eq("key", "evaluation")
      .maybeSingle();

    if (configError) {
      console.error("Erro ao buscar configuração de evaluation:", configError);
      return { shouldAsk: false, question: null };
    }

    const isActive = !!config?.active;
    const question = (config?.value ?? "") as string;

    if (!isActive || !question) {
      return { shouldAsk: false, question: question || null };
    }

    const { data: opinion, error: opinionError } = await supabase
      .from("opinions")
      .select("id")
      .eq("question", question)
      .eq("userId", userId)
      .maybeSingle();

    if (opinionError) {
      console.error("Erro ao verificar opinião do usuário:", opinionError);
      return { shouldAsk: false, question };
    }

    const alreadyAnswered = !!opinion;
    return { shouldAsk: !alreadyAnswered, question };
  } catch (e) {
    console.error("Erro inesperado ao obter evaluation:", e);
    return { shouldAsk: false, question: null };
  }
}

export default function ProtectedLayout() {
  const navigate = useNavigate();
  const { user, isLoading, refreshSession, signOut } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (user) {
      syncIdEmail(user).catch(() => {});
    }
  }, [user]);

  // Hooks sempre no topo
  const attemptedRecoveryRef = useRef(false);
  const [recovering, setRecovering] = useState(false);

  // Estados do diálogo de avaliação
  const [evaluationQuestion, setEvaluationQuestion] = useState<string | null>(
    null
  );
  const [shouldAskEvaluation, setShouldAskEvaluation] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Interação (avaliação)
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [submittingVote, setSubmittingVote] = useState(false);

  // Estados do diálogo de nrOrdem
  const [nrDialogOpen, setNrDialogOpen] = useState(false);
  const [needsNrOrdem, setNeedsNrOrdem] = useState(false);
  const [nrOrdem, setNrOrdem] = useState("");
  const [savingNr, setSavingNr] = useState(false);
  const [nrError, setNrError] = useState<string | null>(null);

  // Efeito de tentativa de recuperar sessão
  useEffect(() => {
    if (isLoading) return;
    if (user) return;
    if (attemptedRecoveryRef.current) return;

    attemptedRecoveryRef.current = true;
    setRecovering(true);

    (async () => {
      try {
        await refreshSession().catch(() => {});
        await new Promise((r) => setTimeout(r, 50));
      } finally {
        setRecovering(false);
      }
    })();
  }, [isLoading, user, refreshSession]);

  // Busca evaluation + se usuário já respondeu
  useEffect(() => {
    let cancelled = false;

    if (!user?.id) {
      setShouldAskEvaluation(false);
      setDialogOpen(false);
      setEvaluationQuestion(null);
      setSelectedRating(null);
      return;
    }

    (async () => {
      const result = await fetchEvaluationForUser(user.id);
      if (cancelled) return;
      setEvaluationQuestion(result.question);
      setShouldAskEvaluation(result.shouldAsk);
      setDialogOpen(result.shouldAsk && !!result.question);
      setSelectedRating(null);
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Verifica se precisa solicitar o nrOrdem ao usuário
  useEffect(() => {
    let cancelled = false;

    if (!user?.id) {
      setNeedsNrOrdem(false);
      setNrDialogOpen(false);
      setNrOrdem("");
      return;
    }

    (async () => {
      const current = await fetchUserNrOrdem(user.id);
      if (cancelled) return;

      const requires = !current;
      setNeedsNrOrdem(requires);
      setNrDialogOpen(requires);
      if (current) setNrOrdem(String(current));
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Erro ao fazer logout:", error);
      throw new Error(error instanceof Error ? error.message : "Erro ao sair");
    }
  };

  // Envia o voto apenas quando clicar em "Enviar"
  const handleSubmitVote = async () => {
    if (!user?.id || !evaluationQuestion || selectedRating == null) return;
    try {
      setSubmittingVote(true);
      const { error } = await supabase.from("opinions").insert([
        {
          value: selectedRating,
          question: evaluationQuestion,
          userId: user.id,
        },
      ]);
      if (error) {
        console.error("Erro ao registrar voto:", error);
        return;
      }
      setShouldAskEvaluation(false);
      setDialogOpen(false);
    } finally {
      setSubmittingVote(false);
    }
  };

  const handleSubmitNrOrdem = async () => {
    const value = nrOrdem.trim();
    const digitsOnly = value.replace(/\D/g, "");

    if (!digitsOnly) {
      setNrError("Informe seu número da Ordem.");
      return;
    }
    if (digitsOnly.length < 7) {
      setNrError("Nr. da Ordem parece curto. Confira e tente novamente.");
      return;
    }

    try {
      if (!user) return;
      setSavingNr(true);
      setNrError(null);
      await syncIdNrOrdem(user as User, digitsOnly);
      setNeedsNrOrdem(false);
      setNrDialogOpen(false);
    } catch (e) {
      console.error(e);
      setNrError("Não foi possível salvar. Tente novamente.");
    } finally {
      setSavingNr(false);
    }
  };

  // Cores graduais por nota (vermelho -> laranja -> amarelo -> lima -> verde)
  const getRatingClasses = (n: number, isSelected: boolean) => {
    const base =
      "w-12 h-12 sm:w-12 sm:h-12 rounded-lg font-semibold transition-all select-none " +
      "focus:outline-none focus:ring-2 focus:ring-offset-2 " +
      (isSelected ? "scale-105 shadow-md " : "hover:scale-105 ");

    const palette: Record<
      number,
      {
        bg: string;
        ring: string;
        text?: string;
        hover?: string;
        mutedBg: string;
        mutedText: string;
        border: string;
      }
    > = {
      1: {
        bg: "bg-red-500",
        ring: "ring-red-500",
        hover: "hover:bg-red-600",
        text: "text-white",
        mutedBg: "bg-red-50",
        mutedText: "text-red-700",
        border: "border-red-200",
      },
      2: {
        bg: "bg-orange-500",
        ring: "ring-orange-500",
        hover: "hover:bg-orange-600",
        text: "text-white",
        mutedBg: "bg-orange-50",
        mutedText: "text-orange-700",
        border: "border-orange-200",
      },
      3: {
        bg: "bg-yellow-500",
        ring: "ring-yellow-500",
        hover: "hover:bg-yellow-600",
        text: "text-black",
        mutedBg: "bg-yellow-50",
        mutedText: "text-yellow-800",
        border: "border-yellow-200",
      },
      4: {
        bg: "bg-lime-500",
        ring: "ring-lime-500",
        hover: "hover:bg-lime-600",
        text: "text-white",
        mutedBg: "bg-lime-50",
        mutedText: "text-lime-700",
        border: "border-lime-200",
      },
      5: {
        bg: "bg-green-600",
        ring: "ring-green-600",
        hover: "hover:bg-green-700",
        text: "text-white",
        mutedBg: "bg-green-50",
        mutedText: "text-green-700",
        border: "border-green-200",
      },
    };

    const p = palette[n];

    if (isSelected) {
      return `${base} ${p.bg} ${p.text ?? "text-white"} ${p.hover} ${p.ring}`;
    }
    // Não selecionado: contraste alto, mas mais leve
    return `${base} ${p.mutedBg} ${p.mutedText} border ${p.border} ${p.ring}`;
  };

  // Agora sim, retornos condicionais
  if (isLoading || recovering) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-gray-600">Verificando autenticação...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    const redirectTo = encodeURIComponent(
      `${location.pathname}${location.search}`
    );
    return <Navigate to={`/login?redirectTo=${redirectTo}`} replace />;
  }

  // Rotas que precisam de "full-bleed"
  const fullBleedRoutes = ["/rancho", "/fiscal", "/admin", "/superadmin"];
  const isFullBleed = fullBleedRoutes.some((p) =>
    location.pathname.startsWith(p)
  );

  return (
    <>
      {/* Dialog obrigatório para informar o nrOrdem */}
      <Dialog open={nrDialogOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Informe seu número da Ordem</DialogTitle>
            <DialogDescription>
              Para continuar, precisamos do seu número de registro na Ordem
              (nrOrdem).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="nrOrdemInput">
              nrOrdem
            </label>
            <Input
              id="nrOrdemInput"
              value={nrOrdem}
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="Ex.: 123456"
              onChange={(e) => {
                const v = e.target.value;
                const onlyDigits = v.replace(/\D/g, "");
                setNrOrdem(onlyDigits);
                if (nrError) setNrError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSubmitNrOrdem();
                }
              }}
            />
            {nrError && <p className="text-sm text-red-600">{nrError}</p>}
            <p className="text-xs text-muted-foreground">
              Usaremos esse dado apenas para identificar seu registro.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              onClick={handleSubmitNrOrdem}
              disabled={savingNr || nrOrdem.trim().length === 0}
            >
              {savingNr ? "Salvando..." : "Salvar e continuar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de avaliação (só abre após preencher nrOrdem) */}
      <Dialog
        open={
          dialogOpen &&
          !nrDialogOpen &&
          shouldAskEvaluation &&
          !!evaluationQuestion
        }
      >
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Avaliação rápida</DialogTitle>
            <DialogDescription className="text-black text-2xl py-4 text-center">
              {evaluationQuestion || "Como você avalia?"}
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <p className="text-sm text-muted-foreground mb-3 text-center">
              Sua opinião ajuda a melhorar a experiência. Escolha uma nota de 1
              a 5:
            </p>

            {/* Barra de gradiente de fundo (vermelho -> verde) para reforço visual */}
            <div className="relative mx-auto w-full max-w-xs">
              <div className="absolute inset-0 -z-10 rounded-xl opacity-25 bg-gradient-to-r from-red-500 via-yellow-400 to-green-500" />
              <div
                role="radiogroup"
                aria-label="Avaliação de 1 a 5"
                className="relative flex items-center justify-between gap-2 p-2"
              >
                {[1, 2, 3, 4, 5].map((n) => {
                  const isSelected = selectedRating === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      aria-label={`Nota ${n}`}
                      onClick={() => setSelectedRating(n)}
                      className={getRatingClasses(n, isSelected)}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-muted-foreground px-2">
                <span>Péssimo</span>
                <span>Excelente</span>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4 flex items-center justify-between gap-2">
            <Button
              type="button"
              onClick={handleSubmitVote}
              disabled={selectedRating == null || submittingVote}
              className={
                selectedRating == null
                  ? ""
                  : selectedRating <= 2
                    ? "bg-red-500 hover:bg-red-600 text-white"
                    : selectedRating === 3
                      ? "bg-yellow-500 hover:bg-yellow-600 text-black"
                      : "bg-green-600 hover:bg-green-700 text-white"
              }
            >
              {submittingVote ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-b-transparent" />
                  Enviando...
                </span>
              ) : (
                "Enviar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div
        className={
          isFullBleed
            ? "min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50"
            : "min-h-screen bg-gray-50"
        }
      >
        <RanchoHeader user={user} signOut={handleSignOut} />
        <main
          className={
            isFullBleed ? "py-6" : "max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8"
          }
        >
          <Outlet />
        </main>
      </div>
    </>
  );
}

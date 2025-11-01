// apps/sisub/app/routes/app-layout.tsx
import { Outlet, NavLink } from "react-router";
import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { User } from "@supabase/supabase-js";
import { useAuth } from "@iefa/auth";
import supabase from "~/utils/supabase";

import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Input,
  ModeToggle,
  Separator,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  ScrollArea,
} from "@iefa/ui";

import {
  Menu,
  Home,
  UtensilsCrossed,
  ShieldCheck,
  Settings,
  FileText,
  QrCode,
  XIcon,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";

import { ProtectedBoundary } from "~/auth/protected-boundary";
import { UserMenu } from "~/components/user-menu";
import { useUserLevel, type UserLevelOrNull } from "~/services/AdminService";

/* ========= Data functions ========= */
type EvaluationResult = {
  shouldAsk: boolean;
  question: string | null;
};

async function syncIdEmail(user: User) {
  const { error } = await supabase
    .from("user_data")
    .upsert({ id: user.id, email: user.email }, { onConflict: "id" });
  if (error) throw error;
}

async function syncIdNrOrdem(user: User, nrOrdem: string) {
  const { error } = await supabase
    .from("user_data")
    .upsert({ id: user.id, email: user.email, nrOrdem }, { onConflict: "id" });
  if (error) throw error;
}

async function fetchUserNrOrdem(userId: User["id"]): Promise<string | null> {
  const { data, error } = await supabase
    .from("user_data")
    .select("nrOrdem")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  const value = data?.nrOrdem as string | number | null | undefined;
  const asString = value != null ? String(value) : null;
  return asString && asString.trim().length > 0 ? asString : null;
}

async function fetchEvaluationForUser(
  userId: User["id"]
): Promise<EvaluationResult> {
  const { data: config, error: configError } = await supabase
    .from("super_admin_controller")
    .select("key, active, value")
    .eq("key", "evaluation")
    .maybeSingle();
  if (configError) throw configError;

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
  if (opinionError) throw opinionError;

  const alreadyAnswered = !!opinion;
  return { shouldAsk: !alreadyAnswered, question };
}

/* ========= UI Helpers (usando apenas tokens shadcn) ========= */
const ratingClasses = (n: number, selected: number | null) => {
  const isSelected = selected === n;
  const base =
    "w-12 h-12 rounded-lg font-semibold transition-all select-none " +
    "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 " +
    (isSelected ? "scale-105 shadow-md " : "hover:scale-105 ");
  if (isSelected) {
    if (n <= 2) return `${base} bg-destructive text-destructive-foreground`;
    if (n === 3) return `${base} bg-secondary text-secondary-foreground`;
    return `${base} bg-primary text-primary-foreground`;
  }
  return `${base} bg-muted text-muted-foreground border`;
};

/* ========= Sidebar ========= */
type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

const ALL_ITEMS: Record<string, NavItem> = {
  home: { to: "/", label: "Início", icon: Home },
  rancho: { to: "/rancho", label: "Rancho", icon: UtensilsCrossed },
  fiscal: { to: "/fiscal", label: "Fiscal", icon: ShieldCheck },
  admin: { to: "/admin", label: "Admin", icon: Settings },
  superadmin: { to: "/superadmin", label: "SuperAdmin", icon: FileText },
};

// Mapeia o que cada nível enxerga
function getNavItemsForLevel(level: Exclude<UserLevelOrNull, null>): NavItem[] {
  // Base sempre que o usuário TEM perfil (home/rancho)
  const base = [ALL_ITEMS.home, ALL_ITEMS.rancho];

  if (level === "user") {
    return [...base, ALL_ITEMS.fiscal];
  }
  if (level === "admin") {
    return [...base, ALL_ITEMS.fiscal, ALL_ITEMS.admin];
  }
  // superadmin
  return [...base, ALL_ITEMS.fiscal, ALL_ITEMS.admin, ALL_ITEMS.superadmin];
}

function Sidebar({
  items,
  onNavigate,
}: {
  items: NavItem[];
  onNavigate?: () => void;
}) {
  return (
    <div className="h-full flex flex-col border-r bg-card">
      <div className="h-14 flex items-center px-4 border-b">
        <span className="font-semibold text-card-foreground">SISUB</span>
      </div>
      <ScrollArea className="flex-1">
        <nav className="p-2 space-y-1">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/app"}
              className={({ isActive }) =>
                [
                  "w-full inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground hover:bg-accent hover:text-accent-foreground",
                ].join(" ")
              }
              onClick={onNavigate}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </ScrollArea>
      <div className="border-t p-3 text-xs text-muted-foreground">
        © {new Date().getFullYear()} SISUB
      </div>
    </div>
  );
}

/* ========= AppShell (após login) ========= */
function AppShell() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Busca nível do usuário na tabela de perfis (se não estiver na tabela => null)
  const {
    data: userLevel,
    isLoading: levelLoading,
    isError: levelError,
  } = useUserLevel(user?.id);

  // Sidebar só aparece para quem tem entry na tabela de perfis
  const showSidebar = !!userLevel && !levelError;
  const navItems = userLevel ? getNavItemsForLevel(userLevel) : [];

  // sync email (fire-and-forget)
  const syncEmailMutation = useMutation({
    mutationFn: syncIdEmail,
    onError: (e) => console.error("Erro ao sincronizar email:", e),
  });
  useEffect(() => {
    if (user) syncEmailMutation.mutate(user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // nrOrdem requirement
  const nrOrdemQuery = useQuery({
    queryKey: ["user", user?.id, "nrOrdem"],
    queryFn: () => fetchUserNrOrdem(user!.id),
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });

  const [nrDialogOpen, setNrDialogOpen] = useState(false);
  const [nrOrdem, setNrOrdem] = useState("");
  const [nrError, setNrError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setNrDialogOpen(false);
      setNrOrdem("");
      return;
    }
    if (nrOrdemQuery.isSuccess) {
      const current = nrOrdemQuery.data;
      const requires = !current;
      setNrDialogOpen(requires);
      if (current) setNrOrdem(String(current));
    }
  }, [user?.id, nrOrdemQuery.isSuccess, nrOrdemQuery.data]);

  const saveNrMutation = useMutation({
    mutationFn: (value: string) => syncIdNrOrdem(user as User, value),
    onMutate: async (value) => {
      setNrError(null);
      await queryClient.cancelQueries({
        queryKey: ["user", user?.id, "nrOrdem"],
      });
      const prev = queryClient.getQueryData(["user", user?.id, "nrOrdem"]);
      queryClient.setQueryData(["user", user?.id, "nrOrdem"], value);
      return { prev };
    },
    onError: (e, _value, ctx) => {
      console.error("Erro ao salvar nrOrdem:", e);
      if (ctx?.prev) {
        queryClient.setQueryData(["user", user?.id, "nrOrdem"], ctx.prev);
      }
      setNrError("Não foi possível salvar. Tente novamente.");
    },
    onSuccess: () => setNrDialogOpen(false),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ["user", user?.id, "nrOrdem"],
      });
    },
  });

  const handleSubmitNrOrdem = useCallback(() => {
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
    if (!user) return;
    saveNrMutation.mutate(digitsOnly);
  }, [nrOrdem, saveNrMutation, user]);

  const isSavingNrReal = saveNrMutation.isPending;

  // evaluation (opcional)
  const evaluationQuery = useQuery({
    queryKey: ["evaluation", user?.id],
    queryFn: () => fetchEvaluationForUser(user!.id),
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });

  const [evaluationDialogOpen, setEvaluationDialogOpen] = useState(false);
  const [selectedRating, setSelectedRating] = useState<number | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setEvaluationDialogOpen(false);
      setSelectedRating(null);
      return;
    }
    if (evaluationQuery.isSuccess && !nrDialogOpen) {
      const { shouldAsk, question } = evaluationQuery.data;
      setEvaluationDialogOpen(!!question && shouldAsk);
      if (!shouldAsk) setSelectedRating(null);
    }
  }, [user?.id, evaluationQuery.isSuccess, evaluationQuery.data, nrDialogOpen]);

  const submitVoteMutation = useMutation({
    mutationFn: async (payload: { value: number; question: string }) => {
      const { error } = await supabase.from("opinions").insert([
        {
          value: payload.value,
          question: payload.question,
          userId: user!.id,
        },
      ]);
      if (error) throw error;
    },
    onError: (e) => console.error("Erro ao registrar voto:", e),
    onSuccess: () => setEvaluationDialogOpen(false),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["evaluation", user?.id] });
    },
  });

  const isSubmittingVote = submitVoteMutation.isPending;
  const handleSubmitVote = useCallback(() => {
    const q = evaluationQuery.data?.question ?? null;
    if (!user?.id || !q || selectedRating == null) return;
    submitVoteMutation.mutate({ value: selectedRating, question: q });
  }, [
    user?.id,
    selectedRating,
    submitVoteMutation,
    evaluationQuery.data?.question,
  ]);

  // mobile sidebar
  const [sheetOpen, setSheetOpen] = useState(false);

  // user QR dialog
  const [qrOpen, setQrOpen] = useState(false);

  return (
    <>
      {/* nrOrdem dialog */}
      <Dialog
        open={nrDialogOpen}
        onOpenChange={(open) => {
          if (!open && !nrOrdemQuery.data) setNrDialogOpen(true);
        }}
      >
        <DialogContent
          className="sm:max-w-md"
          showCloseButton={false}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
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
              placeholder="Ex.: 1234567"
              onChange={(e) => {
                const onlyDigits = e.target.value.replace(/\D/g, "");
                setNrOrdem(onlyDigits);
                if (nrError) setNrError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSubmitNrOrdem();
                }
              }}
              autoFocus
            />
            {nrError && <p className="text-sm text-destructive">{nrError}</p>}
            <p className="text-xs text-muted-foreground">
              Usaremos esse dado apenas para identificar seu registro.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              onClick={handleSubmitNrOrdem}
              disabled={isSavingNrReal || nrOrdem.trim().length === 0}
            >
              {isSavingNrReal ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-b-transparent" />
                  Salvando...
                </span>
              ) : (
                "Salvar e continuar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* evaluation dialog */}
      <Dialog
        open={
          evaluationDialogOpen &&
          !nrDialogOpen &&
          !!evaluationQuery.data?.question
        }
        onOpenChange={(open) => {
          setEvaluationDialogOpen(open);
          if (!open) setSelectedRating(null);
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Avaliação rápida</DialogTitle>
            <DialogDescription className="text-foreground text-2xl py-4 text-center">
              {evaluationQuery.data?.question || "Como você avalia?"}
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <p className="text-sm text-muted-foreground mb-3 text-center">
              Sua opinião ajuda a melhorar a experiência. Escolha uma nota de 1
              a 5:
            </p>

            <div className="relative mx-auto w-full max-w-xs">
              <div className="relative flex items-center justify-between gap-2 p-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={selectedRating === n}
                    aria-label={`Nota ${n}`}
                    onClick={() => setSelectedRating(n)}
                    className={ratingClasses(n, selectedRating)}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-muted-foreground px-2">
                <span>Péssimo</span>
                <span>Excelente</span>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button
              type="button"
              onClick={handleSubmitVote}
              disabled={selectedRating == null || isSubmittingVote}
              className={
                selectedRating == null
                  ? ""
                  : selectedRating <= 2
                    ? "bg-destructive text-destructive-foreground hover:opacity-90"
                    : selectedRating === 3
                      ? "bg-secondary text-secondary-foreground hover:opacity-90"
                      : "bg-primary text-primary-foreground hover:opacity-90"
              }
            >
              {isSubmittingVote ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-b-transparent" />
                  Enviando...
                </span>
              ) : (
                "Enviar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* user QR dialog */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="w-[95vw] max-w-md p-0 overflow-hidden">
          <div className="bg-primary text-primary-foreground px-4 sm:px-6 py-3 sm:py-4">
            <DialogHeader>
              <DialogTitle className="text-lg sm:text-xl font-bold flex items-center gap-2">
                <span className="inline-flex p-1.5 sm:p-2 bg-primary-foreground/15 rounded-lg">
                  <QrCode className="h-4 w-4 sm:h-5 sm:w-5" />
                </span>
                <span>Seu QR Code</span>
              </DialogTitle>
              <DialogDescription className="text-primary-foreground/80 mt-1 sm:mt-2 text-sm">
                Use este código para identificação rápida no sistema
              </DialogDescription>
              <DialogPrimitive.Close
                data-slot="dialog-close"
                className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-90 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
              >
                <XIcon className="stroke-background" />
                <span className="sr-only">Close</span>
              </DialogPrimitive.Close>
            </DialogHeader>
          </div>

          <div className="px-3 sm:px-6 py-4 sm:py-8 bg-muted">
            <div className="flex flex-col items-center gap-3 sm:gap-4">
              <div className="bg-white p-3 sm:p-6 rounded-xl sm:rounded-2xl shadow-lg border-2 sm:border-4">
                {/* Responsivo sem usar window: tamanhos via breakpoints */}
                <div className="sm:hidden bg-white">
                  <QRCodeCanvas value={user?.id || ""} size={140} level="M" />
                </div>
                <div className="hidden sm:block bg-white">
                  <QRCodeCanvas value={user?.id || ""} size={180} level="M" />
                </div>
              </div>

              <div className="text-center space-y-2 w-full max-w-xs sm:max-w-sm">
                <p className="text-xs sm:text-sm font-medium text-muted-foreground">
                  ID do Usuário
                </p>
                <div className="bg-card px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg border font-mono text-xs text-foreground w-full overflow-hidden">
                  <span className="block truncate text-center">
                    {user?.id || "N/A"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* App layout com sidebar */}
      <div className="min-h-[100svh] supports-[height:100dvh]:min-h-[100dvh] grid grid-cols-1 md:grid-cols-[240px_1fr]">
        {/* Sidebar desktop (somente para quem tem perfil) */}
        <aside className="hidden md:block">
          {showSidebar ? <Sidebar items={navItems} /> : null}
        </aside>

        {/* Conteúdo */}
        <div className="flex min-h-[100svh] flex-col">
          {/* Topbar */}
          <header className="h-14 border-b bg-background flex items-center justify-between px-3">
            <div className="flex items-center gap-2">
              {/* Sidebar mobile (somente para quem tem perfil) */}
              {showSidebar ? (
                <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                  <SheetTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="md:hidden"
                      aria-label="Abrir menu"
                    >
                      <Menu className="h-5 w-5" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="p-0 w-72">
                    <SheetHeader className="px-4 py-3 border-b">
                      <SheetTitle>SISUB</SheetTitle>
                    </SheetHeader>
                    <Sidebar
                      items={navItems}
                      onNavigate={() => setSheetOpen(false)}
                    />
                  </SheetContent>
                </Sheet>
              ) : null}

              <Separator
                orientation="vertical"
                className="h-6 hidden sm:block"
              />
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setQrOpen(true)}
                className="flex items-center gap-2 hover:bg-primary/10 hover:border-primary/30 hover:text-primary transition-colors"
                aria-label="Abrir QR do usuário"
                disabled={!user?.id}
                title={user?.id ? "Mostrar QR" : "Usuário não identificado"}
              >
                <QrCode className="h-4 w-4" />
                <span className="hidden sm:inline font-medium">QR</span>
              </Button>

              <ModeToggle />
              <UserMenu />
            </div>
          </header>

          {/* Main */}
          <main id="conteudo" className="flex-1">
            <div
              className="
                relative isolate flex flex-col bg-background text-foreground
                min-h-[100svh] supports-[height:100dvh]:min-h-[100dvh]

                before:content-[''] before:absolute before:inset-0 before:-z-10 before:pointer-events-none
                before:bg-[radial-gradient(900px_600px_at_10%_-10%,hsl(var(--accent)_/_0.14),transparent_60%),radial-gradient(800px_500px_at_90%_0%,hsl(var(--primary)_/_0.12),transparent_60%),radial-gradient(700px_700px_at_50%_100%,hsl(var(--secondary)_/_0.10),transparent_60%)]
                dark:before:bg-[radial-gradient(900px_600px_at_10%_-10%,hsl(var(--accent)_/_0.18),transparent_60%),radial-gradient(800px_500px_at_90%_0%,hsl(var(--primary)_/_0.16),transparent_60%),radial-gradient(700px_700px_at_50%_100%,hsl(var(--secondary)_/_0.14),transparent_60%)]

                before:transform-gpu motion-safe:before:animate-[slow-pan_32s_ease-in-out_infinite]

                after:content-[''] after:pointer-events-none after:absolute after:inset-0 after:-z-10
                after:bg-[radial-gradient(circle_at_1px_1px,hsl(var(--foreground)_/_0.8)_1px,transparent_1px)]
                after:bg-[length:12px_12px] after:opacity-[0.02]
                dark:after:opacity-[0.04]
              "
            >
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </>
  );
}

export default function AppLayout() {
  return (
    <ProtectedBoundary>
      <AppShell />
    </ProtectedBoundary>
  );
}

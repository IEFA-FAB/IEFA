import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { PassThrough } from "node:stream";
import { createReadableStreamFromReadable } from "@react-router/node";
import { ServerRouter, useLocation, Navigate, Outlet, useNavigate, Link, UNSAFE_withComponentProps, Meta, Links, ScrollRestoration, Scripts, NavLink, useSearchParams } from "react-router";
import { isbot } from "isbot";
import { renderToPipeableStream } from "react-dom/server";
import * as React from "react";
import React__default, { useContext, createContext, useState, useRef, useCallback, useEffect, useMemo, useId, memo, lazy, Suspense, useReducer } from "react";
import { createClient } from "@supabase/supabase-js";
import { QueryClient, QueryClientProvider, useInfiniteQuery, useQuery, useQueryClient, useQueries, useMutation, useIsFetching, useIsMutating } from "@tanstack/react-query";
import { cva } from "class-variance-authority";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Slot } from "@radix-ui/react-slot";
import * as LabelPrimitive from "@radix-ui/react-label";
import { CheckIcon, XIcon, PanelLeftIcon, ChevronDownIcon, ChevronUpIcon, Sun, Moon, Loader2, AlertCircle, CheckCircle, Mail, Lock, EyeOff, Eye, Check, X, BarChart3, QrCode, Users, Bell, ShieldCheck, Settings, Star, Calendar, ClipboardCheck, UtensilsCrossed, Coffee, Pizza, Cake, PlayCircle, BookOpen, FileText, Clock, ChevronRight, Info, CalendarCheck, Save, RefreshCw, Camera, HelpCircle, AlertTriangle, Copy, Download, EllipsisVertical, User, LogOut, ChevronsUpDown, Utensils, MapPin, CalendarDays, MinusCircle, CheckCircle2, Trash2, UserPlus, Shield, ExternalLink, Maximize2, ArrowUpDown, MoreHorizontal, ChevronDown } from "lucide-react";
import * as SeparatorPrimitive from "@radix-ui/react-separator";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { useTheme as useTheme$1 } from "next-themes";
import { Toaster as Toaster$1, toast } from "sonner";
import { QRCodeCanvas } from "qrcode.react";
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import * as SelectPrimitive from "@radix-ui/react-select";
import QrScanner from "qr-scanner";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { useReactTable, getFilteredRowModel, getSortedRowModel, getPaginationRowModel, getCoreRowModel, flexRender } from "@tanstack/react-table";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
const streamTimeout = 5e3;
function handleRequest(request, responseStatusCode, responseHeaders, routerContext, loadContext) {
  return new Promise((resolve, reject) => {
    let shellRendered = false;
    let userAgent = request.headers.get("user-agent");
    let readyOption = userAgent && isbot(userAgent) || routerContext.isSpaMode ? "onAllReady" : "onShellReady";
    let timeoutId = setTimeout(
      () => abort(),
      streamTimeout + 1e3
    );
    const { pipe, abort } = renderToPipeableStream(
      /* @__PURE__ */ jsx(ServerRouter, { context: routerContext, url: request.url }),
      {
        [readyOption]() {
          shellRendered = true;
          const body = new PassThrough({
            final(callback) {
              clearTimeout(timeoutId);
              timeoutId = void 0;
              callback();
            }
          });
          const stream = createReadableStreamFromReadable(body);
          responseHeaders.set("Content-Type", "text/html");
          pipe(body);
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode
            })
          );
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          if (shellRendered) {
            console.error(error);
          }
        }
      }
    );
  });
}
const entryServer = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: handleRequest,
  streamTimeout
}, Symbol.toStringTag, { value: "Module" }));
function normalizeAuthError(e) {
  const status = e?.status;
  const msg = e?.message || "Erro de autenticação";
  if (/invalid login credentials/i.test(msg)) {
    return {
      code: "INVALID_CREDENTIALS",
      message: "Email ou senha incorretos"
    };
  }
  if (/email not confirmed/i.test(msg)) {
    return {
      code: "EMAIL_NOT_CONFIRMED",
      message: "Por favor, confirme seu email antes de fazer login"
    };
  }
  if (/rate limit/i.test(msg) || status === 429) {
    return {
      code: "RATE_LIMITED",
      message: "Muitas tentativas. Aguarde um pouco e tente novamente."
    };
  }
  if (/invalid format/i.test(msg)) {
    return { code: "INVALID_EMAIL", message: "Formato de email inválido" };
  }
  if (/at least 6 characters/i.test(msg)) {
    return {
      code: "WEAK_PASSWORD",
      message: "A senha deve ter pelo menos 6 caracteres"
    };
  }
  if (/signup is disabled/i.test(msg)) {
    return {
      code: "SIGNUP_DISABLED",
      message: "Cadastro temporariamente desabilitado"
    };
  }
  if (/user already registered/i.test(msg)) {
    return {
      code: "ALREADY_REGISTERED",
      message: "Este email já está cadastrado"
    };
  }
  return { code: "UNKNOWN", message: msg };
}
function getAuthErrorMessage(error) {
  switch (error.message) {
    case "Invalid login credentials":
      return "Email ou senha incorretos";
    case "Email not confirmed":
      return "Por favor, confirme seu email antes de fazer login";
    case "User already registered":
      return "Este email já está cadastrado";
    case "Password should be at least 6 characters":
      return "A senha deve ter pelo menos 6 caracteres";
    case "Unable to validate email address: invalid format":
      return "Formato de email inválido";
    case "Signup is disabled":
      return "Cadastro temporariamente desabilitado";
    default:
      return error.message;
  }
}
const AuthContext = createContext(void 0);
function normalizeEmail(email) {
  return email.trim().toLowerCase();
}
function AuthProvider({
  supabase: supabase2,
  children
}) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const mountedRef = useRef(true);
  const handleAuthChange = useCallback((s) => {
    setSession(s);
    setUser(s?.user ?? null);
  }, []);
  useEffect(() => {
    mountedRef.current = true;
    (async () => {
      try {
        const { data: data2, error } = await supabase2.auth.getSession();
        if (error) {
          console.error("Error getting initial session:", error);
        }
        if (mountedRef.current) {
          handleAuthChange(data2?.session ?? null);
        }
      } catch (e) {
        console.error("Error initializing auth:", e);
      } finally {
        if (mountedRef.current) setIsLoading(false);
      }
    })();
    const { data } = supabase2.auth.onAuthStateChange((_event, s) => {
      if (!mountedRef.current) return;
      handleAuthChange(s ?? null);
      setIsLoading(false);
    });
    return () => {
      mountedRef.current = false;
      data.subscription.unsubscribe();
    };
  }, [supabase2, handleAuthChange]);
  const signIn = useCallback(
    async (email, password) => {
      try {
        const { error } = await supabase2.auth.signInWithPassword({
          email: normalizeEmail(email),
          password
        });
        if (error) {
          const normalized = normalizeAuthError(error);
          const err = new Error(normalized.message);
          err.code = normalized.code;
          err.status = error?.status;
          throw err;
        }
      } catch (e) {
        if (e?.message) throw e;
        throw new Error("Não foi possível entrar. Tente novamente mais tarde.");
      }
    },
    [supabase2]
  );
  const signUp = useCallback(
    async (email, password, redirectTo) => {
      try {
        const { error } = await supabase2.auth.signUp({
          email: normalizeEmail(email),
          password,
          options: {
            emailRedirectTo: redirectTo ?? (typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : void 0)
          }
        });
        if (error) throw new Error(getAuthErrorMessage(error));
      } catch (e) {
        if (e?.message) throw e;
        throw new Error(
          "Não foi possível cadastrar. Tente novamente mais tarde."
        );
      }
    },
    [supabase2]
  );
  const signOut = useCallback(
    async (opts) => {
      try {
        handleAuthChange(null);
        const { error } = await supabase2.auth.signOut();
        if (error) {
          console.error("Sign out error:", error);
        }
      } catch (e) {
        console.error("Sign out error:", e);
      } finally {
        if (opts?.reload && typeof window !== "undefined") {
          window.location.assign(opts.redirectTo ?? "/login");
        }
      }
    },
    [supabase2, handleAuthChange]
  );
  const resetPassword2 = useCallback(
    async (email, redirectTo) => {
      try {
        const { error } = await supabase2.auth.resetPasswordForEmail(
          normalizeEmail(email),
          {
            redirectTo: redirectTo ?? (typeof window !== "undefined" ? `${window.location.origin}/auth/reset-password` : void 0)
          }
        );
        if (error) throw new Error(getAuthErrorMessage(error));
      } catch (e) {
        if (e?.message) throw e;
        throw new Error("Não foi possível iniciar a recuperação de senha.");
      }
    },
    [supabase2]
  );
  const refreshSession = useCallback(async () => {
    const { data, error } = await supabase2.auth.refreshSession();
    if (error) throw new Error(getAuthErrorMessage(error));
    handleAuthChange(data?.session ?? null);
  }, [supabase2, handleAuthChange]);
  const value = useMemo(
    () => ({
      user,
      session,
      isLoading,
      isAuthenticated: !!session?.user,
      signIn,
      signUp,
      signOut,
      resetPassword: resetPassword2,
      refreshSession
    }),
    [
      user,
      session,
      isLoading,
      signIn,
      signUp,
      signOut,
      resetPassword2,
      refreshSession
    ]
  );
  return /* @__PURE__ */ jsx(AuthContext.Provider, { value, children });
}
const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
};
const FAB_EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@fab\.mil\.br$/;
const STORAGE_KEYS = {
  rememberEmail: "fab_remember_email"
};
function getSafeSessionStorage() {
  try {
    if (typeof window !== "undefined" && typeof window.sessionStorage !== "undefined") {
      return window.sessionStorage;
    }
  } catch {
  }
  return null;
}
function getRedirectCandidates(locationSearch, locationState, redirectKey) {
  const params = new URLSearchParams(locationSearch || "");
  const qsTarget = params.get("redirectTo");
  const stateFrom = locationState?.from;
  const stateTarget = stateFrom && typeof stateFrom === "object" ? `${stateFrom.pathname ?? ""}${stateFrom.search ?? ""}` : locationState?.from?.pathname || null;
  const ss = getSafeSessionStorage();
  const stored = ss?.getItem(redirectKey) ?? null;
  return { qsTarget, stateTarget, stored };
}
function getRedirectTo(locationSearch, locationState) {
  const params = new URLSearchParams(locationSearch || "");
  const qsTarget = params.get("redirectTo");
  const stateTarget = locationState?.from?.pathname;
  return qsTarget ?? stateTarget ?? null;
}
function safeRedirect(target, fallback = "/") {
  if (!target) return fallback;
  let decoded = target;
  try {
    decoded = decodeURIComponent(target);
  } catch {
  }
  if (decoded.startsWith("/") && !decoded.startsWith("//")) {
    return decoded;
  }
  return fallback;
}
function preserveRedirectFromQuery(locationSearch, redirectKey) {
  const params = new URLSearchParams(locationSearch || "");
  const qsRedirect = params.get("redirectTo");
  if (qsRedirect) {
    const ss = getSafeSessionStorage();
    ss?.setItem(redirectKey, qsRedirect);
  }
}
function resolveTarget(locationSearch, locationState, defaultRedirect, redirectKey) {
  const { qsTarget, stateTarget, stored } = getRedirectCandidates(
    locationSearch,
    locationState,
    redirectKey
  );
  const target = safeRedirect(
    qsTarget ?? stored ?? stateTarget,
    defaultRedirect
  );
  return { target, stored };
}
const DEFAULT_CONFIG = {
  loginPath: "/login",
  defaultRedirect: "/rancho",
  publicPaths: [
    "/login",
    "/register",
    "/auth/reset-password",
    "/health",
    "/favicon.ico",
    "/favicon.svg",
    (p) => p.startsWith("/assets")
  ],
  emailRegex: /^[a-zA-Z0-9._%+-]+@fab\.mil\.br$/,
  storageKeys: {
    rememberEmail: "fab_remember_email",
    redirect: "auth:redirectTo"
  },
  brand: {
    title: "SISUB",
    subtitle: "Gerencie a demanda do rancho",
    logoUrl: ""
  },
  ui: {
    loginTitle: "Entrar",
    loginSubtitle: "Acesso restrito a emails @fab.mil.br",
    loginButton: "Entrar",
    forgotPassword: "Esqueceu a senha?",
    rememberEmail: "Lembrar email",
    invalidEmailMsg: "Por favor, utilize um email institucional (@fab.mil.br).",
    weakPasswordMsg: "A senha deve ter pelo menos 6 caracteres.",
    sendingMsg: "Enviando...",
    registerTitle: "Criar Conta",
    registerSubtitle: "Acesso restrito a emails @fab.mil.br",
    createAccountBtn: "Criar Conta",
    resetTitle: "Definir nova senha",
    resetSubtitle: "Crie sua nova senha para acessar o sistema",
    updatingPasswordBtn: "Atualizar senha",
    checkingAuth: "Verificando autenticação...",
    recoveringEmailSent: "Email de recuperação enviado! Verifique sua caixa de entrada.",
    genericAuthError: "Ocorreu um erro durante a autenticação. Tente mais tarde."
  }
};
function resolveAuthConfig(overrides) {
  const base = DEFAULT_CONFIG;
  return {
    ...base,
    ...overrides,
    storageKeys: { ...base.storageKeys, ...overrides?.storageKeys },
    brand: { ...base.brand, ...overrides?.brand },
    ui: { ...base.ui, ...overrides?.ui },
    publicPaths: overrides?.publicPaths ?? base.publicPaths
  };
}
function AuthLayout({ variant = "full", config, LoaderIcon }) {
  const cfg = resolveAuthConfig(config);
  const { user, isLoading } = useAuth();
  const location = useLocation();
  useEffect(() => {
    preserveRedirectFromQuery(location.search, cfg.storageKeys.redirect);
  }, [location.search, cfg.storageKeys.redirect]);
  const { target, stored } = resolveTarget(
    location.search,
    location.state,
    cfg.defaultRedirect,
    cfg.storageKeys.redirect
  );
  const isResetPasswordRoute = location.pathname.startsWith(
    "/auth/reset-password"
  );
  if (isLoading && variant === "full") {
    return /* @__PURE__ */ jsxs("div", { className: "h-full w-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8", children: [
      /* @__PURE__ */ jsxs("div", { className: "sm:mx-auto sm:w-full sm:max-w-md text-center", children: [
        cfg.brand.logoUrl ? /* @__PURE__ */ jsx(
          "img",
          {
            src: cfg.brand.logoUrl,
            alt: cfg.brand.title,
            className: "mx-auto h-16"
          }
        ) : /* @__PURE__ */ jsx("h1", { className: "text-7xl md:text-8xl text-blue-600 font-black", children: cfg.brand.title }),
        cfg.brand.subtitle && /* @__PURE__ */ jsx("p", { className: "text-gray-600", children: cfg.brand.subtitle })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "mt-8 sm:mx-auto sm:w-full sm:max-w-md", children: /* @__PURE__ */ jsxs("div", { className: "w-full flex items-center justify-center py-12 bg-white rounded-md shadow-sm", children: [
        LoaderIcon ? /* @__PURE__ */ jsx(LoaderIcon, { className: "h-6 w-6 animate-spin text-gray-500" }) : null,
        /* @__PURE__ */ jsx("span", { className: "ml-2 text-sm text-gray-600", children: cfg.ui.checkingAuth })
      ] }) })
    ] });
  }
  if (user && !isResetPasswordRoute) {
    if (stored) sessionStorage.removeItem(cfg.storageKeys.redirect);
    return /* @__PURE__ */ jsx(Navigate, { to: target, replace: true });
  }
  if (variant === "strip") {
    return /* @__PURE__ */ jsx(Outlet, {});
  }
  return /* @__PURE__ */ jsxs("div", { className: "h-full flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-gray-50", children: [
    /* @__PURE__ */ jsx("div", { className: "sm:mx-auto sm:w-full sm:max-w-md", children: /* @__PURE__ */ jsxs("div", { className: "text-center", children: [
      cfg.brand.logoUrl ? /* @__PURE__ */ jsx(
        "img",
        {
          src: cfg.brand.logoUrl,
          alt: cfg.brand.title,
          className: "mx-auto h-16"
        }
      ) : /* @__PURE__ */ jsx("h1", { className: "text-7xl md:text-8xl font-black text-blue-600", children: cfg.brand.title }),
      cfg.brand.subtitle && /* @__PURE__ */ jsx("p", { className: "text-gray-600", children: cfg.brand.subtitle })
    ] }) }),
    /* @__PURE__ */ jsx("div", { className: "mt-8 sm:mx-auto sm:w-full sm:max-w-md", children: /* @__PURE__ */ jsx(Outlet, {}) })
  ] });
}
function cn$2(...inputs) {
  return twMerge(clsx(inputs));
}
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive cursor-pointer",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline: "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline"
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);
function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}) {
  const Comp = asChild ? Slot : "button";
  return /* @__PURE__ */ jsx(
    Comp,
    {
      "data-slot": "button",
      className: cn$2(buttonVariants({ variant, size, className })),
      ...props
    }
  );
}
function AlertDialog({
  ...props
}) {
  return /* @__PURE__ */ jsx(AlertDialogPrimitive.Root, { "data-slot": "alert-dialog", ...props });
}
function AlertDialogPortal({
  ...props
}) {
  return /* @__PURE__ */ jsx(AlertDialogPrimitive.Portal, { "data-slot": "alert-dialog-portal", ...props });
}
function AlertDialogOverlay({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    AlertDialogPrimitive.Overlay,
    {
      "data-slot": "alert-dialog-overlay",
      className: cn$2(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className
      ),
      ...props
    }
  );
}
function AlertDialogContent({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsxs(AlertDialogPortal, { children: [
    /* @__PURE__ */ jsx(AlertDialogOverlay, {}),
    /* @__PURE__ */ jsx(
      AlertDialogPrimitive.Content,
      {
        "data-slot": "alert-dialog-content",
        className: cn$2(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg",
          className
        ),
        ...props
      }
    )
  ] });
}
function AlertDialogHeader({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      "data-slot": "alert-dialog-header",
      className: cn$2("flex flex-col gap-2 text-center sm:text-left", className),
      ...props
    }
  );
}
function AlertDialogFooter({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      "data-slot": "alert-dialog-footer",
      className: cn$2(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      ),
      ...props
    }
  );
}
function AlertDialogTitle({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    AlertDialogPrimitive.Title,
    {
      "data-slot": "alert-dialog-title",
      className: cn$2("text-lg font-semibold", className),
      ...props
    }
  );
}
function AlertDialogDescription({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    AlertDialogPrimitive.Description,
    {
      "data-slot": "alert-dialog-description",
      className: cn$2("text-muted-foreground text-sm", className),
      ...props
    }
  );
}
function AlertDialogAction({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    AlertDialogPrimitive.Action,
    {
      className: cn$2(buttonVariants(), className),
      ...props
    }
  );
}
function AlertDialogCancel({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    AlertDialogPrimitive.Cancel,
    {
      className: cn$2(buttonVariants({ variant: "outline" }), className),
      ...props
    }
  );
}
const alertVariants = cva(
  "relative w-full rounded-lg border px-4 py-3 text-sm grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 gap-y-0.5 items-start [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground",
        destructive: "text-destructive bg-card [&>svg]:text-current *:data-[slot=alert-description]:text-destructive/90"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);
function Alert({
  className,
  variant,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      "data-slot": "alert",
      role: "alert",
      className: cn$2(alertVariants({ variant }), className),
      ...props
    }
  );
}
function AlertDescription({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      "data-slot": "alert-description",
      className: cn$2(
        "text-muted-foreground col-start-2 grid justify-items-start gap-1 text-sm [&_p]:leading-relaxed",
        className
      ),
      ...props
    }
  );
}
function Avatar({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    AvatarPrimitive.Root,
    {
      "data-slot": "avatar",
      className: cn$2(
        "relative flex size-8 shrink-0 overflow-hidden rounded-full",
        className
      ),
      ...props
    }
  );
}
function AvatarImage({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    AvatarPrimitive.Image,
    {
      "data-slot": "avatar-image",
      className: cn$2("aspect-square size-full", className),
      ...props
    }
  );
}
function AvatarFallback({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    AvatarPrimitive.Fallback,
    {
      "data-slot": "avatar-fallback",
      className: cn$2(
        "bg-muted flex size-full items-center justify-center rounded-full",
        className
      ),
      ...props
    }
  );
}
const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary: "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive: "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline: "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);
function Badge({
  className,
  variant,
  asChild = false,
  ...props
}) {
  const Comp = asChild ? Slot : "span";
  return /* @__PURE__ */ jsx(
    Comp,
    {
      "data-slot": "badge",
      className: cn$2(badgeVariants({ variant }), className),
      ...props
    }
  );
}
function Card({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      "data-slot": "card",
      className: cn$2(
        "bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm",
        className
      ),
      ...props
    }
  );
}
function CardHeader({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      "data-slot": "card-header",
      className: cn$2(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      ),
      ...props
    }
  );
}
function CardTitle({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      "data-slot": "card-title",
      className: cn$2("leading-none font-semibold", className),
      ...props
    }
  );
}
function CardDescription({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      "data-slot": "card-description",
      className: cn$2("text-muted-foreground text-sm", className),
      ...props
    }
  );
}
function CardContent({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      "data-slot": "card-content",
      className: cn$2("px-6", className),
      ...props
    }
  );
}
function CardFooter({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      "data-slot": "card-footer",
      className: cn$2("flex items-center px-6 [.border-t]:pt-6", className),
      ...props
    }
  );
}
function Checkbox({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    CheckboxPrimitive.Root,
    {
      "data-slot": "checkbox",
      className: cn$2(
        "peer border-input dark:bg-input/30 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:data-[state=checked]:bg-primary data-[state=checked]:border-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive size-4 shrink-0 rounded-[4px] border shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        className
      ),
      ...props,
      children: /* @__PURE__ */ jsx(
        CheckboxPrimitive.Indicator,
        {
          "data-slot": "checkbox-indicator",
          className: "flex items-center justify-center text-current transition-none",
          children: /* @__PURE__ */ jsx(CheckIcon, { className: "size-3.5" })
        }
      )
    }
  );
}
function Collapsible({
  ...props
}) {
  return /* @__PURE__ */ jsx(CollapsiblePrimitive.Root, { "data-slot": "collapsible", ...props });
}
function CollapsibleTrigger({
  ...props
}) {
  return /* @__PURE__ */ jsx(
    CollapsiblePrimitive.CollapsibleTrigger,
    {
      "data-slot": "collapsible-trigger",
      ...props
    }
  );
}
function CollapsibleContent({
  ...props
}) {
  return /* @__PURE__ */ jsx(
    CollapsiblePrimitive.CollapsibleContent,
    {
      "data-slot": "collapsible-content",
      ...props
    }
  );
}
function Dialog({
  ...props
}) {
  return /* @__PURE__ */ jsx(DialogPrimitive.Root, { "data-slot": "dialog", ...props });
}
function DialogPortal({
  ...props
}) {
  return /* @__PURE__ */ jsx(DialogPrimitive.Portal, { "data-slot": "dialog-portal", ...props });
}
function DialogOverlay({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    DialogPrimitive.Overlay,
    {
      "data-slot": "dialog-overlay",
      className: cn$2(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className
      ),
      ...props
    }
  );
}
function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}) {
  return /* @__PURE__ */ jsxs(DialogPortal, { "data-slot": "dialog-portal", children: [
    /* @__PURE__ */ jsx(DialogOverlay, {}),
    /* @__PURE__ */ jsxs(
      DialogPrimitive.Content,
      {
        "data-slot": "dialog-content",
        className: cn$2(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg",
          className
        ),
        ...props,
        children: [
          children,
          showCloseButton && /* @__PURE__ */ jsxs(
            DialogPrimitive.Close,
            {
              "data-slot": "dialog-close",
              className: "ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
              children: [
                /* @__PURE__ */ jsx(XIcon, {}),
                /* @__PURE__ */ jsx("span", { className: "sr-only", children: "Close" })
              ]
            }
          )
        ]
      }
    )
  ] });
}
function DialogHeader({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      "data-slot": "dialog-header",
      className: cn$2("flex flex-col gap-2 text-center sm:text-left", className),
      ...props
    }
  );
}
function DialogFooter({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      "data-slot": "dialog-footer",
      className: cn$2(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      ),
      ...props
    }
  );
}
function DialogTitle({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    DialogPrimitive.Title,
    {
      "data-slot": "dialog-title",
      className: cn$2("text-lg leading-none font-semibold", className),
      ...props
    }
  );
}
function DialogDescription({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    DialogPrimitive.Description,
    {
      "data-slot": "dialog-description",
      className: cn$2("text-muted-foreground text-sm", className),
      ...props
    }
  );
}
function DropdownMenu({
  ...props
}) {
  return /* @__PURE__ */ jsx(DropdownMenuPrimitive.Root, { "data-slot": "dropdown-menu", ...props });
}
function DropdownMenuTrigger({
  ...props
}) {
  return /* @__PURE__ */ jsx(
    DropdownMenuPrimitive.Trigger,
    {
      "data-slot": "dropdown-menu-trigger",
      ...props
    }
  );
}
function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}) {
  return /* @__PURE__ */ jsx(DropdownMenuPrimitive.Portal, { children: /* @__PURE__ */ jsx(
    DropdownMenuPrimitive.Content,
    {
      "data-slot": "dropdown-menu-content",
      sideOffset,
      className: cn$2(
        "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-[8rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border p-1 shadow-md",
        className
      ),
      ...props
    }
  ) });
}
function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}) {
  return /* @__PURE__ */ jsx(
    DropdownMenuPrimitive.Item,
    {
      "data-slot": "dropdown-menu-item",
      "data-inset": inset,
      "data-variant": variant,
      className: cn$2(
        "focus:bg-accent focus:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 dark:data-[variant=destructive]:focus:bg-destructive/20 data-[variant=destructive]:focus:text-destructive data-[variant=destructive]:*:[svg]:!text-destructive [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      ),
      ...props
    }
  );
}
function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}) {
  return /* @__PURE__ */ jsxs(
    DropdownMenuPrimitive.CheckboxItem,
    {
      "data-slot": "dropdown-menu-checkbox-item",
      className: cn$2(
        "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      ),
      checked,
      ...props,
      children: [
        /* @__PURE__ */ jsx("span", { className: "pointer-events-none absolute left-2 flex size-3.5 items-center justify-center", children: /* @__PURE__ */ jsx(DropdownMenuPrimitive.ItemIndicator, { children: /* @__PURE__ */ jsx(CheckIcon, { className: "size-4" }) }) }),
        children
      ]
    }
  );
}
function DropdownMenuLabel({
  className,
  inset,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    DropdownMenuPrimitive.Label,
    {
      "data-slot": "dropdown-menu-label",
      "data-inset": inset,
      className: cn$2(
        "px-2 py-1.5 text-sm font-medium data-[inset]:pl-8",
        className
      ),
      ...props
    }
  );
}
function DropdownMenuSeparator({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    DropdownMenuPrimitive.Separator,
    {
      "data-slot": "dropdown-menu-separator",
      className: cn$2("bg-border -mx-1 my-1 h-px", className),
      ...props
    }
  );
}
function Label({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    LabelPrimitive.Root,
    {
      "data-slot": "label",
      className: cn$2(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      ),
      ...props
    }
  );
}
function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    SeparatorPrimitive.Root,
    {
      "data-slot": "separator",
      decorative,
      orientation,
      className: cn$2(
        "bg-border shrink-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px",
        className
      ),
      ...props
    }
  );
}
function Input({ className, type, ...props }) {
  return /* @__PURE__ */ jsx(
    "input",
    {
      type,
      "data-slot": "input",
      className: cn$2(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      ),
      ...props
    }
  );
}
function Textarea({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    "textarea",
    {
      "data-slot": "textarea",
      className: cn$2(
        "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      ),
      ...props
    }
  );
}
function Skeleton({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      "data-slot": "skeleton",
      className: cn$2("bg-accent animate-pulse rounded-md", className),
      ...props
    }
  );
}
const MOBILE_BREAKPOINT = 768;
function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(void 0);
  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return !!isMobile;
}
function Sheet({ ...props }) {
  return /* @__PURE__ */ jsx(DialogPrimitive.Root, { "data-slot": "sheet", ...props });
}
function SheetPortal({
  ...props
}) {
  return /* @__PURE__ */ jsx(DialogPrimitive.Portal, { "data-slot": "sheet-portal", ...props });
}
function SheetOverlay({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    DialogPrimitive.Overlay,
    {
      "data-slot": "sheet-overlay",
      className: cn$2(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className
      ),
      ...props
    }
  );
}
function SheetContent({
  className,
  children,
  side = "right",
  ...props
}) {
  return /* @__PURE__ */ jsxs(SheetPortal, { children: [
    /* @__PURE__ */ jsx(SheetOverlay, {}),
    /* @__PURE__ */ jsxs(
      DialogPrimitive.Content,
      {
        "data-slot": "sheet-content",
        className: cn$2(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out fixed z-50 flex flex-col gap-4 shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
          side === "right" && "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm",
          side === "left" && "data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm",
          side === "top" && "data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top inset-x-0 top-0 h-auto border-b",
          side === "bottom" && "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom inset-x-0 bottom-0 h-auto border-t",
          className
        ),
        ...props,
        children: [
          children,
          /* @__PURE__ */ jsxs(DialogPrimitive.Close, { className: "ring-offset-background focus:ring-ring data-[state=open]:bg-secondary absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none", children: [
            /* @__PURE__ */ jsx(XIcon, { className: "size-4" }),
            /* @__PURE__ */ jsx("span", { className: "sr-only", children: "Close" })
          ] })
        ]
      }
    )
  ] });
}
function SheetHeader({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      "data-slot": "sheet-header",
      className: cn$2("flex flex-col gap-1.5 p-4", className),
      ...props
    }
  );
}
function SheetTitle({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    DialogPrimitive.Title,
    {
      "data-slot": "sheet-title",
      className: cn$2("text-foreground font-semibold", className),
      ...props
    }
  );
}
function SheetDescription({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    DialogPrimitive.Description,
    {
      "data-slot": "sheet-description",
      className: cn$2("text-muted-foreground text-sm", className),
      ...props
    }
  );
}
function TooltipProvider({
  delayDuration = 0,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    TooltipPrimitive.Provider,
    {
      "data-slot": "tooltip-provider",
      delayDuration,
      ...props
    }
  );
}
function Tooltip({
  ...props
}) {
  return /* @__PURE__ */ jsx(TooltipProvider, { children: /* @__PURE__ */ jsx(TooltipPrimitive.Root, { "data-slot": "tooltip", ...props }) });
}
function TooltipTrigger({
  ...props
}) {
  return /* @__PURE__ */ jsx(TooltipPrimitive.Trigger, { "data-slot": "tooltip-trigger", ...props });
}
function TooltipContent({
  className,
  sideOffset = 0,
  children,
  ...props
}) {
  return /* @__PURE__ */ jsx(TooltipPrimitive.Portal, { children: /* @__PURE__ */ jsxs(
    TooltipPrimitive.Content,
    {
      "data-slot": "tooltip-content",
      sideOffset,
      className: cn$2(
        "bg-foreground text-background animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-fit origin-(--radix-tooltip-content-transform-origin) rounded-md px-3 py-1.5 text-xs text-balance",
        className
      ),
      ...props,
      children: [
        children,
        /* @__PURE__ */ jsx(TooltipPrimitive.Arrow, { className: "bg-foreground fill-foreground z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px]" })
      ]
    }
  ) });
}
const SIDEBAR_COOKIE_NAME = "sidebar_state";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SIDEBAR_WIDTH = "16rem";
const SIDEBAR_WIDTH_MOBILE = "18rem";
const SIDEBAR_WIDTH_ICON = "3rem";
const SIDEBAR_KEYBOARD_SHORTCUT = "b";
const SidebarContext = React.createContext(null);
function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }
  return context;
}
function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  style,
  children,
  ...props
}) {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = React.useState(false);
  const [_open, _setOpen] = React.useState(defaultOpen);
  const open = openProp ?? _open;
  const setOpen = React.useCallback(
    (value) => {
      const openState = typeof value === "function" ? value(open) : value;
      if (setOpenProp) {
        setOpenProp(openState);
      } else {
        _setOpen(openState);
      }
      document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
    },
    [setOpenProp, open]
  );
  const toggleSidebar = React.useCallback(() => {
    return isMobile ? setOpenMobile((open2) => !open2) : setOpen((open2) => !open2);
  }, [isMobile, setOpen, setOpenMobile]);
  React.useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === SIDEBAR_KEYBOARD_SHORTCUT && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);
  const state = open ? "expanded" : "collapsed";
  const contextValue = React.useMemo(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar
    }),
    [state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar]
  );
  return /* @__PURE__ */ jsx(SidebarContext.Provider, { value: contextValue, children: /* @__PURE__ */ jsx(TooltipProvider, { delayDuration: 0, children: /* @__PURE__ */ jsx(
    "div",
    {
      "data-slot": "sidebar-wrapper",
      style: {
        "--sidebar-width": SIDEBAR_WIDTH,
        "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
        ...style
      },
      className: cn$2(
        "group/sidebar-wrapper has-data-[variant=inset]:bg-sidebar flex min-h-svh w-full",
        className
      ),
      ...props,
      children
    }
  ) }) });
}
function Sidebar({
  side = "left",
  variant = "sidebar",
  collapsible = "offcanvas",
  className,
  children,
  ...props
}) {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar();
  if (collapsible === "none") {
    return /* @__PURE__ */ jsx(
      "div",
      {
        "data-slot": "sidebar",
        className: cn$2(
          "bg-sidebar text-sidebar-foreground flex h-full w-(--sidebar-width) flex-col",
          className
        ),
        ...props,
        children
      }
    );
  }
  if (isMobile) {
    return /* @__PURE__ */ jsx(Sheet, { open: openMobile, onOpenChange: setOpenMobile, ...props, children: /* @__PURE__ */ jsxs(
      SheetContent,
      {
        "data-sidebar": "sidebar",
        "data-slot": "sidebar",
        "data-mobile": "true",
        className: "bg-sidebar text-sidebar-foreground w-(--sidebar-width) p-0 [&>button]:hidden",
        style: {
          "--sidebar-width": SIDEBAR_WIDTH_MOBILE
        },
        side,
        children: [
          /* @__PURE__ */ jsxs(SheetHeader, { className: "sr-only", children: [
            /* @__PURE__ */ jsx(SheetTitle, { children: "Sidebar" }),
            /* @__PURE__ */ jsx(SheetDescription, { children: "Displays the mobile sidebar." })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "flex h-full w-full flex-col", children })
        ]
      }
    ) });
  }
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: "group peer text-sidebar-foreground hidden md:block",
      "data-state": state,
      "data-collapsible": state === "collapsed" ? collapsible : "",
      "data-variant": variant,
      "data-side": side,
      "data-slot": "sidebar",
      children: [
        /* @__PURE__ */ jsx(
          "div",
          {
            "data-slot": "sidebar-gap",
            className: cn$2(
              "relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear",
              "group-data-[collapsible=offcanvas]:w-0",
              "group-data-[side=right]:rotate-180",
              variant === "floating" || variant === "inset" ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]" : "group-data-[collapsible=icon]:w-(--sidebar-width-icon)"
            )
          }
        ),
        /* @__PURE__ */ jsx(
          "div",
          {
            "data-slot": "sidebar-container",
            className: cn$2(
              "fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear md:flex",
              side === "left" ? "left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]" : "right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]",
              // Adjust the padding for floating and inset variants.
              variant === "floating" || variant === "inset" ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]" : "group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-r group-data-[side=right]:border-l",
              className
            ),
            ...props,
            children: /* @__PURE__ */ jsx(
              "div",
              {
                "data-sidebar": "sidebar",
                "data-slot": "sidebar-inner",
                className: "bg-sidebar group-data-[variant=floating]:border-sidebar-border flex h-full w-full flex-col group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:shadow-sm",
                children
              }
            )
          }
        )
      ]
    }
  );
}
function SidebarTrigger({
  className,
  onClick,
  ...props
}) {
  const { toggleSidebar } = useSidebar();
  return /* @__PURE__ */ jsxs(
    Button,
    {
      "data-sidebar": "trigger",
      "data-slot": "sidebar-trigger",
      variant: "ghost",
      size: "icon",
      className: cn$2("size-7", className),
      onClick: (event) => {
        onClick?.(event);
        toggleSidebar();
      },
      ...props,
      children: [
        /* @__PURE__ */ jsx(PanelLeftIcon, {}),
        /* @__PURE__ */ jsx("span", { className: "sr-only", children: "Toggle Sidebar" })
      ]
    }
  );
}
function SidebarRail({ className, ...props }) {
  const { toggleSidebar } = useSidebar();
  return /* @__PURE__ */ jsx(
    "button",
    {
      "data-sidebar": "rail",
      "data-slot": "sidebar-rail",
      "aria-label": "Toggle Sidebar",
      tabIndex: -1,
      onClick: toggleSidebar,
      title: "Toggle Sidebar",
      className: cn$2(
        "hover:after:bg-sidebar-border absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] sm:flex",
        "in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize",
        "[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize",
        "hover:group-data-[collapsible=offcanvas]:bg-sidebar group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full",
        "[[data-side=left][data-collapsible=offcanvas]_&]:-right-2",
        "[[data-side=right][data-collapsible=offcanvas]_&]:-left-2",
        className
      ),
      ...props
    }
  );
}
function SidebarInset({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    "main",
    {
      "data-slot": "sidebar-inset",
      className: cn$2(
        "bg-background relative flex w-full flex-1 flex-col",
        "md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2",
        className
      ),
      ...props
    }
  );
}
function SidebarHeader({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      "data-slot": "sidebar-header",
      "data-sidebar": "header",
      className: cn$2("flex flex-col gap-2 p-2", className),
      ...props
    }
  );
}
function SidebarFooter({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      "data-slot": "sidebar-footer",
      "data-sidebar": "footer",
      className: cn$2("flex flex-col gap-2 p-2", className),
      ...props
    }
  );
}
function SidebarContent({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      "data-slot": "sidebar-content",
      "data-sidebar": "content",
      className: cn$2(
        "flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
        className
      ),
      ...props
    }
  );
}
function SidebarGroup({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      "data-slot": "sidebar-group",
      "data-sidebar": "group",
      className: cn$2("relative flex w-full min-w-0 flex-col p-2", className),
      ...props
    }
  );
}
function SidebarGroupLabel({
  className,
  asChild = false,
  ...props
}) {
  const Comp = asChild ? Slot : "div";
  return /* @__PURE__ */ jsx(
    Comp,
    {
      "data-slot": "sidebar-group-label",
      "data-sidebar": "group-label",
      className: cn$2(
        "text-sidebar-foreground/70 ring-sidebar-ring flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium outline-hidden transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        "group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0",
        className
      ),
      ...props
    }
  );
}
function SidebarMenu({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    "ul",
    {
      "data-slot": "sidebar-menu",
      "data-sidebar": "menu",
      className: cn$2("flex w-full min-w-0 flex-col gap-1", className),
      ...props
    }
  );
}
function SidebarMenuItem({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    "li",
    {
      "data-slot": "sidebar-menu-item",
      "data-sidebar": "menu-item",
      className: cn$2("group/menu-item relative", className),
      ...props
    }
  );
}
const sidebarMenuButtonVariants = cva(
  "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden ring-sidebar-ring transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pr-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        outline: "bg-background shadow-[0_0_0_1px_hsl(var(--sidebar-border))] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_hsl(var(--sidebar-accent))]"
      },
      size: {
        default: "h-8 text-sm",
        sm: "h-7 text-xs",
        lg: "h-12 text-sm group-data-[collapsible=icon]:p-0!"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);
function SidebarMenuButton({
  asChild = false,
  isActive = false,
  variant = "default",
  size = "default",
  tooltip,
  className,
  ...props
}) {
  const Comp = asChild ? Slot : "button";
  const { isMobile, state } = useSidebar();
  const button = /* @__PURE__ */ jsx(
    Comp,
    {
      "data-slot": "sidebar-menu-button",
      "data-sidebar": "menu-button",
      "data-size": size,
      "data-active": isActive,
      className: cn$2(sidebarMenuButtonVariants({ variant, size }), className),
      ...props
    }
  );
  if (!tooltip) {
    return button;
  }
  if (typeof tooltip === "string") {
    tooltip = {
      children: tooltip
    };
  }
  return /* @__PURE__ */ jsxs(Tooltip, { children: [
    /* @__PURE__ */ jsx(TooltipTrigger, { asChild: true, children: button }),
    /* @__PURE__ */ jsx(
      TooltipContent,
      {
        side: "right",
        align: "center",
        hidden: state !== "collapsed" || isMobile,
        ...tooltip
      }
    )
  ] });
}
function SidebarMenuSub({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    "ul",
    {
      "data-slot": "sidebar-menu-sub",
      "data-sidebar": "menu-sub",
      className: cn$2(
        "border-sidebar-border mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l px-2.5 py-0.5",
        "group-data-[collapsible=icon]:hidden",
        className
      ),
      ...props
    }
  );
}
function SidebarMenuSubItem({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    "li",
    {
      "data-slot": "sidebar-menu-sub-item",
      "data-sidebar": "menu-sub-item",
      className: cn$2("group/menu-sub-item relative", className),
      ...props
    }
  );
}
function SidebarMenuSubButton({
  asChild = false,
  size = "md",
  isActive = false,
  className,
  ...props
}) {
  const Comp = asChild ? Slot : "a";
  return /* @__PURE__ */ jsx(
    Comp,
    {
      "data-slot": "sidebar-menu-sub-button",
      "data-sidebar": "menu-sub-button",
      "data-size": size,
      "data-active": isActive,
      className: cn$2(
        "text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:bg-sidebar-accent active:text-sidebar-accent-foreground [&>svg]:text-sidebar-accent-foreground flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 outline-hidden focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
        "data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground",
        size === "sm" && "text-xs",
        size === "md" && "text-sm",
        "group-data-[collapsible=icon]:hidden",
        className
      ),
      ...props
    }
  );
}
const Toaster = ({ ...props }) => {
  const { theme = "system" } = useTheme$1();
  return /* @__PURE__ */ jsx(
    Toaster$1,
    {
      theme,
      className: "toaster group",
      style: {
        "--normal-bg": "var(--popover)",
        "--normal-text": "var(--popover-foreground)",
        "--normal-border": "var(--border)"
      },
      ...props
    }
  );
};
function Select({
  ...props
}) {
  return /* @__PURE__ */ jsx(SelectPrimitive.Root, { "data-slot": "select", ...props });
}
function SelectValue({
  ...props
}) {
  return /* @__PURE__ */ jsx(SelectPrimitive.Value, { "data-slot": "select-value", ...props });
}
function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}) {
  return /* @__PURE__ */ jsxs(
    SelectPrimitive.Trigger,
    {
      "data-slot": "select-trigger",
      "data-size": size,
      className: cn$2(
        "border-input data-[placeholder]:text-muted-foreground [&_svg:not([class*='text-'])]:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 dark:hover:bg-input/50 flex w-fit items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      ),
      ...props,
      children: [
        children,
        /* @__PURE__ */ jsx(SelectPrimitive.Icon, { asChild: true, children: /* @__PURE__ */ jsx(ChevronDownIcon, { className: "size-4 opacity-50" }) })
      ]
    }
  );
}
function SelectContent({
  className,
  children,
  position = "popper",
  ...props
}) {
  return /* @__PURE__ */ jsx(SelectPrimitive.Portal, { children: /* @__PURE__ */ jsxs(
    SelectPrimitive.Content,
    {
      "data-slot": "select-content",
      className: cn$2(
        "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 relative z-50 max-h-(--radix-select-content-available-height) min-w-[8rem] origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border shadow-md",
        position === "popper" && "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
        className
      ),
      position,
      ...props,
      children: [
        /* @__PURE__ */ jsx(SelectScrollUpButton, {}),
        /* @__PURE__ */ jsx(
          SelectPrimitive.Viewport,
          {
            className: cn$2(
              "p-1",
              position === "popper" && "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] scroll-my-1"
            ),
            children
          }
        ),
        /* @__PURE__ */ jsx(SelectScrollDownButton, {})
      ]
    }
  ) });
}
function SelectItem({
  className,
  children,
  ...props
}) {
  return /* @__PURE__ */ jsxs(
    SelectPrimitive.Item,
    {
      "data-slot": "select-item",
      className: cn$2(
        "focus:bg-accent focus:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className
      ),
      ...props,
      children: [
        /* @__PURE__ */ jsx("span", { className: "absolute right-2 flex size-3.5 items-center justify-center", children: /* @__PURE__ */ jsx(SelectPrimitive.ItemIndicator, { children: /* @__PURE__ */ jsx(CheckIcon, { className: "size-4" }) }) }),
        /* @__PURE__ */ jsx(SelectPrimitive.ItemText, { children })
      ]
    }
  );
}
function SelectScrollUpButton({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    SelectPrimitive.ScrollUpButton,
    {
      "data-slot": "select-scroll-up-button",
      className: cn$2(
        "flex cursor-default items-center justify-center py-1",
        className
      ),
      ...props,
      children: /* @__PURE__ */ jsx(ChevronUpIcon, { className: "size-4" })
    }
  );
}
function SelectScrollDownButton({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    SelectPrimitive.ScrollDownButton,
    {
      "data-slot": "select-scroll-down-button",
      className: cn$2(
        "flex cursor-default items-center justify-center py-1",
        className
      ),
      ...props,
      children: /* @__PURE__ */ jsx(ChevronDownIcon, { className: "size-4" })
    }
  );
}
function Switch({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    SwitchPrimitive.Root,
    {
      "data-slot": "switch",
      className: cn$2(
        "peer data-[state=checked]:bg-primary data-[state=unchecked]:bg-input focus-visible:border-ring focus-visible:ring-ring/50 dark:data-[state=unchecked]:bg-input/80 inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        className
      ),
      ...props,
      children: /* @__PURE__ */ jsx(
        SwitchPrimitive.Thumb,
        {
          "data-slot": "switch-thumb",
          className: cn$2(
            "bg-background dark:data-[state=unchecked]:bg-foreground dark:data-[state=checked]:bg-primary-foreground pointer-events-none block size-4 rounded-full ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0"
          )
        }
      )
    }
  );
}
function Table({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      "data-slot": "table-container",
      className: "relative w-full overflow-x-auto",
      children: /* @__PURE__ */ jsx(
        "table",
        {
          "data-slot": "table",
          className: cn$2("w-full caption-bottom text-sm", className),
          ...props
        }
      )
    }
  );
}
function TableHeader({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    "thead",
    {
      "data-slot": "table-header",
      className: cn$2("[&_tr]:border-b", className),
      ...props
    }
  );
}
function TableBody({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    "tbody",
    {
      "data-slot": "table-body",
      className: cn$2("[&_tr:last-child]:border-0", className),
      ...props
    }
  );
}
function TableRow({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    "tr",
    {
      "data-slot": "table-row",
      className: cn$2(
        "hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors",
        className
      ),
      ...props
    }
  );
}
function TableHead({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    "th",
    {
      "data-slot": "table-head",
      className: cn$2(
        "text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      ),
      ...props
    }
  );
}
function TableCell({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    "td",
    {
      "data-slot": "table-cell",
      className: cn$2(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      ),
      ...props
    }
  );
}
const initialState = {
  theme: "system",
  setTheme: () => null
};
const ThemeProviderContext = createContext(initialState);
function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "vite-ui-theme",
  ...props
}) {
  const [theme, setThemeState] = useState(defaultTheme);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) setThemeState(stored);
    } catch {
    }
  }, [storageKey]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const root2 = window.document.documentElement;
    const apply = (t) => {
      root2.classList.remove("light", "dark");
      root2.classList.add(t);
    };
    if (theme === "system") {
      const mql = window.matchMedia("(prefers-color-scheme: dark)");
      apply(mql.matches ? "dark" : "light");
      const handler = (e) => {
        if (theme === "system") {
          apply(e.matches ? "dark" : "light");
        }
      };
      mql.addEventListener?.("change", handler);
      return () => mql.removeEventListener?.("change", handler);
    }
    apply(theme);
  }, [theme]);
  const value = {
    theme,
    setTheme: (t) => {
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(storageKey, t);
        } catch {
        }
      }
      setThemeState(t);
    }
  };
  return /* @__PURE__ */ jsx(ThemeProviderContext.Provider, { ...props, value, children });
}
const useTheme = () => {
  const context = useContext(ThemeProviderContext);
  if (context === void 0)
    throw new Error("useTheme must be used within a ThemeProvider");
  return context;
};
function ModeToggle() {
  const { setTheme } = useTheme();
  return /* @__PURE__ */ jsxs(DropdownMenu, { children: [
    /* @__PURE__ */ jsx(DropdownMenuTrigger, { asChild: true, children: /* @__PURE__ */ jsxs(Button, { variant: "outline", size: "icon", children: [
      /* @__PURE__ */ jsx(Sun, { className: "h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" }),
      /* @__PURE__ */ jsx(Moon, { className: "absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" }),
      /* @__PURE__ */ jsx("span", { className: "sr-only", children: "Toggle theme" })
    ] }) }),
    /* @__PURE__ */ jsxs(DropdownMenuContent, { align: "end", children: [
      /* @__PURE__ */ jsx(DropdownMenuItem, { onClick: () => setTheme("light"), children: "Claro" }),
      /* @__PURE__ */ jsx(DropdownMenuItem, { onClick: () => setTheme("dark"), children: "Escuro" }),
      /* @__PURE__ */ jsx(DropdownMenuItem, { onClick: () => setTheme("system"), children: "Sistema" })
    ] })
  ] });
}
function preserveRedirectTo$1(path, search) {
  const qs = new URLSearchParams(search);
  const query = qs.toString();
  return `${path}${query ? `?${query}` : ""}`;
}
function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const { signIn, resetPassword: resetPassword2, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    const savedEmail = localStorage.getItem(STORAGE_KEYS.rememberEmail);
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      const target = safeRedirect(
        getRedirectTo(location.search, location.state),
        "/rancho"
      );
      navigate(target, { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, location.search, location.state]);
  const handleEmailChange = (e) => {
    const newEmail = e.target.value;
    setEmail(newEmail);
    setApiError("");
    if (newEmail && !FAB_EMAIL_REGEX.test(newEmail)) {
      setEmailError("Por favor, utilize um email institucional (@fab.mil.br).");
    } else {
      setEmailError("");
    }
  };
  const handlePasswordChange = (e) => {
    setPassword(e.target.value);
    setApiError("");
    setPasswordError("");
  };
  const handleRememberMeChange = (e) => {
    const checked = e.target.checked;
    setRememberMe(checked);
    if (checked && email && FAB_EMAIL_REGEX.test(email)) {
      localStorage.setItem(STORAGE_KEYS.rememberEmail, email);
    } else {
      localStorage.removeItem(STORAGE_KEYS.rememberEmail);
    }
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!FAB_EMAIL_REGEX.test(email)) {
      setEmailError("O email fornecido não é um email válido da FAB.");
      return;
    }
    if (password.length < 6) {
      setApiError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    setIsSubmitting(true);
    setApiError("");
    setEmailError("");
    try {
      await signIn(email, password);
      if (rememberMe) {
        localStorage.setItem(STORAGE_KEYS.rememberEmail, email);
      } else {
        localStorage.removeItem(STORAGE_KEYS.rememberEmail);
      }
      const target = safeRedirect(
        getRedirectTo(location.search, location.state),
        "/rancho"
      );
      navigate(target, { replace: true });
    } catch (err) {
      console.error("Falha no login:", err);
      if (err?.code === "INVALID_CREDENTIALS") {
        setPasswordError("Senha incorreta");
        setApiError("");
      } else {
        setApiError(
          err?.message || "Ocorreu um erro durante a autenticação. Tente mais tarde."
        );
        setPasswordError("");
      }
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!FAB_EMAIL_REGEX.test(resetEmail)) {
      setApiError("Por favor, insira um email válido da FAB.");
      return;
    }
    setIsResettingPassword(true);
    setApiError("");
    try {
      await resetPassword2(resetEmail);
      setSuccessMessage(
        "Email de recuperação enviado! Verifique sua caixa de entrada."
      );
      setShowForgotPassword(false);
      setResetEmail("");
    } catch (err) {
      console.error("Erro ao enviar email de recuperação:", err);
      setApiError(
        err?.message || "Erro ao enviar email de recuperação. Tente novamente."
      );
    } finally {
      setIsResettingPassword(false);
    }
  };
  const registerHref = preserveRedirectTo$1("/register", location.search);
  if (isLoading) {
    return /* @__PURE__ */ jsx(Card, { className: "w-full max-w-md mx-auto", children: /* @__PURE__ */ jsxs(CardContent, { className: "flex items-center justify-center py-8", children: [
      /* @__PURE__ */ jsx(Loader2, { className: "h-8 w-8 animate-spin" }),
      /* @__PURE__ */ jsx("span", { className: "ml-2", children: "Verificando autenticação..." })
    ] }) });
  }
  return /* @__PURE__ */ jsxs(Card, { className: "w-full max-w-md mx-auto", children: [
    /* @__PURE__ */ jsxs(CardHeader, { className: "space-y-1", children: [
      /* @__PURE__ */ jsx(CardTitle, { className: "text-2xl text-center", children: showForgotPassword ? "Recuperar Senha" : "Entrar" }),
      /* @__PURE__ */ jsx(CardDescription, { className: "text-center", children: showForgotPassword ? "Digite seu email para receber instruções de recuperação" : "Acesso restrito a emails @fab.mil.br" })
    ] }),
    !showForgotPassword ? /* @__PURE__ */ jsxs("form", { onSubmit: handleSubmit, children: [
      /* @__PURE__ */ jsxs(CardContent, { className: "space-y-4", children: [
        apiError && /* @__PURE__ */ jsxs(Alert, { variant: "destructive", children: [
          /* @__PURE__ */ jsx(AlertCircle, { className: "h-4 w-4" }),
          /* @__PURE__ */ jsx(AlertDescription, { children: apiError })
        ] }),
        successMessage && /* @__PURE__ */ jsxs(Alert, { className: "border-green-200 bg-green-50", children: [
          /* @__PURE__ */ jsx(CheckCircle, { className: "h-4 w-4 text-green-600" }),
          /* @__PURE__ */ jsx(AlertDescription, { className: "text-green-800", children: successMessage })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsx(Label, { htmlFor: "email", children: "Email Institucional" }),
          /* @__PURE__ */ jsxs("div", { className: "relative", children: [
            /* @__PURE__ */ jsx(Mail, { className: "absolute left-3 top-3 h-4 w-4 text-muted-foreground" }),
            /* @__PURE__ */ jsx(
              Input,
              {
                id: "email",
                type: "email",
                placeholder: "seu.nome@fab.mil.br",
                value: email,
                onChange: handleEmailChange,
                className: cn$2("pl-10", {
                  "border-red-500 focus-visible:ring-red-500": emailError
                }),
                required: true,
                disabled: isSubmitting,
                autoComplete: "email"
              }
            )
          ] }),
          emailError && /* @__PURE__ */ jsxs("p", { className: "text-sm text-red-600 mt-1 flex items-center", children: [
            /* @__PURE__ */ jsx(AlertCircle, { className: "h-3 w-3 mr-1" }),
            emailError
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsx(Label, { htmlFor: "password", children: "Senha" }),
          /* @__PURE__ */ jsxs("div", { className: "relative", children: [
            /* @__PURE__ */ jsx(Lock, { className: "absolute left-3 top-3 h-4 w-4 text-muted-foreground" }),
            /* @__PURE__ */ jsx(
              Input,
              {
                id: "password",
                type: showPassword ? "text" : "password",
                placeholder: "••••••••",
                value: password,
                onChange: handlePasswordChange,
                className: cn$2("pl-10 pr-10", {
                  "border-red-500 focus-visible:ring-red-500": !!passwordError
                }),
                required: true,
                disabled: isSubmitting,
                autoComplete: "current-password",
                minLength: 6
              }
            ),
            /* @__PURE__ */ jsx(
              Button,
              {
                type: "button",
                variant: "ghost",
                size: "sm",
                className: "absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent",
                onClick: () => setShowPassword((s) => !s),
                disabled: isSubmitting,
                children: showPassword ? /* @__PURE__ */ jsx(EyeOff, { className: "h-4 w-4 text-muted-foreground" }) : /* @__PURE__ */ jsx(Eye, { className: "h-4 w-4 text-muted-foreground" })
              }
            )
          ] }),
          passwordError && /* @__PURE__ */ jsxs("p", { className: "text-sm text-red-600 mt-1 flex items-center", children: [
            /* @__PURE__ */ jsx(AlertCircle, { className: "h-3 w-3 mr-1" }),
            passwordError
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center space-x-2", children: [
            /* @__PURE__ */ jsx(
              "input",
              {
                id: "remember",
                type: "checkbox",
                checked: rememberMe,
                onChange: handleRememberMeChange,
                className: "rounded border-gray-300",
                disabled: isSubmitting,
                title: "Lembrar email"
              }
            ),
            /* @__PURE__ */ jsx(Label, { htmlFor: "remember", className: "text-sm font-normal", children: "Lembrar email" })
          ] }),
          /* @__PURE__ */ jsx(
            Button,
            {
              type: "button",
              variant: "link",
              className: "px-0 font-normal text-sm",
              onClick: () => {
                setShowForgotPassword(true);
                setApiError("");
                setSuccessMessage("");
              },
              disabled: isSubmitting,
              children: "Esqueceu a senha?"
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxs(CardFooter, { className: "flex flex-col space-y-4", children: [
        /* @__PURE__ */ jsxs(
          Button,
          {
            type: "submit",
            className: "w-full my-6 py-3 text-lg font-semibold",
            disabled: isSubmitting || !!emailError || !email || !password,
            children: [
              isSubmitting && /* @__PURE__ */ jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }),
              isSubmitting ? "Entrando..." : "Entrar"
            ]
          }
        ),
        /* @__PURE__ */ jsxs("p", { className: "text-sm text-center text-muted-foreground", children: [
          "Não tem uma conta?",
          " ",
          /* @__PURE__ */ jsx(
            Link,
            {
              to: registerHref,
              className: "text-primary hover:underline font-medium",
              children: "Cadastre-se"
            }
          )
        ] })
      ] })
    ] }) : /* @__PURE__ */ jsxs("form", { onSubmit: handleForgotPassword, children: [
      /* @__PURE__ */ jsxs(CardContent, { className: "space-y-4", children: [
        apiError && /* @__PURE__ */ jsxs(Alert, { variant: "destructive", children: [
          /* @__PURE__ */ jsx(AlertCircle, { className: "h-4 w-4" }),
          /* @__PURE__ */ jsx(AlertDescription, { children: apiError })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsx(Label, { htmlFor: "resetEmail", children: "Email Institucional" }),
          /* @__PURE__ */ jsxs("div", { className: "relative", children: [
            /* @__PURE__ */ jsx(Mail, { className: "absolute left-3 top-3 h-4 w-4 text-muted-foreground" }),
            /* @__PURE__ */ jsx(
              Input,
              {
                id: "resetEmail",
                type: "email",
                placeholder: "seu.nome@fab.mil.br",
                value: resetEmail,
                onChange: (e) => {
                  setResetEmail(e.target.value);
                  setApiError("");
                },
                className: "pl-10",
                required: true,
                disabled: isResettingPassword,
                autoComplete: "email"
              }
            )
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs(CardFooter, { className: "flex flex-col space-y-4", children: [
        /* @__PURE__ */ jsxs(
          Button,
          {
            type: "submit",
            className: "w-full my-6 py-3 text-lg font-semibold",
            disabled: isResettingPassword || !resetEmail,
            children: [
              isResettingPassword && /* @__PURE__ */ jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }),
              isResettingPassword ? "Enviando..." : "Enviar Email de Recuperação"
            ]
          }
        ),
        /* @__PURE__ */ jsx(
          Button,
          {
            type: "button",
            variant: "outline",
            className: "w-full",
            onClick: () => {
              setShowForgotPassword(false);
              setResetEmail("");
              setApiError("");
            },
            disabled: isResettingPassword,
            children: "Voltar ao Login"
          }
        )
      ] })
    ] })
  ] });
}
function getPasswordStrength(password) {
  let score = 0;
  const checks = {
    length: password.length >= 8,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    numbers: /\d/.test(password),
    special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
  };
  score = Object.values(checks).filter(Boolean).length;
  return {
    score,
    checks,
    strength: score < 2 ? "weak" : score < 4 ? "medium" : "strong"
  };
}
function preserveRedirectTo(path, search) {
  const qs = new URLSearchParams(search);
  const query = qs.toString();
  return `${path}${query ? `?${query}` : ""}`;
}
function Register() {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: ""
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [apiError, setApiError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({
    email: "",
    password: "",
    confirmPassword: ""
  });
  const { signUp, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      const target = safeRedirect(
        getRedirectTo(location.search, location.state),
        "/rancho"
      );
      navigate(target, { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, location.search, location.state]);
  useEffect(() => {
    const newErrors = { ...fieldErrors };
    if (formData.email && !FAB_EMAIL_REGEX.test(formData.email)) {
      newErrors.email = "Por favor, utilize um email institucional (@fab.mil.br).";
    } else {
      newErrors.email = "";
    }
    if (formData.password && formData.password.length < 6) {
      newErrors.password = "A senha deve ter pelo menos 6 caracteres.";
    } else {
      newErrors.password = "";
    }
    if (formData.confirmPassword && formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "As senhas não coincidem.";
    } else {
      newErrors.confirmPassword = "";
    }
    setFieldErrors(newErrors);
  }, [formData.email, formData.password, formData.confirmPassword]);
  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setApiError("");
  };
  const passwordStrength = getPasswordStrength(formData.password);
  const hasErrors = Object.values(fieldErrors).some((error) => error !== "");
  const isFormValid = Object.values(formData).every((value) => value.trim() !== "") && !hasErrors;
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isFormValid) {
      setApiError("Por favor, corrija os erros no formulário.");
      return;
    }
    setIsSubmitting(true);
    setApiError("");
    try {
      await signUp(formData.email, formData.password);
      setIsSuccess(true);
    } catch (err) {
      console.error("Falha no registro:", err);
      setApiError(
        err?.message || "Ocorreu um erro ao criar a conta. Tente novamente."
      );
    } finally {
      setIsSubmitting(false);
    }
  };
  const loginHref = preserveRedirectTo("/login", location.search);
  if (isLoading) {
    return /* @__PURE__ */ jsx(Card, { className: "w-full max-w-md mx-auto", children: /* @__PURE__ */ jsxs(CardContent, { className: "flex items-center justify-center py-8", children: [
      /* @__PURE__ */ jsx(Loader2, { className: "h-8 w-8 animate-spin" }),
      /* @__PURE__ */ jsx("span", { className: "ml-2", children: "Verificando autenticação..." })
    ] }) });
  }
  if (isSuccess) {
    return /* @__PURE__ */ jsxs(Card, { className: "w-full max-w-md mx-auto", children: [
      /* @__PURE__ */ jsxs(CardHeader, { children: [
        /* @__PURE__ */ jsxs(CardTitle, { className: "text-2xl text-center flex items-center justify-center", children: [
          /* @__PURE__ */ jsx(CheckCircle, { className: "mr-2 h-8 w-8 text-green-500" }),
          "Conta Criada!"
        ] }),
        /* @__PURE__ */ jsxs(CardDescription, { className: "text-center pt-4 space-y-2", children: [
          /* @__PURE__ */ jsxs("p", { children: [
            "Enviamos um link de confirmação para",
            " ",
            /* @__PURE__ */ jsx("strong", { children: formData.email })
          ] }),
          /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground", children: "Por favor, verifique sua caixa de entrada (e a pasta de spam) para ativar sua conta." })
        ] })
      ] }),
      /* @__PURE__ */ jsxs(CardFooter, { className: "flex flex-col space-y-3", children: [
        /* @__PURE__ */ jsx(Link, { to: loginHref, className: "w-full", children: /* @__PURE__ */ jsx(Button, { className: "w-full", children: "Ir para Login" }) }),
        /* @__PURE__ */ jsx(
          Button,
          {
            variant: "outline",
            className: "w-full",
            onClick: () => {
              setIsSuccess(false);
              setFormData({
                email: "",
                password: "",
                confirmPassword: ""
              });
            },
            children: "Criar Outra Conta"
          }
        )
      ] })
    ] });
  }
  return /* @__PURE__ */ jsxs(Card, { className: "w-full max-w-md mx-auto", children: [
    /* @__PURE__ */ jsxs(CardHeader, { className: "space-y-1", children: [
      /* @__PURE__ */ jsx(CardTitle, { className: "text-2xl text-center", children: "Criar Conta" }),
      /* @__PURE__ */ jsx(CardDescription, { className: "text-center", children: "Acesso restrito a emails @fab.mil.br" })
    ] }),
    /* @__PURE__ */ jsxs("form", { onSubmit: handleSubmit, children: [
      /* @__PURE__ */ jsxs(CardContent, { className: "space-y-4", children: [
        apiError && /* @__PURE__ */ jsxs(Alert, { variant: "destructive", children: [
          /* @__PURE__ */ jsx(AlertCircle, { className: "h-4 w-4" }),
          /* @__PURE__ */ jsx(AlertDescription, { children: apiError })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsx(Label, { htmlFor: "email", children: "Email Institucional" }),
          /* @__PURE__ */ jsxs("div", { className: "relative", children: [
            /* @__PURE__ */ jsx(Mail, { className: "absolute left-3 top-3 h-4 w-4 text-muted-foreground" }),
            /* @__PURE__ */ jsx(
              Input,
              {
                id: "email",
                type: "email",
                placeholder: "seu.nome@fab.mil.br",
                value: formData.email,
                onChange: (e) => handleInputChange("email", e.target.value.toLowerCase()),
                className: cn$2("pl-10", {
                  "border-red-500 focus-visible:ring-red-500": fieldErrors.email,
                  "border-green-500 focus-visible:ring-green-500": formData.email && !fieldErrors.email
                }),
                required: true,
                disabled: isSubmitting,
                autoComplete: "email"
              }
            ),
            formData.email && !fieldErrors.email && /* @__PURE__ */ jsx(Check, { className: "absolute right-3 top-3 h-4 w-4 text-green-500" })
          ] }),
          fieldErrors.email && /* @__PURE__ */ jsxs("p", { className: "text-sm text-red-600 mt-1 flex items-center", children: [
            /* @__PURE__ */ jsx(AlertCircle, { className: "h-3 w-3 mr-1" }),
            fieldErrors.email
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsx(Label, { htmlFor: "password", children: "Senha" }),
          /* @__PURE__ */ jsxs("div", { className: "relative", children: [
            /* @__PURE__ */ jsx(Lock, { className: "absolute left-3 top-3 h-4 w-4 text-muted-foreground" }),
            /* @__PURE__ */ jsx(
              Input,
              {
                id: "password",
                type: showPassword ? "text" : "password",
                placeholder: "••••••••",
                value: formData.password,
                onChange: (e) => handleInputChange("password", e.target.value),
                className: cn$2("pl-10 pr-10", {
                  "border-red-500 focus-visible:ring-red-500": fieldErrors.password
                }),
                required: true,
                disabled: isSubmitting,
                autoComplete: "new-password",
                minLength: 6
              }
            ),
            /* @__PURE__ */ jsx(
              Button,
              {
                type: "button",
                variant: "ghost",
                size: "sm",
                className: "absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent",
                onClick: () => setShowPassword(!showPassword),
                disabled: isSubmitting,
                children: showPassword ? /* @__PURE__ */ jsx(EyeOff, { className: "h-4 w-4 text-muted-foreground" }) : /* @__PURE__ */ jsx(Eye, { className: "h-4 w-4 text-muted-foreground" })
              }
            )
          ] }),
          formData.password && /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsx("div", { className: "flex items-center space-x-2", children: /* @__PURE__ */ jsxs(
              "span",
              {
                className: cn$2("text-xs font-medium", {
                  "text-red-500": passwordStrength.strength === "weak",
                  "text-yellow-500": passwordStrength.strength === "medium",
                  "text-green-500": passwordStrength.strength === "strong"
                }),
                children: [
                  passwordStrength.strength === "weak" && "Fraca",
                  passwordStrength.strength === "medium" && "Média",
                  passwordStrength.strength === "strong" && "Forte"
                ]
              }
            ) }),
            /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-1 text-xs", children: [
              /* @__PURE__ */ jsxs(
                "div",
                {
                  className: cn$2("flex items-center", {
                    "text-green-600": passwordStrength.checks.length,
                    "text-gray-400": !passwordStrength.checks.length
                  }),
                  children: [
                    passwordStrength.checks.length ? /* @__PURE__ */ jsx(Check, { className: "h-3 w-3 mr-1" }) : /* @__PURE__ */ jsx(X, { className: "h-3 w-3 mr-1" }),
                    "8+ caracteres"
                  ]
                }
              ),
              /* @__PURE__ */ jsxs(
                "div",
                {
                  className: cn$2("flex items-center", {
                    "text-green-600": passwordStrength.checks.uppercase,
                    "text-gray-400": !passwordStrength.checks.uppercase
                  }),
                  children: [
                    passwordStrength.checks.uppercase ? /* @__PURE__ */ jsx(Check, { className: "h-3 w-3 mr-1" }) : /* @__PURE__ */ jsx(X, { className: "h-3 w-3 mr-1" }),
                    "Maiúscula"
                  ]
                }
              ),
              /* @__PURE__ */ jsxs(
                "div",
                {
                  className: cn$2("flex items-center", {
                    "text-green-600": passwordStrength.checks.lowercase,
                    "text-gray-400": !passwordStrength.checks.lowercase
                  }),
                  children: [
                    passwordStrength.checks.lowercase ? /* @__PURE__ */ jsx(Check, { className: "h-3 w-3 mr-1" }) : /* @__PURE__ */ jsx(X, { className: "h-3 w-3 mr-1" }),
                    "Minúscula"
                  ]
                }
              ),
              /* @__PURE__ */ jsxs(
                "div",
                {
                  className: cn$2("flex items-center", {
                    "text-green-600": passwordStrength.checks.numbers,
                    "text-gray-400": !passwordStrength.checks.numbers
                  }),
                  children: [
                    passwordStrength.checks.numbers ? /* @__PURE__ */ jsx(Check, { className: "h-3 w-3 mr-1" }) : /* @__PURE__ */ jsx(X, { className: "h-3 w-3 mr-1" }),
                    "Número"
                  ]
                }
              )
            ] })
          ] }),
          fieldErrors.password && /* @__PURE__ */ jsxs("p", { className: "text-sm text-red-600 mt-1 flex items-center", children: [
            /* @__PURE__ */ jsx(AlertCircle, { className: "h-3 w-3 mr-1" }),
            fieldErrors.password
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsx(Label, { htmlFor: "confirmPassword", children: "Confirmar Senha" }),
          /* @__PURE__ */ jsxs("div", { className: "relative", children: [
            /* @__PURE__ */ jsx(Lock, { className: "absolute left-3 top-3 h-4 w-4 text-muted-foreground" }),
            /* @__PURE__ */ jsx(
              Input,
              {
                id: "confirmPassword",
                type: showConfirmPassword ? "text" : "password",
                placeholder: "••••••••",
                value: formData.confirmPassword,
                onChange: (e) => handleInputChange("confirmPassword", e.target.value),
                className: cn$2("pl-10 pr-10", {
                  "border-red-500 focus-visible:ring-red-500": fieldErrors.confirmPassword,
                  "border-green-500 focus-visible:ring-green-500": formData.confirmPassword && !fieldErrors.confirmPassword && formData.password === formData.confirmPassword
                }),
                required: true,
                disabled: isSubmitting,
                autoComplete: "new-password"
              }
            ),
            /* @__PURE__ */ jsx(
              Button,
              {
                type: "button",
                variant: "ghost",
                size: "sm",
                className: "absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent",
                onClick: () => setShowConfirmPassword(!showConfirmPassword),
                disabled: isSubmitting,
                children: showConfirmPassword ? /* @__PURE__ */ jsx(EyeOff, { className: "h-4 w-4 text-muted-foreground" }) : /* @__PURE__ */ jsx(Eye, { className: "h-4 w-4 text-muted-foreground" })
              }
            ),
            formData.confirmPassword && !fieldErrors.confirmPassword && formData.password === formData.confirmPassword && /* @__PURE__ */ jsx(Check, { className: "absolute right-10 top-3 h-4 w-4 text-green-500" })
          ] }),
          fieldErrors.confirmPassword && /* @__PURE__ */ jsxs("p", { className: "text-sm text-red-600 mt-1 flex items-center", children: [
            /* @__PURE__ */ jsx(AlertCircle, { className: "h-3 w-3 mr-1" }),
            fieldErrors.confirmPassword
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs(CardFooter, { className: "flex flex-col space-y-4", children: [
        /* @__PURE__ */ jsxs(
          Button,
          {
            type: "submit",
            className: "w-full my-6 py-3 text-lg font-semibold",
            disabled: !isFormValid || isSubmitting,
            children: [
              isSubmitting && /* @__PURE__ */ jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }),
              isSubmitting ? "Criando conta..." : "Criar Conta"
            ]
          }
        ),
        /* @__PURE__ */ jsxs("p", { className: "text-sm text-center text-muted-foreground", children: [
          "Já tem uma conta?",
          " ",
          /* @__PURE__ */ jsx(
            Link,
            {
              to: loginHref,
              className: "text-primary hover:underline font-medium",
              children: "Faça login"
            }
          )
        ] })
      ] })
    ] })
  ] });
}
function getSearchParams(location) {
  const hashParams = new URLSearchParams(
    (location.hash || "").replace(/^#/, "")
  );
  const queryParams = new URLSearchParams(location.search || "");
  return { hashParams, queryParams };
}
function ResetPassword({ supabase: supabase2 }) {
  const { isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isVerifying, setIsVerifying] = useState(true);
  const [verified, setVerified] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const { tokenHash, isRecoveryLink } = useMemo(() => {
    const { hashParams, queryParams } = getSearchParams(location);
    const tHash = hashParams.get("token_hash") || queryParams.get("token_hash") || hashParams.get("token") || queryParams.get("token") || null;
    const recovery = (location.hash || "").includes("type=recovery");
    return { tokenHash: tHash, isRecoveryLink: recovery };
  }, [location.hash, location.search]);
  useEffect(() => {
    let isMounted = true;
    async function ensureSession() {
      setIsVerifying(true);
      setVerifyError("");
      try {
        const { data: sessionData, error: sessionErr } = await supabase2.auth.getSession();
        if (sessionErr) {
          console.warn("getSession error:", sessionErr.message);
        }
        if (sessionData?.session?.user) {
          if (!isMounted) return;
          setVerified(true);
          setIsVerifying(false);
          return;
        }
        if (tokenHash) {
          const { data, error } = await supabase2.auth.verifyOtp({
            type: "recovery",
            token_hash: tokenHash
          });
          if (error) {
            throw new Error(
              error.message || "Falha ao validar o token de recuperação. Solicite um novo link."
            );
          }
          if (data?.session?.user) {
            if (!isMounted) return;
            setVerified(true);
            setIsVerifying(false);
            const cleanUrl = location.pathname;
            navigate(cleanUrl, { replace: true });
            return;
          }
        }
        if (isRecoveryLink) {
          const { data: s2 } = await supabase2.auth.getSession();
          if (s2?.session?.user) {
            if (!isMounted) return;
            setVerified(true);
            setIsVerifying(false);
            return;
          }
        }
        if (!isMounted) return;
        setVerifyError(
          "Link de recuperação inválido ou expirado. Solicite novamente."
        );
        setVerified(false);
        setIsVerifying(false);
      } catch (e) {
        if (!isMounted) return;
        setVerifyError(
          e?.message || "Não foi possível validar o link de recuperação. Solicite novamente."
        );
        setVerified(false);
        setIsVerifying(false);
      }
    }
    ensureSession();
    return () => {
      isMounted = false;
    };
  }, [tokenHash, isRecoveryLink, navigate, location.pathname, supabase2]);
  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError("");
    if (password.length < 6) {
      setApiError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      setApiError("As senhas não coincidem.");
      return;
    }
    if (!verified) {
      setApiError(
        "Sessão de recuperação não encontrada. Reabra o link do e-mail."
      );
      return;
    }
    try {
      setSubmitting(true);
      const { error } = await supabase2.auth.updateUser({ password });
      if (error) {
        const msg = error.message === "Invalid token: token-type not supported" ? "Link inválido ou expirado. Solicite novamente." : error.message;
        throw new Error(msg);
      }
      setSuccess(true);
      const target = safeRedirect(
        getRedirectTo(location.search, location.state),
        "/rancho"
      );
      setTimeout(() => navigate(target, { replace: true }), 1200);
    } catch (err) {
      setApiError(
        err?.message || "Falha ao atualizar a senha. Tente novamente."
      );
    } finally {
      setSubmitting(false);
    }
  };
  if (!isLoading && !verified && (isVerifying || verifyError) || !isLoading && verifyError) {
    return /* @__PURE__ */ jsxs(Card, { className: "w-full max-w-md mx-auto", children: [
      /* @__PURE__ */ jsxs(CardHeader, { children: [
        /* @__PURE__ */ jsx(CardTitle, { className: "text-2xl text-center", children: isVerifying ? "Validando link..." : "Link inválido" }),
        /* @__PURE__ */ jsx(CardDescription, { className: "text-center", children: isVerifying ? "Aguarde enquanto validamos seu link de recuperação." : verifyError || "O link de recuperação é inválido ou expirou." })
      ] }),
      !isVerifying && /* @__PURE__ */ jsx(CardFooter, { className: "flex flex-col space-y-3", children: /* @__PURE__ */ jsx(Button, { onClick: () => navigate("/login"), className: "w-full", children: "Voltar ao Login" }) })
    ] });
  }
  return /* @__PURE__ */ jsxs(Card, { className: "w-full max-w-md mx-auto", children: [
    /* @__PURE__ */ jsxs(CardHeader, { className: "space-y-1", children: [
      /* @__PURE__ */ jsx(CardTitle, { className: "text-2xl text-center", children: "Definir nova senha" }),
      /* @__PURE__ */ jsx(CardDescription, { className: "text-center", children: "Crie sua nova senha para acessar o SISUB" })
    ] }),
    /* @__PURE__ */ jsxs("form", { onSubmit: handleSubmit, children: [
      /* @__PURE__ */ jsxs(CardContent, { className: "space-y-4", children: [
        apiError && /* @__PURE__ */ jsxs(Alert, { variant: "destructive", children: [
          /* @__PURE__ */ jsx(AlertCircle, { className: "h-4 w-4" }),
          /* @__PURE__ */ jsx(AlertDescription, { children: apiError })
        ] }),
        success && /* @__PURE__ */ jsxs(Alert, { className: "border-green-200 bg-green-50", children: [
          /* @__PURE__ */ jsx(CheckCircle, { className: "h-4 w-4 text-green-600" }),
          /* @__PURE__ */ jsx(AlertDescription, { className: "text-green-800", children: "Senha atualizada com sucesso! Redirecionando..." })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsx(Label, { htmlFor: "password", children: "Nova senha" }),
          /* @__PURE__ */ jsxs("div", { className: "relative", children: [
            /* @__PURE__ */ jsx(Lock, { className: "absolute left-3 top-3 h-4 w-4 text-muted-foreground" }),
            /* @__PURE__ */ jsx(
              Input,
              {
                id: "password",
                type: showPassword ? "text" : "password",
                placeholder: "••••••••",
                value: password,
                onChange: (e) => setPassword(e.target.value),
                className: "pl-10 pr-10",
                required: true,
                minLength: 6,
                disabled: submitting || success,
                autoComplete: "new-password"
              }
            ),
            /* @__PURE__ */ jsx(
              Button,
              {
                type: "button",
                variant: "ghost",
                size: "sm",
                className: "absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent",
                onClick: () => setShowPassword(!showPassword),
                disabled: submitting || success,
                children: showPassword ? /* @__PURE__ */ jsx(EyeOff, { className: "h-4 w-4 text-muted-foreground" }) : /* @__PURE__ */ jsx(Eye, { className: "h-4 w-4 text-muted-foreground" })
              }
            )
          ] }),
          /* @__PURE__ */ jsx("p", { className: "text-xs text-muted-foreground", children: "Mínimo de 6 caracteres." })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsx(Label, { htmlFor: "confirm", children: "Confirmar nova senha" }),
          /* @__PURE__ */ jsxs("div", { className: "relative", children: [
            /* @__PURE__ */ jsx(Lock, { className: "absolute left-3 top-3 h-4 w-4 text-muted-foreground" }),
            /* @__PURE__ */ jsx(
              Input,
              {
                id: "confirm",
                type: showPassword ? "text" : "password",
                placeholder: "••••••••",
                value: confirm,
                onChange: (e) => setConfirm(e.target.value),
                className: cn$2("pl-10 pr-10", {
                  "border-red-500 focus-visible:ring-red-500": confirm.length > 0 && confirm !== password
                }),
                required: true,
                minLength: 6,
                disabled: submitting || success,
                autoComplete: "new-password"
              }
            )
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs(CardFooter, { className: "flex flex-col space-y-4", children: [
        /* @__PURE__ */ jsxs(
          Button,
          {
            type: "submit",
            className: "w-full my-2 py-3 text-lg font-semibold",
            disabled: submitting || success || !password || !confirm || password !== confirm || password.length < 6,
            children: [
              submitting && /* @__PURE__ */ jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }),
              submitting ? "Atualizando..." : "Atualizar senha"
            ]
          }
        ),
        /* @__PURE__ */ jsx(
          Button,
          {
            type: "button",
            variant: "outline",
            className: "w-full",
            onClick: () => navigate("/login"),
            disabled: submitting,
            children: "Voltar ao Login"
          }
        )
      ] })
    ] })
  ] });
}
const supabaseUrl = "https://jgigqdpdjgnnuwajtayh.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnaWdxZHBkamdubnV3YWp0YXloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIyNjgyNTUsImV4cCI6MjA2Nzg0NDI1NX0.pUKKcg21KyHnMCcq7EOXweeLWUBKOixkafe-aBCNqwo";
const supabase = createClient(supabaseUrl, supabaseKey, {
  db: { schema: "sisub" },
  auth: {
    persistSession: true,
    storageKey: "auth_iefa"
  }
});
const queryClient = new QueryClient();
const links = () => [{
  rel: "preconnect",
  href: "https://fonts.googleapis.com"
}, {
  rel: "preconnect",
  href: "https://fonts.gstatic.com",
  crossOrigin: "anonymous"
}, {
  rel: "stylesheet",
  href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap"
}, {
  rel: "preconnect",
  href: "https://fonts.googleapis.com"
}, {
  rel: "preconnect",
  href: "https://fonts.gstatic.com",
  crossOrigin: "anonymous"
}, {
  rel: "stylesheet",
  href: "https://fonts.googleapis.com/css2?family=K2D:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800&display=swap"
}];
function Layout({
  children
}) {
  const noFlashScript = `
(function() {
  try {
    var key = 'iefa-theme';
    var stored = localStorage.getItem(key);
    var mql = window.matchMedia('(prefers-color-scheme: dark)');
    var system = mql.matches ? 'dark' : 'light';
    var theme = stored || 'system';
    var resolved = theme === 'dark' || (theme === 'system' && system === 'dark') ? 'dark' : 'light';
    var root = document.documentElement;
    if (resolved === 'dark') root.classList.add('dark'); else root.classList.remove('dark');
    root.style.colorScheme = resolved; // ajusta scrollbars/controles nativos
  } catch (e) {}
})();`;
  return /* @__PURE__ */ jsxs("html", {
    lang: "pt-br",
    children: [/* @__PURE__ */ jsxs("head", {
      children: [/* @__PURE__ */ jsx("meta", {
        charSet: "utf-8"
      }), /* @__PURE__ */ jsx("meta", {
        name: "viewport",
        content: "width=device-width, initial-scale=1"
      }), /* @__PURE__ */ jsx("link", {
        rel: "icon",
        type: "image/svg",
        href: "/favicon.svg"
      }), /* @__PURE__ */ jsx(Meta, {}), /* @__PURE__ */ jsx("script", {
        dangerouslySetInnerHTML: {
          __html: noFlashScript
        }
      }), /* @__PURE__ */ jsx(Links, {})]
    }), /* @__PURE__ */ jsxs("body", {
      children: [/* @__PURE__ */ jsx(QueryClientProvider, {
        client: queryClient,
        children: /* @__PURE__ */ jsx(ThemeProvider, {
          defaultTheme: "system",
          storageKey: "iefa-theme",
          children: /* @__PURE__ */ jsx(AuthProvider, {
            supabase,
            children
          })
        })
      }), /* @__PURE__ */ jsx(ScrollRestoration, {}), /* @__PURE__ */ jsx(Scripts, {})]
    })]
  });
}
const root = UNSAFE_withComponentProps(function App() {
  return /* @__PURE__ */ jsx(Outlet, {});
});
const route0 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  Layout,
  default: root,
  links
}, Symbol.toStringTag, { value: "Module" }));
async function loader() {
  return new Response("OK", {
    status: 200
  });
}
const health = UNSAFE_withComponentProps(function Health() {
  return null;
});
const route1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: health,
  loader
}, Symbol.toStringTag, { value: "Module" }));
const layout = UNSAFE_withComponentProps(function Layout2() {
  return /* @__PURE__ */ jsx("div", {
    className: "flex-1 h-full flex items-center align-middle content-center",
    children: /* @__PURE__ */ jsx(AuthLayout, {
      variant: "strip"
    })
  });
});
const route2 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: layout
}, Symbol.toStringTag, { value: "Module" }));
function meta$9({}) {
  return [{
    title: "Login"
  }, {
    name: "description",
    content: "Faça seu Login"
  }];
}
const login = UNSAFE_withComponentProps(Login);
const route3 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: login,
  meta: meta$9
}, Symbol.toStringTag, { value: "Module" }));
function meta$8({}) {
  return [{
    title: "Registre-se"
  }, {
    name: "description",
    content: "Faça seu Registro"
  }];
}
const register = UNSAFE_withComponentProps(Register);
const route4 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: register,
  meta: meta$8
}, Symbol.toStringTag, { value: "Module" }));
function meta$7({}) {
  return [{
    title: "Reset sua senha"
  }, {
    name: "description",
    content: "Altere sua senha"
  }];
}
const resetPassword = UNSAFE_withComponentProps(ResetPassword);
const route5 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: resetPassword,
  meta: meta$7
}, Symbol.toStringTag, { value: "Module" }));
const publicLayout = UNSAFE_withComponentProps(function PublicLayout() {
  const container = "w-full mx-auto px-4 sm:px-6 md:px-8 lg:max-w-[1100px] xl:max-w-[1280px] 2xl:max-w-[1400px]";
  return /* @__PURE__ */ jsxs("div", {
    className: "\n        relative isolate flex flex-col bg-background text-foreground\n        min-h-[100svh] supports-[height:100dvh]:min-h-[100dvh]\n\n        before:content-[''] before:absolute before:inset-0 before:-z-10 before:pointer-events-none\n        before:bg-[radial-gradient(1200px_800px_at_10%_-10%,rgb(52_211_153/0.14),transparent_60%),radial-gradient(900px_600px_at_90%_0%,rgb(6_182_212/0.12),transparent_60%),radial-gradient(800px_800px_at_50%_100%,rgb(139_92_246/0.10),transparent_60%)]\n        dark:before:bg-[radial-gradient(1200px_800px_at_10%_-10%,rgb(110_231_183/0.18),transparent_60%),radial-gradient(900px_600px_at_90%_0%,rgb(34_211_238/0.16),transparent_60%),radial-gradient(800px_800px_at_50%_100%,rgb(167_139_250/0.14),transparent_60%)]\n\n        before:transform-gpu motion-safe:before:animate-[slow-pan_32s_ease-in-out_infinite]\n\n        after:content-[''] after:pointer-events-none after:absolute after:inset-0 after:-z-10\n        after:bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.8)_1px,transparent_1px)]\n        after:bg-[length:12px_12px] after:opacity-[0.02]\n        dark:after:opacity-[0.04]\n      ",
    children: [/* @__PURE__ */ jsx("header", {
      className: "border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60",
      children: /* @__PURE__ */ jsxs("div", {
        className: `${container} h-14 flex items-center justify-between gap-3`,
        children: [/* @__PURE__ */ jsxs("div", {
          className: "flex items-center gap-3",
          children: [/* @__PURE__ */ jsx(NavLink, {
            to: "/",
            end: true,
            className: "text-base sm:text-lg font-bold tracking-tight rounded-md px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            "aria-label": "Página inicial - SISUB",
            children: "SISUB"
          }), /* @__PURE__ */ jsx(Separator, {
            orientation: "vertical",
            className: "h-6 hidden sm:block"
          }), /* @__PURE__ */ jsxs("nav", {
            className: "hidden md:flex items-center gap-1",
            "aria-label": "Navegação pública",
            children: [/* @__PURE__ */ jsx(NavLink, {
              to: "/",
              end: true,
              className: ({
                isActive
              }) => ["inline-flex items-center rounded-md text-sm font-medium transition-colors px-3 py-2", "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40", isActive ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-accent hover:text-accent-foreground"].join(" "),
              children: "Início"
            }), /* @__PURE__ */ jsx(NavLink, {
              to: "/tutorial",
              className: ({
                isActive
              }) => ["inline-flex items-center rounded-md text-sm font-medium transition-colors px-3 py-2", "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40", isActive ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-accent hover:text-accent-foreground"].join(" "),
              children: "Tutorial"
            }), /* @__PURE__ */ jsx(NavLink, {
              to: "/changelog",
              className: ({
                isActive
              }) => ["inline-flex items-center rounded-md text-sm font-medium transition-colors px-3 py-2", "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40", isActive ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-accent hover:text-accent-foreground"].join(" "),
              children: "Novidades"
            })]
          })]
        }), /* @__PURE__ */ jsxs("div", {
          className: "flex items-center gap-2",
          children: [/* @__PURE__ */ jsx(Button, {
            asChild: true,
            size: "sm",
            children: /* @__PURE__ */ jsx(NavLink, {
              to: "/login",
              children: "Entrar"
            })
          }), /* @__PURE__ */ jsx(ModeToggle, {})]
        })]
      })
    }), /* @__PURE__ */ jsx("main", {
      id: "conteudo",
      className: "flex-1",
      children: /* @__PURE__ */ jsx("div", {
        className: `${container} py-8 md:py-10`,
        children: /* @__PURE__ */ jsx(Outlet, {})
      })
    }), /* @__PURE__ */ jsx("footer", {
      className: "border-t",
      children: /* @__PURE__ */ jsxs("div", {
        className: `${container} h-14 flex items-center justify-center text-xs text-muted-foreground`,
        children: ["© ", (/* @__PURE__ */ new Date()).getFullYear(), " SISUB • Desenvolvido por Ten. Nanni (IEFA) e Temn. Bruno (GAP-MN)."]
      })
    })]
  });
});
const route6 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: publicLayout
}, Symbol.toStringTag, { value: "Module" }));
const steps = [{
  icon: ShieldCheck,
  title: "Faça Login",
  description: "Acesse o sistema com suas credenciais militares de forma segura através da autenticação Supabase."
}, {
  icon: Calendar,
  title: "Selecione os Dias",
  description: "Visualize os próximos 30 dias em cards organizados e selecione as refeições que irá consumir."
}, {
  icon: ClipboardCheck,
  title: "Confirme Automaticamente",
  description: "Suas seleções são salvas automaticamente, ajudando na previsão de demanda do rancho."
}];
const mealTypes = [{
  icon: Coffee,
  label: "Café da Manhã",
  time: "06:00 - 08:00"
}, {
  icon: UtensilsCrossed,
  label: "Almoço",
  time: "11:30 - 13:30"
}, {
  icon: Pizza,
  label: "Janta",
  time: "18:00 - 20:00"
}, {
  icon: Cake,
  label: "Ceia",
  time: "21:00 - 22:00"
}];
const features = [{
  icon: BarChart3,
  title: "Planejamento de 30 dias",
  description: "Visualize e planeje suas refeições para os próximos 30 dias de forma simples e intuitiva."
}, {
  icon: QrCode,
  title: "4 tipos de refeição",
  description: "Café da manhã, almoço, janta e ceia - marque quais refeições você irá consumir."
}, {
  icon: Users,
  title: "Por Organização Militar",
  description: "Sistema organizado por OM, facilitando o controle e gestão do rancho."
}, {
  icon: Bell,
  title: "Interface responsiva",
  description: "Acesse de qualquer dispositivo - computador, tablet ou smartphone."
}, {
  icon: ShieldCheck,
  title: "Seguro e confiável",
  description: "Autenticação segura e dados protegidos com tecnologia Supabase."
}, {
  icon: Settings,
  title: "Controle de demanda",
  description: "Ajude a administração a prever a demanda e reduzir o desperdício de alimentos."
}];
function meta$6({}) {
  return [{
    title: "Previsão SISUB"
  }, {
    name: "description",
    content: "Ajude a melhorar o SISUB"
  }];
}
const home = UNSAFE_withComponentProps(function Home() {
  const [currentFeature, setCurrentFeature] = useState(0);
  const CurrentFeatureIcon = features[currentFeature]?.icon ?? ShieldCheck;
  return /* @__PURE__ */ jsxs("div", {
    className: "w-full",
    children: [/* @__PURE__ */ jsx(HomeHero, {}), /* @__PURE__ */ jsxs(Appear$1, {
      id: "steps",
      className: "py-16 md:py-20",
      "aria-labelledby": "steps-heading",
      children: [/* @__PURE__ */ jsxs("div", {
        className: "text-center mb-14",
        children: [/* @__PURE__ */ jsxs(Badge, {
          variant: "outline",
          className: "mx-auto mb-3 gap-2",
          children: [/* @__PURE__ */ jsx(Star, {
            className: "h-4 w-4 text-primary"
          }), "Passo a passo"]
        }), /* @__PURE__ */ jsx("h2", {
          id: "steps-heading",
          className: "text-3xl md:text-4xl font-extrabold tracking-tight text-foreground mb-4",
          children: "Como funciona o sistema"
        }), /* @__PURE__ */ jsx("p", {
          className: "text-muted-foreground max-w-2xl mx-auto",
          children: "Um processo simples e eficiente para gerenciar suas previsões de refeições"
        })]
      }), /* @__PURE__ */ jsx("div", {
        className: "grid md:grid-cols-3 gap-6 md:gap-8 max-w-6xl mx-auto",
        children: steps.map((step, index) => {
          const Icon = step.icon;
          return /* @__PURE__ */ jsxs(Card, {
            className: "group relative overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 focus-within:ring-1 focus-within:ring-ring",
            children: [/* @__PURE__ */ jsx("div", {
              className: "absolute inset-x-0 top-0 h-px bg-gradient-to-r from-primary/50 via-primary/20 to-primary/50"
            }), /* @__PURE__ */ jsxs(CardHeader, {
              className: "text-center",
              children: [/* @__PURE__ */ jsx("div", {
                className: "mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted ring-1 ring-inset ring-border",
                children: /* @__PURE__ */ jsx(Icon, {
                  className: "h-8 w-8 text-primary"
                })
              }), /* @__PURE__ */ jsx(CardTitle, {
                className: "text-xl",
                children: step.title
              }), /* @__PURE__ */ jsx(CardDescription, {
                className: "text-muted-foreground",
                children: step.description
              })]
            }), /* @__PURE__ */ jsx(CardContent, {
              children: /* @__PURE__ */ jsx("div", {
                "aria-hidden": true,
                className: "pointer-events-none absolute -right-10 -bottom-10 h-28 w-28 rounded-full bg-primary/10 blur-2xl transition-all duration-300 group-hover:scale-110"
              })
            })]
          }, index);
        })
      })]
    }), /* @__PURE__ */ jsxs(Appear$1, {
      id: "meals",
      className: "py-16 md:py-20",
      "aria-labelledby": "meals-heading",
      children: [/* @__PURE__ */ jsx("div", {
        className: "text-center mb-14",
        children: /* @__PURE__ */ jsxs(Badge, {
          variant: "outline",
          className: "mx-auto mb-3 gap-2",
          children: [/* @__PURE__ */ jsx(UtensilsCrossed, {
            className: "h-4 w-4 text-primary"
          }), "Refeições"]
        })
      }), /* @__PURE__ */ jsxs("div", {
        className: "text-center mb-6",
        children: [/* @__PURE__ */ jsx("h2", {
          id: "meals-heading",
          className: "text-3xl md:text-4xl font-extrabold tracking-tight text-foreground mb-4",
          children: "Tipos de refeição disponíveis"
        }), /* @__PURE__ */ jsx("p", {
          className: "text-muted-foreground",
          children: "Marque quais refeições você irá consumir em cada dia"
        })]
      }), /* @__PURE__ */ jsx("div", {
        className: "grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto",
        children: mealTypes.map((meal, index) => {
          const Icon = meal.icon;
          return /* @__PURE__ */ jsx(Card, {
            tabIndex: 0,
            className: "group rounded-xl border border-border bg-card text-center shadow-sm ring-1 ring-inset ring-transparent hover:ring-border transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring",
            children: /* @__PURE__ */ jsxs(CardHeader, {
              children: [/* @__PURE__ */ jsx("div", {
                className: "mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted ring-1 ring-inset ring-border",
                children: /* @__PURE__ */ jsx(Icon, {
                  className: "h-8 w-8 text-foreground/80"
                })
              }), /* @__PURE__ */ jsx(CardTitle, {
                className: "text-lg",
                children: meal.label
              })]
            })
          }, index);
        })
      })]
    }), /* @__PURE__ */ jsxs(Appear$1, {
      id: "features",
      className: "py-16 md:py-20",
      "aria-labelledby": "features-heading",
      children: [/* @__PURE__ */ jsxs("div", {
        className: "text-center mb-14",
        children: [/* @__PURE__ */ jsxs(Badge, {
          variant: "outline",
          className: "mx-auto mb-3 gap-2",
          children: [/* @__PURE__ */ jsx(Star, {
            className: "h-4 w-4 text-primary"
          }), "Funcionalidades"]
        }), /* @__PURE__ */ jsx("h2", {
          id: "features-heading",
          className: "text-3xl md:text-4xl font-extrabold tracking-tight text-foreground mb-4",
          children: "Principais funcionalidades"
        }), /* @__PURE__ */ jsx("p", {
          className: "text-muted-foreground max-w-2xl mx-auto",
          children: "Desenvolvido especificamente para atender as necessidades do rancho militar"
        })]
      }), /* @__PURE__ */ jsx("div", {
        className: "max-w-4xl mx-auto mb-8",
        children: /* @__PURE__ */ jsxs("div", {
          className: "rounded-xl p-8 text-primary-foreground text-center shadow-lg ring-1 ring-inset ring-border/30 bg-gradient-to-r from-primary to-primary/85",
          children: [/* @__PURE__ */ jsx("div", {
            className: "mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary-foreground/10 ring-1 ring-inset ring-primary-foreground/20",
            children: /* @__PURE__ */ jsx(CurrentFeatureIcon, {
              className: "h-10 w-10 text-primary-foreground"
            })
          }), /* @__PURE__ */ jsx("h3", {
            className: "text-2xl font-bold mb-3 drop-shadow-sm",
            children: features[currentFeature]?.title ?? "—"
          }), /* @__PURE__ */ jsx("p", {
            className: "text-base md:text-lg/relaxed text-primary-foreground/90",
            children: features[currentFeature]?.description ?? ""
          })]
        })
      }), /* @__PURE__ */ jsx(Separator, {
        className: "my-6"
      }), /* @__PURE__ */ jsx("div", {
        className: "max-w-6xl mx-auto grid md:grid-cols-2 lg:grid-cols-3 gap-6",
        children: features.map((feature, index) => {
          const Icon = feature.icon;
          const active = index === currentFeature;
          return /* @__PURE__ */ jsxs("button", {
            type: "button",
            onClick: () => setCurrentFeature(index),
            className: `group w-full text-left rounded-xl border bg-card p-6 shadow-sm transition-all duration-300 border-border ring-1 ring-inset ${active ? "ring-primary/40 shadow-md" : "ring-transparent hover:-translate-y-0.5 hover:shadow-md hover:ring-border"} focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`,
            "aria-pressed": active,
            children: [/* @__PURE__ */ jsxs("div", {
              className: "mb-3 flex items-center gap-3",
              children: [/* @__PURE__ */ jsx("div", {
                className: `flex h-10 w-10 items-center justify-center rounded-xl ring-1 ring-inset ring-border ${active ? "bg-primary/10 text-primary" : "bg-muted text-foreground/80"}`,
                children: /* @__PURE__ */ jsx(Icon, {
                  className: "h-5 w-5"
                })
              }), /* @__PURE__ */ jsx("h3", {
                className: `text-lg font-bold ${active ? "text-primary" : "text-card-foreground"}`,
                children: feature.title
              })]
            }), /* @__PURE__ */ jsx("p", {
              className: "text-muted-foreground text-sm",
              children: feature.description
            })]
          }, index);
        })
      })]
    }), /* @__PURE__ */ jsx("section", {
      id: "learn",
      className: "py-20",
      "aria-label": "Aprenda",
      children: /* @__PURE__ */ jsxs("div", {
        className: "grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 max-w-6xl mx-auto",
        children: [/* @__PURE__ */ jsx(Appear$1, {
          id: "tutorial",
          children: /* @__PURE__ */ jsx(InfoCard, {
            badgeIcon: BookOpen,
            badgeText: "Tutorial",
            title: "Guia do SISUB",
            description: "Aprenda passo a passo a preencher previsões e a fiscalizar com QR no SISUB.",
            chips: [{
              icon: Users,
              text: "usuário"
            }, {
              icon: ShieldCheck,
              text: "fiscal"
            }, {
              icon: PlayCircle,
              text: "passo a passo"
            }],
            cta: {
              to: "/tutorial",
              label: "Ver Tutorial"
            }
          })
        }), /* @__PURE__ */ jsx(Appear$1, {
          id: "changelog",
          delayClass: "delay-100",
          children: /* @__PURE__ */ jsx(InfoCard, {
            badgeIcon: FileText,
            badgeText: "Novidades",
            title: "Novidades do SISUB",
            description: "Acompanhe as melhorias, correções e novas funcionalidades em tempo real.",
            chips: [{
              icon: Star,
              text: "feat"
            }, {
              icon: ShieldCheck,
              text: "fix"
            }, {
              icon: FileText,
              text: "docs"
            }, {
              icon: Clock,
              text: "perf"
            }],
            cta: {
              to: "/changelog",
              label: "Ver Changelog"
            }
          })
        })]
      })
    }), /* @__PURE__ */ jsx(Appear$1, {
      id: "cta",
      className: "relative py-20",
      "aria-labelledby": "cta-heading",
      children: /* @__PURE__ */ jsxs("div", {
        className: "relative text-center max-w-3xl mx-auto rounded-2xl bg-gradient-to-r from-primary to-primary/85 text-primary-foreground shadow-lg ring-1 ring-inset ring-border/30 overflow-hidden p-10 px-20",
        children: [/* @__PURE__ */ jsx("div", {
          "aria-hidden": true,
          className: "pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.12),transparent_50%)]"
        }), /* @__PURE__ */ jsxs("div", {
          className: "relative",
          children: [/* @__PURE__ */ jsx("h2", {
            id: "cta-heading",
            className: "text-3xl md:text-4xl font-extrabold tracking-tight mb-4",
            children: "Pronto para começar?"
          }), /* @__PURE__ */ jsx("p", {
            className: "text-primary-foreground/85 text-lg mb-8",
            children: "Faça parte da modernização do SISUB. Acesse agora e comece a planejar suas refeições de forma inteligente."
          }), /* @__PURE__ */ jsxs("div", {
            className: "flex flex-col items-center gap-3",
            children: [/* @__PURE__ */ jsx(Button, {
              asChild: true,
              size: "lg",
              variant: "secondary",
              className: "gap-2",
              children: /* @__PURE__ */ jsxs(Link, {
                to: "/login",
                "aria-label": "Ir para a página de login",
                children: ["Fazer Login", /* @__PURE__ */ jsx(ChevronRight, {
                  className: "h-5 w-5"
                })]
              })
            }), /* @__PURE__ */ jsxs("div", {
              className: "mt-6 flex flex-wrap justify-center items-center gap-6 text-primary-foreground/85",
              children: [/* @__PURE__ */ jsxs("div", {
                className: "flex items-center gap-2",
                children: [/* @__PURE__ */ jsx(Users, {
                  className: "h-5 w-5"
                }), /* @__PURE__ */ jsx("span", {
                  className: "text-sm",
                  children: "Sistema colaborativo"
                })]
              }), /* @__PURE__ */ jsxs("div", {
                className: "flex items-center gap-2",
                children: [/* @__PURE__ */ jsx(Clock, {
                  className: "h-5 w-5"
                }), /* @__PURE__ */ jsx("span", {
                  className: "text-sm",
                  children: "Disponível 24/7"
                })]
              }), /* @__PURE__ */ jsxs("div", {
                className: "flex items-center gap-2",
                children: [/* @__PURE__ */ jsx(ShieldBadge, {}), /* @__PURE__ */ jsx("span", {
                  className: "text-sm",
                  children: "Dados seguros"
                })]
              })]
            })]
          })]
        })]
      })
    })]
  });
});
function HomeHero() {
  return /* @__PURE__ */ jsx(Appear$1, {
    id: "hero",
    as: "div",
    className: "px-4 py-16",
    inClass: "opacity-100 translate-y-0",
    outClass: "opacity-0 translate-y-10",
    duration: "duration-500",
    children: /* @__PURE__ */ jsxs("div", {
      className: "text-center space-y-6 max-w-4xl mx-auto",
      children: [/* @__PURE__ */ jsx(Badge, {
        variant: "secondary",
        className: "px-4 py-2 text-sm font-medium animate-pulse",
        children: "Sistema de Previsão de Rancho"
      }), /* @__PURE__ */ jsxs("h1", {
        className: "text-5xl md:text-6xl lg:text-7xl font-bold text-foreground leading-tight",
        children: ["Sistema de", /* @__PURE__ */ jsx("span", {
          className: "block text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/60",
          children: "Subsistência"
        })]
      }), /* @__PURE__ */ jsx("p", {
        className: "text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed",
        children: "Sistema inteligente para previsão de demanda do rancho. Planeje suas refeições, reduza desperdícios e otimize a gestão alimentar."
      }), /* @__PURE__ */ jsxs("div", {
        className: "flex flex-col sm:flex-row gap-4 justify-center items-center pt-6",
        children: [/* @__PURE__ */ jsx(Button, {
          asChild: true,
          size: "lg",
          className: "gap-2",
          children: /* @__PURE__ */ jsx(Link, {
            to: "/login",
            children: "Acessar Sistema"
          })
        }), /* @__PURE__ */ jsxs("div", {
          className: "flex items-center space-x-2 text-sm text-muted-foreground",
          children: [/* @__PURE__ */ jsx(ShieldBadge, {}), /* @__PURE__ */ jsx("span", {
            children: "Login seguro necessário"
          })]
        })]
      })]
    })
  });
}
function ShieldBadge() {
  return /* @__PURE__ */ jsx("span", {
    className: "inline-flex items-center justify-center rounded-full w-5 h-5 bg-primary/10 text-primary",
    children: /* @__PURE__ */ jsx(ShieldCheck, {
      className: "w-3.5 h-3.5",
      "aria-hidden": "true"
    })
  });
}
function InfoCard(props) {
  const {
    badgeIcon: BadgeIcon,
    badgeText,
    title,
    description,
    chips = [],
    cta
  } = props;
  return /* @__PURE__ */ jsxs(Card, {
    className: "transition-all duration-700",
    children: [/* @__PURE__ */ jsxs(CardHeader, {
      className: "items-center text-center",
      children: [/* @__PURE__ */ jsxs(Badge, {
        variant: "outline",
        className: "mx-auto mb-1 gap-2",
        children: [/* @__PURE__ */ jsx(BadgeIcon, {
          className: "h-4 w-4 text-primary"
        }), badgeText]
      }), /* @__PURE__ */ jsx(CardTitle, {
        className: "text-2xl md:text-3xl",
        children: title
      }), /* @__PURE__ */ jsx(CardDescription, {
        className: "text-muted-foreground max-w-md mx-auto",
        children: description
      })]
    }), /* @__PURE__ */ jsxs(CardContent, {
      className: "flex flex-col items-center",
      children: [!!chips.length && /* @__PURE__ */ jsx("div", {
        className: "mb-8 flex flex-wrap items-center justify-center gap-2",
        children: chips.map((c, i) => {
          const Icon = c.icon;
          return /* @__PURE__ */ jsxs(Badge, {
            variant: "secondary",
            className: "gap-1",
            children: [/* @__PURE__ */ jsx(Icon, {
              className: "h-3.5 w-3.5"
            }), c.text]
          }, i);
        })
      }), /* @__PURE__ */ jsx(Button, {
        asChild: true,
        variant: "default",
        children: /* @__PURE__ */ jsxs(Link, {
          to: cta.to,
          "aria-label": cta.label,
          className: "gap-2",
          children: [cta.label, /* @__PURE__ */ jsx(ChevronRight, {
            className: "h-5 w-5"
          })]
        })
      })]
    })]
  });
}
function Appear$1(props) {
  const {
    id,
    as = "section",
    className = "",
    inClass = "opacity-100 translate-y-0",
    outClass = "opacity-0 translate-y-8",
    duration = "duration-700",
    delayClass = "",
    threshold = 0.12,
    rootMargin = "0px 0px -10% 0px",
    children,
    ...rest
  } = props;
  const [visible, setVisible] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry2]) => setVisible(entry2.isIntersecting), {
      threshold,
      rootMargin
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold, rootMargin]);
  const Comp = as;
  return /* @__PURE__ */ jsx(Comp, {
    id,
    ref,
    className: `${className} transition-all ${duration} ${delayClass} ${visible ? inClass : outClass}`,
    ...rest,
    children
  });
}
const route7 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: home,
  features,
  mealTypes,
  meta: meta$6,
  steps
}, Symbol.toStringTag, { value: "Module" }));
function meta$5({}) {
  return [{
    title: "Tutorial SISUB"
  }, {
    name: "description",
    content: "Aprenda a usar o SISUB: como preencher previsões e como fiscalizar via QR."
  }];
}
const tutorial = UNSAFE_withComponentProps(function Tutorial() {
  return /* @__PURE__ */ jsxs("div", {
    className: "min-h-screen",
    children: [/* @__PURE__ */ jsx(Appear, {
      id: "hero",
      as: "section",
      className: "container mx-auto px-4 pt-14 pb-10",
      duration: "duration-500",
      outClass: "opacity-0 translate-y-6",
      inClass: "opacity-100 translate-y-0",
      children: /* @__PURE__ */ jsx(Card, {
        className: "rounded-2xl border border-border bg-card shadow-sm",
        children: /* @__PURE__ */ jsx(CardContent, {
          className: "p-8 md:p-10",
          children: /* @__PURE__ */ jsxs("div", {
            className: "flex items-start md:items-center md:justify-between flex-col md:flex-row gap-6",
            children: [/* @__PURE__ */ jsxs("div", {
              children: [/* @__PURE__ */ jsxs(Badge, {
                variant: "outline",
                className: "inline-flex items-center gap-2 mb-4",
                children: [/* @__PURE__ */ jsx(BookOpen, {
                  className: "w-4 h-4 text-primary"
                }), heroData.badge]
              }), /* @__PURE__ */ jsx("h1", {
                className: "text-3xl md:text-4xl font-extrabold tracking-tight text-foreground mb-3",
                children: heroData.title
              }), /* @__PURE__ */ jsx("p", {
                className: "text-muted-foreground max-w-2xl",
                children: heroData.subtitle
              })]
            }), /* @__PURE__ */ jsxs("div", {
              className: "flex gap-3",
              children: [/* @__PURE__ */ jsx(Button, {
                asChild: true,
                children: /* @__PURE__ */ jsx(Link, {
                  to: heroData.primaryButton.to,
                  "aria-label": "Ir para Previsão",
                  children: heroData.primaryButton.label
                })
              }), /* @__PURE__ */ jsx(Button, {
                asChild: true,
                variant: "outline",
                children: /* @__PURE__ */ jsx(Link, {
                  to: heroData.secondaryButton.to,
                  "aria-label": "Ir para Fiscal",
                  children: heroData.secondaryButton.label
                })
              })]
            })]
          })
        })
      })
    }), /* @__PURE__ */ jsxs(Appear, {
      id: "overview",
      as: "section",
      className: "container mx-auto px-4 py-10",
      duration: "duration-500",
      delayClass: "delay-100",
      children: [/* @__PURE__ */ jsxs("div", {
        className: "text-center mb-10",
        children: [/* @__PURE__ */ jsxs(Badge, {
          variant: "outline",
          className: "mx-auto mb-3 gap-2",
          children: [/* @__PURE__ */ jsx(Info, {
            className: "h-4 w-4 text-primary"
          }), "Visão geral"]
        }), /* @__PURE__ */ jsx("h2", {
          className: "text-3xl md:text-4xl font-extrabold tracking-tight text-foreground",
          children: "Configurações e atalhos úteis"
        })]
      }), /* @__PURE__ */ jsx("div", {
        className: "grid md:grid-cols-3 gap-6 max-w-6xl mx-auto",
        children: overviewCards.map((card, idx) => /* @__PURE__ */ jsxs(Card, {
          className: "group relative overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 focus-within:ring-1 focus-within:ring-ring",
          children: [/* @__PURE__ */ jsx("div", {
            className: "absolute inset-x-0 top-0 h-px bg-gradient-to-r from-primary/50 via-primary/20 to-primary/50"
          }), /* @__PURE__ */ jsxs(CardHeader, {
            children: [/* @__PURE__ */ jsx("div", {
              className: "mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-muted ring-1 ring-inset ring-border",
              children: /* @__PURE__ */ jsx(card.icon, {
                className: "h-6 w-6 text-primary"
              })
            }), /* @__PURE__ */ jsx(CardTitle, {
              className: "text-lg",
              children: card.title
            }), /* @__PURE__ */ jsx(CardDescription, {
              className: "text-muted-foreground",
              children: card.description
            })]
          })]
        }, idx))
      })]
    }), /* @__PURE__ */ jsx(Appear, {
      id: "rancho",
      as: "section",
      className: "py-14",
      duration: "duration-500",
      delayClass: "delay-150",
      children: /* @__PURE__ */ jsxs("div", {
        className: "container mx-auto px-4",
        children: [/* @__PURE__ */ jsxs("div", {
          className: "text-center mb-10",
          children: [/* @__PURE__ */ jsxs(Badge, {
            variant: "outline",
            className: "mx-auto mb-3 gap-2",
            children: [/* @__PURE__ */ jsx(CalendarCheck, {
              className: "h-4 w-4 text-primary"
            }), "Previsão"]
          }), /* @__PURE__ */ jsx("h2", {
            className: "text-3xl font-extrabold tracking-tight text-foreground mb-2",
            children: "Preenchendo sua Previsão"
          }), /* @__PURE__ */ jsx("p", {
            className: "text-muted-foreground",
            children: "Como usar a página de Previsão (Rancho) para informar suas refeições"
          })]
        }), /* @__PURE__ */ jsx("div", {
          className: "grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto",
          children: ranchoSteps.map((s, i) => /* @__PURE__ */ jsx(StepCard, {
            icon: s.icon,
            title: s.title,
            description: s.description
          }, i))
        }), /* @__PURE__ */ jsx("div", {
          className: "mt-10 text-center",
          children: /* @__PURE__ */ jsx(Button, {
            asChild: true,
            className: "gap-2",
            children: /* @__PURE__ */ jsxs(Link, {
              to: "/rancho",
              children: ["Abrir página de Previsão", /* @__PURE__ */ jsx(ChevronRight, {
                className: "w-4 h-4"
              })]
            })
          })
        })]
      })
    }), /* @__PURE__ */ jsxs(Appear, {
      id: "fiscal",
      as: "section",
      className: "container mx-auto px-4 py-14",
      duration: "duration-500",
      delayClass: "delay-200",
      children: [/* @__PURE__ */ jsxs("div", {
        className: "text-center mb-10",
        children: [/* @__PURE__ */ jsxs(Badge, {
          variant: "outline",
          className: "mx-auto mb-3 gap-2",
          children: [/* @__PURE__ */ jsx(QrCode, {
            className: "h-4 w-4 text-primary"
          }), "Fiscal"]
        }), /* @__PURE__ */ jsx("h2", {
          className: "text-3xl font-extrabold tracking-tight text-foreground mb-2",
          children: "Fiscalização com Leitura de QR"
        }), /* @__PURE__ */ jsx("p", {
          className: "text-muted-foreground",
          children: "Passo a passo para usar o leitor e confirmar entradas"
        })]
      }), /* @__PURE__ */ jsx("div", {
        className: "grid md:grid-cols-3 lg:grid-cols-5 gap-6 max-w-6xl mx-auto",
        children: fiscalSteps.map((s, i) => /* @__PURE__ */ jsx(StepCard, {
          icon: s.icon,
          title: s.title,
          description: s.description
        }, i))
      }), /* @__PURE__ */ jsxs(Card, {
        className: "rounded-xl border border-border bg-card shadow-sm p-6 mt-8 max-w-4xl mx-auto",
        children: [/* @__PURE__ */ jsx(CardTitle, {
          className: "text-lg",
          children: "Dicas úteis"
        }), /* @__PURE__ */ jsx(Separator, {
          className: "my-3"
        }), /* @__PURE__ */ jsx("ul", {
          className: "text-muted-foreground text-sm list-disc pl-5 space-y-1",
          children: qrReaderTips.map((t, i) => /* @__PURE__ */ jsx("li", {
            children: t
          }, i))
        }), /* @__PURE__ */ jsx("div", {
          className: "mt-4",
          children: /* @__PURE__ */ jsx(Button, {
            asChild: true,
            variant: "outline",
            className: "gap-2",
            children: /* @__PURE__ */ jsxs(Link, {
              to: "/fiscal",
              children: ["Abrir Leitor de QR", /* @__PURE__ */ jsx(QrCode, {
                className: "w-4 h-4"
              })]
            })
          })
        })]
      })]
    }), /* @__PURE__ */ jsx(Appear, {
      id: "tips",
      as: "section",
      className: "py-14",
      duration: "duration-500",
      delayClass: "delay-200",
      children: /* @__PURE__ */ jsx("div", {
        className: "container mx-auto px-4",
        children: /* @__PURE__ */ jsxs(Card, {
          className: "rounded-2xl border border-border bg-card shadow-sm max-w-5xl mx-auto",
          children: [/* @__PURE__ */ jsxs(CardHeader, {
            className: "pb-3",
            children: [/* @__PURE__ */ jsxs(Badge, {
              variant: "outline",
              className: "w-fit gap-2",
              children: [/* @__PURE__ */ jsx(ShieldCheck, {
                className: "h-4 w-4 text-primary"
              }), "Boas Práticas"]
            }), /* @__PURE__ */ jsx(CardTitle, {
              className: "text-2xl",
              children: "Recomendações"
            }), /* @__PURE__ */ jsx(CardDescription, {
              className: "text-muted-foreground",
              children: "Dicas para garantir uma experiência consistente e segura"
            })]
          }), /* @__PURE__ */ jsx(CardContent, {
            children: /* @__PURE__ */ jsx("ul", {
              className: "text-foreground space-y-2 list-disc pl-6",
              children: tips.map((tip, i) => /* @__PURE__ */ jsx("li", {
                children: tip
              }, i))
            })
          })]
        })
      })
    }), /* @__PURE__ */ jsxs(Appear, {
      id: "faq",
      as: "section",
      className: "container mx-auto px-4 py-14",
      duration: "duration-500",
      delayClass: "delay-200",
      children: [/* @__PURE__ */ jsxs("div", {
        className: "text-center mb-8",
        children: [/* @__PURE__ */ jsxs(Badge, {
          variant: "outline",
          className: "mx-auto mb-3 gap-2",
          children: [/* @__PURE__ */ jsx(HelpCircle, {
            className: "w-4 h-4 text-primary"
          }), "Dúvidas Frequentes"]
        }), /* @__PURE__ */ jsx("h2", {
          className: "text-3xl font-extrabold tracking-tight text-foreground",
          children: "FAQ"
        })]
      }), /* @__PURE__ */ jsx("div", {
        className: "grid md:grid-cols-2 gap-6 max-w-5xl mx-auto",
        children: faqItems.map((qa, i) => /* @__PURE__ */ jsxs(Card, {
          className: "rounded-xl border border-border bg-card shadow-sm",
          children: [/* @__PURE__ */ jsx(CardHeader, {
            className: "pb-2",
            children: /* @__PURE__ */ jsx(CardTitle, {
              className: "text-base",
              children: qa.question
            })
          }), /* @__PURE__ */ jsx(CardContent, {
            className: "pt-0",
            children: /* @__PURE__ */ jsx("p", {
              className: "text-sm text-muted-foreground",
              children: qa.answer
            })
          })]
        }, i))
      })]
    }), /* @__PURE__ */ jsx(Appear, {
      id: "troubleshooting",
      as: "section",
      className: "py-14",
      duration: "duration-500",
      delayClass: "delay-200",
      children: /* @__PURE__ */ jsx("div", {
        className: "container mx-auto px-4",
        children: /* @__PURE__ */ jsx(Card, {
          className: "rounded-2xl border border-border bg-card shadow-sm max-w-5xl mx-auto",
          children: /* @__PURE__ */ jsxs(CardHeader, {
            className: "pb-3",
            children: [/* @__PURE__ */ jsxs(Badge, {
              variant: "outline",
              className: "w-fit gap-2",
              children: [/* @__PURE__ */ jsx(AlertTriangle, {
                className: "h-4 w-4 text-primary"
              }), "Resolução de Problemas"]
            }), /* @__PURE__ */ jsx(CardTitle, {
              className: "text-2xl",
              children: "Se algo não funcionar"
            }), /* @__PURE__ */ jsx(CardDescription, {
              className: "text-muted-foreground",
              children: "Ações rápidas para restabelecer o uso normal do sistema"
            })]
          })
        })
      })
    }), /* @__PURE__ */ jsx(Appear, {
      id: "privacy",
      as: "section",
      className: "container mx-auto px-4 py-14",
      duration: "duration-500",
      delayClass: "delay-200",
      children: /* @__PURE__ */ jsx(Card, {
        className: "rounded-2xl border border-border bg-card shadow-sm max-w-4xl mx-auto text-center",
        children: /* @__PURE__ */ jsxs(CardHeader, {
          children: [/* @__PURE__ */ jsx(CardTitle, {
            className: "text-2xl",
            children: privacy.title
          }), /* @__PURE__ */ jsx(CardDescription, {
            className: "text-muted-foreground",
            children: privacy.text
          })]
        })
      })
    }), /* @__PURE__ */ jsx(Appear, {
      id: "cta",
      as: "section",
      className: "py-16",
      duration: "duration-500",
      delayClass: "delay-250",
      children: /* @__PURE__ */ jsxs("div", {
        className: "relative text-center max-w-3xl mx-auto rounded-2xl bg-gradient-to-r from-primary to-primary/85 text-primary-foreground shadow-lg ring-1 ring-inset ring-border/30 overflow-hidden p-10 px-6 md:px-20",
        children: [/* @__PURE__ */ jsx("div", {
          "aria-hidden": true,
          className: "pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.12),transparent_50%)]"
        }), /* @__PURE__ */ jsxs("div", {
          className: "relative",
          children: [/* @__PURE__ */ jsx("h2", {
            className: "text-3xl font-extrabold tracking-tight mb-4",
            children: ctaData.title
          }), /* @__PURE__ */ jsx("p", {
            className: "text-primary-foreground/85 text-lg mb-8 max-w-2xl mx-auto",
            children: ctaData.text
          }), /* @__PURE__ */ jsx("div", {
            className: "flex flex-wrap items-center justify-center gap-4",
            children: ctaData.buttons.map((btn, i) => /* @__PURE__ */ jsx(Button, {
              asChild: true,
              variant: btn.variant === "outline" ? "outline" : "secondary",
              className: btn.variant === "outline" ? "text-primary-foreground border-primary-foreground/70 hover:bg-primary-foreground/10" : "text-primary shadow-none",
              children: /* @__PURE__ */ jsx(Link, {
                to: btn.to,
                children: btn.label
              })
            }, i))
          })]
        })]
      })
    })]
  });
});
function StepCard(props) {
  const {
    icon: Icon,
    title,
    description
  } = props;
  return /* @__PURE__ */ jsxs(Card, {
    className: "group w-full text-left rounded-xl border bg-card p-6 shadow-sm transition-all duration-300\n                 border-border ring-1 ring-inset ring-transparent hover:-translate-y-0.5 hover:shadow-md hover:ring-border\n                 focus-within:ring-1 focus-within:ring-ring",
    children: [/* @__PURE__ */ jsxs("div", {
      className: "mb-3 flex items-center gap-3",
      children: [/* @__PURE__ */ jsx("div", {
        className: "flex h-12 w-12 items-center justify-center rounded-xl bg-muted ring-1 ring-inset ring-border",
        children: /* @__PURE__ */ jsx(Icon, {
          className: "h-6 w-6 text-primary"
        })
      }), /* @__PURE__ */ jsx("h3", {
        className: "text-lg font-bold text-foreground",
        children: title
      })]
    }), /* @__PURE__ */ jsx("p", {
      className: "text-muted-foreground text-sm",
      children: description
    })]
  });
}
function Appear(props) {
  const {
    id,
    as = "section",
    className = "",
    inClass = "opacity-100 translate-y-0",
    outClass = "opacity-0 translate-y-8",
    duration = "duration-700",
    delayClass = "",
    threshold = 0.12,
    rootMargin = "0px 0px -10% 0px",
    children,
    ...rest
  } = props;
  const [visible, setVisible] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry2]) => setVisible(entry2.isIntersecting), {
      threshold,
      rootMargin
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold, rootMargin]);
  const Comp = as;
  return /* @__PURE__ */ jsx(Comp, {
    id,
    ref,
    className: [className, "transition-all", duration, delayClass, visible ? inClass : outClass].join(" "),
    ...rest,
    children
  });
}
const heroData = {
  badge: "Guia Rápido do SISUB",
  title: "Como usar o SISUB: Previsões e Fiscalização por QR",
  subtitle: "Siga este passo a passo para preencher suas previsões de refeições e realizar a fiscalização com segurança e rapidez.",
  primaryButton: {
    to: "/rancho",
    label: "Ir para Previsão"
  },
  secondaryButton: {
    to: "/fiscal",
    label: "Ir para Fiscal"
  }
};
const overviewCards = [{
  icon: Settings,
  title: "Unidade Padrão",
  description: "Aplique a OM padrão aos dias sem unidade para acelerar o preenchimento."
}, {
  icon: CalendarCheck,
  title: "Marque as Refeições",
  description: "Café, almoço, janta e ceia – selecione o que irá consumir."
}, {
  icon: Save,
  title: "Salvamento em Lote",
  description: "Use o botão flutuante para gravar as alterações pendentes."
}];
const ranchoSteps = [{
  icon: QrCode,
  title: "Abra seu QR no cabeçalho",
  description: "Na página de Previsão (Rancho), clique no botão com ícone de QR no topo para exibir seu código. É ele que o fiscal irá ler."
}, {
  icon: Settings,
  title: "Defina a Unidade Padrão",
  description: 'Use "Unidade Padrão" para aplicar rapidamente a OM aos dias sem unidade definida.'
}, {
  icon: CalendarCheck,
  title: "Marque as Refeições",
  description: "Nos cards de cada dia, ative/desative café, almoço, janta e ceia conforme for consumir."
}, {
  icon: Lock,
  title: "Dias bloqueados (política)",
  description: "Por operação do rancho, não é possível editar Hoje, Amanhã e Depois de Amanhã. Planeje-se com antecedência."
}, {
  icon: Save,
  title: "Salve Alterações",
  description: 'Quando houver pendências, use o botão flutuante "Salvar alterações" para gravar tudo de uma vez.'
}, {
  icon: RefreshCw,
  title: "Atualize Previsões",
  description: "Se necessário, clique em atualizar para recarregar os dados existentes."
}];
const fiscalSteps = [{
  icon: Camera,
  title: "Permita o Acesso à Câmera",
  description: "Ao abrir o leitor, conceda a permissão da câmera. Sem isso, o scanner não inicia."
}, {
  icon: QrCode,
  title: "Escaneie o QR do Militar",
  description: "Aponte a câmera para o QR do usuário (obtido pelo botão no cabeçalho da página de Previsão)."
}, {
  icon: Info,
  title: "Confira a Previsão",
  description: "O sistema mostra a previsão para data, refeição e unidade atuais. Ajuste se necessário."
}, {
  icon: Save,
  title: "Confirme a Presença",
  description: 'Confirme no diálogo. Com "Fechar Auto." ativo, a confirmação ocorre automaticamente após ~3s.'
}, {
  icon: RefreshCw,
  title: "Pausar/Retomar e Atualizar",
  description: 'Use "Pausar/Ler" para controlar o scanner e o botão de "refresh" se a câmera ficar instável.'
}];
const qrReaderTips = ["Prefira a câmera traseira (environment) para melhor foco.", "Mantenha o QR visível e bem iluminado.", "Com “Fechar Auto.” ativo, a confirmação ocorre automaticamente após alguns segundos.", "Use “Pausar/Ler” para alternar o scanner e “refresh” se a câmera ficar instável."];
const tips = ["Planeje com antecedência: as edições para Hoje, Amanhã e Depois de Amanhã são bloqueadas.", "Sempre confirme a OM antes de salvar as seleções do dia.", "Leve seu QR aberto no celular quando chegar ao rancho para agilizar a fiscalização.", "Evite redes instáveis ao usar o leitor de QR."];
const faqItems = [{
  question: "Onde encontro meu QR para o rancho?",
  answer: "Na página de Previsão (Rancho), clique no botão com ícone de QR no cabeçalho. Um diálogo abrirá exibindo o seu QR e o seu ID."
}, {
  question: "Por que não consigo editar dias próximos?",
  answer: "Por política operacional do rancho, as edições para Hoje, Amanhã e Depois de Amanhã são bloqueadas, permitindo o preparo adequado das refeições."
}, {
  question: "Minhas alterações não salvaram",
  answer: "Verifique se há alterações pendentes e clique em “Salvar alterações”. Aguarde a confirmação antes de sair da página."
}, {
  question: "Sem acesso à câmera",
  answer: "Conceda permissão ao navegador nas configurações do site (cadeado na barra de endereço) ou tente outro navegador/dispositivo."
}];
const privacy = {
  title: "Privacidade e Segurança",
  text: "O uso do QR e das previsões deve seguir as normas internas da OM. Em caso de dúvidas sobre dados e acessos, procure o responsável pelo sistema."
};
const ctaData = {
  title: "Pronto para aplicar?",
  text: "Acesse agora as páginas de Previsão e Fiscalização para colocar em prática os passos deste tutorial.",
  buttons: [{
    to: "/rancho",
    label: "Abrir Previsão →",
    variant: "default"
  }, {
    to: "/fiscal",
    label: "Abrir Leitor de QR →",
    variant: "outline"
  }]
};
const route8 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: tutorial,
  meta: meta$5
}, Symbol.toStringTag, { value: "Module" }));
function safeAnchorId(id) {
  return `chlg-${String(id)}`.replace(/[^A-Za-z0-9\-_:.]/g, "-");
}
function formatDate$1(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "short"
  }).format(d);
}
function transformLinkUri(href) {
  if (!href) return href;
  try {
    const u = new URL(href, "https://dummy.base");
    const allowed = ["http:", "https:", "mailto:"];
    return allowed.includes(u.protocol) ? href : "#";
  } catch {
    return "#";
  }
}
function toneBadge(tone = "muted") {
  return [`bg-[hsl(var(--${tone}))]/12`, `text-[hsl(var(--${tone}-foreground, var(--${tone})))]`, `border-[hsl(var(--${tone}))]/25`].join(" ");
}
const TAG_TONE = {
  feat: toneBadge("primary"),
  fix: toneBadge("destructive"),
  docs: toneBadge("secondary"),
  perf: toneBadge("accent")
};
async function fetchChangelogPage(page, pageSize) {
  const from = page * pageSize;
  const to = from + pageSize;
  const {
    data,
    error
  } = await supabase.from("changelog").select("id, version, title, body, tags, published_at, published").eq("published", true).order("published_at", {
    ascending: false
  }).range(from, to);
  if (error) {
    throw new Error(error.message || "Não foi possível carregar o changelog.");
  }
  const rows = data ?? [];
  const hasMore = rows.length > pageSize;
  const items = hasMore ? rows.slice(0, pageSize) : rows;
  return {
    items,
    nextPage: hasMore ? page + 1 : void 0,
    hasMore
  };
}
function meta$4({}) {
  return [{
    title: "Lista de Atualizações"
  }, {
    name: "description",
    content: "Veja o que mudou no sistema"
  }];
}
const markdownComponents = {
  a: ({
    node,
    href,
    ...props
  }) => /* @__PURE__ */ jsx("a", {
    ...props,
    href: transformLinkUri(href),
    className: "text-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]/90 underline",
    target: "_blank",
    rel: "noopener noreferrer nofollow"
  }),
  ul: ({
    node,
    ...props
  }) => /* @__PURE__ */ jsx("ul", {
    ...props,
    className: "list-disc pl-6"
  }),
  ol: ({
    node,
    ...props
  }) => /* @__PURE__ */ jsx("ol", {
    ...props,
    className: "list-decimal pl-6"
  }),
  code: (props) => {
    const {
      inline,
      className,
      children,
      ...rest
    } = props;
    if (inline) {
      return /* @__PURE__ */ jsx("code", {
        ...rest,
        className: `rounded bg-muted px-1.5 py-0.5 font-mono text-sm text-foreground ${className ?? ""}`,
        children
      });
    }
    return /* @__PURE__ */ jsx("pre", {
      className: "bg-muted text-foreground p-4 rounded-lg overflow-x-auto",
      children: /* @__PURE__ */ jsx("code", {
        ...rest,
        className,
        children
      })
    });
  }
};
function SkeletonList() {
  return /* @__PURE__ */ jsx("div", {
    className: "max-w-3xl mx-auto space-y-4",
    children: Array.from({
      length: 3
    }).map((_, i) => /* @__PURE__ */ jsxs("div", {
      className: "bg-card rounded-xl border border-border p-6 animate-pulse",
      children: [/* @__PURE__ */ jsx("div", {
        className: "h-4 w-32 bg-muted rounded mb-3"
      }), /* @__PURE__ */ jsx("div", {
        className: "h-6 w-2/3 bg-muted rounded mb-4"
      }), /* @__PURE__ */ jsx("div", {
        className: "h-4 w-full bg-muted rounded mb-2"
      }), /* @__PURE__ */ jsx("div", {
        className: "h-4 w-5/6 bg-muted rounded mb-2"
      }), /* @__PURE__ */ jsx("div", {
        className: "h-4 w-4/6 bg-muted rounded"
      })]
    }, i))
  });
}
function MessageBox({
  tone = "muted",
  title,
  message,
  action
}) {
  const toneClasses = tone === "destructive" ? "bg-[hsl(var(--destructive))]/10 border-[hsl(var(--destructive))]/30 text-[hsl(var(--destructive-foreground, var(--destructive)))]" : "bg-card border-border text-foreground";
  return /* @__PURE__ */ jsx("div", {
    className: "max-w-3xl mx-auto mb-8",
    "aria-live": "polite",
    children: /* @__PURE__ */ jsxs("div", {
      className: `border rounded-xl p-4 ${toneClasses}`,
      children: [title && /* @__PURE__ */ jsx("p", {
        className: "font-semibold mb-1",
        children: title
      }), /* @__PURE__ */ jsx("p", {
        className: "text-sm text-muted-foreground",
        children: message
      }), action && /* @__PURE__ */ jsx("button", {
        onClick: action.onClick,
        className: "mt-3 inline-flex items-center gap-2 bg-background border border-border text-foreground hover:bg-accent/10 px-3 py-1.5 rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "aria-busy": action.busy,
        children: action.busy ? "Carregando..." : action.label
      })]
    })
  });
}
function MarkdownContent({
  children
}) {
  return /* @__PURE__ */ jsx("div", {
    className: "prose max-w-none leading-relaxed dark:prose-invert prose-headings:text-foreground prose-p:text-muted-foreground",
    children: /* @__PURE__ */ jsx(ReactMarkdown, {
      remarkPlugins: [remarkGfm, remarkBreaks],
      components: markdownComponents,
      children
    })
  });
}
const TagBadge = React__default.memo(function TagBadge2({
  id,
  tag
}) {
  const key = (tag ?? "").toLowerCase();
  const tone = TAG_TONE[key] ?? toneBadge("muted");
  return /* @__PURE__ */ jsx("span", {
    className: `inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${tone}`,
    children: tag
  });
});
const ChangelogCard = React__default.memo(function ChangelogCard2({
  entry: entry2
}) {
  const anchorId = safeAnchorId(entry2.id);
  return /* @__PURE__ */ jsxs("article", {
    id: anchorId,
    className: "bg-card rounded-xl p-6 border border-border hover:border-foreground/20 shadow-sm hover:shadow-md transition",
    children: [/* @__PURE__ */ jsxs("div", {
      className: "flex flex-wrap items-center justify-between gap-3 mb-2",
      children: [/* @__PURE__ */ jsxs("div", {
        className: "flex items-center gap-3",
        children: [/* @__PURE__ */ jsx("a", {
          href: `#${anchorId}`,
          className: "text-muted-foreground hover:text-foreground",
          "aria-label": "Link para esta entrada",
          title: "Copiar link desta entrada",
          children: "#"
        }), entry2.version && /* @__PURE__ */ jsxs("span", {
          className: `inline-flex items-center text-sm font-semibold px-2.5 py-1 rounded-full border ${toneBadge("primary")}`,
          children: ["v", entry2.version]
        }), /* @__PURE__ */ jsx("h2", {
          className: "text-xl font-bold text-foreground",
          children: entry2.title
        })]
      }), /* @__PURE__ */ jsx("time", {
        className: "text-sm text-muted-foreground",
        dateTime: entry2.published_at,
        title: formatDate$1(entry2.published_at),
        children: formatDistanceToNow(new Date(entry2.published_at), {
          addSuffix: true,
          locale: ptBR
        })
      })]
    }), entry2.tags?.length ? /* @__PURE__ */ jsx("div", {
      className: "flex flex-wrap gap-2 mb-4",
      children: entry2.tags.map((t) => /* @__PURE__ */ jsx(TagBadge, {
        id: entry2.id,
        tag: t
      }, `${entry2.id}-${t}`))
    }) : null, /* @__PURE__ */ jsx(MarkdownContent, {
      children: entry2.body ?? ""
    })]
  });
});
const PAGE_SIZE = 10;
const changelog = UNSAFE_withComponentProps(function Changelog() {
  const {
    data,
    isLoading,
    isFetchingNextPage,
    error,
    hasNextPage,
    fetchNextPage,
    refetch
  } = useInfiniteQuery({
    queryKey: ["changelog", "list", PAGE_SIZE],
    queryFn: ({
      pageParam = 0
    }) => fetchChangelogPage(pageParam, PAGE_SIZE),
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
    staleTime: 5 * 60 * 1e3,
    // 5min
    gcTime: 10 * 60 * 1e3,
    // 10min
    retry: 2,
    refetchOnWindowFocus: false
  });
  const items = React__default.useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);
  const GITHUB_REPO_URL = "https://github.com/IEFA-FAB/IEFA/";
  return /* @__PURE__ */ jsxs("div", {
    className: "min-h-screen flex flex-col text-foreground",
    children: [/* @__PURE__ */ jsx("section", {
      className: "container mx-auto px-4 pt-14 pb-8",
      children: /* @__PURE__ */ jsxs("div", {
        className: "text-center",
        children: [/* @__PURE__ */ jsx("h1", {
          className: "text-4xl font-extrabold mb-3",
          children: "Changelog"
        }), /* @__PURE__ */ jsx("p", {
          className: "text-muted-foreground max-w-2xl mx-auto",
          children: "Acompanhe as melhorias, correções e novidades do SISUB em tempo real."
        }), /* @__PURE__ */ jsx("div", {
          className: "mt-6 flex items-center justify-center",
          children: /* @__PURE__ */ jsx(Link, {
            to: "/",
            className: "inline-flex items-center gap-2 text-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]/90 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded",
            children: "← Voltar para a Home"
          })
        })]
      })
    }), /* @__PURE__ */ jsxs("main", {
      className: "container mx-auto px-4 pb-16 flex-1",
      children: [isLoading && /* @__PURE__ */ jsx(SkeletonList, {}), !isLoading && error && /* @__PURE__ */ jsx(MessageBox, {
        tone: "destructive",
        title: "Erro ao carregar",
        message: error.message,
        action: {
          label: "Tentar novamente",
          onClick: () => refetch()
        }
      }), !isLoading && !error && items.length === 0 && /* @__PURE__ */ jsx(MessageBox, {
        message: "Nenhuma publicação encontrada ainda. Volte em breve!"
      }), !isLoading && !error && items.length > 0 && /* @__PURE__ */ jsxs("div", {
        className: "max-w-3xl mx-auto space-y-6",
        children: [items.map((entry2) => /* @__PURE__ */ jsx(ChangelogCard, {
          entry: entry2
        }, entry2.id)), hasNextPage && /* @__PURE__ */ jsx("div", {
          className: "flex justify-center pt-2",
          children: /* @__PURE__ */ jsx("button", {
            onClick: () => fetchNextPage(),
            disabled: isFetchingNextPage,
            "aria-busy": isFetchingNextPage,
            className: "inline-flex items-center gap-2 bg-background border border-border text-foreground hover:bg-accent/10 px-4 py-2 rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            children: isFetchingNextPage ? "Carregando..." : "Carregar mais"
          })
        })]
      })]
    }), /* @__PURE__ */ jsx(Card, {
      className: "py-12",
      children: /* @__PURE__ */ jsxs("div", {
        className: "container mx-auto px-4 text-center",
        children: [/* @__PURE__ */ jsx("h3", {
          className: "text-2xl font-bold mb-3",
          children: "Quer contribuir?"
        }), /* @__PURE__ */ jsx("p", {
          className: "text-[hsl(var(--primary-foreground))]/80 max-w-2xl mx-auto mb-6",
          children: "Ajude a melhorar o SISUB: envie sugestões, correções e novas funcionalidades diretamente pelo GitHub."
        }), /* @__PURE__ */ jsxs("a", {
          href: GITHUB_REPO_URL,
          target: "_blank",
          rel: "noopener noreferrer nofollow",
          className: "inline-flex items-center gap-2 bg-background text-[hsl(var(--primary))] hover:bg-accent/10 px-6 py-3 font-semibold rounded-lg transition shadow-lg hover:shadow-xl border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          children: [/* @__PURE__ */ jsx("svg", {
            "aria-hidden": "true",
            viewBox: "0 0 24 24",
            fill: "currentColor",
            className: "w-5 h-5",
            children: /* @__PURE__ */ jsx("path", {
              fillRule: "evenodd",
              d: "M12 2C6.477 2 2 6.58 2 12.114c0 4.48 2.865 8.27 6.839 9.614.5.095.683-.219.683-.486 0-.24-.009-.874-.014-1.716-2.782.61-3.37-1.36-3.37-1.36-.455-1.163-1.11-1.474-1.11-1.474-.907-.629.069-.617.069-.617 1.003.072 1.53 1.04 1.53 1.04.892 1.547 2.341 1.101 2.91.842.091-.654.35-1.101.636-1.355-2.221-.256-4.555-1.13-4.555-5.027 0-1.11.39-2.017 1.03-2.728-.103-.257-.447-1.29.098-2.69 0 0 .84-.27 2.75 1.04a9.38 9.38 0 0 1 2.505-.342c.85.004 1.706.116 2.505.342 1.91-1.31 2.749-1.04 2.749-1.04.546 1.4.202 2.433.099 2.69.64.711 1.029 1.618 1.029 2.728 0 3.906-2.338 4.768-4.566 5.02.36.314.68.93.68 1.874 0 1.353-.012 2.443-.012 2.776 0 .27.181.586.689.486A10.12 10.12 0 0 0 22 12.114C22 6.58 17.523 2 12 2Z",
              clipRule: "evenodd"
            })
          }), "Contribuir no GitHub"]
        })]
      })
    })]
  });
});
const route9 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: changelog,
  meta: meta$4
}, Symbol.toStringTag, { value: "Module" }));
function ProtectedBoundary({ children }) {
  const location = useLocation();
  const { user, isLoading, refreshSession } = useAuth();
  const attemptedRecoveryRef = useRef(false);
  const [recovering, setRecovering] = useState(false);
  useEffect(() => {
    if (isLoading || user || attemptedRecoveryRef.current) return;
    attemptedRecoveryRef.current = true;
    setRecovering(true);
    (async () => {
      try {
        await refreshSession().catch(() => {
        });
        await new Promise((r) => setTimeout(r, 50));
      } finally {
        setRecovering(false);
      }
    })();
  }, [isLoading, user, refreshSession]);
  if (!user) {
    const redirectTo = encodeURIComponent(
      `${location.pathname}${location.search}`
    );
    return /* @__PURE__ */ jsx(Navigate, { to: `/login?redirectTo=${redirectTo}`, replace: true });
  }
  return /* @__PURE__ */ jsx(Fragment, { children });
}
const LEVELS_ORDER = [
  "comensal",
  "user",
  "admin",
  "superadmin"
];
const DROPDOWN_TITLE = {
  comensal: "Comensal",
  user: "Fiscal",
  admin: "Gestor",
  superadmin: "SDAB"
};
const DROPDOWN_ICON = {
  comensal: UtensilsCrossed,
  user: ShieldCheck,
  admin: Settings,
  superadmin: FileText
};
const LEVEL_SUBITEMS = {
  comensal: [{ title: "Previsão", url: "/rancho" }],
  user: [{ title: "Leitor QrCode", url: "/fiscal" }],
  admin: [{ title: "Painel do rancho", url: "/admin" }],
  superadmin: [{ title: "Painel do sistema", url: "/superadmin" }]
};
function getAccumulatedLevels(level) {
  const idx = LEVELS_ORDER.indexOf(level);
  return idx >= 0 ? LEVELS_ORDER.slice(0, idx + 1) : ["comensal"];
}
function buildSidebarData({
  level,
  activePath
}) {
  const levels = getAccumulatedLevels(level);
  const navMain = levels.map((lv) => {
    const items = LEVEL_SUBITEMS[lv] ?? [];
    const isActive = !!activePath && items.some((it) => it.url === activePath);
    return {
      title: DROPDOWN_TITLE[lv],
      icon: DROPDOWN_ICON[lv],
      isActive,
      items
      // NavMain espera items: { title, url }[]
    };
  });
  return {
    teams: [
      {
        name: "SISUB",
        logo: "sheets",
        plan: DROPDOWN_TITLE[level]
      }
    ],
    navMain
  };
}
function getNavItemsForLevel(level) {
  const levels = getAccumulatedLevels(level);
  return levels.flatMap(
    (lv) => (LEVEL_SUBITEMS[lv] ?? []).map((it) => ({
      to: it.url,
      label: it.title,
      icon: DROPDOWN_ICON[lv]
    }))
  );
}
function UserQrDialog({
  open,
  onOpenChange,
  userId,
  onCopy,
  hasCopied
}) {
  const titleId = useId();
  const descId = useId();
  const qrCanvasRef = useRef(null);
  const canInteract = Boolean(userId);
  const handleDownload = useCallback(() => {
    if (!qrCanvasRef.current || !userId) return;
    try {
      const url = qrCanvasRef.current.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `user-${userId}-qrcode.png`;
      a.click();
    } catch {
    }
  }, [userId]);
  const handleKeyDown = useCallback(
    (e) => {
      const isCopy = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && canInteract;
      if (isCopy) {
        e.preventDefault();
        onCopy();
      }
    },
    [onCopy, canInteract]
  );
  return /* @__PURE__ */ jsx(Dialog, { open, onOpenChange, children: /* @__PURE__ */ jsxs(
    DialogContent,
    {
      "aria-labelledby": titleId,
      "aria-describedby": descId,
      onKeyDown: handleKeyDown,
      className: "w-[95vw] max-w-md overflow-hidden p-0",
      children: [
        /* @__PURE__ */ jsx("div", { className: "bg-primary px-4 py-3 text-primary-foreground sm:px-6 sm:py-4", children: /* @__PURE__ */ jsxs(DialogHeader, { children: [
          /* @__PURE__ */ jsxs(
            DialogTitle,
            {
              id: titleId,
              className: "flex items-center gap-2 text-lg font-bold sm:text-xl",
              children: [
                /* @__PURE__ */ jsx(
                  "span",
                  {
                    "aria-hidden": "true",
                    className: "inline-flex rounded-lg bg-primary-foreground/15 p-1.5 sm:p-2",
                    children: /* @__PURE__ */ jsx(QrCode, { className: "h-4 w-4 sm:h-5 sm:w-5" })
                  }
                ),
                /* @__PURE__ */ jsx("span", { children: "Seu QR Code" })
              ]
            }
          ),
          /* @__PURE__ */ jsx(
            DialogDescription,
            {
              id: descId,
              className: "mt-1 text-sm text-primary-foreground/80 sm:mt-2",
              children: "Use este código para identificação rápida no sistema."
            }
          ),
          /* @__PURE__ */ jsxs(
            DialogPrimitive.Close,
            {
              "data-slot": "dialog-close",
              className: "ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute right-4 top-4 rounded-xs opacity-90 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
              children: [
                /* @__PURE__ */ jsx(XIcon, { "aria-hidden": "true", className: "stroke-background" }),
                /* @__PURE__ */ jsx("span", { className: "sr-only", children: "Fechar" })
              ]
            }
          )
        ] }) }),
        /* @__PURE__ */ jsx("div", { className: "bg-muted px-3 py-4 sm:px-6 sm:py-8", children: /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center gap-4 sm:gap-5", children: [
          /* @__PURE__ */ jsx("div", { className: "rounded-xl border-2 bg-white shadow-lg sm:rounded-2xl sm:border-4 p-2", children: canInteract ? /* @__PURE__ */ jsx(
            QRCodeCanvas,
            {
              role: "img",
              "aria-label": `QR Code para o usuário ${userId}`,
              value: userId ?? "",
              size: 240,
              level: "M",
              includeMargin: true,
              bgColor: "#ffffff",
              fgColor: "#111827",
              ref: qrCanvasRef,
              className: "w-full h-full rounded-2xl"
            }
          ) : /* @__PURE__ */ jsx(
            "div",
            {
              "aria-busy": "true",
              className: "h-[140px] w-[140px] animate-pulse rounded-md bg-muted-foreground/10 sm:h-[180px] sm:w-[180px]"
            }
          ) }),
          /* @__PURE__ */ jsxs("div", { className: "w-full max-w-xs space-y-2 text-center sm:max-w-sm", children: [
            /* @__PURE__ */ jsx("p", { className: "text-xs font-medium text-muted-foreground sm:text-sm", children: "ID do Usuário" }),
            /* @__PURE__ */ jsx("div", { className: "w-full overflow-hidden rounded-lg border bg-card px-2 py-1.5 font-mono text-xs text-foreground sm:px-4 sm:py-2", children: /* @__PURE__ */ jsx("span", { className: "block truncate text-center", children: userId ?? "N/A" }) }),
            /* @__PURE__ */ jsxs("div", { className: "flex w-full flex-col items-center gap-2 sm:flex-row sm:justify-center", children: [
              /* @__PURE__ */ jsxs(
                Button,
                {
                  type: "button",
                  variant: "secondary",
                  size: "sm",
                  onClick: onCopy,
                  disabled: !canInteract,
                  className: "w-full sm:w-auto",
                  children: [
                    /* @__PURE__ */ jsx(Copy, { className: "mr-2 h-3.5 w-3.5", "aria-hidden": "true" }),
                    hasCopied ? "Copiado!" : "Copiar ID"
                  ]
                }
              ),
              /* @__PURE__ */ jsxs(
                Button,
                {
                  type: "button",
                  variant: "default",
                  size: "sm",
                  onClick: handleDownload,
                  disabled: !canInteract,
                  className: "w-full sm:w-auto",
                  children: [
                    /* @__PURE__ */ jsx(
                      Download,
                      {
                        className: "mr-2 h-3.5 w-3.5",
                        "aria-hidden": "true"
                      }
                    ),
                    "Baixar PNG"
                  ]
                }
              )
            ] }),
            /* @__PURE__ */ jsx("p", { className: "mt-1 text-[11px] text-muted-foreground sm:text-xs", children: "Não compartilhe seu QR Code publicamente." })
          ] })
        ] }) })
      ]
    }
  ) });
}
const RATINGS = [1, 2, 3, 4, 5];
const RATING_LABEL = {
  1: "Péssimo",
  2: "Ruim",
  3: "Ok",
  4: "Bom",
  5: "Excelente"
};
function buttonToneClasses(value, selected) {
  const isSelected = selected === value;
  const base = "flex h-12 w-12 items-center justify-center rounded-lg font-semibold transition-transform select-none border peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2";
  if (!isSelected) {
    return cn$2(base, "bg-muted text-muted-foreground hover:scale-105");
  }
  if (value <= 2)
    return cn$2(
      base,
      "bg-destructive text-destructive-foreground shadow-md scale-105"
    );
  if (value === 3)
    return cn$2(
      base,
      "bg-secondary text-secondary-foreground shadow-md scale-105"
    );
  return cn$2(base, "bg-primary text-primary-foreground shadow-md scale-105");
}
function submitToneClasses(selected) {
  if (selected == null) return void 0;
  if (selected <= 2)
    return "bg-destructive text-destructive-foreground hover:opacity-90";
  if (selected === 3)
    return "bg-secondary text-secondary-foreground hover:opacity-90";
  return "bg-primary text-primary-foreground hover:opacity-90";
}
function EvaluationDialog({
  open,
  question,
  selectedRating,
  isSubmitting,
  onOpenChange,
  onSelectRating,
  onSubmit
}) {
  const resolvedQuestion = question || "Como você avalia?";
  const handleSubmit = (e) => {
    e.preventDefault();
    if (selectedRating != null && !isSubmitting) onSubmit();
  };
  return /* @__PURE__ */ jsx(Dialog, { open, onOpenChange, children: /* @__PURE__ */ jsxs(
    DialogContent,
    {
      className: "sm:max-w-md",
      showCloseButton: true,
      "aria-busy": isSubmitting,
      children: [
        /* @__PURE__ */ jsxs(DialogHeader, { children: [
          /* @__PURE__ */ jsx(DialogTitle, { children: "Avaliação rápida" }),
          /* @__PURE__ */ jsx(DialogDescription, { className: "py-4 text-center text-2xl text-foreground", children: resolvedQuestion })
        ] }),
        /* @__PURE__ */ jsxs("form", { onSubmit: handleSubmit, children: [
          /* @__PURE__ */ jsx("p", { className: "mb-3 text-center text-sm text-muted-foreground", children: "Sua opinião ajuda a melhorar a experiência. Escolha uma nota de 1 a 5:" }),
          /* @__PURE__ */ jsxs(
            "fieldset",
            {
              className: "relative mx-auto w-full max-w-xs",
              "aria-label": "Avaliação de 1 a 5",
              children: [
                /* @__PURE__ */ jsx("legend", { className: "sr-only", children: "Selecione uma nota" }),
                /* @__PURE__ */ jsx("div", { className: "relative flex items-center justify-between gap-2 p-2", children: RATINGS.map((value) => /* @__PURE__ */ jsxs("label", { className: "relative", children: [
                  /* @__PURE__ */ jsx(
                    "input",
                    {
                      type: "radio",
                      name: "rating",
                      value,
                      className: "peer sr-only",
                      checked: selectedRating === value,
                      onChange: () => onSelectRating(value),
                      "aria-label": `Nota ${value} de 5: ${RATING_LABEL[value]}`
                    }
                  ),
                  /* @__PURE__ */ jsx("span", { className: buttonToneClasses(value, selectedRating), children: value })
                ] }, value)) }),
                /* @__PURE__ */ jsxs("div", { className: "mt-2 flex justify-between px-2 text-[11px] text-muted-foreground", children: [
                  /* @__PURE__ */ jsx("span", { children: "Péssimo" }),
                  /* @__PURE__ */ jsx("span", { children: "Excelente" })
                ] })
              ]
            }
          ),
          /* @__PURE__ */ jsx(DialogFooter, { className: "mt-6", children: /* @__PURE__ */ jsx(
            Button,
            {
              type: "submit",
              disabled: selectedRating == null || isSubmitting,
              className: submitToneClasses(selectedRating),
              children: isSubmitting ? /* @__PURE__ */ jsxs("span", { className: "inline-flex items-center gap-2", children: [
                /* @__PURE__ */ jsx(
                  "span",
                  {
                    className: "h-4 w-4 animate-spin rounded-full border-2 border-current border-b-transparent",
                    role: "status",
                    "aria-label": "Enviando"
                  }
                ),
                "Enviando..."
              ] }) : "Enviar"
            }
          ) })
        ] })
      ]
    }
  ) });
}
const NR_ORDEM_MAXLEN = 7;
function SaramDialog({
  open,
  nrOrdem,
  error,
  isSaving,
  onOpenChange,
  onChange,
  onSubmit
}) {
  const helpId = useId();
  const errorId = useId();
  const canSubmit = nrOrdem.trim().length > 0 && !isSaving;
  const normalizeDigits = useCallback((value) => {
    const digits = value.replace(/\D/g, "");
    return digits.slice(0, NR_ORDEM_MAXLEN);
  }, []);
  const handleChange = useCallback(
    (e) => {
      onChange(normalizeDigits(e.target.value));
    },
    [onChange, normalizeDigits]
  );
  const handlePaste = useCallback(
    (e) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData("text");
      onChange(normalizeDigits(pasted));
    },
    [onChange, normalizeDigits]
  );
  const handleSubmit = useCallback(
    (e) => {
      e.preventDefault();
      if (canSubmit) onSubmit();
    },
    [canSubmit, onSubmit]
  );
  return /* @__PURE__ */ jsx(Dialog, { open, onOpenChange, children: /* @__PURE__ */ jsxs(
    DialogContent,
    {
      className: "sm:max-w-md",
      showCloseButton: false,
      "aria-busy": isSaving,
      onInteractOutside: (event) => event.preventDefault(),
      onEscapeKeyDown: (event) => event.preventDefault(),
      children: [
        /* @__PURE__ */ jsxs(DialogHeader, { children: [
          /* @__PURE__ */ jsx(DialogTitle, { children: "Informe seu SARAM" }),
          /* @__PURE__ */ jsx(DialogDescription, { id: helpId, children: "Para continuar, precisamos do seu número de registro SARAM (nrOrdem)." })
        ] }),
        /* @__PURE__ */ jsxs("form", { onSubmit: handleSubmit, className: "space-y-3", children: [
          /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsx("label", { className: "text-sm font-medium", htmlFor: "nrOrdemInput", children: "nrOrdem" }),
            /* @__PURE__ */ jsx(
              Input,
              {
                id: "nrOrdemInput",
                name: "nrOrdem",
                value: nrOrdem,
                inputMode: "numeric",
                pattern: "\\d*",
                enterKeyHint: "done",
                autoComplete: "one-time-code",
                placeholder: "Ex.: 1234567",
                maxLength: NR_ORDEM_MAXLEN,
                onChange: handleChange,
                onPaste: handlePaste,
                autoFocus: true,
                required: true,
                "aria-invalid": Boolean(error),
                "aria-describedby": error ? `${helpId} ${errorId}` : helpId
              }
            ),
            error && /* @__PURE__ */ jsx(
              "p",
              {
                id: errorId,
                role: "alert",
                "aria-live": "polite",
                className: "text-sm text-destructive",
                children: error
              }
            ),
            /* @__PURE__ */ jsx("p", { className: "text-xs text-muted-foreground", children: "Usaremos esse dado apenas para identificar seu registro." })
          ] }),
          /* @__PURE__ */ jsx(DialogFooter, { children: /* @__PURE__ */ jsx(
            Button,
            {
              type: "submit",
              disabled: !canSubmit,
              className: "disabled:cursor-not-allowed disabled:opacity-50",
              children: isSaving ? /* @__PURE__ */ jsxs("span", { className: "inline-flex items-center gap-2", children: [
                /* @__PURE__ */ jsx(
                  "span",
                  {
                    className: "h-4 w-4 animate-spin rounded-full border-2 border-current border-b-transparent",
                    role: "status",
                    "aria-label": "Salvando"
                  }
                ),
                "Salvando..."
              ] }) : "Salvar e continuar"
            }
          ) })
        ] })
      ]
    }
  ) });
}
const QUERY_KEYS = {
  admin: {
    profile: (userId) => ["admin", "profile", userId ?? null]
  }
};
function sanitizeRole(input) {
  return input === "admin" || input === "superadmin" || input === "user" ? input : null;
}
async function fetchAdminProfile(userId) {
  const { data, error } = await supabase.from("profiles_admin").select("role, om").eq("id", userId).maybeSingle();
  if (error) {
    throw new Error(error.message || "Erro ao buscar perfil admin");
  }
  if (!data) return null;
  return {
    role: sanitizeRole(data.role),
    om: data.om ?? null
  };
}
function useAdminProfile(userId, options) {
  return useQuery({
    queryKey: QUERY_KEYS.admin.profile(userId),
    queryFn: () => userId ? fetchAdminProfile(userId) : Promise.resolve(null),
    enabled: !!userId,
    staleTime: 10 * 60 * 1e3,
    gcTime: 30 * 60 * 1e3,
    refetchOnWindowFocus: false,
    ...options
  });
}
function useUserLevel(userId, options) {
  return useAdminProfile(userId, {
    select: (data) => data?.role ?? null,
    ...options
  });
}
async function checkUserLevel(userId) {
  if (!userId) return null;
  try {
    const profile2 = await fetchAdminProfile(userId);
    return profile2?.role ?? null;
  } catch (e) {
    console.error("Erro ao verificar o nível de admin:", e);
    return null;
  }
}
function Topbar({ onOpenQr, userId }) {
  return /* @__PURE__ */ jsx("header", { className: "sticky top-0 z-40 flex h-14 items-center border-b bg-background/80 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:px-4 shrink-0 gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12", children: /* @__PURE__ */ jsxs("div", { className: "flex w-full items-center", children: [
    /* @__PURE__ */ jsx("div", { className: "flex items-center", children: /* @__PURE__ */ jsx(SidebarTrigger, {}) }),
    /* @__PURE__ */ jsxs(
      "div",
      {
        role: "toolbar",
        "aria-label": "Ações rápidas",
        className: "ml-auto flex items-center gap-2 sm:gap-3",
        children: [
          /* @__PURE__ */ jsxs(
            Button,
            {
              variant: "outline",
              size: "sm",
              onClick: onOpenQr,
              className: "flex items-center gap-2 transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary",
              "aria-label": "Abrir QR do usuário",
              disabled: !userId,
              title: userId ? "Mostrar QR" : "Usuário não identificado",
              children: [
                /* @__PURE__ */ jsx(QrCode, { className: "h-4 w-4" }),
                /* @__PURE__ */ jsx("span", { className: "hidden font-medium sm:inline", children: "QR" })
              ]
            }
          ),
          /* @__PURE__ */ jsx(ModeToggle, {})
        ]
      }
    )
  ] }) });
}
function MainSurface({
  showInitialError,
  showInitialLoading,
  onRetry,
  children
}) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      className: cn$2(
        " relative isolate flex flex-col bg-background text-foreground ",
        "min-h-[100svh] supports-[height:100dvh]:min-h-[100dvh]",
        "before:content-[''] before:absolute before:inset-0 before:-z-10 before:pointer-events-none",
        "before:bg-[radial-gradient(1200px_800px_at_10%_-10%,rgb(52_211_153/0.14),transparent_60%),radial-gradient(900px_600px_at_90%_0%,rgb(6_182_212/0.12),transparent_60%),radial-gradient(800px_800px_at_50%_100%,rgb(139_92_246/0.10),transparent_60%)]",
        "dark:before:bg-[radial-gradient(1200px_800px_at_10%_-10%,rgb(110_231_183/0.18),transparent_60%),radial-gradient(900px_600px_at_90%_0%,rgb(34_211_238/0.16),transparent_60%),radial-gradient(800px_800px_at_50%_100%,rgb(167_139_250/0.14),transparent_60%)]",
        "before:transform-gpu motion-safe:before:animate-[slow-pan_32s_ease-in-out_infinite]",
        "after:content-[''] after:pointer-events-none after:absolute after:inset-0 after:-z-10",
        "after:bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.8)_1px,transparent_1px)]",
        "after:bg-[length:12px_12px] after:opacity-[0.02]",
        "dark:after:opacity-[0.04]"
      ),
      children: showInitialError ? /* @__PURE__ */ jsxs("div", { className: "flex h-full flex-col items-center justify-center gap-3 p-6 text-center", children: [
        /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-destructive", children: "Não foi possível carregar suas permissões no momento." }),
        /* @__PURE__ */ jsx("p", { className: "text-xs text-muted-foreground", children: "Atualize a página ou entre em contato com um administrador." }),
        /* @__PURE__ */ jsx(Button, { size: "sm", variant: "outline", onClick: onRetry, children: "Tentar novamente" })
      ] }) : showInitialLoading ? /* @__PURE__ */ jsx("div", { className: "flex h-full items-center justify-center p-6 text-sm text-muted-foreground", children: "Carregando painel..." }) : children
    }
  );
}
function NavMain({
  items
}) {
  return /* @__PURE__ */ jsxs(SidebarGroup, { children: [
    /* @__PURE__ */ jsx(SidebarGroupLabel, { children: "Previsão" }),
    /* @__PURE__ */ jsx(SidebarMenu, { children: items.map((item) => /* @__PURE__ */ jsx(
      Collapsible,
      {
        asChild: true,
        defaultOpen: item.isActive,
        className: "group/collapsible",
        children: /* @__PURE__ */ jsxs(SidebarMenuItem, { children: [
          /* @__PURE__ */ jsx(CollapsibleTrigger, { asChild: true, children: /* @__PURE__ */ jsxs(SidebarMenuButton, { tooltip: item.title, children: [
            item.icon && /* @__PURE__ */ jsx(item.icon, {}),
            /* @__PURE__ */ jsx("span", { children: item.title }),
            /* @__PURE__ */ jsx(ChevronRight, { className: "ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" })
          ] }) }),
          /* @__PURE__ */ jsx(CollapsibleContent, { children: /* @__PURE__ */ jsx(SidebarMenuSub, { children: item.items?.map((subItem) => /* @__PURE__ */ jsx(SidebarMenuSubItem, { children: /* @__PURE__ */ jsx(SidebarMenuSubButton, { asChild: true, children: /* @__PURE__ */ jsx("a", { href: subItem.url, children: /* @__PURE__ */ jsx("span", { children: subItem.title }) }) }) }, subItem.title)) }) })
        ] })
      },
      item.title
    )) })
  ] });
}
function getInitials(nameOrEmail) {
  const name = nameOrEmail.split("@")[0];
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function NavUser() {
  const { isMobile } = useSidebar();
  const { user, isAuthenticated, isLoading, signOut } = useAuth();
  const meta2 = user?.user_metadata ?? {};
  const email = user?.email ?? "";
  const displayName = meta2.name || meta2.full_name || email || "Usuário";
  const avatarUrl = meta2.avatar_url || meta2.picture || "";
  return /* @__PURE__ */ jsx(SidebarMenu, { children: /* @__PURE__ */ jsx(SidebarMenuItem, { children: isLoading ? /* @__PURE__ */ jsx(
    "div",
    {
      className: "h-8 w-full rounded-lg bg-muted animate-pulse",
      "aria-hidden": "true"
    }
  ) : !isAuthenticated ? /* @__PURE__ */ jsx(
    Button,
    {
      variant: "outline",
      size: "sm",
      onClick: () => window.location.assign("/login"),
      children: "Entrar"
    }
  ) : /* @__PURE__ */ jsxs(DropdownMenu, { children: [
    /* @__PURE__ */ jsx(DropdownMenuTrigger, { asChild: true, children: /* @__PURE__ */ jsxs(
      SidebarMenuButton,
      {
        size: "lg",
        className: "data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground px-2",
        children: [
          /* @__PURE__ */ jsxs(Avatar, { className: "h-8 w-8 rounded-lg grayscale", children: [
            /* @__PURE__ */ jsx(AvatarImage, { src: avatarUrl, alt: displayName }),
            /* @__PURE__ */ jsx(AvatarFallback, { className: "rounded-lg", children: getInitials(displayName) })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "hidden sm:grid flex-1 text-left text-sm leading-tight ml-2", children: [
            /* @__PURE__ */ jsx("span", { className: "truncate font-medium", children: displayName }),
            /* @__PURE__ */ jsx("span", { className: "text-muted-foreground truncate text-xs", children: email })
          ] }),
          /* @__PURE__ */ jsx(EllipsisVertical, { className: "ml-2 h-4 w-4", "aria-hidden": "true" })
        ]
      }
    ) }),
    /* @__PURE__ */ jsxs(
      DropdownMenuContent,
      {
        className: "w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg",
        side: isMobile ? "bottom" : "right",
        align: "end",
        sideOffset: 6,
        children: [
          /* @__PURE__ */ jsx(DropdownMenuLabel, { className: "p-0 font-normal", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 px-2 py-2 text-left text-sm", children: [
            /* @__PURE__ */ jsxs(Avatar, { className: "h-8 w-8 rounded-lg", children: [
              /* @__PURE__ */ jsx(AvatarImage, { src: avatarUrl, alt: displayName }),
              /* @__PURE__ */ jsx(AvatarFallback, { className: "rounded-lg", children: getInitials(displayName) })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "grid flex-1 text-left text-sm leading-tight", children: [
              /* @__PURE__ */ jsx("span", { className: "truncate font-medium", children: displayName }),
              /* @__PURE__ */ jsx("span", { className: "text-muted-foreground truncate text-xs", children: email })
            ] })
          ] }) }),
          /* @__PURE__ */ jsx(DropdownMenuSeparator, {}),
          /* @__PURE__ */ jsxs(
            DropdownMenuItem,
            {
              onSelect: () => {
                window.location.assign("/profile");
              },
              className: "cursor-pointer",
              children: [
                /* @__PURE__ */ jsx(User, { className: "mr-2 h-4 w-4" }),
                "Perfil"
              ]
            }
          ),
          /* @__PURE__ */ jsxs(
            DropdownMenuItem,
            {
              onSelect: async () => {
                await signOut();
                window.location.assign("/login");
              },
              className: "text-red-600 focus:text-red-600 cursor-pointer",
              children: [
                /* @__PURE__ */ jsx(LogOut, { className: "mr-2 h-4 w-4" }),
                "Sair"
              ]
            }
          )
        ]
      }
    )
  ] }) }) });
}
function TeamSwitcher({
  teams
}) {
  const { isMobile } = useSidebar();
  const [activeTeam, setActiveTeam] = React.useState(teams[0]);
  if (!activeTeam) {
    return null;
  }
  return /* @__PURE__ */ jsx(SidebarMenu, { children: /* @__PURE__ */ jsx(SidebarMenuItem, { children: /* @__PURE__ */ jsxs(DropdownMenu, { children: [
    /* @__PURE__ */ jsx(DropdownMenuTrigger, { asChild: true, children: /* @__PURE__ */ jsxs(
      SidebarMenuButton,
      {
        size: "lg",
        className: "data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground",
        children: [
          /* @__PURE__ */ jsx("div", { className: "bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg", children: /* @__PURE__ */ jsx(
            "img",
            {
              src: "/favicon.svg",
              className: "shrink-0 rounded-full"
            }
          ) }),
          /* @__PURE__ */ jsxs("div", { className: "grid flex-1 text-left text-sm leading-tight", children: [
            /* @__PURE__ */ jsx("span", { className: "truncate font-medium", children: activeTeam.name }),
            /* @__PURE__ */ jsx("span", { className: "truncate text-xs", children: activeTeam.plan })
          ] }),
          /* @__PURE__ */ jsx(ChevronsUpDown, { className: "ml-auto" })
        ]
      }
    ) }),
    /* @__PURE__ */ jsxs(
      DropdownMenuContent,
      {
        className: "w-(--radix-dropdown-menu-trigger-width) min-w-56 ",
        align: "start",
        side: isMobile ? "bottom" : "right",
        sideOffset: 4,
        children: [
          /* @__PURE__ */ jsx(DropdownMenuLabel, { className: "text-muted-foreground text-xs", children: "Sistemas" }),
          teams.map((team, index) => /* @__PURE__ */ jsxs(
            DropdownMenuItem,
            {
              onClick: () => setActiveTeam(team),
              className: "gap-2 p-2",
              children: [
                /* @__PURE__ */ jsx("div", {
                  className: "flex size-6 items-center justify-center rounded-md border",
                  /* team.logo ? (
                    <team.logo className="size-3.5 shrink-0" />
                  ) : ( */
                  children: /* @__PURE__ */ jsx(
                    "img",
                    {
                      src: "/favicon.svg",
                      className: "shrink-0 rounded-full"
                    }
                  )
                }),
                team.name
              ]
            },
            team.name
          ))
        ]
      }
    )
  ] }) }) });
}
function AppSidebar({
  data,
  ...props
}) {
  return /* @__PURE__ */ jsxs(Sidebar, { collapsible: "icon", variant: "floating", ...props, children: [
    /* @__PURE__ */ jsx(SidebarHeader, { children: /* @__PURE__ */ jsx(TeamSwitcher, { teams: data.teams }) }),
    /* @__PURE__ */ jsx(SidebarContent, { children: /* @__PURE__ */ jsx(NavMain, { items: data.navMain }) }),
    /* @__PURE__ */ jsx(SidebarFooter, { children: /* @__PURE__ */ jsx(NavUser, {}) }),
    /* @__PURE__ */ jsx(SidebarRail, {})
  ] });
}
const NR_ORDEM_MIN_LEN = 7;
function AppShell() {
  const location = useLocation();
  const queryClient2 = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const {
    data: userLevel,
    isLoading: levelLoading,
    isError: levelError
  } = useUserLevel(user?.id);
  const userDisplay = useMemo(() => {
    if (!user) {
      return { name: "Usuário", email: "", avatar: "" };
    }
    const name = user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email ?? "Usuário";
    const avatar = user.user_metadata?.avatar_url ?? "";
    return { name, email: user.email ?? "", avatar };
  }, [user]);
  const sidebarData = useMemo(() => {
    if (!userLevel || !user) return null;
    return buildSidebarData({
      level: userLevel,
      activePath: location.pathname
    });
  }, [location.pathname, user, userLevel, userDisplay]);
  const navItems = useMemo(() => {
    if (!userLevel) return [];
    return getNavItemsForLevel(userLevel);
  }, [userLevel]);
  const showSidebar = !!sidebarData && !levelError;
  const [nrOrdemQuery, evaluationQuery] = useQueries({
    queries: [
      {
        queryKey: queryKeys.userNrOrdem(userId),
        queryFn: () => fetchUserNrOrdem(userId),
        enabled: !!userId,
        staleTime: QUERY_STALE_TIME,
        gcTime: QUERY_GC_TIME
      },
      {
        queryKey: queryKeys.evaluation(userId),
        queryFn: () => fetchEvaluationForUser(userId),
        enabled: !!userId,
        staleTime: QUERY_STALE_TIME,
        gcTime: QUERY_GC_TIME
      }
    ]
  });
  const syncEmailMutation = useMutation({
    mutationFn: syncIdEmail,
    onError: (error) => console.error("Erro ao sincronizar email:", error)
  });
  useEffect(() => {
    if (user) syncEmailMutation.mutate(user);
  }, [user?.id]);
  const [nrDialogOpenState, setNrDialogOpenState] = useState(false);
  const [nrOrdem, setNrOrdem] = useState("");
  const [nrError, setNrError] = useState(null);
  const shouldForceNrDialog = !!userId && nrOrdemQuery.isSuccess && !nrOrdemQuery.data;
  const nrDialogOpen = shouldForceNrDialog || nrDialogOpenState;
  useEffect(() => {
    if (!userId) {
      setNrDialogOpenState(false);
      setNrOrdem("");
      return;
    }
    const current = nrOrdemQuery.data;
    setNrOrdem(current ? String(current) : "");
  }, [userId, nrOrdemQuery.data]);
  const saveNrMutation = useMutation({
    mutationFn: (value) => syncIdNrOrdem(user, value),
    onMutate: async (value) => {
      if (!userId) return void 0;
      setNrError(null);
      const queryKey = queryKeys.userNrOrdem(userId);
      await queryClient2.cancelQueries({ queryKey });
      const previous = queryClient2.getQueryData(queryKey);
      queryClient2.setQueryData(queryKey, value);
      return { previous, queryKey };
    },
    onError: (error, _value, context) => {
      console.error("Erro ao salvar nrOrdem:", error);
      if (context?.previous) {
        queryClient2.setQueryData(context.queryKey, context.previous);
      }
      setNrError("Não foi possível salvar. Tente novamente.");
    },
    onSuccess: () => setNrDialogOpenState(false),
    onSettled: () => {
      if (userId) {
        queryClient2.invalidateQueries({
          queryKey: queryKeys.userNrOrdem(userId)
        });
      }
    }
  });
  const handleNrDialogOpenChange = useCallback(
    (open) => {
      if (!open && shouldForceNrDialog) return;
      setNrDialogOpenState(open);
    },
    [shouldForceNrDialog]
  );
  const handleNrOrdemChange = useCallback(
    (value) => {
      setNrOrdem(value);
      if (nrError) setNrError(null);
    },
    [nrError]
  );
  const handleSubmitNrOrdem = useCallback(() => {
    const digitsOnly = nrOrdem.replace(/\D/g, "").trim();
    if (!digitsOnly) {
      setNrError("Informe seu número da Ordem.");
      return;
    }
    if (digitsOnly.length < NR_ORDEM_MIN_LEN) {
      setNrError("Nr. da Ordem parece curto. Confira e tente novamente.");
      return;
    }
    if (!user) return;
    saveNrMutation.mutate(digitsOnly);
  }, [nrOrdem, saveNrMutation, user]);
  const [evaluationDismissed, setEvaluationDismissed] = useState(false);
  const [selectedRating, setSelectedRating] = useState(null);
  useEffect(() => {
    setEvaluationDismissed(false);
    setSelectedRating(null);
  }, [evaluationQuery.data?.question]);
  const evaluationQuestion = evaluationQuery.data?.question ?? null;
  const evaluationShouldAsk = Boolean(
    evaluationQuery.data?.shouldAsk && evaluationQuestion
  );
  const shouldShowEvaluationDialog = !!userId && evaluationQuery.isSuccess && evaluationShouldAsk && !nrDialogOpen && !evaluationDismissed;
  const handleEvaluationOpenChange = useCallback((open) => {
    if (!open) {
      setEvaluationDismissed(true);
      setSelectedRating(null);
    } else {
      setEvaluationDismissed(false);
    }
  }, []);
  const submitVoteMutation = useMutation({
    mutationFn: async (payload) => {
      const { error } = await supabase.from("opinions").insert([
        {
          value: payload.value,
          question: payload.question,
          userId: user.id
        }
      ]);
      if (error) throw error;
    },
    onError: (error) => console.error("Erro ao registrar voto:", error),
    onSuccess: () => handleEvaluationOpenChange(false),
    onSettled: () => {
      if (userId) {
        queryClient2.invalidateQueries({
          queryKey: queryKeys.evaluation(userId)
        });
      }
    }
  });
  const handleSubmitVote = useCallback(() => {
    const question = evaluationQuestion;
    if (!userId || !question || selectedRating == null) return;
    submitVoteMutation.mutate({ value: selectedRating, question });
  }, [evaluationQuestion, selectedRating, submitVoteMutation, userId]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [hasCopiedId, setHasCopiedId] = useState(false);
  const copyTimeoutRef = useRef(null);
  const handleCopyUserId = useCallback(async () => {
    if (!user?.id) return;
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(user.id);
      setHasCopiedId(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setHasCopiedId(false), 1600);
    } catch (error) {
      console.error("Erro ao copiar ID:", error);
    }
  }, [user]);
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);
  const globalFetching = useIsFetching();
  const globalMutating = useIsMutating();
  const showGlobalProgress = globalFetching + globalMutating > 0 || levelLoading || nrOrdemQuery.isFetching || evaluationQuery.isFetching;
  const isSavingNrReal = saveNrMutation.isPending;
  const isSubmittingVote = submitVoteMutation.isPending;
  const showInitialLoading = levelLoading && !userLevel;
  const showInitialError = !levelLoading && levelError;
  const handleRetry = useCallback(() => {
    if (typeof window !== "undefined") window.location.reload();
  }, []);
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(
      SaramDialog,
      {
        open: nrDialogOpen,
        nrOrdem,
        error: nrError,
        isSaving: isSavingNrReal,
        onOpenChange: handleNrDialogOpenChange,
        onChange: handleNrOrdemChange,
        onSubmit: handleSubmitNrOrdem
      }
    ),
    /* @__PURE__ */ jsx(
      EvaluationDialog,
      {
        open: shouldShowEvaluationDialog,
        question: evaluationQuestion,
        selectedRating,
        isSubmitting: isSubmittingVote,
        onOpenChange: handleEvaluationOpenChange,
        onSelectRating: setSelectedRating,
        onSubmit: handleSubmitVote
      }
    ),
    /* @__PURE__ */ jsx(
      UserQrDialog,
      {
        open: qrOpen,
        onOpenChange: setQrOpen,
        userId,
        onCopy: handleCopyUserId,
        hasCopied: hasCopiedId
      }
    ),
    showSidebar && sidebarData ? /* @__PURE__ */ jsx(AppSidebar, { data: sidebarData }) : null,
    /* @__PURE__ */ jsx(SidebarInset, { children: /* @__PURE__ */ jsxs("div", { className: "flex min-h-[100svh] w-full flex-col supports-[height:100dvh]:min-h-[100dvh]", children: [
      /* @__PURE__ */ jsx(
        Topbar,
        {
          showSidebar,
          navItems,
          sheetOpen,
          onSheetOpenChange: setSheetOpen,
          onSidebarNavigate: () => setSheetOpen(false),
          showGlobalProgress,
          onOpenQr: () => setQrOpen(true),
          userId
        }
      ),
      /* @__PURE__ */ jsx("main", { id: "conteudo", className: "flex-1", children: /* @__PURE__ */ jsx(
        MainSurface,
        {
          showInitialError,
          showInitialLoading,
          onRetry: handleRetry,
          children: /* @__PURE__ */ jsx(Outlet, {})
        }
      ) })
    ] }) }),
    /* @__PURE__ */ jsx(
      Toaster,
      {
        position: "bottom-center",
        richColors: true,
        expand: true,
        className: "z-[2147483647]"
      }
    )
  ] });
}
const QUERY_STALE_TIME = 5 * 6e4;
const QUERY_GC_TIME = 10 * 6e4;
const queryKeys = {
  userNrOrdem: (userId) => ["user", userId, "nrOrdem"],
  evaluation: (userId) => ["evaluation", userId]
};
function cn$1(...values) {
  return values.filter(Boolean).join(" ");
}
async function syncIdEmail(user) {
  const {
    error
  } = await supabase.from("user_data").upsert({
    id: user.id,
    email: user.email
  }, {
    onConflict: "id"
  });
  if (error) throw error;
}
async function syncIdNrOrdem(user, nrOrdem) {
  const {
    error
  } = await supabase.from("user_data").upsert({
    id: user.id,
    email: user.email,
    nrOrdem
  }, {
    onConflict: "id"
  });
  if (error) throw error;
}
async function fetchUserNrOrdem(userId) {
  const {
    data,
    error
  } = await supabase.from("user_data").select("nrOrdem").eq("id", userId).maybeSingle();
  if (error) throw error;
  const value = data?.nrOrdem;
  const asString = value != null ? String(value) : null;
  return asString && asString.trim().length > 0 ? asString : null;
}
async function fetchEvaluationForUser(userId) {
  const {
    data: config,
    error: configError
  } = await supabase.from("super_admin_controller").select("key, active, value").eq("key", "evaluation").maybeSingle();
  if (configError) throw configError;
  const isActive = !!config?.active;
  const question = config?.value ?? "";
  if (!isActive || !question) {
    return {
      shouldAsk: false,
      question: question || null
    };
  }
  const {
    data: opinion,
    error: opinionError
  } = await supabase.from("opinions").select("id").eq("question", question).eq("userId", userId).maybeSingle();
  if (opinionError) throw opinionError;
  const alreadyAnswered = !!opinion;
  return {
    shouldAsk: !alreadyAnswered,
    question
  };
}
const appLayout = UNSAFE_withComponentProps(function AppLayout() {
  return /* @__PURE__ */ jsx(ProtectedBoundary, {
    children: /* @__PURE__ */ jsx(SidebarProvider, {
      children: /* @__PURE__ */ jsx(AppShell, {})
    })
  });
});
const route10 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  QUERY_GC_TIME,
  QUERY_STALE_TIME,
  cn: cn$1,
  default: appLayout,
  fetchEvaluationForUser,
  fetchUserNrOrdem,
  queryKeys,
  syncIdEmail,
  syncIdNrOrdem
}, Symbol.toStringTag, { value: "Module" }));
async function fetchUserData(user) {
  const {
    data,
    error
  } = await supabase.from("user_data").select("id,email,nrOrdem").eq("id", user.id).maybeSingle();
  if (error) throw error;
  return data ? {
    id: data.id,
    email: data.email,
    nrOrdem: data.nrOrdem ?? null
  } : null;
}
async function upsertUserData(user, nrOrdem) {
  const payload = {
    id: user.id,
    email: user.email,
    nrOrdem: nrOrdem && nrOrdem.trim().length > 0 ? nrOrdem.trim() : null
  };
  const {
    error
  } = await supabase.from("user_data").upsert(payload, {
    onConflict: "id"
  });
  if (error) throw error;
}
async function fetchMilitaryDataByNrOrdem(nrOrdem) {
  const {
    data,
    error
  } = await supabase.from("user_military_data").select("nrOrdem, nrCpf, nmGuerra, nmPessoa, sgPosto, sgOrg, dataAtualizacao").eq("nrOrdem", nrOrdem).order("dataAtualizacao", {
    ascending: false,
    nullsFirst: false
  }).limit(1).maybeSingle();
  if (error) throw error;
  return data ?? null;
}
function FieldRow({
  label,
  value,
  mono = false
}) {
  return /* @__PURE__ */ jsxs("div", {
    className: "flex flex-col gap-1",
    children: [/* @__PURE__ */ jsx("span", {
      className: "text-xs text-muted-foreground",
      children: label
    }), /* @__PURE__ */ jsx("div", {
      className: ["rounded-md border bg-card px-3 py-2 text-sm", mono ? "font-mono" : ""].join(" "),
      children: value && String(value).trim().length > 0 ? value : "—"
    })]
  });
}
function Section({
  title,
  description,
  children
}) {
  return /* @__PURE__ */ jsxs("section", {
    className: "rounded-lg border bg-card text-card-foreground p-4 sm:p-6",
    children: [/* @__PURE__ */ jsxs("div", {
      className: "mb-4",
      children: [/* @__PURE__ */ jsx("h2", {
        className: "text-base sm:text-lg font-semibold",
        children: title
      }), description ? /* @__PURE__ */ jsx("p", {
        className: "text-xs sm:text-sm text-muted-foreground mt-1",
        children: description
      }) : null]
    }), children]
  });
}
function Spinner({
  label
}) {
  return /* @__PURE__ */ jsxs("div", {
    className: "flex items-center gap-2 text-sm text-muted-foreground",
    children: [/* @__PURE__ */ jsx("span", {
      className: "h-4 w-4 animate-spin rounded-full border-2 border-current border-b-transparent"
    }), label ? /* @__PURE__ */ jsx("span", {
      children: label
    }) : null]
  });
}
const profile = UNSAFE_withComponentProps(function ProfilePage() {
  const {
    user
  } = useAuth();
  const queryClient2 = useQueryClient();
  const [nrOrdemInput, setNrOrdemInput] = useState("");
  const [nrError, setNrError] = useState(null);
  const userDataQuery = useQuery({
    queryKey: ["user_data", user?.id],
    enabled: !!user?.id,
    queryFn: () => fetchUserData(user),
    staleTime: 5 * 6e4,
    gcTime: 10 * 6e4
  });
  useEffect(() => {
    if (userDataQuery.isSuccess) {
      const cur = userDataQuery.data?.nrOrdem ?? "";
      setNrOrdemInput(cur);
    }
  }, [userDataQuery.isSuccess]);
  const effectiveNrOrdem = useMemo(() => userDataQuery.data?.nrOrdem ?? "", [userDataQuery.data?.nrOrdem]);
  const militaryQuery = useQuery({
    queryKey: ["military", effectiveNrOrdem],
    enabled: !!effectiveNrOrdem && effectiveNrOrdem.trim().length > 0,
    queryFn: () => fetchMilitaryDataByNrOrdem(effectiveNrOrdem),
    staleTime: 2 * 6e4,
    gcTime: 10 * 6e4
  });
  const saveMutation = useMutation({
    mutationFn: async (newNr) => {
      if (!user) throw new Error("Usuário não autenticado");
      await upsertUserData(user, newNr);
    },
    onMutate: async (newNr) => {
      setNrError(null);
      await queryClient2.cancelQueries({
        queryKey: ["user_data", user?.id]
      });
      const prev = queryClient2.getQueryData(["user_data", user?.id]);
      const optimistic = {
        id: user.id,
        email: user.email ?? prev?.email ?? "",
        nrOrdem: newNr && newNr.trim().length > 0 ? newNr.trim() : null
      };
      queryClient2.setQueryData(["user_data", user?.id], optimistic);
      return {
        prev
      };
    },
    onError: (err, _newNr, ctx) => {
      console.error("Erro ao salvar nrOrdem:", err);
      if (ctx?.prev) {
        queryClient2.setQueryData(["user_data", user?.id], ctx.prev);
      }
      setNrError("Não foi possível salvar. Tente novamente.");
    },
    onSuccess: () => {
      queryClient2.invalidateQueries({
        queryKey: ["military"],
        exact: false
      });
    },
    onSettled: () => {
      queryClient2.invalidateQueries({
        queryKey: ["user_data", user?.id]
      });
    }
  });
  const handleSave = useCallback(() => {
    const digitsOnly = nrOrdemInput.replace(/\D/g, "");
    if (digitsOnly.length > 0 && digitsOnly.length < 7) {
      setNrError("Nr. da Ordem parece curto. Confira e tente novamente.");
      return;
    }
    if (!user) return;
    saveMutation.mutate(digitsOnly);
  }, [nrOrdemInput, saveMutation, user]);
  const isLoadingUserData = userDataQuery.isLoading;
  const isSaving = saveMutation.isPending;
  const isLoadingMilitary = militaryQuery.isLoading;
  const military = militaryQuery.data ?? null;
  return /* @__PURE__ */ jsxs("div", {
    className: "mx-auto w-full max-w-5xl p-3 sm:p-6",
    children: [/* @__PURE__ */ jsxs("div", {
      className: "mb-4 sm:mb-6",
      children: [/* @__PURE__ */ jsx("h1", {
        className: "text-xl sm:text-2xl font-bold tracking-tight",
        children: "Perfil"
      }), /* @__PURE__ */ jsx("p", {
        className: "text-sm text-muted-foreground mt-1",
        children: "Gerencie seu nrOrdem e visualize seus dados militares vinculados."
      })]
    }), /* @__PURE__ */ jsxs("div", {
      className: "grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2",
      children: [/* @__PURE__ */ jsx(Section, {
        title: "Seus dados",
        description: "O e-mail é gerenciado pela autenticação. Você pode informar/atualizar seu nrOrdem.",
        children: /* @__PURE__ */ jsxs("div", {
          className: "space-y-4",
          children: [/* @__PURE__ */ jsx(FieldRow, {
            label: "E-mail",
            value: user?.email ?? userDataQuery.data?.email ?? ""
          }), /* @__PURE__ */ jsxs("div", {
            className: "flex flex-col gap-2",
            children: [/* @__PURE__ */ jsx("label", {
              htmlFor: "nrOrdem",
              className: "text-xs text-muted-foreground",
              children: "Nr. da Ordem"
            }), /* @__PURE__ */ jsx(Input, {
              id: "nrOrdem",
              value: nrOrdemInput,
              inputMode: "numeric",
              pattern: "[0-9]*",
              placeholder: "Ex.: 1234567",
              onChange: (e) => {
                const onlyDigits = e.target.value.replace(/\D/g, "");
                setNrOrdemInput(onlyDigits);
                if (nrError) setNrError(null);
              },
              onKeyDown: (e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSave();
                }
              }
            }), nrError ? /* @__PURE__ */ jsx("p", {
              className: "text-xs text-destructive",
              children: nrError
            }) : /* @__PURE__ */ jsx("p", {
              className: "text-[11px] text-muted-foreground",
              children: "Usado para vincular seus dados militares automaticamente."
            })]
          }), /* @__PURE__ */ jsxs("div", {
            className: "flex items-center gap-2",
            children: [/* @__PURE__ */ jsx(Button, {
              onClick: handleSave,
              disabled: isSaving || !user,
              children: isSaving ? /* @__PURE__ */ jsxs("span", {
                className: "inline-flex items-center gap-2",
                children: [/* @__PURE__ */ jsx("span", {
                  className: "h-4 w-4 animate-spin rounded-full border-2 border-current border-b-transparent"
                }), "Salvando..."]
              }) : "Salvar"
            }), isLoadingUserData ? /* @__PURE__ */ jsx(Spinner, {
              label: "Carregando..."
            }) : null]
          })]
        })
      }), /* @__PURE__ */ jsx(Section, {
        title: "Dados militares",
        description: effectiveNrOrdem ? "Encontrados a partir do seu nrOrdem." : "Informe seu nrOrdem para localizar seus dados militares.",
        children: /* @__PURE__ */ jsx("div", {
          className: "space-y-4",
          children: !effectiveNrOrdem ? /* @__PURE__ */ jsx("div", {
            className: "text-sm text-muted-foreground",
            children: "Nenhum nrOrdem informado. Preencha seu nrOrdem e salve para tentar localizar seus dados militares."
          }) : isLoadingMilitary ? /* @__PURE__ */ jsx(Spinner, {
            label: "Buscando dados militares..."
          }) : military ? /* @__PURE__ */ jsxs("div", {
            className: "space-y-3",
            children: [/* @__PURE__ */ jsx(FieldRow, {
              label: "Nr. da Ordem",
              value: military.nrOrdem ?? effectiveNrOrdem,
              mono: true
            }), /* @__PURE__ */ jsx(FieldRow, {
              label: "CPF",
              value: military.nrCpf,
              mono: true
            }), /* @__PURE__ */ jsx(FieldRow, {
              label: "Nome de Guerra",
              value: military.nmGuerra
            }), /* @__PURE__ */ jsx(FieldRow, {
              label: "Nome",
              value: military.nmPessoa
            }), /* @__PURE__ */ jsxs("div", {
              className: "grid grid-cols-2 gap-3",
              children: [/* @__PURE__ */ jsx(FieldRow, {
                label: "Posto",
                value: military.sgPosto
              }), /* @__PURE__ */ jsx(FieldRow, {
                label: "OM",
                value: military.sgOrg
              })]
            }), /* @__PURE__ */ jsx(FieldRow, {
              label: "Atualizado em",
              value: military.dataAtualizacao ? new Date(military.dataAtualizacao).toLocaleString() : "—"
            }), /* @__PURE__ */ jsx("div", {
              className: "pt-1",
              children: /* @__PURE__ */ jsx(Button, {
                variant: "outline",
                size: "sm",
                onClick: () => queryClient2.invalidateQueries({
                  queryKey: ["military", effectiveNrOrdem]
                }),
                children: "Recarregar"
              })
            })]
          }) : /* @__PURE__ */ jsx("div", {
            className: "text-sm text-muted-foreground",
            children: "Nenhum registro militar encontrado para o nrOrdem informado."
          })
        })
      })]
    }), /* @__PURE__ */ jsx(Separator, {
      className: "my-6"
    }), /* @__PURE__ */ jsxs("div", {
      className: "rounded-lg border bg-card p-4 sm:p-6",
      children: [/* @__PURE__ */ jsx("h3", {
        className: "text-sm font-semibold mb-2",
        children: "Dicas"
      }), /* @__PURE__ */ jsxs("ul", {
        className: "text-sm text-muted-foreground list-disc pl-5 space-y-1",
        children: [/* @__PURE__ */ jsx("li", {
          children: "O número da Ordem deve conter apenas dígitos."
        }), /* @__PURE__ */ jsx("li", {
          children: "Após salvar o nrOrdem, use “Recarregar” para atualizar os dados militares."
        }), /* @__PURE__ */ jsx("li", {
          children: "Se seus dados militares não aparecerem, confirme se o nrOrdem está correto."
        })]
      })]
    })]
  });
});
const route11 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: profile
}, Symbol.toStringTag, { value: "Module" }));
const DAYS_TO_SHOW = 30;
const AUTO_SAVE_DELAY = 1500;
const SUCCESS_MESSAGE_DURATION = 3e3;
const createEmptyDayMeals$1 = () => ({
  cafe: false,
  almoco: false,
  janta: false,
  ceia: false
});
const toYYYYMMDD = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};
const generateDates = (days) => {
  const out = [];
  const today = /* @__PURE__ */ new Date();
  for (let i = 0; i < days; i++) {
    const dt = new Date(today);
    dt.setDate(today.getDate() + i);
    out.push(toYYYYMMDD(dt));
  }
  return out;
};
const pluralize$2 = (n, s, p) => n === 1 ? s : p;
const labelAlteracao$2 = (n) => pluralize$2(n, "alteração", "alterações");
const labelSalva = (n) => pluralize$2(n, "salva", "salvas");
const labelFalhou = (n) => pluralize$2(n, "falhou", "falharam");
const labelOperacao = (n) => pluralize$2(n, "operação", "operações");
const useMealForecast = () => {
  const { user } = useAuth();
  const queryClient2 = useQueryClient();
  const [isClient, setIsClient] = useState(false);
  const autoSaveTimerRef = useRef(null);
  const successTimerRef = useRef(null);
  const saveOperationRef = useRef(null);
  const hydratedOnceRef = useRef(false);
  const [success, setSuccessState] = useState("");
  const [error, setError] = useState("");
  const [pendingChanges, setPendingChanges] = useState([]);
  const [isSavingBatch, setIsSavingBatch] = useState(false);
  const [selections, setSelections] = useState({});
  const [dayMessHalls, setDayMessHalls] = useState({});
  const [defaultMessHallId, setDefaultMessHallIdState] = useState("");
  const dates = useMemo(() => generateDates(DAYS_TO_SHOW), []);
  const todayString = useMemo(() => toYYYYMMDD(/* @__PURE__ */ new Date()), []);
  const forecastsQueryKey = useMemo(
    () => ["mealForecasts", user?.id, dates[0], dates[dates.length - 1]],
    [user?.id, dates]
  );
  const userDataQueryKey = useMemo(() => ["userData", user?.id], [user?.id]);
  const clearMessages = useCallback(() => {
    setSuccessState("");
    setError("");
  }, []);
  const setSuccess = useCallback((msg) => {
    setSuccessState(msg);
    setError("");
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    if (msg) {
      successTimerRef.current = setTimeout(
        () => setSuccessState(""),
        SUCCESS_MESSAGE_DURATION
      );
    }
  }, []);
  const setErrorWithClear = useCallback((msg) => {
    setError(msg);
    setSuccessState("");
  }, []);
  const {
    data: forecasts,
    isPending,
    // initial load
    isFetching,
    // any refetch
    refetch: refetchForecasts
  } = useQuery({
    queryKey: forecastsQueryKey,
    enabled: isClient && !!user?.id,
    staleTime: 6e4,
    gcTime: 5 * 6e4,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    queryFn: async () => {
      const { data, error: supabaseError } = await supabase.schema("sisub").from("meal_forecasts").select("date, meal, will_eat, mess_halls(code)").eq("user_id", user.id).gte("date", dates[0]).lte("date", dates[dates.length - 1]).order("date", { ascending: true });
      if (supabaseError) throw supabaseError;
      return data ?? [];
    }
  });
  const {
    data: userData,
    isFetching: isFetchingUserData,
    refetch: refetchUserData
  } = useQuery({
    queryKey: userDataQueryKey,
    enabled: isClient && !!user?.id,
    staleTime: 5 * 6e4,
    gcTime: 10 * 6e4,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    queryFn: async () => {
      const { data, error: error2 } = await supabase.schema("sisub").from("user_data").select("default_mess_hall_id").eq("id", user.id).maybeSingle();
      if (error2) throw error2;
      return data ?? null;
    }
  });
  useEffect(() => {
    if (!user?.id) return;
    if (isFetchingUserData) return;
    const id = userData?.default_mess_hall_id ?? null;
    if (id && !defaultMessHallId) {
      setDefaultMessHallIdState(String(id));
    }
  }, [
    user?.id,
    userData?.default_mess_hall_id,
    isFetchingUserData,
    defaultMessHallId
  ]);
  useEffect(() => {
    if (!user?.id) return;
    if (!forecasts) return;
    const canOverwrite = pendingChanges.length === 0 && !isSavingBatch;
    if (!hydratedOnceRef.current || canOverwrite) {
      const initialSelections = {};
      const initialMessHalls = {};
      dates.forEach((date) => {
        initialSelections[date] = createEmptyDayMeals$1();
        initialMessHalls[date] = "";
      });
      forecasts.forEach((p) => {
        const { date, meal, will_eat, mess_halls } = p;
        if (initialSelections[date] && meal in initialSelections[date]) {
          initialSelections[date][meal] = !!will_eat;
          const code = mess_halls?.code || void 0;
          if (code) initialMessHalls[date] = code;
        }
      });
      setSelections(initialSelections);
      setDayMessHalls(initialMessHalls);
      hydratedOnceRef.current = true;
    }
  }, [user?.id, forecasts, dates, pendingChanges.length, isSavingBatch]);
  const setDefaultMessHallIdLocal = useCallback((id) => {
    setDefaultMessHallIdState(id);
  }, []);
  const persistDefaultMessHallId = useCallback(async () => {
    if (!user?.id) return;
    const idNum = Number(defaultMessHallId);
    if (!Number.isFinite(idNum) || idNum <= 0) {
      setErrorWithClear("Rancho padrão inválido. Selecione um rancho válido.");
      return;
    }
    const prev = userData?.default_mess_hall_id;
    const { error: error2 } = await supabase.schema("sisub").from("user_data").upsert(
      {
        id: user.id,
        default_mess_hall_id: idNum,
        email: user.email
      },
      { onConflict: "id", ignoreDuplicates: false }
    );
    if (error2) {
      if (prev != null) setDefaultMessHallIdState(String(prev));
      setErrorWithClear("Não foi possível salvar o rancho padrão.");
      return;
    }
    queryClient2.invalidateQueries({ queryKey: userDataQueryKey });
  }, [
    user?.id,
    user?.email,
    defaultMessHallId,
    userData?.default_mess_hall_id,
    queryClient2,
    userDataQueryKey,
    setErrorWithClear
  ]);
  const savePendingChanges = useCallback(async () => {
    if (!user?.id || pendingChanges.length === 0) return;
    if (saveOperationRef.current) {
      await saveOperationRef.current;
      return;
    }
    const saveOperation = async () => {
      setIsSavingBatch(true);
      setErrorWithClear("");
      try {
        const changesToSave = [...pendingChanges];
        const byKey = changesToSave.reduce(
          (acc, ch) => {
            acc[`${ch.date}-${ch.meal}`] = ch;
            return acc;
          },
          {}
        );
        const results = await Promise.allSettled(
          Object.values(byKey).map(async (change) => {
            try {
              if (change.value) {
                const messHallIdNum = Number(change.messHallId);
                if (!Number.isFinite(messHallIdNum) || messHallIdNum <= 0) {
                  throw new Error(
                    `messHallId inválido: "${change.messHallId}" para ${change.date}-${change.meal}`
                  );
                }
                const { error: upsertError } = await supabase.schema("sisub").from("meal_forecasts").upsert(
                  {
                    date: change.date,
                    user_id: user.id,
                    meal: change.meal,
                    will_eat: true,
                    mess_hall_id: messHallIdNum
                  },
                  { onConflict: "user_id,date,meal", ignoreDuplicates: false }
                );
                if (upsertError) {
                  await supabase.schema("sisub").from("meal_forecasts").delete().eq("user_id", user.id).eq("date", change.date).eq("meal", change.meal);
                  const { error: insertError } = await supabase.schema("sisub").from("meal_forecasts").insert({
                    date: change.date,
                    user_id: user.id,
                    meal: change.meal,
                    will_eat: true,
                    mess_hall_id: messHallIdNum
                  });
                  if (insertError) throw insertError;
                }
              } else {
                const { error: deleteError } = await supabase.schema("sisub").from("meal_forecasts").delete().eq("user_id", user.id).eq("date", change.date).eq("meal", change.meal);
                if (deleteError && !deleteError.message?.includes("No rows deleted")) {
                  throw deleteError;
                }
              }
              return { success: true, change };
            } catch (err) {
              console.error(
                `Erro ao processar ${change.date}-${change.meal}:`,
                err
              );
              return {
                success: false,
                change,
                error: err instanceof Error ? err.message : "Erro desconhecido"
              };
            }
          })
        );
        const ok = results.filter(
          (r) => r.status === "fulfilled" && r.value.success
        );
        const fail = results.filter(
          (r) => r.status === "rejected" || r.status === "fulfilled" && !r.value.success
        );
        if (fail.length === 0) {
          const n = changesToSave.length;
          setSuccess(`${n} ${labelAlteracao$2(n)} ${labelSalva(n)} com sucesso!`);
          setPendingChanges(
            (prev) => prev.filter(
              (c) => !changesToSave.some(
                (s) => s.date === c.date && s.meal === c.meal && s.value === c.value && s.messHallId === c.messHallId
              )
            )
          );
        } else if (ok.length > 0) {
          const nOk = ok.length;
          const nFail = fail.length;
          setSuccess(
            `${nOk} ${labelAlteracao$2(nOk)} ${labelSalva(nOk)}. ${nFail} ${labelAlteracao$2(
              nFail
            )} ${labelFalhou(nFail)}.`
          );
          const okChanges = ok.map((r) => r.value.change);
          setPendingChanges(
            (prev) => prev.filter(
              (c) => !okChanges.some(
                (s) => s.date === c.date && s.meal === c.meal && s.value === c.value && s.messHallId === c.messHallId
              )
            )
          );
          fail.forEach((r) => {
            if (r.status === "fulfilled") {
              console.error("Erro na operação:", r.value.error);
            } else {
              console.error("Promise rejeitada:", r.reason);
            }
          });
        } else {
          const msg = fail.map(
            (r) => r.status === "fulfilled" ? r.value.error : r.reason?.message || "Erro desconhecido"
          ).join(", ");
          const count = changesToSave.length;
          throw new Error(
            count === 1 ? `A ${labelOperacao(count)} ${labelFalhou(count)}: ${msg}` : `Todas as ${count} ${labelOperacao(count)} ${labelFalhou(count)}: ${msg}`
          );
        }
        queryClient2.invalidateQueries({ queryKey: forecastsQueryKey });
      } catch (err) {
        console.error("Erro crítico ao salvar mudanças:", err);
        setErrorWithClear(
          err instanceof Error ? `Erro ao salvar ${labelAlteracao$2(1)}: ${err.message}` : "Erro ao salvar alterações. Tente novamente."
        );
      } finally {
        setIsSavingBatch(false);
        saveOperationRef.current = null;
      }
    };
    saveOperationRef.current = saveOperation();
    return saveOperationRef.current;
  }, [
    user?.id,
    pendingChanges,
    queryClient2,
    forecastsQueryKey,
    setErrorWithClear,
    setSuccess
  ]);
  useEffect(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    if (pendingChanges.length === 0) return;
    autoSaveTimerRef.current = setTimeout(() => {
      savePendingChanges();
    }, AUTO_SAVE_DELAY);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [pendingChanges, savePendingChanges]);
  useEffect(() => setIsClient(true), []);
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);
  const loadExistingForecasts = useCallback(async () => {
    await Promise.all([refetchForecasts(), refetchUserData()]);
  }, [refetchForecasts, refetchUserData]);
  return {
    success,
    error,
    isLoading: isPending,
    isRefetching: isFetching || isFetchingUserData,
    pendingChanges,
    isSavingBatch,
    selections,
    dayMessHalls,
    defaultMessHallId,
    dates,
    todayString,
    setSuccess,
    setError: setErrorWithClear,
    setPendingChanges,
    setSelections,
    setDayMessHalls,
    // default mess hall controls
    setDefaultMessHallId: setDefaultMessHallIdLocal,
    persistDefaultMessHallId,
    loadExistingForecasts,
    savePendingChanges,
    clearMessages
  };
};
const useMessHalls = () => {
  const sisub = supabase.schema("sisub");
  const unitsQuery = useQuery({
    queryKey: ["sisub", "units"],
    refetchOnWindowFocus: false,
    staleTime: 12e4,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await sisub.from("units").select("id, code, display_name").order("display_name", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        code: row.code,
        name: row.display_name
      }));
    }
  });
  const messHallsQuery = useQuery({
    queryKey: ["sisub", "mess_halls"],
    refetchOnWindowFocus: false,
    staleTime: 12e4,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await sisub.from("mess_halls").select("id, unit_id, code, display_name").order("display_name", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        unitId: row.unit_id,
        code: row.code,
        name: row.display_name
      }));
    }
  });
  return {
    units: unitsQuery.data ?? [],
    messHalls: messHallsQuery.data ?? [],
    // Quick derived structures
    messHallsByUnitId: (messHallsQuery.data ?? []).reduce(
      (acc, mh) => {
        (acc[mh.unitId] ??= []).push(mh);
        return acc;
      },
      {}
    ) ?? {},
    isLoading: unitsQuery.isPending || messHallsQuery.isPending,
    isRefetching: unitsQuery.isFetching || messHallsQuery.isFetching,
    error: unitsQuery.error?.message || messHallsQuery.error?.message || null
  };
};
const DefaultMessHallSelector = memo(
  ({
    defaultMessHallCode,
    setDefaultMessHallCode,
    onApply,
    onCancel,
    isApplying
  }) => {
    const { messHalls } = useMessHalls();
    const [saving, setSaving] = useState(false);
    const { selectedMessHallLabel, hasMessHalls } = useMemo(() => {
      const selected = messHalls.find((mh) => mh.code === defaultMessHallCode);
      return {
        selectedMessHallLabel: selected?.name || defaultMessHallCode,
        hasMessHalls: (messHalls?.length ?? 0) > 0
      };
    }, [defaultMessHallCode, messHalls]);
    const handleMessHallChange = useCallback(
      (value) => {
        setDefaultMessHallCode(value);
      },
      [setDefaultMessHallCode]
    );
    const handleApply = useCallback(async () => {
      if (isApplying || saving) return;
      if (!defaultMessHallCode) {
        toast.error("Seleção inválida", {
          description: "Escolha um rancho para continuar."
        });
        return;
      }
      setSaving(true);
      try {
        await onApply();
        toast.success("Preferência salva", {
          description: "Rancho padrão atualizado com sucesso."
        });
      } catch (err) {
        console.error("Erro ao aplicar rancho padrão:", err);
        toast.error("Erro", {
          description: "Falha ao salvar sua preferência."
        });
      } finally {
        setSaving(false);
      }
    }, [isApplying, saving, defaultMessHallCode, onApply]);
    const handleCancel = useCallback(() => {
      if (isApplying || saving) return;
      onCancel();
    }, [isApplying, saving, onCancel]);
    const selectItems = useMemo(() => {
      if (!messHalls || messHalls.length === 0) {
        return /* @__PURE__ */ jsx("div", { className: "px-2 py-4 text-sm text-muted-foreground", children: "Nenhum rancho encontrado." });
      }
      return messHalls.map((mh) => /* @__PURE__ */ jsx(
        SelectItem,
        {
          value: mh.code,
          className: "\n            cursor-pointer\n            data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground\n            focus:bg-accent/20\n          ",
          children: mh.name ?? mh.code
        },
        mh.code
      ));
    }, [messHalls]);
    return /* @__PURE__ */ jsxs(Card, { className: "group relative w-full h-fit bg-card text-card-foreground border border-border shadow-sm transition-all duration-300 hover:shadow-md hover:border-accent max-w-xl", children: [
      /* @__PURE__ */ jsxs(CardHeader, { className: "pb-4", children: [
        /* @__PURE__ */ jsx("div", { className: "flex items-start justify-between gap-3", children: /* @__PURE__ */ jsx(CardTitle, { className: "text-foreground", children: /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsx("span", { className: "inline-flex items-center justify-center h-8 w-8 rounded-lg bg-background text-foreground ring-1 ring-border", children: /* @__PURE__ */ jsx(Settings, { className: "h-4.5 w-4.5" }) }),
          /* @__PURE__ */ jsx("span", { className: "font-semibold", children: "Configurar Rancho Padrão" })
        ] }) }) }),
        /* @__PURE__ */ jsx(CardDescription, { className: "mt-3", children: /* @__PURE__ */ jsxs("div", { className: "flex gap-2 rounded-md border p-2.5 bg-accent/10 text-accent-foreground border-accent/30", children: [
          /* @__PURE__ */ jsx(AlertTriangle, { className: "h-4 w-4 mt-0.5 shrink-0" }),
          /* @__PURE__ */ jsx("span", { className: "text-sm", children: "Defina um rancho padrão para os cards que ainda não possuem rancho definido no banco de dados. Esta ação afetará apenas os cards sem rancho configurado." })
        ] }) })
      ] }),
      /* @__PURE__ */ jsxs(CardContent, { className: "space-y-6", children: [
        /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
          /* @__PURE__ */ jsx(Label, { className: "text-sm font-medium text-foreground", children: "Selecione o rancho padrão:" }),
          /* @__PURE__ */ jsxs(
            Select,
            {
              value: defaultMessHallCode,
              onValueChange: handleMessHallChange,
              disabled: isApplying || saving || !hasMessHalls,
              children: [
                /* @__PURE__ */ jsx(SelectTrigger, { className: "w-full cursor-pointer bg-background border border-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background hover:border-accent", children: /* @__PURE__ */ jsx(
                  SelectValue,
                  {
                    placeholder: hasMessHalls ? "Selecione um rancho..." : "Sem ranchos disponíveis"
                  }
                ) }),
                /* @__PURE__ */ jsx(SelectContent, { className: "max-h-60", children: selectItems })
              ]
            }
          ),
          defaultMessHallCode && /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-xs rounded-md border p-2 bg-muted text-muted-foreground border-border", children: [
            /* @__PURE__ */ jsx(CheckCircle, { className: "h-3.5 w-3.5" }),
            /* @__PURE__ */ jsxs("span", { children: [
              "Rancho selecionado:",
              " ",
              /* @__PURE__ */ jsx("strong", { className: "text-foreground", children: selectedMessHallLabel })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "border-t border-border pt-4 flex flex-row-reverse gap-4", children: [
          /* @__PURE__ */ jsx(
            Button,
            {
              size: "sm",
              onClick: handleApply,
              disabled: isApplying || saving || !defaultMessHallCode,
              className: "bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed",
              children: isApplying || saving ? /* @__PURE__ */ jsxs(Fragment, { children: [
                /* @__PURE__ */ jsx(Loader2, { className: "h-4 w-4 animate-spin mr-2" }),
                "Aplicando..."
              ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
                /* @__PURE__ */ jsx(CheckCircle, { className: "h-4 w-4 mr-2" }),
                "Aplicar"
              ] })
            }
          ),
          /* @__PURE__ */ jsx(
            Button,
            {
              variant: "outline",
              size: "sm",
              onClick: handleCancel,
              disabled: isApplying || saving,
              className: "hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              children: "Cancelar"
            }
          )
        ] })
      ] })
    ] });
  }
);
DefaultMessHallSelector.displayName = "DefaultMessHallSelector";
const createEmptyDayMeals = () => ({
  cafe: false,
  almoco: false,
  janta: false,
  ceia: false
});
const formatDate = (dateString) => {
  const date = /* @__PURE__ */ new Date(dateString + "T00:00:00");
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
};
const getDayOfWeek = (dateString) => {
  const date = /* @__PURE__ */ new Date(dateString + "T00:00:00");
  return date.toLocaleDateString("pt-BR", { weekday: "long" });
};
const isDateNear = (dateString, threshold = 2) => {
  const targetDate = /* @__PURE__ */ new Date();
  targetDate.setDate(targetDate.getDate() + threshold);
  return /* @__PURE__ */ new Date(dateString + "T00:00:00") <= targetDate;
};
const FALLBACK_RANCHOS = [
  {
    value: "GAP-RJ - HCA",
    label: "GAP-RJ - HCA"
  },
  {
    value: "GAP-RJ - GAP SEDE",
    label: "GAP-RJ - GAP SEDE"
  },
  {
    value: "GAP-RJ - GARAGEM",
    label: "GAP-RJ - GARAGEM"
  },
  {
    value: "GAP-RJ - PAME",
    label: "GAP-RJ - PAME"
  },
  {
    value: "GAP-GL - GAP (BAGL)",
    label: "GAP-GL - GAP (BAGL)"
  },
  {
    value: "GAP-GL - CGABEG",
    label: "GAP-GL - CGABEG"
  },
  {
    value: "GAP-GL - HFAG",
    label: "GAP-GL - HFAG"
  },
  {
    value: "GAP-GL - CEMAL",
    label: "GAP-GL - CEMAL"
  },
  {
    value: "GAP-GL - PAMB",
    label: "GAP-GL - PAMB"
  },
  {
    value: "DIRAD - DIRAD",
    label: "DIRAD - DIRAD"
  },
  {
    value: "GAP-AF - BAAF (GAP-AF)",
    label: "GAP-AF - BAAF (GAP-AF)"
  },
  {
    value: "GAP-AF - CPA-AF",
    label: "GAP-AF - CPA-AF"
  },
  {
    value: "GAP-AF - HAAF",
    label: "GAP-AF - HAAF"
  },
  {
    value: "GAP-AF - UNIFA",
    label: "GAP-AF - UNIFA"
  },
  {
    value: "BASC - BASC",
    label: "BASC - BASC"
  },
  {
    value: "GAP-SP - BASP",
    label: "GAP-SP - BASP"
  },
  {
    value: "GAP-SP - PAMA-SP",
    label: "GAP-SP - PAMA-SP"
  },
  {
    value: "GAP-SP - GAP-SP",
    label: "GAP-SP - GAP-SP"
  },
  {
    value: "GAP-SP - HFASP",
    label: "GAP-SP - HFASP"
  },
  {
    value: "GAP-SP - BAST",
    label: "GAP-SP - BAST"
  },
  {
    value: "GAP-SP - COMGAP",
    label: "GAP-SP - COMGAP"
  },
  {
    value: "AFA - FAYS",
    label: "AFA - FAYS"
  },
  {
    value: "AFA - AFA",
    label: "AFA - AFA"
  },
  {
    value: "GAP-SJ - IEAV",
    label: "GAP-SJ - IEAV"
  },
  {
    value: "GAP-SJ - GAP-SJ",
    label: "GAP-SJ - GAP-SJ"
  },
  {
    value: "EPCAR - EPCAR",
    label: "EPCAR - EPCAR"
  },
  {
    value: "GAP-LS - CIAAR",
    label: "GAP-LS - CIAAR"
  },
  {
    value: "GAP-LS - PAMA-LS",
    label: "GAP-LS - PAMA-LS"
  },
  {
    value: "GAP-LS - ESQUADRAO DE SAUDE DE LS",
    label: "GAP-LS - ESQUADRAO DE SAUDE DE LS"
  },
  {
    value: "BASM - BASM",
    label: "BASM - BASM"
  },
  {
    value: "GAP-CO - BACO",
    label: "GAP-CO - BACO"
  },
  {
    value: "GAP-CO - GAP-CO",
    label: "GAP-CO - GAP-CO"
  },
  {
    value: "GAP-CO - HACO",
    label: "GAP-CO - HACO"
  },
  {
    value: "BAFL - BAFL",
    label: "BAFL - BAFL"
  },
  {
    value: "CINDACTA 2 - CINDACTA II",
    label: "CINDACTA 2 - CINDACTA II"
  },
  {
    value: "GAP-BE - BABE",
    label: "GAP-BE - BABE"
  },
  {
    value: "GAP-BE - COMARA",
    label: "GAP-BE - COMARA"
  },
  {
    value: "GAP-BE - HABE",
    label: "GAP-BE - HABE"
  },
  {
    value: "GAP-MN - DACO-MN",
    label: "GAP-MN - DACO-MN"
  },
  {
    value: "GAP-MN - GAP-MN",
    label: "GAP-MN - GAP-MN"
  },
  {
    value: "GAP-MN - CINDACTA IV",
    label: "GAP-MN - CINDACTA IV (em fase de ativação)"
  },
  {
    value: "GAP-MN - HAMN",
    label: "GAP-MN - HAMN"
  },
  {
    value: "BABV - BABV",
    label: "BABV - BABV"
  },
  {
    value: "BAPV - BAPV",
    label: "BAPV - BAPV"
  },
  {
    value: "CLA - CLA-AK",
    label: "CLA - CLA-AK"
  },
  {
    value: "BAFZ - BAFZ",
    label: "BAFZ - BAFZ"
  },
  {
    value: "BANT - BANT",
    label: "BANT - BANT"
  },
  {
    value: "BANT - CLBI",
    label: "BANT - CLBI"
  },
  {
    value: "GAP-RF - BARF",
    label: "GAP-RF - BARF"
  },
  {
    value: "GAP-RF - HARF",
    label: "GAP-RF - HARF"
  },
  {
    value: "GAP-RF - GAP-RF",
    label: "GAP-RF - GAP-RF"
  },
  {
    value: "BASV - BASV",
    label: "BASV - BASV"
  },
  {
    value: "BASV - CEMCOHA",
    label: "BASV - CEMCOHA"
  },
  {
    value: "GAP-DF - BABR-SUL",
    label: "GAP-DF - BABR-SUL"
  },
  {
    value: "GAP-DF - CACHIMBO-CPBV",
    label: "GAP-DF - CACHIMBO-CPBV"
  },
  {
    value: "GAP-DF - HFAB",
    label: "GAP-DF - HFAB"
  },
  {
    value: "GAP-DF - GAP DF – NORTE",
    label: "GAP-DF - GAP DF – NORTE"
  },
  {
    value: "GAP-BR - GAP BR",
    label: "GAP-BR - GAP BR"
  },
  {
    value: "GABAER - GABAER",
    label: "GABAER - GABAER"
  },
  {
    value: "BAAN - BAAN",
    label: "BAAN - BAAN"
  },
  {
    value: "BACG - BACG",
    label: "BACG - BACG"
  },
  {
    value: "EEAR - GSAU-GW",
    label: "EEAR - GSAU-GW"
  },
  {
    value: "EEAR - Rancho",
    label: "EEAR - Rancho"
  },
  {
    value: "EEAR - PAGW",
    label: "EEAR - PAGW"
  },
  {
    value: "EEAR - SCI",
    label: "EEAR - SCI"
  },
  {
    value: "EEAR - STRS",
    label: "EEAR - STRS"
  },
  {
    value: "GAP-BE - I COMAR",
    label: "GAP-BE - I COMAR"
  },
  {
    value: "EEAR - SGER",
    label: "EEAR - SGER"
  }
];
Array.from(
  new Set(
    FALLBACK_RANCHOS.map((r) => r.value.split(" - ")[0].trim())
  )
).map((u) => ({ value: u, label: u }));
const MEAL_TYPES = [
  {
    value: "cafe",
    label: "Café",
    icon: Coffee,
    color: "bg-orange-100 text-orange-800",
    time: "06:30"
  },
  {
    value: "almoco",
    label: "Almoço",
    icon: Utensils,
    color: "bg-green-100 text-green-800",
    time: "11:30"
  },
  {
    value: "janta",
    label: "Jantar",
    icon: Moon,
    color: "bg-blue-100 text-blue-800",
    time: "17:30"
  },
  {
    value: "ceia",
    label: "Ceia",
    icon: Sun,
    color: "bg-purple-100 text-purple-800",
    time: "21:00"
  }
];
const NEAR_DATE_THRESHOLD = 2;
function cn(...inputs) {
  return twMerge(clsx(inputs));
}
const MealButton = memo(
  ({ meal, isSelected, onToggle, disabled, compact = false }) => {
    const Icon = meal.icon;
    const buttonClasses = cn(
      "w-full rounded-lg border-2 transition-all duration-200 group",
      "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1",
      {
        // Estados selecionado/não selecionado
        "border-green-500 bg-green-50 text-green-900": isSelected,
        "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50": !isSelected,
        // Estados de interação
        "cursor-pointer active:scale-95 hover:shadow-sm": !disabled,
        "opacity-50 cursor-not-allowed": disabled,
        // Tamanhos
        "p-2": compact,
        "p-3": !compact
      }
    );
    const iconClasses = cn("transition-colors duration-200", {
      "h-4 w-4": compact,
      "h-5 w-5": !compact,
      "text-green-600": isSelected,
      "text-gray-500 group-hover:text-gray-600": !isSelected && !disabled
    });
    if (compact) {
      return /* @__PURE__ */ jsx(
        "button",
        {
          onClick: onToggle,
          disabled,
          className: buttonClasses,
          title: `${meal.label} - ${isSelected ? "Confirmado" : "Não vai"}`,
          children: /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center space-y-1", children: [
            /* @__PURE__ */ jsx(Icon, { className: iconClasses }),
            /* @__PURE__ */ jsx("span", { className: "text-xs font-medium truncate w-full text-center", children: meal.label }),
            /* @__PURE__ */ jsx(
              "div",
              {
                className: cn(
                  "w-2 h-2 rounded-full transition-colors duration-200",
                  isSelected ? "bg-green-500" : "bg-gray-300"
                )
              }
            )
          ] })
        }
      );
    }
    return /* @__PURE__ */ jsx("button", { onClick: onToggle, disabled, className: buttonClasses, children: /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center space-x-3", children: [
        /* @__PURE__ */ jsx(Icon, { className: iconClasses }),
        /* @__PURE__ */ jsx("span", { className: "font-medium", children: meal.label })
      ] }),
      /* @__PURE__ */ jsx(
        "div",
        {
          className: cn(
            "flex items-center justify-center w-6 h-6 rounded-full transition-all duration-200",
            {
              "bg-green-500 text-white": isSelected,
              "bg-gray-200 text-gray-500": !isSelected
            }
          ),
          children: isSelected ? /* @__PURE__ */ jsx(Check, { className: "h-3 w-3" }) : /* @__PURE__ */ jsx(X, { className: "h-3 w-3" })
        }
      )
    ] }) });
  }
);
MealButton.displayName = "MealButton";
const MessHallSelector = memo(
  ({
    value,
    onChange,
    disabled = false,
    hasDefaultMessHall,
    hasDefaultUnit,
    // deprecated
    showValidation = false,
    size = "md",
    placeholder = "Selecione um rancho..."
  }) => {
    const { messHalls } = useMessHalls();
    const hasDefault = hasDefaultMessHall ?? hasDefaultUnit ?? false;
    const selectorData = useMemo(() => {
      const selectedMessHall = (messHalls ?? []).find(
        (mh) => mh.code === value
      );
      const isValidSelection2 = Boolean(selectedMessHall);
      const displayLabel2 = selectedMessHall?.name || value;
      return {
        selectedMessHall,
        isValidSelection: isValidSelection2,
        displayLabel: displayLabel2
      };
    }, [JSON.stringify(messHalls), value]);
    const baseTrigger = "w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
    const classes = useMemo(() => {
      const sizeMap = { sm: "text-sm", md: "", lg: "text-lg" };
      const sizeCls = sizeMap[size];
      const isInvalid2 = showValidation && !selectorData.isValidSelection && Boolean(value);
      const defaultTint = hasDefault ? " bg-accent/10" : "";
      const invalidTint = isInvalid2 ? " border-destructive/50 bg-destructive/10" : "";
      const triggerClasses = `${baseTrigger} ${sizeCls}${defaultTint}${invalidTint}`;
      return {
        trigger: triggerClasses,
        label: `text-sm font-medium flex items-center justify-between ${disabled ? "text-muted-foreground" : "text-foreground"}`,
        container: "space-y-2",
        isInvalid: isInvalid2
      };
    }, [
      baseTrigger,
      disabled,
      hasDefault,
      showValidation,
      selectorData.isValidSelection,
      value,
      size
    ]);
    const handleChange = useCallback(
      (newValue) => {
        if (disabled || newValue === value) return;
        onChange(newValue);
      },
      [disabled, value, onChange]
    );
    const selectItems = useMemo(
      () => (messHalls ?? []).map((mh) => /* @__PURE__ */ jsx(
        SelectItem,
        {
          className: "cursor-pointer hover:bg-accent/50 focus:bg-accent/50 data-[state=checked]:bg-accent/60 data-[state=checked]:text-accent-foreground transition-colors",
          value: mh.code,
          children: /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between w-full", children: [
            /* @__PURE__ */ jsx("span", { children: mh.name ?? mh.code }),
            value === mh.code && /* @__PURE__ */ jsx(Check, { className: "h-4 w-4 text-primary ml-2" })
          ] })
        },
        mh.code
      )),
      [JSON.stringify(messHalls), value]
    );
    const indicators = useMemo(() => {
      const badges = [];
      if (hasDefault) {
        badges.push(
          /* @__PURE__ */ jsx(Badge, { variant: "secondary", className: "text-xs", children: "Padrão" }, "default")
        );
      }
      if (classes.isInvalid) {
        badges.push(
          /* @__PURE__ */ jsx(Badge, { variant: "destructive", className: "text-xs", children: "Inválido" }, "invalid")
        );
      }
      return badges;
    }, [hasDefault, classes.isInvalid]);
    const { isInvalid } = classes;
    const { isValidSelection, displayLabel } = selectorData;
    return /* @__PURE__ */ jsxs("div", { className: classes.container, children: [
      /* @__PURE__ */ jsxs(Label, { className: classes.label, children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center space-x-1", children: [
          /* @__PURE__ */ jsx(MapPin, { className: "h-4 w-4" }),
          /* @__PURE__ */ jsx("span", { children: "Rancho:" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center space-x-2", children: [
          indicators,
          isInvalid && /* @__PURE__ */ jsx(AlertCircle, { className: "h-4 w-4 text-destructive" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs(Select, { value, onValueChange: handleChange, disabled, children: [
        /* @__PURE__ */ jsx(SelectTrigger, { className: classes.trigger, "aria-invalid": isInvalid, children: /* @__PURE__ */ jsx(SelectValue, { placeholder, children: value && /* @__PURE__ */ jsxs("div", { className: "flex items-center space-x-2", children: [
          /* @__PURE__ */ jsx("span", { children: displayLabel }),
          hasDefault && /* @__PURE__ */ jsx(Badge, { variant: "secondary", className: "text-xs", children: "Padrão" })
        ] }) }) }),
        /* @__PURE__ */ jsxs(SelectContent, { className: "max-h-60", children: [
          /* @__PURE__ */ jsx("div", { className: "p-2 text-xs text-muted-foreground border-b border-border", children: "Selecione o rancho responsável" }),
          selectItems
        ] })
      ] }),
      hasDefault && /* @__PURE__ */ jsxs("div", { className: "text-xs text-muted-foreground flex items-center space-x-1", children: [
        /* @__PURE__ */ jsx(AlertCircle, { className: "h-3 w-3" }),
        /* @__PURE__ */ jsx("span", { children: "Este é o rancho padrão configurado" })
      ] }),
      showValidation && !isValidSelection && value && /* @__PURE__ */ jsxs("div", { className: "text-xs text-destructive flex items-center space-x-1", children: [
        /* @__PURE__ */ jsx(AlertCircle, { className: "h-3 w-3" }),
        /* @__PURE__ */ jsxs("span", { children: [
          'Rancho não encontrado: "',
          value,
          '"'
        ] })
      ] })
    ] });
  }
);
MessHallSelector.displayName = "MessHallSelector";
const UnitSelector = MessHallSelector;
const countSelectedMeals = (daySelections) => {
  return Object.values(daySelections).filter(Boolean).length;
};
const DayCardSkeleton = memo(() => {
  return /* @__PURE__ */ jsxs(Card, { className: "w-80 flex-shrink-0 bg-card text-card-foreground border border-border", children: [
    /* @__PURE__ */ jsxs(CardHeader, { className: "pb-3", children: [
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-[1fr_auto] gap-4 items-start", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center space-x-2", children: [
          /* @__PURE__ */ jsx(Skeleton, { className: "h-4 w-4" }),
          /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
            /* @__PURE__ */ jsx(Skeleton, { className: "h-5 w-20" }),
            /* @__PURE__ */ jsx(Skeleton, { className: "h-4 w-16" })
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "flex items-center space-x-1", children: /* @__PURE__ */ jsx(Skeleton, { className: "h-6 w-12 rounded-full" }) })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "h-12 flex items-center", children: /* @__PURE__ */ jsx("div", { className: "w-full bg-muted/50 rounded-lg p-2 border border-border", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
        /* @__PURE__ */ jsx(Skeleton, { className: "h-4 w-24" }),
        /* @__PURE__ */ jsx("div", { className: "flex space-x-1", children: [...Array(4)].map((_, i) => /* @__PURE__ */ jsx(Skeleton, { className: "w-2 h-2 rounded-full" }, i)) })
      ] }) }) })
    ] }),
    /* @__PURE__ */ jsx(CardContent, { children: /* @__PURE__ */ jsxs("div", { className: "grid grid-rows-[auto_1fr_auto] gap-3 min-h-[200px]", children: [
      /* @__PURE__ */ jsx("div", { className: "bg-muted/30 rounded-lg p-3 border border-border", children: /* @__PURE__ */ jsx(Skeleton, { className: "h-8 w-full" }) }),
      /* @__PURE__ */ jsx("div", { className: "grid grid-cols-2 gap-2", children: [...Array(4)].map((_, i) => /* @__PURE__ */ jsx(Skeleton, { className: "h-12 rounded-lg" }, i)) }),
      /* @__PURE__ */ jsx("div", { className: "h-9 flex items-center", children: /* @__PURE__ */ jsxs("div", { className: "flex gap-2 w-full", children: [
        /* @__PURE__ */ jsx(Skeleton, { className: "flex-1 h-7" }),
        /* @__PURE__ */ jsx(Skeleton, { className: "flex-1 h-7" })
      ] }) })
    ] }) })
  ] });
});
DayCardSkeleton.displayName = "DayCardSkeleton";
const DayCard$1 = memo(
  ({
    date,
    daySelections,
    dayMessHallId,
    defaultMessHallId,
    onMealToggle,
    onMessHallChange,
    formattedDate,
    dayOfWeek,
    isToday,
    isDateNear: isDateNear2,
    pendingChanges,
    isSaving = false,
    selectedMealsCount,
    isLoading = false
  }) => {
    if (isLoading) {
      return /* @__PURE__ */ jsx(DayCardSkeleton, {});
    }
    const cardState = useMemo(() => {
      const hasPendingChanges = pendingChanges.some(
        (change) => change.date === date
      );
      const selectedCount = selectedMealsCount ?? countSelectedMeals(daySelections);
      const isUsingNonDefaultMessHall = dayMessHallId && dayMessHallId !== defaultMessHallId;
      return {
        hasPendingChanges,
        selectedCount,
        isUsingNonDefaultMessHall,
        isEmpty: selectedCount === 0,
        isFull: selectedCount === 4,
        hasPartialSelection: selectedCount > 0 && selectedCount < 4
      };
    }, [
      pendingChanges,
      date,
      daySelections,
      dayMessHallId,
      defaultMessHallId,
      selectedMealsCount
    ]);
    const cardClasses = useMemo(() => {
      return cn(
        // Base card with tokens
        "w-80 flex-shrink-0 transition-all duration-200 hover:shadow-md relative",
        "bg-card text-card-foreground border border-border",
        {
          // Main visual states
          "ring-2 ring-primary shadow-lg bg-primary/5": isToday,
          "ring-1 ring-accent bg-accent/10": cardState.hasPendingChanges && !isToday,
          "opacity-75 grayscale-[0.3]": isDateNear2 && !isToday,
          // Fill states
          "bg-primary/10 border-primary/40": cardState.isFull && !isToday,
          "bg-secondary/10 border-secondary/40": cardState.hasPartialSelection && !isToday && !cardState.hasPendingChanges,
          "bg-muted/30 border-border": cardState.isEmpty && !isToday && !cardState.hasPendingChanges
        }
      );
    }, [isToday, isDateNear2, cardState]);
    const handleMealToggle = useCallback(
      (meal) => {
        onMealToggle(date, meal);
      },
      [date, onMealToggle]
    );
    const handleMessHallChange = useCallback(
      (newMessHallId) => {
        onMessHallChange(date, newMessHallId);
      },
      [date, onMessHallChange]
    );
    const isDisabled = isSaving || isDateNear2;
    return /* @__PURE__ */ jsxs(Card, { className: cardClasses, children: [
      /* @__PURE__ */ jsxs(CardHeader, { className: "pb-3", children: [
        /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-[1fr_auto] gap-4 items-start", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center space-x-2 min-w-0", children: [
            /* @__PURE__ */ jsx(Calendar, { className: "h-4 w-4 text-muted-foreground flex-shrink-0" }),
            /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
              /* @__PURE__ */ jsx("h3", { className: "font-semibold text-foreground truncate", children: formattedDate }),
              /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground capitalize truncate", children: dayOfWeek })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex items-center space-x-1 flex-shrink-0", children: [
            isSaving && /* @__PURE__ */ jsx(Loader2, { className: "h-4 w-4 animate-spin text-primary" }),
            isDateNear2 && /* @__PURE__ */ jsx(Clock, { className: "h-4 w-4 text-accent" }),
            isToday && /* @__PURE__ */ jsx(Badge, { variant: "default", className: "text-xs px-2 py-0", children: "Hoje" }),
            cardState.hasPendingChanges && /* @__PURE__ */ jsx(
              Badge,
              {
                variant: "outline",
                className: "text-xs px-2 py-0 border-accent text-accent",
                children: "Saving"
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "h-12 flex items-center", children: cardState.selectedCount > 0 && /* @__PURE__ */ jsx("div", { className: "w-full bg-background/80 backdrop-blur-sm rounded-lg p-2 border border-border", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsxs("span", { className: "text-sm font-medium text-foreground", children: [
            cardState.selectedCount,
            "/4 meals"
          ] }),
          /* @__PURE__ */ jsx("div", { className: "flex space-x-1", children: MEAL_TYPES.map((meal) => {
            const mealKey = meal.value;
            const isSelected = daySelections[mealKey];
            return /* @__PURE__ */ jsx(
              "div",
              {
                className: cn(
                  "w-2 h-2 rounded-full transition-all duration-200",
                  isSelected ? "bg-primary scale-110" : "bg-muted-foreground/30"
                ),
                title: `${meal.label}: ${isSelected ? "Confirmed" : "Not going"}`
              },
              meal.value
            );
          }) })
        ] }) }) })
      ] }),
      /* @__PURE__ */ jsx(CardContent, { children: /* @__PURE__ */ jsxs("div", { className: "grid grid-rows-[auto_1fr_auto] gap-3 min-h-[200px]", children: [
        /* @__PURE__ */ jsx("div", { className: "bg-accent/10 backdrop-blur-sm rounded-lg p-3 border border-accent/30", children: /* @__PURE__ */ jsx(
          MessHallSelector,
          {
            value: dayMessHallId,
            onChange: handleMessHallChange,
            disabled: isDisabled,
            hasDefaultMessHall: false
          }
        ) }),
        /* @__PURE__ */ jsx("div", { className: "grid grid-cols-2 gap-2", children: MEAL_TYPES.map((meal) => {
          const mealKey = meal.value;
          return /* @__PURE__ */ jsx(
            MealButton,
            {
              meal,
              isSelected: daySelections[mealKey],
              onToggle: () => handleMealToggle(mealKey),
              disabled: isDisabled,
              compact: true
            },
            meal.value
          );
        }) }),
        /* @__PURE__ */ jsx("div", { className: "h-9 flex items-center", children: !isDisabled && /* @__PURE__ */ jsxs("div", { className: "flex gap-2 w-full", children: [
          /* @__PURE__ */ jsx(
            Button,
            {
              variant: "outline",
              size: "sm",
              onClick: () => {
                MEAL_TYPES.forEach((meal) => {
                  const mealKey = meal.value;
                  if (!daySelections[mealKey]) {
                    handleMealToggle(mealKey);
                  }
                });
              },
              className: "flex-1 text-xs h-7",
              children: "Todas"
            }
          ),
          /* @__PURE__ */ jsx(
            Button,
            {
              variant: "outline",
              size: "sm",
              onClick: () => {
                MEAL_TYPES.forEach((meal) => {
                  const mealKey = meal.value;
                  if (daySelections[mealKey]) {
                    handleMealToggle(mealKey);
                  }
                });
              },
              className: "flex-1 text-xs h-7",
              children: "Limpar"
            }
          )
        ] }) })
      ] }) })
    ] });
  }
);
DayCard$1.displayName = "DayCard";
const useDayCardData = (date, todayString, isDateNear2, formatDate2, getDayOfWeek2, daySelections, pendingChanges) => {
  return useMemo(() => {
    const selectedMealsCount = countSelectedMeals(daySelections);
    const hasPendingChanges = pendingChanges.some(
      (change) => change.date === date
    );
    return {
      formattedDate: formatDate2(date),
      dayOfWeek: getDayOfWeek2(date),
      selectedMealsCount,
      isDateNear: isDateNear2(date),
      isToday: date === todayString,
      hasPendingChanges,
      isEmpty: selectedMealsCount === 0,
      isFull: selectedMealsCount === 4,
      hasPartialSelection: selectedMealsCount > 0 && selectedMealsCount < 4
    };
  }, [
    date,
    todayString,
    isDateNear2,
    formatDate2,
    getDayOfWeek2,
    daySelections,
    pendingChanges
  ]);
};
const useDayCardOptimization = (dates, selections) => {
  return useMemo(() => {
    const optimizedData = {};
    dates.forEach((date) => {
      const daySelections = selections[date];
      const selectedCount = daySelections ? countSelectedMeals(daySelections) : 0;
      optimizedData[date] = {
        selectedCount,
        isEmpty: selectedCount === 0,
        isFull: selectedCount === 4
      };
    });
    return optimizedData;
  }, [dates, selections]);
};
const DayCard$2 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  DayCard: DayCard$1,
  DayCardSkeleton,
  default: DayCard$1,
  useDayCardData,
  useDayCardOptimization
}, Symbol.toStringTag, { value: "Module" }));
const BulkMealSelector = memo(
  ({ targetDates, initialTemplate, onApply, onCancel, isApplying }) => {
    const [template, setTemplate] = useState(() => {
      const base = createEmptyDayMeals();
      if (initialTemplate) {
        Object.entries(initialTemplate).forEach(([key, val]) => {
          base[key] = Boolean(val);
        });
      }
      return base;
    });
    const [applyMode, setApplyMode] = useState("fill-missing");
    const cardsCount = targetDates.length;
    const hasCardsToApply = cardsCount > 0;
    const modeBtnBase = "text-xs sm:text-sm h-8 px-3 border rounded-md transition-colors";
    const modeBtnSelected = "bg-primary text-primary-foreground border-primary";
    const modeBtnUnselected = "border-border text-foreground hover:bg-muted";
    const selectedCount = useMemo(
      () => Object.values(template).filter(Boolean).length,
      [template]
    );
    const toggleMeal = useCallback(
      (mealKey) => {
        if (isApplying) return;
        setTemplate((prev) => ({ ...prev, [mealKey]: !prev[mealKey] }));
      },
      [isApplying]
    );
    const setAll = useCallback(
      (value) => {
        if (isApplying) return;
        setTemplate((prev) => {
          const next = { ...prev };
          Object.keys(next).forEach((k) => {
            next[k] = value;
          });
          return next;
        });
      },
      [isApplying]
    );
    const setWorkdayPreset = useCallback(() => {
      if (isApplying) return;
      setTemplate((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((k) => {
          next[k] = k === "cafe" || k === "almoco";
        });
        return next;
      });
    }, [isApplying]);
    const handleApply = useCallback(async () => {
      if (!hasCardsToApply || isApplying) return;
      try {
        await onApply(template, { mode: applyMode });
      } catch (err) {
        console.error("Erro ao aplicar template de refeições:", err);
      }
    }, [hasCardsToApply, isApplying, onApply, template, applyMode]);
    const handleCancel = useCallback(() => {
      if (isApplying) return;
      onCancel();
    }, [isApplying, onCancel]);
    return /* @__PURE__ */ jsxs(
      Card,
      {
        className: "group relative w-full h-fit bg-card text-card-foreground border border-border shadow-sm transition-all duration-300 hover:shadow-md hover:border-accent max-w-xl\n        ",
        children: [
          /* @__PURE__ */ jsx(CardHeader, { className: "", children: /* @__PURE__ */ jsxs(CardTitle, { className: "flex items-center gap-2 text-foreground", children: [
            /* @__PURE__ */ jsx(
              "span",
              {
                className: "\n                  inline-flex items-center justify-center h-8 w-8 rounded-lg\n                  bg-background text-primary ring-1 ring-border\n                ",
                children: /* @__PURE__ */ jsx(UtensilsCrossed, { className: "h-5 w-5" })
              }
            ),
            "Aplicar Refeições em Massa"
          ] }) }),
          /* @__PURE__ */ jsxs(CardContent, { className: "space-y-6", children: [
            /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsx(Label, { className: "text-sm font-medium text-foreground", children: "Modo de aplicação:" }),
              /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-2", children: [
                /* @__PURE__ */ jsx(
                  Button,
                  {
                    type: "button",
                    variant: "outline",
                    className: `${modeBtnBase} ${applyMode === "fill-missing" ? modeBtnSelected : modeBtnUnselected}`,
                    onClick: () => setApplyMode("fill-missing"),
                    disabled: isApplying,
                    children: "Preencher onde está vazio"
                  }
                ),
                /* @__PURE__ */ jsx(
                  Button,
                  {
                    type: "button",
                    variant: "outline",
                    className: `${modeBtnBase} ${applyMode === "override" ? modeBtnSelected : modeBtnUnselected}`,
                    onClick: () => setApplyMode("override"),
                    disabled: isApplying,
                    children: "Sobrescrever tudo"
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("p", { className: "text-xs text-muted-foreground", children: [
                "Selecionadas:",
                " ",
                /* @__PURE__ */ jsx("strong", { className: "text-foreground", children: selectedCount }),
                " de 4 refeições."
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
              /* @__PURE__ */ jsx(Label, { className: "text-sm font-medium text-foreground", children: "Escolha as refeições:" }),
              /* @__PURE__ */ jsx("div", { className: "grid grid-cols-2 gap-2", children: MEAL_TYPES.map((meal) => {
                const mealKey = meal.value;
                return /* @__PURE__ */ jsx(
                  MealButton,
                  {
                    meal,
                    isSelected: template[mealKey],
                    onToggle: () => toggleMeal(mealKey),
                    disabled: isApplying,
                    compact: true
                  },
                  meal.value
                );
              }) }),
              /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-2", children: [
                /* @__PURE__ */ jsx(
                  Button,
                  {
                    type: "button",
                    variant: "outline",
                    size: "sm",
                    onClick: () => setAll(true),
                    disabled: isApplying,
                    className: "text-xs hover:bg-muted",
                    children: "Todas"
                  }
                ),
                /* @__PURE__ */ jsx(
                  Button,
                  {
                    type: "button",
                    variant: "outline",
                    size: "sm",
                    onClick: () => setAll(false),
                    disabled: isApplying,
                    className: "text-xs hover:bg-muted",
                    children: "Nenhuma"
                  }
                ),
                /* @__PURE__ */ jsx(
                  Button,
                  {
                    type: "button",
                    variant: "outline",
                    size: "sm",
                    onClick: setWorkdayPreset,
                    disabled: isApplying,
                    className: "text-xs hover:bg-muted",
                    children: "Padrão Dias Úteis"
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "flex flex-row-reverse gap-4", children: [
              /* @__PURE__ */ jsx(
                Button,
                {
                  variant: "outline",
                  size: "sm",
                  onClick: handleCancel,
                  disabled: isApplying,
                  className: "\n                    hover:bg-muted\n                    focus-visible:ring-2 focus-visible:ring-ring\n                    focus-visible:ring-offset-2 focus-visible:ring-offset-background\n                  ",
                  children: "Cancelar"
                }
              ),
              /* @__PURE__ */ jsx(
                Button,
                {
                  size: "sm",
                  onClick: handleApply,
                  disabled: isApplying || !hasCardsToApply || selectedCount === 0,
                  className: "\n                    bg-primary text-primary-foreground hover:bg-primary/90\n                    focus-visible:ring-2 focus-visible:ring-ring\n                    focus-visible:ring-offset-2 focus-visible:ring-offset-background\n                    disabled:opacity-50 disabled:cursor-not-allowed\n                  ",
                  children: isApplying ? /* @__PURE__ */ jsxs(Fragment, { children: [
                    /* @__PURE__ */ jsx(Loader2, { className: "h-4 w-4 animate-spin mr-2" }),
                    "Aplicando..."
                  ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
                    /* @__PURE__ */ jsx(CheckCircle, { className: "h-4 w-4 mr-2" }),
                    "Aplicar a ",
                    cardsCount,
                    " card",
                    cardsCount !== 1 ? "s" : ""
                  ] })
                }
              )
            ] })
          ] })
        ]
      }
    );
  }
);
BulkMealSelector.displayName = "BulkMealSelector";
const SimplifiedMilitaryStats = memo(
  ({ selections, dates, isLoading = false }) => {
    const stats = useMemo(() => {
      const next7Days = dates.slice(0, 7);
      let totalMealsNext7Days = 0;
      let daysWithMealsNext7Days = 0;
      next7Days.forEach((date) => {
        const daySelections = selections[date];
        if (daySelections) {
          const mealsCount = Object.values(daySelections).filter(Boolean).length;
          if (mealsCount > 0) {
            daysWithMealsNext7Days++;
            totalMealsNext7Days += mealsCount;
          }
        }
      });
      let nextMeal = null;
      const mealOrder = ["cafe", "almoco", "janta", "ceia"];
      for (const date of dates) {
        const daySelections = selections[date];
        if (daySelections) {
          for (const meal of mealOrder) {
            if (daySelections[meal]) {
              nextMeal = { date, meal };
              break;
            }
          }
          if (nextMeal) break;
        }
      }
      const consideredDays = next7Days.length || 1;
      const progressPct = Math.round(
        daysWithMealsNext7Days / consideredDays * 100
      );
      return {
        totalMealsNext7Days,
        daysWithMealsNext7Days,
        nextMeal,
        consideredDays,
        progressPct
      };
    }, [selections, dates]);
    const formatDate2 = (dateStr) => {
      const [year, month, day] = dateStr.split("-").map(Number);
      const date = new Date(year, month - 1, day);
      return date.toLocaleDateString("pt-BR", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit"
      });
    };
    const formatMeal = (meal) => {
      const mealNames = {
        cafe: "Café",
        almoco: "Almoço",
        janta: "Janta",
        ceia: "Ceia"
      };
      return mealNames[meal] || meal;
    };
    if (isLoading) {
      return /* @__PURE__ */ jsx("div", { className: "space-y-4", children: /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-3 gap-4", children: [
        /* @__PURE__ */ jsx(Card, { className: "bg-card text-card-foreground border border-border border-l-4 border-l-primary/70", children: /* @__PURE__ */ jsx(CardContent, { className: "p-4", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsx("div", { className: "h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center", children: /* @__PURE__ */ jsx(Utensils, { className: "h-5 w-5 text-primary" }) }),
          /* @__PURE__ */ jsxs("div", { className: "flex-1", children: [
            /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-muted-foreground", children: "Próxima Refeição" }),
            /* @__PURE__ */ jsx(Skeleton, { className: "h-6 w-28 mt-1" }),
            /* @__PURE__ */ jsx(Skeleton, { className: "h-4 w-20 mt-2" })
          ] })
        ] }) }) }),
        /* @__PURE__ */ jsx(Card, { className: "bg-card text-card-foreground border border-border border-l-4 border-l-accent/70", children: /* @__PURE__ */ jsx(CardContent, { className: "p-4", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsx("div", { className: "h-9 w-9 rounded-full bg-accent/10 flex items-center justify-center", children: /* @__PURE__ */ jsx(Clock, { className: "h-5 w-5 text-accent" }) }),
          /* @__PURE__ */ jsxs("div", { className: "flex-1", children: [
            /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-muted-foreground", children: "Próximos 7 Dias" }),
            /* @__PURE__ */ jsx(Skeleton, { className: "h-6 w-36 mt-1" }),
            /* @__PURE__ */ jsx(Skeleton, { className: "h-2 w-full mt-3 rounded-full" }),
            /* @__PURE__ */ jsx(Skeleton, { className: "h-4 w-24 mt-2" })
          ] })
        ] }) }) }),
        /* @__PURE__ */ jsx(Card, { className: "bg-card text-card-foreground border border-border border-l-4 border-l-secondary/70", children: /* @__PURE__ */ jsx(CardContent, { className: "p-4", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsx("div", { className: "h-9 w-9 rounded-full bg-secondary/10 flex items-center justify-center", children: /* @__PURE__ */ jsx(CalendarDays, { className: "h-5 w-5 text-secondary" }) }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-muted-foreground", children: "Status" }),
            /* @__PURE__ */ jsx(Skeleton, { className: "h-7 w-40 mt-2 rounded-full" })
          ] })
        ] }) }) })
      ] }) });
    }
    return /* @__PURE__ */ jsx("div", { className: "space-y-4", children: /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-3 gap-4", children: [
      /* @__PURE__ */ jsx(Card, { className: "bg-card text-card-foreground border border-border border-l-4 border-l-primary hover:shadow-sm transition-shadow", children: /* @__PURE__ */ jsx(CardContent, { className: "p-4", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsx("div", { className: "h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center", children: /* @__PURE__ */ jsx(Utensils, { className: "h-5 w-5 text-primary" }) }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-muted-foreground", children: "Próxima Refeição" }),
          stats.nextMeal ? /* @__PURE__ */ jsxs("div", { className: "mt-0.5", children: [
            /* @__PURE__ */ jsx("p", { className: "text-lg font-semibold text-foreground leading-tight", children: formatMeal(stats.nextMeal.meal) }),
            /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground leading-tight", children: formatDate2(stats.nextMeal.date) })
          ] }) : /* @__PURE__ */ jsxs("div", { className: "mt-0.5 flex items-center gap-2 text-muted-foreground", children: [
            /* @__PURE__ */ jsx(MinusCircle, { className: "h-4 w-4" }),
            /* @__PURE__ */ jsx("p", { className: "text-sm font-medium", children: "Nenhuma refeição agendada" })
          ] })
        ] })
      ] }) }) }),
      /* @__PURE__ */ jsx(Card, { className: "bg-card text-card-foreground border border-border border-l-4 border-l-accent hover:shadow-sm transition-shadow", children: /* @__PURE__ */ jsx(CardContent, { className: "p-4", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsx("div", { className: "h-9 w-9 rounded-full bg-accent/10 flex items-center justify-center", children: /* @__PURE__ */ jsx(Clock, { className: "h-5 w-5 text-accent" }) }),
        /* @__PURE__ */ jsxs("div", { className: "flex-1", children: [
          /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-muted-foreground", children: "Próximos 7 Dias" }),
          /* @__PURE__ */ jsxs("p", { className: "text-lg font-semibold text-foreground leading-tight", children: [
            stats.totalMealsNext7Days,
            " refeições"
          ] }),
          /* @__PURE__ */ jsxs("p", { className: "text-xs text-muted-foreground leading-tight", children: [
            "em ",
            stats.daysWithMealsNext7Days,
            " de ",
            stats.consideredDays,
            " ",
            "dias"
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "mt-3", children: [
            /* @__PURE__ */ jsx("div", { className: "h-2 w-full rounded-full bg-muted overflow-hidden", children: /* @__PURE__ */ jsx(
              "div",
              {
                className: "h-full bg-accent rounded-full transition-all",
                style: { width: `${stats.progressPct}%` },
                "aria-label": `Progresso: ${stats.progressPct}%`
              }
            ) }),
            /* @__PURE__ */ jsxs("div", { className: "mt-1.5 text-xs text-muted-foreground", children: [
              stats.progressPct,
              "% dos dias com ao menos 1 refeição"
            ] })
          ] })
        ] })
      ] }) }) }),
      /* @__PURE__ */ jsx(Card, { className: "bg-card text-card-foreground border border-border border-l-4 border-l-secondary hover:shadow-sm transition-shadow", children: /* @__PURE__ */ jsx(CardContent, { className: "p-4", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsx("div", { className: "h-9 w-9 rounded-full bg-secondary/10 flex items-center justify-center", children: /* @__PURE__ */ jsx(CalendarDays, { className: "h-5 w-5 text-secondary" }) }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-muted-foreground", children: "Status" }),
          /* @__PURE__ */ jsxs("div", { className: "mt-1 flex items-center gap-2", children: [
            /* @__PURE__ */ jsx(
              Badge,
              {
                variant: stats.totalMealsNext7Days > 0 ? "default" : "secondary",
                className: "px-2.5 py-1",
                children: stats.totalMealsNext7Days > 0 ? /* @__PURE__ */ jsxs("span", { className: "inline-flex items-center gap-1", children: [
                  /* @__PURE__ */ jsx(CheckCircle2, { className: "h-4 w-4" }),
                  "Refeições Agendadas"
                ] }) : "Sem Refeições"
              }
            ),
            stats.totalMealsNext7Days > 0 && /* @__PURE__ */ jsxs("span", { className: "text-xs text-muted-foreground", children: [
              stats.totalMealsNext7Days,
              " no total"
            ] })
          ] })
        ] })
      ] }) }) })
    ] }) });
  }
);
SimplifiedMilitaryStats.displayName = "SimplifiedMilitaryStats";
const pluralize$1 = (count, singular, plural) => count === 1 ? singular : plural;
const labelAlteracao$1 = (n) => pluralize$1(n, "alteração", "alterações");
const labelPendente = (n) => pluralize$1(n, "pendente", "pendentes");
const PENDING_ID = "sisub-pending";
const UnifiedStatusToasts = memo(
  ({
    success,
    error,
    onClearMessages,
    pendingChanges,
    isSavingBatch,
    autoHideSuccessMs = 6e3
  }) => {
    const count = pendingChanges.length;
    useEffect(() => {
      if (!success) return;
      const id = `sisub-success-${Date.now()}`;
      toast.success(success, {
        id,
        duration: autoHideSuccessMs,
        icon: /* @__PURE__ */ jsx(CheckCircle, { className: "h-4 w-4" })
      });
      const t = setTimeout(() => onClearMessages(), autoHideSuccessMs);
      return () => clearTimeout(t);
    }, [success, autoHideSuccessMs, onClearMessages]);
    useEffect(() => {
      if (!error) return;
      const id = "sisub-error";
      toast.error(error, {
        id,
        duration: 1e4,
        closeButton: true,
        icon: /* @__PURE__ */ jsx(AlertTriangle, { className: "h-4 w-4" }),
        action: {
          label: "Fechar",
          onClick: () => {
            onClearMessages();
            toast.dismiss(id);
          }
        }
      });
    }, [error, onClearMessages]);
    useEffect(() => {
      if (count > 0) {
        const baseMsg = `${count} ${labelAlteracao$1(count)}`;
        if (isSavingBatch) {
          toast(`Salvando ${baseMsg}...`, {
            id: PENDING_ID,
            duration: Infinity,
            icon: /* @__PURE__ */ jsx(Loader2, { className: "h-4 w-4 animate-spin" })
          });
        } else {
          toast(
            `${baseMsg} ${labelPendente(count)} — salvamento automático em andamento`,
            {
              id: PENDING_ID,
              duration: Infinity,
              icon: /* @__PURE__ */ jsx(Save, { className: "h-4 w-4" })
            }
          );
        }
      } else {
        toast.dismiss(PENDING_ID);
      }
    }, [count, isSavingBatch]);
    return null;
  }
);
UnifiedStatusToasts.displayName = "UnifiedStatusToasts";
const DayCard = lazy(() => Promise.resolve().then(() => DayCard$2));
const pluralize = (count, singular, plural) => count === 1 ? singular : plural;
const labelAlteracao = (n) => pluralize(n, "alteração", "alterações");
const labelCard = (n) => pluralize(n, "card", "cards");
const labelDiaUtil = (n) => pluralize(n, "dia útil", "dias úteis");
const getDayCardData = (date, todayString, daySelections) => {
  const formattedDate = formatDate(date);
  const dayOfWeek = getDayOfWeek(date);
  const selectedMealsCount = Object.values(daySelections).filter(Boolean).length;
  const isDateNearValue = isDateNear(date, NEAR_DATE_THRESHOLD);
  const isToday = date === todayString;
  return {
    formattedDate,
    dayOfWeek,
    selectedMealsCount,
    isDateNear: isDateNearValue,
    isToday
  };
};
const isWeekday = (dateString) => {
  const d = /* @__PURE__ */ new Date(`${dateString}T00:00:00`);
  const dow = d.getDay();
  return dow >= 1 && dow <= 5;
};
function meta$3({}) {
  return [{
    title: "Previsão SISUB"
  }, {
    name: "description",
    content: "Faça sua previsão"
  }];
}
const rancho = UNSAFE_withComponentProps(function Rancho() {
  const {
    success,
    error,
    isLoading,
    isRefetching,
    // refetch em background
    pendingChanges,
    isSavingBatch,
    selections,
    dayMessHalls,
    // Record<date, messHallCode> (UI usa CODE)
    dates,
    todayString,
    setSuccess,
    setError,
    setPendingChanges,
    setSelections,
    setDayMessHalls,
    loadExistingForecasts,
    clearMessages,
    defaultMessHallId,
    // ID (string)
    setDefaultMessHallId,
    // setter local (string)
    persistDefaultMessHallId
    // persiste no user_data
  } = useMealForecast();
  const {
    messHalls
  } = useMessHalls();
  const defaultMessHallCode = useMemo(() => {
    if (!defaultMessHallId) return "";
    const mh = messHalls.find((m) => String(m.id) === String(defaultMessHallId));
    return mh?.code ?? "";
  }, [defaultMessHallId, messHalls]);
  const setDefaultMessHallCode = useCallback((code) => {
    const mh = messHalls.find((m) => m.code === code);
    if (mh?.id != null) {
      setDefaultMessHallId(String(mh.id));
    }
  }, [messHalls, setDefaultMessHallId]);
  const getMessHallIdByCode2 = useCallback((code) => {
    if (!code) return "";
    const match = messHalls.find((m) => m.code === code);
    return match?.id != null ? String(match.id) : "";
  }, [messHalls]);
  const resolveMessHallIdForDate = useCallback((date) => {
    const code = dayMessHalls[date] || defaultMessHallCode || "";
    const idFromCode = getMessHallIdByCode2(code);
    return idFromCode || (defaultMessHallId ? String(defaultMessHallId) : "");
  }, [dayMessHalls, defaultMessHallCode, defaultMessHallId, getMessHallIdByCode2]);
  const [showDefaultMessHallSelector, setShowDefaultMessHallSelector] = useState(false);
  const [isApplyingDefaultMessHall, setIsApplyingDefaultMessHall] = useState(false);
  const [showBulkMealSelector, setShowBulkMealSelector] = useState(false);
  const [isApplyingMealTemplate, setIsApplyingMealTemplate] = useState(false);
  const weekdayTargets = useMemo(() => dates.filter((date) => isWeekday(date) && !isDateNear(date, NEAR_DATE_THRESHOLD)), [dates]);
  const computedData = useMemo(() => {
    const cardsWithoutMessHall = dates.filter((date) => {
      const code = dayMessHalls[date];
      return !code;
    });
    const cardData = dates.map((date) => ({
      date,
      daySelections: selections[date] || createEmptyDayMeals(),
      // UI sempre com CODE
      dayMessHallCode: dayMessHalls[date] || defaultMessHallCode || ""
    }));
    return {
      cardsWithoutMessHall,
      cardData
    };
  }, [dates, dayMessHalls, selections, defaultMessHallCode]);
  const dayCardsProps = useMemo(() => {
    return computedData.cardData.map(({
      date,
      daySelections,
      dayMessHallCode
    }) => {
      const dayCardData = getDayCardData(date, todayString, daySelections);
      return {
        key: date,
        date,
        daySelections,
        // DayCard e MessHallSelector trabalham com CODE (mantemos nome por compat)
        dayMessHallId: dayMessHallCode,
        // Também passamos o default como CODE
        defaultMessHallId: defaultMessHallCode,
        ...dayCardData,
        isSaving: false
      };
    });
  }, [computedData.cardData, todayString, defaultMessHallCode]);
  const handleMealToggle = useCallback((date, meal) => {
    if (isDateNear(date, NEAR_DATE_THRESHOLD)) return;
    const messHallId = resolveMessHallIdForDate(date);
    if (!messHallId) {
      setError("Defina seu rancho padrão antes de marcar refeições.");
      return;
    }
    const currentValue = selections[date]?.[meal] || false;
    const newValue = !currentValue;
    setSelections((prev) => {
      const existing = prev[date] ?? createEmptyDayMeals();
      return {
        ...prev,
        [date]: {
          ...existing,
          [meal]: newValue
        }
      };
    });
    setPendingChanges((prev) => {
      const idx = prev.findIndex((c) => c.date === date && c.meal === meal);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = {
          date,
          meal,
          value: newValue,
          messHallId
        };
        return copy;
      }
      return [...prev, {
        date,
        meal,
        value: newValue,
        messHallId
      }];
    });
  }, [selections, resolveMessHallIdForDate, setSelections, setPendingChanges, setError]);
  const handleMessHallChange = useCallback((date, newMessHallCode) => {
    if (isDateNear(date, NEAR_DATE_THRESHOLD)) return;
    setDayMessHalls((prev) => ({
      ...prev,
      [date]: newMessHallCode
    }));
    const dayMeals = selections[date];
    if (!dayMeals) return;
    const messHallId = getMessHallIdByCode2(newMessHallCode);
    if (!messHallId) return;
    const selectedMeals = Object.entries(dayMeals).filter(([, isSelected]) => isSelected).map(([meal, value]) => ({
      date,
      meal,
      value,
      messHallId
    }));
    if (!selectedMeals.length) return;
    setPendingChanges((prev) => {
      const filtered = prev.filter((c) => c.date !== date);
      return [...filtered, ...selectedMeals];
    });
  }, [selections, setDayMessHalls, setPendingChanges, getMessHallIdByCode2]);
  const handleRefresh = useCallback(() => {
    loadExistingForecasts();
  }, [loadExistingForecasts]);
  const handleToggleMessHallSelector = useCallback(() => {
    setShowDefaultMessHallSelector((prev) => !prev);
  }, []);
  const handleCancelMessHallSelector = useCallback(() => {
    setShowDefaultMessHallSelector(false);
  }, []);
  const applyDefaultMessHallToAll = useCallback(async () => {
    const {
      cardsWithoutMessHall
    } = computedData;
    if (cardsWithoutMessHall.length === 0) return;
    try {
      const messHallIdForDefault = defaultMessHallId || getMessHallIdByCode2(defaultMessHallCode) || "";
      if (!messHallIdForDefault) {
        setError("Defina e salve um rancho padrão antes de aplicar aos cards.");
        return;
      }
      const updatedMessHalls = {
        ...dayMessHalls
      };
      cardsWithoutMessHall.forEach((date) => {
        updatedMessHalls[date] = defaultMessHallCode;
      });
      setDayMessHalls(updatedMessHalls);
      const newPendingChanges = [];
      cardsWithoutMessHall.forEach((date) => {
        const dayMeals = selections[date];
        if (!dayMeals) return;
        Object.entries(dayMeals).filter(([, isSelected]) => isSelected).forEach(([meal, value]) => {
          newPendingChanges.push({
            date,
            meal,
            value,
            messHallId: String(messHallIdForDefault)
          });
        });
      });
      if (newPendingChanges.length > 0) {
        setPendingChanges((prev) => {
          const filtered = prev.filter((change) => !cardsWithoutMessHall.includes(change.date));
          return [...filtered, ...newPendingChanges];
        });
      }
      setSuccess(`Rancho padrão "${defaultMessHallCode}" aplicado a ${cardsWithoutMessHall.length} ${labelCard(cardsWithoutMessHall.length)}!`);
      setShowDefaultMessHallSelector(false);
    } catch (err) {
      console.error("Erro ao aplicar rancho padrão:", err);
      setError("Erro ao aplicar rancho padrão. Tente novamente.");
    }
  }, [computedData, dayMessHalls, defaultMessHallCode, defaultMessHallId, selections, setDayMessHalls, setPendingChanges, setSuccess, setError, getMessHallIdByCode2]);
  const applyMealTemplateToAll = useCallback(async (template, options) => {
    const targetDates = weekdayTargets;
    if (!targetDates.length) {
      setShowBulkMealSelector(false);
      return;
    }
    setIsApplyingMealTemplate(true);
    try {
      const newChanges = [];
      const afterByDate = {};
      targetDates.forEach((date) => {
        const before = selections[date] || createEmptyDayMeals();
        const after = {
          ...before
        };
        if (options.mode === "override") {
          Object.keys(after).forEach((k) => {
            after[k] = Boolean(template[k]);
          });
        } else {
          Object.keys(after).forEach((k) => {
            if (template[k]) after[k] = after[k] || true;
          });
        }
        const codeForDay = (dayMessHalls[date] && dayMessHalls[date] !== "" ? dayMessHalls[date] : defaultMessHallCode) || "";
        const idForDay = getMessHallIdByCode2(codeForDay) || (defaultMessHallId ? String(defaultMessHallId) : "");
        Object.keys(after).forEach((k) => {
          if (after[k] !== before[k]) {
            if (!idForDay) {
              return;
            }
            newChanges.push({
              date,
              meal: k,
              value: after[k],
              messHallId: idForDay
            });
          }
        });
        afterByDate[date] = after;
      });
      if (newChanges.length === 0) {
        setSuccess("Nenhuma alteração necessária para aplicar o template em dias úteis.");
        setShowBulkMealSelector(false);
        return;
      }
      setSelections((prev) => {
        const next = {
          ...prev
        };
        targetDates.forEach((date) => {
          next[date] = afterByDate[date];
        });
        return next;
      });
      setPendingChanges((prev) => {
        const toRemove = new Set(newChanges.map((c) => `${c.date}|${String(c.meal)}`));
        const filtered = prev.filter((c) => !toRemove.has(`${c.date}|${String(c.meal)}`));
        return [...filtered, ...newChanges];
      });
      const diasStr = `${targetDates.length} ${labelDiaUtil(targetDates.length)}`;
      const alteracoesStr = `${newChanges.length} ${labelAlteracao(newChanges.length)}`;
      setSuccess(`Template de refeições aplicado a ${diasStr} no modo ${options.mode === "override" ? "sobrescrever" : "preencher"}: ${alteracoesStr}.`);
      setShowBulkMealSelector(false);
    } catch (err) {
      console.error("Erro ao aplicar template de refeições:", err);
      setError("Erro ao aplicar template de refeições. Tente novamente.");
    } finally {
      setIsApplyingMealTemplate(false);
    }
  }, [weekdayTargets, selections, dayMessHalls, defaultMessHallCode, defaultMessHallId, setSelections, setPendingChanges, setSuccess, setError, getMessHallIdByCode2]);
  const handleApplyDefault = useCallback(async () => {
    setIsApplyingDefaultMessHall(true);
    try {
      await persistDefaultMessHallId();
      await applyDefaultMessHallToAll();
      await loadExistingForecasts();
    } finally {
      setIsApplyingDefaultMessHall(false);
    }
  }, [persistDefaultMessHallId, applyDefaultMessHallToAll, loadExistingForecasts]);
  return /* @__PURE__ */ jsxs("div", {
    className: "h-full container flex-col mx-auto px-4 sm:px-6 md:px-8 py-4 sm:py-6 space-y-6",
    children: [/* @__PURE__ */ jsxs("header", {
      className: "flex flex-wrap items-center justify-between gap-3",
      children: [/* @__PURE__ */ jsx("h1", {
        className: "text-lg sm:text-xl font-semibold",
        children: "Previsão SISUB"
      }), /* @__PURE__ */ jsxs("div", {
        className: "flex flex-wrap items-center gap-2",
        children: [/* @__PURE__ */ jsxs(Button, {
          variant: "outline",
          size: "sm",
          onClick: handleToggleMessHallSelector,
          className: " hover:bg-orange-50 cursor-pointer",
          "aria-label": "Definir rancho padrão",
          children: [/* @__PURE__ */ jsx(Settings, {
            className: "h-4 w-4 mr-2"
          }), "Rancho Padrão"]
        }), /* @__PURE__ */ jsxs(Button, {
          variant: "outline",
          size: "sm",
          onClick: () => setShowBulkMealSelector(!showBulkMealSelector),
          disabled: isLoading,
          className: " hover:bg-green-50 cursor-pointer",
          "aria-label": "Aplicar refeições em massa",
          children: [/* @__PURE__ */ jsx(UtensilsCrossed, {
            className: "h-4 w-4 mr-2"
          }), "Refeições em Massa"]
        }), /* @__PURE__ */ jsx(Button, {
          variant: "outline",
          size: "sm",
          onClick: handleRefresh,
          disabled: isLoading || isRefetching,
          className: "cursor-pointer",
          "aria-label": "Recarregar previsões",
          children: /* @__PURE__ */ jsx(RefreshCw, {
            className: `h-4 w-4 ${isRefetching ? "animate-spin" : ""}`
          })
        })]
      })]
    }), /* @__PURE__ */ jsxs("section", {
      className: "gap-8 flex flex-row w-full",
      children: [showDefaultMessHallSelector && /* @__PURE__ */ jsx(DefaultMessHallSelector, {
        defaultMessHallCode,
        setDefaultMessHallCode,
        onApply: handleApplyDefault,
        onCancel: handleCancelMessHallSelector,
        isApplying: isApplyingDefaultMessHall
      }), showBulkMealSelector && /* @__PURE__ */ jsx(BulkMealSelector, {
        targetDates: weekdayTargets,
        initialTemplate: {
          cafe: true,
          almoco: true
        },
        onApply: applyMealTemplateToAll,
        onCancel: () => setShowBulkMealSelector(false),
        isApplying: isApplyingMealTemplate
      })]
    }), /* @__PURE__ */ jsx("div", {
      className: "fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none",
      children: /* @__PURE__ */ jsx(UnifiedStatusToasts, {
        success,
        error,
        onClearMessages: clearMessages,
        pendingChanges,
        isSavingBatch,
        autoHideSuccessMs: 6e3
      })
    }), /* @__PURE__ */ jsx("section", {
      className: "w-full",
      children: /* @__PURE__ */ jsx("div", {
        className: "p-4 sm:p-5",
        children: /* @__PURE__ */ jsx("div", {
          className: "p-4 sm:p-5",
          children: /* @__PURE__ */ jsx(SimplifiedMilitaryStats, {
            selections,
            dates,
            isLoading: isRefetching
          })
        })
      })
    }), /* @__PURE__ */ jsxs("section", {
      "aria-labelledby": "cards-title",
      children: [/* @__PURE__ */ jsx("h2", {
        id: "cards-title",
        className: "sr-only",
        children: "Previsão por dia"
      }), /* @__PURE__ */ jsx("div", {
        className: "flex flex-row columns-auto justify-center items-center w-full flex-wrap gap-8",
        role: "region",
        "aria-label": "Lista de cards por dia",
        children: dayCardsProps.map((cardProps) => /* @__PURE__ */ jsx(Suspense, {
          fallback: /* @__PURE__ */ jsx(DayCardSkeleton, {}),
          children: /* @__PURE__ */ jsx("div", {
            className: "snap-center",
            children: /* @__PURE__ */ jsx(DayCard, {
              ...cardProps,
              pendingChanges,
              onMealToggle: handleMealToggle,
              onMessHallChange: handleMessHallChange
            })
          })
        }, cardProps.key))
      })]
    })]
  });
});
const route12 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: rancho,
  meta: meta$3
}, Symbol.toStringTag, { value: "Module" }));
function inferDefaultMeal$1(now = /* @__PURE__ */ new Date()) {
  const toMin = (h, m = 0) => h * 60 + m;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const inRange = (start, end) => minutes >= start && minutes < end;
  if (inRange(toMin(4), toMin(9))) return "cafe";
  if (inRange(toMin(9), toMin(15))) return "almoco";
  if (inRange(toMin(15), toMin(20))) return "janta";
  return "ceia";
}
function todayISO() {
  return (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
}
function buildRedirectTo(pathname, search, fallback = "/rancho") {
  const raw = `${pathname}${search || ""}`;
  const safe = raw.startsWith("/") && !raw.startsWith("//") ? raw : fallback;
  return encodeURIComponent(safe);
}
const REDIRECT_DELAY_SECONDS = 3;
function isDuplicateOrConflict(err) {
  const e = err;
  const code = e?.code;
  const status = e?.status;
  const msg = String(e?.message || "").toLowerCase();
  return code === "23505" || code === 23505 || code === "409" || status === 409 || msg.includes("duplicate key") || msg.includes("conflict");
}
const selfCheckIn = UNSAFE_withComponentProps(function SelfCheckin() {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectedRef = useRef(false);
  const countdownIntervalRef = useRef(null);
  const unitParam = search.get("unit") ?? search.get("u");
  const unidade = useMemo(() => unitParam ?? "DIRAD - DIRAD", [unitParam]);
  const date = useMemo(() => todayISO(), []);
  const meal = useMemo(() => inferDefaultMeal$1(), []);
  const [uuid, setUuid] = useState(null);
  const [systemForecast, setSystemForecast] = useState(false);
  const [willEnter, setWillEnter] = useState("sim");
  const [submitting, setSubmitting] = useState(false);
  const [messHallId, setMessHallId] = useState(null);
  const [redirectCountdown, setRedirectCountdown] = useState(null);
  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);
  const scheduleRedirect = useCallback((seconds = REDIRECT_DELAY_SECONDS) => {
    if (redirectedRef.current) return;
    setRedirectCountdown(seconds);
    countdownIntervalRef.current = setInterval(() => {
      setRedirectCountdown((s) => {
        const next = (s ?? 1) - 1;
        if (next <= 0) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
          }
          if (!redirectedRef.current) {
            redirectedRef.current = true;
            navigate("/rancho", {
              replace: true
            });
          }
          return null;
        }
        return next;
      });
    }, 1e3);
  }, [navigate]);
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const {
        data: authData,
        error: authErr
      } = await supabase.auth.getUser();
      if (authErr || !authData?.user) {
        if (!redirectedRef.current) {
          const redirectTo = buildRedirectTo(location.pathname, location.search);
          redirectedRef.current = true;
          navigate(`/login?redirectTo=${redirectTo}`, {
            replace: true
          });
        }
        return;
      }
      const userId = authData.user.id;
      if (!unidade) {
        toast.error("QR inválido", {
          description: "A unidade não foi informada."
        });
        return;
      }
      try {
        setUuid(userId);
        const {
          data: mh,
          error: mhError
        } = await supabase.schema("sisub").from("mess_halls").select("id").eq("code", unidade).maybeSingle();
        if (mhError) {
          console.error("Erro ao buscar mess_hall_id:", mhError);
          setSystemForecast(false);
          setWillEnter("sim");
          setMessHallId(null);
          return;
        }
        const id = mh?.id ?? null;
        if (!id) {
          console.warn(`Código de rancho não encontrado: ${unidade}`);
          setSystemForecast(false);
          setWillEnter("sim");
          setMessHallId(null);
          return;
        }
        setMessHallId(id);
        const {
          data: previsao,
          error
        } = await supabase.schema("sisub").from("meal_forecasts").select("will_eat").eq("user_id", userId).eq("date", date).eq("meal", meal).eq("mess_hall_id", id).maybeSingle();
        if (cancelled) return;
        if (error) {
          console.error("Erro ao buscar previsão:", error);
          toast.message("Não foi possível carregar a previsão. Seguindo sem ela.");
          setSystemForecast(false);
          setWillEnter("sim");
          return;
        }
        setSystemForecast(previsao ? !!previsao.will_eat : false);
        setWillEnter("sim");
      } catch (err) {
        if (cancelled) return;
        console.error("Erro inesperado ao preparar informações:", err);
        toast.error("Erro", {
          description: "Falha ao carregar informações."
        });
        setSystemForecast(false);
        setWillEnter("sim");
        setMessHallId(null);
        return;
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [date, meal, unidade, navigate, location.pathname, location.search]);
  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    if (!uuid) {
      toast.error("Usuário não carregado.");
      return;
    }
    setSubmitting(true);
    try {
      if (willEnter !== "sim") {
        toast.info("Decisão registrada", {
          description: "Você optou por não entrar para a refeição."
        });
        return;
      }
      let effectiveMessHallId = messHallId;
      if (!effectiveMessHallId) {
        const {
          data: mh,
          error: mhError
        } = await supabase.schema("sisub").from("mess_halls").select("id").eq("code", unidade).maybeSingle();
        if (mhError || !mh?.id) {
          toast.error("Rancho inválido", {
            description: "Código de rancho não encontrado."
          });
          return;
        }
        effectiveMessHallId = mh.id;
        setMessHallId(effectiveMessHallId);
      }
      const {
        error
      } = await supabase.schema("sisub").from("meal_presences").insert({
        user_id: uuid,
        date,
        meal,
        mess_hall_id: effectiveMessHallId
      });
      if (!error) {
        toast.success("Presença registrada", {
          description: `Bom apetite! Redirecionando em ${REDIRECT_DELAY_SECONDS}s...`
        });
        scheduleRedirect(REDIRECT_DELAY_SECONDS);
        return;
      }
      if (isDuplicateOrConflict(error)) {
        toast.info("Já registrado", {
          description: `Sua presença já está registrada para esta refeição. Redirecionando em ${REDIRECT_DELAY_SECONDS}s...`
        });
        scheduleRedirect(REDIRECT_DELAY_SECONDS);
        return;
      }
      console.error("Erro ao registrar presença:", error);
      toast.error("Erro", {
        description: "Não foi possível registrar sua presença."
      });
      return;
    } catch (err) {
      console.error("Falha inesperada no envio:", err);
      toast.error("Erro", {
        description: "Falha inesperada ao enviar a presença."
      });
      return;
    } finally {
      setSubmitting(false);
    }
  }, [uuid, willEnter, date, meal, unidade, submitting, scheduleRedirect, messHallId]);
  const goHome = useCallback(() => {
    if (redirectCountdown !== null) return;
    navigate("/rancho");
  }, [navigate, redirectCountdown]);
  return /* @__PURE__ */ jsxs("div", {
    className: "max-w-md mx-auto p-6 text-center space-y-6",
    children: [/* @__PURE__ */ jsx("h1", {
      className: "text-xl font-semibold",
      children: "Check-in de Refeição"
    }), /* @__PURE__ */ jsxs("p", {
      className: "text-sm text-muted-foreground",
      children: ["Unidade: ", /* @__PURE__ */ jsx("b", {
        children: unidade
      }), " • Data: ", /* @__PURE__ */ jsx("b", {
        children: date
      }), " • Refeição:", " ", /* @__PURE__ */ jsx("b", {
        children: meal
      })]
    }), /* @__PURE__ */ jsxs("div", {
      className: "rounded-md border p-4 text-left space-y-4",
      children: [/* @__PURE__ */ jsxs("div", {
        className: "space-y-2",
        children: [/* @__PURE__ */ jsx("div", {
          className: "text-sm font-medium",
          children: "Está na previsão?"
        }), /* @__PURE__ */ jsxs("div", {
          className: "flex gap-2",
          children: [/* @__PURE__ */ jsx(Button, {
            disabled: true,
            variant: systemForecast ? "default" : "outline",
            size: "sm",
            children: "Sim"
          }), /* @__PURE__ */ jsx(Button, {
            disabled: true,
            variant: !systemForecast ? "default" : "outline",
            size: "sm",
            children: "Não"
          })]
        }), uuid && /* @__PURE__ */ jsxs("div", {
          className: "text-xs text-muted-foreground mt-1",
          children: ["UUID: ", uuid]
        })]
      }), /* @__PURE__ */ jsxs("div", {
        className: "space-y-2",
        children: [/* @__PURE__ */ jsx("div", {
          className: "text-sm font-medium",
          children: "Vai entrar?"
        }), /* @__PURE__ */ jsxs("div", {
          className: "flex gap-2",
          children: [/* @__PURE__ */ jsx(Button, {
            variant: willEnter === "sim" ? "default" : "outline",
            size: "sm",
            onClick: () => setWillEnter("sim"),
            disabled: !uuid || submitting || redirectCountdown !== null,
            children: "Sim"
          }), /* @__PURE__ */ jsx(Button, {
            variant: willEnter === "nao" ? "default" : "outline",
            size: "sm",
            onClick: () => setWillEnter("nao"),
            disabled: !uuid || submitting || redirectCountdown !== null,
            children: "Não"
          })]
        })]
      })]
    }), /* @__PURE__ */ jsxs("div", {
      className: "flex flex-col items-center justify-center gap-2",
      children: [/* @__PURE__ */ jsxs("div", {
        className: "flex items-center justify-center gap-3",
        children: [/* @__PURE__ */ jsx(Button, {
          onClick: handleSubmit,
          disabled: !uuid || submitting || redirectCountdown !== null,
          children: submitting ? "Enviando..." : "Enviar"
        }), /* @__PURE__ */ jsx(Button, {
          variant: "outline",
          onClick: goHome,
          disabled: submitting || redirectCountdown !== null,
          children: "Voltar"
        })]
      }), redirectCountdown !== null && /* @__PURE__ */ jsxs("div", {
        className: "text-xs text-muted-foreground",
        children: ["Redirecionando para o rancho em ", redirectCountdown, "s..."]
      })]
    })]
  });
});
const route13 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: selfCheckIn
}, Symbol.toStringTag, { value: "Module" }));
const MEAL_LABEL = {
  cafe: "Café",
  almoco: "Almoço",
  janta: "Jantar",
  ceia: "Ceia"
};
const generateRestrictedDates = () => {
  const today = /* @__PURE__ */ new Date();
  const dates = [];
  for (const offset of [-1, 0, 1]) {
    const d = new Date(today);
    d.setDate(today.getDate() + offset);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
};
function Filters({
  selectedDate,
  setSelectedDate,
  selectedMeal,
  setSelectedMeal,
  selectedUnit,
  setSelectedUnit,
  dates
}) {
  const baseTrigger = "w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("div", { className: "flex-1", children: (() => {
      const isValidDate = !selectedDate || dates.includes(selectedDate);
      const disabled = false;
      const isInvalid = Boolean(selectedDate && !isValidDate);
      const labelCls = `text-sm font-medium flex items-center justify-between ${"text-foreground"}`;
      return /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
        /* @__PURE__ */ jsxs(Label, { className: labelCls, children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center space-x-1", children: [
            /* @__PURE__ */ jsx(Calendar, { className: "h-4 w-4" }),
            /* @__PURE__ */ jsx("span", { children: "Dia:" })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "flex items-center space-x-2", children: isInvalid && /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx(Badge, { variant: "destructive", className: "text-xs", children: "Inválido" }),
            /* @__PURE__ */ jsx(AlertCircle, { className: "h-4 w-4 text-destructive" })
          ] }) })
        ] }),
        /* @__PURE__ */ jsxs(
          Select,
          {
            value: selectedDate,
            onValueChange: (v) => setSelectedDate(v),
            disabled,
            children: [
              /* @__PURE__ */ jsx(
                SelectTrigger,
                {
                  className: `${baseTrigger} ${isInvalid ? "border-destructive/50 bg-destructive/10" : ""}`,
                  "aria-invalid": isInvalid,
                  children: /* @__PURE__ */ jsx(SelectValue, { placeholder: "Selecione o dia", children: selectedDate && /* @__PURE__ */ jsx("div", { className: "flex items-center space-x-2", children: /* @__PURE__ */ jsx("span", { children: formatDate(selectedDate) }) }) })
                }
              ),
              /* @__PURE__ */ jsxs(SelectContent, { className: "max-h-60", children: [
                /* @__PURE__ */ jsx("div", { className: "p-2 text-xs text-muted-foreground border-b border-border", children: "Selecione o dia do cardápio" }),
                dates.map((d) => {
                  const selected = d === selectedDate;
                  return /* @__PURE__ */ jsx(
                    SelectItem,
                    {
                      className: "cursor-pointer hover:bg-accent/50 focus:bg-accent/50 transition-colors",
                      value: d,
                      children: /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between w-full", children: [
                        /* @__PURE__ */ jsx("span", { children: formatDate(d) }),
                        selected && /* @__PURE__ */ jsx(Check, { className: "h-4 w-4 text-primary ml-2" })
                      ] })
                    },
                    d
                  );
                })
              ] })
            ]
          }
        ),
        isInvalid && /* @__PURE__ */ jsxs("div", { className: "text-xs text-destructive flex items-center space-x-1", children: [
          /* @__PURE__ */ jsx(AlertCircle, { className: "h-3 w-3" }),
          /* @__PURE__ */ jsx("span", { children: "Data inválida selecionada" })
        ] })
      ] });
    })() }),
    /* @__PURE__ */ jsx("div", { className: "flex-1", children: (() => {
      const mealKeys = Object.keys(MEAL_LABEL);
      const isValidMeal = !selectedMeal || mealKeys.includes(selectedMeal);
      const disabled = false;
      const isInvalid = Boolean(selectedMeal && !isValidMeal);
      const labelCls = `text-sm font-medium flex items-center justify-between ${"text-foreground"}`;
      return /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
        /* @__PURE__ */ jsxs(Label, { className: labelCls, children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center space-x-1", children: [
            /* @__PURE__ */ jsx(Utensils, { className: "h-4 w-4" }),
            /* @__PURE__ */ jsx("span", { children: "Refeição:" })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "flex items-center space-x-2", children: isInvalid && /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx(Badge, { variant: "destructive", className: "text-xs", children: "Inválida" }),
            /* @__PURE__ */ jsx(AlertCircle, { className: "h-4 w-4 text-destructive" })
          ] }) })
        ] }),
        /* @__PURE__ */ jsxs(
          Select,
          {
            value: selectedMeal,
            onValueChange: (v) => setSelectedMeal(v),
            disabled,
            children: [
              /* @__PURE__ */ jsx(
                SelectTrigger,
                {
                  className: `${baseTrigger} ${isInvalid ? "border-destructive/50 bg-destructive/10" : ""}`,
                  "aria-invalid": isInvalid,
                  children: /* @__PURE__ */ jsx(SelectValue, { placeholder: "Selecione a refeição", children: selectedMeal && /* @__PURE__ */ jsx("div", { className: "flex items-center space-x-2", children: /* @__PURE__ */ jsx("span", { children: MEAL_LABEL[selectedMeal] }) }) })
                }
              ),
              /* @__PURE__ */ jsxs(SelectContent, { className: "max-h-60", children: [
                /* @__PURE__ */ jsx("div", { className: "p-2 text-xs text-muted-foreground border-b border-border", children: "Selecione o tipo de refeição" }),
                mealKeys.map((k) => {
                  const selected = k === selectedMeal;
                  return /* @__PURE__ */ jsx(
                    SelectItem,
                    {
                      className: "cursor-pointer hover:bg-accent/50 focus:bg-accent/50 transition-colors",
                      value: k,
                      children: /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between w-full", children: [
                        /* @__PURE__ */ jsx("span", { children: MEAL_LABEL[k] }),
                        selected && /* @__PURE__ */ jsx(Check, { className: "h-4 w-4 text-primary ml-2" })
                      ] })
                    },
                    k
                  );
                })
              ] })
            ]
          }
        ),
        isInvalid && /* @__PURE__ */ jsxs("div", { className: "text-xs text-destructive flex items-center space-x-1", children: [
          /* @__PURE__ */ jsx(AlertCircle, { className: "h-3 w-3" }),
          /* @__PURE__ */ jsx("span", { children: "Refeição inválida selecionada" })
        ] })
      ] });
    })() }),
    /* @__PURE__ */ jsx("div", { className: "flex-1", children: /* @__PURE__ */ jsx("div", { className: "flex items-center gap-2", children: /* @__PURE__ */ jsx("div", { className: "w-full sm:w-64", children: /* @__PURE__ */ jsx(
      UnitSelector,
      {
        value: selectedUnit,
        onChange: setSelectedUnit,
        placeholder: "Selecione a OM..."
      }
    ) }) }) })
  ] });
}
const nameCache = /* @__PURE__ */ new Map();
function FiscalDialog({
  setDialog,
  dialog,
  confirmDialog,
  selectedUnit,
  resolveDisplayName: resolveDisplayName2
}) {
  const forecastIsYes = !!dialog.systemForecast;
  const forecastIsNo = !dialog.systemForecast;
  const [displayName, setDisplayName] = useState(null);
  const [loadingName, setLoadingName] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const id = dialog.uuid?.trim();
    if (!id || !resolveDisplayName2) {
      setDisplayName(null);
      return;
    }
    if (nameCache.has(id)) {
      setDisplayName(nameCache.get(id) ?? null);
      return;
    }
    setLoadingName(true);
    resolveDisplayName2(id).then((name) => {
      if (cancelled) return;
      const normalized = name?.trim() || null;
      if (normalized) {
        nameCache.set(id, normalized);
      }
      setDisplayName(normalized);
    }).catch(() => {
      if (!cancelled) return;
    }).finally(() => {
      if (!cancelled) setLoadingName(false);
    });
    return () => {
      cancelled = true;
    };
  }, [dialog.uuid, resolveDisplayName2]);
  const personLine = loadingName ? "Carregando..." : displayName || dialog.uuid || "—";
  return /* @__PURE__ */ jsx(Fragment, { children: /* @__PURE__ */ jsx(
    AlertDialog,
    {
      open: dialog.open,
      onOpenChange: (open) => setDialog((d) => ({ ...d, open })),
      children: /* @__PURE__ */ jsxs(AlertDialogContent, { children: [
        /* @__PURE__ */ jsxs(AlertDialogHeader, { children: [
          /* @__PURE__ */ jsx(AlertDialogTitle, { children: "Confirmar entrada do militar" }),
          /* @__PURE__ */ jsxs(AlertDialogDescription, { children: [
            "Pessoa: ",
            personLine,
            /* @__PURE__ */ jsx("br", {}),
            "Previsão do sistema:",
            " ",
            dialog.systemForecast === null ? "Não encontrado" : dialog.systemForecast ? "Previsto" : "Não previsto"
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
          /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsx("div", { className: "text-sm font-medium", children: "Está na previsão?" }),
            /* @__PURE__ */ jsxs(
              "div",
              {
                className: "flex gap-2",
                role: "group",
                "aria-label": "Está na previsão",
                children: [
                  /* @__PURE__ */ jsx(
                    Button,
                    {
                      disabled: true,
                      variant: forecastIsYes ? "default" : "outline",
                      size: "sm",
                      "aria-pressed": forecastIsYes,
                      children: "Sim"
                    }
                  ),
                  /* @__PURE__ */ jsx(
                    Button,
                    {
                      disabled: true,
                      variant: forecastIsNo ? "default" : "outline",
                      size: "sm",
                      "aria-pressed": forecastIsNo,
                      children: "Não"
                    }
                  )
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsx("div", { className: "text-sm font-medium", children: "Vai entrar?" }),
            /* @__PURE__ */ jsxs("div", { className: "flex gap-2", role: "group", "aria-label": "Vai entrar", children: [
              /* @__PURE__ */ jsx(
                Button,
                {
                  variant: dialog.willEnter === "sim" ? "default" : "outline",
                  size: "sm",
                  "aria-pressed": dialog.willEnter === "sim",
                  onClick: () => setDialog((d) => ({ ...d, willEnter: "sim" })),
                  children: "Sim"
                }
              ),
              /* @__PURE__ */ jsx(
                Button,
                {
                  variant: dialog.willEnter === "nao" ? "destructive" : "outline",
                  size: "sm",
                  "aria-pressed": dialog.willEnter === "nao",
                  onClick: () => setDialog((d) => ({ ...d, willEnter: "nao" })),
                  children: "Não"
                }
              )
            ] })
          ] }),
          selectedUnit && /* @__PURE__ */ jsxs("div", { className: "text-xs text-muted-foreground", children: [
            "Rancho selecionado: ",
            selectedUnit
          ] })
        ] }),
        /* @__PURE__ */ jsxs(AlertDialogFooter, { children: [
          /* @__PURE__ */ jsx(
            AlertDialogCancel,
            {
              onClick: () => setDialog((d) => ({ ...d, open: false })),
              children: "Cancelar"
            }
          ),
          /* @__PURE__ */ jsx(AlertDialogAction, { onClick: confirmDialog, children: "Confirmar" })
        ] })
      ] })
    }
  ) });
}
function PresenceTable({
  selectedDate,
  selectedMeal,
  presences,
  forecastMap,
  actions
}) {
  return /* @__PURE__ */ jsx(Fragment, { children: /* @__PURE__ */ jsxs("div", { className: "rounded-xl border bg-card text-card-foreground shadow-sm", children: [
    /* @__PURE__ */ jsxs("div", { className: "px-4 py-3 border-b border-border flex items-center justify-between bg-muted/50", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h3", { className: "font-semibold", children: "Presenças registradas" }),
        /* @__PURE__ */ jsxs("p", { className: "text-sm text-muted-foreground", children: [
          "Dia ",
          formatDate(selectedDate),
          " · ",
          MEAL_LABEL[selectedMeal]
        ] })
      ] }),
      /* @__PURE__ */ jsx(Badge, { variant: "secondary", children: presences.length })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxs(Table, { children: [
      /* @__PURE__ */ jsx(TableHeader, { className: "bg-muted/50", children: /* @__PURE__ */ jsxs(TableRow, { children: [
        /* @__PURE__ */ jsx(TableHead, { className: "text-muted-foreground", children: "Pessoa" }),
        /* @__PURE__ */ jsx(TableHead, { className: "text-muted-foreground", children: "Data" }),
        /* @__PURE__ */ jsx(TableHead, { className: "text-muted-foreground", children: "Refeição" }),
        /* @__PURE__ */ jsx(TableHead, { className: "text-muted-foreground", children: "Previsão" }),
        /* @__PURE__ */ jsx(TableHead, { className: "text-muted-foreground", children: "Registrado em" }),
        /* @__PURE__ */ jsx(TableHead, { className: "text-right text-muted-foreground", children: "Ações" })
      ] }) }),
      /* @__PURE__ */ jsx(TableBody, { children: presences.length === 0 ? /* @__PURE__ */ jsx(TableRow, { children: /* @__PURE__ */ jsx(
        TableCell,
        {
          colSpan: 6,
          className: "h-24 text-center text-muted-foreground",
          children: "Nenhuma presença registrada ainda."
        }
      ) }) : presences.map((row) => {
        const uiRow = row;
        const saidWouldAttend = forecastMap[row.user_id] ?? false;
        const name = uiRow.display_name?.trim() || row.user_id;
        return /* @__PURE__ */ jsxs(TableRow, { className: "hover:bg-accent/50", children: [
          /* @__PURE__ */ jsx(TableCell, { children: /* @__PURE__ */ jsxs("div", { className: "flex flex-col", children: [
            /* @__PURE__ */ jsx("span", { className: "font-medium", children: name }),
            /* @__PURE__ */ jsx("span", { className: "font-mono text-xs text-muted-foreground", children: row.user_id })
          ] }) }),
          /* @__PURE__ */ jsx(TableCell, { children: formatDate(row.date) }),
          /* @__PURE__ */ jsx(TableCell, { children: MEAL_LABEL[row.meal] }),
          /* @__PURE__ */ jsx(TableCell, { children: saidWouldAttend ? /* @__PURE__ */ jsx(Badge, { variant: "default", children: "Sim" }) : /* @__PURE__ */ jsx(Badge, { variant: "outline", children: "Não" }) }),
          /* @__PURE__ */ jsx(TableCell, { children: new Date(row.created_at).toLocaleString("pt-BR") }),
          /* @__PURE__ */ jsx(TableCell, { className: "text-right", children: /* @__PURE__ */ jsx(
            Button,
            {
              variant: "ghost",
              size: "icon",
              className: "text-destructive hover:bg-destructive/10",
              onClick: () => actions.removePresence(row),
              "aria-label": "Remover presença",
              children: /* @__PURE__ */ jsx(Trash2, { className: "h-4 w-4" })
            }
          ) })
        ] }, row.id);
      }) })
    ] }) })
  ] }) });
}
class UnitRequiredError extends Error {
  constructor() {
    super("unit_required");
    this.name = "UnitRequiredError";
  }
}
const isPostgrestError = (e) => {
  return typeof e === "object" && e !== null && "code" in e && typeof e.code === "string";
};
const presenceKeys = {
  all: ["presences"],
  list: (date, meal, unit) => [...presenceKeys.all, date, meal, unit],
  confirm: (date, meal, unit) => ["confirmPresence", date, meal, unit],
  remove: (date, meal, unit) => ["removePresence", date, meal, unit]
};
const messHallIdCache = /* @__PURE__ */ new Map();
async function getMessHallIdByCode(code) {
  if (!code) return void 0;
  const cached = messHallIdCache.get(code);
  if (cached) return cached;
  const { data, error } = await supabase.schema("sisub").from("mess_halls").select("id").eq("code", code).maybeSingle();
  if (error) {
    console.warn("Falha ao buscar mess_hall_id:", error);
    return void 0;
  }
  const id = data?.id;
  if (id) messHallIdCache.set(code, id);
  return id;
}
const fetchPresences = async (filters) => {
  if (!filters.unit) return [];
  const messHallId = await getMessHallIdByCode(filters.unit);
  if (!messHallId) {
    console.warn(`Código de rancho não encontrado: ${filters.unit}`);
    return [];
  }
  const { data, error } = await supabase.from("v_meal_presences_with_user").select("id, user_id, date, meal, created_at, mess_hall_id, display_name").eq("date", filters.date).eq("meal", filters.meal).eq("mess_hall_id", messHallId).order("created_at", { ascending: false }).returns();
  if (error) {
    console.error("Erro ao buscar presenças:", error);
    toast.error("Erro", {
      description: "Não foi possível carregar as presenças."
    });
    throw error;
  }
  const rows = data ?? [];
  const mapped = rows.map((r) => {
    const base = {
      id: r.id,
      user_id: r.user_id,
      date: r.date,
      meal: r.meal,
      created_at: r.created_at,
      unidade: filters.unit
    };
    return Object.assign(base, { display_name: r.display_name ?? null });
  });
  return mapped;
};
const fetchForecasts = async (filters, userIds) => {
  if (userIds.length === 0) return {};
  if (!filters.unit) return {};
  const messHallId = await getMessHallIdByCode(filters.unit);
  if (!messHallId) {
    console.warn(`Código de rancho não encontrado: ${filters.unit}`);
    return {};
  }
  const { data, error } = await supabase.schema("sisub").from("meal_forecasts").select("user_id, will_eat").eq("date", filters.date).eq("meal", filters.meal).eq("mess_hall_id", messHallId).in("user_id", userIds).returns();
  if (error) {
    console.warn("Falha ao buscar previsões:", error);
    return {};
  }
  const forecastMap = {};
  (data ?? []).forEach((row) => {
    forecastMap[row.user_id] = Boolean(row.will_eat);
  });
  return forecastMap;
};
const insertPresence = async (params, filters) => {
  if (!filters.unit) {
    throw new UnitRequiredError();
  }
  const messHallId = await getMessHallIdByCode(filters.unit);
  if (!messHallId) {
    throw new UnitRequiredError();
  }
  const { error } = await supabase.schema("sisub").from("meal_presences").insert({
    user_id: params.uuid,
    date: filters.date,
    meal: filters.meal,
    mess_hall_id: messHallId
  });
  if (error) {
    throw error;
  }
};
const deletePresence = async (presenceId) => {
  const { error } = await supabase.schema("sisub").from("meal_presences").delete().eq("id", presenceId);
  if (error) {
    throw error;
  }
};
const isValidFilters = (filters) => {
  return Boolean(filters.date && filters.meal && filters.unit);
};
const handleConfirmPresenceError = (error) => {
  if (error instanceof UnitRequiredError) {
    toast.error("Selecione o rancho", {
      description: "É necessário informar a unidade (rancho)."
    });
    return;
  }
  if (isPostgrestError(error) && error.code === "23505") {
    toast.info("Já registrado", {
      description: "Este militar já foi marcado presente."
    });
    return;
  }
  console.error("Falha ao salvar decisão:", error);
  toast.error("Erro", {
    description: "Falha ao salvar decisão."
  });
};
const handleRemovePresenceError = (error) => {
  console.error("Não foi possível excluir:", error);
  toast.error("Erro", {
    description: "Não foi possível excluir."
  });
};
function usePresenceManagement(filters) {
  const queryClient2 = useQueryClient();
  const isValid = isValidFilters(filters);
  const presencesQuery = useQuery({
    queryKey: presenceKeys.list(filters.date, filters.meal, filters.unit),
    queryFn: async () => {
      const presences = await fetchPresences(filters);
      const userIds = Array.from(new Set(presences.map((p) => p.user_id)));
      const forecastMap = await fetchForecasts(filters, userIds);
      return { presences, forecastMap };
    },
    enabled: isValid,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 1,
    staleTime: 2 * 60 * 1e3,
    // 2 minutos
    gcTime: 5 * 60 * 1e3,
    // 5 minutos
    placeholderData: { presences: [], forecastMap: {} }
  });
  const confirmPresenceMutation = useMutation({
    mutationKey: presenceKeys.confirm(filters.date, filters.meal, filters.unit),
    mutationFn: async (params) => {
      if (!params.willEnter) {
        toast.info("Registro atualizado", {
          description: "Decisão registrada. Militar não entrará para a refeição."
        });
        return { skipped: true };
      }
      await insertPresence(params, filters);
      toast.success("Presença registrada", {
        description: `UUID ${params.uuid} marcado.`
      });
      return { skipped: false };
    },
    onSuccess: () => {
      queryClient2.invalidateQueries({
        queryKey: presenceKeys.list(filters.date, filters.meal, filters.unit)
      });
    },
    onError: handleConfirmPresenceError
  });
  const removePresenceMutation = useMutation({
    mutationKey: presenceKeys.remove(filters.date, filters.meal, filters.unit),
    mutationFn: async (row) => {
      await deletePresence(row.id);
      toast.success("Excluído", {
        description: "Registro removido."
      });
    },
    onSuccess: () => {
      queryClient2.invalidateQueries({
        queryKey: presenceKeys.list(filters.date, filters.meal, filters.unit)
      });
    },
    onError: handleRemovePresenceError
  });
  const confirmPresence = useCallback(
    async (uuid, willEnter) => {
      return await confirmPresenceMutation.mutateAsync({ uuid, willEnter });
    },
    [confirmPresenceMutation]
  );
  const removePresence = useCallback(
    async (row) => {
      await removePresenceMutation.mutateAsync(row);
    },
    [removePresenceMutation]
  );
  return {
    presences: presencesQuery.data?.presences ?? [],
    forecastMap: presencesQuery.data?.forecastMap ?? {},
    isLoading: presencesQuery.isLoading || presencesQuery.isFetching,
    isConfirming: confirmPresenceMutation.isPending,
    isRemoving: removePresenceMutation.isPending,
    confirmPresence,
    removePresence
  };
}
const displayNameCache = /* @__PURE__ */ new Map();
async function resolveDisplayName(userId) {
  if (!userId) return null;
  const cached = displayNameCache.get(userId);
  if (cached) return cached;
  const {
    data,
    error
  } = await supabase.schema("sisub").from("v_user_identity").select("display_name").eq("id", userId).maybeSingle();
  if (error) {
    console.warn("Falha ao buscar display_name:", error);
    return null;
  }
  const name = data?.display_name?.trim() || null;
  if (name) displayNameCache.set(userId, name);
  return name;
}
const UUID_REGEX = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
function extractUuid(payload) {
  if (!payload) return null;
  const match = payload.match(UUID_REGEX);
  return match ? match[0].toLowerCase() : null;
}
function meta$2() {
  return [{
    title: "Fiscalização - Leitor de QR"
  }, {
    name: "description",
    content: "Fiscalize a refeição escaneando o QR do militar"
  }];
}
function inferDefaultMeal(now = /* @__PURE__ */ new Date()) {
  const toMin = (h, m = 0) => h * 60 + m;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const inRange = (start, end) => minutes >= start && minutes < end;
  if (inRange(toMin(4), toMin(9))) return "cafe";
  if (inRange(toMin(9), toMin(15))) return "almoco";
  if (inRange(toMin(15), toMin(20))) return "janta";
  return "ceia";
}
const scannerReducer = (state, action) => {
  switch (action.type) {
    case "INITIALIZE_SUCCESS":
      return {
        ...state,
        isReady: true,
        isScanning: action.hasPermission,
        hasPermission: action.hasPermission,
        error: void 0
      };
    case "INITIALIZE_ERROR":
      return {
        ...state,
        isReady: true,
        isScanning: false,
        hasPermission: false,
        error: action.error
      };
    case "TOGGLE_SCAN":
      return {
        ...state,
        isScanning: action.isScanning
      };
    case "REFRESH":
      return {
        ...state,
        isScanning: state.hasPermission,
        error: void 0
      };
    default:
      return state;
  }
};
const presence = UNSAFE_withComponentProps(function Qr() {
  const scannerRef = useRef(null);
  const videoRef = useRef(null);
  const qrBoxRef = useRef(null);
  const [autoCloseDialog, setAutoCloseDialog] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const dates = useMemo(() => generateRestrictedDates(), []);
  const defaultMeal = useMemo(() => inferDefaultMeal(), []);
  const [isAddingOther, setIsAddingOther] = useState(false);
  const {
    user
  } = useAuth();
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
    return /* @__PURE__ */ jsx(Navigate, {
      to: "/rancho",
      replace: true
    });
  }
  const [filters, setFilters] = useState({
    date: dates[1],
    meal: defaultMeal,
    unit: "DIRAD - DIRAD"
  });
  const COOLDOWN_MS = 800;
  const MAX_CACHE = 300;
  const lastScanAtRef = useRef(0);
  const recentlyScannedRef = useRef(/* @__PURE__ */ new Set());
  const scannedQueueRef = useRef([]);
  const markScanned = (uuid) => {
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
  const initialState2 = {
    isReady: false,
    isScanning: false,
    hasPermission: false
  };
  const [scannerState, dispatch] = useReducer(scannerReducer, initialState2);
  const [lastScanResult, setLastScanResult] = useState("");
  const currentFiltersRef = useRef(filters);
  useEffect(() => {
    currentFiltersRef.current = filters;
  }, [filters]);
  const [dialog, setDialog] = useState({
    open: false,
    uuid: null,
    systemForecast: null,
    willEnter: "sim"
  });
  const messHallIdCacheRef = useRef(/* @__PURE__ */ new Map());
  const getMessHallIdByCode2 = useCallback(async (code) => {
    if (!code) return void 0;
    const cached = messHallIdCacheRef.current.get(code);
    if (cached) return cached;
    const {
      data,
      error
    } = await supabase.schema("sisub").from("mess_halls").select("id").eq("code", code).maybeSingle();
    if (error) {
      console.warn("Falha ao buscar mess_hall_id:", error);
      return void 0;
    }
    const id = data?.id;
    if (id) messHallIdCacheRef.current.set(code, id);
    return id;
  }, []);
  const [othersCount, setOthersCount] = useState(0);
  const loadOthersCount = useCallback(async () => {
    const {
      date,
      meal,
      unit
    } = currentFiltersRef.current;
    if (!date || !meal || !unit) return;
    const messHallId = await getMessHallIdByCode2(unit);
    if (!messHallId) {
      setOthersCount(0);
      return;
    }
    const {
      error,
      count
    } = await supabase.schema("sisub").from("other_presences").select("*", {
      count: "exact",
      head: true
    }).eq("date", date).eq("meal", meal).eq("mess_hall_id", messHallId);
    if (!error) setOthersCount(count ?? 0);
  }, [getMessHallIdByCode2]);
  const addOtherPresence = useCallback(async () => {
    if (!user?.id) {
      toast.error("Erro", {
        description: "Usuário não autenticado."
      });
      return;
    }
    const {
      date,
      meal,
      unit
    } = currentFiltersRef.current;
    if (!date || !meal || !unit) {
      toast.error("Filtros incompletos", {
        description: "Selecione data, refeição e unidade."
      });
      return;
    }
    setIsAddingOther(true);
    try {
      const messHallId = await getMessHallIdByCode2(unit);
      if (!messHallId) {
        toast.error("Unidade inválida", {
          description: "Não foi possível mapear o código de rancho para o ID. Verifique a unidade selecionada."
        });
        return;
      }
      const {
        error
      } = await supabase.schema("sisub").from("other_presences").insert({
        admin_id: user.id,
        date,
        meal,
        mess_hall_id: messHallId
      });
      if (error) throw error;
      toast.success("Outro registrado", {
        description: "Entrada sem cadastro adicionada com sucesso."
      });
    } catch (err) {
      console.error("Erro ao registrar Outros:", err);
      toast.error("Erro", {
        description: "Não foi possível registrar a entrada."
      });
    } finally {
      await loadOthersCount();
      setIsAddingOther(false);
    }
  }, [user?.id, getMessHallIdByCode2, loadOthersCount]);
  useEffect(() => {
    loadOthersCount();
  }, [filters.date, filters.meal, filters.unit, loadOthersCount]);
  const {
    presences,
    forecastMap,
    confirmPresence,
    removePresence
  } = usePresenceManagement(filters);
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
              error: "Permissão da câmera não concedida."
            });
          }
          return;
        }
        const scanner = new QrScanner(videoRef.current, (result) => onScanSuccess(result), {
          onDecodeError: onScanFail,
          preferredCamera: "environment",
          highlightScanRegion: true,
          highlightCodeOutline: true,
          overlay: qrBoxRef.current ?? void 0
        });
        scannerRef.current = scanner;
        await scanner.start();
        if (!isCancelled) {
          dispatch({
            type: "INITIALIZE_SUCCESS",
            hasPermission: true
          });
        }
      } catch (err) {
        console.error("Erro ao iniciar o scanner:", err);
        if (!isCancelled) {
          dispatch({
            type: "INITIALIZE_ERROR",
            error: String(err?.message ?? "Erro desconhecido ao iniciar a câmera.")
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
  const onScanSuccess = async (result) => {
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
    } catch {
    }
    const {
      date,
      meal,
      unit
    } = currentFiltersRef.current;
    try {
      let systemForecast = null;
      const messHallId = await getMessHallIdByCode2(unit);
      if (messHallId) {
        const {
          data: forecast,
          error: fErr
        } = await supabase.schema("sisub").from("meal_forecasts").select("will_eat").eq("user_id", uuid).eq("date", date).eq("meal", meal).eq("mess_hall_id", messHallId).maybeSingle();
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
        willEnter: "sim"
      });
      markScanned(uuid);
    } catch (err) {
      console.error("Erro ao preparar diálogo:", err);
      toast.error("Erro", {
        description: "Falha ao processar QR."
      });
    } finally {
      setIsProcessing(false);
    }
  };
  const onScanFail = (err) => {
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
      setDialog((d) => ({
        ...d,
        open: false,
        uuid: null
      }));
    }
  }, [dialog.uuid, dialog.willEnter, confirmPresence]);
  const toggleScan = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    try {
      if (scannerState.isScanning) {
        await scanner.stop();
        dispatch({
          type: "TOGGLE_SCAN",
          isScanning: false
        });
      } else {
        await scanner.start();
        dispatch({
          type: "TOGGLE_SCAN",
          isScanning: true
        });
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
    } catch {
    }
    try {
      await scanner.start();
      dispatch({
        type: "REFRESH"
      });
    } catch (err) {
      console.error("Erro no refresh do scanner:", err);
    }
  }, []);
  useEffect(() => {
    if (!dialog.open || !autoCloseDialog || !dialog.uuid) return;
    const timerId = setTimeout(() => {
      handleConfirmDialog();
    }, 3e3);
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
  const actions = useMemo(() => ({
    toggleScan,
    refresh,
    clearResult,
    removePresence
  }), [toggleScan, refresh, clearResult, removePresence]);
  return /* @__PURE__ */ jsxs("div", {
    className: "pt-10 space-y-6 min-h-screen container mx-auto max-w-screen-2xl px-4",
    children: [/* @__PURE__ */ jsxs("div", {
      className: "flex flex-col sm:flex-row items-stretch sm:items-end gap-3",
      children: [/* @__PURE__ */ jsx(Filters, {
        selectedDate: filters.date,
        setSelectedDate: (newDate) => setFilters((f) => ({
          ...f,
          date: newDate
        })),
        selectedMeal: filters.meal,
        setSelectedMeal: (newMeal) => setFilters((f) => ({
          ...f,
          meal: newMeal
        })),
        selectedUnit: filters.unit,
        setSelectedUnit: (newUnit) => setFilters((f) => ({
          ...f,
          unit: newUnit
        })),
        dates
      }), /* @__PURE__ */ jsxs("div", {
        className: "w-full sm:w-auto flex flex-wrap items-center gap-2 sm:justify-end",
        children: [/* @__PURE__ */ jsxs("div", {
          className: "flex items-center gap-2 shrink-0",
          children: [/* @__PURE__ */ jsx(Switch, {
            id: "autoClose",
            checked: autoCloseDialog,
            onCheckedChange: setAutoCloseDialog
          }), /* @__PURE__ */ jsx(Label, {
            htmlFor: "autoClose",
            className: "whitespace-nowrap",
            children: autoCloseDialog ? "Fechar Auto." : "Fechar Manual"
          })]
        }), /* @__PURE__ */ jsxs(Button, {
          variant: "outline",
          size: "sm",
          onClick: actions.toggleScan,
          disabled: !scannerState.hasPermission,
          className: "shrink-0",
          children: [/* @__PURE__ */ jsx(Camera, {
            className: "h-4 w-4 mr-2"
          }), scannerState.isScanning ? "Pausar" : "Ler"]
        }), /* @__PURE__ */ jsx(Button, {
          variant: "outline",
          size: "sm",
          onClick: actions.refresh,
          disabled: !scannerState.hasPermission,
          className: "shrink-0",
          children: /* @__PURE__ */ jsx(RefreshCw, {
            className: `h-4 w-4 ${scannerState.isScanning ? "animate-spin" : ""}`
          })
        }), lastScanResult && /* @__PURE__ */ jsx(Button, {
          variant: "secondary",
          size: "sm",
          onClick: actions.clearResult,
          className: "shrink-0",
          children: "Limpar"
        }), /* @__PURE__ */ jsxs(Button, {
          variant: "default",
          size: "sm",
          onClick: addOtherPresence,
          disabled: isAddingOther,
          className: "shrink-0",
          children: [/* @__PURE__ */ jsx(UserPlus, {
            className: "h-4 w-4 mr-2"
          }), "Outros ", othersCount ? `(${othersCount})` : ""]
        })]
      })]
    }), /* @__PURE__ */ jsxs("div", {
      className: "qr-reader relative rounded-xl border border-border bg-card text-card-foreground p-3",
      children: [/* @__PURE__ */ jsx("video", {
        ref: videoRef,
        className: "rounded-md w-full max-h-[60vh] object-cover"
      }), !scannerState.hasPermission && scannerState.isReady && /* @__PURE__ */ jsx("div", {
        className: "mt-3 text-center p-4 border border-border rounded-md bg-destructive/10 text-destructive text-sm",
        children: /* @__PURE__ */ jsx("p", {
          children: scannerState.error || "Acesso à câmera negado."
        })
      }), /* @__PURE__ */ jsx("div", {
        ref: qrBoxRef,
        className: "qr-box pointer-events-none"
      }), lastScanResult && /* @__PURE__ */ jsxs("p", {
        className: "absolute top-2 left-2 z-50 rounded px-2 py-1 bg-accent/90 text-accent-foreground text-xs shadow",
        children: ["Último UUID: ", lastScanResult]
      })]
    }), /* @__PURE__ */ jsx(PresenceTable, {
      selectedDate: filters.date,
      selectedMeal: filters.meal,
      presences,
      forecastMap,
      actions
    }), /* @__PURE__ */ jsx(FiscalDialog, {
      setDialog,
      dialog,
      confirmDialog: handleConfirmDialog,
      selectedUnit: filters.unit,
      resolveDisplayName
    })]
  });
});
const route14 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: presence,
  inferDefaultMeal,
  meta: meta$2
}, Symbol.toStringTag, { value: "Module" }));
function AdminHero({ error }) {
  return /* @__PURE__ */ jsxs("div", { className: "text-center", children: [
    /* @__PURE__ */ jsxs("div", { className: "inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm border mb-3", children: [
      /* @__PURE__ */ jsx(Shield, {}),
      "Painel Administrativo"
    ] }),
    /* @__PURE__ */ jsx("h1", { className: "text-3xl md:text-4xl font-boldmb-3", children: "Controles da sua OM" }),
    /* @__PURE__ */ jsx("p", { className: "max-w-2xl mx-auto", children: "Gere o QR de auto check-in e acompanhe indicadores da unidade em tempo real." }),
    error && /* @__PURE__ */ jsxs(
      "div",
      {
        className: "mt-4 inline-flex items-center gap-2 rounded-lg border px-4 py-2",
        role: "alert",
        children: [
          /* @__PURE__ */ jsx(AlertCircle, { className: "h-4 w-4", "aria-hidden": "true" }),
          /* @__PURE__ */ jsx("span", { children: error })
        ]
      }
    )
  ] });
}
function IndicatorsCard$1() {
  const [expanded, setExpanded] = useState(false);
  const frameHeight = useMemo(() => "clamp(520px, 78vh, 1000px)", []);
  const toggleExpanded = () => setExpanded((e) => !e);
  const powerBiUrl = "https://app.powerbi.com/view?r=eyJrIjoiOTMwNzQxODYtMjc0OS00Y2U2LThjMWItMTU5MGZkZjk2ZmE3IiwidCI6IjNhMzY0ZGI2LTg2NmEtNDRkOS1iMzY5LWM1ODk1OWQ0NDhmOCJ9";
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: ` rounded-2xl border shadow-sm ${expanded ? "p-0" : "p-6"}`,
      children: [
        /* @__PURE__ */ jsxs(
          "div",
          {
            className: `${expanded ? "px-4 py-3" : "mb-4"} flex items-center justify-between`,
            children: [
              /* @__PURE__ */ jsxs("div", { className: "inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs border", children: [
                /* @__PURE__ */ jsx(BarChart3, { className: "h-4 w-4", "aria-hidden": "true" }),
                "Indicadores"
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsxs(
                  "button",
                  {
                    onClick: () => window.open(powerBiUrl, "_blank", "noopener,noreferrer"),
                    className: "inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border hover:bg-gray-50",
                    "aria-label": "Abrir relatório em nova aba",
                    title: "Abrir em nova aba",
                    children: [
                      /* @__PURE__ */ jsx(ExternalLink, { className: "h-4 w-4", "aria-hidden": "true" }),
                      "Abrir"
                    ]
                  }
                ),
                /* @__PURE__ */ jsxs(
                  "button",
                  {
                    onClick: toggleExpanded,
                    className: "inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border hover:bg-gray-50 ",
                    "aria-pressed": expanded,
                    "aria-label": expanded ? "Reduzir" : "Expandir",
                    title: expanded ? "Reduzir" : "Expandir",
                    children: [
                      /* @__PURE__ */ jsx(Maximize2, { className: "h-4 w-4", "aria-hidden": "true" }),
                      expanded ? "Reduzir" : "Expandir"
                    ]
                  }
                )
              ] })
            ]
          }
        ),
        /* @__PURE__ */ jsxs("div", { className: expanded ? "" : "px-0", children: [
          /* @__PURE__ */ jsx("div", { className: `${expanded ? "" : "px-6"} pb-4 flex flex-col gap-3`, children: !expanded && /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold ", children: "Indicadores da Unidade" }),
            /* @__PURE__ */ jsx("p", { className: " text-sm", children: "Acompanhe métricas e relatórios consolidados. Expanda para tela cheia para melhor visualização." })
          ] }) }),
          /* @__PURE__ */ jsxs("div", { className: `${expanded ? "" : "px-6"} pb-6`, children: [
            /* @__PURE__ */ jsx("div", { className: "rounded-2xl border  overflow-hidden ", children: /* @__PURE__ */ jsx(
              "iframe",
              {
                title: "Indicadores SISUB - Power BI",
                src: powerBiUrl,
                className: "w-full",
                style: { height: frameHeight },
                allowFullScreen: true,
                loading: "lazy",
                referrerPolicy: "no-referrer-when-downgrade"
              }
            ) }),
            /* @__PURE__ */ jsx("div", { className: "mt-3 text-xs  px-1", children: "Dica: use o botão de tela cheia dentro do relatório para melhor experiência." })
          ] })
        ] })
      ]
    }
  );
}
function QRAutoCheckinCard({
  selectedOm,
  onChangeSelectedOm,
  status
}) {
  const baseUrl = "https://app.previsaosisub.com.br/checkin";
  const currentOm = selectedOm?.trim();
  const qrValue = useMemo(() => {
    const url = new URL(baseUrl);
    const om = (currentOm ?? "").normalize("NFKC").trim();
    url.searchParams.set("u", om);
    return url.toString();
  }, [baseUrl, currentOm]);
  const qrWrapRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const handleCopyOm = async () => {
    try {
      if (!currentOm) return;
      await navigator.clipboard.writeText(currentOm);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      alert("Não foi possível copiar a OM.");
    }
  };
  const handleDownloadPng = () => {
    const canvas = qrWrapRef.current?.querySelector("canvas") ?? null;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `qr-auto-checkin-${currentOm || "om"}.png`;
    a.click();
  };
  return /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border  shadow-sm p-6", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-2", children: [
      /* @__PURE__ */ jsxs("div", { className: "inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs   border ", children: [
        /* @__PURE__ */ jsx(QrCode, { className: "h-4 w-4", "aria-hidden": "true" }),
        "Auto Check-In"
      ] }),
      currentOm ? /* @__PURE__ */ jsxs("span", { className: "text-xs ", children: [
        "OM: ",
        currentOm
      ] }) : /* @__PURE__ */ jsx("span", { className: "text-xs ", children: "OM não definida" })
    ] }),
    /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold  mb-4", children: "QR Code de Auto Check-In" }),
    /* @__PURE__ */ jsx("div", { className: "mb-4", children: /* @__PURE__ */ jsx(
      UnitSelector,
      {
        value: selectedOm,
        onChange: onChangeSelectedOm,
        disabled: status !== "authorized",
        hasDefaultUnit: false,
        showValidation: true,
        size: "md",
        placeholder: "Selecione uma unidade..."
      }
    ) }),
    /* @__PURE__ */ jsx("div", { className: " text-sm mb-4", children: "Exiba este QR no ponto de acesso. Usuários autorizados farão check-in pela câmera do celular." }),
    /* @__PURE__ */ jsx(
      "div",
      {
        ref: qrWrapRef,
        className: "flex flex-col items-center justify-center rounded-xl border   p-6",
        children: currentOm ? /* @__PURE__ */ jsx(
          QRCodeCanvas,
          {
            value: qrValue,
            size: 256,
            level: "Q",
            bgColor: "#ffffff",
            fgColor: "#1f2937",
            "aria-label": "QR code para auto check-in da OM",
            marginSize: 2
          }
        ) : /* @__PURE__ */ jsxs(
          "div",
          {
            className: "inline-flex items-center gap-2 rounded-lg border  px-3 py-2 ",
            role: "status",
            "aria-live": "polite",
            children: [
              /* @__PURE__ */ jsx(AlertCircle, { className: "h-4 w-4", "aria-hidden": "true" }),
              "Defina uma OM para gerar o QR Code."
            ]
          }
        )
      }
    ),
    /* @__PURE__ */ jsxs("div", { className: "mt-4 flex flex-col sm:flex-row gap-2", children: [
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: handleCopyOm,
          disabled: !currentOm,
          className: `inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-150 shadow-sm ${currentOm ? " ver:bg-emerald-700" : "  cursor-not-allowed"}`,
          children: copied ? /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx(CheckCircle2, { className: "h-4 w-4", "aria-hidden": "true" }),
            "Copiado"
          ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx(Copy, { className: "h-4 w-4", "aria-hidden": "true" }),
            "Copiar OM"
          ] })
        }
      ),
      /* @__PURE__ */ jsxs(
        "button",
        {
          onClick: handleDownloadPng,
          disabled: !currentOm,
          className: `inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-150 border ${currentOm ? "border-gray-300   hover:bg-gray-50" : "border-gray-200  cursor-not-allowed"}`,
          children: [
            /* @__PURE__ */ jsx(Download, { className: "h-4 w-4", "aria-hidden": "true" }),
            "Baixar PNG do QR"
          ]
        }
      )
    ] })
  ] });
}
function meta$1({}) {
  return [{
    title: "Painel Admin"
  }, {
    name: "description",
    content: "Controle sua unidade"
  }];
}
const adminPanel = UNSAFE_withComponentProps(function AdminPanel() {
  const {
    user
  } = useAuth();
  const [status, setStatus] = useState("checking");
  const [error, setError] = useState(null);
  const [selectedOm, setSelectedOm] = useState("");
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 10);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    let active = true;
    const fetchUserLevel = async () => {
      if (!user?.id) return;
      setStatus("checking");
      setError(null);
      try {
        const userLevel = await checkUserLevel(user.id);
        if (!active) return;
        if (userLevel === "admin" || userLevel === "superadmin") {
          setStatus("authorized");
        } else {
          setStatus("unauthorized");
        }
      } catch (e) {
        if (!active) return;
        setError("Não foi possível verificar suas permissões. Tente novamente.");
        setStatus("unauthorized");
      }
    };
    fetchUserLevel();
    return () => {
      active = false;
    };
  }, [user?.id]);
  if (status === "unauthorized") {
    return /* @__PURE__ */ jsx(Navigate, {
      to: "/rancho",
      replace: true
    });
  }
  return /* @__PURE__ */ jsxs("div", {
    className: "min-h-screen ",
    children: [/* @__PURE__ */ jsx("section", {
      id: "hero",
      className: `container mx-auto max-w-screen-2xl px-4 pt-10 md:pt-14 transition-all duration-500 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`,
      children: /* @__PURE__ */ jsx(AdminHero, {
        error
      })
    }), /* @__PURE__ */ jsx("section", {
      id: "content",
      className: `container mx-auto max-w-screen-2xl px-4 py-10 md:py-14 transition-all duration-500 delay-100 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`,
      children: /* @__PURE__ */ jsxs("div", {
        className: "grid grid-cols-1 gap-6 lg:gap-8",
        children: [/* @__PURE__ */ jsx(IndicatorsCard$1, {}), /* @__PURE__ */ jsx(QRAutoCheckinCard, {
          selectedOm,
          onChangeSelectedOm: setSelectedOm,
          status
        })]
      })
    })]
  });
});
const route15 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: adminPanel,
  meta: meta$1
}, Symbol.toStringTag, { value: "Module" }));
function SuperAdminHero() {
  return /* @__PURE__ */ jsxs("div", { className: "text-center", children: [
    /* @__PURE__ */ jsxs("div", { className: "inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm mb-3", children: [
      /* @__PURE__ */ jsx(Shield, {}),
      "Painel SuperAdmin"
    ] }),
    /* @__PURE__ */ jsx("h1", { className: "text-3xl md:text-4xl font-bold  mb-3", children: "Controle do Sistema" }),
    /* @__PURE__ */ jsx("p", { className: " max-w-2xl mx-auto", children: "Gerencie permissões, cadastre administradores e acompanhe indicadores gerais do SISUB." })
  ] });
}
function IndicatorsCard() {
  const [expanded, setExpanded] = useState(false);
  const frameHeight = useMemo(() => "clamp(520px, 78vh, 1000px)", []);
  const toggleExpanded = () => setExpanded((e) => !e);
  const powerBiUrl = "https://app.powerbi.com/view?r=eyJrIjoiMmQ5MDYwODMtODJjNy00NzVkLWFjYzgtYjljYzE4NmM0ZDgxIiwidCI6IjNhMzY0ZGI2LTg2NmEtNDRkOS1iMzY5LWM1ODk1OWQ0NDhmOCJ9";
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: `rounded-2xl border  shadow-sm ${expanded ? "p-0" : "p-6"}`,
      children: [
        /* @__PURE__ */ jsxs(
          "div",
          {
            className: `${expanded ? "px-4 py-3" : "mb-4"} flex items-center justify-between`,
            children: [
              /* @__PURE__ */ jsxs("div", { className: "inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs  border ", children: [
                /* @__PURE__ */ jsx(AlertCircle, { className: "h-4 w-4", "aria-hidden": "true" }),
                "Indicadores Gerais"
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsxs(
                  "button",
                  {
                    onClick: () => window.open(powerBiUrl, "_blank", "noopener,noreferrer"),
                    className: "inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border ",
                    "aria-label": "Abrir relatório em nova aba",
                    title: "Abrir em nova aba",
                    children: [
                      /* @__PURE__ */ jsx(ExternalLink, { className: "h-4 w-4", "aria-hidden": "true" }),
                      "Abrir"
                    ]
                  }
                ),
                /* @__PURE__ */ jsxs(
                  "button",
                  {
                    onClick: toggleExpanded,
                    className: "inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border ",
                    "aria-pressed": expanded,
                    "aria-label": expanded ? "Reduzir" : "Expandir",
                    title: expanded ? "Reduzir" : "Expandir",
                    children: [
                      /* @__PURE__ */ jsx(Maximize2, { className: "h-4 w-4", "aria-hidden": "true" }),
                      expanded ? "Reduzir" : "Expandir"
                    ]
                  }
                )
              ] })
            ]
          }
        ),
        /* @__PURE__ */ jsxs("div", { className: expanded ? "" : "px-0", children: [
          /* @__PURE__ */ jsx("div", { className: `${expanded ? "" : "px-6"} pb-4`, children: !expanded && /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold ", children: "Indicadores do Sistema" }),
            /* @__PURE__ */ jsx("p", { className: " text-sm", children: "Acompanhe métricas gerais do SISUB. Expanda para tela cheia para melhor visualização." })
          ] }) }),
          /* @__PURE__ */ jsxs("div", { className: `${expanded ? "" : "px-6"} pb-6`, children: [
            /* @__PURE__ */ jsx("div", { className: "rounded-2xl border  overflow-hidden ", children: /* @__PURE__ */ jsx(
              "iframe",
              {
                title: "Sistema_sisub_FINALFINAL",
                className: "w-full",
                style: { height: frameHeight },
                src: powerBiUrl,
                allowFullScreen: true,
                loading: "lazy",
                referrerPolicy: "no-referrer-when-downgrade"
              }
            ) }),
            /* @__PURE__ */ jsx("div", { className: "mt-3 text-xs  px-1", children: "Dica: use o botão de tela cheia dentro do relatório para melhor experiência." })
          ] })
        ] })
      ]
    }
  );
}
function AddUserDialog({
  open,
  onOpenChange,
  isLoading,
  units,
  isLoadingUnits,
  unitsError,
  onSubmit
}) {
  const [id, setId] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [saram, setSaram] = React.useState("");
  const [role, setRole] = React.useState(null);
  const [om, setOm] = React.useState("");
  React.useEffect(() => {
    if (!open) {
      setId("");
      setEmail("");
      setName("");
      setSaram("");
      setRole(null);
      setOm("");
    }
  }, [open]);
  const handleSubmit = () => {
    onSubmit({ id, email, name, saram, role, om });
  };
  return /* @__PURE__ */ jsx(Dialog, { open, onOpenChange, children: /* @__PURE__ */ jsxs(DialogContent, { className: "sm:max-w-[520px]", children: [
    /* @__PURE__ */ jsxs(DialogHeader, { children: [
      /* @__PURE__ */ jsx(DialogTitle, { children: "Adicionar Novo Usuário" }),
      /* @__PURE__ */ jsx(DialogDescription, { children: "Preencha todos os campos para cadastrar o usuário em profiles_admin. O ID deve ser o UUID do usuário que se tornará Admin." })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid gap-4 py-2", children: [
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-4 items-center gap-4", children: [
        /* @__PURE__ */ jsx(Label, { htmlFor: "id", className: "text-right", children: "ID (UUID)" }),
        /* @__PURE__ */ jsx(
          Input,
          {
            id: "id",
            value: id,
            onChange: (e) => setId(e.target.value),
            className: "col-span-3",
            placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-4 items-center gap-4", children: [
        /* @__PURE__ */ jsx(Label, { htmlFor: "name", className: "text-right", children: "Nome" }),
        /* @__PURE__ */ jsx(
          Input,
          {
            id: "name",
            value: name,
            onChange: (e) => setName(e.target.value),
            className: "col-span-3",
            placeholder: "Nome completo"
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-4 items-center gap-4", children: [
        /* @__PURE__ */ jsx(Label, { htmlFor: "email", className: "text-right", children: "Email" }),
        /* @__PURE__ */ jsx(
          Input,
          {
            id: "email",
            value: email,
            onChange: (e) => setEmail(e.target.value),
            className: "col-span-3",
            placeholder: "usuario@exemplo.com",
            type: "email"
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-4 items-center gap-4", children: [
        /* @__PURE__ */ jsx(Label, { htmlFor: "saram", className: "text-right", children: "SARAM" }),
        /* @__PURE__ */ jsx(
          Input,
          {
            id: "saram",
            value: saram,
            onChange: (e) => setSaram(e.target.value),
            className: "col-span-3",
            maxLength: 7,
            inputMode: "numeric",
            pattern: "\\d{7}",
            placeholder: "Apenas 7 números"
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-4 items-center gap-4", children: [
        /* @__PURE__ */ jsx(Label, { htmlFor: "role", className: "text-right", children: "Role" }),
        /* @__PURE__ */ jsxs(
          Select,
          {
            value: role ?? "",
            onValueChange: (value) => setRole(value),
            children: [
              /* @__PURE__ */ jsx(SelectTrigger, { className: "col-span-3", children: /* @__PURE__ */ jsx(SelectValue, { placeholder: "Selecione uma role" }) }),
              /* @__PURE__ */ jsxs(SelectContent, { children: [
                /* @__PURE__ */ jsx(SelectItem, { value: "user", children: "User" }),
                /* @__PURE__ */ jsx(SelectItem, { value: "admin", children: "Admin" }),
                /* @__PURE__ */ jsx(SelectItem, { value: "superadmin", children: "Superadmin" })
              ] })
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-4 items-center gap-4", children: [
        /* @__PURE__ */ jsx(Label, { htmlFor: "om", className: "text-right", children: "OM" }),
        /* @__PURE__ */ jsxs(
          Select,
          {
            value: om || "",
            onValueChange: (value) => setOm(value),
            disabled: isLoadingUnits,
            children: [
              /* @__PURE__ */ jsx(SelectTrigger, { className: "col-span-3", children: /* @__PURE__ */ jsx(
                SelectValue,
                {
                  placeholder: isLoadingUnits ? "Carregando OMs..." : "Selecione a OM (opcional)"
                }
              ) }),
              /* @__PURE__ */ jsx(SelectContent, { children: (units || []).map((u) => /* @__PURE__ */ jsx(SelectItem, { value: u.code, children: u.name ? u.name : u.code }, u.code)) })
            ]
          }
        )
      ] }),
      unitsError && /* @__PURE__ */ jsx("p", { className: "col-span-4 text-sm text-destructive", children: unitsError })
    ] }),
    /* @__PURE__ */ jsxs(DialogFooter, { children: [
      /* @__PURE__ */ jsx(
        Button,
        {
          type: "button",
          variant: "outline",
          onClick: () => onOpenChange(false),
          children: "Cancelar"
        }
      ),
      /* @__PURE__ */ jsx(Button, { type: "submit", onClick: handleSubmit, disabled: isLoading, children: isLoading ? "Adicionando..." : "Adicionar" })
    ] })
  ] }) });
}
function EditUserDialog({
  open,
  onOpenChange,
  isLoading,
  profile: profile2,
  units,
  isLoadingUnits,
  unitsError,
  onSubmit
}) {
  const [saram, setSaram] = React.useState("");
  const [role, setRole] = React.useState(null);
  const [om, setOm] = React.useState("");
  React.useEffect(() => {
    if (profile2 && open) {
      setSaram(profile2.saram || "");
      setRole(profile2.role || null);
      setOm(profile2.om || "");
    }
  }, [profile2, open]);
  const handleSubmit = () => {
    onSubmit({ saram, role, om });
  };
  return /* @__PURE__ */ jsx(Dialog, { open, onOpenChange, children: /* @__PURE__ */ jsxs(DialogContent, { className: "sm:max-w-[520px]", children: [
    /* @__PURE__ */ jsxs(DialogHeader, { children: [
      /* @__PURE__ */ jsx(DialogTitle, { children: "Editar Perfil" }),
      /* @__PURE__ */ jsxs(DialogDescription, { children: [
        "Altere o SARAM, OM e a Role do usuário:",
        " ",
        /* @__PURE__ */ jsx("span", { className: "font-medium text-gray-900", children: profile2?.email })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid gap-4 py-2", children: [
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-4 items-center gap-4", children: [
        /* @__PURE__ */ jsx(Label, { htmlFor: "saram", className: "text-right", children: "SARAM" }),
        /* @__PURE__ */ jsx(
          Input,
          {
            id: "saram",
            value: saram,
            onChange: (e) => setSaram(e.target.value),
            className: "col-span-3",
            maxLength: 7,
            pattern: "\\d{7}",
            placeholder: "Apenas 7 números"
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-4 items-center gap-4", children: [
        /* @__PURE__ */ jsx(Label, { htmlFor: "om", className: "text-right", children: "OM" }),
        /* @__PURE__ */ jsxs(
          Select,
          {
            value: om || "",
            onValueChange: (value) => setOm(value),
            disabled: isLoadingUnits,
            children: [
              /* @__PURE__ */ jsx(SelectTrigger, { className: "col-span-3", children: /* @__PURE__ */ jsx(
                SelectValue,
                {
                  placeholder: isLoadingUnits ? "Carregando OMs..." : "Selecione a OM"
                }
              ) }),
              /* @__PURE__ */ jsx(SelectContent, { children: (units || []).map((u) => /* @__PURE__ */ jsx(SelectItem, { value: u.code, children: u.name ? u.name : u.code }, u.code)) })
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-4 items-center gap-4", children: [
        /* @__PURE__ */ jsx(Label, { htmlFor: "role", className: "text-right", children: "Role" }),
        /* @__PURE__ */ jsxs(
          Select,
          {
            value: role ?? "",
            onValueChange: (value) => setRole(value),
            children: [
              /* @__PURE__ */ jsx(SelectTrigger, { className: "col-span-3", children: /* @__PURE__ */ jsx(SelectValue, { placeholder: "Selecione uma role" }) }),
              /* @__PURE__ */ jsxs(SelectContent, { children: [
                /* @__PURE__ */ jsx(SelectItem, { value: "user", children: "User" }),
                /* @__PURE__ */ jsx(SelectItem, { value: "admin", children: "Admin" }),
                /* @__PURE__ */ jsx(SelectItem, { value: "superadmin", children: "Superadmin" })
              ] })
            ]
          }
        )
      ] }),
      unitsError && /* @__PURE__ */ jsx("p", { className: "col-span-4 text-sm text-destructive", children: unitsError })
    ] }),
    /* @__PURE__ */ jsxs(DialogFooter, { children: [
      /* @__PURE__ */ jsx(Button, { variant: "outline", onClick: () => onOpenChange(false), children: "Cancelar" }),
      /* @__PURE__ */ jsx(Button, { onClick: handleSubmit, disabled: isLoading, children: isLoading ? "Salvando..." : "Salvar alterações" })
    ] })
  ] }) });
}
function DeleteUserDialog({
  open,
  onOpenChange,
  isLoading,
  profile: profile2,
  onConfirm
}) {
  return /* @__PURE__ */ jsx(Dialog, { open, onOpenChange, children: /* @__PURE__ */ jsxs(DialogContent, { className: "sm:max-w-[480px]", children: [
    /* @__PURE__ */ jsxs(DialogHeader, { children: [
      /* @__PURE__ */ jsx(DialogTitle, { children: "Confirmar Exclusão" }),
      /* @__PURE__ */ jsxs(DialogDescription, { children: [
        "Tem certeza que deseja excluir o registro do usuário",
        " ",
        /* @__PURE__ */ jsx("strong", { children: profile2?.email }),
        "? Esta ação não pode ser desfeita."
      ] })
    ] }),
    /* @__PURE__ */ jsxs(DialogFooter, { children: [
      /* @__PURE__ */ jsx(Button, { variant: "outline", onClick: () => onOpenChange(false), children: "Cancelar" }),
      /* @__PURE__ */ jsx(
        Button,
        {
          variant: "destructive",
          onClick: onConfirm,
          disabled: isLoading,
          children: isLoading ? "Excluindo..." : "Excluir"
        }
      )
    ] })
  ] }) });
}
function ProfilesManager() {
  const [profiles, setProfiles] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const {
    units,
    isLoading: isLoadingunits,
    error: unitsError
  } = useMessHalls();
  const [selectedProfile, setSelectedProfile] = React.useState(null);
  const [isAddUserOpen, setIsAddUserOpen] = React.useState(false);
  const [isEditUserOpen, setIsEditUserOpen] = React.useState(false);
  const [isDeleteUserOpen, setIsDeleteUserOpen] = React.useState(false);
  const [isAdding, setIsAdding] = React.useState(false);
  const [isUpdating, setIsUpdating] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const fetchProfiles = React.useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("profiles_admin").select("*").order("created_at", { ascending: false });
    if (error) {
      console.error("Error fetching profiles:", error);
      toast.error("Erro ao buscar perfis", {
        description: error.message
      });
    } else {
      setProfiles(data || []);
    }
    setLoading(false);
  }, []);
  React.useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);
  const handleAddUser = async (payload) => {
    const id = payload.id.trim();
    const email = payload.email.trim().toLowerCase();
    const name = payload.name.trim();
    const saram = payload.saram.trim();
    const role = payload.role;
    const om = payload.om || null;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      toast.error("Erro de Validação", {
        description: "ID inválido. Informe um UUID válido do usuário admin."
      });
      return;
    }
    if (!emailRegex.test(email)) {
      toast.error("Erro de Validação", { description: "Email inválido." });
      return;
    }
    if (!name) {
      toast.error("Erro de Validação", {
        description: "O nome é obrigatório."
      });
      return;
    }
    if (!/^\d{7}$/.test(saram)) {
      toast.error("SARAM inválido", {
        description: "O SARAM deve conter exatamente 7 números."
      });
      return;
    }
    if (!role) {
      toast.error("Erro de Validação", {
        description: "Selecione uma role para o usuário."
      });
      return;
    }
    try {
      setIsAdding(true);
      const { error } = await supabase.from("profiles_admin").insert([
        {
          id,
          email,
          name,
          saram,
          role,
          om
        }
      ]);
      if (error) throw error;
      toast.success("Sucesso!", {
        description: `Usuário ${email} adicionado.`
      });
      setIsAddUserOpen(false);
      await fetchProfiles();
    } catch (err) {
      toast.error("Erro ao adicionar usuário", {
        description: err?.message ?? "Ocorreu um erro ao salvar. Tente novamente."
      });
    } finally {
      setIsAdding(false);
    }
  };
  const handleUpdateUser = async (payload) => {
    if (!selectedProfile) return;
    if (payload.saram && !/^\d{7}$/.test(payload.saram)) {
      toast.error("SARAM inválido", {
        description: "O SARAM deve conter exatamente 7 números."
      });
      return;
    }
    try {
      setIsUpdating(true);
      const { error } = await supabase.from("profiles_admin").update({
        role: payload.role,
        saram: payload.saram || null,
        om: payload.om || null
      }).eq("id", selectedProfile.id);
      if (error) throw error;
      toast.success("Sucesso!", {
        description: `Perfil de ${selectedProfile.email} atualizado.`
      });
      setIsEditUserOpen(false);
      setSelectedProfile(null);
      await fetchProfiles();
    } catch (err) {
      toast.error("Erro ao atualizar", {
        description: err?.message ?? "Não foi possível atualizar o registro."
      });
    } finally {
      setIsUpdating(false);
    }
  };
  const handleDeleteUser = async () => {
    if (!selectedProfile) return;
    try {
      setIsDeleting(true);
      const { error } = await supabase.from("profiles_admin").delete().eq("id", selectedProfile.id);
      if (error) throw error;
      toast.success("Registro excluído", {
        description: `Usuário ${selectedProfile.email} removido.`
      });
      setIsDeleteUserOpen(false);
      setSelectedProfile(null);
      await fetchProfiles();
    } catch (err) {
      toast.error("Erro ao excluir", {
        description: err?.message ?? "Não foi possível excluir o registro."
      });
    } finally {
      setIsDeleting(false);
    }
  };
  const RoleBadge = ({ role }) => {
    if (!role) return /* @__PURE__ */ jsx("span", { className: "text-muted-foreground", children: "N/A" });
    const variant = role === "superadmin" ? "destructive" : role === "admin" ? "default" : "secondary";
    const label = role === "superadmin" ? "Superadmin" : role === "admin" ? "Admin" : "User";
    return /* @__PURE__ */ jsx(Badge, { variant, children: label });
  };
  const columns = React.useMemo(
    () => [
      {
        id: "select",
        header: ({ table: table2 }) => /* @__PURE__ */ jsx(
          Checkbox,
          {
            checked: table2.getIsAllPageRowsSelected(),
            onCheckedChange: (value) => table2.toggleAllPageRowsSelected(!!value),
            "aria-label": "Selecionar todos"
          }
        ),
        cell: ({ row }) => /* @__PURE__ */ jsx(
          Checkbox,
          {
            checked: row.getIsSelected(),
            onCheckedChange: (value) => row.toggleSelected(!!value),
            "aria-label": "Selecionar linha"
          }
        ),
        enableSorting: false,
        enableHiding: false
      },
      {
        accessorKey: "email",
        header: ({ column }) => /* @__PURE__ */ jsxs(
          Button,
          {
            variant: "ghost",
            className: "px-0",
            onClick: () => column.toggleSorting(column.getIsSorted() === "asc"),
            children: [
              "Email ",
              /* @__PURE__ */ jsx(ArrowUpDown, { className: "ml-2 h-4 w-4" })
            ]
          }
        ),
        cell: ({ row }) => /* @__PURE__ */ jsx("div", { className: "lowercase text-foreground", children: row.getValue("email") })
      },
      {
        accessorKey: "name",
        header: "Nome",
        cell: ({ row }) => /* @__PURE__ */ jsx("div", { className: "text-foreground", children: row.getValue("name") || /* @__PURE__ */ jsx("span", { className: "text-muted-foreground", children: "N/A" }) })
      },
      {
        accessorKey: "role",
        header: "Role",
        cell: ({ row }) => /* @__PURE__ */ jsx(RoleBadge, { role: row.getValue("role") })
      },
      {
        accessorKey: "saram",
        header: "SARAM",
        cell: ({ row }) => /* @__PURE__ */ jsx("div", { className: "tabular-nums", children: row.getValue("saram") || /* @__PURE__ */ jsx("span", { className: "text-muted-foreground", children: "N/A" }) })
      },
      {
        accessorKey: "om",
        header: "OM",
        cell: ({ row }) => /* @__PURE__ */ jsx("div", { children: row.getValue("om") || /* @__PURE__ */ jsx("span", { className: "text-muted-foreground", children: "N/A" }) })
      },
      {
        id: "actions",
        cell: ({ row }) => {
          const profile2 = row.original;
          return /* @__PURE__ */ jsxs(DropdownMenu, { children: [
            /* @__PURE__ */ jsx(DropdownMenuTrigger, { asChild: true, children: /* @__PURE__ */ jsxs(Button, { variant: "ghost", className: "h-8 w-8 p-0", children: [
              /* @__PURE__ */ jsx("span", { className: "sr-only", children: "Abrir menu" }),
              /* @__PURE__ */ jsx(MoreHorizontal, { className: "h-4 w-4" })
            ] }) }),
            /* @__PURE__ */ jsxs(DropdownMenuContent, { align: "end", children: [
              /* @__PURE__ */ jsx(DropdownMenuLabel, { children: "Ações" }),
              /* @__PURE__ */ jsx(
                DropdownMenuItem,
                {
                  onClick: () => {
                    setSelectedProfile(profile2);
                    setIsEditUserOpen(true);
                  },
                  children: "Editar"
                }
              ),
              /* @__PURE__ */ jsx(
                DropdownMenuItem,
                {
                  className: "text-destructive focus:text-destructive",
                  onClick: () => {
                    setSelectedProfile(profile2);
                    setIsDeleteUserOpen(true);
                  },
                  children: "Excluir"
                }
              )
            ] })
          ] });
        }
      }
    ],
    []
  );
  const [sorting, setSorting] = React.useState([]);
  const [columnFilters, setColumnFilters] = React.useState(
    []
  );
  const [columnVisibility, setColumnVisibility] = React.useState({});
  const [rowSelection, setRowSelection] = React.useState({});
  const table = useReactTable({
    data: profiles,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection
    }
  });
  const emailFilter = table.getColumn("email")?.getFilterValue() ?? "";
  const roleFilter = table.getColumn("role")?.getFilterValue() ?? "";
  const resetFilters = () => {
    table.resetColumnFilters();
  };
  return /* @__PURE__ */ jsxs("div", { className: "rounded-xl border bg-card text-card-foreground shadow-sm p-6", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex flex-col md:flex-row md:items-center gap-3 md:gap-4 py-2", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex-1 flex flex-col sm:flex-row gap-2", children: [
        /* @__PURE__ */ jsx(
          Input,
          {
            placeholder: "Filtrar por email...",
            value: emailFilter,
            onChange: (event) => table.getColumn("email")?.setFilterValue(event.target.value),
            className: "max-w-sm"
          }
        ),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxs(
            Select,
            {
              value: roleFilter ?? "",
              onValueChange: (v) => table.getColumn("role")?.setFilterValue(v || void 0),
              children: [
                /* @__PURE__ */ jsx(SelectTrigger, { className: "w-full sm:w-[200px]", children: /* @__PURE__ */ jsx(SelectValue, { placeholder: "Filtrar por role" }) }),
                /* @__PURE__ */ jsxs(SelectContent, { children: [
                  /* @__PURE__ */ jsx(SelectItem, { value: "user", children: "User" }),
                  /* @__PURE__ */ jsx(SelectItem, { value: "admin", children: "Admin" }),
                  /* @__PURE__ */ jsx(SelectItem, { value: "superadmin", children: "Superadmin" })
                ] })
              ]
            }
          ),
          /* @__PURE__ */ jsx(
            Button,
            {
              variant: "outline",
              onClick: resetFilters,
              className: "whitespace-nowrap",
              children: "Limpar filtros"
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 md:ml-auto", children: [
        /* @__PURE__ */ jsx(
          Button,
          {
            className: "whitespace-nowrap",
            onClick: () => setIsAddUserOpen(true),
            children: "+ Adicionar Usuário"
          }
        ),
        /* @__PURE__ */ jsxs(DropdownMenu, { children: [
          /* @__PURE__ */ jsx(DropdownMenuTrigger, { asChild: true, children: /* @__PURE__ */ jsxs(Button, { variant: "outline", className: "whitespace-nowrap", children: [
            "Colunas ",
            /* @__PURE__ */ jsx(ChevronDown, { className: "ml-2 h-4 w-4" })
          ] }) }),
          /* @__PURE__ */ jsx(DropdownMenuContent, { align: "end", children: table.getAllColumns().filter((column) => column.getCanHide()).map((column) => /* @__PURE__ */ jsx(
            DropdownMenuCheckboxItem,
            {
              className: "capitalize",
              checked: column.getIsVisible(),
              onCheckedChange: (value) => column.toggleVisibility(!!value),
              children: column.id
            },
            column.id
          )) })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "mt-4 overflow-x-auto rounded-xl border border-border", children: /* @__PURE__ */ jsxs(Table, { children: [
      /* @__PURE__ */ jsx(TableHeader, { className: "bg-muted/50", children: table.getHeaderGroups().map((headerGroup) => /* @__PURE__ */ jsx(TableRow, { children: headerGroup.headers.map((header) => /* @__PURE__ */ jsx(TableHead, { className: "text-muted-foreground", children: header.isPlaceholder ? null : flexRender(
        header.column.columnDef.header,
        header.getContext()
      ) }, header.id)) }, headerGroup.id)) }),
      /* @__PURE__ */ jsx(TableBody, { children: loading ? /* @__PURE__ */ jsx(TableRow, { children: /* @__PURE__ */ jsx(
        TableCell,
        {
          colSpan: table.getAllColumns().length,
          className: "h-24",
          children: /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-center gap-2 text-muted-foreground", children: [
            /* @__PURE__ */ jsx("span", { className: "h-4 w-4 animate-spin rounded-full border-2 border-primary border-b-transparent" }),
            "Carregando..."
          ] })
        }
      ) }) : table.getRowModel().rows?.length ? table.getRowModel().rows.map((row) => /* @__PURE__ */ jsx(
        TableRow,
        {
          "data-state": row.getIsSelected() && "selected",
          className: "\n                    hover:bg-accent/50\n                    data-[state=selected]:bg-accent/40\n                  ",
          children: row.getVisibleCells().map((cell) => /* @__PURE__ */ jsx(TableCell, { className: "align-middle", children: flexRender(
            cell.column.columnDef.cell,
            cell.getContext()
          ) }, cell.id))
        },
        row.id
      )) : /* @__PURE__ */ jsx(TableRow, { children: /* @__PURE__ */ jsx(
        TableCell,
        {
          colSpan: table.getAllColumns().length,
          className: "h-24 text-center text-muted-foreground",
          children: "Nenhum resultado encontrado."
        }
      ) }) })
    ] }) }),
    /* @__PURE__ */ jsxs("div", { className: "flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4", children: [
      /* @__PURE__ */ jsxs("div", { className: "text-muted-foreground text-sm", children: [
        table.getFilteredSelectedRowModel().rows.length,
        " de",
        " ",
        table.getFilteredRowModel().rows.length,
        " linha(s) selecionada(s)."
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxs(
          Select,
          {
            value: String(table.getState().pagination?.pageSize ?? 10),
            onValueChange: (v) => table.setPageSize(Number(v)),
            children: [
              /* @__PURE__ */ jsx(SelectTrigger, { className: "w-[160px]", children: /* @__PURE__ */ jsx(SelectValue, { placeholder: "Itens por página" }) }),
              /* @__PURE__ */ jsx(SelectContent, { children: [10, 20, 30, 50, 100].map((size) => /* @__PURE__ */ jsxs(SelectItem, { value: String(size), children: [
                size,
                " por página"
              ] }, size)) })
            ]
          }
        ),
        /* @__PURE__ */ jsx(
          Button,
          {
            variant: "outline",
            size: "sm",
            onClick: () => table.previousPage(),
            disabled: !table.getCanPreviousPage(),
            children: "Anterior"
          }
        ),
        /* @__PURE__ */ jsx(
          Button,
          {
            variant: "outline",
            size: "sm",
            onClick: () => table.nextPage(),
            disabled: !table.getCanNextPage(),
            children: "Próximo"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsx(
      AddUserDialog,
      {
        open: isAddUserOpen,
        onOpenChange: setIsAddUserOpen,
        isLoading: isAdding,
        units: units ? [...units] : [],
        isLoadingUnits: isLoadingunits,
        unitsError,
        onSubmit: handleAddUser
      }
    ),
    /* @__PURE__ */ jsx(
      EditUserDialog,
      {
        open: isEditUserOpen,
        onOpenChange: setIsEditUserOpen,
        isLoading: isUpdating,
        profile: selectedProfile,
        units: units ? [...units] : [],
        isLoadingUnits: isLoadingunits,
        unitsError,
        onSubmit: handleUpdateUser
      }
    ),
    /* @__PURE__ */ jsx(
      DeleteUserDialog,
      {
        open: isDeleteUserOpen,
        onOpenChange: setIsDeleteUserOpen,
        isLoading: isDeleting,
        profile: selectedProfile,
        onConfirm: handleDeleteUser
      }
    )
  ] });
}
function RoleGuard({
  requireAny,
  redirectTo = "/rancho",
  children
}) {
  const location = useLocation();
  const { user } = useAuth();
  const {
    data: level,
    isError
  } = useUserLevel(user?.id);
  if (!user) {
    const to = encodeURIComponent(`${location.pathname}${location.search}`);
    return /* @__PURE__ */ jsx(Navigate, { to: `/login?redirectTo=${to}`, replace: true });
  }
  const effectiveLevel = isError ? null : level ?? null;
  const allowed = !!effectiveLevel && requireAny.includes(effectiveLevel);
  if (!allowed) {
    return /* @__PURE__ */ jsx(Navigate, { to: redirectTo, replace: true });
  }
  return /* @__PURE__ */ jsx(Fragment, { children });
}
async function fetchEvalConfig() {
  const {
    data,
    error
  } = await supabase.from("super_admin_controller").select("key, active, value").eq("key", "evaluation").maybeSingle();
  if (error) throw error;
  return {
    active: !!data?.active,
    value: typeof data?.value === "string" ? data.value : data?.value == null ? "" : String(data.value)
  };
}
async function upsertEvalConfig(cfg) {
  const {
    data,
    error
  } = await supabase.from("super_admin_controller").upsert({
    key: "evaluation",
    active: cfg.active,
    value: cfg.value
  }, {
    onConflict: "key"
  }).select("key, active, value").maybeSingle();
  if (error) throw error;
  return {
    active: !!data?.active,
    value: typeof data?.value === "string" ? data.value : data?.value == null ? "" : String(data.value)
  };
}
function meta() {
  return [{
    title: "Painel SuperAdmin"
  }, {
    name: "description",
    content: "Controle o sistema de subsistência"
  }];
}
function SuperAdminPanelInner() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 10);
    return () => clearTimeout(t);
  }, []);
  const queryClient2 = useQueryClient();
  const evalQuery = useQuery({
    queryKey: ["super-admin", "evaluation-config"],
    queryFn: fetchEvalConfig,
    staleTime: 6e4
  });
  const [form, setForm] = useState({
    active: false,
    value: ""
  });
  useEffect(() => {
    if (evalQuery.data && !evalQuery.isFetching) {
      setForm(evalQuery.data);
    }
  }, [evalQuery.data, evalQuery.isFetching]);
  const dirty = useMemo(() => {
    const d = evalQuery.data;
    if (!d) return false;
    return d.active !== form.active || d.value !== form.value;
  }, [evalQuery.data, form]);
  const invalid = useMemo(() => {
    if (evalQuery.isLoading) return true;
    if (form.active && !form.value.trim()) return true;
    return false;
  }, [evalQuery.isLoading, form]);
  const saveMutation = useMutation({
    mutationFn: upsertEvalConfig,
    onSuccess: (saved) => {
      queryClient2.setQueryData(["super-admin", "evaluation-config"], saved);
    }
  });
  const loading = evalQuery.isLoading;
  const saving = saveMutation.isPending;
  const saveError = saveMutation.isError ? saveMutation.error?.message ?? "Não foi possível salvar." : null;
  const saveOk = saveMutation.isSuccess ? "Configuração salva com sucesso." : null;
  return /* @__PURE__ */ jsxs("div", {
    className: "min-h-screen ",
    children: [/* @__PURE__ */ jsx("section", {
      id: "hero",
      className: `container mx-auto max-w-screen-2xl px-4 pt-10 md:pt-14 transition-all duration-500 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`,
      children: /* @__PURE__ */ jsx(SuperAdminHero, {})
    }), /* @__PURE__ */ jsx("section", {
      id: "content",
      className: `container mx-auto max-w-screen-2xl px-4 py-10 md:py-14 transition-all duration-500 delay-100 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`,
      children: /* @__PURE__ */ jsxs("div", {
        className: "grid grid-cols-1 gap-6 lg:gap-8",
        children: [/* @__PURE__ */ jsx(IndicatorsCard, {}), /* @__PURE__ */ jsx(ProfilesManager, {}), /* @__PURE__ */ jsxs(Card, {
          className: "border-2",
          children: [/* @__PURE__ */ jsxs(CardHeader, {
            children: [/* @__PURE__ */ jsx(CardTitle, {
              children: "Configuração da Pergunta de Avaliação"
            }), /* @__PURE__ */ jsx(CardDescription, {
              children: "Ligue/desligue a pergunta global de avaliação e defina o texto exibido aos usuários."
            })]
          }), /* @__PURE__ */ jsxs(CardContent, {
            className: "space-y-6",
            children: [/* @__PURE__ */ jsxs("div", {
              className: "flex items-center justify-between gap-4",
              children: [/* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx(Label, {
                  htmlFor: "evaluation-active",
                  className: "text-base",
                  children: "Ativar pergunta"
                }), /* @__PURE__ */ jsx("p", {
                  className: "text-sm text-muted-foreground",
                  children: "Quando ativo, usuários que ainda não responderam verão a pergunta."
                })]
              }), /* @__PURE__ */ jsx(Switch, {
                id: "evaluation-active",
                className: "cursor-pointer",
                checked: form.active,
                onCheckedChange: (v) => setForm((p) => ({
                  ...p,
                  active: v
                })),
                disabled: loading || saving
              })]
            }), /* @__PURE__ */ jsxs("div", {
              className: "space-y-2",
              children: [/* @__PURE__ */ jsx(Label, {
                htmlFor: "evaluation-question",
                children: "Texto da pergunta"
              }), /* @__PURE__ */ jsx(Textarea, {
                id: "evaluation-question",
                placeholder: "Ex.: Como você avalia sua experiência no Rancho?",
                value: form.value,
                onChange: (e) => setForm((p) => ({
                  ...p,
                  value: e.target.value
                })),
                disabled: loading || saving,
                rows: 3,
                maxLength: 240,
                className: "resize-y"
              }), /* @__PURE__ */ jsxs("div", {
                className: "flex justify-end text-xs text-muted-foreground",
                children: [form.value.length, "/240"]
              })]
            }), loading && /* @__PURE__ */ jsx("p", {
              className: "text-sm text-muted-foreground",
              children: "Carregando configuração..."
            }), saveError && /* @__PURE__ */ jsx("p", {
              className: "text-sm ",
              children: saveError
            }), saveOk && /* @__PURE__ */ jsx("p", {
              className: "text-sm ",
              children: saveOk
            })]
          }), /* @__PURE__ */ jsxs(CardFooter, {
            className: "flex items-center justify-end gap-2",
            children: [/* @__PURE__ */ jsx(Button, {
              type: "button",
              variant: "ghost",
              onClick: () => evalQuery.data && setForm(evalQuery.data),
              disabled: !dirty || saving || loading,
              children: "Reverter"
            }), /* @__PURE__ */ jsx(Button, {
              type: "button",
              onClick: () => saveMutation.mutate(form),
              disabled: !dirty || invalid || saving,
              children: saving ? /* @__PURE__ */ jsxs("span", {
                className: "inline-flex items-center gap-2",
                children: [/* @__PURE__ */ jsx("span", {
                  className: "h-4 w-4 animate-spin rounded-full border-2 border-b-transparent"
                }), "Salvando..."]
              }) : "Salvar alterações"
            })]
          })]
        })]
      })
    })]
  });
}
const superAdminPanel = UNSAFE_withComponentProps(function SuperAdminPanelRoute() {
  return /* @__PURE__ */ jsx(RoleGuard, {
    requireAny: ["superadmin"],
    redirectTo: "/rancho",
    children: /* @__PURE__ */ jsx(SuperAdminPanelInner, {})
  });
});
const route16 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: superAdminPanel,
  meta
}, Symbol.toStringTag, { value: "Module" }));
const notFound = UNSAFE_withComponentProps(function NotFound() {
  const location = useLocation();
  return /* @__PURE__ */ jsx("div", {
    className: "relative flex flex-col items-center justify-center w-full text-foreground min-h-[60vh]",
    children: /* @__PURE__ */ jsx("header", {
      className: "w-full max-w-3xl mx-auto px-4 sm:px-6 md:px-8 pt-8 md:pt-12",
      children: /* @__PURE__ */ jsx("div", {
        className: "w-full overflow-hidden rounded-3xl border border-border bg-gradient-to-b from-background/60 via-background/40 to-background/20 backdrop-blur supports-[backdrop-filter]:backdrop-blur-md p-6 md:p-10 text-center",
        children: /* @__PURE__ */ jsxs("div", {
          className: "mx-auto flex flex-col items-center justify-center",
          children: [/* @__PURE__ */ jsx(AlertTriangle, {
            className: "h-10 w-10 text-amber-500",
            "aria-hidden": "true"
          }), /* @__PURE__ */ jsx("h1", {
            className: "mt-4 text-3xl sm:text-4xl font-bold tracking-tight",
            children: "Página não encontrada"
          }), /* @__PURE__ */ jsx("p", {
            className: "mt-3 max-w-xl text-muted-foreground",
            children: "O caminho abaixo não existe ou foi movido."
          }), /* @__PURE__ */ jsx(Badge, {
            variant: "outline",
            className: "mt-4",
            children: location.pathname
          }), /* @__PURE__ */ jsx("div", {
            className: "mt-6 flex flex-wrap gap-3 justify-center",
            children: /* @__PURE__ */ jsx(Button, {
              asChild: true,
              size: "lg",
              variant: "default",
              "aria-label": "Voltar para a Home",
              children: /* @__PURE__ */ jsx(NavLink, {
                to: "/",
                children: "Voltar para a Home"
              })
            })
          })]
        })
      })
    })
  });
});
const route17 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: notFound
}, Symbol.toStringTag, { value: "Module" }));
const serverManifest = { "entry": { "module": "/assets/entry.client-BhN_AA3q.js", "imports": ["/assets/jsx-runtime-D_zvdyIk.js", "/assets/chunk-OIYGIGL5-BjQr_l_M.js", "/assets/index-CpAFY4EY.js"], "css": [] }, "routes": { "root": { "id": "root", "parentId": void 0, "path": "", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/root-OOvdMYJb.js", "imports": ["/assets/jsx-runtime-D_zvdyIk.js", "/assets/chunk-OIYGIGL5-BjQr_l_M.js", "/assets/index-CpAFY4EY.js", "/assets/auth-provider-Diczkjh1.js", "/assets/theme-provider-CUZGnFwL.js", "/assets/supabase-BHBWl_Zr.js", "/assets/QueryClientProvider-ChAT3DNt.js", "/assets/mutation-BtzxBK-B.js", "/assets/infiniteQueryBehavior-__kUNdpl.js"], "css": ["/assets/root-DadZOTrH.css"], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/public/health": { "id": "routes/public/health", "parentId": "root", "path": "health", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/health-BlTDQr1n.js", "imports": ["/assets/chunk-OIYGIGL5-BjQr_l_M.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "auth/layout": { "id": "auth/layout", "parentId": "root", "path": void 0, "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/layout-CQnAZFmC.js", "imports": ["/assets/chunk-OIYGIGL5-BjQr_l_M.js", "/assets/jsx-runtime-D_zvdyIk.js", "/assets/auth-provider-Diczkjh1.js", "/assets/redirect-D7e2wz-9.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "auth/login": { "id": "auth/login", "parentId": "auth/layout", "path": "login", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/login-Y6srvH2f.js", "imports": ["/assets/chunk-OIYGIGL5-BjQr_l_M.js", "/assets/jsx-runtime-D_zvdyIk.js", "/assets/auth-provider-Diczkjh1.js", "/assets/mail-C6USHQwt.js", "/assets/redirect-D7e2wz-9.js", "/assets/eye-DMWkklOV.js", "/assets/button-Lf--0ePE.js", "/assets/card-CfdgI_6O.js", "/assets/input-B6_poRDs.js", "/assets/label-DlsFJCEv.js", "/assets/utils-BEHD0UYf.js", "/assets/loader-circle-BLBYjE2T.js", "/assets/lock-Cn8RQiRM.js", "/assets/createLucideIcon-CwMMISn7.js", "/assets/index-yifceNX_.js", "/assets/index-B2a0W2do.js", "/assets/index-CpAFY4EY.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "auth/register": { "id": "auth/register", "parentId": "auth/layout", "path": "register", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/register-BRKDzl-e.js", "imports": ["/assets/chunk-OIYGIGL5-BjQr_l_M.js", "/assets/jsx-runtime-D_zvdyIk.js", "/assets/mail-C6USHQwt.js", "/assets/auth-provider-Diczkjh1.js", "/assets/redirect-D7e2wz-9.js", "/assets/eye-DMWkklOV.js", "/assets/button-Lf--0ePE.js", "/assets/card-CfdgI_6O.js", "/assets/input-B6_poRDs.js", "/assets/label-DlsFJCEv.js", "/assets/utils-BEHD0UYf.js", "/assets/loader-circle-BLBYjE2T.js", "/assets/check-P3aSJU2R.js", "/assets/lock-Cn8RQiRM.js", "/assets/x-GpSf1MKW.js", "/assets/createLucideIcon-CwMMISn7.js", "/assets/index-yifceNX_.js", "/assets/index-B2a0W2do.js", "/assets/index-CpAFY4EY.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "auth/resetPassword": { "id": "auth/resetPassword", "parentId": "auth/layout", "path": "/auth/reset-password", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/resetPassword-CCKIBudm.js", "imports": ["/assets/chunk-OIYGIGL5-BjQr_l_M.js", "/assets/jsx-runtime-D_zvdyIk.js", "/assets/auth-provider-Diczkjh1.js", "/assets/redirect-D7e2wz-9.js", "/assets/eye-DMWkklOV.js", "/assets/button-Lf--0ePE.js", "/assets/card-CfdgI_6O.js", "/assets/input-B6_poRDs.js", "/assets/label-DlsFJCEv.js", "/assets/utils-BEHD0UYf.js", "/assets/loader-circle-BLBYjE2T.js", "/assets/lock-Cn8RQiRM.js", "/assets/index-yifceNX_.js", "/assets/createLucideIcon-CwMMISn7.js", "/assets/index-B2a0W2do.js", "/assets/index-CpAFY4EY.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/layouts/public-layout": { "id": "routes/layouts/public-layout", "parentId": "root", "path": void 0, "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/public-layout-cJx8cvei.js", "imports": ["/assets/chunk-OIYGIGL5-BjQr_l_M.js", "/assets/jsx-runtime-D_zvdyIk.js", "/assets/button-Lf--0ePE.js", "/assets/separator-Bpo7Y29Y.js", "/assets/mode-toggle-D08M6dEu.js", "/assets/index-yifceNX_.js", "/assets/utils-BEHD0UYf.js", "/assets/index-B2a0W2do.js", "/assets/index-CpAFY4EY.js", "/assets/dropdown-menu-BJZCd5Pg.js", "/assets/index-BsqcEdqH.js", "/assets/index-7INpPUcb.js", "/assets/check-P3aSJU2R.js", "/assets/createLucideIcon-CwMMISn7.js", "/assets/theme-provider-CUZGnFwL.js", "/assets/sun-DiAVwtG2.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/public/home": { "id": "routes/public/home", "parentId": "routes/layouts/public-layout", "path": void 0, "index": true, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/home-Cy_SoxIa.js", "imports": ["/assets/chunk-OIYGIGL5-BjQr_l_M.js", "/assets/jsx-runtime-D_zvdyIk.js", "/assets/badge-B95kivET.js", "/assets/button-Lf--0ePE.js", "/assets/card-CfdgI_6O.js", "/assets/separator-Bpo7Y29Y.js", "/assets/chart-column-BHJwCZlW.js", "/assets/qr-code-DupRlWHo.js", "/assets/createLucideIcon-CwMMISn7.js", "/assets/shield-check-C1YTS7NA.js", "/assets/settings-DWiAJPd0.js", "/assets/calendar-xf6wNq1b.js", "/assets/utensils-crossed-DKyfe-yl.js", "/assets/coffee-ChEYAlcZ.js", "/assets/book-open-CR1OFFzI.js", "/assets/file-text-BVIg4UvA.js", "/assets/index-yifceNX_.js", "/assets/utils-BEHD0UYf.js", "/assets/index-B2a0W2do.js", "/assets/index-CpAFY4EY.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/public/tutorial": { "id": "routes/public/tutorial", "parentId": "routes/layouts/public-layout", "path": "tutorial", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/tutorial-wt6y2_6W.js", "imports": ["/assets/chunk-OIYGIGL5-BjQr_l_M.js", "/assets/jsx-runtime-D_zvdyIk.js", "/assets/badge-B95kivET.js", "/assets/button-Lf--0ePE.js", "/assets/card-CfdgI_6O.js", "/assets/separator-Bpo7Y29Y.js", "/assets/book-open-CR1OFFzI.js", "/assets/createLucideIcon-CwMMISn7.js", "/assets/settings-DWiAJPd0.js", "/assets/save-DNPrnFJo.js", "/assets/qr-code-DupRlWHo.js", "/assets/lock-Cn8RQiRM.js", "/assets/refresh-cw-BWYUqUKP.js", "/assets/shield-check-C1YTS7NA.js", "/assets/camera-C1ij0UEm.js", "/assets/triangle-alert-hVLEMC_8.js", "/assets/index-yifceNX_.js", "/assets/utils-BEHD0UYf.js", "/assets/index-B2a0W2do.js", "/assets/index-CpAFY4EY.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/public/changelog": { "id": "routes/public/changelog", "parentId": "routes/layouts/public-layout", "path": "changelog", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/changelog-OES-Zx7T.js", "imports": ["/assets/chunk-OIYGIGL5-BjQr_l_M.js", "/assets/jsx-runtime-D_zvdyIk.js", "/assets/useBaseQuery-CE2J4sU2.js", "/assets/infiniteQueryBehavior-__kUNdpl.js", "/assets/supabase-BHBWl_Zr.js", "/assets/card-CfdgI_6O.js", "/assets/QueryClientProvider-ChAT3DNt.js", "/assets/utils-BEHD0UYf.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/layouts/app-layout": { "id": "routes/layouts/app-layout", "parentId": "root", "path": void 0, "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/app-layout-CBquYb5U.js", "imports": ["/assets/chunk-OIYGIGL5-BjQr_l_M.js", "/assets/jsx-runtime-D_zvdyIk.js", "/assets/supabase-BHBWl_Zr.js", "/assets/index-yifceNX_.js", "/assets/utils-BEHD0UYf.js", "/assets/button-Lf--0ePE.js", "/assets/index-B5FmTQpp.js", "/assets/x-GpSf1MKW.js", "/assets/index-BsqcEdqH.js", "/assets/index-7INpPUcb.js", "/assets/index-B2a0W2do.js", "/assets/index-BnHrxEV7.js", "/assets/createLucideIcon-CwMMISn7.js", "/assets/auth-provider-Diczkjh1.js", "/assets/QueryClientProvider-ChAT3DNt.js", "/assets/useBaseQuery-CE2J4sU2.js", "/assets/useMutation-CbNZKspy.js", "/assets/index-BRsIKSDg.js", "/assets/file-text-BVIg4UvA.js", "/assets/settings-DWiAJPd0.js", "/assets/shield-check-C1YTS7NA.js", "/assets/utensils-crossed-DKyfe-yl.js", "/assets/index-BCAIc7o-.js", "/assets/dialog-CZqiNxs2.js", "/assets/qr-code-DupRlWHo.js", "/assets/input-B6_poRDs.js", "/assets/AdminService-CgJGPFg0.js", "/assets/mode-toggle-D08M6dEu.js", "/assets/dropdown-menu-BJZCd5Pg.js", "/assets/index-CpAFY4EY.js", "/assets/mutation-BtzxBK-B.js", "/assets/useQuery-DJjewD8N.js", "/assets/theme-provider-CUZGnFwL.js", "/assets/sun-DiAVwtG2.js", "/assets/check-P3aSJU2R.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/protected/profile": { "id": "routes/protected/profile", "parentId": "routes/layouts/app-layout", "path": "profile", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/profile-hnOY6z2m.js", "imports": ["/assets/chunk-OIYGIGL5-BjQr_l_M.js", "/assets/jsx-runtime-D_zvdyIk.js", "/assets/useQuery-DJjewD8N.js", "/assets/QueryClientProvider-ChAT3DNt.js", "/assets/useMutation-CbNZKspy.js", "/assets/auth-provider-Diczkjh1.js", "/assets/supabase-BHBWl_Zr.js", "/assets/button-Lf--0ePE.js", "/assets/input-B6_poRDs.js", "/assets/separator-Bpo7Y29Y.js", "/assets/useBaseQuery-CE2J4sU2.js", "/assets/mutation-BtzxBK-B.js", "/assets/index-yifceNX_.js", "/assets/utils-BEHD0UYf.js", "/assets/index-B2a0W2do.js", "/assets/index-CpAFY4EY.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/protected/rancho": { "id": "routes/protected/rancho", "parentId": "routes/layouts/app-layout", "path": "rancho", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/rancho-BvNBG8iJ.js", "imports": ["/assets/supabase-BHBWl_Zr.js", "/assets/chunk-OIYGIGL5-BjQr_l_M.js", "/assets/jsx-runtime-D_zvdyIk.js", "/assets/button-Lf--0ePE.js", "/assets/useQuery-DJjewD8N.js", "/assets/QueryClientProvider-ChAT3DNt.js", "/assets/auth-provider-Diczkjh1.js", "/assets/card-CfdgI_6O.js", "/assets/label-DlsFJCEv.js", "/assets/useMessHalls-DOz8GpeU.js", "/assets/index-BRsIKSDg.js", "/assets/settings-DWiAJPd0.js", "/assets/triangle-alert-hVLEMC_8.js", "/assets/loader-circle-BLBYjE2T.js", "/assets/RanchoUtils-CDHCvR11.js", "/assets/coffee-ChEYAlcZ.js", "/assets/sun-DiAVwtG2.js", "/assets/badge-B95kivET.js", "/assets/utils-BEHD0UYf.js", "/assets/check-P3aSJU2R.js", "/assets/x-GpSf1MKW.js", "/assets/MessHallSelector-Ddc9UKgG.js", "/assets/calendar-xf6wNq1b.js", "/assets/utensils-crossed-DKyfe-yl.js", "/assets/createLucideIcon-CwMMISn7.js", "/assets/circle-check-ChEJ_whZ.js", "/assets/save-DNPrnFJo.js", "/assets/refresh-cw-BWYUqUKP.js", "/assets/index-yifceNX_.js", "/assets/useBaseQuery-CE2J4sU2.js", "/assets/index-B2a0W2do.js", "/assets/index-CpAFY4EY.js", "/assets/index-BsqcEdqH.js", "/assets/index-BnHrxEV7.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/protected/selfCheckIn": { "id": "routes/protected/selfCheckIn", "parentId": "routes/layouts/app-layout", "path": "checkin", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/selfCheckIn-Bit-RVZZ.js", "imports": ["/assets/chunk-OIYGIGL5-BjQr_l_M.js", "/assets/jsx-runtime-D_zvdyIk.js", "/assets/supabase-BHBWl_Zr.js", "/assets/index-BRsIKSDg.js", "/assets/button-Lf--0ePE.js", "/assets/index-CpAFY4EY.js", "/assets/index-yifceNX_.js", "/assets/utils-BEHD0UYf.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/protected/presence": { "id": "routes/protected/presence", "parentId": "routes/layouts/app-layout", "path": "fiscal", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/presence-D7NZrZhb.js", "imports": ["/assets/chunk-OIYGIGL5-BjQr_l_M.js", "/assets/jsx-runtime-D_zvdyIk.js", "/assets/supabase-BHBWl_Zr.js", "/assets/button-Lf--0ePE.js", "/assets/label-DlsFJCEv.js", "/assets/table-C7VMFkZa.js", "/assets/index-BRsIKSDg.js", "/assets/badge-B95kivET.js", "/assets/useMessHalls-DOz8GpeU.js", "/assets/MessHallSelector-Ddc9UKgG.js", "/assets/RanchoUtils-CDHCvR11.js", "/assets/calendar-xf6wNq1b.js", "/assets/check-P3aSJU2R.js", "/assets/index-BsqcEdqH.js", "/assets/index-yifceNX_.js", "/assets/index-B5FmTQpp.js", "/assets/utils-BEHD0UYf.js", "/assets/createLucideIcon-CwMMISn7.js", "/assets/useQuery-DJjewD8N.js", "/assets/QueryClientProvider-ChAT3DNt.js", "/assets/useMutation-CbNZKspy.js", "/assets/auth-provider-Diczkjh1.js", "/assets/AdminService-CgJGPFg0.js", "/assets/camera-C1ij0UEm.js", "/assets/refresh-cw-BWYUqUKP.js", "/assets/index-B2a0W2do.js", "/assets/index-CpAFY4EY.js", "/assets/index-BnHrxEV7.js", "/assets/index-7INpPUcb.js", "/assets/useBaseQuery-CE2J4sU2.js", "/assets/mutation-BtzxBK-B.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/protected/adminPanel": { "id": "routes/protected/adminPanel", "parentId": "routes/layouts/app-layout", "path": "admin", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/adminPanel-URJtuc0b.js", "imports": ["/assets/chunk-OIYGIGL5-BjQr_l_M.js", "/assets/jsx-runtime-D_zvdyIk.js", "/assets/auth-provider-Diczkjh1.js", "/assets/AdminService-CgJGPFg0.js", "/assets/shield-BWJ6xpKI.js", "/assets/label-DlsFJCEv.js", "/assets/chart-column-BHJwCZlW.js", "/assets/index-BCAIc7o-.js", "/assets/MessHallSelector-Ddc9UKgG.js", "/assets/qr-code-DupRlWHo.js", "/assets/circle-check-ChEJ_whZ.js", "/assets/useQuery-DJjewD8N.js", "/assets/useBaseQuery-CE2J4sU2.js", "/assets/QueryClientProvider-ChAT3DNt.js", "/assets/supabase-BHBWl_Zr.js", "/assets/createLucideIcon-CwMMISn7.js", "/assets/index-B2a0W2do.js", "/assets/index-CpAFY4EY.js", "/assets/index-yifceNX_.js", "/assets/utils-BEHD0UYf.js", "/assets/badge-B95kivET.js", "/assets/useMessHalls-DOz8GpeU.js", "/assets/index-BsqcEdqH.js", "/assets/index-BnHrxEV7.js", "/assets/check-P3aSJU2R.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/protected/superAdminPanel": { "id": "routes/protected/superAdminPanel", "parentId": "routes/layouts/app-layout", "path": "superadmin", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/superAdminPanel-B2lsRcKN.js", "imports": ["/assets/chunk-OIYGIGL5-BjQr_l_M.js", "/assets/jsx-runtime-D_zvdyIk.js", "/assets/useQuery-DJjewD8N.js", "/assets/QueryClientProvider-ChAT3DNt.js", "/assets/useMutation-CbNZKspy.js", "/assets/supabase-BHBWl_Zr.js", "/assets/shield-BWJ6xpKI.js", "/assets/label-DlsFJCEv.js", "/assets/index-BRsIKSDg.js", "/assets/badge-B95kivET.js", "/assets/button-Lf--0ePE.js", "/assets/index-yifceNX_.js", "/assets/index-BsqcEdqH.js", "/assets/useMessHalls-DOz8GpeU.js", "/assets/index-7INpPUcb.js", "/assets/index-B2a0W2do.js", "/assets/utils-BEHD0UYf.js", "/assets/check-P3aSJU2R.js", "/assets/dropdown-menu-BJZCd5Pg.js", "/assets/input-B6_poRDs.js", "/assets/table-C7VMFkZa.js", "/assets/dialog-CZqiNxs2.js", "/assets/createLucideIcon-CwMMISn7.js", "/assets/card-CfdgI_6O.js", "/assets/auth-provider-Diczkjh1.js", "/assets/AdminService-CgJGPFg0.js", "/assets/useBaseQuery-CE2J4sU2.js", "/assets/mutation-BtzxBK-B.js", "/assets/index-CpAFY4EY.js", "/assets/index-BnHrxEV7.js", "/assets/index-B5FmTQpp.js", "/assets/x-GpSf1MKW.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/public/notFound": { "id": "routes/public/notFound", "parentId": "root", "path": "*", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/notFound-CHbLcN4d.js", "imports": ["/assets/chunk-OIYGIGL5-BjQr_l_M.js", "/assets/jsx-runtime-D_zvdyIk.js", "/assets/badge-B95kivET.js", "/assets/button-Lf--0ePE.js", "/assets/triangle-alert-hVLEMC_8.js", "/assets/index-yifceNX_.js", "/assets/utils-BEHD0UYf.js", "/assets/createLucideIcon-CwMMISn7.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 } }, "url": "/assets/manifest-42f7949b.js", "version": "42f7949b", "sri": void 0 };
const assetsBuildDirectory = "build/client";
const basename = "/";
const future = { "v8_middleware": true, "unstable_optimizeDeps": false, "unstable_splitRouteModules": false, "unstable_subResourceIntegrity": false, "unstable_viteEnvironmentApi": false };
const ssr = true;
const isSpaMode = false;
const prerender = [];
const routeDiscovery = { "mode": "lazy", "manifestPath": "/__manifest" };
const publicPath = "/";
const entry = { module: entryServer };
const routes = {
  "root": {
    id: "root",
    parentId: void 0,
    path: "",
    index: void 0,
    caseSensitive: void 0,
    module: route0
  },
  "routes/public/health": {
    id: "routes/public/health",
    parentId: "root",
    path: "health",
    index: void 0,
    caseSensitive: void 0,
    module: route1
  },
  "auth/layout": {
    id: "auth/layout",
    parentId: "root",
    path: void 0,
    index: void 0,
    caseSensitive: void 0,
    module: route2
  },
  "auth/login": {
    id: "auth/login",
    parentId: "auth/layout",
    path: "login",
    index: void 0,
    caseSensitive: void 0,
    module: route3
  },
  "auth/register": {
    id: "auth/register",
    parentId: "auth/layout",
    path: "register",
    index: void 0,
    caseSensitive: void 0,
    module: route4
  },
  "auth/resetPassword": {
    id: "auth/resetPassword",
    parentId: "auth/layout",
    path: "/auth/reset-password",
    index: void 0,
    caseSensitive: void 0,
    module: route5
  },
  "routes/layouts/public-layout": {
    id: "routes/layouts/public-layout",
    parentId: "root",
    path: void 0,
    index: void 0,
    caseSensitive: void 0,
    module: route6
  },
  "routes/public/home": {
    id: "routes/public/home",
    parentId: "routes/layouts/public-layout",
    path: void 0,
    index: true,
    caseSensitive: void 0,
    module: route7
  },
  "routes/public/tutorial": {
    id: "routes/public/tutorial",
    parentId: "routes/layouts/public-layout",
    path: "tutorial",
    index: void 0,
    caseSensitive: void 0,
    module: route8
  },
  "routes/public/changelog": {
    id: "routes/public/changelog",
    parentId: "routes/layouts/public-layout",
    path: "changelog",
    index: void 0,
    caseSensitive: void 0,
    module: route9
  },
  "routes/layouts/app-layout": {
    id: "routes/layouts/app-layout",
    parentId: "root",
    path: void 0,
    index: void 0,
    caseSensitive: void 0,
    module: route10
  },
  "routes/protected/profile": {
    id: "routes/protected/profile",
    parentId: "routes/layouts/app-layout",
    path: "profile",
    index: void 0,
    caseSensitive: void 0,
    module: route11
  },
  "routes/protected/rancho": {
    id: "routes/protected/rancho",
    parentId: "routes/layouts/app-layout",
    path: "rancho",
    index: void 0,
    caseSensitive: void 0,
    module: route12
  },
  "routes/protected/selfCheckIn": {
    id: "routes/protected/selfCheckIn",
    parentId: "routes/layouts/app-layout",
    path: "checkin",
    index: void 0,
    caseSensitive: void 0,
    module: route13
  },
  "routes/protected/presence": {
    id: "routes/protected/presence",
    parentId: "routes/layouts/app-layout",
    path: "fiscal",
    index: void 0,
    caseSensitive: void 0,
    module: route14
  },
  "routes/protected/adminPanel": {
    id: "routes/protected/adminPanel",
    parentId: "routes/layouts/app-layout",
    path: "admin",
    index: void 0,
    caseSensitive: void 0,
    module: route15
  },
  "routes/protected/superAdminPanel": {
    id: "routes/protected/superAdminPanel",
    parentId: "routes/layouts/app-layout",
    path: "superadmin",
    index: void 0,
    caseSensitive: void 0,
    module: route16
  },
  "routes/public/notFound": {
    id: "routes/public/notFound",
    parentId: "root",
    path: "*",
    index: void 0,
    caseSensitive: void 0,
    module: route17
  }
};
export {
  serverManifest as assets,
  assetsBuildDirectory,
  basename,
  entry,
  future,
  isSpaMode,
  prerender,
  publicPath,
  routeDiscovery,
  routes,
  ssr
};

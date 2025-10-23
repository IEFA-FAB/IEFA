import { useEffect, useMemo, useState } from "react";
import {
  useLocation,
  useNavigate,
  type Location as RouterLocation,
} from "react-router";
import supabase from "../utils/supabase.client";
import { useAuth } from "../model/auth-provider";
import { safeRedirect, getRedirectTo } from "../model/redirect";

import { Button } from "@iefa/ui";
import { Input } from "@iefa/ui";
import { Label } from "@iefa/ui";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@iefa/ui";
import { Alert, AlertDescription } from "@iefa/ui";
import {
  Loader2,
  Lock,
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
} from "lucide-react";
import { cn } from "@iefa/ui";

function getSearchParams(location: RouterLocation) {
  const hashParams = new URLSearchParams(
    (location.hash || "").replace(/^#/, "")
  );
  const queryParams = new URLSearchParams(location.search || "");
  return { hashParams, queryParams };
}

export function ResetPassword() {
  const { isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState("");
  const [success, setSuccess] = useState(false);

  // Estados para validação/obtenção de sessão
  const [isVerifying, setIsVerifying] = useState(true);
  const [verified, setVerified] = useState(false);
  const [verifyError, setVerifyError] = useState("");

  // Extrai token_hash (tanto do hash quanto da query) e detecta link de recovery padrão do Supabase
  const { tokenHash, isRecoveryLink } = useMemo(() => {
    const { hashParams, queryParams } = getSearchParams(location);
    const tHash =
      hashParams.get("token_hash") ||
      queryParams.get("token_hash") ||
      hashParams.get("token") ||
      queryParams.get("token") ||
      null;

    const recovery = (location.hash || "").includes("type=recovery");
    return { tokenHash: tHash, isRecoveryLink: recovery };
  }, [location.hash, location.search]);

  // Verifica/Cria sessão a partir do token_hash (OTP) ou do link de recovery
  useEffect(() => {
    let isMounted = true;

    async function ensureSession() {
      setIsVerifying(true);
      setVerifyError("");

      try {
        // 1) Já existe sessão?
        const { data: sessionData, error: sessionErr } =
          await supabase.auth.getSession();
        if (sessionErr) {
          console.warn("getSession error:", sessionErr.message);
        }
        if (sessionData?.session?.user) {
          if (!isMounted) return;
          setVerified(true);
          setIsVerifying(false);
          return;
        }

        // 2) Tentar criar sessão com token_hash (OTP -> verifyOtp)
        if (tokenHash) {
          const { data, error } = await supabase.auth.verifyOtp({
            type: "recovery",
            token_hash: tokenHash,
          });

          if (error) {
            throw new Error(
              error.message ||
                "Falha ao validar o token de recuperação. Solicite um novo link."
            );
          }

          if (data?.session?.user) {
            if (!isMounted) return;
            setVerified(true);
            setIsVerifying(false);

            // Limpa o token da URL para evitar reaproveitamento/efeitos colaterais
            const cleanUrl = location.pathname;
            navigate(cleanUrl, { replace: true });
            return;
          }
        }

        // 3) Caso seja o link de recovery padrão do Supabase (#type=recovery)
        if (isRecoveryLink) {
          const { data: s2 } = await supabase.auth.getSession();
          if (s2?.session?.user) {
            if (!isMounted) return;
            setVerified(true);
            setIsVerifying(false);
            return;
          }
        }

        // 4) Nada deu certo => inválido/expirado
        if (!isMounted) return;
        setVerifyError(
          "Link de recuperação inválido ou expirado. Solicite novamente."
        );
        setVerified(false);
        setIsVerifying(false);
      } catch (e: any) {
        if (!isMounted) return;
        setVerifyError(
          e?.message ||
            "Não foi possível validar o link de recuperação. Solicite novamente."
        );
        setVerified(false);
        setIsVerifying(false);
      }
    }

    ensureSession();
    return () => {
      isMounted = false;
    };
  }, [tokenHash, isRecoveryLink, navigate, location.pathname]);

  const handleSubmit = async (e: React.FormEvent) => {
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

      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        const msg =
          error.message === "Invalid token: token-type not supported"
            ? "Link inválido ou expirado. Solicite novamente."
            : error.message;
        throw new Error(msg);
      }

      setSuccess(true);

      // Navega usando mesmo padrão de redirect (se houver)
      const target = safeRedirect(
        getRedirectTo(location.search, location.state),
        "/rancho"
      );
      setTimeout(() => navigate(target, { replace: true }), 1200);
    } catch (err: any) {
      setApiError(
        err?.message || "Falha ao atualizar a senha. Tente novamente."
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Estados intermediários ou link inválido
  if (
    (!isLoading && !verified && (isVerifying || verifyError)) ||
    (!isLoading && verifyError)
  ) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="text-2xl text-center">
            {isVerifying ? "Validando link..." : "Link inválido"}
          </CardTitle>
          <CardDescription className="text-center">
            {isVerifying
              ? "Aguarde enquanto validamos seu link de recuperação."
              : verifyError || "O link de recuperação é inválido ou expirou."}
          </CardDescription>
        </CardHeader>
        {!isVerifying && (
          <CardFooter className="flex flex-col space-y-3">
            <Button onClick={() => navigate("/login")} className="w-full">
              Voltar ao Login
            </Button>
          </CardFooter>
        )}
      </Card>
    );
  }

  // Formulário de redefinição de senha (somente quando verified = true)
  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl text-center">
          Definir nova senha
        </CardTitle>
        <CardDescription className="text-center">
          Crie sua nova senha para acessar o SISUB
        </CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {apiError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{apiError}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                Senha atualizada com sucesso! Redirecionando...
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="password">Nova senha</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 pr-10"
                required
                minLength={6}
                disabled={submitting || success}
                autoComplete="new-password"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowPassword(!showPassword)}
                disabled={submitting || success}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Mínimo de 6 caracteres.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm">Confirmar nova senha</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="confirm"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={cn("pl-10 pr-10", {
                  "border-red-500 focus-visible:ring-red-500":
                    confirm.length > 0 && confirm !== password,
                })}
                required
                minLength={6}
                disabled={submitting || success}
                autoComplete="new-password"
              />
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col space-y-4">
          <Button
            type="submit"
            className="w-full my-2 py-3 text-lg font-semibold"
            disabled={
              submitting ||
              success ||
              !password ||
              !confirm ||
              password !== confirm ||
              password.length < 6
            }
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitting ? "Atualizando..." : "Atualizar senha"}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => navigate("/login")}
            disabled={submitting}
          >
            Voltar ao Login
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

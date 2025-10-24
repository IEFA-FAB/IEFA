import { useEffect, useState } from "react";
import type { Route } from "./+types/superAdminPanel";
import { Navigate } from "react-router";
import { useAuth } from "@iefa/auth";
import { checkUserLevel } from "~/components/UserLevel/AdminService";
import supabase from "~/utils/supabase";

import SuperAdminHero from "~/components/super-admin/SuperAdminHero";
import IndicatorsCard from "~/components/super-admin/IndicatorsCard";
import ProfilesManager from "~/components/super-admin/ProfilesManager";

// shadcn/ui
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@iefa/ui";
import { Label } from "@iefa/ui";
import { Switch } from "@iefa/ui";
import { Textarea } from "@iefa/ui";
import { Button } from "@iefa/ui";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Painel SuperAdmin" },
    { name: "description", content: "Controle o Sistema" },
  ];
}

type EvalConfig = {
  active: boolean;
  value: string;
};

export default function SuperAdminPanel() {
  const { user } = useAuth();

  // Gate de acesso
  const [shouldRedirect, setShouldRedirect] = useState(false);
  useEffect(() => {
    const fetchUserLevel = async () => {
      if (!user?.id) return;
      const level = await checkUserLevel(user.id);
      if (level !== "superadmin") setShouldRedirect(true);
    };
    fetchUserLevel();
  }, [user?.id]);

  // Fade-in de entrada
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 10);
    return () => clearTimeout(t);
  }, []);

  // Estado do controle de avaliação
  const [loadingEval, setLoadingEval] = useState(true);
  const [savingEval, setSavingEval] = useState(false);
  const [evalConfig, setEvalConfig] = useState<EvalConfig>({
    active: false,
    value: "",
  });
  const [initialEvalConfig, setInitialEvalConfig] = useState<EvalConfig | null>(
    null
  );
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const dirty =
    !!initialEvalConfig &&
    (evalConfig.active !== initialEvalConfig.active ||
      evalConfig.value !== initialEvalConfig.value);

  const invalid =
    (evalConfig.active && !evalConfig.value.trim()) ||
    savingEval ||
    loadingEval;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!user?.id) return;
      setLoadingEval(true);
      setSaveMessage(null);
      setSaveError(null);

      const { data, error } = await supabase
        .from("super_admin_controller")
        .select("key, active, value")
        .eq("key", "evaluation")
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error("Erro ao carregar evaluation:", error);
        setSaveError("Não foi possível carregar a configuração de avaliação.");
        setEvalConfig({ active: false, value: "" });
        setInitialEvalConfig({ active: false, value: "" });
        setLoadingEval(false);
        return;
      }

      const active = !!data?.active;
      const value =
        typeof data?.value === "string"
          ? data.value
          : data?.value == null
            ? ""
            : String(data.value);

      const cfg: EvalConfig = { active, value };
      setEvalConfig(cfg);
      setInitialEvalConfig(cfg);
      setLoadingEval(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleSave = async () => {
    if (!user?.id) return;
    setSavingEval(true);
    setSaveMessage(null);
    setSaveError(null);

    try {
      // upsert pela key
      const { data, error } = await supabase
        .from("super_admin_controller")
        .upsert(
          {
            key: "evaluation",
            active: evalConfig.active,
            value: evalConfig.value,
          },
          { onConflict: "key" }
        )
        .select("key, active, value")
        .maybeSingle();

      if (error) throw error;

      const saved: EvalConfig = {
        active: !!data?.active,
        value:
          typeof data?.value === "string"
            ? data.value
            : data?.value == null
              ? ""
              : String(data.value),
      };

      setEvalConfig(saved);
      setInitialEvalConfig(saved);
      setSaveMessage("Configuração salva com sucesso.");
    } catch (e: any) {
      console.error("Erro ao salvar evaluation:", e);
      setSaveError(
        e?.message ||
          "Não foi possível salvar. Verifique as permissões (RLS) e a constraint única em 'key'."
      );
    } finally {
      setSavingEval(false);
    }
  };

  const handleReset = () => {
    if (!initialEvalConfig) return;
    setEvalConfig(initialEvalConfig);
    setSaveMessage(null);
    setSaveError(null);
  };

  if (shouldRedirect) {
    return <Navigate to="/rancho" replace />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
      {/* Hero */}
      <section
        id="hero"
        className={`container mx-auto max-w-screen-2xl px-4 pt-10 md:pt-14 transition-all duration-500 ${
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        <SuperAdminHero />
      </section>

      {/* Conteúdo */}
      <section
        id="content"
        className={`container mx-auto max-w-screen-2xl px-4 py-10 md:py-14 transition-all duration-500 delay-100 ${
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        <div className="grid grid-cols-1 gap-6 lg:gap-8">
          <IndicatorsCard />
          <ProfilesManager />

          {/* Controle da Pergunta de Avaliação */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle>Configuração da Pergunta de Avaliação</CardTitle>
              <CardDescription>
                Ligue/desligue a pergunta global de avaliação e defina o texto
                exibido aos usuários.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Linha: Ativar/Desativar */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="evaluation-active" className="text-base">
                    Ativar pergunta
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Quando ativo, usuários que ainda não responderam verão a
                    pergunta.
                  </p>
                </div>
                <Switch
                  id="evaluation-active"
                  className="cursor-pointer"
                  checked={evalConfig.active}
                  onCheckedChange={(v: boolean) =>
                    setEvalConfig((prev) => ({ ...prev, active: v }))
                  }
                  disabled={loadingEval || savingEval}
                />
              </div>

              {/* Pergunta (textarea) */}
              <div className="space-y-2">
                <Label htmlFor="evaluation-question">Texto da pergunta</Label>
                <Textarea
                  id="evaluation-question"
                  placeholder="Ex.: Como você avalia sua experiência no Rancho?"
                  value={evalConfig.value}
                  onChange={(e) =>
                    setEvalConfig((prev) => ({
                      ...prev,
                      value: e.target.value,
                    }))
                  }
                  disabled={loadingEval || savingEval}
                  rows={3}
                  maxLength={240}
                  className="resize-y"
                />
                <div className="flex justify-end text-xs text-muted-foreground">
                  {evalConfig.value.length}/240
                </div>
              </div>

              {/* Estado de carregamento/erro */}
              {loadingEval && (
                <p className="text-sm text-muted-foreground">
                  Carregando configuração...
                </p>
              )}
              {saveError && <p className="text-sm text-red-600">{saveError}</p>}
              {saveMessage && (
                <p className="text-sm text-green-600">{saveMessage}</p>
              )}
            </CardContent>

            <CardFooter className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={handleReset}
                disabled={!dirty || savingEval || loadingEval}
              >
                Reverter
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={!dirty || invalid}
              >
                {savingEval ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-b-transparent" />
                    Salvando...
                  </span>
                ) : (
                  "Salvar alterações"
                )}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </section>
    </div>
  );
}

// components/DefaultMessHallSelector.tsx
import { memo, useCallback, useMemo, useState } from "react";
import { Settings, CheckCircle, Loader2, AlertTriangle } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Label,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@iefa/ui";
import { useMessHalls } from "~/components/hooks/useMessHalls";
import supabase from "~/utils/supabase";
import { toast } from "sonner";
import { useAuth } from "@iefa/auth";

interface DefaultMessHallSelectorProps {
  defaultMessHallCode: string;
  setDefaultMessHallCode: (code: string) => void;
  onApply: () => Promise<void>;
  onCancel: () => void;
  isApplying: boolean;
}

export const DefaultMessHallSelector = memo<DefaultMessHallSelectorProps>(
  ({
    defaultMessHallCode,
    setDefaultMessHallCode,
    onApply,
    onCancel,
    isApplying,
  }) => {
    const { messHalls } = useMessHalls();
    const { user } = useAuth();
    const [saving, setSaving] = useState(false);

    // Dados computados
    const selectorData = useMemo(() => {
      const selected = messHalls.find((mh) => mh.code === defaultMessHallCode);
      const selectedMessHallLabel = selected?.name || defaultMessHallCode;
      const hasMessHalls = (messHalls?.length ?? 0) > 0;
      return {
        selectedMessHallLabel,
        hasMessHalls,
      };
    }, [defaultMessHallCode, messHalls]);

    // Helper: obter mess_hall_id a partir do code
    const getMessHallIdByCode = useCallback(
      async (code: string): Promise<number | null> => {
        if (!code) return null;

        // 1) Tenta via cache local do hook
        const local = messHalls.find((mh) => mh.code === code) as
          | { id?: number }
          | undefined;
        if (local?.id) return local.id;

        // 2) Fallback: consulta no banco
        const { data, error } = await supabase
          .schema("sisub")
          .from("mess_halls")
          .select("id")
          .eq("code", code)
          .maybeSingle();

        if (error) {
          console.error("Erro ao buscar mess_hall_id:", error);
          return null;
        }
        return (data?.id as number | undefined) ?? null;
      },
      [messHalls]
    );

    // Handlers
    const handleMessHallChange = useCallback(
      (value: string) => {
        setDefaultMessHallCode(value);
      },
      [setDefaultMessHallCode]
    );

    const handleApply = useCallback(async () => {
      if (isApplying || saving) return;

      try {
        if (!user?.id || !user?.email) {
          toast.error("Erro", {
            description: "Usuário não autenticado ou sem e-mail.",
          });
          return;
        }
        if (!defaultMessHallCode) {
          toast.error("Seleção inválida", {
            description: "Escolha um rancho para continuar.",
          });
          return;
        }

        setSaving(true);

        const messHallId = await getMessHallIdByCode(defaultMessHallCode);
        if (!messHallId) {
          toast.error("Rancho inválido", {
            description: "Código de rancho não encontrado.",
          });
          return;
        }

        // Upsert em sisub.user_data para o usuário atual
        const { error } = await supabase
          .schema("sisub")
          .from("user_data")
          .upsert(
            {
              id: user.id, // PK = auth.users.id
              email: user.email, // not null + unique
              default_mess_hall_id: messHallId,
            },
            { onConflict: "id" }
          );

        if (error) {
          console.error("Falha ao salvar preferência:", error);
          toast.error("Erro ao salvar preferência", {
            description:
              "Não foi possível salvar seu rancho padrão. Tente novamente.",
          });
          return;
        }

        toast.success("Preferência salva", {
          description: "Rancho padrão atualizado com sucesso.",
        });

        // Mantém integração com fluxo existente
        await onApply();
      } catch (err) {
        console.error("Erro inesperado ao aplicar rancho padrão:", err);
        toast.error("Erro", {
          description: "Falha inesperada ao salvar sua preferência.",
        });
      } finally {
        setSaving(false);
      }
    }, [
      isApplying,
      saving,
      user?.id,
      user?.email,
      defaultMessHallCode,
      getMessHallIdByCode,
      onApply,
    ]);

    const handleCancel = useCallback(() => {
      if (isApplying || saving) return;
      onCancel();
    }, [isApplying, saving, onCancel]);

    // Itens do select
    const selectItems = useMemo(() => {
      if (!messHalls || messHalls.length === 0) {
        return (
          <div className="px-2 py-4 text-sm text-muted-foreground">
            Nenhum rancho encontrado.
          </div>
        );
      }
      return messHalls.map((mh) => (
        <SelectItem
          key={mh.code}
          value={mh.code}
          className="
            cursor-pointer
            data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground
            focus:bg-accent/20
          "
        >
          {mh.name ?? mh.code}
        </SelectItem>
      ));
    }, [messHalls]);

    const { selectedMessHallLabel, hasMessHalls } = selectorData;

    return (
      <Card
        className="
          group relative w-full h-fit bg-card text-card-foreground border border-border shadow-sm transition-all duration-300 hover:shadow-md hover:border-accent max-w-xl
        "
      >
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="text-foreground">
              <span className="flex items-center gap-2">
                <span
                  className="
                    inline-flex items-center justify-center h-8 w-8 rounded-lg
                    bg-background text-foreground ring-1 ring-border
                  "
                >
                  <Settings className="h-4.5 w-4.5" />
                </span>
                <span className="font-semibold">Configurar Rancho Padrão</span>
              </span>
            </CardTitle>
          </div>

          <CardDescription className="mt-3">
            <div
              className="
                flex gap-2 rounded-md border p-2.5
                bg-accent/10 text-accent-foreground border-accent/30
              "
            >
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span className="text-sm">
                Defina um rancho padrão para os cards que ainda não possuem
                rancho definido no banco de dados. Esta ação afetará apenas os
                cards sem rancho configurado.
              </span>
            </div>
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label className="text-sm font-medium text-foreground">
              Selecione o rancho padrão:
            </Label>

            <Select
              value={defaultMessHallCode}
              onValueChange={handleMessHallChange}
              disabled={isApplying || saving || !hasMessHalls}
            >
              <SelectTrigger
                className="
                  w-full cursor-pointer
                  bg-background border border-border
                  focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background
                  hover:border-accent
                "
              >
                <SelectValue
                  placeholder={
                    hasMessHalls
                      ? "Selecione um rancho..."
                      : "Sem ranchos disponíveis"
                  }
                />
              </SelectTrigger>
              <SelectContent className="max-h-60">{selectItems}</SelectContent>
            </Select>

            {defaultMessHallCode && (
              <div
                className="
                  flex items-center gap-2 text-xs rounded-md border p-2
                  bg-muted text-muted-foreground border-border
                "
              >
                <CheckCircle className="h-3.5 w-3.5" />
                <span>
                  Rancho selecionado:{" "}
                  <strong className="text-foreground">
                    {selectedMessHallLabel}
                  </strong>
                </span>
              </div>
            )}
          </div>

          <div className="border-t border-border pt-4 flex flex-row-reverse gap-4">
            <Button
              size="sm"
              onClick={handleApply}
              disabled={isApplying || saving || !defaultMessHallCode}
              className="
                bg-primary text-primary-foreground hover:bg-primary/90
                focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background
                disabled:opacity-50 disabled:cursor-not-allowed
              "
            >
              {isApplying || saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Aplicando...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Aplicar
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={isApplying || saving}
              className="
                hover:bg-muted
                focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background
              "
            >
              Cancelar
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }
);

DefaultMessHallSelector.displayName = "DefaultMessHallSelector";

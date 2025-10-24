import { useState, useCallback, useEffect } from "react";
import supabase from "~/utils/supabase";
import { toast } from "sonner";
import type { PresenceRecord, MealKey } from "~/utils/FiscalUtils";

// O hook precisa saber o formato dos filtros
interface FiscalFilters {
  date: string;
  meal: MealKey;
  unit: string;
}

export function usePresenceManagement(filters: FiscalFilters) {
  const [presences, setPresences] = useState<PresenceRecord[]>([]);
  const [forecastMap, setForecastMap] = useState<Record<string, boolean>>({});

  // Função para carregar presenças e previsões, agora dentro do hook
  const loadPresence = useCallback(async () => {
    if (!filters.date || !filters.meal || !filters.unit) return;

    const { data, error } = await supabase
      .from("rancho_presencas")
      .select("id, user_id, date, meal, unidade, created_at")
      .eq("date", filters.date)
      .eq("meal", filters.meal)
      .eq("unidade", filters.unit)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erro ao buscar presenças:", error);
      toast.error("Erro", {
        description: "Não foi possível carregar as presenças.",
      });
      return;
    }
    const rows = data || [];
    setPresences(rows);

    if (rows.length > 0) {
      const userIds = Array.from(new Set(rows.map((p) => p.user_id)));
      const { data: previsoes, error: prevErr } = await supabase
        .from("rancho_previsoes")
        .select("user_id, vai_comer")
        .eq("data", filters.date)
        .eq("refeicao", filters.meal)
        .eq("unidade", filters.unit)
        .in("user_id", userIds);

      if (prevErr) {
        console.warn("Falha ao buscar previsões:", prevErr);
        setForecastMap({});
      } else {
        const map: Record<string, boolean> = {};
        for (const r of previsoes ?? []) {
          map[r.user_id] = !!r.vai_comer;
        }
        setForecastMap(map);
      }
    } else {
      setForecastMap({});
    }
  }, [filters]);

  // Efeito que re-executa a busca sempre que os filtros mudam
  useEffect(() => {
    loadPresence();
  }, [loadPresence]);

  // Lógica para confirmar a presença de um militar
  const confirmPresence = useCallback(
    async (uuid: string, willEnter: boolean) => {
      if (!willEnter) {
        toast.info("Registro atualizado", {
          description:
            "Decisão registrada. Militar não entrará para a refeição.",
        });
        return;
      }

      if (!filters.unit) {
        toast.error("Selecione a OM", {
          description: "É necessário informar a unidade.",
        });
        return;
      }

      const { error } = await supabase.from("rancho_presencas").insert({
        user_id: uuid,
        date: filters.date,
        meal: filters.meal,
        unidade: filters.unit,
      });

      if (error) {
        if ((error as any).code === "23505") {
          toast.info("Já registrado", {
            description: "Este militar já foi marcado presente.",
          });
        } else {
          toast.error("Erro", { description: "Falha ao salvar decisão." });
          throw error;
        }
      } else {
        toast.success("Presença registrada", {
          description: `UUID ${uuid} marcado.`,
        });
        await loadPresence(); // Revalida os dados
      }
    },
    [filters, loadPresence]
  );

  // Lógica para remover uma presença
  const removePresence = useCallback(
    async (row: PresenceRecord) => {
      const { error } = await supabase
        .from("rancho_presencas")
        .delete()
        .match({ id: row.id });

      if (error) {
        toast.error("Erro", { description: "Não foi possível excluir." });
        return;
      }
      toast.success("Excluído", { description: "Registro removido." });
      await loadPresence(); // Revalida os dados
    },
    [loadPresence]
  );

  return { presences, forecastMap, confirmPresence, removePresence };
}

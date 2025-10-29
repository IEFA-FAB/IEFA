// hooks/useRancho.ts
import { useQuery } from "@tanstack/react-query";
import supabase from "~/utils/supabase";
import {
  FALLBACK_RANCHOS,
  FALLBACK_UNIDADES,
} from "~/components/constants/rancho";

// Define o tipo para uma única unidade, para garantir a consistência
export interface Unidade {
  value: string;
  label: string;
}

export const useRancho = () => {
  const query = useQuery<readonly Unidade[], Error>({
    queryKey: ["unidades_disponiveis"],
    // Mantém o fallback na tela enquanto busca do Supabase
    placeholderData: FALLBACK_RANCHOS,
    refetchOnWindowFocus: false,
    retry: 1,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("unidades_disponiveis")
        .select("value, label")
        .order("label", { ascending: true });

      if (error) throw error;

      // Normalização defensiva
      const parsed = (data ?? []).map((u) => ({
        value: String(u.value),
        label: String(u.label),
      })) as Unidade[];

      return parsed;
    },
  });

  return {
    // Se a query falhar, continuamos exibindo o fallback
    ranchos: query.data ?? FALLBACK_RANCHOS,
    // Mantém o contrato original: "unidades" permanece com o fallback
    unidades: FALLBACK_UNIDADES as readonly Unidade[],
    // isLoading reflete estado de carregamento da query
    isLoading: query.isPending || query.isFetching,
    // Mensagem de erro amigável (ou null quando não há erro)
    error: query.error
      ? "Não foi possível carregar a lista de unidades."
      : null,
  };
};

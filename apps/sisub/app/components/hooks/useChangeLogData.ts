import { useCallback, useEffect, useRef, useState } from "react";
import supabase from "~/utils/supabase";

export type ChangelogEntry = {
  id: string;
  version: string | null;
  title: string;
  body: string;
  tags: string[] | null;
  published_at: string; // ISO string
  published: boolean;
};

type UseChangelogOptions = {
  pageSize?: number;
};

const DEFAULT_PAGE_SIZE = 10;

/**
 * Hook responsável por:
 * - Buscar páginas do changelog (com "overfetch" para detectar hasMore)
 * - Gerenciar estados de loading/erro/paginação
 * - Ignorar respostas antigas (stale) com reqIdRef
 */
export function useChangelog(options: UseChangelogOptions = {}) {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;

  const [items, setItems] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  // Evita condição de corrida entre múltiplas chamadas
  const reqIdRef = useRef(0);

  const fetchPage = useCallback(
    async (p: number, { replace = false }: { replace?: boolean } = {}) => {
      const myReqId = ++reqIdRef.current;

      if (replace) {
        setLoading(true);
        setLoadingMore(false);
        setError(null);
        setHasMore(true);
      } else {
        setLoadingMore(true);
      }

      try {
        const from = p * pageSize;
        // Overfetch +1 para detectar "hasMore" com precisão
        const to = from + pageSize; // inclusive

        const { data, error } = await supabase
          .from("changelog")
          .select("id, version, title, body, tags, published_at, published")
          .eq("published", true)
          .order("published_at", { ascending: false })
          .range(from, to);

        if (myReqId !== reqIdRef.current) return; // resposta obsoleta

        if (error) {
          if (replace) setItems([]);
          setError(error.message ?? "Não foi possível carregar o changelog.");
          setHasMore(false);
          return;
        }

        const rows = (data as ChangelogEntry[]) || [];
        const nextHasMore = rows.length > pageSize;
        const pageItems = nextHasMore ? rows.slice(0, pageSize) : rows;

        setError(null);
        setHasMore(nextHasMore);

        if (replace) {
          setItems(pageItems);
          setPage(0);
        } else {
          setItems((prev) => [...prev, ...pageItems]);
          setPage(p);
        }
      } catch (e: any) {
        if (myReqId !== reqIdRef.current) return;
        if (replace) setItems([]);
        setError(e?.message ?? "Falha inesperada ao carregar o changelog.");
        setHasMore(false);
      } finally {
        if (myReqId === reqIdRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [pageSize]
  );

  const refresh = useCallback(() => {
    fetchPage(0, { replace: true });
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (loadingMore || loading || !hasMore) return;
    fetchPage(page + 1);
  }, [fetchPage, page, loadingMore, loading, hasMore]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    items,
    loading,
    loadingMore,
    error,
    page,
    hasMore,
    refresh,
    loadMore,
    busy: loading || loadingMore,
    pageSize,
  };
}
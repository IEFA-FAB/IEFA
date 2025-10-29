// hooks/useChangelog.ts
import { useCallback, useRef } from "react";
import {
  useInfiniteQuery,
  useQueryClient,
  type UseInfiniteQueryResult,
  type InfiniteData,
} from "@tanstack/react-query";
import supabase from "~/utils/supabase";
import type { PostgrestError } from "@supabase/supabase-js";

// ============================================================================
// TYPES
// ============================================================================
export interface ChangelogEntry {
  id: string;
  version: string | null;
  title: string;
  body: string;
  tags: string[] | null;
  published_at: string; // ISO string
  published: boolean;
}

export interface UseChangelogOptions {
  pageSize?: number;
  enabled?: boolean;
}

interface FetchPageParams {
  pageParam?: number;
}

interface PageResult {
  items: ChangelogEntry[];
  nextPage: number | undefined;
  hasMore: boolean;
}

export interface UseChangelogReturn {
  items: ChangelogEntry[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  page: number;
  hasMore: boolean;
  busy: boolean;
  pageSize: number;
  totalItems: number;
  refresh: () => Promise<void>;
  loadMore: () => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================
const DEFAULT_PAGE_SIZE = 10;
const STALE_TIME = 5 * 60 * 1000; // 5 minutos
const GC_TIME = 10 * 60 * 1000; // 10 minutos

// ============================================================================
// QUERY KEYS
// ============================================================================
const changelogKeys = {
  all: ["changelog"] as const,
  lists: () => [...changelogKeys.all, "list"] as const,
  list: (pageSize: number) => [...changelogKeys.lists(), pageSize] as const,
} as const;

// ============================================================================
// SUPABASE OPERATIONS
// ============================================================================
const fetchChangelogPage = async (
  page: number,
  pageSize: number
): Promise<PageResult> => {
  const from = page * pageSize;
  // Overfetch +1 para detectar "hasMore" com precisão
  const to = from + pageSize;

  const { data, error } = await supabase
    .from("changelog")
    .select("id, version, title, body, tags, published_at, published")
    .eq("published", true)
    .order("published_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error(error.message ?? "Não foi possível carregar o changelog.");
  }

  const rows = (data as ChangelogEntry[]) ?? [];
  const hasMore = rows.length > pageSize;
  const items = hasMore ? rows.slice(0, pageSize) : rows;

  return {
    items,
    nextPage: hasMore ? page + 1 : undefined,
    hasMore,
  };
};

// ============================================================================
// ERROR HANDLERS
// ============================================================================
const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  const pgError = error as PostgrestError | undefined;
  if (pgError?.message) {
    return pgError.message;
  }

  return "Falha inesperada ao carregar o changelog.";
};

// ============================================================================
// HOOK
// ============================================================================
/**
 * Hook responsável por:
 * - Buscar páginas do changelog com infinite scroll
 * - Gerenciar estados de loading/erro/paginação
 * - Cache automático e revalidação inteligente
 * - Proteção contra race conditions
 */
export function useChangelog(
  options: UseChangelogOptions = {}
): UseChangelogReturn {
  const { pageSize = DEFAULT_PAGE_SIZE, enabled = true } = options;

  const queryClient = useQueryClient();
  const reqIdRef = useRef(0);

  // ============================================================================
  // INFINITE QUERY
  // ============================================================================
  const query: UseInfiniteQueryResult<
    InfiniteData<PageResult>,
    Error
  > = useInfiniteQuery({
    queryKey: changelogKeys.list(pageSize),
    queryFn: async ({
      pageParam = 0,
    }: FetchPageParams): Promise<PageResult> => {
      const myReqId = ++reqIdRef.current;
      const result = await fetchChangelogPage(pageParam, pageSize);

      // Ignora resposta se uma requisição mais recente foi feita
      if (myReqId !== reqIdRef.current) {
        throw new Error("Stale request");
      }

      return result;
    },
    getNextPageParam: (lastPage: PageResult) => lastPage.nextPage,
    initialPageParam: 0,
    enabled,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });

  // ============================================================================
  // DERIVED STATE
  // ============================================================================
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const lastPage = query.data?.pages[query.data.pages.length - 1];
  const hasMore = lastPage?.hasMore ?? true;
  const currentPage = (query.data?.pages.length ?? 1) - 1;
  const loading = query.isLoading;
  const loadingMore = query.isFetchingNextPage;
  const busy = loading || loadingMore;
  const error = query.error ? getErrorMessage(query.error) : null;

  // ============================================================================
  // CALLBACKS
  // ============================================================================
  const refresh = useCallback(async (): Promise<void> => {
    reqIdRef.current++;
    await query.refetch();
  }, [query]);

  const loadMore = useCallback((): void => {
    if (busy || !hasMore || !query.hasNextPage) {
      return;
    }
    query.fetchNextPage();
  }, [query, busy, hasMore]);

  // ============================================================================
  // RETURN
  // ============================================================================
  return {
    items,
    loading,
    loadingMore,
    error,
    page: currentPage,
    hasMore,
    busy,
    pageSize,
    totalItems: items.length,
    refresh,
    loadMore,
  };
}

// ============================================================================
// UTILITY HOOKS
// ============================================================================
/**
 * Hook para invalidar o cache do changelog
 */
export function useInvalidateChangelog() {
  const queryClient = useQueryClient();

  return useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: changelogKeys.lists(),
    });
  }, [queryClient]);
}

/**
 * Hook para prefetch do changelog
 */
export function usePrefetchChangelog(pageSize: number = DEFAULT_PAGE_SIZE) {
  const queryClient = useQueryClient();

  return useCallback(async () => {
    await queryClient.prefetchInfiniteQuery({
      queryKey: changelogKeys.list(pageSize),
      queryFn: () => fetchChangelogPage(0, pageSize),
      initialPageParam: 0,
    });
  }, [queryClient, pageSize]);
}

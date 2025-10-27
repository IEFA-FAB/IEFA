"use client";

import * as React from "react";
import { useMemo, useRef, useState } from "react";
import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpDown, ChevronDown } from "lucide-react";

import { Button } from "@iefa/ui";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@iefa/ui";
import { Input } from "@iefa/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@iefa/ui";
import { supabaseApp } from "@/lib/supabase";
import CopyButton from "./copy-button";

/* ---------------------------------------------------------
   Helpers (padrão shadcn)
--------------------------------------------------------- */

function DebouncedInput({
  value: initialValue,
  onChange,
  debounce = 300,
  ...props
}: React.ComponentProps<"input"> & {
  value: string | number;
  onChange: (value: string) => void;
  debounce?: number;
}) {
  const [value, setValue] = useState(initialValue);

  React.useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  React.useEffect(() => {
    const t = setTimeout(() => onChange(String(value ?? "")), debounce);
    return () => clearTimeout(t);
  }, [value, debounce, onChange]);

  return (
    <Input
      {...props}
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  );
}

function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: {
  column: any;
  title: string;
  className?: string;
}) {
  if (!column?.getCanSort?.()) {
    return <div className={className}>{title}</div>;
  }
  const isSorted = column.getIsSorted();

  return (
    <Button
      variant="ghost"
      onClick={() => column.toggleSorting(isSorted === "asc")}
      className={`h-auto p-2 ${className ?? ""}`}
    >
      {title}
      <ArrowUpDown className="ml-2 h-4 w-4" />
      <span className="sr-only">
        {isSorted === "asc"
          ? "Ordenado ascendente"
          : isSorted === "desc"
            ? "Ordenado descendente"
            : "Não ordenado"}
      </span>
    </Button>
  );
}

/* ---------------------------------------------------------
   Tipos
--------------------------------------------------------- */

export type Facilidades_pregoeiro = {
  id: string; // use string para melhor compatibilidade
  created_at: string;
  phase: string;
  title: string;
  content: string;
  tags: string[] | null;
  owner_id: string | null;
  default: boolean | null;
};

export interface FacilidadesTableProps {
  OM: string;
  Date: string; // mantendo compat para não quebrar chamadas existentes
  Hour: string;
  Hour_limit: string;
  currentUserId?: string;
  onEditRow?: (row: Facilidades_pregoeiro) => void;
}

/* ---------------------------------------------------------
   Utils
--------------------------------------------------------- */

function safeReplaceAll(str: string, search: string, replace: string) {
  try {
    // @ts-ignore
    if (typeof str.replaceAll === "function")
      return str.replaceAll(search, replace);
  } catch {}
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return str.replace(new RegExp(escaped, "g"), replace);
}

/* ---------------------------------------------------------
   Query (TanStack Query + Supabase)
--------------------------------------------------------- */

const FACILITIES_QUERY_KEY = ["facilities_pregoeiro"];

function useFacilitiesQuery() {
  return useQuery<Facilidades_pregoeiro[]>({
    queryKey: FACILITIES_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabaseApp
        .from("facilities_pregoeiro")
        .select("*");

      if (error) throw new Error(error.message);

      const fallback: Facilidades_pregoeiro[] = [
        {
          id: "d7090840-5353-473b-8914-893dcccdd5cd",
          created_at: "2025-06-22 20:57:15.526856+00",
          title: "Abertura da Sessão Pública",
          phase: "Abertura",
          content:
            "Prezados Licitantes, ${OM} registra e agradece a participação de todos. Informa-se que a Sessão Pública está aberta e em condições para o início das atividades de hoje, ${date} às ${hour}. Encerramento estimado: ${hour_limit}. Mantenham-se conectados.",
          tags: ["sessão", "abertura"],
          owner_id: "00000000-0000-0000-0000-000000000000",
          default: true,
        },
      ];

      const base = (
        data && data.length > 0 ? data : fallback
      ) as Facilidades_pregoeiro[];

      return base.map((item) => ({
        ...item,
        tags: item.tags ?? [],
        default: item.default ?? false,
      }));
    },
    staleTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
  });
}

/* ---------------------------------------------------------
   Persistência de preferências da Tabela
   - Salva/Carrega em Supabase (se logado) ou localStorage (anônimo)
--------------------------------------------------------- */

type TableSettings = {
  columnVisibility?: VisibilityState;
  sorting?: SortingState;
  pageSize?: number;
  titleFilter?: string;
};

const LS_TABLE_SETTINGS_KEY = "pregoeiro_table_settings_v1";

function useTableSettings(currentUserId?: string) {
  const [settings, setSettings] = useState<TableSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      try {
        if (currentUserId) {
          const { data, error } = await supabaseApp
            .from("pregoeiro_preferences")
            .select("table_settings")
            .eq("user_id", currentUserId)
            .maybeSingle();

          if (error) throw error;

          const ts = (data?.table_settings ?? {}) as TableSettings;
          if (mounted) setSettings(ts);
        } else {
          // localStorage
          const raw =
            typeof window !== "undefined"
              ? localStorage.getItem(LS_TABLE_SETTINGS_KEY)
              : null;
          if (raw && mounted) {
            setSettings(JSON.parse(raw) as TableSettings);
          } else if (mounted) {
            setSettings({});
          }
        }
      } catch {
        if (mounted) setSettings({});
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [currentUserId]);

  const save = (next: TableSettings) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        if (currentUserId) {
          // upsert apenas table_settings; outras colunas permanecem
          await supabaseApp.from("pregoeiro_preferences").upsert({
            user_id: currentUserId,
            table_settings: next,
            updated_at: new Date().toISOString(),
          });
        } else if (typeof window !== "undefined") {
          localStorage.setItem(LS_TABLE_SETTINGS_KEY, JSON.stringify(next));
        }
        setSettings(next);
      } catch {
        // Silencioso: não quebra a UI
      }
    }, 500);
  };

  return { settings, saveSettings: save, loading };
}

/* ---------------------------------------------------------
   Colunas (factory para acessar props e ações)
--------------------------------------------------------- */

function getColumns(opts: {
  currentUserId?: string;
  onEditRow?: (row: Facilidades_pregoeiro) => void;
}): ColumnDef<Facilidades_pregoeiro>[] {
  const { currentUserId, onEditRow } = opts;

  return [
    {
      accessorKey: "phase",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Fase" />
      ),
      cell: ({ row }) => (
        <div className="capitalize whitespace-pre-wrap break-words">
          {row.getValue("phase")}
        </div>
      ),
      enableHiding: true,
      enableSorting: true,
    },
    {
      accessorKey: "title",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Título" />
      ),
      cell: ({ row }) => (
        <div className="whitespace-pre-wrap break-words">
          {row.getValue("title")}
        </div>
      ),
      enableHiding: false, // geralmente chave de busca principal
      enableSorting: true,
    },
    {
      accessorKey: "content",
      header: "Conteúdo",
      enableHiding: false,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="text-left font-normal whitespace-pre-wrap break-words text-pretty hyphens-auto leading-relaxed">
          {row.getValue("content")}
        </div>
      ),
    },
    {
      accessorKey: "tags",
      header: "Tags",
      enableSorting: false,
      cell: ({ row }) => {
        const tags = (row.getValue("tags") as string[]) || [];
        if (!tags.length)
          return <span className="text-muted-foreground text-sm">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {tags.map((t, i) => (
              <span
                key={`${t}-${i}`}
                className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs break-words"
                title={t}
              >
                {t}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      accessorKey: "default",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Padrão" />
      ),
      enableSorting: true,
      cell: ({ row }) => {
        const val = row.getValue("default") as boolean;
        return (
          <span
            className={
              "inline-flex items-center rounded-md px-2 py-0.5 text-xs " +
              (val
                ? "bg-green-100 text-green-800"
                : "bg-gray-100 text-gray-800")
            }
          >
            {val ? "Sim" : "Não"}
          </span>
        );
      },
    },
    {
      id: "actions",
      enableHiding: false,
      enableSorting: false,
      cell: ({ row }) => {
        const facilidade = row.original;
        const content = facilidade.content ?? "";
        const canEdit = currentUserId && facilidade.owner_id === currentUserId;

        return (
          <div className="flex items-center gap-2">
            <CopyButton content={content} />
            {canEdit ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onEditRow?.(facilidade)}
              >
                Editar
              </Button>
            ) : null}
          </div>
        );
      },
    },
  ];
}

/* ---------------------------------------------------------
   Componente principal
--------------------------------------------------------- */

export function FacilidadesTable({
  OM,
  Date: DateStr,
  Hour,
  Hour_limit,
  currentUserId,
  onEditRow,
}: FacilidadesTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [pageSize, setPageSize] = useState<number>(50);

  const { data: baseData = [], isLoading, error } = useFacilitiesQuery();

  // Carrega e persiste configurações da tabela
  const {
    settings,
    saveSettings,
    loading: settingsLoading,
  } = useTableSettings(currentUserId);

  // Hidrata estado com configurações carregadas apenas uma vez
  const hydrated = useRef(false);
  React.useEffect(() => {
    if (!settingsLoading && !hydrated.current) {
      hydrated.current = true;
      setColumnVisibility(settings?.columnVisibility ?? {});
      setSorting(settings?.sorting ?? []);
      setPageSize(settings?.pageSize ?? 50);

      const titleFilter = settings?.titleFilter ?? "";
      setColumnFilters(
        titleFilter
          ? [
              {
                id: "title",
                value: titleFilter,
              },
            ]
          : []
      );
    }
  }, [settingsLoading, settings]);

  // Aplica substituições de placeholders sem re-fetch
  const data = useMemo(() => {
    return baseData.map((item) => {
      const raw = item.content ?? "";
      const replaced = [
        ["${OM}", OM],
        ["${date}", DateStr],
        ["${hour}", Hour],
        ["${hour_limit}", Hour_limit],
      ].reduce((acc, [from, to]) => safeReplaceAll(acc, from, to), raw);

      return {
        ...item,
        content: replaced,
      };
    });
  }, [baseData, OM, DateStr, Hour, Hour_limit]);

  const columns = useMemo(
    () => getColumns({ currentUserId, onEditRow }),
    [currentUserId, onEditRow]
  );

  const table = useReactTable({
    data,
    columns,
    getRowId: (row) => row.id, // ids estáveis ajudam no desempenho
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    initialState: {
      pagination: { pageSize },
    },
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      pagination: { pageIndex: 0, pageSize },
    },
  });

  // Atualiza pageSize no TanStack Table quando o estado local muda
  React.useEffect(() => {
    table.setPageSize(pageSize);
  }, [pageSize, table]);

  // Persiste configurações da Tabela (debounced via hook)
  React.useEffect(() => {
    if (settingsLoading) return;

    const titleFilter =
      (columnFilters.find((f) => f.id === "title")?.value as string) ?? "";

    const next: TableSettings = {
      columnVisibility,
      sorting,
      pageSize,
      titleFilter,
    };
    saveSettings(next);
  }, [
    columnVisibility,
    sorting,
    pageSize,
    columnFilters,
    settingsLoading,
    saveSettings,
  ]);

  if (isLoading) {
    return (
      <div
        className="w-full flex items-center justify-center py-8"
        aria-live="polite"
      >
        <div className="text-center">Carregando...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full flex items-center justify-center py-8">
        <div className="text-center text-red-500">
          Erro ao carregar dados:{" "}
          {error instanceof Error ? error.message : "Erro desconhecido"}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <DebouncedInput
          placeholder="Filtre títulos..."
          value={(table.getColumn("title")?.getFilterValue() as string) ?? ""}
          onChange={(val) => table.getColumn("title")?.setFilterValue(val)}
          className="max-w-sm"
        />

        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">
            Linhas por página:
          </label>
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
          >
            {[10, 25, 50, 100].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                Colunas <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72 overflow-auto">
              {table
                .getAllLeafColumns()
                .filter((column) => column.getCanHide())
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) =>
                      column.toggleVisibility(!!value)
                    }
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-md border overflow-hidden">
        <Table className="w-full table-auto">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="align-top">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="align-top whitespace-pre-wrap break-words text-pretty"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  className="align-top"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className="align-top whitespace-pre-wrap break-words text-pretty hyphens-auto p-4 leading-relaxed"
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={table.getAllLeafColumns().length}
                  className="h-24 text-center"
                >
                  Sem resultados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Rodapé / paginação */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
          <span>
            Página{" "}
            <strong>
              {table.getState().pagination.pageIndex + 1} de{" "}
              {table.getPageCount()}
            </strong>
          </span>
          <span>
            | Total: {table.getFilteredRowModel().rows.length} registros
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.firstPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Primeira
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Próximo
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.lastPage()}
            disabled={!table.getCanNextPage()}
          >
            Última
          </Button>
        </div>
      </div>
    </div>
  );
}

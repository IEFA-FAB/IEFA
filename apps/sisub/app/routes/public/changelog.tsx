// routes/changelog.tsx
import { Link } from "react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useInfiniteQuery } from "@tanstack/react-query";
import supabase from "~/utils/supabase";
import type { Route } from "./+types/changelog";
import { Card } from "@iefa/ui";

// Tipos mínimos e locais
type ChangelogEntry = {
  id: string;
  version: string | null;
  title: string;
  body: string;
  tags: string[] | null;
  published_at: string; // ISO
  published: boolean;
};

type PageResult = {
  items: ChangelogEntry[];
  nextPage?: number;
  hasMore: boolean;
};

// Âncoras seguras
function safeAnchorId(id: string) {
  return `chlg-${String(id)}`.replace(/[^A-Za-z0-9\-_:.]/g, "-");
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(d);
}

// Links seguros no Markdown (http/https/mailto)
function transformLinkUri(href?: string) {
  if (!href) return href as any;
  try {
    const u = new URL(href, "https://dummy.base");
    const allowed = ["http:", "https:", "mailto:"];
    return allowed.includes(u.protocol) ? href : "#";
  } catch {
    return "#";
  }
}

// Helper: badge com tom baseado em tokens do tema shadcn
// Gera classes reativas usando as CSS vars do tema (sem hardcode de cores)
function toneBadge(
  tone: "primary" | "secondary" | "accent" | "destructive" | "muted" = "muted"
) {
  // Usa HSL(var(--token)) para alinhar com app.css do shadcn
  return [
    `bg-[hsl(var(--${tone}))]/12`,
    `text-[hsl(var(--${tone}-foreground, var(--${tone})))]`,
    `border-[hsl(var(--${tone}))]/25`,
  ].join(" ");
}

// Mapa de estilos por tag → token do tema
const TAG_TONE: Record<string, ReturnType<typeof toneBadge>> = {
  feat: toneBadge("primary"),
  fix: toneBadge("destructive"),
  docs: toneBadge("secondary"),
  perf: toneBadge("accent"),
};

// Supabase: busca com overfetch +1 para detectar "hasMore"
async function fetchChangelogPage(
  page: number,
  pageSize: number
): Promise<PageResult> {
  const from = page * pageSize;
  const to = from + pageSize; // inclusivo → retorna até pageSize + 1 registros

  const { data, error } = await supabase
    .from("changelog")
    .select("id, version, title, body, tags, published_at, published")
    .eq("published", true)
    .order("published_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error(error.message || "Não foi possível carregar o changelog.");
  }

  const rows = (data as ChangelogEntry[]) ?? [];
  const hasMore = rows.length > pageSize;
  const items = hasMore ? rows.slice(0, pageSize) : rows;

  return { items, nextPage: hasMore ? page + 1 : undefined, hasMore };
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Lista de Atualizações" },
    { name: "description", content: "Veja o que mudou no sistema" },
  ];
}

// Subcomponentes reativos ao tema

function SkeletonList() {
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          className="bg-card rounded-xl border border-border p-6 animate-pulse"
        >
          <div className="h-4 w-32 bg-muted rounded mb-3" />
          <div className="h-6 w-2/3 bg-muted rounded mb-4" />
          <div className="h-4 w-full bg-muted rounded mb-2" />
          <div className="h-4 w-5/6 bg-muted rounded mb-2" />
          <div className="h-4 w-4/6 bg-muted rounded" />
        </div>
      ))}
    </div>
  );
}

function ErrorBox({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="max-w-3xl mx-auto mb-8">
      <div
        className="bg-[hsl(var(--destructive))]/10 border border-[hsl(var(--destructive))]/30 text-[hsl(var(--destructive-foreground, var(--destructive)))] rounded-xl p-4"
        role="alert"
      >
        <p className="font-semibold mb-1">Erro ao carregar</p>
        <p className="text-sm text-muted-foreground">{message}</p>
        <button
          onClick={onRetry}
          className="mt-3 inline-flex items-center gap-2 bg-background border border-border text-foreground hover:bg-accent/10 px-3 py-1.5 rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-card border border-border rounded-xl p-6 text-center">
        <p className="text-muted-foreground">
          Nenhuma publicação encontrada ainda. Volte em breve!
        </p>
      </div>
    </div>
  );
}

function MarkdownContent({ children }: { children: string }) {
  return (
    <div className="prose max-w-none leading-relaxed prose-headings:text-foreground prose-p:text-muted-foreground prose-strong:text-foreground prose-a:underline dark:prose-invert">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          a: ({ node, href, ...props }) => (
            <a
              {...props}
              href={transformLinkUri(href)}
              className="text-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]/90"
              target="_blank"
              rel="noopener noreferrer nofollow"
            />
          ),
          ul: ({ node, ...props }) => (
            <ul {...props} className="list-disc pl-6" />
          ),
          ol: ({ node, ...props }) => (
            <ol {...props} className="list-decimal pl-6" />
          ),
          code: (props: any) => {
            const { inline, className, children, ...rest } = props;
            if (inline) {
              return (
                <code
                  {...rest}
                  className={`rounded bg-muted px-1.5 py-0.5 font-mono text-sm text-foreground ${className ?? ""}`}
                >
                  {children}
                </code>
              );
            }
            return (
              <pre className="bg-muted text-foreground p-4 rounded-lg overflow-x-auto">
                <code {...rest} className={className}>
                  {children}
                </code>
              </pre>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

function TagBadge({ id, tag }: { id: string; tag: string }) {
  const key = (tag ?? "").toLowerCase();
  const tone = TAG_TONE[key] ?? toneBadge("muted");
  return (
    <span
      key={`${id}-${tag}`}
      className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${tone}`}
    >
      {tag}
    </span>
  );
}

function ChangelogCard({ entry }: { entry: ChangelogEntry }) {
  const anchorId = safeAnchorId(entry.id);
  return (
    <article
      id={anchorId}
      className="bg-card rounded-xl p-6 border border-border hover:border-foreground/20 shadow-sm hover:shadow-md transition"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-3">
          <a
            href={`#${anchorId}`}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Link para esta entrada"
            title="Copiar link desta entrada"
          >
            #
          </a>
          {entry.version && (
            <span
              className={`inline-flex items-center text-sm font-semibold px-2.5 py-1 rounded-full border ${toneBadge("primary")}`}
            >
              v{entry.version}
            </span>
          )}
          <h2 className="text-xl font-bold text-foreground">{entry.title}</h2>
        </div>
        <time
          className="text-sm text-muted-foreground"
          dateTime={entry.published_at}
          title={formatDate(entry.published_at)}
        >
          {formatDistanceToNow(new Date(entry.published_at), {
            addSuffix: true,
            locale: ptBR,
          })}
        </time>
      </div>

      {entry.tags && entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {entry.tags.map((t) => (
            <TagBadge key={`${entry.id}-${t}`} id={entry.id} tag={t} />
          ))}
        </div>
      )}

      <MarkdownContent>{entry.body ?? ""}</MarkdownContent>
    </article>
  );
}

function LoadMore({
  disabled,
  onClick,
  busy,
}: {
  disabled: boolean;
  onClick: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex justify-center pt-2">
      <button
        onClick={onClick}
        disabled={disabled}
        aria-busy={busy}
        className="inline-flex items-center gap-2 bg-background border border-border text-foreground hover:bg-accent/10 px-4 py-2 rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {busy ? "Carregando..." : "Carregar mais"}
      </button>
    </div>
  );
}

const PAGE_SIZE = 10;

export default function Changelog() {
  const {
    data,
    isLoading,
    isFetchingNextPage,
    error,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["changelog", "list", PAGE_SIZE],
    queryFn: ({ pageParam = 0 }) => fetchChangelogPage(pageParam, PAGE_SIZE),
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
    staleTime: 5 * 60 * 1000, // 5min
    gcTime: 10 * 60 * 1000, // 10min
    retry: 2,
  });

  const items = data?.pages.flatMap((p) => p.items) ?? [];
  const GITHUB_REPO_URL =
    import.meta.env.VITE_GITHUB_REPO_URL || "https://github.com/IEFA-FAB/IEFA/";

  return (
    <div className="min-h-screen flex flex-col  text-foreground">
      {/* Hero */}
      <section className="container mx-auto px-4 pt-14 pb-8">
        <div className="text-center">
          <h1 className="text-4xl font-extrabold mb-3">Changelog</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Acompanhe as melhorias, correções e novidades do SISUB em tempo
            real.
          </p>
          <div className="mt-6 flex items-center justify-center">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]/90 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
            >
              ← Voltar para a Home
            </Link>
          </div>
        </div>
      </section>

      {/* Lista */}
      <main className="container mx-auto px-4 pb-16 flex-1">
        {isLoading && <SkeletonList />}

        {!isLoading && error && (
          <ErrorBox
            message={(error as Error).message}
            onRetry={() => refetch()}
          />
        )}

        {!isLoading && !error && items.length === 0 && <EmptyState />}

        {!isLoading && !error && items.length > 0 && (
          <div className="max-w-3xl mx-auto space-y-6">
            {items.map((entry) => (
              <ChangelogCard key={entry.id} entry={entry} />
            ))}

            {/* Paginação */}
            {hasNextPage && (
              <LoadMore
                disabled={isFetchingNextPage}
                busy={isFetchingNextPage}
                onClick={() => fetchNextPage()}
              />
            )}
          </div>
        )}
      </main>

      {/* CTA GitHub */}
      <Card className="py-12 ">
        <div className="container mx-auto px-4 text-center">
          <h3 className="text-2xl font-bold mb-3">Quer contribuir?</h3>
          <p className="text-[hsl(var(--primary-foreground))]/80 max-w-2xl mx-auto mb-6">
            Ajude a melhorar o SISUB: envie sugestões, correções e novas
            funcionalidades diretamente pelo GitHub.
          </p>
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex items-center gap-2 bg-background text-[hsl(var(--primary))] hover:bg-accent/10 px-6 py-3 font-semibold rounded-lg transition shadow-lg hover:shadow-xl border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-5 h-5"
            >
              <path
                fillRule="evenodd"
                d="M12 2C6.477 2 2 6.58 2 12.114c0 4.48 2.865 8.27 6.839 9.614.5.095.683-.219.683-.486 0-.24-.009-.874-.014-1.716-2.782.61-3.37-1.36-3.37-1.36-.455-1.163-1.11-1.474-1.11-1.474-.907-.629.069-.617.069-.617 1.003.072 1.53 1.04 1.53 1.04.892 1.547 2.341 1.101 2.91.842.091-.654.35-1.101.636-1.355-2.221-.256-4.555-1.13-4.555-5.027 0-1.11.39-2.017 1.03-2.728-.103-.257-.447-1.29.098-2.69 0 0 .84-.27 2.75 1.04a9.38 9.38 0 0 1 2.505-.342c.85.004 1.706.116 2.505.342 1.91-1.31 2.749-1.04 2.749-1.04.546 1.4.202 2.433.099 2.69.64.711 1.029 1.618 1.029 2.728 0 3.906-2.338 4.768-4.566 5.02.36.314.68.93.68 1.874 0 1.353-.012 2.443-.012 2.776 0 .27.181.586.689.486A10.12 10.12 0 0 0 22 12.114C22 6.58 17.523 2 12 2Z"
                clipRule="evenodd"
              />
            </svg>
            Contribuir no GitHub
          </a>
        </div>
      </Card>
    </div>
  );
}

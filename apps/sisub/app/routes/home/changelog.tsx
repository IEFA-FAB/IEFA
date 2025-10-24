import { Link } from "react-router";
import Footer from "~/components/Footer";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  useChangelog,
  ChangelogEntry,
} from "~/components/hooks/useChangeLogData";
import { Route } from "./+types/changelog";

// Mantido no escopo do componente de view
const TAG_STYLES: Record<string, string> = {
  feat: "bg-green-50 text-green-800 border-green-200",
  fix: "bg-red-50 text-red-800 border-red-200",
  docs: "bg-indigo-50 text-indigo-800 border-indigo-200",
  perf: "bg-yellow-50 text-yellow-800 border-yellow-200",
};

// Sanitiza/normaliza o id do anchor para evitar caracteres estranhos
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

// Garante que a URL do GitHub é http(s), caso contrário cai no default
const DEFAULT_GITHUB_REPO_URL = "https://github.com/userNanni/sisub";
function getGithubRepoUrl() {
  const raw = import.meta.env.VITE_GITHUB_REPO_URL;
  if (typeof raw !== "string") return DEFAULT_GITHUB_REPO_URL;
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:"
      ? u.toString()
      : DEFAULT_GITHUB_REPO_URL;
  } catch {
    return DEFAULT_GITHUB_REPO_URL;
  }
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Lista de Atualizações" },
    { name: "description", content: "Veja o que mudou no sistema" },
  ];
}

// Opcional: bloqueia protocolos perigosos em links na renderização do markdown
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

type ViewProps = {
  items: ChangelogEntry[];
  loading: boolean;
  loadingMore: boolean;
  busy: boolean;
  error: string | null;
  hasMore: boolean;
  page: number;
  refresh: () => void;
  loadMore: () => void;
};

export function ChangelogView({
  items,
  loading,
  loadingMore,
  busy,
  error,
  hasMore,
  refresh,
  loadMore,
}: ViewProps) {
  const GITHUB_REPO_URL = getGithubRepoUrl();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 flex flex-col">
      {/* Hero */}
      <section
        className="container mx-auto px-4 pt-14 pb-8"
        aria-labelledby="changelog-title"
      >
        <div className="text-center">
          <h1
            id="changelog-title"
            className="text-4xl font-extrabold text-gray-900 mb-3"
          >
            Changelog
          </h1>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Acompanhe as melhorias, correções e novidades do SISUB em tempo
            real.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-semibold"
            >
              ← Voltar para a Home
            </Link>
            <button
              onClick={refresh}
              disabled={busy}
              aria-busy={busy}
              className="inline-flex items-center gap-2 bg-white border border-blue-200 text-blue-700 px-4 py-2 rounded-lg transition cursor-pointer hover:bg-blue-50 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Atualizando..." : "Atualizar"}
            </button>
          </div>
        </div>
      </section>

      {/* Lista */}
      <main
        className="container mx-auto px-4 pb-16 flex-1"
        aria-busy={busy}
        aria-describedby={error ? "changelog-error" : undefined}
      >
        {loading && (
          <div className="max-w-3xl mx-auto space-y-4">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-xl border border-blue-100 p-6 animate-pulse"
              >
                <div className="h-4 w-32 bg-gray-200 rounded mb-3" />
                <div className="h-6 w-2/3 bg-gray-200 rounded mb-4" />
                <div className="h-4 w-full bg-gray-200 rounded mb-2" />
                <div className="h-4 w-5/6 bg-gray-200 rounded mb-2" />
                <div className="h-4 w-4/6 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="max-w-3xl mx-auto mb-8">
            <div
              id="changelog-error"
              className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4"
              role="alert"
              aria-live="polite"
            >
              <p className="font-semibold mb-1">Erro ao carregar</p>
              <p className="text-sm">{error}</p>
              <button
                onClick={refresh}
                disabled={busy}
                className="mt-3 inline-flex items-center gap-2 bg-white border border-red-200 text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Tentar novamente
              </button>
            </div>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="max-w-3xl mx-auto">
            <div className="bg-white border border-blue-100 rounded-xl p-6 text-center">
              <p className="text-gray-700">
                Nenhuma publicação encontrada ainda. Volte em breve!
              </p>
            </div>
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <div className="max-w-3xl mx-auto space-y-6">
            {items.map((entry) => {
              const anchorId = safeAnchorId(entry.id);
              return (
                <article
                  id={anchorId}
                  key={entry.id}
                  className="bg-white rounded-xl p-6 border border-blue-100 hover:border-blue-200 shadow-sm hover:shadow-md transition"
                  aria-labelledby={`${anchorId}-title`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-3">
                      <a
                        href={`#${anchorId}`}
                        className="text-gray-400 hover:text-gray-600"
                        aria-label="Link para esta entrada"
                        title="Copiar link desta entrada"
                      >
                        #
                      </a>
                      {entry.version && (
                        <span className="inline-flex items-center text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full">
                          v{entry.version}
                        </span>
                      )}
                      <h2
                        id={`${anchorId}-title`}
                        className="text-xl font-bold text-gray-900"
                      >
                        {entry.title}
                      </h2>
                    </div>
                    <time
                      className="text-sm text-gray-500"
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
                      {entry.tags.map((tag) => {
                        const cls =
                          TAG_STYLES[(tag as any)?.toLowerCase?.() ?? ""] ??
                          "bg-gray-100 text-gray-700 border-gray-200";
                        return (
                          <span
                            key={`${entry.id}-${tag}`}
                            className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${cls}`}
                          >
                            {tag}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  <div className="prose prose-slate max-w-none leading-relaxed">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkBreaks]}
                      components={{
                        a: ({ node, href, ...props }) => (
                          <a
                            {...props}
                            href={transformLinkUri(href)}
                            className="text-blue-600 underline hover:text-blue-700"
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
                        // Mantém bloco de código como estava
                        code: ({ className, children, ...props }) => (
                          <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto">
                            <code {...props} className={className}>
                              {children}
                            </code>
                          </pre>
                        ),
                      }}
                    >
                      {entry.body ?? ""}
                    </ReactMarkdown>
                  </div>
                </article>
              );
            })}

            {/* Paginação - carregar mais */}
            {hasMore && (
              <div className="flex justify-center pt-2">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="inline-flex items-center gap-2 bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 px-4 py-2 rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loadingMore ? "Carregando..." : "Carregar mais"}
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* CTA GitHub */}
      <section className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-12">
        <div className="container mx-auto px-4 text-center">
          <h3 className="text-2xl font-bold mb-3">Quer contribuir?</h3>
          <p className="text-blue-100 max-w-2xl mx-auto mb-6">
            Ajude a melhorar o SISUB: envie sugestões, correções e novas
            funcionalidades diretamente pelo GitHub.
          </p>
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex items-center gap-2 bg-white text-blue-700 hover:bg-gray-100 px-6 py-3 font-semibold rounded-lg transition shadow-lg hover:shadow-xl"
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
      </section>

      <Footer />
    </div>
  );
}

// Container fino que conecta o hook à view
export default function Changelog() {
  const state = useChangelog({ pageSize: 10 });
  return <ChangelogView {...state} />;
}

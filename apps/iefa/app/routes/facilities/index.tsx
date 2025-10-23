import React, { useEffect, useState, lazy, Suspense } from "react";
import { NavLink } from "react-router";

import {
  Separator,
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  Button,
  Badge,
} from "@iefa/ui";

import { ExternalLink, Github, User } from "lucide-react";
import type { LucideProps } from "lucide-react";
import dynamicIconImports from "lucide-react/dynamicIconImports";
import { supabase } from "@/lib/supabase"; // ajuste conforme seu projeto

type Contributor = {
  label: string;
  url?: string;
  icon?: React.ReactNode;
};

type AppItem = {
  title: string;
  description: string;
  to?: string;
  href?: string;
  icon?: React.ReactNode;
  badges?: string[];
  external?: boolean;
  contributors?: Contributor[];
};

export function meta() {
  return [
    { title: "IEFA" },
    { name: "description", content: "Suite de Soluções do IEFA" },
  ];
}

/**
 * Normalizadores de nome para bater com as chaves do lucide:
 * - lucide usa nomes originais em kebab-case no mapa dinâmico (ex: "utensils-crossed", "wrench")
 * - componentes estáticos usam PascalCase (ex: UtensilsCrossed, Wrench)
 * Aqui cobrimos as 3 possibilidades: entrada direta, kebab-case e PascalCase.
 */
const toPascalName = (name: string) =>
  name
    .trim()
    .replace(/[-_ ]+(\w)/g, (_, c: string) => c.toUpperCase())
    .replace(/^\w/, (c) => c.toUpperCase());

const toKebabName = (name: string) =>
  name
    .trim()
    // "UtensilsCrossed" -> "Utensils-Crossed"
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    // separadores para hífen
    .replace(/[\s_]+/g, "-")
    .toLowerCase();

const FALLBACK_ICON = "wrench" as const;

/**
 * Escolhe o loader de ícone do mapa dinâmico do lucide.
 * Fontes:
 * - dynamicIconImports e uso com React.lazy [lucide-react – npm]
 * - chaves do mapa são os nomes originais dos ícones (kebab-case) [lucide-react – npm]
 */
function resolveIconLoader(name?: string | null) {
  const map = dynamicIconImports as Record<
    string,
    () => Promise<{ default: React.ComponentType<LucideProps> }>
  >;

  if (name) {
    const direct = name;
    const kebab = toKebabName(name);
    const pascal = toPascalName(name);

    if (map[direct]) return map[direct];
    if (map[kebab]) return map[kebab];
    if (map[pascal]) return map[pascal];
  }
  return map[FALLBACK_ICON];
}

/**
 * Ícone dinâmico com code-splitting via React.lazy + Suspense.
 * Aceita nome em vários formatos ("utensils_crossed", "utensils-crossed", "UtensilsCrossed").
 */
function DynamicIcon({
  name,
  className = "h-5 w-5",
  ...rest
}: { name?: string | null } & Omit<LucideProps, "ref">) {
  const LazyIcon = lazy(resolveIconLoader(name));
  return (
    <Suspense fallback={<span className={className} aria-hidden="true" />}>
      <LazyIcon aria-hidden="true" className={className} {...rest} />
    </Suspense>
  );
}

function AppCard({ app }: { app: AppItem }) {
  const isExternal = app.external && !!app.href;

  return (
    <Card className="group h-full border border-border bg-card text-card-foreground transition-all hover:border-primary/40 hover:shadow-lg focus-within:ring-2 focus-within:ring-primary/40">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="text-primary">
            {app.icon}
          </span>
          <h3 className="text-lg font-semibold leading-tight">{app.title}</h3>
        </div>
        {isExternal ? (
          <Badge variant="secondary" className="gap-1">
            Externo <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </Badge>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-3">
        <p className="text-sm sm:text-base text-muted-foreground text-pretty">
          {app.description}
        </p>

        {app.badges && app.badges.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {app.badges.map((b) => (
              <Badge key={b} variant="outline">
                {b}
              </Badge>
            ))}
          </div>
        ) : null}

        {app.contributors && app.contributors.length > 0 ? (
          <div className="pt-1">
            <div className="text-xs font-medium tracking-wide text">
              {app.contributors.length > 1 ? "Contribuidores" : "Contribuição"}
            </div>
            <ul className="mt-2 flex flex-row gap-x-8 gap-1.5">
              {app.contributors.map((c, idx) => {
                const isGithub = c.url?.includes("github.com");
                const iconEl =
                  c.icon ??
                  (isGithub ? (
                    <Github className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <User className="h-4 w-4" aria-hidden="true" />
                  ));

                return (
                  <li
                    key={`${c.label}-${idx}`}
                    className="flex items-center gap-2"
                  >
                    <span className="text-muted-foreground" aria-hidden="true">
                      {iconEl}
                    </span>

                    {c.url ? (
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1.5 text-sm hover:underline underline-offset-4"
                        aria-label={`Abrir perfil de ${c.label} em nova aba`}
                      >
                        <span>{c.label}</span>
                        <ExternalLink
                          className="h-3.5 w-3.5"
                          aria-hidden="true"
                        />
                      </a>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {c.label}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </CardContent>

      <CardFooter>
        {app.to ? (
          <Button asChild className="w-full" aria-label={`Abrir ${app.title}`}>
            <NavLink to={app.to} end>
              Abrir
            </NavLink>
          </Button>
        ) : app.href ? (
          <Button
            asChild
            className="w-full"
            aria-label={`Acessar ${app.title}`}
          >
            <a
              href={app.href}
              target={isExternal ? "_blank" : undefined}
              rel={isExternal ? "noreferrer noopener" : undefined}
            >
              Acessar
              {isExternal ? (
                <ExternalLink className="ml-2 h-4 w-4" aria-hidden="true" />
              ) : null}
            </a>
          </Button>
        ) : null}
      </CardFooter>
    </Card>
  );
}

type DbContributor = {
  label: string;
  url: string | null;
  icon_key: string | null;
};

type DbApp = {
  title: string;
  description: string;
  to_path: string | null;
  href: string | null;
  icon_key: string | null;
  external: boolean | null;
  badges: string[] | null;
  contributors: DbContributor[] | null;
};

export default function Home() {
  const [offsetY, setOffsetY] = useState(0);
  const [motionOK, setMotionOK] = useState(true);

  const [apps, setApps] = useState<AppItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    const onScroll = () => setOffsetY(window.scrollY);
    window.addEventListener("scroll", onScroll);

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleMQ = () => setMotionOK(!mq.matches);
    handleMQ();
    mq.addEventListener("change", handleMQ);

    return () => {
      window.removeEventListener("scroll", onScroll);
      mq.removeEventListener("change", handleMQ);
    };
  }, []);

  useEffect(() => {
    async function loadApps() {
      setLoading(true);
      setFetchError(null);

      const { data, error } = await supabase
        .from("apps")
        .select(
          `
          title,
          description,
          to_path,
          href,
          icon_key,
          external,
          badges,
          contributors:app_contributors (
            label,
            url,
            icon_key
          )
        `
        )
        .order("title", { ascending: true });

      if (error) {
        setFetchError(error.message);
        setLoading(false);
        return;
      }

      const mapped: AppItem[] = (data as DbApp[]).map((a) => ({
        title: a.title,
        description: a.description,
        to: a.to_path ?? undefined,
        href: a.href ?? undefined,
        icon: (
          <DynamicIcon name={a.icon_key ?? undefined} className="h-5 w-5" />
        ),
        badges: a.badges ?? [],
        external: !!a.external,
        contributors: (a.contributors ?? []).map((c) => ({
          label: c.label,
          url: c.url ?? undefined,
          icon: c.icon_key ? (
            <DynamicIcon name={c.icon_key} className="h-4 w-4" />
          ) : undefined,
        })),
      }));

      setApps(mapped);
      setLoading(false);
    }

    loadApps();
  }, []);

  const y = motionOK ? offsetY * 0.12 : 0;

  return (
    <div className="relative flex flex-col items-center justify-center w-full  text-foreground">
  

      {/* Seção Apps */}
      <section
        id="apps"
        className="mt-10 md:mt-12 w-full"
        role="region"
        aria-labelledby="apps-heading"
      >
        <div className="flex items-center justify-between px-1 md:px-0">
          <h2
            id="apps-heading"
            className="text-2xl md:text-3xl font-bold tracking-tight text-balance"
          >
            Aplicações da suite
          </h2>
        </div>
        <p className="text-muted-foreground mt-2 px-1 md:px-0 text-pretty">
          Acesse rapidamente os módulos internos e serviços externos integrados.
        </p>

        <Separator className="my-6" />

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="h-40 animate-pulse rounded-xl bg-muted" />
            <div className="h-40 animate-pulse rounded-xl bg-muted" />
          </div>
        ) : fetchError ? (
          <div className="text-sm text-destructive">
            Erro ao carregar apps: {fetchError}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {apps.map((app) => (
              <AppCard key={app.title} app={app} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

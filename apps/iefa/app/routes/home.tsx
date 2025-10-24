import React, { useEffect, useState } from "react";
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
import { useAppsData } from "@/hook/useAppsData"; // novo import do hook
import { DynamicIcon } from "@/components/dynamicIcon";

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

export default function Home() {
  const [offsetY, setOffsetY] = useState(0);
  const [motionOK, setMotionOK] = useState(true);

  // efeito só para motion
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

  // usa TanStack Query
  const { data, isLoading, error } = useAppsData(6);

  // mapeia DbApp -> AppItem com React nodes (DynamicIcon)
  const apps: AppItem[] =
    (data ?? []).map((a) => ({
      title: a.title,
      description: a.description,
      to: a.to_path ?? undefined,
      href: a.href ?? undefined,
      icon: <DynamicIcon name={a.icon_key ?? undefined} className="h-5 w-5" />,
      badges: a.badges ?? [],
      external: !!a.external,
      contributors: (a.contributors ?? []).map((c) => ({
        label: c.label,
        url: c.url ?? undefined,
        icon: c.icon_key ? (
          <DynamicIcon name={c.icon_key} className="h-4 w-4" />
        ) : undefined,
      })),
    })) ?? [];

  const y = motionOK ? offsetY * 0.12 : 0;

  return (
    <div className="relative flex flex-col items-center justify-center w-full text-foreground">
      {/* Hero */}
      <header className="relative w-full">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 md:px-8 pt-8 md:pt-12">
          <div
            className="relative w-full overflow-hidden rounded-3xl border border-border
                       bg-gradient-to-b from-background/60 via-background/40 to-background/20
                       backdrop-blur supports-[backdrop-filter]:backdrop-blur-md"
            role="region"
            aria-label="Cabeçalho do Portal IEFA"            
          >
            <div className="relative mx-auto flex min-h-[40vh] sm:min-h-[50vh] flex-col items-center justify-center text-center p-6 md:p-10">
              <h1 className="text-balance text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight">
                Portal IEFA
              </h1>
              <p className="mt-4 max-w-3xl text-pretty text-base sm:text-lg text-muted-foreground">
                Suite de aplicações do Instituto de Economia, Finanças e
                Administração.
              </p>
              <div className="mt-6 flex flex-wrap gap-3 align-middle justify-center items-center">
                <Button asChild size="lg" variant="default">
                  <a
                    href="/facilidades/#apps"
                    aria-label="Ver aplicações da suite"
                  >
                    Ver aplicações
                  </a>
                </Button>
                <Button asChild size="lg" variant="secondary">
                  <a
                    href="https://app.previsaosisub.com.br/"
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label="Acessar Previsão de Rancho (SISUB) em nova aba"
                  >
                    Acessar SISUB
                    <ExternalLink className="ml-2 h-4 w-4" aria-hidden="true" />
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

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

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="h-40 animate-pulse rounded-xl bg-muted" />
            <div className="h-40 animate-pulse rounded-xl bg-muted" />
          </div>
        ) : error ? (
          <div className="text-sm text-destructive">
            Erro ao carregar apps:{" "}
            {error instanceof Error ? error.message : "Erro desconhecido"}
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

import { useEffect, useState } from "react";
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
import { ExternalLink, Wrench, UtensilsCrossed, Book, BookOpen } from "lucide-react";

type AppItem = {
  title: string;
  description: string;
  to?: string;
  href?: string;
  icon?: React.ReactNode;
  badges?: string[];
  external?: boolean;
};

export function meta() {
  return [
    { title: "IEFA" },
    { name: "description", content: "Suite de Soluções do IEFA" },
  ];
}

function AppCard({ app }: { app: AppItem }) {
  const isExternal = app.external && !!app.href;

  // Card não é embrulhado por link para evitar links aninhados.
  // O CTA único fica no footer.
  return (
    <Card className="group h-full border border-border bg-card text-card-foreground transition-all hover:border-primary/40 hover:shadow-lg focus-within:ring-2 focus-within:ring-primary/40">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          {/* Ícones decorativos não precisam de leitura por screen readers */}
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

  // Apenas dois cards: Facilidades e SISUB (sem repetição).
  const apps: AppItem[] = [
    {
      title: "Facilidades do Pregoeiro",
      description:
        "Ferramentas auxiliares para apoiar o fluxo do pregoeiro de forma rápida e padronizada.",
      to: "/facilidades/pregoeiro",
      icon: <Wrench className="h-5 w-5" aria-hidden="true" />,
      badges: ["Produtividade", "Padronização"],
    },
    {
      title: "Chat RADA",
      description:
        "Ferramenta de Recuperação de conhecimento sobre o Regulamento de Adminitração da Aeronáutica.",
      to: "/chat/rada",
      icon: <Wrench className="h-5 w-5" aria-hidden="true" />,
      badges: ["Chat", "RADA"],
    },
    {
      title: "Previsão de Rancho (SISUB)",
      description:
        "Selecione refeições dos próximos 30 dias para estimar a demanda. Login seguro via Supabase.",
      href: "https://app.previsaosisub.com.br/",
      external: true,
      icon: <UtensilsCrossed className="h-5 w-5" aria-hidden="true" />,
      badges: ["30 dias", "4 refeições", "Login seguro"],
    },
    {
      title: "Documentação dos Sistemas IEFA",
      description:
        "Entenda melhor os sistemas desenvolvidos pelo IEFA, com guias e manuais detalhados.",
      href: "https://iefa-docs.fly.dev/",
      external: true,
      icon: <BookOpen className="h-5 w-5" aria-hidden="true" />,
      badges: ["Documentação", "Guias"],
    },
  ];

  // Parallax suave nos blobs (desativado em redução de movimento)
  const y = motionOK ? offsetY * 0.12 : 0;

  return (
    <div className="relative flex flex-col items-center justify-center w-full bg-background text-foreground">
      {/* Blobs de gradiente com blur (modern SaaS), responsivos ao tema */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        aria-hidden="true"
      >
        <div
          className="absolute left-1/2 top-[-12%] h-[42rem] w-[42rem] -translate-x-1/2 rounded-full blur-3xl
                     bg-gradient-to-br from-primary/25 via-fuchsia-500/10 to-sky-500/10
                     dark:from-primary/30 dark:via-fuchsia-400/10 dark:to-sky-400/10"
          style={{ transform: `translate(-50%, ${y}px)` }}
        />
        <div
          className="absolute right-[-10%] bottom-[-20%] h-[36rem] w-[36rem] rounded-full blur-3xl
                     bg-gradient-to-tr from-emerald-500/10 via-primary/15 to-transparent
                     dark:from-emerald-400/10 dark:via-primary/20 dark:to-transparent"
          style={{ transform: `translateY(${-y * 0.6}px)` }}
        />
      </div>

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
              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild size="lg" variant="default">
                  <a href="#apps" aria-label="Ver aplicações da suite">
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

          {/* Seção Apps */}
          <section
            id="apps"
            className="mt-10 md:mt-12"
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
              Acesse rapidamente os módulos internos e serviços externos
              integrados.
            </p>

            <Separator className="my-6" />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {apps.map((app) => (
                <AppCard key={app.title} app={app} />
              ))}
            </div>
          </section>
        </div>
      </header>
    </div>
  );
}

import { useEffect, useState } from "react";
import { NavLink } from "react-router";
import {
  AspectRatio,
  Separator,
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  Button,
  Badge,
} from "@iefa/ui";
import { ExternalLink, BarChart3, Wrench, UtensilsCrossed } from "lucide-react";

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
  const isExternal = app.external && app.href;
  const Content = (
    <Card className="group h-full border bg-card hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          {app.icon}
          <h3 className="text-lg font-semibold">{app.title}</h3>
        </div>
        {isExternal ? (
          <Badge variant="secondary" className="gap-1">
            Externo <ExternalLink className="h-3 w-3" />
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{app.description}</p>
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
          <Button asChild className="w-full">
            <NavLink to={app.to} end>
              Abrir
            </NavLink>
          </Button>
        ) : app.href ? (
          <Button asChild className="w-full">
            <a
              href={app.href}
              target={isExternal ? "_blank" : undefined}
              rel={isExternal ? "noreferrer noopener" : undefined}
            >
              Acessar
            </a>
          </Button>
        ) : null}
      </CardFooter>
    </Card>
  );

  if (app.to) {
    return (
      <NavLink to={app.to} end className="block focus:outline-none">
        {Content}
      </NavLink>
    );
  }
  if (app.href) {
    return (
      <a
        href={app.href}
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noreferrer noopener" : undefined}
        className="block focus:outline-none"
      >
        {Content}
      </a>
    );
  }
  return Content;
}

export default function Home() {
  const [offsetY, setOffsetY] = useState(0);

  useEffect(() => {
    const handleScroll = () => setOffsetY(window.scrollY);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const apps: AppItem[] = [
    {
      title: "Dados",
      description: "Painéis e relatórios centralizados do IEFA.",
      to: "/Dados",
      icon: <BarChart3 className="h-5 w-5 text-primary" />,
      badges: ["Painéis", "Relatórios", "Insights"],
    },
    {
      title: "Facilidades do Pregoeiro",
      description: "Ferramentas auxiliares para o fluxo do pregoeiro.",
      to: "/facilidades/pregoeiro",
      icon: <Wrench className="h-5 w-5 text-primary" />,
      badges: ["Ferramentas", "Produtividade"],
    },
    {
      title: "Previsão de Rancho (SISUB)",
      description:
        "Selecione refeições nos próximos 30 dias e ajude a prever a demanda do rancho. Login seguro via Supabase.",
      href: "https://app.previsaosisub.com.br/",
      external: true,
      icon: <UtensilsCrossed className="h-5 w-5 text-primary" />,
      badges: ["30 dias", "4 refeições", "Login seguro"],
    },
  ];

  return (
    <div className="flex flex-col items-center justify-center w-full">
      {/* Hero com parallax */}
      <div className="relative w-full">
        <div className="w-full max-w-7xl mx-auto px-0 sm:px-2 md:px-4 pt-6 md:pt-10">
          <div className="relative w-full aspect-[21/9] overflow-hidden rounded-3xl">
            {/* Gradiente + conteúdo */}
            <div className="absolute inset-0 bg-gradient-to-t from-background/70 via-background/20 to-transparent rounded-3xl" />
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6">
              <h1 className="text-4xl sm:text-6xl md:text-7xl font-bold text-white drop-shadow-lg">
                Portal IEFA
              </h1>
              <p className="mt-4 max-w-3xl text-base md:text-lg text-white/90 drop-shadow">
                Suite de aplicações do Instituto de Economia, Finanças e
                Administração.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild size="lg" variant="default">
                  <a href="#apps">Ver aplicações</a>
                </Button>
                <Button asChild size="lg" variant="secondary">
                  <a
                    href="https://app.previsaosisub.com.br/"
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Acessar SISUB <ExternalLink className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>
          </div>

          {/* Seção Apps */}
          <section id="apps" className="mt-10 px-4 md:px-0">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
                Aplicações da suite
              </h2>
            </div>
            <p className="text-muted-foreground mt-2">
              Acesse rapidamente os módulos internos e serviços externos
              integrados.
            </p>

            <Separator className="my-6" />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {apps.map((app) => (
                <AppCard key={app.title} app={app} />
              ))}
            </div>
          </section>

          {/* Destaque SISUB (opcional) */}
          <section className="mt-12 px-4 md:px-0">
            <Card className="overflow-hidden">
              <div className="grid md:grid-cols-2">
                <div className="p-6 md:p-8">
                  <div className="flex items-center gap-2">
                    <UtensilsCrossed className="h-5 w-5 text-primary" />
                    <h3 className="text-xl font-semibold">
                      Previsão de Rancho (SISUB)
                    </h3>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    Sistema inteligente para previsão de demanda do rancho:
                    login seguro, seleção de refeições para os próximos 30 dias
                    e salvamento automático. Ajuda a reduzir desperdícios e
                    otimizar a gestão.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Badge variant="outline">30 dias</Badge>
                    <Badge variant="outline">4 refeições</Badge>
                    <Badge variant="outline">Por OM</Badge>
                    <Badge variant="outline">Responsivo</Badge>
                  </div>
                  <div className="mt-6">
                    <Button asChild>
                      <a
                        href="https://app.previsaosisub.com.br/"
                        target="_blank"
                        rel="noreferrer noopener"
                        aria-label="Acessar Previsão de Rancho (SISUB)"
                      >
                        Acessar SISUB <ExternalLink className="ml-2 h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}

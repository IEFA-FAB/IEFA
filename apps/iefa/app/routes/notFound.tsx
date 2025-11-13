import { Badge, Button } from "@iefa/ui";
import { AlertTriangle } from "lucide-react";
import { NavLink, useLocation } from "react-router";

export default function NotFound() {
    const location = useLocation();

    return (
        <div className="relative flex flex-col items-center justify-center w-full text-foreground min-h-[60vh]">
            <header className="w-full max-w-3xl mx-auto px-4 sm:px-6 md:px-8 pt-8 md:pt-12">
                <div className="w-full overflow-hidden rounded-3xl border border-border bg-linear-to-b from-background/60 via-background/40 to-background/20 backdrop-blur supports-backdrop-filter:backdrop-blur-md p-6 md:p-10 text-center">
                    <div className="mx-auto flex flex-col items-center justify-center">
                        <AlertTriangle className="h-10 w-10 text-amber-500" aria-hidden="true" />
                        <h1 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight">Página não encontrada</h1>
                        <p className="mt-3 max-w-xl text-muted-foreground">
                            O caminho abaixo não existe ou foi movido.
                        </p>
                        <Badge variant="outline" className="mt-4">
                            {location.pathname}
                        </Badge>
                        <div className="mt-6 flex flex-wrap gap-3 justify-center">
                            <Button asChild size="lg" variant="default" aria-label="Voltar para a Home">
                                <NavLink to="/">Voltar para a Home</NavLink>
                            </Button>
                            {/* <Button
                asChild
                size="lg"
                variant="secondary"
                aria-label="Ver aplicações da suite"
              >
                <a href="/facilidades/#apps">Ver aplicações</a>
              </Button>
              <Button
                asChild
                size="lg"
                variant="ghost"
                aria-label="Acessar SISUB em nova aba"
              >
                <a
                  href="https://app.previsaosisub.com.br/"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  SISUB
                  <ExternalLink className="ml-2 h-4 w-4" aria-hidden="true" />
                </a>
              </Button> */}
                        </div>
                    </div>
                </div>
            </header>

            {/* <section className="mt-10 md:mt-12 w-full max-w-3xl px-4 sm:px-6 md:px-8">
        <h2 className="text-xl md:text-2xl font-semibold tracking-tight">
          O que você pode fazer?
        </h2>
        <p className="text-muted-foreground mt-2">
          • Verifique o endereço digitado • Volte para a Home • Acesse a lista
          de aplicações
        </p>
        <Separator className="my-6" />
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold">Precisa de ajuda?</h3>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Se o problema persistir, entre em contato com o time responsável
            pelo portal.
          </CardContent>
          <CardFooter>
            <Button asChild variant="outline">
              <NavLink to="/">Ir para a Home</NavLink>
            </Button>
          </CardFooter>
        </Card>
      </section> */}
        </div>
    );
}

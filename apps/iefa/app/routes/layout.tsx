import { Outlet, NavLink } from "react-router";
import { ModeToggle, Button, Separator } from "@iefa/ui";
import { ExternalLink, Menu } from "lucide-react";
import { useState } from "react";

export default function RootLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  // Container: full em mobile/tablet; “wide” contido em desktop
  const container =
    "w-full mx-auto px-4 sm:px-6 md:px-8 lg:max-w-[1100px] xl:max-w-[1280px] 2xl:max-w-[1400px]";

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    [
      "inline-flex items-center rounded-md text-sm font-medium transition-colors",
      "px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
      isActive
        ? "bg-accent text-accent-foreground"
        : "text-foreground hover:bg-accent hover:text-accent-foreground",
    ].join(" ");

  return (
    
      <div className="min-h-dvh flex flex-col bg-background text-foreground">
        {/* Skip link para acessibilidade */}
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100]
                     rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground shadow"
        >
          Ir para o conteúdo
        </a>

        {/* Cabeçalho */}
        <header className="sticky top-0 z-50 border-b bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div
            className={`${container} h-14 flex items-center justify-between gap-3`}
          >
            {/* Esquerda: Marca + Navegação desktop */}
            <div className="flex items-center gap-3">
              <NavLink
                to="/"
                end
                className="text-base sm:text-lg font-bold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-md px-1"
                aria-label="Página inicial - Portal IEFA"
              >
                Portal IEFA
              </NavLink>

              <Separator
                orientation="vertical"
                className="h-6 hidden sm:block"
              />

              <nav
                className="hidden md:flex items-center gap-1"
                aria-label="Navegação principal"
              >
                <NavLink
                  to="/facilidades/pregoeiro"
                  end
                  className={navLinkClass}
                >
                  Facilidades
                </NavLink>
                <a
                  href="https://app.previsaosisub.com.br/"
                  target="_blank"
                  rel="noreferrer noopener"
                  className={[
                    "inline-flex items-center rounded-md text-sm font-medium transition-colors",
                    "px-3 py-2 text-foreground hover:bg-accent hover:text-accent-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  ].join(" ")}
                  aria-label="Abrir SISUB em nova aba"
                >
                  SISUB
                  <ExternalLink className="ml-2 h-4 w-4" aria-hidden="true" />
                </a>
              </nav>
            </div>

            {/* Direita: Ações */}
            <div className="flex items-center gap-2">
              <ModeToggle />

              {/* Menu mobile */}
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => setMobileOpen((v) => !v)}
                aria-label="Abrir menu"
                aria-expanded={mobileOpen}
                aria-controls="mobile-nav"
              >
                <Menu className="h-5 w-5" aria-hidden="true" />
              </Button>
            </div>
          </div>

          {/* Navegação mobile */}
          {mobileOpen && (
            <div id="mobile-nav" className="md:hidden border-t bg-background">
              <div className={`${container} py-3 flex flex-col gap-2`}>
                <NavLink
                  to="/facilidades/pregoeiro"
                  end
                  className={({ isActive }) =>
                    [
                      "w-full px-3 py-2 rounded-md text-sm transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                      isActive
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-accent hover:text-accent-foreground",
                    ].join(" ")
                  }
                  onClick={() => setMobileOpen(false)}
                >
                  Facilidades
                </NavLink>

                <a
                  href="https://app.previsaosisub.com.br/"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="w-full px-3 py-2 rounded-md text-sm inline-flex items-center justify-between transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Abrir SISUB em nova aba"
                >
                  SISUB
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>
            </div>
          )}
        </header>

        {/* Conteúdo */}
        <main id="conteudo" className="flex-1">
          <div className={`${container} py-8 md:py-10`}>
            <Outlet />
          </div>
        </main>

        {/* Rodapé */}
        <footer className="border-t">
          <div
            className={`${container} h-14 flex items-center justify-center text-xs text-muted-foreground`}
          >
            © {new Date().getFullYear()} IEFA.<b> Desenvolvido por Ten Nanni (IEFA) </b>. Alguns serviços são externos e
            podem exigir login próprio.
          </div>
        </footer>
      </div>
   
  );
}

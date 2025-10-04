import { Outlet, NavLink } from "react-router";
import { ThemeProvider, ModeToggle, Button, Separator } from "@iefa/ui";
import { ExternalLink, Menu } from "lucide-react";
import { useState } from "react";

export default function RootLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `inline-flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors
     ${isActive ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-accent hover:text-accent-foreground"}`;

  return (
    <ThemeProvider defaultTheme="system" storageKey="iefa-theme">
      <div className="min-h-dvh flex flex-col bg-background text-foreground">
        {/* Cabeçalho */}
        <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="w-full max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
            {/* Esquerda: Marca */}
            <div className="flex items-center gap-3">
              <NavLink
                to="/"
                end
                className="text-base sm:text-lg font-bold tracking-tight"
              >
                Portal IEFA
              </NavLink>
              <Separator
                orientation="vertical"
                className="h-6 hidden sm:block"
              />
              {/* Navegação desktop */}
              <nav className="hidden md:flex items-center gap-1">
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
                  className="inline-flex items-center px-3 py-2 rounded-md text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  SISUB
                  <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </nav>
            </div>

            {/* Direita: Ações */}
            <div className="flex items-center gap-2">
              {/* Theme toggle do @iefa/ui */}
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
                <Menu className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Navegação mobile */}
          {mobileOpen && (
            <div id="mobile-nav" className="md:hidden border-t bg-background">
              <div className="px-4 py-3 flex flex-col gap-2">
                <NavLink
                  to="/pregoeiro/facilidades"
                  end
                  className={({ isActive }) =>
                    `w-full ${isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent hover:text-accent-foreground"} px-3 py-2 rounded-md text-sm`
                  }
                  onClick={() => setMobileOpen(false)}
                >
                  Facilidades
                </NavLink>
                <a
                  href="https://app.previsaosisub.com.br/"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="w-full hover:bg-accent hover:text-accent-foreground px-3 py-2 rounded-md text-sm inline-flex items-center justify-between"
                  onClick={() => setMobileOpen(false)}
                >
                  SISUB
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
          )}
        </header>

        {/* Conteúdo */}
        <main className="flex-1">
          <div className="w-full max-w-7xl mx-auto px-4 py-6">
            <Outlet />
          </div>
        </main>

        {/* Rodapé */}
        <footer className="border-t">
          <div className="w-full max-w-7xl mx-auto px-4 h-14 flex items-center justify-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} IEFA. Alguns serviços são externos e
            podem exigir login próprio.
          </div>
        </footer>
      </div>
    </ThemeProvider>
  );
}

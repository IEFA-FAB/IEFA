import { NavLink, useLocation } from "react-router";
import {
  Button,
  Badge,
} from "@iefa/ui";
import { AlertTriangle } from "lucide-react";

export default function NotFound() {
  const location = useLocation();

  return (
    <div className="relative flex flex-col items-center justify-center w-full text-foreground min-h-[60vh]">
      <header className="w-full max-w-3xl mx-auto px-4 sm:px-6 md:px-8 pt-8 md:pt-12">
        <div className="w-full overflow-hidden rounded-3xl border border-border bg-gradient-to-b from-background/60 via-background/40 to-background/20 backdrop-blur supports-[backdrop-filter]:backdrop-blur-md p-6 md:p-10 text-center">
          <div className="mx-auto flex flex-col items-center justify-center">
            <AlertTriangle
              className="h-10 w-10 text-amber-500"
              aria-hidden="true"
            />
            <h1 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight">
              Página não encontrada
            </h1>
            <p className="mt-3 max-w-xl text-muted-foreground">
              O caminho abaixo não existe ou foi movido.
            </p>
            <Badge variant="outline" className="mt-4">
              {location.pathname}
            </Badge>
            <div className="mt-6 flex flex-wrap gap-3 justify-center">
              <Button
                asChild
                size="lg"
                variant="default"
                aria-label="Voltar para a Home"
              >
                <NavLink to="/">Voltar para a Home</NavLink>
              </Button>
            </div>
          </div>
        </div>
      </header>
    </div>
  );
}
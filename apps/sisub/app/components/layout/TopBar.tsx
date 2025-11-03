import { Button, ModeToggle, SidebarTrigger } from "@iefa/ui";
import { NavItem } from "~/components/sidebar/nav-items";
import { QrCode } from "lucide-react";

export type TopbarProps = {
  showSidebar: boolean;
  navItems: NavItem[];
  sheetOpen: boolean;
  onSheetOpenChange: (open: boolean) => void;
  onSidebarNavigate: () => void;
  showGlobalProgress: boolean;
  onOpenQr: () => void;
  userId: string | null;
};

export function Topbar({ onOpenQr, userId }: TopbarProps) {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center border-b bg-background/80 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:px-4 flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
      <div className="flex w-full items-center">
        {/* Esquerda: apenas o trigger do sidebar */}
        <div className="flex items-center">
          <SidebarTrigger />
        </div>

        {/* Direita: todas as ações */}
        <div
          role="toolbar"
          aria-label="Ações rápidas"
          className="ml-auto flex items-center gap-2 sm:gap-3"
        >
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenQr}
            className="flex items-center gap-2 transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
            aria-label="Abrir QR do usuário"
            disabled={!userId}
            title={userId ? "Mostrar QR" : "Usuário não identificado"}
          >
            <QrCode className="h-4 w-4" />
            <span className="hidden font-medium sm:inline">QR</span>
          </Button>

          <ModeToggle />
        </div>
      </div>
    </header>
  );
}

// ~/components/sidebar/nav-items.ts
import type { ComponentType, SVGProps } from "react";
import { UtensilsCrossed, ShieldCheck, Settings, FileText, LucideIcon } from "lucide-react";
import type { UserLevelOrNull } from "~/services/AdminService";
import type { AppSidebarData, NavItemSection } from "./types";

export type IconType = ComponentType<SVGProps<SVGSVGElement>>;

// Níveis exibidos no menu (inclui nível 0 "comensal")
export type DisplayLevel = "comensal" | Exclude<UserLevelOrNull, null>;

// Ordem hierárquica para acumular dropdowns
const LEVELS_ORDER: DisplayLevel[] = [
  "comensal",
  "user",
  "admin",
  "superadmin",
];

// Títulos dos dropdowns por nível
const DROPDOWN_TITLE: Record<DisplayLevel, string> = {
  comensal: "Comensal",
  user: "Fiscal",
  admin: "Gestor",
  superadmin: "SDAB",
};

// Ícones dos dropdowns por nível
const DROPDOWN_ICON: Record<DisplayLevel, LucideIcon> = {
  comensal: UtensilsCrossed,
  user: ShieldCheck,
  admin: Settings,
  superadmin: FileText,
};

// Subitens por nível (acesso)
// Mapeamento conforme solicitado:
// - comensal → "previsão" → /rancho
// - Fiscal → "leitor QrCode" → /fiscal
// - Gestor → "painel do rancho" → /admin
// - SDAB → "painel do sistema" → /superadmin
const LEVEL_SUBITEMS: Record<DisplayLevel, { title: string; url: string }[]> = {
  comensal: [{ title: "Previsão", url: "/rancho" }],
  user: [{ title: "Leitor QrCode", url: "/fiscal" }],
  admin: [{ title: "Painel do rancho", url: "/admin" }],
  superadmin: [{ title: "Painel do sistema", url: "/superadmin" }],
};

// Auxiliar: retorna os níveis acumulados até o nível informado
function getAccumulatedLevels(level: DisplayLevel): DisplayLevel[] {
  const idx = LEVELS_ORDER.indexOf(level);
  // Se o nível não estiver na lista, assume apenas comensal
  return idx >= 0 ? LEVELS_ORDER.slice(0, idx + 1) : ["comensal"];
}

export type BuildSidebarDataParams = {
  level: DisplayLevel; // agora aceita "comensal" além de user/admin/superadmin
  user?: {
    name: string;
    email: string;
    avatar?: string | null;
  };
  activePath?: string;
};

export function buildSidebarData({
  level,
  activePath,
}: BuildSidebarDataParams): AppSidebarData {
  const levels = getAccumulatedLevels(level);

  const navMain: NavItemSection[] = levels.map((lv) => {
    const items = LEVEL_SUBITEMS[lv] ?? [];
    const isActive = !!activePath && items.some((it) => it.url === activePath);

    return {
      title: DROPDOWN_TITLE[lv],
      icon: DROPDOWN_ICON[lv],
      isActive,
      items, // NavMain espera items: { title, url }[]
    };
  });

  return {
    teams: [
      {
        name: "SISUB",
        logo: "sheets",
        plan: DROPDOWN_TITLE[level],
      },
    ],
    navMain,
  };
}

// Opcional: API de compatibilidade para recuperar todos os itens acessíveis (flatten)
// Mantida caso outro código dependa disso.
export type NavItem = {
  to: string;
  label: string;
  icon?: IconType; // ícone opcional; aqui usamos o ícone do dropdown do nível
};

export function getNavItemsForLevel(level: DisplayLevel): NavItem[] {
  const levels = getAccumulatedLevels(level);
  return levels.flatMap((lv) =>
    (LEVEL_SUBITEMS[lv] ?? []).map((it) => ({
      to: it.url,
      label: it.title,
      icon: DROPDOWN_ICON[lv],
    }))
  );
}

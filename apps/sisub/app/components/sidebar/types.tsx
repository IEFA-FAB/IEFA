import { LucideIcon } from "lucide-react";
import type { ComponentType, SVGProps } from "react";


export type Team = {
  name: string;
  logo: any; 
  plan: string;
};

export type NavItemLeaf = {
  title: string;
  url: string;
};

export type NavItemSection = {
  title: string;
  icon?: LucideIcon;
  isActive?: boolean;
  items?: NavItemLeaf[];
};

export type AppSidebarData = {
  teams: Team[];
  navMain: NavItemSection[];
};

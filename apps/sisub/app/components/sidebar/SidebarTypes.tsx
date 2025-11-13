import type { LucideIcon } from "lucide-react";

export type Team = {
    name: string;
    logo: string;
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

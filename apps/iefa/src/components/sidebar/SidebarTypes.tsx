import type { LucideIcon } from "lucide-react";

export type Team = {
	id?: string;
	name: string;
	logo: string;
	plan: string;
};

export type NavItem = {
	title: string;
	url: string;
	icon: LucideIcon;
	isActive?: boolean;
};

export type AppSidebarData = {
	teams: Team[];
	navMain: NavItem[];
};

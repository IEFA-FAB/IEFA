"use client";

import {
	Avatar,
	AvatarFallback,
	AvatarImage,
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@iefa/ui";
import { EllipsisVertical, LogOut, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

type UserMeta = {
	name?: string;
	full_name?: string;
	avatar_url?: string;
	picture?: string;
};

function getInitials(nameOrEmail?: string) {
	if (!nameOrEmail) return "US";
	const name = nameOrEmail.split("@")[0];
	const parts = name.trim().split(/\s+/);
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function NavUser() {
	const { isMobile } = useSidebar();
	const { user, isAuthenticated, isLoading, signOut } = useAuth();

	const meta = (user?.user_metadata ?? {}) as UserMeta;
	const email = user?.email ?? "";
	const displayName = meta.name || meta.full_name || email || "Usuário";
	const avatarUrl = meta.avatar_url || meta.picture || "";

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				{isLoading ? (
					<div
						className="h-8 w-full rounded-lg bg-muted animate-pulse"
						aria-hidden="true"
					/>
				) : !isAuthenticated ? (
					<Button
						variant="outline"
						size="sm"
						onClick={() => window.location.assign("/login")}
					>
						Entrar
					</Button>
				) : (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<SidebarMenuButton
								size="lg"
								className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
							>
								<Avatar className="size-8 rounded-lg grayscale">
									<AvatarImage src={avatarUrl} alt={displayName} />
									<AvatarFallback className="rounded-lg">
										{getInitials(displayName)}
									</AvatarFallback>
								</Avatar>
								<div className="hidden sm:grid flex-1 text-left text-sm leading-tight ml-2">
									<span className="truncate font-medium">{displayName}</span>
									<span className="text-muted-foreground truncate text-xs">
										{email}
									</span>
								</div>
								<EllipsisVertical className="ml-2 h-4 w-4" aria-hidden="true" />
							</SidebarMenuButton>
						</DropdownMenuTrigger>

						<DropdownMenuContent
							className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
							side={isMobile ? "bottom" : "right"}
							align="end"
							sideOffset={6}
						>
							<DropdownMenuLabel className="p-0 font-normal">
								<div className="flex items-center gap-2 px-2 py-2 text-left text-sm">
									<Avatar className="h-8 w-8 rounded-lg">
										<AvatarImage src={avatarUrl} alt={displayName} />
										<AvatarFallback className="rounded-lg">
											{getInitials(displayName)}
										</AvatarFallback>
									</Avatar>
									<div className="grid flex-1 text-left text-sm leading-tight">
										<span className="truncate font-medium">{displayName}</span>
										<span className="text-muted-foreground truncate text-xs">
											{email}
										</span>
									</div>
								</div>
							</DropdownMenuLabel>

							<DropdownMenuSeparator />

							<DropdownMenuItem
								onSelect={() => {
									window.location.assign("/profile");
								}}
								className="cursor-pointer"
							>
								<User className="mr-2 h-4 w-4" />
								Perfil
							</DropdownMenuItem>

							<DropdownMenuItem
								onSelect={async () => {
									await signOut();
									window.location.assign("/login");
								}}
								className="text-red-600 focus:text-red-600 cursor-pointer"
							>
								<LogOut className="mr-2 h-4 w-4" />
								Sair
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			</SidebarMenuItem>
		</SidebarMenu>
	);
}

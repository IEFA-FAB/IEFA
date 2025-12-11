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
} from "@iefa/ui";
import { Link } from "@tanstack/react-router";
import { EllipsisVertical, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

function getInitials(nameOrEmail?: string) {
	if (!nameOrEmail) return "US";
	const name = nameOrEmail.split("@")[0];
	const parts = name
		.trim()
		.split(/\s+/)
		.filter((p) => p.length > 0);
	if (parts.length === 0) return "US";
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function UserMenu() {
	// No hydration check needed as we use Suspense/Router
	const { user, isAuthenticated, signOut } = useAuth();

	const meta = (user?.user_metadata ?? {}) as {
		name?: string;
		full_name?: string;
		avatar_url?: string;
		picture?: string;
	};
	const email = user?.email ?? "";

	const displayName = meta.name || meta.full_name || email || "Usuário";
	const avatarUrl = meta.avatar_url || meta.picture || "";

	// Loading handling is done via Suspense boundary or parent loader
	// if (!isAuthenticated) logic remains below...

	if (!isAuthenticated) {
		return (
			<Button asChild variant="outline" size="sm">
				<Link to="/auth">Entrar</Link>
			</Button>
		);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					className="data-[state=open]:bg-accent data-[state=open]:text-accent-foreground px-2"
				>
					<Avatar className="h-8 w-8 rounded-lg">
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
				</Button>
			</DropdownMenuTrigger>

			<DropdownMenuContent
				className="min-w-56 rounded-lg"
				side="bottom"
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
					onSelect={async () => {
						await signOut();
					}}
					className="text-red-600 focus:text-red-600 cursor-pointer"
				>
					<LogOut className="mr-2 h-4 w-4" />
					Sair
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

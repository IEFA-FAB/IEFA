import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { SearchedUser } from "@/hooks/useAthletesData";

type UserTeamUI = { teamId: number; activityType: string };

export function InviteAthleteCard({
	isOpen,
	onClose,
	searchUserByEmail,
	isSearchingUser,
	searchUserError,
	searchedUser,
	userTeams,
	isLoadingTeams,
	teamsError,
	inviteAthlete,
	isInvitingAthlete,
	inviteError,
	inviteResult,
}: {
	isOpen: boolean;
	onClose: () => void;

	searchUserByEmail: (email: string) => Promise<SearchedUser>;
	isSearchingUser: boolean;
	searchUserError: string | null;
	searchedUser: SearchedUser | null;

	userTeams: UserTeamUI[];
	isLoadingTeams: boolean;
	teamsError: string | null;

	inviteAthlete: (args: {
		userId: string;
		teamId: number;
		expiresAt?: string | Date;
	}) => Promise<void>;
	isInvitingAthlete: boolean;
	inviteError: string | null;
	inviteResult: string | null;
}) {
	const [inviteEmail, setInviteEmail] = useState("");
	const [inviteUserId, setInviteUserId] = useState("");
	const [inviteTeamId, setInviteTeamId] = useState<string>("");
	const [inviteExpiresAt, setInviteExpiresAt] = useState<string>("");

	useEffect(() => {
		if (userTeams.length === 1 && !inviteTeamId) {
			setInviteTeamId(String(userTeams[0].teamId));
		}
	}, [userTeams, inviteTeamId]);

	const handleSearchByEmail = async () => {
		try {
			const user = await searchUserByEmail(inviteEmail);
			if (user) setInviteUserId(user.id);
		} catch (error) {
			// Error is already handled by the mutation (toast shown by the hook)
			console.error("Error searching user:", error);
		}
	};

	const [dateError, setDateError] = useState<string | null>(null);

	const handleSubmitInvite = async () => {
		setDateError(null);
		if (!inviteUserId.trim()) return;
		const teamIdNum = Number(inviteTeamId);
		if (!Number.isInteger(teamIdNum) || teamIdNum <= 0) return;

		let expiresAtParam: Date | undefined;
		if (inviteExpiresAt) {
			const date = new Date(inviteExpiresAt);
			if (Number.isNaN(date.getTime())) {
				// Handle invalid date - could set an error state or show a message
				setDateError("Data inválida.");
				return;
			}
			expiresAtParam = date;
		}

		await inviteAthlete({
			userId: inviteUserId.trim(),
			teamId: teamIdNum,
			expiresAt: expiresAtParam,
		});
	};

	const handleClearInviteForm = () => {
		setInviteEmail("");
		setInviteUserId("");
		setInviteTeamId("");
		setInviteExpiresAt("");
	};

	if (!isOpen) return null;
	return (
		<Card
			id="invite-form"
			className="border-slate-200 bg-white/80 dark:border-slate-800 dark:bg-slate-900/60"
			aria-live="polite"
		>
			<CardHeader className="pb-2">
				<CardTitle className="text-base font-bold text-slate-900 dark:text-slate-50">
					Convidar atleta para equipe
				</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-3 pt-0 md:grid-cols-3">
				<div className="space-y-1 md:col-span-2">
					<label
						htmlFor="invite-email-input"
						className="text-xs text-slate-500 dark:text-slate-400"
					>
						Email do usuário
					</label>
					<div className="flex gap-2">
						<Input
							value={inviteEmail}
							onChange={(e) => setInviteEmail(e.target.value)}
							placeholder="email@exemplo.com"
							inputMode="email"
							autoComplete="email"
						/>
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={handleSearchByEmail}
							disabled={!inviteEmail.trim() || isSearchingUser}
							className="whitespace-nowrap"
						>
							{isSearchingUser ? (
								<>
									<RefreshCw className="mr-2 h-4 w-4 animate-spin" />
									Buscando...
								</>
							) : (
								"Buscar"
							)}
						</Button>
					</div>

					{searchedUser && (
						<div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-400/10 dark:text-emerald-200">
							Usuário encontrado:{" "}
							<span className="font-medium">{searchedUser.name}</span> — ID
							preenchido automaticamente.
						</div>
					)}
					{searchUserError && (
						<div className="mt-2 rounded-md border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-400/10 dark:text-rose-200">
							{searchUserError}
						</div>
					)}
				</div>

				<div className="space-y-1">
					<span className="text-xs text-slate-500 dark:text-slate-400">
						ID do usuário (user_id)
					</span>
					<Input
						value={inviteUserId}
						onChange={(e) => setInviteUserId(e.target.value)}
						placeholder="uuid do usuário"
						disabled={isSearchingUser}
					/>
					<p className="mt-1 text-[11px] text-slate-400">
						Dica: busque pelo email para preencher automaticamente.
					</p>
				</div>

				<div className="space-y-1">
					<label
						htmlFor="invite-team-select"
						className="text-xs text-slate-500 dark:text-slate-400"
					>
						Equipe (team_id)
					</label>
					<Select
						value={inviteTeamId}
						onValueChange={setInviteTeamId}
						disabled={
							isLoadingTeams || (!!teamsError && userTeams.length === 0)
						}
					>
						<SelectTrigger id="invite-team-select" className="h-9">
							<SelectValue
								placeholder={
									isLoadingTeams
										? "Carregando equipes..."
										: "Selecione a equipe"
								}
							/>
						</SelectTrigger>
						<SelectContent align="start">
							{userTeams.map((t) => (
								<SelectItem key={t.teamId} value={String(t.teamId)}>
									{t.activityType} — ID {t.teamId}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					{teamsError && (
						<p className="mt-1 text-[11px] text-rose-500">{teamsError}</p>
					)}
				</div>

				<div className="space-y-1">
					<span className="text-xs text-slate-500 dark:text-slate-400">
						Expira em (opcional)
					</span>
					<Input
						type="datetime-local"
						value={inviteExpiresAt}
						onChange={(e) => setInviteExpiresAt(e.target.value)}
					/>
					{dateError && (
						<p className="mt-1 text-[11px] text-rose-500">{dateError}</p>
					)}
				</div>

				<div className="col-span-full mt-1 flex flex-wrap items-center gap-2">
					<Button
						size="sm"
						className="bg-emerald-600 text-white hover:bg-emerald-700"
						onClick={handleSubmitInvite}
						disabled={
							isInvitingAthlete ||
							!inviteUserId.trim() ||
							!Number.isInteger(Number(inviteTeamId)) ||
							Number(inviteTeamId) <= 0
						}
					>
						{isInvitingAthlete && (
							<RefreshCw className="mr-2 h-4 w-4 animate-spin" />
						)}
						Enviar convite
					</Button>
					<Button
						size="sm"
						variant="ghost"
						onClick={handleClearInviteForm}
						disabled={isInvitingAthlete}
					>
						Limpar
					</Button>
					<Button
						size="sm"
						variant="outline"
						onClick={onClose}
						disabled={isInvitingAthlete}
					>
						Fechar
					</Button>
				</div>

				{inviteError && (
					<div className="col-span-full rounded-md border border-rose-200 bg-rose-50/80 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-400/10 dark:text-rose-200">
						{inviteError}
					</div>
				)}

				{inviteResult && (
					<div className="col-span-full rounded-md border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-400/10 dark:text-emerald-200">
						{inviteResult}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

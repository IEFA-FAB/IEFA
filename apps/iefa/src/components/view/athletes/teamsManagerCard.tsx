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

type UserTeamUI = { teamId: number; teamName: string; activityType: string };

export function TeamsManagerCard({
	isOpen,
	userTeams,
	isLoadingTeams,
	teamsError,

	createTeam,
	isCreatingTeam,
	createTeamError,
	createTeamResult,

	updateTeam,
	isUpdatingTeam,
	updateTeamError,
	updateTeamResult,

	updateTeamMemberStatus,
	isUpdatingMember,
	updateMemberError,
	updateMemberResult,
}: {
	isOpen: boolean;

	userTeams: UserTeamUI[];
	isLoadingTeams: boolean;
	teamsError: string | null;

	createTeam: (p: { teamName: string; activityType: string }) => Promise<void>;
	isCreatingTeam: boolean;
	createTeamError: string | null;
	createTeamResult: string | null;

	updateTeam: (p: {
		teamId: number;
		teamName: string;
		activityType: string;
	}) => Promise<void>;
	isUpdatingTeam: boolean;
	updateTeamError: string | null;
	updateTeamResult: string | null;

	updateTeamMemberStatus: (p: {
		teamId: number;
		userId: string;
		statusCode: string;
	}) => Promise<void>;
	isUpdatingMember: boolean;
	updateMemberError: string | null;
	updateMemberResult: string | null;
}) {
	// Criar equipe
	const [createTeamName, setCreateTeamName] = useState("");
	const [createActivityType, setCreateActivityType] = useState("");

	const handleCreateTeam = async () => {
		if (!createTeamName.trim() || !createActivityType.trim()) return;
		await createTeam({
			teamName: createTeamName.trim(),
			activityType: createActivityType.trim(),
		});
	};
	const clearCreateTeamForm = () => {
		setCreateTeamName("");
		setCreateActivityType("");
	};

	// Atualizar equipe
	const [updateSelectedTeamId, setUpdateSelectedTeamId] = useState<string>("");
	const [updateTeamNameInput, setUpdateTeamNameInput] = useState("");
	const [updateActivityTypeInput, setUpdateActivityTypeInput] = useState("");

	useEffect(() => {
		if (!updateSelectedTeamId) return;
		const t = userTeams.find((x) => String(x.teamId) === updateSelectedTeamId);
		setUpdateTeamNameInput(t?.teamName ?? "");
		setUpdateActivityTypeInput(t?.activityType ?? "");
	}, [updateSelectedTeamId, userTeams]);

	useEffect(() => {
		if (!updateSelectedTeamId && userTeams.length > 0) {
			setUpdateSelectedTeamId(String(userTeams[0].teamId));
		}
	}, [userTeams, updateSelectedTeamId]);

	const handleUpdateTeam = async () => {
		const teamIdNum = Number(updateSelectedTeamId);
		if (!Number.isInteger(teamIdNum) || teamIdNum <= 0) return;
		if (!updateTeamNameInput.trim() || !updateActivityTypeInput.trim()) return;

		await updateTeam({
			teamId: teamIdNum,
			teamName: updateTeamNameInput.trim(),
			activityType: updateActivityTypeInput.trim(),
		});
	};

	const clearUpdateTeamForm = () => {
		setUpdateTeamNameInput("");
		setUpdateActivityTypeInput("");
		if (userTeams.length > 0)
			setUpdateSelectedTeamId(String(userTeams[0].teamId));
		else setUpdateSelectedTeamId("");
	};

	// Atualizar status do membro
	const [memberTeamId, setMemberTeamId] = useState<string>("");
	const [memberUserId, setMemberUserId] = useState("");
	const [memberStatusCode, setMemberStatusCode] = useState("");

	useEffect(() => {
		if (!memberTeamId && userTeams.length > 0) {
			setMemberTeamId(String(userTeams[0].teamId));
		}
	}, [userTeams, memberTeamId]);

	const handleUpdateMemberStatus = async () => {
		const teamIdNum = Number(memberTeamId);
		if (!Number.isInteger(teamIdNum) || teamIdNum <= 0) return;
		if (!memberUserId.trim() || !memberStatusCode.trim()) return;

		await updateTeamMemberStatus({
			teamId: teamIdNum,
			userId: memberUserId.trim(),
			statusCode: memberStatusCode.trim(),
		});
	};

	const clearUpdateMemberForm = () => {
		if (userTeams.length > 0) setMemberTeamId(String(userTeams[0].teamId));
		else setMemberTeamId("");
		setMemberUserId("");
		setMemberStatusCode("");
	};

	if (!isOpen) return null;

	return (
		<Card
			id="teams-manager"
			className="border-slate-200 bg-white/80 dark:border-slate-800 dark:bg-slate-900/60"
		>
			<CardHeader className="pb-2">
				<CardTitle className="text-base font-bold text-slate-900 dark:text-slate-50">
					Gerenciar equipes
				</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4 md:grid-cols-2">
				{/* Criar equipe */}
				<div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
					<div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
						Criar nova equipe
					</div>
					<div className="mt-3 grid gap-3">
						<div className="space-y-1">
							<span className="text-xs text-slate-500 dark:text-slate-400">
								Nome da equipe (team_name)
							</span>
							<Input
								value={createTeamName}
								onChange={(e) => setCreateTeamName(e.target.value)}
								placeholder="Ex.: Equipe A"
							/>
						</div>
						<div className="space-y-1">
							<span className="text-xs text-slate-500 dark:text-slate-400">
								Tipo de atividade (activity_type)
							</span>
							<Input
								value={createActivityType}
								onChange={(e) => setCreateActivityType(e.target.value)}
								placeholder="Ex.: corrida, ciclismo..."
							/>
						</div>
						<div className="flex items-center gap-2">
							<Button
								size="sm"
								className="bg-emerald-600 text-white hover:bg-emerald-700"
								onClick={handleCreateTeam}
								disabled={
									isCreatingTeam ||
									!createTeamName.trim() ||
									!createActivityType.trim()
								}
							>
								{isCreatingTeam && (
									<RefreshCw className="mr-2 h-4 w-4 animate-spin" />
								)}
								Criar equipe
							</Button>
							<Button
								size="sm"
								variant="ghost"
								onClick={clearCreateTeamForm}
								disabled={isCreatingTeam}
							>
								Limpar
							</Button>
						</div>

						{createTeamError && (
							<div className="rounded-md border border-rose-200 bg-rose-50/80 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-400/10 dark:text-rose-200">
								{createTeamError}
							</div>
						)}
						{createTeamResult && (
							<div className="rounded-md border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-400/10 dark:text-emerald-200">
								{createTeamResult}
							</div>
						)}
					</div>
				</div>

				{/* Atualizar equipe */}
				<div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
					<div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
						Atualizar equipe
					</div>
					<div className="mt-3 grid gap-3">
						<div className="space-y-1">
							<span className="text-xs text-slate-500 dark:text-slate-400">
								Selecione a equipe
							</span>
							<Select
								value={updateSelectedTeamId}
								onValueChange={setUpdateSelectedTeamId}
								disabled={
									isLoadingTeams || (!!teamsError && userTeams.length === 0)
								}
							>
								<SelectTrigger className="h-9">
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
								Novo nome da equipe (team_name)
							</span>
							<Input
								value={updateTeamNameInput}
								onChange={(e) => setUpdateTeamNameInput(e.target.value)}
								placeholder="Informe o novo nome"
								disabled={!updateSelectedTeamId}
							/>
						</div>

						<div className="space-y-1">
							<span className="text-xs text-slate-500 dark:text-slate-400">
								Novo tipo de atividade (activity_type)
							</span>
							<Input
								value={updateActivityTypeInput}
								onChange={(e) => setUpdateActivityTypeInput(e.target.value)}
								placeholder="Informe o novo tipo"
								disabled={!updateSelectedTeamId}
							/>
						</div>

						<div className="flex items-center gap-2">
							<Button
								size="sm"
								className="bg-emerald-600 text-white hover:bg-emerald-700"
								onClick={handleUpdateTeam}
								disabled={
									isUpdatingTeam ||
									!updateSelectedTeamId ||
									!updateTeamNameInput.trim() ||
									!updateActivityTypeInput.trim()
								}
							>
								{isUpdatingTeam && (
									<RefreshCw className="mr-2 h-4 w-4 animate-spin" />
								)}
								Atualizar equipe
							</Button>
							<Button
								size="sm"
								variant="ghost"
								onClick={clearUpdateTeamForm}
								disabled={isUpdatingTeam}
							>
								Limpar
							</Button>
						</div>

						{updateTeamError && (
							<div className="rounded-md border border-rose-200 bg-rose-50/80 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-400/10 dark:text-rose-200">
								{updateTeamError}
							</div>
						)}
						{updateTeamResult && (
							<div className="rounded-md border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-400/10 dark:text-emerald-200">
								{updateTeamResult}
							</div>
						)}
					</div>
				</div>

				{/* Atualizar status do membro */}
				<div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800 md:col-span-2">
					<div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
						Atualizar status do membro
					</div>
					<div className="mt-3 grid gap-3 md:grid-cols-3">
						<div className="space-y-1">
							<span className="text-xs text-slate-500 dark:text-slate-400">
								Equipe
							</span>
							<Select
								value={memberTeamId}
								onValueChange={setMemberTeamId}
								disabled={
									isLoadingTeams || (!!teamsError && userTeams.length === 0)
								}
							>
								<SelectTrigger className="h-9">
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
						</div>

						<div className="space-y-1">
							<span className="text-xs text-slate-500 dark:text-slate-400">
								ID do usuário (user_id)
							</span>
							<Input
								value={memberUserId}
								onChange={(e) => setMemberUserId(e.target.value)}
								placeholder="uuid do usuário"
							/>
						</div>

						<div className="space-y-1">
							<span className="text-xs text-slate-500 dark:text-slate-400">
								Código de status (status_code)
							</span>
							<Input
								value={memberStatusCode}
								onChange={(e) => setMemberStatusCode(e.target.value)}
								placeholder="Ex.: ACTIVE, PAUSED, INACTIVE"
							/>
						</div>

						<div className="col-span-full flex items-center gap-2">
							<Button
								size="sm"
								className="bg-emerald-600 text-white hover:bg-emerald-700"
								onClick={handleUpdateMemberStatus}
								disabled={
									isUpdatingMember ||
									!memberTeamId ||
									!memberUserId.trim() ||
									!memberStatusCode.trim()
								}
							>
								{isUpdatingMember && (
									<RefreshCw className="mr-2 h-4 w-4 animate-spin" />
								)}
								Atualizar status
							</Button>
							<Button
								size="sm"
								variant="ghost"
								onClick={clearUpdateMemberForm}
								disabled={isUpdatingMember}
							>
								Limpar
							</Button>
						</div>

						{updateMemberError && (
							<div className="col-span-full rounded-md border border-rose-200 bg-rose-50/80 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-400/10 dark:text-rose-200">
								{updateMemberError}
							</div>
						)}
						{updateMemberResult && (
							<div className="col-span-full rounded-md border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-400/10 dark:text-emerald-200">
								{updateMemberResult}
							</div>
						)}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

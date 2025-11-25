import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type PendingInvitation = {
	id: number;
	invitedUserName: string;
	teamName: string;
	activityType: string;
	createdAt: string | null | undefined;
};

const formatDateTime = (iso?: string | null) => {
	if (!iso) return "Data indisponível";
	try {
		return new Intl.DateTimeFormat("pt-BR", {
			dateStyle: "short",
			timeStyle: "short",
		}).format(new Date(iso));
	} catch {
		return "Data indisponível";
	}
};

export function PendingInvitationCard({
	pendingInvitation,
	invitationError,
	isProcessingInvitation,
	onAction,
}: {
	pendingInvitation: PendingInvitation | null;
	invitationError: string | null;
	isProcessingInvitation: "accept" | "reject" | null;
	onAction: (action: "accept" | "reject") => Promise<void>;
}) {
	if (!pendingInvitation) return null;

	return (
		<Card className="border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/60">
			<CardHeader className="pb-2">
				<CardTitle className="text-base font-bold text-slate-900 dark:text-slate-50">
					Convite pendente
				</CardTitle>
			</CardHeader>
			<CardContent className="pt-0">
				<div className="grid gap-3 md:grid-cols-3">
					<div className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900/70">
						<div className="text-xs text-slate-500 dark:text-slate-400">
							Atleta convidado
						</div>
						<div className="text-sm font-medium text-slate-900 dark:text-slate-50">
							{pendingInvitation.invitedUserName}
						</div>
					</div>
					<div className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900/70">
						<div className="text-xs text-slate-500 dark:text-slate-400">
							Equipe
						</div>
						<div className="text-sm font-medium text-slate-900 dark:text-slate-50">
							{pendingInvitation.teamName}
						</div>
					</div>
					<div className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900/70">
						<div className="text-xs text-slate-500 dark:text-slate-400">
							Criado em
						</div>
						<div className="text-sm font-medium text-slate-900 dark:text-slate-50">
							{formatDateTime(pendingInvitation.createdAt)}
						</div>
					</div>
				</div>

				<div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
					Atividade: {pendingInvitation.activityType}
				</div>

				{invitationError && (
					<p className="mt-3 text-sm font-medium text-rose-600 dark:text-rose-300">
						{invitationError}
					</p>
				)}

				<div className="mt-3 flex items-center gap-2">
					<Button
						size="sm"
						className="bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 ring-offset-white dark:ring-offset-slate-950"
						onClick={() => onAction("accept")}
						disabled={isProcessingInvitation !== null}
					>
						{isProcessingInvitation === "accept" && (
							<RefreshCw className="mr-2 h-4 w-4 animate-spin" />
						)}
						Aceitar
					</Button>
					<Button
						size="sm"
						variant="outline"
						onClick={() => onAction("reject")}
						disabled={isProcessingInvitation !== null}
					>
						{isProcessingInvitation === "reject" && (
							<RefreshCw className="mr-2 h-4 w-4 animate-spin" />
						)}
						Recusar
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

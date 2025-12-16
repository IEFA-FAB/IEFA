import { Button } from "@iefa/ui";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	AlertCircle,
	CheckCircle2,
	Clock,
	FileText,
	XCircle,
} from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/journal/review/$token")({
	component: ReviewInvitation,
});

function ReviewInvitation() {
	const { token } = Route.useParams();
	const navigate = useNavigate();
	const [isAccepting, setIsAccepting] = useState(false);
	const [isDeclining, setIsDeclining] = useState(false);
	const [declineReason, setDeclineReason] = useState("");
	const [showDeclineForm, setShowDeclineForm] = useState(false);

	// Placeholder - will fetch invitation data
	const invitation = {
		article_title: "Título do Artigo (pode estar oculto no double-blind)",
		due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
		estimated_time: "3-4 horas",
		status: "invited", // invited, accepted, declined, expired
		blinded: false,
	};

	const isExpired = invitation.status === "expired";
	const isAlreadyResponded = ["accepted", "declined"].includes(
		invitation.status,
	);

	const handleAccept = async () => {
		setIsAccepting(true);
		// TODO: Call acceptReviewInvitation mutation
		setTimeout(() => {
			navigate({ to: "/journal/review" });
		}, 1000);
	};

	const handleDecline = async () => {
		if (!declineReason.trim()) {
			alert("Por favor, informe um motivo para a recusa.");
			return;
		}
		setIsDeclining(true);
		// TODO: Call declineReviewInvitation mutation
		setTimeout(() => {
			navigate({ to: "/journal" });
		}, 1000);
	};

	if (isExpired) {
		return (
			<div className="flex flex-col items-center justify-center py-16 text-center max-w-2xl mx-auto">
				<div className="size-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
					<AlertCircle className="size-8 text-destructive" />
				</div>
				<h2 className="text-2xl font-bold mb-2">Convite Expirado</h2>
				<p className="text-muted-foreground mb-6">
					Este convite de revisão expirou. Se você ainda deseja revisar este
					artigo, entre em contato com o editor.
				</p>
				<Button asChild variant="outline">
					<Link to="/journal">Voltar à Página Inicial</Link>
				</Button>
			</div>
		);
	}

	if (isAlreadyResponded) {
		return (
			<div className="flex flex-col items-center justify-center py-16 text-center max-w-2xl mx-auto">
				<div className="size-16 rounded-full bg-muted flex items-center justify-center mb-4">
					{invitation.status === "accepted" ? (
						<CheckCircle2 className="size-8 text-green-600" />
					) : (
						<XCircle className="size-8 text-muted-foreground" />
					)}
				</div>
				<h2 className="text-2xl font-bold mb-2">
					{invitation.status === "accepted"
						? "Convite Aceito"
						: "Convite Recusado"}
				</h2>
				<p className="text-muted-foreground mb-6">
					{invitation.status === "accepted"
						? "Você já aceitou este convite. Acesse seu dashboard para realizar a revisão."
						: "Você recusou este convite anteriormente."}
				</p>
				<div className="flex gap-3">
					{invitation.status === "accepted" && (
						<Button asChild>
							<Link to="/journal/review">Ir para Dashboard</Link>
						</Button>
					)}
					<Button asChild variant="outline">
						<Link to="/journal">Voltar à Página Inicial</Link>
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="max-w-3xl mx-auto space-y-8">
			{/* Header */}
			<div className="text-center space-y-2">
				<div className="inline-flex size-16 rounded-full bg-primary/10 items-center justify-center mb-4">
					<FileText className="size-8 text-primary" />
				</div>
				<h1 className="text-3xl font-bold">Convite para Revisão por Pares</h1>
				<p className="text-muted-foreground">
					Você foi convidado para revisar um artigo científico
				</p>
			</div>

			{/* Invitation Details */}
			<div className="p-6 border rounded-lg bg-card space-y-6">
				<div>
					<h3 className="font-semibold text-lg mb-3">Detalhes do Convite</h3>
					<div className="space-y-3">
						<div>
							<span className="text-sm text-muted-foreground">Artigo:</span>
							<p className="font-medium">
								{invitation.blinded
									? "[Título oculto - Revisão Duplo-Cego]"
									: invitation.article_title}
							</p>
						</div>
						<div className="grid sm:grid-cols-2 gap-4">
							<div>
								<span className="text-sm text-muted-foreground flex items-center gap-2">
									<Clock className="size-4" />
									Prazo para Revisão
								</span>
								<p className="font-medium">
									{new Date(invitation.due_date).toLocaleDateString("pt-BR")}
								</p>
							</div>
							<div>
								<span className="text-sm text-muted-foreground">
									Tempo Estimado
								</span>
								<p className="font-medium">{invitation.estimated_time}</p>
							</div>
						</div>
					</div>
				</div>

				{/* Guidelines */}
				<div className="p-4 bg-muted rounded-lg">
					<h4 className="font-semibold mb-2">O que é esperado do revisor:</h4>
					<ul className="text-sm space-y-1 text-muted-foreground list-disc list-inside">
						<li>Avaliar a qualidade científica do manuscrito</li>
						<li>Fornecer feedback construtivo aos autores</li>
						<li>Completar a revisão dentro do prazo estabelecido</li>
						<li>Manter confidencialidade durante todo o processo</li>
						<li>Declarar eventuais conflitos de interesse</li>
					</ul>
				</div>
			</div>

			{/* Actions */}
			{!showDeclineForm ? (
				<div className="flex flex-col sm:flex-row gap-3">
					<Button
						className="flex-1"
						size="lg"
						onClick={handleAccept}
						disabled={isAccepting}
					>
						<CheckCircle2 className="size-5 mr-2" />
						{isAccepting ? "Aceitando..." : "Aceitar Convite"}
					</Button>
					<Button
						variant="outline"
						size="lg"
						onClick={() => setShowDeclineForm(true)}
						className="flex-1"
					>
						<XCircle className="size-5 mr-2" />
						Recusar Convite
					</Button>
				</div>
			) : (
				<div className="p-6 border rounded-lg bg-card space-y-4">
					<h3 className="font-semibold">Motivo da Recusa</h3>
					<p className="text-sm text-muted-foreground">
						Por favor, informe brevemente o motivo da recusa (opcional mas
						recomendado):
					</p>
					<textarea
						value={declineReason}
						onChange={(e) => setDeclineReason(e.target.value)}
						placeholder="Ex: Conflito de interesse, falta de expertise na área, sobrecarga de trabalho..."
						className="w-full px-3 py-2 border rounded-md min-h-[120px] bg-background"
					/>
					<div className="flex gap-3">
						<Button
							variant="destructive"
							onClick={handleDecline}
							disabled={isDeclining}
						>
							{isDeclining ? "Enviando..." : "Confirmar Recusa"}
						</Button>
						<Button
							variant="outline"
							onClick={() => setShowDeclineForm(false)}
							disabled={isDeclining}
						>
							Cancelar
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}

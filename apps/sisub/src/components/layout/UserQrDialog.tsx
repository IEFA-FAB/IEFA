import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@iefa/ui";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
	Copy as CopyIcon,
	Download as DownloadIcon,
	QrCode,
	XIcon,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import type React from "react";
import { useId, useRef } from "react";

type UserQrDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	userId: string | null;
	onCopy: () => void;
	hasCopied: boolean;
};

export function UserQrDialog({
	open,
	onOpenChange,
	userId,
	onCopy,
	hasCopied,
}: UserQrDialogProps) {
	const titleId = useId();
	const descId = useId();

	const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
	const canInteract = Boolean(userId);

	const handleDownload = () => {
		if (!qrCanvasRef.current || !userId) return;
		try {
			const url = qrCanvasRef.current.toDataURL("image/png");
			const a = document.createElement("a");
			a.href = url;
			a.download = `user-${userId}-qrcode.png`;
			a.click();
		} catch {}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		const isCopy =
			(e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && canInteract;
		if (isCopy) {
			e.preventDefault();
			onCopy();
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				aria-labelledby={titleId}
				aria-describedby={descId}
				onKeyDown={handleKeyDown}
				className="w-[95vw] max-w-md overflow-hidden p-0"
			>
				<div className="bg-primary px-4 py-3 text-primary-foreground sm:px-6 sm:py-4">
					<DialogHeader>
						<DialogTitle
							id={titleId}
							className="flex items-center gap-2 text-lg font-bold sm:text-xl"
						>
							<span
								aria-hidden="true"
								className="inline-flex rounded-lg bg-primary-foreground/15 p-1.5 sm:p-2"
							>
								<QrCode className="h-4 w-4 sm:h-5 sm:w-5" />
							</span>
							<span>Seu QR Code</span>
						</DialogTitle>

						<DialogDescription
							id={descId}
							className="mt-1 text-sm text-primary-foreground/80 sm:mt-2"
						>
							Use este código para identificação rápida no sistema.
						</DialogDescription>

						<DialogPrimitive.Close
							data-slot="dialog-close"
							className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute right-4 top-4 rounded-xs opacity-90 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
						>
							<XIcon aria-hidden="true" className="stroke-background" />
							<span className="sr-only">Fechar</span>
						</DialogPrimitive.Close>
					</DialogHeader>
				</div>

				<div className="bg-muted px-3 py-4 sm:px-6 sm:py-8">
					<div className="flex flex-col items-center gap-4 sm:gap-5">
						<div className="rounded-xl border-2 bg-white shadow-lg sm:rounded-2xl sm:border-4 p-2">
							{canInteract ? (
								<QRCodeCanvas
									role="img"
									aria-label={`QR Code para o usuário ${userId}`}
									value={userId ?? ""}
									// Canvas interno a 180px para download nítido
									size={240}
									level="M"
									includeMargin
									bgColor="#ffffff"
									fgColor="#111827"
									ref={qrCanvasRef}
									// Escala visual controlada por Tailwind
									className="w-full h-full rounded-2xl"
								/>
							) : (
								<div
									aria-busy="true"
									className="h-[140px] w-[140px] animate-pulse rounded-md bg-muted-foreground/10 sm:h-[180px] sm:w-[180px]"
								/>
							)}
						</div>

						<div className="w-full max-w-xs space-y-2 text-center sm:max-w-sm">
							<p className="text-xs font-medium text-muted-foreground sm:text-sm">
								ID do Usuário
							</p>

							<div className="w-full overflow-hidden rounded-lg border bg-card px-2 py-1.5 font-mono text-xs text-foreground sm:px-4 sm:py-2">
								<span className="block truncate text-center">
									{userId ?? "N/A"}
								</span>
							</div>

							<div className="flex w-full flex-col items-center gap-2 sm:flex-row sm:justify-center">
								<Button
									type="button"
									variant="secondary"
									size="sm"
									onClick={onCopy}
									disabled={!canInteract}
									className="w-full sm:w-auto"
								>
									<CopyIcon className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
									{hasCopied ? "Copiado!" : "Copiar ID"}
								</Button>

								<Button
									type="button"
									variant="default"
									size="sm"
									onClick={handleDownload}
									disabled={!canInteract}
									className="w-full sm:w-auto"
								>
									<DownloadIcon
										className="mr-2 h-3.5 w-3.5"
										aria-hidden="true"
									/>
									Baixar PNG
								</Button>
							</div>

							<p className="mt-1 text-[11px] text-muted-foreground sm:text-xs">
								Não compartilhe seu QR Code publicamente.
							</p>
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

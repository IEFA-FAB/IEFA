import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
} from "@iefa/ui";
import type React from "react";
import { useCallback, useId } from "react";

type NrOrdemDialogProps = {
	open: boolean;
	nrOrdem: string;
	error: string | null;
	isSaving: boolean;
	onOpenChange: (open: boolean) => void;
	onChange: (value: string) => void;
	onSubmit: () => void;
};

const NR_ORDEM_MAXLEN = 7; // ajuste conforme sua regra

export function SaramDialog({
	open,
	nrOrdem,
	error,
	isSaving,
	onOpenChange,
	onChange,
	onSubmit,
}: NrOrdemDialogProps) {
	const helpId = useId();
	const errorId = useId();

	const canSubmit = nrOrdem.trim().length > 0 && !isSaving;

	const normalizeDigits = useCallback((value: string) => {
		const digits = value.replace(/\D/g, "");
		return digits.slice(0, NR_ORDEM_MAXLEN);
	}, []);

	const handleChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			onChange(normalizeDigits(e.target.value));
		},
		[onChange, normalizeDigits],
	);

	const handlePaste = useCallback(
		(e: React.ClipboardEvent<HTMLInputElement>) => {
			e.preventDefault();
			const pasted = e.clipboardData.getData("text");
			onChange(normalizeDigits(pasted));
		},
		[onChange, normalizeDigits],
	);

	const handleSubmit = useCallback(
		(e: React.FormEvent<HTMLFormElement>) => {
			e.preventDefault();
			if (canSubmit) onSubmit();
		},
		[canSubmit, onSubmit],
	);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="sm:max-w-md"
				showCloseButton={false}
				aria-busy={isSaving}
				onInteractOutside={(event) => event.preventDefault()}
				onEscapeKeyDown={(event) => event.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>Informe seu SARAM</DialogTitle>
					<DialogDescription id={helpId}>
						Para continuar, precisamos do seu número de registro SARAM
						(nrOrdem).
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={handleSubmit} className="space-y-3">
					<div className="space-y-2">
						<label className="text-sm font-medium" htmlFor="nrOrdemInput">
							nrOrdem
						</label>
						<Input
							id="nrOrdemInput"
							name="nrOrdem"
							value={nrOrdem}
							inputMode="numeric"
							pattern="\d*"
							enterKeyHint="done"
							autoComplete="one-time-code"
							placeholder="Ex.: 1234567"
							maxLength={NR_ORDEM_MAXLEN}
							onChange={handleChange}
							onPaste={handlePaste}
							autoFocus
							required
							aria-invalid={Boolean(error)}
							aria-describedby={error ? `${helpId} ${errorId}` : helpId}
						/>
						{error && (
							<p
								id={errorId}
								role="alert"
								aria-live="polite"
								className="text-sm text-destructive"
							>
								{error}
							</p>
						)}
						<p className="text-xs text-muted-foreground">
							Usaremos esse dado apenas para identificar seu registro.
						</p>
					</div>

					<DialogFooter>
						<Button
							type="submit"
							disabled={!canSubmit}
							className="disabled:cursor-not-allowed disabled:opacity-50"
						>
							{isSaving ? (
								<span className="inline-flex items-center gap-2">
									<span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-b-transparent" />
									Salvando...
								</span>
							) : (
								"Salvar e continuar"
							)}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

import {
    Button,
    cn,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@iefa/ui";
import type React from "react";

export type EvaluationDialogProps = {
    open: boolean;
    question: string | null;
    selectedRating: number | null;
    isSubmitting: boolean;
    onOpenChange: (open: boolean) => void;
    onSelectRating: (value: number) => void;
    onSubmit: () => void;
};

const RATINGS = [1, 2, 3, 4, 5] as const;
const RATING_LABEL: Record<(typeof RATINGS)[number], string> = {
    1: "Péssimo",
    2: "Ruim",
    3: "Ok",
    4: "Bom",
    5: "Excelente",
};

function buttonToneClasses(value: number, selected: number | null) {
    const isSelected = selected === value;
    const base =
        "flex h-12 w-12 items-center justify-center rounded-lg font-semibold transition-transform select-none border " +
        "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2";

    if (!isSelected) {
        return cn(base, "bg-muted text-muted-foreground hover:scale-105");
    }

    // Variantes por faixa
    if (value <= 2) return cn(base, "bg-destructive text-destructive-foreground shadow-md scale-105");
    if (value === 3) return cn(base, "bg-secondary text-secondary-foreground shadow-md scale-105");
    return cn(base, "bg-primary text-primary-foreground shadow-md scale-105");
}

function submitToneClasses(selected: number | null) {
    if (selected == null) return undefined;
    if (selected <= 2) return "bg-destructive text-destructive-foreground hover:opacity-90";
    if (selected === 3) return "bg-secondary text-secondary-foreground hover:opacity-90";
    return "bg-primary text-primary-foreground hover:opacity-90";
}

export function EvaluationDialog({
    open,
    question,
    selectedRating,
    isSubmitting,
    onOpenChange,
    onSelectRating,
    onSubmit,
}: EvaluationDialogProps) {
    const resolvedQuestion = question || "Como você avalia?";

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedRating != null && !isSubmitting) onSubmit();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md" showCloseButton aria-busy={isSubmitting}>
                <DialogHeader>
                    <DialogTitle>Avaliação rápida</DialogTitle>
                    <DialogDescription className="py-4 text-center text-2xl text-foreground">
                        {resolvedQuestion}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit}>
                    <p className="mb-3 text-center text-sm text-muted-foreground">
                        Sua opinião ajuda a melhorar a experiência. Escolha uma nota de 1 a 5:
                    </p>

                    {/* Radiogroup acessível usando radios nativos (sr-only) */}
                    <fieldset className="relative mx-auto w-full max-w-xs" aria-label="Avaliação de 1 a 5">
                        <legend className="sr-only">Selecione uma nota</legend>

                        <div className="relative flex items-center justify-between gap-2 p-2">
                            {RATINGS.map((value) => (
                                <label key={value} className="relative">
                                    <input
                                        type="radio"
                                        name="rating"
                                        value={value}
                                        className="peer sr-only"
                                        checked={selectedRating === value}
                                        onChange={() => onSelectRating(value)}
                                        aria-label={`Nota ${value} de 5: ${RATING_LABEL[value]}`}
                                    />
                                    <span className={buttonToneClasses(value, selectedRating)}>{value}</span>
                                </label>
                            ))}
                        </div>

                        <div className="mt-2 flex justify-between px-2 text-[11px] text-muted-foreground">
                            <span>Péssimo</span>
                            <span>Excelente</span>
                        </div>
                    </fieldset>

                    <DialogFooter className="mt-6">
                        <Button
                            type="submit"
                            disabled={selectedRating == null || isSubmitting}
                            className={submitToneClasses(selectedRating)}
                        >
                            {isSubmitting ? (
                                <span className="inline-flex items-center gap-2">
                                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-b-transparent" />
                                    Enviando...
                                </span>
                            ) : (
                                "Enviar"
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

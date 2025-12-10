import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
	Label,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@iefa/ui";
import { useForm } from "@tanstack/react-form";
import { zodValidator } from "@tanstack/zod-form-adapter";
import { z } from "zod";
import type { NewUserPayload, Unit, UserLevelOrNull } from "@/types/domain";

// Remove local NewUserPayload definition and import from domain
// Schema de validação
const addUserSchema = z.object({
	id: z
		.string()
		.uuid("ID inválido. Informe um UUID válido.")
		.nonempty("ID é obrigatório"),
	email: z.string().email("Email inválido").nonempty("Email é obrigatório"),
	name: z.string().nonempty("Nome é obrigatório"),
	saram: z.string().regex(/^\d{7}$/, "SARAM deve ter 7 dígitos numéricos"),
	role: z.enum(["user", "admin", "superadmin"] as const),
	om: z.string(),
});

export default function AddUserDialog({
	open,
	onOpenChange,
	isLoading,
	units,
	isLoadingUnits,
	unitsError,
	onSubmit,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	isLoading: boolean;
	units: Unit[];
	isLoadingUnits: boolean;
	unitsError?: string | null;
	onSubmit: (payload: NewUserPayload) => void | Promise<void>;
}) {
	const form = useForm({
		defaultValues: {
			id: "",
			email: "",
			name: "",
			saram: "",
			role: "user" as UserLevelOrNull,
			om: "",
		},
		// @ts-ignore
		validatorAdapter: zodValidator(),
		validators: {
			onChange: addUserSchema,
		},
		onSubmit: async ({ value }) => {
			await onSubmit({
				...value,
				role: value.role as UserLevelOrNull,
				om: value.om || null,
			});
			form.reset();
		},
	});

	// Reset form on close is handled by the parent or manually if needed,
	// but strictly speaking TanStack Form handles state internally.
	// We can force reset when dialog opens if needed, but it's often better to reset on submit success.

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[520px]">
				<DialogHeader>
					<DialogTitle>Adicionar Novo Usuário</DialogTitle>
					<DialogDescription>
						Preencha todos os campos para cadastrar o usuário em profiles_admin.
						O ID deve ser o UUID do usuário que se tornará Admin.
					</DialogDescription>
				</DialogHeader>

				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className="grid gap-4 py-2"
				>
					<form.Field name="id">
						{(field) => (
							<div className="grid grid-cols-4 items-center gap-4">
								<Label htmlFor="id" className="text-right">
									ID (UUID)
								</Label>
								<div className="col-span-3">
									<Input
										id="id"
										name="id"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
										className={
											field.state.meta.errors.length > 0
												? "border-destructive"
												: ""
										}
									/>
									{field.state.meta.errors.length > 0 && (
										<span className="text-destructive text-sm">
											{field.state.meta.errors.join(", ")}
										</span>
									)}
								</div>
							</div>
						)}
					</form.Field>

					<form.Field name="name">
						{(field) => (
							<div className="grid grid-cols-4 items-center gap-4">
								<Label htmlFor="name" className="text-right">
									Nome
								</Label>
								<div className="col-span-3">
									<Input
										id="name"
										name="name"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder="Nome completo"
									/>
									{field.state.meta.errors.length > 0 && (
										<span className="text-destructive text-sm">
											{field.state.meta.errors.join(", ")}
										</span>
									)}
								</div>
							</div>
						)}
					</form.Field>

					<form.Field name="email">
						{(field) => (
							<div className="grid grid-cols-4 items-center gap-4">
								<Label htmlFor="email" className="text-right">
									Email
								</Label>
								<div className="col-span-3">
									<Input
										id="email"
										name="email"
										type="email"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder="usuario@exemplo.com"
									/>
									{field.state.meta.errors.length > 0 && (
										<span className="text-destructive text-sm">
											{field.state.meta.errors.join(", ")}
										</span>
									)}
								</div>
							</div>
						)}
					</form.Field>

					<form.Field name="saram">
						{(field) => (
							<div className="grid grid-cols-4 items-center gap-4">
								<Label htmlFor="saram" className="text-right">
									SARAM
								</Label>
								<div className="col-span-3">
									<Input
										id="saram"
										name="saram"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										maxLength={7}
										placeholder="Apenas 7 números"
									/>
									{field.state.meta.errors.length > 0 && (
										<span className="text-destructive text-sm">
											{field.state.meta.errors.join(", ")}
										</span>
									)}
								</div>
							</div>
						)}
					</form.Field>

					<form.Field name="role">
						{(field) => (
							<div className="grid grid-cols-4 items-center gap-4">
								<Label htmlFor="role" className="text-right">
									Role
								</Label>
								<div className="col-span-3">
									<Select
										value={field.state.value || ""}
										onValueChange={(value) =>
											field.handleChange(value as UserLevelOrNull)
										}
									>
										<SelectTrigger>
											<SelectValue placeholder="Selecione uma role" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="user">User</SelectItem>
											<SelectItem value="admin">Admin</SelectItem>
											<SelectItem value="superadmin">Superadmin</SelectItem>
										</SelectContent>
									</Select>
									{field.state.meta.errors.length > 0 && (
										<span className="text-destructive text-sm">
											{field.state.meta.errors.join(", ")}
										</span>
									)}
								</div>
							</div>
						)}
					</form.Field>

					<form.Field name="om">
						{(field) => (
							<div className="grid grid-cols-4 items-center gap-4">
								<Label htmlFor="om" className="text-right">
									OM
								</Label>
								<div className="col-span-3">
									<Select
										value={field.state.value || ""}
										onValueChange={(value) => field.handleChange(value)}
										disabled={isLoadingUnits}
									>
										<SelectTrigger>
											<SelectValue
												placeholder={
													isLoadingUnits
														? "Carregando OMs..."
														: "Selecione a OM (opcional)"
												}
											/>
										</SelectTrigger>
										<SelectContent>
											{(units || []).map((u) => (
												<SelectItem key={u.code} value={u.code}>
													{u.name ? u.name : u.code}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									{unitsError && (
										<p className="text-sm text-destructive">{unitsError}</p>
									)}
								</div>
							</div>
						)}
					</form.Field>

					<DialogFooter className="mt-4">
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							Cancelar
						</Button>
						<Button type="submit" disabled={isLoading}>
							{isLoading ? "Adicionando..." : "Adicionar"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

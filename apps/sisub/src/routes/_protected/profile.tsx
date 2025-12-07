import {
	Button,
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	Input,
	Label,
	Separator,
} from "@iefa/ui";
import { useForm } from "@tanstack/react-form";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { z } from "zod";

import { useAuth } from "@/hooks/useAuth";
import { useMilitaryData, useUserData } from "@/hooks/useProfile";
import { useUpdateNrOrdem } from "@/hooks/useUserNrOrdem";

export const Route = createFileRoute("/_protected/profile")({
	component: ProfilePage,
	head: () => ({
		meta: [
			{ title: "Perfil - SISUB" },
			{ name: "description", content: "Gerencie seu perfil e dados militares" },
		],
	}),
});

const profileSchema = z.object({
	nrOrdem: z
		.string()
		.regex(/^\d*$/, "Apenas números são permitidos")
		.max(20, "Máximo de 20 caracteres"),
});

function FieldRow({
	label,
	value,
	mono = false,
}: {
	label: string;
	value: string | null | undefined;
	mono?: boolean;
}) {
	return (
		<div className="flex flex-col gap-1">
			<span className="text-xs text-muted-foreground">{label}</span>
			<div
				className={[
					"rounded-md border bg-card px-3 py-2 text-sm",
					mono ? "font-mono" : "",
				].join(" ")}
			>
				{value && String(value).trim().length > 0 ? value : "—"}
			</div>
		</div>
	);
}

function ProfilePage() {
	const { user } = useAuth();

	// Data Fetching
	const { data: userData, isLoading: isLoadingUserData } = useUserData(
		user?.id,
	);

	// Derived state for military data fetch
	const effectiveNrOrdem = userData?.nrOrdem ?? "";

	const {
		data: military,
		isLoading: isLoadingMilitary,
		refetch: refetchMilitary,
	} = useMilitaryData(effectiveNrOrdem);

	// Mutation
	const updateNrOrdem = useUpdateNrOrdem();

	const form = useForm({
		defaultValues: {
			nrOrdem: "",
		},
		validators: {
			onChange: ({ value }) => {
				const result = profileSchema.safeParse(value);
				if (result.success) return undefined;
				const errors: Record<string, string> = {};
				result.error.issues.forEach((issue) => {
					errors[issue.path.join(".")] = issue.message;
				});
				return errors;
			},
		},
		onSubmit: async ({ value }) => {
			if (!user) return;
			await updateNrOrdem.mutateAsync({
				user,
				nrOrdem: value.nrOrdem ?? "",
			});
		},
	});

	// Sync form with loaded data
	useEffect(() => {
		if (userData?.nrOrdem) {
			form.setFieldValue("nrOrdem", userData.nrOrdem);
		}
	}, [userData?.nrOrdem, form]);

	return (
		<div className="mx-auto w-full max-w-5xl space-y-6 pt-6">
			{" "}
			{/* max-w-5xl to constrain width on large screens */}
			<div className="space-y-1">
				<h1 className="text-2xl font-bold tracking-tight">Perfil</h1>
				<p className="text-sm text-muted-foreground">
					Gerencie seu nrOrdem e visualize seus dados militares vinculados.
				</p>
			</div>
			<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
				{/* Esquerda: Dados do Usuário */}
				<Card>
					<CardHeader>
						<CardTitle>Seus dados</CardTitle>
						<CardDescription>
							O e-mail é gerenciado pela autenticação. Você pode informar seu
							nrOrdem.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{/* Email (Read-only) */}
						<FieldRow
							label="E-mail"
							value={user?.email ?? userData?.email ?? "Carregando..."}
						/>

						{/* Form: Nr Ordem */}
						<form
							onSubmit={(e) => {
								e.preventDefault();
								e.stopPropagation();
								form.handleSubmit();
							}}
							className="space-y-4"
						>
							<form.Field name="nrOrdem">
								{(field) => (
									<div className="space-y-1">
										<Label htmlFor={field.name}>Nr. da Ordem</Label>
										<Input
											id={field.name}
											name={field.name}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											placeholder="Ex.: 1234567"
											inputMode="numeric"
											pattern="[0-9]*"
										/>
										{field.state.meta.errors ? (
											<span role="alert" className="text-destructive text-sm">
												{field.state.meta.errors.join(", ")}
											</span>
										) : null}
										<p className="text-[11px] text-muted-foreground">
											Usado para vincular seus dados militares automaticamente.
										</p>
									</div>
								)}
							</form.Field>

							<div className="flex items-center gap-2">
								<Button
									type="submit"
									disabled={
										updateNrOrdem.isPending || !!form.state.isSubmitting
									}
								>
									{updateNrOrdem.isPending ? (
										<>
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
											Salvando...
										</>
									) : (
										"Salvar"
									)}
								</Button>
								{isLoadingUserData && (
									<span className="text-muted-foreground text-sm flex items-center gap-2">
										<Loader2 className="h-4 w-4 animate-spin" />
										Carregando dados...
									</span>
								)}
							</div>
						</form>
					</CardContent>
				</Card>

				{/* Direita: Dados Militares */}
				<Card>
					<CardHeader>
						<CardTitle>Dados militares</CardTitle>
						<CardDescription>
							{effectiveNrOrdem
								? "Encontrados a partir do seu nrOrdem."
								: "Informe seu nrOrdem para localizar seus dados."}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{!effectiveNrOrdem ? (
							<div className="text-sm text-muted-foreground py-4 text-center border rounded-md border-dashed">
								Nenhum nrOrdem informado.
							</div>
						) : isLoadingMilitary ? (
							<div className="flex items-center justify-center py-8 text-muted-foreground">
								<Loader2 className="h-6 w-6 animate-spin mr-2" />
								Buscando dados...
							</div>
						) : military ? (
							<div className="space-y-3">
								<FieldRow
									label="Nr. da Ordem"
									value={military.nrOrdem ?? effectiveNrOrdem}
									mono
								/>
								<FieldRow label="CPF" value={military.nrCpf} mono />
								<FieldRow label="Nome de Guerra" value={military.nmGuerra} />
								<FieldRow label="Nome" value={military.nmPessoa} />
								<div className="grid grid-cols-2 gap-3">
									<FieldRow label="Posto" value={military.sgPosto} />
									<FieldRow label="OM" value={military.sgOrg} />
								</div>
								<FieldRow
									label="Atualizado em"
									value={
										military.dataAtualizacao
											? new Date(military.dataAtualizacao).toLocaleString()
											: "—"
									}
								/>

								<div className="pt-2">
									<Button
										variant="outline"
										size="sm"
										onClick={() => refetchMilitary()}
									>
										Recarregar
									</Button>
								</div>
							</div>
						) : (
							<div className="text-sm text-muted-foreground py-4 text-center border rounded-md border-dashed">
								Nenhum registro militar encontrado para o nrOrdem{" "}
								<span className="font-mono text-foreground font-medium">
									{effectiveNrOrdem}
								</span>
								.
							</div>
						)}
					</CardContent>
				</Card>
			</div>
			<Separator />
			<Card className="bg-muted/50 border-none shadow-none">
				<CardContent className="pt-6">
					<h3 className="text-sm font-semibold mb-2">Dicas</h3>
					<ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
						<li>O número da Ordem deve conter apenas dígitos.</li>
						<li>
							Após salvar o nrOrdem, os dados militares são buscados
							automaticamente.
						</li>
						<li>
							Se seus dados não aparecerem, verifique se o número está correto
							ou se o cadastro militar está atualizado.
						</li>
					</ul>
				</CardContent>
			</Card>
		</div>
	);
}

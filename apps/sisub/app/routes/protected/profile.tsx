// apps/sisub/app/routes/profile.tsx

import { useAuth } from "@iefa/auth";
import { Button, Input, Separator } from "@iefa/ui";
import type { User } from "@supabase/supabase-js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import supabase from "~/utils/supabase";

type UserDataRow = {
    id: string;
    email: string;
    nrOrdem: string | null;
};

type MilitaryDataRow = {
    nrOrdem: string | null;
    nrCpf: string;
    nmGuerra: string | null;
    nmPessoa: string | null;
    sgPosto: string | null;
    sgOrg: string | null;
    dataAtualizacao: string | null; // timestamp with time zone -> string
};

/* ============ Data access ============ */

async function fetchUserData(user: User): Promise<UserDataRow | null> {
    const { data, error } = await supabase.from("user_data").select("id,email,nrOrdem").eq("id", user.id).maybeSingle();

    if (error) throw error;
    // pode não existir ainda (primeiro acesso)
    return data ? { id: data.id, email: data.email, nrOrdem: data.nrOrdem ?? null } : null;
}

async function upsertUserData(user: User, nrOrdem: string | null) {
    const payload = {
        id: user.id,
        email: user.email,
        nrOrdem: nrOrdem && nrOrdem.trim().length > 0 ? nrOrdem.trim() : null,
    };
    const { error } = await supabase.from("user_data").upsert(payload, { onConflict: "id" });
    if (error) throw error;
}

async function fetchMilitaryDataByNrOrdem(nrOrdem: string): Promise<MilitaryDataRow | null> {
    // Busca pelo nrOrdem e pega o mais recente por dataAtualizacao
    const { data, error } = await supabase
        .from("user_military_data")
        .select("nrOrdem, nrCpf, nmGuerra, nmPessoa, sgPosto, sgOrg, dataAtualizacao")
        .eq("nrOrdem", nrOrdem)
        .order("dataAtualizacao", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    return data ?? null;
}

/* ============ UI helpers ============ */

function FieldRow({ label, value, mono = false }: { label: string; value: string | null | undefined; mono?: boolean }) {
    return (
        <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{label}</span>
            <div className={["rounded-md border bg-card px-3 py-2 text-sm", mono ? "font-mono" : ""].join(" ")}>
                {value && String(value).trim().length > 0 ? value : "—"}
            </div>
        </div>
    );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
    return (
        <section className="rounded-lg border bg-card text-card-foreground p-4 sm:p-6">
            <div className="mb-4">
                <h2 className="text-base sm:text-lg font-semibold">{title}</h2>
                {description ? <p className="text-xs sm:text-sm text-muted-foreground mt-1">{description}</p> : null}
            </div>
            {children}
        </section>
    );
}

function Spinner({ label }: { label?: string }) {
    return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-b-transparent" />
            {label ? <span>{label}</span> : null}
        </div>
    );
}

/* ============ Page ============ */

export default function ProfilePage() {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    // NrOrdem local (para edição)
    const [nrOrdemInput, setNrOrdemInput] = useState("");
    const [nrError, setNrError] = useState<string | null>(null);

    // Carrega user_data (pode não existir ainda)
    const userDataQuery = useQuery({
        queryKey: ["user_data", user?.id],
        enabled: !!user?.id,
        queryFn: () => fetchUserData(user as User),
        staleTime: 5 * 60_000,
        gcTime: 10 * 60_000,
    });

    // Atualiza input ao carregar user_data
    useEffect(() => {
        if (userDataQuery.isSuccess) {
            const cur = userDataQuery.data?.nrOrdem ?? "";
            setNrOrdemInput(cur);
        }
    }, [userDataQuery.isSuccess, userDataQuery.data?.nrOrdem]);

    const effectiveNrOrdem = useMemo(() => userDataQuery.data?.nrOrdem ?? "", [userDataQuery.data?.nrOrdem]);

    // Busca dados militares a partir do nrOrdem do user_data
    const militaryQuery = useQuery({
        queryKey: ["military", effectiveNrOrdem],
        enabled: !!effectiveNrOrdem && effectiveNrOrdem.trim().length > 0,
        queryFn: () => fetchMilitaryDataByNrOrdem(effectiveNrOrdem),
        staleTime: 2 * 60_000,
        gcTime: 10 * 60_000,
    });

    // Mutação: salvar nrOrdem (upsert em user_data)
    const saveMutation = useMutation({
        mutationFn: async (newNr: string) => {
            if (!user) throw new Error("Usuário não autenticado");
            await upsertUserData(user, newNr);
        },
        onMutate: async (newNr) => {
            setNrError(null);
            // otimista: atualiza cache de user_data
            await queryClient.cancelQueries({
                queryKey: ["user_data", user?.id],
            });
            const prev = queryClient.getQueryData<UserDataRow | null>(["user_data", user?.id]);
            const optimistic: UserDataRow = {
                id: user!.id,
                email: user!.email ?? prev?.email ?? "",
                nrOrdem: newNr && newNr.trim().length > 0 ? newNr.trim() : null,
            };
            queryClient.setQueryData(["user_data", user?.id], optimistic);
            return { prev };
        },
        onError: (err, _newNr, ctx) => {
            console.error("Erro ao salvar nrOrdem:", err);
            if (ctx?.prev) {
                queryClient.setQueryData(["user_data", user?.id], ctx.prev);
            }
            setNrError("Não foi possível salvar. Tente novamente.");
        },
        onSuccess: () => {
            // refetch militar caso o nrOrdem tenha mudado
            queryClient.invalidateQueries({
                queryKey: ["military"],
                exact: false,
            });
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["user_data", user?.id] });
        },
    });

    const handleSave = useCallback(() => {
        const digitsOnly = nrOrdemInput.replace(/\D/g, "");
        // validação simples (mesma filosofia do app-layout)
        if (digitsOnly.length > 0 && digitsOnly.length < 7) {
            setNrError("Nr. da Ordem parece curto. Confira e tente novamente.");
            return;
        }
        if (!user) return;
        saveMutation.mutate(digitsOnly);
    }, [nrOrdemInput, saveMutation, user]);

    const isLoadingUserData = userDataQuery.isLoading;
    const isSaving = saveMutation.isPending;
    const isLoadingMilitary = militaryQuery.isLoading;
    const military = militaryQuery.data ?? null;

    return (
        <div className="mx-auto w-full max-w-5xl p-3 sm:p-6">
            <div className="mb-4 sm:mb-6">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Perfil</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Gerencie seu nrOrdem e visualize seus dados militares vinculados.
                </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
                {/* Coluna esquerda: user_data */}
                <Section
                    title="Seus dados"
                    description="O e-mail é gerenciado pela autenticação. Você pode informar/atualizar seu nrOrdem."
                >
                    <div className="space-y-4">
                        {/* Email (read-only) */}
                        <FieldRow label="E-mail" value={user?.email ?? userDataQuery.data?.email ?? ""} />

                        {/* nrOrdem (editável) */}
                        <div className="flex flex-col gap-2">
                            <label htmlFor="nrOrdem" className="text-xs text-muted-foreground">
                                Nr. da Ordem
                            </label>
                            <Input
                                id="nrOrdem"
                                value={nrOrdemInput}
                                inputMode="numeric"
                                pattern="[0-9]*"
                                placeholder="Ex.: 1234567"
                                onChange={(e) => {
                                    // mantém somente dígitos
                                    const onlyDigits = e.target.value.replace(/\D/g, "");
                                    setNrOrdemInput(onlyDigits);
                                    if (nrError) setNrError(null);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        handleSave();
                                    }
                                }}
                            />
                            {nrError ? (
                                <p className="text-xs text-destructive">{nrError}</p>
                            ) : (
                                <p className="text-[11px] text-muted-foreground">
                                    Usado para vincular seus dados militares automaticamente.
                                </p>
                            )}
                        </div>

                        <div className="flex items-center gap-2">
                            <Button onClick={handleSave} disabled={isSaving || !user}>
                                {isSaving ? (
                                    <span className="inline-flex items-center gap-2">
                                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-b-transparent" />
                                        Salvando...
                                    </span>
                                ) : (
                                    "Salvar"
                                )}
                            </Button>

                            {isLoadingUserData ? <Spinner label="Carregando..." /> : null}
                        </div>
                    </div>
                </Section>

                {/* Coluna direita: user_military_data (read-only) */}
                <Section
                    title="Dados militares"
                    description={
                        effectiveNrOrdem
                            ? "Encontrados a partir do seu nrOrdem."
                            : "Informe seu nrOrdem para localizar seus dados militares."
                    }
                >
                    <div className="space-y-4">
                        {!effectiveNrOrdem ? (
                            <div className="text-sm text-muted-foreground">
                                Nenhum nrOrdem informado. Preencha seu nrOrdem e salve para tentar localizar seus dados
                                militares.
                            </div>
                        ) : isLoadingMilitary ? (
                            <Spinner label="Buscando dados militares..." />
                        ) : military ? (
                            <div className="space-y-3">
                                <FieldRow label="Nr. da Ordem" value={military.nrOrdem ?? effectiveNrOrdem} mono />
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

                                <div className="pt-1">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                            queryClient.invalidateQueries({
                                                queryKey: ["military", effectiveNrOrdem],
                                            })
                                        }
                                    >
                                        Recarregar
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="text-sm text-muted-foreground">
                                Nenhum registro militar encontrado para o nrOrdem informado.
                            </div>
                        )}
                    </div>
                </Section>
            </div>

            <Separator className="my-6" />

            <div className="rounded-lg border bg-card p-4 sm:p-6">
                <h3 className="text-sm font-semibold mb-2">Dicas</h3>
                <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                    <li>O número da Ordem deve conter apenas dígitos.</li>
                    <li>Após salvar o nrOrdem, use “Recarregar” para atualizar os dados militares.</li>
                    <li>Se seus dados militares não aparecerem, confirme se o nrOrdem está correto.</li>
                </ul>
            </div>
        </div>
    );
}

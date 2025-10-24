import supabase from "~/utils/supabase";

export type UserLevel = "user" | "admin" | "superadmin";
export type UserLevelOrNull = UserLevel | null;

export async function checkUserLevel(
  userId: string | null | undefined
): Promise<UserLevelOrNull> {
  if (!userId) return null;

  try {
    const { data, error } = await supabase
      .from("profiles_admin")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("Erro ao verificar o nível de admin:", error);
      return null;
    }

    // Se não houver registro, por padrão trate como null (ajuste conforme sua regra)
    if (!data) {
      return null;
    }

    if (
      data.role === "admin" ||
      data.role === "superadmin" ||
      data.role === "user"
    ) {
      return data.role;
    }
    return null;
  } catch (e) {
    console.error("Erro inesperado ao verificar o nível do usuário:", e);
    return null;
  }
}

export type UserOm = string | null;

export async function checkUserOm(
  userId: string | null | undefined
): Promise<UserOm> {
  if (!userId) return null;

  try {
    const { data, error } = await supabase
      .from("profiles_admin")
      .select("om")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("Erro ao verificar OM do usuário:", error);
      return null;
    }
    return data?.om ?? null;
  } catch (e) {
    console.error("Erro inesperado ao verificar OM do usuário:", e);
    return null;
  }
}

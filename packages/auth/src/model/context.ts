// packages/auth/src/model/context.ts

import type { User } from "@supabase/supabase-js";
import { createContext } from "react-router";

export const userContext = createContext<User | null>(null);

// Se quiser injetar dados adicionais do usuário (ex.: role/om):
export type UserMeta = Record<string, unknown>;
export const userMetaContext = createContext<UserMeta | null>(null);

import type { Session, User } from "@supabase/supabase-js";

export interface AuthContextType {
	user: User | null;
	session: Session | null;
	isLoading: boolean;
	isAuthenticated: boolean;
	signIn: (email: string, password: string) => Promise<void>;
	signUp: (
		email: string,
		password: string,
		redirectTo?: string,
	) => Promise<void>;
	signOut: (opts?: { redirectTo?: string; reload?: boolean }) => Promise<void>;
	resetPassword: (email: string, redirectTo?: string) => Promise<void>;
	refreshSession: () => Promise<void>;
}

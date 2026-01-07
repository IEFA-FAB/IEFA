import { useSuspenseQuery } from "@tanstack/react-query";
import { authActions, authQueryOptions } from "@/auth/service";

export function useAuth() {
	// Use suspense query for fresh, type-safe auth data
	const { data } = useSuspenseQuery(authQueryOptions());

	return {
		...authActions, // signIn, signOut, etc
		...data, // user, session, isAuthenticated
	};
}

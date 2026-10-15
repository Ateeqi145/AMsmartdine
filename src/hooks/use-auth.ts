import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";

export function useAuth() {
	const { signOut } = useAuthActions();
	const { isAuthenticated, isLoading } = useConvexAuth();

	return { isAuthenticated, isLoading, signout: signOut };
}

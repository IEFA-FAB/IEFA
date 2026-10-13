export { ACCESS_TOKEN_READ_TIMEOUT_MS, readAccessToken } from "./access-token.ts"
export { type AuthActions, type AuthActionsOptions, createAuthActions } from "./actions.ts"
export {
	type AuthScreenMessages,
	type AuthTab,
	type AuthView,
	checkForgotInput,
	checkLoginInput,
	checkRegisterInput,
	DEFAULT_INVALID_CREDENTIALS_PATTERN,
	deriveAuthView,
	describeSignInFailure,
	FAB_EMAIL_AUTH_MESSAGES,
	FAB_INSTITUTIONAL_EMAIL_PATTERN,
	type ForgotInputCheck,
	getEmailHint,
	getErrorMessage,
	getPasswordError,
	getPostLoginPath,
	getVerifiableOtpType,
	isEmailAccepted,
	type KeyValueStorage,
	type LoginInputCheck,
	persistRememberedEmail,
	type RegisterInput,
	type RegisterInputCheck,
	type SignInFailure,
	shouldRedirectAuthenticated,
	syncRememberedEmailOnToggle,
} from "./auth-screen.ts"
export {
	type AuthScreenActions,
	type AuthScreenConfig,
	type AuthScreenHandlerDeps,
	type AuthScreenNavigate,
	createAuthScreenHandlers,
	type ResolvedAuthScreenConfig,
	resolveAuthScreenConfig,
} from "./auth-screen-handlers.ts"
export { FAB_EMAIL_DOMAIN, isFabEmail } from "./email-domain.ts"
export { getAuthErrorMessage, normalizeEmail, SIGNUP_DOMAIN_REFUSED_MESSAGE, SIGNUP_HOOK_UNAVAILABLE_MESSAGE } from "./errors.ts"
export { getRemainingSeconds, type RateLimitState, recordFailure, resetRateLimit } from "./rate-limiter.ts"
export { isInternalPath, safeRedirect } from "./redirect.ts"
export { checkSameOriginJsonRequest, isRequestOrigin, type SameOriginCheck } from "./same-origin.ts"

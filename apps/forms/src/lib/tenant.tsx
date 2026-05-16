import type { ReactNode } from "react"
import { createContext, useContext } from "react"

export type Tenant = "forms" | "cinco-s"

export type TenantConfig = {
	id: Tenant
	name: string
	tagFilter: string[] | null
}

export const TENANTS: Record<Tenant, TenantConfig> = {
	forms: { id: "forms", name: "Formulários IEFA", tagFilter: null },
	"cinco-s": { id: "cinco-s", name: "Programa 5S", tagFilter: ["5s"] },
}

const TenantContext = createContext<TenantConfig | null>(null)

export function TenantProvider({ tenant, children }: { tenant: Tenant; children: ReactNode }) {
	return <TenantContext.Provider value={TENANTS[tenant]}>{children}</TenantContext.Provider>
}

export function useTenant(): TenantConfig {
	const ctx = useContext(TenantContext)
	if (!ctx) throw new Error("useTenant() must be used inside <TenantProvider>")
	return ctx
}

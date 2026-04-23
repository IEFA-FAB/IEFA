import { useStore } from "@tanstack/react-store"
import { Store } from "@tanstack/store"

interface HubState {
	searchQuery: string
	activeCategory: string
}

export const hubStore = new Store<HubState>({
	searchQuery: "",
	activeCategory: "Visão Geral",
})

export const setSearchQuery = (q: string) => hubStore.setState((s) => ({ ...s, searchQuery: q }))

export const setActiveCategory = (cat: string) => hubStore.setState((s) => ({ ...s, activeCategory: cat }))

export const useSearchQuery = () => useStore(hubStore, (s) => s.searchQuery)
export const useActiveCategory = () => useStore(hubStore, (s) => s.activeCategory)

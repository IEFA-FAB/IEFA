/**
 * @module menu-groups.fn
 * Conjuntos de grupos do cardápio ("templates de grupos") — wrappers finos sobre
 * @iefa/sisub-domain (operations/menu-groups).
 * @domain core
 * @migration done
 */

import {
	CreateMenuGroupSetSchema,
	createMenuGroupSet,
	DeleteMenuGroupSetSchema,
	deleteMenuGroupSet,
	FetchMenuGroupSetsSchema,
	fetchMenuGroupSets,
	UpdateMenuGroupSetSchema,
	updateMenuGroupSet,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuthThenRun } from "@/lib/domain-handler.server"

export const fetchMenuGroupSetsFn = createServerFn({ method: "GET" }).validator(FetchMenuGroupSetsSchema).handler(requireAuthThenRun(fetchMenuGroupSets))

export const createMenuGroupSetFn = createServerFn({ method: "POST" }).validator(CreateMenuGroupSetSchema).handler(requireAuthThenRun(createMenuGroupSet))

export const updateMenuGroupSetFn = createServerFn({ method: "POST" }).validator(UpdateMenuGroupSetSchema).handler(requireAuthThenRun(updateMenuGroupSet))

export const deleteMenuGroupSetFn = createServerFn({ method: "POST" }).validator(DeleteMenuGroupSetSchema).handler(requireAuthThenRun(deleteMenuGroupSet))

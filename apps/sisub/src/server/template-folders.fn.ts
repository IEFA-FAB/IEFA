/**
 * @module template-folders.fn
 * Pastas do catálogo global de eventos e cardápios de apoio. Repasse puro às operations de
 * `@iefa/sisub-domain`, que fazem a autorização (leitura `kitchen:1`/`global:1`; escrita `global:2`).
 * @domain core
 */

import {
	CreateTemplateFolderSchema,
	createTemplateFolder,
	DeleteTemplateFolderSchema,
	deleteTemplateFolder,
	ListTemplateFoldersSchema,
	listTemplateFolders,
	MoveTemplateFolderSchema,
	moveTemplateFolder,
	SetTemplateFolderSchema,
	setTemplateFolder,
	UpdateTemplateFolderSchema,
	updateTemplateFolder,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuthThenRun } from "@/lib/domain-handler.server"

export const fetchTemplateFoldersFn = createServerFn({ method: "GET" }).validator(ListTemplateFoldersSchema).handler(requireAuthThenRun(listTemplateFolders))

export const createTemplateFolderFn = createServerFn({ method: "POST" }).validator(CreateTemplateFolderSchema).handler(requireAuthThenRun(createTemplateFolder))

export const updateTemplateFolderFn = createServerFn({ method: "POST" }).validator(UpdateTemplateFolderSchema).handler(requireAuthThenRun(updateTemplateFolder))

export const moveTemplateFolderFn = createServerFn({ method: "POST" }).validator(MoveTemplateFolderSchema).handler(requireAuthThenRun(moveTemplateFolder))

export const deleteTemplateFolderFn = createServerFn({ method: "POST" }).validator(DeleteTemplateFolderSchema).handler(requireAuthThenRun(deleteTemplateFolder))

export const setTemplateFolderFn = createServerFn({ method: "POST" }).validator(SetTemplateFolderSchema).handler(requireAuthThenRun(setTemplateFolder))

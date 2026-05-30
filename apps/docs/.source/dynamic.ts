// @ts-nocheck
/// <reference types="vite/client" />
import { dynamic } from 'fumadocs-mdx/runtime/dynamic';
import * as Config from '../source.config';

const create = await dynamic<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>(Config, {"configPath":"/home/usernanni/Projects/IEFA/apps/docs/source.config.ts","environment":"vite","outDir":"/home/usernanni/Projects/IEFA/apps/docs/.source"}, {"doc":{"passthroughs":["extractedReferences"]}});
// TODO(db:types): volta a `./generated.ts` quando os tipos forem regerados depois de 20260927130000.
import type { Database as GeneratedDatabase } from "./pending-ubiquitous-language-lot7.ts"

export type { Json } from "./generated.ts"
export type { Database } from "./pending-ubiquitous-language-lot7.ts"

type Schemas = Omit<GeneratedDatabase, "__InternalSupabase">

export type SchemaName = keyof Schemas

export type SchemaDefinition<TSchema extends SchemaName> = Schemas[TSchema]

export type TableName<TSchema extends SchemaName> = keyof SchemaDefinition<TSchema>["Tables"]
export type ViewName<TSchema extends SchemaName> = keyof SchemaDefinition<TSchema>["Views"]
export type EnumName<TSchema extends SchemaName> = keyof SchemaDefinition<TSchema>["Enums"]
export type CompositeTypeName<TSchema extends SchemaName> = keyof SchemaDefinition<TSchema>["CompositeTypes"]

export type TableRow<TSchema extends SchemaName, TTable extends TableName<TSchema>> = SchemaDefinition<TSchema>["Tables"][TTable] extends { Row: infer TRow }
	? TRow
	: never

export type TableInsert<TSchema extends SchemaName, TTable extends TableName<TSchema>> = SchemaDefinition<TSchema>["Tables"][TTable] extends {
	Insert: infer TInsert
}
	? TInsert
	: never

export type TableUpdate<TSchema extends SchemaName, TTable extends TableName<TSchema>> = SchemaDefinition<TSchema>["Tables"][TTable] extends {
	Update: infer TUpdate
}
	? TUpdate
	: never

export type TableRelationships<TSchema extends SchemaName, TTable extends TableName<TSchema>> = SchemaDefinition<TSchema>["Tables"][TTable] extends {
	Relationships: infer TRelationships
}
	? TRelationships
	: never

export type ViewRow<TSchema extends SchemaName, TView extends ViewName<TSchema>> = SchemaDefinition<TSchema>["Views"][TView] extends { Row: infer TRow }
	? TRow
	: never

export type EnumValue<TSchema extends SchemaName, TEnum extends EnumName<TSchema>> = SchemaDefinition<TSchema>["Enums"][TEnum]

export type CompositeType<TSchema extends SchemaName, TComposite extends CompositeTypeName<TSchema>> = SchemaDefinition<TSchema>["CompositeTypes"][TComposite]

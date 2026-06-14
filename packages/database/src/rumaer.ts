import type { Database } from "./generated.ts"

type RumaerSchema = Database["rumaer"]

export type Tables<T extends keyof RumaerSchema["Tables"]> = RumaerSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof RumaerSchema["Tables"]> = RumaerSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof RumaerSchema["Tables"]> = RumaerSchema["Tables"][T]["Update"]
export type Enums<T extends keyof RumaerSchema["Enums"]> = RumaerSchema["Enums"][T]

// ---- Enums ----
export type GrupoUniforme = Enums<"grupo_uniforme">
export type CategoriaMilitar = Enums<"categoria_militar">
export type CirculoHierarquico = Enums<"circulo_hierarquico">
export type Genero = Enums<"genero">
export type Obrigatoriedade = Enums<"obrigatoriedade">
export type EquivalenciaCivil = Enums<"equivalencia_civil">
export type TipoPeca = Enums<"tipo_peca">

// ---- Tables ----
export type Uniform = Tables<"uniform">
export type UniformInsert = TablesInsert<"uniform">
export type UniformUpdate = TablesUpdate<"uniform">

export type UniformCategory = Tables<"uniform_category">
export type UniformCategoryInsert = TablesInsert<"uniform_category">
export type UniformCategoryUpdate = TablesUpdate<"uniform_category">

export type UniformVariant = Tables<"uniform_variant">
export type UniformVariantInsert = TablesInsert<"uniform_variant">
export type UniformVariantUpdate = TablesUpdate<"uniform_variant">

export type Piece = Tables<"piece">
export type PieceInsert = TablesInsert<"piece">
export type PieceUpdate = TablesUpdate<"piece">

export type UniformVariantPiece = Tables<"uniform_variant_piece">
export type UniformVariantPieceInsert = TablesInsert<"uniform_variant_piece">
export type UniformVariantPieceUpdate = TablesUpdate<"uniform_variant_piece">

// ---- Composed view types (joins resolvidos nas server fns) ----
export type VariantPieceWithPiece = UniformVariantPiece & { piece: Piece }
export type UniformVariantWithPieces = UniformVariant & { pieces: VariantPieceWithPiece[] }
export type UniformDetail = Uniform & {
	categories: UniformCategory[]
	variants: UniformVariantWithPieces[]
}

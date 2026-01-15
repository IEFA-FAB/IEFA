export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  sisub: {
    Tables: {
      changelog: {
        Row: {
          body: string
          id: string
          published: boolean
          published_at: string
          tags: string[] | null
          title: string
          version: string | null
        }
        Insert: {
          body: string
          id?: string
          published?: boolean
          published_at?: string
          tags?: string[] | null
          title: string
          version?: string | null
        }
        Update: {
          body?: string
          id?: string
          published?: boolean
          published_at?: string
          tags?: string[] | null
          title?: string
          version?: string | null
        }
        Relationships: []
      }
      daily_menu: {
        Row: {
          created_at: string
          deleted_at: string | null
          forecasted_headcount: number | null
          id: string
          kitchen_id: number | null
          meal_type_id: string | null
          service_date: string | null
          status: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          forecasted_headcount?: number | null
          id?: string
          kitchen_id?: number | null
          meal_type_id?: string | null
          service_date?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          forecasted_headcount?: number | null
          id?: string
          kitchen_id?: number | null
          meal_type_id?: string | null
          service_date?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_menu_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "kitchen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_menu_meal_type_id_fkey"
            columns: ["meal_type_id"]
            isOneToOne: false
            referencedRelation: "meal_type"
            referencedColumns: ["id"]
          },
        ]
      }
      folder: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          parent_id: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          parent_id?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          parent_id?: string | null
        }
        Relationships: []
      }
      kitchen: {
        Row: {
          created_at: string
          id: number
          kitchen_id: number | null
          purchase_unit_id: number | null
          type: Database["sisub"]["Enums"]["kitchen_type"] | null
          unit_id: number | null
        }
        Insert: {
          created_at?: string
          id?: number
          kitchen_id?: number | null
          purchase_unit_id?: number | null
          type?: Database["sisub"]["Enums"]["kitchen_type"] | null
          unit_id?: number | null
        }
        Update: {
          created_at?: string
          id?: number
          kitchen_id?: number | null
          purchase_unit_id?: number | null
          type?: Database["sisub"]["Enums"]["kitchen_type"] | null
          unit_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kitchen_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "kitchen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kitchen_purchase_unit_id_fkey"
            columns: ["purchase_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kitchen_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_forecasts: {
        Row: {
          created_at: string | null
          date: string
          id: string
          meal: string
          mess_hall_id: number
          updated_at: string | null
          user_id: string
          will_eat: boolean
        }
        Insert: {
          created_at?: string | null
          date: string
          id?: string
          meal: string
          mess_hall_id: number
          updated_at?: string | null
          user_id: string
          will_eat: boolean
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          meal?: string
          mess_hall_id?: number
          updated_at?: string | null
          user_id?: string
          will_eat?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "meal_forecasts_mess_hall_id_fkey"
            columns: ["mess_hall_id"]
            isOneToOne: false
            referencedRelation: "mess_halls"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_presences: {
        Row: {
          created_at: string
          date: string
          id: string
          meal: string
          mess_hall_id: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          meal: string
          mess_hall_id: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          meal?: string
          mess_hall_id?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_presences_mess_hall_id_fkey"
            columns: ["mess_hall_id"]
            isOneToOne: false
            referencedRelation: "mess_halls"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_type: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          kitchen_id: number | null
          name: string | null
          sort_order: number | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          kitchen_id?: number | null
          name?: string | null
          sort_order?: number | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          kitchen_id?: number | null
          name?: string | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_type_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "kitchen"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          created_at: string
          daily_menu_id: string | null
          deleted_at: string | null
          excluded_from_procurement: number | null
          id: string
          planned_portion_quantity: number | null
          recipe: Json | null
          recipe_origin_id: string | null
          substitutions: Json | null
        }
        Insert: {
          created_at?: string
          daily_menu_id?: string | null
          deleted_at?: string | null
          excluded_from_procurement?: number | null
          id?: string
          planned_portion_quantity?: number | null
          recipe?: Json | null
          recipe_origin_id?: string | null
          substitutions?: Json | null
        }
        Update: {
          created_at?: string
          daily_menu_id?: string | null
          deleted_at?: string | null
          excluded_from_procurement?: number | null
          id?: string
          planned_portion_quantity?: number | null
          recipe?: Json | null
          recipe_origin_id?: string | null
          substitutions?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_daily_menu_id_fkey"
            columns: ["daily_menu_id"]
            isOneToOne: false
            referencedRelation: "daily_menu"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_recipe_origin_id_fkey"
            columns: ["recipe_origin_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_template: {
        Row: {
          base_template_id: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          kitchen_id: number | null
          name: string | null
        }
        Insert: {
          base_template_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          kitchen_id?: number | null
          name?: string | null
        }
        Update: {
          base_template_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          kitchen_id?: number | null
          name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_template_base_template_id_fkey"
            columns: ["base_template_id"]
            isOneToOne: false
            referencedRelation: "menu_template"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_template_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "kitchen"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_template_items: {
        Row: {
          created_at: string
          day_of_week: number | null
          id: string
          meal_type_id: string | null
          menu_template_id: string | null
          recipe_id: string | null
        }
        Insert: {
          created_at?: string
          day_of_week?: number | null
          id?: string
          meal_type_id?: string | null
          menu_template_id?: string | null
          recipe_id?: string | null
        }
        Update: {
          created_at?: string
          day_of_week?: number | null
          id?: string
          meal_type_id?: string | null
          menu_template_id?: string | null
          recipe_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_template_items_meal_type_id_fkey"
            columns: ["meal_type_id"]
            isOneToOne: false
            referencedRelation: "meal_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_template_items_menu_template_id_fkey"
            columns: ["menu_template_id"]
            isOneToOne: false
            referencedRelation: "menu_template"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_template_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      mess_halls: {
        Row: {
          code: string
          display_name: string | null
          id: number
          kitchen_id: number | null
          unit_id: number
        }
        Insert: {
          code: string
          display_name?: string | null
          id?: number
          kitchen_id?: number | null
          unit_id: number
        }
        Update: {
          code?: string
          display_name?: string | null
          id?: number
          kitchen_id?: number | null
          unit_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "mess_halls_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "kitchen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mess_halls_unit_fk"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mess_halls_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      migration_folder_lookup: {
        Row: {
          created_at: string | null
          legacy_id_grupo_produto: number
          new_folder_id: string
        }
        Insert: {
          created_at?: string | null
          legacy_id_grupo_produto: number
          new_folder_id: string
        }
        Update: {
          created_at?: string | null
          legacy_id_grupo_produto?: number
          new_folder_id?: string
        }
        Relationships: []
      }
      migration_product_lookup: {
        Row: {
          created_at: string | null
          legacy_descricao: string | null
          legacy_id_insumo: number
          new_product_id: string
        }
        Insert: {
          created_at?: string | null
          legacy_descricao?: string | null
          legacy_id_insumo: number
          new_product_id: string
        }
        Update: {
          created_at?: string | null
          legacy_descricao?: string | null
          legacy_id_insumo?: number
          new_product_id?: string
        }
        Relationships: []
      }
      migration_recipe_lookup: {
        Row: {
          created_at: string | null
          legacy_id_preparacao: number
          legacy_rendimento: number | null
          new_recipe_id: string
        }
        Insert: {
          created_at?: string | null
          legacy_id_preparacao: number
          legacy_rendimento?: number | null
          new_recipe_id: string
        }
        Update: {
          created_at?: string | null
          legacy_id_preparacao?: number
          legacy_rendimento?: number | null
          new_recipe_id?: string
        }
        Relationships: []
      }
      opinions: {
        Row: {
          created_at: string
          id: number
          question: string | null
          userId: string | null
          value: number | null
        }
        Insert: {
          created_at?: string
          id?: number
          question?: string | null
          userId?: string | null
          value?: number | null
        }
        Update: {
          created_at?: string
          id?: number
          question?: string | null
          userId?: string | null
          value?: number | null
        }
        Relationships: []
      }
      other_presences: {
        Row: {
          admin_id: string | null
          created_at: string
          date: string
          id: number
          meal: string
          mess_hall_id: number
          updated_at: string | null
        }
        Insert: {
          admin_id?: string | null
          created_at?: string
          date: string
          id?: number
          meal: string
          mess_hall_id: number
          updated_at?: string | null
        }
        Update: {
          admin_id?: string | null
          created_at?: string
          date?: string
          id?: number
          meal?: string
          mess_hall_id?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "other_presences_mess_hall_id_fkey"
            columns: ["mess_hall_id"]
            isOneToOne: false
            referencedRelation: "mess_halls"
            referencedColumns: ["id"]
          },
        ]
      }
      product: {
        Row: {
          correction_factor: number | null
          created_at: string
          deleted_at: string | null
          description: string | null
          folder_id: string | null
          id: string
          measure_unit: string | null
        }
        Insert: {
          correction_factor?: number | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          folder_id?: string | null
          id?: string
          measure_unit?: string | null
        }
        Update: {
          correction_factor?: number | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          folder_id?: string | null
          id?: string
          measure_unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folder"
            referencedColumns: ["id"]
          },
        ]
      }
      product_item: {
        Row: {
          barcode: string | null
          correction_factor: number | null
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          product_id: string | null
          purchase_measure_unit: string | null
          unit_content_quantity: number | null
        }
        Insert: {
          barcode?: string | null
          correction_factor?: number | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          product_id?: string | null
          purchase_measure_unit?: string | null
          unit_content_quantity?: number | null
        }
        Update: {
          barcode?: string | null
          correction_factor?: number | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          product_id?: string | null
          purchase_measure_unit?: string | null
          unit_content_quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_item_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles_admin: {
        Row: {
          created_at: string | null
          email: string
          id: string
          name: string | null
          om: string | null
          role: "user" | "admin" | "superadmin" | null
          saram: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id: string
          name?: string | null
          om?: string | null
          role?: "user" | "admin" | "superadmin" | null
          saram: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          name?: string | null
          om?: string | null
          role?: "user" | "admin" | "superadmin" | null
          saram?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      recipe_ingredient_alternatives: {
        Row: {
          created_at: string
          id: string
          net_quantity: number | null
          priority_order: number | null
          product_id: string | null
          recipe_ingredient_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          net_quantity?: number | null
          priority_order?: number | null
          product_id?: string | null
          recipe_ingredient_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          net_quantity?: number | null
          priority_order?: number | null
          product_id?: string | null
          recipe_ingredient_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredient_alternatives_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredient_alternatives_recipe_ingredient_id_fkey"
            columns: ["recipe_ingredient_id"]
            isOneToOne: false
            referencedRelation: "recipe_ingredients"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ingredients: {
        Row: {
          created_at: string
          id: string
          is_optional: boolean | null
          net_quantity: number | null
          priority_order: number | null
          product_id: string | null
          recipe_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_optional?: boolean | null
          net_quantity?: number | null
          priority_order?: number | null
          product_id?: string | null
          recipe_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_optional?: boolean | null
          net_quantity?: number | null
          priority_order?: number | null
          product_id?: string | null
          recipe_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          base_recipe_id: string | null
          cooking_factor: number | null
          created_at: string
          deleted_at: string | null
          id: string
          kitchen_id: number | null
          name: string
          portion_yield: number | null
          preparation_method: string | null
          preparation_time_minutes: number | null
          rational_id: string | null
          upstream_version_snapshot: number | null
          version: number
        }
        Insert: {
          base_recipe_id?: string | null
          cooking_factor?: number | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          kitchen_id?: number | null
          name: string
          portion_yield?: number | null
          preparation_method?: string | null
          preparation_time_minutes?: number | null
          rational_id?: string | null
          upstream_version_snapshot?: number | null
          version: number
        }
        Update: {
          base_recipe_id?: string | null
          cooking_factor?: number | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          kitchen_id?: number | null
          name?: string
          portion_yield?: number | null
          preparation_method?: string | null
          preparation_time_minutes?: number | null
          rational_id?: string | null
          upstream_version_snapshot?: number | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "recipes_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "kitchen"
            referencedColumns: ["id"]
          },
        ]
      }
      super_admin_controller: {
        Row: {
          active: boolean | null
          created_at: string
          key: string
          value: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string
          key: string
          value?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string
          key?: string
          value?: string | null
        }
        Relationships: []
      }
      units: {
        Row: {
          code: string
          display_name: string | null
          id: number
          type: Database["sisub"]["Enums"]["unit_type"] | null
        }
        Insert: {
          code: string
          display_name?: string | null
          id?: number
          type?: Database["sisub"]["Enums"]["unit_type"] | null
        }
        Update: {
          code?: string
          display_name?: string | null
          id?: number
          type?: Database["sisub"]["Enums"]["unit_type"] | null
        }
        Relationships: []
      }
      user_data: {
        Row: {
          created_at: string
          default_mess_hall_id: number | null
          email: string
          id: string
          nrOrdem: string | null
        }
        Insert: {
          created_at?: string
          default_mess_hall_id?: number | null
          email: string
          id?: string
          nrOrdem?: string | null
        }
        Update: {
          created_at?: string
          default_mess_hall_id?: number | null
          email?: string
          id?: string
          nrOrdem?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_data_default_mess_hall_id_fkey"
            columns: ["default_mess_hall_id"]
            isOneToOne: false
            referencedRelation: "mess_halls"
            referencedColumns: ["id"]
          },
        ]
      }
      user_military_data: {
        Row: {
          dataAtualizacao: string | null
          nmGuerra: string | null
          nmPessoa: string | null
          nrCpf: string
          nrOrdem: string | null
          sgOrg: string | null
          sgPosto: string | null
        }
        Insert: {
          dataAtualizacao?: string | null
          nmGuerra?: string | null
          nmPessoa?: string | null
          nrCpf: string
          nrOrdem?: string | null
          sgOrg?: string | null
          sgPosto?: string | null
        }
        Update: {
          dataAtualizacao?: string | null
          nmGuerra?: string | null
          nmPessoa?: string | null
          nrCpf?: string
          nrOrdem?: string | null
          sgOrg?: string | null
          sgPosto?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      v_meal_presences_with_user: {
        Row: {
          created_at: string | null
          date: string | null
          display_name: string | null
          id: string | null
          meal: string | null
          mess_hall_id: number | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_presences_mess_hall_id_fkey"
            columns: ["mess_hall_id"]
            isOneToOne: false
            referencedRelation: "mess_halls"
            referencedColumns: ["id"]
          },
        ]
      }
      v_user_identity: {
        Row: {
          display_name: string | null
          id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      kitchen_type: "consumption" | "production"
      unit_type: "consumption" | "purchase"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  sisub: {
    Enums: {
      kitchen_type: ["consumption", "production"],
      unit_type: ["consumption", "purchase"],
    },
  },
} as const

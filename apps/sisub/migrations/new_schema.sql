-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE sisub.changelog (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  version text,
  title text NOT NULL,
  body text NOT NULL,
  tags ARRAY DEFAULT '{}'::text[],
  published_at timestamp with time zone NOT NULL DEFAULT now(),
  published boolean NOT NULL DEFAULT true,
  CONSTRAINT changelog_pkey PRIMARY KEY (id)
);
CREATE TABLE sisub.daily_menu (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  kitchen_id bigint,
  service_date date,
  meal_type_id uuid,
  forecasted_headcount smallint,
  status text,
  deleted_at timestamp with time zone,
  CONSTRAINT daily_menu_pkey PRIMARY KEY (id),
  CONSTRAINT daily_menu_kitchen_id_fkey FOREIGN KEY (kitchen_id) REFERENCES sisub.kitchen(id),
  CONSTRAINT daily_menu_meal_type_id_fkey FOREIGN KEY (meal_type_id) REFERENCES sisub.meal_type(id)
);
CREATE TABLE sisub.folder (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  parent_id uuid,
  deleted_at timestamp with time zone,
  description text,
  legacy_id integer,
  CONSTRAINT folder_pkey PRIMARY KEY (id)
);
CREATE TABLE sisub.kitchen (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  unit_id bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  type USER-DEFINED,
  purchase_unit_id bigint,
  kitchen_id bigint,
  CONSTRAINT kitchen_pkey PRIMARY KEY (id),
  CONSTRAINT kitchen_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES sisub.units(id),
  CONSTRAINT kitchen_purchase_unit_id_fkey FOREIGN KEY (purchase_unit_id) REFERENCES sisub.units(id),
  CONSTRAINT kitchen_kitchen_id_fkey FOREIGN KEY (kitchen_id) REFERENCES sisub.kitchen(id)
);
CREATE TABLE sisub.meal_forecasts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  date date NOT NULL,
  user_id uuid NOT NULL,
  meal text NOT NULL CHECK (meal = ANY (ARRAY['cafe'::text, 'almoco'::text, 'janta'::text, 'ceia'::text])),
  will_eat boolean NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  mess_hall_id bigint NOT NULL,
  CONSTRAINT meal_forecasts_pkey PRIMARY KEY (id),
  CONSTRAINT meal_forecasts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT meal_forecasts_mess_hall_id_fkey FOREIGN KEY (mess_hall_id) REFERENCES sisub.mess_halls(id)
);
CREATE TABLE sisub.meal_presences (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  date date NOT NULL,
  meal text NOT NULL CHECK (meal = ANY (ARRAY['cafe'::text, 'almoco'::text, 'janta'::text, 'ceia'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  mess_hall_id bigint NOT NULL,
  updated_at timestamp with time zone,
  CONSTRAINT meal_presences_pkey PRIMARY KEY (id),
  CONSTRAINT meal_presences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT meal_presences_mess_hall_id_fkey FOREIGN KEY (mess_hall_id) REFERENCES sisub.mess_halls(id)
);
CREATE TABLE sisub.meal_type (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  name text,
  kitchen_id bigint,
  sort_order smallint,
  deleted_at timestamp with time zone,
  CONSTRAINT meal_type_pkey PRIMARY KEY (id),
  CONSTRAINT meal_type_kitchen_id_fkey FOREIGN KEY (kitchen_id) REFERENCES sisub.kitchen(id)
);
CREATE TABLE sisub.menu_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  daily_menu_id uuid,
  recipe json,
  planned_portion_quantity numeric,
  excluded_from_procurement numeric,
  substitutions json,
  deleted_at timestamp with time zone,
  recipe_origin_id uuid,
  CONSTRAINT menu_items_pkey PRIMARY KEY (id),
  CONSTRAINT menu_items_daily_menu_id_fkey FOREIGN KEY (daily_menu_id) REFERENCES sisub.daily_menu(id),
  CONSTRAINT menu_items_recipe_origin_id_fkey FOREIGN KEY (recipe_origin_id) REFERENCES sisub.recipes(id)
);
CREATE TABLE sisub.menu_template (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  name text,
  description text,
  kitchen_id bigint,
  deleted_at timestamp with time zone,
  base_template_id uuid,
  CONSTRAINT menu_template_pkey PRIMARY KEY (id),
  CONSTRAINT menu_template_kitchen_id_fkey FOREIGN KEY (kitchen_id) REFERENCES sisub.kitchen(id),
  CONSTRAINT menu_template_base_template_id_fkey FOREIGN KEY (base_template_id) REFERENCES sisub.menu_template(id)
);
CREATE TABLE sisub.menu_template_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  menu_template_id uuid,
  day_of_week smallint,
  meal_type_id uuid,
  recipe_id uuid,
  CONSTRAINT menu_template_items_pkey PRIMARY KEY (id),
  CONSTRAINT menu_template_items_menu_template_id_fkey FOREIGN KEY (menu_template_id) REFERENCES sisub.menu_template(id),
  CONSTRAINT menu_template_items_meal_type_id_fkey FOREIGN KEY (meal_type_id) REFERENCES sisub.meal_type(id),
  CONSTRAINT menu_template_items_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES sisub.recipes(id)
);
CREATE TABLE sisub.mess_halls (
  id bigint NOT NULL DEFAULT nextval('sisub.mess_halls_id_seq'::regclass),
  unit_id bigint NOT NULL,
  code text NOT NULL UNIQUE,
  display_name text,
  kitchen_id bigint,
  CONSTRAINT mess_halls_pkey PRIMARY KEY (id),
  CONSTRAINT mess_halls_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES sisub.units(id),
  CONSTRAINT mess_halls_unit_fk FOREIGN KEY (unit_id) REFERENCES sisub.units(id),
  CONSTRAINT mess_halls_kitchen_id_fkey FOREIGN KEY (kitchen_id) REFERENCES sisub.kitchen(id)
);
CREATE TABLE sisub.migration_folder_lookup (
  legacy_id_grupo_produto integer NOT NULL,
  new_folder_id uuid NOT NULL UNIQUE,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT migration_folder_lookup_pkey PRIMARY KEY (legacy_id_grupo_produto)
);
CREATE TABLE sisub.migration_product_lookup (
  legacy_id_insumo bigint NOT NULL,
  new_product_id uuid NOT NULL UNIQUE,
  legacy_descricao text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT migration_product_lookup_pkey PRIMARY KEY (legacy_id_insumo)
);
CREATE TABLE sisub.migration_recipe_lookup (
  legacy_id_preparacao bigint NOT NULL,
  new_recipe_id uuid NOT NULL UNIQUE,
  legacy_rendimento numeric,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT migration_recipe_lookup_pkey PRIMARY KEY (legacy_id_preparacao)
);
CREATE TABLE sisub.opinions (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  value smallint,
  question text,
  userId uuid DEFAULT gen_random_uuid(),
  CONSTRAINT opinions_pkey PRIMARY KEY (id),
  CONSTRAINT opinions_userId_fkey FOREIGN KEY (userId) REFERENCES auth.users(id)
);
CREATE TABLE sisub.other_presences (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone,
  admin_id uuid,
  date date NOT NULL,
  meal text NOT NULL CHECK (meal = ANY (ARRAY['cafe'::text, 'almoco'::text, 'janta'::text, 'ceia'::text])),
  mess_hall_id bigint NOT NULL,
  CONSTRAINT other_presences_pkey PRIMARY KEY (id),
  CONSTRAINT other_presences_mess_hall_id_fkey FOREIGN KEY (mess_hall_id) REFERENCES sisub.mess_halls(id),
  CONSTRAINT other_presences_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES auth.users(id)
);
CREATE TABLE sisub.product (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  description text,
  measure_unit text,
  correction_factor numeric,
  deleted_at timestamp with time zone,
  folder_id uuid,
  legacy_id bigint,
  CONSTRAINT product_pkey PRIMARY KEY (id),
  CONSTRAINT product_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES sisub.folder(id)
);
CREATE TABLE sisub.product_item (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  description text,
  product_id uuid,
  purchase_measure_unit text,
  unit_content_quantity numeric,
  correction_factor numeric,
  deleted_at timestamp with time zone,
  barcode text,
  CONSTRAINT product_item_pkey PRIMARY KEY (id),
  CONSTRAINT product_item_product_id_fkey FOREIGN KEY (product_id) REFERENCES sisub.product(id)
);
CREATE TABLE sisub.profiles_admin (
  id uuid NOT NULL UNIQUE,
  saram character varying NOT NULL UNIQUE,
  name text,
  email text NOT NULL UNIQUE,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  role USER-DEFINED,
  om text,
  CONSTRAINT profiles_admin_pkey PRIMARY KEY (email),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE sisub.recipe_ingredient_alternatives (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  recipe_ingredient_id uuid,
  product_id uuid,
  net_quantity numeric,
  priority_order smallint,
  CONSTRAINT recipe_ingredient_alternatives_pkey PRIMARY KEY (id),
  CONSTRAINT recipe_ingredient_alternatives_recipe_ingredient_id_fkey FOREIGN KEY (recipe_ingredient_id) REFERENCES sisub.recipe_ingredients(id),
  CONSTRAINT recipe_ingredient_alternatives_product_id_fkey FOREIGN KEY (product_id) REFERENCES sisub.product(id)
);
CREATE TABLE sisub.recipe_ingredients (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  recipe_id uuid,
  product_id uuid,
  net_quantity numeric,
  is_optional boolean,
  priority_order smallint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT recipe_ingredients_pkey PRIMARY KEY (id),
  CONSTRAINT recipe_ingredients_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES sisub.recipes(id),
  CONSTRAINT recipe_ingredients_product_id_fkey FOREIGN KEY (product_id) REFERENCES sisub.product(id)
);
CREATE TABLE sisub.recipes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  version smallint NOT NULL,
  name text NOT NULL,
  preparation_method text,
  portion_yield smallint,
  preparation_time_minutes smallint,
  kitchen_id bigint,
  base_recipe_id uuid DEFAULT gen_random_uuid(),
  upstream_version_snapshot smallint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  rational_id text,
  cooking_factor numeric,
  legacy_id bigint,
  CONSTRAINT recipes_pkey PRIMARY KEY (id),
  CONSTRAINT recipes_kitchen_id_fkey FOREIGN KEY (kitchen_id) REFERENCES sisub.kitchen(id)
);
CREATE TABLE sisub.super_admin_controller (
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  key text NOT NULL UNIQUE,
  active boolean,
  value text,
  CONSTRAINT super_admin_controller_pkey PRIMARY KEY (key)
);
CREATE TABLE sisub.units (
  id bigint NOT NULL DEFAULT nextval('sisub.units_id_seq'::regclass),
  code text NOT NULL UNIQUE,
  display_name text,
  type USER-DEFINED,
  CONSTRAINT units_pkey PRIMARY KEY (id)
);
CREATE TABLE sisub.user_data (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  email text NOT NULL UNIQUE,
  nrOrdem text,
  default_mess_hall_id bigint,
  CONSTRAINT user_data_pkey PRIMARY KEY (id),
  CONSTRAINT user_email_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id),
  CONSTRAINT user_data_default_mess_hall_id_fkey FOREIGN KEY (default_mess_hall_id) REFERENCES sisub.mess_halls(id)
);
CREATE TABLE sisub.user_military_data (
  nrOrdem text,
  nrCpf text NOT NULL,
  nmGuerra text,
  nmPessoa text,
  sgPosto text,
  sgOrg text,
  dataAtualizacao timestamp with time zone,
  CONSTRAINT user_military_data_pkey PRIMARY KEY (nrCpf)
);
CREATE TABLE sisub.user_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  module text NOT NULL,
  level integer NOT NULL DEFAULT 1,
  mess_hall_id bigint,
  kitchen_id bigint,
  unit_id bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_permissions_pkey PRIMARY KEY (id),
  CONSTRAINT user_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT user_permissions_mess_hall_id_fkey FOREIGN KEY (mess_hall_id) REFERENCES sisub.mess_halls(id),
  CONSTRAINT user_permissions_kitchen_id_fkey FOREIGN KEY (kitchen_id) REFERENCES sisub.kitchen(id),
  CONSTRAINT user_permissions_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES sisub.units(id)
);
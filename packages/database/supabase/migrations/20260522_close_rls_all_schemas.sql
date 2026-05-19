-- Fecha RLS completamente em todos os schemas (sisub, iefa, journal, public).
-- Remove todas as políticas existentes e habilita RLS nas tabelas sem ele.
-- Acesso permitido apenas via service role key (bypassa RLS por design).

-- ============================================================
-- SCHEMA: iefa
-- ============================================================

DROP POLICY IF EXISTS "Enable read access for all users"        ON iefa.app_contributors;

DROP POLICY IF EXISTS "Enable read access for all users"        ON iefa.apps;

DROP POLICY IF EXISTS "Enable insert for users based on user_id" ON iefa.facilities_pregoeiro;
DROP POLICY IF EXISTS "Enable read access for all users"         ON iefa.facilities_pregoeiro;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON iefa.facilities_pregoeiro;

DROP POLICY IF EXISTS "Enable insert for users based on user_id" ON iefa.pregoeiro_preferences;
DROP POLICY IF EXISTS "Enable users to view their own data only" ON iefa.pregoeiro_preferences;
DROP POLICY IF EXISTS "pregoeiro_update_own_rows"               ON iefa.pregoeiro_preferences;

-- ============================================================
-- SCHEMA: journal — habilitar RLS (estava desligado) + drop políticas
-- ============================================================

ALTER TABLE journal.article_authors     ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal.article_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal.article_versions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal.articles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal.email_templates     ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal.journal_settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal.notifications       ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal.review_assignments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal.reviews             ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal.user_profiles       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Article authors visible with article" ON journal.article_authors;
DROP POLICY IF EXISTS "Authors can manage co-authors"        ON journal.article_authors;

DROP POLICY IF EXISTS "Events visible with article"          ON journal.article_events;

DROP POLICY IF EXISTS "Authors can upload versions"          ON journal.article_versions;
DROP POLICY IF EXISTS "Editors can upload versions"          ON journal.article_versions;
DROP POLICY IF EXISTS "Versions visible with article"        ON journal.article_versions;

DROP POLICY IF EXISTS "Authors can insert articles"          ON journal.articles;
DROP POLICY IF EXISTS "Authors can update own articles"      ON journal.articles;
DROP POLICY IF EXISTS "Authors can view own articles"        ON journal.articles;
DROP POLICY IF EXISTS "Editors can update articles"          ON journal.articles;
DROP POLICY IF EXISTS "Editors can view all articles"        ON journal.articles;
DROP POLICY IF EXISTS "Public can view published articles"   ON journal.articles;
DROP POLICY IF EXISTS "Reviewers can view assigned articles" ON journal.articles;

DROP POLICY IF EXISTS "Editors can manage templates"         ON journal.email_templates;

DROP POLICY IF EXISTS "Editors can manage settings"          ON journal.journal_settings;

DROP POLICY IF EXISTS "System can insert notifications"      ON journal.notifications;
DROP POLICY IF EXISTS "Users can update own notifications"   ON journal.notifications;
DROP POLICY IF EXISTS "Users can view own notifications"     ON journal.notifications;

DROP POLICY IF EXISTS "Editors can create assignments"       ON journal.review_assignments;
DROP POLICY IF EXISTS "Editors can view all assignments"     ON journal.review_assignments;
DROP POLICY IF EXISTS "Reviewers can update own assignments" ON journal.review_assignments;
DROP POLICY IF EXISTS "Reviewers can view own assignments"   ON journal.review_assignments;

DROP POLICY IF EXISTS "Editors can view all reviews"         ON journal.reviews;
DROP POLICY IF EXISTS "Reviewers can manage own reviews"     ON journal.reviews;

DROP POLICY IF EXISTS "Editors can view all profiles"        ON journal.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile"         ON journal.user_profiles;
DROP POLICY IF EXISTS "Users can view own profile"           ON journal.user_profiles;

-- ============================================================
-- SCHEMA: public — habilitar RLS (estava desligado em todas)
-- ============================================================

ALTER TABLE public.ceafa                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.embalagem                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grupo_produto                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingrediente_preparacao         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingrediente_preparacao_original ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insumo                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insumo_original                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_produto                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nutriente                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preparacao_base                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preparacao_original            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produto                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produto_nutriente              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unidade_medida                 ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SCHEMA: sisub — habilitar RLS nas tabelas sem ele + drop políticas
-- ============================================================

-- Tabelas sem RLS — habilitar
ALTER TABLE sisub.analytics_chat_message  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sisub.analytics_chat_session  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sisub.empenho                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE sisub.module_chat_message     ENABLE ROW LEVEL SECURITY;
ALTER TABLE sisub.module_chat_session     ENABLE ROW LEVEL SECURITY;
ALTER TABLE sisub.policy_rule             ENABLE ROW LEVEL SECURITY;
ALTER TABLE sisub.procurement_arp         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sisub.procurement_arp_item    ENABLE ROW LEVEL SECURITY;

-- Drop políticas existentes
DROP POLICY IF EXISTS "Enable read access for all users"          ON sisub.changelog;

DROP POLICY IF EXISTS "Enable all for authenticated users"        ON sisub.daily_menu;

DROP POLICY IF EXISTS "Enable all for authenticated users"        ON sisub.folder;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON sisub.folder;
DROP POLICY IF EXISTS "Enable read access for all users"          ON sisub.folder;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON sisub.folder;
DROP POLICY IF EXISTS "dev_folder_delete"                         ON sisub.folder;
DROP POLICY IF EXISTS "dev_folder_insert"                         ON sisub.folder;
DROP POLICY IF EXISTS "dev_folder_select"                         ON sisub.folder;
DROP POLICY IF EXISTS "dev_folder_update"                         ON sisub.folder;

DROP POLICY IF EXISTS "Enable all for authenticated users"        ON sisub.ingredient;
DROP POLICY IF EXISTS "dev_product_delete"                        ON sisub.ingredient;
DROP POLICY IF EXISTS "dev_product_insert"                        ON sisub.ingredient;
DROP POLICY IF EXISTS "dev_product_select"                        ON sisub.ingredient;
DROP POLICY IF EXISTS "dev_product_update"                        ON sisub.ingredient;

DROP POLICY IF EXISTS "Enable all for authenticated users"        ON sisub.ingredient_item;
DROP POLICY IF EXISTS "dev_product_item_delete"                   ON sisub.ingredient_item;
DROP POLICY IF EXISTS "dev_product_item_insert"                   ON sisub.ingredient_item;
DROP POLICY IF EXISTS "dev_product_item_select"                   ON sisub.ingredient_item;
DROP POLICY IF EXISTS "dev_product_item_update"                   ON sisub.ingredient_item;

DROP POLICY IF EXISTS "Enable all for authenticated users"        ON sisub.kitchen;

DROP POLICY IF EXISTS "mcp_api_keys: owner access"               ON sisub.mcp_api_keys;

DROP POLICY IF EXISTS "Enable all for authenticated users"        ON sisub.meal_forecasts;
DROP POLICY IF EXISTS "Enable delete for users based on user_id"  ON sisub.meal_forecasts;
DROP POLICY IF EXISTS "Enable insert for users based on user_id"  ON sisub.meal_forecasts;
DROP POLICY IF EXISTS "Enable read access for all users"          ON sisub.meal_forecasts;
DROP POLICY IF EXISTS "Enable update for users based on user_id"  ON sisub.meal_forecasts;

DROP POLICY IF EXISTS "Allow delete to public"                    ON sisub.meal_presences;
DROP POLICY IF EXISTS "Allow insert to public"                    ON sisub.meal_presences;
DROP POLICY IF EXISTS "Enable read access for all users"          ON sisub.meal_presences;

DROP POLICY IF EXISTS "Enable all for authenticated users"        ON sisub.meal_type;

DROP POLICY IF EXISTS "Enable all for authenticated users"        ON sisub.menu_items;

DROP POLICY IF EXISTS "Enable all for authenticated users"        ON sisub.menu_template;

DROP POLICY IF EXISTS "Enable all for authenticated users"        ON sisub.menu_template_items;

DROP POLICY IF EXISTS "Enable all for authenticated users"        ON sisub.mess_halls;
DROP POLICY IF EXISTS "Enable read access for all users"          ON sisub.mess_halls;

DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON sisub.opinions;
DROP POLICY IF EXISTS "Enable read access for all users"          ON sisub.opinions;

DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON sisub.other_presences;
DROP POLICY IF EXISTS "Enable read access for all users"          ON sisub.other_presences;

DROP POLICY IF EXISTS "Enable all for authenticated users"        ON sisub.profiles_admin;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON sisub.profiles_admin;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON sisub.profiles_admin;
DROP POLICY IF EXISTS "Enable read access for all users"          ON sisub.profiles_admin;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON sisub.profiles_admin;

DROP POLICY IF EXISTS "Enable all for authenticated users"                        ON sisub.recipe_ingredient_alternatives;
DROP POLICY IF EXISTS "recipe_ingredient_alternatives_delete_authenticated"       ON sisub.recipe_ingredient_alternatives;
DROP POLICY IF EXISTS "recipe_ingredient_alternatives_insert_authenticated"       ON sisub.recipe_ingredient_alternatives;
DROP POLICY IF EXISTS "recipe_ingredient_alternatives_select_authenticated"       ON sisub.recipe_ingredient_alternatives;
DROP POLICY IF EXISTS "recipe_ingredient_alternatives_update_authenticated"       ON sisub.recipe_ingredient_alternatives;

DROP POLICY IF EXISTS "Enable all for authenticated users"        ON sisub.recipe_ingredients;
DROP POLICY IF EXISTS "recipe_ingredients_delete_authenticated"   ON sisub.recipe_ingredients;
DROP POLICY IF EXISTS "recipe_ingredients_insert_authenticated"   ON sisub.recipe_ingredients;
DROP POLICY IF EXISTS "recipe_ingredients_select_authenticated"   ON sisub.recipe_ingredients;
DROP POLICY IF EXISTS "recipe_ingredients_update_authenticated"   ON sisub.recipe_ingredients;

DROP POLICY IF EXISTS "Enable all for authenticated users"        ON sisub.recipes;
DROP POLICY IF EXISTS "recipes_delete_authenticated"              ON sisub.recipes;
DROP POLICY IF EXISTS "recipes_insert_authenticated"              ON sisub.recipes;
DROP POLICY IF EXISTS "recipes_select_authenticated"              ON sisub.recipes;
DROP POLICY IF EXISTS "recipes_update_authenticated"              ON sisub.recipes;

DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON sisub.super_admin_controller;
DROP POLICY IF EXISTS "Enable read access for all users"          ON sisub.super_admin_controller;
DROP POLICY IF EXISTS "Enable update for all users"               ON sisub.super_admin_controller;

DROP POLICY IF EXISTS "Enable all for authenticated users"        ON sisub.units;
DROP POLICY IF EXISTS "Enable read access for all users"          ON sisub.units;

DROP POLICY IF EXISTS "Enable insert for users based on user_id"  ON sisub.user_data;
DROP POLICY IF EXISTS "Enable read access for all users"          ON sisub.user_data;
DROP POLICY IF EXISTS "Enable update for users based on user_id"  ON sisub.user_data;

DROP POLICY IF EXISTS "Enable read access for all users"          ON sisub.user_military_data;

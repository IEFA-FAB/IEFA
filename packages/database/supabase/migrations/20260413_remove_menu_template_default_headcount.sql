-- Remove default_headcount from menu_template
-- O headcount não é fixo por template: um mesmo cardápio pode ser usado
-- em ATAs com quantidades de comensais completamente diferentes.
-- O valor correto é configurado no momento da seleção do template na ATA
-- (TemplateSelection.headcount) e, quando necessário, sobreposto por item
-- (menu_template_items.headcount_override).
ALTER TABLE sisub.menu_template DROP COLUMN IF EXISTS default_headcount;

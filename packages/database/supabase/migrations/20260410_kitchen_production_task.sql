-- Kitchen Production Task
-- Rastreia o status de execução de cada preparação no turno de produção diária.
-- Uma task por menu_item (UNIQUE constraint), criada automaticamente ao abrir o painel.

CREATE TABLE sisub.production_task (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  kitchen_id integer NOT NULL REFERENCES sisub.kitchen(id),
  menu_item_id uuid NOT NULL REFERENCES sisub.menu_items(id) ON DELETE CASCADE,
  production_date date NOT NULL,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'IN_PROGRESS', 'DONE')),
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  UNIQUE (menu_item_id)
);

CREATE INDEX ON sisub.production_task (kitchen_id, production_date);

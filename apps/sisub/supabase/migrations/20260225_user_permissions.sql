-- Migration: Criar tabela de permissões granulares (PBAC)
-- Substitui o modelo de roles (user/admin/superadmin) por permissões baseadas em Módulo + Nível + Escopo

CREATE TABLE sisub.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- O Quê (Módulo e Nível)
  module text NOT NULL,
  -- Valores: 'diner' | 'messhall' | 'local' | 'global' | 'analytics' | 'storage'
  level int NOT NULL DEFAULT 1,
  -- 0 = Acesso Negado (deny explícito), > 0 = nível de acesso crescente

  -- Onde (Escopo - Exclusive Arcs)
  mess_hall_id int8 REFERENCES sisub.mess_halls(id) ON DELETE CASCADE,
  kitchen_id   int8 REFERENCES sisub.kitchens(id)   ON DELETE CASCADE,
  unit_id      int8 REFERENCES sisub.units(id)       ON DELETE CASCADE,

  created_at timestamptz NOT NULL DEFAULT now(),

  -- No máximo 1 escopo preenchido; todos nulos = permissão global
  CONSTRAINT exclusive_scope CHECK (
    num_nonnulls(mess_hall_id, kitchen_id, unit_id) <= 1
  )
);

CREATE INDEX idx_user_permissions_user_id ON sisub.user_permissions(user_id);

-- Limpeza posterior (após migrar dados): DROP COLUMN role da tabela profiles_admin (se desejar)

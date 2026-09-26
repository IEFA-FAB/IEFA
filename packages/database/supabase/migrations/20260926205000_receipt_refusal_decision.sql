-- A recusa do recebimento gravava `definitive_by`/`definitive_at` como o instante da decisão, e
-- todo leitor trata `definitive_at` como "entrega atestada": a liquidação aceitava o recusado
-- como base de NS (Lei 4.320, art. 63, § 2º, III), `finalize_receipt` somava os itens dele no
-- status da OF, o relatório de empenho e a reposição o contavam como recebido, e o termo impresso
-- dizia "Definitivo em". Em vez de lembrar `status <> 'rejected'` em cada leitor, a recusa passa a
-- ter as próprias colunas, e o banco garante que recusado nunca carrega o instante da efetivação.

alter table inventory.goods_receipt
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid references auth.users (id) on delete set null;

create index if not exists goods_receipt_rejected_by_fk_idx on inventory.goods_receipt (rejected_by);

comment on column inventory.goods_receipt.rejected_at is 'Instante da recusa do recebimento inteiro. definitive_at é só da efetivação.';
comment on column inventory.goods_receipt.rejected_by is 'Quem recusou o recebimento inteiro.';

-- Recusas antigas (0 em 2026-09-26): o instante e o autor da decisão mudam de coluna.
update inventory.goods_receipt
   set rejected_at = coalesce(rejected_at, definitive_at),
       rejected_by = coalesce(rejected_by, definitive_by),
       definitive_at = null,
       definitive_by = null
 where status = 'rejected'
   and definitive_at is not null;

-- Escrita antiga (o `refuseReceiptFn` da `main` até este PR entrar) continua funcionando: o
-- gatilho desloca o instante e o autor da decisão para as colunas da recusa antes do CHECK. Sem
-- ele, entre aplicar a migration e deployar o código, recusar um recebimento daria 23514.
create or replace function inventory.goods_receipt_refusal_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'rejected' and new.definitive_at is not null then
    new.rejected_at := coalesce(new.rejected_at, new.definitive_at);
    new.rejected_by := coalesce(new.rejected_by, new.definitive_by);
    new.definitive_at := null;
    new.definitive_by := null;
  end if;
  return new;
end;
$$;

revoke all on function inventory.goods_receipt_refusal_columns() from public, anon, authenticated;
grant execute on function inventory.goods_receipt_refusal_columns() to service_role;

drop trigger if exists goods_receipt_refusal_columns on inventory.goods_receipt;
create trigger goods_receipt_refusal_columns
  before insert or update of status, definitive_at on inventory.goods_receipt
  for each row execute function inventory.goods_receipt_refusal_columns();

alter table inventory.goods_receipt
  add constraint goods_receipt_rejected_not_attested
  check (status <> 'rejected' or definitive_at is null);

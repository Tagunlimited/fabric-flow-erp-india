-- Add pending_amount to customers and keep it in sync with orders.balance_amount

alter table public.customers
  add column if not exists pending_amount numeric(12,2) not null default 0;

-- Backfill current pending amounts from orders
update public.customers c
set pending_amount = coalesce((
  select sum(o.balance_amount::numeric)
  from public.orders o
  where o.customer_id = c.id
), 0);

-- Helper function to refresh a single customer's pending amount
create or replace function public.refresh_customer_pending(p_customer_id uuid)
returns void
language plpgsql
as $$
begin
  update public.customers c
  set pending_amount = coalesce((
    select sum(o.balance_amount::numeric)
    from public.orders o
    where o.customer_id = p_customer_id
  ), 0)
  where c.id = p_customer_id;
end;
$$;

-- Trigger function on orders to refresh customer pending on insert/update/delete
create or replace function public.trg_orders_update_customer_pending()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'DELETE' then
    perform public.refresh_customer_pending(old.customer_id);
    return old;
  else
    perform public.refresh_customer_pending(new.customer_id);
    if TG_OP = 'UPDATE' and old.customer_id is distinct from new.customer_id then
      perform public.refresh_customer_pending(old.customer_id);
    end if;
    return new;
  end if;
end;
$$;

drop trigger if exists trg_orders_update_customer_pending on public.orders;
create trigger trg_orders_update_customer_pending
after insert or update of balance_amount, customer_id or delete on public.orders
for each row execute function public.trg_orders_update_customer_pending();

comment on column public.customers.pending_amount is 'Sum of all orders.balance_amount for this customer. Maintained by trigger.';


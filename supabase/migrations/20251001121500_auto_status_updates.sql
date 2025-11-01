-- Auto-update order status based on receipts, design uploads, and BOM creation

-- 1) Extend order_status enum with new values (idempotent)
alter type public.order_status add value if not exists 'designing_done';
alter type public.order_status add value if not exists 'under_procurement';

-- 2) Function to recalculate an order's status based on current data
create or replace function public.recalc_order_status(p_order_id uuid)
returns void
language plpgsql
as $$
declare
  v_current public.order_status;
  v_target public.order_status;
  v_order_number text;
  v_has_receipt boolean := false;
  v_item_count integer := 0;
  v_done_count integer := 0;
  v_has_bom boolean := false;
begin
  if p_order_id is null then
    return;
  end if;

  select o.status, o.order_number
    into v_current, v_order_number
  from public.orders o
  where o.id = p_order_id;

  if v_current is null then
    return;
  end if;

  -- Do not change cancelled orders
  if v_current = 'cancelled' then
    return;
  end if;

  -- 2.a) Has any active receipt referencing this order (by id or number)
  select exists(
           select 1
           from public.receipts r
           where (
             lower(coalesce(r.reference_type, '')) = 'order' and r.reference_id = p_order_id
           )
           or (
             r.reference_number is not null and r.reference_number = v_order_number
           )
         )
    into v_has_receipt;

  -- 2.b) All order items have both mockup_images and reference_images uploaded in specifications JSON
  select count(*)
    into v_item_count
  from public.order_items oi
  where oi.order_id = p_order_id;

  select count(*)
    into v_done_count
  from public.order_items oi
  where oi.order_id = p_order_id
    and jsonb_array_length(coalesce(oi.specifications->'mockup_images', '[]'::jsonb)) > 0
    and jsonb_array_length(coalesce(oi.specifications->'reference_images', '[]'::jsonb)) > 0;

  -- 2.c) Has any BOM created for this order
  select exists(
           select 1 from public.bom_records br where br.order_id = p_order_id
         )
    into v_has_bom;

  -- Determine highest attained target status (without downgrading advanced stages)
  -- Priority order: under_procurement > confirmed > designing_done > pending
  v_target := 'pending';
  
  -- When mockup/reference images are uploaded, set to designing_done (if no receipt yet)
  if v_item_count > 0 and v_done_count = v_item_count then
    v_target := 'designing_done';
  end if;
  
  -- When receipt is generated, set to confirmed (this overrides designing_done)
  if v_has_receipt then
    v_target := 'confirmed';
  end if;
  
  -- When BOM is created, set to under_procurement (this overrides confirmed)
  if v_has_bom then
    v_target := 'under_procurement';
  end if;

  -- Do not override when already in later stages
  if v_current in ('in_production','quality_check','completed') then
    return;
  end if;

  if v_target is distinct from v_current then
    update public.orders
    set status = v_target,
        updated_at = now()
    where id = p_order_id;
  end if;
end;
$$;

comment on function public.recalc_order_status(uuid) is 'Recomputes orders.status using receipts, design uploads, and BOM presence.';

-- 3) Trigger on receipts to recalc order status on changes
create or replace function public.trigger_receipts_recalc_order_status()
returns trigger
language plpgsql
as $$
declare
  v_order_id uuid;
  v_ref_type text;
  v_ref_number text;
begin
  v_ref_type := lower(coalesce(coalesce(new.reference_type, old.reference_type), ''));

  if v_ref_type = 'order' then
    v_order_id := coalesce(new.reference_id, old.reference_id);
  else
    v_ref_number := coalesce(new.reference_number, old.reference_number);
    if v_ref_number is not null then
      select o.id into v_order_id from public.orders o where o.order_number = v_ref_number limit 1;
    end if;
  end if;

  if v_order_id is not null then
    perform public.recalc_order_status(v_order_id);
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists receipts_recalc_order_status on public.receipts;
create trigger receipts_recalc_order_status
after insert or update or delete on public.receipts
for each row execute function public.trigger_receipts_recalc_order_status();

-- 4) Trigger on order_items to recalc when specifications change
create or replace function public.trigger_order_items_recalc_order_status()
returns trigger
language plpgsql
as $$
declare
  v_old_order_id uuid;
  v_new_order_id uuid;
begin
  v_old_order_id := coalesce(old.order_id, null);
  v_new_order_id := coalesce(new.order_id, null);

  if tg_op = 'UPDATE' then
    if v_old_order_id is distinct from v_new_order_id then
      if v_old_order_id is not null then
        perform public.recalc_order_status(v_old_order_id);
      end if;
      if v_new_order_id is not null then
        perform public.recalc_order_status(v_new_order_id);
      end if;
    else
      if v_new_order_id is not null then
        perform public.recalc_order_status(v_new_order_id);
      end if;
    end if;
  else
    if coalesce(new.order_id, old.order_id) is not null then
      perform public.recalc_order_status(coalesce(new.order_id, old.order_id));
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists order_items_recalc_order_status on public.order_items;
create trigger order_items_recalc_order_status
after insert or update of specifications or delete on public.order_items
for each row execute function public.trigger_order_items_recalc_order_status();

-- 5) Trigger on bom_records to recalc when BOMs are created/removed
create or replace function public.trigger_bom_records_recalc_order_status()
returns trigger
language plpgsql
as $$
declare
  v_order_id uuid;
begin
  v_order_id := coalesce(coalesce(new.order_id, old.order_id), null);
  if v_order_id is not null then
    perform public.recalc_order_status(v_order_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists bom_records_recalc_order_status on public.bom_records;
create trigger bom_records_recalc_order_status
after insert or update or delete on public.bom_records
for each row execute function public.trigger_bom_records_recalc_order_status();

-- 6) Backfill: recalc all existing orders once
do $$
declare r record;
begin
  for r in select id from public.orders loop
    perform public.recalc_order_status(r.id);
  end loop;
end $$;

-- 7) Success message
select 'Auto status updates installed successfully' as status;



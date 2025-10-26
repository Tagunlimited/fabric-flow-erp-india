-- Fix order status priority logic
-- This migration fixes the issue where mockup image uploads were overriding the 'confirmed' status set by receipt generation
-- 
-- Requirements:
-- 1. When mockup/reference images are uploaded → status = 'designing_done' (only if no receipt yet)
-- 2. When receipt is generated → status = 'confirmed' (overrides 'designing_done')
-- 3. When BOM is created → status = 'under_procurement' (overrides 'confirmed')
--
-- Priority order: under_procurement > confirmed > designing_done > pending

-- Set timeout to prevent hanging
set lock_timeout = '30s';

-- Drop existing triggers first to avoid deadlocks
drop trigger if exists receipts_recalc_order_status on public.receipts;
drop trigger if exists order_items_recalc_order_status on public.order_items;
drop trigger if exists bom_records_recalc_order_status on public.bom_records;

-- Drop and recreate the function with proper priority logic
drop function if exists public.recalc_order_status(uuid);
create function public.recalc_order_status(p_order_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_current public.order_status;
  v_target public.order_status;
  v_order_number text;
  v_has_receipt boolean := false;
  v_item_count integer := 0;
  v_done_count integer := 0;
  v_has_bom boolean := false;
  v_has_cutting boolean := false;
  v_has_batch boolean := false;
  v_total_assigned integer := 0;
  v_total_picked integer := 0;
  v_total_approved integer := 0;
  v_total_rejected integer := 0;
  v_total_dispatched integer := 0;
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

  -- Check if receipt exists for this order
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

  -- Check design completion (all items have both mockup and reference images)
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

  -- Check if BOM exists
  select exists(select 1 from public.bom_records br where br.order_id = p_order_id)
    into v_has_bom;

  -- Check cutting assignment
  select exists(
           select 1 from public.order_assignments oa
           where oa.order_id = p_order_id and (oa.cutting_master_id is not null or oa.pattern_master_id is not null)
         )
    into v_has_cutting;

  -- Check batch/tailor assignment
  select exists(select 1 from public.order_batch_assignments oba where oba.order_id = p_order_id)
    into v_has_batch;

  -- Calculate totals from batch size distributions and QC
  select coalesce(sum(obsd.quantity), 0)
    into v_total_assigned
    from public.order_batch_size_distributions obsd
    join public.order_batch_assignments oba on oba.id = obsd.order_batch_assignment_id
   where oba.order_id = p_order_id;

  select coalesce(sum(obsd.picked_quantity), 0)
    into v_total_picked
    from public.order_batch_size_distributions obsd
    join public.order_batch_assignments oba on oba.id = obsd.order_batch_assignment_id
   where oba.order_id = p_order_id;

  select coalesce(sum(qr.approved_quantity), 0), coalesce(sum(qr.rejected_quantity), 0)
    into v_total_approved, v_total_rejected
    from public.qc_reviews qr
    join public.order_batch_assignments oba on oba.id = qr.order_batch_assignment_id
   where oba.order_id = p_order_id;

  -- Dispatch totals from dispatch_order_items
  select coalesce(sum(doi.quantity), 0)
    into v_total_dispatched
    from public.dispatch_order_items doi
   where doi.order_id = p_order_id;

  -- Determine target status with proper priority order
  -- Later stages override earlier stages
  -- Priority order: dispatched > partial_dispatched > rework > ready_for_dispatch > under_qc > under_stitching > under_cutting > under_procurement > confirmed > designing_done > pending
  v_target := 'pending';

  -- 1. When mockup/reference images are uploaded, set to designing_done (base design stage)
  if v_item_count > 0 and v_done_count = v_item_count then
    v_target := 'designing_done';
  end if;

  -- 2. When receipt is generated, set to confirmed (this overrides designing_done)
  if v_has_receipt then
    v_target := 'confirmed';
  end if;

  -- 3. Production flow stages - each overrides the previous
  if v_has_bom then
    v_target := 'under_procurement';
  end if;

  if v_has_cutting then
    v_target := 'under_cutting';
  end if;

  if v_has_batch then
    v_target := 'under_stitching';
  end if;

  if v_total_picked > 0 then
    v_target := 'under_qc';
  end if;

  -- Ready when approved covers effective picked (picked minus rejected)
  if v_total_approved > 0 and v_total_approved >= greatest(v_total_picked - v_total_rejected, 1) then
    v_target := 'ready_for_dispatch';
  end if;

  -- Rework overrides most states (when rejected items exist)
  if v_total_rejected > 0 then
    v_target := 'rework';
  end if;

  -- Dispatch states override earlier production states
  if v_total_dispatched > 0 and v_total_dispatched < greatest(v_total_approved - v_total_rejected, 1) then
    v_target := 'partial_dispatched';
  end if;

  if v_total_dispatched >= greatest(v_total_approved - v_total_rejected, 1) and v_total_approved > 0 then
    v_target := 'dispatched';
  end if;

  -- Do not override when already in later/completed stages
  if v_current in ('completed') then
    return;
  end if;

  -- Update status if it has changed
  if v_target is distinct from v_current then
    update public.orders
    set status = v_target,
        updated_at = now()
    where id = p_order_id;
  end if;
end;
$$;

comment on function public.recalc_order_status(uuid) is 'Recomputes orders.status with proper priority: receipt sets confirmed (overrides designing_done from mockup uploads)';

-- Recreate triggers now that the function is stable

-- Trigger on receipts to recalc order status on changes
create or replace function public.trigger_receipts_recalc_order_status()
returns trigger
language plpgsql
security definer
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

-- Create trigger (drop was already done at the top)
create trigger receipts_recalc_order_status
after insert or update or delete on public.receipts
for each row execute function public.trigger_receipts_recalc_order_status();

-- Trigger on order_items to recalc when specifications change
create or replace function public.trigger_order_items_recalc_order_status()
returns trigger
language plpgsql
security definer
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

-- Create trigger (drop was already done at the top)
create trigger order_items_recalc_order_status
after insert or update of specifications or delete on public.order_items
for each row execute function public.trigger_order_items_recalc_order_status();

-- Trigger on bom_records to recalc when BOMs are created/removed
create or replace function public.trigger_bom_records_recalc_order_status()
returns trigger
language plpgsql
security definer
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

-- Create trigger (drop was already done at the top)
create trigger bom_records_recalc_order_status
after insert or update or delete on public.bom_records
for each row execute function public.trigger_bom_records_recalc_order_status();

-- Success message
select 'Order status priority fix applied successfully' as status;


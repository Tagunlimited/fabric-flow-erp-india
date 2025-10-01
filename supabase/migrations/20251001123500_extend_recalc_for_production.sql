-- Extend recalc_order_status to include production flow transitions

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
  v_has_cutting boolean := false;
  v_has_batch boolean := false;
  v_total_assigned integer := 0;
  v_total_picked integer := 0;
  v_total_approved integer := 0;
  v_total_rejected integer := 0;
begin
  if p_order_id is null then return; end if;

  select o.status, o.order_number into v_current, v_order_number from public.orders o where o.id = p_order_id;
  if v_current is null then return; end if;
  if v_current = 'cancelled' then return; end if;

  -- Receipts
  select exists(
           select 1 from public.receipts r
           where (lower(coalesce(r.reference_type,''))='order' and r.reference_id = p_order_id)
              or (r.reference_number is not null and r.reference_number = v_order_number)
         ) into v_has_receipt;

  -- Design images
  select count(*) into v_item_count from public.order_items oi where oi.order_id = p_order_id;
  select count(*) into v_done_count from public.order_items oi
   where oi.order_id = p_order_id
     and jsonb_array_length(coalesce(oi.specifications->'mockup_images','[]'::jsonb))>0
     and jsonb_array_length(coalesce(oi.specifications->'reference_images','[]'::jsonb))>0;

  -- BOM
  select exists(select 1 from public.bom_records br where br.order_id = p_order_id) into v_has_bom;

  -- Cutting assignment present
  select exists(
           select 1 from public.order_assignments oa
           where oa.order_id = p_order_id and (oa.cutting_master_id is not null or oa.pattern_master_id is not null)
         ) into v_has_cutting;

  -- Batch/tailor assignment present
  select exists(
           select 1 from public.order_batch_assignments oba where oba.order_id = p_order_id
         ) into v_has_batch;

  -- Totals from batch size distributions and QC
  select coalesce(sum(obsd.quantity),0) into v_total_assigned
    from public.order_batch_size_distributions obsd
    join public.order_batch_assignments oba on oba.id = obsd.order_batch_assignment_id
   where oba.order_id = p_order_id;

  select coalesce(sum(obsd.picked_quantity),0) into v_total_picked
    from public.order_batch_size_distributions obsd
    join public.order_batch_assignments oba on oba.id = obsd.order_batch_assignment_id
   where oba.order_id = p_order_id;

  select coalesce(sum(qr.approved_quantity),0), coalesce(sum(qr.rejected_quantity),0)
    into v_total_approved, v_total_rejected
    from public.qc_reviews qr
    join public.order_batch_assignments oba on oba.id = qr.order_batch_assignment_id
   where oba.order_id = p_order_id;

  -- Dispatch totals from dispatch_order_items
  declare v_total_dispatched integer := 0;
  begin
    select coalesce(sum(doi.quantity),0)
      into v_total_dispatched
      from public.dispatch_order_items doi
     where doi.order_id = p_order_id;
  exception when others then
    v_total_dispatched := 0;
  end;

  -- Determine target status in progression; do not override late-terminal states
  v_target := 'pending';
  if v_has_receipt then v_target := 'confirmed'; end if;
  if v_item_count > 0 and v_done_count = v_item_count then v_target := 'designing_done'; end if;
  if v_has_bom then v_target := 'under_procurement'; end if;
  if v_has_cutting then v_target := 'under_cutting'; end if;
  if v_has_batch then v_target := 'under_stitching'; end if;
  if v_total_picked > 0 then v_target := 'under_qc'; end if;
  -- Ready when approved covers effective picked (picked minus rejected)
  if v_total_approved > 0 and v_total_approved >= greatest(v_total_picked - v_total_rejected, 1) then v_target := 'ready_for_dispatch'; end if;
  if v_total_rejected > 0 then v_target := 'rework'; end if;

  -- Partial / full dispatch states based on dispatched vs approved
  if v_total_dispatched > 0 and v_total_dispatched < greatest(v_total_approved - v_total_rejected, 1) then
    v_target := 'partial_dispatched';
  end if;
  if v_total_dispatched >= greatest(v_total_approved - v_total_rejected, 1) and v_total_approved > 0 then
    v_target := 'dispatched';
  end if;

  if v_current in ('completed') then return; end if;

  if v_target is distinct from v_current then
    update public.orders set status = v_target, updated_at = now() where id = p_order_id;
  end if;
end;
$$;

select 'recalc_order_status extended' as status;



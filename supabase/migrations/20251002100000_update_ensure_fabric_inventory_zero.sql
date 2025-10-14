-- Update ensure_fabric_inventory_for_order to seed with 0 available until stock arrives

create or replace function public.ensure_fabric_inventory_for_order(
  p_order_id uuid,
  p_default_unit text default 'meters'
)
returns table(fabric_id uuid, storage_zone_id uuid, created boolean)
language plpgsql
as $$
declare
  v_zone_id uuid;
  r record;
begin
  if p_order_id is null then
    return;
  end if;

  -- Ensure a default storage zone exists (MAIN)
  select id into v_zone_id from public.fabric_storage_zones where zone_code = 'MAIN' limit 1;
  if v_zone_id is null then
    select id into v_zone_id from public.fabric_storage_zones where lower(zone_name) like 'main storage%' limit 1;
  end if;
  if v_zone_id is null then
    insert into public.fabric_storage_zones(zone_name, zone_code, location, description, is_active)
    values ('Main Storage', 'MAIN', 'Warehouse A', 'Auto-created default storage zone', true)
    returning id into v_zone_id;
  end if;

  -- Loop through unique fabrics in this order
  for r in (
    select distinct oi.fabric_id
    from public.order_items oi
    where oi.order_id = p_order_id and oi.fabric_id is not null
  ) loop
    if r.fabric_id is null then continue; end if;
    -- If no inventory row exists for this fabric, create one in MAIN with available = 0 (seed only)
    if not exists (select 1 from public.fabric_inventory fi where fi.fabric_id = r.fabric_id) then
      insert into public.fabric_inventory(fabric_id, storage_zone_id, available_quantity, reserved_quantity, unit)
      values (r.fabric_id, v_zone_id, 0, 0, coalesce(p_default_unit,'meters'));
      fabric_id := r.fabric_id; storage_zone_id := v_zone_id; created := true; return next;
    else
      -- Already exists somewhere; nothing to create
      fabric_id := r.fabric_id; storage_zone_id := null; created := false; return next;
    end if;
  end loop;
end;
$$;

grant execute on function public.ensure_fabric_inventory_for_order(uuid, text) to authenticated;

select 'ensure_fabric_inventory_for_order updated (zero seed)' as status;



-- Auto-initialize fabric_inventory when an order (or order_item) is created

create or replace function public.trigger_orders_ensure_fabric_inventory()
returns trigger
language plpgsql
as $$
begin
  perform public.ensure_fabric_inventory_for_order(new.id, 'meters');
  return new;
end;
$$;

drop trigger if exists orders_ensure_fabric_inventory on public.orders;
create trigger orders_ensure_fabric_inventory
after insert on public.orders
for each row execute function public.trigger_orders_ensure_fabric_inventory();

-- In case fabrics are attached to the order after creation
create or replace function public.trigger_order_items_ensure_fabric_inventory()
returns trigger
language plpgsql
as $$
begin
  perform public.ensure_fabric_inventory_for_order(coalesce(new.order_id, old.order_id), 'meters');
  return coalesce(new, old);
end;
$$;

drop trigger if exists order_items_ensure_fabric_inventory on public.order_items;
create trigger order_items_ensure_fabric_inventory
after insert or update of fabric_id, quantity on public.order_items
for each row execute function public.trigger_order_items_ensure_fabric_inventory();

select 'fabric inventory auto-init triggers installed' as status;



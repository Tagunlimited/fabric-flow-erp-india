-- Triggers to recalc status on production flow changes

-- order_assignments: cutting/pattern assignment
create or replace function public.trigger_order_assignments_recalc()
returns trigger language plpgsql as $$
begin
  perform public.recalc_order_status(coalesce(new.order_id, old.order_id));
  return coalesce(new, old);
end;$$;

drop trigger if exists order_assignments_recalc on public.order_assignments;
create trigger order_assignments_recalc
after insert or update or delete on public.order_assignments
for each row execute function public.trigger_order_assignments_recalc();

-- order_batch_assignments: batch/tailor assignment
create or replace function public.trigger_order_batch_assignments_recalc()
returns trigger language plpgsql as $$
declare v_order_id uuid;
begin
  v_order_id := coalesce(new.order_id, old.order_id);
  if v_order_id is not null then
    perform public.recalc_order_status(v_order_id);
  end if;
  return coalesce(new, old);
end;$$;

drop trigger if exists order_batch_assignments_recalc on public.order_batch_assignments;
create trigger order_batch_assignments_recalc
after insert or update or delete on public.order_batch_assignments
for each row execute function public.trigger_order_batch_assignments_recalc();

-- order_batch_size_distributions: picking quantities
create or replace function public.trigger_obsd_recalc()
returns trigger language plpgsql as $$
declare v_order_id uuid;
begin
  select oba.order_id into v_order_id from public.order_batch_assignments oba
  where oba.id = coalesce(new.order_batch_assignment_id, old.order_batch_assignment_id);
  if v_order_id is not null then
    perform public.recalc_order_status(v_order_id);
  end if;
  return coalesce(new, old);
end;$$;

drop trigger if exists order_batch_size_distributions_recalc on public.order_batch_size_distributions;
create trigger order_batch_size_distributions_recalc
after insert or update or delete on public.order_batch_size_distributions
for each row execute function public.trigger_obsd_recalc();

-- qc_reviews: qc approvals/rejections
create or replace function public.trigger_qc_reviews_recalc()
returns trigger language plpgsql as $$
declare v_order_id uuid;
begin
  select oba.order_id into v_order_id from public.order_batch_assignments oba
  where oba.id = coalesce(new.order_batch_assignment_id, old.order_batch_assignment_id);
  if v_order_id is not null then
    perform public.recalc_order_status(v_order_id);
  end if;
  return coalesce(new, old);
end;$$;

drop trigger if exists qc_reviews_recalc on public.qc_reviews;
create trigger qc_reviews_recalc
after insert or update or delete on public.qc_reviews
for each row execute function public.trigger_qc_reviews_recalc();

select 'production triggers installed' as status;



-- QC reviews to approve/reject picked quantities per batch assignment and size

create table if not exists public.qc_reviews (
  id uuid primary key default gen_random_uuid(),
  order_batch_assignment_id uuid not null references public.order_batch_assignments(id) on delete cascade,
  size_name text not null,
  picked_quantity integer not null default 0,
  approved_quantity integer not null default 0,
  rejected_quantity integer not null default 0,
  remarks text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique(order_batch_assignment_id, size_name)
);

alter table public.qc_reviews enable row level security;

drop policy if exists "qc reviews select" on public.qc_reviews;
create policy "qc reviews select" on public.qc_reviews for select using (true);

drop policy if exists "qc reviews modify" on public.qc_reviews;
create policy "qc reviews modify" on public.qc_reviews for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

comment on table public.qc_reviews is 'QC approvals and rejections for picked quantities per size';
comment on column public.qc_reviews.approved_quantity is 'Approved pieces after QC';
comment on column public.qc_reviews.rejected_quantity is 'Rejected pieces after QC';



-- Extend order_status for production flow phases

alter type public.order_status add value if not exists 'under_cutting';
alter type public.order_status add value if not exists 'under_stitching';
alter type public.order_status add value if not exists 'under_qc';
alter type public.order_status add value if not exists 'ready_for_dispatch';
alter type public.order_status add value if not exists 'rework';

select 'Production flow order_status values added' as status;



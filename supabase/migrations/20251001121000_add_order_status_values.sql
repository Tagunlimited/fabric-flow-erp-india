-- Add new values to public.order_status enum in a dedicated transaction

alter type public.order_status add value if not exists 'designing_done';
alter type public.order_status add value if not exists 'under_procurement';

select 'Order status enum values added' as status;



-- Add dispatched states to order_status enum

alter type public.order_status add value if not exists 'partial_dispatched';
alter type public.order_status add value if not exists 'dispatched';

select 'Order status dispatched values added' as status;



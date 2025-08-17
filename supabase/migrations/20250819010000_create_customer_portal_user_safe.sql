-- Create a safe function to (re)create customer portal user with limited access
-- Uses direct insert/update into auth.users with pgcrypto hashing
create extension if not exists pgcrypto;

create or replace function public.create_customer_portal_user_safe(
  customer_email text,
  customer_password text,
  p_customer_id uuid,
  customer_name text,
  p_can_view_orders boolean default true,
  p_can_view_invoices boolean default true,
  p_can_view_quotations boolean default true,
  p_can_view_production_status boolean default true,
  p_can_download_documents boolean default true,
  p_can_request_changes boolean default true
) returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_user_id uuid;
  v_hashed text;
begin
  if customer_email is null or customer_password is null or p_customer_id is null then
    raise exception 'Missing required inputs';
  end if;

  -- Check for existing auth user by email (case-insensitive)
  select id into v_user_id from auth.users where lower(email) = lower(customer_email);

  if v_user_id is not null then
    -- Re-grant path: update password and timestamps
    update auth.users
      set encrypted_password = extensions.crypt(customer_password, extensions.gen_salt('bf')),
          email_confirmed_at = now(),
          updated_at = now()
      where id = v_user_id;
  else
    -- Create new auth user
    v_hashed := extensions.crypt(customer_password, extensions.gen_salt('bf'));
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
      customer_email, v_hashed, now(), now(), now(), '{"provider":"email","providers":["email"]}',
      json_build_object('full_name', customer_name, 'role', 'customer')::jsonb,
      false, '', '', '', ''
    ) returning id into v_user_id;
  end if;

  -- Upsert profile as customer
  insert into public.profiles (user_id, email, full_name, role, status)
  values (v_user_id, customer_email, customer_name, 'customer', 'approved')
  on conflict (user_id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        role = 'customer',
        status = 'approved',
        updated_at = now();

  -- Link to customer (one-to-one per customer_id)
  insert into public.customer_users (customer_id, user_id)
  values (p_customer_id, v_user_id)
  on conflict (customer_id) do update set user_id = excluded.user_id;

  -- Upsert portal permissions
  insert into public.customer_portal_settings (
    customer_id, can_view_orders, can_view_invoices, can_view_quotations,
    can_view_production_status, can_download_documents, can_request_changes
  ) values (
    p_customer_id, p_can_view_orders, p_can_view_invoices, p_can_view_quotations,
    p_can_view_production_status, p_can_download_documents, p_can_request_changes
  ) on conflict (customer_id) do update set
    can_view_orders = excluded.can_view_orders,
    can_view_invoices = excluded.can_view_invoices,
    can_view_quotations = excluded.can_view_quotations,
    can_view_production_status = excluded.can_view_production_status,
    can_download_documents = excluded.can_download_documents,
    can_request_changes = excluded.can_request_changes;

  return v_user_id;
end;
$$;

grant execute on function public.create_customer_portal_user_safe(text, text, uuid, text, boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;

select pg_notify('pgrst','reload schema');



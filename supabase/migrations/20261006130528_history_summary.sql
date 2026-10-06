-- Server-only summaries avoid transferring historic item relationships to the client.
create or replace function public.hockey_history_summary()
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
 select jsonb_build_object(
   'activeCount', count(*) filter (where returned_at is null),
   'completedCount', count(*) filter (where returned_at is not null),
   'paidRevenue', coalesce(sum(fee_total) filter (where paid), 0)
 ) from public.hockey_rentals;
$$;
revoke all on function public.hockey_history_summary() from public, anon, authenticated;
grant execute on function public.hockey_history_summary() to service_role;

create or replace function public.hockey_inventory_read()
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
 select coalesce(jsonb_agg(to_jsonb(i) || jsonb_build_object(
   'rental_count', (select count(*) from public.hockey_rental_items ri where ri.item_id=i.id),
   'active_rental_id', a.id, 'verliehenAn', a.renter_name,
   'verliehenAm', a.rented_at, 'bezahlt', coalesce(a.paid, false)
 ) order by i.id desc), '[]'::jsonb)
 from public.hockey_equipment_items i
 left join lateral (
   select r.id,r.renter_name,r.rented_at,r.paid
   from public.hockey_rental_items ri join public.hockey_rentals r on r.id=ri.rental_id
   where ri.item_id=i.id and ri.returned_at is null and r.returned_at is null
   order by r.id desc limit 1
 ) a on true
 where i.is_deleted = false;
$$;
revoke all on function public.hockey_inventory_read() from public, anon, authenticated;
grant execute on function public.hockey_inventory_read() to service_role;
create index if not exists idx_hockey_rental_items_item_history on public.hockey_rental_items(item_id);
create index if not exists idx_hockey_rentals_completed_page on public.hockey_rentals(rented_at desc, id desc) where returned_at is not null;

-- Admin-confirmed deletion of an entire rental, including signed contracts.
begin;
create or replace function public.hockey_mutate_rental(p_action text,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 v_id bigint; v_item bigint; v_old bigint; v_ids bigint[]; v_r public.hockey_rentals;
 v_e public.hockey_equipment_items; v_count integer; v_today date := (now() at time zone 'Europe/Berlin')::date;
 v_date date; v_due date; v_fee numeric; v_note text; v_result jsonb; v_code text; v_prefix text; v_num bigint;
begin
 perform pg_advisory_xact_lock(72639821);
 v_id := (p_data->>'id')::bigint;
 v_item := (p_data->>'item_id')::bigint;
 v_old := (p_data->>'return_item_id')::bigint;
 v_note := nullif(btrim(p_data->>'note'),'');
 if p_action='create_item' then
   v_prefix := p_data->>'prefix';
   if v_prefix is null or v_prefix !~ '^[A-Z]+$' then raise exception 'Ungültige Kategorie'; end if;
   select coalesce(max(substring(item_code from length(v_prefix)+2)::bigint),0)+1 into v_num
     from public.hockey_equipment_items where item_code ~ ('^'||v_prefix||'-[0-9]+$');
   v_code := v_prefix||'-'||lpad(v_num::text,greatest(3,length(v_num::text)),'0');
   insert into public.hockey_equipment_items(item_code,category,category_label,size,brand,image,condition_note,status,is_deleted)
     values(v_code,p_data->>'category',p_data->>'category_label',p_data->>'size',p_data->>'brand',p_data->>'image',p_data->>'condition_note','verfügbar',false) returning id into v_id;
   return jsonb_build_object('success',true,'id',v_id,'item_code',v_code);
 elsif p_action='edit_item' then
   update public.hockey_equipment_items set category=p_data->>'category',category_label=p_data->>'category_label',
    brand=p_data->>'brand',size=p_data->>'size',image=p_data->>'image',condition_note=p_data->>'condition_note'
    where id=v_id and not coalesce(is_deleted,false);
   if not found then raise exception 'Teil nicht gefunden' using errcode='P0002'; end if;
   return jsonb_build_object('success',true);
 elsif p_action='create' then
   select array_agg(value::bigint order by value::bigint) into v_ids from jsonb_array_elements_text(p_data->'item_ids');
   if coalesce(cardinality(v_ids),0)=0 or cardinality(v_ids)<>(select count(distinct x) from unnest(v_ids) x) then
     raise exception 'Keine gültige eindeutige Teileauswahl'; end if;
   perform 1 from public.hockey_equipment_items where id=any(v_ids) order by id for update;
   select count(*) into v_count from public.hockey_equipment_items e where id=any(v_ids) and not coalesce(is_deleted,false)
    and status='verfügbar' and not exists(select 1 from public.hockey_rental_items ri join public.hockey_rentals r on r.id=ri.rental_id
     where ri.item_id=e.id and ri.returned_at is null and r.returned_at is null);
   if v_count<>cardinality(v_ids) then raise exception 'Mindestens ein Teil fehlt oder ist nicht verfügbar'; end if;
   if nullif(btrim(p_data->>'renter_name'),'') is null then raise exception 'Name fehlt'; end if;
   v_date:=coalesce((p_data->>'rented_at')::date,v_today);
   if v_date>v_today then raise exception 'Ausleihdatum darf nicht in der Zukunft liegen'; end if;
   v_due:=coalesce((p_data->>'due_date')::date,(v_date+interval '6 months')::date);
   v_fee:=coalesce((p_data->>'fee_total')::numeric,0);
   if v_fee<0 or v_fee::text in ('NaN','Infinity','-Infinity') or v_due<v_date then raise exception 'Ungültige Gebühr oder Laufzeit'; end if;
   insert into public.hockey_rentals(renter_name,rented_at,due_date,fee_total,paid,note,rental_type)
    values(btrim(p_data->>'renter_name'),v_date,v_due,v_fee,coalesce((p_data->>'paid')::boolean,false),v_note,
    case when cardinality(v_ids)>1 then 'bundle' else 'single' end) returning id into v_id;
   insert into public.hockey_rental_items(rental_id,item_id,added_at) select v_id,x,v_date from unnest(v_ids) x;
   perform public.hockey_sync_item_status(v_ids);
   return jsonb_build_object('success',true,'rentalId',v_id);
 elsif p_action='delete_item' then
   select * into v_e from public.hockey_equipment_items where id=v_id for update;
   if not found then raise exception 'Teil nicht gefunden' using errcode='P0002'; end if;
   if exists(select 1 from public.hockey_rental_items ri join public.hockey_rentals r on r.id=ri.rental_id
     where ri.item_id=v_id and ri.returned_at is null and r.returned_at is null) then raise exception 'Verliehenes Teil zuerst zurückgeben'; end if;
   if exists(select 1 from public.hockey_rental_items where item_id=v_id) then
     update public.hockey_equipment_items set is_deleted=true,status='ausgemustert' where id=v_id;
   else delete from public.hockey_equipment_items where id=v_id; end if;
   return jsonb_build_object('success',true);
 end if;
 select * into v_r from public.hockey_rentals where id=v_id for update;
 if not found then raise exception 'Verleihvorgang nicht gefunden' using errcode='P0002'; end if;
 select array_agg(distinct item_id) into v_ids from public.hockey_rental_items where rental_id=v_id;
 if p_action='return' then
   -- Also heals an interrupted legacy return, without freeing items re-rented elsewhere.
   update public.hockey_rental_items set returned_at=coalesce(v_r.returned_at,v_today)
    where rental_id=v_id and returned_at is null;
   get diagnostics v_count=row_count;
   update public.hockey_rentals set returned_at=coalesce(returned_at,v_today) where id=v_id;
   perform public.hockey_sync_item_status(v_ids);
   return jsonb_build_object('success',true,'returned_at',coalesce(v_r.returned_at,v_today),'returned_count',v_count,'already_returned',v_r.returned_at is not null);
 elsif p_action in ('single_return','exchange','add') then
   if v_r.returned_at is not null then raise exception 'Ausleihe ist bereits abgeschlossen'; end if;
   if p_action in ('single_return','exchange') then
     v_old:=case when p_action='single_return' then v_item else v_old end;
     if not exists(select 1 from public.hockey_rental_items where rental_id=v_id and item_id=v_old and returned_at is null) then
       raise exception 'Dieses Teil gehört nicht zur aktiven Ausleihe'; end if;
   end if;
   if p_action in ('exchange','add') then
     select * into v_e from public.hockey_equipment_items where id=v_item for update;
     if not found or coalesce(v_e.is_deleted,false) or v_e.status<>'verfügbar' or exists(
       select 1 from public.hockey_rental_items ri join public.hockey_rentals r on r.id=ri.rental_id
       where ri.item_id=v_item and ri.returned_at is null and r.returned_at is null) then raise exception 'Ersatzteil ist nicht verfügbar'; end if;
   end if;
   if p_action in ('single_return','exchange') then
     update public.hockey_rental_items set returned_at=v_today,exchange_note=coalesce(v_note,
       case when p_action='exchange' then 'Tausch gegen '||v_e.item_code else 'Einzeln zurückgegeben' end)
       where rental_id=v_id and item_id=v_old and returned_at is null;
   end if;
   if p_action in ('exchange','add') then
     insert into public.hockey_rental_items(rental_id,item_id,added_at,exchange_note) values(v_id,v_item,v_today,
       coalesce(v_note,case when p_action='exchange' then 'Ersatz für '||(select item_code from public.hockey_equipment_items where id=v_old) end));
   end if;
   if not exists(select 1 from public.hockey_rental_items where rental_id=v_id and returned_at is null) then
     update public.hockey_rentals set returned_at=v_today where id=v_id;
   else
     update public.hockey_rentals set rental_type=case when (select count(*) from public.hockey_rental_items where rental_id=v_id and returned_at is null)>1 then 'bundle' else 'single' end where id=v_id;
   end if;
   perform public.hockey_sync_item_status(array_append(v_ids,v_item));
   return jsonb_build_object('success',true,'rentalCompleted',not exists(select 1 from public.hockey_rental_items where rental_id=v_id and returned_at is null));
 elsif p_action='payment' then
   if jsonb_typeof(p_data->'paid')<>'boolean' or not p_data?'paid' then raise exception 'Ungültiger Zahlungsstatus'; end if;
   update public.hockey_rentals set paid=(p_data->>'paid')::boolean where id=v_id;
   return jsonb_build_object('success',true,'paid',(p_data->>'paid')::boolean);
 elsif p_action='details' then
   if exists(select 1 from public.hockey_rental_contracts where rental_id=v_id and status='signed') and
    (p_data?'renter_name' or p_data?'fee_total' or p_data?'due_date') then raise exception 'Unterschriebene Vertragsdaten können nicht geändert werden'; end if;
   if p_data?'fee_total' then
    v_fee:=(p_data->>'fee_total')::numeric;
    if v_fee is null or v_fee<0 or v_fee::text in ('NaN','Infinity','-Infinity') then raise exception 'Ungültige Gebühr'; end if;
   else v_fee:=v_r.fee_total; end if;
   v_due:=case when p_data?'due_date' then (p_data->>'due_date')::date else v_r.due_date end;
   if v_due is not null and v_due<v_r.rented_at then raise exception 'Ungültiges Rückgabedatum'; end if;
   if p_data?'renter_name' and nullif(btrim(p_data->>'renter_name'),'') is null then raise exception 'Name fehlt'; end if;
   update public.hockey_rentals set renter_name=case when p_data?'renter_name' then btrim(p_data->>'renter_name') else renter_name end,
    fee_total=v_fee,due_date=v_due,note=case when p_data?'note' then v_note else note end where id=v_id;
   if p_data?'fee_total' then update public.hockey_rental_contracts set fee_amount=v_fee,updated_at=clock_timestamp() where rental_id=v_id and status<>'signed'; end if;
   return jsonb_build_object('success',true);
 elsif p_action='delete' then
   -- Remove dependent mail jobs before contracts cascade from the rental.
   delete from public.hockey_contract_deliveries where rental_id=v_id;
   delete from public.hockey_rentals where id=v_id;
   perform public.hockey_sync_item_status(v_ids);
   return jsonb_build_object('success',true);
 end if;
 raise exception 'Unbekannte Aktion';
end $$;

create or replace function public.hockey_signed_contract_immutable()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 -- Permit a cascade only after the parent rental has been deleted.
 -- Direct contract deletion and any update of a signed contract stay blocked.
 if old.status='signed' and (tg_op<>'DELETE' or exists(
   select 1 from public.hockey_rentals where id=old.rental_id
 )) then raise exception 'Unterschriebener Vertrag ist unveränderlich'; end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function public.hockey_mutate_rental(text,jsonb), public.hockey_signed_contract_immutable() from public,anon,authenticated;
grant execute on function public.hockey_mutate_rental(text,jsonb), public.hockey_signed_contract_immutable() to service_role;
grant delete on public.hockey_contract_deliveries to service_role;
commit;

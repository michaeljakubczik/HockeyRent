-- Only the backend service_role may call these invoker functions.
-- All write operations share one transaction-scoped lock. For this small
-- club inventory this deliberately favors correctness over write throughput.
begin;

do $$ declare c record; begin
  for c in select conname from pg_constraint where conrelid='public.hockey_equipment_items'::regclass and contype='c' and pg_get_constraintdef(oid) like '%status%' loop
    execute format('alter table public.hockey_equipment_items drop constraint %I',c.conname);
  end loop;
end $$;
alter table public.hockey_equipment_items add constraint hockey_equipment_status_check
check(status in ('verfügbar','verliehen','ausgemustert'));
alter table public.hockey_rental_contracts add column if not exists rental_snapshot jsonb;
alter table public.hockey_rental_contracts add column if not exists pdf_sha256 text;
create index if not exists hockey_rental_items_rental_lookup on public.hockey_rental_items(rental_id);

create or replace function public.hockey_sync_item_status(p_ids bigint[])
returns void language sql security invoker set search_path=public,pg_temp as $$
 update public.hockey_equipment_items e set status=case
   when coalesce(e.is_deleted,false) then 'ausgemustert'
   when exists(select 1 from public.hockey_rental_items ri join public.hockey_rentals r on r.id=ri.rental_id
     where ri.item_id=e.id and ri.returned_at is null and r.returned_at is null) then 'verliehen'
   else 'verfügbar' end where e.id=any(p_ids);
$$;

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
   if exists(select 1 from public.hockey_rental_contracts where rental_id=v_id and status='signed') then raise exception 'Unterschriebene Ausleihe muss für die Historie erhalten bleiben'; end if;
   delete from public.hockey_rentals where id=v_id;
   perform public.hockey_sync_item_status(v_ids);
   return jsonb_build_object('success',true);
 end if;
 raise exception 'Unbekannte Aktion';
end $$;

create or replace function public.hockey_contract_state(p_id bigint)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('contract',(select to_jsonb(c) from public.hockey_rental_contracts c where c.rental_id=r.id),
 'rental',jsonb_build_object('id',r.id,'renter_name',r.renter_name,'rented_at',r.rented_at,'due_date',r.due_date,'returned_at',r.returned_at,'fee_total',r.fee_total),
 'equipment',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'item_code',e.item_code,'category',e.category,
 'category_label',e.category_label,'brand',e.brand,'size',e.size) order by e.id)
 from public.hockey_rental_items ri join public.hockey_equipment_items e on e.id=ri.item_id
 where ri.rental_id=r.id and ri.returned_at is null),'[]'::jsonb)) from public.hockey_rentals r where r.id=p_id;
$$;

create or replace function public.hockey_contract_write(p_action text,p_id bigint,p_data jsonb,p_token text default null,p_review_hash text default null,p_template jsonb default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_c public.hockey_rental_contracts; v_r public.hockey_rentals; v_state jsonb; v_key text; v_fields jsonb; v_hash text;
begin
 perform pg_advisory_xact_lock(72639821);
 select * into v_r from public.hockey_rentals where id=p_id for update;
 if not found then raise exception 'Ausleihe nicht gefunden' using errcode='P0002'; end if;
 select * into v_c from public.hockey_rental_contracts where rental_id=p_id for update;
 if p_token is not null and (v_c.id is null or v_c.signing_token_hash is distinct from p_token or
   v_c.signing_token_expires_at is null or v_c.signing_token_expires_at<=now() or v_c.status<>'draft') then raise exception 'Vertragslink ist nicht mehr gültig'; end if;
 if p_action='preview' then
   v_state:=public.hockey_contract_state(p_id);
   v_hash:=md5(v_state::text||p_template::text);
   return v_state||jsonb_build_object('review_hash',v_hash);
 end if;
 if v_r.returned_at is not null then raise exception 'Abgeschlossene Ausleihe kann nicht unterschrieben werden'; end if;
 if v_c.status='signed' then raise exception 'Vertrag ist bereits unterschrieben'; end if;
 if p_action='link' then
   if v_c.id is null then
     insert into public.hockey_rental_contracts(rental_id,first_name,last_name,child_name,street,house_number,postal_code,city,phone,email,iban,fee_amount,status)
     values(p_id,'','','','','','','','','','',coalesce(v_r.fee_total,60),'draft');
   end if;
   update public.hockey_rental_contracts set signing_token_hash=p_data->>'hash',signing_token_expires_at=(p_data->>'expires_at')::timestamptz,
     status='draft',updated_at=clock_timestamp() where rental_id=p_id;
 elsif p_action='save' then
   foreach v_key in array array['first_name','last_name','child_name','street','house_number','postal_code','city','phone','email','iban'] loop
     if jsonb_typeof(p_data->v_key)<>'string' or nullif(btrim(p_data->>v_key),'') is null then raise exception 'Alle Pflichtfelder ausfüllen'; end if;
   end loop;
   if p_token is not null then
     p_data:=p_data||jsonb_build_object('fee_amount',v_c.fee_amount,'deposit_amount',v_c.deposit_amount);
   end if;
   if (p_data->>'fee_amount')::numeric<0 or (p_data->>'deposit_amount')::numeric<0 then raise exception 'Ungültiger Betrag'; end if;
   insert into public.hockey_rental_contracts(rental_id,first_name,last_name,child_name,street,house_number,postal_code,city,phone,email,iban,fee_amount,deposit_amount,status,equipment_snapshot,updated_at)
    values(p_id,btrim(p_data->>'first_name'),btrim(p_data->>'last_name'),btrim(p_data->>'child_name'),btrim(p_data->>'street'),btrim(p_data->>'house_number'),btrim(p_data->>'postal_code'),btrim(p_data->>'city'),btrim(p_data->>'phone'),p_data->>'email',p_data->>'iban',(p_data->>'fee_amount')::numeric,(p_data->>'deposit_amount')::numeric,'draft',public.hockey_contract_state(p_id)->'equipment',clock_timestamp())
   on conflict(rental_id) do update set first_name=excluded.first_name,last_name=excluded.last_name,child_name=excluded.child_name,street=excluded.street,
     house_number=excluded.house_number,postal_code=excluded.postal_code,city=excluded.city,phone=excluded.phone,email=excluded.email,iban=excluded.iban,
     fee_amount=excluded.fee_amount,deposit_amount=excluded.deposit_amount,status='draft',equipment_snapshot=excluded.equipment_snapshot,updated_at=excluded.updated_at;
   update public.hockey_rentals set renter_name=btrim(p_data->>'first_name')||' '||btrim(p_data->>'last_name'),fee_total=(p_data->>'fee_amount')::numeric where id=p_id;
 elsif p_action='sign' then
   v_state:=public.hockey_contract_state(p_id);
   if p_review_hash is null or p_review_hash is distinct from md5(v_state::text||p_template::text) then raise exception 'Vertrag wurde geändert. Bitte erneut laden und prüfen'; end if;
   if v_c.id is null or v_c.status<>'draft' or jsonb_array_length(v_state->'equipment')=0 then raise exception 'Kein vollständiger aktiver Vertragsentwurf'; end if;
   foreach v_key in array array['first_name','last_name','child_name','street','house_number','postal_code','city','phone','email','iban'] loop
     if nullif(btrim(to_jsonb(v_c)->>v_key),'') is null then raise exception 'Alle Pflichtfelder ausfüllen'; end if;
   end loop;
   update public.hockey_rental_contracts set status='signed',signed_at=(p_data->>'signed_at')::timestamptz,
     signer_name=p_data->>'signer_name',signature_data=p_data->>'signature_data',pdf_path=p_data->>'pdf_path',pdf_url=null,
     pdf_sha256=p_data->>'pdf_sha256',equipment_snapshot=v_state->'equipment',rental_snapshot=v_state->'rental',
     contract_snapshot=p_template,contract_version=p_data->>'contract_version',signing_token_hash=null,signing_token_expires_at=null,updated_at=clock_timestamp()
   where rental_id=p_id;
 else raise exception 'Unbekannte Vertragsaktion'; end if;
 return public.hockey_contract_state(p_id)||jsonb_build_object('review_hash',md5(public.hockey_contract_state(p_id)::text||p_template::text));
end $$;

create or replace function public.hockey_signed_contract_immutable()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if old.status='signed' then raise exception 'Unterschriebener Vertrag ist unveränderlich'; end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
drop trigger if exists hockey_signed_contract_immutable on public.hockey_rental_contracts;
create trigger hockey_signed_contract_immutable before update or delete on public.hockey_rental_contracts
for each row execute function public.hockey_signed_contract_immutable();

-- Persistent rate limiter shared between serverless instances; no raw IP retained.
create table if not exists public.hockey_api_limits(key text primary key,count integer not null,reset_at timestamptz not null);
alter table public.hockey_api_limits enable row level security;
create or replace function public.hockey_rate_limit(p_key text,p_limit integer,p_window integer)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_count integer; begin
 delete from public.hockey_api_limits where reset_at<now()-interval '1 hour';
 insert into public.hockey_api_limits values(p_key,1,now()+make_interval(secs=>p_window))
 on conflict(key) do update set count=case when hockey_api_limits.reset_at<=now() then 1 else hockey_api_limits.count+1 end,
 reset_at=case when hockey_api_limits.reset_at<=now() then now()+make_interval(secs=>p_window) else hockey_api_limits.reset_at end
 returning count into v_count;
 return v_count<=p_limit;
end $$;

-- Repair only logically determined legacy inconsistencies, preserving part history.
update public.hockey_rental_items ri set returned_at=r.returned_at from public.hockey_rentals r
where ri.rental_id=r.id and ri.returned_at is null and r.returned_at is not null;
select public.hockey_sync_item_status(array(select id from public.hockey_equipment_items));

revoke all on public.hockey_api_limits from public,anon,authenticated;
grant all on public.hockey_api_limits to service_role;
revoke execute on function public.hockey_sync_item_status(bigint[]), public.hockey_mutate_rental(text,jsonb),public.hockey_contract_state(bigint),
 public.hockey_contract_write(text,bigint,jsonb,text,text,jsonb),public.hockey_rate_limit(text,integer,integer),public.hockey_signed_contract_immutable() from public,anon,authenticated;
grant execute on function public.hockey_sync_item_status(bigint[]), public.hockey_mutate_rental(text,jsonb),public.hockey_contract_state(bigint),
 public.hockey_contract_write(text,bigint,jsonb,text,text,jsonb),public.hockey_rate_limit(text,integer,integer),public.hockey_signed_contract_immutable() to service_role;
revoke all on public.hockey_equipment_items,public.hockey_rentals,public.hockey_rental_items,public.hockey_rental_contracts from public,anon,authenticated;
do $$ begin
 if to_regprocedure('public.hockey_prevent_double_active_rental()') is not null then
   alter function public.hockey_prevent_double_active_rental() set search_path=public,pg_temp;
   revoke execute on function public.hockey_prevent_double_active_rental() from public,anon,authenticated;
 end if;
end $$;
notify pgrst,'reload schema';
commit;

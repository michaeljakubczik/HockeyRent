import { test } from 'node:test';
import assert from 'node:assert/strict';
import { database, mutate, contract, fields, seed } from './database.js';

test('rental operations preserve inventory and history, retries, payment and membership',async()=>{
 const db=await database();
 try {
  const {rentalId:id}=await seed(db);
  await mutate(db,'payment',{id,paid:true});
  await mutate(db,'payment',{id,paid:false});
  assert.equal((await db.query<any>('select paid from hockey_rentals where id=$1',[id])).rows[0].paid,false);
  await assert.rejects(mutate(db,'single_return',{id,item_id:3}),/gehört nicht/);
  await assert.rejects(mutate(db,'exchange',{id,return_item_id:3,item_id:4}),/gehört nicht/);
  await mutate(db,'single_return',{id,item_id:1});
  await mutate(db,'exchange',{id,return_item_id:2,item_id:3});
  await mutate(db,'add',{id,item_id:1});
  await assert.rejects(mutate(db,'add',{id,item_id:3}),/nicht verfügbar/);
  await assert.rejects(mutate(db,'delete_item',{id:3}),/zuerst zurückgeben/);
  const done=await mutate(db,'return',{id});
  assert.equal(done.returned_count,2);
  assert.equal((await mutate(db,'return',{id})).returned_count,0);
  assert.equal((await db.query<any>("select count(*)::int n from hockey_equipment_items where status='verliehen'")).rows[0].n,0);
  assert.equal((await db.query<any>('select count(*)::int n from hockey_rental_items where rental_id=$1',[id])).rows[0].n,4);
  await mutate(db,'delete_item',{id:1});
  assert.equal((await db.query<any>('select status from hockey_equipment_items where id=1')).rows[0].status,'ausgemustert');
 } finally { await db.close(); }
});

test('transaction rolls back if equipment update fails after return writes',async()=>{
 const db=await database();
 try {
  const {rentalId:id}=await seed(db);
  await db.exec(`create function injected_failure() returns trigger language plpgsql as $$ begin raise exception 'injected'; end $$;
    create trigger injected before update on hockey_equipment_items for each row execute function injected_failure();`);
  await assert.rejects(mutate(db,'return',{id}),/injected/);
  assert.equal((await db.query<any>('select returned_at from hockey_rentals where id=$1',[id])).rows[0].returned_at,null);
  assert.equal((await db.query<any>('select count(*)::int n from hockey_rental_items where returned_at is null')).rows[0].n,2);
  await assert.rejects(mutate(db,'exchange',{id,return_item_id:1,item_id:3}),/injected/);
  assert.equal((await db.query<any>('select count(*)::int n from hockey_rental_items')).rows[0].n,2);
 } finally { await db.close(); }
});

test('repeat return heals legacy status without freeing an item rented elsewhere',async()=>{
 const db=await database();
 try {
  const {rentalId:id}=await seed(db);
  await mutate(db,'return',{id});
  const second=await mutate(db,'create',{renter_name:'Other',item_ids:[1],fee_total:0});
  await db.exec("update hockey_equipment_items set status='verliehen' where id=2");
  await mutate(db,'return',{id});
  const rows=(await db.query<any>('select id,status from hockey_equipment_items where id in (1,2) order by id')).rows;
  assert.equal(rows[0].status,'verliehen'); assert.equal(rows[1].status,'verfügbar');
  await mutate(db,'delete',{id:second.rentalId});
  assert.equal((await db.query<any>('select status from hockey_equipment_items where id=1')).rows[0].status,'verfügbar');
 } finally { await db.close(); }
});

test('missing/deleted/duplicate IDs and double lending are rejected without partial rentals',async()=>{
 const db=await database();
 try {
  await seed(db);
  for(const ids of [[999],[1],[3,3]]) await assert.rejects(mutate(db,'create',{item_ids:ids,renter_name:'Test',fee_total:60}));
  await mutate(db,'delete_item',{id:4});
  await assert.rejects(mutate(db,'create',{item_ids:[4],renter_name:'Test'}));
  assert.equal((await db.query<any>('select count(*)::int n from hockey_rentals')).rows[0].n,1);
 } finally { await db.close(); }
});

test('contract changes invalidate review; signed contract and dates remain immutable',async()=>{
 const db=await database();
 try {
  const {rentalId:id}=await seed(db);
  const state=await contract(db,'save',id,fields);
  await mutate(db,'exchange',{id,return_item_id:1,item_id:3});
  await assert.rejects(contract(db,'sign',id,{signed_at:new Date().toISOString()},null,state.review_hash),/geändert/);
  const fresh=await contract(db,'preview',id);
  const signed=await contract(db,'sign',id,{signed_at:new Date().toISOString(),pdf_path:'test.pdf',pdf_sha256:'abc',signer_name:'Test',signature_data:'test',contract_version:'test'},null,fresh.review_hash);
  assert.equal(signed.contract.status,'signed');
  assert.equal(signed.contract.rental_snapshot.rented_at,'2026-01-31');
  await assert.rejects(contract(db,'save',id,fields),/unterschrieben/);
  await assert.rejects(mutate(db,'details',{id,due_date:'2027-01-01'}),/Unterschriebene/);
  await assert.rejects(db.exec('delete from hockey_rental_contracts'),/unveränderlich/);
  await assert.rejects(db.exec("update hockey_rental_contracts set status='draft'"),/unveränderlich/);
  await mutate(db,'payment',{id,paid:true});
  await mutate(db,'return',{id});
  await mutate(db,'delete',{id});
  assert.equal((await db.query<any>('select count(*) n from hockey_rental_contracts')).rows[0].n,0);
  assert.equal((await db.query<any>('select count(*) n from hockey_contract_deliveries')).rows[0].n,0);
 } finally { await db.close(); }
});

test('public link renewals, incomplete drafts, expiry, single use and protected fees',async()=>{
 const db=await database();
 try {
  const {rentalId:id}=await seed(db);
  const future=new Date(Date.now()+86400000).toISOString();
  let state=await contract(db,'link',id,{hash:'old',expires_at:future});
  await assert.rejects(contract(db,'sign',id,{},'old',state.review_hash),/Pflichtfelder/);
  await contract(db,'link',id,{hash:'new',expires_at:future});
  await assert.rejects(contract(db,'preview',id,{},'old'),/gültig/);
  state=await contract(db,'save',id,{...fields,fee_amount:0,deposit_amount:0},'new');
  assert.equal(state.contract.fee_amount,60);
  state=await contract(db,'sign',id,{signed_at:new Date().toISOString(),pdf_path:'test',signer_name:'Test'},'new',state.review_hash);
  assert.equal(state.contract.signing_token_hash,null);
  await assert.rejects(contract(db,'preview',id,{},'new'),/gültig/);
 } finally { await db.close(); }
});

test('database functions cannot be called by anonymous clients',async()=>{
 const db=await database();
 try {
  await db.exec('set role anon');
  await assert.rejects(mutate(db,'payment',{id:1,paid:true}),/permission denied/);
  await assert.rejects(contract(db,'link',1,{}),/permission denied/);
 } finally { await db.close(); }
});


test('signed active rental deletion clears its dependents and frees only its own active equipment',async()=>{
 const db=await database();
 try {
  const {rentalId:id}=await seed(db);
  await contract(db,'save',id,fields);
  const reviewed=await contract(db,'preview',id);
  await contract(db,'sign',id,{signed_at:new Date().toISOString(),pdf_path:'test.pdf',pdf_sha256:'abc',signer_name:'Test',signature_data:'test',contract_version:'test'},null,reviewed.review_hash);
  await mutate(db,'single_return',{id,item_id:1});
  const other=await mutate(db,'create',{renter_name:'Other',item_ids:[1],fee_total:60,rented_at:'2026-03-01'});
  assert.equal((await db.query<any>('select count(*) n from hockey_contract_deliveries where rental_id=$1',[id])).rows[0].n,2);
  await mutate(db,'delete',{id});
  for(const table of ['hockey_rentals','hockey_rental_items','hockey_rental_contracts','hockey_contract_deliveries']) {
   assert.equal((await db.query<any>(`select count(*) n from ${table} where ${table==='hockey_rentals'?'id':'rental_id'}=$1`,[id])).rows[0].n,0);
  }
  const items=(await db.query<any>('select id,status from hockey_equipment_items where id in (1,2) order by id')).rows;
  assert.equal(items[0].status,'verliehen');
  assert.equal(items[1].status,'verfügbar');
  assert.equal((await db.query<any>('select count(*) n from hockey_rentals where id=$1',[other.rentalId])).rows[0].n,1);
  await assert.rejects(mutate(db,'delete',{id}),/nicht gefunden/);
 } finally { await db.close(); }
});

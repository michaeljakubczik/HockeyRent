import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../api/index.js';
import { createContractSnapshot } from '../src/contractTemplate.js';
import { PNG } from 'pngjs';
import { database,mutate,contract,fields,seed } from './database.js';

test('API login, paid/open, details, returns and complete admin/public contract flows',async()=>{
 const db=await database(); const files=new Map<string,Buffer>();
 const storage={from:()=>({
  upload:async(path:string,bytes:Buffer)=>{files.set(path,bytes);return {error:null};},
  remove:async(paths:string[])=>{paths.forEach(p=>files.delete(p));return {error:null};},
  download:async(path:string)=>({data:files.has(path) ? new Blob([files.get(path)!]) : null,error:files.has(path) ? null : {message:'missing'}})
 })};
 const supabase={storage, rpc:async(name:string,args:any)=>{
  try {
   let data:any;
   if(name==='hockey_mutate_rental') data=await mutate(db,args.p_action,args.p_data);
   else if(name==='hockey_contract_write') data=await contract(db,args.p_action,args.p_id,args.p_data,args.p_token,args.p_review_hash,args.p_template);
   else data=(await db.query<any>('select hockey_rate_limit($1,$2,$3) result',[args.p_key,args.p_limit,args.p_window])).rows[0].result;
   return {data,error:null};
  } catch(err:any) {return {data:null,error:{code:err.code,message:err.message}};}
 },from:(table:string)=>{
  let column='*',key='',value:any;
  const builder={select:(c:string)=>{column=c;return builder;},eq:(k:string,v:any)=>{key=k;value=v;return builder;},maybeSingle:async()=>{
   const result=await db.query<any>(`select ${column} from ${table} where ${key}=$1`,[value]);return {data:result.rows[0]||null,error:null};
  }};return builder;
 }};
 const app=await createApp({supabase,password:'test-password'});
 const api=request(app);
 try {
  const rental=await seed(db); const id=rental.rentalId;
  await api.get('/api/items').expect(401);
  await api.post('/api/login').send({password:'wrong'}).expect(401);
  const login=await api.post('/api/login').send({password:'test-password'}).expect(200);
  assert.ok(login.body.token); const session=login.body.token;
  const admin=(verb:'post'|'get'|'patch',url:string)=>api[verb](url).set('x-admin-password',session);
  await admin('get','/api/session').expect(200);
  for(const paid of [true,false]) {const res=await admin('post',`/api/rentals/${id}/payment-status`).send({paid}).expect(200);assert.equal(res.body.paid,paid);}
  await admin('patch',`/api/rentals/${id}`).send({fee_total:0,due_date:'2026-08-01',renter_name:'Test Person'}).expect(200);
  await admin('post',`/api/rentals/${id}/items/3/return`).send({}).expect(409);
  const save=await admin('post',`/api/rentals/${id}/contract`).send({...fields,fee_amount:0}).expect(200);
  const png=new PNG({width:200,height:80});for(let x=20;x<140;x++)png.data[(40*200+x)*4+3]=255;
  const signature='data:image/png;base64,'+PNG.sync.write(png).toString('base64');
  const secondInstance=request(await createApp({supabase,password:'test-password'}));
  const sign=await secondInstance.post(`/api/rentals/${id}/contract/sign`).set('x-admin-password',session).send({signature_data:signature,signer_name:'Test Person',review_hash:save.body.review_hash}).expect(200);
  assert.equal(sign.body.contract.status,'signed');
  await admin('get',`/api/rentals/${id}/contract/pdf`).expect(200).expect('Content-Type',/pdf/);
  await admin('post',`/api/rentals/${id}/contract`).send(fields).expect(409);
  await admin('post',`/api/rentals/${id}/return`).send({}).expect(200);
  const other=await mutate(db,'create',{item_ids:[3],renter_name:'Other',fee_total:60});
  const link=await admin('post',`/api/rentals/${other.rentalId}/contract/signing-link`).send({}).expect(200);
  const token=link.body.token;
  const incomplete=await api.get('/api/public/contract').query({token}).expect(200);
  await api.post('/api/public/contract/sign').send({token,signature_data:signature,signer_name:'Test',review_hash:incomplete.body.review_hash}).expect(400);
  const publicSave=await api.post('/api/public/contract/update').send({...fields,fee_amount:0,token}).expect(200);
  assert.equal(publicSave.body.contract.fee_amount,60);
  assert.equal(publicSave.body.contract.signing_token_hash,undefined);
  await api.post('/api/public/contract/sign').send({token,signature_data:signature,signer_name:'Test Person',review_hash:publicSave.body.review_hash}).expect(200);
  await api.get('/api/public/contract').query({token}).expect(410);
  assert.equal(files.size,2);
 } finally {await db.close();}
});

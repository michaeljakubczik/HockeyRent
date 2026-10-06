import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { validIban,money,date,validateSignature } from '../server/validation.js';
import { generateContractPdf } from '../src/pdfGenerator.js';
import { createContractSnapshot } from '../src/contractTemplate.js';
import { fields } from './database.js';
export function signature(ink=true) {
 const png=new PNG({width:200,height:80});
 if(ink) for(let x=20;x<120;x++) {const i=(40*200+x)*4;png.data[i+3]=255;}
 return 'data:image/png;base64,'+PNG.sync.write(png).toString('base64');
}
test('IBAN, amounts, dates and real signature pixels validated',()=>{
 assert.equal(validIban('DE89 3704 0044 0532 0130 00'),'DE89370400440532013000');
 assert.throws(()=>validIban('DE00370400440532013000'));
 for(const n of [-1,NaN,Infinity,null,'',0.001]) assert.throws(()=>money(n));
 assert.equal(money(0),0);
 assert.equal(date('2024-02-29'),'2024-02-29');
 assert.throws(()=>date('2026-02-30'));
 assert.throws(()=>validateSignature(signature(false)));
 assert.throws(()=>validateSignature('data:image/png;base64,'+'a'.repeat(500)));
 assert.equal(validateSignature(signature()),signature());
});
test('PDF rejects invalid signature and accepts complete frozen zero-fee contract',async()=>{
 const params={rentalId:1,rental:{id:1,rented_at:'2026-01-01',due_date:'2026-07-01'},contract:{...fields,fee_amount:0,signature_data:signature(),signed_at:new Date().toISOString(),signer_name:'Test',contract_snapshot:createContractSnapshot()}};
 const bytes=await generateContractPdf(params);
 assert.ok(bytes.length>1000);
 await assert.rejects(generateContractPdf({...params,contract:{...params.contract,signature_data:'data:image/png;base64,'+'a'.repeat(500)}}));
});

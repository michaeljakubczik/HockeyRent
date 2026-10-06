import express from "express";
import dotenv from "dotenv";
import crypto from "crypto";
import { HttpError, positiveId, money, date, text, contractFields, validateSignature } from "../server/validation.js";
import { createClient } from "@supabase/supabase-js";
import { generateContractPdf } from "../src/pdfGenerator.js";
import { createContractSnapshot, CURRENT_CONTRACT_VERSION } from "../src/contractTemplate.js";

dotenv.config();

let supabaseClient: any = null;

const getConfiguredSupabase = () => {
  if (supabaseClient) return supabaseClient;
  const supabaseUrl = process.env.SUPABASE_URL || "";
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlen in den Umgebungsvariablen.");
  }
  supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey);
  return supabaseClient;
};

const CATEGORY_PREFIXES: Record<string, string> = {
  'Helm': 'H',
  'Schutzhose': 'SH',
  'Handschuhe': 'HG',
  'Ellenbogenschützer': 'ES',
  'Schienbeinschutz': 'SB',
  'Schulterschutz': 'SS',
  'Trikot': 'T',
  'Goalie Schienen': 'GS',
  'Goalie Fanghand': 'GF',
  'Goalie Stockhand': 'GST',
  'Goalie Schutzhose': 'GSH',
  'Goalie Schulterschutz': 'GSS',
  'Goalie Ellenbogenschützer': 'GES',
  'Goalie Knieschützer': 'GK',
  'Goalie Halsschutz': 'GHS',
  'Goalie Trikot': 'GT',
  'Goalie Maske': 'GM'
};

export function calculateSixMonthsDueDate(startDateStr: string): string {
  if (!startDateStr) return '';
  const parts = startDateStr.split('-');
  if (parts.length !== 3) return startDateStr;
  
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10); // 1 - 12
  const day = parseInt(parts[2], 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) return startDateStr;

  let targetMonth = month + 6;
  let targetYear = year;
  if (targetMonth > 12) {
    targetMonth -= 12;
    targetYear += 1;
  }

  // Tag 0 des Folgemonats liefert die Anzahl der Tage im targetMonth
  const maxDaysInTargetMonth = new Date(targetYear, targetMonth, 0).getDate();
  const targetDay = Math.min(day, maxDaysInTargetMonth);

  const yyyy = targetYear.toString().padStart(4, '0');
  const mm = targetMonth.toString().padStart(2, '0');
  const dd = targetDay.toString().padStart(2, '0');

  return `${yyyy}-${mm}-${dd}`;
}

export async function createApp(options: { supabase?: any; password?: string } = {}) {
  const getSupabase = () => options.supabase || getConfiguredSupabase();
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  const getEnvPassword = () => {
    const pass = options.password || process.env.ADMIN_PASSWORD;
    if (!pass || pass.trim() === "") {
      console.error("CRITICAL: ADMIN_PASSWORD is not set in environment variables.");
      throw new Error("ADMIN_PASSWORD fehlt.");
    }
    return pass;
  };

  const adminPassword = getEnvPassword();

  const tokenSecret = process.env.SESSION_SECRET || adminPassword;
  const issueSession = () => {
    const payload = Buffer.from(JSON.stringify({ expires: Date.now() + 12 * 3600000, nonce: crypto.randomBytes(16).toString('hex') })).toString('base64url');
    return payload + '.' + crypto.createHmac('sha256', tokenSecret).update(payload).digest('base64url');
  };
  const validSession = (token: unknown) => {
    if (typeof token !== 'string' || token.length > 1000) return false;
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return false;
    const expected = crypto.createHmac('sha256', tokenSecret).update(payload).digest('base64url');
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected))) return false;
    try { return JSON.parse(Buffer.from(payload,'base64url').toString()).expires > Date.now(); } catch { return false; }
  };
  const authHeader: express.RequestHandler = (req,res,next) => {
    if (validSession(req.headers['x-admin-password'])) next();
    else res.status(401).json({ success:false,message:'Sitzung abgelaufen. Bitte erneut anmelden.' });
  };
  const run = (fn: (req: express.Request,res: express.Response) => Promise<any>): express.RequestHandler => (req,res,next) => { Promise.resolve(fn(req,res)).catch(next); };
  async function rpc(name: string, args: any) {
    const {data,error} = await getSupabase().rpc(name,args);
    if (error) {
      console.error(`[Database ${name}]`, error.code);
      if (error.code === 'P0002') throw new HttpError(404,error.message);
      if (['P0001','23505','23514','22P02','22007','22008'].includes(error.code)) throw new HttpError(409,error.message);
      throw new HttpError(503,'Datenbankzugriff fehlgeschlagen. Bitte erneut versuchen.');
    }
    return data;
  }
  app.use('/api', (req,res,next) => { res.setHeader('Cache-Control','no-store'); next(); });
  const rateLimit = (scope: string,limit: number): express.RequestHandler => run(async (req,res) => {
    const ip = req.get('x-forwarded-for')?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    const key = crypto.createHmac('sha256',tokenSecret).update(scope+':'+ip).digest('hex');
    if (!await rpc('hockey_rate_limit',{p_key:key,p_limit:limit,p_window:60})) throw new HttpError(429,'Zu viele Anfragen. Bitte später erneut versuchen.');
    // Middleware continues through the explicit next handler supplied below.
    (res.locals.rateNext as express.NextFunction)();
  });
  const limit = (scope: string,n: number): express.RequestHandler => (req,res,next) => {
    res.locals.rateNext=next; rateLimit(scope,n)(req,res,next);
  };
  app.post('/api/login',limit('login',10),run(async(req,res)=>{
    const password=req.body.password;
    const supplied=typeof password==='string' ? Buffer.from(password) : Buffer.alloc(0);
    const expected=Buffer.from(adminPassword);
    if (supplied.length!==expected.length || !crypto.timingSafeEqual(supplied,expected)) throw new HttpError(401,'Ungültiges Passwort');
    res.json({success:true,token:issueSession()});
  }));
  app.get('/api/session',authHeader,(_req,res)=>res.json({success:true}));
  app.use('/api/public/contract',limit('contract',60));

  async function loadAll(query: () => any) {
    const rows: any[]=[];
    for(let offset=0;;offset+=500) {
      const {data,error}=await query().range(offset,offset+499);
      if(error) throw new HttpError(503,'Daten konnten nicht geladen werden.');
      rows.push(...data);
      if(data.length<500) return rows;
    }
  }
  app.get("/api/public/available", async (req, res) => {
    try {
      const supabase = getSupabase();
      const data = await loadAll(() => supabase
        .from('hockey_equipment_items')
        .select('id, item_code, category, category_label, size, brand, image')
        .eq('status', 'verfügbar')
        .eq('is_deleted', false)
        .order('category', { ascending: true }).order('id'));
      

      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/items", authHeader, async (req, res) => {
    try {
      const supabase = getSupabase();
      const data = await loadAll(() => supabase
        .from('hockey_equipment_items')
        .select(`
          *,
          hockey_rental_items(
            id, returned_at,
            hockey_rentals(id, renter_name, rented_at, returned_at, paid)
          )
        `)
        .eq('is_deleted', false)
        .order('id', { ascending: false }));



      const transformed = data.map((item: any) => {
        const rentalItemsList = (item.hockey_rental_items || item.rental_items) || [];
        const activeRentalItem = rentalItemsList.find(
          (ri: any) => (ri.hockey_rentals || ri.rentals) && !(ri.hockey_rentals || ri.rentals).returned_at && !ri.returned_at
        );
        const activeRental = activeRentalItem?.hockey_rentals || activeRentalItem?.rentals;
        
        // Verleihcounter pro Equipment: Wie oft wurde dieses konkrete Equipment bereits verliehen?
        // Berechnet aus den vorhandenen historischen Daten in hockey_rental_items
        const rentalCount = rentalItemsList.length;

        return {
          ...item,
          rental_items: rentalItemsList,
          rental_count: rentalCount,
          active_rental_id: activeRental?.id || null,
          verliehenAn: activeRental?.renter_name || null,
          verliehenAm: activeRental?.rented_at || null,
          bezahlt: activeRental?.paid || false
        };
      });

      res.json(transformed);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/items',authHeader,run(async(req,res)=>{
    const category=text(req.body.category,'Kategorie');
    if (!CATEGORY_PREFIXES[category]) throw new HttpError(400,'Unbekannte Kategorie');
    res.json(await rpc('hockey_mutate_rental',{p_action:'create_item',p_data:{
      category,category_label:category,brand:text(req.body.brand,'Marke'),size:text(req.body.size,'Größe'),
      prefix:CATEGORY_PREFIXES[category],image:req.body.image || null,condition_note:req.body.condition_note || null
    }}));
  }));

  app.patch('/api/items/:id',authHeader,run(async(req,res)=>{
    const category=text(req.body.category,'Kategorie');
    if(!CATEGORY_PREFIXES[category]) throw new HttpError(400,'Unbekannte Kategorie');
    res.json(await rpc('hockey_mutate_rental',{p_action:'edit_item',p_data:{id:positiveId(req.params.id),category,
      category_label:category,size:text(req.body.size,'Größe'),brand:text(req.body.brand,'Marke'),image:req.body.image||null,condition_note:req.body.condition_note||null}}));
  }));

  const mutate = (action: string, data: any) => rpc('hockey_mutate_rental',{p_action:action,p_data:data});
  app.post('/api/rentals',authHeader,run(async(req,res)=>{
    const body=req.body;
    if (!Array.isArray(body.item_ids) || !body.item_ids.length) throw new HttpError(400,'Keine Teile ausgewählt');
    const ids=body.item_ids.map(positiveId);
    if (new Set(ids).size!==ids.length) throw new HttpError(400,'Teile doppelt ausgewählt');
    const data={...body,item_ids:ids,renter_name:text(body.renter_name,'Name'),fee_total:money(body.fee_total,0)};
    if (body.rented_at) data.rented_at=date(body.rented_at);
    if (body.due_date) data.due_date=date(body.due_date);
    if (body.paid!==undefined && typeof body.paid!=='boolean') throw new HttpError(400,'Ungültiger Zahlungsstatus');
    res.json(await mutate('create',data));
  }));
  app.post('/api/rentals/:id/return',authHeader,run(async(req,res)=>res.json(await mutate('return',{id:positiveId(req.params.id)}))));
  app.post('/api/rentals/:id/items/:itemId/return',authHeader,run(async(req,res)=>res.json(await mutate('single_return',{id:positiveId(req.params.id),item_id:positiveId(req.params.itemId),note:req.body?.note}))));
  app.post('/api/rentals/:id/exchange',authHeader,run(async(req,res)=>res.json(await mutate('exchange',{id:positiveId(req.params.id),return_item_id:positiveId(req.body.return_item_id),item_id:positiveId(req.body.new_item_id),note:req.body.note}))));
  const addItem=run(async(req,res)=>res.json(await mutate('add',{id:positiveId(req.params.id),item_id:positiveId(req.body.item_id),note:req.body.note})));
  app.post('/api/rentals/:id/items',authHeader,addItem);
  app.post('/api/rentals/:id/add-item',authHeader,addItem);
  app.patch('/api/rentals/:id',authHeader,run(async(req,res)=>{
    const data: any={id:positiveId(req.params.id)};
    if (req.body.renter_name!==undefined) data.renter_name=text(req.body.renter_name,'Name');
    if (req.body.fee_total!==undefined) data.fee_total=money(req.body.fee_total);
    if (req.body.note!==undefined) data.note=req.body.note===null ? null : text(req.body.note,'Notiz',false,2000);
    if (req.body.due_date!==undefined) data.due_date=date(req.body.due_date);
    res.json(await mutate('details',data));
  }));
  const payment=run(async(req,res)=>{
    if(typeof req.body.paid!=='boolean') throw new HttpError(400,'Ungültiger Zahlungsstatus');
    res.json(await mutate('payment',{id:positiveId(req.params.id),paid:req.body.paid}));
  });
  app.post('/api/rentals/:id/payment-status',authHeader,payment);
  app.patch('/api/rentals/:id/paid',authHeader,payment);

  app.get("/api/history", authHeader, async (req, res) => {
    try {
      const supabase = getSupabase();
      const data = await loadAll(() => supabase
        .from('hockey_rentals')
        .select(`
          *,
          hockey_rental_items(
            *,
            hockey_equipment_items(id,item_code,category,category_label,size,brand,condition_note,status,created_at,is_deleted)
          )
        `)
        .order('rented_at', { ascending: false }).order('id', { ascending:false }));



      // Gather any item IDs where relation hockey_equipment_items might not have resolved directly
      const missingItemIds = new Set<number>();
      data.forEach((rental: any) => {
        const rItems = (rental.hockey_rental_items || rental.rental_items) || [];
        rItems.forEach((ri: any) => {
          if (!ri.hockey_equipment_items && !ri.equipment_items && ri.item_id) {
            missingItemIds.add(ri.item_id);
          }
        });
      });

      let itemsMap: Record<number, any> = {};
      if (missingItemIds.size > 0) {
        const eqData = await loadAll(() => supabase
          .from('hockey_equipment_items')
          .select('id,item_code,category,category_label,size,brand,condition_note,status,created_at,is_deleted')
          .in('id', Array.from(missingItemIds)).order('id'));
        if (eqData) {
          eqData.forEach((eq: any) => {
            itemsMap[eq.id] = eq;
          });
        }
      }

      // Verträge laden, um in der Verleihliste den Status anzuzeigen
      const contractsMap: Record<number, any> = {};
      const contractsData = await loadAll(() => supabase.from('hockey_rental_contracts')
        .select('id, rental_id, status, signed_at, signer_name, pdf_path, updated_at, created_at, first_name, last_name, child_name').order('id'));
      for(const c of contractsData) contractsMap[c.rental_id]=c;

      const transformed = data.map((rental: any) => {
        const allRentalItems = (rental.hockey_rental_items || rental.rental_items) || [];
        
        // All equipment items in this rental
        const allItems = allRentalItems
          .map((ri: any) => ri.hockey_equipment_items || ri.equipment_items || itemsMap[ri.item_id])
          .filter(Boolean);

        // Active items in this rental (neither the rental is returned, nor this specific item was returned)
        const activeItems = allRentalItems
          .filter((ri: any) => !ri.returned_at)
          .map((ri: any) => ri.hockey_equipment_items || ri.equipment_items || itemsMap[ri.item_id])
          .filter(Boolean);

        // Historical all items record with exchange/timeline metadata
        const allItemsRecord = allRentalItems.map((ri: any) => ({
          id: ri.id,
          rental_id: ri.rental_id,
          item_id: ri.item_id,
          added_at: ri.added_at,
          returned_at: ri.returned_at,
          exchange_note: ri.exchange_note,
          item: ri.hockey_equipment_items || ri.equipment_items || itemsMap[ri.item_id]
        }));

        return {
          ...rental,
          // For active rentals, items = currently active items.
          // For completed rentals, items = all items that were rented (so equipment is always visible in completed rentals!)
          items: rental.returned_at ? allItems : activeItems,
          active_items: activeItems,
          all_items: allItems,
          all_rental_items: allItemsRecord,
          contract: contractsMap[rental.id] || null
        };
      });

      res.json(transformed);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==============================================================================
  // VERTRAGSMANAGEMENT (PHASE 1)
  // Einverständniserklärung Ausleihe Hockey-Ausrüstung für Spieler
  // Förderverein der Wiesel Arpke e.V.
  // ==============================================================================

  // GET /api/rentals/:id/contract - Vertragsdaten zu einer Ausleihe laden
  const template=createContractSnapshot();
  // Review hashes must match across independent serverless instances.
  delete template.generated_at;
  const contractRpc=(action: string,id: number,data: any={},token: string|null=null,review: string|null=null) =>
    rpc('hockey_contract_write',{p_action:action,p_id:id,p_data:data,p_token:token,p_review_hash:review,p_template:template});
  const tokenHash=(token: unknown) => {
    if (typeof token!=='string' || !/^[a-f0-9]{64}$/.test(token)) throw new HttpError(410,'Vertragslink ist nicht mehr gültig.');
    return crypto.createHash('sha256').update(token).digest('hex');
  };
  async function publicContract(token: unknown) {
    const hash=tokenHash(token);
    const {data,error}=await getSupabase().from('hockey_rental_contracts').select('rental_id').eq('signing_token_hash',hash).maybeSingle();
    if (error) throw new HttpError(503,'Vertrag konnte nicht geladen werden.');
    if (!data) throw new HttpError(410,'Vertragslink ist nicht mehr gültig.');
    return {id:positiveId(data.rental_id),hash};
  }
  function previewResponse(state: any,publicMode=false) {
    const contract=state.contract;
    return {success:true,contract:publicMode && contract ? {
      ...Object.fromEntries(['first_name','last_name','child_name','street','house_number','postal_code','city','phone','email','iban','fee_amount','deposit_amount','status'].map(k=>[k,contract[k]]))
    } : contract,rental:{...state.rental,active_items:state.equipment},equipment:state.equipment,
      review_hash:state.review_hash,expires_at:contract?.signing_token_expires_at};
  }
  app.get('/api/rentals/:id/contract',authHeader,run(async(req,res)=>res.json(previewResponse(await contractRpc('preview',positiveId(req.params.id))))));
  app.post('/api/rentals/:id/contract',authHeader,run(async(req,res)=>{
    const state=await contractRpc('save',positiveId(req.params.id),contractFields(req.body));
    res.json(previewResponse(state));
  }));
  app.post('/api/rentals/:id/contract/signing-link',authHeader,run(async(req,res)=>{
    const token=crypto.randomBytes(32).toString('hex');
    const expires=new Date(Date.now()+7*86400000).toISOString();
    await contractRpc('link',positiveId(req.params.id),{hash:tokenHash(token),expires_at:expires});
    res.json({success:true,token,expires_at:expires});
  }));
  app.get('/api/public/contract',run(async(req,res)=>{
    const {id,hash}=await publicContract(req.query.token);
    res.json(previewResponse(await contractRpc('preview',id,{},hash),true));
  }));
  app.post('/api/public/contract/update',run(async(req,res)=>{
    const {id,hash}=await publicContract(req.body.token);
    res.json(previewResponse(await contractRpc('save',id,contractFields(req.body,true),hash),true));
  }));
  async function finalizeContractSigning(id:number,body:any,token:string|null=null) {
    const signature=validateSignature(body.signature_data);
    const name=text(body.signer_name,'Name der unterzeichnenden Person');
    if (typeof body.review_hash!=='string' || !/^[a-f0-9]{32}$/.test(body.review_hash)) throw new HttpError(409,'Bitte den Vertrag erneut laden und prüfen.');
    const state=await contractRpc('preview',id,{},token);
    if (state.review_hash!==body.review_hash) throw new HttpError(409,'Vertrag wurde geändert. Bitte erneut laden und prüfen.');
    if (!state.contract || state.contract.status!=='draft' || state.rental.returned_at || !state.equipment.length) throw new HttpError(409,'Kein aktiver Vertragsentwurf vorhanden.');
    contractFields(state.contract);
    const signedAt=new Date().toISOString();
    const pdf=await generateContractPdf({rentalId:id,rental:state.rental,contract:{...state.contract,
      equipment_snapshot:state.equipment,contract_snapshot:template,signature_data:signature,signer_name:name,signed_at:signedAt}});
    const storagePath=`contracts/${id}/contract_${crypto.randomUUID()}.pdf`;
    const {error}=await getSupabase().storage.from('hockey-contracts').upload(storagePath,Buffer.from(pdf),{contentType:'application/pdf',upsert:false});
    if (error) throw new HttpError(503,'PDF konnte nicht archiviert werden. Der Vertrag wurde nicht abgeschlossen.');
    try {
      return await contractRpc('sign',id,{signature_data:signature,signer_name:name,signed_at:signedAt,pdf_path:storagePath,
        pdf_sha256:crypto.createHash('sha256').update(pdf).digest('hex'),contract_version:CURRENT_CONTRACT_VERSION},token,body.review_hash);
    } catch(error) {
      const {error:cleanupError}=await getSupabase().storage.from('hockey-contracts').remove([storagePath]);
      if(cleanupError) console.error('PDF cleanup failed',cleanupError.code);
      throw error;
    }
  }
  app.post('/api/rentals/:id/contract/sign',authHeader,run(async(req,res)=>res.json(previewResponse(await finalizeContractSigning(positiveId(req.params.id),req.body)))));
  app.post('/api/public/contract/sign',run(async(req,res)=>{
    const {id,hash}=await publicContract(req.body.token);
    await finalizeContractSigning(id,req.body,hash);
    res.json({success:true,message:'Vertrag erfolgreich unterschrieben.'});
  }));

  app.get("/api/rentals/:id/contract/pdf", authHeader, async (req, res) => {
    const supabase = getSupabase();
    const rentalId = Number(req.params.id);

    try {
      const { data: contract, error: cError } = await supabase
        .from('hockey_rental_contracts')
        .select('*')
        .eq('rental_id', rentalId)
        .maybeSingle();

      if (cError || !contract) {
        return res.status(404).json({ success: false, message: "Vertrag nicht gefunden." });
      }

      if (contract.status !== 'signed') {
        return res.status(400).json({
          success: false,
          message: "Für diesen Vertrag liegt noch kein unterschriebenes PDF vor."
        });
      }

      const storagePath = contract.pdf_path || `contracts/${rentalId}/contract_${rentalId}.pdf`;

      // Datei aus privatem Bucket laden
      const { data: fileData, error: downloadError } = await supabase
        .storage
        .from('hockey-contracts')
        .download(storagePath);

      if (downloadError || !fileData) {
        // Fallback: Falls Datei im Storage fehlt, aber Contract signed ist -> aus Snapshot neu generieren
        if (contract.contract_snapshot && contract.rental_snapshot && !contract.pdf_sha256) {
          const pdfBytes = await generateContractPdf({rentalId,contract,rental:contract.rental_snapshot});
          // Legacy recovery only. New archives require the original hashed PDF.
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `inline; filename="Ausleihvertrag_${rentalId}.pdf"`);
          return res.send(Buffer.from(pdfBytes));
        }

        return res.status(404).json({
          success: false,
          message: "Das Vertrags-PDF konnte nicht im Speicher gefunden werden."
        });
      }

      const arrayBuffer = await fileData.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="Ausleihvertrag_${rentalId}.pdf"`);
      if (contract.pdf_sha256 && crypto.createHash('sha256').update(buffer).digest('hex') !== contract.pdf_sha256) {
        throw new Error('Archiv-PDF stimmt nicht mit dem gespeicherten Hash überein.');
      }
      res.send(buffer);
    } catch (err: any) {
      console.error(`[Contract PDF Download Error]: Rental ${rentalId} - ${err.message}`);
      res.status(500).json({ success: false, message: "Fehler beim Laden des Vertrags-PDFs." });
    }
  });

  // GET /api/rentals/:id/contract/pdf-url - Kurzlebige signierte URL für geschützten PDF-Aufruf
  app.get("/api/rentals/:id/contract/pdf-url", authHeader, async (req, res) => {
    const supabase = getSupabase();
    const rentalId = Number(req.params.id);

    try {
      const { data: contract, error: cError } = await supabase
        .from('hockey_rental_contracts')
        .select('pdf_path, status')
        .eq('rental_id', rentalId)
        .maybeSingle();

      if (cError || !contract || contract.status !== 'signed') {
        return res.status(404).json({ success: false, message: "Kein unterschriebener Vertrag vorhanden." });
      }

      const storagePath = contract.pdf_path || `contracts/${rentalId}/contract_${rentalId}.pdf`;
      const { data: signedUrlData, error: sError } = await supabase
        .storage
        .from('hockey-contracts')
        .createSignedUrl(storagePath, 120); // 120 Sekunden gültig

      if (sError || !signedUrlData) {
        return res.status(500).json({ success: false, message: "Konnte keine temporäre URL erstellen." });
      }

      res.json({ success: true, signedUrl: signedUrlData.signedUrl });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.delete('/api/items/:id',authHeader,run(async(req,res)=>res.json(await mutate('delete_item',{id:positiveId(req.params.id)}))));
  app.delete('/api/rentals/:id',authHeader,run(async(req,res)=>res.json(await mutate('delete',{id:positiveId(req.params.id)}))));
  app.use((error: any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
    const status=error instanceof HttpError ? error.status : error.type==='entity.too.large' ? 413 : error instanceof SyntaxError ? 400 : 500;
    if(status===500) console.error('API error',error.message);
    res.status(status).json({success:false,message:error instanceof HttpError ? error.message : status===400 ? 'Ungültige Anfrage.' : 'Interner Serverfehler.'});
  });
  return app;
}

let appPromise: Promise<express.Express> | undefined;

export default async function handler(req: any, res: any) {
  const app = await (appPromise ||= createApp());
  return app(req, res);
}

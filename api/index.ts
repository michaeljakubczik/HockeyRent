import express from "express";
import dotenv from "dotenv";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { generateContractPdf } from "../src/pdfGenerator.js";
import { createContractSnapshot, CURRENT_CONTRACT_VERSION } from "../src/contractTemplate.js";

dotenv.config();

let supabaseClient: any = null;

const getSupabase = () => {
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

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  const getEnvPassword = () => {
    const pass = process.env.ADMIN_PASSWORD;
    if (!pass || pass.trim() === "") {
      console.error("CRITICAL: ADMIN_PASSWORD is not set in environment variables.");
      process.exit(1); // Fail to start as requested
    }
    return pass;
  };

  const adminPassword = getEnvPassword();

  const authHeader = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const password = req.headers["x-admin-password"];
    if (password === adminPassword) {
      next();
    } else {
      res.status(401).json({ success: false, message: "Nicht autorisiert" });
    }
  };

  app.post("/api/login", (req, res) => {
    const { password } = req.body;
    if (password === adminPassword) {
      res.json({ success: true });
    } else {
      res.status(401).json({ success: false, message: "Ungültiges Passwort" });
    }
  });

  app.get("/api/public/available", async (req, res) => {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('hockey_equipment_items')
        .select('id, item_code, category, category_label, size, brand, image')
        .eq('status', 'verfügbar')
        .eq('is_deleted', false)
        .order('category', { ascending: true });
      
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/items", authHeader, async (req, res) => {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('hockey_equipment_items')
        .select(`
          *,
          hockey_rental_items(
            hockey_rentals(*)
          )
        `)
        .eq('is_deleted', false)
        .order('id', { ascending: false });

      if (error) return res.status(500).json({ error: error.message });

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

  app.post("/api/items", authHeader, async (req, res) => {
    try {
      const supabase = getSupabase();
      const { category, category_label, size, brand, image, condition_note } = req.body;

      if (!category || !size || !brand) {
        return res.status(400).json({ success: false, message: "Kategorie, Größe und Marke sind erforderlich." });
      }

      const prefix = CATEGORY_PREFIXES[category] || 'EQ';
      
      let item_code = '';
      let nextNumber = 1;
      let unique = false;
      let attempts = 0;

      while (!unique && attempts < 5) {
        const { data: lastItems, error: fetchError } = await supabase
          .from('hockey_equipment_items')
          .select('item_code')
          .ilike('item_code', `${prefix}-%`)
          .order('item_code', { ascending: false })
          .limit(1);

        if (fetchError) throw fetchError;

        if (lastItems && lastItems.length > 0 && lastItems[0].item_code) {
          const lastCode = lastItems[0].item_code;
          const parts = lastCode.split('-');
          if (parts.length > 1) {
            nextNumber = Math.max(nextNumber, parseInt(parts[1]) + 1);
          }
        }
        
        item_code = `${prefix}-${nextNumber.toString().padStart(3, '0')}`;
        
        const { count, error: countError } = await supabase
          .from('hockey_equipment_items')
          .select('id', { count: 'exact', head: true })
          .eq('item_code', item_code);
        
        if (countError) throw countError;
        
        if (count === 0) {
          unique = true;
        } else {
          nextNumber++;
          attempts++;
        }
      }

      if (!unique) {
        return res.status(500).json({ success: false, message: "Konnte keinen eindeutigen Item-Code generieren." });
      }

      const { data, error } = await supabase
        .from('hockey_equipment_items')
        .insert([{ 
          category, 
          category_label, 
          size, 
          brand, 
          item_code, 
          image: image || null, 
          condition_note: condition_note || null,
          status: 'verfügbar',
          is_deleted: false
        }])
        .select();

      if (error) {
        console.error(`[Item Creation Error]: ${error.message}`);
        return res.status(400).json({ success: false, message: "Fehler beim Anlegen des Items." });
      }

      console.log(`[Item Created]: ${item_code} (${category_label})`);
      res.json({ success: true, id: data[0].id, item_code });
    } catch (err: any) {
      console.error(`[Item Creation Exception]: ${err.message}`);
      res.status(500).json({ success: false, message: "Interner Serverfehler beim Anlegen des Items." });
    }
  });

  app.patch("/api/items/:id", authHeader, async (req, res) => {
    try {
      const supabase = getSupabase();
      const { id } = req.params;
      const { category, category_label, size, brand, image, condition_note } = req.body;

      const { error } = await supabase
        .from('hockey_equipment_items')
        .update({ 
          category, 
          category_label, 
          size, 
          brand, 
          image, 
          condition_note 
        })
        .eq('id', id);

      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) {
      console.error(`[Item Update Error]: ${err.message}`);
      res.status(500).json({ success: false, message: "Fehler beim Aktualisieren des Items." });
    }
  });

// Saubere Berechnung: 6 Kalendermonate ab rented_at (inkl. Monatsende-Sonderfall)
function calculateDueDate(startDateStr: string): string {
  if (!startDateStr) return '';
  const match = startDateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10); // 1-12
    const day = parseInt(match[3], 10);
    const totalMonths = month - 1 + 6;
    const targetYear = year + Math.floor(totalMonths / 12);
    const targetMonth = (totalMonths % 12) + 1; // 1-12
    const daysInTargetMonth = new Date(targetYear, targetMonth, 0).getDate();
    const targetDay = Math.min(day, daysInTargetMonth);
    const yyyy = String(targetYear);
    const mm = String(targetMonth).padStart(2, '0');
    const dd = String(targetDay).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return '';
}

  app.post("/api/rentals", authHeader, async (req, res) => {
    const supabase = getSupabase();
    let rentalId: number | null = null;
    
    try {
      const { renter_name, rented_at, paid, fee_total, note, item_ids, due_date } = req.body;
      
      if (!item_ids || !Array.isArray(item_ids) || item_ids.length === 0) {
        return res.status(400).json({ success: false, message: "Keine Items ausgewählt" });
      }

      if (!renter_name) {
        return res.status(400).json({ success: false, message: "Name des Ausleihers fehlt" });
      }

      const { data: items, error: checkError } = await supabase
        .from('hockey_equipment_items')
        .select('id, status, item_code')
        .in('id', item_ids);

      if (checkError) throw checkError;
      
      const unavailable = items?.filter((i: any) => i.status !== 'verfügbar');
      if (unavailable && unavailable.length > 0) {
        const codes = unavailable.map((i: any) => i.item_code).join(', ');
        return res.status(400).json({ 
          success: false, 
          message: `Einige Items sind bereits verliehen: ${codes}` 
        });
      }

      const rental_type = item_ids.length > 1 ? 'bundle' : 'single';
      const today = rented_at || new Date().toISOString().split('T')[0];
      const finalDueDate = due_date || calculateDueDate(today);

      const rentalInsertData: any = {
        renter_name,
        rented_at: today,
        due_date: finalDueDate || null,
        paid: !!paid,
        fee_total: parseFloat(fee_total) || 0,
        note: note || null,
        rental_type
      };

      const { data: rentalData, error: rentalError } = await supabase
        .from('hockey_rentals')
        .insert([rentalInsertData])
        .select();

      if (rentalError) throw rentalError;
      if (!rentalData || rentalData.length === 0) {
        throw new Error("Fehler beim Erstellen des Verleih-Datensatzes");
      }
      rentalId = rentalData[0].id;

      const rentalItems = item_ids.map(itemId => ({
        rental_id: rentalId,
        item_id: itemId,
        added_at: today
      }));

      const { error: riError } = await supabase
        .from('hockey_rental_items')
        .insert(rentalItems);

      if (riError) {
        await supabase.from('hockey_rentals').delete().eq('id', rentalId);
        throw riError;
      }

      const { error: itemError } = await supabase
        .from('hockey_equipment_items')
        .update({ status: 'verliehen' })
        .in('id', item_ids);

      if (itemError) {
        await supabase.from('hockey_rental_items').delete().eq('rental_id', rentalId);
        await supabase.from('hockey_rentals').delete().eq('id', rentalId);
        throw itemError;
      }
      
      console.log(`[Rental Created]: ID ${rentalId} for ${renter_name} (${item_ids.length} items)`);
      res.json({ success: true, rentalId });
    } catch (err: any) {
      console.error(`[Rental Creation Error]: ${err.message}`);
      res.status(500).json({ success: false, message: "Fehler beim Erstellen des Verleihs." });
    }
  });

  // Alles zurückgeben (Kompletter Verleihvorgang)
  app.post("/api/rentals/:id/return", authHeader, async (req, res) => {
    const supabase = getSupabase();
    const { id } = req.params;
    
    try {
      const returned_at = new Date().toISOString().split('T')[0];
      
      // 1. Get all items in this rental
      const { data: riData, error: riError } = await supabase
        .from('hockey_rental_items')
        .select('id, item_id, returned_at')
        .eq('rental_id', id);

      if (riError) throw riError;
      
      if (!riData || riData.length === 0) {
        return res.status(404).json({ success: false, message: "Keine Items für diesen Verleih gefunden." });
      }

      // Filter only active items (not already returned)
      const activeItems = riData.filter((ri: any) => !ri.returned_at);
      const itemIds = activeItems.map((ri: any) => ri.item_id);

      if (itemIds.length > 0) {
        const { error: itemError } = await supabase
          .from('hockey_equipment_items')
          .update({ status: 'verfügbar' })
          .in('id', itemIds);

        if (itemError) throw itemError;
      }

      // Mark returned_at on rental_items where returned_at was null
      await supabase
        .from('hockey_rental_items')
        .update({ returned_at })
        .eq('rental_id', id)
        .is('returned_at', null);

      const { error: rentalError } = await supabase
        .from('hockey_rentals')
        .update({ returned_at })
        .eq('id', id);

      if (rentalError) {
        if (itemIds.length > 0) {
          await supabase.from('hockey_equipment_items').update({ status: 'verliehen' }).in('id', itemIds);
        }
        throw rentalError;
      }
      
      console.log(`[Rental Returned]: ID ${id} on ${returned_at}`);
      res.json({ success: true, returned_at });
    } catch (err: any) {
      console.error(`[Rental Return Error]: ${err.message}`);
      res.status(500).json({ success: false, message: "Fehler bei der Rückgabe des Equipments." });
    }
  });

  // Einzelnes Teil aus einem laufenden Bundle zurückgeben
  app.post("/api/rentals/:id/items/:itemId/return", authHeader, async (req, res) => {
    const supabase = getSupabase();
    const { id, itemId } = req.params;
    const { note } = req.body || {};
    
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // 1. Verify rental is active
      const { data: rental, error: rentalError } = await supabase
        .from('hockey_rentals')
        .select('id, returned_at')
        .eq('id', id)
        .single();

      if (rentalError || !rental) {
        return res.status(404).json({ success: false, message: "Verleihvorgang nicht gefunden." });
      }
      if (rental.returned_at) {
        return res.status(400).json({ success: false, message: "Dieser Verleihvorgang ist bereits abgeschlossen." });
      }

      // 2. Mark this item in hockey_rental_items as returned
      const { error: riError } = await supabase
        .from('hockey_rental_items')
        .update({ 
          returned_at: today,
          exchange_note: note || 'Einzeln zurückgegeben'
        })
        .eq('rental_id', id)
        .eq('item_id', itemId)
        .is('returned_at', null);

      if (riError) throw riError;

      // 3. Mark the equipment item as available again
      const { error: itemError } = await supabase
        .from('hockey_equipment_items')
        .update({ status: 'verfügbar' })
        .eq('id', itemId);

      if (itemError) throw itemError;

      // 4. Check if any active items remain in this rental; if none remain, mark rental returned
      const { data: remainingItems, error: remError } = await supabase
        .from('hockey_rental_items')
        .select('id')
        .eq('rental_id', id)
        .is('returned_at', null);

      if (remError) throw remError;

      let rentalCompleted = false;
      if (!remainingItems || remainingItems.length === 0) {
        const { error: completeError } = await supabase
          .from('hockey_rentals')
          .update({ returned_at: today })
          .eq('id', id);

        if (completeError) throw completeError;
        rentalCompleted = true;
      }

      console.log(`[Single Item Returned]: Item ${itemId} from Rental ${id} on ${today} (Rental completed: ${rentalCompleted})`);
      res.json({ success: true, returned_at: today, rentalCompleted });
    } catch (err: any) {
      console.error(`[Single Return Error]: ${err.message}`);
      res.status(500).json({ success: false, message: "Fehler bei der Teilrückgabe." });
    }
  });

  // Teil gegen ein anderes austauschen
  app.post("/api/rentals/:id/exchange", authHeader, async (req, res) => {
    const supabase = getSupabase();
    const { id } = req.params;
    const { return_item_id, new_item_id, note } = req.body;

    if (!return_item_id || !new_item_id) {
      return res.status(400).json({ success: false, message: "Altes und neues Equipmentteil sind erforderlich." });
    }

    try {
      const today = new Date().toISOString().split('T')[0];

      // 1. Verify rental is active
      const { data: rental, error: rentalError } = await supabase
        .from('hockey_rentals')
        .select('id, returned_at')
        .eq('id', id)
        .single();

      if (rentalError || !rental) {
        return res.status(404).json({ success: false, message: "Verleihvorgang nicht gefunden." });
      }
      if (rental.returned_at) {
        return res.status(400).json({ success: false, message: "Dieser Verleihvorgang ist bereits abgeschlossen." });
      }

      // 2. Fetch both equipment items for clean note description
      const { data: itemsData, error: itemsError } = await supabase
        .from('hockey_equipment_items')
        .select('id, status, is_deleted, item_code, brand, size, category_label')
        .in('id', [return_item_id, new_item_id]);

      if (itemsError || !itemsData || itemsData.length < 2) {
        return res.status(404).json({ success: false, message: "Ausrüstungsteile nicht gefunden." });
      }

      const returnItem = itemsData.find((i: any) => i.id === Number(return_item_id));
      const newItem = itemsData.find((i: any) => i.id === Number(new_item_id));

      if (!returnItem || !newItem) {
        return res.status(404).json({ success: false, message: "Teile konnten nicht zugeordnet werden." });
      }

      if (newItem.status !== 'verfügbar' || newItem.is_deleted) {
        return res.status(400).json({ success: false, message: `Ersatzteil ${newItem.item_code} ist aktuell nicht verfügbar.` });
      }

      const returnNote = note 
        ? `${note} (Tausch gegen ${newItem.item_code})`
        : `Tausch gegen ${newItem.item_code} (${newItem.brand} ${newItem.size})`;

      const addNote = note 
        ? `${note} (Ersatz für ${returnItem.item_code})`
        : `Ersatz für ${returnItem.item_code} (${returnItem.brand} ${returnItem.size})`;

      // 3. Mark old item as returned in hockey_rental_items
      const { error: returnRiError } = await supabase
        .from('hockey_rental_items')
        .update({
          returned_at: today,
          exchange_note: returnNote
        })
        .eq('rental_id', id)
        .eq('item_id', return_item_id)
        .is('returned_at', null);

      if (returnRiError) throw returnRiError;

      // 4. Set old item status to 'verfügbar' in hockey_equipment_items
      await supabase
        .from('hockey_equipment_items')
        .update({ status: 'verfügbar' })
        .eq('id', return_item_id);

      // 5. Insert new item in hockey_rental_items
      const { error: addRiError } = await supabase
        .from('hockey_rental_items')
        .insert([{
          rental_id: id,
          item_id: new_item_id,
          added_at: today,
          returned_at: null,
          exchange_note: addNote
        }]);

      if (addRiError) throw addRiError;

      // 6. Set new item status to 'verliehen' in hockey_equipment_items
      await supabase
        .from('hockey_equipment_items')
        .update({ status: 'verliehen' })
        .eq('id', new_item_id);

      console.log(`[Item Exchanged in Rental ${id}]: ${returnItem.item_code} -> ${newItem.item_code}`);
      res.json({ success: true, message: `Teil ${returnItem.item_code} erfolgreich gegen ${newItem.item_code} getauscht.` });
    } catch (err: any) {
      console.error(`[Exchange Error]: ${err.message}`);
      res.status(500).json({ success: false, message: "Fehler beim Austauschen des Equipments." });
    }
  });

  // Teil zu einem bestehenden laufenden Bundle hinzufügen
  const handleAddItemToRental = async (req: any, res: any) => {
    const supabase = getSupabase();
    const { id } = req.params;
    const { item_id, note } = req.body;

    if (!item_id) {
      return res.status(400).json({ success: false, message: "Kein Equipmentteil übergeben." });
    }

    try {
      const today = new Date().toISOString().split('T')[0];

      // 1. Verify rental is active
      const { data: rental, error: rentalError } = await supabase
        .from('hockey_rentals')
        .select('id, returned_at')
        .eq('id', id)
        .single();

      if (rentalError || !rental) {
        return res.status(404).json({ success: false, message: "Verleihvorgang nicht gefunden." });
      }
      if (rental.returned_at) {
        return res.status(400).json({ success: false, message: "Dieser Verleihvorgang ist bereits abgeschlossen." });
      }

      // 2. Verify item is available
      const { data: item, error: itemError } = await supabase
        .from('hockey_equipment_items')
        .select('id, status, is_deleted, item_code')
        .eq('id', item_id)
        .single();

      if (itemError || !item) {
        return res.status(404).json({ success: false, message: "Ausrüstungsteil nicht gefunden." });
      }
      if (item.status !== 'verfügbar' || item.is_deleted) {
        return res.status(400).json({ success: false, message: `Teil ${item.item_code} ist aktuell nicht verfügbar.` });
      }

      // 3. Insert into hockey_rental_items
      const { error: riError } = await supabase
        .from('hockey_rental_items')
        .insert([{
          rental_id: id,
          item_id,
          added_at: today,
          returned_at: null,
          exchange_note: note || null
        }]);

      if (riError) throw riError;

      // 4. Update equipment item status to 'verliehen'
      const { error: itemUpdateError } = await supabase
        .from('hockey_equipment_items')
        .update({ status: 'verliehen' })
        .eq('id', item_id);

      if (itemUpdateError) throw itemUpdateError;

      console.log(`[Item Added to Rental]: Item ${item_id} added to Rental ${id}`);
      res.json({ success: true });
    } catch (err: any) {
      console.error(`[Add Item Error]: ${err.message}`);
      res.status(500).json({ success: false, message: "Fehler beim Hinzufügen des Teils." });
    }
  };

  app.post("/api/rentals/:id/items", authHeader, handleAddItemToRental);
  app.post("/api/rentals/:id/add-item", authHeader, handleAddItemToRental);

  app.patch("/api/rentals/:id", authHeader, async (req, res) => {
    try {
      const { renter_name, fee_total, note, paid, due_date } = req.body;
      const supabase = getSupabase();
      const { id } = req.params;

      const updates: any = {};
      if (renter_name !== undefined) updates.renter_name = renter_name;
      if (fee_total !== undefined) updates.fee_total = Number(fee_total);
      if (note !== undefined) updates.note = note;
      if (paid !== undefined) updates.paid = Boolean(paid);
      if (due_date !== undefined) updates.due_date = due_date;

      const { error } = await supabase
        .from('hockey_rentals')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) {
      console.error(`[Rental Update Error]: ${err.message}`);
      res.status(500).json({ success: false, message: "Fehler beim Aktualisieren der Ausleihe." });
    }
  });

  app.patch("/api/rentals/:id/paid", authHeader, async (req, res) => {
    try {
      const { paid } = req.body;
      if (typeof paid !== "boolean") {
        return res.status(400).json({ 
          success: false, 
          message: "Ungültiger Wert für 'paid'. Es muss ein Boolean (true oder false) sein." 
        });
      }

      const supabase = getSupabase();
      const { id } = req.params;

      const { error } = await supabase
        .from('hockey_rentals')
        .update({ paid })
        .eq('id', id);

      if (error) throw error;
      res.json({ success: true, paid });
    } catch (err: any) {
      console.error(`[Rental Paid Update Error]: ${err.message}`);
      res.status(500).json({ success: false, message: "Fehler beim Aktualisieren des Zahlungsstatus." });
    }
  });

  app.get("/api/history", authHeader, async (req, res) => {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('hockey_rentals')
        .select(`
          *,
          hockey_rental_items(
            *,
            hockey_equipment_items(*)
          )
        `)
        .order('rented_at', { ascending: false });

      if (error) return res.status(500).json({ error: error.message });

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
        const { data: eqData } = await supabase
          .from('hockey_equipment_items')
          .select('*')
          .in('id', Array.from(missingItemIds));
        if (eqData) {
          eqData.forEach((eq: any) => {
            itemsMap[eq.id] = eq;
          });
        }
      }

      // Verträge laden, um in der Verleihliste den Status anzuzeigen
      let contractsMap: Record<number, any> = {};
      try {
        const { data: contractsData } = await supabase
          .from('hockey_rental_contracts')
          .select('id, rental_id, status, signed_at, signer_name, pdf_path, pdf_url, updated_at, created_at, first_name, last_name, child_name');
        if (contractsData) {
          contractsData.forEach((c: any) => {
            contractsMap[c.rental_id] = c;
          });
        }
      } catch (e) {
        // Ignorieren falls nicht verfügbar
      }

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
  app.get("/api/rentals/:id/contract", authHeader, async (req, res) => {
    const supabase = getSupabase();
    const rentalId = Number(req.params.id);

    try {
      // 1. Ausleihe und aktuelle Ausrüstung prüfen
      const { data: rental, error: rError } = await supabase
        .from('hockey_rentals')
        .select(`
          id, renter_name, rented_at, due_date, returned_at, fee_total, paid,
          hockey_rental_items(
            item_id, returned_at,
            hockey_equipment_items(id, item_code, brand, size, category_label)
          )
        `)
        .eq('id', rentalId)
        .single();

      if (rError || !rental) {
        return res.status(404).json({ success: false, message: "Ausleihe nicht gefunden." });
      }

      // Aktuelle aktive Items der Ausleihe
      const rItems = (rental.hockey_rental_items || [])
        .filter((ri: any) => !ri.returned_at)
        .map((ri: any) => ri.hockey_equipment_items)
        .filter(Boolean);

      // 2. Vertrag ausschließlich aus der Datenbank laden (hockey_rental_contracts)
      const { data: cData, error: cError } = await supabase
        .from('hockey_rental_contracts')
        .select('*')
        .eq('rental_id', rentalId)
        .maybeSingle();

      if (cError) {
        console.error(`[Contract Fetch Error]: Rental ${rentalId} - ${cError.message}`);
        return res.status(500).json({ 
          success: false, 
          message: "Fehler beim Laden der Vertragsdaten aus der Datenbank." 
        });
      }

      res.json({
        success: true,
        contract: cData || null,
        rental: {
          id: rental.id,
          renter_name: rental.renter_name,
          rented_at: rental.rented_at,
          due_date: rental.due_date,
          returned_at: rental.returned_at,
          fee_total: rental.fee_total,
          active_items: rItems
        }
      });
    } catch (err: any) {
      console.error(`[Contract Fetch Error]: Rental ${rentalId} - ${err.message}`);
      res.status(500).json({ success: false, message: "Fehler beim Laden der Vertragsdaten." });
    }
  });

  // POST /api/rentals/:id/contract - Vertragsentwurf speichern oder aktualisieren
  app.post("/api/rentals/:id/contract", authHeader, async (req, res) => {
    const supabase = getSupabase();
    const rentalId = Number(req.params.id);
    const {
      first_name,
      last_name,
      child_name,
      street,
      house_number,
      postal_code,
      city,
      phone,
      email,
      iban,
      deposit_amount,
      fee_amount,
      status
    } = req.body;

    // Validierung aller erforderlichen Felder
    if (!first_name || !last_name || !child_name || !street || !house_number || !postal_code || !city || !phone || !email || !iban) {
      return res.status(400).json({ 
        success: false, 
        message: "Bitte alle Pflichtfelder (Name, Kind, Adresse, Telefon, E-Mail und IBAN) ausfüllen." 
      });
    }

    const emailTrimmed = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      return res.status(400).json({ 
        success: false, 
        message: "Bitte eine gültige E-Mail-Adresse angeben." 
      });
    }

    const cleanIban = String(iban).replace(/\s+/g, '').toUpperCase();
    if (cleanIban.length < 15 || !/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(cleanIban)) {
      return res.status(400).json({ 
        success: false, 
        message: "Bitte eine gültige IBAN angeben (z. B. DE...)." 
      });
    }

    try {
      // 0. Prüfen, ob bereits ein verbindlich unterschriebener Vertrag existiert (Unveränderlichkeit)
      const { data: existingContract } = await supabase
        .from('hockey_rental_contracts')
        .select('id, status')
        .eq('rental_id', rentalId)
        .maybeSingle();

      if (existingContract && existingContract.status === 'signed') {
        return res.status(409).json({ 
          success: false, 
          message: "Dieser Vertrag ist bereits verbindlich unterschrieben und kann nicht mehr geändert werden." 
        });
      }

      // 1. Aktuelle aktive Equipmentteile für den Snapshot ermitteln
      const { data: riData } = await supabase
        .from('hockey_rental_items')
        .select(`
          item_id,
          returned_at,
          hockey_equipment_items(id, item_code, brand, size, category_label)
        `)
        .eq('rental_id', rentalId)
        .is('returned_at', null);

      const equipmentSnapshot = (riData || [])
        .map((ri: any) => ri.hockey_equipment_items)
        .filter(Boolean)
        .map((eq: any) => ({
          id: eq.id,
          item_code: eq.item_code,
          brand: eq.brand,
          size: eq.size,
          category_label: eq.category_label
        }));

      const contractPayload: any = {
        rental_id: rentalId,
        first_name: String(first_name).trim(),
        last_name: String(last_name).trim(),
        child_name: String(child_name).trim(),
        street: String(street).trim(),
        house_number: String(house_number).trim(),
        postal_code: String(postal_code).trim(),
        city: String(city).trim(),
        phone: String(phone).trim(),
        email: emailTrimmed,
        iban: cleanIban,
        deposit_amount: deposit_amount !== undefined ? Number(deposit_amount) : 50.00,
        fee_amount: fee_amount !== undefined ? Number(fee_amount) : 60.00,
        equipment_snapshot: equipmentSnapshot,
        status: status || 'draft',
        updated_at: new Date().toISOString()
      };

      // 2. Ausschließlich dauerhaft in Supabase speichern (Upsert über UNIQUE-Constraint auf rental_id)
      const { data, error } = await supabase
        .from('hockey_rental_contracts')
        .upsert(contractPayload, { onConflict: 'rental_id' })
        .select();

      if (error || !data || data.length === 0) {
        console.error(`[Contract Save DB Error]: Rental ${rentalId} - ${error?.message || 'Keine Daten von Datenbank zurückgegeben'}`);
        return res.status(500).json({ 
          success: false, 
          message: "Der Vertrag konnte nicht dauerhaft gespeichert werden. Bitte erneut versuchen." 
        });
      }

      const savedContract = data[0];

      // Renter-Name im Verleihdatensatz synchronisieren falls sinnvoll
      const fullName = `${contractPayload.first_name} ${contractPayload.last_name}`;
      await supabase
        .from('hockey_rentals')
        .update({ renter_name: fullName })
        .eq('id', rentalId);

      // Datenschutz: Niemals IBAN, Anschrift, Telefon, E-Mail oder Signaturdaten loggen!
      console.log(`[Contract Saved]: Rental ${rentalId}, Status: ${savedContract.status}, Items: ${equipmentSnapshot.length}`);

      res.json({ 
        success: true, 
        contract: savedContract
      });
    } catch (err: any) {
      console.error(`[Contract Save Exception]: Rental ${rentalId} - ${err.message}`);
      res.status(500).json({ 
        success: false, 
        message: "Der Vertrag konnte nicht dauerhaft gespeichert werden. Bitte erneut versuchen." 
      });
    }
  });

  // Rate-Limiting für öffentliche Endpunkte (Schutz vor Missbrauch und Brute-Force)
  const publicRateLimitMap = new Map<string, { count: number; resetAt: number }>();
  const checkRateLimit = (ip: string, maxRequests = 30, windowMs = 60000): boolean => {
    const now = Date.now();
    const record = publicRateLimitMap.get(ip);
    if (!record || now > record.resetAt) {
      publicRateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (record.count >= maxRequests) {
      return false;
    }
    record.count++;
    return true;
  };

  // Gemeinsame sichere Backend-Finalisierung für Vertragsunterzeichnung (Phase 2 & externer Link)
  async function finalizeContractSigning(
    rentalId: number,
    signature_data: string,
    signer_name: string
  ): Promise<{ success: boolean; status?: number; message?: string; contract?: any; pdf_path?: string }> {
    const supabase = getSupabase();

    // 1. Signaturdaten prüfen (darf nicht leer sein)
    if (!signature_data || typeof signature_data !== 'string' || !signature_data.startsWith('data:image/png;base64,')) {
      return {
        success: false,
        status: 400,
        message: "Bitte eine gültige Unterschrift zeichnen."
      };
    }

    // Leere Leinwand abfangen (Base64-Payload muss substanziell sein)
    const base64Data = signature_data.replace(/^data:image\/png;base64,/, '');
    if (base64Data.length < 200) {
      return {
        success: false,
        status: 400,
        message: "Die Unterschrift ist unvollständig oder leer. Bitte erneut unterschreiben."
      };
    }

    try {
      // 2. Rental aus der Datenbank laden
      const { data: rental, error: rError } = await supabase
        .from('hockey_rentals')
        .select(`
          id, renter_name, rented_at, due_date, returned_at, fee_total, paid,
          hockey_rental_items(
            item_id, returned_at,
            hockey_equipment_items(id, item_code, brand, size, category, category_label)
          )
        `)
        .eq('id', rentalId)
        .single();

      if (rError || !rental) {
        return { success: false, status: 404, message: "Ausleihe nicht gefunden." };
      }

      // 3. Vorhandenen Vertrag laden
      const { data: contract, error: cError } = await supabase
        .from('hockey_rental_contracts')
        .select('*')
        .eq('rental_id', rentalId)
        .maybeSingle();

      if (cError || !contract) {
        return {
          success: false,
          status: 404,
          message: "Kein Vertragsentwurf vorhanden. Bitte zuerst die Vertragsdaten erfassen und speichern."
        };
      }

      // Eindeutige Prüfung: Ein bereits unterschriebener Vertrag darf nicht überschrieben werden
      if (contract.status === 'signed') {
        return {
          success: false,
          status: 409,
          message: "Dieser Vertrag wurde bereits verbindlich abgeschlossen und unterschrieben."
        };
      }

      // 4. Frischer Equipment-Snapshot serverseitig direkt aus der DB
      const rItems = (rental.hockey_rental_items || [])
        .filter((ri: any) => !ri.returned_at)
        .map((ri: any) => ri.hockey_equipment_items)
        .filter(Boolean);

      const equipmentSnapshot = rItems.map((eq: any) => ({
        id: eq.id,
        item_code: eq.item_code,
        category: eq.category,
        category_label: eq.category_label || eq.category,
        brand: eq.brand,
        size: eq.size
      }));

      // 5. Vertragstext-Snapshot erzeugen (vollständige, unveränderliche Version)
      const contractSnapshot = createContractSnapshot();
      const signedAt = new Date().toISOString();
      const effectiveSignerName = (signer_name || `${contract.first_name} ${contract.last_name}`).trim();

      // 6. Finales PDF erzeugen
      const contractForPdf = {
        ...contract,
        signer_name: effectiveSignerName,
        signed_at: signedAt,
        signature_data: signature_data,
        equipment_snapshot: equipmentSnapshot,
        contract_snapshot: contractSnapshot
      };

      let pdfBytes: Uint8Array;
      try {
        pdfBytes = await generateContractPdf({
          rentalId,
          contract: contractForPdf,
          rental: {
            id: rental.id,
            rented_at: rental.rented_at,
            due_date: rental.due_date
          }
        });
      } catch (pdfErr: any) {
        console.error(`[PDF Generation Error]: Rental ${rentalId} - ${pdfErr.message}`);
        return {
          success: false,
          status: 500,
          message: "Fehler beim Erzeugen des Vertrags-PDFs. Bitte erneut versuchen."
        };
      }

      // 7. Sichere Speicherung im privaten Supabase-Storage (hockey-contracts)
      const timestamp = Date.now();
      const storagePath = `contracts/${rentalId}/contract_${rentalId}_${timestamp}.pdf`;
      const pdfBuffer = Buffer.from(pdfBytes);

      try {
        await supabase.storage.createBucket('hockey-contracts', { public: false });
      } catch {}

      const { error: uploadError } = await supabase
        .storage
        .from('hockey-contracts')
        .upload(storagePath, pdfBuffer, {
          contentType: 'application/pdf',
          upsert: true
        });

      if (uploadError) {
        console.error(`[Storage Upload Error]: Rental ${rentalId} - ${uploadError.message}`);
        return {
          success: false,
          status: 500,
          message: "Das Vertrags-PDF konnte nicht im sicheren Speicher abgelegt werden. Der Vertrag wurde nicht abgeschlossen."
        };
      }

      // 8. Vertragsdaten in der Datenbank ATOMAR von 'draft' auf 'signed' setzen
      // Gleichzeitig wird der signing_token_hash gelöscht, sodass der Link sofort ungültig wird!
      const updatePayload: any = {
        status: 'signed',
        signed_at: signedAt,
        signer_name: effectiveSignerName,
        signature_data: signature_data,
        pdf_path: storagePath,
        pdf_url: null, // Private Speicherung - niemals öffentliche URL!
        equipment_snapshot: equipmentSnapshot,
        contract_snapshot: contractSnapshot,
        contract_version: CURRENT_CONTRACT_VERSION,
        signing_token_hash: null,
        signing_token_expires_at: null,
        updated_at: signedAt
      };

      const { data: updatedData, error: updateError } = await supabase
        .from('hockey_rental_contracts')
        .update(updatePayload)
        .eq('rental_id', rentalId)
        .eq('status', 'draft')
        .select();

      // Fall A: Technischer Datenbankfehler
      if (updateError) {
        console.error(`[Contract Sign DB Error]: Rental ${rentalId} - ${updateError.message}`);
        try {
          await supabase.storage.from('hockey-contracts').remove([storagePath]);
        } catch {}
        return {
          success: false,
          status: 500,
          message: "Der Status des Vertrags konnte in der Datenbank nicht aktualisiert werden."
        };
      }

      // Fall B: Race Condition / Vertrag nicht mehr im Status 'draft'
      if (!updatedData || updatedData.length === 0) {
        console.warn(`[Contract Sign Conflict]: Rental ${rentalId} - Vertrag wurde bereits durch einen parallelen Vorgang abgeschlossen.`);
        try {
          const { data: existingContract } = await supabase
            .from('hockey_rental_contracts')
            .select('pdf_path')
            .eq('rental_id', rentalId)
            .maybeSingle();

          if (!existingContract || existingContract.pdf_path !== storagePath) {
            await supabase.storage.from('hockey-contracts').remove([storagePath]);
          }
        } catch {}

        return {
          success: false,
          status: 409,
          message: "Dieser Vertrag wurde bereits durch einen parallelen Vorgang verbindlich abgeschlossen."
        };
      }

      const finalizedContract = updatedData[0];
      console.log(`[Contract Finalized]: Rental ${rentalId}, Version: ${CURRENT_CONTRACT_VERSION}`);

      return {
        success: true,
        contract: finalizedContract,
        pdf_path: storagePath
      };
    } catch (err: any) {
      console.error(`[Contract Sign Exception]: Rental ${rentalId} - ${err.message}`);
      return {
        success: false,
        status: 500,
        message: "Unerwarteter Fehler beim Abschließen des Vertrags."
      };
    }
  }

  // POST /api/rentals/:id/contract/sign - Vertrag im Adminbereich verbindlich abschließen (Phase 2)
  app.post("/api/rentals/:id/contract/sign", authHeader, async (req, res) => {
    const rentalId = Number(req.params.id);
    const { signature_data, signer_name } = req.body;
    const result = await finalizeContractSigning(rentalId, signature_data, signer_name);
    if (!result.success) {
      return res.status(result.status || 500).json({ success: false, message: result.message });
    }
    res.json({
      success: true,
      contract: result.contract,
      pdf_path: result.pdf_path
    });
  });

  // POST /api/rentals/:id/contract/signing-link - Sicheren individuellen Signing-Token erzeugen
  app.post("/api/rentals/:id/contract/signing-link", authHeader, async (req, res) => {
    try {
      const supabase = getSupabase();
      const rentalId = Number(req.params.id);

      // 1. Ausleihe prüfen
      const { data: rental, error: rErr } = await supabase
        .from('hockey_rentals')
        .select('id, renter_name, fee_total')
        .eq('id', rentalId)
        .single();

      if (rErr || !rental) {
        return res.status(404).json({ success: false, message: "Ausleihe nicht gefunden." });
      }

      // 2. Bestehenden Vertrag prüfen
      const { data: contract } = await supabase
        .from('hockey_rental_contracts')
        .select('id, rental_id, status')
        .eq('rental_id', rentalId)
        .maybeSingle();

      if (contract && contract.status === 'signed') {
        return res.status(400).json({
          success: false,
          message: "Dieser Vertrag ist bereits verbindlich unterschrieben. Es kann kein neuer Link erzeugt werden."
        });
      }

      // 3. Kryptografisch sicheren 32-Byte Zufallstoken erzeugen (64 Hex-Zeichen)
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      // Standardmäßig 7 Tage gültig
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      if (!contract) {
        // Neuen Entwurf anlegen, falls noch keiner existiert
        const nameParts = (rental.renter_name || '').trim().split(' ');
        const fName = nameParts[0] || '';
        const lName = nameParts.slice(1).join(' ') || '';
        const initialPayload = {
          rental_id: rentalId,
          first_name: fName,
          last_name: lName,
          child_name: '',
          street: '',
          house_number: '',
          postal_code: '',
          city: '',
          phone: '',
          email: '',
          iban: '',
          deposit_amount: 50.00,
          fee_amount: rental.fee_total !== undefined ? Number(rental.fee_total) : 60.00,
          status: 'draft',
          signing_token_hash: tokenHash,
          signing_token_expires_at: expiresAt,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        const { error: insErr } = await supabase
          .from('hockey_rental_contracts')
          .insert(initialPayload);

        if (insErr) {
          return res.status(500).json({ success: false, message: "Fehler beim Anlegen des Vertragsentwurfs." });
        }
      } else {
        // Bestehenden Entwurf mit neuem Token-Hash & Ablaufdatum aktualisieren (überschreibt vorherigen Link)
        const { error: updErr } = await supabase
          .from('hockey_rental_contracts')
          .update({
            signing_token_hash: tokenHash,
            signing_token_expires_at: expiresAt,
            updated_at: new Date().toISOString()
          })
          .eq('rental_id', rentalId);

        if (updErr) {
          return res.status(500).json({ success: false, message: "Fehler beim Aktualisieren des Signier-Links." });
        }
      }

      console.log(`[Signing Link Created]: Rental ${rentalId}`);
      res.json({
        success: true,
        token: rawToken,
        expires_at: expiresAt
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // GET /api/public/contract - Öffentliche Vertragsdaten für Entleiher via sicherem Token laden
  app.get("/api/public/contract", async (req, res) => {
    const ip = (req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
    if (!checkRateLimit(ip)) {
      return res.status(429).json({ success: false, message: "Zu viele Anfragen. Bitte versuchen Sie es später erneut." });
    }

    const rawToken = typeof req.query.token === 'string' ? req.query.token.trim() : '';
    if (!rawToken || rawToken.length < 16) {
      return res.status(404).json({ success: false, message: "Dieser Vertragslink ist nicht mehr gültig." });
    }

    try {
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const supabase = getSupabase();

      const { data: contract, error: cErr } = await supabase
        .from('hockey_rental_contracts')
        .select('*')
        .eq('signing_token_hash', tokenHash)
        .maybeSingle();

      if (cErr || !contract) {
        return res.status(404).json({ success: false, message: "Dieser Vertragslink ist nicht mehr gültig." });
      }

      if (contract.status === 'signed') {
        return res.status(410).json({ success: false, message: "Dieser Vertragslink ist nicht mehr gültig." });
      }

      if (contract.signing_token_expires_at && new Date(contract.signing_token_expires_at).getTime() < Date.now()) {
        return res.status(410).json({ success: false, message: "Dieser Vertragslink ist nicht mehr gültig." });
      }

      // Rental und zugehörige aktive Items laden
      const { data: rental, error: rErr } = await supabase
        .from('hockey_rentals')
        .select(`
          id, renter_name, rented_at, due_date, fee_total,
          hockey_rental_items(
            item_id, returned_at,
            hockey_equipment_items(id, item_code, brand, size, category, category_label)
          )
        `)
        .eq('id', contract.rental_id)
        .single();

      if (rErr || !rental) {
        return res.status(404).json({ success: false, message: "Ausleihe zu diesem Vertrag wurde nicht gefunden." });
      }

      const rItems = (rental.hockey_rental_items || [])
        .filter((ri: any) => !ri.returned_at)
        .map((ri: any) => ri.hockey_equipment_items)
        .filter(Boolean);

      const equipment = rItems.map((eq: any) => ({
        id: eq.id,
        item_code: eq.item_code,
        category: eq.category,
        category_label: eq.category_label || eq.category,
        brand: eq.brand,
        size: eq.size
      }));

      // Rückgabe NUR der für den Vertrag notwendigen Daten (kein Zugriff auf andere Daten, keine Tokens)
      res.json({
        success: true,
        contract: {
          first_name: contract.first_name || '',
          last_name: contract.last_name || '',
          child_name: contract.child_name || '',
          street: contract.street || '',
          house_number: contract.house_number || '',
          postal_code: contract.postal_code || '',
          city: contract.city || '',
          phone: contract.phone || '',
          email: contract.email || '',
          iban: contract.iban || '',
          fee_amount: contract.fee_amount !== undefined ? Number(contract.fee_amount) : (rental.fee_total || 60.00),
          deposit_amount: contract.deposit_amount !== undefined ? Number(contract.deposit_amount) : 50.00,
          status: contract.status
        },
        rental: {
          id: rental.id,
          rented_at: rental.rented_at,
          due_date: rental.due_date,
          fee_total: rental.fee_total
        },
        equipment,
        expires_at: contract.signing_token_expires_at
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: "Fehler beim Laden des Vertrags." });
    }
  });

  // POST /api/public/contract/update - Entleiher darf persönliche Daten vor Unterschrift ergänzen/korrigieren
  app.post("/api/public/contract/update", async (req, res) => {
    const ip = (req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
    if (!checkRateLimit(ip)) {
      return res.status(429).json({ success: false, message: "Zu viele Anfragen. Bitte versuchen Sie es später erneut." });
    }

    const {
      token: rawToken,
      first_name,
      last_name,
      child_name,
      street,
      house_number,
      postal_code,
      city,
      phone,
      email,
      iban
    } = req.body;

    if (!rawToken || typeof rawToken !== 'string') {
      return res.status(404).json({ success: false, message: "Dieser Vertragslink ist nicht mehr gültig." });
    }

    try {
      const tokenHash = crypto.createHash('sha256').update(rawToken.trim()).digest('hex');
      const supabase = getSupabase();

      const { data: contract, error: cErr } = await supabase
        .from('hockey_rental_contracts')
        .select('id, rental_id, status, signing_token_expires_at')
        .eq('signing_token_hash', tokenHash)
        .maybeSingle();

      if (cErr || !contract || contract.status !== 'draft') {
        return res.status(410).json({ success: false, message: "Dieser Vertragslink ist nicht mehr gültig." });
      }

      if (contract.signing_token_expires_at && new Date(contract.signing_token_expires_at).getTime() < Date.now()) {
        return res.status(410).json({ success: false, message: "Dieser Vertragslink ist nicht mehr gültig." });
      }

      // Validierung der Pflichtfelder
      if (!first_name?.trim() || !last_name?.trim() || !child_name?.trim()) {
        return res.status(400).json({ success: false, message: "Bitte Vorname, Nachname und Name des Kindes angeben." });
      }
      if (!street?.trim() || !house_number?.trim() || !postal_code?.trim() || !city?.trim()) {
        return res.status(400).json({ success: false, message: "Bitte die Anschrift vollständig angeben (Straße, Hausnr., PLZ, Ort)." });
      }
      if (!phone?.trim()) {
        return res.status(400).json({ success: false, message: "Bitte eine Telefonnummer angeben." });
      }
      const cleanEmail = (email || '').trim();
      if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return res.status(400).json({ success: false, message: "Bitte eine gültige E-Mail-Adresse angeben." });
      }
      const cleanIban = (iban || '').replace(/\s+/g, '').toUpperCase();
      if (cleanIban.length < 15 || !/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(cleanIban)) {
        return res.status(400).json({ success: false, message: "Bitte eine gültige IBAN angeben (mind. 15 Stellen, z. B. DE...)." });
      }

      // Ausschließlich persönliche Daten dürfen aktualisiert werden (Equipment, Gebühr, Kaution etc. bleiben geschützt)
      const updateFields = {
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        child_name: child_name.trim(),
        street: street.trim(),
        house_number: house_number.trim(),
        postal_code: postal_code.trim(),
        city: city.trim(),
        phone: phone.trim(),
        email: cleanEmail,
        iban: cleanIban,
        updated_at: new Date().toISOString()
      };

      const { error: uErr } = await supabase
        .from('hockey_rental_contracts')
        .update(updateFields)
        .eq('id', contract.id)
        .eq('status', 'draft');

      if (uErr) {
        return res.status(500).json({ success: false, message: "Fehler beim Speichern der Vertragsdaten." });
      }

      // Name des Entleihers auch in hockey_rentals synchronisieren
      try {
        const fullName = `${updateFields.first_name} ${updateFields.last_name}`;
        await supabase.from('hockey_rentals').update({ renter_name: fullName }).eq('id', contract.rental_id);
      } catch {}

      res.json({
        success: true,
        contract: updateFields
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: "Fehler beim Speichern der Vertragsdaten." });
    }
  });

  // POST /api/public/contract/sign - Entleiher signiert Vertrag verbindlich über den Sicherheits-Link
  app.post("/api/public/contract/sign", async (req, res) => {
    const ip = (req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
    if (!checkRateLimit(ip)) {
      return res.status(429).json({ success: false, message: "Zu viele Anfragen. Bitte versuchen Sie es später erneut." });
    }

    const { token: rawToken, signature_data, signer_name } = req.body;

    if (!rawToken || typeof rawToken !== 'string') {
      return res.status(404).json({ success: false, message: "Dieser Vertragslink ist nicht mehr gültig." });
    }

    try {
      const tokenHash = crypto.createHash('sha256').update(rawToken.trim()).digest('hex');
      const supabase = getSupabase();

      const { data: contract, error: cErr } = await supabase
        .from('hockey_rental_contracts')
        .select('id, rental_id, status, signing_token_expires_at')
        .eq('signing_token_hash', tokenHash)
        .maybeSingle();

      if (cErr || !contract || contract.status !== 'draft') {
        return res.status(410).json({ success: false, message: "Dieser Vertragslink ist nicht mehr gültig." });
      }

      if (contract.signing_token_expires_at && new Date(contract.signing_token_expires_at).getTime() < Date.now()) {
        return res.status(410).json({ success: false, message: "Dieser Vertragslink ist nicht mehr gültig." });
      }

      // Wiederverwendung der sicheren bestehenden Signierlogik!
      const result = await finalizeContractSigning(contract.rental_id, signature_data, signer_name);
      if (!result.success) {
        return res.status(result.status || 500).json({ success: false, message: result.message });
      }

      // Nach Abschluss: einfache Bestätigung, keine sensiblen Daten zurücksenden
      res.json({
        success: true,
        message: "Vielen Dank. Der Vertrag wurde erfolgreich unterschrieben."
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: "Fehler beim Abschließen des Vertrags." });
    }
  });

  // GET /api/rentals/:id/contract/pdf - Signiertes Vertrags-PDF geschützt abrufen
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
        if (contract.contract_snapshot) {
          const { data: rental } = await supabase
            .from('hockey_rentals')
            .select('id, rented_at, due_date')
            .eq('id', rentalId)
            .single();

          const pdfBytes = await generateContractPdf({
            rentalId,
            contract,
            rental: rental || { id: rentalId, rented_at: contract.created_at, due_date: null }
          });
          
          // Re-upload ins Storage
          try {
            await supabase.storage.from('hockey-contracts').upload(storagePath, Buffer.from(pdfBytes), { upsert: true });
          } catch {}

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

  app.delete("/api/items/:id", authHeader, async (req, res) => {
    try {
      const supabase = getSupabase();
      const { id } = req.params;

      const { data: riData, error: checkError } = await supabase
        .from('hockey_rental_items')
        .select('id')
        .eq('item_id', id);

      if (checkError) throw checkError;
      
      if (riData && riData.length > 0) {
        const { error: updateError } = await supabase
          .from('hockey_equipment_items')
          .update({ 
            is_deleted: true,
            status: 'ausgemustert'
          })
          .eq('id', id);

        if (updateError) throw updateError;
        
        console.log(`[Item Soft-Deleted]: ID ${id} (kept for history)`);
        return res.json({ success: true, message: "Item wurde ausgemustert und aus dem Bestand entfernt. Die Historie bleibt erhalten." });
      }

      const { error } = await supabase
        .from('hockey_equipment_items')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      console.log(`[Item Hard-Deleted]: ID ${id}`);
      res.json({ success: true });
    } catch (err: any) {
      console.error(`[Item Deletion Error]: ${err.message}`);
      res.status(500).json({ success: false, message: "Fehler beim Löschen des Items." });
    }
  });

  app.delete("/api/rentals/:id", authHeader, async (req, res) => {
    try {
      const supabase = getSupabase();
      const { id } = req.params;

      const { data: riData, error: riError } = await supabase
        .from('hockey_rental_items')
        .select('item_id, returned_at')
        .eq('rental_id', id);

      if (riError) throw riError;
      
      const activeItemIds = riData?.filter((ri: any) => !ri.returned_at).map((ri: any) => ri.item_id) || [];

      const { data: rentalData, error: rentalFetchError } = await supabase
        .from('hockey_rentals')
        .select('returned_at')
        .eq('id', id)
        .single();

      if (rentalFetchError) throw rentalFetchError;

      if (!rentalData.returned_at && activeItemIds.length > 0) {
        const { error: itemUpdateError } = await supabase
          .from('hockey_equipment_items')
          .update({ status: 'verfügbar' })
          .in('id', activeItemIds);
          
        if (itemUpdateError) throw itemUpdateError;
      }

      const { error: riDeleteError } = await supabase
        .from('hockey_rental_items')
        .delete()
        .eq('rental_id', id);

      if (riDeleteError) throw riDeleteError;

      const { error } = await supabase
        .from('hockey_rentals')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      console.log(`[Rental Deleted]: ID ${id}`);
      res.json({ success: true });
    } catch (err: any) {
      console.error(`[Rental Deletion Error]: ${err.message}`);
      res.status(500).json({ success: false, message: "Fehler beim Löschen des Verleih-Eintrags." });
    }
  });

  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }

  return app;
}

const appPromise = startServer();

export default async function handler(req: any, res: any) {
  const app = await appPromise;
  return app(req, res);
}

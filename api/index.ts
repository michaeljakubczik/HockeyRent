import express from "express";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import { createServer as createViteServer } from "vite";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
        .from('equipment_items')
        .select('id, item_code, category, category_label, size, brand, image')
        .eq('status', 'verfügbar')
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
        .from('equipment_items')
        .select(`
          *,
          rental_items(
            rentals(*)
          )
        `)
        .order('id', { ascending: false });

      if (error) return res.status(500).json({ error: error.message });

      const transformed = data.map(item => {
        const activeRentalItem = item.rental_items?.find((ri: any) => ri.rentals && !ri.rentals.returned_at);
        const activeRental = activeRentalItem?.rentals;
        
        return {
          ...item,
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
      
      // Generate item_code reliably
      // We use a retry mechanism or a more robust check
      let item_code = '';
      let nextNumber = 1;
      let unique = false;
      let attempts = 0;

      while (!unique && attempts < 5) {
        const { data: lastItems, error: fetchError } = await supabase
          .from('equipment_items')
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
        
        // Check if this code exists (to handle concurrent requests better)
        const { count, error: countError } = await supabase
          .from('equipment_items')
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
        .from('equipment_items')
        .insert([{ 
          category,
          category_label,
          size, 
          brand, 
          item_code,
          image: image || null, 
          condition_note: condition_note || null,
          status: 'verfügbar'
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
        .from('equipment_items')
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

  app.post("/api/rentals", authHeader, async (req, res) => {
    const supabase = getSupabase();
    let rentalId: number | null = null;
    
    try {
      const { renter_name, rented_at, paid, fee_total, note, item_ids } = req.body;
      
      if (!item_ids || !Array.isArray(item_ids) || item_ids.length === 0) {
        return res.status(400).json({ success: false, message: "Keine Items ausgewählt" });
      }

      if (!renter_name) {
        return res.status(400).json({ success: false, message: "Name des Ausleihers fehlt" });
      }

      // 0. Verify availability of ALL items
      const { data: items, error: checkError } = await supabase
        .from('equipment_items')
        .select('id, status, item_code')
        .in('id', item_ids);

      if (checkError) throw checkError;
      
      const unavailable = items?.filter(i => i.status !== 'verfügbar');
      if (unavailable && unavailable.length > 0) {
        const codes = unavailable.map(i => i.item_code).join(', ');
        return res.status(400).json({ 
          success: false, 
          message: `Einige Items sind bereits verliehen: ${codes}` 
        });
      }

      const rental_type = item_ids.length > 1 ? 'bundle' : 'single';

      // 1. Create rental record
      const { data: rentalData, error: rentalError } = await supabase
        .from('rentals')
        .insert([{
          renter_name,
          rented_at,
          paid: !!paid,
          fee_total: parseFloat(fee_total) || 0,
          note: note || null,
          rental_type
        }])
        .select();

      if (rentalError) throw rentalError;
      rentalId = rentalData[0].id;

      // 2. Create rental_items links
      const rentalItems = item_ids.map(itemId => ({
        rental_id: rentalId,
        item_id: itemId
      }));

      const { error: riError } = await supabase
        .from('rental_items')
        .insert(rentalItems);

      if (riError) {
        // Rollback rental record
        await supabase.from('rentals').delete().eq('id', rentalId);
        throw riError;
      }

      // 3. Update items status
      const { error: itemError } = await supabase
        .from('equipment_items')
        .update({ status: 'verliehen' })
        .in('id', item_ids);

      if (itemError) {
        // Rollback rental and rental_items
        await supabase.from('rental_items').delete().eq('rental_id', rentalId);
        await supabase.from('rentals').delete().eq('id', rentalId);
        throw itemError;
      }
      
      console.log(`[Rental Created]: ID ${rentalId} for ${renter_name} (${item_ids.length} items)`);
      res.json({ success: true, rentalId });
    } catch (err: any) {
      console.error(`[Rental Creation Error]: ${err.message}`);
      res.status(500).json({ success: false, message: "Fehler beim Erstellen des Verleihs." });
    }
  });

  app.post("/api/rentals/:id/return", authHeader, async (req, res) => {
    const supabase = getSupabase();
    const { id } = req.params;
    
    try {
      const returned_at = new Date().toISOString().split('T')[0];
      
      // 1. Get all items in this rental
      const { data: riData, error: riError } = await supabase
        .from('rental_items')
        .select('item_id')
        .eq('rental_id', id);

      if (riError) throw riError;
      
      if (!riData || riData.length === 0) {
        return res.status(404).json({ success: false, message: "Keine Items für diesen Verleih gefunden." });
      }

      const itemIds = riData.map((ri: any) => ri.item_id);

      // 2. Update items status to available
      const { error: itemError } = await supabase
        .from('equipment_items')
        .update({ status: 'verfügbar' })
        .in('id', itemIds);

      if (itemError) throw itemError;

      // 3. Update rental record with return date
      const { error: rentalError } = await supabase
        .from('rentals')
        .update({ returned_at })
        .eq('id', id);

      if (rentalError) {
        // Attempt to revert item status if rental update fails
        await supabase.from('equipment_items').update({ status: 'verliehen' }).in('id', itemIds);
        throw rentalError;
      }
      
      console.log(`[Rental Returned]: ID ${id} on ${returned_at}`);
      res.json({ success: true, returned_at });
    } catch (err: any) {
      console.error(`[Rental Return Error]: ${err.message}`);
      res.status(500).json({ success: false, message: "Fehler bei der Rückgabe des Equipments." });
    }
  });

  app.patch("/api/rentals/:id/paid", authHeader, async (req, res) => {
    try {
      const supabase = getSupabase();
      const { id } = req.params;
      const { error } = await supabase
        .from('rentals')
        .update({ paid: true })
        .eq('id', id);

      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) {
      console.error(`[Rental Paid Update Error]: ${err.message}`);
      res.status(500).json({ success: false, message: "Fehler beim Markieren als bezahlt." });
    }
  });

  app.get("/api/history", authHeader, async (req, res) => {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('rentals')
        .select(`
          *,
          rental_items(
            equipment_items(*)
          )
        `)
        .order('rented_at', { ascending: false });

      if (error) return res.status(500).json({ error: error.message });

      const transformed = data.map(rental => ({
        ...rental,
        items: rental.rental_items?.map((ri: any) => ri.equipment_items) || []
      }));

      res.json(transformed);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/items/:id", authHeader, async (req, res) => {
    try {
      const supabase = getSupabase();
      const { id } = req.params;

      // 1. Check if item is in any rental_items
      const { count, error: checkError } = await supabase
        .from('rental_items')
        .select('id', { count: 'exact', head: true })
        .eq('item_id', id);

      if (checkError) throw checkError;
      
      if (count && count > 0) {
        return res.status(400).json({ 
          success: false, 
          message: "Dieses Item kann nicht gelöscht werden, da es in der Verleih-Historie existiert." 
        });
      }

      const { error } = await supabase
        .from('equipment_items')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      console.log(`[Item Deleted]: ID ${id}`);
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

      // 1. Get all items in this rental
      const { data: riData, error: riError } = await supabase
        .from('rental_items')
        .select('item_id')
        .eq('rental_id', id);

      if (riError) throw riError;
      
      const itemIds = riData?.map((ri: any) => ri.item_id) || [];

      // 2. If rental was active (not returned), set items back to available
      const { data: rentalData, error: rentalFetchError } = await supabase
        .from('rentals')
        .select('returned_at')
        .eq('id', id)
        .single();

      if (rentalFetchError) throw rentalFetchError;

      if (!rentalData.returned_at && itemIds.length > 0) {
        const { error: itemUpdateError } = await supabase
          .from('equipment_items')
          .update({ status: 'verfügbar' })
          .in('id', itemIds);
        
        if (itemUpdateError) throw itemUpdateError;
      }

      // 3. Delete rental_items (cascade delete might be set in DB, but let's be explicit if not)
      const { error: riDeleteError } = await supabase
        .from('rental_items')
        .delete()
        .eq('rental_id', id);

      if (riDeleteError) throw riDeleteError;

      // 4. Delete rental record
      const { error } = await supabase
        .from('rentals')
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

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  return app;
}

const appPromise = startServer();

export default async function handler(req: any, res: any) {
  const app = await appPromise;
  return app(req, res);
}

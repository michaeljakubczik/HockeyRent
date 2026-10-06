import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../api/index.js';
import { hydrateRentalImages } from '../src/rentalImages.js';
import type { EquipmentItem, Rental } from '../src/types.js';

test('authenticated inventory/history load transfers large photos only in inventory', async () => {
  const photo = 'data:image/png;base64,' + 'a'.repeat(435000);
  const item = { id: 1, item_code: 'H1', brand: 'Test', image: photo };
  const rental = { id: 11, renter_name: 'Dummy', returned_at: null,
    hockey_rental_items: [{ id: 1, item_id: 1, rental_id: 11, returned_at: null }] };
  const supabase = {
    rpc: async (name: string) => ({ data: name === 'hockey_inventory_read' ? [item] : true, error: null }),
    from: (table: string) => {
      let selection = '';
      const builder = {
        select: (value: string) => { selection = value; return builder; },
        eq: () => builder,
        in: () => builder,
        order: () => builder,
        range: async () => {
          if (table === 'hockey_equipment_items') return { data: [item], error: null };
          if (table === 'hockey_rental_contracts') return { data: [], error: null };
          // Emulate PostgREST applying the requested nested equipment projection.
          const nested = selection.match(/hockey_equipment_items\(([^)]*)\)/)?.[1] || '';
          const equipment = nested.includes('*') || nested.split(',').includes('image')
            ? item : { id: item.id, item_code: item.item_code, brand: item.brand };
          return { data: [{ ...rental, hockey_rental_items: rental.hockey_rental_items.map(
            record => ({ ...record, hockey_equipment_items: equipment })) }], error: null };
        }
      };
      return builder;
    }
  };
  const api = request(await createApp({ supabase, password: 'test-password' }));
  const login = await api.post('/api/login').send({ password: 'test-password' }).expect(200);
  const inventory = await api.get('/api/items').set('x-admin-password', login.body.token).expect(200);
  const history = await api.get('/api/history').set('x-admin-password', login.body.token).expect(200);
  assert.equal(inventory.body[0].image, photo);
  assert.ok(Buffer.byteLength(history.text) < 10000, 'History must not multiply base64 photos');
  assert.equal(history.body[0].items[0].image, undefined);
  const hydrated = hydrateRentalImages(history.body, inventory.body)[0];
  assert.equal(hydrated.items?.[0].image, photo);
  assert.equal(hydrated.active_items?.[0].image, photo);
  assert.equal(hydrated.all_items?.[0].image, photo);
  assert.equal(hydrated.all_rental_items?.[0].item?.image, photo);
});

test('hydration preserves history metadata and handles equipment absent from inventory', () => {
  const historical = { id: 1, brand: 'Historical', image: null } as EquipmentItem;
  const missing = { id: 2, brand: 'Deleted', image: null } as EquipmentItem;
  const rentals = [{ id: 11, items: [historical, missing] }] as Rental[];
  const hydrated = hydrateRentalImages(rentals, [{ id: 1, brand: 'Current', image: 'photo' } as EquipmentItem]);
  assert.equal(hydrated[0].items?.[0].brand, 'Historical');
  assert.equal(hydrated[0].items?.[0].image, 'photo');
  assert.equal(hydrated[0].items?.[1].image, null);
  assert.equal(rentals[0].items?.[0].image, null);
});

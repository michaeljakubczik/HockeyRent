import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { database } from './database.js';
import { createApp } from '../api/index.js';
import { photoDimensions, compressEquipmentPhoto } from '../src/equipmentPhoto.js';

test('portrait, landscape and small photos keep their proportions and fit within 800 px', async () => {
  assert.deepEqual(photoDimensions(3000, 6000), { width: 400, height: 800 });
  assert.deepEqual(photoDimensions(6000, 3000), { width: 800, height: 400 });
  assert.deepEqual(photoDimensions(320, 240), { width: 320, height: 240 });
  await assert.rejects(compressEquipmentPhoto({ type: 'application/pdf', size: 200 } as File), /Bilddatei/);
  await assert.rejects(compressEquipmentPhoto({ type: 'image/jpeg', size: 21 * 1024 * 1024 } as File), /20 MB/);
});

test('paged history preserves global totals, all open rentals and inventory counters without transferring old relationships', async () => {
  const db = await database();
  try {
    await db.exec(`insert into hockey_equipment_items(id,item_code,category,category_label,brand,size,image)
      values (1,'H1','Helm','Helm','Test','S','original-photo');
      insert into hockey_rentals(id,renter_name,rented_at,returned_at,paid,fee_total)
      select n,'Test '||n,'2026-01-01',case when n<=70 then '2026-02-01'::date else null end,n%2=0,60 from generate_series(1,72) n;
      insert into hockey_rental_items(rental_id,item_id,returned_at)
      select n,1,'2026-02-01' from generate_series(1,70) n;
      insert into hockey_rental_items(rental_id,item_id) values (72,1);`);
    const calls: { table: string; ids?: number[]; from: number; to: number }[] = [];
    const supabase = {
      rpc: async (name: string) => ({ data: name === 'hockey_rate_limit' ? true :
        (await db.query<any>(`select ${name}() value`)).rows[0].value, error: null }),
      from: (table: string) => {
        let status: 'active' | 'completed' | null = null;
        let ids: number[] | undefined;
        const builder = {
          select: () => builder,
          order: () => builder,
          is: () => { status = 'active'; return builder; },
          not: () => { status = 'completed'; return builder; },
          in: (_key: string, values: number[]) => { ids = values; return builder; },
          range: async (from: number, to: number) => {
            calls.push({ table, ids, from, to });
            if (table === 'hockey_rental_contracts') return { data: [], error: null };
            const rows = (await db.query<any>(`select * from hockey_rentals ${status ? `where returned_at is ${status === 'completed' ? 'not ' : ''}null` : ''}
              order by rented_at desc,id desc limit $1 offset $2`, [to - from + 1, from])).rows;
            return { data: rows.map(r => ({ ...r, hockey_rental_items: [] })), error: null };
          }
        };
        return builder;
      }
    };
    const api = request(await createApp({ supabase, password: 'test-password' }));
    await api.get('/api/history?page=1').expect(401);
    const login = await api.post('/api/login').send({ password: 'test-password' }).expect(200);
    const get = (path: string) => api.get(path).set('x-admin-password', login.body.token);
    for (const value of ['0', '-1', '1.5', 'abc']) await get('/api/history?page=' + value).expect(400);
    const first = (await get('/api/history?page=1').expect(200)).body;
    assert.deepEqual(first.summary, { activeCount: 2, completedCount: 70, paidRevenue: 2160 });
    assert.equal(first.rentals.filter((r: any) => r.returned_at).length, 25);
    assert.deepEqual(first.rentals.filter((r: any) => !r.returned_at).map((r: any) => r.id), [72, 71]);
    const second = (await get('/api/history?page=2').expect(200)).body;
    const firstIds = new Set(first.rentals.filter((r: any) => r.returned_at).map((r: any) => r.id));
    assert.ok(second.rentals.filter((r: any) => r.returned_at).every((r: any) => !firstIds.has(r.id)));
    const last = (await get('/api/history?page=999').expect(200)).body;
    assert.equal(last.page, 3);
    assert.equal(last.rentals.filter((r: any) => r.returned_at).length, 20);
    assert.equal(last.summary.paidRevenue, 2160);
    assert.ok(calls.filter(c => c.table === 'hockey_rental_contracts').every(c => c.ids && c.ids.length <= 27));
    const inventory = (await get('/api/items').expect(200)).body;
    assert.equal(inventory[0].rental_count, 71);
    assert.equal(inventory[0].active_rental_id, 72);
    assert.equal(inventory[0].image, 'original-photo');
    assert.equal(inventory[0].rental_items, undefined);
    for (const role of ['anon', 'authenticated']) {
      const access = (await db.query<any>(`select has_function_privilege($1,'hockey_history_summary()','execute') summary,
        has_function_privilege($1,'hockey_inventory_read()','execute') inventory`, [role])).rows[0];
      assert.deepEqual(access, { summary: false, inventory: false });
    }
  } finally { await db.close(); }
});

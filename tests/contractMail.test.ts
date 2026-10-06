import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import nodemailer from 'nodemailer';
import { createApp } from '../api/index.js';
import { configuredMailTransport, createContractMailer, MailFailure, type MailMessage } from '../server/contractMail.js';
import { database, seed, contract, fields } from './database.js';

async function fixture(email = 'parent@example.com') {
  const db = await database();
  const { rentalId } = await seed(db);
  await contract(db, 'save', rentalId, { ...fields, email });
  const pdf = Buffer.from('%PDF-1.7\nOriginal archived signed fixture');
  const hash = crypto.createHash('sha256').update(pdf).digest('hex');
  await db.query(`update hockey_rental_contracts set status='signed',signed_at=now(),pdf_path='archive.pdf',pdf_sha256=$1 where rental_id=$2`, [hash, rentalId]);
  let downloads = 0;
  const supabase = {
    rpc: async (name: string, args: any) => {
      try {
        const rows = name === 'hockey_contract_mail'
          ? await db.query<any>('select hockey_contract_mail($1,$2,$3,$4,$5::jsonb) result', [args.p_action, args.p_rental, args.p_job ?? null, args.p_token ?? null, JSON.stringify(args.p_data ?? {})])
          : await db.query<any>('select hockey_rate_limit($1,$2,$3) result', [args.p_key, args.p_limit, args.p_window]);
        return { data: rows.rows[0].result, error: null };
      } catch (error: any) { return { data: null, error: { message: error.message } }; }
    },
    storage: { from: () => ({ download: async () => { downloads++; return { data: new Blob([pdf]), error: null }; } }) }
  };
  return { db, rentalId, pdf, supabase, downloads: () => downloads };
}

test('email is fail-closed without explicit activation and complete provider configuration', () => {
  assert.equal(configuredMailTransport({}), null);
  assert.equal(configuredMailTransport({ RESEND_API_KEY: 'test' }), null);
  assert.equal(configuredMailTransport({ CONTRACT_MAIL_ENABLED: 'true', CONTRACT_MAIL_PROVIDER: 'resend' }), null);
  assert.equal(configuredMailTransport({ CONTRACT_MAIL_ENABLED: 'true', CONTRACT_MAIL_PROVIDER: 'smtp', CONTRACT_MAIL_FROM: 'valid@example.com', SMTP_PORT: '25' }), null);
  assert.equal(configuredMailTransport({ CONTRACT_MAIL_ENABLED: 'true', CONTRACT_MAIL_PROVIDER: 'resend', CONTRACT_MAIL_FROM: 'bad\r\n@example.com', RESEND_API_KEY: 'test' }), null);
});

test('Resend adapter submits only the archived PDF with a stable key and handles uncertain results', async () => {
  const original = globalThis.fetch;
  const message = { to: 'parent@example.com', subject: 'Contract', text: 'Copy', filename: 'contract.pdf', pdf: Buffer.from('PDF fixture'), idempotencyKey: 'stable-key' };
  const transport = configuredMailTransport({ CONTRACT_MAIL_ENABLED: 'true', CONTRACT_MAIL_PROVIDER: 'resend', CONTRACT_MAIL_FROM: 'sender@example.com', RESEND_API_KEY: 'mock-only' })!;
  try {
    globalThis.fetch = async (_url, options) => {
      const payload = JSON.parse(String(options?.body));
      assert.deepEqual(payload.to, ['parent@example.com']);
      assert.equal(payload.attachments[0].content, message.pdf.toString('base64'));
      assert.equal((options?.headers as any)['Idempotency-Key'], 'stable-key');
      return new Response(JSON.stringify({ id: 'accepted' }), { status: 200 });
    };
    assert.equal(await transport.send(message), 'accepted');
    globalThis.fetch = async () => new Response('{}', { status: 403 });
    await assert.rejects(transport.send(message), (error: any) => error instanceof MailFailure && !error.uncertain);
    globalThis.fetch = async () => { throw new Error('simulated network timeout'); };
    await assert.rejects(transport.send(message), (error: any) => error instanceof MailFailure && error.uncertain);
  } finally { globalThis.fetch = original; }
});

test('SMTP adapter requires encryption and supplies the archived attachment without exposing credentials', async () => {
  const original = nodemailer.createTransport;
  try {
    (nodemailer as any).createTransport = (options: any) => {
      assert.equal(options.port, 587);
      assert.equal(options.requireTLS, true);
      assert.equal(options.disableFileAccess, true);
      assert.equal(options.disableUrlAccess, true);
      return { close() {}, async sendMail(message: any) {
        assert.equal(message.to, 'parent@example.com');
        assert.equal(message.attachments[0].content.toString(), 'PDF fixture');
        return { accepted: ['parent@example.com'], messageId: 'accepted-smtp' };
      } };
    };
    const transport = configuredMailTransport({ CONTRACT_MAIL_ENABLED: 'true', CONTRACT_MAIL_PROVIDER: 'smtp', CONTRACT_MAIL_FROM: 'sender@example.com', SMTP_HOST: 'mock', SMTP_PORT: '587', SMTP_USER: 'mock', SMTP_PASSWORD: 'mock' })!;
    assert.equal(await transport.send({ to: 'parent@example.com', subject: 'Contract', text: 'Copy', filename: 'contract.pdf', pdf: Buffer.from('PDF fixture'), idempotencyKey: 'stable-key' }), 'accepted-smtp');
  } finally { nodemailer.createTransport = original; }
});

test('signature queues both copies atomically; disabled mail never downloads or sends; contract stays immutable', async () => {
  const f = await fixture();
  try {
    const before = (await f.db.query('select * from hockey_rental_contracts')).rows;
    const mailer = createContractMailer(() => f.supabase, () => null);
    const result = await mailer.send(f.rentalId);
    assert.equal(result.enabled, false);
    assert.equal(result.deliveries.length, 2);
    assert.deepEqual(result.deliveries.map((job: any) => job.status), ['pending', 'pending']);
    assert.equal(f.downloads(), 0);
    assert.deepEqual((await f.db.query('select * from hockey_rental_contracts')).rows, before);
    await assert.rejects(f.db.exec(`update hockey_rental_contracts set email='changed@example.com'`), /unveränderlich/);
    const permissions = await f.db.query<any>(`select has_function_privilege('anon','hockey_contract_mail(text,bigint,bigint,uuid,jsonb)','EXECUTE') allowed`);
    assert.equal(permissions.rows[0].allowed, false);
    assert.equal((await f.db.query<any>(`select has_table_privilege('authenticated','hockey_contract_deliveries','SELECT') allowed`)).rows[0].allowed, false);
  } finally { await f.db.close(); }
});

test('original PDF, separate recipients and stable keys; concurrent/repeated sends never duplicate accepted copies', async () => {
  const f = await fixture();
  try {
    const sent: MailMessage[] = [];
    const transport = { provider: 'mock', send: async (message: MailMessage) => {
      sent.push(message); await new Promise(resolve => setTimeout(resolve, 20)); return `accepted-${message.to}`;
    } };
    const first = createContractMailer(() => f.supabase, () => transport);
    const second = createContractMailer(() => f.supabase, () => transport);
    await Promise.all([first.send(f.rentalId), second.send(f.rentalId)]);
    await first.send(f.rentalId);
    assert.equal(sent.length, 2);
    assert.deepEqual(new Set(sent.map(message => message.to)), new Set(['parent@example.com', 'foerderverein-wieselarpke@mail.de']));
    assert.equal(new Set(sent.map(message => message.idempotencyKey)).size, 2);
    for (const message of sent) assert.deepEqual(message.pdf, f.pdf);
    const result = await first.status(f.rentalId);
    assert.ok(result.deliveries.every((job: any) => job.status === 'sent' && job.attempts === 1));
    assert.ok(result.deliveries.every((job: any) => !('pdf_path' in job)));
  } finally { await f.db.close(); }
});

test('retry sends only definitively failed recipient and keeps its idempotency key', async () => {
  const f = await fixture();
  try {
    const calls: MailMessage[] = [];
    let failing = true;
    const mailer = createContractMailer(() => f.supabase, () => ({ provider: 'mock', send: async message => {
      calls.push(message);
      if (message.to.includes('mail.de') && failing) throw new MailFailure('Test rejection');
      return 'accepted';
    } }));
    let result = await mailer.send(f.rentalId);
    assert.deepEqual(result.deliveries.map((job: any) => job.status), ['sent', 'failed']);
    failing = false;
    result = await mailer.send(f.rentalId);
    assert.equal(calls.length, 3);
    assert.equal(calls[1].idempotencyKey, calls[2].idempotencyKey);
    assert.deepEqual(result.deliveries.map((job: any) => job.attempts), [1, 2]);
  } finally { await f.db.close(); }
});

test('uncertain provider results and lost success persistence block automatic retries', async () => {
  const f = await fixture();
  try {
    let calls = 0;
    const originalRpc = f.supabase.rpc;
    f.supabase.rpc = async (name, args) => args.p_action === 'finish' && args.p_data?.status === 'sent'
      ? { data: null, error: { message: 'simulated persistence failure' } } : originalRpc(name, args);
    const mailer = createContractMailer(() => f.supabase, () => ({ provider: 'mock', send: async message => {
      calls++;
      if (message.to.includes('mail.de')) throw new MailFailure('simulated timeout', true);
      return 'accepted';
    } }));
    await mailer.send(f.rentalId);
    const result = await mailer.send(f.rentalId);
    assert.equal(calls, 2);
    assert.ok(result.deliveries.every((job: any) => job.status === 'uncertain'));
  } finally { await f.db.close(); }
});

test('tampered archive is not sent; equal recipient addresses deduplicate; stale claims cannot be stolen', async () => {
  const f = await fixture('foerderverein-wieselarpke@mail.de');
  try {
    let calls = 0;
    f.supabase.storage.from = () => ({ download: async () => ({ data: new Blob(['tampered']), error: null }) });
    const mailer = createContractMailer(() => f.supabase, () => ({ provider: 'mock', send: async () => { calls++; return 'accepted'; } }));
    let result = await mailer.send(f.rentalId);
    assert.equal(calls, 0);
    assert.equal(result.deliveries.length, 1);
    assert.equal(result.deliveries[0].status, 'failed');
    const id = result.deliveries[0].id;
    const token = crypto.randomUUID();
    await f.supabase.rpc('hockey_contract_mail', { p_action: 'claim', p_rental: f.rentalId, p_job: id, p_token: token });
    await f.db.exec(`update hockey_contract_deliveries set claimed_at=now()-interval '4 minutes'`);
    result = await mailer.send(f.rentalId);
    assert.equal(result.deliveries[0].status, 'uncertain');
    assert.equal(calls, 0);
    const wrong = await f.supabase.rpc('hockey_contract_mail', { p_action: 'finish', p_rental: f.rentalId, p_job: id, p_token: crypto.randomUUID(), p_data: { status: 'sent' } });
    assert.ok(wrong.error);
  } finally { await f.db.close(); }
});

test('email API is admin-only and remains paused without configured transport', async () => {
  const f = await fixture();
  try {
    const api = request(await createApp({ supabase: f.supabase, password: 'test-password', mailTransport: null }));
    await api.get(`/api/rentals/${f.rentalId}/contract/email`).expect(401);
    await api.post(`/api/rentals/${f.rentalId}/contract/email`).expect(401);
    const login = await api.post('/api/login').send({ password: 'test-password' }).expect(200);
    const status = await api.get(`/api/rentals/${f.rentalId}/contract/email`).set('x-admin-password', login.body.token).expect(200);
    assert.equal(status.body.enabled, false);
    const paused = await api.post(`/api/rentals/${f.rentalId}/contract/email`).set('x-admin-password', login.body.token).expect(200);
    assert.equal(paused.body.deliveries.length, 2);
    assert.equal(f.downloads(), 0);
  } finally { await f.db.close(); }
});

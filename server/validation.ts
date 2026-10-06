import { PNG } from 'pngjs';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function positiveId(value: unknown): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, 'Ungültige ID.');
  return id;
}
export function money(value: unknown, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'number' && typeof value !== 'string' || value === '' || value === null) throw new HttpError(400, 'Ungültiger Betrag.');
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100000 || Math.abs(n * 100 - Math.round(n * 100)) > 0.00001) throw new HttpError(400, 'Betrag muss positiv oder null sein und höchstens zwei Nachkommastellen haben.');
  return n;
}
export function date(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value) throw new HttpError(400, 'Ungültiges Datum.');
  return value;
}
export function text(value: unknown, label: string, required = true, max = 250): string {
  if (typeof value !== 'string' || value.trim().length > max || required && !value.trim()) throw new HttpError(400, `${label} ist ungültig oder fehlt.`);
  return value.trim();
}
export function validIban(value: unknown): string {
  const iban = text(value, 'IBAN', true, 42).replace(/\s/g,'').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban) || iban.startsWith('DE') && iban.length !== 22) throw new HttpError(400, 'Bitte eine gültige IBAN angeben.');
  const digits = (iban.slice(4)+iban.slice(0,4)).replace(/[A-Z]/g,c => String(c.charCodeAt(0)-55));
  let rem = 0;
  for (const d of digits) rem = (rem * 10 + Number(d)) % 97;
  if (rem !== 1) throw new HttpError(400, 'Die IBAN-Prüfsumme ist ungültig.');
  return iban;
}
export function contractFields(body: Record<string, unknown>, publicMode = false) {
  const fields: Record<string, string | number> = {};
  for (const key of ['first_name','last_name','child_name','street','house_number','postal_code','city','phone','email']) fields[key] = text(body[key],key);
  fields.email = String(fields.email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(fields.email))) throw new HttpError(400,'Bitte eine gültige E-Mail-Adresse angeben.');
  fields.iban = validIban(body.iban);
  if (!publicMode) { fields.fee_amount=money(body.fee_amount,60); fields.deposit_amount=money(body.deposit_amount,50); }
  return fields;
}
export function validateSignature(value: unknown): string {
  if (typeof value !== 'string' || value.length > 1500000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new HttpError(400,'Ungültige Unterschrift.');
  const bytes = Buffer.from(value.split(',')[1],'base64');
  // Inspect dimensions before decompression to bound memory allocation.
  if (bytes.length < 33 || !bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || bytes.toString('ascii',12,16)!=='IHDR') throw new HttpError(400,'Ungültiges PNG.');
  const w=bytes.readUInt32BE(16),h=bytes.readUInt32BE(20);
  if (w<20 || h<20 || w>2400 || h>1600 || w*h>2500000) throw new HttpError(400,'Unterschrift hat ungültige Abmessungen.');
  let png: PNG;
  try { png = PNG.sync.read(bytes,{checkCRC:true}); } catch { throw new HttpError(400,'Unterschrift konnte nicht gelesen werden.'); }
  let ink=0;
  for(let i=0;i<png.data.length;i+=4) if(png.data[i+3]>30 && Math.min(png.data[i],png.data[i+1],png.data[i+2])<220) ink++;
  if(ink<20) throw new HttpError(400,'Bitte eine sichtbare Unterschrift zeichnen.');
  return value;
}

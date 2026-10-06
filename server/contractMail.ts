import crypto from 'node:crypto';
import nodemailer from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  filename: string;
  pdf: Buffer;
  idempotencyKey: string;
}
export interface MailTransport {
  provider: string;
  send(message: MailMessage): Promise<string>;
}
export class MailFailure extends Error {
  constructor(message: string, public uncertain = false) { super(message); }
}

// The explicit switch is required even when credentials are already present.
export function configuredMailTransport(env: NodeJS.ProcessEnv = process.env): MailTransport | null {
  if (env.CONTRACT_MAIL_ENABLED !== 'true') return null;
  const from = env.CONTRACT_MAIL_FROM?.trim();
  if (!from || /[\r\n]/.test(from) || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(from)) return null;
  const sender = { name: 'Wiesel Hockey Verleih', address: from };
  if (env.CONTRACT_MAIL_PROVIDER === 'resend' && env.RESEND_API_KEY) {
    return { provider: 'resend', async send(message) {
      let response: Response;
      try {
        response = await fetch('https://api.resend.com/emails', {
          method: 'POST', signal: AbortSignal.timeout(15000),
          headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json',
            'Idempotency-Key': message.idempotencyKey },
          body: JSON.stringify({ from: `Wiesel Hockey Verleih <${from}>`, to: [message.to],
            subject: message.subject, text: message.text,
            attachments: [{ filename: message.filename, content: message.pdf.toString('base64') }] })
        });
      } catch { throw new MailFailure('Versandergebnis unklar. Bitte beim Versanddienst prüfen.', true); }
      if (!response.ok) throw new MailFailure('Versanddienst hat die Anfrage abgelehnt.', response.status >= 500);
      let result: any;
      try { result = await response.json(); } catch { throw new MailFailure('Versandergebnis unklar. Bitte beim Versanddienst prüfen.', true); }
      if (!result.id) throw new MailFailure('Versandergebnis unklar. Bitte beim Versanddienst prüfen.', true);
      return String(result.id);
    } };
  }
  const port = Number(env.SMTP_PORT);
  if (env.CONTRACT_MAIL_PROVIDER === 'smtp' && env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD && [465, 587].includes(port)) {
    const smtp = nodemailer.createTransport({ host: env.SMTP_HOST, port, secure: port === 465, requireTLS: port === 587,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000, dnsTimeout: 10000,
      disableFileAccess: true, disableUrlAccess: true });
    return { provider: 'smtp', async send(message) {
      let deadline: ReturnType<typeof setTimeout>;
      try {
        const sending = smtp.sendMail({ from: sender, to: message.to, subject: message.subject, text: message.text,
          messageId: `<${message.idempotencyKey}@${from.split('@')[1]}>`,
          attachments: [{ filename: message.filename, content: message.pdf, contentType: 'application/pdf' }] });
        const result = await Promise.race([sending, new Promise<never>((_resolve, reject) => {
          deadline = setTimeout(() => { smtp.close(); reject(new MailFailure('Versandergebnis unklar. Bitte beim Mailanbieter prüfen.', true)); }, 20000);
        })]);
        if (!result.accepted.length) throw new MailFailure('Mailserver hat den Empfänger abgelehnt.');
        return result.messageId;
      } catch (error: any) {
        if (error instanceof MailFailure) throw error;
        const rejected = ['CONN', 'AUTH', 'EHLO', 'STARTTLS', 'MAIL FROM', 'RCPT TO'].includes(error.command)
          || ['EAUTH', 'EDNS', 'ECONNECTION', 'ETLS'].includes(error.code) || Number(error.responseCode) >= 400;
        throw new MailFailure(rejected ? 'Mailserver hat den Versand abgelehnt. Bitte Einstellungen prüfen.'
          : 'Versandergebnis unklar. Bitte im Postfach oder beim Mailanbieter prüfen.', !rejected);
      } finally { clearTimeout(deadline); }
    } };
  }
  return null;
}

export function createContractMailer(supabase: () => any, transport: () => MailTransport | null) {
  async function rpc(action: string, rentalId: number, args: any = {}) {
    const { data, error } = await supabase().rpc('hockey_contract_mail', {
      p_action: action, p_rental: rentalId, ...args
    });
    if (error) throw new Error('Versandstatus konnte nicht gespeichert oder geladen werden.');
    return data;
  }
  async function status(rentalId: number) {
    return { enabled: !!transport(), deliveries: await rpc('status', rentalId) };
  }
  async function send(rentalId: number) {
    await rpc('enqueue', rentalId);
    const provider = transport();
    if (!provider) return status(rentalId);
    const jobs = await rpc('status', rentalId);
    for (const candidate of jobs) {
      if (!['pending', 'failed'].includes(candidate.status)) continue;
      const token = crypto.randomUUID();
      const job = await rpc('claim', rentalId, { p_job: candidate.id, p_token: token, p_data: { provider: provider.provider } });
      if (!job) continue; // Another API instance owns this recipient's send.
      let enteredProvider = false;
      try {
        const { data: file, error } = await supabase().storage.from('hockey-contracts').download(job.pdf_path);
        if (error || !file) throw new MailFailure('Archiviertes Vertrags-PDF nicht verfügbar.');
        const pdf = Buffer.from(await file.arrayBuffer());
        if (!job.pdf_sha256 || crypto.createHash('sha256').update(pdf).digest('hex') !== job.pdf_sha256)
          throw new MailFailure('Archiviertes Vertrags-PDF konnte nicht verifiziert werden.');
        enteredProvider = true;
        const messageId = await provider.send({ to: job.recipient, pdf, filename: `Ausleihvertrag_${rentalId}.pdf`,
          idempotencyKey: `hockey-contract-${job.contract_id}-recipient-${job.id}`,
          subject: `Ihr unterschriebener Ausleihvertrag – Wiesel Hockey Verleih #${rentalId}`,
          text: 'Guten Tag,\n\nim Anhang erhalten Sie eine Kopie des unterschriebenen Ausleihvertrags für die Hockey-Ausrüstung.\n\nViele Grüße\nFörderverein Wiesel Arpke e. V.' });
        await rpc('finish', rentalId, { p_job: job.id, p_token: token, p_data: { status: 'sent', message_id: messageId } });
      } catch (error) {
        const uncertain = error instanceof MailFailure ? error.uncertain : enteredProvider;
        const message = error instanceof MailFailure ? error.message : 'Versand konnte nicht sicher abgeschlossen werden.';
        try { await rpc('finish', rentalId, { p_job: job.id, p_token: token,
          p_data: { status: uncertain ? 'uncertain' : 'failed', error: message } }); }
        catch { /* Keep claim locked. Never retry an unrecorded provider result automatically. */ }
      }
    }
    return status(rentalId);
  }
  return { status, send };
}

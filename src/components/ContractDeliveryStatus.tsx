import { useEffect, useState } from 'react';
import { Mail, RotateCcw } from 'lucide-react';

type DeliveryState = 'pending' | 'sending' | 'sent' | 'failed' | 'uncertain';
interface Delivery {
  id: number;
  recipient: string;
  recipient_role: 'renter' | 'club';
  status: DeliveryState;
  sent_at: string | null;
  last_error: string | null;
}
interface Status { enabled: boolean; deliveries: Delivery[] }
const labels: Record<DeliveryState, string> = {
  pending: 'Noch nicht versendet', sending: 'Wird versendet', sent: 'An Versanddienst übergeben',
  failed: 'Versand fehlgeschlagen', uncertain: 'Versandergebnis unklar'
};

export function ContractDeliveryStatus({ rentalId, password }: { rentalId: number; password: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const endpoint = `/api/rentals/${rentalId}/contract/email`;
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    fetch(endpoint, { headers: { 'x-admin-password': password }, signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Versandstatus konnte nicht geladen werden.');
        const data: Status = await response.json();
        if (controller.signal.aborted) return;
        setStatus(data); setError(null);
        if (data.deliveries.some(delivery => delivery.status === 'sending'))
          timer = setTimeout(() => setRefresh(value => value + 1), 3000);
      }).catch(() => { if (!controller.signal.aborted) setError('Versandstatus konnte nicht geladen werden.'); });
    return () => { controller.abort(); clearTimeout(timer); };
  }, [endpoint, password, refresh]);

  const send = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'x-admin-password': password } });
      if (!response.ok) throw new Error();
      setStatus(await response.json());
    } catch {
      setError('Versandanfrage konnte nicht bestätigt werden. Bitte zuerst den Status aktualisieren.');
    } finally { setBusy(false); setRefresh(value => value + 1); }
  };
  const eligible = status && (!status.deliveries.length || status.deliveries.some(delivery => ['pending', 'failed'].includes(delivery.status)));
  return (
    <section aria-label="Vertragsversand" className="p-4 rounded-2xl bg-[#181B24] border border-slate-700/60 space-y-3">
      <h4 className="text-sm font-bold text-white flex items-center gap-2"><Mail className="w-4 h-4 text-blue-400" />Vertrag per E-Mail</h4>
      {status && !status.enabled && <p className="text-xs text-slate-400">Der Versand ist vorbereitet und noch deaktiviert. Die Absender-Einrichtung steht noch aus.</p>}
      {!status && !error && <p className="text-xs text-slate-400">Versandstatus wird geladen…</p>}
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
      <div className="space-y-2" aria-live="polite">
        {status?.deliveries.map(delivery => (
          <div key={delivery.id} className="text-xs border-t border-slate-800 pt-2">
            <div className="flex flex-wrap justify-between gap-1">
              <span className="font-semibold text-slate-200">{delivery.recipient_role === 'club' ? 'Förderverein' : 'Leihende Person'}</span>
              <span className={delivery.status === 'sent' ? 'text-emerald-300' : ['failed', 'uncertain'].includes(delivery.status) ? 'text-amber-300' : 'text-slate-400'}>{labels[delivery.status]}</span>
            </div>
            <p className="text-slate-400 break-all mt-1">{delivery.recipient}</p>
            {delivery.sent_at && <p className="text-slate-500 mt-1">{new Date(delivery.sent_at).toLocaleString('de-DE')}</p>}
            {delivery.last_error && <p className="text-amber-300 mt-1">{delivery.last_error}</p>}
            {delivery.status === 'uncertain' && <p className="text-amber-300 mt-1">Bitte beim Mailanbieter prüfen. Kein automatischer Wiederholungsversand, um doppelte Mails zu vermeiden.</p>}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={send} disabled={busy || !status?.enabled || !eligible}
          className="min-h-11 px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
          {busy ? 'Versand läuft…' : status?.deliveries.some(delivery => delivery.status === 'failed') ? 'Fehlgeschlagene Kopien erneut senden' : 'Ausstehende Kopien senden'}
        </button>
        <button type="button" onClick={() => setRefresh(value => value + 1)} disabled={busy}
          className="min-h-11 px-3 py-2 rounded-xl text-xs text-slate-400 hover:text-white flex items-center gap-2 cursor-pointer disabled:opacity-40">
          <RotateCcw className="w-3.5 h-3.5" />Status aktualisieren
        </button>
      </div>
    </section>
  );
}

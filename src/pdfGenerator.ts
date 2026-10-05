import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib';
import { ContractSnapshot, VEREIN_INFO } from './contractTemplate';
import { ContractEquipmentSnapshotItem } from './types';

export interface GenerateContractPdfParams {
  rentalId: number;
  contract: {
    first_name: string;
    last_name: string;
    child_name: string;
    street: string;
    house_number: string;
    postal_code: string;
    city: string;
    phone: string;
    email: string;
    iban: string;
    fee_amount?: number;
    deposit_amount?: number;
    signer_name?: string | null;
    signed_at?: string | null;
    signature_data?: string | null;
    equipment_snapshot?: ContractEquipmentSnapshotItem[];
    contract_snapshot?: ContractSnapshot;
  };
  rental: {
    id: number;
    rented_at: string;
    due_date?: string | null;
  };
}

// Deutsches Datumsformat (DD.MM.YYYY)
function formatDateDe(dateStr?: string | null): string {
  if (!dateStr) return '—';
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[3]}.${match[2]}.${match[1]}`;
  }
  return dateStr;
}

// Formatierung Datum & Uhrzeit für Signatur
function formatDateTimeDe(isoStr?: string | null): string {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}.${month}.${year} um ${hours}:${minutes} Uhr`;
  } catch {
    return isoStr;
  }
}

// Textumbruch-Helfer für pdf-lib
function wrapText(text: string, maxWidth: number, font: PDFFont, fontSize: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    const width = font.widthOfTextAtSize(candidate, fontSize);
    if (width <= maxWidth) {
      currentLine = candidate;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines;
}

/**
 * Erzeugt ein sauberes, mehrseitiges DIN-A4-Vertragsdokument (PDF)
 * basierend auf dem unveränderlichen Snapshot.
 */
export async function generateContractPdf(params: GenerateContractPdfParams): Promise<Uint8Array> {
  const { rentalId, contract, rental } = params;
  const snapshot = contract.contract_snapshot;

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`HockeyRent_Vertrag_${rentalId}`);
  pdfDoc.setAuthor(VEREIN_INFO.name);
  pdfDoc.setSubject('Einverständniserklärung Ausleihe Hockey-Ausrüstung');

  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const PAGE_WIDTH = 595.28; // DIN A4
  const PAGE_HEIGHT = 841.89;
  const MARGIN_LEFT = 45;
  const MARGIN_RIGHT = 45;
  const MARGIN_TOP = 45;
  const MARGIN_BOTTOM = 45;
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

  let currentPage: PDFPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN_TOP;

  // Seitenumbruch-Prüfung
  const ensureSpace = (neededHeight: number): void => {
    if (y - neededHeight < MARGIN_BOTTOM) {
      currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN_TOP;

      // Kopfzeile auf Folgeseiten
      currentPage.drawText(`${VEREIN_INFO.name} · Ausleihvertrag #${rentalId}`, {
        x: MARGIN_LEFT,
        y: y,
        size: 8,
        font: regularFont,
        color: rgb(0.45, 0.5, 0.55),
      });
      currentPage.drawLine({
        start: { x: MARGIN_LEFT, y: y - 4 },
        end: { x: PAGE_WIDTH - MARGIN_RIGHT, y: y - 4 },
        thickness: 0.5,
        color: rgb(0.8, 0.82, 0.85),
      });
      y -= 22;
    }
  };

  // =========================================================================
  // SEITE 1: DOKUMENTENKOPF
  // =========================================================================
  currentPage.drawText(VEREIN_INFO.name.toUpperCase(), {
    x: MARGIN_LEFT,
    y: y,
    size: 9,
    font: boldFont,
    color: rgb(0.12, 0.35, 0.65),
  });
  y -= 15;

  currentPage.drawText('EINVERSTÄNDNISERKLÄRUNG AUSLEIHE HOCKEY-AUSRÜSTUNG', {
    x: MARGIN_LEFT,
    y: y,
    size: 14,
    font: boldFont,
    color: rgb(0.08, 0.1, 0.15),
  });
  y -= 13;

  currentPage.drawText(`${VEREIN_INFO.addressLine} · Ausleihe-Nr. #${rentalId}`, {
    x: MARGIN_LEFT,
    y: y,
    size: 8.5,
    font: regularFont,
    color: rgb(0.4, 0.45, 0.5),
  });

  // Status-Badge oben rechts
  const badgeText = contract.signed_at ? 'VERBINDLICH UNTERSCHRIEBEN' : 'VERTRAGSENTWURF';
  const badgeWidth = boldFont.widthOfTextAtSize(badgeText, 7.5);
  currentPage.drawRectangle({
    x: PAGE_WIDTH - MARGIN_RIGHT - badgeWidth - 14,
    y: y - 1,
    width: badgeWidth + 14,
    height: 16,
    color: contract.signed_at ? rgb(0.9, 0.96, 0.9) : rgb(0.93, 0.94, 0.98),
    borderColor: contract.signed_at ? rgb(0.2, 0.65, 0.3) : rgb(0.3, 0.45, 0.8),
    borderWidth: 0.8,
  });
  currentPage.drawText(badgeText, {
    x: PAGE_WIDTH - MARGIN_RIGHT - badgeWidth - 7,
    y: y + 3.5,
    size: 7.5,
    font: boldFont,
    color: contract.signed_at ? rgb(0.12, 0.5, 0.2) : rgb(0.2, 0.35, 0.7),
  });

  y -= 12;
  currentPage.drawLine({
    start: { x: MARGIN_LEFT, y },
    end: { x: PAGE_WIDTH - MARGIN_RIGHT, y },
    thickness: 1,
    color: rgb(0.2, 0.35, 0.65),
  });
  y -= 16;

  // =========================================================================
  // 1. VERTRAGSPARTEIEN
  // =========================================================================
  ensureSpace(85);
  currentPage.drawText('1. VERTRAGSPARTEIEN', {
    x: MARGIN_LEFT,
    y: y,
    size: 9.5,
    font: boldFont,
    color: rgb(0.12, 0.35, 0.65),
  });
  y -= 13;

  // 2 Spalten: Verleiher und Entleiher
  const colWidth = (CONTENT_WIDTH - 15) / 2;
  const boxHeight = 70;

  // Box Verleiher
  currentPage.drawRectangle({
    x: MARGIN_LEFT,
    y: y - boxHeight,
    width: colWidth,
    height: boxHeight,
    color: rgb(0.97, 0.98, 0.99),
    borderColor: rgb(0.85, 0.88, 0.92),
    borderWidth: 0.8,
  });
  currentPage.drawText('VERLEIHER:', {
    x: MARGIN_LEFT + 8,
    y: y - 13,
    size: 7.5,
    font: boldFont,
    color: rgb(0.4, 0.45, 0.5),
  });
  currentPage.drawText(VEREIN_INFO.name, {
    x: MARGIN_LEFT + 8,
    y: y - 26,
    size: 8.5,
    font: boldFont,
    color: rgb(0.1, 0.12, 0.15),
  });
  currentPage.drawText(VEREIN_INFO.addressLine, {
    x: MARGIN_LEFT + 8,
    y: y - 38,
    size: 8,
    font: regularFont,
    color: rgb(0.3, 0.35, 0.4),
  });

  // Box Entleiher
  const col2X = MARGIN_LEFT + colWidth + 15;
  currentPage.drawRectangle({
    x: col2X,
    y: y - boxHeight,
    width: colWidth,
    height: boxHeight,
    color: rgb(0.97, 0.98, 0.99),
    borderColor: rgb(0.85, 0.88, 0.92),
    borderWidth: 0.8,
  });
  currentPage.drawText('ENTLEIHER / ERZIEHUNGSBERECHTIGTE(R):', {
    x: col2X + 8,
    y: y - 13,
    size: 7.5,
    font: boldFont,
    color: rgb(0.4, 0.45, 0.5),
  });
  currentPage.drawText(`${contract.first_name} ${contract.last_name}`, {
    x: col2X + 8,
    y: y - 26,
    size: 8.5,
    font: boldFont,
    color: rgb(0.1, 0.12, 0.15),
  });
  currentPage.drawText(`Kind (Spieler/in): ${contract.child_name || '—'}`, {
    x: col2X + 8,
    y: y - 37,
    size: 8,
    font: boldFont,
    color: rgb(0.12, 0.35, 0.65),
  });
  currentPage.drawText(`${contract.street} ${contract.house_number}, ${contract.postal_code} ${contract.city}`, {
    x: col2X + 8,
    y: y - 48,
    size: 7.5,
    font: regularFont,
    color: rgb(0.3, 0.35, 0.4),
  });
  currentPage.drawText(`Tel.: ${contract.phone}  ·  E-Mail: ${contract.email}`, {
    x: col2X + 8,
    y: y - 59,
    size: 7.5,
    font: regularFont,
    color: rgb(0.3, 0.35, 0.4),
  });

  y -= boxHeight + 14;

  // =========================================================================
  // 2. VERLEIHZEITRAUM & KONDITIONEN
  // =========================================================================
  ensureSpace(50);
  currentPage.drawText('2. VERLEIHZEITRAUM & KONDITIONEN', {
    x: MARGIN_LEFT,
    y: y,
    size: 9.5,
    font: boldFont,
    color: rgb(0.12, 0.35, 0.65),
  });
  y -= 12;

  currentPage.drawRectangle({
    x: MARGIN_LEFT,
    y: y - 32,
    width: CONTENT_WIDTH,
    height: 32,
    color: rgb(0.97, 0.98, 0.99),
    borderColor: rgb(0.85, 0.88, 0.92),
    borderWidth: 0.8,
  });

  const quarter = CONTENT_WIDTH / 4;
  currentPage.drawText('Datum der Übergabe:', { x: MARGIN_LEFT + 8, y: y - 12, size: 7.5, font: regularFont, color: rgb(0.4, 0.45, 0.5) });
  currentPage.drawText(formatDateDe(rental.rented_at), { x: MARGIN_LEFT + 8, y: y - 24, size: 8.5, font: boldFont, color: rgb(0.1, 0.12, 0.15) });

  currentPage.drawText('Rückgabetermin (6 Mo.):', { x: MARGIN_LEFT + quarter, y: y - 12, size: 7.5, font: regularFont, color: rgb(0.4, 0.45, 0.5) });
  currentPage.drawText(formatDateDe(rental.due_date), { x: MARGIN_LEFT + quarter, y: y - 24, size: 8.5, font: boldFont, color: rgb(0.12, 0.35, 0.65) });

  currentPage.drawText('Abnutzungsgebühr:', { x: MARGIN_LEFT + quarter * 2, y: y - 12, size: 7.5, font: regularFont, color: rgb(0.4, 0.45, 0.5) });
  currentPage.drawText(`${Number(contract.fee_amount || 60).toFixed(2)} €`, { x: MARGIN_LEFT + quarter * 2, y: y - 24, size: 8.5, font: boldFont, color: rgb(0.1, 0.12, 0.15) });

  currentPage.drawText('Kaution (Sicherheit):', { x: MARGIN_LEFT + quarter * 3, y: y - 12, size: 7.5, font: regularFont, color: rgb(0.4, 0.45, 0.5) });
  currentPage.drawText(`${Number(contract.deposit_amount || 50).toFixed(2)} €`, { x: MARGIN_LEFT + quarter * 3, y: y - 24, size: 8.5, font: boldFont, color: rgb(0.15, 0.55, 0.25) });

  y -= 44;

  // =========================================================================
  // 3. AUSGELIEHENE HOCKEY-AUSRÜSTUNG (FROZEN SNAPSHOT)
  // =========================================================================
  const equipment = contract.equipment_snapshot || [];
  ensureSpace(45 + equipment.length * 16);
  currentPage.drawText(`3. ÜBERLASSENE HOCKEY-AUSRÜSTUNG (${equipment.length} Gegenstände)`, {
    x: MARGIN_LEFT,
    y: y,
    size: 9.5,
    font: boldFont,
    color: rgb(0.12, 0.35, 0.65),
  });
  y -= 12;

  // Tabellenkopf
  const thHeight = 16;
  currentPage.drawRectangle({
    x: MARGIN_LEFT,
    y: y - thHeight,
    width: CONTENT_WIDTH,
    height: thHeight,
    color: rgb(0.2, 0.35, 0.65),
  });

  const cPos = MARGIN_LEFT + 6;
  const cCat = MARGIN_LEFT + 32;
  const cBrand = MARGIN_LEFT + 200;
  const cSize = MARGIN_LEFT + 330;
  const cCode = MARGIN_LEFT + 420;

  currentPage.drawText('Pos.', { x: cPos, y: y - 11, size: 7.5, font: boldFont, color: rgb(1, 1, 1) });
  currentPage.drawText('Ausrüstungsgegenstand', { x: cCat, y: y - 11, size: 7.5, font: boldFont, color: rgb(1, 1, 1) });
  currentPage.drawText('Marke / Modell', { x: cBrand, y: y - 11, size: 7.5, font: boldFont, color: rgb(1, 1, 1) });
  currentPage.drawText('Größe', { x: cSize, y: y - 11, size: 7.5, font: boldFont, color: rgb(1, 1, 1) });
  currentPage.drawText('Inventar-Code', { x: cCode, y: y - 11, size: 7.5, font: boldFont, color: rgb(1, 1, 1) });
  y -= thHeight;

  if (equipment.length === 0) {
    currentPage.drawRectangle({
      x: MARGIN_LEFT,
      y: y - 18,
      width: CONTENT_WIDTH,
      height: 18,
      color: rgb(0.98, 0.98, 0.98),
      borderColor: rgb(0.85, 0.88, 0.92),
      borderWidth: 0.5,
    });
    currentPage.drawText('Keine Equipmentteile im Snapshot dokumentiert.', {
      x: cCat,
      y: y - 13,
      size: 8,
      font: italicFont,
      color: rgb(0.5, 0.5, 0.5),
    });
    y -= 22;
  } else {
    equipment.forEach((item, idx) => {
      ensureSpace(16);
      const isEven = idx % 2 === 0;
      currentPage.drawRectangle({
        x: MARGIN_LEFT,
        y: y - 15,
        width: CONTENT_WIDTH,
        height: 15,
        color: isEven ? rgb(0.98, 0.99, 1) : rgb(0.94, 0.96, 0.98),
        borderColor: rgb(0.88, 0.9, 0.93),
        borderWidth: 0.5,
      });

      currentPage.drawText(String(idx + 1), { x: cPos, y: y - 11, size: 7.5, font: regularFont, color: rgb(0.4, 0.45, 0.5) });
      currentPage.drawText(item.category_label || (item as any).category || '—', { x: cCat, y: y - 11, size: 8, font: boldFont, color: rgb(0.1, 0.12, 0.15) });
      currentPage.drawText(item.brand || '—', { x: cBrand, y: y - 11, size: 8, font: regularFont, color: rgb(0.2, 0.25, 0.3) });
      currentPage.drawText(item.size || '—', { x: cSize, y: y - 11, size: 8, font: regularFont, color: rgb(0.2, 0.25, 0.3) });
      currentPage.drawText(item.item_code, { x: cCode, y: y - 11, size: 8, font: boldFont, color: rgb(0.12, 0.35, 0.65) });
      y -= 15;
    });
    y -= 8;
  }

  // =========================================================================
  // 4. VERTRAGSBEDINGUNGEN (VOLLSTÄNDIGER, UNVERÄNDERTER TEXT AUS SNAPSHOT)
  // =========================================================================
  const sections = snapshot?.sections || [];
  ensureSpace(30);
  currentPage.drawText('4. VERTRAGSBEDINGUNGEN', {
    x: MARGIN_LEFT,
    y: y,
    size: 10,
    font: boldFont,
    color: rgb(0.12, 0.35, 0.65),
  });
  y -= 14;

  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const sec = sections[sIdx];
    ensureSpace(35);

    // Abschnitts-Titel
    currentPage.drawText(`${sec.title}`, {
      x: MARGIN_LEFT,
      y: y,
      size: 8.5,
      font: boldFont,
      color: rgb(0.15, 0.18, 0.25),
    });
    y -= 11;

    // Absätze
    for (const para of sec.paragraphs) {
      const lines = wrapText(para, CONTENT_WIDTH, regularFont, 8);
      for (const line of lines) {
        ensureSpace(11);
        currentPage.drawText(line, {
          x: MARGIN_LEFT,
          y: y,
          size: 8,
          font: regularFont,
          color: rgb(0.22, 0.25, 0.3),
        });
        y -= 10.5;
      }
      y -= 2;
    }

    // Bullet Points (z. B. Sorgfaltspflichten)
    if (sec.bulletPoints && sec.bulletPoints.length > 0) {
      for (const bp of sec.bulletPoints) {
        const bpLines = wrapText(bp, CONTENT_WIDTH - 16, regularFont, 8);
        ensureSpace(bpLines.length * 11 + 2);
        // Bullet Symbol
        currentPage.drawText('•', {
          x: MARGIN_LEFT + 4,
          y: y,
          size: 9,
          font: boldFont,
          color: rgb(0.12, 0.35, 0.65),
        });
        for (let lIdx = 0; lIdx < bpLines.length; lIdx++) {
          currentPage.drawText(bpLines[lIdx], {
            x: MARGIN_LEFT + 14,
            y: y,
            size: 8,
            font: regularFont,
            color: rgb(0.22, 0.25, 0.3),
          });
          y -= 10.5;
        }
      }
      y -= 2;
    }

    // Nachsatz nach Bullet Points
    if (sec.afterBulletsParagraph) {
      const afterLines = wrapText(sec.afterBulletsParagraph, CONTENT_WIDTH, regularFont, 8);
      for (const line of afterLines) {
        ensureSpace(11);
        currentPage.drawText(line, {
          x: MARGIN_LEFT,
          y: y,
          size: 8,
          font: regularFont,
          color: rgb(0.22, 0.25, 0.3),
        });
        y -= 10.5;
      }
      y -= 2;
    }

    y -= 5;
  }

  // =========================================================================
  // 5. BESTÄTIGUNGEN BEI ÜBERGABE & SEPA-LASTSCHRIFT
  // =========================================================================
  ensureSpace(95);
  currentPage.drawText('5. BESTÄTIGUNGEN BEI ÜBERGABE', {
    x: MARGIN_LEFT,
    y: y,
    size: 9.5,
    font: boldFont,
    color: rgb(0.12, 0.35, 0.65),
  });
  y -= 13;

  const confBoxHeight = 80;
  currentPage.drawRectangle({
    x: MARGIN_LEFT,
    y: y - confBoxHeight,
    width: CONTENT_WIDTH,
    height: confBoxHeight,
    color: rgb(0.97, 0.98, 0.99),
    borderColor: rgb(0.85, 0.88, 0.92),
    borderWidth: 0.8,
  });

  const receiptLine = `Ich bestätige, dass ich den Vertragsgegenstand am ${formatDateDe(rental.rented_at)} zu den vorgenannten Bedingungen erhalten habe.`;
  currentPage.drawText(receiptLine, {
    x: MARGIN_LEFT + 8,
    y: y - 13,
    size: 8,
    font: boldFont,
    color: rgb(0.1, 0.12, 0.15),
  });

  currentPage.drawText('Lastschrifteinzug der Leihgebühr von 60,00 €, sowie der Kaution von 50,00 €:', {
    x: MARGIN_LEFT + 8,
    y: y - 27,
    size: 8,
    font: regularFont,
    color: rgb(0.2, 0.25, 0.3),
  });

  // IBAN Kasten
  currentPage.drawRectangle({
    x: MARGIN_LEFT + 8,
    y: y - 56,
    width: CONTENT_WIDTH - 16,
    height: 20,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.8, 0.83, 0.88),
    borderWidth: 0.8,
  });
  currentPage.drawText('IBAN DES ENTLEIHERS:', {
    x: MARGIN_LEFT + 14,
    y: y - 51,
    size: 7,
    font: boldFont,
    color: rgb(0.4, 0.45, 0.5),
  });
  currentPage.drawText(contract.iban || '—', {
    x: MARGIN_LEFT + 130,
    y: y - 52,
    size: 9,
    font: boldFont,
    color: rgb(0.08, 0.1, 0.15),
  });

  currentPage.drawText('Die Bankverbindung wird für die Rückerstattung der Kaution verwendet, sofern keine andere Bankverbindung auf dem Rückgabeprotokoll vermerkt wird.', {
    x: MARGIN_LEFT + 8,
    y: y - 72,
    size: 7,
    font: italicFont,
    color: rgb(0.4, 0.45, 0.5),
  });

  y -= confBoxHeight + 14;

  // =========================================================================
  // 6. UNTERSCHRIFTENBEREICH
  // =========================================================================
  ensureSpace(130);
  currentPage.drawText(`Ort, Datum: ${VEREIN_INFO.city}, ${formatDateDe(rental.rented_at)}`, {
    x: MARGIN_LEFT,
    y: y,
    size: 8.5,
    font: boldFont,
    color: rgb(0.2, 0.25, 0.3),
  });
  y -= 14;

  const signBoxWidth = (CONTENT_WIDTH - 15) / 2;
  const signBoxHeight = 85;

  // Box Verleiher
  currentPage.drawRectangle({
    x: MARGIN_LEFT,
    y: y - signBoxHeight,
    width: signBoxWidth,
    height: signBoxHeight,
    color: rgb(0.98, 0.99, 1),
    borderColor: rgb(0.85, 0.88, 0.92),
    borderWidth: 0.8,
  });
  currentPage.drawText(VEREIN_INFO.name, {
    x: MARGIN_LEFT + 12,
    y: y - 40,
    size: 9.5,
    font: italicFont,
    color: rgb(0.12, 0.35, 0.65),
  });
  currentPage.drawLine({
    start: { x: MARGIN_LEFT + 12, y: y - 62 },
    end: { x: MARGIN_LEFT + signBoxWidth - 12, y: y - 62 },
    thickness: 0.6,
    color: rgb(0.7, 0.75, 0.8),
  });
  currentPage.drawText('Unterschrift Verleiher (Vorstand / Beauftragte(r))', {
    x: MARGIN_LEFT + 12,
    y: y - 74,
    size: 7.5,
    font: regularFont,
    color: rgb(0.4, 0.45, 0.5),
  });

  // Box Entleiher (mit gezeichneter Signatur)
  const signCol2X = MARGIN_LEFT + signBoxWidth + 15;
  currentPage.drawRectangle({
    x: signCol2X,
    y: y - signBoxHeight,
    width: signBoxWidth,
    height: signBoxHeight,
    color: rgb(0.98, 0.99, 1),
    borderColor: rgb(0.85, 0.88, 0.92),
    borderWidth: 0.8,
  });

  // Wenn Signaturbild vorhanden -> Einbetten
  if (contract.signature_data && contract.signature_data.startsWith('data:image/png;base64,')) {
    try {
      const base64Data = contract.signature_data.replace(/^data:image\/png;base64,/, '');
      const imageBytes = Uint8Array.from(Buffer.from(base64Data, 'base64'));
      const pngImage = await pdfDoc.embedPng(imageBytes);

      const maxSigWidth = signBoxWidth - 24;
      const maxSigHeight = 44;
      const dims = pngImage.scaleToFit(maxSigWidth, maxSigHeight);

      currentPage.drawImage(pngImage, {
        x: signCol2X + (signBoxWidth - dims.width) / 2,
        y: y - 10 - dims.height,
        width: dims.width,
        height: dims.height,
      });
    } catch (sigErr) {
      console.error('Fehler beim Einbetten der PNG-Signatur:', sigErr);
      currentPage.drawText('[Elektronisch gezeichnet]', {
        x: signCol2X + 16,
        y: y - 35,
        size: 8.5,
        font: boldFont,
        color: rgb(0.2, 0.5, 0.3),
      });
    }
  } else {
    currentPage.drawText('[Unterschrift Entleiher]', {
      x: signCol2X + 16,
      y: y - 35,
      size: 8.5,
      font: italicFont,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  currentPage.drawLine({
    start: { x: signCol2X + 12, y: y - 62 },
    end: { x: signCol2X + signBoxWidth - 12, y: y - 62 },
    thickness: 0.6,
    color: rgb(0.7, 0.75, 0.8),
  });

  const signerLabel = contract.signer_name || `${contract.first_name} ${contract.last_name}`;
  currentPage.drawText(`Unterschrift von: ${signerLabel}`, {
    x: signCol2X + 12,
    y: y - 73,
    size: 7.5,
    font: boldFont,
    color: rgb(0.1, 0.12, 0.15),
  });

  if (contract.signed_at) {
    currentPage.drawText(`Unterzeichnet am ${formatDateTimeDe(contract.signed_at)}`, {
      x: signCol2X + 12,
      y: y - 82,
      size: 6.5,
      font: italicFont,
      color: rgb(0.35, 0.55, 0.35),
    });
  }

  // =========================================================================
  // FUSSZEILEN AUF ALLEN SEITEN (Seitenzahlen "Seite X von Y")
  // =========================================================================
  const totalPages = pdfDoc.getPageCount();
  for (let i = 0; i < totalPages; i++) {
    const page = pdfDoc.getPage(i);
    const footerY = 22;
    page.drawLine({
      start: { x: MARGIN_LEFT, y: footerY + 9 },
      end: { x: PAGE_WIDTH - MARGIN_RIGHT, y: footerY + 9 },
      thickness: 0.5,
      color: rgb(0.85, 0.88, 0.92),
    });
    page.drawText(`${VEREIN_INFO.name}  ·  Am Hainhop 12, 31275 Lehrte  ·  Ausleihe #${rentalId}`, {
      x: MARGIN_LEFT,
      y: footerY,
      size: 7,
      font: regularFont,
      color: rgb(0.45, 0.5, 0.55),
    });
    const pageNumText = `Seite ${i + 1} von ${totalPages}`;
    const pageNumWidth = regularFont.widthOfTextAtSize(pageNumText, 7);
    page.drawText(pageNumText, {
      x: PAGE_WIDTH - MARGIN_RIGHT - pageNumWidth,
      y: footerY,
      size: 7,
      font: boldFont,
      color: rgb(0.3, 0.35, 0.4),
    });
  }

  return await pdfDoc.save();
}

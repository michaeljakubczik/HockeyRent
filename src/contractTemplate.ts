/**
 * Zentrale, verbindliche Vertragsdefinition für die Einverständniserklärung /
 * den Ausleihvertrag der Hockey-Ausrüstung (Förderverein der Wiesel Arpke e.V.).
 *
 * Dient als alleinige Quelle für:
 * 1. Die Vertragsvorschau im Frontend (App.tsx)
 * 2. Die zukünftige PDF-Erzeugung
 *
 * WICHTIG: Die Texte dürfen weder gekürzt, umformuliert noch sprachlich verändert werden.
 */

export interface ContractSection {
  id: string;
  title: string;
  paragraphs: string[];
  bulletPoints?: string[];
  afterBulletsParagraph?: string;
}

export const VEREIN_INFO = {
  name: 'Förderverein der Wiesel Arpke e.V.',
  street: 'Am Hainhop 12',
  postalCode: '31275',
  city: 'Lehrte',
  addressLine: 'Am Hainhop 12, 31275 Lehrte'
} as const;

export const CONTRACT_META = {
  title: 'Einverständniserklärung Ausleihe Hockey-Ausrüstung für Spieler',
  sectionsHeading: '5. Vertragsbedingungen'
} as const;

export const CONTRACT_SECTIONS: ContractSection[] = [
  {
    id: 'usage_and_fee',
    title: 'Nutzung und Einverständnis mit der Abnutzungsgebühr',
    paragraphs: [
      'Die Nutzung der Ausrüstung durch den Entleiher beginnt mit der Unterzeichnung dieser Einverständniserklärung.',
      'Der Entleiher erklärt sich damit einverstanden, für die Abnutzung der Ausrüstung eine pauschale Gebühr in Höhe von 60,00 € für sechs Monate zu zahlen. Die Abnutzungsgebühr ist zu Beginn des jeweiligen Nutzungszeitraums im Voraus fällig.'
    ]
  },
  {
    id: 'deposit',
    title: 'Kaution',
    paragraphs: [
      'Zusätzlich zur Abnutzungsgebühr leistet der Entleiher eine Kaution in Höhe von 50,00 €.',
      'Die Kaution dient zur Absicherung für etwaige Schäden an der Ausrüstung oder einer verspäteten bzw. unvollständigen Rückgabe. Die Kaution wird nach ordnungsgemäßer Rückgabe der Ausrüstung und Prüfung auf Schäden zurückerstattet. Der Verleiher ist berechtigt, bei Beschädigung, Verlust oder unvollständiger Rückgabe der Ausrüstung die Kaution ganz oder teilweise einzubehalten.'
    ]
  },
  {
    id: 'return',
    title: 'Rückgabe der Ausrüstung',
    paragraphs: [
      'Die Ausrüstung ist gereinigt (Handwäsche) zurückzugeben. Die Rückgabe erfolgt in der Regel nach 6 Monaten und kann anschließend erneut erfolgen, sofern eine entsprechende Ausrüstung verfügbar ist.',
      'Die Rückgabe erfolgt in dem Zustand, in dem die Ausrüstung überlassen wurde, mit Ausnahme der normalen, durch den Hockeybetrieb bedingten Abnutzung.'
    ]
  },
  {
    id: 'liability',
    title: 'Haftung und Sorgfaltspflichten',
    paragraphs: [
      'Der Entleiher haftet für die Ausrüstung während der gesamten Leihdauer.',
      'Der Entleiher verpflichtet sich insbesondere:'
    ],
    bulletPoints: [
      'die Ausrüstung sorgfältig zu behandeln,',
      'die Ausrüstung vor Verlust und Beschädigung zu schützen,',
      'Änderungen oder auftretende Schäden dem Verleiher unverzüglich mitzuteilen,',
      'Schäden, die über die gewöhnliche Abnutzung hinausgehen, zu ersetzen.'
    ],
    afterBulletsParagraph:
      'Im Falle von Verlust oder nicht mehr nutzbaren Beschädigungen kann der Verleiher Ersatz in Höhe des Wiederbeschaffungswertes verlangen, soweit dieser nicht durch die Kaution gedeckt ist.'
  },
  {
    id: 'termination',
    title: 'Beendigung der Leihe',
    paragraphs: [
      'Die Leihe endet mit der vollständigen Rückgabe der Ausrüstung an den Verleiher.',
      'Bei vorzeitiger Rückgabe der Ausrüstung erfolgt keine Rückerstattung der bereits gezahlten Abnutzungsgebühr, sofern die Vereinbarung länger als vier Wochen in Kraft ist.'
    ]
  },
  {
    id: 'final_provisions',
    title: 'Schlussbestimmungen',
    paragraphs: [
      'Änderungen und Ergänzungen dieser Einverständniserklärung bedürfen der schriftlichen Zustimmung des Vorstandes. Mündliche Nebenabsprachen sind nicht verbindlich. Sollten einzelne Bestimmungen dieser Einverständniserklärung ungültig oder nicht durchsetzbar sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.',
      'Die Informationspflicht nach Artikel 13 und 14 DSGVO - Merkblatt kann auf der Internetpräsenz eingesehen werden oder bei Bedarf ausgehändigt werden.'
    ]
  }
];

export const CONTRACT_CONFIRMATION = {
  title: 'Bestätigungen bei Übergabe',
  receiptPrefix: 'Ich bestätige, dass ich den Vertragsgegenstand am',
  receiptSuffix: 'zu den vorgenannten Bedingungen erhalten habe.',
  directDebitNotice: 'Lastschrifteinzug der Leihgebühr von 60,00 €, sowie der Kaution von 50,00 €:',
  ibanLabel: 'IBAN:',
  bankRefundNotice:
    'Die Bankverbindung wird für die Rückerstattung der Kaution verwendet, sofern keine andere Bankverbindung auf dem Rückgabeprotokoll vermerkt wird.'
} as const;

/**
 * Erzeugt den vollständigen Bestätigungstext der Übergabe mit eingesetztem Übergabedatum.
 */
export function formatHandoverConfirmation(handoverDate: string): string {
  return `${CONTRACT_CONFIRMATION.receiptPrefix} ${handoverDate} ${CONTRACT_CONFIRMATION.receiptSuffix}`;
}

export const CURRENT_CONTRACT_VERSION = '2026-10-v1';

export interface ContractSnapshot {
  version: string;
  meta: typeof CONTRACT_META;
  verein: typeof VEREIN_INFO;
  sections: ContractSection[];
  confirmation: typeof CONTRACT_CONFIRMATION;
  generated_at?: string;
}

/**
 * Erzeugt einen vollständigen, unveränderlichen Snapshot aller statischen Vertragsinhalte.
 */
export function createContractSnapshot(): ContractSnapshot {
  return {
    version: CURRENT_CONTRACT_VERSION,
    meta: { ...CONTRACT_META },
    verein: { ...VEREIN_INFO },
    sections: JSON.parse(JSON.stringify(CONTRACT_SECTIONS)),
    confirmation: { ...CONTRACT_CONFIRMATION },
    generated_at: new Date().toISOString()
  };
}


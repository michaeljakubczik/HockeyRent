export type EquipmentCategory = 
  | 'Handschuhe' 
  | 'Ellenbogenschützer' 
  | 'Schienbeinschutz' 
  | 'Schutzhose' 
  | 'Helm' 
  | 'Schulterschutz' 
  | 'Trikot'
  | 'Goalie Schienen'
  | 'Goalie Fanghand'
  | 'Goalie Stockhand'
  | 'Goalie Schutzhose'
  | 'Goalie Schulterschutz'
  | 'Goalie Ellenbogenschützer'
  | 'Goalie Knieschützer'
  | 'Goalie Halsschutz'
  | 'Goalie Trikot'
  | 'Goalie Maske';

export interface EquipmentItem {
  id: number;
  item_code: string;
  category: EquipmentCategory;
  category_label: string;
  size: string;
  brand: string;
  image: string | null;
  condition_note: string | null;
  status: 'verfügbar' | 'verliehen' | 'ausgemustert';
  created_at: string;
  is_deleted?: boolean;
  // Joined fields for current rental
  active_rental_id?: number | null;
  verliehenAn?: string | null;
  verliehenAm?: string | null;
  bezahlt?: boolean;
  verliehenGebuehr?: number;
  rental_items?: any[];
  rental_count?: number; // Berechnet aus der Anzahl historischer hockey_rental_items
}

export interface RentalItemRecord {
  id?: number;
  rental_id: number;
  item_id: number;
  added_at?: string | null;
  returned_at?: string | null;
  exchange_note?: string | null;
  item?: EquipmentItem;
  hockey_equipment_items?: EquipmentItem;
}

export interface ContractEquipmentSnapshotItem {
  id: number;
  category_label: string;
  item_code: string;
  brand: string;
  size: string;
}

export interface RentalContract {
  id?: number;
  rental_id: number;
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
  deposit_amount?: number;
  fee_amount?: number;
  equipment_snapshot?: ContractEquipmentSnapshotItem[];
  status?: 'draft' | 'ready' | 'signed';
  signed_at?: string | null;
  signer_name?: string | null;
  signature_data?: string | null;
  pdf_url?: string | null;
  pdf_path?: string | null;
  contract_snapshot?: any;
  contract_version?: string | null;
  signing_token_hash?: string | null;
  signing_token_expires_at?: string | null;
  email_sent_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Rental {
  id: number;
  renter_name: string;
  rented_at: string;
  due_date?: string | null;
  returned_at: string | null;
  paid: boolean;
  fee_total: number;
  note: string | null;
  rental_type: 'single' | 'bundle';
  // Joined fields
  items?: EquipmentItem[];
  active_items?: EquipmentItem[];
  all_items?: EquipmentItem[];
  all_rental_items?: RentalItemRecord[];
  contract?: RentalContract | null;
}

export type View = 'available' | 'rented' | 'add' | 'rentals' | 'history' | 'edit' | 'bag';

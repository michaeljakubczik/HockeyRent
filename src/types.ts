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
}

export type View = 'available' | 'rented' | 'add' | 'rentals' | 'history' | 'edit' | 'bag';

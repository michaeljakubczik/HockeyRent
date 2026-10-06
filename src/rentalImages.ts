import type { EquipmentItem, Rental } from './types';

// History repeats equipment across several views. Transfer photos only with
// inventory, then reuse them locally without replacing historical item details.
export function hydrateRentalImages(rentals: Rental[], inventory: EquipmentItem[]): Rental[] {
  const images = new Map(inventory.map(item => [item.id, item.image]));
  const hydrate = (item: EquipmentItem): EquipmentItem => ({
    ...item, image: images.get(item.id) ?? item.image ?? null
  });
  return rentals.map(rental => ({
    ...rental,
    items: rental.items?.map(hydrate),
    active_items: rental.active_items?.map(hydrate),
    all_items: rental.all_items?.map(hydrate),
    all_rental_items: rental.all_rental_items?.map(record => ({
      ...record, item: record.item ? hydrate(record.item) : undefined
    }))
  }));
}

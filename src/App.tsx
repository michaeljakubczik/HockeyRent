import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Package, 
  History, 
  LogOut, 
  CheckCircle2, 
  XCircle, 
  Calendar, 
  User, 
  ArrowRightLeft,
  Search,
  Trash2,
  Lock,
  Camera,
  Upload,
  Image as ImageIcon,
  Edit,
  ShoppingBag,
  Info,
  ChevronRight,
  Filter,
  X,
  Save,
  CheckCircle,
  ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { EquipmentItem, View, Rental, EquipmentCategory } from './types';

const API_BASE = '/api';

const CATEGORIES: { label: string, value: EquipmentCategory, type: 'Feldspieler' | 'Goalie' }[] = [
  { label: 'Handschuhe', value: 'Handschuhe', type: 'Feldspieler' },
  { label: 'Ellenbogenschützer', value: 'Ellenbogenschützer', type: 'Feldspieler' },
  { label: 'Schienbeinschutz', value: 'Schienbeinschutz', type: 'Feldspieler' },
  { label: 'Schutzhose', value: 'Schutzhose', type: 'Feldspieler' },
  { label: 'Helm', value: 'Helm', type: 'Feldspieler' },
  { label: 'Schulterschutz', value: 'Schulterschutz', type: 'Feldspieler' },
  { label: 'Trikot', value: 'Trikot', type: 'Feldspieler' },
  { label: 'Goalie Schienen', value: 'Goalie Schienen', type: 'Goalie' },
  { label: 'Goalie Fanghand', value: 'Goalie Fanghand', type: 'Goalie' },
  { label: 'Goalie Stockhand', value: 'Goalie Stockhand', type: 'Goalie' },
  { label: 'Goalie Schutzhose', value: 'Goalie Schutzhose', type: 'Goalie' },
  { label: 'Goalie Schulterschutz', value: 'Goalie Schulterschutz', type: 'Goalie' },
  { label: 'Goalie Ellenbogenschützer', value: 'Goalie Ellenbogenschützer', type: 'Goalie' },
  { label: 'Goalie Knieschützer', value: 'Goalie Knieschützer', type: 'Goalie' },
  { label: 'Goalie Halsschutz', value: 'Goalie Halsschutz', type: 'Goalie' },
  { label: 'Goalie Trikot', value: 'Goalie Trikot', type: 'Goalie' },
  { label: 'Goalie Maske', value: 'Goalie Maske', type: 'Goalie' }
];

interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string; // For backward compatibility if needed, but we'll prefer message
}

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [password, setPassword] = useState('');
  const [items, setItems] = useState<EquipmentItem[]>([]);
  const [history, setHistory] = useState<Rental[]>([]);
  const [publicItems, setPublicItems] = useState<Partial<EquipmentItem>[]>([]);
  const [bag, setBag] = useState<EquipmentItem[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<{
    type: 'item' | 'history';
    id: number;
    title: string;
    message: string;
  } | null>(null);
  const [currentView, setCurrentView] = useState<View>('available');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [rentingItem, setRentingItem] = useState<EquipmentItem | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const filterItems = (itemList: EquipmentItem[]) => {
    if (!debouncedSearch) return itemList;
    const s = debouncedSearch.toLowerCase();
    return itemList.filter(i => 
      i.item_code.toLowerCase().includes(s) ||
      i.brand.toLowerCase().includes(s) ||
      i.size.toLowerCase().includes(s) ||
      i.category.toLowerCase().includes(s) ||
      (i.verliehenAn && i.verliehenAn.toLowerCase().includes(s))
    );
  };

  const [statusFilter, setStatusFilter] = useState<'all' | 'verfügbar' | 'verliehen'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sizeFilter, setSizeFilter] = useState<string>('all');

  const totalCount = items.length;
  const availableCount = items.filter(i => i.status === 'verfügbar').length;
  const rentedCount = items.filter(i => i.status === 'verliehen').length;

  // Dynamically compute available categories from existing items
  const availableCategories = Array.from(
    new Set<string>(items.map(i => i.category_label || i.category).filter((c): c is string => Boolean(c)))
  ).sort((a, b) => a.localeCompare(b, 'de'));

  // Dynamically compute available sizes from existing items and sort with standard hierarchy
  const standardSizeOrder = ['JR', 'SR', 'XS', 'S', 'M', 'L', 'XL', 'XXL'];
  const availableSizes = Array.from(
    new Set<string>(items.map(i => i.size).filter((s): s is string => Boolean(s)))
  ).sort((a, b) => {
    const aUpper = a.trim().toUpperCase();
    const bUpper = b.trim().toUpperCase();
    const aIdx = standardSizeOrder.indexOf(aUpper);
    const bIdx = standardSizeOrder.indexOf(bUpper);
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  });

  const hasActiveExtraFilters = categoryFilter !== 'all' || sizeFilter !== 'all';
  const hasActiveFilters = categoryFilter !== 'all' || sizeFilter !== 'all' || statusFilter !== 'all' || searchTerm !== '';

  const resetExtraFilters = () => {
    setCategoryFilter('all');
    setSizeFilter('all');
  };

  const resetAllFilters = () => {
    setCategoryFilter('all');
    setSizeFilter('all');
    setStatusFilter('all');
    setSearchTerm('');
  };

  // Filter Pipeline: items -> Statusfilter -> Kategoriefilter -> Größenfilter -> Suche
  const filteredByCriteria = items.filter(item => {
    // 1. Status filter
    if (statusFilter !== 'all' && item.status !== statusFilter) {
      return false;
    }
    // 2. Category filter
    if (categoryFilter !== 'all' && item.category_label !== categoryFilter && item.category !== categoryFilter) {
      return false;
    }
    // 3. Size filter
    if (sizeFilter !== 'all' && item.size.trim().toLowerCase() !== sizeFilter.trim().toLowerCase()) {
      return false;
    }
    return true;
  });

  const displayedItems = filterItems(filteredByCriteria);

  // Form states
  const [newItem, setNewItem] = useState<{ 
    category: EquipmentCategory, 
    size: string, 
    brand: string, 
    image: string | null, 
    condition_note: string 
  }>({ 
    category: 'Helm', 
    size: '', 
    brand: '', 
    image: null,
    condition_note: ''
  });
  const [editItem, setEditItem] = useState<EquipmentItem | null>(null);
  const [rentForm, setRentForm] = useState<{ 
    item_ids: number[], 
    renter_name: string, 
    rented_at: string, 
    paid: boolean, 
    fee_total: string | number,
    note: string
  }>({
    item_ids: [],
    renter_name: '',
    rented_at: new Date().toISOString().split('T')[0],
    paid: false,
    fee_total: '',
    note: ''
  });

  useEffect(() => {
    const savedPassword = sessionStorage.getItem('hockey_rent_password');
    if (savedPassword) {
      checkLogin(savedPassword);
    } else {
      fetchPublicItems();
    }
  }, []);

  const fetchPublicItems = async () => {
    try {
      const res = await fetch(`${API_BASE}/public/available`);
      if (res.ok) {
        const data = await res.json();
        setPublicItems(data);
      }
    } catch (err) {
      console.error('Error fetching public items:', err);
    }
  };

  const checkLogin = async (pass: string) => {
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pass })
      });
      const data: ApiResponse = await res.json();
      if (res.ok && data.success) {
        setIsLoggedIn(true);
        setPassword(pass);
        sessionStorage.setItem('hockey_rent_password', pass);
        fetchItems(pass);
      } else {
        sessionStorage.removeItem('hockey_rent_password');
        setError(data.message || 'Ungültiges Passwort');
      }
    } catch (err) {
      setError('Verbindungsfehler');
    }
  };

  const fetchItems = async (pass: string) => {
    setLoading(true);
    try {
      const [itemsRes, historyRes] = await Promise.all([
        fetch(`${API_BASE}/items`, { headers: { 'x-admin-password': pass } }),
        fetch(`${API_BASE}/history`, { headers: { 'x-admin-password': pass } })
      ]);
      
      if (itemsRes.ok) {
        const data = await itemsRes.json();
        setItems(data);
      }
      if (historyRes.ok) {
        const data = await historyRes.json();
        setHistory(data);
      }
    } catch (err) {
      setError('Fehler beim Laden der Daten');
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.category || !newItem.size) return;
    setLoading(true);
    setError(null);

    const category_label = CATEGORIES.find(c => c.value === newItem.category)?.label || newItem.category;

    try {
      const res = await fetch(`${API_BASE}/items`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-password': password
        },
        body: JSON.stringify({ ...newItem, category_label })
      });
      if (res.ok) {
        setNewItem({ category: 'Helm', size: '', brand: '', image: null, condition_note: '' });
        setSuccess('Equipment erfolgreich angelegt');
        fetchItems(password);
        setCurrentView('available');
      } else {
        const data: ApiResponse = await res.json();
        setError(data.message || 'Fehler beim Speichern');
      }
    } catch (err) {
      setError('Fehler beim Speichern');
    } finally {
      setLoading(false);
    }
  };

  const handleEditItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editItem) return;
    setLoading(true);
    setError(null);

    const category_label = CATEGORIES.find(c => c.value === editItem.category)?.label || editItem.category;

    try {
      const res = await fetch(`${API_BASE}/items/${editItem.id}`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-password': password
        },
        body: JSON.stringify({ ...editItem, category_label })
      });
      if (res.ok) {
        setEditItem(null);
        setSuccess('Equipment erfolgreich aktualisiert');
        fetchItems(password);
      } else {
        const data: ApiResponse = await res.json();
        setError(data.message || 'Fehler beim Aktualisieren');
      }
    } catch (err) {
      setError('Fehler beim Aktualisieren');
    } finally {
      setLoading(false);
    }
  };

  const handleRentItems = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const item_ids = bag.map(i => i.id);
    if (item_ids.length === 0 || !rentForm.renter_name) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/rentals`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-password': password
        },
        body: JSON.stringify({
          ...rentForm,
          item_ids
        })
      });
      if (res.ok) {
        setRentForm({ 
          item_ids: [], 
          renter_name: '', 
          rented_at: new Date().toISOString().split('T')[0], 
          paid: false, 
          fee_total: '',
          note: ''
        });
        setBag([]);
        setSuccess('Equipment erfolgreich verliehen');
        fetchItems(password);
        setCurrentView('available');
      } else {
        const data: ApiResponse = await res.json();
        setError(data.message || 'Fehler beim Verleihen');
      }
    } catch (err) {
      setError('Fehler beim Verleihen');
    } finally {
      setLoading(false);
    }
  };

  const handleRentSingleItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rentingItem || !rentForm.renter_name) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/rentals`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-password': password
        },
        body: JSON.stringify({
          ...rentForm,
          item_ids: [rentingItem.id]
        })
      });
      if (res.ok) {
        setRentForm({ 
          item_ids: [], 
          renter_name: '', 
          rented_at: new Date().toISOString().split('T')[0], 
          paid: false, 
          fee_total: '',
          note: ''
        });
        setRentingItem(null);
        setSuccess('Equipment erfolgreich verliehen');
        fetchItems(password);
        setCurrentView('available');
      } else {
        const data: ApiResponse = await res.json();
        setError(data.message || 'Fehler beim Verleihen');
      }
    } catch (err) {
      setError('Fehler beim Verleihen');
    } finally {
      setLoading(false);
    }
  };

  const handleReturnRental = async (rentalId: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/rentals/${rentalId}/return`, {
        method: 'POST',
        headers: { 'x-admin-password': password }
      });
      if (res.ok) {
        setSuccess('Equipment erfolgreich zurückgegeben');
        fetchItems(password);
      } else {
        const data: ApiResponse = await res.json();
        setError(data.message || 'Fehler bei der Rückgabe');
      }
    } catch (err) {
      setError('Fehler bei der Rückgabe');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteItem = (id: number) => {
    const item = items.find(i => i.id === id);
    const hasHistory = item && item.rental_items && item.rental_items.length > 0;

    setConfirmDelete({
      type: 'item',
      id,
      title: hasHistory ? 'Ausmustern?' : 'Teil löschen?',
      message: hasHistory 
        ? 'Dieser Artikel existiert in der Historie. Er wird aus dem aktiven Bestand entfernt, die Historie bleibt erhalten.'
        : 'Möchtest du dieses Ausrüstungsteil wirklich aus dem Bestand löschen?'
    });
  };

  const handleDeleteHistory = (id: number) => {
    setConfirmDelete({
      type: 'history',
      id,
      title: 'Eintrag löschen?',
      message: 'Möchtest du diesen Verlaufseintrag wirklich löschen?'
    });
  };

  const executeDelete = async () => {
    if (!confirmDelete) return;
    const { type, id } = confirmDelete;
    setConfirmDelete(null);
    
    setLoading(true);
    setError(null);
    try {
      const endpoint = type === 'item' ? `/items/${id}` : `/rentals/${id}`;
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'DELETE',
        headers: { 'x-admin-password': password }
      });
      if (res.ok) {
        setSuccess(type === 'item' ? 'Teil erfolgreich gelöscht' : 'Eintrag erfolgreich gelöscht');
        fetchItems(password);
      } else {
        const data: ApiResponse = await res.json();
        setError(data.message || 'Fehler beim Löschen');
      }
    } catch (err) {
      setError('Fehler beim Löschen');
    } finally {
      setLoading(false);
    }
  };

  const toggleBag = (item: EquipmentItem) => {
    if (bag.find(i => i.id === item.id)) {
      setBag(bag.filter(i => i.id !== item.id));
      setSuccess(`${item.category_label} aus der Tasche entfernt`);
    } else {
      setBag([...bag, item]);
      setSuccess(`${item.category_label} zur Tasche hinzugefügt`);
    }
    setTimeout(() => setSuccess(null), 2000);
  };

  const removeFromBag = (id: number) => {
    setBag(bag.filter(i => i.id !== id));
  };

  const clearBag = () => {
    setBag([]);
  };

  const handleMarkAsPaid = async (rentalId: number, paid: boolean = true) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/rentals/${rentalId}/paid`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-password': password 
        },
        body: JSON.stringify({ paid })
      });
      if (res.ok) {
        setSuccess(paid ? 'Als bezahlt markiert' : 'Als offen markiert');
        fetchItems(password);
      } else {
        const data: ApiResponse = await res.json();
        setError(data.message || (paid ? 'Fehler beim Markieren als bezahlt' : 'Fehler beim Markieren als offen'));
      }
    } catch (err) {
      setError(paid ? 'Fehler beim Markieren als bezahlt' : 'Fehler beim Markieren als offen');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setPassword('');
    sessionStorage.removeItem('hockey_rent_password');
    fetchPublicItems();
  };

  const resizeImage = (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
    });
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const resized = await resizeImage(reader.result as string);
        if (editItem) {
          setEditItem({ ...editItem, image: resized });
        } else {
          setNewItem({ ...newItem, image: resized });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
        <header className="bg-wiesel-navy text-white sticky top-0 z-30 shadow-md">
          <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center border border-white/20">
                <Package className="text-white w-5 h-5" />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-white">Wiesel HockeyRent</h1>
            </div>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
              <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">Wiesel HockeyRent</h2>
              <p className="text-slate-500 mt-1">Hier siehst du alle Ausrüstungsteile, die aktuell zur Verfügung stehen.</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 px-4 py-2 rounded-2xl flex items-center gap-2 self-start md:self-auto">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span className="text-emerald-700 font-bold text-sm uppercase tracking-wider">{publicItems.length} Verfügbar</span>
            </div>
          </div>

          {publicItems.length === 0 ? (
            <EmptyState icon={<Package className="w-12 h-12 text-slate-400" />} message="Aktuell ist kein Equipment verfügbar." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {publicItems.map(item => (
                <div key={item.id} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden group">
                  <div className="aspect-[4/3] bg-slate-100 relative overflow-hidden">
                    {item.image ? (
                      <img 
                        src={item.image} 
                        alt={item.brand} 
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        <ImageIcon className="w-16 h-16" />
                      </div>
                    )}
                    <div className="absolute top-4 right-4">
                      <span className="bg-wiesel-navy text-white px-3 py-1 rounded-full text-xs font-bold shadow-sm">
                        {item.item_code}
                      </span>
                    </div>
                  </div>
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-xl font-bold text-slate-900">{item.category_label}</h3>
                      <span className="text-xs font-medium text-slate-500">{item.brand}</span>
                    </div>
                    <div className="flex items-center justify-between mt-4">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Verfügbar</span>
                      </div>
                      <span className="text-xs font-bold text-slate-600">Größe: {item.size}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-16 p-8 bg-white rounded-3xl border border-slate-200 shadow-sm text-center">
            <h3 className="text-xl font-bold text-slate-900 mb-2">Admin-Bereich</h3>
            <p className="text-slate-500 mb-6 max-w-md mx-auto">Um Equipment zu verleihen oder den Bestand zu verwalten, logge dich bitte mit deinem Passwort ein.</p>
            <div className="max-w-xs mx-auto">
              <form onSubmit={(e) => { e.preventDefault(); checkLogin(password); }} className="space-y-4">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 focus:ring-2 focus:ring-wiesel-navy outline-none transition-all"
                  placeholder="Passwort eingeben"
                />
                {error && <p className="text-red-500 text-sm font-medium">{error}</p>}
                <button
                  type="submit"
                  className="w-full bg-wiesel-navy hover:bg-wiesel-navy-hover text-white font-bold py-3 rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
                >
                  Anmelden
                </button>
              </form>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-24 md:pb-8">
      {/* Header */}
      <header className="bg-wiesel-navy text-white sticky top-0 z-30 shadow-md">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center border border-white/20">
              <Package className="text-white w-5 h-5" />
            </div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg md:text-xl font-bold tracking-tight text-white">Wiesel HockeyRent</h1>
              <span className="text-[10px] md:text-xs font-semibold px-2 py-0.5 rounded-full bg-white/15 text-slate-200">Admin</span>
            </div>
          </div>
          
          <nav className="hidden md:flex items-center gap-1.5">
            <TabButton active={currentView === 'available'} onClick={() => setCurrentView('available')} icon={<Package className="w-4 h-4" />} label="Bestand" />
            <TabButton active={currentView === 'bag'} onClick={() => setCurrentView('bag')} icon={<ShoppingBag className="w-4 h-4" />} label="Tasche" count={bag.length} />
            <TabButton active={currentView === 'history'} onClick={() => setCurrentView('history')} icon={<Calendar className="w-4 h-4" />} label="Historie" />
            <TabButton active={currentView === 'add'} onClick={() => setCurrentView('add')} icon={<Plus className="w-4 h-4" />} label="Neu" />
            <button 
              onClick={handleLogout}
              className="ml-2 p-2 text-slate-300 hover:text-red-400 hover:bg-white/10 rounded-xl transition-all cursor-pointer"
              title="Abmelden"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </nav>

          <button 
            onClick={handleLogout}
            className="md:hidden p-2 text-slate-300 hover:text-red-400 transition-all cursor-pointer"
            title="Abmelden"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 md:py-8">
        {/* Messages */}
        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 flex items-center justify-between shadow-sm"
            >
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-500" />
                <span className="font-medium text-sm">{error}</span>
              </div>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 cursor-pointer">
                <Plus className="w-5 h-5 rotate-45" />
              </button>
            </motion.div>
          )}
          {success && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 flex items-center justify-between shadow-sm"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span className="font-medium text-sm">{success}</span>
              </div>
              <button onClick={() => setSuccess(null)} className="text-emerald-500 hover:text-emerald-700 cursor-pointer">
                <Plus className="w-5 h-5 rotate-45" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content Area */}
        <AnimatePresence mode="wait">

          {currentView === 'available' && (
            <motion.div 
              key="available"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6 md:space-y-8"
            >
              {/* 1. BESTAND Header Row */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">Bestand</h2>
                  <p className="text-xs md:text-sm text-slate-500 mt-0.5">
                    Ausrüstungsbestand im Überblick
                  </p>
                </div>
                {bag.length > 0 && (
                  <button 
                    onClick={() => setCurrentView('bag')}
                    className="bg-wiesel-navy hover:bg-wiesel-navy-hover text-white px-3.5 py-2 md:px-4 md:py-2.5 rounded-xl font-bold text-xs md:text-sm flex items-center gap-2 shadow-sm transition-all active:scale-95 flex-shrink-0 cursor-pointer"
                  >
                    <ShoppingBag className="w-4 h-4 text-emerald-400" />
                    <span>Tasche ({bag.length})</span>
                  </button>
                )}
              </div>

              {/* 2. Kompakte Bestandsinformationen & Statusfilter */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`p-2.5 sm:p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    statusFilter === 'all'
                      ? 'bg-wiesel-navy text-white border-wiesel-navy shadow-sm ring-1 ring-wiesel-navy'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-1">
                    <span className={statusFilter === 'all' ? 'text-slate-300' : 'text-slate-500'}>Gesamt</span>
                    <Package className={`w-3.5 h-3.5 ${statusFilter === 'all' ? 'text-slate-300' : 'text-slate-400'}`} />
                  </div>
                  <div className="text-xl sm:text-2xl font-black">{totalCount}</div>
                </button>

                <button
                  type="button"
                  onClick={() => setStatusFilter('verfügbar')}
                  className={`p-2.5 sm:p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    statusFilter === 'verfügbar'
                      ? 'bg-wiesel-navy text-white border-wiesel-navy shadow-sm ring-1 ring-wiesel-navy'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-1">
                    <span className={`flex items-center gap-1.5 ${statusFilter === 'verfügbar' ? 'text-emerald-300' : 'text-emerald-600'}`}>
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      Verfügbar
                    </span>
                    <CheckCircle2 className={`w-3.5 h-3.5 ${statusFilter === 'verfügbar' ? 'text-emerald-300' : 'text-emerald-600'}`} />
                  </div>
                  <div className="text-xl sm:text-2xl font-black">{availableCount}</div>
                </button>

                <button
                  type="button"
                  onClick={() => setStatusFilter('verliehen')}
                  className={`p-2.5 sm:p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    statusFilter === 'verliehen'
                      ? 'bg-wiesel-navy text-white border-wiesel-navy shadow-sm ring-1 ring-wiesel-navy'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-1">
                    <span className={`flex items-center gap-1.5 ${statusFilter === 'verliehen' ? 'text-amber-300' : 'text-amber-600'}`}>
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                      Verliehen
                    </span>
                    <ArrowRightLeft className={`w-3.5 h-3.5 ${statusFilter === 'verliehen' ? 'text-amber-300' : 'text-amber-600'}`} />
                  </div>
                  <div className="text-xl sm:text-2xl font-black">{rentedCount}</div>
                </button>
              </div>

              {/* 3. Suche und Filter */}
              <div className="bg-white p-3 md:p-3.5 rounded-2xl border border-slate-200 shadow-sm space-y-2.5 md:space-y-0 md:flex md:items-center md:gap-3">
                {/* Suchfeld */}
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Code, Marke, Größe, Kategorie oder Ausleiher suchen..."
                    className="w-full pl-9 pr-8 py-2.5 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-wiesel-navy focus:ring-1 focus:ring-wiesel-navy rounded-xl text-xs md:text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 cursor-pointer"
                      title="Suche leeren"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Dropdowns (Kategorie und Größe) */}
                <div className="grid grid-cols-2 md:flex md:items-center gap-2">
                  {/* Kategorie Dropdown */}
                  <div className="relative md:w-48">
                    <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                    <select
                      aria-label="Kategorie filtern"
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className={`w-full pl-8 pr-7 py-2.5 border rounded-xl text-xs md:text-sm font-medium outline-none transition-all appearance-none cursor-pointer truncate ${
                        categoryFilter !== 'all'
                          ? 'bg-slate-100 border-wiesel-navy text-wiesel-navy font-bold'
                          : 'bg-slate-50 hover:bg-white border-slate-200 text-slate-700 focus:border-wiesel-navy'
                      }`}
                    >
                      <option value="all">Alle Kategorien</option>
                      {availableCategories.map(cat => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                  </div>

                  {/* Größen Dropdown */}
                  <div className="relative md:w-36">
                    <select
                      aria-label="Größe filtern"
                      value={sizeFilter}
                      onChange={(e) => setSizeFilter(e.target.value)}
                      className={`w-full pl-3 pr-7 py-2.5 border rounded-xl text-xs md:text-sm font-medium outline-none transition-all appearance-none cursor-pointer truncate ${
                        sizeFilter !== 'all'
                          ? 'bg-slate-100 border-wiesel-navy text-wiesel-navy font-bold'
                          : 'bg-slate-50 hover:bg-white border-slate-200 text-slate-700 focus:border-wiesel-navy'
                      }`}
                    >
                      <option value="all">Alle Größen</option>
                      {availableSizes.map(sz => (
                        <option key={sz} value={sz}>
                          Größe: {sz}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                  </div>

                  {/* Filter zurücksetzen Button */}
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={resetAllFilters}
                      className="col-span-2 md:col-auto text-xs font-bold text-slate-600 hover:text-red-600 hover:bg-red-50 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-200 hover:border-red-200 bg-slate-50 transition-all cursor-pointer flex-shrink-0"
                      title="Alle Filter zurücksetzen"
                    >
                      <X className="w-3.5 h-3.5 text-slate-400" />
                      <span>Filter zurücksetzen</span>
                    </button>
                  )}
                </div>
              </div>

              {/* 4. Equipment-Liste */}
              {displayedItems.length === 0 ? (
                <EmptyState 
                  icon={<Package className="w-12 h-12 text-slate-400" />} 
                  message={
                    hasActiveFilters
                      ? "Für diese Filterkombination wurden keine Ausrüstungsteile gefunden."
                      : "Kein Equipment im Bestand."
                  } 
                />
              ) : (
                <div className="space-y-10">
                  {Object.entries(
                    displayedItems.reduce((acc, item) => {
                      const cat = item.category_label;
                      if (!acc[cat]) acc[cat] = [];
                      acc[cat].push(item);
                      return acc;
                    }, {} as Record<string, EquipmentItem[]>)
                  )
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([category, catItems]) => (
                    <div key={category} className="space-y-3.5">
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg md:text-xl font-bold text-slate-900 border-l-4 border-wiesel-navy pl-3">{category}</h3>
                        <div className="h-px flex-grow bg-slate-200"></div>
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{catItems.length} Teile</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                        {catItems
                          .sort((a, b) => {
                            const sizeOrder = ['JR', 'SR', 'XS', 'S', 'M', 'L', 'XL', 'XXL'];
                            const aIdx = sizeOrder.indexOf(a.size.toUpperCase());
                            const bIdx = sizeOrder.indexOf(b.size.toUpperCase());
                            if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
                            return a.size.localeCompare(b.size);
                          })
                          .map(item => (
                            <ItemCard 
                              key={item.id} 
                              item={item} 
                              onRent={() => {
                                setRentingItem(item);
                                setRentForm(prev => ({ ...prev, fee_total: '' }));
                              }}
                              onReturn={() => {
                                if (item.active_rental_id) {
                                  handleReturnRental(item.active_rental_id);
                                }
                              }}
                              onMarkPaid={(paidState?: boolean) => {
                                if (item.active_rental_id) {
                                  handleMarkAsPaid(item.active_rental_id, paidState !== undefined ? paidState : !item.bezahlt);
                                }
                              }}
                              onEdit={() => { setEditItem(item); setCurrentView('add'); }}
                              onDelete={() => handleDeleteItem(item.id)}
                              onToggleBag={() => toggleBag(item)}
                              inBag={bag.some(b => b.id === item.id)}
                            />
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {currentView === 'bag' && (
            <motion.div 
              key="bag"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              <div className="mb-2">
                <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">Deine Tasche</h2>
                <p className="text-slate-500 mt-1">Hier sammelst du Equipment für einen gemeinsamen Verleih.</p>
              </div>

              {bag.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-slate-200 shadow-sm">
                  <ShoppingBag className="w-16 h-16 text-slate-400 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Deine Tasche ist leer</h3>
                  <p className="text-slate-500 mb-6">Füge Equipment aus dem Bestand hinzu, um es zu verleihen.</p>
                  <button 
                    onClick={() => setCurrentView('available')}
                    className="bg-wiesel-navy hover:bg-wiesel-navy-hover text-white px-6 py-3 rounded-xl font-bold transition-all shadow-sm cursor-pointer"
                  >
                    Zum Bestand
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 space-y-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-lg font-bold text-slate-900">{bag.length} Teile ausgewählt</h3>
                      <button onClick={clearBag} className="text-sm text-red-500 hover:text-red-700 font-medium cursor-pointer">Alle entfernen</button>
                    </div>
                    {bag.map(item => (
                      <div key={item.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                        <div className="w-16 h-16 rounded-xl bg-slate-100 overflow-hidden flex-shrink-0">
                          {item.image ? (
                            <img src={item.image} alt={item.brand} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-400">
                              <ImageIcon className="w-6 h-6" />
                            </div>
                          )}
                        </div>
                        <div className="flex-grow">
                          <div className="flex items-center justify-between">
                            <h4 className="font-bold text-slate-900">{item.category_label}</h4>
                            <button onClick={() => removeFromBag(item.id)} className="text-slate-400 hover:text-red-500 transition-all cursor-pointer">
                              <X className="w-5 h-5" />
                            </button>
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-slate-500">{item.brand}</span>
                            <span className="text-xs text-slate-500">Größe: {item.size}</span>
                            <span className="text-[10px] font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{item.item_code}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm h-fit sticky top-24">
                    <h3 className="text-xl font-bold text-slate-900 mb-6">Verleih-Details</h3>
                    <form onSubmit={(e) => { e.preventDefault(); handleRentItems(); }} className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Name des Ausleihers</label>
                        <input
                          required
                          type="text"
                          value={rentForm.renter_name}
                          onChange={(e) => setRentForm({ ...rentForm, renter_name: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 focus:ring-2 focus:ring-wiesel-navy outline-none transition-all"
                          placeholder="z.B. Max Mustermann"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Leihgebühr (€)</label>
                        <input
                          required
                          type="number"
                          value={rentForm.fee_total}
                          onChange={(e) => setRentForm({ ...rentForm, fee_total: parseFloat(e.target.value) })}
                          className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 focus:ring-2 focus:ring-wiesel-navy outline-none transition-all"
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Notiz (Optional)</label>
                        <textarea
                          value={rentForm.note}
                          onChange={(e) => setRentForm({ ...rentForm, note: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 focus:ring-2 focus:ring-wiesel-navy outline-none transition-all resize-none"
                          placeholder="Zusätzliche Infos..."
                          rows={3}
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-wiesel-navy hover:bg-wiesel-navy-hover disabled:opacity-50 text-white font-bold py-4 rounded-2xl shadow-md transition-all active:scale-95 mt-4 flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {loading ? 'Wird verarbeitet...' : (
                          <>
                            <CheckCircle className="w-5 h-5 text-emerald-400" />
                            <span>Jetzt verleihen</span>
                          </>
                        )}
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {currentView === 'history' && (
            <motion.div 
              key="history"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
                <div>
                  <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">Historie</h2>
                  <p className="text-slate-500 mt-1">Alle vergangenen und aktuellen Verleihvorgänge.</p>
                </div>
                <div className="bg-white border border-slate-200 px-4 py-2 rounded-2xl shadow-sm flex items-center gap-3">
                  <span className="text-slate-500 text-sm font-bold uppercase tracking-wider">Einnahmen:</span>
                  <span className="text-wiesel-navy font-extrabold text-lg">
                    {history.filter(r => r.paid).reduce((sum, r) => sum + r.fee_total, 0).toFixed(2)} €
                  </span>
                </div>
              </div>

              {history.length === 0 ? (
                <EmptyState icon={<Calendar className="w-12 h-12 text-slate-400" />} message="Noch keine Historie vorhanden." />
              ) : (
                <div className="space-y-6">
                  {history.map(rental => (
                    <HistoryItem 
                      key={rental.id} 
                      rental={rental} 
                      onMarkAsPaid={(paidState?: boolean) => handleMarkAsPaid(rental.id, paidState !== undefined ? paidState : !rental.paid)}
                      onDelete={() => setConfirmDelete({ type: 'history', id: rental.id })}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {currentView === 'add' && (
            <motion.div 
              key="add"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-4xl mx-auto"
            >
              <div className="mb-8 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
                    {editItem ? 'Equipment bearbeiten' : 'Neues Equipment'}
                  </h2>
                  <p className="text-slate-500 mt-1">Füge neue Ausrüstung zum Bestand hinzu.</p>
                </div>
                <button 
                  onClick={() => { setEditItem(null); setCurrentView('available'); }}
                  className="p-2 text-slate-400 hover:text-slate-700 transition-all cursor-pointer"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                <form onSubmit={(e) => { e.preventDefault(); editItem ? handleEditItem(e) : handleAddItem(e); }} className="p-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">Kategorie</label>
                        <select
                          required
                          value={editItem ? editItem.category : newItem.category}
                          onChange={(e) => {
                            const cat = e.target.value as EquipmentCategory;
                            const label = CATEGORIES.find(c => c.value === cat)?.label || '';
                            if (editItem) setEditItem({ ...editItem, category: cat, category_label: label });
                            else setNewItem({ ...newItem, category: cat, category_label: label });
                          }}
                          className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 focus:ring-2 focus:ring-wiesel-navy outline-none transition-all appearance-none cursor-pointer"
                        >
                          <option value="" disabled>Kategorie wählen...</option>
                          <optgroup label="Feldspieler">
                            {CATEGORIES.filter(c => c.type === 'Feldspieler').map(c => (
                              <option key={c.value} value={c.value}>{c.label}</option>
                            ))}
                          </optgroup>
                          <optgroup label="Goalie">
                            {CATEGORIES.filter(c => c.type === 'Goalie').map(c => (
                              <option key={c.value} value={c.value}>{c.label}</option>
                            ))}
                          </optgroup>
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">Marke</label>
                          <input
                            required
                            type="text"
                            value={editItem ? editItem.brand : newItem.brand}
                            onChange={(e) => editItem ? setEditItem({ ...editItem, brand: e.target.value }) : setNewItem({ ...newItem, brand: e.target.value })}
                            className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 focus:ring-2 focus:ring-wiesel-navy outline-none transition-all"
                            placeholder="z.B. Bauer"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">Größe</label>
                          <input
                            required
                            type="text"
                            value={editItem ? editItem.size : newItem.size}
                            onChange={(e) => editItem ? setEditItem({ ...editItem, size: e.target.value }) : setNewItem({ ...newItem, size: e.target.value })}
                            className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 focus:ring-2 focus:ring-wiesel-navy outline-none transition-all"
                            placeholder="z.B. L"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">Zustand / Notiz</label>
                        <textarea
                          value={editItem ? editItem.condition_note : newItem.condition_note}
                          onChange={(e) => editItem ? setEditItem({ ...editItem, condition_note: e.target.value }) : setNewItem({ ...newItem, condition_note: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 focus:ring-2 focus:ring-wiesel-navy outline-none transition-all resize-none"
                          placeholder="Besonderheiten zum Zustand..."
                          rows={3}
                        />
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">Foto</label>
                        <div className="relative group">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleImageChange}
                            className="hidden"
                            id="image-upload"
                          />
                          <label 
                            htmlFor="image-upload"
                            className="block aspect-[4/3] rounded-2xl border-2 border-dashed border-slate-300 hover:border-wiesel-navy bg-slate-50 cursor-pointer transition-all overflow-hidden relative"
                          >
                            {(editItem?.image || newItem.image) ? (
                              <>
                                <img 
                                  src={editItem ? editItem.image : newItem.image} 
                                  alt="Vorschau" 
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                                  <p className="text-white font-bold text-sm">Bild ändern</p>
                                </div>
                              </>
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                                <ImageIcon className="w-12 h-12 mb-2" />
                                <p className="text-sm font-medium">Bild hochladen</p>
                              </div>
                            )}
                          </label>
                        </div>
                      </div>

                      <div className="pt-4">
                        <button
                          type="submit"
                          disabled={loading}
                          className="w-full bg-wiesel-navy hover:bg-wiesel-navy-hover disabled:opacity-50 text-white font-bold py-4 rounded-2xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                        >
                          {loading ? 'Speichert...' : (
                            <>
                              <Save className="w-5 h-5 text-emerald-400" />
                              <span>{editItem ? 'Änderungen speichern' : 'Equipment hinzufügen'}</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Mobile Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-4 py-1.5 flex justify-around items-center z-40 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
        <MobileNavItem active={currentView === 'available'} onClick={() => setCurrentView('available')} icon={<Package />} label="Bestand" />
        <MobileNavItem active={currentView === 'bag'} onClick={() => setCurrentView('bag')} icon={<ShoppingBag />} label="Tasche" />
        <MobileNavItem active={currentView === 'add'} onClick={() => setCurrentView('add')} icon={<Plus />} label="Neu" />
        <MobileNavItem active={currentView === 'history'} onClick={() => setCurrentView('history')} icon={<History />} label="Historie" />
      </nav>

      {/* Rent Modal (Single Item) */}
      <AnimatePresence>
        {rentingItem && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl border border-slate-200"
            >
              <h3 className="text-2xl font-bold mb-6 text-slate-900">Equipment verleihen</h3>
              <form onSubmit={handleRentSingleItem} className="space-y-4">
                <div className="w-full">
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Verliehen an</label>
                  <div className="relative w-full">
                    <User className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
                    <input
                      type="text"
                      required
                      autoFocus
                      value={rentForm.renter_name}
                      onChange={(e) => setRentForm({ ...rentForm, renter_name: e.target.value })}
                      className="w-full pl-12 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 focus:ring-2 focus:ring-wiesel-navy outline-none"
                      placeholder="Name der Person"
                    />
                  </div>
                </div>
                <div className="w-full">
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Verliehen am</label>
                  <div className="relative w-full">
                    <Calendar className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
                    <input
                      type="date"
                      required
                      value={rentForm.rented_at}
                      onChange={(e) => setRentForm({ ...rentForm, rented_at: e.target.value })}
                      className="w-full pl-12 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 focus:ring-2 focus:ring-wiesel-navy outline-none"
                    />
                  </div>
                </div>
                <div className="w-full">
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Leihgebühr (€)</label>
                  <input
                    type="number"
                    step="0.50"
                    required
                    value={rentForm.fee_total}
                    onChange={(e) => setRentForm({ ...rentForm, fee_total: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 focus:ring-2 focus:ring-wiesel-navy outline-none"
                    placeholder="0.00"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="paid"
                    checked={rentForm.paid}
                    onChange={(e) => setRentForm({ ...rentForm, paid: e.target.checked })}
                    className="w-5 h-5 rounded border-slate-300 bg-slate-50 text-emerald-600 focus:ring-emerald-500"
                  />
                  <label htmlFor="paid" className="text-sm font-semibold text-slate-700 cursor-pointer">Bereits bezahlt?</label>
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setRentingItem(null)}
                    className="flex-1 bg-slate-100 text-slate-700 font-bold py-4 rounded-xl active:scale-95 transition-all hover:bg-slate-200 cursor-pointer"
                  >
                    Abbrechen
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 bg-wiesel-navy hover:bg-wiesel-navy-hover text-white font-bold py-4 rounded-xl shadow-md active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? 'Verleiht...' : 'Verleihen'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Modal */}
      <AnimatePresence>
        {confirmDelete && (
          <ConfirmModal 
            show={!!confirmDelete}
            title={confirmDelete.title}
            message={confirmDelete.message}
            onConfirm={executeDelete}
            onCancel={() => setConfirmDelete(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

interface ItemCardProps {
  item: EquipmentItem;
  onRent: () => void;
  onReturn?: () => void;
  onMarkPaid?: (paid?: boolean) => void;
  onDelete: () => void;
  onEdit: () => void;
  onToggleBag: () => void;
  inBag: boolean;
}

const ItemCard: React.FC<ItemCardProps> = ({ 
  item, 
  onRent, 
  onReturn, 
  onMarkPaid, 
  onDelete, 
  onEdit, 
  onToggleBag, 
  inBag 
}) => {
  const isRented = item.status === 'verliehen';

  return (
    <div className={`bg-[#252936] rounded-2xl border shadow-lg hover:shadow-2xl transition-all group relative overflow-hidden flex flex-col ${
      isRented ? 'border-amber-500/30' : 'border-slate-700/50'
    }`}>
      {/* Top right actions (Edit & Delete) - always visible on mobile, hover on desktop */}
      <div className="absolute top-2 right-2 flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all z-20">
        <button 
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="p-1.5 bg-[#1C1F2A]/90 backdrop-blur-md text-slate-300 hover:text-blue-400 rounded-lg shadow-lg border border-slate-700"
          title="Bearbeiten"
        >
          <Edit className="w-3.5 h-3.5" />
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1.5 bg-[#1C1F2A]/90 backdrop-blur-md text-slate-300 hover:text-red-400 rounded-lg shadow-lg border border-slate-700"
          title="Löschen"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Top left status badge */}
      <div className="absolute top-2 left-2 z-10">
        {isRented ? (
          <span className="bg-amber-500 text-slate-950 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider shadow">
            Verliehen
          </span>
        ) : (
          <span className="bg-emerald-600 text-white px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider shadow">
            Verfügbar
          </span>
        )}
      </div>
      
      <div className="aspect-square bg-[#1C1F2A] relative overflow-hidden">
        {item.image ? (
          <img 
            src={item.image} 
            alt={item.brand} 
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-800">
            <ImageIcon className="w-8 h-8" />
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-2 pt-4">
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-black text-white tracking-tighter">
              {item.item_code}
            </span>
            <span className="bg-blue-600 text-white px-1.5 py-0.5 rounded text-[10px] font-bold uppercase">
              {item.size}
            </span>
          </div>
        </div>
      </div>

      <div className="p-3 flex-grow flex flex-col justify-between">
        <div className="mb-2">
          <h3 className="font-bold text-sm text-white truncate">{item.brand}</h3>
          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider truncate">{item.category_label}</p>
          {isRented && item.verliehenAn && (
            <p className="text-[11px] text-amber-300/90 font-medium truncate mt-1 flex items-center gap-1" title={`Verliehen an ${item.verliehenAn}`}>
              <User className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{item.verliehenAn}</span>
            </p>
          )}
        </div>
        
        {isRented ? (
          <div className="mt-1 space-y-1.5">
            {item.active_rental_id && onReturn && (
              <button
                onClick={(e) => { e.stopPropagation(); onReturn(); }}
                className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2 rounded-lg active:scale-95 transition-all text-xs flex items-center justify-center gap-1.5 shadow"
                title="Equipment zurücknehmen"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Zurück</span>
              </button>
            )}
            {item.active_rental_id && onMarkPaid && (
              item.bezahlt ? (
                <button
                  onClick={(e) => { e.stopPropagation(); onMarkPaid(false); }}
                  className="w-full py-1 text-[10px] font-bold text-slate-400 hover:text-slate-300 bg-slate-700/20 hover:bg-slate-700/40 rounded-md border border-slate-700/30 transition-all text-center"
                  title="Als offen markieren"
                >
                  Als offen markieren
                </button>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); onMarkPaid(true); }}
                  className="w-full py-1 text-[10px] font-bold text-amber-400/90 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 rounded-md border border-amber-500/20 transition-all text-center"
                  title="Als bezahlt markieren"
                >
                  Als bezahlt markieren
                </button>
              )
            )}
          </div>
        ) : (
          <div className="flex gap-1.5 mt-1">
            <button
              onClick={onToggleBag}
              className={`flex-1 p-2 rounded-lg transition-all flex items-center justify-center ${
                inBag 
                  ? 'bg-blue-600 text-white shadow-inner' 
                  : 'bg-blue-600/10 text-blue-400 border border-blue-500/20 hover:bg-blue-600/20'
              }`}
              title={inBag ? "Aus Tasche entfernen" : "In Tasche hinzufügen"}
            >
              {inBag ? <CheckCircle2 className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
            </button>
            <button
              onClick={onRent}
              className="flex-[2] bg-slate-100 text-[#1C1F2A] font-bold py-2 rounded-lg hover:bg-white active:scale-95 transition-all text-xs flex items-center justify-center gap-1.5"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>Leihen</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

interface HistoryItemProps {
  rental: Rental;
  onMarkAsPaid: (paid?: boolean) => void;
  onDelete: () => void;
}

const HistoryItem: React.FC<HistoryItemProps> = ({ rental, onMarkAsPaid, onDelete }) => {
  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden group">
      <div className="p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center">
              <User className="w-6 h-6 text-wiesel-navy" />
            </div>
            <div>
              <h4 className="text-lg font-bold text-slate-900">{rental.renter_name}</h4>
              <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-400" /> {rental.rented_at}
                </span>
                {rental.returned_at && (
                  <span className="flex items-center gap-1 text-emerald-600">
                    <CheckCircle2 className="w-3 h-3" /> Zurück: {rental.returned_at}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-2xl font-black text-slate-900">{rental.fee_total.toFixed(2)} €</p>
              {rental.paid ? (
                <button 
                  onClick={() => onMarkAsPaid(false)}
                  className="text-[10px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200 uppercase tracking-wider transition-all cursor-pointer"
                  title="Als offen markieren"
                >
                  Bezahlt
                </button>
              ) : (
                <button 
                  onClick={() => onMarkAsPaid(true)}
                  className="text-[10px] font-bold text-red-700 bg-red-50 hover:bg-red-100 px-2 py-0.5 rounded border border-red-200 uppercase tracking-wider transition-all cursor-pointer"
                  title="Als bezahlt markieren"
                >
                  Mark as Paid
                </button>
              )}
            </div>
            <button 
              onClick={onDelete}
              className="p-2 text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {rental.items?.map(item => (
            <div key={item.id} className="flex items-center gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
              <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-200 flex-shrink-0">
                {item.image ? (
                  <img src={item.image} alt={item.brand} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-400">
                    <Package className="w-5 h-5" />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 truncate">{item.brand}</p>
                <p className="text-[10px] text-slate-500 truncate">{item.category_label} • {item.size}</p>
              </div>
            </div>
          ))}
        </div>
        
        {rental.note && (
          <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
            <p className="text-xs text-slate-600 italic">"{rental.note}"</p>
          </div>
        )}
      </div>
    </div>
  );
};

function ConfirmModal({ 
  show, 
  title, 
  message, 
  onConfirm, 
  onCancel, 
  confirmText = "Löschen", 
  cancelText = "Abbrechen",
  isDanger = true 
}: { 
  show: boolean, 
  title: string, 
  message: string, 
  onConfirm: () => void, 
  onCancel: () => void,
  confirmText?: string,
  cancelText?: string,
  isDanger?: boolean
}) {
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="bg-white border border-slate-200 rounded-3xl p-6 max-w-sm w-full shadow-2xl"
      >
        <h3 className="text-xl font-bold text-slate-900 mb-2">{title}</h3>
        <p className="text-slate-600 mb-6 text-sm">{message}</p>
        <div className="flex gap-3">
          <button 
            onClick={onCancel}
            className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-all cursor-pointer"
          >
            {cancelText}
          </button>
          <button 
            onClick={onConfirm}
            className={`flex-1 py-3 font-bold rounded-xl text-white transition-all cursor-pointer ${isDanger ? 'bg-red-600 hover:bg-red-500' : 'bg-wiesel-navy hover:bg-wiesel-navy-hover'}`}
          >
            {confirmText}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label, count }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, count?: number }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all cursor-pointer ${
        active 
          ? 'bg-white text-wiesel-navy shadow-sm' 
          : 'text-slate-300 hover:text-white hover:bg-white/10'
      }`}
    >
      {icon}
      <span>{label}</span>
      {count !== undefined && (
        <span className={`ml-1 text-xs px-2 py-0.5 rounded-full font-bold ${active ? 'bg-wiesel-navy/10 text-wiesel-navy' : 'bg-white/20 text-white'}`}>
          {count}
        </span>
      )}
    </button>
  );
}

function MobileNavItem({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactElement, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 flex-1 py-1.5 transition-colors cursor-pointer ${
        active ? 'text-wiesel-navy font-bold' : 'text-slate-400 hover:text-slate-600'
      }`}
    >
      {React.cloneElement(icon, { className: `w-5 h-5 ${active ? 'text-wiesel-navy' : 'text-slate-400'}` })}
      <span className="text-[10px] tracking-tight">{label}</span>
    </button>
  );
}

function EmptyState({ icon, message }: { icon: React.ReactNode, message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 bg-white rounded-3xl border border-slate-200 border-dashed shadow-sm">
      {icon}
      <p className="text-slate-500 mt-4 font-medium">{message}</p>
    </div>
  );
}

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
  Trash2,
  Camera,
  Upload,
  Image as ImageIcon,
  Edit,
  ShoppingBag,
  Filter,
  X,
  Save,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  RotateCcw
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
  error?: string;
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

  const [rentingItem, setRentingItem] = useState<EquipmentItem | null>(null);

  // Filter States: Status, Category, Size (Search functionality removed per spec)
  const [statusFilter, setStatusFilter] = useState<'all' | 'verfügbar' | 'verliehen'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sizeFilter, setSizeFilter] = useState<string>('all');

  // Accordion state for inventory categories: map category name -> isCollapsed (boolean)
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  // Accordion state for history cards: map rental id -> isExpanded (boolean, default false)
  const [expandedRentals, setExpandedRentals] = useState<Record<number, boolean>>({});

  const totalCount = items.length;
  const availableCount = items.filter(i => i.status === 'verfügbar').length;
  const rentedCount = items.filter(i => i.status === 'verliehen').length;

  // Dynamically compute available categories from existing items in inventory
  const availableCategories = Array.from(
    new Set<string>(items.map(i => i.category_label || i.category).filter((c): c is string => Boolean(c)))
  ).sort((a, b) => a.localeCompare(b, 'de'));

  // Dynamically compute available sizes from existing items in inventory with standard hierarchy
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

  // Subtle reset ONLY resets Category and Size, keeps Status unchanged
  const resetCategoryAndSizeFilters = () => {
    setCategoryFilter('all');
    setSizeFilter('all');
  };

  // Filter Pipeline: items -> Status -> Category -> Size
  const displayedItems = items.filter(item => {
    if (statusFilter !== 'all' && item.status !== statusFilter) {
      return false;
    }
    if (categoryFilter !== 'all' && item.category_label !== categoryFilter && item.category !== categoryFilter) {
      return false;
    }
    if (sizeFilter !== 'all' && item.size.trim().toLowerCase() !== sizeFilter.trim().toLowerCase()) {
      return false;
    }
    return true;
  });

  // Form states
  const [newItem, setNewItem] = useState<{
    category: EquipmentCategory,
    category_label?: string,
    size: string,
    brand: string,
    image: string | null,
    condition_note: string
  }>({
    category: 'Helm',
    category_label: 'Helm',
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
    setError(null);
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
        setError(null);
        sessionStorage.setItem('hockey_rent_password', pass);
        fetchItems(pass);
      } else {
        sessionStorage.removeItem('hockey_rent_password');
        setError(data.message || 'Ungültiges Passwort');
      }
    } catch (err) {
      setError('Verbindungsfehler beim Anmelden');
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
    if (!newItem.category || !newItem.size || !newItem.brand) {
      setError('Bitte Kategorie, Marke und Größe ausfüllen.');
      return;
    }
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
    if (item_ids.length === 0) {
      setError('Die Tasche ist leer.');
      return;
    }
    if (!rentForm.renter_name.trim()) {
      setError('Bitte den Namen des Ausleihers eingeben.');
      return;
    }
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
    if (!rentingItem) return;
    if (!rentForm.renter_name.trim()) {
      setError('Bitte den Namen des Ausleihers eingeben.');
      return;
    }
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

  // Toggle item in bag and auto-collapse the corresponding category accordion section
  const toggleBag = (item: EquipmentItem) => {
    const isCurrentlyInBag = bag.some(i => i.id === item.id);
    const cat = item.category_label || item.category;

    if (isCurrentlyInBag) {
      setBag(prev => prev.filter(i => i.id !== item.id));
    } else {
      setBag(prev => [...prev, item]);
      // Auto-collapse this category to accelerate bundle creation workflow
      if (cat) {
        setCollapsedCategories(prev => ({ ...prev, [cat]: true }));
      }
    }
  };

  const removeFromBag = (id: number) => {
    setBag(prev => prev.filter(i => i.id !== id));
  };

  const clearBag = () => {
    setBag([]);
  };

  const toggleCategoryAccordion = (cat: string) => {
    setCollapsedCategories(prev => ({
      ...prev,
      [cat]: !prev[cat]
    }));
  };

  const toggleRentalAccordion = (rentalId: number) => {
    setExpandedRentals(prev => ({
      ...prev,
      [rentalId]: !prev[rentalId]
    }));
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

  // Group displayed items by category
  const groupedItems = displayedItems.reduce((acc, item) => {
    const cat = item.category_label || item.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, EquipmentItem[]>);

  // LOGGED-OUT PUBLIC VIEW (Fully aligned with dark design palette #1C1F2A / #252936)
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-[#1C1F2A] text-slate-200 font-sans">
        <header className="bg-[#181B24] border-b border-slate-800 sticky top-0 z-30 shadow-md">
          <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-blue-600/20 rounded-lg flex items-center justify-center border border-blue-500/30">
                <Package className="text-blue-400 w-5 h-5" />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-white">Wiesel HockeyRent</h1>
            </div>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
              <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">Wiesel HockeyRent</h2>
              <p className="text-slate-400 mt-1">Hier siehst du alle Ausrüstungsteile, die aktuell zur Verfügung stehen.</p>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/25 px-4 py-2 rounded-2xl flex items-center gap-2 self-start md:self-auto">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span className="text-emerald-400 font-bold text-sm uppercase tracking-wider">{publicItems.length} Verfügbar</span>
            </div>
          </div>

          {publicItems.length === 0 ? (
            <EmptyState icon={<Package className="w-12 h-12 text-slate-500" />} message="Aktuell ist kein Equipment verfügbar." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {publicItems.map(item => (
                <div key={item.id} className="bg-[#252936] rounded-3xl border border-slate-700/50 shadow-lg overflow-hidden group">
                  <div className="aspect-[4/3] bg-[#181B24] relative overflow-hidden">
                    {item.image ? (
                      <img 
                        src={item.image} 
                        alt={item.brand} 
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-600">
                        <ImageIcon className="w-16 h-16" />
                      </div>
                    )}
                    <div className="absolute top-4 right-4">
                      <span className="bg-[#181B24]/90 backdrop-blur-md text-white border border-slate-700 px-3 py-1 rounded-full text-xs font-bold shadow">
                        {item.item_code}
                      </span>
                    </div>
                  </div>
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-xl font-bold text-white">{item.category_label}</h3>
                      <span className="text-xs font-semibold text-slate-400">{item.brand}</span>
                    </div>
                    <div className="flex items-center justify-between mt-4">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                        <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Verfügbar</span>
                      </div>
                      <span className="text-xs font-bold text-slate-300 bg-[#181B24] px-2 py-0.5 rounded-md border border-slate-700">
                        Größe: {item.size}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-16 p-8 bg-[#252936] rounded-3xl border border-slate-700/50 shadow-xl text-center">
            <h3 className="text-xl font-bold text-white mb-2">Admin-Bereich</h3>
            <p className="text-slate-400 mb-6 max-w-md mx-auto text-sm">
              Um Equipment zu verleihen oder den Bestand zu verwalten, logge dich bitte mit deinem Passwort ein.
            </p>
            <div className="max-w-xs mx-auto">
              <form onSubmit={(e) => { e.preventDefault(); checkLogin(password); }} className="space-y-4">
                {/* Mobile zoom safe: font-size is text-base (16px) on mobile */}
                <input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  className="w-full px-4 py-3 rounded-xl bg-[#181B24] border border-slate-700 text-base text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  placeholder="Passwort eingeben"
                />
                {error && <p className="text-red-400 text-sm font-medium">{error}</p>}
                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
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

  // LOGGED-IN ADMIN VIEW
  return (
    <div className="min-h-screen bg-[#1C1F2A] text-slate-200 font-sans pb-24 md:pb-8">
      {/* Header */}
      <header className="bg-[#181B24] border-b border-slate-800 text-white sticky top-0 z-30 shadow-md">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-600/20 rounded-lg flex items-center justify-center border border-blue-500/30">
              <Package className="text-blue-400 w-5 h-5" />
            </div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg md:text-xl font-bold tracking-tight text-white">Wiesel HockeyRent</h1>
              <span className="text-[10px] md:text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-blue-300 border border-slate-700">Admin</span>
            </div>
          </div>
          
          <nav className="hidden md:flex items-center gap-1.5">
            <TabButton active={currentView === 'available'} onClick={() => setCurrentView('available')} icon={<Package className="w-4 h-4" />} label="Bestand" />
            <TabButton active={currentView === 'bag'} onClick={() => setCurrentView('bag')} icon={<ShoppingBag className="w-4 h-4" />} label="Tasche" count={bag.length} />
            <TabButton active={currentView === 'history'} onClick={() => setCurrentView('history')} icon={<History className="w-4 h-4" />} label="Historie" />
            <TabButton active={currentView === 'add'} onClick={() => setCurrentView('add')} icon={<Plus className="w-4 h-4" />} label="Neu" />
            <button 
              onClick={handleLogout}
              className="ml-2 p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
              title="Abmelden"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </nav>

          <button 
            onClick={handleLogout}
            className="md:hidden p-2 text-slate-400 hover:text-red-400 transition-all cursor-pointer"
            title="Abmelden"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 md:py-8">
        {/* Error Messages (Keine redundanten Erfolgsmeldungen mehr) */}
        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-6 p-4 bg-red-950/70 border border-red-800/80 rounded-2xl text-red-200 flex items-center justify-between shadow-lg"
            >
              <div className="flex items-center gap-2.5">
                <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                <span className="font-medium text-sm">{error}</span>
              </div>
              <button 
                onClick={() => setError(null)} 
                className="text-red-400 hover:text-red-200 p-1 cursor-pointer"
                title="Fehler schließen"
              >
                <X className="w-4 h-4" />
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
                  <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">Bestand</h2>
                  <p className="text-xs md:text-sm text-slate-400 mt-0.5">
                    Ausrüstungsbestand im Überblick
                  </p>
                </div>
                {bag.length > 0 && (
                  <button 
                    onClick={() => setCurrentView('bag')}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-2 md:px-4 md:py-2.5 rounded-xl font-bold text-xs md:text-sm flex items-center gap-2 shadow-lg transition-all active:scale-95 flex-shrink-0 cursor-pointer"
                  >
                    <ShoppingBag className="w-4 h-4 text-emerald-300" />
                    <span>Tasche ({bag.length})</span>
                  </button>
                )}
              </div>

              {/* 2. Kompakte Bestandszahlen & Statusfilter */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`p-3 sm:p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    statusFilter === 'all'
                      ? 'bg-blue-600/20 text-white border-blue-500 shadow-md ring-1 ring-blue-500/40'
                      : 'bg-[#252936] border-slate-700/60 text-slate-300 hover:border-slate-600 hover:bg-[#282D3B]'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-1">
                    <span className={statusFilter === 'all' ? 'text-blue-300' : 'text-slate-400'}>Gesamt</span>
                    <Package className={`w-3.5 h-3.5 ${statusFilter === 'all' ? 'text-blue-300' : 'text-slate-500'}`} />
                  </div>
                  <div className="text-xl sm:text-2xl font-black text-white">{totalCount}</div>
                </button>

                <button
                  type="button"
                  onClick={() => setStatusFilter('verfügbar')}
                  className={`p-3 sm:p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    statusFilter === 'verfügbar'
                      ? 'bg-emerald-500/20 text-white border-emerald-500 shadow-md ring-1 ring-emerald-500/40'
                      : 'bg-[#252936] border-slate-700/60 text-slate-300 hover:border-slate-600 hover:bg-[#282D3B]'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-1">
                    <span className={`flex items-center gap-1.5 ${statusFilter === 'verfügbar' ? 'text-emerald-300' : 'text-emerald-400'}`}>
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                      Verfügbar
                    </span>
                    <CheckCircle2 className={`w-3.5 h-3.5 ${statusFilter === 'verfügbar' ? 'text-emerald-300' : 'text-emerald-400'}`} />
                  </div>
                  <div className="text-xl sm:text-2xl font-black text-white">{availableCount}</div>
                </button>

                <button
                  type="button"
                  onClick={() => setStatusFilter('verliehen')}
                  className={`p-3 sm:p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    statusFilter === 'verliehen'
                      ? 'bg-amber-500/20 text-white border-amber-500 shadow-md ring-1 ring-amber-500/40'
                      : 'bg-[#252936] border-slate-700/60 text-slate-300 hover:border-slate-600 hover:bg-[#282D3B]'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-1">
                    <span className={`flex items-center gap-1.5 ${statusFilter === 'verliehen' ? 'text-amber-300' : 'text-amber-400'}`}>
                      <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                      Verliehen
                    </span>
                    <ArrowRightLeft className={`w-3.5 h-3.5 ${statusFilter === 'verliehen' ? 'text-amber-300' : 'text-amber-400'}`} />
                  </div>
                  <div className="text-xl sm:text-2xl font-black text-white">{rentedCount}</div>
                </button>
              </div>

              {/* 3. Filterleiste: Kategorie & Größe (Suchfeld entfernt, iOS-Zoom geschützt) */}
              <div className="bg-[#252936] p-3.5 md:p-4 rounded-2xl border border-slate-700/60 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 flex-1 max-w-xl">
                  {/* Kategorie Dropdown */}
                  <div className="relative">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <select
                      aria-label="Kategorie filtern"
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      /* text-base on mobile to avoid iOS Safari zoom, sm:text-sm on desktop */
                      className={`w-full pl-9 pr-8 py-2.5 rounded-xl border text-base sm:text-sm font-medium outline-none transition-all appearance-none cursor-pointer truncate ${
                        categoryFilter !== 'all'
                          ? 'bg-[#181B24] border-blue-500 text-blue-300 font-bold'
                          : 'bg-[#181B24] border-slate-700 text-slate-300 hover:border-slate-600 focus:border-blue-500'
                      }`}
                    >
                      <option value="all">Alle Kategorien</option>
                      {availableCategories.map(cat => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>

                  {/* Größe Dropdown */}
                  <div className="relative">
                    <select
                      aria-label="Größe filtern"
                      value={sizeFilter}
                      onChange={(e) => setSizeFilter(e.target.value)}
                      /* text-base on mobile to avoid iOS Safari zoom, sm:text-sm on desktop */
                      className={`w-full pl-3.5 pr-8 py-2.5 rounded-xl border text-base sm:text-sm font-medium outline-none transition-all appearance-none cursor-pointer truncate ${
                        sizeFilter !== 'all'
                          ? 'bg-[#181B24] border-blue-500 text-blue-300 font-bold'
                          : 'bg-[#181B24] border-slate-700 text-slate-300 hover:border-slate-600 focus:border-blue-500'
                      }`}
                    >
                      <option value="all">Alle Größen</option>
                      {availableSizes.map(sz => (
                        <option key={sz} value={sz}>
                          Größe: {sz}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                {/* Dezent "Filter zurücksetzen" - setzt NUR Kategorie & Größe zurück, Status bleibt unverändert */}
                {hasActiveExtraFilters && (
                  <button
                    type="button"
                    onClick={resetCategoryAndSizeFilters}
                    className="text-xs font-semibold text-slate-400 hover:text-white bg-[#181B24] hover:bg-[#282D3B] border border-slate-700 px-3.5 py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer self-start sm:self-auto"
                    title="Kategorie- und Größenfilter zurücksetzen"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                    <span>Filter zurücksetzen</span>
                  </button>
                )}
              </div>

              {/* 4. Equipment-Liste nach Kategorien gruppiert mit Accordion */}
              {displayedItems.length === 0 ? (
                <EmptyState 
                  icon={<Package className="w-12 h-12 text-slate-500" />} 
                  message={
                    hasActiveExtraFilters || statusFilter !== 'all'
                      ? "Für diese Filterkombination wurden keine Ausrüstungsteile gefunden."
                      : "Kein Equipment im Bestand vorhanden."
                  } 
                />
              ) : (
                <div className="space-y-4">
                  {Object.entries(groupedItems)
                    .sort(([a], [b]) => a.localeCompare(b, 'de'))
                    .map(([category, catItems]) => {
                      const isCollapsed = !!collapsedCategories[category];
                      const selectedInBag = bag.filter(b => (b.category_label || b.category) === category);
                      const hasSelectedInBag = selectedInBag.length > 0;

                      return (
                        <div 
                          key={category} 
                          className="bg-[#252936] rounded-2xl border border-slate-700/60 overflow-hidden shadow-md transition-all"
                        >
                          {/* Accordion Header (große Touch-Fläche) */}
                          <button
                            type="button"
                            onClick={() => toggleCategoryAccordion(category)}
                            className="w-full px-4 py-3.5 sm:px-5 sm:py-4 flex items-center justify-between text-left hover:bg-[#282D3B] transition-colors cursor-pointer group"
                            aria-expanded={!isCollapsed}
                          >
                            <div className="flex items-center gap-3 min-w-0 pr-2">
                              <div className="p-1 rounded-lg bg-[#181B24] text-slate-400 group-hover:text-white transition-colors">
                                {isCollapsed ? (
                                  <ChevronDown className="w-4 h-4" />
                                ) : (
                                  <ChevronUp className="w-4 h-4" />
                                )}
                              </div>
                              <h3 className="text-base sm:text-lg font-bold text-white tracking-tight truncate">
                                {category}
                              </h3>
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#181B24] text-slate-400 border border-slate-700 flex-shrink-0">
                                {catItems.length}
                              </span>
                            </div>

                            {/* Status-Hinweis: Ausgewählte Gegenstände in der Tasche */}
                            {hasSelectedInBag && (
                              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 rounded-lg flex-shrink-0">
                                <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                                <span className="hidden sm:inline">
                                  {selectedInBag.length === 1 
                                    ? `In Tasche: ${selectedInBag[0].brand} · ${selectedInBag[0].size} · ${selectedInBag[0].item_code}` 
                                    : `${selectedInBag.length} in Tasche`}
                                </span>
                                <span className="sm:hidden">
                                  {selectedInBag.length} in Tasche
                                </span>
                              </div>
                            )}
                          </button>

                          {/* Accordion Body: Equipment-Karten */}
                          {!isCollapsed && (
                            <div className="p-3.5 sm:p-5 pt-1 border-t border-slate-800/80">
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
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </motion.div>
          )}

          {/* TASCHE VIEW */}
          {currentView === 'bag' && (
            <motion.div 
              key="bag"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              <div className="mb-2">
                <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">Deine Tasche</h2>
                <p className="text-slate-400 mt-1">Hier sammelst du Equipment für einen gemeinsamen Verleih.</p>
              </div>

              {bag.length === 0 ? (
                <div className="text-center py-16 bg-[#252936] rounded-3xl border border-dashed border-slate-700 shadow-md">
                  <ShoppingBag className="w-16 h-16 text-slate-500 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-white mb-2">Deine Tasche ist leer</h3>
                  <p className="text-slate-400 mb-6">Füge Equipment aus dem Bestand hinzu, um es zu verleihen.</p>
                  <button 
                    onClick={() => setCurrentView('available')}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-md cursor-pointer"
                  >
                    Zum Bestand
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 space-y-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-lg font-bold text-white">{bag.length} Teile ausgewählt</h3>
                      <button onClick={clearBag} className="text-sm text-red-400 hover:text-red-300 font-medium cursor-pointer">
                        Alle entfernen
                      </button>
                    </div>
                    {bag.map(item => (
                      <div key={item.id} className="bg-[#252936] p-4 rounded-2xl border border-slate-700/60 shadow-md flex items-center gap-4">
                        <div className="w-16 h-16 rounded-xl bg-[#181B24] border border-slate-700/80 overflow-hidden flex-shrink-0">
                          {item.image ? (
                            <img src={item.image} alt={item.brand} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-600">
                              <ImageIcon className="w-6 h-6" />
                            </div>
                          )}
                        </div>
                        <div className="flex-grow min-w-0">
                          <div className="flex items-center justify-between">
                            <h4 className="font-bold text-white truncate">{item.category_label}</h4>
                            <button onClick={() => removeFromBag(item.id)} className="text-slate-400 hover:text-red-400 transition-all p-1 cursor-pointer">
                              <X className="w-5 h-5" />
                            </button>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <span className="text-xs text-slate-300 font-medium">{item.brand}</span>
                            <span className="text-xs text-slate-400">Größe: {item.size}</span>
                            <span className="text-[10px] font-mono text-slate-300 bg-[#181B24] px-1.5 py-0.5 rounded border border-slate-700">{item.item_code}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="bg-[#252936] p-6 rounded-3xl border border-slate-700/60 shadow-xl h-fit sticky top-24">
                    <h3 className="text-xl font-bold text-white mb-6">Verleih-Details</h3>
                    <form onSubmit={(e) => { e.preventDefault(); handleRentItems(); }} className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">
                          Name des Ausleihers
                        </label>
                        {/* Mobile zoom safe font size: text-base sm:text-sm */}
                        <input
                          required
                          type="text"
                          value={rentForm.renter_name}
                          onChange={(e) => setRentForm({ ...rentForm, renter_name: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl bg-[#181B24] border border-slate-700 text-base sm:text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                          placeholder="z.B. Max Mustermann"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">
                          Leihgebühr (€)
                        </label>
                        {/* Mobile zoom safe font size: text-base sm:text-sm */}
                        <input
                          required
                          type="number"
                          step="0.50"
                          value={rentForm.fee_total}
                          onChange={(e) => setRentForm({ ...rentForm, fee_total: parseFloat(e.target.value) })}
                          className="w-full px-4 py-3 rounded-xl bg-[#181B24] border border-slate-700 text-base sm:text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">
                          Notiz (Optional)
                        </label>
                        {/* Mobile zoom safe font size: text-base sm:text-sm */}
                        <textarea
                          value={rentForm.note}
                          onChange={(e) => setRentForm({ ...rentForm, note: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl bg-[#181B24] border border-slate-700 text-base sm:text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none"
                          placeholder="Zusätzliche Infos..."
                          rows={3}
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-4 rounded-2xl shadow-lg transition-all active:scale-95 mt-4 flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {loading ? 'Wird verarbeitet...' : (
                          <>
                            <CheckCircle className="w-5 h-5 text-emerald-300" />
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

          {/* HISTORIE VIEW: Kompakt per Accordion */}
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
                  <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">Historie</h2>
                  <p className="text-slate-400 mt-1">Alle vergangenen und aktuellen Verleihvorgänge.</p>
                </div>
                <div className="bg-[#252936] border border-slate-700/60 px-4 py-2.5 rounded-2xl shadow-md flex items-center gap-3">
                  <span className="text-slate-400 text-xs sm:text-sm font-bold uppercase tracking-wider">Einnahmen:</span>
                  <span className="text-emerald-400 font-black text-lg">
                    {history.filter(r => r.paid).reduce((sum, r) => sum + r.fee_total, 0).toFixed(2)} €
                  </span>
                </div>
              </div>

              {history.length === 0 ? (
                <EmptyState icon={<Calendar className="w-12 h-12 text-slate-500" />} message="Noch keine Historie vorhanden." />
              ) : (
                <div className="space-y-3">
                  {history.map(rental => (
                    <CompactHistoryCard
                      key={rental.id}
                      rental={rental}
                      isExpanded={!!expandedRentals[rental.id]}
                      onToggle={() => toggleRentalAccordion(rental.id)}
                      onMarkAsPaid={(paidState?: boolean) => handleMarkAsPaid(rental.id, paidState !== undefined ? paidState : !rental.paid)}
                      onDelete={() => setConfirmDelete({ type: 'history', id: rental.id, title: 'Eintrag löschen?', message: 'Möchtest du diesen Verlaufseintrag wirklich löschen?' })}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ADD / EDIT VIEW */}
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
                  <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                    {editItem ? 'Equipment bearbeiten' : 'Neues Equipment'}
                  </h2>
                  <p className="text-slate-400 mt-1">Füge neue Ausrüstung zum Bestand hinzu.</p>
                </div>
                <button 
                  onClick={() => { setEditItem(null); setCurrentView('available'); }}
                  className="p-2 text-slate-400 hover:text-white transition-all cursor-pointer"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="bg-[#252936] rounded-3xl border border-slate-700/60 overflow-hidden shadow-xl">
                <form onSubmit={(e) => { e.preventDefault(); editItem ? handleEditItem(e) : handleAddItem(e); }} className="p-6 sm:p-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
                    <div className="space-y-5">
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Kategorie</label>
                        {/* Mobile zoom safe font size: text-base md:text-sm */}
                        <select
                          required
                          value={editItem ? editItem.category : newItem.category}
                          onChange={(e) => {
                            const cat = e.target.value as EquipmentCategory;
                            const label = CATEGORIES.find(c => c.value === cat)?.label || '';
                            if (editItem) setEditItem({ ...editItem, category: cat, category_label: label });
                            else setNewItem({ ...newItem, category: cat, category_label: label });
                          }}
                          className="w-full px-4 py-3 rounded-xl bg-[#181B24] border border-slate-700 text-base md:text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all appearance-none cursor-pointer"
                        >
                          <option value="" disabled>Kategorie wählen...</option>
                          <optgroup label="Feldspieler" className="bg-[#181B24] text-white">
                            {CATEGORIES.filter(c => c.type === 'Feldspieler').map(c => (
                              <option key={c.value} value={c.value}>{c.label}</option>
                            ))}
                          </optgroup>
                          <optgroup label="Goalie" className="bg-[#181B24] text-white">
                            {CATEGORIES.filter(c => c.type === 'Goalie').map(c => (
                              <option key={c.value} value={c.value}>{c.label}</option>
                            ))}
                          </optgroup>
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Marke</label>
                          {/* Mobile zoom safe font size: text-base md:text-sm */}
                          <input
                            required
                            type="text"
                            value={editItem ? editItem.brand : newItem.brand}
                            onChange={(e) => editItem ? setEditItem({ ...editItem, brand: e.target.value }) : setNewItem({ ...newItem, brand: e.target.value })}
                            className="w-full px-4 py-3 rounded-xl bg-[#181B24] border border-slate-700 text-base md:text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            placeholder="z.B. Bauer"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Größe</label>
                          {/* Mobile zoom safe font size: text-base md:text-sm */}
                          <input
                            required
                            type="text"
                            value={editItem ? editItem.size : newItem.size}
                            onChange={(e) => editItem ? setEditItem({ ...editItem, size: e.target.value }) : setNewItem({ ...newItem, size: e.target.value })}
                            className="w-full px-4 py-3 rounded-xl bg-[#181B24] border border-slate-700 text-base md:text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            placeholder="z.B. L"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Zustand / Notiz</label>
                        {/* Mobile zoom safe font size: text-base md:text-sm */}
                        <textarea
                          value={editItem ? (editItem.condition_note || '') : newItem.condition_note}
                          onChange={(e) => editItem ? setEditItem({ ...editItem, condition_note: e.target.value }) : setNewItem({ ...newItem, condition_note: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl bg-[#181B24] border border-slate-700 text-base md:text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none"
                          placeholder="Besonderheiten zum Zustand..."
                          rows={3}
                        />
                      </div>
                    </div>

                    <div className="space-y-5">
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Foto</label>
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
                            className="block aspect-[4/3] rounded-2xl border-2 border-dashed border-slate-700 hover:border-blue-500 bg-[#181B24] cursor-pointer transition-all overflow-hidden relative"
                          >
                            {(editItem?.image || newItem.image) ? (
                              <>
                                <img 
                                  src={(editItem ? editItem.image : newItem.image) || undefined} 
                                  alt="Vorschau" 
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                                  <p className="text-white font-bold text-sm">Bild ändern</p>
                                </div>
                              </>
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center text-slate-500">
                                <ImageIcon className="w-12 h-12 mb-2" />
                                <p className="text-sm font-medium">Bild hochladen</p>
                              </div>
                            )}
                          </label>
                        </div>
                      </div>

                      <div className="pt-2">
                        <button
                          type="submit"
                          disabled={loading}
                          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-4 rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                        >
                          {loading ? 'Speichert...' : (
                            <>
                              <Save className="w-5 h-5 text-emerald-300" />
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
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#181B24] border-t border-slate-800 px-4 py-2 flex justify-around items-center z-40 shadow-2xl">
        <MobileNavItem active={currentView === 'available'} onClick={() => setCurrentView('available')} icon={<Package />} label="Bestand" />
        <MobileNavItem active={currentView === 'bag'} onClick={() => setCurrentView('bag')} icon={<ShoppingBag />} label="Tasche" count={bag.length} />
        <MobileNavItem active={currentView === 'add'} onClick={() => setCurrentView('add')} icon={<Plus />} label="Neu" />
        <MobileNavItem active={currentView === 'history'} onClick={() => setCurrentView('history')} icon={<History />} label="Historie" />
      </nav>

      {/* Rent Modal (Single Item) */}
      <AnimatePresence>
        {rentingItem && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-[#252936] w-full max-w-md rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-700/80"
            >
              <h3 className="text-xl sm:text-2xl font-bold mb-4 text-white">Equipment verleihen</h3>
              <p className="text-xs text-slate-400 mb-6 font-mono bg-[#181B24] p-2 rounded-lg border border-slate-700">
                {rentingItem.category_label} · {rentingItem.brand} (Größe {rentingItem.size}) · {rentingItem.item_code}
              </p>
              <form onSubmit={handleRentSingleItem} className="space-y-4">
                <div className="w-full">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Verliehen an</label>
                  <div className="relative w-full">
                    <User className="absolute left-3.5 top-3.5 w-5 h-5 text-slate-400 pointer-events-none" />
                    {/* Mobile zoom safe font size: text-base sm:text-sm */}
                    <input
                      type="text"
                      required
                      autoFocus
                      value={rentForm.renter_name}
                      onChange={(e) => setRentForm({ ...rentForm, renter_name: e.target.value })}
                      className="w-full pl-11 pr-4 py-3 rounded-xl bg-[#181B24] border border-slate-700 text-base sm:text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="Name der Person"
                    />
                  </div>
                </div>

                <div className="w-full">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Verliehen am</label>
                  <div className="relative w-full">
                    <Calendar className="absolute left-3.5 top-3.5 w-5 h-5 text-slate-400 pointer-events-none" />
                    {/* Mobile zoom safe font size: text-base sm:text-sm */}
                    <input
                      type="date"
                      required
                      value={rentForm.rented_at}
                      onChange={(e) => setRentForm({ ...rentForm, rented_at: e.target.value })}
                      className="w-full pl-11 pr-4 py-3 rounded-xl bg-[#181B24] border border-slate-700 text-base sm:text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>

                <div className="w-full">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Leihgebühr (€)</label>
                  {/* Mobile zoom safe font size: text-base sm:text-sm */}
                  <input
                    type="number"
                    step="0.50"
                    required
                    value={rentForm.fee_total}
                    onChange={(e) => setRentForm({ ...rentForm, fee_total: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-[#181B24] border border-slate-700 text-base sm:text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="0.00"
                  />
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <input
                    type="checkbox"
                    id="paid"
                    checked={rentForm.paid}
                    onChange={(e) => setRentForm({ ...rentForm, paid: e.target.checked })}
                    className="w-5 h-5 rounded border-slate-700 bg-[#181B24] text-emerald-500 focus:ring-emerald-500"
                  />
                  <label htmlFor="paid" className="text-sm font-semibold text-slate-300 cursor-pointer">
                    Bereits bezahlt?
                  </label>
                </div>

                <div className="flex gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => setRentingItem(null)}
                    className="flex-1 bg-[#181B24] text-slate-300 font-bold py-3.5 rounded-xl active:scale-95 transition-all hover:bg-slate-800 border border-slate-700 cursor-pointer"
                  >
                    Abbrechen
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-xl shadow-lg active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? 'Verleiht...' : 'Verleihen'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
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

// ITEM CARD COMPONENT
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
      isRented ? 'border-amber-500/30' : inBag ? 'border-blue-500 ring-1 ring-blue-500/40' : 'border-slate-700/60'
    }`}>
      {/* Top right actions (Edit & Delete) - visible on hover or mobile tap */}
      <div className="absolute top-2 right-2 flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all z-20">
        <button 
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="p-1.5 bg-[#181B24]/90 backdrop-blur-md text-slate-300 hover:text-blue-400 rounded-lg shadow-lg border border-slate-700 cursor-pointer"
          title="Bearbeiten"
        >
          <Edit className="w-3.5 h-3.5" />
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1.5 bg-[#181B24]/90 backdrop-blur-md text-slate-300 hover:text-red-400 rounded-lg shadow-lg border border-slate-700 cursor-pointer"
          title="Löschen"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Top left status badge */}
      <div className="absolute top-2 left-2 z-10">
        {isRented ? (
          <span className="bg-amber-500/90 backdrop-blur-sm text-slate-950 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider shadow">
            Verliehen
          </span>
        ) : (
          <span className="bg-emerald-600/90 backdrop-blur-sm text-white px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider shadow">
            Verfügbar
          </span>
        )}
      </div>
      
      {/* Item Image */}
      <div className="aspect-square bg-[#181B24] relative overflow-hidden">
        {item.image ? (
          <img 
            src={item.image} 
            alt={item.brand} 
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-700">
            <ImageIcon className="w-8 h-8" />
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-2 pt-4">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-black text-white tracking-tight">
              {item.item_code}
            </span>
            <span className="bg-blue-600 text-white px-1.5 py-0.5 rounded text-[10px] font-bold uppercase">
              {item.size}
            </span>
          </div>
        </div>
      </div>

      {/* Item Info & Actions */}
      <div className="p-3 flex-grow flex flex-col justify-between">
        <div className="mb-2">
          <h3 className="font-bold text-sm text-white truncate">{item.brand}</h3>
          <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider truncate">{item.category_label}</p>
          {isRented && item.verliehenAn && (
            <p className="text-[11px] text-amber-300 font-medium truncate mt-1 flex items-center gap-1" title={`Verliehen an ${item.verliehenAn}`}>
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
                className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2 rounded-lg active:scale-95 transition-all text-xs flex items-center justify-center gap-1.5 shadow cursor-pointer"
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
                  className="w-full py-1 text-[10px] font-bold text-slate-400 hover:text-slate-300 bg-slate-800/60 hover:bg-slate-800 rounded-md border border-slate-700 transition-all text-center cursor-pointer"
                  title="Als offen markieren"
                >
                  Als offen markieren
                </button>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); onMarkPaid(true); }}
                  className="w-full py-1 text-[10px] font-bold text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 rounded-md border border-amber-500/30 transition-all text-center cursor-pointer"
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
              className={`flex-1 p-2 rounded-lg transition-all flex items-center justify-center cursor-pointer ${
                inBag 
                  ? 'bg-blue-600 text-white shadow-inner' 
                  : 'bg-blue-600/15 text-blue-400 border border-blue-500/30 hover:bg-blue-600/25'
              }`}
              title={inBag ? "Aus Tasche entfernen" : "In Tasche hinzufügen"}
            >
              {inBag ? <CheckCircle2 className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
            </button>
            <button
              onClick={onRent}
              className="flex-[2] bg-slate-100 hover:bg-white text-[#1C1F2A] font-bold py-2 rounded-lg active:scale-95 transition-all text-xs flex items-center justify-center gap-1.5 shadow cursor-pointer"
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

// COMPACT HISTORY CARD ACCORDION COMPONENT
interface CompactHistoryCardProps {
  rental: Rental;
  isExpanded: boolean;
  onToggle: () => void;
  onMarkAsPaid: (paid?: boolean) => void;
  onDelete: () => void;
}

const CompactHistoryCard: React.FC<CompactHistoryCardProps> = ({
  rental,
  isExpanded,
  onToggle,
  onMarkAsPaid,
  onDelete
}) => {
  const itemCount = rental.items?.length || 0;

  return (
    <div className="bg-[#252936] rounded-2xl border border-slate-700/60 shadow-md overflow-hidden transition-all">
      {/* Kompakte Kopfzeile / Zeile (immer sichtbar) */}
      <div 
        onClick={onToggle}
        className="p-3.5 sm:p-4 flex items-center justify-between gap-3 cursor-pointer hover:bg-[#282D3B] transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#181B24] border border-slate-700 flex items-center justify-center flex-shrink-0">
            <User className="w-4 h-4 text-blue-400" />
          </div>
          <div className="min-w-0">
            <h4 className="text-sm sm:text-base font-bold text-white truncate">
              {rental.renter_name}
            </h4>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400 mt-0.5">
              <span>{rental.rented_at}</span>
              <span>•</span>
              <span>{itemCount} {itemCount === 1 ? 'Teil' : 'Teile'}</span>
              <span>•</span>
              <span className="font-bold text-slate-200">{rental.fee_total.toFixed(2)} €</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {/* Status Badge */}
          {rental.paid ? (
            <span className="text-[10px] sm:text-xs font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-md uppercase tracking-wider">
              Bezahlt
            </span>
          ) : (
            <span className="text-[10px] sm:text-xs font-bold text-red-300 bg-red-500/15 border border-red-500/30 px-2 py-0.5 rounded-md uppercase tracking-wider">
              Offen
            </span>
          )}

          {/* Chevron indicator */}
          <div className="p-1 rounded-lg bg-[#181B24] text-slate-400">
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </div>
        </div>
      </div>

      {/* Aufgeklappter Detailbereich (standardmäßig eingeklappt) */}
      {isExpanded && (
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-[#1F2330] space-y-4">
          {/* Status- & Datumsleiste */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-[#181B24] p-3 rounded-xl border border-slate-700/60">
            <div className="flex flex-wrap items-center gap-3 text-slate-300">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-400" />
                <span>Verliehen: <strong>{rental.rented_at}</strong></span>
              </span>
              {rental.returned_at ? (
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Zurück: <strong>{rental.returned_at}</strong></span>
                </span>
              ) : (
                <span className="text-amber-400 font-semibold">
                  (Aktuell verliehen)
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {rental.paid ? (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onMarkAsPaid(false); }}
                  className="px-2.5 py-1 text-xs font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-all cursor-pointer"
                  title="Als offen markieren"
                >
                  Als offen markieren
                </button>
              ) : (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onMarkAsPaid(true); }}
                  className="px-2.5 py-1 text-xs font-bold text-emerald-300 bg-emerald-500/20 hover:bg-emerald-500/30 rounded-lg border border-emerald-500/40 transition-all cursor-pointer"
                  title="Als bezahlt markieren"
                >
                  Als bezahlt markieren
                </button>
              )}

              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="p-1 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                title="Eintrag löschen"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Konkrete ausgeliehene Ausrüstungsteile */}
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Ausgeliehene Ausrüstung ({rental.items?.length || 0}):
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {rental.items?.map(item => (
                <div key={item.id} className="flex items-center gap-3 bg-[#181B24] p-2.5 rounded-xl border border-slate-700/60">
                  <div className="w-9 h-9 rounded-lg overflow-hidden bg-[#252936] border border-slate-700 flex-shrink-0">
                    {item.image ? (
                      <img src={item.image} alt={item.brand} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-600">
                        <Package className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-white truncate">{item.category_label}</p>
                    <p className="text-[11px] text-slate-400 truncate">{item.brand} · Gr. {item.size} · {item.item_code}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notiz falls vorhanden */}
          {rental.note && (
            <div className="p-3 bg-[#181B24] rounded-xl border border-slate-700/60">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Notiz:</span>
              <p className="text-xs text-slate-300 italic">"{rental.note}"</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// CONFIRM MODAL
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="bg-[#252936] border border-slate-700 rounded-3xl p-6 max-w-sm w-full shadow-2xl text-left"
      >
        <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
        <p className="text-slate-300 mb-6 text-sm leading-relaxed">{message}</p>
        <div className="flex gap-3">
          <button 
            onClick={onCancel}
            className="flex-1 py-3 bg-[#181B24] hover:bg-[#282D3B] text-slate-300 border border-slate-700 font-bold rounded-xl transition-all cursor-pointer"
          >
            {cancelText}
          </button>
          <button 
            onClick={onConfirm}
            className={`flex-1 py-3 font-bold rounded-xl text-white transition-all shadow-md cursor-pointer ${
              isDanger ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// TAB BUTTON (Desktop Header)
function TabButton({ active, onClick, icon, label, count }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, count?: number }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all cursor-pointer ${
        active 
          ? 'bg-blue-600 text-white shadow-sm' 
          : 'text-slate-400 hover:text-white hover:bg-slate-800'
      }`}
    >
      {icon}
      <span>{label}</span>
      {count !== undefined && count > 0 && (
        <span className={`ml-1 text-xs px-2 py-0.5 rounded-full font-bold ${active ? 'bg-white text-blue-600' : 'bg-blue-600 text-white'}`}>
          {count}
        </span>
      )}
    </button>
  );
}

// MOBILE NAV ITEM
function MobileNavItem({ active, onClick, icon, label, count }: { active: boolean, onClick: () => void, icon: React.ReactElement<any>, label: string, count?: number }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 flex-1 py-1.5 transition-colors relative cursor-pointer ${
        active ? 'text-blue-400 font-bold' : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      <div className="relative">
        {React.cloneElement(icon, { className: `w-5 h-5 ${active ? 'text-blue-400' : 'text-slate-400'}` })}
        {count !== undefined && count > 0 && (
          <span className="absolute -top-1 -right-2 bg-blue-600 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center">
            {count}
          </span>
        )}
      </div>
      <span className="text-[10px] tracking-tight">{label}</span>
    </button>
  );
}

// EMPTY STATE COMPONENT
function EmptyState({ icon, message }: { icon: React.ReactNode, message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 bg-[#252936] rounded-3xl border border-slate-700/60 border-dashed shadow-md text-center">
      {icon}
      <p className="text-slate-400 mt-4 font-medium max-w-sm">{message}</p>
    </div>
  );
}

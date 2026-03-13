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
  CheckCircle
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
      i.category.toLowerCase().includes(s)
    );
  };

  const availableItems = filterItems(items.filter(i => i.status === 'verfügbar'));
  const rentedItems = filterItems(items.filter(i => i.status === 'verliehen'));

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
        setCurrentView('rented');
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
        setCurrentView('rented');
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
    setConfirmDelete({
      type: 'item',
      id,
      title: 'Teil löschen?',
      message: 'Möchtest du dieses Ausrüstungsteil wirklich aus dem Bestand löschen?'
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

  const addToBag = (item: EquipmentItem) => {
    if (!bag.find(i => i.id === item.id)) {
      setBag([...bag, item]);
      setSuccess(`${item.category_label} zur Tasche hinzugefügt`);
      setTimeout(() => setSuccess(null), 2000);
    }
  };

  const removeFromBag = (id: number) => {
    setBag(bag.filter(i => i.id !== id));
  };

  const clearBag = () => {
    setBag([]);
  };

  const handleMarkAsPaid = async (rentalId: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/rentals/${rentalId}/paid`, {
        method: 'PATCH',
        headers: { 'x-admin-password': password }
      });
      if (res.ok) {
        setSuccess('Als bezahlt markiert');
        fetchItems(password);
      } else {
        const data: ApiResponse = await res.json();
        setError(data.message || 'Fehler beim Markieren');
      }
    } catch (err) {
      setError('Fehler beim Markieren als bezahlt');
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
      <div className="min-h-screen bg-[#1C1F2A] text-slate-200 font-sans">
        <header className="bg-[#252936]/80 backdrop-blur-md border-b border-slate-700/50 sticky top-0 z-30">
          <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <Package className="text-white w-5 h-5" />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-white">Wiesel HockeyRent</h1>
            </div>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
              <h2 className="text-3xl font-extrabold text-white tracking-tight">Wiesel HockeyRent</h2>
              <p className="text-slate-400 mt-1">Hier siehst du alle Ausrüstungsteile, die aktuell zur Verfügung stehen.</p>
            </div>
            <div className="bg-blue-500/10 border border-blue-500/20 px-4 py-2 rounded-2xl flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
              <span className="text-blue-400 font-bold text-sm uppercase tracking-wider">{publicItems.length} Verfügbar</span>
            </div>
          </div>

          {publicItems.length === 0 ? (
            <EmptyState icon={<Package className="w-12 h-12 text-slate-700" />} message="Aktuell ist kein Equipment verfügbar." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {publicItems.map(item => (
                <div key={item.id} className="bg-[#252936] rounded-3xl border border-slate-700/50 shadow-xl overflow-hidden group">
                  <div className="aspect-[4/3] bg-[#1C1F2A] relative overflow-hidden">
                    {item.image ? (
                      <img 
                        src={item.image} 
                        alt={item.brand} 
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-700">
                        <ImageIcon className="w-16 h-16" />
                      </div>
                    )}
                    <div className="absolute top-4 right-4">
                      <span className="bg-[#1C1F2A]/80 backdrop-blur-md text-blue-400 px-3 py-1 rounded-full text-xs font-bold border border-blue-500/20">
                        {item.item_code}
                      </span>
                    </div>
                  </div>
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-xl font-bold text-white">{item.category_label}</h3>
                      <span className="text-xs font-medium text-slate-400">{item.brand}</span>
                    </div>
                    <div className="flex items-center justify-between mt-4">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        <span className="text-xs font-bold text-blue-500 uppercase tracking-wider">Verfügbar</span>
                      </div>
                      <span className="text-xs font-bold text-slate-300">Größe: {item.size}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-16 p-8 bg-[#252936] rounded-3xl border border-slate-700/50 text-center">
            <h3 className="text-xl font-bold text-white mb-2">Admin-Bereich</h3>
            <p className="text-slate-400 mb-6 max-w-md mx-auto">Um Equipment zu verleihen oder den Bestand zu verwalten, logge dich bitte mit deinem Passwort ein.</p>
            <div className="max-w-xs mx-auto">
              <form onSubmit={(e) => { e.preventDefault(); checkLogin(password); }} className="space-y-4">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-[#1C1F2A] border border-slate-700 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  placeholder="Passwort eingeben"
                />
                {error && <p className="text-red-400 text-sm font-medium">{error}</p>}
                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-500/10 transition-all active:scale-95"
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
    <div className="min-h-screen bg-[#1C1F2A] text-slate-200 font-sans pb-24 md:pb-8">
      {/* Header */}
      <header className="bg-[#252936]/80 backdrop-blur-md border-b border-slate-700/50 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Package className="text-white w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">Wiesel HockeyRent <span className="text-blue-500 font-medium">Admin</span></h1>
          </div>
          
          <nav className="hidden md:flex items-center gap-1">
            <TabButton active={currentView === 'available'} onClick={() => setCurrentView('available')} icon={<Package className="w-4 h-4" />} label="Bestand" />
            <TabButton active={currentView === 'rented'} onClick={() => setCurrentView('rented')} icon={<History className="w-4 h-4" />} label="Verliehen" />
            <TabButton active={currentView === 'bag'} onClick={() => setCurrentView('bag')} icon={<ShoppingBag className="w-4 h-4" />} label={`Tasche (${bag.length})`} />
            <TabButton active={currentView === 'history'} onClick={() => setCurrentView('history')} icon={<Calendar className="w-4 h-4" />} label="Historie" />
            <TabButton active={currentView === 'add'} onClick={() => setCurrentView('add')} icon={<Plus className="w-4 h-4" />} label="Neu" />
            <button 
              onClick={handleLogout}
              className="ml-2 p-2 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all"
              title="Abmelden"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </nav>

          <button 
            onClick={handleLogout}
            className="md:hidden p-2 text-slate-400 hover:text-red-400 transition-all"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Messages */}
        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-2xl text-red-400 flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5" />
                <span className="font-medium">{error}</span>
              </div>
              <button onClick={() => setError(null)} className="text-red-400/50 hover:text-red-400">
                <Plus className="w-5 h-5 rotate-45" />
              </button>
            </motion.div>
          )}
          {success && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-6 p-4 bg-blue-500/10 border border-blue-500/50 rounded-2xl text-blue-400 flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-medium">{success}</span>
              </div>
              <button onClick={() => setSuccess(null)} className="text-blue-400/50 hover:text-blue-400">
                <Plus className="w-5 h-5 rotate-45" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content Area */}
        <AnimatePresence mode="wait">
          {/* Search Bar */}
          {(currentView === 'available' || currentView === 'rented') && (
            <div className="mb-6 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Suchen nach Code, Marke, Größe oder Kategorie..."
                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all shadow-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 rounded-full text-slate-400"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {currentView === 'available' && (
            <motion.div 
              key="available"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-10"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
                <div>
                  <h2 className="text-3xl font-extrabold text-white tracking-tight">Bestand</h2>
                  <p className="text-slate-400 mt-1">Verwalte dein Hockey-Equipment und füge Teile zur Tasche hinzu.</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="bg-blue-500/10 border border-blue-500/20 px-4 py-2 rounded-2xl flex items-center gap-2">
                    <span className="text-blue-400 font-bold text-sm uppercase tracking-wider">{availableItems.length} Verfügbar</span>
                  </div>
                  {bag.length > 0 && (
                    <button 
                      onClick={() => setCurrentView('bag')}
                      className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-2xl font-bold text-sm flex items-center gap-2 transition-all shadow-lg shadow-blue-500/20"
                    >
                      <ShoppingBag className="w-4 h-4" />
                      <span>Tasche ({bag.length})</span>
                    </button>
                  )}
                </div>
              </div>
              
              {availableItems.length === 0 ? (
                <EmptyState icon={<Package className="w-12 h-12 text-slate-700" />} message="Kein Equipment im Bestand." />
              ) : (
                <div className="space-y-12">
                  {Object.entries(
                    availableItems.reduce((acc, item) => {
                      const cat = item.category_label;
                      if (!acc[cat]) acc[cat] = [];
                      acc[cat].push(item);
                      return acc;
                    }, {} as Record<string, EquipmentItem[]>)
                  )
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([category, catItems]) => (
                    <div key={category} className="space-y-4">
                      <div className="flex items-center gap-4">
                        <h3 className="text-xl font-bold text-white border-l-4 border-blue-600 pl-3">{category}</h3>
                        <div className="h-px flex-grow bg-slate-800"></div>
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{catItems.length} Teile</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
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
                              onEdit={() => { setEditItem(item); setCurrentView('add'); }}
                              onDelete={() => handleDeleteItem(item.id)}
                              onAddToBag={() => addToBag(item)}
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

          {currentView === 'rented' && (
            <motion.div 
              key="rented"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              <div className="mb-2">
                <h2 className="text-3xl font-extrabold text-white tracking-tight">Aktuell verliehen</h2>
                <p className="text-slate-400 mt-1">Übersicht aller Teile, die gerade im Einsatz sind.</p>
              </div>

              {rentedItems.length === 0 ? (
                <EmptyState icon={<History className="w-12 h-12 text-slate-700" />} message="Aktuell ist nichts verliehen." />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {rentedItems.map(item => (
                    <RentedCard 
                      key={item.id} 
                      item={item} 
                      onReturn={() => handleReturnRental(item.active_rental_id!)}
                      onMarkPaid={() => handleMarkAsPaid(item.active_rental_id!)}
                      onDelete={() => handleDeleteHistory(item.active_rental_id!)}
                    />
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
                <h2 className="text-3xl font-extrabold text-white tracking-tight">Deine Tasche</h2>
                <p className="text-slate-400 mt-1">Hier sammelst du Equipment für einen gemeinsamen Verleih.</p>
              </div>

              {bag.length === 0 ? (
                <div className="text-center py-20 bg-[#252936] rounded-3xl border border-dashed border-slate-700">
                  <ShoppingBag className="w-16 h-16 text-slate-700 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-white mb-2">Deine Tasche ist leer</h3>
                  <p className="text-slate-400 mb-6">Füge Equipment aus dem Bestand hinzu, um es zu verleihen.</p>
                  <button 
                    onClick={() => setCurrentView('available')}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold transition-all"
                  >
                    Zum Bestand
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 space-y-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-lg font-bold text-white">{bag.length} Teile ausgewählt</h3>
                      <button onClick={clearBag} className="text-sm text-red-400 hover:text-red-300 font-medium">Alle entfernen</button>
                    </div>
                    {bag.map(item => (
                      <div key={item.id} className="bg-[#252936] p-4 rounded-2xl border border-slate-700/50 flex items-center gap-4">
                        <div className="w-16 h-16 rounded-xl bg-[#1C1F2A] overflow-hidden flex-shrink-0">
                          {item.image ? (
                            <img src={item.image} alt={item.brand} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-700">
                              <ImageIcon className="w-6 h-6" />
                            </div>
                          )}
                        </div>
                        <div className="flex-grow">
                          <div className="flex items-center justify-between">
                            <h4 className="font-bold text-white">{item.category_label}</h4>
                            <button onClick={() => removeFromBag(item.id)} className="text-slate-500 hover:text-red-400 transition-all">
                              <X className="w-5 h-5" />
                            </button>
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-slate-400">{item.brand}</span>
                            <span className="text-xs text-slate-400">Größe: {item.size}</span>
                            <span className="text-[10px] font-mono text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">{item.item_code}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="bg-[#252936] p-6 rounded-3xl border border-slate-700/50 h-fit sticky top-24">
                    <h3 className="text-xl font-bold text-white mb-6">Verleih-Details</h3>
                    <form onSubmit={(e) => { e.preventDefault(); handleRentItems(); }} className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Name des Ausleihers</label>
                        <input
                          required
                          type="text"
                          value={rentForm.renter_name}
                          onChange={(e) => setRentForm({ ...rentForm, renter_name: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl bg-[#1C1F2A] border border-slate-700 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
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
                          className="w-full px-4 py-3 rounded-xl bg-[#1C1F2A] border border-slate-700 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Notiz (Optional)</label>
                        <textarea
                          value={rentForm.note}
                          onChange={(e) => setRentForm({ ...rentForm, note: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl bg-[#1C1F2A] border border-slate-700 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none"
                          placeholder="Zusätzliche Infos..."
                          rows={3}
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-500/20 transition-all active:scale-95 mt-4 flex items-center justify-center gap-2"
                      >
                        {loading ? 'Wird verarbeitet...' : (
                          <>
                            <CheckCircle className="w-5 h-5" />
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
                  <h2 className="text-3xl font-extrabold text-white tracking-tight">Historie</h2>
                  <p className="text-slate-400 mt-1">Alle vergangenen und aktuellen Verleihvorgänge.</p>
                </div>
                <div className="bg-blue-500/10 border border-blue-500/20 px-4 py-2 rounded-2xl flex items-center gap-3">
                  <span className="text-slate-400 text-sm font-bold uppercase tracking-wider">Einnahmen:</span>
                  <span className="text-blue-400 font-extrabold text-lg">
                    {history.filter(r => r.paid).reduce((sum, r) => sum + r.fee_total, 0).toFixed(2)} €
                  </span>
                </div>
              </div>

              {history.length === 0 ? (
                <EmptyState icon={<Calendar className="w-12 h-12 text-slate-700" />} message="Noch keine Historie vorhanden." />
              ) : (
                <div className="space-y-6">
                  {history.map(rental => (
                    <HistoryItem 
                      key={rental.id} 
                      rental={rental} 
                      onMarkAsPaid={() => handleMarkAsPaid(rental.id)}
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
                  <h2 className="text-3xl font-extrabold text-white tracking-tight">
                    {editItem ? 'Equipment bearbeiten' : 'Neues Equipment'}
                  </h2>
                  <p className="text-slate-400 mt-1">Füge neue Ausrüstung zum Bestand hinzu.</p>
                </div>
                <button 
                  onClick={() => { setEditItem(null); setCurrentView('available'); }}
                  className="p-2 text-slate-400 hover:text-white transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="bg-[#252936] rounded-3xl border border-slate-700/50 overflow-hidden shadow-xl">
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
                          className="w-full px-4 py-3 rounded-xl bg-[#1C1F2A] border border-slate-700 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all appearance-none"
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
                            className="w-full px-4 py-3 rounded-xl bg-[#1C1F2A] border border-slate-700 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
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
                            className="w-full px-4 py-3 rounded-xl bg-[#1C1F2A] border border-slate-700 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            placeholder="z.B. L"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">Zustand / Notiz</label>
                        <textarea
                          value={editItem ? editItem.condition_note : newItem.condition_note}
                          onChange={(e) => editItem ? setEditItem({ ...editItem, condition_note: e.target.value }) : setNewItem({ ...newItem, condition_note: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl bg-[#1C1F2A] border border-slate-700 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none"
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
                            className="block aspect-[4/3] rounded-2xl border-2 border-dashed border-slate-700 hover:border-blue-500 bg-[#1C1F2A] cursor-pointer transition-all overflow-hidden relative"
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
                              <div className="w-full h-full flex flex-col items-center justify-center text-slate-500">
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
                          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-500/20 transition-all active:scale-95 flex items-center justify-center gap-2"
                        >
                          {loading ? 'Speichert...' : (
                            <>
                              <Save className="w-5 h-5" />
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
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#252936] border-t border-slate-700/50 px-4 py-2 flex justify-around items-center z-40 shadow-[0_-4px_20px_rgba(0,0,0,0.2)]">
        <MobileNavItem active={currentView === 'available'} onClick={() => setCurrentView('available')} icon={<Package />} label="Bestand" />
        <MobileNavItem active={currentView === 'rented'} onClick={() => setCurrentView('rented')} icon={<ArrowRightLeft />} label="Verliehen" />
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
              className="bg-[#252936] w-full max-w-md rounded-3xl p-8 shadow-2xl border border-slate-700/50"
            >
              <h3 className="text-2xl font-bold mb-6 text-white">Equipment verleihen</h3>
              <form onSubmit={handleRentSingleItem} className="space-y-4">
                <div className="w-full">
                  <label className="block text-sm font-semibold text-slate-300 mb-1">Verliehen an</label>
                  <div className="relative w-full">
                    <User className="absolute left-4 top-3.5 w-5 h-5 text-slate-500" />
                    <input
                      type="text"
                      required
                      autoFocus
                      value={rentForm.renter_name}
                      onChange={(e) => setRentForm({ ...rentForm, renter_name: e.target.value })}
                      className="w-full pl-12 pr-4 py-3 rounded-xl bg-[#1C1F2A] border border-slate-700 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="Name der Person"
                    />
                  </div>
                </div>
                <div className="w-full">
                  <label className="block text-sm font-semibold text-slate-300 mb-1">Verliehen am</label>
                  <div className="relative w-full">
                    <Calendar className="absolute left-4 top-3.5 w-5 h-5 text-slate-500" />
                    <input
                      type="date"
                      required
                      value={rentForm.rented_at}
                      onChange={(e) => setRentForm({ ...rentForm, rented_at: e.target.value })}
                      className="w-full pl-12 pr-4 py-3 rounded-xl bg-[#1C1F2A] border border-slate-700 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>
                <div className="w-full">
                  <label className="block text-sm font-semibold text-slate-300 mb-1">Leihgebühr (€)</label>
                  <input
                    type="number"
                    step="0.50"
                    required
                    value={rentForm.fee_total}
                    onChange={(e) => setRentForm({ ...rentForm, fee_total: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-[#1C1F2A] border border-slate-700 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="0.00"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="paid"
                    checked={rentForm.paid}
                    onChange={(e) => setRentForm({ ...rentForm, paid: e.target.checked })}
                    className="w-5 h-5 rounded border-slate-700 bg-[#1C1F2A] text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="paid" className="text-sm font-semibold text-slate-300 cursor-pointer">Bereits bezahlt?</label>
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setRentingItem(null)}
                    className="flex-1 bg-slate-700 text-slate-200 font-bold py-4 rounded-xl active:scale-95 transition-all"
                  >
                    Abbrechen
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 bg-blue-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-500/10 active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100"
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
  onDelete: () => void;
  onEdit: () => void;
  onAddToBag: () => void;
  inBag: boolean;
}

const ItemCard: React.FC<ItemCardProps> = ({ item, onRent, onDelete, onEdit, onAddToBag, inBag }) => {
  return (
    <div className="bg-[#252936] rounded-2xl border border-slate-700/50 shadow-lg hover:shadow-2xl transition-all group relative overflow-hidden flex flex-col">
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all z-20">
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
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
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
          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">{item.category_label}</p>
        </div>
        
        <div className="flex gap-1.5">
          <button
            onClick={onAddToBag}
            disabled={inBag}
            className={`flex-1 p-2 rounded-lg transition-all flex items-center justify-center ${
              inBag 
                ? 'bg-slate-800 text-slate-600 cursor-not-allowed' 
                : 'bg-blue-600/10 text-blue-400 border border-blue-500/20 hover:bg-blue-600/20'
            }`}
            title="In Tasche"
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
      </div>
    </div>
  );
}

interface RentedCardProps {
  item: EquipmentItem;
  onReturn: () => void;
  onMarkPaid: () => void;
  onDelete: () => void;
}

const RentedCard: React.FC<RentedCardProps> = ({ item, onReturn, onMarkPaid, onDelete }) => {
  return (
    <div className="bg-[#252936] rounded-3xl border border-orange-500/20 shadow-xl hover:shadow-2xl transition-all overflow-hidden relative group">
      <div className="absolute top-4 right-4 flex gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all z-20">
        <button 
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-2 bg-[#1C1F2A]/90 backdrop-blur-md text-slate-300 hover:text-red-400 rounded-full shadow-lg border border-slate-700"
          title="Löschen"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      
      <div className="aspect-[4/3] bg-[#1C1F2A] relative overflow-hidden">
        {item.image ? (
          <img 
            src={item.image} 
            alt={item.brand} 
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-700">
            <ImageIcon className="w-12 h-12" />
          </div>
        )}
        <div className="absolute top-4 left-4 flex flex-col gap-2">
          <span className="bg-[#1C1F2A]/80 backdrop-blur-md text-orange-400 px-3 py-1 rounded-full text-[10px] font-bold border border-orange-500/20 uppercase tracking-wider">
            {item.category_label}
          </span>
          <span className="bg-black/60 backdrop-blur-md text-white px-3 py-1 rounded-full text-[10px] font-bold border border-white/10 uppercase tracking-wider">
            GRÖSSE {item.size}
          </span>
        </div>
      </div>

      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-lg text-white">{item.brand}</h3>
            {item.item_code && (
              <span className="text-[10px] font-mono text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">
                {item.item_code}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 text-orange-400 text-[10px] font-bold bg-orange-500/10 px-2 py-1 rounded-md border border-orange-500/20 uppercase">
            Verliehen
          </div>
        </div>
        
        <div className="space-y-3 mb-6">
          <div className="flex items-center gap-2 text-sm">
            <User className="w-4 h-4 text-slate-500" />
            <span className="font-medium text-slate-200">{item.verliehenAn}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4 text-slate-500" />
            <span className="text-slate-400">Seit {item.verliehenAm}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {item.bezahlt ? (
                <div className="flex items-center gap-1 text-blue-400 text-xs font-bold bg-blue-500/10 px-2 py-1 rounded-md border border-blue-500/20">
                  <CheckCircle2 className="w-3 h-3" /> BEZAHLT
                </div>
              ) : (
                <div className="flex items-center gap-1 text-red-400 text-xs font-bold bg-red-500/10 px-2 py-1 rounded-md border border-red-500/20">
                  <XCircle className="w-3 h-3" /> OFFEN
                </div>
              )}
            </div>
            <div className="text-slate-300 font-bold">
              {item.verliehenGebuehr?.toFixed(2)} €
            </div>
          </div>
          
          {!item.bezahlt && (
            <button 
              onClick={onMarkPaid}
              className="w-full mt-2 py-2 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-xl text-xs font-bold hover:bg-blue-600/30 transition-all"
            >
              Jetzt als bezahlt markieren
            </button>
          )}
        </div>

        <button
          onClick={onReturn}
          className="w-full bg-orange-500 text-white font-bold py-3 rounded-xl hover:bg-orange-400 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-orange-500/10"
        >
          <CheckCircle2 className="w-4 h-4" />
          Zurückbekommen
        </button>
      </div>
    </div>
  );
}

interface HistoryItemProps {
  rental: Rental;
  onMarkAsPaid: () => void;
  onDelete: () => void;
}

const HistoryItem: React.FC<HistoryItemProps> = ({ rental, onMarkAsPaid, onDelete }) => {
  return (
    <div className="bg-[#252936] rounded-3xl border border-slate-700/50 shadow-lg overflow-hidden group">
      <div className="p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center">
              <User className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <h4 className="text-lg font-bold text-white">{rental.renter_name}</h4>
              <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> {rental.rented_at}
                </span>
                {rental.returned_at && (
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Zurück: {rental.returned_at}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-2xl font-black text-white">{rental.fee_total.toFixed(2)} €</p>
              {rental.paid ? (
                <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20 uppercase tracking-wider">Bezahlt</span>
              ) : (
                <button 
                  onClick={onMarkAsPaid}
                  className="text-[10px] font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20 uppercase tracking-wider hover:bg-red-500/20 transition-all"
                >
                  Mark as Paid
                </button>
              )}
            </div>
            <button 
              onClick={onDelete}
              className="p-2 text-slate-600 hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {rental.items?.map(item => (
            <div key={item.id} className="flex items-center gap-3 bg-[#1C1F2A] p-3 rounded-2xl border border-slate-700/30">
              <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-800 flex-shrink-0">
                {item.image ? (
                  <img src={item.image} alt={item.brand} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-700">
                    <Package className="w-5 h-5" />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate">{item.brand}</p>
                <p className="text-[10px] text-slate-500 truncate">{item.category_label} • {item.size}</p>
              </div>
            </div>
          ))}
        </div>
        
        {rental.note && (
          <div className="mt-4 p-3 bg-slate-800/50 rounded-xl border border-slate-700/30">
            <p className="text-xs text-slate-400 italic">"{rental.note}"</p>
          </div>
        )}
      </div>
    </div>
  );
}

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
        className="bg-[#252936] border border-slate-700 rounded-3xl p-6 max-w-sm w-full shadow-2xl"
      >
        <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
        <p className="text-slate-400 mb-6">{message}</p>
        <div className="flex gap-3">
          <button 
            onClick={onCancel}
            className="flex-1 py-3 bg-slate-700 text-slate-200 font-bold rounded-xl hover:bg-slate-600 transition-all"
          >
            {cancelText}
          </button>
          <button 
            onClick={onConfirm}
            className={`flex-1 py-3 font-bold rounded-xl text-white transition-all ${isDanger ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'}`}
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
      className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all ${
        active 
          ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' 
          : 'bg-[#252936] text-slate-400 hover:bg-slate-700/50 border border-slate-700/50'
      }`}
    >
      {icon}
      {label}
      {count !== undefined && (
        <span className={`ml-1 text-xs px-2 py-0.5 rounded-full ${active ? 'bg-white/20' : 'bg-slate-700 text-slate-400'}`}>
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
      className={`flex flex-col items-center gap-1 flex-1 py-1 transition-colors ${
        active ? 'text-blue-500' : 'text-slate-500'
      }`}
    >
      {React.cloneElement(icon, { className: 'w-6 h-6' })}
      <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
    </button>
  );
}

function EmptyState({ icon, message }: { icon: React.ReactNode, message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 bg-[#252936] rounded-3xl border border-slate-700/50 border-dashed">
      {icon}
      <p className="text-slate-500 mt-4 font-medium">{message}</p>
    </div>
  );
}

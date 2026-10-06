import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Plus,
  Package,
  History,
  LogOut,
  CheckCircle2,
  XCircle,
  Calendar,
  ArrowRightLeft,
  Trash2,
  Image as ImageIcon,
  Edit,
  ShoppingBag,
  Filter,
  X,
  Save,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Layers,
  ArrowRight,
  Search,
  FileText,
  Eye,
  EyeOff,
  ShieldCheck,
  Lock,
  Download,
  PenTool,
  Share2,
  Copy,
  Clock,
  ShieldAlert,
  ExternalLink,
  Check,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { EquipmentItem, View, Rental, EquipmentCategory, RentalContract, ContractEquipmentSnapshotItem } from './types';
import { CONTRACT_SECTIONS, CONTRACT_CONFIRMATION, CONTRACT_META, VEREIN_INFO } from './contractTemplate';
import { compressEquipmentPhoto } from './equipmentPhoto';
import { hydrateRentalImages } from './rentalImages';
import { useButtonSound, SoundToggle } from './components/ButtonSound';
import { ContractDeliveryStatus } from './components/ContractDeliveryStatus';

const API_BASE = '/api';

function actionHaptic(kind: 'tap' | 'success' | 'error' = 'tap') {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  try {
    if (kind === 'success') navigator.vibrate([18, 35, 18]);
    else if (kind === 'error') navigator.vibrate([45, 35, 45]);
    else navigator.vibrate(20);
  } catch {
    // Haptik ist progressive enhancement; insbesondere iOS Safari kann Vibrate ignorieren.
  }
}

// Saubere Berechnung: 6 Kalendermonate ab Startdatum (inkl. Monatsende-Sonderfall)
export function calculateDueDate(startDateStr: string): string {
  if (!startDateStr) return '';
  const match = startDateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10); // 1-12
    const day = parseInt(match[3], 10);
    const totalMonths = month - 1 + 6;
    const targetYear = year + Math.floor(totalMonths / 12);
    const targetMonth = (totalMonths % 12) + 1; // 1-12
    const daysInTargetMonth = new Date(targetYear, targetMonth, 0).getDate();
    const targetDay = Math.min(day, daysInTargetMonth);
    const yyyy = String(targetYear);
    const mm = String(targetMonth).padStart(2, '0');
    const dd = String(targetDay).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return '';
}

// Deutsches Datumsformat für die Anzeige (DD.MM.YYYY)
export function formatDateDe(dateStr?: string | null): string {
  if (!dateStr) return '';
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[3]}.${match[2]}.${match[1]}`;
  }
  return dateStr;
}

// Formatierung Datum & Uhrzeit für Signatur (DD.MM.YYYY um HH:MM Uhr)
export function formatDateTimeDe(isoStr?: string | null): string {
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

// IBAN formatieren in 4er-Blöcke (z. B. DE89 3705 0198 0000 0123 45)
export function formatIban(val: string): string {
  if (!val) return '';
  const clean = val.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 34);
  const parts: string[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    parts.push(clean.substring(i, i + 4));
  }
  return parts.join(' ');
}

// IBAN zum Datenschutz maskieren (z. B. DE89 •••• •••• •••• 3456)
export function maskIban(iban: string): string {
  if (!iban) return '';
  const clean = iban.replace(/\s+/g, '').toUpperCase();
  if (clean.length < 8) return clean;
  const start = clean.slice(0, 4);
  const end = clean.slice(-4);
  return `${start} •••• •••• •••• ${end}`;
}

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
  const sound = useButtonSound();
  const [publicSignToken] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      // 1. Primär aus URL-Hash auslesen (#sign=TOKEN oder #token=TOKEN)
      const rawHash = window.location.hash.startsWith('#')
        ? window.location.hash.slice(1)
        : window.location.hash;
      if (rawHash) {
        const hashParams = new URLSearchParams(rawHash);
        const hashToken = hashParams.get('sign') || hashParams.get('token');
        if (hashToken) return hashToken;

        // Fallback falls der Hash direkt ohne Params-Syntax wie '#sign=...' formatiert ist
        const match = rawHash.match(/^(?:sign|token)=([a-fA-F0-9]+)$/);
        if (match) return match[1];
      }

      // 2. Abwärtskompatibler Fallback aus Query-String
      const params = new URLSearchParams(window.location.search);
      return params.get('token') || params.get('sign') || null;
    }
    return null;
  });

  // Sobald der Token sicher im React-State gespeichert ist, aus der Adresszeile entfernen
  useEffect(() => {
    if (publicSignToken && typeof window !== 'undefined') {
      const cleanUrl = window.location.pathname;
      try {
        window.history.replaceState(null, '', cleanUrl);
      } catch {
        // Ignorieren, falls Browser history.replaceState blockiert
      }
    }
  }, [publicSignToken]);

  if (publicSignToken) {
    return <PublicContractView token={publicSignToken} />;
  }

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [password, setPassword] = useState('');
  const [items, setItems] = useState<EquipmentItem[]>([]);
  const [history, setHistory] = useState<Rental[]>([]);
  const [historySummary, setHistorySummary] = useState({ activeCount: 0, completedCount: 0, paidRevenue: 0 });
  const [completedPage, setCompletedPage] = useState(1);
  const [photoProcessing, setPhotoProcessing] = useState(false);
  const photoGeneration = useRef(0);
  const [publicItems, setPublicItems] = useState<Partial<EquipmentItem>[]>([]);
  const [bag, setBag] = useState<EquipmentItem[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<{
    type: 'item' | 'history';
    id: number;
    title: string;
    message: string;
  } | null>(null);

  const [confirmReturnRental, setConfirmReturnRental] = useState<{
    id: number;
    renterName: string;
  } | null>(null);

  const [currentView, setCurrentView] = useState<View>('available');
  // Segment-Umschaltung in Ausleihen: Standardmäßig "Aktuell"
  const [rentalsSubTab, setRentalsSubTab] = useState<'active' | 'completed'>('active');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fetchGeneration = useRef(0);
  const paymentLocks = useRef(new Set<number>());


  const [rentingItem, setRentingItem] = useState<EquipmentItem | null>(null);
  const [editingBundleRental, setEditingBundleRental] = useState<Rental | null>(null);

  // Digitaler Ausleihvertrag (Phase 1: Einverständniserklärung)
  const [contractModal, setContractModal] = useState<{
    isOpen: boolean;
    rentalId: number;
    mode: 'form' | 'preview';
  } | null>(null);

  // Share Signing Link Modal
  const [shareSigningRentalId, setShareSigningRentalId] = useState<number | null>(null);

  // Nach einer neuen Ausleihe: Admin entscheidet zwischen eigenem Bearbeiten und externem Link.
  const [contractChoiceRentalId, setContractChoiceRentalId] = useState<number | null>(null);

  // Lokaler Pending-Status für schnelle, optimistische Zahlungsumschaltung.
  const [paymentPendingRentalIds, setPaymentPendingRentalIds] = useState<Set<number>>(new Set());

  // Spezialmodi für Bundle-Bearbeitung über den normalen zentralen Bestand
  const [bundleExchange, setBundleExchange] = useState<{
    rentalId: number;
    rental: Rental;
    oldItem: EquipmentItem;
    category: string;
  } | null>(null);

  const [bundleAdd, setBundleAdd] = useState<{
    rentalId: number;
    rental: Rental;
  } | null>(null);

  // Zielkategorie für automatisches Scrollen (ausschließlich beim Start eines Austauschs)
  const [autoScrollTargetCategory, setAutoScrollTargetCategory] = useState<string | null>(null);
  const categoryRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Filter States: Status, Category
  const [statusFilter, setStatusFilter] = useState<'all' | 'verfügbar' | 'verliehen'>('all');
  const [equipmentGroupFilter, setEquipmentGroupFilter] = useState<'player' | 'goalie'>('player');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Accordion state for inventory categories: map category name -> isCollapsed (boolean)
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  // Accordion state for rental cards: map rental id -> isExpanded (boolean, default false)
  const [expandedRentals, setExpandedRentals] = useState<Record<number, boolean>>({});

  const itemBelongsToEquipmentGroup = (item: EquipmentItem, group: 'player' | 'goalie') => {
    const categoryConfig = CATEGORIES.find(c => c.value === item.category || c.label === item.category_label);
    const isGoalie = categoryConfig?.type === 'Goalie' || String(item.category_label || item.category).toLowerCase().startsWith('goalie');
    return group === 'goalie' ? isGoalie : !isGoalie;
  };

  const equipmentGroupItems = items.filter(i => !i.is_deleted && itemBelongsToEquipmentGroup(i, equipmentGroupFilter));
  const totalCount = equipmentGroupItems.length;
  const availableCount = equipmentGroupItems.filter(i => i.status === 'verfügbar').length;
  const rentedCount = equipmentGroupItems.filter(i => i.status === 'verliehen').length;

  // Kategorien passend zur aktuell gewählten Liste Spieler / Goalie.
  const availableCategories = Array.from(
    new Set<string>(equipmentGroupItems.map(i => i.category_label || i.category).filter((c): c is string => Boolean(c)))
  ).sort((a, b) => a.localeCompare(b, 'de'));

  const hasActiveExtraFilters = categoryFilter !== 'all';

  const resetCategoryFilter = () => setCategoryFilter('all');

  // Filter Pipeline: items -> Status -> Category
  const displayedItems = items.filter(item => {
    if (item.is_deleted) return false;
    if (!itemBelongsToEquipmentGroup(item, equipmentGroupFilter)) return false;

    // Im Spezialmodus (Austausch oder Teil hinzufügen) ausschließlich verfügbare Teile
    if (bundleExchange || bundleAdd) {
      if (item.status !== 'verfügbar') {
        return false;
      }
    } else {
      if (statusFilter !== 'all' && item.status !== statusFilter) {
        return false;
      }
    }

    if (categoryFilter !== 'all' && item.category_label !== categoryFilter && item.category !== categoryFilter) {
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
  useEffect(() => {
    ++photoGeneration.current;
    setPhotoProcessing(false);
  }, [currentView, editItem?.id]);

  // Standard-Leihgebühr: numerischer Initialwert 60, editierbar. Standard-Laufzeit: 6 Kalendermonate
  const [rentForm, setRentForm] = useState<{
    item_ids: number[],
    renter_name: string,
    rented_at: string,
    due_date: string,
    paid: boolean,
    fee_total: number | string,
    note: string
  }>({
    item_ids: [],
    renter_name: '',
    rented_at: new Date().toISOString().split('T')[0],
    due_date: calculateDueDate(new Date().toISOString().split('T')[0]),
    paid: false,
    fee_total: 60,
    note: ''
  });

  const handleRentedAtChange = (newDate: string) => {
    setRentForm(prev => ({
      ...prev,
      rented_at: newDate,
      due_date: calculateDueDate(newDate)
    }));
  };

  const resetRentForm = () => {
    const today = new Date().toISOString().split('T')[0];
    setRentForm({
      item_ids: [],
      renter_name: '',
      rented_at: today,
      due_date: calculateDueDate(today),
      paid: false,
      fee_total: 60,
      note: ''
    });
  };

  useEffect(() => {
    sessionStorage.removeItem('hockey_rent_password');
    const savedPassword = sessionStorage.getItem('hockey_rent_session');
    if (savedPassword) {
      checkLogin(savedPassword, true);
    } else {
      fetchPublicItems();
    }
  }, []);

  // Automatisches Scrollen zur auszutauschenden Kategorie (nur gezielt beim Start eines Austauschs)
  useEffect(() => {
    if (!autoScrollTargetCategory || currentView !== 'available') return;

    let timeoutId: any;
    const performScroll = () => {
      const targetCat = autoScrollTargetCategory;
      if (!targetCat) return;

      const targetEl = 
        categoryRefs.current[targetCat] ||
        document.getElementById(`category-section-${targetCat.replace(/\s+/g, '-')}`);

      if (targetEl) {
        targetEl.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
        setAutoScrollTargetCategory(null);
      }
    };

    // Zwei requestAnimationFrames stellen sicher, dass das Rendering abgeschlossen ist
    const rAF = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        performScroll();
        timeoutId = setTimeout(performScroll, 80);
      });
    });

    return () => {
      cancelAnimationFrame(rAF);
      clearTimeout(timeoutId);
    };
  }, [autoScrollTargetCategory, currentView, displayedItems.length]);

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

  const checkLogin = async (pass: string, restore = false) => {
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/${restore ? 'session' : 'login'}`, restore ? { headers: { 'x-admin-password': pass } } : {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pass })
      });
      const data: ApiResponse & {token?: string} = await res.json();
      if (res.ok && data.success) {
        const session = restore ? pass : data.token!;
        setIsLoggedIn(true);
        setPassword(session);
        setError(null);
        sessionStorage.setItem('hockey_rent_session', session);
        await fetchItems(session);
      } else {
        sessionStorage.removeItem('hockey_rent_session');
        setError(data.message || 'Ungültiges Passwort');
      }
    } catch (err) {
      setError('Verbindungsfehler beim Anmelden');
    }
  };

  const fetchItems = async (pass: string, page = completedPage): Promise<boolean> => {
    const generation=++fetchGeneration.current;
    setLoading(true);
    try {
      const pageOnly = page !== completedPage;
      const [itemsRes, historyRes]=await Promise.all([
        pageOnly ? null : fetch(`${API_BASE}/items`,{headers:{'x-admin-password':pass}}),
        fetch(`${API_BASE}/history?page=${page}`,{headers:{'x-admin-password':pass}})
      ]);
      if((itemsRes && !itemsRes.ok) || !historyRes.ok) {
        if(itemsRes?.status===401 || historyRes.status===401) { setIsLoggedIn(false); sessionStorage.removeItem('hockey_rent_session'); }
        throw new Error('Daten konnten nicht aktualisiert werden. Bitte erneut laden.');
      }
      const [nextItems,historyData]=await Promise.all([itemsRes ? itemsRes.json() : items,historyRes.json()]);
      const nextHistory=hydrateRentalImages(historyData.rentals,nextItems);
      if(generation!==fetchGeneration.current) return false;
      setItems(nextItems);
      setHistory(nextHistory);
      setHistorySummary(historyData.summary);
      setCompletedPage(historyData.page);
      setError(null);
      setEditingBundleRental(prev=>prev ? nextHistory.find((r:Rental)=>r.id===prev.id && !r.returned_at) || null : null);
      return true;
    } catch(err) {
      if(generation===fetchGeneration.current) setError(err instanceof Error ? err.message : 'Fehler beim Laden der Daten');
      return false;
    } finally { if(generation===fetchGeneration.current) setLoading(false); }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (photoProcessing) return;
    if (!newItem.category || !newItem.size || !newItem.brand) {
      setError('Bitte Kategorie, Marke und Größe ausfüllen.');
      return;
    }
    sound.prepare();
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
        sound.play('create');
        setNewItem({ category: 'Helm', size: '', brand: '', image: null, condition_note: '' });
        await fetchItems(password);
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
    if (!editItem || photoProcessing) return;
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
        await fetchItems(password);
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
          fee_total: rentForm.fee_total === '' ? 0 : Number(rentForm.fee_total),
          item_ids
        })
      });
      if (res.ok) {
        const data = await res.json();
        // Initialwert für den nächsten Verleih wieder auf 60 und +6 Monate zurücksetzen
        resetRentForm();
        setBag([]);
        // Neue Tasche startet wieder mit vollständig geöffnetem Bestand.
        setCollapsedCategories({});
        await fetchItems(password);
        setCurrentView('rentals');
        setRentalsSubTab('active');
        if (data.rentalId) {
          setContractChoiceRentalId(data.rentalId);
        }
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
          fee_total: rentForm.fee_total === '' ? 0 : Number(rentForm.fee_total),
          item_ids: [rentingItem.id]
        })
      });
      if (res.ok) {
        const data = await res.json();
        // Initialwert für den nächsten Verleih wieder auf 60 und +6 Monate zurücksetzen
        resetRentForm();
        setRentingItem(null);
        // Nach dem Verleih ist der Bestand für die nächste Auswahl wieder komplett geöffnet.
        setCollapsedCategories({});
        await fetchItems(password);
        setCurrentView('rentals');
        setRentalsSubTab('active');
        if (data.rentalId) {
          setContractChoiceRentalId(data.rentalId);
        }
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

  // Alles zurückgeben (kompletter Verleihvorgang beenden)
  const handleReturnRental = async (rentalId: number) => {
    const previousRental = history.find(r => r.id === rentalId);
    if (!previousRental) return;

    sound.prepare();
    actionHaptic('tap');
    setLoading(true);
    setError(null);
    setSuccess('Rückgabe wird in der Datenbank gespeichert …');

    try {
      const res = await fetch(`${API_BASE}/rentals/${rentalId}/return`, {
        method: 'POST',
        headers: { 'x-admin-password': password }
      });

      const data: any = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        actionHaptic('error');
        setSuccess(null);
        setError(data?.message || 'Fehler bei der Rückgabe');
        return;
      }

      // Erst NACH bestätigter DB-Rückgabe neu laden und in "Abgeschlossen" wechseln.
      if (!await fetchItems(password)) { setSuccess(null); return; }
      if (editingBundleRental?.id === rentalId) {
        setEditingBundleRental(null);
      }
      setRentalsSubTab('completed');
      actionHaptic('success');
      sound.play('return');
      setSuccess(`${data.returned_count ?? 'Alle'} Teile erfolgreich zurückgegeben.`);
      window.setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      actionHaptic('error');
      setSuccess(null);
      setError('Fehler bei der Rückgabe');
    } finally {
      setLoading(false);
    }
  };

  // Einzelnes Teil aus laufendem Bundle zurückgeben
  const handleReturnSingleItemFromBundle = async (rentalId: number, itemId: number, note?: string) => {
    sound.prepare();
    actionHaptic('tap');
    setLoading(true);
    setError(null);
    setSuccess('Rückgabe wird gespeichert …');
    try {
      const res = await fetch(`${API_BASE}/rentals/${rentalId}/items/${itemId}/return`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-password': password 
        },
        body: JSON.stringify({ note })
      });
      if (res.ok) {
        if (!await fetchItems(password)) { setSuccess(null); return; }
        actionHaptic('success');
        sound.play('return');
        setSuccess('Teil erfolgreich zurückgegeben.');
        setTimeout(() => setSuccess(null), 2200);
      } else {
        const data: ApiResponse = await res.json();
        actionHaptic('error');
        setError(data.message || 'Fehler bei der Rückgabe des Einzelteils');
      }
    } catch (err) {
      setError('Fehler bei der Rückgabe des Einzelteils');
    } finally {
      setLoading(false);
    }
  };

  // Neues Teil zu laufendem Bundle hinzufügen
  const handleAddItemToBundle = async (rentalId: number, itemId: number, note?: string) => {
    actionHaptic('tap');
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/rentals/${rentalId}/items`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-password': password 
        },
        body: JSON.stringify({ item_id: itemId, note })
      });
      if (res.ok) {
        await fetchItems(password);
      } else {
        const data: ApiResponse = await res.json();
        setError(data.message || 'Fehler beim Hinzufügen des Teils');
      }
    } catch (err) {
      setError('Fehler beim Hinzufügen des Teils');
    } finally {
      setLoading(false);
    }
  };

  // Teil gegen ein anderes austauschen
  const handleExchangeItemInBundle = async (rentalId: number, returnItemId: number, newItemId: number, note?: string) => {
    actionHaptic('tap');
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/rentals/${rentalId}/exchange`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-password': password 
        },
        body: JSON.stringify({
          return_item_id: returnItemId,
          new_item_id: newItemId,
          note
        })
      });
      if (res.ok) {
        await fetchItems(password);
      } else {
        const data: ApiResponse = await res.json();
        setError(data.message || 'Fehler beim Austauschen des Ausrüstungsteils');
      }
    } catch (err) {
      setError('Fehler beim Austauschen des Ausrüstungsteils');
    } finally {
      setLoading(false);
    }
  };

  // Details einer bestehenden Ausleihe anpassen (Ausleiher, Gebühr, Notiz, Rückgabedatum)
  const handleUpdateRentalDetails = async (
    rentalId: number, 
    updates: { renter_name?: string; fee_total?: number; note?: string; due_date?: string }
  ) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/rentals/${rentalId}`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-password': password 
        },
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        await fetchItems(password);
      } else {
        const data: ApiResponse = await res.json();
        setError(data.message || 'Fehler beim Aktualisieren der Details');
      }
    } catch (err) {
      setError('Fehler beim Aktualisieren der Details');
    } finally {
      setLoading(false);
    }
  };

  // Signiertes Vertrags-PDF herunterladen / öffnen
  const handleDownloadPdf = async (targetRentalId: number) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/rentals/${targetRentalId}/contract/pdf`, {
        headers: { 'x-admin-password': password }
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        setError(errJson?.message || 'Fehler beim Laden des Vertrags-PDFs.');
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Ausleihvertrag_${targetRentalId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => window.URL.revokeObjectURL(url), 2000);
    } catch (err: any) {
      setError('Fehler beim Herunterladen des Vertrags-PDFs.');
    } finally {
      setLoading(false);
    }
  };

  // 1. Austauschmodus starten:
  // Schließt Modal, wechselt in normalen Bestand, schließt alle Kategorien außer der passenden Kategorie
  const startExchange = (rental: Rental, oldItem: EquipmentItem) => {
    const oldCat = oldItem.category_label || oldItem.category;

    setEditingBundleRental(null);

    setBundleExchange({
      rentalId: rental.id,
      rental,
      oldItem,
      category: oldCat
    });
    setBundleAdd(null);

    setCurrentView('available');

    // Filter bereinigen
    setCategoryFilter('all');
    setStatusFilter('verfügbar');

    // Alle Kategorien schließen, NUR die Kategorie des auszutauschenden Teils öffnen
    const newCollapsed: Record<string, boolean> = {};
    CATEGORIES.forEach(c => {
      newCollapsed[c.label] = (c.label !== oldCat);
    });
    items.forEach(i => {
      const catName = i.category_label || i.category;
      if (catName) {
        newCollapsed[catName] = (catName !== oldCat);
      }
    });
    setCollapsedCategories(newCollapsed);

    // Automatisches Scrollen gezielt für diese Austauschkategorie vormerken
    setAutoScrollTargetCategory(oldCat);
  };

  // 2. Teil-Hinzufügen-Modus starten:
  // Schließt Modal, wechselt in normalen Bestand, schließt ALLE Kategorien
  const startAddItem = (rental: Rental) => {
    setEditingBundleRental(null);

    setBundleAdd({
      rentalId: rental.id,
      rental
    });
    setBundleExchange(null);
    setAutoScrollTargetCategory(null);

    setCurrentView('available');

    // Filter bereinigen
    setCategoryFilter('all');
    setStatusFilter('verfügbar');

    // ALLE Kategorien schließen
    const newCollapsed: Record<string, boolean> = {};
    CATEGORIES.forEach(c => {
      newCollapsed[c.label] = true;
    });
    items.forEach(i => {
      const catName = i.category_label || i.category;
      if (catName) {
        newCollapsed[catName] = true;
      }
    });
    setCollapsedCategories(newCollapsed);
  };

  // 3. Spezialmodus abbrechen:
  // Beendet Austausch/Add, kehrt zu Ausleihen -> Aktuell zurück und öffnet den Rental wieder
  const handleCancelSpecialMode = () => {
    const targetRentalId = bundleExchange?.rentalId || bundleAdd?.rentalId;
    setBundleExchange(null);
    setBundleAdd(null);
    setAutoScrollTargetCategory(null);

    setStatusFilter('all');
    setCategoryFilter('all');

    setCurrentView('history');
    setRentalsSubTab('active');
    if (targetRentalId) {
      setExpandedRentals(prev => ({ ...prev, [targetRentalId]: true }));
    }
  };

  // 4. Ersatzteil im Austauschmodus auswählen
  const handleSelectExchangeReplacement = async (newItem: EquipmentItem) => {
    if (!bundleExchange) return;
    const { rentalId, oldItem } = bundleExchange;
    setAutoScrollTargetCategory(null);

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/rentals/${rentalId}/exchange`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': password
        },
        body: JSON.stringify({
          return_item_id: oldItem.id,
          new_item_id: newItem.id,
          note: `Austausch gegen ${oldItem.item_code}`
        })
      });

      if (res.ok) {
        setBundleExchange(null);
        setStatusFilter('all');
        await fetchItems(password);
        setCurrentView('history');
        setRentalsSubTab('active');
        setExpandedRentals(prev => ({ ...prev, [rentalId]: true }));
      } else {
        const data: ApiResponse = await res.json();
        setError(data.message || 'Fehler beim Austauschen des Equipments');
      }
    } catch (err) {
      setError('Fehler beim Austauschen des Equipments');
    } finally {
      setLoading(false);
    }
  };

  // 5. Equipment im Add-Modus auswählen
  const handleSelectAddEquipment = async (item: EquipmentItem) => {
    if (!bundleAdd) return;
    const { rentalId } = bundleAdd;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/rentals/${rentalId}/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': password
        },
        body: JSON.stringify({
          item_id: item.id
        })
      });

      if (res.ok) {
        setBundleAdd(null);
        setStatusFilter('all');
        await fetchItems(password);
        setCurrentView('history');
        setRentalsSubTab('active');
        setExpandedRentals(prev => ({ ...prev, [rentalId]: true }));
      } else {
        const data: ApiResponse = await res.json();
        setError(data.message || 'Fehler beim Hinzufügen des Equipments');
      }
    } catch (err) {
      setError('Fehler beim Hinzufügen des Equipments');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteItem = (id: number) => {
    const item = items.find(i => i.id === id);
    const hasHistory = (item?.rental_count || 0) > 0;
    setConfirmDelete({
      type: 'item',
      id,
      title: hasHistory ? 'Ausmustern?' : 'Teil löschen?',
      message: hasHistory 
        ? 'Dieser Artikel existiert in früheren Ausleihen. Er wird aus dem aktiven Bestand entfernt, der Verlauf bleibt erhalten.'
        : 'Möchtest du dieses Ausrüstungsteil wirklich aus dem Bestand löschen?'
    });
  };

  const executeDelete = async () => {
    if (!confirmDelete) return;
    sound.prepare();
    actionHaptic('tap');
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
        if (!await fetchItems(password)) { setSuccess(null); return; }
        actionHaptic('success');
        sound.play('delete');
        setSuccess('Änderung gespeichert.');
        setTimeout(() => setSuccess(null), 2000);
      } else {
        const data: ApiResponse = await res.json();
        actionHaptic('error');
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
      sound.prepare();
      setBag(prev => [...prev, item]);
      sound.play('bag');
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

  const toggleRentalAccordion = (rentalId: number, defaultState: boolean = false) => {
    setExpandedRentals(prev => {
      const current = prev[rentalId] !== undefined ? prev[rentalId] : defaultState;
      return {
        ...prev,
        [rentalId]: !current
      };
    });
  };

  const handleMarkAsPaid = async (rentalId: number, paid: boolean = true) => {
    if (paymentLocks.current.has(rentalId)) return;
    paymentLocks.current.add(rentalId);

    const previousRental = history.find(r => r.id === rentalId);
    const previousPaid = previousRental?.paid ?? !paid;

    // Sofortige sichtbare Rückmeldung – Server-Speicherung läuft anschließend im Hintergrund.
    setHistory(prev => prev.map(r => r.id === rentalId ? { ...r, paid } : r));
    setPaymentPendingRentalIds(prev => new Set(prev).add(rentalId));
    setError(null);
    if (paid && previousPaid !== paid) sound.prepare();
    actionHaptic('tap');

    try {
      const res = await fetch(`${API_BASE}/rentals/${rentalId}/payment-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': password
        },
        body: JSON.stringify({ paid })
      });

      if (!res.ok) {
        const data: ApiResponse = await res.json().catch(() => ({ success: false }));
        setHistory(prev => prev.map(r => r.id === rentalId ? { ...r, paid: previousPaid } : r));
        setError(data.message || (paid ? 'Fehler beim Markieren als bezahlt' : 'Fehler beim Markieren als offen'));
        return;
      }

      const data = await res.json();
      if (!data.success || data.paid !== paid) throw new Error('Zahlungsstatus wurde nicht bestätigt');
      setItems(prev=>prev.map(item=>item.active_rental_id===rentalId ? {...item,bezahlt:paid} : item));
      setEditingBundleRental(prev=>prev?.id===rentalId ? {...prev,paid} : prev);
      if (data.summary) setHistorySummary(data.summary);
      else if (previousRental && previousPaid !== paid) setHistorySummary(prev => ({ ...prev, paidRevenue: Number(prev.paidRevenue) + (paid ? 1 : -1) * Number(previousRental.fee_total) }));
      actionHaptic('success');
      if (paid && previousPaid !== paid) sound.play('money');
      setSuccess(paid ? 'Zahlung als bezahlt gespeichert.' : 'Zahlungsstatus auf offen gesetzt.');
      window.setTimeout(() => setSuccess(null), 1800);
    } catch (err) {
      setHistory(prev => prev.map(r => r.id === rentalId ? { ...r, paid: previousPaid } : r));
      actionHaptic('error');
      setError(paid ? 'Fehler beim Markieren als bezahlt' : 'Fehler beim Markieren als offen');
    } finally {
      paymentLocks.current.delete(rentalId);
      setPaymentPendingRentalIds(prev => {
        const next = new Set(prev);
        next.delete(rentalId);
        return next;
      });
    }
  };

  const handleLogout = () => {
    ++fetchGeneration.current;
    ++photoGeneration.current;
    setIsLoggedIn(false);
    setPassword('');
    sessionStorage.removeItem('hockey_rent_session');
    fetchPublicItems();
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const generation = ++photoGeneration.current;
    const targetId = editItem?.id;
    setPhotoProcessing(true);
    setError(null);
    try {
      const image = await compressEquipmentPhoto(file);
      if (generation !== photoGeneration.current) return;
      if (targetId) setEditItem(prev => prev?.id === targetId ? { ...prev, image } : prev);
      else setNewItem(prev => ({ ...prev, image }));
    } catch (err) {
      if (generation === photoGeneration.current) setError(err instanceof Error ? err.message : 'Foto konnte nicht geladen werden.');
    } finally {
      if (generation === photoGeneration.current) setPhotoProcessing(false);
    }
  };

  // Group displayed items by category
  const groupedItems = displayedItems.reduce((acc, item) => {
    const cat = item.category_label || item.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, EquipmentItem[]>);

  // Dynamische Kategorienliste der aktuell vorhandenen Gruppen
  const currentCategoryList = Object.keys(groupedItems);

  // Prüfen, ob alle aktuell vorhandenen Kategorien geöffnet sind
  const allCategoriesOpen = 
    currentCategoryList.length > 0 && 
    currentCategoryList.every(cat => !collapsedCategories[cat]);

  // Globaler Toggle für alle Kategorien: "Alle öffnen" bzw. "Alle schließen"
  const handleToggleAllCategories = () => {
    const next: Record<string, boolean> = { ...collapsedCategories };
    const targetCollapsed = allCategoriesOpen; // Wenn alle offen sind -> auf true (schließen) setzen, sonst auf false (öffnen)
    currentCategoryList.forEach(cat => {
      next[cat] = targetCollapsed;
    });
    // Dynamisch auch für alle anderen im Bestand vorhandenen Kategorien berücksichtigen
    items.forEach(i => {
      const cat = i.category_label || i.category;
      if (cat) next[cat] = targetCollapsed;
    });
    setCollapsedCategories(next);
  };

  // Split rentals into Aktuell (returned_at === null) and Abgeschlossen (returned_at !== null)
  const activeRentals = history.filter(r => !r.returned_at);
  const completedRentals = history.filter(r => !!r.returned_at);

  // LOGGED-OUT PUBLIC VIEW (Deutlich kompakter gestaltet)
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-[#1C1F2A] text-slate-200 font-sans">
        <header className="bg-[#181B24] border-b border-slate-800 sticky top-0 z-30 shadow-md">
          <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-blue-600/20 rounded-lg flex items-center justify-center border border-blue-500/30">
                <Package className="text-blue-400 w-5 h-5" />
              </div>
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-white">Wiesel HockeyRent</h1>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span className="text-emerald-400 font-bold text-[10px] sm:text-xs uppercase tracking-wider">{publicItems.length} Verfügbar</span>
              <SoundToggle {...sound} />
            </div>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-4 py-6">
          <div className="mb-6">
            <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">Ausrüstungsübersicht</h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">Aktuell verfügbares Equipment im Bestand.</p>
          </div>

          {publicItems.length === 0 ? (
            <EmptyState icon={<Package className="w-10 h-10 text-slate-500" />} message="Aktuell ist kein Equipment verfügbar." />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5 sm:gap-3">
              {publicItems.map(item => (
                <div key={item.id} className="bg-[#252936] rounded-xl border border-slate-700/60 shadow-sm overflow-hidden flex flex-col justify-between group hover:border-slate-600 transition-all">
                  <div className="aspect-[4/3] bg-[#181B24] relative overflow-hidden flex-shrink-0">
                    {item.image ? (
                      <img 
                        loading="lazy" decoding="async" src={item.image}
                        alt={item.brand} 
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-600">
                        <ImageIcon className="w-6 h-6" />
                      </div>
                    )}
                    <div className="absolute top-1.5 right-1.5">
                      <span className="bg-[#181B24]/90 backdrop-blur-md text-white border border-slate-700/80 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold shadow-sm">
                        {item.item_code}
                      </span>
                    </div>
                  </div>
                  <div className="p-2.5 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="text-xs sm:text-sm font-bold text-white truncate leading-tight">{item.category_label}</h3>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">{item.brand}</p>
                    </div>
                    <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-800">
                      <span className="text-[10px] font-semibold text-emerald-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        Frei
                      </span>
                      <span className="text-[10px] font-bold text-slate-300 bg-[#181B24] px-1.5 py-0.5 rounded border border-slate-700">
                        Gr. {item.size}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-10 md:mt-14 p-6 md:p-7 bg-[#252936] rounded-2xl border border-slate-700/60 shadow-lg text-center max-w-md mx-auto">
            <h3 className="text-lg font-bold text-white mb-1">Admin-Bereich</h3>
            <p className="text-slate-400 mb-4 text-xs">
              Zum Verleihen oder Verwalten des Bestands mit Passwort anmelden.
            </p>
            <form onSubmit={(e) => { e.preventDefault(); checkLogin(password); }} className="space-y-3">
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                className="w-full px-4 py-2.5 rounded-xl bg-[#181B24] border border-slate-700 text-base text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none transition-all box-border"
                placeholder="Passwort eingeben"
              />
              {error && <p className="text-red-400 text-xs font-medium">{error}</p>}
              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-xl shadow-md transition-all active:scale-95 text-sm cursor-pointer"
              >
                Anmelden
              </button>
            </form>
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
              <h1 className="text-sm sm:text-lg md:text-xl font-bold tracking-tight text-white">Wiesel HockeyRent</h1>
              <span className="hidden sm:inline text-[10px] md:text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-blue-300 border border-slate-700">Admin</span>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
          <nav className="hidden md:flex items-center gap-1.5">
            <TabButton active={currentView === 'available'} onClick={() => setCurrentView('available')} icon={<Package className="w-4 h-4" />} label="Bestand" />
            <TabButton active={currentView === 'bag'} onClick={() => setCurrentView('bag')} icon={<ShoppingBag className="w-4 h-4" />} label="Tasche" count={bag.length} />
            {/* Sichtbare Benennung: "Ausleihen" mit Zähler der aktiven Vorgänge */}
            <TabButton active={currentView === 'rentals' || currentView === 'history'} onClick={() => setCurrentView('rentals')} icon={<History className="w-4 h-4" />} label="Ausleihen" count={activeRentals.length} />
            <TabButton active={currentView === 'add'} onClick={() => setCurrentView('add')} icon={<Plus className="w-4 h-4" />} label="Neu" />
            <SoundToggle {...sound} />
            <button 
              onClick={handleLogout}
              className="ml-2 p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
              title="Abmelden"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </nav>

          <div className="md:hidden flex items-center gap-1">
          <SoundToggle {...sound} />
          <button 
            onClick={handleLogout}
            className="md:hidden p-2 text-slate-400 hover:text-red-400 transition-all cursor-pointer"
            title="Abmelden"
          >
            <LogOut className="w-5 h-5" />
          </button>
          </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 md:py-8">
        {success && <div role="status" className="mb-4 rounded-2xl border border-emerald-700 bg-emerald-950/60 p-4 text-sm text-emerald-200">{success}</div>}
        {/* Error Messages */}
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
              {/* BESTAND Header Row */}
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

              {/* Spezialmodus: Austausch */}
              {bundleExchange && (
                <div className="bg-[#181B24] border-2 border-blue-500 rounded-2xl p-4 shadow-xl flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 flex-shrink-0">
                      <ArrowRightLeft className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base sm:text-lg font-extrabold text-white flex items-center gap-2 flex-wrap">
                        <span>{bundleExchange.oldItem.item_code} austauschen</span>
                        <span className="text-xs font-normal text-slate-400">
                          ({bundleExchange.oldItem.brand} · Gr. {bundleExchange.oldItem.size})
                        </span>
                      </h3>
                      <p className="text-xs sm:text-sm text-blue-300 font-medium mt-0.5">
                        Wähle einen neuen {bundleExchange.category}.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCancelSpecialMode}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer shadow flex-shrink-0"
                  >
                    Abbrechen
                  </button>
                </div>
              )}

              {/* Spezialmodus: Teil hinzufügen */}
              {bundleAdd && (
                <div className="bg-[#181B24] border-2 border-emerald-500 rounded-2xl p-4 shadow-xl flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex-shrink-0">
                      <Plus className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base sm:text-lg font-extrabold text-white">
                        Teil zu {bundleAdd.rental.renter_name} hinzufügen
                      </h3>
                      <p className="text-xs sm:text-sm text-emerald-300 font-medium mt-0.5">
                        Wähle ein verfügbares Equipmentteil.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCancelSpecialMode}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer shadow flex-shrink-0"
                  >
                    Abbrechen
                  </button>
                </div>
              )}

              {/* Spieler / Goalie als zwei getrennte Bestandslisten */}
              <div className="grid grid-cols-2 gap-1.5 p-1.5 rounded-2xl bg-[#181B24] border border-slate-700/70">
                <button
                  type="button"
                  onClick={() => { setEquipmentGroupFilter('player'); setCategoryFilter('all'); setCollapsedCategories({}); }}
                  className={`py-2.5 px-3 rounded-xl text-sm font-bold transition-all cursor-pointer ${equipmentGroupFilter === 'player' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-[#252936]'}`}
                >
                  Spieler
                </button>
                <button
                  type="button"
                  onClick={() => { setEquipmentGroupFilter('goalie'); setCategoryFilter('all'); setCollapsedCategories({}); }}
                  className={`py-2.5 px-3 rounded-xl text-sm font-bold transition-all cursor-pointer ${equipmentGroupFilter === 'goalie' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-[#252936]'}`}
                >
                  Goalie
                </button>
              </div>

              {/* Kompakte Bestandszahlen & Statusfilter (nur im Normalmodus) */}
              {!(bundleExchange || bundleAdd) && (
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
              )}

              {/* Kompakter Kategorienfilter */}
              <div className="flex items-center gap-2">
                <div className="min-w-0 w-64 max-w-full">
                  {/* Kategorie Dropdown */}
                  <div className="relative">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <select
                      aria-label="Kategorie filtern"
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
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


                </div>

                {hasActiveExtraFilters && (
                  <button
                    type="button"
                    onClick={resetCategoryFilter}
                    className="text-xs font-semibold text-slate-400 hover:text-white bg-[#181B24] hover:bg-[#282D3B] border border-slate-700 px-3.5 py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer self-start sm:self-auto"
                    title="Kategorienfilter zurücksetzen" aria-label="Kategorienfilter zurücksetzen"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                    <span className="hidden sm:inline">Zurücksetzen</span>
                  </button>
                )}
              </div>

              {/* Equipment-Liste nach Kategorien gruppiert mit Accordion */}
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
                  {/* Kompakte globale Accordion-Steuerung: Alle öffnen / Alle schließen */}
                  <div className="flex items-center justify-between px-1 py-1">
                    <div className="text-xs text-slate-400 font-medium flex items-center gap-2">
                      <span className="font-semibold text-slate-300">
                        {currentCategoryList.length} {currentCategoryList.length === 1 ? 'Kategorie' : 'Kategorien'}
                      </span>
                      <span className="text-slate-600">·</span>
                      <span>
                        {displayedItems.length} {displayedItems.length === 1 ? 'Teil' : 'Teile'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleToggleAllCategories}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-[#252936] hover:bg-[#282D3B] border border-slate-700/80 transition-all shadow-sm cursor-pointer active:scale-95"
                      title={allCategoriesOpen ? "Alle Kategorien schließen" : "Alle Kategorien öffnen"}
                    >
                      {allCategoriesOpen ? (
                        <>
                          <ChevronUp className="w-3.5 h-3.5 text-blue-400" />
                          <span>Alle schließen</span>
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-3.5 h-3.5 text-blue-400" />
                          <span>Alle öffnen</span>
                        </>
                      )}
                    </button>
                  </div>

                  {Object.entries(groupedItems)
                    .sort(([a], [b]) => a.localeCompare(b, 'de'))
                    .map(([category, catItems]) => {
                      const isCollapsed = !!collapsedCategories[category];
                      const selectedInBag = bag.filter(b => (b.category_label || b.category) === category);
                      const hasSelectedInBag = selectedInBag.length > 0;

                      return (
                        <div 
                          key={category} 
                          ref={el => { categoryRefs.current[category] = el; }}
                          id={`category-section-${category.replace(/\s+/g, '-')}`}
                          className="bg-[#252936] rounded-2xl border border-slate-700/60 overflow-hidden shadow-md transition-all scroll-mt-20 sm:scroll-mt-24"
                        >
                          <button
                            type="button"
                            onClick={() => toggleCategoryAccordion(category)}
                            className="w-full px-4 py-3.5 sm:px-5 sm:py-4 flex items-center justify-between text-left hover:bg-[#282D3B] transition-colors cursor-pointer group"
                            aria-expanded={!isCollapsed}
                          >
                            <div className="flex items-center gap-3 min-w-0 pr-2">
                              <h3 className="text-base sm:text-lg font-bold text-white tracking-tight truncate">
                                {category}
                              </h3>
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#181B24] text-slate-400 border border-slate-700 flex-shrink-0">
                                {catItems.length}
                              </span>
                            </div>

                            <div className="flex items-center gap-2.5 flex-shrink-0">
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
                              <div className="p-1 rounded-lg bg-[#181B24] text-slate-400 group-hover:text-white transition-colors">
                                {isCollapsed ? (
                                  <ChevronDown className="w-4 h-4" />
                                ) : (
                                  <ChevronUp className="w-4 h-4" />
                                )}
                              </div>
                            </div>
                          </button>

                          {!isCollapsed && (
                            <CategoryGalleryRow
                              category={category}
                              items={catItems}
                              bag={bag}
                              bundleExchange={bundleExchange}
                              bundleAdd={bundleAdd}
                              onSelectExchange={handleSelectExchangeReplacement}
                              onSelectAdd={handleSelectAddEquipment}
                              onRent={(item) => {
                                setRentingItem(item);
                                const today = new Date().toISOString().split('T')[0];
                                setRentForm({
                                  item_ids: [item.id],
                                  renter_name: '',
                                  rented_at: today,
                                  due_date: calculateDueDate(today),
                                  paid: false,
                                  fee_total: 60,
                                  note: ''
                                });
                              }}
                              onReturn={handleReturnSingleItemFromBundle}
                              onMarkPaid={handleMarkAsPaid}
                              onEdit={(item) => { setEditItem(item); setCurrentView('add'); }}
                              onDelete={handleDeleteItem}
                              onToggleBag={toggleBag}
                            />
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
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.45fr)_minmax(380px,1fr)] gap-6 xl:gap-8 items-start">
                  <div className="min-w-0 space-y-4">
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
                            <img loading="lazy" decoding="async" src={item.image} alt={item.brand} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
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

                  <div className="min-w-0 w-full bg-[#252936] p-5 xl:p-6 rounded-3xl border border-slate-700/60 shadow-xl h-fit lg:sticky lg:top-24">
                    <h3 className="text-xl font-bold text-white mb-6">Verleih-Details</h3>
                    <form onSubmit={(e) => { e.preventDefault(); handleRentItems(); }} className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">
                          Name des Ausleihers
                        </label>
                        <input
                          required
                          type="text"
                          value={rentForm.renter_name}
                          onChange={(e) => setRentForm({ ...rentForm, renter_name: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl bg-[#181B24] border border-slate-700 text-base sm:text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none transition-all box-border"
                          placeholder="z.B. Max Mustermann"
                        />
                      </div>
                      {/* Ausleihdatum und automatisch berechnetes Rückgabedatum (6 Monate) */}
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                        <div className="w-full min-w-0 max-w-full">
                          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">
                            Ausleihdatum
                          </label>
                          <div className="w-full min-w-0 max-w-full overflow-hidden">
                            <input
                              type="date"
                              required
                              value={rentForm.rented_at}
                              onChange={(e) => handleRentedAtChange(e.target.value)}
                              className="w-full min-w-0 max-w-full block box-border px-3 py-3 rounded-xl bg-[#181B24] border border-slate-700 text-base text-white focus:ring-2 focus:ring-blue-500 outline-none"
                              style={{ WebkitAppearance: 'none', appearance: 'none' }}
                            />
                          </div>
                        </div>

                        <div className="w-full min-w-0 max-w-full">
                          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">
                            Rückgabe bis
                          </label>
                          <div className="min-w-0 px-3 py-3 rounded-xl bg-[#181B24] border border-slate-700 text-slate-200 font-bold text-base sm:text-sm flex items-center justify-between gap-2">
                            <span className="min-w-0 whitespace-nowrap">{formatDateDe(rentForm.due_date)}</span>
                            <span className="flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-300 uppercase tracking-wider">
                              6 Mon.
                            </span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">
                          Leihgebühr (€)
                        </label>
                        {/* 60 Euro Standardwert vorbelegt */}
                        <input
                          required
                          type="number"
                          step="0.50"
                          value={rentForm.fee_total}
                          onChange={(e) => setRentForm(prev => ({ ...prev, fee_total: e.target.value === '' ? '' : Number(e.target.value) }))}
                          className="w-full px-4 py-3 rounded-xl bg-[#181B24] border border-slate-700 text-base sm:text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none transition-all box-border"
                          placeholder="60.00"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">
                          Notiz (Optional)
                        </label>
                        <textarea
                          value={rentForm.note}
                          onChange={(e) => setRentForm({ ...rentForm, note: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl bg-[#181B24] border border-slate-700 text-base sm:text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none box-border"
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

          {/* AUSLEIHEN VIEW: Zentrale Verwaltung der Verleihvorgänge, segmentiert in "Aktuell" und "Abgeschlossen" */}
          {(currentView === 'rentals' || currentView === 'history') && (
            <motion.div 
              key="rentals"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
                <div>
                  <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">Ausleihen</h2>
                  <p className="text-slate-400 mt-1">Laufende und abgeschlossene Verleihvorgänge verwalten.</p>
                </div>
                <div className="bg-[#252936] border border-slate-700/60 px-4 py-2.5 rounded-2xl shadow-md flex items-center gap-3 self-start md:self-auto">
                  <span className="text-slate-400 text-xs sm:text-sm font-bold uppercase tracking-wider">Einnahmen:</span>
                  <span className="text-emerald-400 font-black text-lg">
                    {Number(historySummary.paidRevenue).toFixed(2)} €
                  </span>
                </div>
              </div>

              {/* Segmented Control: Aktuell | Abgeschlossen (Aktuell ist Standard) */}
              <div className="bg-[#181B24] p-1.5 rounded-2xl border border-slate-800 flex items-center gap-1.5 w-full sm:w-80">
                <button
                  type="button"
                  onClick={() => setRentalsSubTab('active')}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    rentalsSubTab === 'active'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white hover:bg-[#252936]'
                  }`}
                >
                  <span>Aktuell</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${
                    rentalsSubTab === 'active' ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {activeRentals.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setRentalsSubTab('completed')}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    rentalsSubTab === 'completed'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white hover:bg-[#252936]'
                  }`}
                >
                  <span>Abgeschlossen</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${
                    rentalsSubTab === 'completed' ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {historySummary.completedCount}
                  </span>
                </button>
              </div>

              {/* Tab Content: Aktuell (Ausschließlich offene Vorgänge: returned_at IS NULL) */}
              {rentalsSubTab === 'active' && (
                <div className="space-y-3">
                  {activeRentals.length === 0 ? (
                    <EmptyState icon={<Layers className="w-12 h-12 text-slate-500" />} message="Aktuell gibt es keine offenen Ausleihen." />
                  ) : (
                    activeRentals.map(rental => (
                      <ActiveRentalCard
                        key={rental.id}
                        rental={rental}
                        isExpanded={expandedRentals[rental.id] !== undefined ? expandedRentals[rental.id] : true}
                        onToggle={() => toggleRentalAccordion(rental.id, true)}
                        onMarkAsPaid={(paidState?: boolean) => handleMarkAsPaid(rental.id, paidState !== undefined ? paidState : !rental.paid)}
                        isPaymentPending={paymentPendingRentalIds.has(rental.id)}
                        onReturnAll={() => setConfirmReturnRental({ id: rental.id, renterName: rental.renter_name })}
                        onReturnSingleItem={(itemId, note) => handleReturnSingleItemFromBundle(rental.id, itemId, note)}
                        onExchangeItem={(item) => startExchange(rental, item)}
                        onAddItem={() => startAddItem(rental)}
                        onEditBundle={() => setEditingBundleRental(rental)}
                        onDelete={() => setConfirmDelete({ type: 'history', id: rental.id, title: 'Ausleihe löschen?', message: rental.contract?.status === 'signed' ? 'Diese Ausleihe einschließlich des unterschriebenen Vertragsdatensatzes wirklich löschen? Das lässt sich nicht rückgängig machen.' : 'Möchtest du diese laufende Ausleihe wirklich löschen?' })}
                        onOpenContract={() => setContractModal({ isOpen: true, rentalId: rental.id, mode: rental.contract?.status === 'signed' ? 'preview' : 'form' })}
                        onOpenSigningLink={(rId) => setShareSigningRentalId(rId)}
                        onDownloadPdf={() => handleDownloadPdf(rental.id)}
                      />
                    ))
                  )}
                </div>
              )}

              {/* Tab Content: Abgeschlossen (Ausschließlich beendete Vorgänge: returned_at IS NOT NULL) */}
              {rentalsSubTab === 'completed' && (
                <div className="space-y-3">
                  {completedRentals.length === 0 ? (
                    <EmptyState icon={<Calendar className="w-12 h-12 text-slate-500" />} message="Noch keine abgeschlossenen Ausleihen vorhanden." />
                  ) : (
                    completedRentals.map(rental => (
                      <CompletedRentalCard
                        key={rental.id}
                        rental={rental}
                        isExpanded={expandedRentals[rental.id] !== undefined ? expandedRentals[rental.id] : false}
                        onToggle={() => toggleRentalAccordion(rental.id, false)}
                        onMarkAsPaid={(paidState?: boolean) => handleMarkAsPaid(rental.id, paidState !== undefined ? paidState : !rental.paid)}
                        isPaymentPending={paymentPendingRentalIds.has(rental.id)}
                        onDelete={() => setConfirmDelete({ type: 'history', id: rental.id, title: 'Ausleihe löschen?', message: rental.contract?.status === 'signed' ? 'Diese Ausleihe einschließlich des unterschriebenen Vertragsdatensatzes wirklich löschen? Das lässt sich nicht rückgängig machen.' : 'Möchtest du diese abgeschlossene Ausleihe wirklich löschen?' })}
                        onOpenContract={() => setContractModal({ isOpen: true, rentalId: rental.id, mode: 'preview' })}
                        onDownloadPdf={() => handleDownloadPdf(rental.id)}
                      />
                    ))
                  )}
                  {historySummary.completedCount > 25 && (
                    <div className="flex items-center justify-between gap-2 pt-3">
                      <button type="button" disabled={loading || completedPage <= 1} onClick={() => void fetchItems(password, completedPage - 1)}
                        className="p-3 rounded-xl border border-slate-700 disabled:opacity-40 hover:bg-slate-800" aria-label="Vorherige Historienseite"><ChevronLeft className="w-5 h-5" /></button>
                      <span className="text-xs text-slate-400" role="status">Seite {completedPage} von {Math.max(1, Math.ceil(historySummary.completedCount / 25))}</span>
                      <button type="button" disabled={loading || completedPage >= Math.ceil(historySummary.completedCount / 25)} onClick={() => void fetchItems(password, completedPage + 1)}
                        className="p-3 rounded-xl border border-slate-700 disabled:opacity-40 hover:bg-slate-800" aria-label="Nächste Historienseite"><ChevronRight className="w-5 h-5" /></button>
                    </div>
                  )}
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
                        <select
                          required
                          value={editItem ? editItem.category : newItem.category}
                          onChange={(e) => {
                            const cat = e.target.value as EquipmentCategory;
                            const label = CATEGORIES.find(c => c.value === cat)?.label || '';
                            if (editItem) setEditItem({ ...editItem, category: cat, category_label: label });
                            else setNewItem({ ...newItem, category: cat, category_label: label });
                          }}
                          className="w-full px-4 py-3 rounded-xl bg-[#181B24] border border-slate-700 text-base md:text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all appearance-none cursor-pointer box-border"
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
                          <input
                            required
                            type="text"
                            value={editItem ? editItem.brand : newItem.brand}
                            onChange={(e) => editItem ? setEditItem({ ...editItem, brand: e.target.value }) : setNewItem({ ...newItem, brand: e.target.value })}
                            className="w-full px-4 py-3 rounded-xl bg-[#181B24] border border-slate-700 text-base md:text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none transition-all box-border"
                            placeholder="z.B. Bauer"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Größe</label>
                          <input
                            required
                            type="text"
                            value={editItem ? editItem.size : newItem.size}
                            onChange={(e) => editItem ? setEditItem({ ...editItem, size: e.target.value }) : setNewItem({ ...newItem, size: e.target.value })}
                            className="w-full px-4 py-3 rounded-xl bg-[#181B24] border border-slate-700 text-base md:text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none transition-all box-border"
                            placeholder="z.B. L"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Zustand / Notiz</label>
                        <textarea
                          value={editItem ? (editItem.condition_note || '') : newItem.condition_note}
                          onChange={(e) => editItem ? setEditItem({ ...editItem, condition_note: e.target.value }) : setNewItem({ ...newItem, condition_note: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl bg-[#181B24] border border-slate-700 text-base md:text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none box-border"
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
                          disabled={loading || photoProcessing}
                          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-4 rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                        >
                          {photoProcessing ? 'Foto wird vorbereitet...' : loading ? 'Speichert...' : (
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
        <MobileNavItem active={currentView === 'rentals' || currentView === 'history'} onClick={() => setCurrentView('rentals')} icon={<History />} label="Ausleihen" count={activeRentals.length} />
        <MobileNavItem active={currentView === 'add'} onClick={() => setCurrentView('add')} icon={<Plus />} label="Neu" />
      </nav>

      {/* Rent Modal (Single Item) - Datumsfeld Layout-Fix */}
      <AnimatePresence>
        {rentingItem && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-[#252936] w-full max-w-md rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-700/80 box-border"
            >
              <h3 className="text-xl sm:text-2xl font-bold mb-4 text-white">Equipment verleihen</h3>
              <p className="text-xs text-slate-400 mb-6 font-mono bg-[#181B24] p-2.5 rounded-lg border border-slate-700">
                {rentingItem.category_label} · {rentingItem.brand} (Größe {rentingItem.size}) · {rentingItem.item_code}
              </p>
              <form onSubmit={handleRentSingleItem} className="space-y-4">
                <div className="w-full min-w-0 max-w-full">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Verliehen an</label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={rentForm.renter_name}
                    onChange={(e) => setRentForm({ ...rentForm, renter_name: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-[#181B24] border border-slate-700 text-base sm:text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none box-border"
                    placeholder="Name der Person"
                  />
                </div>

                {/* Datumsfeld und Rückgabe bis (6 Monate) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
                  <div className="w-full min-w-0 max-w-full overflow-hidden">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Verliehen am</label>
                    <div className="w-full min-w-0 max-w-full overflow-hidden">
                      <input
                        type="date"
                        required
                        value={rentForm.rented_at}
                        onChange={(e) => handleRentedAtChange(e.target.value)}
                        className="w-full min-w-0 max-w-full block box-border px-3 py-3 rounded-xl bg-[#181B24] border border-slate-700 text-base text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        style={{ WebkitAppearance: 'none', appearance: 'none' }}
                      />
                    </div>
                  </div>

                  <div className="w-full min-w-0 max-w-full">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Rückgabe bis</label>
                    <div className="px-3.5 py-3 rounded-xl bg-[#181B24] border border-blue-500/40 text-blue-300 font-bold text-base sm:text-sm flex items-center justify-between">
                      <span>{formatDateDe(rentForm.due_date)}</span>
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 uppercase">
                        6 Mon.
                      </span>
                    </div>
                  </div>
                </div>

                <div className="w-full min-w-0 max-w-full">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Leihgebühr (€)</label>
                  {/* 60 Euro Standardwert vorbelegt */}
                  <input
                    type="number"
                    step="0.50"
                    required
                    value={rentForm.fee_total}
                    onChange={(e) => setRentForm(prev => ({ ...prev, fee_total: e.target.value === '' ? '' : Number(e.target.value) }))}
                    className="w-full px-4 py-3 rounded-xl bg-[#181B24] border border-slate-700 text-base sm:text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none box-border"
                    placeholder="60.00"
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

      {/* MODAL: BUNDLE BEARBEITEN */}
      <AnimatePresence>
        {editingBundleRental && (
          <BundleEditorModal
            rental={editingBundleRental}
            onClose={() => setEditingBundleRental(null)}
            onStartExchange={(item) => startExchange(editingBundleRental, item)}
            onStartAddItem={() => startAddItem(editingBundleRental)}
            onReturnSingleItem={(itemId, note) => handleReturnSingleItemFromBundle(editingBundleRental.id, itemId, note)}
            onUpdateRentalDetails={(updates) => handleUpdateRentalDetails(editingBundleRental.id, updates)}
            onReturnAll={() => handleReturnRental(editingBundleRental.id)}
            onOpenContract={() => {
              const rId = editingBundleRental.id;
              const isSigned = editingBundleRental.contract?.status === 'signed';
              setEditingBundleRental(null);
              setContractModal({ isOpen: true, rentalId: rId, mode: isSigned ? 'preview' : 'form' });
            }}
          />
        )}
      </AnimatePresence>

      {/* MODAL: VERTRAGSWEG NACH NEUER AUSLEIHE WÄHLEN */}
      <AnimatePresence>
        {contractChoiceRentalId !== null && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-[#252936] w-full max-w-md rounded-3xl p-5 sm:p-6 shadow-2xl border border-slate-700/80"
            >
              <h3 className="text-xl font-extrabold text-white">Vertrag erstellen</h3>
              <p className="text-sm text-slate-400 mt-1.5">Beide Wege führen zum vollständigen Vertrag mit digitaler Unterschrift.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
                <button type="button"
                  onClick={() => {
                    const rentalId = contractChoiceRentalId;
                    setContractChoiceRentalId(null);
                    setShareSigningRentalId(rentalId);
                  }}
                  className="bg-blue-600 hover:bg-blue-500 text-white border border-blue-500 font-bold px-4 py-4 rounded-xl text-sm flex items-center justify-center gap-2 cursor-pointer">
                  <Share2 className="w-4 h-4" />
                  Per Link ausfüllen
                </button>
                <button type="button"
                  onClick={() => {
                    const rentalId = contractChoiceRentalId;
                    setContractChoiceRentalId(null);
                    setContractModal({ isOpen: true, rentalId, mode: 'form' });
                  }}
                  className="bg-[#181B24] hover:bg-[#282D3B] text-slate-100 border border-slate-700 font-bold px-4 py-4 rounded-xl text-sm flex items-center justify-center gap-2 cursor-pointer">
                  <Edit className="w-4 h-4" />
                  Auf diesem Gerät
                </button>
              </div>
              <button type="button" onClick={() => setContractChoiceRentalId(null)}
                className="w-full mt-3 py-2.5 text-sm text-slate-400 hover:text-white cursor-pointer">
                Später
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: SICHEREN VERTRAGSLINK ERZEUGEN / TEILEN */}
      <AnimatePresence>
        {shareSigningRentalId !== null && (
          <ShareSigningLinkModal
            rentalId={shareSigningRentalId}
            password={password}
            onClose={() => setShareSigningRentalId(null)}
          />
        )}
      </AnimatePresence>

      {/* MODAL: DIGITALER AUSLEIHVERTRAG (PHASE 1: EINVERSTÄNDNISERKLÄRUNG) */}
      <AnimatePresence>
        {contractModal && contractModal.isOpen && (
          <ContractModal
            rentalId={contractModal.rentalId}
            initialMode={contractModal.mode}
            password={password}
            onClose={() => setContractModal(null)}
            onContractSaved={(savedContract) => {
              setHistory(prev => prev.map(r => r.id === contractModal.rentalId ? { 
                ...r, 
                contract: savedContract, 
                renter_name: `${savedContract.first_name} ${savedContract.last_name}` 
              } : r));
            }}
          />
        )}
      </AnimatePresence>

      {/* Vollständige Rückgabe bestätigen */}
      <AnimatePresence>
        {confirmReturnRental && (
          <ConfirmModal
            show={!!confirmReturnRental}
            title="Alles zurückgeben?"
            message={`Möchtest du die komplette Ausleihe von ${confirmReturnRental.renterName} wirklich beenden und alle aktuell ausgeliehenen Teile zurückgeben?`}
            onConfirm={() => {
              const rentalId = confirmReturnRental.id;
              setConfirmReturnRental(null);
              handleReturnRental(rentalId);
            }}
            onCancel={() => setConfirmReturnRental(null)}
            confirmText="Alles zurückgeben"
            cancelText="Abbrechen"
            isDanger={false}
          />
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

// ITEM CARD COMPONENT (Bestandsansicht)
interface ItemCardProps {
  item: EquipmentItem;
  onRent: () => void;
  onReturn?: () => void;
  onMarkPaid?: (paid?: boolean) => void;
  onDelete: () => void;
  onEdit: () => void;
  onToggleBag: () => void;
  inBag: boolean;
  exchangeMode?: boolean;
  onSelectExchange?: () => void;
  addMode?: boolean;
  onSelectAdd?: () => void;
}

const ItemCard: React.FC<ItemCardProps> = ({ 
  item, 
  onRent, 
  onReturn, 
  onMarkPaid, 
  onDelete, 
  onEdit, 
  onToggleBag,
  inBag,
  exchangeMode,
  onSelectExchange,
  addMode,
  onSelectAdd
}) => {
  const isRented = item.status === 'verliehen';

  return (
    <div className={`bg-[#252936] rounded-2xl border shadow-lg hover:shadow-2xl transition-all group relative overflow-hidden flex flex-col h-full w-full ${
      isRented ? 'border-amber-500/30' : inBag ? 'border-blue-500 ring-1 ring-blue-500/40' : 'border-slate-700/60'
    }`}>
      {/* Top right actions (Edit & Delete) */}
      <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all z-20">
        <button 
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="p-1 sm:p-1.5 bg-[#181B24]/90 backdrop-blur-md text-slate-300 hover:text-blue-400 rounded-lg shadow-lg border border-slate-700 cursor-pointer"
          title="Bearbeiten"
        >
          <Edit className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1 sm:p-1.5 bg-[#181B24]/90 backdrop-blur-md text-slate-300 hover:text-red-400 rounded-lg shadow-lg border border-slate-700 cursor-pointer"
          title="Löschen"
        >
          <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
        </button>
      </div>

      {/* Top left status badge */}
      <div className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 z-10">
        {isRented ? (
          <span className="bg-amber-500/90 backdrop-blur-sm text-slate-950 px-1.5 sm:px-2 py-0.5 rounded text-[8.5px] sm:text-[9px] font-black uppercase tracking-wider shadow">
            Verliehen
          </span>
        ) : (
          <span className="bg-emerald-600/90 backdrop-blur-sm text-white px-1.5 sm:px-2 py-0.5 rounded text-[8.5px] sm:text-[9px] font-black uppercase tracking-wider shadow">
            Verfügbar
          </span>
        )}
      </div>
      
      {/* Item Image */}
      <div className="aspect-square bg-[#181B24] relative overflow-hidden flex-shrink-0">
        {item.image ? (
          <img 
            loading="lazy" decoding="async" src={item.image}
            alt={item.brand} 
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-700">
            <ImageIcon className="w-8 h-8" />
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-1.5 sm:p-2 pt-3 sm:pt-4">
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs sm:text-[13px] font-black text-white tracking-tight truncate">
              {item.item_code}
            </span>
            <span className="bg-blue-600 text-white px-1 sm:px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase flex-shrink-0">
              {item.size}
            </span>
          </div>
        </div>
      </div>

      {/* Item Info & Actions */}
      <div className="p-2 sm:p-3 flex-grow flex flex-col justify-between min-w-0">
        <div className="mb-1.5 sm:mb-2 min-w-0">
          <h3 className="font-bold text-xs sm:text-sm text-white truncate" title={item.brand}>{item.brand}</h3>
          
          {/* Kategorie und Verleihcounter pro Equipment (nur interne Verwaltung, dezent) */}
          <div className="flex items-center justify-between gap-1 mt-0.5">
            <p className="text-[9px] sm:text-[10px] text-slate-400 uppercase font-bold tracking-wider truncate" title={item.category_label}>
              {item.category_label}
            </p>
            {item.rental_count !== undefined && (
              <span 
                className="text-[9px] sm:text-[10px] font-semibold text-slate-400 bg-[#181B24] px-1 sm:px-1.5 py-0.5 rounded border border-slate-700/80 flex-shrink-0"
                title={`${item.rental_count || 0}× bisher verliehen`}
              >
                <span className="sm:hidden">{item.rental_count || 0}×</span>
                <span className="hidden sm:inline">{item.rental_count || 0}× verliehen</span>
              </span>
            )}
          </div>

          {isRented && item.verliehenAn && (
            <p className="text-[10px] sm:text-[11px] text-amber-300 font-medium truncate mt-0.5 flex items-center gap-1" title={`Verliehen an ${item.verliehenAn}`}>
              <span className="truncate">{item.verliehenAn}</span>
            </p>
          )}
        </div>
        
        {isRented ? (
          <div className="mt-1 space-y-1">
            {item.active_rental_id && onReturn && (
              <button
                onClick={(e) => { e.stopPropagation(); onReturn(); }}
                className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-1.5 sm:py-2 rounded-lg active:scale-95 transition-all text-[11px] sm:text-xs flex items-center justify-center gap-1 shadow cursor-pointer"
                title="Equipment zurücknehmen"
              >
                <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
                <span>Zurück</span>
              </button>
            )}
            {item.active_rental_id && onMarkPaid && (
              item.bezahlt ? (
                <button
                  onClick={(e) => { e.stopPropagation(); onMarkPaid(false); }}
                  className="w-full py-1 text-[9px] sm:text-[10px] font-bold text-slate-400 hover:text-slate-300 bg-slate-800/60 hover:bg-slate-800 rounded-md border border-slate-700 transition-all text-center cursor-pointer truncate"
                  title="Als offen markieren"
                >
                  Als offen
                </button>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); onMarkPaid(true); }}
                  className="w-full py-1 text-[9px] sm:text-[10px] font-bold text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 rounded-md border border-amber-500/30 transition-all text-center cursor-pointer truncate"
                  title="Als bezahlt markieren"
                >
                  Als bezahlt
                </button>
              )
            )}
          </div>
        ) : exchangeMode ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSelectExchange?.(); }}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-1.5 sm:py-2 px-1 rounded-lg active:scale-95 transition-all text-[10.5px] sm:text-xs flex items-center justify-center gap-1 shadow cursor-pointer mt-1"
            title="Als Ersatz wählen"
          >
            <ArrowRightLeft className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
            <span className="truncate">Als Ersatz wählen</span>
          </button>
        ) : addMode ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSelectAdd?.(); }}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-1.5 sm:py-2 px-1 rounded-lg active:scale-95 transition-all text-[11px] sm:text-xs flex items-center justify-center gap-1 shadow cursor-pointer mt-1"
            title="Hinzufügen"
          >
            <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
            <span>Hinzufügen</span>
          </button>
        ) : (
          <div className="flex gap-1 sm:gap-1.5 mt-1">
            <button
              onClick={onToggleBag}
              className={`p-1.5 sm:p-2 rounded-lg transition-all flex items-center justify-center cursor-pointer flex-shrink-0 ${
                inBag 
                  ? 'bg-blue-600 text-white shadow-inner' 
                  : 'bg-blue-600/15 text-blue-400 border border-blue-500/30 hover:bg-blue-600/25'
              }`}
              title={inBag ? "Aus Tasche entfernen" : "In Tasche hinzufügen"}
            >
              {inBag ? <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <ShoppingBag className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            </button>
            <button
              onClick={onRent}
              className="flex-1 min-w-0 bg-slate-100 hover:bg-white text-[#1C1F2A] font-bold py-1.5 sm:py-2 px-1.5 rounded-lg active:scale-95 transition-all text-[11px] sm:text-xs flex items-center justify-center gap-1 shadow cursor-pointer"
            >
              <ArrowRightLeft className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
              <span className="truncate">Leihen</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// CATEGORY GALLERY ROW COMPONENT (Kompakte horizontale Equipment-Galerie pro Kategorie)
interface CategoryGalleryRowProps {
  category: string;
  items: EquipmentItem[];
  bag: EquipmentItem[];
  bundleExchange: {
    rentalId: number;
    rental: Rental;
    oldItem: EquipmentItem;
  } | null;
  bundleAdd: {
    rentalId: number;
    rental: Rental;
  } | null;
  onSelectExchange?: (item: EquipmentItem) => void;
  onSelectAdd?: (item: EquipmentItem) => void;
  onRent: (item: EquipmentItem) => void;
  onReturn: (rentalId: number, itemId: number) => void;
  onMarkPaid: (rentalId: number, paid?: boolean) => void;
  onEdit: (item: EquipmentItem) => void;
  onDelete: (itemId: number) => void;
  onToggleBag: (item: EquipmentItem) => void;
}

const CategoryGalleryRow: React.FC<CategoryGalleryRowProps> = ({
  category,
  items,
  bag,
  bundleExchange,
  bundleAdd,
  onSelectExchange,
  onSelectAdd,
  onRent,
  onReturn,
  onMarkPaid,
  onEdit,
  onDelete,
  onToggleBag
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Bestehende Größensortierung beibehalten (JR, SR, XS, S, M, L, XL, XXL ...)
  const sortedItems = [...items].sort((a, b) => {
    const sizeOrder = ['JR', 'SR', 'XS', 'S', 'M', 'L', 'XL', 'XXL'];
    const aIdx = sizeOrder.indexOf(a.size.toUpperCase());
    const bIdx = sizeOrder.indexOf(b.size.toUpperCase());
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    return a.size.localeCompare(b.size);
  });

  const checkScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const hasOverflow = el.scrollWidth > el.clientWidth + 5;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(hasOverflow && el.scrollLeft + el.clientWidth < el.scrollWidth - 10);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = scrollContainerRef.current;
    if (!el) return;

    el.addEventListener('scroll', checkScroll, { passive: true });
    window.addEventListener('resize', checkScroll);
    return () => {
      el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [items.length, checkScroll]);

  const handleScroll = (direction: 'left' | 'right') => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const scrollAmount = Math.max(el.clientWidth * 0.75, 240);
    el.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    });
  };

  return (
    <div className="relative group/gallery p-2.5 sm:p-5 pt-2 border-t border-slate-800/80">
      {/* Dezenter Navigationsbutton Links (Desktop/Maus-Komfort) */}
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => handleScroll('left')}
          className="hidden sm:flex absolute left-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-[#181B24]/95 hover:bg-[#252936] text-white border border-slate-700 shadow-xl items-center justify-center transition-all cursor-pointer backdrop-blur-sm active:scale-90"
          title="Nach links scrollen"
          aria-label="Nach links scrollen"
        >
          <ChevronLeft className="w-4 h-4 text-slate-200" />
        </button>
      )}

      {/* Dezenter Navigationsbutton Rechts (Desktop/Maus-Komfort) */}
      {canScrollRight && (
        <button
          type="button"
          onClick={() => handleScroll('right')}
          className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-[#181B24]/95 hover:bg-[#252936] text-white border border-slate-700 shadow-xl items-center justify-center transition-all cursor-pointer backdrop-blur-sm active:scale-90"
          title="Nach rechts scrollen"
          aria-label="Nach rechts scrollen"
        >
          <ChevronRight className="w-4 h-4 text-slate-200" />
        </button>
      )}

      {/* Horizontale Equipment-Galerie mit nativem Touch-Scroll & Snap */}
      <div
        ref={scrollContainerRef}
        className="horizontal-gallery flex gap-2 sm:gap-4 overflow-x-auto overflow-y-hidden pb-3 pt-1 px-0.5 sm:px-1 scroll-smooth overscroll-x-contain"
      >
        {sortedItems.map(item => (
          <div
            key={item.id}
            className="horizontal-gallery-item w-[clamp(130px,calc((100vw-4.25rem)/2.5),180px)] sm:w-[230px] md:w-[245px] lg:w-[255px] flex-shrink-0 flex flex-col"
          >
            <ItemCard
              item={item}
              exchangeMode={!!bundleExchange}
              onSelectExchange={bundleExchange && onSelectExchange ? () => onSelectExchange(item) : undefined}
              addMode={!!bundleAdd}
              onSelectAdd={bundleAdd && onSelectAdd ? () => onSelectAdd(item) : undefined}
              onRent={() => onRent(item)}
              onReturn={() => {
                if (item.active_rental_id) {
                  onReturn(item.active_rental_id, item.id);
                }
              }}
              onMarkPaid={(paidState?: boolean) => {
                if (item.active_rental_id) {
                  onMarkPaid(item.active_rental_id, paidState !== undefined ? paidState : !item.bezahlt);
                }
              }}
              onEdit={() => onEdit(item)}
              onDelete={() => onDelete(item.id)}
              onToggleBag={() => onToggleBag(item)}
              inBag={bag.some(b => b.id === item.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

// 1. ACTIVE RENTAL CARD
// Mobile layout: compact header and equal-height equipment cards. (Bereich "Ausleihen -> Aktuell")
interface ActiveRentalCardProps {
  rental: Rental;
  isExpanded: boolean;
  onToggle: () => void;
  onMarkAsPaid: (paid?: boolean) => void;
  isPaymentPending?: boolean;
  onReturnAll: () => void;
  onReturnSingleItem: (itemId: number, note?: string) => void;
  onExchangeItem: (item: EquipmentItem) => void;
  onAddItem: () => void;
  onEditBundle: () => void;
  onDelete: () => void;
  onOpenContract: () => void;
  onOpenSigningLink?: (rentalId: number) => void;
  onDownloadPdf?: () => void;
}

const ActiveRentalCard: React.FC<ActiveRentalCardProps> = ({
  rental,
  isExpanded,
  onToggle,
  onMarkAsPaid,
  isPaymentPending = false,
  onReturnAll,
  onReturnSingleItem,
  onExchangeItem,
  onAddItem,
  onEditBundle,
  onDelete,
  onOpenContract,
  onOpenSigningLink,
  onDownloadPdf
}) => {
  const activeItems = rental.items || [];
  const itemCount = activeItems.length;

  // Historisch ausgetauschte oder einzeln zurückgegebene Teile dieses Vorgangs
  const returnedHistoryItems = (rental.all_rental_items || []).filter(ri => !!ri.returned_at);

  return (
    <div className="bg-[#252936] rounded-2xl border border-slate-700/60 shadow-md overflow-hidden transition-all">
      {/* Kompakte Kopfzeile: Stammdaten links, Status mittig, Aktionen rechts */}
      <div className="p-4 sm:p-5 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 sm:gap-4 items-start border-b border-slate-800/70">
        <div className="min-w-0">
          <h4 className="text-lg sm:text-xl font-bold text-white leading-snug whitespace-normal break-words">
            {rental.renter_name}
          </h4>
          <div className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs sm:text-sm">
            <span className="text-slate-400">Verliehen:</span>
            <strong className="text-slate-100">{formatDateDe(rental.rented_at)}</strong>
            <span className="text-slate-400">Rückgabe:</span>
            <strong className="text-slate-100">{rental.due_date ? formatDateDe(rental.due_date) : '–'}</strong>
            <span className="text-slate-400">Gebühr:</span>
            <strong className="text-slate-100">{rental.fee_total.toFixed(2)} €</strong>
          </div>
        </div>

        <div className="min-w-[116px] pt-0.5 flex flex-col items-stretch gap-2.5">
          <button
            type="button"
            disabled={isPaymentPending}
            onClick={(e) => { e.stopPropagation(); onMarkAsPaid(!rental.paid); }}
            className={`w-full px-3 py-2 rounded-xl border text-xs font-extrabold uppercase tracking-wide transition-all disabled:opacity-70 disabled:cursor-wait ${
              rental.paid
                ? 'text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/35'
                : 'text-red-300 bg-red-500/10 hover:bg-red-500/20 border-red-500/30'
            }`}
            title={rental.paid ? 'Zahlungsstatus wieder auf offen setzen' : 'Zahlung als eingegangen markieren'}
          >
            <span className="flex items-center justify-center gap-1.5">
              {isPaymentPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {rental.paid ? '✓ Bezahlt' : 'Offen'}
            </span>
          </button>

          {rental.contract ? (
            <span className="text-[11px] font-semibold text-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
              Vertrag
            </span>
          ) : (
            <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
              Vertrag
            </span>
          )}
          <span className="text-xs font-semibold text-slate-300">{itemCount} {itemCount === 1 ? 'Teil' : 'Teile'}</span>
        </div>

        <div className="flex flex-col items-center gap-2">
          <button type="button" onClick={onToggle}
            className="p-2 rounded-xl bg-[#181B24] text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700 transition-colors cursor-pointer"
            title={isExpanded ? 'Ausleihe einklappen' : 'Ausleihe aufklappen'}>
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-2 rounded-xl text-slate-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-colors cursor-pointer"
            title="Ausleihe löschen">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Aufgeklappter Detailbereich für aktive Ausleihe */}
      {isExpanded && (
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-[#1F2330] space-y-4">
          {/* Aktuelle Teile im Bundle mit "Teil zurückgeben"- & "Tauschen"-Aktion */}
          <div>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Aktuell ausgeliehenes Equipment ({activeItems.length}):
              </p>

            </div>

            {activeItems.length === 0 ? (
              <p className="text-xs text-slate-500 italic bg-[#181B24] p-3 rounded-xl">Keine aktiven Teile mehr in diesem Vorgang.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {activeItems.map(item => (
                  <div key={item.id} className="bg-[#181B24] h-[104px] rounded-xl border border-slate-700/60 p-2.5 flex items-stretch gap-3 overflow-hidden">
                    <div className="w-[82px] h-full rounded-lg overflow-hidden bg-[#252936] border border-slate-600/70 flex-shrink-0 p-1">
                      {item.image ? (
                        <img loading="lazy" decoding="async" src={item.image} alt={item.brand} className="w-full h-full rounded-md object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-600">
                          <Package className="w-6 h-6" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1 flex flex-col justify-between py-0.5">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white leading-tight whitespace-normal break-words line-clamp-2">{item.category_label}</p>
                        <p className="mt-1 text-[11px] text-slate-400 leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
                          {item.brand} · Gr. {item.size} · <span className="font-mono text-slate-300">{item.item_code}</span>
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => onExchangeItem(item)}
                          className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 hover:text-white bg-transparent hover:bg-slate-800 rounded-lg border border-slate-700 transition-all flex items-center justify-center gap-1 cursor-pointer"
                          title="Dieses Teil austauschen">
                          <ArrowRightLeft className="w-3 h-3 flex-shrink-0" />
                          <span>Tauschen</span>
                        </button>
                        <button type="button" onClick={() => onReturnSingleItem(item.id)}
                          className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 hover:text-white bg-transparent hover:bg-slate-800 rounded-lg border border-slate-700 transition-all flex items-center justify-center gap-1 cursor-pointer"
                          title="Dieses Teil einzeln zurücknehmen">
                          <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                          <span>Zurück</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Austausch- & Wechsel-Historie dieses Bundles (diskrete Randinformation) */}
          {returnedHistoryItems.length > 0 && (
            <div className="p-3 bg-[#181B24]/70 rounded-xl border border-slate-800 text-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                Bisherige Wechsel in diesem Vorgang:
              </span>
              <ul className="space-y-1 text-slate-300">
                {returnedHistoryItems.map((ri, idx) => (
                  <li key={ri.id || idx} className="flex items-center gap-2 text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                    <span className="text-slate-400">{ri.returned_at}:</span>
                    <span className="font-medium text-slate-300">{ri.item?.category_label || 'Teil'} ({ri.item?.brand} · Gr. {ri.item?.size} · {ri.item?.item_code})</span>
                    <span className="text-amber-400/90 font-semibold">zurückgegeben</span>
                    {ri.exchange_note && <span className="text-slate-500 italic">({ri.exchange_note})</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {rental.note && (
            <div className="p-3 bg-[#181B24] rounded-xl border border-slate-700/60">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Notiz:</span>
              <p className="text-xs text-slate-300 italic">"{rental.note}"</p>
            </div>
          )}

          {/* Haupt-Aktionsleiste */}
          <div className="space-y-2.5 pt-3 border-t border-slate-800">
            {rental.contract?.status === 'signed' ? (
              <button
                type="button"
                onClick={onOpenContract}
                className="w-full bg-[#181B24] hover:bg-[#282D3B] text-slate-100 border border-slate-700 font-bold px-4 py-3 rounded-xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <FileText className="w-4 h-4" />
                <span>Vertrag anzeigen</span>
              </button>
            ) : onOpenSigningLink ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onOpenSigningLink(rental.id)}
                  className="min-w-0 bg-blue-600 hover:bg-blue-500 text-white border border-blue-500 font-bold px-3 py-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm"
                >
                  <Share2 className="w-4 h-4 flex-shrink-0" />
                  <span>Link zum Vertrag</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenContract}
                  className="min-w-0 bg-[#181B24] hover:bg-[#282D3B] text-slate-100 border border-slate-700 font-bold px-3 py-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <Edit className="w-4 h-4 flex-shrink-0" />
                  <span>Vertrag bearbeiten</span>
                </button>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={onAddItem}
                className="min-w-0 bg-[#181B24] hover:bg-[#282D3B] text-slate-200 border border-slate-700 font-bold px-2 py-2.5 rounded-xl text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer">
                <Plus className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Teil hinzufügen</span>
              </button>
              <button type="button" onClick={onReturnAll}
                className="min-w-0 bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-500/35 font-bold px-2 py-2.5 rounded-xl text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer">
                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Alles zurückgeben</span>
              </button>
            </div>

            {rental.contract?.status === 'signed' && onDownloadPdf && (
              <button type="button" onClick={onDownloadPdf}
                className="w-full text-slate-400 hover:text-white text-xs py-1.5 flex items-center justify-center gap-1.5 cursor-pointer">
                <Download className="w-3.5 h-3.5" />
                <span>PDF herunterladen</span>
              </button>
            )}

          </div>
        </div>
      )}
    </div>
  );
};

// 2. COMPLETED RENTAL CARD (Bereich "Ausleihen -> Abgeschlossen")
interface CompletedRentalCardProps {
  rental: Rental;
  isExpanded: boolean;
  onToggle: () => void;
  onMarkAsPaid: (paid?: boolean) => void;
  isPaymentPending?: boolean;
  onDelete: () => void;
  onOpenContract?: () => void;
  onDownloadPdf?: () => void;
}

const CompletedRentalCard: React.FC<CompletedRentalCardProps> = ({
  rental,
  isExpanded,
  onToggle,
  onMarkAsPaid,
  isPaymentPending = false,
  onDelete,
  onOpenContract,
  onDownloadPdf
}) => {
  const allItems = rental.all_items || rental.items || rental.all_rental_items?.map(ri => ri.item).filter((i): i is EquipmentItem => Boolean(i)) || [];
  const itemCount = allItems.length;

  return (
    <div className="bg-[#252936] rounded-2xl border border-slate-700/60 shadow-md overflow-hidden transition-all">
      <div className="p-4 sm:p-5 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 sm:gap-4 items-start">
        <div className="min-w-0">
          <h4 className="text-lg sm:text-xl font-bold text-white leading-snug whitespace-normal break-words">{rental.renter_name}</h4>
          <div className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs sm:text-sm">
            <span className="text-slate-400">Verliehen:</span>
            <strong className="text-slate-100">{formatDateDe(rental.rented_at)}</strong>
            <span className="text-slate-400">Zurück:</span>
            <strong className="text-slate-100">{formatDateDe(rental.returned_at)}</strong>
            <span className="text-slate-400">Gebühr:</span>
            <strong className="text-slate-100">{rental.fee_total.toFixed(2)} €</strong>
          </div>
        </div>

        <div className="min-w-[104px] flex flex-col items-stretch gap-2.5">
          <button
            type="button"
            disabled={isPaymentPending}
            onClick={(e) => { e.stopPropagation(); onMarkAsPaid(!rental.paid); }}
            className={`w-full px-3 py-2 rounded-xl border text-xs font-extrabold uppercase tracking-wide transition-all disabled:opacity-70 disabled:cursor-wait ${
              rental.paid
                ? 'text-emerald-300 bg-emerald-500/15 border-emerald-500/35'
                : 'text-red-300 bg-red-500/10 border-red-500/30'
            }`}
          >
            <span className="flex items-center justify-center gap-1.5">
              {isPaymentPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {rental.paid ? '✓ Bezahlt' : 'Offen'}
            </span>
          </button>
          <span className={`text-[11px] font-semibold flex items-center gap-1.5 ${rental.contract ? 'text-emerald-300' : 'text-slate-400'}`}>
            {rental.contract ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
            Vertrag
          </span>
          <span className="text-xs font-semibold text-slate-300">{itemCount} {itemCount === 1 ? 'Teil' : 'Teile'}</span>
        </div>

        <div className="flex flex-col items-center gap-2">
          <button type="button" onClick={onToggle}
            className="p-2 rounded-xl bg-[#181B24] text-slate-300 hover:text-white border border-slate-700 cursor-pointer">
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-2 rounded-xl text-slate-500 hover:text-red-400 hover:bg-red-500/10 cursor-pointer" title="Ausleihe löschen">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-[#1F2330] space-y-4">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Ausgeliehene Ausrüstung ({itemCount})</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {allItems.map((item, index) => (
              <div key={item.id || index} className="bg-[#181B24] h-[88px] rounded-xl border border-slate-700/60 p-2 flex items-center gap-3 overflow-hidden">
                <div className="w-[68px] h-[68px] rounded-lg overflow-hidden bg-[#252936] border border-slate-600/70 flex-shrink-0 p-1">
                  {item.image ? <img loading="lazy" decoding="async" src={item.image} alt={item.brand} className="w-full h-full rounded-md object-cover" referrerPolicy="no-referrer" /> : <div className="w-full h-full flex items-center justify-center text-slate-600"><Package className="w-5 h-5" /></div>}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white leading-tight whitespace-normal break-words">{item.category_label}</p>
                  <p className="mt-1 text-[11px] text-slate-400 leading-tight">{item.brand} · Gr. {item.size} · <span className="font-mono text-slate-300">{item.item_code}</span></p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-3 border-t border-slate-800">
            {onOpenContract && (
              <button type="button" onClick={onOpenContract}
                className="w-full bg-[#181B24] hover:bg-[#282D3B] text-slate-100 border border-slate-700 font-bold px-4 py-3 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer">
                <FileText className="w-4 h-4" />
                <span>{rental.contract ? 'Vertrag ansehen' : 'Vertrag nachtragen'}</span>
              </button>
            )}
            {rental.contract?.status === 'signed' && onDownloadPdf && (
              <button type="button" onClick={onDownloadPdf}
                className="w-full bg-[#181B24] hover:bg-[#282D3B] text-slate-100 border border-slate-700 font-bold px-4 py-3 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer">
                <Download className="w-4 h-4" />
                <span>PDF herunterladen</span>
              </button>
            )}
          </div>

          {rental.note && (
            <div className="p-3 bg-[#181B24] rounded-xl border border-slate-700/60">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Notiz</span>
              <p className="text-xs text-slate-300 italic">"{rental.note}"</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// 3. BUNDLE EDITOR MODAL (Teilrückgabe, Hinzufügen, Austausch, Details)
interface BundleEditorModalProps {
  rental: Rental;
  onClose: () => void;
  onStartExchange: (item: EquipmentItem) => void;
  onStartAddItem: () => void;
  onReturnSingleItem: (itemId: number, note?: string) => Promise<void>;
  onUpdateRentalDetails?: (updates: { renter_name?: string; fee_total?: number; note?: string; due_date?: string }) => Promise<void>;
  onReturnAll: () => Promise<void>;
  onOpenContract?: () => void;
}

const BundleEditorModal: React.FC<BundleEditorModalProps> = ({
  rental,
  onClose,
  onStartExchange,
  onStartAddItem,
  onReturnSingleItem,
  onUpdateRentalDetails,
  onReturnAll,
  onOpenContract
}) => {
  // Single return state (with optional note prompt)
  const [returnItemPromptId, setReturnItemPromptId] = useState<number | null>(null);
  const [singleReturnNote, setSingleReturnNote] = useState<string>('');

  // Edit rental details state
  const [showEditDetails, setShowEditDetails] = useState<boolean>(false);
  const [editRenterName, setEditRenterName] = useState<string>(rental.renter_name);
  const [editFee, setEditFee] = useState<number | string>(rental.fee_total);
  const [editDueDate, setEditDueDate] = useState<string>(rental.due_date || '');
  const [editRentalNote, setEditRentalNote] = useState<string>(rental.note || '');

  const [actionLoading, setActionLoading] = useState<boolean>(false);

  const activeItems = rental.items || [];
  const returnedHistory = (rental.all_rental_items || []).filter(ri => !!ri.returned_at);

  const handleExecuteSingleReturn = async (itemId: number) => {
    setActionLoading(true);
    await onReturnSingleItem(itemId, singleReturnNote.trim() || undefined);
    setReturnItemPromptId(null);
    setSingleReturnNote('');
    setActionLoading(false);
  };

  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpdateRentalDetails) return;
    setActionLoading(true);
    await onUpdateRentalDetails({
      renter_name: editRenterName.trim() || rental.renter_name,
      fee_total: editFee === '' ? 0 : Number(editFee),
      due_date: editDueDate || undefined,
      note: editRentalNote.trim() || undefined
    });
    setShowEditDetails(false);
    setActionLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-[#252936] w-full max-w-2xl max-h-[92vh] rounded-3xl p-5 sm:p-6 shadow-2xl border border-slate-700/80 flex flex-col box-border overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 flex-shrink-0 gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-lg sm:text-xl font-extrabold text-white truncate">Bundle bearbeiten</h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 flex-shrink-0">
                {activeItems.length} aktiv
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 truncate">
              Ausleiher: <strong className="text-white">{rental.renter_name}</strong> (seit {formatDateDe(rental.rented_at)}
              {rental.due_date && <span> · Rückgabe bis <strong className="text-blue-300">{formatDateDe(rental.due_date)}</strong></span>}
              · Gebühr: <strong className="text-emerald-400">{rental.fee_total.toFixed(2)} €</strong>)
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto py-4 space-y-6 flex-1 pr-1">
          {/* Digitaler Vertrag Link */}
          {onOpenContract && (
            <div className="bg-[#181B24] p-3.5 rounded-2xl border border-indigo-500/30 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex-shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">Einverständniserklärung Hockey-Ausrüstung</p>
                  <p className="text-[11px] text-slate-400 truncate">
                    {rental.contract ? 'Vertrag vorhanden (Entwurf)' : 'Noch kein Vertrag hinterlegt'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onOpenContract}
                className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all flex items-center gap-1 cursor-pointer flex-shrink-0"
              >
                <span>{rental.contract ? 'Vertrag anzeigen' : 'Vertrag ausfüllen'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* 1. Aktuell im Bundle */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Aktuell im Bundle ({activeItems.length} Teile)
              </h4>
              <button
                type="button"
                onClick={() => setShowEditDetails(!showEditDetails)}
                className="text-xs text-blue-400 hover:text-blue-300 font-semibold cursor-pointer"
              >
                {showEditDetails ? 'Details ausblenden' : 'Ausleiher / Gebühr / Rückgabe anpassen'}
              </button>
            </div>

            {/* Optionaler Bereich: Ausleih-Details anpassen */}
            {showEditDetails && (
              <form onSubmit={handleSaveDetails} className="bg-[#181B24] p-3.5 rounded-2xl border border-slate-700/60 mb-3 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Ausleiher Name</label>
                    <input
                      type="text"
                      required
                      value={editRenterName}
                      onChange={(e) => setEditRenterName(e.target.value)}
                      className="w-full px-3 py-2 bg-[#252936] border border-slate-700 rounded-xl text-xs text-white outline-none focus:ring-1 focus:ring-blue-500 box-border"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Leihgebühr (€)</label>
                    <input
                      type="number"
                      step="0.50"
                      required
                      value={editFee}
                      onChange={(e) => setEditFee(e.target.value)}
                      className="w-full px-3 py-2 bg-[#252936] border border-slate-700 rounded-xl text-xs text-white outline-none focus:ring-1 focus:ring-blue-500 box-border"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Rückgabe bis</label>
                    <input
                      type="date"
                      value={editDueDate}
                      onChange={(e) => setEditDueDate(e.target.value)}
                      className="w-full px-3 py-2 bg-[#252936] border border-slate-700 rounded-xl text-xs text-white outline-none focus:ring-1 focus:ring-blue-500 box-border"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Notiz</label>
                  <input
                    type="text"
                    value={editRentalNote}
                    onChange={(e) => setEditRentalNote(e.target.value)}
                    placeholder="Zusätzliche Notizen..."
                    className="w-full px-3 py-2 bg-[#252936] border border-slate-700 rounded-xl text-xs text-white outline-none focus:ring-1 focus:ring-blue-500 box-border"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowEditDetails(false)}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    Abbrechen
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow transition-all cursor-pointer disabled:opacity-50"
                  >
                    Speichern
                  </button>
                </div>
              </form>
            )}

            {activeItems.length === 0 ? (
              <p className="text-xs text-slate-500 italic bg-[#181B24] p-4 rounded-xl text-center">
                Keine Teile mehr aktiv im Bundle.
              </p>
            ) : (
              <div className="space-y-2">
                {activeItems.map(item => (
                  <div key={item.id} className="bg-[#181B24] p-3 rounded-xl border border-slate-700/60 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-[#252936] border border-slate-700 flex-shrink-0 flex items-center justify-center">
                          {item.image ? (
                            <img loading="lazy" decoding="async" src={item.image} alt={item.brand} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <Package className="w-4 h-4 text-slate-600" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-bold text-white truncate">{item.category_label}</p>
                          <p className="text-[11px] text-slate-400 truncate">
                            {item.brand} · Gr. {item.size} · <span className="font-mono text-slate-300">{item.item_code}</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => onStartExchange(item)}
                          className="px-2.5 py-1.5 text-xs font-bold text-blue-300 hover:text-white bg-blue-500/10 hover:bg-blue-600 border border-blue-500/30 rounded-lg transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          title="Gegen ein anderes Teil im Bestand austauschen"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                          <span>Tauschen</span>
                        </button>

                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => {
                            if (returnItemPromptId === item.id) {
                              setReturnItemPromptId(null);
                            } else {
                              setReturnItemPromptId(item.id);
                              setSingleReturnNote('');
                            }
                          }}
                          className="px-2.5 py-1.5 text-xs font-bold text-amber-300 hover:text-slate-950 bg-amber-500/10 hover:bg-amber-400 border border-amber-500/30 rounded-lg transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          title="Dieses Teil zurückgeben"
                        >
                          <span>Teil zurück</span>
                        </button>
                      </div>
                    </div>

                    {/* Inline-Eingabe für Notiz bei Einzelrückgabe */}
                    {returnItemPromptId === item.id && (
                      <div className="pt-2 border-t border-slate-800 flex items-center gap-2">
                        <input
                          type="text"
                          autoFocus
                          value={singleReturnNote}
                          onChange={(e) => setSingleReturnNote(e.target.value)}
                          placeholder="Rückgabe-Notiz (optional, z.B. nicht benötigt)"
                          className="flex-1 px-3 py-1.5 bg-[#252936] border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 outline-none focus:ring-1 focus:ring-amber-500 box-border"
                        />
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => handleExecuteSingleReturn(item.id)}
                          className="px-3 py-1.5 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-all shadow cursor-pointer disabled:opacity-50"
                        >
                          Bestätigen
                        </button>
                        <button
                          type="button"
                          onClick={() => setReturnItemPromptId(null)}
                          className="px-2.5 py-1.5 text-xs text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                          Abbrechen
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 2. Teil hinzufügen (Wechselt in die zentrale Bestandsübersicht) */}
          <div className="pt-2 border-t border-slate-800">
            <button
              type="button"
              disabled={actionLoading}
              onClick={onStartAddItem}
              className="w-full py-3 px-4 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 rounded-2xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              <span>Teil hinzufügen (in normaler Bestandsübersicht wählen)</span>
            </button>
          </div>

          {/* 3. Historischer Wechselverlauf dieses Bundles */}
          {returnedHistory.length > 0 && (
            <div className="p-3.5 bg-[#181B24] rounded-2xl border border-slate-700/60">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                Bisherige Wechsel & Rückgaben in diesem Vorgang:
              </span>
              <ul className="space-y-1.5 text-xs text-slate-300">
                {returnedHistory.map((ri, i) => (
                  <li key={i} className="flex items-center gap-2 text-[11px] flex-wrap">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500 flex-shrink-0"></span>
                    <span className="text-slate-400">{formatDateDe(ri.returned_at)}:</span>
                    <span className="font-medium text-white">{ri.item?.category_label || 'Teil'}</span>
                    <span className="text-slate-400">({ri.item?.brand} · Gr. {ri.item?.size} · {ri.item?.item_code})</span>
                    <span className="text-amber-400 font-semibold">zurückgegeben</span>
                    {ri.exchange_note && <span className="text-slate-400 italic">"{ri.exchange_note}"</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onReturnAll}
            className="px-3.5 py-2.5 bg-amber-500/10 hover:bg-amber-500 text-amber-300 hover:text-slate-950 font-bold rounded-xl text-xs border border-amber-500/30 transition-all cursor-pointer"
          >
            Ganzes Bundle zurückgeben
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs shadow-md transition-all cursor-pointer"
          >
            Fertig
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ==============================================================================
// 4. SIGNATURE MODAL (PHASE 2: DIGITALE UNTERSCHRIFT MIT FINGER / STIFT / MAUS)
// ==============================================================================
interface SignatureModalProps {
  show: boolean;
  rentalId?: number;
  initialSignerName: string;
  onCancel: () => void;
  onConfirm: (signatureData: string, signerName: string) => Promise<void>;
  isSubmitting: boolean;
}

const SignatureModal: React.FC<SignatureModalProps> = ({
  show,
  rentalId,
  initialSignerName,
  onCancel,
  onConfirm,
  isSubmitting
}) => {
  const [signerName, setSignerName] = useState(initialSignerName);
  const [hasDrawn, setHasDrawn] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const submittingRef = useRef(isSubmitting);
  submittingRef.current = isSubmitting;

  useEffect(() => {
    setSignerName(initialSignerName);
  }, [initialSignerName]);

  // Canvas initialisieren mit Retina-Skalierung und Touch-Unterstützung
  useEffect(() => {
    if (!show) return;
    setHasDrawn(false);
    isDrawingRef.current = false;

    let detach: (()=>void) | undefined;
    const timer = setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#0F172A';

      const onTouchStart = (e: TouchEvent) => {
        e.preventDefault();
        if (submittingRef.current) return;
        const t = e.touches[0];
        const r = canvas.getBoundingClientRect();
        ctx.beginPath();
        ctx.moveTo(t.clientX - r.left, t.clientY - r.top);
        isDrawingRef.current = true;
      };

      const onTouchMove = (e: TouchEvent) => {
        e.preventDefault();
        if (!isDrawingRef.current || submittingRef.current) return;
        const t = e.touches[0];
        const r = canvas.getBoundingClientRect();
        ctx.lineTo(t.clientX - r.left, t.clientY - r.top);
        ctx.stroke();
        setHasDrawn(true);
      };

      const onTouchEnd = (e: TouchEvent) => {
        e.preventDefault();
        isDrawingRef.current = false;
      };

      canvas.addEventListener('touchstart', onTouchStart, { passive: false });
      canvas.addEventListener('touchmove', onTouchMove, { passive: false });
      canvas.addEventListener('touchend', onTouchEnd, { passive: false });

      detach = () => {
        canvas.removeEventListener('touchstart', onTouchStart);
        canvas.removeEventListener('touchmove', onTouchMove);
        canvas.removeEventListener('touchend', onTouchEnd);
      };
    }, 60);

    return () => { clearTimeout(timer); detach?.(); };
  }, [show]);

  if (!show) return null;

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isSubmitting) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const r = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - r.left, e.clientY - r.top);
    isDrawingRef.current = true;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || isSubmitting) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const r = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - r.left, e.clientY - r.top);
    ctx.stroke();
    setHasDrawn(true);
  };

  const handleMouseUp = () => {
    isDrawingRef.current = false;
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const handleSubmit = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn || !signerName.trim() || isSubmitting) return;
    const dataUrl = canvas.toDataURL('image/png');
    onConfirm(dataUrl, signerName.trim());
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-[#1F2330] border border-slate-700 rounded-3xl p-5 sm:p-6 max-w-lg w-full shadow-2xl text-left space-y-4"
      >
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-300">
              <PenTool className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white">Vertrag verbindlich unterzeichnen</h3>
              <p className="text-xs text-slate-400">{rentalId ? `Ausleihe #${rentalId} · ` : ''}Förderverein der Wiesel Arpke e.V.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <label className="block text-slate-300 font-bold uppercase text-[11px] mb-1">
              Name der unterzeichnenden Person (gesetzl. Vertreter / Entleiher)
            </label>
            <input
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              disabled={isSubmitting}
              placeholder="Vorname Nachname"
              className="w-full bg-[#181B24] border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-medium focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-slate-300 font-bold uppercase text-[11px]">
                Unterschrift (Finger, Eingabestift oder Maus)
              </label>
              <button
                type="button"
                onClick={handleClear}
                disabled={isSubmitting || !hasDrawn}
                className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 font-semibold disabled:opacity-40 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Löschen</span>
              </button>
            </div>

            {/* Canvas-Unterschriftsfeld */}
            <div className="relative bg-white rounded-2xl border-2 border-slate-400 overflow-hidden shadow-inner h-44 touch-none">
              <canvas
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                className="w-full h-full cursor-crosshair block"
                style={{ touchAction: 'none' }}
              />
              <div className="absolute bottom-5 left-6 right-6 pointer-events-none border-b border-dashed border-slate-300 flex justify-between text-[10px] text-slate-400 pb-1">
                <span>✕ Unterschrift hier leisten</span>
                <span>{hasDrawn ? 'Unterschrift erfasst' : 'Bitte zeichnen'}</span>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 pt-1">
              Mit dem Unterzeichnen wird der Vertrag rechtsverbindlich abgeschlossen und als unveränderliches PDF archiviert.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="flex-1 py-3 bg-[#181B24] hover:bg-[#282D3B] text-slate-300 border border-slate-700 font-bold rounded-xl text-xs transition-all cursor-pointer"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!hasDrawn || !signerName.trim() || isSubmitting}
            className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Wird abgeschlossen...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Verbindlich unterschreiben</span>
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ==============================================================================
// 4b. SHARE SIGNING LINK MODAL (SICHERER INDIVIDUELLER VERTRAGSLINK)
// ==============================================================================
interface ShareSigningLinkModalProps {
  rentalId: number;
  password: string;
  onClose: () => void;
}

const ShareSigningLinkModal: React.FC<ShareSigningLinkModalProps> = ({
  rentalId,
  password,
  onClose
}) => {
  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [showConfirmNew, setShowConfirmNew] = useState<boolean>(false);
  const [generatingNew, setGeneratingNew] = useState<boolean>(false);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchOrCreateLink = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/rentals/${rentalId}/contract/signing-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': password
        }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setToken(data.token);
        setExpiresAt(data.expires_at);
      } else {
        setError(data.message || 'Fehler beim Erzeugen des Signier-Links.');
      }
    } catch {
      setError('Verbindungsfehler beim Erzeugen des Links.');
    } finally {
      setLoading(false);
    }
  }, [rentalId, password]);

  useEffect(() => {
    fetchOrCreateLink();
  }, [fetchOrCreateLink]);

  const shareUrl = token ? `${window.location.origin}/#sign=${token}` : '';

  const handleCopy = async () => {
    if (!shareUrl) return;
    actionHaptic('tap');
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      actionHaptic('success');
      setNotice('Link erfolgreich in die Zwischenablage kopiert!');
      setTimeout(() => {
        setCopied(false);
        setNotice(null);
      }, 3000);
    } catch {
      setError('Kopieren in die Zwischenablage fehlgeschlagen. Bitte den Link manuell markieren und kopieren.');
    }
  };

  const handleShare = async () => {
    if (!shareUrl) return;
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({
          title: 'Ausleihvertrag Wiesel Arpke e.V.',
          text: 'Hier ist Ihr persönlicher Link zur Einverständniserklärung Hockey-Ausrüstung zum Prüfen und Unterschreiben:',
          url: shareUrl
        });
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          handleCopy();
        }
      }
    } else {
      handleCopy();
    }
  };

  const handleGenerateNew = async () => {
    actionHaptic('tap');
    setShowConfirmNew(false);
    setGeneratingNew(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/rentals/${rentalId}/contract/signing-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': password
        }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setToken(data.token);
        setExpiresAt(data.expires_at);
        actionHaptic('success');
        setNotice('Neuer Link erzeugt! Der vorherige Link ist nun ungültig.');
        setTimeout(() => setNotice(null), 4000);
      } else {
        setError(data.message || 'Fehler beim Erzeugen eines neuen Links.');
      }
    } catch {
      setError('Verbindungsfehler beim Erzeugen des Links.');
    } finally {
      setGeneratingNew(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-[#1F2330] border border-slate-700 rounded-3xl p-5 sm:p-6 max-w-lg w-full shadow-2xl text-left space-y-4"
      >
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-300">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white">Link zum Unterschreiben</h3>
              <p className="text-xs text-slate-400">Ausleihe #{rentalId} · Förderverein der Wiesel Arpke e.V.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs">
            {error}
          </div>
        )}

        {notice && (
          <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        {loading ? (
          <div className="py-8 text-center text-slate-400 text-xs animate-pulse">
            Erzeuge sicheren individuellen Signier-Link...
          </div>
        ) : (
          <div className="space-y-4 text-xs">
            <p className="text-slate-300 leading-relaxed">
              Über diesen individuellen Link kann der Entleiher den Vertrag auf seinem eigenen Smartphone oder Tablet prüfen, persönliche Daten vervollständigen und mit dem Finger verbindlich digital unterschreiben.
            </p>

            <div className="p-3 rounded-xl bg-[#181B24] border border-slate-700/80 space-y-2">
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Persönlicher Vertragslink
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  className="flex-1 px-3 py-2.5 rounded-lg bg-[#252936] border border-slate-700 text-xs font-mono text-white select-all outline-none truncate"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className={`px-3.5 py-2.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer flex-shrink-0 ${
                    copied
                      ? 'bg-emerald-600 text-white'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  }`}
                  title="In die Zwischenablage kopieren"
                >
                  {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copied ? 'Kopiert!' : 'Kopieren'}</span>
                </button>
              </div>

              {expiresAt && (
                <p className="text-[11px] text-slate-400 flex items-center gap-1.5 pt-1">
                  <Clock className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                  <span>Standardmäßig 7 Tage gültig (bis {formatDateTimeDe(expiresAt)})</span>
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-2">
                {typeof navigator !== 'undefined' && 'share' in navigator && (
                  <button
                    type="button"
                    onClick={handleShare}
                    className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer"
                  >
                    <Share2 className="w-4 h-4" />
                    <span>Per Smartphone teilen</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowConfirmNew(true)}
                disabled={generatingNew}
                className="text-[11px] text-slate-400 hover:text-amber-300 underline transition-colors cursor-pointer"
              >
                Neuen Link erzeugen (alten ungültig machen)
              </button>
            </div>

            {showConfirmNew && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs space-y-2 mt-2">
                <p className="font-bold">Vorherigen Link ungültig machen?</p>
                <p className="text-[11px] text-slate-300">
                  Wenn Sie einen neuen Link erzeugen, kann der bisherige Link vom Entleiher nicht mehr geöffnet oder signiert werden.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleGenerateNew}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs cursor-pointer"
                  >
                    Ja, neuen Link erzeugen
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowConfirmNew(false)}
                    className="px-3 py-1.5 rounded-lg bg-[#181B24] hover:bg-slate-800 text-slate-300 border border-slate-700 text-xs cursor-pointer"
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="pt-2 border-t border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-[#181B24] hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-xs font-bold transition-all cursor-pointer"
          >
            Schließen
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ==============================================================================
// 5. CONTRACT MODAL (PHASE 1 & 2: EINVERSTÄNDNISERKLÄRUNG AUSLEIHE HOCKEY-AUSRÜSTUNG)
// Förderverein der Wiesel Arpke e.V., Am Hainhop 12, 31275 Lehrte
// ==============================================================================
interface ContractModalProps {
  rentalId: number;
  initialMode?: 'form' | 'preview';
  password: string;
  onClose: () => void;
  onContractSaved?: (contract: RentalContract) => void;
}

const ContractModal: React.FC<ContractModalProps> = ({
  rentalId,
  initialMode = 'form',
  password,
  onClose,
  onContractSaved
}) => {
  const [mode, setMode] = useState<'form' | 'preview'>(initialMode);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [rentalData, setRentalData] = useState<{
    id: number;
    renter_name: string;
    rented_at: string;
    due_date?: string | null;
    fee_total: number;
    active_items: EquipmentItem[];
  } | null>(null);

  const [reviewHash, setReviewHash] = useState<string | null>(null);
  const [existingContract, setExistingContract] = useState<RentalContract | null>(null);
  const [showFullIbanInPreview, setShowFullIbanInPreview] = useState<boolean>(false);
  const [showShareModal, setShowShareModal] = useState<boolean>(false);

  // Signatur-Status (Phase 2)
  const [showSignConfirm, setShowSignConfirm] = useState<boolean>(false);
  const [showSignatureModal, setShowSignatureModal] = useState<boolean>(false);
  const [isSigningSubmitting, setIsSigningSubmitting] = useState<boolean>(false);

  // Positive Statusmeldungen nach ca. 3 Sekunden automatisch ausblenden (Fehler bleiben bewusst sichtbar)
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        setSuccess(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  const isSigned = existingContract?.status === 'signed';

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    child_name: '',
    street: '',
    house_number: '',
    postal_code: '',
    city: '',
    phone: '',
    email: '',
    iban: '',
    deposit_amount: 50.00,
    fee_amount: 60.00
  });

  useEffect(() => {
    let isMounted = true;
    async function loadContractData() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/rentals/${rentalId}/contract`, {
          headers: { 'x-admin-password': password }
        });
        const data = await res.json();
        if (!isMounted) return;

        if (res.ok && data.success) {
          setRentalData(data.rental);
          setReviewHash(data.review_hash);
          if (data.contract) {
            setExistingContract(data.contract);
            setFormData({
              first_name: data.contract.first_name || '',
              last_name: data.contract.last_name || '',
              child_name: data.contract.child_name || '',
              street: data.contract.street || '',
              house_number: data.contract.house_number || '',
              postal_code: data.contract.postal_code || '',
              city: data.contract.city || '',
              phone: data.contract.phone || '',
              email: data.contract.email || '',
              iban: formatIban(data.contract.iban || ''),
              deposit_amount: data.contract.deposit_amount !== undefined ? Number(data.contract.deposit_amount) : 50.00,
              fee_amount: data.contract.fee_amount !== undefined ? Number(data.contract.fee_amount) : (data.rental?.fee_total ?? 60.00)
            });
            if (data.contract.status === 'signed' || initialMode === 'preview') {
              setMode('preview');
            }
          } else {
            // Neuer Vertragsentwurf: Namen des Ausleihers vorbelegen
            const renter = data.rental?.renter_name || '';
            const parts = renter.trim().split(' ');
            const fName = parts[0] || '';
            const lName = parts.slice(1).join(' ') || '';
            setFormData(prev => ({
              ...prev,
              first_name: fName,
              last_name: lName,
              fee_amount: data.rental?.fee_total !== undefined ? Number(data.rental.fee_total) : 60.00,
              deposit_amount: 50.00
            }));
            setMode('form');
          }
        } else {
          setError(data.message || 'Vertragsdaten konnten nicht geladen werden.');
        }
      } catch (err: any) {
        if (isMounted) setError('Verbindungsfehler beim Laden der Vertragsdaten.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadContractData();
    return () => { isMounted = false; };
  }, [rentalId, password, initialMode]);

  const handleIbanChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isSigned) return;
    const formatted = formatIban(e.target.value);
    setFormData(prev => ({ ...prev, iban: formatted }));
  };

  const handleSaveContract = async (e?: React.FormEvent, targetMode: 'stay' | 'preview' = 'preview'): Promise<boolean> => {
    if (e) e.preventDefault();
    if (isSigned) {
      setError('Dieser Vertrag ist bereits verbindlich unterschrieben und kann nicht mehr geändert werden.');
      return false;
    }
    setError(null);
    setSuccess(null);

    // Validierung der Pflichtfelder
    if (!formData.first_name.trim() || !formData.last_name.trim() || !formData.child_name.trim()) {
      setError('Bitte Vorname, Nachname und den Namen des Kindes ausfüllen.');
      return false;
    }
    if (!formData.street.trim() || !formData.house_number.trim() || !formData.postal_code.trim() || !formData.city.trim()) {
      setError('Bitte die Anschrift vollständig angeben (Straße, Hausnr., PLZ und Ort).');
      return false;
    }
    if (!formData.phone.trim()) {
      setError('Bitte eine Telefonnummer für eventuelle Rückfragen angeben.');
      return false;
    }
    const cleanEmail = formData.email.trim();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Bitte eine gültige E-Mail-Adresse angeben.');
      return false;
    }
    const cleanIban = formData.iban.replace(/\s+/g, '').toUpperCase();
    if (cleanIban.length < 15 || !/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(cleanIban)) {
      setError('Bitte eine gültige IBAN angeben (mindestens 15 Zeichen, z. B. DE...).');
      return false;
    }

    actionHaptic('tap');
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/rentals/${rentalId}/contract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': password
        },
        body: JSON.stringify({
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim(),
          child_name: formData.child_name.trim(),
          street: formData.street.trim(),
          house_number: formData.house_number.trim(),
          postal_code: formData.postal_code.trim(),
          city: formData.city.trim(),
          phone: formData.phone.trim(),
          email: cleanEmail,
          iban: cleanIban,
          deposit_amount: formData.deposit_amount,
          fee_amount: formData.fee_amount,
          status: 'draft'
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setExistingContract(data.contract);
        if (data.rental) setRentalData(data.rental);
        if (data.review_hash) setReviewHash(data.review_hash);
        actionHaptic('success');
        setSuccess('Vertragsdaten erfolgreich gespeichert!');
        if (onContractSaved) {
          onContractSaved(data.contract);
        }
        if (targetMode === 'preview') {
          setMode('preview');
        }
        return true;
      } else {
        setError(data.message || 'Fehler beim Speichern des Vertragsentwurfs.');
        return false;
      }
    } catch (err: any) {
      setError('Verbindungsfehler beim Speichern des Vertrags.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Signaturprozess starten (Phase 2)
  const handleStartSignFlow = async () => {
    if (!existingContract) {
      const saved = await handleSaveContract(undefined, 'preview');
      if (!saved) return;
    }
    setShowSignConfirm(true);
  };

  // Verbindliche Unterschrift an Backend übertragen (Phase 2)
  const handleSignComplete = async (signatureData: string, signerNameInput: string) => {
    actionHaptic('tap');
    setIsSigningSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/rentals/${rentalId}/contract/sign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': password
        },
        body: JSON.stringify({
          signature_data: signatureData,
          signer_name: signerNameInput,
          review_hash: reviewHash
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setExistingContract(data.contract);
        if (data.rental) setRentalData(data.rental);
        if (data.review_hash) setReviewHash(data.review_hash);
        setShowSignatureModal(false);
        actionHaptic('success');
        setSuccess('Vertrag erfolgreich verbindlich unterschrieben und als PDF archiviert!');
        if (onContractSaved) {
          onContractSaved(data.contract);
        }
        setMode('preview');
      } else {
        setError(data.message || 'Fehler beim Abschließen des Vertrags.');
      }
    } catch (err: any) {
      setError('Verbindungsfehler beim Abschließen des Vertrags.');
    } finally {
      setIsSigningSubmitting(false);
    }
  };

  // Signiertes Vertrags-PDF herunterladen
  const handleDownloadSignedPdf = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/rentals/${rentalId}/contract/pdf`, {
        headers: { 'x-admin-password': password }
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        setError(errJson?.message || 'Fehler beim Laden des Vertrags-PDFs.');
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Ausleihvertrag_${rentalId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => window.URL.revokeObjectURL(url), 2000);
    } catch (err: any) {
      setError('Fehler beim Herunterladen des Vertrags-PDFs.');
    } finally {
      setSaving(false);
    }
  };

  const equipmentList = isSigned && existingContract?.equipment_snapshot && existingContract.equipment_snapshot.length > 0
    ? existingContract.equipment_snapshot
    : (rentalData?.active_items || []);

  const rentedAtDate = rentalData?.rented_at || new Date().toISOString().split('T')[0];
  const dueDate = rentalData?.due_date || calculateDueDate(rentedAtDate);
  const totalAmount = (Number(formData.fee_amount) || 0) + (Number(formData.deposit_amount) || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-[#1F2330] border border-slate-700/80 rounded-3xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden my-auto"
      >
        {/* MODAL HEADER */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-[#181B24] flex items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex-shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-bold text-white truncate">
                Einverständniserklärung Hockey-Ausrüstung
              </h3>
              <p className="text-xs text-slate-400 truncate">
                Förderverein der Wiesel Arpke e.V. · Ausleihe #{rentalId}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* View Mode Switcher */}
            {isSigned ? (
              <div className="bg-emerald-950/40 px-3 py-1.5 rounded-xl border border-emerald-500/40 flex items-center gap-1.5 text-xs text-emerald-300 font-bold">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Vertrag abgeschlossen</span>
              </div>
            ) : (
              <div className="bg-[#252936] p-1 rounded-xl border border-slate-700/70 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setMode('form')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    mode === 'form' 
                      ? 'bg-blue-600 text-white shadow-sm' 
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Formular
                </button>
                <button
                  type="button"
                  onClick={() => setMode('preview')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    mode === 'preview' 
                      ? 'bg-blue-600 text-white shadow-sm' 
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Vorschau</span>
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* FEEDBACK BANNERS */}
        {error && (
          <div className="mx-4 sm:mx-6 mt-4 p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center justify-between gap-2 flex-shrink-0">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="text-red-400 hover:text-red-200">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {success && (
          <div className="mx-4 sm:mx-6 mt-4 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between gap-2 flex-shrink-0">
            <span className="flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>{success}</span>
            </span>
            <button type="button" onClick={() => setSuccess(null)} className="text-emerald-400 hover:text-emerald-200">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* MODAL BODY */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {loading ? (
            <div className="py-16 text-center text-slate-400">
              <p className="animate-pulse text-sm">Lade Vertrags- und Ausleihdaten...</p>
            </div>
          ) : mode === 'form' ? (
            /* ========================================================== */
            /* 1. EINGABEMASKE (FORMULAR)                                 */
            /* ========================================================== */
            <form onSubmit={(e) => handleSaveContract(e, 'preview')} className="space-y-6">
              {/* Phase 1 Hinweis-Banner */}
              <div className="p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-slate-300 leading-relaxed">
                  <strong className="text-blue-300 block mb-0.5">Digitaler Ausleihvertrag</strong>
                  Erfasse die Entleiherdaten. Danach kann der Vertrag direkt auf diesem Gerät geprüft und unterschrieben werden. Alternativ kannst du einen sicheren Link senden, über den der Entleiher den vollständigen Vertrag selbst ausfüllt und unterschreibt.
                </div>
              </div>

              {/* SECTION: ENTLEIHER */}
              <div className="bg-[#181B24] p-4 sm:p-5 rounded-2xl border border-slate-700/60 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    <span>1. Entleiher (Erziehungsberechtigte/r & Kind)</span>
                  </h4>
                  <span className="text-[11px] text-slate-400">* Pflichtfelder</span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">
                    Name des Kindes (Spieler/in) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.child_name}
                    onChange={(e) => setFormData({ ...formData, child_name: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-[#252936] border border-slate-700 text-base text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none transition-all box-border"
                    placeholder="z. B. Tim Mustermann"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">
                      Vorname Entleiher *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.first_name}
                      onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-[#252936] border border-slate-700 text-base text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none transition-all box-border"
                      placeholder="z. B. Max"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">
                      Nachname Entleiher *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.last_name}
                      onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-[#252936] border border-slate-700 text-base text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none transition-all box-border"
                      placeholder="z. B. Mustermann"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION: ANSCHRIFT */}
              <div className="bg-[#181B24] p-4 sm:p-5 rounded-2xl border border-slate-700/60 space-y-4">
                <div className="border-b border-slate-800 pb-2.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    <span>2. Anschrift</span>
                  </h4>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3.5">
                  <div className="col-span-2 sm:col-span-3">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">
                      Straße *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.street}
                      onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-[#252936] border border-slate-700 text-base text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none transition-all box-border"
                      placeholder="z. B. Musterstraße"
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">
                      Hausnr. *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.house_number}
                      onChange={(e) => setFormData({ ...formData, house_number: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-[#252936] border border-slate-700 text-base text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none transition-all box-border"
                      placeholder="12a"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3.5">
                  <div className="col-span-1">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">
                      PLZ *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.postal_code}
                      onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-[#252936] border border-slate-700 text-base text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none transition-all box-border"
                      placeholder="31275"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-3">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">
                      Wohnort *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-[#252936] border border-slate-700 text-base text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none transition-all box-border"
                      placeholder="z. B. Lehrte"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION: KONTAKTDATEN */}
              <div className="bg-[#181B24] p-4 sm:p-5 rounded-2xl border border-slate-700/60 space-y-4">
                <div className="border-b border-slate-800 pb-2.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    <span>3. Kontaktdaten</span>
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">
                      Telefonnummer *
                    </label>
                    <input
                      type="tel"
                      required
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-[#252936] border border-slate-700 text-base text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none transition-all box-border"
                      placeholder="z. B. 0170 1234567"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">
                      E-Mail-Adresse *
                    </label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-[#252936] border border-slate-700 text-base text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none transition-all box-border"
                      placeholder="z. B. max@mustermann.de"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION: ZAHLUNGSDATEN (SEPA-LASTSCHRIFT) */}
              <div className="bg-[#181B24] p-4 sm:p-5 rounded-2xl border border-slate-700/60 space-y-4">
                <div className="border-b border-slate-800 pb-2.5 flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    <span>4. Zahlungsdaten (SEPA-Lastschriftmandat)</span>
                  </h4>
                  <div className="flex items-center gap-1 text-[11px] text-emerald-400">
                    <Lock className="w-3 h-3" />
                    <span>Geschützt</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">
                    IBAN des Kontoinhabers *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.iban}
                    onChange={handleIbanChange}
                    className="w-full px-4 py-3 rounded-xl bg-[#252936] border border-slate-700 text-base font-mono text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none transition-all tracking-wider box-border"
                    placeholder="DE00 0000 0000 0000 0000 00"
                    maxLength={34}
                  />
                  <p className="text-[11px] text-slate-400 mt-1.5 ml-1 leading-normal">
                    Zur Abbuchung der Leihgebühr (60,00 €) und Hinterlegung der Kaution (50,00 €).
                  </p>
                </div>
              </div>

              {/* SECTION: AUTOMATISCH ÜBERNOMMENE AUSLEIHDATEN (READ-ONLY) */}
              <div className="bg-[#181B24] p-4 sm:p-5 rounded-2xl border border-slate-700/60 space-y-3">
                <div className="border-b border-slate-800 pb-2.5 flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span>5. Automatisch übernommene Ausrüstung ({equipmentList.length} Teile)</span>
                  </h4>
                  <span className="text-[11px] text-emerald-400 font-medium">Aus Vorgang #{rentalId}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-slate-300">
                  <div className="p-2.5 rounded-xl bg-[#252936] border border-slate-700 flex justify-between">
                    <span className="text-slate-400">Übergabe:</span>
                    <strong className="text-white">{formatDateDe(rentedAtDate)}</strong>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#252936] border border-slate-700 flex justify-between">
                    <span className="text-slate-400">Vereinbarter Rückgabetermin:</span>
                    <strong className="text-blue-300">{formatDateDe(dueDate)}</strong>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#252936] border border-slate-700 flex justify-between">
                    <span className="text-slate-400">Abnutzungsgebühr:</span>
                    <strong className="text-white">{Number(formData.fee_amount).toFixed(2)} €</strong>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#252936] border border-slate-700 flex justify-between">
                    <span className="text-slate-400">Kaution:</span>
                    <strong className="text-emerald-300">{Number(formData.deposit_amount).toFixed(2)} €</strong>
                  </div>
                </div>

                {/* Equipment Kacheln */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {equipmentList.map((item: any, idx: number) => (
                    <div key={item.id || idx} className="p-2.5 rounded-xl bg-[#252936] border border-slate-700/60 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <p className="font-bold text-white truncate">{item.category_label || item.category}</p>
                        <p className="text-[11px] text-slate-400 truncate">{item.brand} · Gr. {item.size}</p>
                      </div>
                      <span className="font-mono text-[11px] bg-[#181B24] px-2 py-0.5 rounded border border-slate-700 text-slate-300 flex-shrink-0">
                        {item.item_code}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ACTION BUTTONS (FORM) */}
              <div className="border-t border-slate-700/60 pt-4 space-y-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full min-h-12 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
                >
                  <PenTool className="w-4 h-4 shrink-0" />
                  <span>{saving ? 'Speichert...' : 'Weiter zur Unterschrift'}</span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={async () => {
                      const saved = await handleSaveContract(undefined, 'stay');
                      if (saved) setShowShareModal(true);
                    }}
                    className="min-h-12 px-3 py-3 rounded-xl bg-[#252936] hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    title="Vertrag speichern und Link zum Unterschreiben für Entleiher teilen"
                  >
                    <Share2 className="hidden sm:block w-4 h-4 shrink-0" />
                    <span>Unterschriftslink</span>
                  </button>

                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleSaveContract(undefined, 'stay')}
                    className="min-h-12 px-3 py-3 rounded-xl bg-[#252936] hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Save className="hidden sm:block w-4 h-4 shrink-0" />
                    <span>{saving ? 'Speichert...' : 'Entwurf speichern'}</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full min-h-11 px-4 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/50 text-xs font-medium transition-all cursor-pointer"
                >
                  Schließen
                </button>
              </div>
            </form>
          ) : (
            /* ========================================================== */
            /* 2. VERTRAGSVORSCHAU (EINVERSTÄNDNISERKLÄRUNG AUSLEIHE)    */
            /* ========================================================== */
            <div className="space-y-6">
              {/* Verbindlich signiert Banner */}
              {isSigned && (
                <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/40 text-emerald-200 text-xs flex flex-wrap items-center justify-between gap-3 shadow-inner">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-300 flex-shrink-0">
                      <ShieldCheck className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <strong className="text-sm font-bold text-white block">Vertrag rechtsverbindlich abgeschlossen</strong>
                      <span className="text-emerald-300/90 text-xs">
                        Unterzeichnet am {formatDateTimeDe(existingContract?.signed_at)} von {existingContract?.signer_name || `${formData.first_name} ${formData.last_name}`}
                      </span>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Vertragsinhalte und Ausrüstungs-Snapshot sind dauerhaft archiviert und können nicht mehr verändert werden.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadSignedPdf}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-md transition-all cursor-pointer flex-shrink-0"
                  >
                    <Download className="w-4 h-4" />
                    <span>PDF herunterladen</span>
                  </button>
                </div>
              )}

              {isSigned && <ContractDeliveryStatus rentalId={rentalId} password={password} />}

              {/* Offizielles Dokumentenblatt */}
              <div className="bg-[#181B24] p-5 sm:p-8 rounded-2xl border border-slate-700/80 shadow-xl space-y-6 text-slate-200 text-xs sm:text-sm">
                
                {/* DOKUMENTEN-KOPFZEILE */}
                <div className="border-b border-slate-800 pb-5 text-center sm:text-left sm:flex sm:items-start sm:justify-between gap-4">
                  <div>
                    <span className="text-[11px] uppercase tracking-widest text-slate-400 font-bold block mb-1">
                      {VEREIN_INFO.name}
                    </span>
                    <h2 className="text-base sm:text-xl font-black text-white tracking-tight">
                      EINVERSTÄNDNISERKLÄRUNG AUSLEIHE HOCKEY-AUSRÜSTUNG
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      {VEREIN_INFO.addressLine} · Ausleihe-Nr. #{rentalId}
                    </p>
                  </div>
                  <div className="mt-3 sm:mt-0 flex sm:flex-col items-center sm:items-end justify-center gap-2">
                    {isSigned ? (
                      <span className="text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 text-emerald-400" />
                        <span>Verbindlich unterschrieben</span>
                      </span>
                    ) : (
                      <span className="text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-1 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        Vertragsentwurf
                      </span>
                    )}
                    <span className="text-[11px] text-slate-400">
                      Stand: {formatDateDe(rentedAtDate)}
                    </span>
                  </div>
                </div>

                {/* 1. VERTRAGSPARTEIEN */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-blue-400 border-b border-slate-800 pb-1">
                    1. Vertragsparteien
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="bg-[#1F2330] p-3.5 rounded-xl border border-slate-800 space-y-1">
                      <span className="text-[10px] font-bold uppercase text-slate-400 block">Verleiher</span>
                      <p className="font-bold text-white">{VEREIN_INFO.name}</p>
                      <p className="text-slate-400">{VEREIN_INFO.addressLine}</p>
                    </div>

                    <div className="bg-[#1F2330] p-3.5 rounded-xl border border-slate-800 space-y-1">
                      <span className="text-[10px] font-bold uppercase text-slate-400 block">Entleiher / Erziehungsberechtigte(r)</span>
                      <p className="font-bold text-white">
                        {formData.first_name || 'Vorname'} {formData.last_name || 'Nachname'}
                      </p>
                      <p className="text-slate-300">
                        Kind (Spieler/in): <strong className="text-blue-300">{formData.child_name || '—'}</strong>
                      </p>
                      <p className="text-slate-400">
                        {formData.street || 'Straße'} {formData.house_number || ''}, {formData.postal_code || 'PLZ'} {formData.city || 'Ort'}
                      </p>
                      <p className="text-slate-400">
                        Tel.: {formData.phone || '—'} · E-Mail: {formData.email || '—'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 2. VERLEIHZEITRAUM */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-blue-400 border-b border-slate-800 pb-1">
                    2. Verleihzeitraum & Fristen
                  </h4>
                  <div className="bg-[#1F2330] p-3.5 rounded-xl border border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Datum der Übergabe:</span>
                      <strong className="text-white text-sm">{formatDateDe(rentedAtDate)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Vereinbarter Rückgabetermin:</span>
                      <strong className="text-blue-300 text-sm">{formatDateDe(dueDate)}</strong>
                    </div>
                  </div>
                </div>

                {/* 3. AUSLEIHE-EQUIPMENT (AUTOMATISCH ÜBERNOMMEN) */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-blue-400 border-b border-slate-800 pb-1 flex items-center justify-between">
                    <span>3. Überlassene Hockey-Ausrüstung</span>
                    <span className="text-[11px] text-slate-400 lowercase font-normal">
                      ({equipmentList.length} Gegenstände)
                    </span>
                  </h4>
                  
                  {equipmentList.length === 0 ? (
                    <p className="text-xs text-slate-400 italic bg-[#1F2330] p-3 rounded-xl">Keine Equipmentteile zugeordnet.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-800">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#1F2330] text-slate-400 font-bold uppercase text-[10px] border-b border-slate-800">
                          <tr>
                            <th className="py-2.5 px-3 w-8">Pos.</th>
                            <th className="py-2.5 px-3">Kategorie</th>
                            <th className="py-2.5 px-3">Marke</th>
                            <th className="py-2.5 px-3">Größe</th>
                            <th className="py-2.5 px-3 text-right">Inventar-Code</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/80 bg-[#181B24]">
                          {equipmentList.map((item: any, idx: number) => (
                            <tr key={item.id || idx} className="hover:bg-[#1F2330]/50">
                              <td className="py-2 px-3 text-slate-500 font-mono">{idx + 1}</td>
                              <td className="py-2 px-3 font-semibold text-white">{item.category_label || item.category}</td>
                              <td className="py-2 px-3 text-slate-300">{item.brand || '—'}</td>
                              <td className="py-2 px-3 text-slate-300">{item.size || '—'}</td>
                              <td className="py-2 px-3 text-right font-mono text-blue-300 font-bold">{item.item_code}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* 4. GEBÜHR & KAUTION */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-blue-400 border-b border-slate-800 pb-1">
                    4. Nutzungsgebühr & Sicherheitsleistung (Kaution)
                  </h4>
                  <div className="bg-[#1F2330] p-4 rounded-xl border border-slate-800 space-y-2.5 text-xs">
                    <div className="flex justify-between items-center text-slate-300">
                      <span>Abnutzungsgebühr (Bundle für sechs Monate):</span>
                      <strong className="text-white font-mono">{Number(formData.fee_amount).toFixed(2)} €</strong>
                    </div>
                    <div className="flex justify-between items-center text-slate-300">
                      <span>Sicherheitsleistung / Kaution:</span>
                      <strong className="text-emerald-300 font-mono">{Number(formData.deposit_amount).toFixed(2)} €</strong>
                    </div>
                    <div className="pt-2 border-t border-slate-700/80 flex justify-between items-center text-sm font-bold">
                      <span className="text-white">Gesamtbetrag (Zahlung per SEPA-Lastschrift):</span>
                      <span className="text-blue-300 font-mono text-base">{totalAmount.toFixed(2)} €</span>
                    </div>
                    <p className="text-[11px] text-slate-400 pt-1 leading-normal italic">
                      Hinweis: Die Kaution in Höhe von 50,00 € wird nach ordnungsgemäßer, unbeschädigter und vollständiger Rückgabe des Equipments unverzüglich erstattet.
                    </p>
                  </div>
                </div>

                {/* 5. VERTRAGSBEDINGUNGEN */}
                <div className="space-y-4 pt-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-blue-400 border-b border-slate-800 pb-1">
                    {CONTRACT_META.sectionsHeading}
                  </h4>

                  <div className="space-y-4 text-xs text-slate-300 leading-relaxed bg-[#1F2330] p-4 sm:p-5 rounded-xl border border-slate-800">
                    {CONTRACT_SECTIONS.map((section, idx) => (
                      <div
                        key={section.id}
                        className={`space-y-1.5 ${idx > 0 ? 'pt-2 border-t border-slate-700/60' : ''}`}
                      >
                        <h5 className="font-bold text-white text-xs">
                          {section.title}
                        </h5>
                        {section.paragraphs.map((para, pIdx) => (
                          <p key={pIdx}>{para}</p>
                        ))}
                        {section.bulletPoints && section.bulletPoints.length > 0 && (
                          <ul className="list-disc list-inside space-y-1 pl-1 text-slate-300">
                            {section.bulletPoints.map((bp, bIdx) => (
                              <li key={bIdx}>{bp}</li>
                            ))}
                          </ul>
                        )}
                        {section.afterBulletsParagraph && (
                          <p className="pt-1">{section.afterBulletsParagraph}</p>
                        )}
                      </div>
                    ))}

                    {/* Bestätigungen bei Übergabe (Template + dynamische Daten) */}
                    <div className="space-y-2.5 pt-2 border-t border-slate-700/60">
                      <h5 className="font-bold text-white text-xs">
                        {CONTRACT_CONFIRMATION.title}
                      </h5>
                      <p>
                        {CONTRACT_CONFIRMATION.receiptPrefix}{' '}
                        <strong className="text-white font-medium">
                          {formatDateDe(rentedAtDate) || '—'}
                        </strong>{' '}
                        {CONTRACT_CONFIRMATION.receiptSuffix}
                      </p>
                      <div className="p-2.5 rounded-lg bg-[#181B24] border border-slate-700/60 flex items-center justify-between text-xs">
                        <span className="text-slate-300 font-medium">Vereinbarter Rückgabetermin:</span>
                        <strong className="text-blue-300 font-bold">{formatDateDe(dueDate)}</strong>
                      </div>
                      <p className="font-semibold text-slate-200">
                        {CONTRACT_CONFIRMATION.directDebitNotice}
                      </p>
                      <div className="p-3 rounded-lg bg-[#181B24] border border-slate-700/60 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 font-bold uppercase text-[11px]">
                            {CONTRACT_CONFIRMATION.ibanLabel}
                          </span>
                          <span className="font-mono text-white tracking-widest text-xs sm:text-sm font-semibold">
                            {formData.iban ? (showFullIbanInPreview ? formData.iban : maskIban(formData.iban)) : '—'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowFullIbanInPreview(!showFullIbanInPreview)}
                          className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer px-2 py-1 rounded bg-[#252936] hover:bg-slate-700 border border-slate-700/60 transition-colors"
                          title={showFullIbanInPreview ? 'IBAN maskieren' : 'IBAN vollständig anzeigen'}
                        >
                          {showFullIbanInPreview ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          <span>{showFullIbanInPreview ? 'Verbergen' : 'Anzeigen'}</span>
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-normal">
                        {CONTRACT_CONFIRMATION.bankRefundNotice}
                      </p>
                    </div>

                  </div>
                </div>

                {/* 7. UNTERSCHRIFTENBEREICH */}
                <div className="pt-4 border-t border-slate-800 space-y-3">
                  <div className="flex justify-between items-center text-xs text-slate-400">
                    <span>Ort, Datum: {VEREIN_INFO.city}, {formatDateDe(rentedAtDate) || '—'}</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div className="p-4 rounded-xl border border-slate-800 bg-[#1F2330] text-center space-y-4">
                      <div className="h-16 flex items-center justify-center">
                        <span className="text-sm text-slate-300 font-serif italic">{VEREIN_INFO.name}</span>
                      </div>
                      <div className="border-t border-slate-700 pt-1 text-[11px] text-slate-400">
                        Unterschrift Verleiher ({VEREIN_INFO.name})
                      </div>
                    </div>

                    <div className="p-4 rounded-xl border border-slate-700 bg-[#1F2330] text-center space-y-2">
                      {isSigned && existingContract?.signature_data ? (
                        <div className="min-h-[5.5rem] flex items-center justify-center bg-white rounded-xl p-2 shadow-inner">
                          <img
                            src={existingContract.signature_data}
                            alt="Digitale Unterschrift"
                            className="max-h-16 max-w-full object-contain"
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={handleStartSignFlow}
                          className="w-full min-h-[5.5rem] py-3.5 px-4 flex flex-col items-center justify-center text-slate-300 bg-[#181B24] hover:bg-[#1E2330] active:scale-[0.98] rounded-xl border-2 border-dashed border-indigo-500/50 hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all cursor-pointer group shadow-sm"
                          title="Hier tippen, um den Vertrag digital zu unterschreiben"
                        >
                          <span className="text-xs sm:text-sm font-bold text-indigo-300 group-hover:text-indigo-200 flex items-center gap-1.5">
                            <PenTool className="w-4 h-4 text-indigo-400 group-hover:text-indigo-300" />
                            <span>Digitale Unterschrift</span>
                          </span>
                          <span className="text-[11px] sm:text-xs font-medium text-slate-400 group-hover:text-slate-200 mt-1.5 flex items-center gap-1">
                            <span>Noch nicht unterschrieben – hier tippen zum Unterschreiben</span>
                            <ArrowRight className="w-3.5 h-3.5 text-indigo-400 group-hover:translate-x-0.5 transition-transform" />
                          </span>
                        </button>
                      )}
                      <div className="border-t border-slate-700 pt-1 text-[11px] text-slate-300">
                        {isSigned ? (
                          <>
                            <span className="font-semibold text-white block truncate">
                              {existingContract?.signer_name || `${formData.first_name} ${formData.last_name}`}
                            </span>
                            <span className="text-[10px] text-slate-400 block truncate">
                              Unterzeichnet am {formatDateTimeDe(existingContract?.signed_at)}
                            </span>
                          </>
                        ) : (
                          <span className="text-slate-400">
                            Unterschrift Entleiher (gesetzl. Vertreter)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              {/* ACTION BUTTONS (PREVIEW) */}
              <div className="border-t border-slate-700/60 pt-4 space-y-3">
                {isSigned ? (
                  <>
                    <button
                      type="button"
                      onClick={handleDownloadSignedPdf}
                      className="w-full min-h-12 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      <span>PDF herunterladen / öffnen</span>
                    </button>

                    <button
                      type="button"
                      onClick={onClose}
                      className="w-full min-h-11 px-4 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/50 text-xs font-medium transition-all cursor-pointer"
                    >
                      Schließen
                    </button>
                  </>
                ) : (
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={handleStartSignFlow}
                      disabled={saving || isSigningSubmitting}
                      className="w-full min-h-12 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Vertrag direkt auf diesem Gerät unterschreiben"
                    >
                      <PenTool className="w-4 h-4" />
                      <span>Auf diesem Gerät unterschreiben</span>
                    </button>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setShowShareModal(true)}
                        disabled={saving || isSigningSubmitting}
                        className="min-h-12 px-3 py-3 rounded-xl bg-[#252936] hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Sicheren individuellen Link zum Unterschreiben für Entleiher erzeugen und teilen"
                      >
                        <Share2 className="hidden sm:block w-4 h-4 shrink-0" />
                        <span>Unterschriftslink</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setMode('form')}
                        className="min-h-12 px-3 py-3 rounded-xl bg-[#252936] hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Edit className="hidden sm:block w-4 h-4 shrink-0" />
                        <span>Daten bearbeiten</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={onClose}
                      className="w-full min-h-11 px-4 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/50 text-xs font-medium transition-all cursor-pointer"
                    >
                      Schließen
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* BESTÄTIGUNGSDIALOG VOR UNTERSCHRIFT (PHASE 2) */}
        <ConfirmModal
          show={showSignConfirm}
          title="Vertrag verbindlich abschließen?"
          message="Bitte prüfen Sie den Vertrag vollständig. Mit der Unterschrift wird der aktuelle Vertragsstand verbindlich abgeschlossen. Die Vertragsdaten und die dokumentierte Ausrüstung können danach nicht mehr verändert werden."
          onCancel={() => setShowSignConfirm(false)}
          onConfirm={() => {
            setShowSignConfirm(false);
            setShowSignatureModal(true);
          }}
          confirmText="Weiter zur Unterschrift"
          cancelText="Abbrechen"
          isDanger={false}
        />

        {/* SIGNATUR-PAD MODAL (PHASE 2) */}
        <SignatureModal
          show={showSignatureModal}
          rentalId={rentalId}
          initialSignerName={`${formData.first_name} ${formData.last_name}`.trim()}
          onCancel={() => setShowSignatureModal(false)}
          onConfirm={handleSignComplete}
          isSubmitting={isSigningSubmitting}
        />

        {/* SHARE SIGNING LINK MODAL */}
        {showShareModal && (
          <ShareSigningLinkModal
            rentalId={rentalId}
            password={password}
            onClose={() => setShowShareModal(false)}
          />
        )}
      </motion.div>
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
        className="bg-[#252936] border border-slate-700 rounded-3xl p-6 max-w-sm w-full shadow-2xl text-left box-border"
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

// ==============================================================================
// 6. ÖFFENTLICHE VERTRAGSSEITE FÜR ENTLEIHER (SICHERER INDIVIDUELLER LINK)
// Förderverein der Wiesel Arpke e.V., Am Hainhop 12, 31275 Lehrte
// ==============================================================================
interface PublicContractViewProps {
  token: string;
}

const PublicContractView: React.FC<PublicContractViewProps> = ({ token }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [invalid, setInvalid] = useState<boolean>(false);
  const [invalidMessage, setInvalidMessage] = useState<string>('Dieser Vertragslink ist nicht mehr gültig.');
  const [isCompleted, setIsCompleted] = useState<boolean>(false);

  const [contractData, setContractData] = useState<{
    contract: any;
    rental: any;
    equipment: any[];
    expires_at: string;
    review_hash: string;
  } | null>(null);

  // Externer Signierlink startet bewusst mit der Dateneingabe. Erst danach folgt die Vertragsvorschau.
  const [isEditingPersonalData, setIsEditingPersonalData] = useState<boolean>(true);
  const [showFullIbanInPreview, setShowFullIbanInPreview] = useState<boolean>(false);
  const [savingPersonalData, setSavingPersonalData] = useState<boolean>(false);

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    child_name: '',
    street: '',
    house_number: '',
    postal_code: '',
    city: '',
    phone: '',
    email: '',
    iban: ''
  });

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Signatur-Status
  const [showSignConfirm, setShowSignConfirm] = useState<boolean>(false);
  const [showSignatureModal, setShowSignatureModal] = useState<boolean>(false);
  const [isSigningSubmitting, setIsSigningSubmitting] = useState<boolean>(false);

  // Positive Statusmeldungen nach ca. 3 Sekunden automatisch ausblenden (Fehler bleiben bewusst sichtbar)
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        setSuccess(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  // Daten vom öffentlichen Endpoint laden
  useEffect(() => {
    let isMounted = true;
    async function loadPublicContract() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/public/contract?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!isMounted) return;

        if (res.ok && data.success) {
          setContractData(data);
          setFormData({
            first_name: data.contract.first_name || '',
            last_name: data.contract.last_name || '',
            child_name: data.contract.child_name || '',
            street: data.contract.street || '',
            house_number: data.contract.house_number || '',
            postal_code: data.contract.postal_code || '',
            city: data.contract.city || '',
            phone: data.contract.phone || '',
            email: data.contract.email || '',
            iban: formatIban(data.contract.iban || '')
          });
        } else {
          setInvalid(true);
          setInvalidMessage(data.message || 'Dieser Vertragslink ist nicht mehr gültig.');
        }
      } catch {
        if (isMounted) {
          setInvalid(true);
          setInvalidMessage('Verbindungsfehler beim Laden des Vertrags. Bitte überprüfen Sie Ihre Internetverbindung.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadPublicContract();
    return () => { isMounted = false; };
  }, [token]);

  const handleIbanChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatIban(e.target.value);
    setFormData(prev => ({ ...prev, iban: formatted }));
  };

  const handleSavePersonalData = async (e?: React.FormEvent): Promise<boolean> => {
    if (e) e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validierung der Pflichtfelder
    if (!formData.first_name.trim() || !formData.last_name.trim() || !formData.child_name.trim()) {
      setError('Bitte Vorname, Nachname und den Namen des Kindes ausfüllen.');
      return false;
    }
    if (!formData.street.trim() || !formData.house_number.trim() || !formData.postal_code.trim() || !formData.city.trim()) {
      setError('Bitte die Anschrift vollständig angeben (Straße, Hausnr., PLZ und Ort).');
      return false;
    }
    if (!formData.phone.trim()) {
      setError('Bitte eine Telefonnummer für eventuelle Rückfragen angeben.');
      return false;
    }
    const cleanEmail = formData.email.trim();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Bitte eine gültige E-Mail-Adresse angeben.');
      return false;
    }
    const cleanIban = formData.iban.replace(/\s+/g, '').toUpperCase();
    if (cleanIban.length < 15 || !/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(cleanIban)) {
      setError('Bitte eine gültige IBAN angeben (mindestens 15 Zeichen, z. B. DE...).');
      return false;
    }

    setSavingPersonalData(true);
    try {
      const res = await fetch(`${API_BASE}/public/contract/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim(),
          child_name: formData.child_name.trim(),
          street: formData.street.trim(),
          house_number: formData.house_number.trim(),
          postal_code: formData.postal_code.trim(),
          city: formData.city.trim(),
          phone: formData.phone.trim(),
          email: cleanEmail,
          iban: cleanIban
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setContractData(data);
        setSuccess('Ihre Angaben wurden übernommen. Bitte prüfen Sie jetzt den vollständigen Vertrag.');
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        setIsEditingPersonalData(false);
        window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'auto' }), 0);
        return true;
      } else {
        setError(data.message || 'Fehler beim Speichern Ihrer Angaben.');
        return false;
      }
    } catch {
      setError('Verbindungsfehler beim Speichern Ihrer Angaben.');
      return false;
    } finally {
      setSavingPersonalData(false);
    }
  };

  const handleStartSignFlow = async () => {
    const cleanIban = formData.iban.replace(/\s+/g, '').toUpperCase();
    const cleanEmail = formData.email.trim();
    const hasMissingFields = !formData.first_name.trim() ||
      !formData.last_name.trim() ||
      !formData.child_name.trim() ||
      !formData.street.trim() ||
      !formData.house_number.trim() ||
      !formData.postal_code.trim() ||
      !formData.city.trim() ||
      !formData.phone.trim() ||
      !cleanEmail ||
      cleanIban.length < 15;

    if (hasMissingFields) {
      setIsEditingPersonalData(true);
      setError('Bitte füllen Sie vor der Unterschrift Ihre persönlichen Vertragsdaten (Name, Anschrift, E-Mail und IBAN) vollständig aus.');
      return;
    }

    if (isEditingPersonalData) {
      const saved = await handleSavePersonalData();
      if (!saved) return;
    }

    setShowSignConfirm(true);
  };

  const handleSignComplete = async (signatureData: string, signerNameInput: string) => {
    setIsSigningSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/public/contract/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          signature_data: signatureData,
          signer_name: signerNameInput,
          review_hash: contractData?.review_hash
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setShowSignatureModal(false);
        setIsCompleted(true);
      } else {
        setError(data.message || 'Fehler beim Abschließen des Vertrags.');
      }
    } catch {
      setError('Verbindungsfehler beim Abschließen des Vertrags.');
    } finally {
      setIsSigningSubmitting(false);
    }
  };

  // 1. ZUSTAND: UNGÜLTIGER ODER ABGELAUFENER LINK
  if (invalid) {
    return (
      <div className="min-h-screen bg-[#141720] text-slate-200 flex flex-col items-center justify-center p-4">
        <div className="bg-[#1F2330] border border-red-500/30 rounded-3xl p-6 sm:p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-red-500/20 text-red-400 border border-red-500/30 mx-auto flex items-center justify-center">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white">Dieser Vertragslink ist nicht mehr gültig.</h2>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            {invalidMessage}
          </p>
          <div className="p-3.5 rounded-xl bg-[#181B24] border border-slate-800 text-xs text-slate-400">
            Bitte wenden Sie sich bei Fragen an die Verantwortlichen des <strong className="text-slate-200 block mt-0.5">Fördervereins der Wiesel Arpke e.V.</strong>
          </div>
        </div>
      </div>
    );
  }

  // 2. ZUSTAND: ERFOLGREICH UNTERSCHRIEBEN
  if (isCompleted) {
    return (
      <div className="min-h-screen bg-[#141720] text-slate-200 flex flex-col items-center justify-center p-4">
        <div className="bg-[#1F2330] border border-emerald-500/40 rounded-3xl p-6 sm:p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 mx-auto flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white">Vielen Dank. Der Vertrag wurde erfolgreich unterschrieben.</h2>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Ihre Einverständniserklärung wurde verbindlich abgeschlossen und an den Förderverein übermittelt.
          </p>
          <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-xs text-emerald-300/90 leading-relaxed">
            Dieser persönliche Vertragslink ist nun dauerhaft geschlossen. Es können keine Daten mehr eingesehen oder verändert werden.
          </div>
          <p className="text-[11px] text-slate-400 pt-2">
            {VEREIN_INFO.name} · {VEREIN_INFO.addressLine}
          </p>
        </div>
      </div>
    );
  }

  // 3. ZUSTAND: LÄDT
  if (loading || !contractData) {
    return (
      <div className="min-h-screen bg-[#141720] text-slate-200 flex flex-col items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-400 animate-pulse">Lade Vertrags- und Ausleihdaten...</p>
        </div>
      </div>
    );
  }

  const { rental, equipment } = contractData;
  const rentedAtDate = rental?.rented_at || new Date().toISOString().split('T')[0];
  const dueDate = rental?.due_date || calculateDueDate(rentedAtDate);
  const feeAmount = contractData.contract.fee_amount !== undefined ? Number(contractData.contract.fee_amount) : (rental?.fee_total ?? 60.00);
  const depositAmount = contractData.contract.deposit_amount !== undefined ? Number(contractData.contract.deposit_amount) : 50.00;
  const totalAmount = feeAmount + depositAmount;

  // ERSTER SCHRITT: Persönliche Daten erfassen. Der vollständige Vertrag wird
  // bewusst erst nach erfolgreichem Speichern angezeigt.
  if (isEditingPersonalData) {
    return (
      <div className="min-h-screen bg-[#141720] text-slate-200 p-3 sm:p-6 flex flex-col items-center">
        <div className="w-full max-w-xl space-y-4">
          <div className="bg-[#181B24] border border-slate-800 rounded-3xl p-4 sm:p-5 flex items-center gap-3 shadow-lg">
            <div className="p-2.5 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex-shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-black text-white">{VEREIN_INFO.name}</h1>
              <p className="text-xs text-slate-400">Ausleihvertrag · Persönliche Angaben</p>
            </div>
          </div>

          {error && (
            <div className="p-3.5 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center justify-between gap-2">
              <span>{error}</span>
              <button type="button" onClick={() => setError(null)} className="text-red-400 hover:text-red-200">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="bg-[#181B24] border border-slate-700/80 rounded-3xl p-5 sm:p-7 shadow-2xl">
            <div className="mb-5">
              <h2 className="text-xl font-black text-white">Persönliche Daten</h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 leading-relaxed">
                Bitte ergänzen Sie zunächst Ihre Angaben. Anschließend sehen Sie den vollständig ausgefüllten Vertrag und können ihn in Ruhe prüfen und unterschreiben.
              </p>
            </div>

            <form onSubmit={handleSavePersonalData} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Name des Kindes (Spieler/in) *</label>
                <input type="text" required value={formData.child_name} onChange={(e) => setFormData({ ...formData, child_name: e.target.value })}
                  className="w-full px-3 py-3 rounded-xl bg-[#1F2330] border border-slate-700 text-white text-base focus:ring-2 focus:ring-blue-500 outline-none box-border" placeholder="z. B. Tim Mustermann" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Vorname *</label>
                  <input type="text" required value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    className="w-full px-3 py-3 rounded-xl bg-[#1F2330] border border-slate-700 text-white text-base focus:ring-2 focus:ring-blue-500 outline-none box-border" placeholder="Max" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Nachname *</label>
                  <input type="text" required value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    className="w-full px-3 py-3 rounded-xl bg-[#1F2330] border border-slate-700 text-white text-base focus:ring-2 focus:ring-blue-500 outline-none box-border" placeholder="Mustermann" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[1fr_8rem] gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Straße *</label>
                  <input type="text" required value={formData.street} onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                    className="w-full px-3 py-3 rounded-xl bg-[#1F2330] border border-slate-700 text-white text-base focus:ring-2 focus:ring-blue-500 outline-none box-border" placeholder="Musterstraße" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Hausnr. *</label>
                  <input type="text" required value={formData.house_number} onChange={(e) => setFormData({ ...formData, house_number: e.target.value })}
                    className="w-full px-3 py-3 rounded-xl bg-[#1F2330] border border-slate-700 text-white text-base focus:ring-2 focus:ring-blue-500 outline-none box-border" placeholder="12a" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[8rem_1fr] gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">PLZ *</label>
                  <input type="text" required value={formData.postal_code} onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                    className="w-full px-3 py-3 rounded-xl bg-[#1F2330] border border-slate-700 text-white text-base focus:ring-2 focus:ring-blue-500 outline-none box-border" placeholder="31275" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Ort *</label>
                  <input type="text" required value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-3 py-3 rounded-xl bg-[#1F2330] border border-slate-700 text-white text-base focus:ring-2 focus:ring-blue-500 outline-none box-border" placeholder="Lehrte" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Telefonnummer *</label>
                <input type="tel" required value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-3 rounded-xl bg-[#1F2330] border border-slate-700 text-white text-base focus:ring-2 focus:ring-blue-500 outline-none box-border" placeholder="0171 1234567" />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">E-Mail-Adresse *</label>
                <input type="email" required value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-3 rounded-xl bg-[#1F2330] border border-slate-700 text-white text-base focus:ring-2 focus:ring-blue-500 outline-none box-border" placeholder="max@mustermann.de" />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">IBAN (SEPA-Lastschrift) *</label>
                <input type="text" required value={formData.iban} onChange={handleIbanChange}
                  className="w-full px-3 py-3 rounded-xl bg-[#1F2330] border border-slate-700 text-white font-mono text-base focus:ring-2 focus:ring-blue-500 outline-none box-border" placeholder="DE89 3705 0198 0000 0123 45" />
              </div>

              <button type="submit" disabled={savingPersonalData}
                className="w-full mt-2 px-4 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm cursor-pointer shadow-md disabled:opacity-50 flex items-center justify-center gap-2">
                {savingPersonalData ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Angaben werden gespeichert...</span>
                  </>
                ) : (
                  <>
                    <ArrowRight className="w-4 h-4" />
                    <span>Weiter zum Vertrag</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#141720] text-slate-200 p-3 sm:p-6 flex flex-col items-center">
      <div className="w-full max-w-3xl space-y-4">
        
        {/* BRANDING HEADER */}
        <div className="bg-[#181B24] border border-slate-800 rounded-3xl p-4 sm:p-5 flex items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex-shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-black text-white truncate">
                {VEREIN_INFO.name}
              </h1>
              <p className="text-xs text-indigo-400 font-semibold truncate">
                Einverständniserklärung Ausleihe Hockey-Ausrüstung
              </p>
            </div>
          </div>
          <div className="bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-lg flex-shrink-0">
            Signier-Link
          </div>
        </div>

        {/* FEEDBACK BANNERS */}
        {error && (
          <div className="p-3.5 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center justify-between gap-2">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="text-red-400 hover:text-red-200">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {success && (
          <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>{success}</span>
            </span>
            <button type="button" onClick={() => setSuccess(null)} className="text-emerald-400 hover:text-emerald-200">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* EINLEITUNGS-HINWEIS */}
        <div className="p-4 rounded-2xl bg-indigo-950/20 border border-indigo-500/30 text-xs text-slate-300 leading-relaxed flex items-start gap-3 shadow-sm">
          <ShieldCheck className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
          <div>
            <strong className="text-indigo-200 block mb-0.5">Herzlich willkommen!</strong>
            Bitte prüfen Sie Ihre persönlichen Daten und die überlassene Ausrüstung. Sie können Ihre Angaben direkt hier ergänzen oder korrigieren. Sobald alles vollständig ist, unterzeichnen Sie den Vertrag ganz einfach unten mit dem Finger.
          </div>
        </div>

        {/* HAUPTDOKUMENT */}
        <div className="bg-[#181B24] p-5 sm:p-8 rounded-3xl border border-slate-700/80 shadow-2xl space-y-6 text-slate-200 text-xs sm:text-sm">
          
          {/* DOKUMENTEN-KOPF */}
          <div className="border-b border-slate-800 pb-5 text-center sm:text-left sm:flex sm:items-start sm:justify-between gap-4">
            <div>
              <span className="text-[11px] uppercase tracking-widest text-slate-400 font-bold block mb-1">
                {VEREIN_INFO.name}
              </span>
              <h2 className="text-base sm:text-xl font-black text-white tracking-tight">
                EINVERSTÄNDNISERKLÄRUNG AUSLEIHE HOCKEY-AUSRÜSTUNG
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                {VEREIN_INFO.addressLine}
              </p>
            </div>
            <div className="mt-3 sm:mt-0 flex sm:flex-col items-center sm:items-end justify-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-1 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Vertragsentwurf
              </span>
              <span className="text-[11px] text-slate-400">
                Stand: {formatDateDe(rentedAtDate)}
              </span>
            </div>
          </div>

          {/* 1. VERTRAGSPARTEIEN */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400">
                1. Vertragsparteien
              </h3>
              {!isEditingPersonalData && (
                <button
                  type="button"
                  onClick={() => setIsEditingPersonalData(true)}
                  className="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
                >
                  <Edit className="w-3.5 h-3.5" />
                  <span>Angaben bearbeiten</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              {/* Verleiher */}
              <div className="bg-[#1F2330] p-4 rounded-2xl border border-slate-800 space-y-1">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Verleiher</span>
                <p className="font-bold text-white text-sm">{VEREIN_INFO.name}</p>
                <p className="text-slate-400">{VEREIN_INFO.addressLine}</p>
              </div>

              {/* Entleiher */}
              <div className="bg-[#1F2330] p-4 rounded-2xl border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase text-slate-400">Entleiher / Erziehungsberechtigte(r)</span>
                </div>

                {isEditingPersonalData ? (
                  <form onSubmit={handleSavePersonalData} className="space-y-3 pt-1">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                        Name des Kindes (Spieler/in) *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.child_name}
                        onChange={(e) => setFormData({ ...formData, child_name: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-[#181B24] border border-slate-700 text-white text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="z. B. Tim Mustermann"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                          Vorname *
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.first_name}
                          onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-[#181B24] border border-slate-700 text-white text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                          placeholder="Max"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                          Nachname *
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.last_name}
                          onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-[#181B24] border border-slate-700 text-white text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                          placeholder="Mustermann"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                          Straße *
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.street}
                          onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-[#181B24] border border-slate-700 text-white text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                          placeholder="Musterstraße"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                          Hausnr. *
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.house_number}
                          onChange={(e) => setFormData({ ...formData, house_number: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-[#181B24] border border-slate-700 text-white text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                          placeholder="12a"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                          PLZ *
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.postal_code}
                          onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-[#181B24] border border-slate-700 text-white text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                          placeholder="31275"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                          Ort *
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.city}
                          onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-[#181B24] border border-slate-700 text-white text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                          placeholder="Lehrte"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                        Telefonnummer *
                      </label>
                      <input
                        type="tel"
                        required
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-[#181B24] border border-slate-700 text-white text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="0171 1234567"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                        E-Mail-Adresse *
                      </label>
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-[#181B24] border border-slate-700 text-white text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="max@mustermann.de"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                        IBAN (SEPA-Lastschrift) *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.iban}
                        onChange={handleIbanChange}
                        className="w-full px-3 py-2 rounded-xl bg-[#181B24] border border-slate-700 text-white font-mono text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="DE89 3705 0198 0000 0123 45"
                      />
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="submit"
                        disabled={savingPersonalData}
                        className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs cursor-pointer shadow-sm disabled:opacity-50"
                      >
                        {savingPersonalData ? 'Speichert...' : 'Angaben übernehmen'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditingPersonalData(false)}
                        className="px-3 py-2 rounded-xl bg-[#181B24] hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700 text-xs cursor-pointer"
                      >
                        Abbrechen
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <p className="font-bold text-white text-sm">
                      {formData.first_name || 'Vorname'} {formData.last_name || 'Nachname'}
                    </p>
                    <p className="text-slate-300">
                      Kind (Spieler/in): <strong className="text-blue-300">{formData.child_name || '—'}</strong>
                    </p>
                    <p className="text-slate-400">
                      {formData.street || 'Straße'} {formData.house_number || ''}, {formData.postal_code || 'PLZ'} {formData.city || 'Ort'}
                    </p>
                    <p className="text-slate-400">
                      Tel.: {formData.phone || '—'} · E-Mail: {formData.email || '—'}
                    </p>
                    <div className="pt-1 flex items-center justify-between text-slate-300 border-t border-slate-800/80">
                      <span className="text-[11px] text-slate-400">IBAN:</span>
                      <span className="font-mono text-white text-xs">
                        {formData.iban ? maskIban(formData.iban) : '—'}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* 2. VERLEIHZEITRAUM & FRISTEN (READ-ONLY) */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400 border-b border-slate-800 pb-1">
              2. Verleihzeitraum & Fristen
            </h3>
            <div className="bg-[#1F2330] p-4 rounded-2xl border border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Datum der Übergabe:</span>
                <strong className="text-white text-sm">{formatDateDe(rentedAtDate)}</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Vereinbarter Rückgabetermin:</span>
                <strong className="text-blue-300 text-sm font-bold">{formatDateDe(dueDate)}</strong>
              </div>
            </div>
          </div>

          {/* 3. AUSLEIHE-EQUIPMENT (READ-ONLY) */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400 border-b border-slate-800 pb-1 flex items-center justify-between">
              <span>3. Überlassene Hockey-Ausrüstung</span>
              <span className="text-[11px] text-slate-400 lowercase font-normal">
                ({equipment.length} Gegenstände)
              </span>
            </h3>

            {equipment.length === 0 ? (
              <p className="text-xs text-slate-400 italic bg-[#1F2330] p-3 rounded-xl">Keine Ausrüstungsteile hinterlegt.</p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#1F2330] text-slate-400 font-bold uppercase text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3 w-8">Pos.</th>
                      <th className="py-2.5 px-3">Kategorie</th>
                      <th className="py-2.5 px-3">Marke</th>
                      <th className="py-2.5 px-3">Größe</th>
                      <th className="py-2.5 px-3 text-right">Inventar-Code</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 bg-[#181B24]">
                    {equipment.map((item: any, idx: number) => (
                      <tr key={item.id || idx} className="hover:bg-[#1F2330]/50">
                        <td className="py-2 px-3 text-slate-500 font-mono">{idx + 1}</td>
                        <td className="py-2 px-3 font-semibold text-white">{item.category_label || item.category}</td>
                        <td className="py-2 px-3 text-slate-300">{item.brand || '—'}</td>
                        <td className="py-2 px-3 text-slate-300">{item.size || '—'}</td>
                        <td className="py-2 px-3 text-right font-mono text-blue-300 font-bold">{item.item_code}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 4. GEBÜHR & KAUTION (READ-ONLY) */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400 border-b border-slate-800 pb-1">
              4. Nutzungsgebühr & Sicherheitsleistung (Kaution)
            </h3>
            <div className="bg-[#1F2330] p-4 rounded-2xl border border-slate-800 space-y-2.5 text-xs">
              <div className="flex justify-between items-center text-slate-300">
                <span>Abnutzungsgebühr (Bundle für sechs Monate):</span>
                <strong className="text-white font-mono">{feeAmount.toFixed(2)} €</strong>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span>Sicherheitsleistung / Kaution:</span>
                <strong className="text-emerald-300 font-mono">{depositAmount.toFixed(2)} €</strong>
              </div>
              <div className="pt-2 border-t border-slate-700/80 flex justify-between items-center text-sm font-bold">
                <span className="text-white">Gesamtbetrag (Zahlung per SEPA-Lastschrift):</span>
                <span className="text-blue-300 font-mono text-base">{totalAmount.toFixed(2)} €</span>
              </div>
              <p className="text-[11px] text-slate-400 pt-1 leading-normal italic">
                Hinweis: Die Kaution in Höhe von 50,00 € wird nach ordnungsgemäßer, unbeschädigter und vollständiger Rückgabe des Equipments unverzüglich erstattet.
              </p>
            </div>
          </div>

          {/* 5. VERTRAGSBEDINGUNGEN AUS CONTRACTTEMPLATE */}
          <div className="space-y-4 pt-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400 border-b border-slate-800 pb-1">
              {CONTRACT_META.sectionsHeading}
            </h3>

            <div className="space-y-4 text-xs text-slate-300 leading-relaxed bg-[#1F2330] p-4 sm:p-5 rounded-2xl border border-slate-800">
              {CONTRACT_SECTIONS.map((section, idx) => (
                <div
                  key={section.id}
                  className={`space-y-1.5 ${idx > 0 ? 'pt-2 border-t border-slate-700/60' : ''}`}
                >
                  <h4 className="font-bold text-white text-xs">
                    {section.title}
                  </h4>
                  {section.paragraphs.map((para, pIdx) => (
                    <p key={pIdx}>{para}</p>
                  ))}
                  {section.bulletPoints && section.bulletPoints.length > 0 && (
                    <ul className="list-disc list-inside space-y-1 pl-1 text-slate-300">
                      {section.bulletPoints.map((bp, bIdx) => (
                        <li key={bIdx}>{bp}</li>
                      ))}
                    </ul>
                  )}
                  {section.afterBulletsParagraph && (
                    <p className="pt-1">{section.afterBulletsParagraph}</p>
                  )}
                </div>
              ))}

              {/* Bestätigungen bei Übergabe */}
              <div className="space-y-2.5 pt-2 border-t border-slate-700/60">
                <h4 className="font-bold text-white text-xs">
                  {CONTRACT_CONFIRMATION.title}
                </h4>
                <p>
                  {CONTRACT_CONFIRMATION.receiptPrefix}{' '}
                  <strong className="text-white font-medium">
                    {formatDateDe(rentedAtDate) || '—'}
                  </strong>{' '}
                  {CONTRACT_CONFIRMATION.receiptSuffix}
                </p>
                <div className="p-2.5 rounded-xl bg-[#181B24] border border-slate-700/60 flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-medium">Vereinbarter Rückgabetermin:</span>
                  <strong className="text-blue-300 font-bold">{formatDateDe(dueDate)}</strong>
                </div>
                <p className="font-semibold text-slate-200">
                  {CONTRACT_CONFIRMATION.directDebitNotice}
                </p>
                <div className="p-3 rounded-xl bg-[#181B24] border border-slate-700/60 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 font-bold uppercase text-[11px]">
                      {CONTRACT_CONFIRMATION.ibanLabel}
                    </span>
                    <span className="font-mono text-white tracking-widest text-xs sm:text-sm font-semibold">
                      {formData.iban ? (showFullIbanInPreview ? formData.iban : maskIban(formData.iban)) : '—'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowFullIbanInPreview(!showFullIbanInPreview)}
                    className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer px-2 py-1 rounded bg-[#252936] hover:bg-slate-700 border border-slate-700/60 transition-colors"
                  >
                    {showFullIbanInPreview ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    <span>{showFullIbanInPreview ? 'Verbergen' : 'Anzeigen'}</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 leading-normal">
                  {CONTRACT_CONFIRMATION.bankRefundNotice}
                </p>
              </div>
            </div>
          </div>

          {/* 6. UNTERSCHRIFTENBEREICH */}
          <div className="pt-4 border-t border-slate-800 space-y-3">
            <div className="flex justify-between items-center text-xs text-slate-400">
              <span>Ort, Datum: {VEREIN_INFO.city}, {formatDateDe(rentedAtDate) || '—'}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="p-4 rounded-2xl border border-slate-800 bg-[#1F2330] text-center space-y-4">
                <div className="h-16 flex items-center justify-center">
                  <span className="text-sm text-slate-300 font-serif italic">{VEREIN_INFO.name}</span>
                </div>
                <div className="border-t border-slate-700 pt-1 text-[11px] text-slate-400">
                  Unterschrift Verleiher ({VEREIN_INFO.name})
                </div>
              </div>

              <div className="p-4 rounded-2xl border border-slate-700 bg-[#1F2330] text-center space-y-2">
                <button
                  type="button"
                  onClick={handleStartSignFlow}
                  className="w-full min-h-[5.5rem] py-3.5 px-4 flex flex-col items-center justify-center text-slate-300 bg-[#181B24] hover:bg-[#1E2330] active:scale-[0.98] rounded-xl border-2 border-dashed border-indigo-500/50 hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all cursor-pointer group shadow-sm"
                  title="Hier tippen, um den Vertrag digital zu unterschreiben"
                >
                  <span className="text-xs sm:text-sm font-bold text-indigo-300 group-hover:text-indigo-200 flex items-center gap-1.5">
                    <PenTool className="w-4 h-4 text-indigo-400 group-hover:text-indigo-300" />
                    <span>Digitale Unterschrift</span>
                  </span>
                  <span className="text-[11px] sm:text-xs font-medium text-slate-400 group-hover:text-slate-200 mt-1.5 flex items-center gap-1">
                    <span>Noch nicht unterschrieben – hier tippen zum Unterschreiben</span>
                    <ArrowRight className="w-3.5 h-3.5 text-indigo-400 group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </button>
                <div className="border-t border-slate-700 pt-1 text-[11px] text-slate-400">
                  Unterschrift Entleiher (gesetzl. Vertreter)
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* BESTÄTIGUNGSDIALOG VOR UNTERSCHRIFT */}
      <ConfirmModal
        show={showSignConfirm}
        title="Vertrag verbindlich abschließen?"
        message="Bitte prüfen Sie alle Angaben sorgfältig. Mit Ihrer Unterschrift wird der Ausleihvertrag rechtsverbindlich geschlossen. Eine nachträgliche Bearbeitung ist danach über diesen Link nicht mehr möglich."
        onCancel={() => setShowSignConfirm(false)}
        onConfirm={() => {
          setShowSignConfirm(false);
          setShowSignatureModal(true);
        }}
        confirmText="Weiter zur Unterschrift"
        cancelText="Abbrechen"
        isDanger={false}
      />

      {/* SIGNATUR-PAD MODAL */}
      <SignatureModal
        show={showSignatureModal}
        rentalId={rental?.id}
        initialSignerName={`${formData.first_name} ${formData.last_name}`.trim()}
        onCancel={() => setShowSignatureModal(false)}
        onConfirm={handleSignComplete}
        isSubmitting={isSigningSubmitting}
      />
    </div>
  );
};

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

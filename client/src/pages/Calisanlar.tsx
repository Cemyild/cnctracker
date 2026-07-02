import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Users, Wallet, Loader2, Search, Building2, TrendingUp, Filter, User, Info, Calendar, Hash, ArrowUpDown, ArrowUp, ArrowDown, Calculator, Percent, AlertCircle, Banknote, Upload, Plus, Save, X, FileText, Download, Trash2, FileUp, CheckCircle2, AlertTriangle, History } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { subeler } from "@shared/schema";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IzinBakiye } from "@/components/IzinBakiye";
import { IzinListesi } from "@/components/IzinListesi";
import { IzinEkleModal } from "@/components/IzinEkleModal";
import { IzinTakvimi } from "@/components/IzinTakvimi";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

// Çalışan + hesaplama sonucu
interface CalisanHesaplama {
    calisan: any;
    loading: boolean;
    error?: string;
}

// Ay numarasından ay adına çevirme
const ayNumarasiToAd = (ayNo: number | string): string => {
    if (ayNo === "toplam") return "Yıllık Toplam";
    const ayMap: Record<number, string> = {
        1: "Ocak", 2: "Şubat", 3: "Mart", 4: "Nisan",
        5: "Mayıs", 6: "Haziran", 7: "Temmuz", 8: "Ağustos",
        9: "Eylül", 10: "Ekim", 11: "Kasım", 12: "Aralık"
    };
    return ayMap[ayNo as number] || "";
};

export default function Calisanlar() {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedSubeler, setSelectedSubeler] = useState<string[]>([]); // Empty = All
    const [selectedPerson, setSelectedPerson] = useState<any>(null);

    // Editable Gross State
    const [editingBrutId, setEditingBrutId] = useState<any>(null);
    const [editingBrutVal, setEditingBrutVal] = useState<string>("");

    // Editable Net State
    const [editingNetId, setEditingNetId] = useState<any>(null);
    const [editingNetVal, setEditingNetVal] = useState<string>("");

    const handleBrutClick = (person: any) => {
        setEditingBrutId(person.id);
        const val = person.brutUcret ? person.brutUcret.toString() : "";
        setEditingBrutVal(val);
        setEditingNetId(null);
    };

    const handleNetClick = (person: any) => {
        setEditingNetId(person.id);
        const val = person.netUcret ? person.netUcret.toString() : "";
        setEditingNetVal(val);
        setEditingBrutId(null);
    };

    const handleBrutSave = async (person: any) => {
        if (!editingBrutId) return;

        // Parse
        // Replace comma with dot just in case user uses comma
        const newBrut = parseFloat(editingBrutVal.replace(',', '.'));
        if (isNaN(newBrut)) {
            setEditingBrutId(null);
            return; // Invalid, revert
        }

        // Optimistic check
        const oldBrut = parseFloat(person.brutUcret || "0");
        if (Math.abs(newBrut - oldBrut) < 0.01) {
            setEditingBrutId(null);
            return; // No change
        }

        const statu = person.statu || "NORMAL";
        let isverenRate = 0.1775;

        // Rate Logic: 
        // Normal: Jan=17.75%, Feb+=18.75%
        // Emekli: 24.75%
        if (statu === "NORMAL") {
            const ayNo = parseInt(selectedAy);
            // If month > 1, use 0.1875. If month is 1 or invalid/NaN (shouldn't happen if parsing works), use default.
            // If 'toplam' selected, selectedAy is "toplam". parsing returns NaN.
            // If annually editing, what rate? Assume latest? Or average? Ideally editing annually is tricky.
            // Let's assume editing is done on monthly view mostly.
            if (!isNaN(ayNo) && ayNo > 1) {
                isverenRate = 0.1875;
            }
        }
        else if (statu === "EMEKLİ") isverenRate = 0.2475;
        else if (statu === "YÖNETİCİ") isverenRate = 0;

        const newIsverenSgk = Number((newBrut * isverenRate).toFixed(2));
        const newToplamMaliyet = Number((newBrut + newIsverenSgk).toFixed(2));

        const currentNet = parseFloat(person.netUcret || "0");
        const newSigortaKesintisi = Number((newBrut - currentNet).toFixed(2));

        // Optimistic State Update
        const newData = data.map(p => {
            if (p.id === person.id) {
                return {
                    ...p,
                    brutUcret: newBrut,
                    isverenSgkPayi: newIsverenSgk,
                    toplamIsverenMaliyeti: newToplamMaliyet,
                    sigortaKesintisi: newSigortaKesintisi
                };
            }
            return p;
        });
        setData(newData);
        setEditingBrutId(null);

        // API Call
        try {
            await fetch(`/api/calisanlar/${person.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    brutUcret: newBrut,
                    isverenSgkPayi: newIsverenSgk,
                    toplamIsverenMaliyeti: newToplamMaliyet,
                    sigortaKesintisi: newSigortaKesintisi
                })
            });
            toast({ title: "Başarılı", description: "Bordro güncellendi ve yeniden hesaplandı." });
        } catch (err) {
            console.error(err);
            toast({ variant: "destructive", title: "Hata", description: "Güncelleme başarısız." });
            fetchCalisanlar(); // Revert
        }
    };

    const handleNetSave = async (person: any) => {
        if (!editingNetId) return;

        // Parse
        const newNet = parseFloat(editingNetVal.replace(',', '.'));
        if (isNaN(newNet)) {
            setEditingNetId(null);
            return;
        }

        const oldNet = parseFloat(person.netUcret || "0");
        if (Math.abs(newNet - oldNet) < 0.01) {
            setEditingNetId(null);
            return;
        }

        // Logic: Keep SigortaKesintisi (Deductions) constant, adjust Brut.
        // Brut = Net + SigortaKesintisi
        const currentSigortaKesintisi = parseFloat(person.sigortaKesintisi || "0");
        const newBrut = Number((newNet + currentSigortaKesintisi).toFixed(2));

        const statu = person.statu || "NORMAL";
        let isverenRate = 0.1775;
        // Re-use Rate Logic
        if (statu === "NORMAL") {
            const ayNo = parseInt(selectedAy);
            if (!isNaN(ayNo) && ayNo > 1) {
                isverenRate = 0.1875;
            }
        }
        else if (statu === "EMEKLİ") isverenRate = 0.2475;
        else if (statu === "YÖNETİCİ") isverenRate = 0;

        const newIsverenSgk = Number((newBrut * isverenRate).toFixed(2));
        const newToplamMaliyet = Number((newBrut + newIsverenSgk).toFixed(2));

        // Optimistic Update
        const newData = data.map(p => {
            if (p.id === person.id) {
                return {
                    ...p,
                    brutUcret: newBrut,
                    netUcret: newNet,
                    isverenSgkPayi: newIsverenSgk,
                    toplamIsverenMaliyeti: newToplamMaliyet
                    // sigortaKesintisi remains constant
                };
            }
            return p;
        });
        setData(newData);
        setEditingNetId(null);

        // API Call
        try {
            await fetch(`/api/calisanlar/${person.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    brutUcret: newBrut,
                    netUcret: newNet,
                    isverenSgkPayi: newIsverenSgk,
                    toplamIsverenMaliyeti: newToplamMaliyet
                    // sigortaKesintisi not sent (unchanged)
                })
            });
            toast({ title: "Başarılı", description: "Net ücret güncellendi, Brüt yeniden hesaplandı." });
        } catch (err) {
            console.error(err);
            toast({ variant: "destructive", title: "Hata", description: "Güncelleme başarısız." });
            fetchCalisanlar();
        }
    };
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    const { toast } = useToast();

    // Ana sayfa ay ve yıl seçimi
    const [selectedAy, setSelectedAy] = useState<string>("1");
    const [selectedYil, setSelectedYil] = useState<number>(2026);
    const [hazineTesvikiVar, setHazineTesvikiVar] = useState(true);

    // Ana sekme (Maaşlar / İzinler) — kontrollü state, tasarım sistemi tab barı
    const [activeTab, setActiveTab] = useState<"maaslar" | "izinler">("maaslar");




    // Bordro Yükle — Ücret Pusulası PDF state'leri (tek yükleme akışı)
    const [pusulaOpen, setPusulaOpen] = useState(false);
    const [pusulaFile, setPusulaFile] = useState<File | null>(null);
    const [pusulaPreview, setPusulaPreview] = useState<any | null>(null);
    const [pusulaBusy, setPusulaBusy] = useState(false);

    // Bordro Arşivi state'leri (sadece dosya saklama)
    const [arsivOpen, setArsivOpen] = useState(false);
    const [arsivFile, setArsivFile] = useState<File | null>(null);
    const [arsivAy, setArsivAy] = useState<number>(1);
    const [arsivYil, setArsivYil] = useState<number>(2026);
    const [arsivList, setArsivList] = useState<any[]>([]);
    const [arsivBusy, setArsivBusy] = useState(false);

    // İzin Modal state'leri (Task 8-11 ortak kullanımda)
    const [izinModalOpen, setIzinModalOpen] = useState(false);
    const [izinModalTcNo, setIzinModalTcNo] = useState<string | null>(null);
    const [izinModalDefaultDate, setIzinModalDefaultDate] = useState<string | null>(null);
    const [izinModalEdit, setIzinModalEdit] = useState<any>(null);

    const fetchCalisanlar = async () => {
        setLoading(true);
        try {
            // Seçili ay ve yıla göre getir (Backend bu filtrelemeyi yapmalı veya filtered data kullanırız)
            // Şu an backend sadece ay alıyor. Yıl parametresi de eklemeliyiz opsiyonel olarak
            // Ancak şimdilik mevcut yapıyı kullanalım

            let url = "/api/calisanlar";
            if (selectedAy !== "toplam") {
                url += `?ay=${selectedAy}&yil=${selectedYil}`;
            } else {
                url += `?ay=toplam&yil=${selectedYil}`;
            }

            const response = await fetch(url || "/api/calisanlar");

            if (!response.ok) throw new Error("Failed to fetch data");
            const veriler = await response.json();
            setData(veriler);
        } catch (error) {
            console.error("Fetch error:", error);
            toast({ variant: "destructive", title: "Hata", description: "Veriler alınamadı." });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCalisanlar();
    }, [selectedAy, selectedYil]); // Ay veya yıl değişince tekrar çek

    const formatCurrency = (val: number | string | null | undefined) => {
        if (val === null || val === undefined) return "-";
        const num = typeof val === "string" ? parseFloat(val) : val;
        if (isNaN(num)) return "-";
        return new Intl.NumberFormat("tr-TR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(num) + " TL";
    };

    // Yıllık Toplam Hesaplama (Client-side aggregation if selectedAy === "toplam")
    // Note: This requires fetching ALL data which might not be efficient, 
    // but for now let's assume 'data' contains the relevant rows based on fetchCalisanlar
    // If "toplam" is selected, backend should ideally return aggregated data or all data.
    // Let's rely on backend filtering. If "toplam", we might need a special route or handle it.
    // For now, if "toplam", we assume we fetched all months? 
    // Let's keep it simple: "toplam" view might need a separate API call later.
    // For now, standard view.

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedAndFilteredData = [...data]
        .filter(p => {
            const matchesSearch = p.adSoyad.toLocaleLowerCase('tr-TR').includes(searchTerm.toLocaleLowerCase('tr-TR')) ||
                p.tcNo.includes(searchTerm);
            const matchesSube = selectedSubeler.length === 0 || selectedSubeler.includes(p.sube || "Merkez");
            return matchesSearch && matchesSube;
        })
        .sort((a, b) => {
            if (!sortConfig) return 0;
            const { key, direction } = sortConfig;
            let aVal = a[key];
            let bVal = b[key];

            if (key === 'brutUcret' || key === 'netUcret') {
                aVal = parseFloat(aVal || 0);
                bVal = parseFloat(bVal || 0);
            }

            if (aVal < bVal) return direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return direction === 'asc' ? 1 : -1;
            return 0;
        });

    // Seçilen ay için toplamları hesapla
    const stats = useMemo(() => {
        const toplamPersonel = sortedAndFilteredData.length;
        let toplamBrut = 0;
        let toplamNet = 0;
        let toplamIsverenPayi = 0;
        let toplamIsverenMaliyeti = 0;
        let toplamSigortaKesintisi = 0;

        for (const calisan of sortedAndFilteredData) {
            toplamBrut += parseFloat(calisan.brutUcret || "0");
            toplamNet += parseFloat(calisan.netUcret || "0");
            // isverenPayi db'de isverenSgkPayi + isverenIssizlikPayi
            const isvSgk = parseFloat(calisan.isverenSgkPayi || "0");
            const isvIss = parseFloat(calisan.isverenIssizlikPayi || "0");
            toplamIsverenPayi += (isvSgk + isvIss);
            // Calculate Total Cost dynamically
            toplamIsverenMaliyeti += (parseFloat(calisan.brutUcret || "0") + isvSgk);

            // Add Worker SGK
            toplamSigortaKesintisi += parseFloat(calisan.sigortaKesintisi || "0");
        }

        return { toplamPersonel, toplamBrut, toplamNet, toplamIsverenPayi, toplamIsverenMaliyeti, toplamSigortaKesintisi };
    }, [sortedAndFilteredData]);

    const openModal = (person: any) => {
        setSelectedPerson(person);
    };

    const isYonetici = selectedPerson?.statu === 'YÖNETİCİ';
    const isEmekli = selectedPerson?.statu === 'EMEKLİ';

    // ========================================================================
    // BORDRO YÜKLE — ÜCRET PUSULASI PDF (tek yükleme akışı)
    // Tüm değerler belgeden okunur; işveren payları arkada türetilir.
    // ========================================================================

    const handlePusulaUpload = async () => {
        if (!pusulaFile) return;
        setPusulaBusy(true);
        setPusulaPreview(null);
        const fd = new FormData();
        fd.append("pdf", pusulaFile);
        try {
            const res = await fetch("/api/bordro/pusula/upload", { method: "POST", body: fd });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Önizleme hatası");
            setPusulaPreview(json);
            toast({ title: "Parse başarılı", description: `${json.toplamKisi} kişi okundu — ${ayNumarasiToAd(json.ay)} ${json.yil}` });
        } catch (err: any) {
            toast({ variant: "destructive", title: "Hata", description: err.message });
        } finally {
            setPusulaBusy(false);
        }
    };

    const handlePusulaSave = async () => {
        if (!pusulaPreview || !pusulaFile) return;
        setPusulaBusy(true);
        const fd = new FormData();
        fd.append("pdf", pusulaFile);
        fd.append("payload", JSON.stringify({
            ay: pusulaPreview.ay,
            yil: pusulaPreview.yil,
            kayitlar: pusulaPreview.onizleme,
        }));
        try {
            const res = await fetch("/api/bordro/pusula/save", { method: "POST", body: fd });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Kaydetme hatası");
            toast({
                title: "Kaydedildi",
                description: `${json.inserted} yeni, ${json.updated} güncelleme — toplam ${json.toplam} kayıt`,
            });
            setPusulaOpen(false);
            setPusulaFile(null);
            setPusulaPreview(null);
            // Eğer yüklenen ay/yıl şu an ekrandaysa veriyi tazele
            if (pusulaPreview.ay === parseInt(selectedAy) && pusulaPreview.yil === selectedYil) {
                fetchCalisanlar();
            }
        } catch (err: any) {
            toast({ variant: "destructive", title: "Hata", description: err.message });
        } finally {
            setPusulaBusy(false);
        }
    };

    // ========================================================================
    // BORDRO ARŞİVİ
    // ========================================================================

    const fetchArsiv = async () => {
        try {
            const r = await fetch("/api/bordro/arsiv");
            const j = await r.json();
            setArsivList(Array.isArray(j) ? j : []);
        } catch {
            setArsivList([]);
        }
    };

    useEffect(() => {
        if (arsivOpen) fetchArsiv();
    }, [arsivOpen]);

    const handleArsivUpload = async () => {
        if (!arsivFile) return;
        setArsivBusy(true);
        const fd = new FormData();
        fd.append("pdf", arsivFile);
        fd.append("ay", String(arsivAy));
        fd.append("yil", String(arsivYil));
        try {
            const r = await fetch("/api/bordro/arsiv/upload", { method: "POST", body: fd });
            const j = await r.json();
            if (!r.ok) throw new Error(j.error || "Yükleme hatası");
            toast({ title: "Arşivlendi", description: arsivFile.name });
            setArsivFile(null);
            fetchArsiv();
        } catch (e: any) {
            toast({ variant: "destructive", title: "Hata", description: e.message });
        } finally {
            setArsivBusy(false);
        }
    };

    const handleArsivDelete = async (id: string) => {
        if (!confirm("Arşiv kaydını silmek istiyor musun? (Çalışan verileri etkilenmez, sadece PDF dosyası silinir.)")) return;
        try {
            const r = await fetch(`/api/bordro/arsiv/${id}`, { method: "DELETE" });
            if (!r.ok) throw new Error("Silinemedi");
            fetchArsiv();
        } catch (e: any) {
            toast({ variant: "destructive", title: "Hata", description: e.message });
        }
    };

    // Tabloda gösterilecek brüt değeri
    const getDisplayBrut = (calisan: any): string => {
        return formatCurrency(calisan.brutUcret);
    };

    // Tabloda gösterilecek net değeri
    const getDisplayNet = (calisan: any): string => {
        return formatCurrency(calisan.netUcret);
    };

    const renderTable = (items: any[]) => (
        <div className="overflow-x-auto">
            <Table className="min-w-[1000px]">
                <TableHeader>
                    <TableRow className="hover:bg-transparent">
                        <TableHead className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">T.C. Kimlik No</TableHead>
                        <TableHead
                            className="cursor-pointer text-[10.5px] font-bold uppercase tracking-wide text-slate-500 transition-colors hover:text-slate-700"
                            onClick={() => handleSort('adSoyad')}
                        >
                            <span className="flex items-center gap-1.5">
                                Adı Soyadı
                                {sortConfig?.key === 'adSoyad' ? (
                                    sortConfig.direction === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                                ) : <ArrowUpDown className="h-3.5 w-3.5 opacity-30" />}
                            </span>
                        </TableHead>
                        <TableHead className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Statü</TableHead>
                        <TableHead className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">İşe Giriş</TableHead>
                        <TableHead className="text-right text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Hesaplanan Brüt</TableHead>
                        <TableHead className="text-right text-[10.5px] font-bold uppercase tracking-wide" style={{ color: '#16a34a' }}>Net Ücret</TableHead>
                        <TableHead className="text-right text-[10.5px] font-bold uppercase tracking-wide" style={{ color: '#ea580c' }}>İşçi SGK Payı</TableHead>
                        <TableHead className="text-right text-[10.5px] font-bold uppercase tracking-wide" style={{ color: '#7c3aed' }}>İşveren SGK</TableHead>
                        <TableHead className="text-right text-[10.5px] font-bold uppercase tracking-wide" style={{ color: '#dc2626' }}>Toplam Maliyet</TableHead>
                        <TableHead className="text-center text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Şube</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {items.map((person) => {
                        const statu = person.statu || 'NORMAL';
                        const statuColors: Record<string, [string, string]> = {
                            'YÖNETİCİ': ['#ede9fe', '#6d28d9'],
                            'EMEKLİ': ['#fef3c7', '#92400e'],
                            'NORMAL': ['#f1f5f9', '#475569'],
                        };
                        const [stBg, stFg] = statuColors[statu] || statuColors['NORMAL'];
                        return (
                            <TableRow key={person.id} className="hover:bg-slate-50">
                                <TableCell className="font-mono text-xs text-muted-foreground">{person.tcNo}</TableCell>
                                <TableCell
                                    className="cursor-pointer font-semibold text-slate-800 transition-colors hover:text-sky-600"
                                    onClick={() => openModal(person)}
                                >
                                    <span className="flex items-center gap-1.5">
                                        {person.adSoyad}
                                        <Info className="h-3 w-3 opacity-30" />
                                    </span>
                                </TableCell>
                                <TableCell>
                                    <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: stBg, color: stFg }}>
                                        {statu}
                                    </span>
                                </TableCell>
                                <TableCell className="text-sm text-slate-600">{person.isGirisTarihi || "-"}</TableCell>
                                <TableCell className="cursor-pointer text-right font-semibold tabular-nums" style={{ color: '#0284c7' }} onClick={() => handleBrutClick(person)}>
                                    {editingBrutId === person.id ? (
                                        <Input
                                            className="h-8 w-32 text-right font-bold"
                                            value={editingBrutVal}
                                            onChange={(e) => setEditingBrutVal(e.target.value)}
                                            autoFocus
                                            onBlur={() => handleBrutSave(person)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleBrutSave(person);
                                                if (e.key === 'Escape') setEditingBrutId(null);
                                            }}
                                        />
                                    ) : (
                                        formatCurrency(person.brutUcret)
                                    )}
                                </TableCell>
                                <TableCell className="cursor-pointer text-right font-bold tabular-nums" style={{ color: '#16a34a' }} onClick={() => handleNetClick(person)}>
                                    {editingNetId === person.id ? (
                                        <Input
                                            className="h-8 w-32 text-right font-bold text-green-600"
                                            value={editingNetVal}
                                            onChange={(e) => setEditingNetVal(e.target.value)}
                                            autoFocus
                                            onBlur={() => handleNetSave(person)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleNetSave(person);
                                                if (e.key === 'Escape') setEditingNetId(null);
                                            }}
                                        />
                                    ) : (
                                        getDisplayNet(person)
                                    )}
                                </TableCell>
                                <TableCell className="text-right font-semibold tabular-nums" style={{ color: '#ea580c' }}>
                                    {formatCurrency(person.sigortaKesintisi)}
                                </TableCell>
                                <TableCell className="text-right font-semibold tabular-nums" style={{ color: '#7c3aed' }}>
                                    {formatCurrency(person.isverenSgkPayi)}
                                </TableCell>
                                <TableCell className="text-right font-bold tabular-nums" style={{ color: '#dc2626' }}>
                                    {formatCurrency(parseFloat(person.brutUcret || "0") + parseFloat(person.isverenSgkPayi || "0"))}
                                </TableCell>
                                <TableCell className="text-center">
                                    <Select
                                        value={person.sube || "Merkez"}
                                        onValueChange={(newVal) => {
                                            // Optimistic update
                                            const newData = [...data];
                                            const index = newData.findIndex(p => p.id === person.id);
                                            if (index > -1) {
                                                newData[index] = { ...newData[index], sube: newVal };
                                                setData(newData);
                                            }

                                            // API Call
                                            fetch(`/api/calisanlar/${person.id}`, {
                                                method: 'PATCH',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ sube: newVal })
                                            }).then(res => {
                                                if (!res.ok) {
                                                    toast({ variant: "destructive", title: "Hata", description: "Şube güncellenemedi" });
                                                    // Revert if needed, but for now simple error toast
                                                } else {
                                                    toast({ title: "Başarılı", description: "Şube güncellendi" });
                                                }
                                            }).catch(err => {
                                                console.error(err);
                                                toast({ variant: "destructive", title: "Hata", description: "Bağlantı hatası" });
                                            });
                                        }}
                                    >
                                        <SelectTrigger className="mx-auto h-8 w-[130px] justify-center border-none bg-transparent font-semibold text-sky-600 hover:bg-slate-100">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {subeler.map(s => (
                                                <SelectItem key={s} value={s}>{s}</SelectItem>
                                            ))}
                                            <SelectItem value="Merkez">Merkez</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
                <TableFooter>
                    <TableRow className="bg-slate-50 hover:bg-slate-50">
                        <TableCell colSpan={4} className="text-right font-black text-sky-700">GENEL TOPLAM</TableCell>
                        <TableCell className="text-right font-black tabular-nums" style={{ color: '#0284c7' }}>{formatCurrency(stats.toplamBrut)}</TableCell>
                        <TableCell className="text-right font-black tabular-nums" style={{ color: '#16a34a' }}>{formatCurrency(stats.toplamNet)}</TableCell>
                        <TableCell className="text-right font-black tabular-nums" style={{ color: '#ea580c' }}>{formatCurrency(stats.toplamSigortaKesintisi)}</TableCell>
                        <TableCell className="text-right font-black tabular-nums" style={{ color: '#7c3aed' }}>{formatCurrency(stats.toplamIsverenPayi)}</TableCell>
                        <TableCell className="text-right font-black tabular-nums" style={{ color: '#dc2626' }}>{formatCurrency(stats.toplamIsverenMaliyeti)}</TableCell>
                        <TableCell></TableCell>
                    </TableRow>
                </TableFooter>
            </Table>
        </div>
    );

    // KPI kart tanımları (accent-bar) — değerler mevcut stats objesinden gelir
    const kpis = [
        { label: "Aktif Personel", value: String(stats.toplamPersonel), sub: "bordrolu personel", color: "#0ea5e9" },
        { label: "Genel Net Toplam", value: formatCurrency(stats.toplamNet), sub: "ödenen net", color: "#16a34a" },
        { label: "Genel Brüt Toplam", value: formatCurrency(stats.toplamBrut), sub: "hesaplanan brüt", color: "#0284c7" },
        { label: "Toplam İşveren Payı", value: formatCurrency(stats.toplamIsverenPayi), sub: "SGK + işsizlik", color: "#7c3aed" },
        { label: "Toplam İşveren Maliyeti", value: formatCurrency(stats.toplamIsverenMaliyeti), sub: "brüt + işveren payı", color: "#dc2626" },
    ];

    const donemLabel = selectedAy === "toplam"
        ? `${selectedYil} Yıllık Toplam`
        : `${ayNumarasiToAd(parseInt(selectedAy))} ${selectedYil}`;

    return (
        <div className="min-h-full bg-slate-50 dark:bg-background">
            <div className="px-6 pb-12 lg:px-8">
                {/* ===== STICKY HEADER + TAB BAR ===== */}
                <div className="sticky top-0 z-20 border-b border-border/70 bg-slate-50/90 pt-5 backdrop-blur dark:bg-background/90">
                    <div className="flex flex-wrap items-end justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400">
                                <Users className="h-[22px] w-[22px]" strokeWidth={1.8} />
                            </div>
                            <div>
                                <h1 className="text-[21px] font-extrabold tracking-tight">Personel Portalı</h1>
                                <p className="mt-0.5 text-[12.5px] text-muted-foreground">Şirket personeli genel listesi, maaş ve izin yönetimi</p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            {/* Yıl / Ay seçici */}
                            <div className="flex items-center gap-2 rounded-[11px] border bg-card p-1.5 shadow-sm">
                                <Select value={String(selectedYil)} onValueChange={(val) => setSelectedYil(parseInt(val))}>
                                    <SelectTrigger className="h-[34px] w-[92px]"><SelectValue placeholder="Yıl" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="2024">2024</SelectItem>
                                        <SelectItem value="2025">2025</SelectItem>
                                        <SelectItem value="2026">2026</SelectItem>
                                        <SelectItem value="2027">2027</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Select value={selectedAy} onValueChange={setSelectedAy}>
                                    <SelectTrigger className="h-[34px] w-[148px]">
                                        <Calendar className="mr-1.5 h-4 w-4" />
                                        <SelectValue placeholder="Dönem" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(ay => (
                                            <SelectItem key={ay} value={String(ay)}>{ayNumarasiToAd(ay)}</SelectItem>
                                        ))}
                                        <SelectItem value="toplam" className="mt-1 border-t pt-2 font-bold">📊 Yıllık Toplam</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Maaşlar sekmesine özel kontroller: arama, şube filtresi, 3 yükleme butonu */}
                            {activeTab === "maaslar" && (
                                <>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                        <Input
                                            placeholder="İsim veya TC ile ara..."
                                            className="h-[38px] w-[210px] rounded-[9px] pl-9 text-[13px]"
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                        />
                                    </div>

                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="outline" className="h-[38px] w-[150px] justify-between rounded-[9px] font-normal">
                                                <span className="flex items-center">
                                                    <Filter className="mr-2 h-4 w-4" />
                                                    {selectedSubeler.length === 0 ? "Tüm Şubeler" : `${selectedSubeler.length} Şube`}
                                                </span>
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent className="w-56" align="end">
                                            <DropdownMenuLabel>Şubeler</DropdownMenuLabel>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuCheckboxItem
                                                checked={selectedSubeler.length === 0}
                                                onCheckedChange={(checked) => {
                                                    if (checked) setSelectedSubeler([]);
                                                }}
                                            >
                                                Tüm Şubeler
                                            </DropdownMenuCheckboxItem>
                                            {subeler.map((s) => (
                                                <DropdownMenuCheckboxItem
                                                    key={s}
                                                    checked={selectedSubeler.includes(s)}
                                                    onCheckedChange={(checked) => {
                                                        if (checked) {
                                                            setSelectedSubeler([...selectedSubeler, s]);
                                                        } else {
                                                            setSelectedSubeler(selectedSubeler.filter((item) => item !== s));
                                                        }
                                                    }}
                                                >
                                                    {s}
                                                </DropdownMenuCheckboxItem>
                                            ))}
                                        </DropdownMenuContent>
                                    </DropdownMenu>

                                    <Button
                                        onClick={() => setPusulaOpen(true)}
                                        className="h-[38px] rounded-[9px] border-0 bg-emerald-600 text-white hover:bg-emerald-700"
                                        title="Ücret Pusulası PDF yükle — tüm değerler belgeden okunur"
                                    >
                                        <FileUp className="mr-2 h-4 w-4" />
                                        Bordro Yükle
                                    </Button>
                                    <Button
                                        onClick={() => setArsivOpen(true)}
                                        variant="outline"
                                        className="h-[38px] rounded-[9px]"
                                        title="Yüklenmiş PDF arşivi — denetim için saklanır, indirilebilir"
                                    >
                                        <FileText className="mr-2 h-4 w-4" />
                                        Arşiv
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Tab barı — aktif tab inset alt çizgi */}
                    <div className="mt-3.5 flex gap-1">
                        {([
                            { id: "maaslar", label: "Maaşlar", Icon: Wallet },
                            { id: "izinler", label: "İzinler", Icon: Calendar },
                        ] as const).map((t) => (
                            <button
                                key={t.id}
                                onClick={() => setActiveTab(t.id)}
                                className={cn(
                                    "inline-flex items-center gap-2 rounded-t-lg px-3.5 py-2.5 text-[13.5px] transition-colors",
                                    activeTab === t.id
                                        ? "font-bold text-foreground shadow-[inset_0_-2px_0_#0ea5e9]"
                                        : "font-semibold text-muted-foreground hover:text-foreground"
                                )}
                            >
                                <t.Icon className="h-4 w-4" />
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ===================== MAAŞLAR ===================== */}
                {activeTab === "maaslar" && (
                    <div className="mt-5 space-y-4">
                        {/* 5 KPI kartı — accent-bar */}
                        <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 lg:grid-cols-5">
                            {kpis.map((k) => (
                                <div key={k.label} className="relative overflow-hidden rounded-[14px] border bg-card p-4">
                                    <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: k.color }} />
                                    <div className="pl-2 text-[10.5px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">{k.label}</div>
                                    <div className="mt-2 pl-2 text-[21px] font-extrabold tracking-tight tabular-nums">{k.value}</div>
                                    <div className="mt-0.5 pl-2 text-[11.5px] text-muted-foreground">{k.sub}</div>
                                </div>
                            ))}
                        </div>

                        {/* Maaş Listesi tablosu */}
                        <div className="overflow-hidden rounded-[14px] border bg-card">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
                                <div>
                                    <h3 className="text-[15px] font-bold">Maaş Listesi</h3>
                                    <p className="text-xs text-muted-foreground">Net veya brüt ücrete tıklayarak düzenle · SGK ve maliyet arkada yeniden hesaplanır</p>
                                </div>
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-[12px] font-bold text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                                    <Calendar className="h-3.5 w-3.5" />
                                    {donemLabel}
                                </span>
                            </div>
                            {loading ? (
                                <div className="flex flex-col items-center justify-center gap-3 py-20">
                                    <Loader2 className="h-9 w-9 animate-spin text-sky-500" />
                                    <p className="text-sm font-semibold text-muted-foreground">Personel verileri yükleniyor...</p>
                                </div>
                            ) : (
                                renderTable(sortedAndFilteredData)
                            )}
                        </div>
                    </div>
                )}

                {/* ===================== İZİNLER ===================== */}
                {activeTab === "izinler" && (
                    <div className="mt-5">
                        <Tabs defaultValue="takvim" className="w-full">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <TabsList>
                                    <TabsTrigger value="takvim">Aylık Takvim</TabsTrigger>
                                    <TabsTrigger value="liste">İzin Listesi</TabsTrigger>
                                    <TabsTrigger value="bakiye">Bakiye Yönetimi</TabsTrigger>
                                </TabsList>
                                <Button
                                    onClick={() => { setIzinModalTcNo(null); setIzinModalEdit(null); setIzinModalDefaultDate(null); setIzinModalOpen(true); }}
                                    className="h-[38px] rounded-[9px] bg-slate-900 text-white hover:bg-slate-800"
                                >
                                    <Plus className="mr-2 h-4 w-4" />
                                    Yeni İzin
                                </Button>
                            </div>
                            <TabsContent value="takvim" className="mt-4">
                                <IzinTakvimi
                                    onYeniIzin={(tcNo, tarih) => { setIzinModalTcNo(tcNo); setIzinModalDefaultDate(tarih); setIzinModalEdit(null); setIzinModalOpen(true); }}
                                    onDuzenle={(izin) => { setIzinModalEdit(izin); setIzinModalTcNo(null); setIzinModalDefaultDate(null); setIzinModalOpen(true); }}
                                />
                            </TabsContent>
                            <TabsContent value="liste" className="mt-4">
                                <IzinListesi
                                    onYeniEkle={() => { setIzinModalTcNo(null); setIzinModalEdit(null); setIzinModalDefaultDate(null); setIzinModalOpen(true); }}
                                    onDuzenle={(izin) => { setIzinModalEdit(izin); setIzinModalTcNo(null); setIzinModalDefaultDate(null); setIzinModalOpen(true); }}
                                />
                            </TabsContent>
                            <TabsContent value="bakiye" className="mt-4">
                                <IzinBakiye onYeniIzin={(tcNo) => { setIzinModalTcNo(tcNo); setIzinModalEdit(null); setIzinModalDefaultDate(null); setIzinModalOpen(true); }} />
                            </TabsContent>
                        </Tabs>
                    </div>
                )}
            </div>

            {/* Detaylı Hesaplama Modal */}
            <Dialog open={!!selectedPerson} onOpenChange={(open) => !open && setSelectedPerson(null)}>
                <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto bg-card/95 backdrop-blur-2xl border-white/10 shadow-2xl rounded-3xl p-0">
                    {selectedPerson && (
                        <div className="relative">
                            <div className="h-24 bg-gradient-to-br from-primary/20 via-blue-500/10 to-transparent"></div>
                            <div className="px-6 pb-6 -mt-8">
                                {/* Header */}
                                <div className="flex items-end gap-4 mb-6">
                                    <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center text-white shadow-xl shadow-primary/30 border-2 border-background">
                                        <User className="w-8 h-8" />
                                    </div>
                                    <div className="flex-1 pb-1">
                                        <h2 className="text-2xl font-black tracking-tight">{selectedPerson.adSoyad}</h2>
                                        <div className="flex items-center gap-2 mt-1">
                                            <Badge variant="outline" className="font-bold border-primary/30 text-primary text-xs">{selectedPerson.sube || "Bursa"}</Badge>
                                            <Badge
                                                className={`font-bold text-[10px] ${isYonetici ? 'bg-purple-500/10 text-purple-600' :
                                                    isEmekli ? 'bg-orange-500/10 text-orange-600' :
                                                        'bg-green-500/10 text-green-600'
                                                    }`}
                                            >
                                                {selectedPerson.statu || 'NORMAL'}
                                            </Badge>
                                        </div>
                                    </div>
                                </div>

                                {/* Dönem Seçici Kaldırıldı - Ana ekrandan seçilen dönem geçerli */}

                                {selectedPerson ? (
                                    <div className="space-y-4">
                                        {/* Maaş Bilgileri */}
                                        <div className="p-4 bg-blue-500/5 rounded-xl border border-blue-500/10">
                                            <h4 className="text-xs font-bold uppercase text-blue-600 mb-3 flex items-center gap-2">
                                                <Calculator className="w-4 h-4" />
                                                Maaş Bilgileri - {ayNumarasiToAd(parseInt(selectedPerson.ay || selectedAy))} {selectedYil}
                                            </h4>
                                            <div className="grid grid-cols-2 gap-2 text-sm">
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">Brüt Ücret:</span>
                                                    <span className="font-bold text-blue-600">{formatCurrency(selectedPerson.brutUcret)}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">Net Ücret:</span>
                                                    <span className="font-bold text-green-600">{formatCurrency(selectedPerson.netUcret)}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">SGK Matrahı:</span>
                                                    <span className="font-medium">{formatCurrency(selectedPerson.sgkMatrahi)}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">GV Matrahı:</span>
                                                    <span className="font-medium">{formatCurrency(selectedPerson.gelirVergisiMatrahi)}</span>
                                                </div>
                                                <div className="col-span-2 flex justify-between pt-1 border-t border-blue-500/10">
                                                    <span className="text-muted-foreground">Kümülatif GV Matrahı:</span>
                                                    <span className="font-bold">{formatCurrency(selectedPerson.kumulatifVergiMatrahi)}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* İşçi Kesintileri */}
                                        <div className="p-4 bg-red-500/5 rounded-xl border border-red-500/10">
                                            <h4 className="text-xs font-bold uppercase text-red-600 mb-3">İşçi Kesintileri</h4>
                                            <div className="space-y-1 text-sm">
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">SGK İşçi:</span>
                                                    <span className="font-bold">{formatCurrency(selectedPerson.sigortaKesintisi)}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">İşsizlik İşçi:</span>
                                                    <span className="font-bold">{formatCurrency(selectedPerson.issizlikSigortasiKesintisi)}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">Gelir Vergisi:</span>
                                                    <span className="font-bold">{formatCurrency(selectedPerson.gelirVergisi)}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">Damga Vergisi:</span>
                                                    <span className="font-bold">{formatCurrency(selectedPerson.damgaVergisi)}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* İşveren Maliyetleri */}
                                        <div className="p-4 bg-purple-500/5 rounded-xl border border-purple-500/10">
                                            <h4 className="text-xs font-bold uppercase text-purple-600 mb-3">İşveren Maliyetleri</h4>
                                            <div className="space-y-1 text-sm">
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">SGK İşveren:</span>
                                                    <span className="font-bold">{formatCurrency(selectedPerson.isverenSgkPayi)}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">İşsizlik İşveren:</span>
                                                    <span className="font-bold">{formatCurrency(selectedPerson.isverenIssizlikPayi)}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Toplam İşveren Maliyeti */}
                                        <div className="p-4 bg-gradient-to-r from-primary/10 to-blue-500/10 rounded-xl border border-primary/20">
                                            <div className="flex justify-between items-center">
                                                <span className="text-lg font-bold">💰 TOPLAM İŞVEREN MALİYETİ:</span>
                                                <span className="text-2xl font-black text-primary">{formatCurrency(parseFloat(selectedPerson.brutUcret || "0") + parseFloat(selectedPerson.isverenSgkPayi || "0"))}</span>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center py-8 text-muted-foreground">
                                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                                        Hesaplama yükleniyor...
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* ============================================================ */}
            {/* BORDRO YÜKLE — ÜCRET PUSULASI DIALOG (tek yükleme akışı) */}
            {/* ============================================================ */}
            <Dialog open={pusulaOpen} onOpenChange={(o) => {
                setPusulaOpen(o);
                if (!o) { setPusulaFile(null); setPusulaPreview(null); }
            }}>
                <DialogContent className="sm:max-w-[1250px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FileUp className="w-5 h-5 text-emerald-600" />
                            Bordro Yükle — Ücret Pusulası PDF
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 text-sm">
                            <div className="flex items-start gap-2">
                                <Info className="w-4 h-4 mt-0.5 text-blue-500 shrink-0" />
                                <div className="text-muted-foreground">
                                    <strong>"ÜCRET BORDROSU, PUANTAJ CETVELİ ve ÜCRET PUSULASI"</strong> başlıklı,
                                    her sayfada 1 çalışan olan PDF'i yükleyin. Brüt, net, vergiler ve kesintiler
                                    doğrudan belgeden okunur; ay/yıl, şube ve statü otomatik tespit edilir.
                                    İşveren SGK payı sigorta matrahı ile belgedeki teşvik tutarından hesaplanır.
                                </div>
                            </div>
                        </div>

                        <div className="flex items-end gap-3 p-4 border rounded-xl bg-muted/20">
                            <div className="flex-1 space-y-2">
                                <Label>PDF Dosyası</Label>
                                <Input
                                    type="file"
                                    accept=".pdf"
                                    onChange={(e) => { setPusulaFile(e.target.files?.[0] || null); setPusulaPreview(null); }}
                                />
                            </div>
                            <Button disabled={!pusulaFile || pusulaBusy} onClick={handlePusulaUpload}>
                                {pusulaBusy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileUp className="w-4 h-4 mr-2" />}
                                Önizle
                            </Button>
                        </div>

                        {pusulaPreview && (
                            <>
                                {pusulaPreview.atlananSayfalar?.length > 0 && (
                                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm">
                                        <div className="flex items-start gap-2">
                                            <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-600 shrink-0" />
                                            <div>
                                                <div className="font-semibold text-amber-700">
                                                    {pusulaPreview.atlananSayfalar.length} sayfa okunamadı — bu kişiler kaydedilmeyecek:
                                                </div>
                                                <ul className="mt-1 text-muted-foreground list-disc list-inside">
                                                    {pusulaPreview.atlananSayfalar.map((a: any) => (
                                                        <li key={a.sayfaNo}>Sayfa {a.sayfaNo}: {a.sebep}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <Card className="p-4 bg-muted/30">
                                    <div className="font-bold mb-2 flex items-center gap-2">
                                        <Calculator className="w-4 h-4" />
                                        Şube Özeti — {ayNumarasiToAd(pusulaPreview.ay)} {pusulaPreview.yil}
                                    </div>
                                    <Table className="text-sm">
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Şube</TableHead>
                                                <TableHead className="text-right">Kişi</TableHead>
                                                <TableHead className="text-right">Net Toplam</TableHead>
                                                <TableHead className="text-right">Brüt Toplam</TableHead>
                                                <TableHead className="text-right">İşveren Maliyeti</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {Object.entries(pusulaPreview.subeOzet).map(([sube, o]: any) => (
                                                <TableRow key={sube}>
                                                    <TableCell className="font-medium">{sube}</TableCell>
                                                    <TableCell className="text-right tabular-nums">{o.kisi}</TableCell>
                                                    <TableCell className="text-right tabular-nums text-green-600">{formatCurrency(o.net)}</TableCell>
                                                    <TableCell className="text-right tabular-nums text-blue-600">{formatCurrency(o.brut)}</TableCell>
                                                    <TableCell className="text-right tabular-nums font-semibold text-red-600">{formatCurrency(o.isverenMaliyeti)}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                        <TableFooter>
                                            <TableRow>
                                                <TableCell className="font-bold">TOPLAM</TableCell>
                                                <TableCell className="text-right tabular-nums font-bold">{pusulaPreview.toplamKisi}</TableCell>
                                                <TableCell className="text-right tabular-nums font-bold text-green-700">{formatCurrency(pusulaPreview.toplamNet)}</TableCell>
                                                <TableCell className="text-right tabular-nums font-bold text-blue-700">{formatCurrency(pusulaPreview.toplamBrut)}</TableCell>
                                                <TableCell className="text-right tabular-nums font-bold text-red-700">{formatCurrency(pusulaPreview.toplamIsverenMaliyeti)}</TableCell>
                                            </TableRow>
                                        </TableFooter>
                                    </Table>
                                </Card>

                                <div className="border rounded-xl overflow-hidden">
                                    <div className="p-2 bg-yellow-500/10 border-b border-yellow-500/20 text-yellow-700 text-sm font-semibold flex items-center gap-2">
                                        <Info className="w-4 h-4" />
                                        Bu veriler henüz kaydedilmedi. Detayları kontrol edip "Kaydet"e bas.
                                    </div>
                                    <div className="max-h-[400px] overflow-auto">
                                        <Table className="text-xs">
                                            <TableHeader className="bg-muted sticky top-0">
                                                <TableRow>
                                                    <TableHead>Ad Soyad</TableHead>
                                                    <TableHead>Şube</TableHead>
                                                    <TableHead>Statü</TableHead>
                                                    <TableHead className="text-right">Brüt</TableHead>
                                                    <TableHead className="text-right">Net</TableHead>
                                                    <TableHead className="text-right">Gelir V.</TableHead>
                                                    <TableHead className="text-right">İşçi SGK</TableHead>
                                                    <TableHead className="text-right">İşv. SGK</TableHead>
                                                    <TableHead className="text-right">Maliyet</TableHead>
                                                    <TableHead>✓</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {pusulaPreview.onizleme.map((r: any, i: number) => (
                                                    <TableRow key={i}>
                                                        <TableCell className="font-medium">{r.adSoyad}</TableCell>
                                                        <TableCell><Badge variant="outline" className="text-[10px]">{r.sube}</Badge></TableCell>
                                                        <TableCell><Badge variant={r.statu === "YÖNETİCİ" ? "default" : "outline"} className="text-[10px]">{r.statu}</Badge></TableCell>
                                                        <TableCell className="text-right tabular-nums text-blue-600">{formatCurrency(r.brutToplam)}</TableCell>
                                                        <TableCell className="text-right tabular-nums text-green-600 font-semibold">{formatCurrency(r.netUcret)}</TableCell>
                                                        <TableCell className="text-right tabular-nums text-slate-600">{formatCurrency(r.gelirVergisi)}</TableCell>
                                                        <TableCell className="text-right tabular-nums text-orange-600">{formatCurrency(r.sgkIsciPrimi)}</TableCell>
                                                        <TableCell className="text-right tabular-nums text-purple-600">{formatCurrency(r.isverenSgkPayi)}</TableCell>
                                                        <TableCell className="text-right tabular-nums text-red-600 font-semibold">{formatCurrency(r.toplamIsverenMaliyeti)}</TableCell>
                                                        <TableCell>
                                                            {r.uyarilar?.length > 0 ? (
                                                                <span title={r.uyarilar.join("\n")}>
                                                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                                                                </span>
                                                            ) : (
                                                                <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                    <div className="p-3 border-t bg-muted/20 flex justify-between items-center">
                                        <div className="text-sm text-muted-foreground">
                                            <strong>{pusulaPreview.toplamKisi}</strong> kişi · Net Toplam: <strong>{formatCurrency(pusulaPreview.toplamNet)}</strong>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button variant="outline" onClick={() => { setPusulaPreview(null); setPusulaFile(null); }}>İptal</Button>
                                            <Button onClick={handlePusulaSave} disabled={pusulaBusy} className="bg-emerald-600 hover:bg-emerald-700">
                                                {pusulaBusy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                                Kaydet ({pusulaPreview.toplamKisi} kişi)
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* ============================================================ */}
            {/* BORDRO ARŞİV DIALOG (sadece dosya saklama) */}
            {/* ============================================================ */}
            <Dialog open={arsivOpen} onOpenChange={setArsivOpen}>
                <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FileText className="w-5 h-5 text-blue-500" />
                            Bordro PDF Arşivi
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 text-sm">
                            <div className="flex items-start gap-2">
                                <Info className="w-4 h-4 mt-0.5 text-blue-500 shrink-0" />
                                <div className="text-muted-foreground">
                                    Detaylı Ücret Bordrosu PDF'lerini buraya yükleyin. <strong>Parse edilmez</strong>, sadece denetim ve kanıt amaçlı saklanır. İstediğiniz zaman indirebilir veya silebilirsiniz.
                                </div>
                            </div>
                        </div>

                        <Card className="p-4 space-y-3">
                            <Label>Yeni Arşiv Yükle</Label>
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                                <div className="md:col-span-3">
                                    <Label className="text-xs">Ay</Label>
                                    <Select value={String(arsivAy)} onValueChange={(v) => setArsivAy(parseInt(v))}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(a => (
                                                <SelectItem key={a} value={String(a)}>{ayNumarasiToAd(a)}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="md:col-span-2">
                                    <Label className="text-xs">Yıl</Label>
                                    <Select value={String(arsivYil)} onValueChange={(v) => setArsivYil(parseInt(v))}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {[2024, 2025, 2026, 2027].map(y => (
                                                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="md:col-span-5">
                                    <Label className="text-xs">PDF Dosyası</Label>
                                    <Input type="file" accept=".pdf" onChange={(e) => setArsivFile(e.target.files?.[0] || null)} />
                                </div>
                                <div className="md:col-span-2 flex items-end">
                                    <Button className="w-full" disabled={!arsivFile || arsivBusy} onClick={handleArsivUpload}>
                                        {arsivBusy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                                        Yükle
                                    </Button>
                                </div>
                            </div>
                        </Card>

                        <div className="border rounded-xl overflow-hidden">
                            <div className="p-2 bg-muted text-sm font-semibold flex items-center gap-2">
                                <History className="w-4 h-4" />
                                Yüklü Arşivler ({arsivList.length})
                            </div>
                            {arsivList.length === 0 ? (
                                <div className="p-8 text-center text-muted-foreground">
                                    <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                    Henüz arşivlenmiş bordro yok
                                </div>
                            ) : (
                                <Table className="text-sm">
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Dosya</TableHead>
                                            <TableHead>Tip</TableHead>
                                            <TableHead>Dönem</TableHead>
                                            <TableHead>Yükleme</TableHead>
                                            <TableHead className="text-right">Boyut</TableHead>
                                            <TableHead className="text-right">İşlem</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {arsivList.map((d: any) => {
                                            const tarih = d.uploadDate ? new Date(d.uploadDate).toLocaleString("tr-TR") : "-";
                                            const boyut = d.sizeBytes
                                                ? d.sizeBytes < 1024 * 1024
                                                    ? `${(d.sizeBytes / 1024).toFixed(0)} KB`
                                                    : `${(d.sizeBytes / 1024 / 1024).toFixed(2)} MB`
                                                : "-";
                                            return (
                                                <TableRow key={d.id}>
                                                    <TableCell className="font-medium truncate max-w-[280px]" title={d.filename}>{d.filename}</TableCell>
                                                    <TableCell>
                                                        <Badge variant={d.tip === "pusula" || d.tip === "maas-listesi" ? "default" : "outline"}>
                                                            {d.tip === "pusula" ? "Pusula" : d.tip === "maas-listesi" ? "Maaş Listesi" : "Bordro"}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>{d.ay && d.yil ? `${ayNumarasiToAd(d.ay)} ${d.yil}` : "-"}</TableCell>
                                                    <TableCell className="text-xs text-muted-foreground">{tarih}</TableCell>
                                                    <TableCell className="text-right tabular-nums">{boyut}</TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex justify-end gap-1">
                                                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => window.open(`/api/bordro/arsiv/${d.id}/download`, "_blank")} title="İndir">
                                                                <Download className="w-3.5 h-3.5" />
                                                            </Button>
                                                            <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600 hover:text-red-700" onClick={() => handleArsivDelete(d.id)} title="Sil">
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            )}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* İzin Ekle/Düzenle Modal (3 sekmeden de açılır) */}
            <IzinEkleModal
              open={izinModalOpen}
              onClose={() => { setIzinModalOpen(false); setIzinModalTcNo(null); setIzinModalEdit(null); setIzinModalDefaultDate(null); }}
              defaultTcNo={izinModalTcNo}
              defaultDate={izinModalDefaultDate}
              editIzin={izinModalEdit}
            />
        </div>
    );
}

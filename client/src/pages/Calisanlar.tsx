import { useState, useEffect, useMemo } from "react";
import { BackgroundPaths } from "@/components/BackgroundPaths";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Users, Wallet, Loader2, Search, Building2, TrendingUp, Filter, User, Info, Calendar, Hash, ArrowUpDown, ArrowUp, ArrowDown, Calculator, Percent, AlertCircle, Banknote, Upload, Save, X, FileText, Download, Trash2, FileUp, CheckCircle2, AlertTriangle, History } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { subeler } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IzinBakiye } from "@/components/IzinBakiye";
import { IzinListesi } from "@/components/IzinListesi";
import { IzinEkleModal } from "@/components/IzinEkleModal";
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




    // Upload Dialog State (eski Bordro Yükle — Excel/PDF heuristic)
    const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [previewData, setPreviewData] = useState<any[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Maaş Listesi PDF parse state'leri (yeni, sağlam yöntem)
    const [maasListesiOpen, setMaasListesiOpen] = useState(false);
    const [maasListesiFile, setMaasListesiFile] = useState<File | null>(null);
    const [maasListesiPreview, setMaasListesiPreview] = useState<any | null>(null);
    const [maasListesiBusy, setMaasListesiBusy] = useState(false);

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

    // File Upload Handler
    const handleFileUpload = async () => {
        if (!uploadedFile) return;

        setIsUploading(true);
        const formData = new FormData();
        formData.append("excel", uploadedFile);
        formData.append("ay", selectedAy);

        try {
            const response = await fetch("/api/bordro/upload", {
                method: "POST",
                body: formData
            });

            if (!response.ok) throw new Error("Yükleme başarısız");

            const data = await response.json();
            setPreviewData(data);
        } catch (error) {
            console.error(error);
            toast({ variant: "destructive", title: "Hata", description: "Dosya yüklenirken hata oluştu" });
        } finally {
            setIsUploading(false);
        }
    };

    const handleSaveBordro = async () => {
        if (previewData.length === 0) return;

        setIsSaving(true);
        try {
            const response = await fetch("/api/bordro/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ay: selectedAy === "toplam" ? "1" : selectedAy,
                    yil: selectedYil,
                    data: previewData
                })
            });

            if (!response.ok) throw new Error("Kaydetme başarısız");

            toast({ title: "Başarılı", description: "Bordro kaydedildi." });
            setUploadDialogOpen(false);
            setUploadedFile(null);
            setPreviewData([]);
            fetchCalisanlar();
        } catch (error) {
            console.error(error);
            toast({ variant: "destructive", title: "Hata", description: "Kaydedilirken hata oluştu" });
        } finally {
            setIsSaving(false);
        }
    };

    // ========================================================================
    // MAAŞ LİSTESİ PDF (yeni sağlam yöntem)
    // ========================================================================

    const handleMaasListesiUpload = async () => {
        if (!maasListesiFile) return;
        setMaasListesiBusy(true);
        setMaasListesiPreview(null);
        const fd = new FormData();
        fd.append("pdf", maasListesiFile);
        try {
            const res = await fetch("/api/bordro/maas-listesi/upload", { method: "POST", body: fd });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Önizleme hatası");
            setMaasListesiPreview(json);
            toast({ title: "Parse başarılı", description: `${json.toplamKisi} kişi okundu — ${ayNumarasiToAd(json.ay)} ${json.yil}` });
        } catch (err: any) {
            toast({ variant: "destructive", title: "Hata", description: err.message });
        } finally {
            setMaasListesiBusy(false);
        }
    };

    const handleMaasListesiSave = async () => {
        if (!maasListesiPreview || !maasListesiFile) return;
        setMaasListesiBusy(true);
        const fd = new FormData();
        fd.append("pdf", maasListesiFile);
        fd.append("payload", JSON.stringify({
            ay: maasListesiPreview.ay,
            yil: maasListesiPreview.yil,
            kayitlar: maasListesiPreview.onizleme,
        }));
        try {
            const res = await fetch("/api/bordro/maas-listesi/save", { method: "POST", body: fd });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Kaydetme hatası");
            toast({
                title: "Kaydedildi",
                description: `${json.inserted} yeni, ${json.updated} güncelleme — toplam ${json.toplam} kayıt`,
            });
            setMaasListesiOpen(false);
            setMaasListesiFile(null);
            setMaasListesiPreview(null);
            // Eğer yüklenen ay/yıl şu an ekrandaysa veriyi tazele
            if (maasListesiPreview.ay === parseInt(selectedAy) && maasListesiPreview.yil === selectedYil) {
                fetchCalisanlar();
            }
        } catch (err: any) {
            toast({ variant: "destructive", title: "Hata", description: err.message });
        } finally {
            setMaasListesiBusy(false);
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
        <Table>
            <TableHeader className="bg-muted/30">
                <TableRow>
                    <TableHead className="font-bold py-4">T.C. Kimlik No</TableHead>
                    <TableHead
                        className="font-bold py-4 text-primary cursor-pointer hover:bg-primary/5 transition-colors"
                        onClick={() => handleSort('adSoyad')}
                    >
                        <div className="flex items-center gap-2">
                            Adı Soyadı
                            {sortConfig?.key === 'adSoyad' ? (
                                sortConfig.direction === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                            ) : <ArrowUpDown className="w-4 h-4 opacity-30" />}
                        </div>
                    </TableHead>
                    <TableHead className="font-bold py-4">Statü</TableHead>
                    <TableHead className="font-bold py-4">İşe Giriş</TableHead>
                    <TableHead className="font-bold py-4 text-right">Hesaplanan Brüt</TableHead>
                    <TableHead className="font-bold py-4 text-right text-green-600">Net Ücret</TableHead>
                    <TableHead className="font-bold py-4 text-right text-orange-600">İşçi SGK Payı</TableHead>
                    <TableHead className="font-bold py-4 text-right text-purple-600">İşveren SGK</TableHead>
                    <TableHead className="font-bold py-4 text-right text-red-600">Toplam Maliyet</TableHead>
                    <TableHead className="font-bold py-4 text-center">Şube</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {items.map((person) => (
                    <TableRow key={person.id} className="hover:bg-primary/5 transition-colors border-border/40">
                        <TableCell className="font-mono text-sm text-muted-foreground">{person.tcNo}</TableCell>
                        <TableCell
                            className="font-bold text-base cursor-pointer hover:text-primary transition-colors flex items-center gap-2"
                            onClick={() => openModal(person)}
                        >
                            {person.adSoyad}
                            <Info className="w-3 h-3 opacity-30" />
                        </TableCell>
                        <TableCell>
                            <Badge
                                className={`
                                    font-bold text-[10px] uppercase px-2 py-0.5 rounded-full
                                    ${person.statu === 'NORMAL' ? 'bg-green-500/10 text-green-600 border-green-500/20' :
                                        person.statu === 'EMEKLİ' ? 'bg-orange-500/10 text-orange-600 border-orange-500/20' :
                                            'bg-purple-500/10 text-purple-600 border-purple-500/20'}
                                `}
                                variant="outline"
                            >
                                {person.statu || 'NORMAL'}
                            </Badge>
                        </TableCell>
                        <TableCell className="text-sm font-medium">{person.isGirisTarihi || "-"}</TableCell>
                        <TableCell className="text-right font-bold text-blue-600/80 cursor-pointer" onClick={() => handleBrutClick(person)}>
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
                        <TableCell className="text-right font-black text-green-600 text-base cursor-pointer" onClick={() => handleNetClick(person)}>
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
                        <TableCell className="text-right font-bold text-orange-600/80">
                            {formatCurrency(person.sigortaKesintisi)}
                        </TableCell>
                        <TableCell className="text-right font-bold text-purple-600/80">
                            {formatCurrency(person.isverenSgkPayi)}
                        </TableCell>
                        <TableCell className="text-right font-black text-red-600">
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
                                <SelectTrigger className="h-8 border-none bg-transparent hover:bg-muted/50 justify-center font-bold text-primary">
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
                ))}
            </TableBody>
            <TableFooter className="bg-muted/50 border-t-2 border-primary/20">
                <TableRow className="hover:bg-muted/50">
                    <TableCell colSpan={4} className="text-right font-black text-lg text-primary">GENEL TOPLAM:</TableCell>
                    <TableCell className="text-right font-black text-blue-600 text-lg">{formatCurrency(stats.toplamBrut)}</TableCell>
                    <TableCell className="text-right font-black text-green-600 text-lg">{formatCurrency(stats.toplamNet)}</TableCell>
                    <TableCell className="text-right font-black text-orange-600 text-lg">{formatCurrency(stats.toplamSigortaKesintisi)}</TableCell>
                    <TableCell className="text-right font-black text-purple-600 text-lg">{formatCurrency(stats.toplamIsverenPayi)}</TableCell>
                    <TableCell className="text-right font-black text-red-600 text-lg">{formatCurrency(stats.toplamIsverenMaliyeti)}</TableCell>
                    <TableCell></TableCell>
                </TableRow>
            </TableFooter>
        </Table>
    );

    return (
        <div className="relative min-h-screen pb-20">
            <BackgroundPaths />

            <div className="relative z-10 p-6 lg:p-8 max-w-[1600px] mx-auto">
              <Tabs defaultValue="maaslar" className="w-full">
                <TabsList className="mb-6">
                  <TabsTrigger value="maaslar" className="gap-2">
                    <Wallet className="w-4 h-4" /> Maaşlar
                  </TabsTrigger>
                  <TabsTrigger value="izinler" className="gap-2">
                    <Calendar className="w-4 h-4" /> İzinler
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="maaslar" className="space-y-8">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div>
                        <h2 className="text-4xl font-black tracking-tight bg-gradient-to-r from-foreground to-foreground/50 bg-clip-text text-transparent">Personel Portalı</h2>
                        <p className="text-muted-foreground text-lg">Şirket personeli genel listesi ve yönetimi.</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 bg-background/30 backdrop-blur-xl p-2 rounded-2xl border border-white/10 shadow-2xl">
                        {/* Yıl Seçici */}
                        <Select value={String(selectedYil)} onValueChange={(val) => setSelectedYil(parseInt(val))}>
                            <SelectTrigger className="w-[100px] border-none bg-white/5">
                                <SelectValue placeholder="Yıl" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="2024">2024</SelectItem>
                                <SelectItem value="2025">2025</SelectItem>
                                <SelectItem value="2026">2026</SelectItem>
                                <SelectItem value="2027">2027</SelectItem>
                            </SelectContent>
                        </Select>

                        {/* Ay Seçici */}
                        <Select value={selectedAy} onValueChange={setSelectedAy}>
                            <SelectTrigger className="w-[140px] border-none bg-white/5">
                                <Calendar className="w-4 h-4 mr-2" />
                                <SelectValue placeholder="Dönem Seç" />
                            </SelectTrigger>
                            <SelectContent>
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(ay => (
                                    <SelectItem key={ay} value={String(ay)}>
                                        {ayNumarasiToAd(ay)}
                                    </SelectItem>
                                ))}
                                <SelectItem value="toplam" className="font-bold border-t mt-1 pt-2">
                                    📊 Yıllık Toplam
                                </SelectItem>
                            </SelectContent>
                        </Select>

                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="İsim veya TC ile ara..."
                                className="pl-10 w-[240px] border-none bg-white/5 focus-visible:ring-primary/30"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="w-[160px] border-none bg-white/5 justify-between font-normal">
                                    <div className="flex items-center">
                                        <Filter className="w-4 h-4 mr-2" />
                                        {selectedSubeler.length === 0 ? "Tüm Şubeler" : `${selectedSubeler.length} Şube Seçili`}
                                    </div>
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
                            onClick={() => setMaasListesiOpen(true)}
                            className="bg-green-600 hover:bg-green-700 text-white border-0 ml-2"
                            title="Maaş Listesi PDF (sadece net ödemeler) - sağlam parser, brüt arkada hesaplanır"
                        >
                            <FileUp className="w-4 h-4 mr-2" />
                            Maaş Listesi (PDF)
                        </Button>
                        <Button
                            onClick={() => setArsivOpen(true)}
                            variant="outline"
                            className="border-blue-500/30 hover:bg-blue-500/10"
                            title="Detaylı Bordro PDF arşivi - parse yok, denetim için saklanır"
                        >
                            <FileText className="w-4 h-4 mr-2" />
                            Bordro Arşivi
                        </Button>
                        <Button
                            onClick={() => setUploadDialogOpen(true)}
                            variant="outline"
                            className="opacity-70"
                            title="Eski yöntem (Excel veya bordro PDF heuristic parse)"
                        >
                            <Upload className="w-4 h-4 mr-2" />
                            Bordro Yükle (Eski)
                        </Button>
                    </div>
                </div>

                {/* Dönem Bilgisi */}
                <div className="text-center">
                    <Badge className="text-lg px-4 py-2 bg-primary/10 text-primary border-primary/20">
                        <Calendar className="w-5 h-5 mr-2" />
                        {selectedAy === "toplam" ? `${selectedYil} Yıllık Toplam` : `${ayNumarasiToAd(parseInt(selectedAy))} ${selectedYil}`}
                    </Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    {/* 1. Aktif Personel */}
                    <Card className="bg-background/40 backdrop-blur-xl border-primary/20 shadow-lg p-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Aktif Personel</p>
                                <h3 className="text-2xl font-black">{stats.toplamPersonel}</h3>
                            </div>
                            <Users className="w-6 h-6 text-primary" />
                        </div>
                    </Card>

                    {/* 2. Genel Net Toplam */}
                    <Card className="bg-background/40 backdrop-blur-xl border-green-500/20 shadow-lg p-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                                    {selectedAy === "toplam" ? "Yıllık Net" : "Genel Net Toplam"}
                                </p>
                                <h3 className="text-xl font-black text-green-600">
                                    {formatCurrency(stats.toplamNet)}
                                </h3>
                            </div>
                            <Wallet className="w-6 h-6 text-green-600" />
                        </div>
                    </Card>

                    {/* 3. Genel Brüt Toplam */}
                    <Card className="bg-background/40 backdrop-blur-xl border-blue-500/20 shadow-lg p-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                                    {selectedAy === "toplam" ? "Yıllık Brüt" : "Genel Brüt Toplam"}
                                </p>
                                <h3 className="text-xl font-black text-blue-600">
                                    {formatCurrency(stats.toplamBrut)}
                                </h3>
                            </div>
                            <TrendingUp className="w-6 h-6 text-blue-600" />
                        </div>
                    </Card>

                    {/* 4. Toplam İşveren Payı */}
                    <Card className="bg-background/40 backdrop-blur-xl border-orange-500/20 shadow-lg p-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                                    {selectedAy === "toplam" ? "Yıllık İşveren Payı" : "Toplam İşveren Payı"}
                                </p>
                                <h3 className="text-xl font-black text-orange-600">
                                    {formatCurrency(stats.toplamIsverenPayi)}
                                </h3>
                            </div>
                            <Percent className="w-6 h-6 text-orange-600" />
                        </div>
                    </Card>

                    {/* 5. Toplam İşveren Maliyeti */}
                    <Card className="bg-background/40 backdrop-blur-xl border-purple-500/20 shadow-lg p-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                                    {selectedAy === "toplam" ? "Yıllık İşveren Maliyeti" : "Toplam İşveren Maliyeti"}
                                </p>
                                <h3 className="text-xl font-black text-purple-600">
                                    {formatCurrency(stats.toplamIsverenMaliyeti)}
                                </h3>
                            </div>
                            <Banknote className="w-6 h-6 text-purple-600" />
                        </div>
                    </Card>
                </div>

                <div className="space-y-8">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <Loader2 className="w-10 h-10 animate-spin text-primary" />
                            <p className="font-bold text-muted-foreground">Personel verileri yükleniyor...</p>
                        </div>
                    ) : (
                        <Card className="bg-background/40 backdrop-blur-xl border-border/50 shadow-2xl rounded-2xl overflow-hidden border">
                            {renderTable(sortedAndFilteredData)}
                        </Card>
                    )}
                </div>
                </TabsContent>

                <TabsContent value="izinler" className="space-y-6">
                  <Tabs defaultValue="takvim" className="w-full">
                    <TabsList>
                      <TabsTrigger value="takvim">Aylık Takvim</TabsTrigger>
                      <TabsTrigger value="liste">İzin Listesi</TabsTrigger>
                      <TabsTrigger value="bakiye">Bakiye Yönetimi</TabsTrigger>
                    </TabsList>
                    <TabsContent value="takvim" className="mt-6">
                      <div className="text-muted-foreground text-center py-12">Takvim — Task 11'de gelecek</div>
                    </TabsContent>
                    <TabsContent value="liste" className="mt-6">
                      <IzinListesi
                        onYeniEkle={() => { setIzinModalTcNo(null); setIzinModalEdit(null); setIzinModalDefaultDate(null); setIzinModalOpen(true); }}
                        onDuzenle={(izin) => { setIzinModalEdit(izin); setIzinModalTcNo(null); setIzinModalDefaultDate(null); setIzinModalOpen(true); }}
                      />
                    </TabsContent>
                    <TabsContent value="bakiye" className="mt-6">
                      <IzinBakiye onYeniIzin={(tcNo) => { setIzinModalTcNo(tcNo); setIzinModalEdit(null); setIzinModalDefaultDate(null); setIzinModalOpen(true); }} />
                    </TabsContent>
                  </Tabs>
                </TabsContent>
              </Tabs>
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
            {/* Upload Dialog */}
            <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
                <DialogContent className="sm:max-w-[1000px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Bordro Yükle - {ayNumarasiToAd(parseInt(selectedAy))} {selectedYil}</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-6 py-4">
                        {/* File Input */}
                        <div className="flex items-end gap-4 p-4 border rounded-xl bg-muted/20">
                            <div className="flex-1 space-y-2">
                                <Label>Bordro Dosyası Seç (Excel veya PDF)</Label>
                                <Input
                                    type="file"
                                    accept=".xlsx, .xls, .pdf"
                                    onChange={(e) => setUploadedFile(e.target.files?.[0] || null)}
                                />
                            </div>
                            <Button disabled={!uploadedFile || isUploading} onClick={handleFileUpload}>
                                {isUploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                                Önizle
                            </Button>
                        </div>

                        {/* Preview Table */}
                        {previewData.length > 0 && (
                            <div className="border rounded-xl overflow-hidden">
                                <div className="p-2 bg-yellow-500/10 border-b border-yellow-500/20 text-yellow-600 text-sm font-bold flex items-center gap-2">
                                    <Info className="w-4 h-4" />
                                    Bu veriler henüz kaydedilmemiştir. Lütfen kontrol edip onaylayın.
                                </div>
                                <div className="max-h-[400px] overflow-auto">
                                    <Table>
                                        <TableHeader className="bg-muted">
                                            <TableRow>
                                                <TableHead>Ad Soyad</TableHead>
                                                <TableHead>Brüt</TableHead>
                                                <TableHead>Net</TableHead>
                                                <TableHead>İşçi SGK</TableHead>
                                                <TableHead>İşveren SGK</TableHead>
                                                <TableHead>Toplam Maliyet</TableHead>
                                                <TableHead>Şube</TableHead>
                                                <TableHead>Statü</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {previewData.map((row, i) => (
                                                <TableRow key={i}>
                                                    <TableCell className="font-medium">{row.adSoyad}</TableCell>
                                                    <TableCell>{formatCurrency(row.brutUcret)}</TableCell>
                                                    <TableCell className="font-bold text-green-600">{formatCurrency(row.netUcret)}</TableCell>
                                                    <TableCell className="text-orange-600">{formatCurrency(row.sigortaKesintisi)}</TableCell>
                                                    <TableCell className="text-purple-600">{formatCurrency(row.isverenSgkPayi)}</TableCell>
                                                    <TableCell className="font-bold text-red-600">{formatCurrency(row.toplamIsverenMaliyeti)}</TableCell>
                                                    <TableCell><Badge variant="outline">{row.sube}</Badge></TableCell>
                                                    <TableCell><Badge variant="outline">{row.statu}</Badge></TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                                <div className="p-4 border-t bg-muted/20 flex justify-end gap-2">
                                    <Button variant="outline" onClick={() => setPreviewData([])}>İptal</Button>
                                    <Button onClick={handleSaveBordro} disabled={isSaving}>
                                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                        Verileri Kaydet ve Onayla
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* ============================================================ */}
            {/* MAAŞ LİSTESİ PDF DIALOG (yeni sağlam yöntem) */}
            {/* ============================================================ */}
            <Dialog open={maasListesiOpen} onOpenChange={(o) => {
                setMaasListesiOpen(o);
                if (!o) { setMaasListesiFile(null); setMaasListesiPreview(null); }
            }}>
                <DialogContent className="sm:max-w-[1200px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FileUp className="w-5 h-5 text-green-600" />
                            Maaş Listesi PDF Yükle
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 text-sm">
                            <div className="flex items-start gap-2">
                                <Info className="w-4 h-4 mt-0.5 text-blue-500 shrink-0" />
                                <div className="text-muted-foreground">
                                    Sadece <strong>"Personel Maaş Listesi"</strong> (net ödenecek tutarları gösteren) PDF'i yükleyin.
                                    Ay/yıl PDF'in başlığından otomatik okunur. Şube ve yönetici tespiti de otomatik yapılır.
                                    Brüt + işveren payları arkada hesaplanır.
                                </div>
                            </div>
                        </div>

                        <div className="flex items-end gap-3 p-4 border rounded-xl bg-muted/20">
                            <div className="flex-1 space-y-2">
                                <Label>PDF Dosyası</Label>
                                <Input
                                    type="file"
                                    accept=".pdf"
                                    onChange={(e) => { setMaasListesiFile(e.target.files?.[0] || null); setMaasListesiPreview(null); }}
                                />
                            </div>
                            <Button disabled={!maasListesiFile || maasListesiBusy} onClick={handleMaasListesiUpload}>
                                {maasListesiBusy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileUp className="w-4 h-4 mr-2" />}
                                Önizle
                            </Button>
                        </div>

                        {maasListesiPreview && (
                            <>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                                    {maasListesiPreview.sayfalar.map((s: any) => (
                                        <Card key={s.sayfaNo} className="p-3">
                                            <div className="flex items-center gap-2 mb-2">
                                                <Building2 className="w-4 h-4 text-primary" />
                                                <span className="font-bold text-sm">{s.sube}</span>
                                                {s.statu === "YÖNETİCİ" && (
                                                    <Badge variant="outline" className="text-[10px] py-0 h-4">YÖNETİCİ</Badge>
                                                )}
                                            </div>
                                            <div className="space-y-1 text-xs text-muted-foreground">
                                                <div>{s.kisi} kişi</div>
                                                <div>Toplam: <strong className="text-green-600">{formatCurrency(s.toplam)}</strong></div>
                                                {!s.sgkIsyeriNo && (
                                                    <div className="text-amber-600 flex items-center gap-1 mt-1">
                                                        <AlertTriangle className="w-3 h-3" />
                                                        SGK İşyeri No yok
                                                    </div>
                                                )}
                                            </div>
                                        </Card>
                                    ))}
                                </div>

                                <Card className="p-4 bg-muted/30">
                                    <div className="font-bold mb-2 flex items-center gap-2">
                                        <Calculator className="w-4 h-4" />
                                        Hesaplanan Özet — {ayNumarasiToAd(maasListesiPreview.ay)} {maasListesiPreview.yil}
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
                                            {Object.entries(maasListesiPreview.subeOzet).map(([sube, o]: any) => (
                                                <TableRow key={sube}>
                                                    <TableCell className="font-medium">{sube}</TableCell>
                                                    <TableCell className="text-right tabular-nums">{o.kisi}</TableCell>
                                                    <TableCell className="text-right tabular-nums text-green-600">{formatCurrency(o.net)}</TableCell>
                                                    <TableCell className="text-right tabular-nums text-blue-600">{formatCurrency(o.brut)}</TableCell>
                                                    <TableCell className="text-right tabular-nums font-semibold text-red-600">{formatCurrency(o.isverenMaliyeti)}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
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
                                                    <TableHead className="text-right">Net</TableHead>
                                                    <TableHead className="text-right">Brüt</TableHead>
                                                    <TableHead className="text-right">İşçi SGK</TableHead>
                                                    <TableHead className="text-right">İşv. SGK</TableHead>
                                                    <TableHead className="text-right">Maliyet</TableHead>
                                                    <TableHead>✓</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {maasListesiPreview.onizleme.map((r: any, i: number) => (
                                                    <TableRow key={i}>
                                                        <TableCell className="font-medium">{r.adSoyad}</TableCell>
                                                        <TableCell><Badge variant="outline" className="text-[10px]">{r.sube}</Badge></TableCell>
                                                        <TableCell><Badge variant={r.statu === "YÖNETİCİ" ? "default" : "outline"} className="text-[10px]">{r.statu}</Badge></TableCell>
                                                        <TableCell className="text-right tabular-nums text-green-600 font-semibold">{formatCurrency(r.netUcret)}</TableCell>
                                                        <TableCell className="text-right tabular-nums text-blue-600">{formatCurrency(r.brutUcret)}</TableCell>
                                                        <TableCell className="text-right tabular-nums text-orange-600">{formatCurrency(r.sigortaKesintisi)}</TableCell>
                                                        <TableCell className="text-right tabular-nums text-purple-600">{formatCurrency(r.isverenSgkPayi)}</TableCell>
                                                        <TableCell className="text-right tabular-nums text-red-600 font-semibold">{formatCurrency(r.toplamIsverenMaliyeti)}</TableCell>
                                                        <TableCell>
                                                            {r.fark < 0.05 ? (
                                                                <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                                                            ) : (
                                                                <span className="text-amber-600 text-[10px]" title={`Fark: ${r.fark.toFixed(2)}`}>
                                                                    ±{r.fark.toFixed(2)}
                                                                </span>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                    <div className="p-3 border-t bg-muted/20 flex justify-between items-center">
                                        <div className="text-sm text-muted-foreground">
                                            <strong>{maasListesiPreview.toplamKisi}</strong> kişi · PDF Net Toplamı: <strong>{formatCurrency(maasListesiPreview.pdfToplamNet)}</strong>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button variant="outline" onClick={() => { setMaasListesiPreview(null); setMaasListesiFile(null); }}>İptal</Button>
                                            <Button onClick={handleMaasListesiSave} disabled={maasListesiBusy} className="bg-green-600 hover:bg-green-700">
                                                {maasListesiBusy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                                Kaydet ({maasListesiPreview.toplamKisi} kişi)
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
                                                        <Badge variant={d.tip === "maas-listesi" ? "default" : "outline"}>
                                                            {d.tip === "maas-listesi" ? "Maaş Listesi" : "Bordro"}
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

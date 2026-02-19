import { useState, useEffect, useMemo } from "react";
import { BackgroundPaths } from "@/components/BackgroundPaths";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Users, Wallet, Loader2, Search, Building2, TrendingUp, Filter, User, Info, Calendar, Hash, ArrowUpDown, ArrowUp, ArrowDown, Calculator, Percent, AlertCircle, Banknote, Upload, Save, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { subeler } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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




    // Upload Dialog State
    const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [previewData, setPreviewData] = useState<any[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

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

            <div className="relative z-10 p-6 lg:p-8 max-w-[1600px] mx-auto space-y-8">
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
                            onClick={() => setUploadDialogOpen(true)}
                            className="bg-green-600 hover:bg-green-700 text-white border-0 ml-2"
                        >
                            <Upload className="w-4 h-4 mr-2" />
                            Bordro Yükle
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
                        <DialogTitle>Bordro Yükle - {ayNumarasiToAd(parseInt(selectedAy))} {selectedYil}</DialogTitle></invoke>
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
        </div>
    );
}

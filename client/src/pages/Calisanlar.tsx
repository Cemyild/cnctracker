import { useState, useEffect } from "react";
import { BackgroundPaths } from "@/components/BackgroundPaths";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Wallet, Loader2, Search, Building2, TrendingUp, Filter, User, Info, Calendar, Hash, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { subeler } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

export default function Calisanlar() {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedSube, setSelectedSube] = useState<string>("all");
    const [selectedPerson, setSelectedPerson] = useState<any>(null);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    const { toast } = useToast();

    const fetchCalisanlar = async () => {
        setLoading(true);
        try {
            const response = await fetch("/api/calisanlar");
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
    }, []);

    const formatCurrency = (val: number | string | null | undefined) => {
        if (val === null || val === undefined) return "-";
        const num = typeof val === "string" ? parseFloat(val) : val;
        if (isNaN(num)) return "-";
        return new Intl.NumberFormat("tr-TR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(num) + " TL";
    };

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
            const matchesSube = selectedSube === "all" || (p.sube || "Bursa") === selectedSube;
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

    const stats = {
        toplamPersonel: sortedAndFilteredData.length,
        toplamBrut: sortedAndFilteredData.reduce((acc, p) => acc + parseFloat(p.brutUcret || 0), 0),
        toplamNet: sortedAndFilteredData.reduce((acc, p) => acc + parseFloat(p.netUcret || 0), 0),
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
                    <TableHead className="font-bold py-4 text-center">Şube</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {items.map((person) => (
                    <TableRow key={person.id} className="hover:bg-primary/5 transition-colors border-border/40">
                        <TableCell className="font-mono text-sm text-muted-foreground">{person.tcNo}</TableCell>
                        <TableCell
                            className="font-bold text-base cursor-pointer hover:text-primary transition-colors flex items-center gap-2"
                            onClick={() => setSelectedPerson(person)}
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
                        <TableCell className="text-right font-bold text-blue-600/80">{formatCurrency(person.brutUcret)}</TableCell>
                        <TableCell className="text-right font-black text-green-600 text-base">{formatCurrency(person.netUcret)}</TableCell>
                        <TableCell className="text-center">
                            <Badge variant="outline" className="font-bold border-primary/30 text-primary">
                                {person.sube || "Bursa"}
                            </Badge>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
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
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="İsim veya TC ile ara..."
                                className="pl-10 w-[240px] border-none bg-white/5 focus-visible:ring-primary/30"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        <Select value={selectedSube} onValueChange={setSelectedSube}>
                            <SelectTrigger className="w-[160px] border-none bg-white/5">
                                <Filter className="w-4 h-4 mr-2" />
                                <SelectValue placeholder="Tüm Şubeler" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tüm Şubeler</SelectItem>
                                {subeler.map(s => (
                                    <SelectItem key={s} value={s}>{s}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="bg-background/40 backdrop-blur-xl border-primary/20 shadow-lg p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">Aktif Personel</p>
                                <h3 className="text-3xl font-black">{stats.toplamPersonel}</h3>
                            </div>
                            <Users className="w-7 h-7 text-primary" />
                        </div>
                    </Card>

                    <Card className="bg-background/40 backdrop-blur-xl border-blue-500/20 shadow-lg p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">Genel Brüt Toplam</p>
                                <h3 className="text-3xl font-black text-blue-600">{formatCurrency(stats.toplamBrut)}</h3>
                            </div>
                            <TrendingUp className="w-7 h-7 text-blue-600" />
                        </div>
                    </Card>

                    <Card className="bg-background/40 backdrop-blur-xl border-green-500/20 shadow-lg p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">Genel Net Toplam</p>
                                <h3 className="text-3xl font-black text-green-600">{formatCurrency(stats.toplamNet)}</h3>
                            </div>
                            <Wallet className="w-7 h-7 text-green-600" />
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

            <Dialog open={!!selectedPerson} onOpenChange={(open) => !open && setSelectedPerson(null)}>
                <DialogContent className="sm:max-w-[600px] bg-card/95 backdrop-blur-2xl border-white/10 shadow-2xl overflow-hidden rounded-3xl p-0">
                    {selectedPerson && (
                        <div className="relative">
                            <div className="h-32 bg-gradient-to-br from-primary/20 via-blue-500/10 to-transparent"></div>
                            <div className="px-8 pb-8 -mt-12">
                                <div className="flex items-end gap-6 mb-8">
                                    <div className="w-24 h-24 rounded-3xl bg-primary flex items-center justify-center text-white shadow-2xl shadow-primary/30 border-4 border-background">
                                        <User className="w-12 h-12" />
                                    </div>
                                    <div className="flex-1 pb-2">
                                        <h2 className="text-3xl font-black tracking-tight">{selectedPerson.adSoyad}</h2>
                                        <div className="flex items-center gap-2 mt-1">
                                            <Badge variant="outline" className="font-bold border-primary/30 text-primary">{selectedPerson.sube || "Bursa"}</Badge>
                                            <Badge variant="secondary" className="font-bold text-xs">{selectedPerson.statu}</Badge>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                                        <Label className="text-xs font-bold text-muted-foreground uppercase mb-2 block">Hesaplanan Brüt</Label>
                                        <div className="flex items-center gap-2 font-black text-blue-600">
                                            <TrendingUp className="w-4 h-4" />
                                            {formatCurrency(selectedPerson.brutUcret)}
                                        </div>
                                    </div>
                                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                                        <Label className="text-xs font-bold text-muted-foreground uppercase mb-2 block">Net Ödenecek</Label>
                                        <div className="flex items-center gap-2 font-black text-green-600 text-lg">
                                            <Wallet className="w-4 h-4" />
                                            {formatCurrency(selectedPerson.netUcret)}
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-6 p-4 bg-primary/5 rounded-2xl border border-primary/10">
                                    <h4 className="text-xs font-bold uppercase text-primary mb-3">Vergi & Kesinti Detayları</h4>
                                    <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                                        <div className="flex justify-between border-b border-primary/10 pb-1">
                                            <span className="text-muted-foreground">SGK İşçi (%14):</span>
                                            <span className="font-bold">{formatCurrency(selectedPerson.sigortaKesintisi)}</span>
                                        </div>
                                        <div className="flex justify-between border-b border-primary/10 pb-1">
                                            <span className="text-muted-foreground">İşsizlik İşçi (%1):</span>
                                            <span className="font-bold">{formatCurrency(selectedPerson.issizlikSigortasiKesintisi)}</span>
                                        </div>
                                        <div className="flex justify-between border-b border-primary/10 pb-1">
                                            <span className="text-muted-foreground">Gelir Vergisi:</span>
                                            <span className="font-bold">{formatCurrency(selectedPerson.gelirVergisi)}</span>
                                        </div>
                                        <div className="flex justify-between border-b border-primary/10 pb-1">
                                            <span className="text-muted-foreground">Damga Vergisi:</span>
                                            <span className="font-bold">{formatCurrency(selectedPerson.damgaVergisi)}</span>
                                        </div>
                                        <div className="col-span-2 pt-2 mt-2 border-t border-primary/20 flex justify-between">
                                            <span className="font-bold text-muted-foreground">Toplam İşveren Maliyeti:</span>
                                            <span className="font-black text-primary">{formatCurrency(selectedPerson.toplamIsverenMaliyeti)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

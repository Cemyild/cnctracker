import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BackgroundPaths } from "@/components/BackgroundPaths";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { Loader2, TrendingUp, TrendingDown, DollarSign, Calendar, Truck, Building2, AlertTriangle, Bell, Info } from "lucide-react";
import { format, parseISO } from "date-fns";
import { tr } from "date-fns/locale";
import { aylar, subeler, type Arac } from "@shared/schema";
import { Badge } from "@/components/ui/badge";

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8", "#82ca9d"];

export default function Raporlar() {
    const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
    const [selectedMonth, setSelectedMonth] = useState<string>("ALL");
    const [selectedVehicle, setSelectedVehicle] = useState<string>("");

    // 1. Branch Profitability Query
    const { data: branchData, isLoading: branchLoading } = useQuery<any[]>({
        queryKey: ["/api/reports/branch-profitability", selectedYear, selectedMonth],
        queryFn: async () => {
            const res = await fetch(`/api/reports/branch-profitability?yil=${selectedYear}&ay=${selectedMonth}`);
            if (!res.ok) throw new Error("Şube verileri yüklenemedi");
            return res.json();
        }
    });

    // 2. reminders Query
    const { data: reminders, isLoading: remindersLoading } = useQuery<any[]>({
        queryKey: ["/api/reports/reminders"],
        queryFn: async () => {
            const res = await fetch("/api/reports/reminders");
            if (!res.ok) throw new Error("Hatırlatıcılar yüklenemedi");
            return res.json();
        }
    });

    // 3. Vehicles List
    const { data: araclar } = useQuery<Arac[]>({
        queryKey: ["/api/araclar"],
    });

    // 4. Vehicle Expenses Query
    const { data: vehicleExpenses, isLoading: vehicleLoading } = useQuery<any[]>({
        queryKey: ["/api/reports/vehicle-expenses", selectedVehicle],
        enabled: !!selectedVehicle,
        queryFn: async () => {
            const res = await fetch(`/api/reports/vehicle-expenses/${selectedVehicle}`);
            if (!res.ok) throw new Error("Araç harcamaları yüklenemedi");
            return res.json();
        }
    });

    const formatCur = (val: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(val);

    return (
        <div className="relative min-h-full pb-10">
            <BackgroundPaths />
            <div className="relative z-10 p-6 lg:p-8 space-y-8 max-w-[1400px] mx-auto">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-3xl font-black tracking-tight flex items-center gap-3">
                            <TrendingUp className="w-8 h-8 text-primary" />
                            Raporlar ve Analizler
                        </h2>
                        <p className="text-muted-foreground mt-1">Şirketinizin finansal ve operasyonel performansını buradan takip edin.</p>
                    </div>

                    <div className="flex items-center gap-3 bg-card p-2 rounded-xl border shadow-sm">
                        <Select value={selectedYear} onValueChange={setSelectedYear}>
                            <SelectTrigger className="w-[100px] h-9">
                                <SelectValue placeholder="Yıl" />
                            </SelectTrigger>
                            <SelectContent>
                                {[2024, 2025, 2026].map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
                            </SelectContent>
                        </Select>

                        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                            <SelectTrigger className="w-[130px] h-9">
                                <SelectValue placeholder="Ay" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Tüm Yıl</SelectItem>
                                {aylar.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <Tabs defaultValue="sube" className="w-full">
                    <TabsList className="grid w-full grid-cols-3 md:w-[600px] h-12 p-1 bg-muted/50 backdrop-blur">
                        <TabsTrigger value="sube" className="flex items-center gap-2 font-bold h-10">
                            <Building2 className="w-4 h-4" />
                            Şube Kârlılığı
                        </TabsTrigger>
                        <TabsTrigger value="arac" className="flex items-center gap-2 font-bold h-10">
                            <Truck className="w-4 h-4" />
                            Araç Giderleri
                        </TabsTrigger>
                        <TabsTrigger value="police" className="flex items-center gap-2 font-bold h-10">
                            <Calendar className="w-4 h-4" />
                            Vade Takip
                            {reminders && reminders.length > 0 && (
                                <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 flex items-center justify-center rounded-full text-[10px]">
                                    {reminders.length}
                                </Badge>
                            )}
                        </TabsTrigger>
                    </TabsList>

                    {/* ŞUBE KARLILIĞI TAB */}
                    <TabsContent value="sube" className="mt-6 space-y-6">
                        {branchLoading ? (
                            <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin w-10 h-10 text-primary" /></div>
                        ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                <Card className="lg:col-span-2">
                                    <CardHeader>
                                        <CardTitle>Şube Bazlı Gelir-Gider Dengesi</CardTitle>
                                        <CardDescription>{selectedYear} - {selectedMonth === "ALL" ? "Tüm Yıl" : selectedMonth.toUpperCase()}</CardDescription>
                                    </CardHeader>
                                    <CardContent className="h-[400px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={branchData}>
                                                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                                                <XAxis dataKey="sube" />
                                                <YAxis />
                                                <Tooltip 
                                                    formatter={(value: any) => formatCur(value)}
                                                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderRadius: "12px", border: "1px solid hsl(var(--border))" }}
                                                />
                                                <Legend />
                                                <Bar dataKey="gelir" fill="#0088FE" name="Gelir" radius={[4, 4, 0, 0]} />
                                                <Bar dataKey="gider" fill="#FF8042" name="Gider (Personel)" radius={[4, 4, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader>
                                        <CardTitle>Gelir Dağılımı</CardTitle>
                                    </CardHeader>
                                    <CardContent className="h-[300px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={branchData}
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={60}
                                                    outerRadius={80}
                                                    paddingAngle={5}
                                                    dataKey="gelir"
                                                    nameKey="sube"
                                                >
                                                    {branchData?.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                    ))}
                                                </Pie>
                                                <Tooltip formatter={(value: any) => formatCur(value)} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                        <div className="mt-4 grid grid-cols-2 gap-2">
                                            {branchData?.map((item, idx) => (
                                                <div key={idx} className="flex items-center gap-2 text-xs">
                                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                                                    <span className="truncate">{item.sube}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card className="lg:col-span-3">
                                    <CardContent className="p-0">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Şube</TableHead>
                                                    <TableHead className="text-right">Toplam Gelir (M.B.)</TableHead>
                                                    <TableHead className="text-right">Personel Maliyeti</TableHead>
                                                    <TableHead className="text-right">Brüt Kâr/Zarar</TableHead>
                                                    <TableHead className="text-right">Durum</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {branchData?.map((row, idx) => (
                                                    <TableRow key={idx}>
                                                        <TableCell className="font-bold">{row.sube}</TableCell>
                                                        <TableCell className="text-right font-mono">{formatCur(row.gelir)}</TableCell>
                                                        <TableCell className="text-right font-mono text-muted-foreground">{formatCur(row.gider)}</TableCell>
                                                        <TableCell className={cn("text-right font-black font-mono", row.kar >= 0 ? "text-green-600" : "text-red-500")}>
                                                            {formatCur(row.kar)}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            {row.kar >= 0 ? <TrendingUp className="inline text-green-600 w-4 h-4 ml-auto" /> : <TrendingDown className="inline text-red-500 w-4 h-4 ml-auto" />}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </CardContent>
                                </Card>
                            </div>
                        )}
                    </TabsContent>

                    {/* ARAÇ GİDERLERİ TAB */}
                    <TabsContent value="arac" className="mt-6 space-y-6">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle>Plaka Bazlı Harcama Analizi</CardTitle>
                                    <CardDescription>Aracın tüm sigorta ve kasko giderlerini listeler.</CardDescription>
                                </div>
                                <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
                                    <SelectTrigger className="w-[200px]">
                                        <SelectValue placeholder="Plaka Seçiniz" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {araclar?.map(a => <SelectItem key={a.id} value={a.plaka}>{a.plaka}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </CardHeader>
                            <CardContent>
                                {!selectedVehicle ? (
                                    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground border-2 border-dashed rounded-xl">
                                        <Truck className="w-12 h-12 mb-2 opacity-20" />
                                        <p>Analiz için bir plaka seçiniz.</p>
                                    </div>
                                ) : vehicleLoading ? (
                                    <div className="flex items-center justify-center h-40"><Loader2 className="animate-spin w-8 h-8 text-primary" /></div>
                                ) : (
                                    <div className="space-y-6">
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <Card className="bg-primary/5">
                                                <CardContent className="pt-6">
                                                    <p className="text-sm text-muted-foreground font-bold uppercase">Toplam Masraf</p>
                                                    <p className="text-2xl font-black mt-1">
                                                        {formatCur(vehicleExpenses?.reduce((acc, p) => acc + parseFloat(p.prim || "0"), 0))}
                                                    </p>
                                                </CardContent>
                                            </Card>
                                            <Card className="bg-primary/5">
                                                <CardContent className="pt-6">
                                                    <p className="text-sm text-muted-foreground font-bold uppercase">Kayıtlı Poliçe</p>
                                                    <p className="text-2xl font-black mt-1">{vehicleExpenses?.length} Adet</p>
                                                </CardContent>
                                            </Card>
                                            <Card className="bg-primary/5">
                                                <CardContent className="pt-6">
                                                    <p className="text-sm text-muted-foreground font-bold uppercase">Son İşlem</p>
                                                    <p className="text-2xl font-black mt-1">
                                                        {vehicleExpenses?.length ? vehicleExpenses[0].tarih : "-"}
                                                    </p>
                                                </CardContent>
                                            </Card>
                                        </div>

                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Tarih</TableHead>
                                                    <TableHead>Poliçe No</TableHead>
                                                    <TableHead>Tür</TableHead>
                                                    <TableHead>Şirket</TableHead>
                                                    <TableHead className="text-right">Tutar (Prim)</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {vehicleExpenses?.map((v, i) => (
                                                    <TableRow key={i}>
                                                        <TableCell>{v.tarih}</TableCell>
                                                        <TableCell className="font-mono font-bold text-primary">{v.policeNo}</TableCell>
                                                        <TableCell>{v.brans || "N/A"}</TableCell>
                                                        <TableCell>{v.sirket}</TableCell>
                                                        <TableCell className="text-right font-bold">{formatCur(parseFloat(v.prim || "0"))}</TableCell>
                                                    </TableRow>
                                                ))}
                                                {vehicleExpenses?.length === 0 && (
                                                    <TableRow>
                                                        <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">Kayıtlı masraf bulunamadı.</TableCell>
                                                    </TableRow>
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* VADE TAKİP TAB */}
                    <TabsContent value="police" className="mt-6 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {remindersLoading ? (
                                <div className="col-span-full flex items-center justify-center py-20"><Loader2 className="animate-spin w-10 h-10 text-primary" /></div>
                            ) : reminders?.length ? (
                                reminders.map((rem, i) => (
                                    <Card key={i} className="border-l-4 border-l-red-500 hover:shadow-lg transition-all animate-in fade-in slide-in-from-left duration-300">
                                        <CardHeader className="pb-3">
                                            <div className="flex justify-between items-start">
                                                <Badge variant="destructive" className="mb-2">{rem.tip}</Badge>
                                                <AlertTriangle className="w-5 h-5 text-red-500" />
                                            </div>
                                            <CardTitle className="text-lg">{rem.baslik}</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="flex items-center gap-2 text-2xl font-black text-red-600">
                                                <Calendar className="w-5 h-5" />
                                                {format(parseISO(rem.tarih), "d MMMM yyyy", { locale: tr })}
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                                                <Bell className="w-3 h-3" />
                                                Vadesine az süre kaldı!
                                            </p>
                                        </CardContent>
                                    </Card>
                                ))
                            ) : (
                                <div className="col-span-full flex flex-col items-center justify-center py-20 text-muted-foreground bg-green-50/50 rounded-2xl border-2 border-green-200 border-dashed">
                                    <Bell className="w-12 h-12 text-green-400 mb-2 opacity-50" />
                                    <p className="font-bold text-green-700">Tüm poliçeler güncel!</p>
                                    <p className="text-sm">Yaklaşan vadesi olan bir poliçe bulunamadı.</p>
                                </div>
                            )}
                        </div>

                        <Card className="bg-blue-50/30 border-blue-200">
                            <CardContent className="p-4 flex gap-3">
                                <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                                <div className="text-sm text-blue-800">
                                    <p className="font-bold mb-1">Uyarı Sistemi Hakkında</p>
                                    <p>Sistem, bitiş tarihine 60 günden az kalan tüm araç sigorta ve kasko poliçelerini otomatik olarak buraya getirir. Kırmızı renk vadenin kritik olduğunu gösterir.</p>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}

// Helper for conditional classNames
function cn(...classes: any[]) {
    return classes.filter(Boolean).join(" ");
}

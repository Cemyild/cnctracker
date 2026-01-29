import React, { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { calculateYearlySalary, CalculationParams, SalaryResult, calculateNetFromGross, findGrossFromNet } from "@/lib/salary-utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Calculator } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Calisan } from "@shared/schema";

function formatCurrency(amount: number) {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(amount);
}

export default function Hesaplamalar() {
    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Hesaplamalar</h2>
            </div>
            <Tabs defaultValue="maas" className="space-y-4">
                <TabsList>
                        <TabsTrigger value="maas">Maaş Hesaplama (Tekil)</TabsTrigger>
                        <TabsTrigger value="2026-plan">2026 Planlama (Toplu)</TabsTrigger>
                        <TabsTrigger value="yemek">Yemek Kartı</TabsTrigger>
                    <TabsTrigger value="tarife">Tarife</TabsTrigger>
                    <TabsTrigger value="2026-plan">2026 Hesaplama</TabsTrigger>
                </TabsList>

                <TabsContent value="maas">
                    <SalaryCalculator />
                </TabsContent>

                <TabsContent value="2026-plan">
                    <SalaryPlanning2026 />
                </TabsContent>

                <TabsContent value="yemek">
                    <div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
                        <div className="bg-orange-100 p-3 rounded-full">
                            <Calculator className="h-6 w-6 text-orange-600" />
                        </div>
                        <h3 className="text-lg font-medium text-slate-900">Yemek Kartı Hesaplama</h3>
                        <p className="text-sm text-slate-500 max-w-sm">
                            Bu modül henüz geliştirme aşamasındadır. Yakında kullanıma açılacaktır.
                        </p>
                    </div>
                </TabsContent>

                <TabsContent value="tarife">
                    <div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
                        <div className="bg-purple-100 p-3 rounded-full">
                            <Calculator className="h-6 w-6 text-purple-600" />
                        </div>
                        <h3 className="text-lg font-medium text-slate-900">Gümrük Tarife Hesaplama</h3>
                        <p className="text-sm text-slate-500 max-w-sm">
                            Bu modül henüz geliştirme aşamasındadır. Yakında kullanıma açılacaktır.
                        </p>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}

// --- 2026 PLANLAMA MODÜLÜ ---
function SalaryPlanning2026() {
    // 1. Çalışanları Çek (Aralık 2025 var mı? Yoksa en son veriyi kullanacağız)
    // Şimdilik tüm çalışan listesini çekip benzersiz TC'ye göre filtreleyelim.
    const { data: employees, isLoading } = useQuery<Calisan[]>({
        queryKey: ["/api/calisanlar"],
        queryFn: async () => {
            const response = await fetch("/api/calisanlar");
            if (!response.ok) {
                throw new Error("Network response was not ok");
            }
            return response.json();
        },
    });

    // Benzersiz çalışan listesi (Son kayıtlara göre)
    const uniqueEmployees = React.useMemo(() => {
        if (!employees) return [];
        const map = new Map<string, Calisan>();
        employees.forEach(emp => {
            // Varsa üzerine yaz (Son kayıt gelsin diye umuyoruz veya tarihe bakmak lazım ama şimdilik basit tutalım)
            map.set(emp.tcNo, emp);
        });
        return Array.from(map.values());
    }, [employees]);

    // Durum Yönetimi
    const [plannerState, setPlannerState] = React.useState<{
        [tcNo: string]: {
            netSalary: string;
            type: "normal" | "retired";
        }
    }>({});

    // Varsayılanları Yükle
    React.useEffect(() => {
        if (uniqueEmployees.length > 0) {
            setPlannerState(prev => {
                const newState = { ...prev };
                uniqueEmployees.forEach(emp => {
                    if (!newState[emp.tcNo]) {
                        // Statüye göre varsayılan tipi belirle
                        const isRetired = emp.statu === "EMEKLİ";
                        
                        newState[emp.tcNo] = {
                            netSalary: "",
                            type: isRetired ? "retired" : "normal"
                        };
                    }
                });
                return newState;
            });
        }
    }, [uniqueEmployees]);

    // Hesaplama
    const calculations = React.useMemo(() => {
        const results: any[] = [];
        
        uniqueEmployees.forEach(emp => {
            const state = plannerState[emp.tcNo];
            if (!state) return;

            const netInput = parseFloat(state.netSalary);
            
            if (!isNaN(netInput) && netInput > 0) {
                // 12 Ay için aynı maaş
                const monthlyNets = Array(12).fill(netInput);
                const params: CalculationParams = {
                    employeeType: state.type,
                    hasBes: false, // Varsayılan kapalı
                    disabilityDegree: 0, // Varsayılan yok
                    isTreasuryIncentiveApplied: true // Varsayılan açık (5510 %5 İndirim)
                };
                
                const yearlyResult = calculateYearlySalary(monthlyNets, params);
                const totalCost = yearlyResult.reduce((sum, m) => sum + m.employerCost, 0);
                
                results.push({
                    tcNo: emp.tcNo,
                    totalCost
                });
            }
        });
        return results;
    }, [uniqueEmployees, plannerState]);

    const getCost = (tcNo: string) => calculations.find(c => c.tcNo === tcNo)?.totalCost || 0;

    if (isLoading) return <div>Yükleniyor...</div>;

    return (
        <Card className="border-t-4 border-t-purple-600 shadow-lg">
            <div className="p-6 border-b bg-slate-50/50 flex justify-between items-center">
                 <div>
                    <h2 className="text-xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
                        2026 Maaş Planlaması
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Aralık 2025 personel listesi baz alınmıştır.
                    </p>
                </div>
            </div>

            <div className="p-0">
                <Table>
                    <TableHeader className="bg-slate-100">
                        <TableRow>
                            <TableHead className="w-[200px]">Ad Soyad</TableHead>
                            <TableHead className="w-[150px]">Çalışan Tipi</TableHead>
                            <TableHead className="w-[150px]">2026 Net Maaş</TableHead>
                            <TableHead className="text-right">Yıllık Toplam İşveren Maliyeti</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {uniqueEmployees.map(emp => {
                            const state = plannerState[emp.tcNo] || { netSalary: "", type: "normal" };
                            const cost = getCost(emp.tcNo);

                            return (
                                <TableRow key={emp.tcNo}>
                                    <TableCell className="font-medium">{emp.adSoyad}</TableCell>
                                    <TableCell>
                                        <Select 
                                            value={state.type} 
                                            onValueChange={(val: "normal" | "retired") => 
                                                setPlannerState(prev => ({
                                                    ...prev,
                                                    [emp.tcNo]: { ...prev[emp.tcNo], type: val }
                                                }))
                                            }
                                        >
                                            <SelectTrigger className="h-8">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="normal">Normal</SelectItem>
                                                <SelectItem value="retired">Emekli (SGDP)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell>
                                        <Input 
                                            className="h-8" 
                                            placeholder="0.00"
                                            value={state.netSalary}
                                            onChange={(e) => 
                                                setPlannerState(prev => ({
                                                    ...prev,
                                                    [emp.tcNo]: { ...prev[emp.tcNo], netSalary: e.target.value }
                                                }))
                                            }
                                        />
                                    </TableCell>
                                    <TableCell className="text-right font-bold text-blue-700">
                                        {cost > 0 ? formatCurrency(cost) : "-"}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                        {/* TOPLAM SATIRI */}
                        <TableRow className="bg-slate-100 font-bold border-t-2 border-slate-400">
                            <TableCell colSpan={3} className="text-right">GENEL TOPLAM:</TableCell>
                            <TableCell className="text-right text-blue-900 text-lg">
                                {formatCurrency(calculations.reduce((a, b) => a + b.totalCost, 0))}
                            </TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </div>
        </Card>
    );
}

function SalaryCalculator() {
    const months = [
        "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
        "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"
    ];

    // State
    const [netSalaries, setNetSalaries] = useState<string[]>(Array(12).fill(""));
    const [params, setParams] = useState<CalculationParams>({
        employeeType: "normal",
        hasBes: false,
        disabilityDegree: 0,
        isTreasuryIncentiveApplied: true
    });
    const [results, setResults] = useState<SalaryResult[]>([]);

    // Toplu giriş için
    const [baseNetSalary, setBaseNetSalary] = useState<string>("");

    const handleCalculate = () => {
        const numericSalaries = netSalaries.map(val => parseFloat(val) || 0);
        const calculatedResults = calculateYearlySalary(numericSalaries, params);
        setResults(calculatedResults);
    };

    // Tüm aylara uygula butonu için
    const applyBaseSalaryToAll = () => {
        if (!baseNetSalary) return;
        setNetSalaries(Array(12).fill(baseNetSalary));
    };

    return (
        <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-12">
                {/* Sol Panel: Ayarlar ve Girişler */}
                <Card className="col-span-12 lg:col-span-3">
                    <CardHeader>
                        <CardTitle>Parametreler</CardTitle>
                        <CardDescription>Hesaplama kriterlerini belirleyin.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                            <Label>Çalışan Tipi</Label>
                            <Select 
                                value={params.employeeType} 
                                onValueChange={(v: "normal" | "retired") => setParams({...params, employeeType: v})}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Seçiniz" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="normal">Normal Çalışan</SelectItem>
                                    <SelectItem value="retired">Emekli (SGDP)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex items-center justify-between space-x-2">
                            <Label htmlFor="bes-toggle" className="flex flex-col space-y-1">
                                <span>Zorunlu BES</span>
                                <span className="font-normal text-xs text-muted-foreground">Net ücretten kesilir</span>
                            </Label>
                            <Switch 
                                id="bes-toggle" 
                                checked={params.hasBes}
                                onCheckedChange={(checked) => setParams({...params, hasBes: checked})}
                            />
                        </div>

                        <div className="flex items-center justify-between space-x-2">
                            <Label htmlFor="incentive-toggle" className="flex flex-col space-y-1">
                                <span>5 Puanlık İndirim</span>
                                <span className="font-normal text-xs text-muted-foreground">İşveren vergisinden düşer</span>
                            </Label>
                            <Switch 
                                id="incentive-toggle" 
                                checked={params.isTreasuryIncentiveApplied}
                                onCheckedChange={(checked) => setParams({...params, isTreasuryIncentiveApplied: checked})}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Engellilik Derecesi</Label>
                            <Select 
                                value={params.disabilityDegree.toString()} 
                                onValueChange={(v) => setParams({...params, disabilityDegree: parseInt(v) as any})}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Yok" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="0">Yok</SelectItem>
                                    <SelectItem value="1">1. Derece</SelectItem>
                                    <SelectItem value="2">2. Derece</SelectItem>
                                    <SelectItem value="3">3. Derece</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="pt-4 border-t space-y-4">
                            <div className="space-y-2">
                                <Label>Tüm Aylar İçin Net Maaş</Label>
                                <div className="flex space-x-2">
                                    <Input 
                                        type="number" 
                                        placeholder="Örn: 25000" 
                                        value={baseNetSalary}
                                        onChange={(e) => setBaseNetSalary(e.target.value)}
                                    />
                                    <Button variant="secondary" onClick={applyBaseSalaryToAll}>Uygula</Button>
                                </div>
                            </div>
                            
                            <Button onClick={handleCalculate} className="w-full">Hesapla</Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Sağ Panel: Yıllık Izgara */}
                <Card className="col-span-12 lg:col-span-9 overflow-hidden">
                    <CardHeader>
                        <CardTitle>Yıllık Bordro Simülasyonu (2026)</CardTitle>
                        <CardDescription>Ay bazlı detaylı hesaplama tablosu</CardDescription>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                        <Table className="w-auto min-w-full text-xs">
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[100px] sticky left-0 bg-background z-10 font-bold border-r">KALEMLER</TableHead>
                                    {months.map(m => <TableHead key={m} className="text-center min-w-[100px]">{m}</TableHead>)}
                                    <TableHead className="text-center font-bold bg-muted/20">TOPLAM</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {/* GİRİŞ SATIRI */}
                                <TableRow className="bg-blue-50/50 hover:bg-blue-50">
                                    <TableCell className="font-bold border-r sticky left-0 bg-background">NET MAAŞ (Giriş)</TableCell>
                                    {netSalaries.map((salary, i) => (
                                        <TableCell key={i} className="p-1">
                                            <Input 
                                                className="h-8 text-xs text-center border-blue-200" 
                                                value={salary}
                                                onChange={(e) => {
                                                    const newSalaries = [...netSalaries];
                                                    newSalaries[i] = e.target.value;
                                                    setNetSalaries(newSalaries);
                                                }}
                                            />
                                        </TableCell>
                                    ))}
                                    <TableCell className="text-center font-bold">
                                        {formatCurrency(netSalaries.reduce((acc, curr) => acc + (parseFloat(curr)||0), 0))}
                                    </TableCell>
                                </TableRow>

                                {/* SONUÇLAR */}
                                {results.length > 0 && (
                                    <>
                                        <TableRow className="bg-muted/50 font-bold border-t-2 border-black/10">
                                            <TableCell className="border-r sticky left-0 bg-background">BRÜT MAAŞ</TableCell>
                                            {results.map((r, i) => <TableCell key={i} className="text-right">{formatCurrency(r.gross)}</TableCell>)}
                                            <TableCell className="text-right font-bold">{formatCurrency(results.reduce((a,b)=>a+b.gross,0))}</TableCell>
                                        </TableRow>
                                        
                                        <TableRow>
                                            <TableCell className="border-r sticky left-0 bg-background text-red-600">SGK İşçi ({params.employeeType === 'retired'?'%7.5':'%14'})</TableCell>
                                            {results.map((r, i) => <TableCell key={i} className="text-right text-red-600">-{formatCurrency(r.sgkWorker)}</TableCell>)}
                                            <TableCell className="text-right text-red-600">-{formatCurrency(results.reduce((a,b)=>a+b.sgkWorker,0))}</TableCell>
                                        </TableRow>

                                        {params.employeeType !== 'retired' && (
                                            <TableRow>
                                                <TableCell className="border-r sticky left-0 bg-background text-red-600">İşsizlik İşçi (%1)</TableCell>
                                                {results.map((r, i) => <TableCell key={i} className="text-right text-red-600">-{formatCurrency(r.unemploymentWorker)}</TableCell>)}
                                                <TableCell className="text-right text-red-600">-{formatCurrency(results.reduce((a,b)=>a+b.unemploymentWorker,0))}</TableCell>
                                            </TableRow>
                                        )}

                                        <TableRow className="bg-orange-50/30">
                                            <TableCell className="border-r sticky left-0 bg-background ">GV Matrahı</TableCell>
                                            {results.map((r, i) => <TableCell key={i} className="text-right text-muted-foreground">{formatCurrency(r.incomeTaxBase)}</TableCell>)}
                                            <TableCell className="text-right text-muted-foreground">{formatCurrency(results.reduce((a,b)=>a+b.incomeTaxBase,0))}</TableCell>
                                        </TableRow>

                                        <TableRow className="bg-orange-50/30">
                                            <TableCell className="border-r sticky left-0 bg-background italic">Kümülatif Matrah</TableCell>
                                            {results.map((r, i) => <TableCell key={i} className="text-right text-muted-foreground text-[10px]">{formatCurrency(r.cumulativeTaxBase)}</TableCell>)}
                                            <TableCell className="text-right">-</TableCell>
                                        </TableRow>

                                        <TableRow>
                                            <TableCell className="border-r sticky left-0 bg-background text-red-600">Hesaplanan Gelir Vergisi</TableCell>
                                            {results.map((r, i) => <TableCell key={i} className="text-right text-red-600 font-medium">-{formatCurrency(r.incomeTax)}</TableCell>)}
                                            <TableCell className="text-right text-red-600 font-bold">-{formatCurrency(results.reduce((a,b)=>a+b.incomeTax,0))}</TableCell>
                                        </TableRow>

                                        <TableRow>
                                            <TableCell className="border-r sticky left-0 bg-background text-green-600">Asgari Ücret GV İstisnası</TableCell>
                                            {results.map((r, i) => <TableCell key={i} className="text-right text-green-600 font-medium">+{formatCurrency(r.minWageTaxExemption)}</TableCell>)}
                                            <TableCell className="text-right text-green-600 font-bold">+{formatCurrency(results.reduce((a,b)=>a+b.minWageTaxExemption,0))}</TableCell>
                                        </TableRow>

                                        <TableRow>
                                            <TableCell className="border-r sticky left-0 bg-background text-red-600">Ödenecek Gelir Vergisi</TableCell>
                                            {results.map((r, i) => <TableCell key={i} className="text-right text-red-800 font-bold">-{formatCurrency(r.payableTax)}</TableCell>)}
                                            <TableCell className="text-right text-red-800 font-bold">-{formatCurrency(results.reduce((a,b)=>a+b.payableTax,0))}</TableCell>
                                        </TableRow>

                                        <TableRow>
                                            <TableCell className="border-r sticky left-0 bg-background text-red-600">Damga Vergisi</TableCell>
                                            {results.map((r, i) => <TableCell key={i} className="text-right text-red-600">-{formatCurrency(r.stampTax)}</TableCell>)}
                                            <TableCell className="text-right text-red-600">-{formatCurrency(results.reduce((a,b)=>a+b.stampTax,0))}</TableCell>
                                        </TableRow>
                                        
                                        <TableRow>
                                            <TableCell className="border-r sticky left-0 bg-background text-green-600">Asgari Ücret DV İstisnası</TableCell>
                                            {results.map((r, i) => <TableCell key={i} className="text-right text-green-600">+{formatCurrency(r.minWageStampExemption)}</TableCell>)}
                                            <TableCell className="text-right text-green-600">+{formatCurrency(results.reduce((a,b)=>a+b.minWageStampExemption,0))}</TableCell>
                                        </TableRow>

                                        {params.hasBes && (
                                            <TableRow>
                                                <TableCell className="border-r sticky left-0 bg-background text-red-600">BES (%3)</TableCell>
                                                {results.map((r, i) => <TableCell key={i} className="text-right text-red-600">-{formatCurrency(r.besDeduction)}</TableCell>)}
                                                <TableCell className="text-right text-red-600">-{formatCurrency(results.reduce((a,b)=>a+b.besDeduction,0))}</TableCell>
                                            </TableRow>
                                        )}

                                        <TableRow className="bg-green-50/50 font-bold border-t-2 border-black">
                                            <TableCell className="border-r sticky left-0 bg-background">ELE GEÇEN NET</TableCell>
                                            {results.map((r, i) => <TableCell key={i} className="text-right text-green-700">{formatCurrency(r.net)}</TableCell>)}
                                            <TableCell className="text-right text-green-700">{formatCurrency(results.reduce((a,b)=>a+b.net,0))}</TableCell>
                                        </TableRow>

                                        {/* İŞVEREN MALİYETLERİ */}
                                        <TableRow className="border-t-4 border-double bg-slate-100">
                                            <TableCell colSpan={14} className="text-center font-bold text-slate-700">İŞVEREN MALİYETLERİ</TableCell>
                                        </TableRow>
                                        
                                        <TableRow>
                                            <TableCell className="border-r sticky left-0 bg-background font-semibold">İşveren SGK Payı ({params.employeeType === 'retired'? '24.75%' : (params.isTreasuryIncentiveApplied ? '19.75%' : '21.75%')})</TableCell>
                                            {results.map((r, i) => <TableCell key={i} className="text-right text-slate-700">{formatCurrency(r.employerCost - r.gross - (params.employeeType === 'retired' ? 0 : r.gross * 0.02))}</TableCell>)}
                                            <TableCell className="text-right text-slate-700 font-bold">-</TableCell> 
                                        </TableRow>

                                        {params.employeeType !== 'retired' && (
                                            <TableRow>
                                                <TableCell className="border-r sticky left-0 bg-background font-semibold">İşveren İşsizlik Payı (%2)</TableCell>
                                                {results.map((r, i) => <TableCell key={i} className="text-right text-slate-700">{formatCurrency(r.gross * 0.02)}</TableCell>)}
                                                <TableCell className="text-right text-slate-700 font-bold">{formatCurrency(results.reduce((a,b)=>a + (b.gross*0.02), 0))}</TableCell>
                                            </TableRow>
                                        )}

                                        <TableRow className="border-t border-slate-300 font-bold text-blue-900">
                                            <TableCell className="border-r sticky left-0 bg-background">Toplam İşveren Maliyeti</TableCell>
                                            {results.map((r, i) => <TableCell key={i} className="text-right">{formatCurrency(r.employerCost)}</TableCell>)}
                                            <TableCell className="text-right">{formatCurrency(results.reduce((a,b)=>a+b.employerCost,0))}</TableCell>
                                        </TableRow>
                                    </>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

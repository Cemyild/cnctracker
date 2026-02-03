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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Calisan, SalaryPlan } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

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
    // 1. Çalışanları Çek
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

    const { toast } = useToast();
    const queryClient = useQueryClient();

    // 2026 Planlarını Çek
    const { data: existingPlans } = useQuery<SalaryPlan[]>({
        queryKey: ["/api/salary-plans/2026"],
        queryFn: async () => {
             const res = await fetch("/api/salary-plans/2026");
             if (!res.ok) return [];
             return res.json();
        }
    });

    // Benzersiz çalışan listesi
    const uniqueEmployees = React.useMemo(() => {
        if (!employees) return [];
        const map = new Map<string, Calisan>();
        employees.forEach(emp => {
            map.set(emp.tcNo, emp);
        });
        return Array.from(map.values());
    }, [employees]);

    // Durum Yönetimi
    const [plannerState, setPlannerState] = React.useState<{
        [tcNo: string]: {
            netSalary: string;
            type: "normal" | "retired" | "management";
        }
    }>({});
    const [selectedBranch, setSelectedBranch] = React.useState<string>("all");
    const [increaseRate, setIncreaseRate] = React.useState<string>("");

    // Toplu Zam Uygula
    const handleApplyIncrease = () => {
        const rate = parseFloat(increaseRate);
        if (isNaN(rate) || rate <= 0) return;

        setPlannerState(prev => {
            const newState = { ...prev };
            filteredEmployees.forEach(emp => {
                const currentNet = historical2025[emp.tcNo]?.decNet || 0;
                if (currentNet > 0) {
                    const newNet = currentNet + (currentNet * rate / 100);
                    // Mevcut tipleri koru, sadece maaşı güncelle
                    newState[emp.tcNo] = {
                        ...newState[emp.tcNo],
                        netSalary: newNet.toFixed(2)
                    };
                }
            });
            return newState;
        });
    };


    // Kaydetme Fonksiyonu
    const saveMutation = useMutation({
        mutationFn: async (payload: any) => {
             const res = await fetch("/api/salary-plans", {
                 method: "POST",
                 headers: { "Content-Type": "application/json" },
                 body: JSON.stringify(payload)
             });
             if (!res.ok) throw new Error("Kaydetme hatası");
             return res.json();
        },
        onSuccess: () => {
             toast({
                 title: "Başarılı",
                 description: "2026 Maaş Planlaması kaydedildi.",
                 variant: "default",
                 className: "bg-green-600 text-white"
             });
             queryClient.invalidateQueries({ queryKey: ["/api/salary-plans/2026"] });
        },
        onError: () => {
             toast({
                 title: "Hata",
                 description: "Kaydedilirken bir sorun oluştu.",
                 variant: "destructive"
             });
        }
    });

    const handleSave = () => {
        const data = Object.entries(plannerState).map(([tcNo, val]) => ({
            tcNo,
            year: 2026,
            netSalary: val.netSalary,
            employeeType: val.type,
            branch: uniqueEmployees.find(e => e.tcNo === tcNo)?.sube || "Merkez"
        }));

        saveMutation.mutate({ year: 2026, data });
    };

    // Varsayılanları Yükle
    React.useEffect(() => {
        if (uniqueEmployees.length > 0) {
            setPlannerState(prev => {
                const newState = { ...prev };
                uniqueEmployees.forEach(emp => {
                    if (!newState[emp.tcNo]) {
                        const isRetired = emp.statu === "EMEKLİ";
                        const isManagement = emp.statu === "YÖNETİM" || emp.statu === "YÖNETİCİ";
                        
                        newState[emp.tcNo] = {
                            netSalary: "",
                            type: isManagement ? "management" : (isRetired ? "retired" : "normal")
                        };
                    }
                });
                return newState;
            });
        }
    }, [uniqueEmployees]);

    // Kayıtlı Verileri State'e Yükle (Eğer varsa)
    React.useEffect(() => {
        if (existingPlans && existingPlans.length > 0 && uniqueEmployees.length > 0) {
             setPlannerState(prev => {
                 const newState = { ...prev };
                 existingPlans.forEach(plan => {
                     // Check if employee valid
                     const emp = uniqueEmployees.find(e => e.tcNo === plan.tcNo);
                     if (emp) {
                         newState[emp.tcNo] = {
                             netSalary: plan.netSalary ? String(plan.netSalary) : "",
                             type: (plan.employeeType as any) || "normal"
                         };
                     }
                 });
                 return newState;
             });
        }
    }, [existingPlans, uniqueEmployees]);

    // Filtrelenmiş Liste
    const filteredEmployees = React.useMemo(() => {
        if (selectedBranch === "all") return uniqueEmployees;
        return uniqueEmployees.filter(emp => emp.sube === selectedBranch);
    }, [uniqueEmployees, selectedBranch]);

    // 2025 Geçmiş Verilerini Hazırla (Maaş ve Toplam Maliyet)
    const historical2025 = React.useMemo(() => {
        const data: Record<string, { decNet: number; yearlyTotalCost: number }> = {};
        uniqueEmployees.forEach(emp => {
            let decNet = 0;
            // Manuel düzeltmeler (Kullanıcı isteği)
            if (emp.adSoyad.toUpperCase().includes("CİHANGİR ÖZDEN")) {
                decNet = 45000;
            } else if (emp.adSoyad.toUpperCase().includes("ERCAN KAAN EREN")) {
                decNet = 66000;
            } else if (emp.adSoyad.toUpperCase().includes("AHMET GENCER")) {
                decNet = 84100;
            } else {
                // Veritabanından Aralık 2025 verisini bul
                const decRec = employees?.find(e => e.tcNo === emp.tcNo && (e.ay === "12" || e.ay === "aralik") && e.yil === 2025);
                decNet = Number(decRec?.netUcret || 0);
            }

            // 2025 Yıllık Toplam Maliyet (Brüt + İşveren Payları Toplamı)
            const yearlyRecs = employees?.filter(e => e.tcNo === emp.tcNo && e.yil === 2025) || [];
            const yearlyTotalCost = yearlyRecs.reduce((sum, r) => {
                const brut = Number(r.brutUcret || 0);
                const sgk = Number(r.isverenSgkPayi || 0);
                const issizlik = Number(r.isverenIssizlikPayi || 0);
                return sum + brut + sgk + issizlik;
            }, 0);

            data[emp.tcNo] = { decNet, yearlyTotalCost };
        });
        return data;
    }, [employees, uniqueEmployees]);

    // Hesaplama
    const calculations = React.useMemo(() => {
        const results: any[] = [];
        
        uniqueEmployees.forEach(emp => {
            const state = plannerState[emp.tcNo];
            if (!state) return;

            const netInput = parseFloat(state.netSalary);
            
            if (!isNaN(netInput) && netInput > 0) {
                const monthlyNets = Array(12).fill(netInput);
                const params: CalculationParams = {
                    employeeType: state.type,
                    hasBes: false,
                    disabilityDegree: 0,
                    isTreasuryIncentiveApplied: true
                };
                
                const yearlyResult = calculateYearlySalary(monthlyNets, params);
                const totalCost = yearlyResult.reduce((sum, m) => sum + m.employerCost, 0);
                const totalGross = yearlyResult.reduce((sum, m) => sum + m.gross, 0);
                const totalEmployerShare = yearlyResult.reduce((sum, m) => sum + (m.employerCost - m.gross), 0);
                
                results.push({
                    tcNo: emp.tcNo,
                    totalCost,
                    totalGross,
                    totalEmployerShare
                });
            }
        });
        return results;
    }, [uniqueEmployees, plannerState]);

    const getResult = (tcNo: string) => calculations.find(c => c.tcNo === tcNo);

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
                <div className="flex items-end gap-4">
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-semibold text-slate-500 uppercase">Toplu Zam %</Label>
                        <div className="flex items-center gap-2">
                            <Input 
                                className="w-20 h-9" 
                                placeholder="%" 
                                type="number"
                                value={increaseRate}
                                onChange={(e) => setIncreaseRate(e.target.value)}
                            />
                            <Button variant="secondary" size="sm" onClick={handleApplyIncrease} className="h-9">Uygula</Button>
                        </div>
                    </div>
                    <div className="w-px h-10 bg-slate-200 mx-2"></div>
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-semibold text-slate-500 uppercase">Şube Filtresi</Label>
                        <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                        <SelectTrigger className="w-[200px] h-9">
                            <SelectValue placeholder="Tüm Şubeler" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Tüm Şubeler</SelectItem>
                            {Array.from(new Set(uniqueEmployees.map(e => e.sube))).filter(Boolean).map(sube => (
                                <SelectItem key={sube!} value={sube!}>{sube}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    </div>
                </div>
            </div>

            <div className="p-0">
                <Table>
                    <TableHeader className="bg-slate-100">
                        <TableRow>
                            <TableHead className="w-[200px]">Ad Soyad</TableHead>
                            <TableHead className="w-[150px]">Çalışan Tipi</TableHead>
                            <TableHead className="w-[150px]">2025 Net Maaş</TableHead>
                            <TableHead className="w-[150px]">2026 Net Maaş</TableHead>
                            <TableHead className="w-[100px] text-center">Fark %</TableHead>
                            <TableHead className="w-[150px] text-right">Yıllık Toplam Brüt</TableHead>
                            <TableHead className="w-[150px] text-right">Yıllık İşveren Payı</TableHead>
                            <TableHead className="w-[150px] text-right text-slate-500">2025 Yıllık Maliyet</TableHead>
                            <TableHead className="w-[150px] text-right">2026 Yıllık Maliyet</TableHead>
                            <TableHead className="w-[100px] text-center">Değişim %</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredEmployees.map(emp => {
                            const state = plannerState[emp.tcNo] || { netSalary: "", type: "normal" };

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
                                                <SelectItem value="management">Yönetim (Huzur Hakkı)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell>
                                        <div className="text-sm font-semibold text-slate-600 bg-slate-100 p-1 px-2 rounded text-center">
                                            {historical2025[emp.tcNo]?.decNet > 0 ? formatCurrency(historical2025[emp.tcNo].decNet) : "-"}
                                        </div>
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
                                    <TableCell className="text-center font-semibold text-slate-500">
                                        {(() => {
                                            const net26 = parseFloat(state.netSalary);
                                            const net25 = historical2025[emp.tcNo]?.decNet;
                                            if (!isNaN(net26) && net25 > 0) {
                                                const diff = ((net26 / net25) - 1) * 100;
                                                return <span className={diff > 0 ? "text-green-600" : "text-blue-600"}>%{diff.toFixed(1)}</span>;
                                            }
                                            return "-";
                                        })()}
                                    </TableCell>
                                    <TableCell className="text-right text-muted-foreground">
                                        {getResult(emp.tcNo)?.totalGross ? formatCurrency(getResult(emp.tcNo)!.totalGross) : "-"}
                                    </TableCell>
                                    <TableCell className="text-right text-muted-foreground">
                                        {getResult(emp.tcNo)?.totalEmployerShare ? formatCurrency(getResult(emp.tcNo)!.totalEmployerShare) : "-"}
                                    </TableCell>
                                    <TableCell className="text-right text-slate-400">
                                        {historical2025[emp.tcNo]?.yearlyTotalCost > 0 ? formatCurrency(historical2025[emp.tcNo].yearlyTotalCost) : "-"}
                                    </TableCell>
                                    <TableCell className="text-right font-bold text-blue-700">
                                        {getResult(emp.tcNo)?.totalCost ? formatCurrency(getResult(emp.tcNo)!.totalCost) : "-"}
                                    </TableCell>
                                    <TableCell className="text-center font-bold">
                                        {(() => {
                                            const cost26 = getResult(emp.tcNo)?.totalCost;
                                            const cost25 = historical2025[emp.tcNo]?.yearlyTotalCost;
                                            if (cost26 && cost25 > 0) {
                                                const diff = ((cost26 / cost25) - 1) * 100;
                                                return <span className={diff > 30 ? "text-red-600" : "text-slate-600"}>%{diff.toFixed(1)}</span>;
                                            }
                                            return "-";
                                        })()}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                        {/* TOPLAM SATIRI */}
                        {/* TOTAL COMPARISON ROWS */}
                        {/* 1. MONTHLY NET TOTALS */}
                        <TableRow className="bg-slate-100 font-bold border-t-2 border-slate-400">
                             <TableCell colSpan={2} className="text-right text-slate-500 italic pb-0 pt-4">Aylık Net Toplamlar:</TableCell>
                             
                             {/* 2025 Dec Net Sum (Col 2) */}
                             <TableCell className="text-center text-slate-600 underline pb-0 pt-4">
                                 {formatCurrency(filteredEmployees.reduce((sum, emp) => sum + (historical2025[emp.tcNo]?.decNet || 0), 0))}
                             </TableCell>
                             
                             {/* 2026 Monthly Net Sum (Col 3) */}
                             <TableCell className="text-center text-blue-700 underline pb-0 pt-4">
                                {formatCurrency(filteredEmployees.reduce((sum, emp) => {
                                    const val = parseFloat(plannerState[emp.tcNo]?.netSalary || "0");
                                    return sum + (isNaN(val) ? 0 : val);
                                }, 0))}
                             </TableCell>

                             {/* Change % (Col 4) */}
                             <TableCell className="text-center text-slate-500 pb-0 pt-4">
                                {(() => {
                                    const net26 = filteredEmployees.reduce((sum, emp) => {
                                        const val = parseFloat(plannerState[emp.tcNo]?.netSalary || "0");
                                        return sum + (isNaN(val) ? 0 : val);
                                    }, 0);
                                    const net25 = filteredEmployees.reduce((sum, emp) => sum + (historical2025[emp.tcNo]?.decNet || 0), 0);
                                    if (net26 > 0 && net25 > 0) {
                                        const diff = ((net26 / net25) - 1) * 100;
                                        return <span className={diff > 30 ? "text-red-600" : "text-slate-600"}>%{diff.toFixed(1)}</span>;
                                    }
                                    return "-";
                                })()}
                             </TableCell>
                             
                             <TableCell colSpan={5} className="pb-0 pt-4"></TableCell>
                        </TableRow>

                        {/* 2. ANNUAL TOTALS */}
                        <TableRow className="bg-slate-100 font-bold">
                            <TableCell colSpan={7} className="text-right text-slate-500 italic">Yıllık Toplam Maliyetler:</TableCell>
                            
                            {/* 2025 Annual Cost (Col 7) */}
                            <TableCell className="text-right text-slate-500">
                                {formatCurrency(filteredEmployees.reduce((sum, emp) => sum + (historical2025[emp.tcNo]?.yearlyTotalCost || 0), 0))}
                            </TableCell>

                            {/* 2026 Annual Cost (Col 8) */}
                            <TableCell className="text-right text-blue-900 text-lg">
                                {formatCurrency(calculations.filter(c => filteredEmployees.some(e => e.tcNo === c.tcNo)).reduce((a, b) => a + b.totalCost, 0))}
                            </TableCell>
                            
                            {/* Comparison % (Col 9) */}
                            <TableCell className="text-center">
                                {(() => {
                                    const c26 = calculations.filter(c => filteredEmployees.some(e => e.tcNo === c.tcNo)).reduce((a, b) => a + b.totalCost, 0);
                                    const c25 = filteredEmployees.reduce((sum, emp) => sum + (historical2025[emp.tcNo]?.yearlyTotalCost || 0), 0);
                                    if (c26 > 0 && c25 > 0) {
                                        const diff = ((c26 / c25) - 1) * 100;
                                        return <span className="text-blue-900 underline">%{diff.toFixed(1)}</span>;
                                    }
                                    return "-";
                                })()}
                            </TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </div>
            
            <div className="p-4 bg-slate-50 border-t flex justify-end">
                <Button onClick={handleSave} disabled={saveMutation.isPending} className="bg-green-600 hover:bg-green-700 text-white w-40">
                    {saveMutation.isPending ? "Kaydediliyor..." : "Kaydet"}
                </Button>
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
                                onValueChange={(v: "normal" | "retired" | "management") => setParams({...params, employeeType: v})}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Seçiniz" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="normal">Normal Çalışan</SelectItem>
                                    <SelectItem value="retired">Emekli (SGDP)</SelectItem>
                                    <SelectItem value="management">Yönetim (Huzur Hakkı)</SelectItem>
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
                                            <TableCell className="border-r sticky left-0 bg-background font-semibold">İşveren SGK Payı ({
                                                params.employeeType === 'management' ? '%0' : 
                                                (params.employeeType === 'retired' ? '24.75%' : (params.isTreasuryIncentiveApplied ? '19.75%' : '21.75%'))
                                            })</TableCell>
                                            {results.map((r, i) => <TableCell key={i} className="text-right text-slate-700">{formatCurrency(r.employerCost - r.gross - (params.employeeType === 'retired' || params.employeeType === 'management' ? 0 : r.gross * 0.02))}</TableCell>)}
                                            <TableCell className="text-right text-slate-700 font-bold">-</TableCell> 
                                        </TableRow>

                                        {params.employeeType !== 'retired' && params.employeeType !== 'management' && (
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

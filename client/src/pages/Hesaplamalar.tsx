import React, { useState, useEffect } from "react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { calculateYearlySalary, CalculationParams, SalaryResult, calculateNetFromGross, findGrossFromNet } from "@/lib/salary-utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Calculator, Download } from "lucide-react";
import * as XLSX from "xlsx";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Calisan, SalaryPlan } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

function formatCurrency(amount: number) {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(amount);
}

export default function Hesaplamalar() {
    const [tab, setTab] = useState("maas");

    const TABS = [
        { id: "maas", label: "Maaş Hesaplama (Tekil)" },
        { id: "2026-plan", label: "2026 Planlama (Toplu)" },
        { id: "2026-monthly", label: "2026 Aylık" },
        { id: "yemek", label: "Yemek Kartı" },
        { id: "tarife", label: "Tarife" },
    ];

    return (
        <div className="min-h-full bg-slate-50 dark:bg-background">
            <div className="px-6 pb-12 lg:px-8">
                <Tabs value={tab} onValueChange={setTab} className="w-full">
                    {/* ===== STICKY HEADER + TABS ===== */}
                    <div className="sticky top-0 z-20 border-b border-border/70 bg-slate-50/90 pt-5 backdrop-blur dark:bg-background/90">
                        <div className="flex flex-wrap items-end justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400">
                                    <Calculator className="h-[22px] w-[22px]" strokeWidth={1.8} />
                                </div>
                                <div>
                                    <h1 className="text-[21px] font-extrabold tracking-tight">Hesaplamalar</h1>
                                    <p className="mt-0.5 text-[12.5px] text-muted-foreground">Maaş, planlama ve tarife hesaplama araçları</p>
                                </div>
                            </div>
                        </div>
                        {/* Tab barı — aktif tab inset alt çizgi */}
                        <div className="mt-3.5 flex flex-wrap gap-1">
                            {TABS.map((t) => (
                                <button
                                    key={t.id}
                                    onClick={() => setTab(t.id)}
                                    className={cn(
                                        "rounded-t-lg px-3.5 py-2.5 text-[13.5px] transition-colors",
                                        tab === t.id
                                            ? "font-bold text-foreground shadow-[inset_0_-2px_0_#0ea5e9]"
                                            : "font-semibold text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <TabsContent value="maas" className="mt-5">
                        <SalaryCalculator />
                    </TabsContent>

                    <TabsContent value="2026-plan" className="mt-5">
                        <SalaryPlanning2026 />
                    </TabsContent>

                    <TabsContent value="2026-monthly" className="mt-5">
                        <SalaryMonthly2026 />
                    </TabsContent>

                    <TabsContent value="yemek" className="mt-5">
                        <div className="flex flex-col items-center justify-center gap-4 rounded-[14px] border bg-card p-12 text-center">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                                <Calculator className="h-6 w-6" />
                            </div>
                            <h3 className="text-lg font-semibold text-foreground">Yemek Kartı Hesaplama</h3>
                            <p className="max-w-sm text-sm text-muted-foreground">
                                Bu modül henüz geliştirme aşamasındadır. Yakında kullanıma açılacaktır.
                            </p>
                        </div>
                    </TabsContent>

                    <TabsContent value="tarife" className="mt-5">
                        <div className="flex flex-col items-center justify-center gap-4 rounded-[14px] border bg-card p-12 text-center">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-50 text-violet-600">
                                <Calculator className="h-6 w-6" />
                            </div>
                            <h3 className="text-lg font-semibold text-foreground">Gümrük Tarife Hesaplama</h3>
                            <p className="max-w-sm text-sm text-muted-foreground">
                                Bu modül henüz geliştirme aşamasındadır. Yakında kullanıma açılacaktır.
                            </p>
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
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

    // Excel Export
    const handleExportExcel = () => {
        // 1. Prepare Data
        const rows = filteredEmployees.map(emp => {
            const state = plannerState[emp.tcNo] || { netSalary: "", type: "normal" };
            const net26 = parseFloat(state.netSalary);
            const net25 = historical2025[emp.tcNo]?.decNet || 0;
            const res = getResult(emp.tcNo);
            const cost26 = res?.totalCost || 0;
            const cost25 = historical2025[emp.tcNo]?.yearlyTotalCost || 0;
            
            // Calculate differences for raw data (formulas will be applied in Excel)
            const netDiff = (net26 && net25) ? ((net26 / net25) - 1) : 0;
            const costDiff = (cost26 && cost25) ? ((cost26 / cost25) - 1) : 0;

            return {
                "Ad Soyad": emp.adSoyad,
                "Şube": emp.sube || "Merkez",
                "Çalışan Tipi": state.type === "retired" ? "Emekli" : (state.type === "management" ? "Yönetim" : "Normal"),
                "2025 Net Maaş": net25,
                "2026 Net Maaş": net26 || 0,
                // Formulas will be injected later, placeholders here
                "Fark %": netDiff, 
                "Yıllık Toplam Brüt": res?.totalGross || 0,
                "Yıllık İşveren Payı": res?.totalEmployerShare || 0,
                "2025 Yıllık Maliyet": cost25,
                "2026 Yıllık Maliyet": cost26,
                "Değişim %": costDiff
            };
        });

        // Add Total Row Data
        // Note: For Excel, we'll usually place totals at the bottom. 
        // We will create the worksheet and then modify cells for formulas.

        const worksheet = XLSX.utils.json_to_sheet(rows);

        // Adjust Column Widths
        const wscols = [
            { wch: 25 }, // Ad Soyad
            { wch: 15 }, // Şube
            { wch: 15 }, // Tipi
            { wch: 15 }, // 2025 Net
            { wch: 15 }, // 2026 Net
            { wch: 10 }, // Fark %
            { wch: 15 }, // Yıllık Brüt
            { wch: 15 }, // Yıllık İşveren
            { wch: 15 }, // 2025 Maliyet
            { wch: 15 }, // 2026 Maliyet
            { wch: 10 }  // Değişim %
        ];
        worksheet['!cols'] = wscols;

        // Add Formulas
        // Data starts at row 2 (row 1 is header)
        // range is filteredEmployees.length
        
        const range = XLSX.utils.decode_range(worksheet['!ref']!);
        
        for (let R = range.s.r + 1; R <= range.e.r; ++R) {
            // Row number in Excel (1-indexed)
            const rowNum = R + 1; 
            
            // F column (Fark %) = (E - D) / D  --> (2026 Net / 2025 Net) - 1
            // D is col index 3, E is col index 4. F is index 5.
            const cellRef2025Net = XLSX.utils.encode_cell({r: R, c: 3});
            const cellRef2026Net = XLSX.utils.encode_cell({r: R, c: 4});
            const cellRefFark = XLSX.utils.encode_cell({r: R, c: 5});

            // Set formula for "Fark %"
            // IF(D2>0, (E2/D2)-1, 0)
            worksheet[cellRefFark] = { t: 'n', f: `IF(${cellRef2025Net}>0,(${cellRef2026Net}/${cellRef2025Net})-1,0)`, z: '0.0%' };

            // K column (Değişim %) = (J - I) / I
            // I is col index 8, J is col index 9. K is index 10.
            const cellRef2025Cost = XLSX.utils.encode_cell({r: R, c: 8});
            const cellRef2026Cost = XLSX.utils.encode_cell({r: R, c: 9});
            const cellRefDegisim = XLSX.utils.encode_cell({r: R, c: 10});

             worksheet[cellRefDegisim] = { t: 'n', f: `IF(${cellRef2025Cost}>0,(${cellRef2026Cost}/${cellRef2025Cost})-1,0)`, z: '0.0%' };
             
             // Format other numbers
             // 2025 Net
             worksheet[cellRef2025Net].z = '#,##0.00';
             // 2026 Net
             worksheet[cellRef2026Net].z = '#,##0.00';
             // Yıllık Brüt, İşveren Payı, 2025 Cost, 2026 Cost
             worksheet[XLSX.utils.encode_cell({r: R, c: 6})].z = '#,##0.00';
             worksheet[XLSX.utils.encode_cell({r: R, c: 7})].z = '#,##0.00';
             worksheet[cellRef2025Cost].z = '#,##0.00';
             worksheet[cellRef2026Cost].z = '#,##0.00';
        }

        // Add Total Row at the bottom
        const totalRowIdx = range.e.r + 1;
        
        // Label
        worksheet[XLSX.utils.encode_cell({r: totalRowIdx, c: 0})] = { v: "TOPLAM", t: 's', s: { font: { bold: true } } };
        
        // Sum Formulas
        const numericCols = [3, 4, 6, 7, 8, 9]; // indices of columns to sum
        numericCols.forEach(c => {
            const start = XLSX.utils.encode_cell({r: 1, c: c});
            const end = XLSX.utils.encode_cell({r: totalRowIdx - 1, c: c});
            const cell = XLSX.utils.encode_cell({r: totalRowIdx, c: c});
            worksheet[cell] = { t: 'n', f: `SUM(${start}:${end})`, z: '#,##0.00' };
        });

        // Total Percentage Formulas
        // Fark % for Totals
        const total2025NetRef = XLSX.utils.encode_cell({r: totalRowIdx, c: 3});
        const total2026NetRef = XLSX.utils.encode_cell({r: totalRowIdx, c: 4});
        const totalFarkRef = XLSX.utils.encode_cell({r: totalRowIdx, c: 5});
        worksheet[totalFarkRef] = { t: 'n', f: `IF(${total2025NetRef}>0,(${total2026NetRef}/${total2025NetRef})-1,0)`, z: '0.0%' };

        // Değişim % for Totals
        const total2025CostRef = XLSX.utils.encode_cell({r: totalRowIdx, c: 8});
        const total2026CostRef = XLSX.utils.encode_cell({r: totalRowIdx, c: 9});
        const totalDegisimRef = XLSX.utils.encode_cell({r: totalRowIdx, c: 10});
        worksheet[totalDegisimRef] = { t: 'n', f: `IF(${total2025CostRef}>0,(${total2026CostRef}/${total2025CostRef})-1,0)`, z: '0.0%' };

        // Update range
        worksheet['!ref'] = XLSX.utils.encode_range({s: {c:0, r:0}, e: {c: 10, r: totalRowIdx}});

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "2026 Maaş Planı");
        XLSX.writeFile(workbook, "2026-Maas-Planlamasi.xlsx");
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
        <Card className="rounded-[14px] border bg-card shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b bg-slate-50/60 p-5">
                <div>
                    <h2 className="text-[15px] font-extrabold tracking-tight text-foreground">
                        2026 Maaş Planlaması
                    </h2>
                    <p className="mt-1 text-[12.5px] text-muted-foreground">
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

            <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow className="hover:bg-transparent">
                            <TableHead className="w-[200px] text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Ad Soyad</TableHead>
                            <TableHead className="w-[150px] text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Çalışan Tipi</TableHead>
                            <TableHead className="w-[150px] text-[10.5px] font-bold uppercase tracking-wide text-slate-500">2025 Net Maaş</TableHead>
                            <TableHead className="w-[150px] text-[10.5px] font-bold uppercase tracking-wide text-slate-500">2026 Net Maaş</TableHead>
                            <TableHead className="w-[100px] text-center text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Fark %</TableHead>
                            <TableHead className="w-[150px] text-right text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Yıllık Toplam Brüt</TableHead>
                            <TableHead className="w-[150px] text-right text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Yıllık İşveren Payı</TableHead>
                            <TableHead className="w-[150px] text-right text-[10.5px] font-bold uppercase tracking-wide text-slate-500">2025 Yıllık Maliyet</TableHead>
                            <TableHead className="w-[150px] text-right text-[10.5px] font-bold uppercase tracking-wide text-slate-500">2026 Yıllık Maliyet</TableHead>
                            <TableHead className="w-[100px] text-center text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Değişim %</TableHead>
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
            
            <div className="flex justify-end gap-2 border-t bg-slate-50/60 p-4">
                <Button onClick={handleExportExcel} variant="outline" className="mr-2 border-green-600 text-green-700 hover:bg-green-50">
                    <Download className="mr-2 h-4 w-4" />
                    Excel İndir
                </Button>
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
                <Card className="col-span-12 rounded-[14px] border bg-card lg:col-span-3">
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
                <Card className="col-span-12 overflow-hidden rounded-[14px] border bg-card lg:col-span-9">
                    <CardHeader>
                        <CardTitle>Yıllık Bordro Simülasyonu (2026)</CardTitle>
                        <CardDescription>Ay bazlı detaylı hesaplama tablosu</CardDescription>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                        <Table className="w-auto min-w-full text-xs">
                            <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="sticky left-0 z-10 w-[100px] border-r bg-background text-[10.5px] font-bold uppercase tracking-wide text-slate-500">KALEMLER</TableHead>
                                    {months.map(m => <TableHead key={m} className="min-w-[100px] text-center text-[10.5px] font-bold uppercase tracking-wide text-slate-500">{m}</TableHead>)}
                                    <TableHead className="bg-slate-50 text-center text-[10.5px] font-bold uppercase tracking-wide text-slate-500">TOPLAM</TableHead>
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

// --- 2026 AYLIK TOPLAM MALİYET MODÜLÜ ---
function SalaryMonthly2026() {
    const { data: employees, isLoading: loadingEmployees } = useQuery<Calisan[]>({
        queryKey: ["/api/calisanlar"],
        queryFn: async () => {
            const response = await fetch("/api/calisanlar");
            if (!response.ok) throw new Error("Network response was not ok");
            return response.json();
        },
    });

    const { data: existingPlans, isLoading: loadingPlans } = useQuery<SalaryPlan[]>({
        queryKey: ["/api/salary-plans/2026"],
        queryFn: async () => {
             const res = await fetch("/api/salary-plans/2026");
             if (!res.ok) return [];
             return res.json();
        }
    });

    const [selectedBranch, setSelectedBranch] = React.useState<string>("all");

    const uniqueEmployees = React.useMemo(() => {
        if (!employees) return [];
        const map = new Map<string, Calisan>();
        employees.forEach(emp => {
            map.set(emp.tcNo, emp);
        });
        return Array.from(map.values());
    }, [employees]);

    const monthlyAggregation = React.useMemo(() => {
        const totals = Array(12).fill(null).map((_, i) => ({
            month: i,
            totalNet: 0,
            totalGross: 0,
            totalEmployerShare: 0,
            totalCost: 0
        }));

        if (!existingPlans || existingPlans.length === 0) return totals;

        existingPlans.forEach(plan => {
            const emp = uniqueEmployees.find(e => e.tcNo === plan.tcNo);
            if (!emp) return;
            if (selectedBranch !== "all" && emp.sube !== selectedBranch) return;

            const netInput = Number(plan.netSalary);
            if (isNaN(netInput) || netInput <= 0) return;

            const params: CalculationParams = {
                employeeType: (plan.employeeType as any) || "normal",
                hasBes: false,
                disabilityDegree: 0,
                isTreasuryIncentiveApplied: true
            };

            const yearlyResult = calculateYearlySalary(Array(12).fill(netInput), params);
            
            yearlyResult.forEach((res, monthIdx) => {
                totals[monthIdx].totalNet += res.net;
                totals[monthIdx].totalGross += res.gross;
                totals[monthIdx].totalEmployerShare += (res.employerCost - res.gross);
                totals[monthIdx].totalCost += res.employerCost;
            });
        });

        return totals;
    }, [existingPlans, uniqueEmployees, selectedBranch]);

    const monthNames = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

    if (loadingEmployees || loadingPlans) return <div className="p-8 text-center text-muted-foreground italic">Yükleniyor...</div>;

    return (
        <Card className="rounded-[14px] border bg-card shadow-sm">
            <CardHeader className="border-b bg-slate-50/60">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <CardTitle className="text-[15px] font-extrabold tracking-tight text-foreground">
                            2026 Aylık Toplam Maliyet Planı
                        </CardTitle>
                        <CardDescription>Planlanan maaşlara göre her ay için işveren maliyet kırılımı</CardDescription>
                    </div>
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
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
                <Table>
                    <TableHeader>
                        <TableRow className="hover:bg-transparent">
                            <TableHead className="w-[150px] text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Ay</TableHead>
                            <TableHead className="text-right text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Tpl. Net Maaş</TableHead>
                            <TableHead className="text-right text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Tpl. Brüt Maaş</TableHead>
                            <TableHead className="text-right text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Tpl. SGK/İşsizlik (İşveren)</TableHead>
                            <TableHead className="text-right text-[10.5px] font-bold uppercase tracking-wide text-violet-600">Toplam İşveren Maliyeti</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {monthlyAggregation.map((row) => (
                            <TableRow key={row.month} className={row.month % 2 === 0 ? "bg-white" : "bg-slate-50/30"}>
                                <TableCell className="font-medium">{monthNames[row.month]}</TableCell>
                                <TableCell className="text-right">{formatCurrency(row.totalNet)}</TableCell>
                                <TableCell className="text-right">{formatCurrency(row.totalGross)}</TableCell>
                                <TableCell className="text-right">{formatCurrency(row.totalEmployerShare)}</TableCell>
                                <TableCell className="text-right font-bold tabular-nums text-violet-700">{formatCurrency(row.totalCost)}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                    <TableFooter className="bg-slate-100 font-bold">
                        <TableRow>
                            <TableCell>YILLIK TOPLAM</TableCell>
                            <TableCell className="text-right">{formatCurrency(monthlyAggregation.reduce((a, b) => a + b.totalNet, 0))}</TableCell>
                            <TableCell className="text-right">{formatCurrency(monthlyAggregation.reduce((a, b) => a + b.totalGross, 0))}</TableCell>
                            <TableCell className="text-right">{formatCurrency(monthlyAggregation.reduce((a, b) => a + b.totalEmployerShare, 0))}</TableCell>
                            <TableCell className="text-right text-lg tabular-nums text-violet-900">{formatCurrency(monthlyAggregation.reduce((a, b) => a + b.totalCost, 0))}</TableCell>
                        </TableRow>
                    </TableFooter>
                </Table>
            </CardContent>
        </Card>
    );
}

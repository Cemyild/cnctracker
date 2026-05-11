import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
    PackageSearch,
    ShieldCheck,
    Car,
    Users,
    Wallet,
    AlertTriangle,
    CalendarClock,
    ChevronRight,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { KPISection } from "@/components/dashboard/KPISection";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { ModuleCard, type ModuleAccent } from "@/components/dashboard/ModuleCard";
import { Sparkline } from "@/components/dashboard/Sparkline";
import { formatCurrency, formatCurrencyShort, cn } from "@/lib/utils";
import type { Arac } from "@shared/schema";

// ----------------- Tipler -----------------
interface OzetSummaryRow {
    ay: string;
    satisToplam: number;
    giderToplam: number;
    calisanMaliyet: number;
}

interface GumrukAylikOzet {
    ay: string;
    yil: number;
    toplamSatis: number;
    toplamKdv: number;
    dosyaSayisi: number;
}

interface SigortaOzetRow {
    ay: string;
    sirket: string;
    policeSayisi: number;
    toplamPrim: number;
    toplamKomisyon: number;
}

interface TahsilatMusteri {
    musteriId: string;
    ad: string;
    sektor: string | null;
    netBakiye: number;
    gecikme: number;
    pattern: string;
    vipRozeti?: boolean;
    riskRengi?: "kirmizi" | "turuncu" | "sari" | "yesil";
    risk?: number;
}

interface TahsilatDashboard {
    mizan: { mizanTarihi: string } | null;
    ozet: {
        toplamNetAlacak: number;
        vipSayisi: number;
        donukSayisi: number;
        donukCiro: number;
        yavasOdeyiciSayisi: number;
        yavasOdeyiciCiro: number;
    } | null;
    musteriler: TahsilatMusteri[];
}

interface CalisanRow {
    tcNo: string;
    adSoyad: string;
    sube?: string | null;
    statu?: string | null;
    toplamIsverenMaliyeti: string | number | null;
}

// ----------------- Modül accent paleti -----------------
const ACCENTS = {
    gumruk: {
        bar: "bg-sky-500",
        bg: "bg-sky-500/10",
        text: "text-sky-600 dark:text-sky-400",
    } satisfies ModuleAccent,
    tahsilat: {
        bar: "bg-rose-500",
        bg: "bg-rose-500/10",
        text: "text-rose-600 dark:text-rose-400",
    } satisfies ModuleAccent,
    calisanlar: {
        bar: "bg-violet-500",
        bg: "bg-violet-500/10",
        text: "text-violet-600 dark:text-violet-400",
    } satisfies ModuleAccent,
    sigorta: {
        bar: "bg-emerald-500",
        bg: "bg-emerald-500/10",
        text: "text-emerald-600 dark:text-emerald-400",
    } satisfies ModuleAccent,
    araclar: {
        bar: "bg-amber-500",
        bg: "bg-amber-500/10",
        text: "text-amber-600 dark:text-amber-400",
    } satisfies ModuleAccent,
};

const AY_SIRA = ["ocak", "subat", "mart", "nisan", "mayis", "haziran", "temmuz", "agustos", "eylul", "ekim", "kasim", "aralik"];

// Türkçe tarih parse — schema'da tarihler "YYYY-MM-DD" veya "DD.MM.YYYY" olabilir, ikisini de destekle.
function parseTarih(s: string | null | undefined): Date | null {
    if (!s) return null;
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00`);
    const tr = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (tr) return new Date(`${tr[3]}-${tr[2]}-${tr[1]}T00:00:00`);
    return null;
}

function gunFarki(target: Date, ref: Date = new Date()): number {
    return Math.round((target.getTime() - ref.getTime()) / 86400000);
}

// ----------------- Dashboard -----------------
export default function Dashboard() {
    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
    const currentYear = new Date().getFullYear();
    const yearOptions = useMemo(() => {
        const yrs: number[] = [];
        for (let y = currentYear + 1; y >= currentYear - 3; y--) yrs.push(y);
        return yrs;
    }, [currentYear]);

    // --- Veriler ---
    const summaryQuery = useQuery<OzetSummaryRow[]>({
        queryKey: ["dashboard-summary", selectedYear],
        queryFn: async () => {
            const res = await fetch(`/api/dashboard/summary/${selectedYear}`);
            if (!res.ok) throw new Error("Veri yüklenemedi");
            return res.json();
        },
    });

    const prevSummaryQuery = useQuery<OzetSummaryRow[]>({
        queryKey: ["dashboard-summary", selectedYear - 1],
        queryFn: async () => {
            const res = await fetch(`/api/dashboard/summary/${selectedYear - 1}`);
            if (!res.ok) throw new Error("Veri yüklenemedi");
            return res.json();
        },
    });

    const gumrukOzetQuery = useQuery<GumrukAylikOzet[]>({
        queryKey: ["gumruk-ozet", selectedYear],
        queryFn: async () => {
            const res = await fetch(`/api/gumruk/ozet/${selectedYear}`);
            if (!res.ok) throw new Error("Gümrük özet yüklenemedi");
            return res.json();
        },
    });

    const sigortaOzetQuery = useQuery<SigortaOzetRow[]>({
        queryKey: ["sigorta-ozet", selectedYear],
        queryFn: async () => {
            const res = await fetch(`/api/sigorta/ozet/${selectedYear}`);
            if (!res.ok) throw new Error("Sigorta özet yüklenemedi");
            return res.json();
        },
    });

    const araclarQuery = useQuery<Arac[]>({
        queryKey: ["araclar"],
        queryFn: async () => {
            const res = await fetch(`/api/araclar`);
            if (!res.ok) throw new Error("Araçlar yüklenemedi");
            return res.json();
        },
    });

    const calisanlarQuery = useQuery<CalisanRow[]>({
        queryKey: ["calisanlar-toplam", selectedYear],
        queryFn: async () => {
            const res = await fetch(`/api/calisanlar?ay=toplam&yil=${selectedYear}`);
            if (!res.ok) throw new Error("Çalışanlar yüklenemedi");
            return res.json();
        },
    });

    const tahsilatQuery = useQuery<TahsilatDashboard>({
        queryKey: ["tahsilat-dashboard"],
        queryFn: async () => {
            const res = await fetch(`/api/tahsilat/dashboard`);
            if (!res.ok) throw new Error("Tahsilat yüklenemedi");
            return res.json();
        },
    });

    // --- KPI agregatları ---
    const aggregates = useMemo(() => {
        const data = summaryQuery.data ?? [];
        return data.reduce(
            (acc, c) => ({
                totalRevenue: acc.totalRevenue + (c.satisToplam || 0),
                totalExpenses: acc.totalExpenses + (c.giderToplam || 0) + (c.calisanMaliyet || 0),
                generalExpenses: acc.generalExpenses + (c.giderToplam || 0),
                personnelExpenses: acc.personnelExpenses + (c.calisanMaliyet || 0),
            }),
            { totalRevenue: 0, totalExpenses: 0, generalExpenses: 0, personnelExpenses: 0 }
        );
    }, [summaryQuery.data]);

    const prevAggregates = useMemo(() => {
        const data = prevSummaryQuery.data ?? [];
        return data.reduce(
            (acc, c) => ({
                totalRevenue: acc.totalRevenue + (c.satisToplam || 0),
                totalExpenses: acc.totalExpenses + (c.giderToplam || 0) + (c.calisanMaliyet || 0),
            }),
            { totalRevenue: 0, totalExpenses: 0 }
        );
    }, [prevSummaryQuery.data]);

    const netProfit = aggregates.totalRevenue - aggregates.totalExpenses;
    const profitMargin = aggregates.totalRevenue > 0 ? (netProfit / aggregates.totalRevenue) * 100 : 0;
    const prevNetProfit = prevAggregates.totalRevenue - prevAggregates.totalExpenses;
    const prevMargin = prevAggregates.totalRevenue > 0 ? (prevNetProfit / prevAggregates.totalRevenue) * 100 : 0;
    const previousYearKPI = (prevSummaryQuery.data ?? []).length > 0
        ? {
            totalRevenue: prevAggregates.totalRevenue,
            totalExpenses: prevAggregates.totalExpenses,
            netProfit: prevNetProfit,
            profitMargin: prevMargin,
        }
        : null;

    // --- Chart data (12 ay sıralı, boş ayları doldur) ---
    const chartData = useMemo(() => {
        const map = new Map((summaryQuery.data ?? []).map((r) => [r.ay, r]));
        return AY_SIRA.map((ay) => {
            const row = map.get(ay);
            return {
                ay,
                satisToplam: row?.satisToplam ?? 0,
                giderToplam: (row?.giderToplam ?? 0) + (row?.calisanMaliyet ?? 0),
            };
        });
    }, [summaryQuery.data]);

    // --- Modül kartları için türetilmiş veriler ---

    // GÜMRÜK
    const gumrukAgg = useMemo(() => {
        const data = gumrukOzetQuery.data ?? [];
        const map = new Map(data.map((r) => [r.ay, r]));
        const sparkValues = AY_SIRA.map((ay) => map.get(ay)?.toplamSatis ?? 0);
        const dosyaSayisi = data.reduce((a, r) => a + (r.dosyaSayisi || 0), 0);
        const yillikCiro = data.reduce((a, r) => a + (r.toplamSatis || 0), 0);
        // Son dolu ay
        let sonAy: GumrukAylikOzet | null = null;
        for (let i = AY_SIRA.length - 1; i >= 0; i--) {
            const r = map.get(AY_SIRA[i]);
            if (r && r.dosyaSayisi > 0) { sonAy = r; break; }
        }
        return { sparkValues, dosyaSayisi, yillikCiro, sonAy };
    }, [gumrukOzetQuery.data]);

    // SİGORTA
    const sigortaAgg = useMemo(() => {
        const data = sigortaOzetQuery.data ?? [];
        const aySpark = new Map<string, number>();
        let toplamPolice = 0;
        let toplamPrim = 0;
        const sirketMap = new Map<string, number>();
        for (const r of data) {
            toplamPolice += r.policeSayisi || 0;
            toplamPrim += r.toplamPrim || 0;
            aySpark.set(r.ay, (aySpark.get(r.ay) || 0) + (r.toplamPrim || 0));
            sirketMap.set(r.sirket, (sirketMap.get(r.sirket) || 0) + (r.toplamPrim || 0));
        }
        const sparkValues = AY_SIRA.map((ay) => aySpark.get(ay) ?? 0);
        const topSirket = Array.from(sirketMap.entries()).sort((a, b) => b[1] - a[1])[0];
        return { sparkValues, toplamPolice, toplamPrim, topSirket };
    }, [sigortaOzetQuery.data]);

    // ARAÇLAR
    const aracAgg = useMemo(() => {
        const data = araclarQuery.data ?? [];
        const now = new Date();
        let yakinYenileme = 0;
        let kritikYenileme = 0; // <= 7 gün
        let toplamSigortaMaliyet = 0;
        const subeMap = new Map<string, number>();

        for (const a of data) {
            for (const tarih of [a.trafikBitisTarihi, a.kaskoBitisTarihi]) {
                const d = parseTarih(tarih);
                if (!d) continue;
                const fark = gunFarki(d, now);
                if (fark <= 30 && fark >= -7) {
                    yakinYenileme++;
                    if (fark <= 7) kritikYenileme++;
                }
            }
            toplamSigortaMaliyet += Number(a.trafikSigortaFiyat || 0) + Number(a.kaskoSigortaFiyat || 0);
            const sube = a.sube || "Belirtilmemiş";
            subeMap.set(sube, (subeMap.get(sube) || 0) + 1);
        }
        const topSube = Array.from(subeMap.entries()).sort((a, b) => b[1] - a[1])[0];

        return {
            toplamArac: data.length,
            yakinYenileme,
            kritikYenileme,
            toplamSigortaMaliyet,
            topSube,
        };
    }, [araclarQuery.data]);

    // ÇALIŞANLAR
    const calisanAgg = useMemo(() => {
        const data = calisanlarQuery.data ?? [];
        let toplamMaliyet = 0;
        const subeMap = new Map<string, number>();
        const statuMap = new Map<string, number>();
        for (const c of data) {
            toplamMaliyet += Number(c.toplamIsverenMaliyeti || 0);
            const sube = c.sube || "Belirtilmemiş";
            subeMap.set(sube, (subeMap.get(sube) || 0) + 1);
            const statu = c.statu || "Belirsiz";
            statuMap.set(statu, (statuMap.get(statu) || 0) + 1);
        }
        const topSube = Array.from(subeMap.entries()).sort((a, b) => b[1] - a[1])[0];
        const aktif = statuMap.get("Aktif") ?? statuMap.get("aktif") ?? data.length;
        return {
            toplamPersonel: data.length,
            aktif,
            toplamMaliyet,
            topSube,
        };
    }, [calisanlarQuery.data]);

    // TAHSİLAT
    const tahsilatAgg = useMemo(() => {
        const ozet = tahsilatQuery.data?.ozet;
        const mizan = tahsilatQuery.data?.mizan;
        const musteriler = tahsilatQuery.data?.musteriler ?? [];
        const kirmiziSayi = musteriler.filter((m) => m.riskRengi === "kirmizi").length;
        const kirmiziCiro = musteriler.filter((m) => m.riskRengi === "kirmizi").reduce((a, m) => a + m.netBakiye, 0);
        const turuncuSayi = musteriler.filter((m) => m.riskRengi === "turuncu").length;
        return {
            mizanTarihi: mizan?.mizanTarihi ?? null,
            toplamNetAlacak: ozet?.toplamNetAlacak ?? 0,
            donukSayisi: ozet?.donukSayisi ?? 0,
            donukCiro: ozet?.donukCiro ?? 0,
            kirmiziSayi,
            kirmiziCiro,
            turuncuSayi,
            riskliMusteriler: musteriler
                .filter((m) => m.riskRengi === "kirmizi" || m.riskRengi === "turuncu")
                .sort((a, b) => b.netBakiye - a.netBakiye)
                .slice(0, 5),
        };
    }, [tahsilatQuery.data]);

    // Yaklaşan sigorta yenilemeleri (araçlardan)
    const yaklasanYenilemeler = useMemo(() => {
        const now = new Date();
        const items: Array<{ plaka: string; tip: "Trafik" | "Kasko"; tarih: Date; gunKalan: number; sirket: string | null }> = [];
        for (const a of araclarQuery.data ?? []) {
            const trafikDate = parseTarih(a.trafikBitisTarihi);
            if (trafikDate) {
                const fark = gunFarki(trafikDate, now);
                if (fark >= -7 && fark <= 60) {
                    items.push({ plaka: a.plaka, tip: "Trafik", tarih: trafikDate, gunKalan: fark, sirket: a.trafikSigortaSirketi });
                }
            }
            const kaskoDate = parseTarih(a.kaskoBitisTarihi);
            if (kaskoDate) {
                const fark = gunFarki(kaskoDate, now);
                if (fark >= -7 && fark <= 60) {
                    items.push({ plaka: a.plaka, tip: "Kasko", tarih: kaskoDate, gunKalan: fark, sirket: a.kaskoSigortaSirketi });
                }
            }
        }
        return items.sort((a, b) => a.gunKalan - b.gunKalan).slice(0, 5);
    }, [araclarQuery.data]);

    const kpiLoading = summaryQuery.isLoading || prevSummaryQuery.isLoading;

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="mx-auto max-w-[1400px] space-y-8 p-6 md:p-8">
                {/* HEADER */}
                <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            Genel Bakış · {selectedYear}
                        </p>
                        <h1 className="mt-1 text-3xl font-bold tracking-tight">
                            Finansal Kontrol Paneli
                        </h1>
                        <p className="mt-1.5 text-sm text-muted-foreground">
                            Tüm modüllerin canlı sinyalleri · {tahsilatAgg.mizanTarihi && (
                                <span>Tahsilat referans: <span className="tabular-nums">{tahsilatAgg.mizanTarihi.split("-").reverse().join("/")}</span></span>
                            )}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Select value={selectedYear.toString()} onValueChange={(val) => setSelectedYear(parseInt(val))}>
                            <SelectTrigger className="w-[120px]">
                                <SelectValue placeholder="Yıl" />
                            </SelectTrigger>
                            <SelectContent>
                                {yearOptions.map((y) => (
                                    <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </header>

                {/* KPI BAR */}
                <KPISection
                    totalRevenue={aggregates.totalRevenue}
                    totalExpenses={aggregates.totalExpenses}
                    netProfit={netProfit}
                    profitMargin={profitMargin}
                    previousYear={previousYearKPI}
                    selectedYear={selectedYear}
                    isLoading={kpiLoading}
                />

                {/* MODÜL HUB */}
                <section className="space-y-4">
                    <div className="flex items-baseline justify-between">
                        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                            Modüller
                        </h2>
                        <p className="text-xs text-muted-foreground">tıkla → ilgili sayfaya git</p>
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {/* GÜMRÜK */}
                        <ModuleCard
                            title="Gümrük"
                            href="/gumruk"
                            icon={PackageSearch}
                            accent={ACCENTS.gumruk}
                            primaryLabel={`${selectedYear} yıllık ciro`}
                            primaryValue={formatCurrencyShort(gumrukAgg.yillikCiro)}
                            primaryHint={gumrukAgg.sonAy ? `Son veri: ${gumrukAgg.sonAy.ay}` : "Veri yok"}
                            isLoading={gumrukOzetQuery.isLoading}
                            sparkline={<Sparkline values={gumrukAgg.sparkValues} height={36} />}
                            stats={[
                                { label: "Dosya sayısı", value: gumrukAgg.dosyaSayisi.toLocaleString("tr-TR") },
                                { label: "Son ay dosya", value: (gumrukAgg.sonAy?.dosyaSayisi ?? 0).toLocaleString("tr-TR") },
                            ]}
                        />

                        {/* TAHSİLAT */}
                        <ModuleCard
                            title="Tahsilat"
                            href="/tahsilat"
                            icon={Wallet}
                            accent={ACCENTS.tahsilat}
                            primaryLabel="Toplam net alacak"
                            primaryValue={formatCurrencyShort(tahsilatAgg.toplamNetAlacak)}
                            primaryHint={tahsilatAgg.mizanTarihi ? "mizana göre" : "mizan yüklenmedi"}
                            isLoading={tahsilatQuery.isLoading}
                            stats={[
                                {
                                    label: "Kırmızı risk",
                                    value: `${tahsilatAgg.kirmiziSayi} müşteri`,
                                    tone: tahsilatAgg.kirmiziSayi > 0 ? "danger" : "default",
                                },
                                {
                                    label: "Turuncu risk",
                                    value: `${tahsilatAgg.turuncuSayi} müşteri`,
                                    tone: tahsilatAgg.turuncuSayi > 0 ? "warning" : "default",
                                },
                                {
                                    label: "Kırmızıdaki ciro",
                                    value: formatCurrencyShort(tahsilatAgg.kirmiziCiro),
                                    tone: tahsilatAgg.kirmiziCiro > 0 ? "danger" : "default",
                                },
                                {
                                    label: "Donuk müşteri",
                                    value: `${tahsilatAgg.donukSayisi}`,
                                    tone: tahsilatAgg.donukSayisi > 0 ? "warning" : "default",
                                },
                            ]}
                        />

                        {/* ÇALIŞANLAR */}
                        <ModuleCard
                            title="Çalışanlar"
                            href="/calisanlar"
                            icon={Users}
                            accent={ACCENTS.calisanlar}
                            primaryLabel={`${selectedYear} işveren maliyeti`}
                            primaryValue={formatCurrencyShort(calisanAgg.toplamMaliyet)}
                            primaryHint={`${calisanAgg.aktif} aktif personel`}
                            isLoading={calisanlarQuery.isLoading}
                            stats={[
                                { label: "Toplam personel", value: `${calisanAgg.toplamPersonel}` },
                                { label: "En büyük şube", value: calisanAgg.topSube ? `${calisanAgg.topSube[0]} (${calisanAgg.topSube[1]})` : "—" },
                            ]}
                        />

                        {/* SİGORTA */}
                        <ModuleCard
                            title="Sigorta"
                            href="/sigorta"
                            icon={ShieldCheck}
                            accent={ACCENTS.sigorta}
                            primaryLabel={`${selectedYear} prim toplamı`}
                            primaryValue={formatCurrencyShort(sigortaAgg.toplamPrim)}
                            primaryHint={sigortaAgg.topSirket ? `Lider: ${sigortaAgg.topSirket[0]}` : "Veri yok"}
                            isLoading={sigortaOzetQuery.isLoading}
                            sparkline={<Sparkline values={sigortaAgg.sparkValues} height={32} />}
                            stats={[
                                { label: "Poliçe sayısı", value: sigortaAgg.toplamPolice.toLocaleString("tr-TR") },
                                { label: "Lider prim", value: sigortaAgg.topSirket ? formatCurrencyShort(sigortaAgg.topSirket[1]) : "—" },
                            ]}
                        />

                        {/* ARAÇLAR */}
                        <ModuleCard
                            title="Araçlar"
                            href="/araclar"
                            icon={Car}
                            accent={ACCENTS.araclar}
                            primaryLabel="Filo büyüklüğü"
                            primaryValue={`${aracAgg.toplamArac} araç`}
                            primaryHint={aracAgg.topSube ? `${aracAgg.topSube[0]} en kalabalık` : undefined}
                            isLoading={araclarQuery.isLoading}
                            stats={[
                                {
                                    label: "Yakın yenileme (30 gün)",
                                    value: `${aracAgg.yakinYenileme}`,
                                    tone: aracAgg.yakinYenileme > 0 ? "warning" : "default",
                                },
                                {
                                    label: "Kritik (≤7 gün)",
                                    value: `${aracAgg.kritikYenileme}`,
                                    tone: aracAgg.kritikYenileme > 0 ? "danger" : "default",
                                },
                                { label: "Yıllık sigorta", value: formatCurrencyShort(aracAgg.toplamSigortaMaliyet) },
                            ]}
                        />

                        {/* Boşluk doldurucu — 6. slot: hızlı yönlendirme paneli */}
                        <Card className="border-dashed border-border/70 bg-card/40">
                            <CardContent className="flex h-full flex-col justify-between p-5">
                                <div>
                                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Diğer Modüller</p>
                                    <h3 className="mt-1 text-sm font-semibold">Hızlı erişim</h3>
                                </div>
                                <div className="mt-4 flex flex-col gap-1.5">
                                    <QuickLink href="/nakliye" label="Nakliye" />
                                    <QuickLink href="/raporlar" label="Raporlar" />
                                    <QuickLink href="/hesaplamalar" label="Hesaplamalar (Maaş/Vergi)" />
                                    <QuickLink href="/iso9001" label="ISO 9001 Kalite Yönetimi" />
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </section>

                {/* TREND CHART */}
                <TrendChart
                    data={chartData}
                    description={`${selectedYear} aylık gelir/gider eğrisi · Gider = genel + personel maliyeti`}
                />

                {/* FOOTER LİSTELER */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    {/* En riskli müşteriler */}
                    <Card className="border-border/70 bg-card">
                        <CardHeader className="flex flex-row items-start justify-between space-y-0">
                            <div>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <AlertTriangle className="h-4 w-4 text-rose-500" />
                                    En Yüksek Riskli Müşteriler
                                </CardTitle>
                                <CardDescription className="text-xs">
                                    Tahsilat modülünden kırmızı + turuncu, ciroya göre top 5
                                </CardDescription>
                            </div>
                            <Link href="/tahsilat" className="text-xs font-medium text-muted-foreground hover:text-foreground">
                                Tümü →
                            </Link>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {tahsilatQuery.isLoading ? (
                                <div className="space-y-2">
                                    {[0, 1, 2, 3].map((i) => (
                                        <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
                                    ))}
                                </div>
                            ) : tahsilatAgg.riskliMusteriler.length === 0 ? (
                                <p className="py-8 text-center text-sm text-muted-foreground">
                                    Riskli müşteri yok ✓
                                </p>
                            ) : (
                                tahsilatAgg.riskliMusteriler.map((m) => (
                                    <div
                                        key={m.musteriId}
                                        className="flex items-center justify-between gap-3 rounded-md border border-border/40 p-3"
                                    >
                                        <div className="flex min-w-0 items-center gap-3">
                                            <span
                                                className={cn(
                                                    "h-2 w-2 shrink-0 rounded-full",
                                                    m.riskRengi === "kirmizi" ? "bg-rose-500" : "bg-amber-500"
                                                )}
                                            />
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium">{m.ad}</p>
                                                <p className="truncate text-[11px] text-muted-foreground">
                                                    {m.sektor || "Sektör belirsiz"} · {m.gecikme} gün gecikme
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-semibold tabular-nums">
                                                {formatCurrency(m.netBakiye)}
                                            </p>
                                            {m.vipRozeti && (
                                                <Badge variant="outline" className="mt-0.5 h-4 px-1.5 text-[9px]">
                                                    VIP
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>

                    {/* Yaklaşan sigorta yenilemeleri */}
                    <Card className="border-border/70 bg-card">
                        <CardHeader className="flex flex-row items-start justify-between space-y-0">
                            <div>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <CalendarClock className="h-4 w-4 text-amber-500" />
                                    Yaklaşan Sigorta Yenilemeleri
                                </CardTitle>
                                <CardDescription className="text-xs">
                                    Trafik & kasko · 60 gün içinde dolan + 7 gün geçmiş
                                </CardDescription>
                            </div>
                            <Link href="/araclar" className="text-xs font-medium text-muted-foreground hover:text-foreground">
                                Tümü →
                            </Link>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {araclarQuery.isLoading ? (
                                <div className="space-y-2">
                                    {[0, 1, 2, 3].map((i) => (
                                        <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
                                    ))}
                                </div>
                            ) : yaklasanYenilemeler.length === 0 ? (
                                <p className="py-8 text-center text-sm text-muted-foreground">
                                    Yakın zamanda yenilenecek poliçe yok ✓
                                </p>
                            ) : (
                                yaklasanYenilemeler.map((y, i) => {
                                    const overdue = y.gunKalan < 0;
                                    const critical = y.gunKalan >= 0 && y.gunKalan <= 7;
                                    return (
                                        <div key={i} className="flex items-center justify-between gap-3 rounded-md border border-border/40 p-3">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium tabular-nums">{y.plaka}</p>
                                                <p className="truncate text-[11px] text-muted-foreground">
                                                    {y.tip} · {y.sirket || "şirket belirsiz"}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className={cn(
                                                    "text-sm font-semibold tabular-nums",
                                                    overdue ? "text-rose-600 dark:text-rose-400" :
                                                        critical ? "text-amber-600 dark:text-amber-400" :
                                                            "text-foreground"
                                                )}>
                                                    {overdue ? `${Math.abs(y.gunKalan)} gün gecikti` : `${y.gunKalan} gün`}
                                                </p>
                                                <p className="text-[10px] text-muted-foreground tabular-nums">
                                                    {y.tarih.toLocaleDateString("tr-TR")}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

function QuickLink({ href, label }: { href: string; label: string }) {
    return (
        <Link href={href}>
            <div className="group flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                <span className="text-foreground/80 group-hover:text-foreground">{label}</span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
        </Link>
    );
}

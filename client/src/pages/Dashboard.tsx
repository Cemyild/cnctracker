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
    SlidersHorizontal,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { KPISection } from "@/components/dashboard/KPISection";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { ModuleCard, type ModuleAccent } from "@/components/dashboard/ModuleCard";
import { Sparkline } from "@/components/dashboard/Sparkline";
import { formatCurrencyFull, formatCurrencyShort, cn } from "@/lib/utils";
import type { Arac } from "@shared/schema";

// ----------------- Tipler -----------------
interface OzetSummaryRow {
    ay: string;
    // KPI'lar Gümrük Özet sayfasıyla (FinancialOverview.tsx) birebir aynı: ciro & gider KDV HARİÇ.
    satisKdvHaric: number;   // ciro (KDV hariç)
    giderKdvHaric: number;   // mal/hizmet gideri (KDV hariç)
    calisanMaliyet: number;  // personel maliyeti (tüm şubeler)
}

interface GumrukAylikOzet {
    ay: string;
    yil: number;
    toplamSatis: number;
    toplamKdv: number;
    dosyaSayisi: number;
}

interface GumrukTopFirma {
    firmaUnvan: string;
    tutar: number;
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
    brutUcret?: string | number | null;
    netUcret?: string | number | null;
    toplamIsverenMaliyeti: string | number | null;
}

// Aksiyon Merkezi / header rozetleri için türetilmiş uyarı
interface DashboardAlert {
    sev: "kritik" | "uyari";
    title: string;
    meta: string;
}

// Merkezi eşik yapılandırması (öneri 4) — tüm türetmeler bu değerleri kullanır
interface Thresholds {
    uyari: number;  // yenileme uyarısı (gün)
    kritik: number; // kritik eşik (gün)
    donuk: number;  // donuk alacak (gün)
}
const DEFAULT_THRESHOLDS: Thresholds = { uyari: 30, kritik: 7, donuk: 120 };

// ----------------- Modül accent paleti -----------------
const ACCENTS = {
    gumruk: { bar: "bg-sky-500", bg: "bg-sky-500/10", text: "text-sky-600 dark:text-sky-400" } satisfies ModuleAccent,
    tahsilat: { bar: "bg-rose-500", bg: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-400" } satisfies ModuleAccent,
    calisanlar: { bar: "bg-violet-500", bg: "bg-violet-500/10", text: "text-violet-600 dark:text-violet-400" } satisfies ModuleAccent,
    sigorta: { bar: "bg-emerald-500", bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400" } satisfies ModuleAccent,
    araclar: { bar: "bg-amber-500", bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400" } satisfies ModuleAccent,
};

const AY_SIRA = ["ocak", "subat", "mart", "nisan", "mayis", "haziran", "temmuz", "agustos", "eylul", "ekim", "kasim", "aralik"];
const AY_LABEL: Record<string, string> = {
    ocak: "Ocak", subat: "Şubat", mart: "Mart", nisan: "Nisan", mayis: "Mayıs", haziran: "Haziran",
    temmuz: "Temmuz", agustos: "Ağustos", eylul: "Eylül", ekim: "Ekim", kasim: "Kasım", aralik: "Aralık",
};

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

// Backend /api/tahsilat/dashboard `riskRengi` yaymıyor — risk rengini `pattern`'den türet.
// PATTERN_COLOR (shared/tahsilatHesaplari.ts) semantiğiyle uyumlu:
// DONUK_KAYIP=red → kırmızı, YAVAS_ODEYICI/TAKIP_GEREKEN=orange/yellow → turuncu, diğerleri risk değil.
function riskRengiFromPattern(pattern: string | undefined): "kirmizi" | "turuncu" | null {
    if (pattern === "DONUK_KAYIP") return "kirmizi";
    if (pattern === "YAVAS_ODEYICI" || pattern === "TAKIP_GEREKEN") return "turuncu";
    return null;
}

// dd/mm/yyyy — new Date() üzerinden geçmeden (timezone off-by-one riski yok)
function formatTarihKisa(d: Date): string {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${d.getFullYear()}`;
}

// ----------------- Dashboard -----------------
export default function Dashboard() {
    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
    const [thresholds, setThresholds] = useState<Thresholds>(DEFAULT_THRESHOLDS);
    const [configOpen, setConfigOpen] = useState(false);

    const currentYear = new Date().getFullYear();
    const yearOptions = useMemo(() => {
        const yrs: number[] = [];
        for (let y = currentYear + 1; y >= currentYear - 3; y--) yrs.push(y);
        return yrs;
    }, [currentYear]);

    const setTh = (key: keyof Thresholds) => (v: number) =>
        setThresholds((s) => ({ ...s, [key]: Number.isNaN(v) ? 0 : v }));

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

    const gumrukTopQuery = useQuery<GumrukTopFirma[]>({
        queryKey: ["gumruk-top-firmalar", selectedYear],
        queryFn: async () => {
            const res = await fetch(`/api/dashboard/gumruk-top-firmalar/${selectedYear}`);
            if (!res.ok) throw new Error("Firma sıralaması yüklenemedi");
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
                totalRevenue: acc.totalRevenue + (c.satisKdvHaric || 0),
                totalExpenses: acc.totalExpenses + (c.giderKdvHaric || 0) + (c.calisanMaliyet || 0),
                generalExpenses: acc.generalExpenses + (c.giderKdvHaric || 0),
                personnelExpenses: acc.personnelExpenses + (c.calisanMaliyet || 0),
            }),
            { totalRevenue: 0, totalExpenses: 0, generalExpenses: 0, personnelExpenses: 0 }
        );
    }, [summaryQuery.data]);

    const prevAggregates = useMemo(() => {
        const data = prevSummaryQuery.data ?? [];
        return data.reduce(
            (acc, c) => ({
                totalRevenue: acc.totalRevenue + (c.satisKdvHaric || 0),
                totalExpenses: acc.totalExpenses + (c.giderKdvHaric || 0) + (c.calisanMaliyet || 0),
            }),
            { totalRevenue: 0, totalExpenses: 0 }
        );
    }, [prevSummaryQuery.data]);

    const netProfit = aggregates.totalRevenue - aggregates.totalExpenses;
    const profitMargin = aggregates.totalRevenue > 0 ? (netProfit / aggregates.totalRevenue) * 100 : 0;
    const prevNetProfit = prevAggregates.totalRevenue - prevAggregates.totalExpenses;
    const prevMargin = prevAggregates.totalRevenue > 0 ? (prevNetProfit / prevAggregates.totalRevenue) * 100 : 0;
    const previousYearKPI = (prevSummaryQuery.data ?? []).length > 0
        ? { totalRevenue: prevAggregates.totalRevenue, totalExpenses: prevAggregates.totalExpenses, netProfit: prevNetProfit, profitMargin: prevMargin }
        : null;

    // --- Trend chart verisi (12 ay: gelir + gider + geçen yıl gelir) ---
    const chartData = useMemo(() => {
        const cur = new Map((summaryQuery.data ?? []).map((r) => [r.ay, r]));
        const prev = new Map((prevSummaryQuery.data ?? []).map((r) => [r.ay, r]));
        return AY_SIRA.map((ay) => {
            const c = cur.get(ay);
            const p = prev.get(ay);
            return {
                ay,
                gelir: c?.satisKdvHaric ?? 0,
                gider: (c?.giderKdvHaric ?? 0) + (c?.calisanMaliyet ?? 0),
                prevGelir: p?.satisKdvHaric ?? 0,
            };
        });
    }, [summaryQuery.data, prevSummaryQuery.data]);

    // Aylık hedef: geçen yılın aylık ortalaması +%15 büyüme (yoksa bu yılın dolu ay ortalaması)
    const aylikHedef = useMemo(() => {
        if (prevAggregates.totalRevenue > 0) return (prevAggregates.totalRevenue / 12) * 1.15;
        const dolu = chartData.filter((d) => d.gelir > 0);
        return dolu.length ? dolu.reduce((a, d) => a + d.gelir, 0) / dolu.length : 0;
    }, [prevAggregates.totalRevenue, chartData]);

    // --- Modül kartları için türetilmiş veriler ---

    // GÜMRÜK — yıllık ciro + son dolu ay (primary) + top-5 firma (gövde)
    const gumrukAgg = useMemo(() => {
        const data = gumrukOzetQuery.data ?? [];
        const map = new Map(data.map((r) => [r.ay, r]));
        const dosyaSayisi = data.reduce((a, r) => a + (r.dosyaSayisi || 0), 0);
        const yillikCiro = data.reduce((a, r) => a + (r.toplamSatis || 0), 0);
        let sonAy: GumrukAylikOzet | null = null;
        for (let i = AY_SIRA.length - 1; i >= 0; i--) {
            const r = map.get(AY_SIRA[i]);
            if (r && r.dosyaSayisi > 0) { sonAy = r; break; }
        }
        return { dosyaSayisi, yillikCiro, sonAy };
    }, [gumrukOzetQuery.data]);

    const gumrukTop = useMemo(() => {
        const data = gumrukTopQuery.data ?? [];
        const max = data.length ? Math.max(...data.map((f) => f.tutar)) : 0;
        return data.map((f) => ({ ...f, w: max > 0 ? Math.max(8, Math.round((f.tutar / max) * 100)) : 0 }));
    }, [gumrukTopQuery.data]);

    // SİGORTA — prim toplamı + spark + lider
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

    // ÇALIŞANLAR — toplam maliyet + aktif + şube bazında brüt/net (ay=toplam zaten kişi bazında yıllık topluyor)
    const calisanAgg = useMemo(() => {
        const data = calisanlarQuery.data ?? [];
        let toplamMaliyet = 0;
        let aktif = 0;
        const subeMap = new Map<string, { sube: string; kisi: number; brut: number; net: number }>();
        for (const c of data) {
            toplamMaliyet += Number(c.toplamIsverenMaliyeti || 0);
            if ((c.statu ?? "Aktif").toLowerCase() === "aktif") aktif++;
            const sube = c.sube || "Belirtilmemiş";
            const e = subeMap.get(sube) ?? { sube, kisi: 0, brut: 0, net: 0 };
            e.kisi++;
            e.brut += Number(c.brutUcret || 0);
            e.net += Number(c.netUcret || 0);
            subeMap.set(sube, e);
        }
        const subeler = Array.from(subeMap.values()).sort((a, b) => b.brut - a.brut);
        return { toplamPersonel: data.length, aktif, toplamMaliyet, subeler };
    }, [calisanlarQuery.data]);

    // ARAÇLAR — tüm trafik & kasko yenilemeleri, en yakın tarihe göre artan
    const aracRenewals = useMemo(() => {
        const now = new Date();
        const items: Array<{ plaka: string; tip: "Trafik" | "Kasko"; tarih: Date; gunKalan: number; sirket: string | null }> = [];
        for (const a of araclarQuery.data ?? []) {
            const t = parseTarih(a.trafikBitisTarihi);
            if (t) items.push({ plaka: a.plaka, tip: "Trafik", tarih: t, gunKalan: gunFarki(t, now), sirket: a.trafikSigortaSirketi });
            const k = parseTarih(a.kaskoBitisTarihi);
            if (k) items.push({ plaka: a.plaka, tip: "Kasko", tarih: k, gunKalan: gunFarki(k, now), sirket: a.kaskoSigortaSirketi });
        }
        return items.sort((a, b) => a.gunKalan - b.gunKalan);
    }, [araclarQuery.data]);

    const aracMeta = useMemo(() => {
        const data = araclarQuery.data ?? [];
        const subeMap = new Map<string, number>();
        for (const a of data) {
            const s = a.sube || "Belirtilmemiş";
            subeMap.set(s, (subeMap.get(s) || 0) + 1);
        }
        const topSube = Array.from(subeMap.entries()).sort((a, b) => b[1] - a[1])[0];
        return { toplamArac: data.length, topSube };
    }, [araclarQuery.data]);

    // Kart gövdesi: en yakın 4 yenileme (yakın geçmiş dahil)
    const aracListe = useMemo(() => aracRenewals.filter((r) => r.gunKalan >= -7).slice(0, 4), [aracRenewals]);
    // Footer: 60 gün penceresi
    const yaklasanYenilemeler = useMemo(
        () => aracRenewals.filter((r) => r.gunKalan >= -7 && r.gunKalan <= 60).slice(0, 5),
        [aracRenewals]
    );

    // TAHSİLAT
    const tahsilatAgg = useMemo(() => {
        const ozet = tahsilatQuery.data?.ozet;
        const mizan = tahsilatQuery.data?.mizan;
        const musteriler = tahsilatQuery.data?.musteriler ?? [];
        // pattern → riskRengi türet (backend bu alanı yaymıyor)
        const renkli = musteriler.map((m) => ({ ...m, riskRengi: riskRengiFromPattern(m.pattern) ?? undefined }));
        const kirmizi = renkli.filter((m) => m.riskRengi === "kirmizi");
        const turuncu = renkli.filter((m) => m.riskRengi === "turuncu");
        return {
            mizanTarihi: mizan?.mizanTarihi ?? null,
            toplamNetAlacak: ozet?.toplamNetAlacak ?? 0,
            donukSayisi: ozet?.donukSayisi ?? 0,
            donukCiro: ozet?.donukCiro ?? 0,
            kirmiziSayi: kirmizi.length,
            kirmiziCiro: kirmizi.reduce((a, m) => a + m.netBakiye, 0),
            turuncuSayi: turuncu.length,
            riskliMusteriler: renkli
                .filter((m) => m.riskRengi === "kirmizi" || m.riskRengi === "turuncu")
                .sort((a, b) => b.netBakiye - a.netBakiye)
                .slice(0, 5),
        };
    }, [tahsilatQuery.data]);

    // --- AKSİYON MERKEZİ / HEADER ROZETLERİ: tüm modüllerden türetilen uyarılar ---
    const alerts = useMemo<DashboardAlert[]>(() => {
        const list: DashboardAlert[] = [];
        const now = new Date();

        // 1) Araç sigorta yenilemeleri (eşiklere göre)
        for (const r of aracRenewals) {
            if (r.gunKalan < -7 || r.gunKalan > thresholds.uyari) continue;
            const sev: DashboardAlert["sev"] = r.gunKalan <= thresholds.kritik ? "kritik" : "uyari";
            const title = r.gunKalan < 0
                ? `${r.plaka} — ${r.tip} sigortası ${Math.abs(r.gunKalan)} gün önce doldu`
                : `${r.plaka} — ${r.tip} sigortası ${r.gunKalan} gün içinde doluyor`;
            list.push({ sev, title, meta: "Araçlar" });
        }

        // 2) Donuk alacaklar (müşteri bazlı, eşiğe göre)
        const musteriler = tahsilatQuery.data?.musteriler ?? [];
        for (const m of musteriler) {
            if (m.gecikme >= thresholds.donuk && m.netBakiye > 0) {
                list.push({ sev: "kritik", title: `${m.ad} — ${formatCurrencyShort(m.netBakiye)} donuk alacak · ${m.gecikme} gün`, meta: "Tahsilat" });
            }
        }

        // 3) Kırmızı riskli müşteriler (özet uyarı) — pattern'den türetilen renk
        const kirmizi = musteriler.filter((m) => riskRengiFromPattern(m.pattern) === "kirmizi");
        if (kirmizi.length > 0) {
            const ciro = kirmizi.reduce((a, m) => a + m.netBakiye, 0);
            list.push({ sev: "uyari", title: `${kirmizi.length} kırmızı riskli müşteri · toplam ${formatCurrencyShort(ciro)}`, meta: "Tahsilat" });
        }

        // 4) Başarısız query'ler
        if (gumrukOzetQuery.isError || gumrukTopQuery.isError) list.push({ sev: "uyari", title: "Gümrük özeti yüklenemedi — bağlantı hatası", meta: "Gümrük" });
        if (sigortaOzetQuery.isError) list.push({ sev: "uyari", title: "Sigorta özeti yüklenemedi — bağlantı hatası", meta: "Sigorta" });
        if (calisanlarQuery.isError) list.push({ sev: "uyari", title: "Çalışan verisi yüklenemedi — bağlantı hatası", meta: "Çalışanlar" });
        if (araclarQuery.isError) list.push({ sev: "uyari", title: "Araç verisi yüklenemedi — bağlantı hatası", meta: "Araçlar" });
        if (tahsilatQuery.isError) list.push({ sev: "uyari", title: "Tahsilat verisi yüklenemedi — bağlantı hatası", meta: "Tahsilat" });

        // 5) Eksik aylık gümrük verisi (yalnızca içinde bulunulan yıl + geçmiş aylar)
        if (selectedYear === currentYear && (gumrukOzetQuery.data?.length ?? 0) > 0) {
            const dolu = new Set((gumrukOzetQuery.data ?? []).filter((r) => r.dosyaSayisi > 0).map((r) => r.ay));
            for (let i = 0; i < now.getMonth(); i++) {
                if (!dolu.has(AY_SIRA[i])) {
                    list.push({ sev: "uyari", title: `${AY_LABEL[AY_SIRA[i]]} gümrük verisi eksik görünüyor`, meta: "Gümrük" });
                    break;
                }
            }
        }

        return list.sort((a, b) => (a.sev === b.sev ? 0 : a.sev === "kritik" ? -1 : 1));
    }, [
        aracRenewals, tahsilatQuery.data, thresholds, selectedYear, currentYear,
        gumrukOzetQuery.data, gumrukOzetQuery.isError, gumrukTopQuery.isError,
        sigortaOzetQuery.isError, calisanlarQuery.isError, araclarQuery.isError, tahsilatQuery.isError,
    ]);

    const kritikCount = alerts.filter((a) => a.sev === "kritik").length;
    const uyariCount = alerts.filter((a) => a.sev === "uyari").length;
    const kpiLoading = summaryQuery.isLoading || prevSummaryQuery.isLoading;

    const gumrukLoading = gumrukOzetQuery.isLoading || gumrukTopQuery.isLoading;
    const gumrukError = gumrukOzetQuery.isError || gumrukTopQuery.isError;
    const retryGumruk = () => { gumrukOzetQuery.refetch(); gumrukTopQuery.refetch(); };

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="mx-auto max-w-[1400px] space-y-7 p-6 md:p-8">
                {/* ===== HEADER ===== */}
                <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            Genel Bakış · {selectedYear}
                        </p>
                        <h1 className="mt-1.5 text-[30px] font-extrabold leading-none tracking-tight">Finansal Kontrol Paneli</h1>
                        <p className="mt-1.5 text-[13px] text-muted-foreground">
                            Tüm modüllerin canlı sinyalleri
                            {tahsilatAgg.mizanTarihi && (
                                <> · Tahsilat referans: <span className="tabular-nums">{tahsilatAgg.mizanTarihi.split("-").reverse().join("/")}</span></>
                            )}
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                        {/* Kritik / uyarı rozetleri (öneri 5) */}
                        <div className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 dark:border-rose-900/60 dark:bg-rose-950/40">
                            <span className="h-2 w-2 rounded-full bg-rose-500" />
                            <span className="text-[13px] font-bold tabular-nums text-rose-700 dark:text-rose-400">{kritikCount}</span>
                            <span className="text-xs text-rose-600/80 dark:text-rose-400/70">kritik</span>
                        </div>
                        <div className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 dark:border-amber-900/60 dark:bg-amber-950/40">
                            <span className="h-2 w-2 rounded-full bg-amber-500" />
                            <span className="text-[13px] font-bold tabular-nums text-amber-700 dark:text-amber-400">{uyariCount}</span>
                            <span className="text-xs text-amber-600/80 dark:text-amber-400/70">uyarı</span>
                        </div>

                        {/* Eşikler (öneri 4) */}
                        <button
                            type="button"
                            onClick={() => setConfigOpen((o) => !o)}
                            className={cn(
                                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors",
                                configOpen
                                    ? "border-border bg-accent text-foreground"
                                    : "border-border/70 bg-card text-muted-foreground hover:border-border hover:text-foreground"
                            )}
                        >
                            <SlidersHorizontal className="h-[15px] w-[15px]" />
                            Eşikler
                        </button>

                        <Select value={selectedYear.toString()} onValueChange={(val) => setSelectedYear(parseInt(val))}>
                            <SelectTrigger className="w-[110px]">
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

                {/* ===== EŞİK PANELİ ===== */}
                {configOpen && (
                    <Card className="flex flex-col gap-5 border-border/70 bg-card p-5 sm:flex-row sm:flex-wrap sm:items-end">
                        <div className="sm:flex-1">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Uyarı Eşikleri · merkezi yapılandırma
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Sabit kodlanmış değerler yerine düzenlenebilir eşikler. Tüm modüller ve Aksiyon Merkezi bu değerleri kullanır.
                            </p>
                        </div>
                        <ThresholdInput label="Yenileme uyarısı (gün)" value={thresholds.uyari} onChange={setTh("uyari")} />
                        <ThresholdInput label="Kritik eşik (gün)" value={thresholds.kritik} onChange={setTh("kritik")} />
                        <ThresholdInput label="Donuk alacak (gün)" value={thresholds.donuk} onChange={setTh("donuk")} />
                    </Card>
                )}

                {/* ===== KPI BAR ===== */}
                <KPISection
                    totalRevenue={aggregates.totalRevenue}
                    totalExpenses={aggregates.totalExpenses}
                    netProfit={netProfit}
                    profitMargin={profitMargin}
                    previousYear={previousYearKPI}
                    selectedYear={selectedYear}
                    isLoading={kpiLoading}
                />

                {/* ===== MODÜL HUB ===== */}
                <section className="space-y-3.5">
                    <div className="flex items-baseline justify-between">
                        <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Modüller</h2>
                        <p className="text-xs text-muted-foreground">tıkla → ilgili sayfaya git</p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {/* GÜMRÜK — top-5 firma (tutar) */}
                        <ModuleCard
                            title="Gümrük"
                            href="/gumruk"
                            icon={PackageSearch}
                            accent={ACCENTS.gumruk}
                            primaryLabel={`${selectedYear} yıllık ciro`}
                            primaryValue={formatCurrencyShort(gumrukAgg.yillikCiro)}
                            primaryHint={gumrukAgg.sonAy ? `Son veri: ${AY_LABEL[gumrukAgg.sonAy.ay] ?? gumrukAgg.sonAy.ay}` : "Veri yok"}
                            isLoading={gumrukLoading}
                            isError={gumrukError}
                            onRetry={retryGumruk}
                            errorMessage="Gümrük özeti yüklenemedi (bağlantı hatası)"
                        >
                            <ListHeader label="En çok fatura kesilen (tutar) · top 5" />
                            {gumrukTop.length === 0 ? (
                                <EmptyRow text="Bu yıl için firma verisi yok" />
                            ) : (
                                <div className="flex flex-col gap-2.5">
                                    {gumrukTop.map((f) => (
                                        <div key={f.firmaUnvan} className="flex items-center gap-2.5">
                                            <span className="w-24 shrink-0 truncate text-[12.5px] font-semibold text-slate-700 dark:text-slate-300" title={f.firmaUnvan}>
                                                {f.firmaUnvan}
                                            </span>
                                            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                                <span className="block h-full rounded-full bg-sky-500" style={{ width: `${f.w}%` }} />
                                            </span>
                                            <span className="shrink-0 text-xs font-bold tabular-nums text-foreground">{formatCurrencyFull(f.tutar)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </ModuleCard>

                        {/* TAHSİLAT — her zaman güncel (öneri 2) */}
                        <ModuleCard
                            title="Tahsilat"
                            href="/tahsilat"
                            icon={Wallet}
                            accent={ACCENTS.tahsilat}
                            badge="her zaman güncel"
                            primaryLabel="Toplam net alacak"
                            primaryValue={formatCurrencyShort(tahsilatAgg.toplamNetAlacak)}
                            primaryHint={tahsilatAgg.mizanTarihi ? "mizana göre" : "mizan yüklenmedi"}
                            isLoading={tahsilatQuery.isLoading}
                            isError={tahsilatQuery.isError}
                            onRetry={() => tahsilatQuery.refetch()}
                            errorMessage="Tahsilat verisi yüklenemedi (bağlantı hatası)"
                            stats={[
                                { label: "Kırmızı risk", value: `${tahsilatAgg.kirmiziSayi} müşteri`, tone: tahsilatAgg.kirmiziSayi > 0 ? "danger" : "default" },
                                { label: "Turuncu risk", value: `${tahsilatAgg.turuncuSayi} müşteri`, tone: tahsilatAgg.turuncuSayi > 0 ? "warning" : "default" },
                                { label: "Kırmızıdaki ciro", value: formatCurrencyShort(tahsilatAgg.kirmiziCiro), tone: tahsilatAgg.kirmiziCiro > 0 ? "danger" : "default" },
                                { label: "Donuk müşteri", value: `${tahsilatAgg.donukSayisi}`, tone: tahsilatAgg.donukSayisi > 0 ? "warning" : "default" },
                            ]}
                        />

                        {/* ÇALIŞANLAR — şube bazında maaş */}
                        <ModuleCard
                            title="Çalışanlar"
                            href="/calisanlar"
                            icon={Users}
                            accent={ACCENTS.calisanlar}
                            primaryLabel={`${selectedYear} işveren maliyeti`}
                            primaryValue={formatCurrencyShort(calisanAgg.toplamMaliyet)}
                            primaryHint={`${calisanAgg.aktif} aktif personel`}
                            isLoading={calisanlarQuery.isLoading}
                            isError={calisanlarQuery.isError}
                            onRetry={() => calisanlarQuery.refetch()}
                            errorMessage="Çalışan verisi yüklenemedi (bağlantı hatası)"
                        >
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <p className="text-[10.5px] uppercase tracking-wide text-muted-foreground">Şube bazında maaş · {selectedYear}</p>
                                <p className="shrink-0 text-[9.5px] uppercase tracking-wide text-muted-foreground/60">brüt / net</p>
                            </div>
                            {calisanAgg.subeler.length === 0 ? (
                                <EmptyRow text="Bu yıl için maaş verisi yok" />
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {calisanAgg.subeler.slice(0, 4).map((s) => (
                                        <div key={s.sube} className="flex items-center justify-between gap-2.5">
                                            <div className="min-w-0 truncate">
                                                <span className="text-[13px] font-semibold text-slate-700 dark:text-slate-300">{s.sube}</span>
                                                <span className="text-[11px] text-muted-foreground"> · {s.kisi} kişi</span>
                                            </div>
                                            <div className="flex shrink-0 flex-col items-end leading-tight tabular-nums">
                                                <span className="text-[13px] font-bold text-foreground">{formatCurrencyFull(s.brut)}</span>
                                                <span className="text-[11.5px] font-semibold text-violet-600 dark:text-violet-400">{formatCurrencyFull(s.net)}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </ModuleCard>

                        {/* SİGORTA — hata / retry örneği (öneri 1) */}
                        <ModuleCard
                            title="Sigorta"
                            href="/sigorta"
                            icon={ShieldCheck}
                            accent={ACCENTS.sigorta}
                            primaryLabel={`${selectedYear} prim toplamı`}
                            primaryValue={formatCurrencyShort(sigortaAgg.toplamPrim)}
                            primaryHint={sigortaAgg.topSirket ? `Lider: ${sigortaAgg.topSirket[0]}` : "prim toplamı"}
                            isLoading={sigortaOzetQuery.isLoading}
                            isError={sigortaOzetQuery.isError}
                            onRetry={() => sigortaOzetQuery.refetch()}
                            errorMessage="Sigorta özeti yüklenemedi (bağlantı hatası)"
                            sparkline={<Sparkline values={sigortaAgg.sparkValues} height={34} />}
                            stats={[
                                { label: "Poliçe sayısı", value: sigortaAgg.toplamPolice.toLocaleString("tr-TR") },
                                { label: "Lider", value: sigortaAgg.topSirket ? sigortaAgg.topSirket[0] : "—" },
                            ]}
                        />

                        {/* ARAÇLAR — en yakın sigorta tarihi · her zaman güncel (öneri 2) */}
                        <ModuleCard
                            title="Araçlar"
                            href="/araclar"
                            icon={Car}
                            accent={ACCENTS.araclar}
                            badge="her zaman güncel"
                            primaryLabel="Filo büyüklüğü"
                            primaryValue={`${aracMeta.toplamArac} araç`}
                            primaryHint={aracMeta.topSube ? `${aracMeta.topSube[0]} en kalabalık` : undefined}
                            isLoading={araclarQuery.isLoading}
                            isError={araclarQuery.isError}
                            onRetry={() => araclarQuery.refetch()}
                            errorMessage="Araç verisi yüklenemedi (bağlantı hatası)"
                        >
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <p className="text-[10.5px] uppercase tracking-wide text-muted-foreground">En yakın sigorta tarihi · araç</p>
                                <p className="shrink-0 text-[9.5px] uppercase tracking-wide text-muted-foreground/60">kalan</p>
                            </div>
                            {aracListe.length === 0 ? (
                                <EmptyRow text="Yakın yenileme yok ✓" />
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {aracListe.map((v, i) => {
                                        const overdue = v.gunKalan < 0;
                                        const kritik = !overdue && v.gunKalan <= thresholds.kritik;
                                        const yaklasan = !overdue && !kritik && v.gunKalan <= thresholds.uyari;
                                        return (
                                            <div key={`${v.plaka}-${v.tip}-${i}`} className="flex items-center justify-between gap-2.5">
                                                <div className="min-w-0 truncate">
                                                    <span className="text-[13px] font-semibold tabular-nums text-slate-700 dark:text-slate-300">{v.plaka}</span>
                                                    <span className="text-[11px] text-muted-foreground"> · {v.tip}</span>
                                                </div>
                                                <span className={cn(
                                                    "shrink-0 text-[13px] font-bold tabular-nums",
                                                    overdue || kritik ? "text-rose-600 dark:text-rose-400"
                                                        : yaklasan ? "text-amber-600 dark:text-amber-400"
                                                            : "text-slate-500 dark:text-slate-400"
                                                )}>
                                                    {overdue ? `${Math.abs(v.gunKalan)} gün gecikti` : `${v.gunKalan} gün`}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </ModuleCard>

                        {/* AKSİYON MERKEZİ — filler kart yerine (öneri 3) */}
                        <div className="relative flex flex-col gap-3 overflow-hidden rounded-[14px] border border-slate-800 bg-gradient-to-b from-slate-900 to-slate-800 p-5 text-white">
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <p className="text-[10.5px] uppercase tracking-[0.1em] text-slate-400">Aksiyon Merkezi</p>
                                    <h3 className="mt-0.5 text-sm font-semibold">Şimdi dikkat gerektirenler</h3>
                                </div>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-2xl font-extrabold tabular-nums text-rose-400">{kritikCount}</span>
                                    <span className="text-[11px] text-slate-400">kritik</span>
                                </div>
                            </div>

                            {alerts.length === 0 ? (
                                <p className="flex-1 py-6 text-center text-xs text-slate-400">Aktif uyarı yok ✓</p>
                            ) : (
                                <div className="flex flex-col gap-1.5">
                                    {alerts.slice(0, 5).map((a, i) => (
                                        <div key={i} className="flex items-start gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.04] px-2.5 py-2">
                                            <span className={cn("mt-[5px] h-[7px] w-[7px] shrink-0 rounded-full", a.sev === "kritik" ? "bg-rose-400" : "bg-amber-400")} />
                                            <div className="min-w-0">
                                                <p className="text-xs font-medium leading-snug text-slate-200">{a.title}</p>
                                                <p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-500">{a.meta}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {alerts.length > 5 && (
                                <p className="mt-auto pt-1 text-[11px] text-slate-500">+{alerts.length - 5} olay daha →</p>
                            )}
                        </div>
                    </div>
                </section>

                {/* ===== TREND CHART (öneri 6) ===== */}
                <TrendChart
                    data={chartData}
                    target={aylikHedef}
                    description={`${selectedYear} aylık ciro/gider (KDV hariç) · geçen yıl ciro çizgisi ve aylık hedef ile · Gider = mal/hizmet + personel maliyeti`}
                />

                {/* ===== FOOTER LİSTELER ===== */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    {/* En riskli müşteriler */}
                    <Card className="border-border/70 bg-card p-5">
                        <div className="mb-3.5 flex items-start justify-between gap-3">
                            <div>
                                <h3 className="flex items-center gap-2 text-[15px] font-bold tracking-tight">
                                    <AlertTriangle className="h-4 w-4 text-rose-500" />
                                    En Yüksek Riskli Müşteriler
                                </h3>
                                <p className="mt-1 text-xs text-muted-foreground">Kırmızı + turuncu, ciroya göre top 5</p>
                            </div>
                            <Link href="/tahsilat" className="shrink-0 text-xs font-medium text-muted-foreground hover:text-foreground">Tümü →</Link>
                        </div>
                        <div className="space-y-2">
                            {tahsilatQuery.isLoading ? (
                                [0, 1, 2, 3].map((i) => <div key={i} className="h-[52px] animate-pulse rounded-lg bg-muted" />)
                            ) : tahsilatAgg.riskliMusteriler.length === 0 ? (
                                <p className="py-8 text-center text-sm text-muted-foreground">Riskli müşteri yok ✓</p>
                            ) : (
                                tahsilatAgg.riskliMusteriler.map((m) => (
                                    <div key={m.musteriId} className="flex items-center justify-between gap-3 rounded-lg border border-border/50 p-3">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <span className={cn("h-2 w-2 shrink-0 rounded-full", m.riskRengi === "kirmizi" ? "bg-rose-500" : "bg-amber-500")} />
                                            <div className="min-w-0">
                                                <p className="truncate text-[13.5px] font-semibold">{m.ad}</p>
                                                <p className="truncate text-[11px] text-muted-foreground">{m.sektor || "Sektör belirsiz"} · {m.gecikme} gün gecikme</p>
                                            </div>
                                        </div>
                                        <div className="shrink-0 text-right">
                                            <p className="text-[13.5px] font-bold tabular-nums">{formatCurrencyFull(m.netBakiye)}</p>
                                            {m.vipRozeti && (
                                                <span className="mt-0.5 inline-block rounded border border-violet-300 px-1.5 py-px text-[9px] font-semibold tracking-wide text-violet-600 dark:border-violet-700 dark:text-violet-400">VIP</span>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </Card>

                    {/* Yaklaşan sigorta yenilemeleri */}
                    <Card className="border-border/70 bg-card p-5">
                        <div className="mb-3.5 flex items-start justify-between gap-3">
                            <div>
                                <h3 className="flex items-center gap-2 text-[15px] font-bold tracking-tight">
                                    <CalendarClock className="h-4 w-4 text-amber-500" />
                                    Yaklaşan Sigorta Yenilemeleri
                                </h3>
                                <p className="mt-1 text-xs text-muted-foreground">Trafik & kasko · 60 gün içinde dolan + 7 gün geçmiş</p>
                            </div>
                            <Link href="/araclar" className="shrink-0 text-xs font-medium text-muted-foreground hover:text-foreground">Tümü →</Link>
                        </div>
                        <div className="space-y-2">
                            {araclarQuery.isLoading ? (
                                [0, 1, 2, 3].map((i) => <div key={i} className="h-[52px] animate-pulse rounded-lg bg-muted" />)
                            ) : yaklasanYenilemeler.length === 0 ? (
                                <p className="py-8 text-center text-sm text-muted-foreground">Yakın zamanda yenilenecek poliçe yok ✓</p>
                            ) : (
                                yaklasanYenilemeler.map((y, i) => {
                                    const overdue = y.gunKalan < 0;
                                    const kritik = !overdue && y.gunKalan <= thresholds.kritik;
                                    const yaklasan = !overdue && !kritik && y.gunKalan <= thresholds.uyari;
                                    return (
                                        <div key={`${y.plaka}-${y.tip}-${i}`} className="flex items-center justify-between gap-3 rounded-lg border border-border/50 p-3">
                                            <div className="min-w-0">
                                                <p className="truncate text-[13.5px] font-semibold tabular-nums">{y.plaka}</p>
                                                <p className="truncate text-[11px] text-muted-foreground">{y.tip} · {y.sirket || "şirket belirsiz"}</p>
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <p className={cn(
                                                    "text-[13px] font-bold tabular-nums",
                                                    overdue || kritik ? "text-rose-600 dark:text-rose-400"
                                                        : yaklasan ? "text-amber-600 dark:text-amber-400"
                                                            : "text-foreground"
                                                )}>
                                                    {overdue ? `${Math.abs(y.gunKalan)} gün gecikti` : `${y.gunKalan} gün`}
                                                </p>
                                                <p className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">{formatTarihKisa(y.tarih)}</p>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}

// ----------------- Yardımcı bileşenler -----------------
function ThresholdInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
    return (
        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            {label}
            <input
                type="number"
                value={value}
                min={0}
                onChange={(e) => onChange(parseInt(e.target.value))}
                className="w-24 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[13px] tabular-nums text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
        </label>
    );
}

function ListHeader({ label }: { label: string }) {
    return <p className="mb-2 text-[10.5px] uppercase tracking-wide text-muted-foreground">{label}</p>;
}

function EmptyRow({ text }: { text: string }) {
    return <p className="py-2 text-[12px] text-muted-foreground">{text}</p>;
}

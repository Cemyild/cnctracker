import { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, AlertCircle, Upload, Search, FileSpreadsheet, ArrowRightLeft, Save, Trash2, Filter, ArrowUpDown, ArrowUp, ArrowDown, AlertTriangle, Link, MousePointerClick, Download, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency, cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type MatchStatus = 'matched' | 'amount_mismatch' | 'missing' | 'pending';

interface PolicyRow {
    id: number;
    policyNo: string;
    amount: number;
    raw: any;
    status: MatchStatus;
    matchDetails?: string;
    // New fields for DB
    brans?: string;
    sigortali?: string;
    tanzimTarihi?: string;
    netPrim?: number;
    brutPrim?: number;
    komisyon?: number;
}

interface CompanyData {
    policyFile: File | null;
    accountingFile: File | null;
    policies: PolicyRow[];
    accountingData: any[];
    isAnalyzed: boolean;
}

const COMPANIES = {
    MAPFRE: 'Mapfre',
    RAY: 'Ray Sigorta'
};

// Mapfre ile çalışma bitti; ancak geçmiş yıl kayıtları duruyor. Bu yüzden
// acente sekmeleri sabit değil: seçili yılda gerçekten verisi olan acenteler
// sunucudan sorulur. 2026 ve sonrasında Mapfre hiç çizilmez, 2025'e bakıldığında
// geçmiş eksiksiz görünür. Yeni veri yükleme ise Mapfre'ye tamamen kapalıdır.
function useSigortaSirketler(yil: number) {
    const { data } = useQuery<string[]>({
        queryKey: ['sigorta-sirketler', yil],
        queryFn: async () => {
            const res = await apiRequest("GET", `/api/sigorta/sirketler/${yil}`);
            return res.json();
        },
    });
    const sirketler = data || [];
    return {
        sirketler,
        mapfreVarMi: sirketler.includes(COMPANIES.MAPFRE),
    };
}

// Bu firmaların poliçeleri hiçbir zaman dekont edilmez (abonman müşterileri);
// primi sıfır olmasa bile otomatik "EVET" sayılırlar. Yeni firma eklemek için
// sadece alt-kase, TR karaktersiz bir anahtar kelime ekle — substring eşleşir.
const AUTO_EVET_FIRMS_KEYWORDS = ["feka", "promedis"];

const normalizeFirmName = (s: any): string =>
    String(s || "")
        .toLowerCase()
        .replace(/ş/g, "s").replace(/ı/g, "i").replace(/ğ/g, "g")
        .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
        .replace(/[^a-z0-9]/g, "");

const isAutoEvetFirm = (sigortali: any): boolean => {
    const norm = normalizeFirmName(sigortali);
    return AUTO_EVET_FIRMS_KEYWORDS.some(k => norm.includes(k));
};

// Dekont beklenmeyen poliçeler — iki bağımsız kural:
//   1) FEKA/PROMEDİS poliçeleri (tutarı ne olursa olsun),
//   2) brüt primi sıfır olan her poliçe — tahsil edilecek tutar yoksa
//      muhasebede karşılık kaydı da doğmaz (sertifika satırları).
// Eskiden yalnızca (1) vardı; (2) olmadığı için FEKA/PROMEDİS dışı sıfır
// primli poliçeler sonsuza dek "dekontsuz" listesinde takılı kalıyordu.
const isDekontBeklenmez = (sigortali: any, brutPrim: any): boolean => {
    if (isAutoEvetFirm(sigortali)) return true;
    const brut = typeof brutPrim === "number" ? brutPrim : parseFloat(String(brutPrim ?? "").replace(",", "."));
    return !brut || brut === 0;
};

// Veri hangi sayfada? Bazı raporlar boş bir "Sayfa1" ile başlıyor (muhasebe
// ekstresi böyle geliyor), bazıları tek sayfalı. Sabit "ilk sayfa" varsayımı
// sessiz başarısızlık üretiyor: boş sayfa okunup "başlık tanınmadı" deniyor.
// Kural: tercih edilen bir sayfa adı varsa onu al, yoksa en çok dolu satırı
// olan sayfayı seç — böylece sayfa sırası değişse de doğru veri bulunur.
const veriSayfasiniSec = (workbook: XLSX.WorkBook, tercihEdilenAdlar: string[] = []): string => {
    for (const ad of tercihEdilenAdlar) {
        if (workbook.SheetNames.includes(ad)) return ad;
    }
    let enIyiSayfa = workbook.SheetNames[0];
    let enCokDoluSatir = -1;
    for (const ad of workbook.SheetNames) {
        const ws = workbook.Sheets[ad];
        if (!ws || !ws["!ref"]) continue;
        const satirlar = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }) as any[][];
        const dolu = satirlar.filter(r => r && r.some(c => c !== null && c !== undefined && c !== "")).length;
        if (dolu > enCokDoluSatir) { enCokDoluSatir = dolu; enIyiSayfa = ad; }
    }
    return enIyiSayfa;
};

// ─────────────────────────────────────────────────────────────────────────
// POLİÇE ↔ MUHASEBE EŞLEŞTİRME YARDIMCILARI
// Muhasebe satırındaki evrak no insan eliyle giriliyor; sahada görülen hata
// desenleri: bir hane düşmesi, fazladan bir hane, tek hane yanlış yazımı,
// tarihin numaraya yapışması ("159360467013,07") ve numaranın hiç yazılmayıp
// açıklamaya gömülmesi ("SİGORTA-23,02,2026/1522345892 ABON").
// ─────────────────────────────────────────────────────────────────────────
const sadeceRakam = (s: any): string => String(s ?? "").replace(/\D/g, "");

// İki numara tek bir düzenlemeyle (bir ekleme, bir silme veya bir değiştirme)
// birbirine dönüşüyor mu? Tam Levenshtein hesabı yerine erken çıkışlı kontrol —
// 1.800+ poliçe × yüzlerce kayıt taranacağı için maliyet önemli.
const birDuzenlemeUzakligi = (a: string, b: string): boolean => {
    if (!a || !b) return false;
    const fark = a.length - b.length;
    if (Math.abs(fark) > 1) return false;
    if (a === b) return false; // birebir aynı → zaten tam eşleşme kademesinde yakalanır

    if (fark === 0) {
        let farkliHane = 0;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i] && ++farkliHane > 1) return false;
        }
        return farkliHane === 1;
    }

    // Uzunluk farkı 1 → uzun olandan tek hane atlayarak kısa olana ulaşılıyor mu?
    const uzun = fark > 0 ? a : b;
    const kisa = fark > 0 ? b : a;
    let i = 0, j = 0, atlandi = false;
    while (i < uzun.length && j < kisa.length) {
        if (uzun[i] !== kisa[j]) {
            if (atlandi) return false;
            atlandi = true;
            i++;
        } else { i++; j++; }
    }
    return true;
};

// Evrak no ve açıklamadan doğrudan denenebilecek poliçe no adayları.
// Ray poliçe numaraları 10 hanelidir; yapışık tarih/ek hane bu yolla ayıklanır.
const policeNoAdaylari = (evrakNo: any, aciklama: any): string[] => {
    const adaylar: string[] = [];
    const ham = sadeceRakam(evrakNo);
    if (ham) {
        adaylar.push(ham);
        if (ham.length > 10) {
            adaylar.push(ham.slice(0, 10));           // "15936046701307" → "1593604670"
            adaylar.push(ham.slice(-10));             // birleşik iki numaranın ikincisi
        }
    }
    // Açıklamaya gömülü 10 haneli numara: "SİGORTA-23,02,2026/1522345892 ABON"
    const gomulu = String(aciklama ?? "").match(/\d{10}/g);
    if (gomulu) adaylar.push(...gomulu);
    return Array.from(new Set(adaylar.filter(Boolean)));
};

// Poliçe tahsilatı değil, banka/vergi hareketi olan satırlar. Bunlar evrak no
// taşımaz ve borç tarafında durur; "eşleşmeyen" listesine karışıp gerçek
// eksikleri gizliyorlardı.
const BANKA_HAREKET_KELIMELERI = [
    "virman", "stopaj", "muhtasar", "kurumlarvergisi", "hesapbirlestirme",
    "hesabinagonderilen", "hesabinavirman", "hesaplararasi", "odemesi",
];
const isBankaHareketi = (evrakNo: any, aciklama: any, borc: number, alacak: number): boolean => {
    if (sadeceRakam(evrakNo)) return false;      // numarası varsa poliçe kaydı sayılır
    if (alacak > 0) return false;                // alacak tarafı prim tahakkukudur
    const norm = normalizeFirmName(aciklama);
    if (!norm) return false;
    return borc > 0 && BANKA_HAREKET_KELIMELERI.some(k => norm.includes(k));
};

// Muhasebe açıklamasındaki firma kısaltmasını ("SİGORTA-FICOSA INT") poliçedeki
// sigortalı ünvanıyla karşılaştırmak için ön ek temizliği.
const aciklamadanFirma = (aciklama: any): string => {
    let s = String(aciklama ?? "");
    s = s.replace(/^\s*(ABONMAN\s+)?S[İI]GORTA\s*-\s*/i, "");
    return normalizeFirmName(s);
};

// "dd.mm.yyyy" → karşılaştırılabilir zaman damgası. Yalnızca tarih yakınlığı
// ölçmek için; ekranda gösterilecek hiçbir tarih buradan geçmez.
const ddmmyyyyToGun = (s: any): number | null => {
    const p = String(s ?? "").split(".");
    if (p.length !== 3) return null;
    const d = parseInt(p[0]), m = parseInt(p[1]), y = parseInt(p[2]);
    if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
    return new Date(y, m - 1, d).getTime();
};

// Muhasebe kaydının `eslestiMi` alanı (integer) — anlamlar tek yerde toplandı.
// 0/1/2 tarihsel değerler; 3 ve 4 bu sürümde eklendi.
const MUHASEBE_DURUM = {
    ESLESMEDI: 0,
    ESLESTI: 1,
    SUPHELI: 2,
    BANKA_HAREKETI: 3,    // virman/stopaj/vergi — poliçe karşılığı aranmaz
    ONERI_REDDEDILDI: 4,  // kullanıcı öneriyi reddetti, bir daha önerilmesin
} as const;

type EslesmeOnerisi = { police: any; skor: number; gerekceler: string[] };

// Eşleşmeyen bir muhasebe kaydı için en olası poliçeyi arar.
// ÖNEMLİ: burada hiçbir şey otomatik bağlanmaz — sonuç kullanıcıya gerekçesiyle
// birlikte öneri olarak sunulur, kararı kullanıcı verir. Bu yüzden eşik yüksek
// tutulmuştur: en az bir güçlü sinyal (tutarın kuruşuna kadar tutması ya da
// numaranın tek düzenleme uzaklığında olması) VE ikinci adaydan belirgin fark.
const eslesmeOnerisiBul = (
    kayit: { belgeNo?: any; aciklama?: any; alacak?: any; tarih?: any },
    policeler: any[],
): EslesmeOnerisi | null => {
    const tutar = parseFloat(String(kayit.alacak ?? "0")) || 0;
    if (tutar <= 0) return null; // borç/virman satırı — poliçe karşılığı aranmaz

    const accNo = sadeceRakam(kayit.belgeNo);
    const firmaAnahtari = aciklamadanFirma(kayit.aciklama);
    const kayitGun = ddmmyyyyToGun(kayit.tarih);

    const adaylar: EslesmeOnerisi[] = [];
    for (const p of policeler) {
        const brut = parseFloat(p.brutPrim || "0") || 0;
        if (brut <= 0) continue; // primi sıfır poliçe zaten dekont beklemez
        if (p.dekontDurumu === "EVET") continue; // hâlihazırda kapanmış poliçeyi önerme

        const gerekceler: string[] = [];
        let skor = 0;

        const tutarFarki = Math.abs(brut - tutar);
        if (tutarFarki < 0.01) { skor += 100; gerekceler.push("tutar birebir"); }
        else if (tutarFarki < Math.max(1, brut * 0.01)) { skor += 45; gerekceler.push("tutar yakın"); }

        const pNo = sadeceRakam(p.policeNo);
        if (accNo && birDuzenlemeUzakligi(accNo, pNo)) {
            skor += 80;
            gerekceler.push(accNo.length === pNo.length ? "1 hane farklı" : "1 hane eksik/fazla");
        }

        if (firmaAnahtari.length >= 5) {
            const pFirma = normalizeFirmName(p.sigortali);
            if (pFirma.startsWith(firmaAnahtari) || (pFirma.length >= 10 && firmaAnahtari.startsWith(pFirma.slice(0, 10)))) {
                skor += 30;
                gerekceler.push("firma tutuyor");
            }
        }

        const pGun = ddmmyyyyToGun(p.tanzimTarihi);
        if (kayitGun !== null && pGun !== null && Math.abs(kayitGun - pGun) <= 45 * 86400000) {
            skor += 10;
            gerekceler.push("tarih yakın");
        }

        if (skor > 0) adaylar.push({ police: p, skor, gerekceler });
    }

    if (adaylar.length === 0) return null;
    adaylar.sort((a, b) => b.skor - a.skor);
    const en = adaylar[0];
    if (en.skor < 100) return null;                                   // güçlü sinyal yok
    if (adaylar[1] && en.skor - adaylar[1].skor < 40) return null;    // belirsiz — öneri üretme
    return en;
};

const AYLAR = [
    { value: "1", label: "Ocak" },
    { value: "2", label: "Şubat" },
    { value: "3", label: "Mart" },
    { value: "4", label: "Nisan" },
    { value: "5", label: "Mayıs" },
    { value: "6", label: "Haziran" },
    { value: "7", label: "Temmuz" },
    { value: "8", label: "Ağustos" },
    { value: "9", label: "Eylül" },
    { value: "10", label: "Ekim" },
    { value: "11", label: "Kasım" },
    { value: "12", label: "Aralık" }
];

const YILLAR = [2024, 2025, 2026];

export default function Sigorta() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [mainTab, setMainTab] = useState("ozet");
    
    const [selectedYear, setSelectedYear] = useState<number>(2025);
    const [selectedMonth, setSelectedMonth] = useState<string>("toplam");
    // Acente filtresi — Tümü / (Mapfre) / Ray; tüm KPI ve listeleri o acenteye indirger
    const [acente, setAcente] = useState<"tum" | "mapfre" | "ray">("tum");
    const { mapfreVarMi } = useSigortaSirketler(selectedYear);

    const FIRMS = useMemo<{ id: "tum" | "mapfre" | "ray"; label: string }[]>(() => [
        { id: "tum", label: "Tümü" },
        ...(mapfreVarMi ? [{ id: "mapfre" as const, label: "Mapfre" }] : []),
        { id: "ray", label: "Ray" },
    ], [mapfreVarMi]);

    // Mapfre seçiliyken Mapfre verisi olmayan bir yıla geçilirse filtre kilitli
    // kalır ve her ekran boş görünürdü; bu durumda "Tümü"ne geri dönülür.
    useEffect(() => {
        if (!mapfreVarMi && acente === "mapfre") setAcente("tum");
    }, [mapfreVarMi, acente]);
    const TABS: { id: string; label: string }[] = [
        { id: "ozet", label: "Özet" },
        { id: "liste", label: "Poliçe Listesi" },
        { id: "aging", label: "Yaşlandırma" },
        { id: "yukleme", label: "Veri Yükleme" },
    ];

    return (
        <div className="min-h-full bg-slate-50 dark:bg-background">
            <div className="px-6 pb-12 lg:px-8">
                <Tabs value={mainTab} onValueChange={setMainTab} className="w-full">
                    {/* ===== STICKY HEADER + TABS ===== */}
                    <div className="sticky top-0 z-20 border-b border-border/70 bg-slate-50/90 pt-5 backdrop-blur dark:bg-background/90">
                        <div className="flex flex-wrap items-end justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400">
                                    <Shield className="h-[22px] w-[22px]" strokeWidth={1.8} />
                                </div>
                                <div>
                                    <h1 className="text-[21px] font-extrabold tracking-tight">Sigorta</h1>
                                    <p className="mt-0.5 text-[12.5px] text-muted-foreground">Poliçe, mutabakat ve performans takibi</p>
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {/* Acente segmented */}
                                <div className="inline-flex gap-1 rounded-[9px] border border-border bg-muted p-[3px]">
                                    {FIRMS.map((f) => (
                                        <button
                                            key={f.id}
                                            onClick={() => setAcente(f.id)}
                                            className={cn(
                                                "rounded-[7px] px-3 py-1.5 text-[12.5px] transition-colors",
                                                acente === f.id ? "bg-card font-bold text-foreground shadow-sm" : "font-semibold text-muted-foreground hover:text-foreground"
                                            )}
                                        >
                                            {f.label}
                                        </button>
                                    ))}
                                </div>
                                <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
                                    <SelectTrigger className="h-[38px] w-[100px]"><SelectValue placeholder="Yıl" /></SelectTrigger>
                                    <SelectContent>{YILLAR.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                                </Select>
                                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                                    <SelectTrigger className="h-[38px] w-[130px]"><SelectValue placeholder="Ay" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="toplam">Tüm Yıl</SelectItem>
                                        {AYLAR.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        {/* Tab barı — aktif tab inset alt çizgi */}
                        <div className="mt-3.5 flex gap-1">
                            {TABS.map((t) => (
                                <button
                                    key={t.id}
                                    onClick={() => setMainTab(t.id)}
                                    className={cn(
                                        "rounded-t-lg px-3.5 py-2.5 text-[13.5px] transition-colors",
                                        mainTab === t.id
                                            ? "font-bold text-foreground shadow-[inset_0_-2px_0_#0ea5e9]"
                                            : "font-semibold text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <TabsContent value="ozet" className="mt-5">
                        <SigortaOzet yil={selectedYear} ay={selectedMonth} acente={acente} />
                    </TabsContent>

                    <TabsContent value="liste" className="mt-5">
                        <PoliceListesi yil={selectedYear} ay={selectedMonth} acente={acente} />
                    </TabsContent>

                    <TabsContent value="aging" className="mt-5">
                        <SigortaAging yil={selectedYear} ay={selectedMonth} acente={acente} />
                    </TabsContent>

                    <TabsContent value="yukleme" className="mt-5">
                        <VeriYukleme yil={selectedYear} globalAy={selectedMonth} />
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// 1. ÖZET TAB COMPONENT
// ---------------------------------------------------------------------------
function SigortaOzet({ yil, ay, acente = "tum" }: { yil: number, ay: string, acente?: "tum" | "mapfre" | "ray" }) {
    // Acente filtresi → şirket adı eşlemesi (Mapfre / Ray Sigorta)
    const acenteCompany = acente === "mapfre" ? COMPANIES.MAPFRE : acente === "ray" ? COMPANIES.RAY : null;
    const { mapfreVarMi } = useSigortaSirketler(yil);

    const { data: ozet } = useQuery({
        queryKey: ['sigorta-ozet', yil],
        queryFn: async () => {
            const res = await apiRequest("GET", `/api/sigorta/ozet/${yil}`);
            return res.json();
        }
    });

    // Firma bazlı toplam — yıl (+ opsiyonel ay) bazında sigortali alanına göre agregasyon
    // 'sigorta-ozet' önekiyle yuvalandı → VeriYukleme'nin invalidateQueries(['sigorta-ozet'])'i yakalar (staleness fix).
    // sirket param + acenteCompany queryKey → acente filtresi (Mapfre/Ray) bu tabloya da uygulanır.
    const { data: firmalar } = useQuery({
        queryKey: ['sigorta-ozet', 'firmalar', yil, ay, acenteCompany],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (ay && ay !== 'toplam') params.set('ay', ay);
            if (acenteCompany) params.set('sirket', acenteCompany);
            const qs = params.toString() ? `?${params.toString()}` : '';
            const res = await apiRequest("GET", `/api/sigorta/firmalar/${yil}${qs}`);
            return res.json();
        }
    });

    // Dekont Edilmemiş Poliçeler mini-listesi için poliçe çek
    // (SigortaAging deseni: /api/sigorta/policeler?sirket=&yil=&ay=)
    const { data: mapfrePol } = useQuery({
        queryKey: ['sigorta-ozet', 'pol', COMPANIES.MAPFRE, yil, ay],
        queryFn: async () => {
            let url = `/api/sigorta/policeler?sirket=${encodeURIComponent(COMPANIES.MAPFRE)}&yil=${yil}`;
            if (ay !== 'toplam') url += `&ay=${ay}`;
            const res = await apiRequest("GET", url);
            return res.json();
        },
        enabled: acente !== "ray" && mapfreVarMi,
    });
    const { data: rayPol } = useQuery({
        queryKey: ['sigorta-ozet', 'pol', COMPANIES.RAY, yil, ay],
        queryFn: async () => {
            let url = `/api/sigorta/policeler?sirket=${encodeURIComponent(COMPANIES.RAY)}&yil=${yil}`;
            if (ay !== 'toplam') url += `&ay=${ay}`;
            const res = await apiRequest("GET", url);
            return res.json();
        },
        enabled: acente !== "mapfre",
    });

    // tanzimTarihi (DD.MM.YYYY) → bugüne kadar geçen gün
    const daysSince = (s: string): number | null => {
        if (!s) return null;
        const parts = s.split('.');
        if (parts.length !== 3) return null;
        const d = parseInt(parts[0]), m = parseInt(parts[1]), y = parseInt(parts[2]);
        if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
        return Math.floor((Date.now() - new Date(y, m - 1, d).getTime()) / (1000 * 60 * 60 * 24));
    };

    // Dekont edilmemiş (dekontDurumu !== 'EVET') poliçeler — en eski önce
    const dekontsuz = useMemo(() => {
        const merged = [
            ...(acente !== "ray" ? (mapfrePol || []) : []),
            ...(acente !== "mapfre" ? (rayPol || []) : []),
        ];
        return merged
            .filter((p: any) => p.dekontDurumu !== 'EVET')
            .map((p: any) => ({ ...p, _gun: daysSince(p.tanzimTarihi) }))
            .sort((a: any, b: any) => (b._gun ?? -1) - (a._gun ?? -1));
    }, [mapfrePol, rayPol, acente]);

    const dekontsuzTop = dekontsuz.slice(0, 6);
    const dekontsuzToplam = dekontsuz.reduce((acc: number, p: any) => acc + (parseFloat(p.netPrim || "0") || 0), 0);
    const dekontDotColor = (g: number | null) =>
        g === null ? "#94a3b8" : g >= 90 ? "#dc2626" : g >= 60 ? "#fb7185" : g >= 30 ? "#f59e0b" : "#10b981";

    // Sortable firma tablosu — her sütun tıklanabilir, asc/desc toggle
    const [firmaSortKey, setFirmaSortKey] = useState<'sigortali' | 'brutPrim' | 'komisyon' | 'policeSayisi'>('brutPrim');
    const [firmaSortDir, setFirmaSortDir] = useState<'asc' | 'desc'>('desc');

    const sortedFirmalar = useMemo(() => {
        if (!firmalar) return [];
        const arr = [...firmalar];
        arr.sort((a: any, b: any) => {
            if (firmaSortKey === 'sigortali') {
                return firmaSortDir === 'asc'
                    ? String(a.sigortali).localeCompare(String(b.sigortali), 'tr')
                    : String(b.sigortali).localeCompare(String(a.sigortali), 'tr');
            }
            const aVal = Number(a[firmaSortKey]) || 0;
            const bVal = Number(b[firmaSortKey]) || 0;
            return firmaSortDir === 'asc' ? aVal - bVal : bVal - aVal;
        });
        return arr;
    }, [firmalar, firmaSortKey, firmaSortDir]);

    const toggleFirmaSort = (key: typeof firmaSortKey) => {
        if (firmaSortKey === key) {
            // Aynı kolona tekrar tıklanırsa yönü değiştir
            setFirmaSortDir(firmaSortDir === 'asc' ? 'desc' : 'asc');
        } else {
            setFirmaSortKey(key);
            // Yeni kolon seçildiğinde: sigortali için A→Z (asc), sayısal için
            // büyükten küçüğe (desc — "en çok" anlamlı default)
            setFirmaSortDir(key === 'sigortali' ? 'asc' : 'desc');
        }
    };

    // Filter by month if selected, then by acente (şirket) if not "tum"
    const monthOzet = ay === 'toplam' ? ozet : ozet?.filter((o: any) => o.ay === ay);
    const filteredOzet = acenteCompany
        ? monthOzet?.filter((o: any) => o.sirket === acenteCompany)
        : monthOzet;

    const stats = filteredOzet?.reduce((acc: any, curr: any) => ({
        toplamPrim: acc.toplamPrim + (curr.toplamPrim || 0),
        toplamKomisyon: acc.toplamKomisyon + (curr.toplamKomisyon || 0),
        policeSayisi: acc.policeSayisi + (curr.policeSayisi || 0),
        evetSayisi: acc.evetSayisi + (curr.evetSayisi || 0),
        tutarFarkiSayisi: acc.tutarFarkiSayisi + (curr.tutarFarkiSayisi || 0),
    }), { toplamPrim: 0, toplamKomisyon: 0, policeSayisi: 0, evetSayisi: 0, tutarFarkiSayisi: 0 })
    || { toplamPrim: 0, toplamKomisyon: 0, policeSayisi: 0, evetSayisi: 0, tutarFarkiSayisi: 0 };

    const dekontOrani = stats.policeSayisi > 0
        ? ((stats.evetSayisi / stats.policeSayisi) * 100).toFixed(1)
        : "0.0";

    // Şirket (acente) bazlı agregasyon — referans kart kırılımı
    const sirketDetay = (filteredOzet || []).reduce((acc: any[], curr: any) => {
        const existing = acc.find(x => x.sirket === curr.sirket);
        if (existing) {
            existing.toplamPrim += (curr.toplamPrim || 0);
            existing.toplamKomisyon += (curr.toplamKomisyon || 0);
            existing.policeSayisi += (curr.policeSayisi || 0);
            existing.evetSayisi += (curr.evetSayisi || 0);
        } else {
            acc.push({
                sirket: curr.sirket,
                toplamPrim: curr.toplamPrim || 0,
                toplamKomisyon: curr.toplamKomisyon || 0,
                policeSayisi: curr.policeSayisi || 0,
                evetSayisi: curr.evetSayisi || 0,
            });
        }
        return acc;
    }, []);

    const sirketDot = (sirket: string) => sirket === COMPANIES.MAPFRE ? "#0ea5e9" : "#7c3aed";

    // KPI kart tanımları (accent-bar)
    const kpis = [
        { label: "Toplam Net Prim", value: formatCurrency(stats.toplamPrim), sub: `${yil} kümülatif`, color: "#0ea5e9" },
        { label: "Toplam Komisyon", value: formatCurrency(stats.toplamKomisyon), sub: "komisyon", color: "#7c3aed" },
        { label: "Poliçe Adedi", value: String(stats.policeSayisi), sub: `${stats.evetSayisi} dekont · ${stats.tutarFarkiSayisi} tutar farkı`, color: "#d97706" },
        { label: "Dekont Oranı", value: `%${dekontOrani}`, sub: "tahsil edilmiş", color: "#10b981" },
    ];

    const FirmaSortCaret = ({ column }: { column: typeof firmaSortKey }) => {
        if (firmaSortKey !== column) return null;
        return <span className="ml-1">{firmaSortDir === 'asc' ? '▲' : '▼'}</span>;
    };

    return (
        <div className="space-y-[18px]">
            {/* 5 KPI kartı — accent-bar */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
                {kpis.map((k) => (
                    <div key={k.label} className="relative overflow-hidden rounded-[14px] border bg-card p-4">
                        <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: k.color }} />
                        <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground leading-tight pl-2">{k.label}</div>
                        <div className="mt-2 text-[21px] font-extrabold tracking-tight tabular-nums pl-2">{k.value}</div>
                        <div className="mt-0.5 text-[11.5px] text-muted-foreground pl-2">{k.sub}</div>
                    </div>
                ))}
            </div>

            {/* Şirket Bazlı Detay (sol) + Dekont Edilmemiş Poliçeler (sağ) */}
            <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4">
                {/* Şirket Bazlı Detay */}
                <div className="rounded-[14px] border bg-card p-5">
                    <h3 className="text-[15px] font-bold mb-1">Şirket Bazlı Detay</h3>
                    <p className="text-xs text-muted-foreground mb-4">{yil} · acente bazında prim &amp; komisyon</p>
                    <div className="flex flex-col gap-3.5">
                        {sirketDetay.length === 0 && (
                            <div className="text-center text-sm text-muted-foreground py-6">Veri yok</div>
                        )}
                        {sirketDetay.map((row: any) => {
                            const oran = row.toplamPrim > 0
                                ? ((row.toplamKomisyon / row.toplamPrim) * 100).toFixed(1).replace('.', ',')
                                : "0,0";
                            return (
                                <div key={row.sirket} className="rounded-xl border p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2.5">
                                            <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: sirketDot(row.sirket) }} />
                                            <span className="text-sm font-bold">{row.sirket}</span>
                                        </div>
                                        <span className="text-xs text-muted-foreground">{row.policeSayisi} poliçe</span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2.5">
                                        <div>
                                            <div className="text-[11px] text-muted-foreground">Net Prim</div>
                                            <div className="text-sm font-bold mt-0.5 tabular-nums">{formatCurrency(row.toplamPrim)}</div>
                                        </div>
                                        <div>
                                            <div className="text-[11px] text-muted-foreground">Komisyon</div>
                                            <div className="text-sm font-bold mt-0.5 tabular-nums" style={{ color: "#7c3aed" }}>{formatCurrency(row.toplamKomisyon)}</div>
                                        </div>
                                        <div>
                                            <div className="text-[11px] text-muted-foreground">Komisyon %</div>
                                            <div className="text-sm font-bold mt-0.5 tabular-nums" style={{ color: "#0284c7" }}>%{oran}</div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Dekont Edilmemiş Poliçeler */}
                <div className="rounded-[14px] border bg-card p-5 flex flex-col">
                    <div className="flex items-baseline justify-between mb-1">
                        <h3 className="text-[15px] font-bold">Dekont Edilmemiş Poliçeler</h3>
                        <span className="text-xs font-bold tabular-nums" style={{ color: "#dc2626" }}>{dekontsuz.length} adet</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3.5">en eski önce · net prim</p>
                    <div className="flex flex-col gap-2.5 flex-1">
                        {dekontsuzTop.length === 0 && (
                            <div className="text-center text-sm text-muted-foreground py-6">Dekont edilmemiş poliçe yok 🎉</div>
                        )}
                        {dekontsuzTop.map((p: any) => (
                            <div key={p.id} className="flex items-center gap-2.5">
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dekontDotColor(p._gun) }} />
                                <div className="flex-1 min-w-0">
                                    <div className="text-[13px] font-semibold truncate" title={p.sigortali}>{p.sigortali}</div>
                                    <div className="text-[11px] text-muted-foreground">{p.policeNo} · {p._gun ?? "—"} gün</div>
                                </div>
                                <span className="text-[13px] font-bold tabular-nums flex-shrink-0">{formatCurrency(p.netPrim)}</span>
                            </div>
                        ))}
                    </div>
                    <div className="mt-4 pt-3.5 border-t flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Toplam dekont edilmemiş</span>
                        <span className="text-base font-extrabold tabular-nums" style={{ color: "#dc2626" }}>{formatCurrency(dekontsuzToplam)}</span>
                    </div>
                </div>
            </div>

            {/* En Çok Brüt Prim Üreten Firmalar — sortable */}
            <div className="rounded-[14px] border bg-card overflow-hidden">
                <div className="px-5 py-4 border-b flex items-center justify-between flex-wrap gap-2">
                    <h3 className="text-[15px] font-bold">En Çok Brüt Prim Üreten Firmalar</h3>
                    <span className="text-xs text-muted-foreground">
                        {sortedFirmalar.length} firma · {yil}{ay !== 'toplam' ? ` / ${AYLAR.find(a => a.value === ay)?.label}` : ''} · sütun başlığına tıklayarak sırala
                    </span>
                </div>
                <div className="overflow-x-auto">
                    <div className="min-w-[640px]">
                        <div className="grid grid-cols-[0.4fr_2fr_1fr_1fr_0.8fr] gap-3 px-5 py-3 bg-muted/40 border-b text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
                            <div>#</div>
                            <button onClick={() => toggleFirmaSort('sigortali')} className="text-left uppercase hover:text-foreground">
                                Firma<FirmaSortCaret column="sigortali" />
                            </button>
                            <button onClick={() => toggleFirmaSort('brutPrim')} className="text-right uppercase hover:text-foreground">
                                Brüt Prim<FirmaSortCaret column="brutPrim" />
                            </button>
                            <button onClick={() => toggleFirmaSort('komisyon')} className="text-right uppercase hover:text-foreground">
                                Komisyon<FirmaSortCaret column="komisyon" />
                            </button>
                            <button onClick={() => toggleFirmaSort('policeSayisi')} className="text-right uppercase hover:text-foreground">
                                Poliçe<FirmaSortCaret column="policeSayisi" />
                            </button>
                        </div>
                        {sortedFirmalar.length === 0 ? (
                            <div className="px-5 py-6 text-center text-sm text-muted-foreground">Veri yok</div>
                        ) : (
                            sortedFirmalar.map((f: any, idx: number) => (
                                <div key={`${f.sigortali}-${idx}`} className="grid grid-cols-[0.4fr_2fr_1fr_1fr_0.8fr] gap-3 px-5 py-3 border-b items-center hover:bg-muted/40 transition-colors">
                                    <div className="text-xs font-bold tabular-nums text-muted-foreground/60">{idx + 1}</div>
                                    <div className="text-[13.5px] font-semibold truncate" title={f.sigortali}>{f.sigortali}</div>
                                    <div className="text-right text-[13.5px] font-bold tabular-nums">{formatCurrency(f.brutPrim)}</div>
                                    <div className="text-right text-[13px] font-semibold tabular-nums" style={{ color: "#7c3aed" }}>{formatCurrency(f.komisyon)}</div>
                                    <div className="text-right text-[13px] tabular-nums text-muted-foreground">{f.policeSayisi}</div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// 2. POLİÇE LİSTESİ TAB COMPONENT
// ---------------------------------------------------------------------------
function PoliceListesi({ yil, ay, acente = "tum" }: { yil: number, ay: string, acente?: "tum" | "mapfre" | "ray" }) {
    const { mapfreVarMi } = useSigortaSirketler(yil);
    const [subTab, setSubTab] = useState("ray");
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'policeNo', direction: 'asc' });

    // Filters
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [sigortaliFilter, setSigortaliFilter] = useState("");
    const [bransFilter, setBransFilter] = useState("ALL");

    // Tıkla → eşleşen muhasebe kayıtlarını göster
    const [selectedPolicy, setSelectedPolicy] = useState<any | null>(null);
    const { data: matchedMuhasebe, isLoading: matchedLoading } = useQuery({
        queryKey: ['sigorta-muhasebe-by-police', selectedPolicy?.id],
        queryFn: async () => {
            if (!selectedPolicy?.id) return [];
            const res = await apiRequest("GET", `/api/sigorta/muhasebe/by-police/${selectedPolicy.id}`);
            return res.json();
        },
        enabled: !!selectedPolicy?.id,
    });

    // Mapfre verisi olmayan bir yıla geçildiğinde alt sekme Mapfre'de takılı kalmasın.
    useEffect(() => {
        if (!mapfreVarMi && subTab === "mapfre") setSubTab("ray");
    }, [mapfreVarMi, subTab]);

    // Acente filtresi seçiliyse şirketi ona kilitle; değilse iç subTab toggle'ı sürer.
    const effectiveTab = acente === "tum" ? subTab : acente;
    const effectiveCompany = effectiveTab === "mapfre" ? COMPANIES.MAPFRE : COMPANIES.RAY;
    const effectiveLabel = effectiveTab === "mapfre" ? "Mapfre" : "Ray Sigorta";

    const queryKey = ['sigorta-policeler', effectiveCompany, ay, yil];

    const { data: policeler, isLoading } = useQuery({
        queryKey,
        queryFn: async () => {
             let url = `/api/sigorta/policeler?sirket=${encodeURIComponent(effectiveCompany)}&yil=${yil}`;
             if (ay !== 'toplam') url += `&ay=${ay}`;
             const res = await apiRequest("GET", url);
             return res.json();
        }
    });

    const sortedPoliceler = useMemo(() => {
        if (!policeler) return [];
        let sorted = [...policeler];

        // 1. Filter (statü bazlı)
        if (statusFilter !== "ALL") {
            sorted = sorted.filter((p: any) => {
                if (statusFilter === "EVET") return p.dekontDurumu === "EVET";
                if (statusFilter === "TUTAR_FARKI") return p.dekontDurumu === "TUTAR FARKI";
                // HAYIR → EVET ve TUTAR FARKI dışındaki her şey (null/boş dahil)
                if (statusFilter === "HAYIR") return p.dekontDurumu !== "EVET" && p.dekontDurumu !== "TUTAR FARKI";
                return true;
            });
        }

        if (sigortaliFilter) {
            const search = sigortaliFilter.toLowerCase();
            sorted = sorted.filter((p: any) =>
                p.sigortali?.toLowerCase().includes(search) ||
                p.policeNo?.includes(search)
            );
        }

        if (bransFilter !== "ALL") {
            sorted = sorted.filter((p: any) => (p.brans || "").trim() === bransFilter);
        }

        // 2. Sort
        sorted.sort((a, b) => {
            if (sortConfig.key === 'policeNo') {
                // Try numeric sort if possible, else string
                const aNum = parseInt(a.policeNo.replace(/\D/g, ''));
                const bNum = parseInt(b.policeNo.replace(/\D/g, ''));
                if (!isNaN(aNum) && !isNaN(bNum)) {
                     return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
                }
                return sortConfig.direction === 'asc' 
                    ? a.policeNo.localeCompare(b.policeNo)
                    : b.policeNo.localeCompare(a.policeNo);
            }
            if (sortConfig.key === 'tanzimTarihi') {
                // Parse DD.MM.YYYY
                const parseDate = (d: string) => {
                    const parts = d.split('.');
                    if (parts.length !== 3) return 0;
                    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])).getTime();
                };
                const aTime = parseDate(a.tanzimTarihi || "");
                const bTime = parseDate(b.tanzimTarihi || "");
                return sortConfig.direction === 'asc' ? aTime - bTime : bTime - aTime;
            }
            return 0;
        });
        return sorted;
    }, [policeler, sortConfig, statusFilter, sigortaliFilter, bransFilter]);

    const uniqueBranslar = useMemo(() => {
        if (!policeler) return [];
        const set = new Set<string>();
        for (const p of policeler) {
            const b = (p.brans || "").trim();
            if (b) set.add(b);
        }
        return Array.from(set).sort();
    }, [policeler]);

    const requestSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const handleExport = async () => {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Poliçeler');
        const sirketName = effectiveTab === 'mapfre' ? 'Mapfre' : 'Ray';

        // 1. Report Title (Merged Rows 1-3)
        worksheet.mergeCells('A1:I3');
        const titleCell = worksheet.getCell('A1');
        titleCell.value = `${sirketName} SİGORTA POLİÇE LİSTESİ - ${yil}`;
        titleCell.font = { name: 'Arial', size: 20, bold: true, color: { argb: 'FF2C3E50' } }; // Dark Blue-Grey
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        
        // 2. Define Headers (Row 4)
        const headerTerms = [
            { header: 'Branş', key: 'brans', width: 10 },
            { header: 'Poliçe No', key: 'policeNo', width: 25 },
            { header: 'Sigortalı', key: 'sigortali', width: 45 },
            { header: 'Tanzim Tarihi', key: 'tanzimTarihi', width: 16 },
            { header: 'Net Prim', key: 'netPrim', width: 18 },
            { header: 'Brüt Prim', key: 'brutPrim', width: 18 },
            { header: 'Komisyon', key: 'komisyon', width: 18 },
            { header: 'Dekont', key: 'dekontDurumu', width: 15 },
        ];

        // We set proper keys/headers but we will manually style Row 4 as header
        worksheet.getRow(4).values = headerTerms.map(h => h.header);
        worksheet.columns = headerTerms.map(h => ({ key: h.key, width: h.width })); // Map column keys for data insertion

        const headerRow = worksheet.getRow(4);
        headerRow.height = 35;
        headerRow.eachCell((cell) => {
            cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }; // White Text
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF1F4E78' } // Deep Blue Background
            };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = {
                bottom: { style: 'medium', color: { argb: 'FFFFFFFF' } }, // White separator
                right: { style: 'thin', color: { argb: 'FF5DADE2' } } // Lighter blue separator
            };
        });

        // 3. Add Data with Zebra Striping
        let totalNet = 0, totalBrut = 0, totalKom = 0;

        sortedPoliceler.forEach((p: any, index: number) => {
            // Calculate totals
            const net = parseFloat(p.netPrim) || 0;
            const brut = parseFloat(p.brutPrim) || 0;
            const kom = parseFloat(p.komisyon) || 0;

            totalNet += net;
            totalBrut += brut;
            totalKom += kom;

            const row = worksheet.addRow({
                brans: p.brans,
                policeNo: p.policeNo,
                sigortali: p.sigortali,
                tanzimTarihi: p.tanzimTarihi,
                netPrim: net,
                brutPrim: brut,
                komisyon: kom,
                dekontDurumu: p.dekontDurumu === 'EVET' ? 'EVET' : (p.dekontDurumu === 'HAYIR' ? 'HAYIR' : 'HAYIR')
            });

            row.height = 24; // Comfortable height
            
            // Zebra Striping (Even rows get light background)
            if (index % 2 === 1) {
                row.eachCell({ includeEmpty: true }, (cell) => {
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFF2F4F8' } // Very Light Blue-Grey
                    };
                });
            }

            // Cell Styles
            const centerCols = ['brans', 'tanzimTarihi'];
            const moneyCols = ['netPrim', 'brutPrim', 'komisyon'];

            row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                const colKey = headerTerms[colNumber - 1].key;
                
                cell.font = { name: 'Arial', size: 10, color: { argb: 'FF333333' } }; // Dark Grey Text
                cell.border = {
                    bottom: { style: 'thin', color: { argb: 'FFE5E8E8' } }, // Very subtle border
                    right: { style: 'dotted', color: { argb: 'FFE5E8E8' } }
                };
                
                // Alignment
                if (colKey === 'policeNo') {
                    cell.alignment = { vertical: 'middle', horizontal: 'center' }; // Centered as requested
                    cell.font = { ...cell.font, bold: true };
                    (cell as any).ignoredErrors = { numberStoredAsText: true };
                } else if (colKey === 'brans') {
                    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
                    (cell as any).ignoredErrors = { numberStoredAsText: true };
                } else if (centerCols.includes(colKey)) {
                    cell.alignment = { vertical: 'middle', horizontal: 'center' };
                } else if (moneyCols.includes(colKey)) {
                    cell.alignment = { vertical: 'middle', horizontal: 'right' };
                    cell.numFmt = '#,##0.00 "₺"';
                    cell.font = { ...cell.font, name: 'Consolas' }; // Monospace for numbers looks professional
                } else if (colKey === 'dekontDurumu') {
                    cell.alignment = { vertical: 'middle', horizontal: 'center' };
                } else {
                    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
                }

                // Status Badge Fill Effect
                if (colKey === 'dekontDurumu') {
                     if (cell.value === 'EVET') {
                         cell.fill = {
                             type: 'pattern',
                             pattern: 'solid',
                             fgColor: { argb: 'FFC6EFCE' } // Light Green Fill
                         };
                         cell.font = { color: { argb: 'FF006100' }, bold: true }; // Dark Green Text
                     } else {
                         cell.fill = {
                             type: 'pattern',
                             pattern: 'solid',
                             fgColor: { argb: 'FFFFC7CE' } // Light Red Fill
                         };
                         cell.font = { color: { argb: 'FF9C0006' }, bold: true }; // Dark Red Text
                     }
                }
            });
        });

        // 5. Totals Row
        const totalRow = worksheet.addRow({
            sigortali: 'GENEL TOPLAM',
            netPrim: totalNet,
            brutPrim: totalBrut,
            komisyon: totalKom
        });
        
        totalRow.height = 30;
        totalRow.eachCell((cell, colNumber) => {
            cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF000000' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEBF5FB' } }; // Light Blue Header-match
            cell.border = { top: { style: 'double' } };
            
            const colKey = headerTerms[colNumber - 1]?.key;
            if (['netPrim', 'brutPrim', 'komisyon'].includes(colKey || '')) {
                cell.numFmt = '#,##0.00 "₺"';
                cell.alignment = { vertical: 'middle', horizontal: 'right' };
            } else if (colKey === 'sigortali') {
                cell.alignment = { vertical: 'middle', horizontal: 'right' };
            }
        });



        // Generate Buffer and Save
        const buffer = await workbook.xlsx.writeBuffer();
        saveAs(new Blob([buffer]), `${sirketName}_Policeler_${yil}_${ay}.xlsx`);
    };

    // Calculate summary stats (EVET / HAYIR / TUTAR FARKI)
    const stats = useMemo(() => {
        let evet = 0, hayir = 0, tutarFarki = 0;
        sortedPoliceler.forEach((p: any) => {
            if (p.dekontDurumu === 'EVET') evet++;
            else if (p.dekontDurumu === 'TUTAR FARKI') tutarFarki++;
            else hayir++;
        });
        return { evet, hayir, tutarFarki };
    }, [sortedPoliceler]);

    // Branş rozet renk eşlemesi (referanstan birebir: [zemin, metin])
    const bransColors: Record<string, [string, string]> = {
        Trafik: ["#e0f2fe", "#075985"],
        Kasko: ["#ede9fe", "#6d28d9"],
        DASK: ["#fef3c7", "#92400e"],
        Sağlık: ["#dcfce7", "#166534"],
        Nakliyat: ["#ffedd5", "#9a3412"],
    };
    const bransColor = (b: string): [string, string] => bransColors[(b || "").trim()] || ["#f1f5f9", "#475569"];

    const SortHeaderBtn = ({ column, label, align = "left" }: { column: string, label: string, align?: "left" | "right" | "center" }) => (
        <button
            onClick={() => requestSort(column)}
            className={cn(
                "flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-[0.03em] text-slate-500 hover:text-slate-700 transition-colors",
                align === "right" && "ml-auto",
                align === "center" && "mx-auto",
            )}
        >
            {label}
            <span className="text-[9px] leading-none w-2 inline-block">
                {sortConfig.key === column ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
            </span>
        </button>
    );

    return (
        <div className="space-y-4">
            {/* Üst satır: arama + acente toggle (yalnız "tum") + poliçe sayısı */}
            <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 max-w-[340px] min-w-[220px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                    <Input
                        placeholder="Sigortalı / Poliçe No ara…"
                        className="h-[38px] pl-9 rounded-[9px] text-[13px]"
                        value={sigortaliFilter}
                        onChange={(e) => setSigortaliFilter(e.target.value)}
                    />
                </div>

                {/* Tek acente kaldıysa toggle anlamsız; yalnızca Mapfre verisi olan yıllarda çizilir. */}
                {acente === "tum" && mapfreVarMi && (
                    <div className="inline-flex items-center rounded-[9px] border bg-slate-50 p-0.5">
                        {(["mapfre", "ray"] as const).map((t) => (
                            <button
                                key={t}
                                onClick={() => setSubTab(t)}
                                className={cn(
                                    "px-3 h-[30px] rounded-[7px] text-[12.5px] font-semibold transition-colors",
                                    subTab === t
                                        ? "bg-white text-sky-700 shadow-sm"
                                        : "text-slate-500 hover:text-slate-700",
                                )}
                            >
                                {t === "mapfre" ? "Mapfre" : "Ray"}
                            </button>
                        ))}
                    </div>
                )}

                {/* Branş & dekont durumu filtreleri korunuyor */}
                <Select value={bransFilter} onValueChange={setBransFilter}>
                    <SelectTrigger className="w-[150px] h-[38px] rounded-[9px] text-[12.5px]">
                        <SelectValue placeholder="Branş" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ALL">Tüm Branşlar</SelectItem>
                        {uniqueBranslar.map((b) => (
                            <SelectItem key={b} value={b}>{b}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[150px] h-[38px] rounded-[9px] text-[12.5px]">
                        <SelectValue placeholder="Dekont Durumu" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ALL">Tümü</SelectItem>
                        <SelectItem value="EVET">Dekont Evet</SelectItem>
                        <SelectItem value="HAYIR">Dekont Hayır</SelectItem>
                        <SelectItem value="TUTAR_FARKI">Tutar Farkı</SelectItem>
                    </SelectContent>
                </Select>

                <Button variant="outline" size="sm" onClick={handleExport} className="h-[38px] rounded-[9px]">
                    <Download className="w-4 h-4 mr-2" />
                    Excel İndir
                </Button>

                <span className="ml-auto text-[12.5px] text-slate-400 tabular-nums">
                    {effectiveLabel} · {sortedPoliceler.length} poliçe
                </span>
            </div>

            {/* Poliçe tablosu kartı */}
            <div className="rounded-[14px] border bg-card overflow-hidden">
                <div className="overflow-x-auto">
                    <div className="min-w-[880px]">
                        {/* Başlık satırı */}
                        <div className="grid items-center gap-2.5 px-5 py-3 bg-slate-50 border-b text-[10.5px] font-bold uppercase tracking-[0.03em] text-slate-500"
                            style={{ gridTemplateColumns: "0.8fr 1.2fr 1.8fr 1fr 1fr 1fr 0.8fr" }}>
                            <div>Branş</div>
                            <div><SortHeaderBtn column="policeNo" label="Poliçe No" /></div>
                            <div>Sigortalı</div>
                            <div className="text-right">Net Prim</div>
                            <div className="text-right">Brüt Prim</div>
                            <div className="text-right">Komisyon</div>
                            <div className="text-center">Dekont</div>
                        </div>

                        {/* Gövde */}
                        {isLoading ? (
                            <div className="h-24 flex items-center justify-center text-sm text-muted-foreground">Yükleniyor...</div>
                        ) : sortedPoliceler.length === 0 ? (
                            <div className="h-24 flex items-center justify-center text-sm text-muted-foreground">Kayıt bulunamadı.</div>
                        ) : (
                            <>
                                {sortedPoliceler.length > 500 && (
                                    <div className="px-5 py-2 text-xs text-amber-700 bg-amber-50 border-b">
                                        ⚠ Performans için yalnızca ilk 500 kayıt gösteriliyor. Toplam {sortedPoliceler.length} kayıt — daraltmak için filtre kullanın veya Excel olarak indirin.
                                    </div>
                                )}
                                {sortedPoliceler.slice(0, 500).map((p: any) => {
                                    const [bg, fg] = bransColor(p.brans);
                                    const isDekont = p.dekontDurumu === 'EVET';
                                    return (
                                        <div
                                            key={p.id}
                                            onClick={() => setSelectedPolicy(p)}
                                            title="Detay için tıkla"
                                            className="grid items-center gap-2.5 px-5 py-[11px] border-b last:border-b-0 hover:bg-slate-50 cursor-pointer transition-colors"
                                            style={{ gridTemplateColumns: "0.8fr 1.2fr 1.8fr 1fr 1fr 1fr 0.8fr" }}
                                        >
                                            <div>
                                                <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold"
                                                    style={{ background: bg, color: fg }}>
                                                    {p.brans}
                                                </span>
                                            </div>
                                            <div className="font-mono text-[12px] text-sky-600 truncate">{p.policeNo}</div>
                                            <div className="text-[13px] font-semibold text-slate-800 truncate">{p.sigortali}</div>
                                            <div className="text-right text-[12.5px] text-slate-600 tabular-nums">{formatCurrency(parseFloat(p.netPrim))}</div>
                                            <div className="text-right text-[13px] font-bold text-slate-900 tabular-nums">{formatCurrency(parseFloat(p.brutPrim))}</div>
                                            <div className="text-right text-[12.5px] font-medium text-violet-600 tabular-nums">{formatCurrency(parseFloat(p.komisyon))}</div>
                                            <div className="text-center">
                                                {p.dekontDurumu === 'TUTAR FARKI' ? (
                                                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-50 text-amber-700">FARKLILIK</span>
                                                ) : (
                                                    <span className={cn(
                                                        "inline-block px-2.5 py-0.5 rounded-full text-[10.5px] font-bold",
                                                        isDekont ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
                                                    )}>
                                                        {isDekont ? "EVET" : "—"}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </>
                        )}
                    </div>
                </div>
            </div>

            <PoliceMuhasebeDialog
                policy={selectedPolicy}
                muhasebe={matchedMuhasebe}
                loading={matchedLoading}
                onClose={() => setSelectedPolicy(null)}
            />

        </div>
    );
}

// Poliçeye tıklayınca eşleşen muhasebe satırlarını gösteren modal.
// brut_prim ile borç/alacak farkını görsel olarak vurgular — TUTAR FARKI durumunda
// kullanıcı manuel teyit yapabilir.
function PoliceMuhasebeDialog({ policy, muhasebe, loading, onClose }: {
    policy: any | null;
    muhasebe: any[] | undefined;
    loading: boolean;
    onClose: () => void;
}) {
    if (!policy) return null;

    const fmt = (n: number) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(n);
    const policyBrut = parseFloat(policy.brutPrim || "0");

    const muhasebeTotalAmount = (muhasebe || []).reduce((acc, m) => {
        const b = parseFloat(m.borc || "0");
        const a = parseFloat(m.alacak || "0");
        return acc + (b > 0 ? b : a);
    }, 0);
    const fark = muhasebeTotalAmount - policyBrut;

    return (
        <Dialog open={!!policy} onOpenChange={(o) => { if (!o) onClose(); }}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Eşleşen Muhasebe Kayıtları</DialogTitle>
                    <DialogDescription>
                        Poliçe <span className="font-mono font-semibold">{policy.policeNo}</span> — {policy.sigortali}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-3 gap-3 mt-2">
                    <Card>
                        <CardContent className="pt-4">
                            <div className="text-xs text-muted-foreground">Poliçe Brüt Primi</div>
                            <div className="text-lg font-semibold">{fmt(policyBrut)} ₺</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-4">
                            <div className="text-xs text-muted-foreground">Muhasebe Toplamı</div>
                            <div className="text-lg font-semibold">{fmt(muhasebeTotalAmount)} ₺</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-4">
                            <div className="text-xs text-muted-foreground">Fark</div>
                            <div className={`text-lg font-semibold ${Math.abs(fark) < 1 ? 'text-green-600' : 'text-red-600'}`}>
                                {fark >= 0 ? '+' : ''}{fmt(fark)} ₺
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="mt-2">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Tarih</TableHead>
                                <TableHead>Belge No</TableHead>
                                <TableHead>Açıklama</TableHead>
                                <TableHead className="text-right">Borç</TableHead>
                                <TableHead className="text-right">Alacak</TableHead>
                                <TableHead className="text-right">Bakiye</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={6} className="text-center h-16">Yükleniyor…</TableCell></TableRow>
                            ) : (muhasebe || []).length === 0 ? (
                                <TableRow><TableCell colSpan={6} className="text-center h-16 text-muted-foreground">Bu poliçeyle eşleşmiş muhasebe kaydı yok.</TableCell></TableRow>
                            ) : (
                                (muhasebe || []).map((m: any) => (
                                    <TableRow key={m.id}>
                                        <TableCell>{m.tarih}</TableCell>
                                        <TableCell className="font-mono text-xs">{m.belgeNo}</TableCell>
                                        <TableCell className="max-w-[220px] truncate" title={m.aciklama}>{m.aciklama}</TableCell>
                                        <TableCell className="text-right">{fmt(parseFloat(m.borc || "0"))}</TableCell>
                                        <TableCell className="text-right">{fmt(parseFloat(m.alacak || "0"))}</TableCell>
                                        <TableCell className="text-right">{fmt(parseFloat(m.bakiye || "0"))}</TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Kapat</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ---------------------------------------------------------------------------
// 3. VERİ YÜKLEME TAB COMPONENT
// ---------------------------------------------------------------------------
function VeriYukleme({ yil, globalAy }: { yil: number; globalAy: string }) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    // Mapfre'ye yeni veri yüklenmiyor — varsayılan ve tek seçenek Ray Sigorta.
    const [subTab, setSubTab] = useState("ray");
    // "auto" → Excel tarih sütunundan tespit (default davranış).
    // Belirli bir ay seçilirse, tarih kolonu okunamayan satırlar için fallback olarak kullanılır.
    const [ayOverride, setAyOverride] = useState<string>(globalAy === "toplam" ? "auto" : globalAy);
    // Ray cutoff manuel override — auto-detect (gap detection) çalışmazsa
    // veya kullanıcı kesin bir sınır biliyorsa buraya yazar (örn. 1494789982).
    const [rayCutoffOverride, setRayCutoffOverride] = useState<string>("");

    // Fetch existing policies from DB for the selected company and year
    // This serves as the "Combined List" mentioned by the user
    const { data: storedPolicies, isLoading, refetch } = useQuery({
        queryKey: ['sigorta-policeler-yukleme', subTab === "mapfre" ? COMPANIES.MAPFRE : COMPANIES.RAY, yil],
        queryFn: async () => {
             const companyName = subTab === "mapfre" ? COMPANIES.MAPFRE : COMPANIES.RAY;
             const res = await apiRequest("GET", `/api/sigorta/policeler?sirket=${encodeURIComponent(companyName)}&yil=${yil}`);
             return res.json();
        }
    });
    
    // Sort Config
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'policeNo', direction: 'asc' });

    const [processing, setProcessing] = useState(false);
    const [unmatchedRecords, setUnmatchedRecords] = useState<any[]>([]);

    // Enhanced Filters & Selection (Moved from Sigorta)
    const [statusFilter, setStatusFilter] = useState<"ALL" | "EVET" | "HAYIR">("ALL");
    const [sigortaliFilter, setSigortaliFilter] = useState<string>("");
    const [selectedPolicies, setSelectedPolicies] = useState<number[]>([]);
    
    // Matching Modal State
    const [isMatchModalOpen, setIsMatchModalOpen] = useState(false);
    const [selectedUnmatchedRecord, setSelectedUnmatchedRecord] = useState<any>(null);
    const [matchSearchQuery, setMatchSearchQuery] = useState("");
    const [matchSortBy, setMatchSortBy] = useState<"sigortali" | "brutPrim">("sigortali");
    const [rematchProcessing, setRematchProcessing] = useState(false);

    // Fetch Accounting Records (Muhasebe)
    const { data: storedMuhasebe, refetch: refetchMuhasebe } = useQuery({
        queryKey: ['sigorta-muhasebe', subTab, yil],
        queryFn: async () => {
             const companyName = subTab === 'mapfre' ? COMPANIES.MAPFRE : COMPANIES.RAY;
             const res = await apiRequest("GET", `/api/sigorta/muhasebe?sirket=${encodeURIComponent(companyName)}&yil=${yil}`);
             return res.json();
        }
    });

    // Eşleşmeyenler — banka/vergi hareketleri (durum 3) hariç tutulur.
    // Reddedilen öneriler (durum 4) hâlâ eşleşmemiştir, listede kalırlar;
    // yalnızca haklarında bir daha öneri üretilmez.
    const unmatchedRecordsList = useMemo(() => {
        if (!storedMuhasebe) return [];
        return storedMuhasebe.filter((m: any) =>
            m.eslestiMi === MUHASEBE_DURUM.ESLESMEDI || m.eslestiMi === MUHASEBE_DURUM.ONERI_REDDEDILDI);
    }, [storedMuhasebe]);

    // Kullanıcı onayına sunulacak eşleştirme önerileri. Hiçbir şey otomatik
    // bağlanmaz — bu liste yalnızca aday + gerekçe gösterir.
    const eslesmeOnerileri = useMemo(() => {
        if (!storedMuhasebe || !storedPolicies) return [] as { kayit: any; oneri: EslesmeOnerisi }[];
        const bekleyenler = storedMuhasebe.filter((m: any) => m.eslestiMi === MUHASEBE_DURUM.ESLESMEDI);
        const sonuc: { kayit: any; oneri: EslesmeOnerisi }[] = [];
        for (const kayit of bekleyenler) {
            const oneri = eslesmeOnerisiBul(kayit, storedPolicies);
            if (oneri) sonuc.push({ kayit, oneri });
        }
        return sonuc.sort((a, b) => b.oneri.skor - a.oneri.skor);
    }, [storedMuhasebe, storedPolicies]);

    const [oneriIsleniyor, setOneriIsleniyor] = useState<string | null>(null);

    const oneriSonrasiTazele = () => {
        refetch();
        refetchMuhasebe();
        queryClient.invalidateQueries({ queryKey: ['sigorta-policeler'] });
        queryClient.invalidateQueries({ queryKey: ['sigorta-ozet'] });
        queryClient.invalidateQueries({ queryKey: ['sigorta-muhasebe'] });
        queryClient.invalidateQueries({ queryKey: ['sigorta-policeler-aging'] });
    };

    const oneriOnayla = async (kayit: any, police: any) => {
        setOneriIsleniyor(kayit.id);
        try {
            // Tutar uyuşmuyorsa poliçe "EVET" değil "TUTAR FARKI" olarak kapanır —
            // yükleme akışındaki kuralın aynısı.
            const brut = parseFloat(police.brutPrim || "0") || 0;
            const alacak = parseFloat(kayit.alacak || "0") || 0;
            const tutarFarki = alacak > 0 && Math.abs(brut - alacak) > Math.max(1, brut * 0.01);
            await apiRequest("PUT", `/api/sigorta/muhasebe/${kayit.id}/match`, {
                eslestiMi: true,
                eslesenPolicyId: police.id,
                dekontDurumu: tutarFarki ? "TUTAR FARKI" : "EVET",
            });
            oneriSonrasiTazele();
            toast({
                title: tutarFarki ? "Eşleştirildi (tutar farklı)" : "Eşleştirildi",
                description: `${kayit.belgeNo || "(evrak no yok)"} → ${police.policeNo}`,
            });
        } catch (err) {
            console.error(err);
            toast({ variant: "destructive", title: "Hata", description: "Eşleştirme kaydedilemedi." });
        } finally {
            setOneriIsleniyor(null);
        }
    };

    const oneriReddet = async (kayit: any) => {
        setOneriIsleniyor(kayit.id);
        try {
            await apiRequest("PUT", `/api/sigorta/muhasebe/${kayit.id}/durum`, {
                eslestiMi: MUHASEBE_DURUM.ONERI_REDDEDILDI,
            });
            oneriSonrasiTazele();
            toast({ title: "Öneri reddedildi", description: "Kayıt eşleşmeyenler listesinde kalacak." });
        } catch (err) {
            console.error(err);
            toast({ variant: "destructive", title: "Hata", description: "Öneri reddedilemedi." });
        } finally {
            setOneriIsleniyor(null);
        }
    };

    // Filtered Policies for Display
    const filteredPolicies = useMemo(() => {
        if (!storedPolicies) return [];
        return storedPolicies.filter((p: any) => {
             // 1. Status Filter
             if (statusFilter === 'EVET' && p.dekontDurumu !== 'EVET') return false;
             if (statusFilter === 'HAYIR' && p.dekontDurumu === 'EVET') return false;
             // 2. Company Filter (Implicit via subTab)
             const companyName = subTab === 'mapfre' ? COMPANIES.MAPFRE : COMPANIES.RAY;
             if (p.sirket !== companyName) return false;
             // 3. Sigortali Filter
             if (sigortaliFilter && !String(p.sigortali).toLowerCase().includes(sigortaliFilter.toLowerCase())) return false;

             return true;
        }).sort((a: any, b: any) => {
            if (sortConfig.key === 'policeNo') {
                 const aNum = parseInt(a.policeNo.replace(/\D/g, ''));
                 const bNum = parseInt(b.policeNo.replace(/\D/g, ''));
                 if (!isNaN(aNum) && !isNaN(bNum)) {
                      return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
                 }
                 return sortConfig.direction === 'asc' 
                     ? a.policeNo.localeCompare(b.policeNo)
                     : b.policeNo.localeCompare(a.policeNo);
            }
            if (sortConfig.key === 'sigortali') {
                 return sortConfig.direction === 'asc'
                     ? String(a.sigortali).localeCompare(String(b.sigortali))
                     : String(b.sigortali).localeCompare(String(a.sigortali));
            }
            if (sortConfig.key === 'tanzimTarihi') {
                 const parseDate = (d: string) => {
                     if (!d) return 0;
                     const parts = d.split('.');
                     if (parts.length !== 3) return 0;
                     return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])).getTime();
                 };
                 const aTime = parseDate(a.tanzimTarihi);
                 const bTime = parseDate(b.tanzimTarihi);
                 return sortConfig.direction === 'asc' ? aTime - bTime : bTime - aTime;
            }
            return 0;
        });
    }, [storedPolicies, statusFilter, subTab, sigortaliFilter, sortConfig]);

    const requestSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const SortIcon = ({ column }: { column: string }) => {
        if (sortConfig.key !== column) return <ArrowUpDown className="ml-2 h-4 w-4" />;
        if (sortConfig.direction === 'asc') return <ArrowUp className="ml-2 h-4 w-4" />;
        return <ArrowDown className="ml-2 h-4 w-4" />;
    };

    // Reset selection when tab changes
    useEffect(() => {
        setSelectedPolicies([]);
        setStatusFilter("ALL");
    }, [subTab]);

    // Tekrar Eşleştir — eşleşmeyen muhasebe kayıtlarını mevcut poliçe listesine
    // karşı yeniden tarar. Use case: kullanıcı önce muhasebeyi yükledi, sonra
    // poliçeleri yükledi → otomatik akış zaten kapanmış, manuel buton gerek.
    // Mantık: VeriYukleme akışındaki matching ile aynı (exact + Ray suffix).
    const handleRematchUnmatched = async () => {
        if (!storedPolicies || storedPolicies.length === 0) {
            toast({ variant: "destructive", title: "Hata", description: "Önce poliçe listesi yüklenmeli." });
            return;
        }
        if (!unmatchedRecordsList || unmatchedRecordsList.length === 0) {
            toast({ title: "Bilgi", description: "Eşleşmeyen kayıt yok." });
            return;
        }

        setRematchProcessing(true);
        try {
            const isMapfre = subTab === 'mapfre';
            const policyMap = new Map<string, any>();
            const mapfreSuffixMap = new Map<string, any[]>();
            storedPolicies.forEach((p: any) => {
                const norm = String(p.policeNo).replace(/[^a-zA-Z0-9]/g, "");
                policyMap.set(norm, p);
                if (isMapfre && norm.startsWith('21025')) {
                    const rawSuffix = norm.slice(5);
                    if (rawSuffix.length > 0) {
                        const suffix = String(parseInt(rawSuffix));
                        if (!mapfreSuffixMap.has(suffix)) mapfreSuffixMap.set(suffix, []);
                        mapfreSuffixMap.get(suffix)?.push(p);
                    }
                }
            });

            const matches: Array<{ muhasebeId: string; policyId: string; dekontDurumu: string }> = [];
            for (const rec of unmatchedRecordsList) {
                const accNo = String(rec.belgeNo || "").replace(/[^a-zA-Z0-9]/g, "");
                const accAmount = parseFloat(rec.alacak || "0");
                // Evrak no boş olabilir — numara açıklamaya gömülmüş olabilir.

                let matched: any = null;
                if (isMapfre) {
                    if (policyMap.has(accNo)) {
                        matched = policyMap.get(accNo);
                    } else {
                        const suffixKey = String(parseInt(accNo));
                        const cand = mapfreSuffixMap.get(suffixKey);
                        if (cand && cand.length === 1) matched = cand[0];
                        else if (cand && cand.length > 1) {
                            const close = cand.filter((p: any) => Math.abs(parseFloat(p.brutPrim) - accAmount) < 1.0);
                            if (close.length === 1) matched = close[0];
                        }
                    }
                } else {
                    // Ray — yükleme akışıyla aynı numara kademeleri.
                    for (const aday of policeNoAdaylari(rec.belgeNo, rec.aciklama)) {
                        if (policyMap.has(aday)) { matched = policyMap.get(aday); break; }
                    }
                }

                if (matched) {
                    // Tutar uyuşmuyorsa poliçe "TUTAR FARKI" olarak kapanmalı;
                    // eskiden bu akış koşulsuz "EVET" yazıyordu.
                    const pBrut = parseFloat(matched.brutPrim || "0") || 0;
                    const tutarFarki = accAmount > 0 && Math.abs(pBrut - accAmount) > Math.max(1, pBrut * 0.01);
                    matches.push({
                        muhasebeId: rec.id,
                        policyId: matched.id,
                        dekontDurumu: tutarFarki ? "TUTAR FARKI" : "EVET",
                    });
                }
            }

            if (matches.length === 0) {
                toast({ title: "Eşleşme bulunamadı", description: "Mevcut poliçe listesinde eşleşen kayıt yok." });
                setRematchProcessing(false);
                return;
            }

            // Paralel PATCH — match endpoint hem muhasebe hem poliçeyi günceller
            await Promise.all(matches.map(m =>
                apiRequest("PUT", `/api/sigorta/muhasebe/${m.muhasebeId}/match`, {
                    eslestiMi: true,
                    eslesenPolicyId: m.policyId,
                    dekontDurumu: m.dekontDurumu,
                })
            ));

            refetch();
            refetchMuhasebe();
            queryClient.invalidateQueries({ queryKey: ['sigorta-policeler'] });
            queryClient.invalidateQueries({ queryKey: ['sigorta-ozet'] });
            queryClient.invalidateQueries({ queryKey: ['sigorta-muhasebe'] });
            toast({
                title: "Eşleştirme Tamamlandı",
                description: `${matches.length} muhasebe kaydı eşleştirildi.`,
            });
        } catch (err) {
            console.error(err);
            toast({ variant: "destructive", title: "Hata", description: "Yeniden eşleştirme sırasında hata oluştu." });
        } finally {
            setRematchProcessing(false);
        }
    };

    // Bulk Update Handler — race-safe PATCH ile sadece dekontDurumu alanını gönderir.
    const handleBulkUpdate = async () => {
        if (selectedPolicies.length === 0) return;

        const confirmUpdate = window.confirm(`${selectedPolicies.length} adet poliçeyi 'EVET' olarak işaretlemek istediğinize emin misiniz?`);
        if (!confirmUpdate) return;

        try {
            const res = await apiRequest("PATCH", "/api/sigorta/policeler/dekont", {
                ids: selectedPolicies,
                dekontDurumu: "EVET",
            });
            const result = await res.json();

            if (result.success) {
                toast({ title: "Başarılı", description: `${result.count} poliçe güncellendi.` });
                setSelectedPolicies([]);
                refetch();
                queryClient.invalidateQueries({ queryKey: ['sigorta-ozet'] });
                queryClient.invalidateQueries({ queryKey: ['sigorta-policeler'] });
            }
        } catch (err) {
            console.error(err);
            toast({ variant: "destructive", title: "Hata", description: "Güncelleme sırasında hata oluştu." });
        }
    };

    // Helper functions
    const parseAmount = (val: any) => {
        if (typeof val === 'number') return val;
        if (!val) return 0;
        const str = String(val).trim();
        // Remove currency symbols if present (₺, TL, $)
        const cleanStr = str.replace(/[₺$€TL]/g, '').trim();
        
        // TR format: 1.234,56
        if (cleanStr.includes(',') && cleanStr.includes('.')) {
            if (cleanStr.lastIndexOf(',') > cleanStr.lastIndexOf('.')) {
                 // 1.234,56 -> remove dots, replace comma
                 return parseFloat(cleanStr.replace(/\./g, '').replace(',', '.'));
            } else {
                 // 1,234.56 -> remove comma
                 return parseFloat(cleanStr.replace(/,/g, ''));
            }
        } 
        if (cleanStr.includes(',')) return parseFloat(cleanStr.replace(',', '.'));
        return parseFloat(cleanStr);
    };

    // Helper to extract month from dates like "10.01.2025" or Excel serial date
    const formatExcelDate = (dateVal: any): string => {
        if (!dateVal) return "";
        // If Excel serial number (e.g. 45659)
        if (typeof dateVal === 'number') {
            const date = new Date(Math.round((dateVal - 25569) * 86400 * 1000));
            const d = String(date.getDate()).padStart(2, '0');
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const y = date.getFullYear();
            return `${d}.${m}.${y}`;
        }
        return String(dateVal);
    };

    // Rapor başlığından dönem tespiti — Ray "Kaynak Poliçe Listesi" gibi
    // raporların ilk satırında "… 01/06/2026 - 30/06/2026" biçiminde dönem
    // aralığı bulunur. İki tarih aynı ay/yıla düşüyorsa dönemi döndürür;
    // tanzim tarihi çözülemeyen satırlar için ay/yıl fallback'i olarak kullanılır.
    const detectTitlePeriod = (rows: any[][]): { ay: string; yil: number } | null => {
        for (let r = 0; r < Math.min(rows.length, 5); r++) {
            for (const cell of rows[r] || []) {
                if (typeof cell !== "string") continue;
                const m = cell.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/);
                if (m && m[2] === m[5] && m[3] === m[6]) {
                    return { ay: String(parseInt(m[2])), yil: parseInt(m[3]) };
                }
            }
        }
        return null;
    };

    // Helper to extract month from dates like "10.01.2025" or Excel serial date.
    // ayOverride !== "auto" ise tarih çözümlemesi başarısız olduğunda override'a,
    // o da yoksa rapor başlığından tespit edilen döneme (titlePeriod) düşer.
    const extractMonthAndYear = (dateVal: any, titlePeriod?: { ay: string; yil: number } | null): {ay: string, yil: number} => {
        const fallback = (): {ay: string, yil: number} =>
            ayOverride !== "auto" ? { ay: ayOverride, yil } : (titlePeriod ?? { ay: "1", yil });

        if (!dateVal) return fallback();

        if (typeof dateVal === 'number') {
            const date = new Date(Math.round((dateVal - 25569) * 86400 * 1000));
            return { ay: String(date.getMonth() + 1), yil: date.getFullYear() };
        }

        const dateStr = String(dateVal).trim();
        let parts = dateStr.split('.');
        if (parts.length > 1 && parts[1] && parts[2]) {
            return { ay: String(parseInt(parts[1])), yil: parseInt(parts[2]) };
        }

        parts = dateStr.split('-');
        if (parts.length > 1) {
            return { ay: String(parseInt(parts[1])), yil: parseInt(parts[0].length === 4 ? parts[0] : parts[2]) };
        }

        parts = dateStr.split('/');
        if (parts.length > 1 && parts[1] && parts[2]) {
            return { ay: String(parseInt(parts[1])), yil: parseInt(parts[2]) };
        }

        return fallback();
    };

    // ─────────────────────────────────────────────────────────────
    // Header-tabanlı kolon eşleme
    // ─────────────────────────────────────────────────────────────
    // Sigorta firmaları zaman zaman Excel kolon sırasını değiştiriyor.
    // Sabit indeks (row[0]=Branş, row[4]=Net Prim...) yerine ilk
    // satırlardaki başlıkları okuyup metinden hangi kolonun ne olduğunu
    // tespit ediyoruz. Birden fazla başlık satırı (merged title) için
    // ilk 10 satırı tarıyoruz.
    const normalizeHeader = (s: any): string => {
        if (s === null || s === undefined) return "";
        return String(s)
            .toLowerCase()
            .replace(/ş/g, "s").replace(/ı/g, "i").replace(/ğ/g, "g")
            .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
            .replace(/[^a-z0-9]/g, ""); // boşluk, nokta, parantez, vs. hepsi atılır
    };

    // Her field için kabul edilen başlık varyantları (normalize edilmiş hâli)
    const HEADER_SYNONYMS: Record<string, string[]> = {
        // "urunadi": Ray "Kaynak Poliçe Listesi" raporunda branş kolonu yok,
        // ürün adı (NAKLİYAT EMTİA vb.) branş olarak kullanılıyor.
        brans:         ["brans", "branch", "branskodu", "branskod", "urunadi", "urunad", "urunno", "urunkodu", "urun"],
        policeNo:      ["policeno", "policyno", "policiseno", "polno", "polnumarasi", "polnumara"],
        sigortali:     ["sigortaliadi", "sigortali", "sigortaliad", "sigortaliunvan", "musteriadi", "musteri", "musteriad", "musteriunvan", "insured", "adsoyad", "unvan"],
        // "onaytarihi": Ray'in yeni raporunda tanzim tarihi kolonu "P Onay Tarihi"
        // adıyla geliyor; yalnızca genel "tarih" sinonimine bırakılırsa başka bir
        // tarih kolonu (valör vb.) öne geçebilir.
        tanzimTarihi:  ["tanzimtarihi", "tanzim", "onaytarihi", "onaytarih", "duzenleme", "duzenlematarihi", "duzenlematar", "tarih", "policetarihi", "baslangictarihi"],
        netPrim:       ["netprim", "net", "netprimi", "netprimtutari", "primnet"],
        brutPrim:      ["brutprim", "brut", "brutprimi", "brutprimtutari", "primbrut", "toplamprim", "odemekprim"],
        komisyon:      ["komisyon", "komisyontutari", "komisyontutar", "commission", "komtutari", "komtutar"],
        // NOT: "sigortaBedeli" artık takip edilmiyor — Ray'in yeni raporunda bu
        // kolon yok ve iş akışında kullanılmıyor. DB kolonu geçmiş veri için duruyor.
        dekontDurumu:  ["dekont", "dekontdurumu", "dekontdurum", "dekontevethayir"],
    };

    // Muhasebe (hesap ekstresi) Excel'i için ayrı sözlük
    const MUHASEBE_HEADER_SYNONYMS: Record<string, string[]> = {
        tarih:    ["tarih", "islemtarihi", "vadetarihi", "hareketkayittarihi", "fistarihi", "operasyontarihi"],
        belgeNo:  ["belgeno", "belge", "fisno", "policeno", "policyno", "evrakno", "referansno", "referans", "fis", "policeevrakno"],
        aciklama: ["aciklama", "explanation", "fisaciklama", "hareketaciklama", "detay", "not"],
        borc:    ["borc", "debit", "tlborc", "borctutari"],
        alacak:  ["alacak", "credit", "tlalacak", "alacaktutari"],
        bakiye:  ["bakiye", "balance", "tlbakiye", "kalantutar"],
    };

    type ColumnMap = Partial<Record<keyof typeof HEADER_SYNONYMS, number>>;

    // Generic header tespiti — synonyms sözlüğü ve "minimum gerekli alanlar" listesi alır
    const detectHeaderGeneric = (
        rows: any[][],
        synonyms: Record<string, string[]>,
        requiredFields: string[],
    ): { headerRowIdx: number; mapping: Record<string, number> } | null => {
        const MAX_SCAN = Math.min(rows.length, 10);
        for (let r = 0; r < MAX_SCAN; r++) {
            const row = rows[r];
            if (!row || row.length < 2) continue;

            // Skor tabanlı eşleme: birebir eşleşme her zaman kısmi eşleşmeyi,
            // uzun kısmi eşleşme kısa olanı yener. "İlk eşleşen kolon kazanır"
            // yaklaşımı Ray listesinde "U Sigortalı No"nun (43. kolon)
            // "U Sigortalı Adı"ndan (44. kolon) önce sigortali alanını
            // kapmasına yol açıyordu — sigortalı adı yerine müşteri numarası
            // kaydediliyordu.
            const candidates: { field: string; col: number; score: number }[] = [];
            for (let c = 0; c < row.length; c++) {
                const norm = normalizeHeader(row[c]);
                if (!norm) continue;
                for (const [field, list] of Object.entries(synonyms)) {
                    let best = 0;
                    for (const s of list) {
                        if (norm === s) best = Math.max(best, 1000 + s.length);
                        else if (norm.includes(s) || s.includes(norm)) best = Math.max(best, Math.min(s.length, norm.length));
                    }
                    if (best > 0) candidates.push({ field, col: c, score: best });
                }
            }
            candidates.sort((a, b) => b.score - a.score || a.col - b.col);
            const mapping: Record<string, number> = {};
            const usedCols = new Set<number>();
            for (const cand of candidates) {
                if (mapping[cand.field] !== undefined || usedCols.has(cand.col)) continue;
                mapping[cand.field] = cand.col;
                usedCols.add(cand.col);
            }

            const hasRequired = requiredFields.every(f => mapping[f] !== undefined);
            if (hasRequired) return { headerRowIdx: r, mapping };
        }
        return null;
    };

    const detectHeader = (rows: any[][]): { headerRowIdx: number; mapping: ColumnMap } | null => {
        // Poliçe için en az policeNo + (netPrim veya brutPrim) — özel "VEYA" mantığı
        const MAX_SCAN = Math.min(rows.length, 10);
        for (let r = 0; r < MAX_SCAN; r++) {
            const detected = detectHeaderGeneric(rows.slice(r, r + 1), HEADER_SYNONYMS, []);
            if (!detected) continue;
            const m = detected.mapping;
            if (m.policeNo !== undefined && (m.netPrim !== undefined || m.brutPrim !== undefined)) {
                return { headerRowIdx: r, mapping: m as ColumnMap };
            }
        }
        return null;
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setProcessing(true);
        try {
            const reader = new FileReader();
            reader.onload = async (evt) => {
                try {
                    const data = evt.target?.result;
                    const workbook = XLSX.read(data, { type: 'binary' });
                    // Ray raporu "Report" sayfasıyla geliyor; gelmezse en dolu sayfa seçilir.
                    const sheetName = veriSayfasiniSec(workbook, ["Report", "Poliçe Listesi", "Policeler"]);
                    const sheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

                    // Header tespiti — kolon sırası firmaya göre değişir, başlıktan eşle
                    const detected = detectHeader(jsonData);
                    if (!detected) {
                        const firstRow = jsonData[0] ? JSON.stringify(jsonData[0]).slice(0, 150) : "(boş)";
                        toast({
                            variant: "destructive",
                            title: "Başlık satırı tanınmadı",
                            description: `Excel'in ilk 10 satırında 'Poliçe No' + 'Net/Brüt Prim' içeren başlık bulunamadı. İlk satır: ${firstRow}`,
                        });
                        setProcessing(false);
                        e.target.value = "";
                        return;
                    }
                    const { headerRowIdx, mapping } = detected;
                    const titlePeriod = detectTitlePeriod(jsonData.slice(0, headerRowIdx + 1));
                    const colOf = (field: keyof typeof HEADER_SYNONYMS, fallback?: number) =>
                        (mapping as any)[field] !== undefined ? (mapping as any)[field] : fallback;

                    const policiesToSave: any[] = [];
                    const uniqueMap = new Map<string, any>();

                    for (let i = headerRowIdx + 1; i < jsonData.length; i++) {
                        const row = jsonData[i];
                        if (!row || row.length < 2) continue;

                        // Poliçe No zorunlu — yoksa satırı atla
                        const policeCol = colOf("policeNo");
                        const pNo = policeCol !== undefined ? row[policeCol] : undefined;
                        if (!pNo) continue;

                        const tanzimCol = colOf("tanzimTarihi");
                        const tanzimRaw = tanzimCol !== undefined ? row[tanzimCol] : undefined;
                        const dateInfo = extractMonthAndYear(tanzimRaw, titlePeriod);

                        const get = (field: keyof typeof HEADER_SYNONYMS) => {
                            const c = colOf(field);
                            return c !== undefined ? row[c] : undefined;
                        };

                        const sigortaliRaw = String(get("sigortali") || "");
                        const brutPrimVal = parseAmount(get("brutPrim"));
                        // Dekont beklenmeyenler: FEKA/PROMEDİS poliçeleri + primi sıfır olan her poliçe
                        const excelDekont = String(get("dekontDurumu") || "").trim();
                        const autoEvet = isDekontBeklenmez(sigortaliRaw, brutPrimVal);
                        const policy = {
                            brans: String(get("brans") || ""),
                            policeNo: String(pNo).replace(/[^a-zA-Z0-9]/g, ""),
                            sigortali: sigortaliRaw,
                            tanzimTarihi: formatExcelDate(tanzimRaw),
                            netPrim: String(parseAmount(get("netPrim"))),
                            brutPrim: String(brutPrimVal),
                            komisyon: String(parseAmount(get("komisyon"))),
                            sirket: subTab === "mapfre" ? COMPANIES.MAPFRE : COMPANIES.RAY,
                            // Öncelik: Excel'de açıkça yazılı dekont durumu > auto-EVET > boş (upsert korur)
                            dekontDurumu: excelDekont !== "" ? excelDekont : (autoEvet ? "EVET" : ""),
                            ay: dateInfo ? dateInfo.ay : "1",
                            yil: dateInfo ? dateInfo.yil : yil,
                        };

                        // Zeyilname/iptal birleştirme (aynı policeNo + sirket → tutarları topla)
                        const key = `${policy.policeNo}-${policy.sirket}`;
                        if (uniqueMap.has(key)) {
                            const existing = uniqueMap.get(key);
                            existing.netPrim = String(parseFloat(existing.netPrim) + parseFloat(policy.netPrim));
                            existing.brutPrim = String(parseFloat(existing.brutPrim) + parseFloat(policy.brutPrim));
                            existing.komisyon = String(parseFloat(existing.komisyon) + parseFloat(policy.komisyon));
                        } else {
                            uniqueMap.set(key, policy);
                        }
                    }

                    policiesToSave.push(...Array.from(uniqueMap.values()));

                    // Tanı log'u — kullanıcı toast'tan görünmeyen bilgileri burada çıkartıyoruz
                    console.log("[Sigorta Upload] header satırı:", headerRowIdx, "kolon eşleme:", mapping, "→", policiesToSave.length, "poliçe");


                    
                    if (policiesToSave.length > 0) {
                        const res = await apiRequest("POST", "/api/sigorta/policeler", policiesToSave);
                        const result = await res.json();
                        if (result.success) {
                            // Hangi alanlar bulundu / bulunmadı raporu
                            const expectedFields = ["brans", "policeNo", "sigortali", "tanzimTarihi", "netPrim", "brutPrim", "komisyon"] as const;
                            const eksikler = expectedFields.filter(f => (mapping as any)[f] === undefined);
                            const eksikUyari = eksikler.length > 0 ? ` Bulunmayan kolonlar: ${eksikler.join(", ")}.` : "";
                            toast({
                                title: "Yükleme Başarılı",
                                description: `${result.count} poliçe işlendi/güncellendi. Başlık satırı: ${headerRowIdx + 1}.${eksikUyari}`,
                            });
                            refetch();
                            queryClient.invalidateQueries({ queryKey: ['sigorta-ozet'] });
                            queryClient.invalidateQueries({ queryKey: ['sigorta-policeler'] });
                        }
                    } else {
                        toast({
                            variant: "destructive",
                            title: "Veri Eşleşmedi",
                            description: `Başlık tanındı (satır ${headerRowIdx + 1}) ama hiç geçerli poliçe satırı bulunamadı (Poliçe No boş).`,
                        });
                    }

                } catch (err) {
                    console.error(err);
                    toast({ variant: "destructive", title: "Hata", description: "Dosya işlenirken hata oluştu." });
                } finally {
                    setProcessing(false);
                    // Reset file input
                    e.target.value = "";
                }
            };
            reader.readAsBinaryString(file);
        } catch (error) {
             console.error(error);
             setProcessing(false);
        }
    };

    const handleAccountingUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;


        
        if (!storedPolicies || storedPolicies.length === 0) {
            toast({ variant: "destructive", title: "Hata", description: "Önce poliçe listesini yüklemelisiniz." });
            e.target.value = "";
            return;
        }

        setProcessing(true);
        // setUnmatchedRecords([]); // Legacy local state no longer used for display, but maybe for toast?
        try {
            const reader = new FileReader();
            reader.onload = async (evt) => {
                try {
                    const data = evt.target?.result;
                    const workbook = XLSX.read(data, { type: 'binary' });
                    
                    // Muhasebe dosyası boş bir "Sayfa1" ile geliyor, veri "Hesap Ekstresi"nde.
                    const sheetName = veriSayfasiniSec(workbook, ["Hesap Ekstresi", "Hesap Ozeti", "Ekstre"]);

                    const sheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

                    console.log(`Processing Sheet: ${sheetName}, Rows: ${jsonData.length}`);

                    const accountingToSave: any[] = [];
                    const policiesToUpdate = new Map<number, any>();
                    let matchCount = 0;
                    let bankaHareketiSayisi = 0;
                    let farkliYilSayisi = 0;
                    // Aynı poliçeye ikinci bir tahakkuk satırı düşerse mükerrer kayıt
                    // şüphesi doğar; sessizce ikisini de "EVET" saymak yerine uyarılır.
                    const policeBasinaSatir = new Map<string, number>();
                    const mukerrerAdaylari: string[] = [];

                    // 1. Build Index Maps
                    const policyMap = new Map<string, any>(); // Exact normalized match (Ray & Mapfre Full)
                    const mapfreSuffixMap = new Map<string, any[]>(); // Suffix match for Mapfre (Key: Suffix string, Val: Policy[])

                    storedPolicies.forEach((p: any) => {
                         const normalized = String(p.policeNo).replace(/[^a-zA-Z0-9]/g, "");
                         policyMap.set(normalized, p);

                         // Build Mapfre Suffix Index (Format: 21025XXXXXXXX)
                         if (subTab === 'mapfre' && normalized.startsWith('21025')) {
                             // Extract suffix (everything after 21025)
                             // Example: 2102500000259 -> 00000259 -> 259
                             const rawSuffix = normalized.slice(5);
                             if (rawSuffix.length > 0) {
                                  const suffix = String(parseInt(rawSuffix));
                                  if (!mapfreSuffixMap.has(suffix)) {
                                      mapfreSuffixMap.set(suffix, []);
                                  }
                                  mapfreSuffixMap.get(suffix)?.push(p);
                             }
                         }
                    });

                    // Ray cutoff — default'ta KAPALI. Auto-gap detection devre dışı
                    // çünkü muhasebe kayıtlarında bazen poliçe numarası kısaltılarak
                    // (son 5-6 hane) yazılıyor, ve auto-cutoff bunları yanlışlıkla
                    // atıyordu. Bunun yerine: cutoff yok + Ray suffix matching.
                    // Manuel override hâlâ desteklenir (UI input dolu ise).
                    let rayMinPolicyNo = 0;
                    let cutoffSource = "";
                    if (subTab === 'ray') {
                        const manual = parseInt((rayCutoffOverride || "").replace(/\D/g, ''));
                        if (!isNaN(manual) && manual > 0) {
                            rayMinPolicyNo = manual;
                            cutoffSource = "manuel";
                            console.log(`[Ray cutoff] ${cutoffSource}: ${rayMinPolicyNo} (bundan küçük muhasebe satırları atlanacak)`);
                        } else {
                            console.log(`[Ray cutoff] devre dışı — tüm satırlar değerlendirilecek, kısaltılmış no'lar suffix ile eşleşecek`);
                        }
                    }
                    let skippedByCutoff = 0;

                    // Header-tabanlı kolon tespiti — muhasebe Excel'i firmaya göre değişiyor
                    const mDetected = detectHeaderGeneric(jsonData, MUHASEBE_HEADER_SYNONYMS, ["belgeNo"]);
                    if (!mDetected) {
                        const firstRow = jsonData[0] ? JSON.stringify(jsonData[0]).slice(0, 150) : "(boş)";
                        toast({
                            variant: "destructive",
                            title: "Muhasebe başlığı tanınmadı",
                            description: `Başlık satırında 'Belge No / Poliçe No' kolonu bulunamadı. İlk satır: ${firstRow}`,
                        });
                        setProcessing(false);
                        e.target.value = "";
                        return;
                    }
                    const { headerRowIdx: mHeaderIdx, mapping: mMap } = mDetected;
                    const mCol = (field: string): number | undefined => mMap[field];
                    const mGet = (row: any[], field: string) => {
                        const c = mCol(field);
                        return c !== undefined ? row[c] : undefined;
                    };
                    console.log("[Muhasebe Upload] header satırı:", mHeaderIdx, "kolon eşleme:", mMap);

                    for (let i = mHeaderIdx + 1; i < jsonData.length; i++) {
                        const row = jsonData[i];
                        if (!row) continue;

                        const tarihRaw = mGet(row, "tarih");
                        const belgeNoRaw = mGet(row, "belgeNo");
                        const aciklamaRaw = mGet(row, "aciklama");
                        const borcRaw = mGet(row, "borc");
                        const alacakRaw = mGet(row, "alacak");
                        const bakiyeRaw = mGet(row, "bakiye");

                        if (!belgeNoRaw && !aciklamaRaw) continue; // tamamen boş satırları atla

                        const accountingPolicyNo = String(belgeNoRaw || "").replace(/[^a-zA-Z0-9]/g, "");

                        // Ray cutoff — geçmiş yıl carry-over satırlarını atla
                        if (rayMinPolicyNo > 0 && accountingPolicyNo) {
                            const accNum = parseInt(accountingPolicyNo);
                            if (!isNaN(accNum) && accNum < rayMinPolicyNo) {
                                skippedByCutoff++;
                                continue;
                            }
                        }

                        const accBorc = parseAmount(borcRaw);
                        const accAlacak = parseAmount(alacakRaw);
                        // Poliçe Brüt Primi muhasebe defterinde sigorta şirketinin
                        // ALACAK kolonuna yazılır (bize olan borcu). Borç ise tahsilat
                        // satırı olup farklı tutarda olabilir. Karşılaştırma için
                        // her zaman ALACAK kullanılır.
                        const accAmount = accAlacak;

                        const sirket = subTab === 'mapfre' ? COMPANIES.MAPFRE : COMPANIES.RAY;

                        // Yıl artık satırın kendi tarihinden alınıyor; eskiden UI'daki
                        // yıl seçimi yazılıyordu ve 2025 tarihli bir satır 2026'ya düşüyordu.
                        const tarihBilgi = extractMonthAndYear(tarihRaw);
                        const bankaHareketi = isBankaHareketi(belgeNoRaw, aciklamaRaw, accBorc, accAlacak);
                        if (bankaHareketi) bankaHareketiSayisi++;
                        if (tarihBilgi && tarihBilgi.yil !== yil) farkliYilSayisi++;

                        const accRecord = {
                            tarih: formatExcelDate(tarihRaw),
                            belgeNo: String(belgeNoRaw || ""),
                            aciklama: String(aciklamaRaw || ""),
                            borc: String(accBorc),
                            alacak: String(accAlacak),
                            bakiye: String(parseAmount(bakiyeRaw)),
                            sirket: sirket,
                            ay: tarihBilgi?.ay || "1",
                            yil: tarihBilgi?.yil || yil,
                            eslestiMi: (bankaHareketi ? MUHASEBE_DURUM.BANKA_HAREKETI : MUHASEBE_DURUM.ESLESMEDI) as number,
                            eslesenPolicyId: null as string | null
                        };

                        // Banka/vergi hareketinin poliçe karşılığı olmaz — eşleştirme denenmez.
                        if (bankaHareketi) {
                            accountingToSave.push(accRecord);
                            continue;
                        }

                        let matchedPolicy: any = null;
                        let isSuspicious = false; // Birden fazla aday → ŞÜPHELİ
                        let amountMismatch = false; // Tutar uyuşmazlığı → TUTAR FARKI

                        // ----------------------------------------------------------------
                        // MATCHING ALGORITHM
                        // Mapfre: önce tam eşleşme, sonra suffix; suffix'te birden çok
                        // aday varsa tutar yakınlığına göre disambiguate, hâlâ belirsizse
                        // ŞÜPHELİ olarak işaretle.
                        // Ray: yalnızca tam eşleşme.
                        // ----------------------------------------------------------------
                        if (subTab === 'mapfre') {
                            if (policyMap.has(accountingPolicyNo)) {
                                matchedPolicy = policyMap.get(accountingPolicyNo);
                            }
                            if (!matchedPolicy && accountingPolicyNo) {
                                const suffixKey = String(parseInt(accountingPolicyNo));
                                const candidates = mapfreSuffixMap.get(suffixKey);
                                if (candidates && candidates.length > 0) {
                                    if (candidates.length === 1) {
                                        matchedPolicy = candidates[0];
                                    } else {
                                        // Çoklu aday — tutar yakınlığı ile seç (₺1 tolerans)
                                        const closeByAmount = candidates.filter((p: any) => {
                                            const pBrut = parseFloat(p.brutPrim);
                                            return Math.abs(pBrut - accAmount) < 1.0;
                                        });
                                        if (closeByAmount.length === 1) {
                                            matchedPolicy = closeByAmount[0];
                                        } else {
                                            // Hâlâ belirsiz — ŞÜPHELİ
                                            isSuspicious = true;
                                            console.warn(`Mapfre suffix ${suffixKey} için ${candidates.length} aday var, manuel seçim gerekli:`, candidates.map((c: any) => c.policeNo));
                                        }
                                    }
                                }
                            }
                        } else {
                            // RAY — yalnızca NUMARAYA dayalı kademeler burada çalışır:
                            // ham evrak no, yapışık tarihten arındırılmış hâli ve
                            // açıklamaya gömülü 10 haneli numara denenir.
                            // Tutar/firma benzerliğine dayalı kademe kasten burada
                            // ÇALIŞTIRILMAZ — o kademe "Eşleştirme Önerileri"ni besler
                            // ve yalnızca kullanıcı onayıyla bağlanır.
                            for (const aday of policeNoAdaylari(belgeNoRaw, aciklamaRaw)) {
                                if (policyMap.has(aday)) {
                                    matchedPolicy = policyMap.get(aday);
                                    break;
                                }
                            }
                        }

                        // Tutar tutarsızlık kontrolü (sadece eşleşme bulunduysa)
                        if (matchedPolicy && accAmount > 0) {
                            const policyBrut = parseFloat(matchedPolicy.brutPrim || "0");
                            // %1 veya min ₺1 tolerance
                            const tolerance = Math.max(1, policyBrut * 0.01);
                            if (Math.abs(policyBrut - accAmount) > tolerance) {
                                amountMismatch = true;
                            }
                        }

                        if (matchedPolicy) {
                            const newStatus = amountMismatch ? "TUTAR FARKI" : "EVET";
                            const updatedPolicy = { ...matchedPolicy, dekontDurumu: newStatus };
                            policiesToUpdate.set(matchedPolicy.id, updatedPolicy);
                            accRecord.eslestiMi = MUHASEBE_DURUM.ESLESTI;
                            accRecord.eslesenPolicyId = matchedPolicy.id;
                            if (!amountMismatch) matchCount++;

                            const kac = (policeBasinaSatir.get(matchedPolicy.policeNo) || 0) + 1;
                            policeBasinaSatir.set(matchedPolicy.policeNo, kac);
                            if (kac === 2) mukerrerAdaylari.push(matchedPolicy.policeNo);
                        } else if (isSuspicious) {
                            // ŞÜPHELİ: muhasebe satırı eşleşmedi sayılacak ama log için işaretleyelim
                            // (DB tarafı henüz "şüpheli" alanına sahip değil — şimdilik aciklama'ya iliştirelim)
                            accRecord.aciklama = `[ŞÜPHELİ - manuel seçim] ${accRecord.aciklama}`;
                        }

                        accountingToSave.push(accRecord);
                    }

                    // 1. Save Accounting Records to DB (Persistent)
                    if (accountingToSave.length > 0) {
                         console.log("Saving accounting records:", accountingToSave.length);
                         await apiRequest("POST", "/api/sigorta/muhasebe", accountingToSave);
                    }

                    // 2. Update Matched Policies in DB
                    if (policiesToUpdate.size > 0) {
                        const updates = Array.from(policiesToUpdate.values());
                        console.log("Updating matched policies:", updates.length);
                        await apiRequest("POST", "/api/sigorta/policeler", updates);
                        toast({ title: "Eşleştirme Başarılı", description: `${matchCount} adet poliçe 'EVET' olarak işaretlendi ve kaydedildi.` });
                    } else {
                        toast({ title: "Sonuç", description: "Yeni eşleşme bulunamadı, ancak muhasebe kayıtları güncellendi." });
                    }

                    // Veri Yükleme sekmesinin kendi cache'i + Poliçe Listesi ve Özet
                    // sekmelerinin cache'i ayrı queryKey'ler kullanıyor; hepsini
                    // invalidate etmezsek diğer sekmelerde eski durum görünür.
                    refetch();
                    refetchMuhasebe();
                    queryClient.invalidateQueries({ queryKey: ['sigorta-policeler'] });
                    queryClient.invalidateQueries({ queryKey: ['sigorta-ozet'] });
                    queryClient.invalidateQueries({ queryKey: ['sigorta-muhasebe'] });
                    queryClient.invalidateQueries({ queryKey: ['sigorta-policeler-aging'] });

                    const unmatchedCount = accountingToSave.filter(r => r.eslestiMi === MUHASEBE_DURUM.ESLESMEDI).length;
                    if (unmatchedCount > 0) {
                         toast({
                             variant: "default",
                             title: "Eşleşmeyen kayıt var",
                             description: `${unmatchedCount} muhasebe kaydı eşleşmedi. "Eşleştirme Önerileri" bölümünden aday poliçeleri inceleyebilirsiniz.`,
                         });
                    }
                    if (bankaHareketiSayisi > 0) {
                        toast({
                            title: "Banka hareketi ayrıldı",
                            description: `${bankaHareketiSayisi} satır virman/stopaj/vergi hareketi olarak işaretlendi; poliçe eşleşmesi aranmadı.`,
                        });
                    }
                    if (mukerrerAdaylari.length > 0) {
                        toast({
                            variant: "destructive",
                            title: "Mükerrer kayıt şüphesi",
                            description: `${mukerrerAdaylari.length} poliçeye birden fazla tahakkuk satırı düştü: ${mukerrerAdaylari.slice(0, 3).join(", ")}${mukerrerAdaylari.length > 3 ? "…" : ""}`,
                        });
                    }
                    if (farkliYilSayisi > 0) {
                        toast({
                            title: "Farklı yıla düşen satırlar",
                            description: `${farkliYilSayisi} satırın tarihi ${yil} yılı dışında; kendi yılına kaydedildi.`,
                        });
                    }
                    if (skippedByCutoff > 0 || (subTab === 'ray' && rayMinPolicyNo > 0)) {
                        toast({
                            variant: "default",
                            title: skippedByCutoff > 0 ? "Geçmiş Yıl Atlandı" : "Cutoff Bilgisi",
                            description: `Cutoff: ${rayMinPolicyNo.toLocaleString('tr-TR')} (${cutoffSource}). ${skippedByCutoff} satır bu sınırın altında olduğu için atlandı.`,
                        });
                    }

                } catch (err) {
                    console.error(err);
                    toast({ variant: "destructive", title: "Hata", description: "Muhasebe dosyası işlenirken hata oluştu." });
                } finally {
                    setProcessing(false);
                    e.target.value = "";
                }
            };
            reader.readAsBinaryString(file);
        } catch (err) {
            console.error(err);
            setProcessing(false);
        }
    };

    // Calculate totals
    const totals = storedPolicies?.reduce((acc: any, curr: any) => ({
        netPrim: acc.netPrim + Number(curr.netPrim || 0),
        brutPrim: acc.brutPrim + Number(curr.brutPrim || 0),
        komisyon: acc.komisyon + Number(curr.komisyon || 0),
        count: acc.count + 1
    }), { netPrim: 0, brutPrim: 0, komisyon: 0, count: 0 }) || { netPrim: 0, brutPrim: 0, komisyon: 0, count: 0 };


    return (
        <Tabs defaultValue="ray" value={subTab} onValueChange={setSubTab} className="w-full">
            <TabsList>
                <TabsTrigger value="ray">Ray Sigorta</TabsTrigger>
            </TabsList>
            
            <Card className="mt-4">
                <CardHeader>
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <CardTitle>{subTab === 'mapfre' ? 'Mapfre' : 'Ray'} Veri Yükleme</CardTitle>
                            <CardDescription>
                                {yil} yılı poliçe excelini (Kümülatif veya Aylık) buraya yükleyin. Sistem otomatik olarak birleştirecektir.
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">Ay (fallback):</span>
                            <Select value={ayOverride} onValueChange={setAyOverride}>
                                <SelectTrigger className="w-[200px] h-9">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="auto">Tarihten otomatik</SelectItem>
                                    {AYLAR.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Upload Sections - Side by Side */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Policy Upload Section */}
                        <div className="border border-dashed border-2 rounded-lg p-6 text-center bg-slate-50/50 hover:bg-slate-100/50 transition-colors h-full flex flex-col justify-center">
                            <div className="flex flex-col items-center gap-3">
                                <div className="p-3 bg-blue-100 rounded-full text-blue-600">
                                    <FileSpreadsheet className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-base">Poliçe Listesi Yükle</h3>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        A-H Sütunları (Branş, Poliçe No, Sigortalı, Tarih, Net, Brüt, Komisyon, Bedel)
                                    </p>
                                </div>
                                <div className="relative mt-2">
                                    <Button disabled={processing} className="relative z-0 h-9 text-sm" size="sm">
                                        {processing ? "İşleniyor..." : "Excel Dosyası Seç"}
                                    </Button>
                                    <Input 
                                        type="file" 
                                        accept=".xlsx, .xls" 
                                        className="absolute inset-0 opacity-0 cursor-pointer z-10 h-9" 
                                        onChange={handleFileUpload}
                                        disabled={processing}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Accounting Upload Section */}
                        <div className="border border-dashed border-2 rounded-lg p-6 text-center bg-green-50/50 hover:bg-green-100/50 transition-colors h-full flex flex-col justify-center">
                            <div className="flex flex-col items-center gap-3">
                                <div className="p-3 bg-green-100 rounded-full text-green-600">
                                    <FileSpreadsheet className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-base">Muhasebe Dosyası Yükle</h3>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Muhasebe kayıtlarını içeren Excel dosyasını seçin.
                                    </p>
                                </div>

                                {subTab === 'ray' && (
                                    <div className="w-full max-w-[280px] mt-1 text-left">
                                        <label className="text-xs font-medium text-muted-foreground">
                                            Ray Cutoff (manuel — opsiyonel)
                                        </label>
                                        <Input
                                            type="text"
                                            inputMode="numeric"
                                            placeholder="Boş bırak: otomatik tespit"
                                            value={rayCutoffOverride}
                                            onChange={(e) => setRayCutoffOverride(e.target.value)}
                                            className="h-8 text-xs mt-1"
                                        />
                                        <p className="text-[10px] text-muted-foreground mt-1 leading-tight">
                                            Bu rakamdan küçük poliçe numaralı muhasebe satırları (geçen yıl zeyilleri) atlanır.
                                        </p>
                                    </div>
                                )}

                                <div className="relative mt-2">
                                    <Button disabled={processing} className="relative z-0 h-9 text-sm" variant="outline" size="sm">
                                        {processing ? "İşleniyor..." : "Muhasebe Excel Seç"}
                                    </Button>
                                    <Input 
                                        type="file" 
                                        accept=".xlsx, .xls" 
                                        className="absolute inset-0 opacity-0 cursor-pointer z-10 h-9" 
                                        onChange={handleAccountingUpload}
                                        disabled={processing}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    
                    {/* RESULTS TABS */}
                    <div className="mt-8">
                        <Tabs defaultValue="policy-list" className="w-full">
                            <TabsList className="mb-4">
                                <TabsTrigger value="policy-list" className="flex gap-2">
                                    <Search className="w-4 h-4"/> Mevcut Poliçe Listesi <Badge variant="secondary" className="ml-1">{totals.count}</Badge>
                                </TabsTrigger>
                                <TabsTrigger value="unmatched" className="flex gap-2 text-red-600">
                                    <AlertTriangle className="w-4 h-4"/> Eşleşmeyen Muhasebe Kayıtları <Badge variant="destructive" className="ml-1">{unmatchedRecordsList.length || 0}</Badge>
                                </TabsTrigger>
                            </TabsList>

                            {/* FILTERS & BULK ACTIONS for Policy List */}
                            <div className="flex gap-4 mb-4 items-center flex-wrap bg-white p-2 rounded-md border">
                                <div className="flex items-center gap-2">
                                    <Filter className="w-4 h-4 text-muted-foreground" />
                                    <span className="text-sm font-medium">Filtrele:</span>
                                </div>
                                <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
                                    <SelectTrigger className="w-[150px] h-8">
                                        <SelectValue placeholder="Dekont Durumu" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ALL">Tümü</SelectItem>
                                        <SelectItem value="EVET">Dekont Evet</SelectItem>
                                        <SelectItem value="HAYIR">Dekont Hayır</SelectItem>
                                    </SelectContent>
                                </Select>

                                <Input 
                                    placeholder="Sigortalı Ara..." 
                                    className="w-[200px] h-8"
                                    value={sigortaliFilter}
                                    onChange={(e) => setSigortaliFilter(e.target.value)}
                                />

                                {selectedPolicies.length > 0 && (
                                    <div className="ml-auto flex items-center gap-2">
                                        <span className="text-sm text-muted-foreground">{selectedPolicies.length} poliçe seçildi.</span>
                                        <Button 
                                            size="sm" 
                                            className="h-8 bg-green-600 hover:bg-green-700"
                                            onClick={handleBulkUpdate}
                                        >
                                            <CheckCircle2 className="w-4 h-4 mr-2" />
                                            Seçilenleri Eşleştir (EVET Yap)
                                        </Button>
                                    </div>
                                )}
                            </div>

                            <TabsContent value="policy-list">
                                <div className="rounded-md border shadow-sm">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-slate-50">
                                                <TableHead className="w-[50px]">
                                                    <Checkbox 
                                                        checked={filteredPolicies?.length > 0 && selectedPolicies.length === filteredPolicies?.length}
                                                        onCheckedChange={(checked) => {
                                                            if (checked) {
                                                                setSelectedPolicies(filteredPolicies.map((p: any) => p.id));
                                                            } else {
                                                                setSelectedPolicies([]);
                                                            }
                                                        }}
                                                    />
                                                </TableHead>
                                                <TableHead>Branş</TableHead>
                                                <TableHead>
                                                    <Button variant="ghost" onClick={() => requestSort('policeNo')} className="p-0 hover:bg-transparent font-bold">
                                                        Poliçe No
                                                        <SortIcon column="policeNo" />
                                                    </Button>
                                                </TableHead>
                                                <TableHead>
                                                    <Button variant="ghost" onClick={() => requestSort('sigortali')} className="p-0 hover:bg-transparent font-bold">
                                                        Sigortalı
                                                        <SortIcon column="sigortali" />
                                                    </Button>
                                                </TableHead>
                                                <TableHead>
                                                    <Button variant="ghost" onClick={() => requestSort('tanzimTarihi')} className="p-0 hover:bg-transparent font-bold">
                                                        Tanzim Tarihi
                                                        <SortIcon column="tanzimTarihi" />
                                                    </Button>
                                                </TableHead>
                                                <TableHead className="text-right">Net Prim</TableHead>
                                                <TableHead className="text-right">Brüt Prim</TableHead>
                                                <TableHead className="text-right">Komisyon</TableHead>
                                                <TableHead className="text-center font-bold text-blue-700">Dekont</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {isLoading ? (
                                                <TableRow>
                                                    <TableCell colSpan={10} className="h-24 text-center">Yükleniyor...</TableCell>
                                                </TableRow>
                                            ) : filteredPolicies?.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={10} className="h-24 text-center">Kayıt bulunamadı.</TableCell>
                                                </TableRow>
                                            ) : (
                                                filteredPolicies?.map((p: any) => (
                                                    <TableRow key={p.id}>
                                                        <TableCell>
                                                            <Checkbox 
                                                                checked={selectedPolicies.includes(p.id)}
                                                                onCheckedChange={(checked) => {
                                                                    if (checked) {
                                                                        setSelectedPolicies([...selectedPolicies, p.id]);
                                                                    } else {
                                                                        setSelectedPolicies(selectedPolicies.filter(id => id !== p.id));
                                                                    }
                                                                }}
                                                            />
                                                        </TableCell>
                                                        <TableCell>{p.brans}</TableCell>
                                                        <TableCell className="font-medium">{p.policeNo}</TableCell>
                                                        <TableCell className="max-w-[200px] truncate" title={p.sigortali}>{p.sigortali}</TableCell>
                                                        <TableCell>{p.tanzimTarihi}</TableCell>
                                                        <TableCell className="text-right">{new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(parseFloat(p.netPrim))}</TableCell>
                                                        <TableCell className="text-right">{new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(parseFloat(p.brutPrim))}</TableCell>
                                                        <TableCell className="text-right">{new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(parseFloat(p.komisyon))}</TableCell>
                                                        <TableCell className="text-center">
                                                            {p.dekontDurumu === 'EVET' ? (
                                                                <Badge className="bg-green-500">EVET</Badge>
                                                            ) : p.dekontDurumu === 'TUTAR FARKI' ? (
                                                                <Badge variant="destructive">FARKLILIK</Badge>
                                                            ) : (
                                                                <Badge className="bg-red-500 hover:bg-red-600 text-white">HAYIR</Badge>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </TabsContent>

                            <TabsContent value="unmatched">
                                {/* Öneri paneli — otomatik bağlama yok, her satır kullanıcı onayı bekler */}
                                {eslesmeOnerileri.length > 0 && (
                                    <div className="mb-4 rounded-md border border-amber-200 bg-amber-50/30 shadow-sm">
                                        <div className="p-4 bg-amber-50 border-b border-amber-100">
                                            <div className="flex items-center gap-2 text-amber-900 font-semibold text-sm">
                                                <MousePointerClick className="h-4 w-4" />
                                                Eşleştirme Önerileri ({eslesmeOnerileri.length})
                                            </div>
                                            <p className="mt-1 text-[12.5px] text-amber-800">
                                                Bu kayıtların evrak numarası poliçe listesinde bulunamadı. Tutar, firma ve tarih
                                                yakınlığından aday poliçe çıkarıldı. <strong>Hiçbiri otomatik bağlanmadı</strong> —
                                                onaylamadığınız sürece hiçbir poliçe "EVET" olmaz.
                                            </p>
                                        </div>
                                        <div className="divide-y divide-amber-100">
                                            {eslesmeOnerileri.map(({ kayit, oneri }) => {
                                                const brut = parseFloat(oneri.police.brutPrim || "0") || 0;
                                                const alacak = parseFloat(kayit.alacak || "0") || 0;
                                                return (
                                                    <div key={kayit.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex flex-wrap items-center gap-2 text-[13px]">
                                                                <span className="font-mono text-slate-600">
                                                                    {kayit.belgeNo || <span className="italic text-slate-400">evrak no yok</span>}
                                                                </span>
                                                                <ArrowRightLeft className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                                                                <span className="font-mono font-bold text-slate-900">{oneri.police.policeNo}</span>
                                                            </div>
                                                            <div className="mt-1 truncate text-[12.5px] text-slate-600" title={oneri.police.sigortali}>
                                                                {oneri.police.sigortali}
                                                            </div>
                                                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                                                <span className="text-[12px] text-slate-500">
                                                                    muhasebe {formatCurrency(alacak)} · poliçe {formatCurrency(brut)}
                                                                </span>
                                                                {oneri.gerekceler.map(g => (
                                                                    <Badge key={g} variant="outline" className="border-amber-300 bg-white text-[11px] text-amber-800">
                                                                        {g}
                                                                    </Badge>
                                                                ))}
                                                            </div>
                                                        </div>
                                                        <div className="flex shrink-0 items-center gap-2">
                                                            <Button
                                                                size="sm"
                                                                className="bg-green-600 hover:bg-green-700"
                                                                disabled={oneriIsleniyor === kayit.id}
                                                                onClick={() => oneriOnayla(kayit, oneri.police)}
                                                            >
                                                                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                                                                Onayla
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                disabled={oneriIsleniyor === kayit.id}
                                                                onClick={() => oneriReddet(kayit)}
                                                            >
                                                                <XCircle className="mr-1.5 h-3.5 w-3.5" />
                                                                Reddet
                                                            </Button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                 <div className="rounded-md border border-red-200 bg-red-50/20 shadow-sm">
                                    <div className="p-4 bg-red-50 border-b border-red-100 flex items-center justify-between gap-4">
                                        <span className="text-red-800 text-sm">
                                            Muhasebe Excel'inde bulunup poliçe listesinde karşılığı bulunamayan kayıtlar.
                                            Banka/vergi hareketleri (virman, stopaj) bu listeye dahil edilmez.
                                        </span>
                                        <Button
                                            size="sm"
                                            variant="default"
                                            className="bg-blue-600 hover:bg-blue-700 shrink-0"
                                            disabled={rematchProcessing || (unmatchedRecordsList?.length ?? 0) === 0}
                                            onClick={handleRematchUnmatched}
                                            title="Eşleşmeyen kayıtları mevcut poliçe listesine karşı yeniden tara"
                                        >
                                            {rematchProcessing ? "Eşleştiriliyor..." : "Tekrar Eşleştir"}
                                        </Button>
                                    </div>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Tarih</TableHead>
                                                <TableHead>Evrak No</TableHead>

                                                <TableHead className="text-right">Tutar</TableHead>
                                                <TableHead>Firma</TableHead>
                                                <TableHead className="text-right">İşlemler</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {unmatchedRecordsList.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">Eşleşmeyen kayıt yok.</TableCell>
                                                </TableRow>
                                            ) : (
                                                unmatchedRecordsList.map((rec: any, idx: number) => (
                                                    <TableRow key={rec.id || idx} className="hover:bg-red-50">
                                                        <TableCell>{rec.tarih}</TableCell>
                                                        <TableCell className="font-bold">{rec.belgeNo}</TableCell>
                                                        <TableCell className="text-right">
                                                            {/* Tutar = ALACAK (= brüt prim). Bakiye değil (kümülatif). */}
                                                            {new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(parseFloat(rec.alacak || '0'))}
                                                        </TableCell>
                                                        <TableCell>{rec.aciklama}</TableCell>
                                                        <TableCell className="text-right">
                                                            <div className="flex justify-end gap-2">
                                                                <Button 
                                                                    variant="ghost" 
                                                                    size="icon" 
                                                                    className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-100"
                                                                    onClick={() => {
                                                                        setSelectedUnmatchedRecord(rec);
                                                                        setMatchSearchQuery("");
                                                                        setIsMatchModalOpen(true);
                                                                    }}
                                                                    title="Manuel Eşleştir"
                                                                >
                                                                    <Link className="h-4 w-4" />
                                                                </Button>
                                                                <Button 
                                                                    variant="ghost" 
                                                                    size="icon" 
                                                                    className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-100"
                                                                    onClick={async () => {
                                                                        if (!confirm("Bu kaydı silmek istediğinize emin misiniz?")) return;
                                                                        try {
                                                                            await apiRequest("DELETE", `/api/sigorta/muhasebe/${rec.id}`);
                                                                            refetchMuhasebe();
                                                                            toast({ title: "Silindi", description: "Kayıt başarıyla silindi." });
                                                                        } catch (e) {
                                                                            toast({ variant: "destructive", title: "Hata", description: "Silme işlemi başarısız." });
                                                                        }
                                                                    }}
                                                                    title="Listeden Kaldır"
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </Button>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </TabsContent>
                        </Tabs>
                    </div>
                </CardContent>
            </Card>

            {/* MANUAL MATCHING DIALOG */}
            <Dialog open={isMatchModalOpen} onOpenChange={setIsMatchModalOpen}>
                <DialogContent className="max-w-[700px]">
                    <DialogHeader>
                        <DialogTitle>Manuel Eşleştirme</DialogTitle>
                        <DialogDescription>
                            Muhasebe kaydını eşleştirmek istediğiniz poliçeyi seçin. <br/>
                            <span className="font-bold text-foreground">Kayıt: {selectedUnmatchedRecord ? `${selectedUnmatchedRecord.belgeNo} - ${new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(parseFloat(selectedUnmatchedRecord.alacak || '0'))}` : ''}</span>
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="flex gap-2 mb-4 items-center">
                        <Input
                            placeholder="Poliçe Ara..."
                            value={matchSearchQuery}
                            onChange={(e) => setMatchSearchQuery(e.target.value)}
                            className="flex-1"
                        />
                        <Select value={matchSortBy} onValueChange={(v: any) => setMatchSortBy(v)}>
                            <SelectTrigger className="w-[180px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="sigortali">Sigortalı A-Z</SelectItem>
                                <SelectItem value="brutPrim">Brüt Prim ↑</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="max-h-[300px] overflow-y-auto border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Poliçe No</TableHead>
                                    <TableHead>Sigortalı</TableHead>
                                    <TableHead className="text-right">Tutar</TableHead>
                                    <TableHead>İşlem</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {(storedPolicies || [])
                                    .filter((p: any) => p.dekontDurumu !== 'EVET')
                                    .filter((p: any) =>
                                        matchSearchQuery
                                            ? (p.policeNo.includes(matchSearchQuery) || String(p.sigortali).toLowerCase().includes(matchSearchQuery.toLowerCase()))
                                            : true
                                    )
                                    .slice()
                                    .sort((a: any, b: any) => {
                                        if (matchSortBy === "brutPrim") {
                                            return parseFloat(a.brutPrim || "0") - parseFloat(b.brutPrim || "0");
                                        }
                                        return String(a.sigortali || "").localeCompare(String(b.sigortali || ""), 'tr');
                                    })
                                    .slice(0, 50)
                                    .map((p: any) => (
                                    <TableRow key={p.id} className="hover:bg-slate-50 cursor-pointer" onClick={async () => {
                                        // Perform Match
                                        try {
                                             const updated = { ...p, dekontDurumu: "EVET" };
                                             const res = await apiRequest("POST", "/api/sigorta/policeler", [updated]);
                                             const result = await res.json();
                                             
                                             if (result.success) {
                                                  // Also update Accounting Record status
                                                  if (selectedUnmatchedRecord && selectedUnmatchedRecord.id) {
                                                      await apiRequest("PUT", `/api/sigorta/muhasebe/${selectedUnmatchedRecord.id}/match`, {
                                                          eslestiMi: true,
                                                          eslesenPolicyId: p.id // Use p.id (selected policy)
                                                      });
                                                      refetchMuhasebe();
                                                  }

                                                  toast({ title: "Harika", description: "Poliçe manuel olarak eşleştirildi." });
                                                  setIsMatchModalOpen(false);
                                                  setSelectedUnmatchedRecord(null);
                                                  refetch(); // Refetch policies
                                             }
                                        } catch (e) {
                                            toast({ variant: "destructive", title: "Hata", description: "Eşleştirme başarısız." });
                                        }
                                    }}>
                                        <TableCell className="font-medium">{p.policeNo}</TableCell>
                                        <TableCell>{p.sigortali}</TableCell>
                                        <TableCell className="text-right">{new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(p.brutPrim)}</TableCell>
                                        <TableCell>
                                            <Button size="sm" variant="ghost"><MousePointerClick className="w-4 h-4 text-blue-600"/></Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsMatchModalOpen(false)}>İptal</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>            
        </Tabs>
    );
}

// ---------------------------------------------------------------------------
// 4. YAŞLANDIRMA (AGING) TAB COMPONENT
// ---------------------------------------------------------------------------
// dekontDurumu !== 'EVET' olan poliçeleri tanzim tarihinden bugüne kadar geçen
// gün sayısına göre kovalara (0-30, 31-60, 61-90, 90+) ayırır.
// dd.MM.yyyy formatını parse eder; geçersiz tarih = bilinmeyen kovaya gider.
function SigortaAging({ yil, ay, acente = "tum" }: { yil: number; ay: string; acente?: "tum" | "mapfre" | "ray" }) {
    const { mapfreVarMi } = useSigortaSirketler(yil);
    const { data: mapfre, isLoading: mapfreLoading } = useQuery({
        queryKey: ['sigorta-policeler-aging', COMPANIES.MAPFRE, yil, ay],
        enabled: acente !== 'ray' && mapfreVarMi,
        queryFn: async () => {
            let url = `/api/sigorta/policeler?sirket=${encodeURIComponent(COMPANIES.MAPFRE)}&yil=${yil}`;
            if (ay !== 'toplam') url += `&ay=${ay}`;
            const res = await apiRequest("GET", url);
            return res.json();
        },
    });
    const { data: ray, isLoading: rayLoading } = useQuery({
        queryKey: ['sigorta-policeler-aging', COMPANIES.RAY, yil, ay],
        enabled: acente !== 'mapfre',
        queryFn: async () => {
            let url = `/api/sigorta/policeler?sirket=${encodeURIComponent(COMPANIES.RAY)}&yil=${yil}`;
            if (ay !== 'toplam') url += `&ay=${ay}`;
            const res = await apiRequest("GET", url);
            return res.json();
        },
    });

    const isLoading = (acente !== 'ray' && mapfreVarMi && mapfreLoading) || (acente !== 'mapfre' && rayLoading);

    const parseDDMMYYYY = (s: string): Date | null => {
        if (!s) return null;
        const parts = s.split('.');
        if (parts.length !== 3) return null;
        const d = parseInt(parts[0]), m = parseInt(parts[1]), y = parseInt(parts[2]);
        if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
        return new Date(y, m - 1, d);
    };

    const daysSince = (s: string): number | null => {
        const dt = parseDDMMYYYY(s);
        if (!dt) return null;
        return Math.floor((Date.now() - dt.getTime()) / (1000 * 60 * 60 * 24));
    };

    // Acente filtresine göre tahsil edilmemiş poliçeler (dekont != EVET)
    const dekontsuz = useMemo(() => {
        const merged: any[] = [];
        if (acente !== 'ray') merged.push(...(mapfre || []));
        if (acente !== 'mapfre') merged.push(...(ray || []));
        return merged.filter((p: any) => p.dekontDurumu !== 'EVET');
    }, [mapfre, ray, acente]);

    // 0-30 / 31-60 / 61-90 / 90+ gün kovaları — değer = net prim toplamı
    const buckets = useMemo(() => {
        const defs = [
            { key: "0-30", label: "0–30 gün", color: "#10b981" },
            { key: "31-60", label: "31–60 gün", color: "#f59e0b" },
            { key: "61-90", label: "61–90 gün", color: "#fb7185" },
            { key: "90+", label: "90+ gün", color: "#dc2626" },
        ];
        const totals: Record<string, number> = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
        for (const p of dekontsuz) {
            const d = daysSince(p.tanzimTarihi);
            const net = parseFloat(p.netPrim || "0") || 0;
            if (d === null) continue;
            if (d <= 30) totals["0-30"] += net;
            else if (d <= 60) totals["31-60"] += net;
            else if (d <= 90) totals["61-90"] += net;
            else totals["90+"] += net;
        }
        const maxVal = Math.max(...defs.map(d => totals[d.key]), 0);
        return defs.map(d => ({
            ...d,
            value: totals[d.key],
            width: maxVal > 0 ? (totals[d.key] / maxVal) * 100 : 0,
        }));
    }, [dekontsuz]);

    const toplamAcik = useMemo(
        () => dekontsuz.reduce((acc: number, p: any) => acc + (parseFloat(p.netPrim || "0") || 0), 0),
        [dekontsuz]
    );

    // En eski önce (en büyük gün başta)
    const dekontsuzSirali = useMemo(
        () => dekontsuz
            .slice()
            .sort((a: any, b: any) => (daysSince(b.tanzimTarihi) ?? -1) - (daysSince(a.tanzimTarihi) ?? -1)),
        [dekontsuz]
    );

    const gunColor = (d: number | null) =>
        d === null ? "#475569" : d >= 90 ? "#dc2626" : d >= 60 ? "#b45309" : "#475569";

    return (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.6fr] gap-4 items-start">
            {/* SOL — Dekont Yaşlandırma */}
            <div className="rounded-[14px] border bg-card p-5">
                <h3 className="text-[15px] font-bold m-0">Dekont Yaşlandırma</h3>
                <p className="text-xs text-muted-foreground mt-1 mb-4">tahsil edilmemiş · net prim</p>
                <div className="flex flex-col gap-[13px]">
                    {buckets.map((b) => (
                        <div key={b.key}>
                            <div className="flex items-center justify-between mb-[5px]">
                                <span className="text-[12.5px] font-semibold" style={{ color: "#334155" }}>{b.label}</span>
                                <span className="text-[12.5px] font-bold text-foreground tabular-nums">{formatCurrency(b.value)}</span>
                            </div>
                            <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                                <span className="block h-full rounded-full" style={{ width: `${b.width}%`, background: b.color }} />
                            </div>
                        </div>
                    ))}
                </div>
                <div className="mt-4 pt-3.5 border-t flex items-center justify-between">
                    <span className="text-[12.5px] text-muted-foreground">Toplam açık</span>
                    <span className="text-base font-extrabold tabular-nums" style={{ color: "#dc2626" }}>{formatCurrency(toplamAcik)}</span>
                </div>
            </div>

            {/* SAĞ — Tahsil Edilmemiş Poliçeler (En Eski Önce) */}
            <div className="rounded-[14px] border bg-card overflow-hidden">
                <div className="px-5 py-4 border-b">
                    <h3 className="text-[15px] font-bold m-0">Tahsil Edilmemiş Poliçeler (En Eski Önce)</h3>
                </div>
                <div className="max-h-[520px] overflow-y-auto">
                    <table className="w-full border-collapse">
                        <thead className="sticky top-0 z-10">
                            <tr className="bg-muted/50">
                                <th className="text-left px-5 py-3 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Poliçe No</th>
                                <th className="text-left px-5 py-3 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Sigortalı</th>
                                <th className="text-right px-5 py-3 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Gün</th>
                                <th className="text-right px-5 py-3 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Net Prim</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading && (
                                <tr><td colSpan={4} className="text-center h-16 text-sm text-muted-foreground">Yükleniyor…</td></tr>
                            )}
                            {!isLoading && dekontsuzSirali.length === 0 && (
                                <tr><td colSpan={4} className="text-center h-16 text-sm text-muted-foreground">Tahsil edilmemiş poliçe yok 🎉</td></tr>
                            )}
                            {!isLoading && dekontsuzSirali.map((p: any) => {
                                const d = daysSince(p.tanzimTarihi);
                                return (
                                    <tr key={p.id} className="border-b last:border-b-0 hover:bg-slate-50 transition-colors">
                                        <td className="px-5 py-3 font-mono text-xs text-sky-600">{p.policeNo}</td>
                                        <td className="px-5 py-3 text-[13px] font-semibold text-slate-800 max-w-[260px] truncate" title={p.sigortali}>{p.sigortali}</td>
                                        <td className="px-5 py-3 text-right">
                                            <span className="text-[12.5px] font-bold tabular-nums" style={{ color: gunColor(d) }}>{d ?? "—"}</span>
                                        </td>
                                        <td className="px-5 py-3 text-right text-[13px] font-bold text-slate-900 tabular-nums">{formatCurrency(parseFloat(p.netPrim || "0"))}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}


import { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, FileSpreadsheet, RefreshCcw, Save, Trash2, X, ArrowUpDown, ArrowUp, ArrowDown, Check, ChevronsUpDown, Truck, Link2, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn, formatCurrencyFull } from "@/lib/utils";

// ============================================================================
// Müşteri eşleştirme — ÖN-DERLENMİŞ İNDEKS
// ----------------------------------------------------------------------------
// Bu mantık eskiden bileşen içinde, her satır için, her render'da çalışıyordu.
// Firma başına token ayrıştırma + RegExp derleme her çağrıda tekrarlandığı için
// ~500 firma × 279 fatura → tek render'da ~2 sn saf JS (ölçüldü).
// Artık RegExp'ler firma listesi başına BİR KEZ derleniyor; eşleştirme mantığı
// birebir aynı (aynı ağırlıklar, aynı eşikler, aynı özel kurallar).
// ============================================================================

const IGNORED_COMPANY_WORDS = new Set([
    "ltd", "şti", "sti", "a.ş", "a.s", "as", "san", "tic", "ve", "iç", "dış",
    "ic", "dis", "sanayi", "ticaret", "limitet", "anonim", "şirketi", "sirketi",
    "gıda", "tekstil", "lojistik", "otomotiv", "inş", "ins", "yapı", "yapi",
    "nakliyat", "nak", "tür", "tur", "petrol", "kimya", "plastik", "ambalaj",
    "ith", "ihr", "tas", "taş", "group", "grup",
    "bursa", "gemlik", "istanbul", "ankara", "izmir", "kocaeli", "yalova", "türkiye", "turkiye",
]);

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type CompiledToken = {
    weight: number;
    index: number;
    primary: RegExp;   // \bTOKEN\b
    clean: RegExp | null;  // tireler atılmış hâli: "DE-KA" -> "DEKA"
    spaced: RegExp | null; // tire yerine boşluk: "DE-KA" -> "DE\s+KA"
};

type CustomerEntry = {
    name: string;
    lower: string;
    compiled: CompiledToken[];
    totalWeight: number;
    tokenCount: number;
    isEnyteks: boolean;
    isIberyarns: boolean;
};

function buildCustomerIndex(customers: string[]): CustomerEntry[] {
    return customers.map((customer) => {
        const lower = customer.toLocaleLowerCase("tr");
        // Tire üzerinden BÖLME yok — "DE-KA" tek token kalmalı.
        const tokens = lower
            .split(/[\s\.,()\[\]]+/)
            .map((t) => t.trim())
            .filter((t) => t.length > 1)
            .filter((t) => !IGNORED_COMPANY_WORDS.has(t));

        let totalWeight = 0;
        const compiled = tokens.map((token, index) => {
            const weight = index === 0 ? 2.0 : index === 1 ? 1.5 : 1.0;
            totalWeight += weight;
            const cleanToken = token.replace(/-/g, "");
            return {
                weight,
                index,
                primary: new RegExp(`\\b${escapeRegExp(token)}\\b`, "i"),
                clean: cleanToken.length > 2 ? new RegExp(`\\b${escapeRegExp(cleanToken)}\\b`, "i") : null,
                spaced: token.includes("-")
                    ? new RegExp(`\\b${token.split("-").map(escapeRegExp).join("\\s+")}\\b`, "i")
                    : null,
            };
        });

        return {
            name: customer,
            lower,
            compiled,
            totalWeight,
            tokenCount: tokens.length,
            isEnyteks: lower.includes("enyteks"),
            isIberyarns: lower.includes("iberyarns"),
        };
    });
}

// Özel manuel kurallar (metin tarafı sabit olduğu için modül seviyesinde derlendi)
const RE_ENY = /\beny\b/i;
const RE_IBER_YARNS = /\biber\s*yarns\b/i;
const RE_IBER = /\biber\b/i;

function matchCustomer(index: CustomerEntry[], text: string | null | undefined): string {
    if (!text || index.length === 0) return "-";
    const textLower = text.toLocaleLowerCase("tr");

    let bestName = "-";
    let bestScore = 0;

    for (const c of index) {
        // 1. Tam alt-dize eşleşmesi (en yüksek öncelik, kısa adlarda gürültü olmasın diye >4)
        if (c.lower.length > 4 && textLower.includes(c.lower)) {
            const score = 1000 + c.lower.length;
            if (score > bestScore) { bestScore = score; bestName = c.name; }
            continue;
        }
        if (c.tokenCount === 0) continue;

        // 2. Kelime sınırlı token eşleşmesi (ilk token'lar daha ağır)
        let hitCount = 0;
        let firstTokenMatched = false;
        let matchedWeight = 0;

        for (const t of c.compiled) {
            let matched = t.primary.test(textLower);
            if (!matched) {
                if (t.clean && t.clean.test(textLower)) matched = true;
                else if (t.spaced && t.spaced.test(textLower)) matched = true;
            }
            if (matched) {
                hitCount++;
                matchedWeight += t.weight;
                if (t.index === 0) firstTokenMatched = true;
            }
        }

        // 3. Özel manuel kurallar
        if (hitCount === 0) {
            if (c.isEnyteks && RE_ENY.test(textLower)) {
                hitCount = 10; matchedWeight = 10; firstTokenMatched = true;
            }
            if (c.isIberyarns && (RE_IBER_YARNS.test(textLower) || RE_IBER.test(textLower))) {
                hitCount = 10; matchedWeight = 10; firstTokenMatched = true;
            }
        }

        const ratio = matchedWeight / c.totalWeight;
        let isValid = false;
        if (c.tokenCount === 1) {
            if (ratio === 1) isValid = true;   // tek kelimelik firma: tam eşleşme şart
        } else if (firstTokenMatched && matchedWeight >= 2.0) {
            isValid = true;                     // marka (ilk kelime) tuttu
        } else if (ratio >= 0.5) {
            isValid = true;                     // genel iyi eşleşme
        }

        if (isValid) {
            const score = matchedWeight * 100 + hitCount * 10;
            if (score > bestScore) { bestScore = score; bestName = c.name; }
        }
    }

    return bestName;
}

// Konteyner no kalıbı: 4 harf + 6-7 rakam (örn. GAOU6046289)
const RE_CONTAINER = /\b[A-Z]{4}\s*\d{6,7}\b/g;

function extractContainerRefs(text: string | null | undefined): string[] {
    if (!text) return [];
    const matches = text.match(RE_CONTAINER);
    if (!matches || matches.length === 0) return [];
    return Array.from(new Set(matches));
}

/**
 * Bir faturanın Paraşüt yolculuğunu iki rozetle gösterir:
 *
 *   ALIŞ  — gelen fatura muhasebeye (Paraşüt alış faturası) işlendi mi?
 *   SATIŞ — bu faturaya karşılık müşteriye fatura oluşturuldu mu?
 *
 * Amaç: beyanname beklerken hangi faturanın nerede takıldığını gözden
 * kaçırmamak. Durumlar sunucuda hesaplanıyor (bkz. GET /api/nakliye).
 */
function DurumRozetleri({
    inv,
    onFaturaKes,
    kesiliyor,
}: {
    inv: any;
    onFaturaKes?: (dosyaNo: string, e: React.MouseEvent) => void;
    kesiliyor?: boolean;
}) {
    const alis = inv.parasutAlisDurum as string | undefined;
    const satis = inv.parasutSatisDurum as string | undefined;
    // Temmuz 2026 öncesi: alış da satış da elle yapıldı, iş bitmiş sayılır.
    const elleDonem = alis === "elle";
    const alisIslendi = alis === "islendi";
    // Eşleşme kurulmuş ama müşteri faturası yoksa elle kesme düğmesi gösterilir.
    const kesilebilir = !elleDonem && Boolean(inv.ilgiliDosyaNo)
        && (satis === "bekliyor" || satis === "hata" || satis === "silinmis");

    const rozet = (
        etiket: string,
        tamam: boolean,
        renk: "yesil" | "gri" | "kirmizi" | "sari" | "mavi",
        baslik: string,
    ) => {
        const renkler = {
            yesil: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/50",
            // Taslak kendine ait bir renk: "bekliyor"un sarısıyla karışırsa
            // Paraşüt'te duran fatura ile hiç kesilmemiş fatura ayırt edilemez.
            mavi: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-900/50",
            sari: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/50",
            kirmizi: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900/50",
            gri: "bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-900/40 dark:text-slate-400 dark:border-slate-700",
        };
        return (
            <span
                title={baslik}
                className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${renkler[renk]}`}
            >
                {tamam ? <Check className="h-2.5 w-2.5" /> : <span className="text-[9px]">○</span>}
                {etiket}
            </span>
        );
    };

    // Sistem devreye girmeden önceki dönem: her iki taraf da tamamlanmış.
    if (elleDonem) {
        return (
            <div className="flex flex-col gap-1">
                {rozet("Alış", true, "yesil", "Temmuz 2026 öncesi — muhasebeye elle işlendi")}
                {rozet("Satış", true, "yesil", "Temmuz 2026 öncesi — müşteri faturası elle kesildi")}
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-1">
            {rozet(
                "Alış",
                alisIslendi,
                alisIslendi ? "yesil" : "sari",
                alisIslendi
                    ? `Paraşüt'e işlendi (alış faturası ${inv.parasutPurchaseBillId})`
                    : inv.belgeTipi === "efatura"
                        // e-Fatura Paraşüt'ün gelen kutusuna düşer; sistem YAZMAZ,
                        // yazarsa "İçeri Al" sonrası mükerrer kayıt olur.
                        ? "e-Fatura — Paraşüt'te \"İçeri Al\" ile aktarmanız gerekiyor (sistem yazmaz)"
                        : "Paraşüt'e henüz işlenmedi",
            )}
            {/* YEŞİL = İŞ BİTTİ: fatura resmileşti, numarasını aldı, müşteriye gitti.
                MAVİ = Paraşüt'te taslak duruyor; resmileştirme kullanıcıda.
                Durumlar "Paraşüt'ü Kontrol Et" turunda Paraşüt'ten doğrulanır. */}
            {satis === "resmilesti"
                ? rozet("Satış", true, "yesil",
                    `Fatura kesildi ve müşteriye gönderildi — No: ${inv.parasutFaturaNo || "?"}`)
                : satis === "taslak"
                    ? rozet("Taslak", false, "mavi",
                        `Paraşüt'te TASLAK olarak duruyor (kayıt ${inv.parasutSalesInvoiceId}) — henüz resmileştirilmedi, fatura numarası yok`)
                    : satis === "hata"
                        ? rozet("Satış", false, "kirmizi", `Hata: ${inv.parasutSatisHata || "bilinmiyor"}`)
                        : satis === "silinmis"
                            ? rozet("Satış", false, "kirmizi", `Kesilmişti ama Paraşüt'te bulunamadı (kayıt ${inv.parasutSalesInvoiceId}) — taslak silinmiş. Yeniden kesilebilir.`)
                            : satis === "eslesme_yok"
                                ? rozet("Satış", false, "gri", "Beyanname eşleşmesi bekleniyor")
                                : rozet("Satış", false, "sari", "Beyanname eşleşti, müşteri faturası bekliyor")}

            {kesilebilir && onFaturaKes && (
                <button
                    type="button"
                    onClick={(e) => onFaturaKes(inv.ilgiliDosyaNo, e)}
                    disabled={kesiliyor}
                    title={`${inv.ilgiliDosyaNo} için Paraşüt'te satış faturası taslağı oluştur`}
                    className="inline-flex items-center gap-1 whitespace-nowrap rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-50 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-900/40"
                >
                    {kesiliyor
                        ? <><Loader2 className="h-2.5 w-2.5 animate-spin" /> Kesiliyor</>
                        : <><FileText className="h-2.5 w-2.5" /> Fatura Kes</>}
                </button>
            )}
        </div>
    );
}

export default function Nakliye() {
    const [uploading, setUploading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [extractedData, setExtractedData] = useState<any[]>([]);
    const [savedInvoices, setSavedInvoices] = useState<any[]>([]);
    const [saving, setSaving] = useState(false);
    const [matching, setMatching] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    const [customers, setCustomers] = useState<string[]>([]);

    // Polling'in gereksiz yeniden render tetiklemesini engellemek için son veri imzası
    const lastInvoiceSignature = useRef<string>("");

    // Date Filter State
    const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: "", end: "" });

    // Modal Edit States
    const [editMusteri, setEditMusteri] = useState("");
    const [editKonteynerler, setEditKonteynerler] = useState("");
    // Elle dosya no eşleştirmesi (konteyner numarası olmayan faturalar için)
    const [editDosyaNo, setEditDosyaNo] = useState("");
    // Paraşüt'e girilmeyen, tamamen elle hallolan işler
    const [editElleIslendi, setEditElleIslendi] = useState(false);
    const [openCombobox, setOpenCombobox] = useState(false);
    const [updating, setUpdating] = useState(false);
    // Fatura kesme işlemi süren dosya no ("__TUMU__" = toplu işlem)
    const [kesilenDosya, setKesilenDosya] = useState<string | null>(null);
    const [parasutKontrol, setParasutKontrol] = useState(false);
    const [mailKontrol, setMailKontrol] = useState(false);

    const { toast } = useToast();

    // Helper to format currency
    const formatCurrency = (val: number | string | null | undefined) => {
        if (val === null || val === undefined) return "-";
        const num = typeof val === "string" ? parseFloat(val) : val;
        if (isNaN(num)) return "-";
        return new Intl.NumberFormat("tr-TR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(num);
    };

    // Helper to format date
    const formatDate = (dateStr: string | null | undefined) => {
        if (!dateStr) return "-";
        try {
            // Check if standard YYYY-MM-DD format
            if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                const [year, month, day] = dateStr.split('-');
                return `${day}.${month}.${year}`;
            }
            return new Date(dateStr).toLocaleDateString("tr-TR");
        } catch (e) {
            return dateStr;
        }
    };

    // Firma listesi başına BİR KEZ derlenen eşleştirme indeksi
    const customerIndex = useMemo(() => buildCustomerIndex(customers), [customers]);

    // Fetch saved invoices and customers on mount and setup polling
    useEffect(() => {
        fetchSavedInvoices();
        fetchCustomers();

        // Listen for new invoices (automated Gmail processing) via polling
        const interval = setInterval(() => {
            fetchSavedInvoices();
        }, 10000); // Every 10 seconds

        return () => clearInterval(interval);
    }, []);

    const fetchSavedInvoices = async () => {
        try {
            const response = await fetch("/api/nakliye");
            if (response.ok) {
                const data = await response.json();
                // 10 sn'de bir çalışan polling: veri gerçekten değişmediyse state'i
                // güncelleme. Aksi halde her turda yeni referans üretilip tüm
                // türetilmiş hesaplar (müşteri eşleştirme dahil) boşuna tekrarlanır.
                const signature = JSON.stringify(data);
                if (signature !== lastInvoiceSignature.current) {
                    lastInvoiceSignature.current = signature;
                    setSavedInvoices(data);
                }
            }
        } catch (error) {
            console.error("Fetch saved invoices error:", error);
        }
    };

    const fetchCustomers = async () => {
        try {
            const response = await fetch("/api/gumruk/tum-firmalar");
            if (response.ok) {
                const data = await response.json();
                setCustomers(data);
            }
        } catch (error) {
            console.error("Fetch customers error:", error);
        }
    };

    // State management for Modal Fields
    // Tek fatura için hesap; indeks ön-derlenmiş olduğundan maliyeti ihmal edilebilir.
    // customerIndex bağımlılığı, firma listesi modal açıkken yüklenirse alanın
    // yine dolmasını sağlar (eski `customers` bağımlılığının işlevi).
    useEffect(() => {
        if (selectedInvoice) {
            // Customer: Use stored value if available, else extract
            const initialMusteri = selectedInvoice.musteri || matchCustomer(customerIndex, selectedInvoice.malHizmet);
            setEditMusteri(initialMusteri === "-" ? "" : initialMusteri);

            // Container: Use stored value if available, else extract all found
            const initialKont = selectedInvoice.konteynerler;
            if (initialKont) {
                setEditKonteynerler(initialKont);
            } else {
                setEditKonteynerler(extractContainerRefs(selectedInvoice.malHizmet).join(", "));
            }

            setEditDosyaNo(selectedInvoice.ilgiliDosyaNo || "");
            setEditElleIslendi(selectedInvoice.elleIslendi === true);
        }
    }, [selectedInvoice, customerIndex]);

    const handleUpdate = async () => {
        if (!selectedInvoice) return;

        // Dosya no alanı yalnızca DEĞİŞTİYSE gönderilir. Her kaydetmede
        // göndermek, dokunulmamış bir eşleşmeyi gereksizce yeniden çözerdi.
        const dosyaNoDegisti = editDosyaNo.trim() !== String(selectedInvoice.ilgiliDosyaNo || "").trim();

        setUpdating(true);
        try {
            const response = await fetch(`/api/nakliye/${selectedInvoice.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    musteri: editMusteri,
                    konteynerler: editKonteynerler,
                    elleIslendi: editElleIslendi,
                    ...(dosyaNoDegisti ? { ilgiliDosyaNo: editDosyaNo.trim() } : {}),
                })
            });

            if (!response.ok) throw new Error("Güncelleme başarısız");

            const sonuc = await response.json();
            // Sunucu eşleştirmeyi çözüp mor kutunun tüm alanlarını doldurduğu için
            // yerel state sunucunun döndürdüğü kayıttan tazelenir; elle kurgulanan
            // bir nesne beyanname alanlarını eksik bırakırdı.
            const guncel = sonuc?.data ?? { ...selectedInvoice, musteri: editMusteri, konteynerler: editKonteynerler };

            setSavedInvoices(prev => prev.map(inv =>
                inv.id === selectedInvoice.id ? { ...inv, ...guncel } : inv
            ));
            setSelectedInvoice((prev: any) => ({ ...prev, ...guncel }));

            // Rozet durumları (parasutAlisDurum/parasutSatisDurum) SUNUCUDA
            // hesaplanıyor; PUT cevabında yoklar. Elle işlendi işaretlendiğinde
            // rozetlerin anında yeşile dönmesi için listeyi tazele.
            fetchSavedInvoices();

            const eslesme = sonuc?.eslesme;
            if (eslesme && !eslesme.ok) {
                // Eşleştirme çözülemedi (dosya bulunamadı ya da çok firma adayı var).
                // Diğer alanlar kaydedildi; kullanıcıya ne yapması gerektiği söylenir.
                toast({
                    variant: "destructive",
                    title: "Eşleştirme yapılamadı",
                    description: eslesme.mesaj + (eslesme.adaylar?.length ? ` (${eslesme.adaylar.join(" · ")})` : ""),
                });
            } else if (eslesme?.uyari) {
                // Eşleştirme YAPILDI ama dikkat gerektiren bir durum var:
                // seçilen müşteri ile dosyadaki firma uyuşmuyor. İş yapılmış
                // olduğu için engellemiyoruz; kullanıcı görsün diye uyarıyoruz.
                toast({
                    variant: "destructive",
                    title: "Eşleştirildi — kontrol edin",
                    description: `${eslesme.mesaj} · ${eslesme.uyari}`,
                });
            } else {
                toast({
                    title: "Güncellendi",
                    description: eslesme?.mesaj || "Fatura bilgileri güncellendi.",
                });
            }
        } catch (error) {
            console.error("Update error:", error);
            toast({ variant: "destructive", title: "Hata", description: "Güncelleme yapılamadı." });
        } finally {
            setUpdating(false);
        }
    };

    // PDF fatura yükleme ucu. Analiz (Claude), doğrulama ve kayıt tek adımda
    // sunucuda yapılır — eskiden n8n'e giden iki adımlı akışın yerini aldı.
    const UPLOAD_URL = "/api/nakliye/fatura-yukle";

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        setUploading(true);
        setSuccess(false);
        setExtractedData([]);

        // Uç tek dosya alıyor (analiz PDF başına yapılıyor), bu yüzden sırayla
        // gönderilir. Sıralı olması kasıtlı: her PDF bir LLM çağrısı demek.
        const basarili: string[] = [];
        const dogrulamaHatasi: string[] = [];
        const mevcut: string[] = [];
        const hatali: string[] = [];

        for (let i = 0; i < files.length; i++) {
            const dosya = files[i];
            try {
                const fd = new FormData();
                fd.append("file", dosya);
                const r = await fetch(UPLOAD_URL, { method: "POST", body: fd });
                const j = await r.json().catch(() => ({}));

                if (!r.ok) {
                    hatali.push(`${dosya.name}: ${j.error || r.status}`);
                } else if (j.already_exists) {
                    mevcut.push(j.faturaNo || dosya.name);
                } else if (j.durum === "dogrulama_hatasi") {
                    dogrulamaHatasi.push(`${j.faturaNo || dosya.name}: ${(j.hatalar || []).join(" | ")}`);
                } else {
                    basarili.push(j.faturaNo || dosya.name);
                }
            } catch (error) {
                hatali.push(`${dosya.name}: ${error instanceof Error ? error.message : "bilinmeyen hata"}`);
            }
        }

        const parcalar: string[] = [];
        if (basarili.length) parcalar.push(`${basarili.length} yeni fatura işlendi`);
        if (mevcut.length) parcalar.push(`${mevcut.length} zaten kayıtlı`);
        if (dogrulamaHatasi.length) parcalar.push(`${dogrulamaHatasi.length} doğrulama hatası`);
        if (hatali.length) parcalar.push(`${hatali.length} başarısız`);

        toast({
            title: hatali.length || dogrulamaHatasi.length ? "İşlem tamamlandı (uyarılı)" : "İşlem tamamlandı",
            description: parcalar.join(" · ") || "Değişiklik yok",
            variant: hatali.length ? "destructive" : "default",
        });

        if (dogrulamaHatasi.length) console.warn("Doğrulama hataları:", dogrulamaHatasi);
        if (hatali.length) console.error("Başarısız yüklemeler:", hatali);

        // Kayıtlar sunucuda oluştu; listeyi tazele. Ayrı "Sisteme Kaydet"
        // adımına gerek yok.
        await fetchSavedInvoices();
        setUploading(false);
        if (event.target) event.target.value = "";
    };

    const handleSaveToSystem = async () => {
        if (extractedData.length === 0) return;

        setSaving(true);
        try {
            const response = await fetch("/api/nakliye/kaydet", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(extractedData),
            });

            if (response.ok) {
                toast({
                    title: "Başarılı",
                    description: "Tüm veriler veritabanına kaydedildi.",
                });
                setSuccess(false);
                setExtractedData([]);
                fetchSavedInvoices(); // Refresh the list
            } else {
                throw new Error("Kaydetme işlemi başarısız");
            }
        } catch (error) {
            console.error("Save error:", error);
            toast({
                variant: "destructive",
                title: "Hata",
                description: "Veriler kaydedilirken bir sorun oluştu.",
            });
        } finally {
            setSaving(false);
        }
    };

    const handleMatchWithGumruk = async () => {
        if (savedInvoices.length === 0) {
            toast({ variant: "destructive", title: "Hata", description: "Eşleştirilecek kayıt bulunamadı." });
            return;
        }

        setMatching(true);
        try {
            const response = await fetch("/api/nakliye/eslestir", {
                method: "POST",
            });

            if (response.ok) {
                const result = await response.json();
                toast({
                    title: "Eşleştirme Tamamlandı",
                    description: `${result.totalScanned} kayıttan ${result.matchCount} tanesi Gümrük verileriyle eşleşti.`,
                });
                fetchSavedInvoices(); // Refresh to see new data
            } else {
                throw new Error("Eşleştirme başarısız");
            }
        } catch (error) {
            console.error("Matching error:", error);
            toast({
                variant: "destructive",
                title: "Hata",
                description: "Eşleştirme işlemi sırasında hata oluştu.",
            });
        } finally {
            setMatching(false);
        }
    };

    /**
     * Bekleyen satış faturasını ELLE kes.
     *
     * Boru hattı günde bir kez (06:45) çalışıyor. Kullanıcı gün içinde bir
     * konteyner numarasını düzeltip eşleşmeyi kurduğunda faturanın ertesi
     * sabaha kalmaması için bu düğme var.
     *
     * Engel "aşılabilir" ise (beyannamenin konteynerlerinin bir kısmı henüz
     * eşleşmemiş) onay istenip `zorla` ile tekrar denenir. Mükerrer fatura ve
     * müşterisiz fatura engelleri sunucuda aşılamaz — burada onay sorulmaz.
     */
    const handleFaturaKes = async (dosyaNo: string, e: React.MouseEvent, zorla = false) => {
        e.stopPropagation();
        if (!dosyaNo) return;

        setKesilenDosya(dosyaNo);
        try {
            const response = await fetch("/api/nakliye/satis-faturasi-kes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ dosyaNo, zorla }),
            });
            const sonuc = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(sonuc?.error || "Fatura kesilemedi");
            }

            if (sonuc.olusturulan > 0) {
                toast({
                    title: "Fatura oluşturuldu",
                    description: `${dosyaNo} için Paraşüt'te satış faturası taslağı hazır. Resmileştirme sizde.`,
                });
                fetchSavedInvoices();
                return;
            }

            const engel = sonuc.engel || sonuc.hatalar?.[0] || "Bilinmeyen engel";

            if (sonuc.zorlanabilir && !zorla) {
                if (confirm(`${dosyaNo}\n\n${engel}\n\nYine de fatura kesilsin mi?`)) {
                    await handleFaturaKes(dosyaNo, e, true);
                }
                return;
            }

            toast({ variant: "destructive", title: "Fatura kesilemedi", description: engel });
        } catch (error) {
            console.error("Fatura kesme hatası:", error);
            toast({
                variant: "destructive",
                title: "Hata",
                description: error instanceof Error ? error.message : "Fatura kesilemedi.",
            });
        } finally {
            setKesilenDosya(null);
        }
    };

    /** Hazır olan TÜM dosyalar için taslak oluştur (üst çubuk düğmesi). */
    const handleTumunuFaturala = async () => {
        setKesilenDosya("__TUMU__");
        try {
            const response = await fetch("/api/nakliye/satis-faturasi-kes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });
            const sonuc = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(sonuc?.error || "İşlem başarısız");

            toast({
                title: "Faturalama tamamlandı",
                description:
                    `${sonuc.olusturulan} taslak oluşturuldu, ${sonuc.kuyruk} dosya bekliyor.` +
                    (sonuc.hatalar?.length ? ` ${sonuc.hatalar.length} hata.` : ""),
            });
            fetchSavedInvoices();
        } catch (error) {
            console.error("Toplu faturalama hatası:", error);
            toast({
                variant: "destructive",
                title: "Hata",
                description: error instanceof Error ? error.message : "İşlem başarısız.",
            });
        } finally {
            setKesilenDosya(null);
        }
    };

    /**
     * Gmail'deki yeni fatura maillerini elle çeker.
     *
     * Poller sunucuda ayrı bir Python scripti ve günde bir kez (06:00)
     * çalışıyor. Fatura maili gün içinde geldiğinde ertesi sabahı beklemek
     * gerekiyordu; bu düğme aynı turu şimdi çalıştırır. Gelen PDF'ler
     * ayrıştırılıp listeye düşer, ardından eşleştirme kendiliğinden tetiklenir.
     */
    const handleMailKontrol = async () => {
        setMailKontrol(true);
        try {
            const response = await fetch("/api/nakliye/mail-kontrol", { method: "POST" });
            const sonuc = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(sonuc?.error || "Mail kontrolü başarısız");

            const sorunlu = (sonuc.dogrulamaHatasi || 0) + (sonuc.hatali || 0);
            const parcalar: string[] = [];
            if (sonuc.yeni) {
                parcalar.push(`${sonuc.yeni} yeni fatura eklendi`);
                if (sonuc.yeniFaturalar?.length) parcalar.push(sonuc.yeniFaturalar.join(", "));
            } else {
                parcalar.push(`${sonuc.mail || 0} mail tarandı, yeni fatura yok`);
            }
            if (sorunlu) parcalar.push(`${sorunlu} fatura işlenemedi`);

            toast({
                title: "Mail kontrolü tamamlandı",
                variant: sorunlu ? "destructive" : undefined,
                description: parcalar.join(" · "),
            });
            fetchSavedInvoices();
        } catch (error) {
            console.error("Mail kontrol hatası:", error);
            toast({
                variant: "destructive",
                title: "Hata",
                description: error instanceof Error ? error.message : "Mail kontrolü başarısız.",
            });
        } finally {
            setMailKontrol(false);
        }
    };

    /**
     * Paraşüt boru hattını elle tetikler (çek → alış hizala → eşleştir).
     *
     * Neden gerekli: e-Fatura'ları sistem Paraşüt'e YAZMAZ; kullanıcı "İçeri Al"
     * ile alır, sistem sonra Paraşüt'te arayıp kaydı bağlar ve ALIŞ rozeti
     * yeşile döner. O arama boru hattında, yani günde bir kez (06:45) çalışıyordu.
     * Kullanıcı gün içinde içeri aldığında rozet ertesi sabaha kadar sarı
     * kalıyor ve "aktarmadım" gibi görünüyordu — oysa yalnızca "henüz bakmadım"
     * demekti (canlıda görüldü: GAF2026000001966 / GAF2026000002031).
     *
     * SATIŞ FATURASI KESMEZ — o iş "Bekleyenleri Faturala" düğmesinde.
     */
    const handleParasutKontrol = async () => {
        setParasutKontrol(true);
        try {
            const response = await fetch("/api/nakliye/senkron", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });
            const sonuc = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(sonuc?.error || "Kontrol başarısız");

            const y = sonuc.parasutaYazilan || {};
            const d = sonuc.satisDogrulama || {};
            const baglanan = (y.mevcuttu || 0) + (y.basarili || 0);

            // İki taraf ayrı ayrı bildirilir: ALIŞ bağlama (gelen fatura) ve
            // SATIŞ doğrulama (kestiğimiz fatura Paraşüt'te duruyor mu).
            const parcalar: string[] = [];
            if (baglanan) parcalar.push(`${baglanan} gelen fatura Paraşüt kaydına bağlandı`);
            if (y.elleBekleyen) parcalar.push(`${y.elleBekleyen} fatura Paraşüt'te bulunamadı — "İçeri Al" yapılmış mı?`);
            if (d.resmilesen) parcalar.push(`${d.resmilesen} satış faturası resmileşmiş — artık yeşil`);
            if (d.silinmis) parcalar.push(`${d.silinmis} satış faturası Paraşüt'te silinmiş — yeniden kesilebilir`);
            if (!parcalar.length) {
                parcalar.push(d.kontrol
                    ? `Her şey güncel — ${d.kontrol} satış faturası Paraşüt'te doğrulandı.`
                    : "Bekleyen fatura yok, hepsi güncel.");
            }

            toast({
                title: "Paraşüt kontrolü tamamlandı",
                variant: d.silinmis ? "destructive" : undefined,
                description: parcalar.join(". ") + ".",
            });
            fetchSavedInvoices();
        } catch (error) {
            console.error("Paraşüt kontrol hatası:", error);
            toast({
                variant: "destructive",
                title: "Hata",
                description: error instanceof Error ? error.message : "Kontrol başarısız.",
            });
        } finally {
            setParasutKontrol(false);
        }
    };

    const handleDeleteInvoice = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm("Bu faturayı silmek istediğinize emin misiniz?")) return;

        try {
            const response = await fetch(`/api/nakliye/${id}`, {
                method: "DELETE",
            });

            if (response.ok) {
                toast({
                    title: "Silindi",
                    description: "Fatura başarıyla silindi.",
                });
                fetchSavedInvoices();
                if (selectedInvoice?.id === id) setSelectedInvoice(null);
            } else {
                throw new Error("Silme başarısız");
            }
        } catch (error) {
            console.error("Delete error:", error);
            toast({
                variant: "destructive",
                title: "Hata",
                description: "Silme işlemi sırasında hata oluştu.",
            });
        }
    };

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    // ===== Satır zenginleştirme: pahalı türetmeler burada BİR KEZ yapılır =====
    // Müşteri eşleştirme ve konteyner çıkarımı yalnızca veri (savedInvoices) veya
    // firma listesi değiştiğinde çalışır. Modal açma / sıralama / filtreleme gibi
    // sıradan render'lar bu sonuçları önbellekten okur.
    const enrichedInvoices = useMemo(() => {
        return savedInvoices.map((inv) => {
            const konteynerListe = extractContainerRefs(inv.malHizmet);
            return {
                ...inv,
                // Öncelik sırası: beyannamedeki RESMÎ unvan → kayıtlı müşteri →
                // açıklamadan tahmin. Eşleşme kurulduysa beyanname tek doğru
                // kaynaktır; PDF'ten çıkarılan kısa ad ("BTS bant") sadece
                // eşleştirme sinyaliydi.
                _musteri: inv.gumrukFirmaUnvan || inv.musteri || matchCustomer(customerIndex, inv.malHizmet),
                _konteynerListe: konteynerListe,
                _konteynerIlk: konteynerListe[0] || "-",
            };
        });
    }, [savedInvoices, customerIndex]);

    const filteredInvoices = useMemo(() => {
        return enrichedInvoices.filter(invoice => {
            if (!dateRange.start && !dateRange.end) return true;

            const invoiceDate = new Date(invoice.faturaTarihi);
            const start = dateRange.start ? new Date(dateRange.start) : null;
            const end = dateRange.end ? new Date(dateRange.end) : null;

            if (start && invoiceDate < start) return false;
            if (end && invoiceDate > end) return false;

            return true;
        });
    }, [enrichedInvoices, dateRange.start, dateRange.end]);

    // Tarihi sıralanabilir bir sayıya çevirir. Kayıtlar iki formatta olabilir:
    // "YYYY-MM-DD" (PDF analizinden) ve "DD.MM.YYYY" (eski n8n kayıtları).
    // new Date() KULLANILMAZ — timezone kayması hatası (commit c897dff).
    const tarihAnahtari = (t: any): number => {
        const s = String(t ?? "").trim();
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) return Number(s.slice(0, 10).replace(/-/g, ""));
        if (/^\d{2}[.\-/]\d{2}[.\-/]\d{4}/.test(s)) {
            const [g, a, y] = s.slice(0, 10).split(/[.\-/]/);
            return Number(`${y}${a}${g}`);
        }
        return 0; // tarihsiz kayıtlar en sona
    };

    const sortedInvoices = useMemo(() => {
        // Varsayılan: en yeni fatura en üstte
        const aktif = sortConfig ?? { key: "faturaTarihi", direction: "desc" as const };

        return [...filteredInvoices].sort((a, b) => {
            if (aktif.key === "faturaTarihi") {
                const fark = tarihAnahtari(a.faturaTarihi) - tarihAnahtari(b.faturaTarihi);
                return aktif.direction === "asc" ? fark : -fark;
            }

            const aValue = a[aktif.key];
            const bValue = b[aktif.key];

            if (aValue === null || aValue === undefined) return 1;
            if (bValue === null || bValue === undefined) return -1;

            if (typeof aValue === 'string' && typeof bValue === 'string') {
                return aktif.direction === 'asc'
                    ? aValue.localeCompare(bValue, 'tr')
                    : bValue.localeCompare(aValue, 'tr');
            }

            return aktif.direction === 'asc'
                ? (aValue > bValue ? 1 : -1)
                : (aValue < bValue ? 1 : -1);
        });
    }, [filteredInvoices, sortConfig]);

    const resetView = () => {
        setSuccess(false);
        setExtractedData([]);
        setUploading(false);
    };

    // Bir faturanın konteyner adedi: kayıtlı konteynerler alanı varsa ondan, yoksa
    // zenginleştirmede çıkarılmış benzersiz konteyner listesinden.
    const containerCount = (inv: any): number => {
        if (inv.konteynerler) {
            return String(inv.konteynerler).split(",").map((s: string) => s.trim()).filter(Boolean).length;
        }
        return (inv._konteynerListe || []).length;
    };

    // ===== Türetilmiş KPI'lar + müşteri ciro payı (filtreli kayıtlardan) =====
    const yil = new Date().getFullYear();
    const num = (v: any) => {
        const n = typeof v === "string" ? parseFloat(v) : v;
        return Number.isFinite(n) ? n : 0;
    };

    const kpis = useMemo(() => {
        const adet = filteredInvoices.length;
        const navlun = filteredInvoices.reduce((a, inv) => a + num(inv.malHizmetToplamTutarı), 0);
        const kdv = filteredInvoices.reduce((a, inv) => a + num(inv.kdvTutarı), 0);
        const konteyner = filteredInvoices.reduce((a, inv) => a + containerCount(inv), 0);
        const ort = adet > 0 ? navlun / adet : 0;
        return [
            { label: "Toplam Fatura", value: String(adet), sub: `${yil} kümülatif`, color: "#0ea5e9" },
            { label: "Toplam Navlun", value: formatCurrencyFull(navlun), sub: "mal hizmet toplamı", color: "#0f766e" },
            { label: "KDV", value: formatCurrencyFull(kdv), sub: "hesaplanan", color: "#7c3aed" },
            { label: "Konteyner", value: String(konteyner), sub: "taşınan toplam", color: "#d97706" },
            { label: "Ort. Fatura", value: formatCurrencyFull(ort), sub: "fatura başına", color: "#10b981" },
        ];
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filteredInvoices]);

    const topMusteri = useMemo(() => {
        const map = new Map<string, number>();
        filteredInvoices.forEach((inv) => {
            const name = inv._musteri;
            if (!name || name === "-") return;
            map.set(name, (map.get(name) || 0) + num(inv.odenecekTutar));
        });
        const arr = Array.from(map.entries()).map(([name, value]) => ({ name, value }));
        arr.sort((a, b) => b.value - a.value);
        const top = arr.slice(0, 5);
        const max = Math.max(...top.map((t) => t.value), 1);
        return top.map((t) => ({ ...t, w: Math.round((t.value / max) * 100) }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filteredInvoices]);

    // Sıralanabilir tablo başlığı yardımcı bileşeni
    const SortIcon = ({ column }: { column: string }) => {
        if (sortConfig?.key !== column) return <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />;
        return sortConfig.direction === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />;
    };

    return (
        <div className="min-h-full bg-slate-50 dark:bg-background">
            <div className="px-6 pb-12 lg:px-8">
                {/* ===== STICKY HEADER ===== */}
                <div className="sticky top-0 z-20 border-b border-border/70 bg-slate-50/90 pt-5 backdrop-blur dark:bg-background/90">
                    <div className="flex flex-wrap items-end justify-between gap-4 pb-3.5">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400">
                                <Truck className="h-[22px] w-[22px]" strokeWidth={1.9} />
                            </div>
                            <div>
                                <h1 className="text-[21px] font-extrabold tracking-tight">Nakliye</h1>
                                <p className="mt-0.5 text-[12.5px] text-muted-foreground">Navlun faturaları ve konteyner takibi · <strong className="text-foreground/80">{yil}</strong></p>
                            </div>
                        </div>
                        {/* Düğmeler iş akışı sırasına dizilidir:
                            mail gelir → beyannameyle eşleşir → Paraşüt doğrulanır → fatura kesilir */}
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                variant="outline"
                                className="h-[38px] gap-2 font-semibold"
                                onClick={handleMailKontrol}
                                disabled={mailKontrol || matching || uploading || parasutKontrol || kesilenDosya !== null}
                                title="Gmail'deki yeni fatura maillerini şimdi çeker (otomatik tur her sabah 06:00'da çalışır)"
                            >
                                {mailKontrol ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                                {mailKontrol ? "Kontrol ediliyor..." : "Mailleri Kontrol Et"}
                            </Button>

                            <Button
                                variant="outline"
                                className="h-[38px] gap-2 font-semibold"
                                onClick={handleMatchWithGumruk}
                                disabled={matching || uploading || parasutKontrol || mailKontrol}
                            >
                                {matching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                                {matching ? "Eşleşiyor..." : "Gümrük ile Eşleştir"}
                            </Button>

                            {/* e-Fatura'yı Paraşüt'te "İçeri Al" ile aldıktan sonra ALIŞ rozetini
                                tazeler. Boru hattı bunu günde bir kez yapıyor; bu düğme öne alır. */}
                            <Button
                                variant="outline"
                                className="h-[38px] gap-2 font-semibold"
                                onClick={handleParasutKontrol}
                                disabled={parasutKontrol || matching || uploading || kesilenDosya !== null || mailKontrol}
                                title="Paraşüt'te İçeri Al ile aktardığınız faturaları arayıp kayda bağlar (ALIŞ rozetini tazeler). Satış faturası kesmez."
                            >
                                {parasutKontrol
                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                    : <Link2 className="h-4 w-4" />}
                                {parasutKontrol ? "Kontrol ediliyor..." : "Paraşüt'ü Kontrol Et"}
                            </Button>

                            {/* Hazır olan tüm dosyalar için Paraşüt'te taslak oluşturur.
                                Resmileştirme YAPILMAZ — o adım kullanıcıda. */}
                            <Button
                                variant="outline"
                                className="h-[38px] gap-2 font-semibold"
                                onClick={handleTumunuFaturala}
                                disabled={kesilenDosya !== null || matching || uploading || parasutKontrol || mailKontrol}
                                title="Beyanname eşleşmesi tamamlanmış dosyalar için Paraşüt'te satış faturası taslağı oluştur"
                            >
                                {kesilenDosya === "__TUMU__"
                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                    : <FileText className="h-4 w-4" />}
                                {kesilenDosya === "__TUMU__" ? "Kesiliyor..." : "Bekleyenleri Faturala"}
                            </Button>

                            <input
                                type="file"
                                id="nakliye-upload-compact"
                                className="hidden"
                                onChange={handleFileUpload}
                                multiple
                                disabled={uploading}
                                accept=".pdf,.jpg,.jpeg,.png"
                            />
                            <Button asChild className="h-[38px] gap-2 font-semibold" disabled={uploading}>
                                <label htmlFor="nakliye-upload-compact" className="cursor-pointer">
                                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                                    {uploading ? "Analiz Ediliyor..." : "Fatura Yükle"}
                                </label>
                            </Button>
                        </div>
                    </div>
                </div>

                {/* ===== 5 KPI (accent-bar) ===== */}
                <div className="mt-5 grid grid-cols-2 gap-3.5 md:grid-cols-3 lg:grid-cols-5">
                    {kpis.map((k) => (
                        <div key={k.label} className="relative overflow-hidden rounded-[14px] border bg-card p-4">
                            <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: k.color }} />
                            <div className="pl-2 text-[10.5px] font-semibold uppercase tracking-wide leading-tight text-muted-foreground">{k.label}</div>
                            <div className="mt-2 pl-2 text-[21px] font-extrabold tracking-tight tabular-nums">{k.value}</div>
                            <div className="mt-0.5 pl-2 text-[11.5px] text-muted-foreground">{k.sub}</div>
                        </div>
                    ))}
                </div>

                {/* ===== Extraction Preview (geçici) ===== */}
                {extractedData.length > 0 && (
                    <div className="mt-4 overflow-hidden rounded-[14px] border-2 border-sky-300 bg-sky-50/60 duration-500 animate-in fade-in slide-in-from-top-4 dark:bg-sky-950/20">
                        <div className="flex items-center justify-between border-b border-sky-200 bg-sky-100/60 px-5 py-3.5 dark:bg-sky-950/30">
                            <div className="flex items-center gap-2.5">
                                <FileSpreadsheet className="h-5 w-5 text-sky-600" />
                                <h3 className="font-extrabold text-sky-700 dark:text-sky-300">Yeni Ayıklanan Veriler (Onay Bekliyor)</h3>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="ghost" size="sm" onClick={resetView} disabled={saving}>İptal</Button>
                                <Button size="sm" className="gap-2 bg-emerald-600 font-bold hover:bg-emerald-700" onClick={handleSaveToSystem} disabled={saving}>
                                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                    Sisteme Kaydet
                                </Button>
                            </div>
                        </div>
                        <div className="max-h-[300px] overflow-auto">
                            <Table>
                                <TableHeader className="sticky top-0 z-10 bg-slate-50">
                                    <TableRow className="hover:bg-transparent">
                                        {Object.keys(extractedData[0] || {}).map((key) => (
                                            <TableHead key={key} className="py-2 text-[10.5px] font-bold uppercase tracking-wide text-slate-500">{key}</TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {extractedData.map((row, idx) => (
                                        <TableRow key={idx}>
                                            {Object.values(row).map((val: any, vIdx) => (
                                                <TableCell key={vIdx} className="py-2 text-sm">
                                                    {typeof val === 'object' && val !== null ? JSON.stringify(val) : (val?.toString() || "-")}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                )}

                {/* ===== Navlun Faturaları (tam genişlik) ===== */}
                <div className="mt-4 overflow-hidden rounded-[14px] border bg-card">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
                        <h3 className="text-[15px] font-bold">Navlun Faturaları</h3>
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-2">
                                <Label htmlFor="startDate" className="whitespace-nowrap text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Başlangıç</Label>
                                <Input id="startDate" type="date" className="h-8 w-[140px] text-xs" value={dateRange.start} onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))} />
                            </div>
                            <div className="flex items-center gap-2">
                                <Label htmlFor="endDate" className="whitespace-nowrap text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Bitiş</Label>
                                <Input id="endDate" type="date" className="h-8 w-[140px] text-xs" value={dateRange.end} onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))} />
                            </div>
                            {(dateRange.start || dateRange.end) && (
                                <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-foreground" onClick={() => setDateRange({ start: "", end: "" })}>
                                    <X className="mr-1 h-3 w-3" /> Filtreyi Temizle
                                </Button>
                            )}
                            <span className="text-xs text-muted-foreground">{sortedInvoices.length} kayıt</span>
                        </div>
                    </div>

                    {/* Kaydırma kabı dış div; iç Table sarmalayıcısı overflow-visible olmalı,
                        aksi halde sticky başlık iç (hiç kaymayan) kaba göre çözülür ve yapışmaz. */}
                    <div className="max-h-[calc(100vh-320px)] overflow-auto [&>div]:overflow-visible">
                        <Table className="w-full whitespace-nowrap text-[12.5px]">
                            <TableHeader className="sticky top-0 z-[5] bg-slate-50 dark:bg-muted">
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="h-9 cursor-pointer select-none px-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 transition-colors hover:text-foreground" onClick={() => handleSort('faturaNo')}>
                                        <div className="flex items-center gap-1.5">Fatura No <SortIcon column="faturaNo" /></div>
                                    </TableHead>
                                    <TableHead className="h-9 cursor-pointer select-none px-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 transition-colors hover:text-foreground" onClick={() => handleSort('faturaTarihi')}>
                                        <div className="flex items-center gap-1.5">Tarih <SortIcon column="faturaTarihi" /></div>
                                    </TableHead>
                                    <TableHead className="h-9 px-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Mal/Hizmet</TableHead>
                                    <TableHead className="h-9 px-2.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: "#0284c7" }}>Konteyner/Ref.</TableHead>
                                    <TableHead className="h-9 px-2.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: "#7c3aed" }}>Dosya No</TableHead>
                                    <TableHead className="h-9 px-2.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: "#059669" }}>Müşteri</TableHead>
                                    <TableHead className="h-9 px-2.5 text-right text-[10px] font-bold uppercase tracking-wide text-slate-500">Miktar</TableHead>
                                    <TableHead className="h-9 px-2.5 text-right text-[10px] font-bold uppercase tracking-wide text-slate-500">Birim Fiyat</TableHead>
                                    <TableHead className="h-9 px-2.5 text-right text-[10px] font-bold uppercase tracking-wide text-slate-500">Tutar</TableHead>
                                    <TableHead className="h-9 px-2.5 text-right text-[10px] font-bold uppercase tracking-wide text-slate-500">KDV</TableHead>
                                    <TableHead className="h-9 px-2.5 text-right text-[10px] font-bold uppercase tracking-wide text-slate-500">Tevkifat</TableHead>
                                    <TableHead className="h-9 px-2.5 text-right text-[10px] font-bold uppercase tracking-wide text-slate-500">Vergili Top.</TableHead>
                                    <TableHead className="h-9 px-2.5 text-right text-[10px] font-bold uppercase tracking-wide text-slate-500">Genel Toplam</TableHead>
                                    <TableHead className="h-9 px-2.5 text-center text-[10px] font-bold uppercase tracking-wide text-slate-500" title="Gelen faturanın Paraşüt'e işlenme ve müşteriye fatura kesilme durumu">Durum</TableHead>
                                    <TableHead className="h-9 w-[40px] px-1.5"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sortedInvoices.length > 0 ? (
                                    sortedInvoices.map((inv) => (
                                        // İŞİ BİTMİŞ SATIR YEŞİL: müşteri faturası resmileşip
                                        // numarasını almışsa satır bir bakışta ayırt edilir.
                                        // Taslakta kalanlar normal zeminde kalır ki gözden kaçmasın.
                                        <TableRow
                                            key={inv.id}
                                            className={`cursor-pointer ${
                                                inv.parasutSatisDurum === "resmilesti"
                                                    ? "bg-emerald-50/60 hover:bg-emerald-100/60 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/30"
                                                    : ""
                                            }`}
                                            onClick={() => setSelectedInvoice(inv)}
                                        >
                                            <TableCell className="px-2.5 py-1.5 font-bold tabular-nums" style={{ color: "#0284c7" }}>
                                                {inv.pdfYolu ? (
                                                    // Fatura numarasına tıklanınca kaynak PDF yeni sekmede açılır.
                                                    // stopPropagation: satır tıklaması modalı açmasın.
                                                    <a
                                                        href={`/${String(inv.pdfYolu).replace(/^\/+/, "")}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-2 hover:decoration-solid"
                                                        title="Kaynak PDF'i aç"
                                                    >
                                                        {inv.faturaNo || "N/A"}
                                                        <FileText className="h-3 w-3 opacity-60" />
                                                    </a>
                                                ) : (inv.faturaNo || "N/A")}
                                            </TableCell>
                                            <TableCell className="px-2.5 py-1.5 tabular-nums text-muted-foreground">{formatDate(inv.faturaTarihi)}</TableCell>
                                            <TableCell className="max-w-[240px] truncate px-2.5 py-1.5 font-medium" title={inv.malHizmet || undefined}>{inv.malHizmet || "-"}</TableCell>
                                            <TableCell className="max-w-[150px] truncate px-2.5 py-1.5 font-mono text-[12px] font-medium" style={{ color: "#0284c7" }} title={inv.konteynerler || undefined}>{inv.konteynerler || inv._konteynerIlk}</TableCell>
                                            <TableCell className="px-2.5 py-1.5 font-bold" style={{ color: "#7c3aed" }}>{inv.ilgiliDosyaNo || "-"}</TableCell>
                                            <TableCell className="max-w-[170px] truncate px-2.5 py-1.5 font-medium" style={{ color: "#059669" }} title={inv._musteri !== "-" ? inv._musteri : undefined}>{inv._musteri}</TableCell>
                                            <TableCell className="px-2.5 py-1.5 text-right font-mono tabular-nums">{formatCurrency(inv.miktar)}</TableCell>
                                            <TableCell className="px-2.5 py-1.5 text-right font-mono tabular-nums text-muted-foreground">{formatCurrency(inv.birimFiyat)}</TableCell>
                                            <TableCell className="px-2.5 py-1.5 text-right font-bold tabular-nums">{formatCurrency(inv.malHizmetToplamTutarı)}</TableCell>
                                            <TableCell className="px-2.5 py-1.5 text-right tabular-nums text-muted-foreground">{formatCurrency(inv.kdvTutarı)}</TableCell>
                                            <TableCell className="px-2.5 py-1.5 text-right tabular-nums" style={{ color: "#d97706" }}>{formatCurrency(inv.hesaplananKdvTevkifat20)}</TableCell>
                                            <TableCell className="px-2.5 py-1.5 text-right tabular-nums text-muted-foreground">{formatCurrency(inv.vergilerDahilToplamTutar)}</TableCell>
                                            <TableCell className="px-2.5 py-1.5 text-right font-black tabular-nums text-foreground">{formatCurrency(inv.odenecekTutar)}</TableCell>
                                            <TableCell className="px-2.5 py-1.5">
                                                <DurumRozetleri
                                                    inv={inv}
                                                    onFaturaKes={handleFaturaKes}
                                                    kesiliyor={kesilenDosya === inv.ilgiliDosyaNo}
                                                />
                                            </TableCell>
                                            <TableCell className="px-1.5 py-1 text-center">
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={(e) => handleDeleteInvoice(inv.id, e)}>
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={15} className="h-40 text-center text-muted-foreground">
                                            <div className="flex flex-col items-center gap-2">
                                                <AlertCircle className="h-10 w-10 opacity-20" />
                                                <p>Henüz kayıtlı fatura bulunamadı.</p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>

                {/* ===== En Çok Navlun · Müşteri (tablonun altında, tam genişlik) ===== */}
                <div className="mt-4 rounded-[14px] border bg-card p-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="text-[15px] font-bold">En Çok Navlun · Müşteri</h3>
                        <p className="text-xs text-muted-foreground">{yil} toplam ciro payı</p>
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                        {topMusteri.length === 0 && (
                            <div className="py-6 text-center text-sm text-muted-foreground">Henüz veri yok</div>
                        )}
                        {topMusteri.map((m) => (
                            <div key={m.name} className="min-w-0">
                                <div className="mb-1.5 flex items-center justify-between gap-2">
                                    <span className="min-w-0 truncate text-[12.5px] font-semibold text-foreground/80" title={m.name}>{m.name}</span>
                                    <span className="flex-shrink-0 text-[12.5px] font-bold tabular-nums">{formatCurrencyFull(m.value)}</span>
                                </div>
                                <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-muted">
                                    <span className="block h-full rounded-full bg-sky-500" style={{ width: `${m.w}%` }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ===== Fatura Detay Modalı (korundu) ===== */}
            <Dialog open={!!selectedInvoice} onOpenChange={(open) => !open && setSelectedInvoice(null)}>
                {/* max-h + overflow-y ZORUNLU: uzun mal/hizmet açıklaması ve finansal
                    özet bazı faturalarda ekranı aşıyordu, alttaki kaydet düğmesine
                    ulaşılamıyordu. min-w-0 ise DialogContent'in grid olmasından:
                    grid öğelerinin min-width'i auto'dur, içindeki truncate metin
                    kutuyu kırpmak yerine modalı max-w'nin dışına iter. */}
                <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl">
                            <FileText className="h-5 w-5 text-sky-600" />
                            <span>Fatura Detayı</span>
                        </DialogTitle>
                    </DialogHeader>

                    {selectedInvoice && (
                        <div className="grid min-w-0 gap-6 py-4">
                            <div className="flex flex-col items-center justify-between gap-4 rounded-lg border bg-muted/30 p-4 sm:flex-row">
                                <div className="flex flex-col items-center gap-1 sm:items-start">
                                    <span className="text-xs font-bold uppercase text-muted-foreground">Fatura No</span>
                                    <span className="font-mono text-xl font-black tracking-tight" style={{ color: "#0284c7" }}>{selectedInvoice.faturaNo}</span>
                                    {selectedInvoice.pdfYolu && (
                                        <a
                                            href={`/${String(selectedInvoice.pdfYolu).replace(/^\/+/, "")}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-sky-600 underline decoration-dotted underline-offset-2 hover:decoration-solid"
                                        >
                                            <FileText className="h-3.5 w-3.5" /> Kaynak PDF'i aç
                                        </a>
                                    )}
                                </div>
                                <div className="hidden h-8 w-px bg-border sm:block"></div>
                                <div className="flex flex-col items-center gap-1 sm:items-end">
                                    <span className="text-xs font-bold uppercase text-muted-foreground">Tarih</span>
                                    <span className="font-mono text-xl font-bold tracking-tight">{formatDate(selectedInvoice.faturaTarihi)}</span>
                                </div>
                            </div>

                            {/* Matched Gumruk Info */}
                            {selectedInvoice.ilgiliDosyaNo && (
                                <div className="flex min-w-0 items-center justify-center rounded-lg border border-purple-200 bg-purple-50 p-3 text-center text-sm font-medium text-purple-800 dark:border-purple-900/40 dark:bg-purple-950/20 dark:text-purple-300">
                                    <CheckCircle2 className="mr-2 h-5 w-5 shrink-0 text-purple-600" />
                                    <span className="min-w-0 break-words">
                                        {/* Format: 1-DOSYA NO, 2-FİRMA ÜNVAN, 3-GÜMRÜK, 4-DOVİZ KIYMETİ, 5-DOVİZ, 6-TESCİL NO, 7-TESCİL TARİHİ, 8-HOUSE NO */}
                                        {selectedInvoice.ilgiliDosyaNo} - {selectedInvoice.gumrukFirmaUnvan} - {selectedInvoice.gumrukAdi} - {selectedInvoice.gumrukDovizKiymeti} - {selectedInvoice.gumrukDovizCinsi} - {selectedInvoice.gumrukTescilNo} - {selectedInvoice.gumrukTescilTarihi} - {selectedInvoice.eslesenHouseNo}
                                    </span>
                                </div>
                            )}

                            {/* Editable Fields
                                Her grid çocuğunda min-w-0 var: grid öğelerinin varsayılan
                                min-width'i auto olduğu için uzun müşteri unvanı sütunu
                                şişirip komşu kutunun üzerine taşıyordu. */}
                            <div className="grid grid-cols-1 gap-4 rounded-xl border bg-muted/10 p-4 md:grid-cols-2">
                                <div className="min-w-0 space-y-2">
                                    <Label className="text-xs font-bold uppercase text-muted-foreground">Müşteri</Label>
                                    <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" role="combobox" aria-expanded={openCombobox} className="w-full min-w-0 justify-between font-normal">
                                                <span className="min-w-0 flex-1 truncate text-left" title={editMusteri || undefined}>
                                                    {editMusteri || "Müşteri Seçiniz..."}
                                                </span>
                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[var(--radix-popover-trigger-width)] max-w-[90vw] p-0" align="start">
                                            <Command>
                                                <CommandInput placeholder="Müşteri ara..." />
                                                <CommandList>
                                                    <CommandEmpty>Müşteri bulunamadı.</CommandEmpty>
                                                    <CommandGroup>
                                                        {customers.map((customer) => (
                                                            <CommandItem
                                                                key={customer}
                                                                value={customer}
                                                                onSelect={(currentValue) => {
                                                                    setEditMusteri(currentValue === editMusteri ? "" : currentValue);
                                                                    setOpenCombobox(false);
                                                                }}
                                                            >
                                                                <Check className={cn("mr-2 h-4 w-4", editMusteri === customer ? "opacity-100" : "opacity-0")} />
                                                                {customer}
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                </div>

                                <div className="min-w-0 space-y-2">
                                    <Label className="text-xs font-bold uppercase text-muted-foreground">Konteynerler</Label>
                                    <Input value={editKonteynerler} onChange={(e) => setEditKonteynerler(e.target.value)} placeholder="Konteyner no giriniz..." className="w-full min-w-0 font-mono text-sm" />
                                    <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                        <AlertCircle className="h-3 w-3" /> Birden fazla ise virgülle ayırın.
                                    </p>
                                </div>

                                {/* DOSYA NO ile ELLE EŞLEŞTİRME.
                                    Otomatik eşleştirme yalnız konteyner numarasıyla çalışıyor;
                                    konteyner numarası hiç geçmeyen faturalar ("GEMLİK RODA LİMAN
                                    - BURSA NAKLİYE BEDELİ" gibi) kendiliğinden eşleşemez.
                                    Buraya dosya no girilince sunucu beyanname bilgilerinin
                                    tamamını doldurur ve fatura kesilebilir hale gelir. */}
                                <div className="min-w-0 space-y-2 md:col-span-2">
                                    <Label className="text-xs font-bold uppercase text-muted-foreground">
                                        Dosya No <span className="normal-case text-muted-foreground/70">(elle eşleştirme)</span>
                                    </Label>
                                    <Input
                                        value={editDosyaNo}
                                        onChange={(e) => setEditDosyaNo(e.target.value)}
                                        placeholder="Örn. 26-10359"
                                        className="w-full min-w-0 font-mono text-sm"
                                    />
                                    <p className="flex items-start gap-1 text-[10px] text-muted-foreground">
                                        <AlertCircle className="mt-px h-3 w-3 shrink-0" />
                                        <span>
                                            Konteyner numarası olmayan faturalar için. Kaydedince beyanname
                                            bilgileri otomatik doldurulur. Boş bırakıp kaydederseniz eşleşme kaldırılır.
                                        </span>
                                    </p>
                                </div>

                                {/* ELLE İŞLENDİ.
                                    Paraşüt'e girilmeyen işler için (parça sevkiyat vb.).
                                    İşaretlenince iki rozet de yeşile döner ve kayıt otomatik
                                    faturalamaya aday sayılmaz. Temmuz 2026 öncesi kayıtlar
                                    zaten tarih kuralıyla bu durumda — burası istisna yolu. */}
                                {(() => {
                                    // Temmuz 2026 öncesi kayıtlarda durum TARİH KURALINDAN geliyor;
                                    // kutucuk orada bir şey değiştirmez. Aktif bırakmak yerine
                                    // kilitleyip nedenini yazmak, tıklayıp hiçbir şey olmamasından iyi.
                                    const tarihKuraliyleElle =
                                        selectedInvoice.parasutAlisDurum === "elle" && selectedInvoice.elleIslendi !== true;
                                    return (
                                        <div className="min-w-0 md:col-span-2">
                                            <label className={cn(
                                                "flex items-start gap-2.5 rounded-lg border bg-background p-3 transition-colors",
                                                tarihKuraliyleElle ? "cursor-default opacity-70" : "cursor-pointer hover:bg-muted/40",
                                            )}>
                                                <Checkbox
                                                    checked={editElleIslendi || tarihKuraliyleElle}
                                                    disabled={tarihKuraliyleElle}
                                                    onCheckedChange={(v) => setEditElleIslendi(v === true)}
                                                    className="mt-0.5 shrink-0"
                                                />
                                                <span className="min-w-0">
                                                    <span className="block text-[13px] font-semibold">Elle işlendi</span>
                                                    <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                                                        {tarihKuraliyleElle
                                                            ? "Temmuz 2026 öncesi olduğu için zaten elle işlenmiş sayılıyor; bu kayıtta değiştirilemez."
                                                            : "Bu fatura Paraşüt'e girilmeyecek; alış ve satış tarafı sistem dışında hallediliyor. İşaretlenince iki rozet de yeşile döner ve otomatik faturalama bu kaydı atlar."}
                                                    </span>
                                                </span>
                                            </label>
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* Full Description */}
                            <div className="space-y-2">
                                <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Mal/Hizmet Açıklaması</h4>
                                <div className="max-h-[300px] overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/50 p-4 text-sm leading-relaxed">
                                    {selectedInvoice.malHizmet}
                                </div>
                            </div>

                            {/* Financial Summary */}
                            <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">Miktar:</span>
                                    <span className="font-mono font-medium tabular-nums">{formatCurrency(selectedInvoice.miktar)}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">Birim Fiyat:</span>
                                    <span className="font-mono font-medium tabular-nums">{formatCurrency(selectedInvoice.birimFiyat)}</span>
                                </div>
                                <div className="my-2 h-px bg-border/50" />
                                <div className="flex items-center justify-between">
                                    <span className="font-medium">Mal Hizmet Toplamı:</span>
                                    <span className="font-mono font-bold tabular-nums">{formatCurrency(selectedInvoice.malHizmetToplamTutarı)}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">KDV Tutarı:</span>
                                    <span className="font-mono tabular-nums">{formatCurrency(selectedInvoice.kdvTutarı)}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm" style={{ color: "#d97706" }}>
                                    <span>Tevkifat:</span>
                                    <span className="font-mono tabular-nums">{formatCurrency(selectedInvoice.hesaplananKdvTevkifat20)}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">Vergili Toplam:</span>
                                    <span className="font-mono tabular-nums">{formatCurrency(selectedInvoice.vergilerDahilToplamTutar)}</span>
                                </div>
                                <div className="my-2 h-px bg-border" />
                                <div className="-mx-2 flex items-center justify-between rounded bg-sky-50 p-2 text-lg dark:bg-sky-950/20">
                                    <span className="font-bold" style={{ color: "#0284c7" }}>Genel Toplam:</span>
                                    <span className="font-mono font-black tabular-nums text-foreground">{formatCurrency(selectedInvoice.odenecekTutar)} TL</span>
                                </div>
                            </div>
                            <DialogFooter className="mt-4 gap-2">
                                <Button variant="outline" onClick={() => setSelectedInvoice(null)} disabled={updating}>Vazgeç</Button>
                                <Button onClick={handleUpdate} disabled={updating}>
                                    {updating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Değişiklikleri Kaydet
                                </Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

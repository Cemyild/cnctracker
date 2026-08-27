import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Phone, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { MusteriDetayModal } from "./MusteriDetayModal";
import {
  aramaEslesir, fmtTarih, vekaletDurumu, VEKALET_BILGI,
  type CrmDepartman, type CrmMusteriListe, type VekaletDurum,
} from "./tipler";

// Aynı anda çizilen azami satır. 470 satırın tamamını çizmek listeyi
// ağırlaştırıyor; kalanı arama/süzgeçle daraltılır.
const LISTE_SINIRI = 300;

type SuzgecKod =
  | "hepsi" | "kartBos" | "kisisiz" | "vekaletDolmus" | "vekaletYakin" | "vekaletYok" | "gorusmesiz";

const SUZGECLER: { kod: SuzgecKod; etiket: string; ipucu: string }[] = [
  { kod: "hepsi", etiket: "Hepsi", ipucu: "Tüm müşteriler" },
  { kod: "kartBos", etiket: "Kartı boş", ipucu: "Firma bilgileri hiç girilmemiş" },
  { kod: "kisisiz", etiket: "Kişisi yok", ipucu: "Hiç iletişim kişisi tanımlanmamış" },
  { kod: "vekaletDolmus", etiket: "Vekaleti dolmuş", ipucu: "Vekalet süresi geçmiş" },
  { kod: "vekaletYakin", etiket: "Vekalet 90 gün", ipucu: "90 gün içinde bitiyor" },
  { kod: "vekaletYok", etiket: "Vekaleti yok", ipucu: "Vekalet tarihi kayıtlı değil" },
  { kod: "gorusmesiz", etiket: "Görüşmesiz", ipucu: "Hiç görüşme kaydı yok" },
];

function suzgeceUyar(m: CrmMusteriListe, kod: SuzgecKod, durum: VekaletDurum): boolean {
  switch (kod) {
    case "kartBos": return !m.kartVar;
    case "kisisiz": return m.kisiSayisi === 0;
    case "vekaletDolmus": return durum === "dolmus";
    case "vekaletYakin": return durum === "yakin";
    case "vekaletYok": return durum === "yok";
    case "gorusmesiz": return !m.sonGorusmeTarihi;
    default: return true;
  }
}

export function MusteriPanel({
  musteriler,
  departmanlar,
  seciliId,
  onSecim,
}: {
  musteriler: CrmMusteriListe[];
  departmanlar: CrmDepartman[];
  seciliId: string | null;
  onSecim: (id: string | null) => void;
}) {
  const [arama, setArama] = useState("");
  const [suzgec, setSuzgec] = useState<SuzgecKod>("hepsi");
  const [yeniMusteriAcik, setYeniMusteriAcik] = useState(false);

  // Vekalet durumu satır başına bir kez hesaplanır; hem süzgeç hem rozet kullanır.
  const zengin = useMemo(
    () => musteriler.map((m) => ({ ...m, durum: vekaletDurumu(m.vekaletBitis) })),
    [musteriler],
  );

  const sayilar = useMemo(() => {
    const s: Record<string, number> = {};
    for (const f of SUZGECLER) {
      s[f.kod] = f.kod === "hepsi"
        ? zengin.length
        : zengin.filter((m) => suzgeceUyar(m, f.kod, m.durum)).length;
    }
    return s;
  }, [zengin]);

  const suzulmus = useMemo(
    () => zengin
      .filter((m) => suzgeceUyar(m, suzgec, m.durum))
      .filter((m) => aramaEslesir(arama, m.ad, m.hesapKodu, m.sektor, m.il, m.ilce, m.telefon)),
    [zengin, suzgec, arama],
  );
  const gosterilen = suzulmus.slice(0, LISTE_SINIRI);

  return (
    <div className="space-y-3">
      {/* ═══ Süzgeç şeridi ═══ */}
      <div className="flex flex-wrap items-center gap-2">
        {SUZGECLER.map((f) => {
          const aktif = suzgec === f.kod;
          const n = sayilar[f.kod] ?? 0;
          return (
            <button
              key={f.kod}
              title={f.ipucu}
              onClick={() => setSuzgec(f.kod)}
              className={cn(
                "inline-flex items-center gap-2 rounded-[9px] border px-3 py-1.5 text-[12.5px] transition-colors",
                aktif
                  ? "border-slate-900 bg-slate-900 font-bold text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                  : "font-semibold text-muted-foreground hover:bg-muted",
                !aktif && n === 0 && "opacity-45",
              )}
            >
              {f.etiket}
              <span className={cn(
                "inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1 text-[10px] font-extrabold tabular-nums",
                aktif ? "bg-white/20 dark:bg-slate-900/15" : "bg-muted-foreground/15",
              )}>{n}</span>
            </button>
          );
        })}

        <div className="relative ml-auto min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={arama}
            onChange={(e) => setArama(e.target.value)}
            placeholder="Firma, hesap kodu, il, ilçe veya telefon ara…"
            className="h-[36px] text-[13px]"
            style={{ paddingLeft: "2.35rem" }}
          />
        </div>

        <Button
          className="h-[36px] shrink-0 gap-1.5 bg-slate-900 text-white hover:bg-slate-800"
          onClick={() => setYeniMusteriAcik(true)}
        >
          <Plus className="h-3.5 w-3.5" /> Yeni Müşteri
        </Button>
      </div>

      {/* ═══ Tam genişlik liste ═══ */}
      <div className="overflow-hidden rounded-[14px] border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] text-sm">
            <thead className="border-b bg-slate-50 dark:bg-slate-900/40">
              <tr>
                {["Firma", "Konum", "Telefon", "Kişi", "Vekalet", "Son Görüşme"].map((b) => (
                  <th
                    key={b}
                    className={cn(
                      "p-3 text-[10.5px] font-bold uppercase tracking-wide text-slate-500",
                      b === "Kişi" ? "text-center" : "text-left",
                    )}
                  >
                    {b}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gosterilen.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-[13px] text-muted-foreground">
                    Bu süzgece uyan müşteri yok.
                  </td>
                </tr>
              )}
              {gosterilen.map((m) => {
                const v = VEKALET_BILGI[m.durum];
                return (
                  <tr
                    key={m.id}
                    onClick={() => onSecim(m.id)}
                    className="cursor-pointer border-b border-border/60 transition-colors hover:bg-sky-50/70 dark:hover:bg-sky-950/20"
                  >
                    <td className="p-3">
                      <div className="font-semibold">{m.ad}</div>
                      <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                        {m.hesapKodu}
                        {m.sektor ? ` · ${m.sektor}` : ""}
                        {!m.kartVar && (
                          <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-800">
                            kart boş
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-[12.5px]">
                      {[m.ilce, m.il].filter(Boolean).join(" / ") || <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-3 text-[12.5px]">
                      {m.telefon
                        ? <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-muted-foreground" />{m.telefon}</span>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-3 text-center">
                      <span className={cn(
                        "inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-extrabold tabular-nums",
                        m.kisiSayisi > 0
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                          : "bg-slate-100 text-slate-400 dark:bg-slate-800",
                      )}>
                        {m.kisiSayisi}
                      </span>
                    </td>
                    <td className="p-3">
                      <span
                        className="inline-flex rounded-md px-2 py-1 text-[11.5px] font-bold"
                        style={{ background: v.arka, color: v.renk }}
                      >
                        {v.etiket}
                      </span>
                      {m.vekaletBitis && m.durum !== "suresiz" && (
                        <span className="ml-2 text-[11.5px] tabular-nums text-muted-foreground">
                          {fmtTarih(m.vekaletBitis)}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-[12.5px] tabular-nums text-muted-foreground">
                      {fmtTarih(m.sonGorusmeTarihi)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {suzulmus.length > LISTE_SINIRI && (
          <p className="border-t p-3 text-center text-[11.5px] text-muted-foreground">
            {suzulmus.length} kayıttan ilk {LISTE_SINIRI} tanesi gösteriliyor — aramayı daraltın.
          </p>
        )}
      </div>

      {/* ═══ Detay modalı ═══ */}
      <MusteriDetayModal
        musteriId={seciliId}
        departmanlar={departmanlar}
        onClose={() => onSecim(null)}
      />

      <YeniMusteriModal
        open={yeniMusteriAcik}
        onClose={() => setYeniMusteriAcik(false)}
        onEklendi={(id) => onSecim(id)}
      />
    </div>
  );
}

// Mizanda henüz görünmeyen firmalar için elle kayıt. Hesap kodu boş bırakılırsa
// sunucu CRM-xxxx formatında geçici kod üretir.
function YeniMusteriModal({
  open, onClose, onEklendi,
}: { open: boolean; onClose: () => void; onEklendi: (id: string) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [ad, setAd] = useState("");
  const [hesapKodu, setHesapKodu] = useState("");
  const [sektor, setSektor] = useState("");

  const kapat = () => { setAd(""); setHesapKodu(""); setSektor(""); onClose(); };

  const ekle = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/crm/musteriler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ad: ad.trim(), hesapKodu: hesapKodu.trim(), sektor: sektor.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Eklenemedi");
      return res.json();
    },
    onSuccess: (m: { id: string }) => {
      qc.invalidateQueries({ queryKey: ["/api/crm/musteriler"] });
      qc.invalidateQueries({ queryKey: ["/api/crm/stats"] });
      onEklendi(m.id);
      kapat();
      toast({ title: "Müşteri eklendi" });
    },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(a) => !a && kapat()}>
      <DialogContent className="max-w-md">
        <DialogHeader className="min-w-0">
          <DialogTitle>Yeni Müşteri</DialogTitle>
        </DialogHeader>
        <div className="grid min-w-0 gap-3.5">
          <div className="grid gap-1.5">
            <Label className="text-[12.5px] font-semibold">Firma Ünvanı *</Label>
            <Input value={ad} onChange={(e) => setAd(e.target.value)} placeholder="ABC Dış Ticaret A.Ş." />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-[12.5px] font-semibold">Muhasebe Hesap Kodu</Label>
            <Input value={hesapKodu} onChange={(e) => setHesapKodu(e.target.value)} placeholder="120-01-000-002" />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-[12.5px] font-semibold">Sektör</Label>
            <Input value={sektor} onChange={(e) => setSektor(e.target.value)} placeholder="Tekstil" />
          </div>
          <p className="text-[11.5px] leading-snug text-muted-foreground">
            Müşteri listesi muhasebe mizanından otomatik dolar. Buradaki elle kayıt,
            mizanda henüz görünmeyen yeni firmalar içindir. Hesap kodunu boş bırakırsanız
            geçici bir kod atanır; mizan geldiğinde gerçek koduyla güncelleyebilirsiniz.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={kapat}>Vazgeç</Button>
          <Button
            className="bg-slate-900 text-white hover:bg-slate-800"
            disabled={!ad.trim() || ekle.isPending}
            onClick={() => ekle.mutate()}
          >
            Ekle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

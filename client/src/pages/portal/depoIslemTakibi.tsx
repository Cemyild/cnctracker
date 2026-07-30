import { useEffect, useState } from "react";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Hourglass, CheckCircle2, Undo2, PackageCheck } from "lucide-react";
import {
  type TalepDetay, formatPara, formatTarih, gunFarki, bugunYmd,
  gunAciliyetSinifi, devamEdenTeminatlar, iadeEdilebilirTeminatlar,
} from "./portalUtils";
import type { PortalMe } from "./PortalApp";

// Depo teminatı = gümrük işlemi bitmeden geri istenemeyen para. İşlemin bittiğini
// YALNIZ temsilci bilir; bu dosya o bilginin sisteme girmesini ve muhasebeye
// ulaşmasını sağlayan üç yüzeyi tutar: temsilci kartı, günlük hatırlatma, muhasebe kartı.

async function islemDurumuGuncelle(talepId: string, tamamlandi: boolean) {
  const res = await fetch(`/api/portal/talepler/${talepId}/islem-durumu`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tamamlandi }),
    credentials: "include",
  });
  if (!res.ok) throw new Error((await res.json()).error || "Güncellenemedi");
  queryClient.invalidateQueries({ queryKey: ["/api/portal/talepler"] });
}

// Dosya no · konşimento · müşteri — üç yüzeyde de aynı kimlik satırı.
function TeminatKimligi({ talep }: { talep: TalepDetay }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
        <span className="font-semibold tabular-nums">{talep.beyanname?.dosyaNo ?? "Dosyasız"}</span>
        {talep.konsimentoNo && (
          <span className="tabular-nums text-muted-foreground">· {talep.konsimentoNo}</span>
        )}
        <span className="font-semibold tabular-nums text-rose-600">
          · {formatPara(talep.tutar, talep.paraBirimi)}
        </span>
      </div>
      <div className="truncate text-xs text-muted-foreground" title={talep.beyanname?.alici ?? ""}>
        {talep.beyanname?.alici ?? talep.alacakli}
        {talep.tasiyici ? ` · ${talep.tasiyici}` : ""}
      </div>
    </div>
  );
}

function GunSayaci({ odemeTarihi }: { odemeTarihi: string | null }) {
  const gun = gunFarki(odemeTarihi);
  if (gun == null) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className={`whitespace-nowrap text-xs tabular-nums ${gunAciliyetSinifi(gun)}`}>
      {gun} gündür açık
    </span>
  );
}

/** TEMSİLCİ — Taleplerim'in en üstü: işlemi süren teminatlar ve bitiş işaretlemesi. */
export function DevamEdenIslemlerKarti({ talepler }: { talepler: TalepDetay[] }) {
  const { toast } = useToast();
  const [gonderilen, setGonderilen] = useState<string | null>(null);
  // En uzun süredir açık olan en üstte — ödeme tarihi YYYY-MM-DD, string sıralaması kronolojik.
  const liste = devamEdenTeminatlar(talepler).sort((a, b) =>
    (a.odemeTarihi ?? "").localeCompare(b.odemeTarihi ?? ""));
  if (!liste.length) return null;

  const tamamla = async (id: string) => {
    setGonderilen(id);
    try {
      await islemDurumuGuncelle(id, true);
      toast({ title: "İşlem tamamlandı", description: "Muhasebe iade talebi için bilgilendirildi." });
    } catch (e: any) {
      toast({ title: "Hata", description: e.message, variant: "destructive" });
    } finally { setGonderilen(null); }
  };

  return (
    <Card className="border-amber-200 dark:border-amber-900/40">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300">
            <Hourglass className="h-[18px] w-[18px]" />
          </span>
          <CardTitle className="text-base font-semibold text-amber-700 dark:text-amber-300">
            Devam Eden İşlemler ({liste.length})
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5">
        <p className="text-xs text-muted-foreground">
          Bu depo teminatları ödendi ama gümrük işlemi bitmeden geri istenemez.
          İşlemi biten dosyaları işaretleyin — muhasebe iade talebini o zaman başlatır.
        </p>
        {liste.map((t) => (
          <div
            key={t.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3"
            data-testid={`row-devam-eden-${t.id}`}
          >
            <TeminatKimligi talep={t} />
            <div className="flex shrink-0 items-center gap-3">
              <GunSayaci odemeTarihi={t.odemeTarihi} />
              <Button
                size="sm"
                onClick={() => tamamla(t.id)}
                disabled={gonderilen === t.id}
                data-testid={`button-islem-tamam-${t.id}`}
              >
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
                {gonderilen === t.id ? "Kaydediliyor…" : "İşlem Tamamlandı"}
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** TEMSİLCİ — yanlış işaretlemeyi geri alır. Muhasebe iadeyi aldıysa sunucu 409 verir. */
export function IslemGeriAlButonu({ talep }: { talep: TalepDetay }) {
  const { toast } = useToast();
  const [gonderiliyor, setGonderiliyor] = useState(false);
  if (talep.iadeDurumu !== "islem_tamam") return null;

  const geriAl = async () => {
    setGonderiliyor(true);
    try {
      await islemDurumuGuncelle(talep.id, false);
      toast({ title: "Geri alındı", description: "Dosya yeniden 'işlem devam ediyor' oldu." });
    } catch (e: any) {
      toast({ title: "Hata", description: e.message, variant: "destructive" });
    } finally { setGonderiliyor(false); }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 px-2 text-xs text-muted-foreground"
      onClick={geriAl}
      disabled={gonderiliyor}
      data-testid={`button-islem-geri-al-${talep.id}`}
    >
      <Undo2 className="mr-1 h-3 w-3" />Geri Al
    </Button>
  );
}

// Günlük hatırlatma, kullanıcı başına SON GÖSTERİM GÜNÜNÜ tutar. Sunucuda tablo yok:
// kaçırılan bir hatırlatmanın kalıcı kaydı gereksiz, ertesi gün zaten yeniden sorulur.
function hatirlatmaAnahtari(meId: string) {
  return `portal_depo_hatirlatma_${meId}`;
}

/** TEMSİLCİ — günün ilk girişinde açık teminatları tek tek sorar. */
export function DepoHatirlatmaPenceresi({ me, talepler }: { me: PortalMe; talepler: TalepDetay[] }) {
  const { toast } = useToast();
  const [acik, setAcik] = useState(false);
  const [gonderilen, setGonderilen] = useState<string | null>(null);
  // "Devam ediyor" denenler YALNIZ bu oturumda gizlenir — sunucuya hiçbir şey yazılmaz.
  const [ertelenen, setErtelenen] = useState<Set<string>>(new Set());

  const liste = devamEdenTeminatlar(talepler).sort((a, b) =>
    (a.odemeTarihi ?? "").localeCompare(b.odemeTarihi ?? ""));

  // Gün içinde bir kez: son gösterim bugüne eşitse açma.
  useEffect(() => {
    if (me.rol !== "temsilci" || liste.length === 0) return;
    let sonGosterim: string | null = null;
    try { sonGosterim = localStorage.getItem(hatirlatmaAnahtari(me.id)); } catch { /* storage kapalı */ }
    if (sonGosterim === bugunYmd()) return;
    setAcik(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.id, me.rol, liste.length]);

  const kapat = () => {
    try { localStorage.setItem(hatirlatmaAnahtari(me.id), bugunYmd()); } catch { /* storage kapalı */ }
    setAcik(false);
  };

  const bitti = async (id: string) => {
    setGonderilen(id);
    try {
      await islemDurumuGuncelle(id, true);
      toast({ title: "İşlem tamamlandı", description: "Muhasebe bilgilendirildi." });
    } catch (e: any) {
      toast({ title: "Hata", description: e.message, variant: "destructive" });
    } finally { setGonderilen(null); }
  };

  const kalanlar = liste.filter((t) => !ertelenen.has(t.id));
  // Tüm satırlar cevaplandıysa pencereyi kapat (gösterim damgası atılır).
  useEffect(() => {
    if (acik && kalanlar.length === 0) kapat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acik, kalanlar.length]);

  if (me.rol !== "temsilci") return null;

  return (
    <Dialog open={acik} onOpenChange={(a) => { if (!a) kapat(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Günaydın {me.adSoyad.split(" ")[0]} — açık depo teminatları</DialogTitle>
        </DialogHeader>
        <div className="min-w-0 space-y-2.5">
          <p className="text-sm text-muted-foreground">
            {kalanlar.length} dosyada gümrük işlemi devam ediyor görünüyor. Bugün biten var mı?
          </p>
          {kalanlar.map((t) => (
            <div
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border p-3"
              data-testid={`hatirlatma-${t.id}`}
            >
              <TeminatKimligi talep={t} />
              <div className="flex shrink-0 items-center gap-2">
                <GunSayaci odemeTarihi={t.odemeTarihi} />
                <Button
                  size="sm"
                  onClick={() => bitti(t.id)}
                  disabled={gonderilen === t.id}
                  data-testid={`button-hatirlatma-bitti-${t.id}`}
                >
                  Bitti
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setErtelenen((s) => new Set(s).add(t.id))}
                  data-testid={`button-hatirlatma-devam-${t.id}`}
                >
                  Devam ediyor
                </Button>
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={kapat} data-testid="button-hatirlatma-kapat">
            Sonra hatırlat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** MUHASEBE — Depo Ödemeleri'nin üstü: temsilcinin bitirdiği, iadesi istenebilecek teminatlar. */
export function IadeEdilebilirKarti({
  talepler, iadeAc,
}: { talepler: TalepDetay[]; iadeAc: (t: TalepDetay) => void }) {
  const liste = iadeEdilebilirTeminatlar(talepler).sort((a, b) =>
    (a.islemBitisTarihi ?? "").localeCompare(b.islemBitisTarihi ?? ""));
  if (!liste.length) return null;

  return (
    <Card className="border-emerald-200 dark:border-emerald-900/40">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
            <PackageCheck className="h-[18px] w-[18px]" />
          </span>
          <CardTitle className="text-base font-semibold text-emerald-700 dark:text-emerald-300">
            İade Talep Edilebilir ({liste.length})
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5">
        <p className="text-xs text-muted-foreground">
          Temsilci gümrük işleminin bittiğini bildirdi. Teminat artık depodan geri istenebilir.
        </p>
        {liste.map((t) => (
          <div
            key={t.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3"
            data-testid={`row-iade-edilebilir-${t.id}`}
          >
            <TeminatKimligi talep={t} />
            <div className="flex shrink-0 items-center gap-3">
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                {t.talepEdenAd} · {formatTarih(t.islemBitisTarihi)} bitirdi
              </span>
              <Button size="sm" onClick={() => iadeAc(t)} data-testid={`button-iade-hizli-${t.id}`}>
                İade Kaydı
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

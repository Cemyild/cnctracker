import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock, CheckCircle2, Globe, Link2, Mail, MapPin, MessageSquarePlus,
  Pencil, Phone, Plus, Smartphone, Star, Trash2, UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { FirmaBilgiForm } from "./FirmaBilgiForm";
import { FormLinkModal } from "./FormLinkModal";
import { GorusmeModal } from "./GorusmeModal";
import { KisiModal } from "./KisiModal";
import {
  DEPARTMANSIZ, fmtTarih, gorusmeTipEtiket, vekaletDurumu, VEKALET_BILGI,
  type CrmDepartman, type CrmGorusme, type CrmKisi, type CrmMusteriDetay,
} from "./tipler";

const ALT_SEKMELER = [
  { id: "kisiler", etiket: "İletişim Kişileri" },
  { id: "bilgiler", etiket: "Firma Bilgileri" },
  { id: "gorusmeler", etiket: "Görüşmeler" },
] as const;

type AltSekme = (typeof ALT_SEKMELER)[number]["id"];

export function MusteriDetayModal({
  musteriId, departmanlar, onClose,
}: { musteriId: string | null; departmanlar: CrmDepartman[]; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [altSekme, setAltSekme] = useState<AltSekme>("kisiler");
  const [kisiModal, setKisiModal] = useState<{ acik: boolean; duzenlenen: CrmKisi | null; departmanId: string | null }>(
    { acik: false, duzenlenen: null, departmanId: null },
  );
  const [gorusmeModal, setGorusmeModal] = useState<{ acik: boolean; duzenlenen: CrmGorusme | null }>(
    { acik: false, duzenlenen: null },
  );
  const [formLinkAcik, setFormLinkAcik] = useState(false);

  // Farklı bir firma açılınca ilk sekmeye dön; önceki firmanın sekmesinde kalmasın.
  useEffect(() => { setAltSekme("kisiler"); }, [musteriId]);

  const { data: detay, isLoading } = useQuery<CrmMusteriDetay>({
    queryKey: ["/api/crm/musteriler", musteriId],
    queryFn: () => fetch(`/api/crm/musteriler/${musteriId}`).then((r) => r.json()),
    enabled: !!musteriId,
  });

  const tazele = () => {
    qc.invalidateQueries({ queryKey: ["/api/crm/musteriler", musteriId] });
    qc.invalidateQueries({ queryKey: ["/api/crm/musteriler"] });
    qc.invalidateQueries({ queryKey: ["/api/crm/rehber"] });
    qc.invalidateQueries({ queryKey: ["/api/crm/stats"] });
  };

  const kisiSil = useMutation({
    mutationFn: (id: string) => fetch(`/api/crm/kisiler/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => { tazele(); toast({ title: "Kişi silindi" }); },
  });

  const gorusmeSil = useMutation({
    mutationFn: (id: string) => fetch(`/api/crm/gorusmeler/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      tazele();
      qc.invalidateQueries({ queryKey: ["/api/crm/takipler"] });
      toast({ title: "Görüşme silindi" });
    },
  });

  const takipKapat = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/crm/gorusmeler/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ takipTamamlandi: true }),
      }).then((r) => r.json()),
    onSuccess: () => {
      tazele();
      qc.invalidateQueries({ queryKey: ["/api/crm/takipler"] });
      toast({ title: "Takip tamamlandı olarak işaretlendi" });
    },
  });

  // Sunucu departman sırasına göre gönderiyor; Map ekleme sırasını korur.
  const kisiGruplari = useMemo(() => {
    const gruplar = new Map<string, CrmKisi[]>();
    for (const k of detay?.kisiler ?? []) {
      const ad = k.departmanAd ?? DEPARTMANSIZ;
      if (!gruplar.has(ad)) gruplar.set(ad, []);
      gruplar.get(ad)!.push(k);
    }
    return [...gruplar.entries()];
  }, [detay]);

  const vDurum = vekaletDurumu(detay?.bilgi?.vekaletBitis);
  const vBilgi = VEKALET_BILGI[vDurum];

  return (
    <>
      <Dialog open={!!musteriId} onOpenChange={(a) => !a && onClose()}>
        <DialogContent className="flex max-h-[90vh] w-[min(1100px,95vw)] max-w-none flex-col overflow-hidden p-0">
          {isLoading && (
            <div className="flex min-h-[300px] items-center justify-center text-[13px] text-muted-foreground">
              Yükleniyor…
            </div>
          )}

          {detay && (
            <>
              {/* ═══ Sabit başlık — üç ayrı katman, kendi nefes alanlarıyla ═══ */}
              <DialogHeader className="min-w-0 space-y-0 border-b p-0 text-left">
                {/* Katman 1: firma adı + işlemler */}
                <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 px-7 pb-5 pt-6">
                  <div className="min-w-0 flex-1">
                    <DialogTitle className="pr-8 text-[21px] font-extrabold leading-snug tracking-tight">
                      {detay.musteri.ad}
                    </DialogTitle>
                    <p className="mt-1.5 text-[12.5px] text-muted-foreground">
                      {detay.musteri.hesapKodu}
                      {detay.musteri.sektor ? ` · ${detay.musteri.sektor}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 pr-7">
                    <Button variant="outline" className="h-[34px] gap-1.5" onClick={() => setFormLinkAcik(true)}>
                      <Link2 className="h-3.5 w-3.5" /> Bilgi Formu
                    </Button>
                    <Button
                      variant="outline" className="h-[34px] gap-1.5"
                      onClick={() => setGorusmeModal({ acik: true, duzenlenen: null })}
                    >
                      <MessageSquarePlus className="h-3.5 w-3.5" /> Görüşme Ekle
                    </Button>
                    <Button
                      className="h-[34px] gap-1.5 bg-slate-900 text-white hover:bg-slate-800"
                      onClick={() => setKisiModal({ acik: true, duzenlenen: null, departmanId: null })}
                    >
                      <Plus className="h-3.5 w-3.5" /> Kişi Ekle
                    </Button>
                  </div>
                </div>

                {/* Katman 2: hızlı bakış şeridi */}
                <div className="flex flex-wrap items-center gap-x-7 gap-y-2.5 border-t bg-muted/25 px-7 py-3">
                  <span
                    className="inline-flex shrink-0 items-center rounded-md px-2.5 py-1 text-[11.5px] font-bold"
                    style={{ background: vBilgi.arka, color: vBilgi.renk }}
                  >
                    {/* "Vekalet: Vekalet yok" tekrarını önle */}
                    {vDurum === "yok"
                      ? "Vekalet yok"
                      : `Vekalet: ${vBilgi.etiket}${
                          detay.bilgi?.vekaletBitis && vDurum !== "suresiz"
                            ? ` · ${fmtTarih(detay.bilgi.vekaletBitis)}`
                            : ""
                        }`}
                  </span>
                  {detay.bilgi?.telefon && (
                    <span className="inline-flex items-center gap-2 text-[12.5px]">
                      <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />{detay.bilgi.telefon}
                    </span>
                  )}
                  {detay.bilgi?.genelEmail && (
                    <span className="inline-flex items-center gap-2 text-[12.5px]">
                      <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />{detay.bilgi.genelEmail}
                    </span>
                  )}
                  {(detay.bilgi?.ilce || detay.bilgi?.il) && (
                    <span className="inline-flex items-center gap-2 text-[12.5px]">
                      <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                      {[detay.bilgi?.ilce, detay.bilgi?.il].filter(Boolean).join(" / ")}
                    </span>
                  )}
                  {detay.bilgi?.web && (
                    <span className="inline-flex items-center gap-2 text-[12.5px]">
                      <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />{detay.bilgi.web}
                    </span>
                  )}
                  {!detay.bilgi && (
                    <span className="text-[12.5px] italic text-muted-foreground">
                      Firma bilgileri henüz girilmemiş
                    </span>
                  )}
                </div>

                {/* Katman 3: alt sekmeler */}
                <div className="flex gap-1.5 border-t px-7 py-2.5">
                  {ALT_SEKMELER.map((s) => {
                    const sayi = s.id === "kisiler" ? detay.kisiler.length
                      : s.id === "gorusmeler" ? detay.gorusmeler.length : null;
                    const aktif = altSekme === s.id;
                    return (
                      <button
                        key={s.id}
                        onClick={() => setAltSekme(s.id)}
                        className={cn(
                          "inline-flex items-center gap-2 rounded-[9px] px-3.5 py-2 text-[13px] transition-colors",
                          aktif
                            ? "bg-slate-900 font-bold text-white dark:bg-slate-100 dark:text-slate-900"
                            : "font-semibold text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {s.etiket}
                        {sayi !== null && (
                          <span className={cn(
                            "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10.5px] font-extrabold tabular-nums",
                            aktif ? "bg-white/20 text-white dark:bg-slate-900/15 dark:text-slate-900" : "bg-muted-foreground/15",
                          )}>{sayi}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </DialogHeader>

              {/* ═══ Kaydırılan gövde ═══ */}
              <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/60 px-7 py-6 dark:bg-background">
                {altSekme === "bilgiler" && (
                  <FirmaBilgiForm musteriId={detay.musteri.id} bilgi={detay.bilgi} />
                )}

                {altSekme === "kisiler" && (
                  <div className="space-y-3">
                    {kisiGruplari.length === 0 && (
                      <div className="rounded-[14px] border border-dashed bg-card/50 p-8 text-center">
                        <UserRound className="mx-auto h-8 w-8 text-muted-foreground/50" strokeWidth={1.5} />
                        <p className="mt-2.5 text-[13.5px] font-bold">Henüz iletişim kişisi yok</p>
                        <p className="mt-1 text-[12.5px] text-muted-foreground">
                          Her departman için ayrı muhatap ekleyebilirsiniz.
                        </p>
                        <Button
                          className="mt-3.5 h-[34px] gap-1.5 bg-slate-900 text-white hover:bg-slate-800"
                          onClick={() => setKisiModal({ acik: true, duzenlenen: null, departmanId: null })}
                        >
                          <Plus className="h-3.5 w-3.5" /> İlk kişiyi ekle
                        </Button>
                      </div>
                    )}

                    {kisiGruplari.map(([departmanAd, kisiler]) => {
                      const departman = departmanlar.find((d) => d.ad === departmanAd);
                      return (
                        <div key={departmanAd} className="overflow-hidden rounded-[14px] border bg-card">
                          <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2.5">
                            <h3 className="text-[12.5px] font-extrabold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                              {departmanAd}
                            </h3>
                            <Button
                              variant="ghost"
                              className="h-[26px] gap-1 px-2 text-[11.5px] font-bold text-sky-700 hover:bg-sky-100/70 dark:text-sky-400 dark:hover:bg-sky-950/40"
                              onClick={() => setKisiModal({ acik: true, duzenlenen: null, departmanId: departman?.id ?? null })}
                            >
                              <Plus className="h-3.5 w-3.5" /> Ekle
                            </Button>
                          </div>
                          <div className="divide-y">
                            {kisiler.map((k) => (
                              <div key={k.id} className={cn("flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3", !k.aktif && "opacity-55")}>
                                <div className="min-w-[170px] flex-1">
                                  <div className="flex items-center gap-1.5">
                                    {k.birincil && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" />}
                                    <span className="truncate text-[13.5px] font-bold">{k.adSoyad}</span>
                                    {!k.aktif && (
                                      <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                        pasif
                                      </span>
                                    )}
                                  </div>
                                  {k.unvan && <p className="mt-0.5 text-[11.5px] text-muted-foreground">{k.unvan}</p>}
                                  {k.notlar && <p className="mt-1 text-[11.5px] italic text-muted-foreground">{k.notlar}</p>}
                                </div>
                                <div className="flex min-w-[190px] flex-col gap-1 text-[12px]">
                                  {k.telefon && (
                                    <a href={`tel:${k.telefon}`} className="inline-flex items-center gap-1.5 hover:underline">
                                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />{k.telefon}
                                    </a>
                                  )}
                                  {k.cepTelefon && (
                                    <a href={`tel:${k.cepTelefon}`} className="inline-flex items-center gap-1.5 hover:underline">
                                      <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />{k.cepTelefon}
                                    </a>
                                  )}
                                  {k.email && (
                                    <a href={`mailto:${k.email}`} className="inline-flex items-center gap-1.5 truncate hover:underline">
                                      <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                      <span className="truncate">{k.email}</span>
                                    </a>
                                  )}
                                  {!k.telefon && !k.cepTelefon && !k.email && (
                                    <span className="text-muted-foreground">İletişim bilgisi girilmemiş</span>
                                  )}
                                </div>
                                <div className="flex shrink-0 gap-1">
                                  <Button
                                    variant="ghost" size="icon" className="h-8 w-8"
                                    onClick={() => setKisiModal({ acik: true, duzenlenen: k, departmanId: null })}
                                    aria-label="Düzenle"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost" size="icon"
                                    className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40"
                                    onClick={() => {
                                      if (confirm(`"${k.adSoyad}" kaydını silmek istediğinize emin misiniz? Geçmiş görüşmelerdeki kişi bağlantısı boşalır.`)) {
                                        kisiSil.mutate(k.id);
                                      }
                                    }}
                                    aria-label="Sil"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {altSekme === "gorusmeler" && (
                  <div className="overflow-hidden rounded-[14px] border bg-card">
                    {detay.gorusmeler.length === 0 ? (
                      <div className="p-8 text-center">
                        <MessageSquarePlus className="mx-auto h-8 w-8 text-muted-foreground/50" strokeWidth={1.5} />
                        <p className="mt-2.5 text-[13.5px] font-bold">Görüşme kaydı yok</p>
                        <p className="mt-1 text-[12.5px] text-muted-foreground">
                          Telefon, e-posta ve ziyaretleri buraya işleyin — personel değişse de firma hafızası kalır.
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y">
                        {detay.gorusmeler.map((g) => (
                          <div key={g.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3">
                            <div className="w-[86px] shrink-0">
                              <div className="text-[12.5px] font-bold tabular-nums">{fmtTarih(g.tarih)}</div>
                              <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                {gorusmeTipEtiket(g.tip)}
                              </div>
                            </div>
                            <div className="min-w-[200px] flex-1">
                              <p className="text-[13px] font-bold">{g.konu}</p>
                              {g.notlar && <p className="mt-1 whitespace-pre-wrap text-[12px] text-muted-foreground">{g.notlar}</p>}
                              <p className="mt-1.5 text-[11px] text-muted-foreground">
                                {g.kisiAd ? `Görüşülen: ${g.kisiAd}` : "Görüşülen kişi belirtilmemiş"}
                                {g.personel ? ` · Kaydeden: ${g.personel}` : ""}
                              </p>
                              {g.takipTarihi && (
                                <div className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] font-bold"
                                  style={g.takipTamamlandi
                                    ? { background: "#f0fdf4", color: "#15803d" }
                                    : { background: "#fef3c7", color: "#b45309" }}>
                                  {g.takipTamamlandi ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CalendarClock className="h-3.5 w-3.5" />}
                                  Takip: {fmtTarih(g.takipTarihi)}
                                  {g.takipTamamlandi ? " (tamamlandı)" : ""}
                                </div>
                              )}
                            </div>
                            <div className="flex shrink-0 gap-1">
                              {g.takipTarihi && !g.takipTamamlandi && (
                                <Button
                                  variant="ghost" size="icon"
                                  className="h-8 w-8 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                                  onClick={() => takipKapat.mutate(g.id)}
                                  aria-label="Takibi tamamla"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button
                                variant="ghost" size="icon" className="h-8 w-8"
                                onClick={() => setGorusmeModal({ acik: true, duzenlenen: g })}
                                aria-label="Düzenle"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost" size="icon"
                                className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40"
                                onClick={() => {
                                  if (confirm("Bu görüşme kaydını silmek istediğinize emin misiniz?")) gorusmeSil.mutate(g.id);
                                }}
                                aria-label="Sil"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Alt modallar Dialog'un DIŞINDA: iç içe Dialog'da odak tuzağı çakışıyor. */}
      {musteriId && (
        <>
          <KisiModal
            open={kisiModal.acik}
            musteriId={musteriId}
            departmanlar={departmanlar}
            duzenlenen={kisiModal.duzenlenen}
            onDepartmanId={kisiModal.departmanId}
            onClose={() => setKisiModal({ acik: false, duzenlenen: null, departmanId: null })}
          />
          <GorusmeModal
            open={gorusmeModal.acik}
            musteriId={musteriId}
            kisiler={detay?.kisiler ?? []}
            duzenlenen={gorusmeModal.duzenlenen}
            onClose={() => setGorusmeModal({ acik: false, duzenlenen: null })}
          />
          <FormLinkModal
            open={formLinkAcik}
            musteriId={musteriId}
            musteriAd={detay?.musteri.ad ?? ""}
            onClose={() => setFormLinkAcik(false)}
          />
        </>
      )}
    </>
  );
}

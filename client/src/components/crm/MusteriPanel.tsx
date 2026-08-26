import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2, Mail, MapPin, MessageSquarePlus, Pencil, Phone, Plus, Search,
  Smartphone, Star, Trash2, UserRound, CalendarClock, CheckCircle2, Globe, Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { FirmaBilgiForm } from "./FirmaBilgiForm";
import { FormLinkModal } from "./FormLinkModal";
import { GorusmeModal } from "./GorusmeModal";
import { KisiModal } from "./KisiModal";
import {
  aramaEslesir, DEPARTMANSIZ, fmtTarih, gorusmeTipEtiket,
  type CrmDepartman, type CrmGorusme, type CrmKisi, type CrmMusteriDetay, type CrmMusteriListe,
} from "./tipler";

// Sol listede aynı anda çizilen azami satır. Mizan yüzlerce cari getirebiliyor;
// tamamını çizmek yerine arama daraltması isteniyor.
const LISTE_SINIRI = 200;

const ALT_SEKMELER = [
  { id: "bilgiler", etiket: "Firma Bilgileri" },
  { id: "kisiler", etiket: "İletişim Kişileri" },
  { id: "gorusmeler", etiket: "Görüşmeler" },
] as const;

type AltSekme = (typeof ALT_SEKMELER)[number]["id"];

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
  const { toast } = useToast();
  const qc = useQueryClient();

  const [arama, setArama] = useState("");
  const [altSekme, setAltSekme] = useState<AltSekme>("kisiler");
  const [yeniMusteriAcik, setYeniMusteriAcik] = useState(false);
  const [kisiModal, setKisiModal] = useState<{ acik: boolean; duzenlenen: CrmKisi | null; departmanId: string | null }>(
    { acik: false, duzenlenen: null, departmanId: null },
  );
  const [gorusmeModal, setGorusmeModal] = useState<{ acik: boolean; duzenlenen: CrmGorusme | null }>(
    { acik: false, duzenlenen: null },
  );
  const [formLinkAcik, setFormLinkAcik] = useState(false);

  const suzulmus = useMemo(
    () => musteriler.filter((m) => aramaEslesir(arama, m.ad, m.hesapKodu, m.sektor, m.il, m.telefon)),
    [musteriler, arama],
  );
  const gosterilen = suzulmus.slice(0, LISTE_SINIRI);

  const { data: detay, isLoading: detayYukleniyor } = useQuery<CrmMusteriDetay>({
    queryKey: ["/api/crm/musteriler", seciliId],
    queryFn: () => fetch(`/api/crm/musteriler/${seciliId}`).then((r) => r.json()),
    enabled: !!seciliId,
  });

  const tazele = () => {
    qc.invalidateQueries({ queryKey: ["/api/crm/musteriler", seciliId] });
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

  // Kişileri departmana göre grupla. Sunucu zaten departman sırasına göre
  // gönderiyor; Map ekleme sırasını koruduğu için o sıra burada da geçerli.
  const kisiGruplari = useMemo(() => {
    const gruplar = new Map<string, CrmKisi[]>();
    for (const k of detay?.kisiler ?? []) {
      const ad = k.departmanAd ?? DEPARTMANSIZ;
      if (!gruplar.has(ad)) gruplar.set(ad, []);
      gruplar.get(ad)!.push(k);
    }
    return [...gruplar.entries()];
  }, [detay]);

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      {/* ═══ SOL: müşteri listesi ═══ */}
      <div className="flex max-h-[calc(100vh-260px)] min-h-[420px] flex-col overflow-hidden rounded-[14px] border bg-card">
        <div className="border-b p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={arama}
              onChange={(e) => setArama(e.target.value)}
              placeholder="Firma, hesap kodu, il ara…"
              className="h-[36px] text-[13px]"
              style={{ paddingLeft: "2.15rem" }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11.5px] font-semibold text-muted-foreground">
              {suzulmus.length} müşteri
            </span>
            <Button
              variant="ghost"
              className="h-[26px] gap-1 px-2 text-[11.5px] font-bold text-sky-700 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-950/40"
              onClick={() => setYeniMusteriAcik(true)}
            >
              <Plus className="h-3.5 w-3.5" /> Yeni
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {gosterilen.length === 0 && (
            <p className="p-6 text-center text-[12.5px] text-muted-foreground">
              Eşleşen müşteri yok.
            </p>
          )}
          {gosterilen.map((m) => {
            const aktif = m.id === seciliId;
            return (
              <button
                key={m.id}
                onClick={() => onSecim(m.id)}
                className={cn(
                  "flex w-full items-start gap-2.5 border-b border-border/60 px-3 py-2.5 text-left transition-colors",
                  aktif ? "bg-sky-50 dark:bg-sky-950/30" : "hover:bg-muted/60",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 h-2 w-2 shrink-0 rounded-full",
                    m.kisiSayisi > 0 ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600",
                  )}
                  title={m.kisiSayisi > 0 ? "İletişim kişisi tanımlı" : "Henüz kişi girilmemiş"}
                />
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-[13px]", aktif ? "font-bold" : "font-semibold")}>
                    {m.ad}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                    {m.hesapKodu}
                    {m.il ? ` · ${m.il}` : ""}
                  </span>
                </span>
                {m.kisiSayisi > 0 && (
                  <span className="mt-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-slate-100 px-1.5 text-[10.5px] font-extrabold tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {m.kisiSayisi}
                  </span>
                )}
              </button>
            );
          })}
          {suzulmus.length > LISTE_SINIRI && (
            <p className="p-4 text-center text-[11.5px] text-muted-foreground">
              İlk {LISTE_SINIRI} kayıt gösteriliyor — aramayı daraltın.
            </p>
          )}
        </div>
      </div>

      {/* ═══ SAĞ: seçili müşteri ═══ */}
      <div className="min-w-0">
        {!seciliId && (
          <div className="flex min-h-[420px] flex-col items-center justify-center rounded-[14px] border border-dashed bg-card/50 p-8 text-center">
            <Building2 className="h-9 w-9 text-muted-foreground/50" strokeWidth={1.5} />
            <p className="mt-3 text-[14px] font-bold">Soldan bir müşteri seçin</p>
            <p className="mt-1 max-w-sm text-[12.5px] text-muted-foreground">
              Firmanın adresini, departman departman kiminle iletişime geçileceğini ve
              geçmiş görüşmeleri burada göreceksiniz.
            </p>
          </div>
        )}

        {seciliId && detayYukleniyor && (
          <div className="flex min-h-[420px] items-center justify-center rounded-[14px] border bg-card text-[13px] text-muted-foreground">
            Yükleniyor…
          </div>
        )}

        {seciliId && detay && (
          <div className="space-y-4">
            {/* Firma başlığı */}
            <div className="rounded-[14px] border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-[18px] font-extrabold tracking-tight">{detay.musteri.ad}</h2>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {detay.musteri.hesapKodu}
                    {detay.musteri.sektor ? ` · ${detay.musteri.sektor}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    className="h-[34px] gap-1.5"
                    onClick={() => setFormLinkAcik(true)}
                  >
                    <Link2 className="h-3.5 w-3.5" /> Bilgi Formu
                  </Button>
                  <Button
                    variant="outline"
                    className="h-[34px] gap-1.5"
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

              {/* Kart özeti — kart doldurulmuşsa hızlı bakış */}
              {detay.bilgi && (
                <div className="mt-3.5 flex flex-wrap gap-x-5 gap-y-1.5 border-t pt-3.5 text-[12px] text-muted-foreground">
                  {detay.bilgi.telefon && (
                    <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{detay.bilgi.telefon}</span>
                  )}
                  {detay.bilgi.genelEmail && (
                    <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{detay.bilgi.genelEmail}</span>
                  )}
                  {(detay.bilgi.ilce || detay.bilgi.il) && (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" />
                      {[detay.bilgi.ilce, detay.bilgi.il].filter(Boolean).join(" / ")}
                    </span>
                  )}
                  {detay.bilgi.web && (
                    <span className="inline-flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" />{detay.bilgi.web}</span>
                  )}
                </div>
              )}

              {/* Alt sekmeler */}
              <div className="mt-4 flex gap-1 border-t pt-3">
                {ALT_SEKMELER.map((s) => {
                  const sayi = s.id === "kisiler" ? detay.kisiler.length
                    : s.id === "gorusmeler" ? detay.gorusmeler.length
                    : null;
                  const aktif = altSekme === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setAltSekme(s.id)}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-[9px] px-3 py-1.5 text-[12.5px] transition-colors",
                        aktif
                          ? "bg-slate-900 font-bold text-white dark:bg-slate-100 dark:text-slate-900"
                          : "font-semibold text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {s.etiket}
                      {sayi !== null && (
                        <span className={cn(
                          "inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1 text-[10px] font-extrabold tabular-nums",
                          aktif ? "bg-white/20 text-white dark:bg-slate-900/15 dark:text-slate-900" : "bg-muted-foreground/15",
                        )}>
                          {sayi}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Firma bilgileri ── */}
            {altSekme === "bilgiler" && (
              <FirmaBilgiForm musteriId={detay.musteri.id} bilgi={detay.bilgi} />
            )}

            {/* ── İletişim kişileri ── */}
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
                          <div
                            key={k.id}
                            className={cn(
                              "flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3",
                              !k.aktif && "opacity-55",
                            )}
                          >
                            <div className="min-w-[170px] flex-1">
                              <div className="flex items-center gap-1.5">
                                {k.birincil && (
                                  <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" aria-label="Birincil muhatap" />
                                )}
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

            {/* ── Görüşmeler ── */}
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
        )}
      </div>

      {/* ═══ Modallar ═══ */}
      {seciliId && (
        <>
          <KisiModal
            open={kisiModal.acik}
            musteriId={seciliId}
            departmanlar={departmanlar}
            duzenlenen={kisiModal.duzenlenen}
            onDepartmanId={kisiModal.departmanId}
            onClose={() => setKisiModal({ acik: false, duzenlenen: null, departmanId: null })}
          />
          <GorusmeModal
            open={gorusmeModal.acik}
            musteriId={seciliId}
            kisiler={detay?.kisiler ?? []}
            duzenlenen={gorusmeModal.duzenlenen}
            onClose={() => setGorusmeModal({ acik: false, duzenlenen: null })}
          />
          <FormLinkModal
            open={formLinkAcik}
            musteriId={seciliId}
            musteriAd={detay?.musteri.ad ?? ""}
            onClose={() => setFormLinkAcik(false)}
          />
        </>
      )}

      <YeniMusteriModal
        open={yeniMusteriAcik}
        onClose={() => setYeniMusteriAcik(false)}
        onEklendi={(id) => { onSecim(id); setAltSekme("bilgiler"); }}
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

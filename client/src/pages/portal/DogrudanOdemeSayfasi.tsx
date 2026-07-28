import { useMemo, useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import type { Beyanname, MasrafTuru, OdemeSirketi, OdemeSirketiDetay } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatTarih, formatPara, tamEslesme, benzerFirmalar, firmaIbanlariByPB, firmaIbanOzet } from "./portalUtils";
import KonsimentoAnalizAlani, { type KonsimentoBilgisi, BOS_KONSIMENTO } from "./KonsimentoAnalizAlani";
import MasrafTuruSecici from "./MasrafTuruSecici";
import BeyannameSecici from "./BeyannameSecici";
import { SayfaBasligi } from "./kasaUI";
import { Check } from "lucide-react";

// Bölüm başlığı stili — form içi gruplama (tablo başlıklarıyla aynı dil).
const BOLUM_BASLIK = "text-xs font-semibold uppercase tracking-wide text-muted-foreground";

// Muhasebenin talepsiz ödeme girişi — tek adımda "Ödendi" kaydı oluşur (dekont zorunlu).
export default function DogrudanOdemeSayfasi() {
  const { toast } = useToast();
  const { data: beyannameler = [] } = useQuery<Beyanname[]>({
    queryKey: ["/api/portal/beyannameler"], // muhasebe: tüm liste
  });
  const { data: masrafTurleri = [] } = useQuery<MasrafTuru[]>({
    queryKey: ["/api/portal/masraf-turleri"],
  });
  const { data: odemeSirketleri = [] } = useQuery<OdemeSirketiDetay[]>({
    queryKey: ["/api/portal/odeme-sirketleri"],
  });

  const [beyannameId, setBeyannameId] = useState("");
  const [dosyaYok, setDosyaYok] = useState(false);
  const [odemeTipi, setOdemeTipi] = useState<"masraf" | "depo_teminat">("masraf");
  const [masrafTuru, setMasrafTuru] = useState("");
  const [tutar, setTutar] = useState("");
  const [paraBirimi, setParaBirimi] = useState("TRY");
  const [alacakli, setAlacakli] = useState("");
  const [iban, setIban] = useState("");
  const [aciklama, setAciklama] = useState("");
  const [dekont, setDekont] = useState<File | null>(null);
  const [konsimento, setKonsimento] = useState<KonsimentoBilgisi>({ ...BOS_KONSIMENTO });
  const [formSayac, setFormSayac] = useState(0);
  const [gonderiliyor, setGonderiliyor] = useState(false);

  const secili = beyannameler.find((b) => b.id === beyannameId);

  // Alacaklı bir firmayla TAM eşleşiyorsa IBAN'ı otomatik doldur (elle yazılan ezilmez);
  // tam değilse benzer kayıtları öneri olarak çıkar (IBAN insan tıklamasıyla dolar).
  const tamFirma = useMemo(() => tamEslesme(alacakli, odemeSirketleri), [alacakli, odemeSirketleri]);
  const benzerOneriler = useMemo(
    () => (tamFirma ? [] : benzerFirmalar(alacakli, odemeSirketleri)),
    [tamFirma, alacakli, odemeSirketleri],
  );
  // Firmanın seçili dövizdeki IBAN'ları: 1 → otomatik dolar; >1 → dropdown seçimi; 0 → elle
  const ibanSecenekleri = useMemo(
    () => (tamFirma ? firmaIbanlariByPB(tamFirma, paraBirimi) : []),
    [tamFirma, paraBirimi],
  );
  useEffect(() => {
    if (!tamFirma) return;
    const otomatikDoldurulabilir = !iban.trim() || iban === sonIbanOnerisi.current;
    if (!otomatikDoldurulabilir) return;
    if (ibanSecenekleri.length === 1) {
      setIban(ibanSecenekleri[0].iban);
      sonIbanOnerisi.current = ibanSecenekleri[0].iban;
    } else if (sonIbanOnerisi.current && iban === sonIbanOnerisi.current) {
      // 0 veya çok seçenek → önceki otomatik IBAN'ı temizle (çokta insan seçecek)
      setIban("");
      sonIbanOnerisi.current = null;
    }
  }, [tamFirma, paraBirimi, ibanSecenekleri]);

  const ibanSecimi = (secilenIban: string) => {
    setIban(secilenIban);
    sonIbanOnerisi.current = secilenIban;
  };

  const firmaSec = (f: OdemeSirketiDetay) => {
    setAlacakli(f.ad);
    sonAlacakliOnerisi.current = f.ad;
    const secenekler = firmaIbanlariByPB(f, paraBirimi);
    if (secenekler.length === 1) { setIban(secenekler[0].iban); sonIbanOnerisi.current = secenekler[0].iban; }
    // çok/0 → temsilci dropdown'dan/elle seçer
  };

  // Son GEÇERLİ öneriyi ref'te izle: dosya değişimindeki ara null-öneri çağrısı
  // izi silmesin — yoksa yeni öneri "elle yazılmış" sanılıp eski acente ekranda kalır.
  const sonAlacakliOnerisi = useRef<string | null>(null);
  const sonIbanOnerisi = useRef<string | null>(null);
  const konsimentoDegisti = (b: KonsimentoBilgisi) => {
    if (b.alacakliOnerisi && b.alacakliOnerisi !== sonAlacakliOnerisi.current) {
      // Alacaklı boşsa ya da hâlâ önceki öneriyse yeni öneriyle doldur (elle yazılmışsa ezme)
      if (!alacakli.trim() || alacakli === sonAlacakliOnerisi.current) {
        setAlacakli(b.alacakliOnerisi);
      }
      sonAlacakliOnerisi.current = b.alacakliOnerisi;
    }
    setKonsimento(b);
  };

  const gonder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dosyaYok && !beyannameId) {
      toast({ title: "Beyanname seçin", description: "Dosya yoksa 'Dosya yok' işaretleyin.", variant: "destructive" });
      return;
    }
    if (dosyaYok && !aciklama.trim()) {
      toast({ title: "Dosyasız kayıtta açıklama zorunlu", variant: "destructive" });
      return;
    }
    if (!tutar.trim() || !alacakli.trim()) {
      toast({ title: "Tutar ve alacaklı zorunlu", variant: "destructive" });
      return;
    }
    if (odemeTipi === "masraf" && !masrafTuru) {
      toast({ title: "Masraf türü seçin", variant: "destructive" });
      return;
    }
    if (!dekont) {
      toast({ title: "Dekont dosyası zorunlu", variant: "destructive" });
      return;
    }
    if (odemeTipi === "depo_teminat") {
      if (!konsimento.dosya) {
        toast({ title: "Depo teminatında konşimento zorunlu", variant: "destructive" });
        return;
      }
      if (!konsimento.konsimentoNo.trim()) {
        toast({ title: "Konşimento numarası zorunlu", variant: "destructive" });
        return;
      }
      if (!konsimento.onaylandi) {
        toast({ title: "Konşimento bilgilerini onaylayın", description: "\"Bilgiler doğru, onaylıyorum\" kutusunu işaretleyin.", variant: "destructive" });
        return;
      }
    }
    setGonderiliyor(true);
    try {
      const fd = new FormData();
      if (!dosyaYok) fd.set("beyannameId", beyannameId);
      fd.set("odemeTipi", odemeTipi);
      fd.set("masrafTuru", masrafTuru);
      fd.set("tutar", tutar);
      fd.set("paraBirimi", paraBirimi);
      fd.set("alacakli", alacakli);
      fd.set("iban", iban);
      fd.set("aciklama", aciklama);
      fd.set("dekont", dekont);
      if (odemeTipi === "depo_teminat" && konsimento.dosya) {
        fd.set("konsimento", konsimento.dosya);
        fd.set("konsimentoNo", konsimento.konsimentoNo.trim());
        fd.set("tasiyici", konsimento.tasiyici.trim());
      }
      const res = await fetch("/api/portal/dogrudan-odeme", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Kaydedilemedi");
      toast({ title: "Ödeme kaydedildi", description: "Kayıt doğrudan Ödendi durumunda oluştu." });
      setBeyannameId(""); setDosyaYok(false); setMasrafTuru(""); setTutar("");
      setAlacakli(""); setIban(""); setAciklama(""); setDekont(null); setKonsimento({ ...BOS_KONSIMENTO });
      sonAlacakliOnerisi.current = null;
      sonIbanOnerisi.current = null;
      setFormSayac((s) => s + 1);
      queryClient.invalidateQueries({ queryKey: ["/api/portal/talepler"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/odeme-sirketleri"] });
    } catch (err: any) {
      toast({ title: "Hata", description: err.message, variant: "destructive" });
    } finally {
      setGonderiliyor(false);
    }
  };

  return (
    <div className="space-y-6">
      <SayfaBasligi
        baslik="Doğrudan Ödeme"
        alt="Talepsiz ödeme girişi — tek adımda “Ödendi” durumunda kayıt oluşur (dekont zorunlu)"
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Ödeme Formu</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={gonder} className="space-y-6">
            <div className="space-y-3">
              <Label className={BOLUM_BASLIK}>Beyanname / Dosya</Label>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="dogrudan-dosya-yok"
                  checked={dosyaYok}
                  onCheckedChange={(v) => {
                    setDosyaYok(v === true);
                    if (v === true) setBeyannameId("");
                  }}
                  data-testid="checkbox-dogrudan-dosya-yok"
                />
                <Label htmlFor="dogrudan-dosya-yok" className="font-normal text-muted-foreground">
                  Dosya yok — beyannamesiz kayıt (açıklama zorunlu)
                </Label>
              </div>
              {!dosyaYok && (
                <BeyannameSecici
                  beyannameler={beyannameler}
                  value={beyannameId}
                  onChange={setBeyannameId}
                  testId="select-dogrudan-beyanname"
                  placeholder="Aramak için Ref, Alıcı yada Beyanname No yazın, yada açılır listeden seçin (tüm liste)"
                />
              )}
              {!dosyaYok && secili && (
                <div className="space-y-1 rounded-lg border bg-muted/20 p-3 text-xs">
                  <div><span className="font-medium text-foreground">Müşteri:</span> <span className="text-muted-foreground">{secili.alici ?? "—"}</span></div>
                  <div><span className="font-medium text-foreground">Beyan No:</span> <span className="text-muted-foreground">{secili.beyanNo ?? "—"}</span></div>
                  <div>
                    <span className="font-medium text-foreground">Beyan Tarihi:</span>{" "}
                    <span className="text-muted-foreground">{secili.beyanTarihi ? formatTarih(secili.beyanTarihi) : "beyan tarihi yok"}</span>
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Fatura:</span>{" "}
                    <span className="font-semibold tabular-nums text-rose-600">{formatPara(secili.fatBedeli, secili.doviz)}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3 border-t pt-6">
              <Label className={BOLUM_BASLIK}>Ödeme Detayı</Label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Ödeme Tipi</Label>
                  <Select
                    value={odemeTipi}
                    onValueChange={(v) => {
                      setOdemeTipi(v as "masraf" | "depo_teminat");
                      // Tip değişince konşimento bilgisi geçersiz — sıfırla (yanıltıcı bayat durum kalmasın)
                      setKonsimento({ ...BOS_KONSIMENTO });
                      sonAlacakliOnerisi.current = null;
                      sonIbanOnerisi.current = null;
                    }}
                  >
                    <SelectTrigger data-testid="select-dogrudan-tip">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="masraf">Normal Masraf</SelectItem>
                      <SelectItem value="depo_teminat">Depo Teminatı</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {odemeTipi === "masraf" && (
                  <div className="space-y-2">
                    <Label>Masraf Türü</Label>
                    <MasrafTuruSecici value={masrafTuru} onChange={setMasrafTuru} testId="dogrudan-masraf-turu" />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Tutar</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="0,00"
                      value={tutar}
                      onChange={(e) => setTutar(e.target.value)}
                      className="tabular-nums"
                      data-testid="input-dogrudan-tutar"
                    />
                    <Select value={paraBirimi} onValueChange={setParaBirimi}>
                      <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TRY">TRY</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {odemeTipi === "depo_teminat" && (
                <KonsimentoAnalizAlani key={formSayac} deger={konsimento} onDegisim={konsimentoDegisti} idOnEki="dogrudan" />
              )}
            </div>

            <div className="space-y-3 border-t pt-6">
              <Label className={BOLUM_BASLIK}>Alacaklı &amp; IBAN</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Kime Ödendi (Alacaklı)</Label>
                  <Input
                    placeholder="Firma adı"
                    value={alacakli}
                    onChange={(e) => setAlacakli(e.target.value)}
                    list="alacakli-onerileri-dogrudan"
                    data-testid="input-dogrudan-alacakli"
                  />
                  <datalist id="alacakli-onerileri-dogrudan">
                    {odemeSirketleri.map((s) => (
                      <option key={s.id} value={s.ad} />
                    ))}
                  </datalist>
                  {benzerOneriler.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1" data-testid="benzer-firmalar-dogrudan">
                      <span className="w-full text-xs text-muted-foreground">Benzer kayıtlı firmalar:</span>
                      {benzerOneriler.map((f, i) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => firmaSec(f)}
                          className="rounded-full border px-2.5 py-1 text-xs transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:hover:border-indigo-800 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-300"
                          data-testid={`cip-firma-${i}`}
                        >
                          {f.ad}
                          {firmaIbanOzet(f).length > 0
                            ? ` · ${firmaIbanOzet(f).map((o) => `${o.paraBirimi}${o.adet > 1 ? `×${o.adet}` : ""}`).join(", ")}`
                            : " · IBAN yok"}
                        </button>
                      ))}
                    </div>
                  )}
                  {ibanSecenekleri.length > 1 && (
                    <div
                      className="space-y-1.5 rounded-lg border border-indigo-200 bg-indigo-50/60 p-2.5 dark:border-indigo-900 dark:bg-indigo-950/20"
                      data-testid="alan-iban-secim"
                    >
                      <Label className="text-xs text-muted-foreground">Bu firmada {paraBirimi} için {ibanSecenekleri.length} hesap — birini seçin</Label>
                      <Select value={iban} onValueChange={ibanSecimi}>
                        <SelectTrigger data-testid="select-firma-iban"><SelectValue placeholder="IBAN seçin" /></SelectTrigger>
                        <SelectContent>
                          {ibanSecenekleri.map((s) => (
                            <SelectItem key={s.id} value={s.iban}>{s.etiket || "—"} · …{s.iban.slice(-4)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>IBAN (varsa)</Label>
                  <Input
                    placeholder="TR.."
                    value={iban}
                    onChange={(e) => setIban(e.target.value)}
                    data-testid="input-dogrudan-iban"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2 border-t pt-6">
              <Label className={BOLUM_BASLIK}>Açıklama</Label>
              <Textarea
                placeholder="Ödemeyle ilgili not…"
                value={aciklama}
                onChange={(e) => setAciklama(e.target.value)}
                data-testid="input-dogrudan-aciklama"
              />
            </div>

            <div className="space-y-2 border-t pt-6">
              <Label className={BOLUM_BASLIK}>Dekont (zorunlu)</Label>
              <Input
                key={`dekont-${formSayac}`}
                type="file"
                onChange={(e) => setDekont(e.target.files?.[0] ?? null)}
                data-testid="input-dogrudan-dekont"
              />
            </div>

            <div className="flex justify-end border-t pt-6">
              <Button type="submit" size="lg" disabled={gonderiliyor} data-testid="button-dogrudan-kaydet">
                {gonderiliyor ? "Kaydediliyor…" : (
                  <>
                    <Check className="mr-1.5 h-4 w-4" />
                    Ödemeyi Kaydet
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

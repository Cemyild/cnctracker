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
import { type PortalMe } from "./PortalApp";
import { formatTarih, formatPara, tamEslesme, benzerFirmalar, firmaIbanlariByPB, firmaIbanOzet } from "./portalUtils";
import KonsimentoAnalizAlani, { type KonsimentoBilgisi, BOS_KONSIMENTO } from "./KonsimentoAnalizAlani";
import MasrafTuruSecici from "./MasrafTuruSecici";

type KalemDurum = "bekliyor" | "gonderiliyor" | "gonderildi" | "hata";

type Kalem = {
  odemeTipi: "masraf" | "depo_teminat";
  masrafTuru: string;
  tutar: string;
  paraBirimi: string;
  alacakli: string;
  iban: string;
  aciklama: string;
  belgeler: File[];
  konsimento: { dosya: File; konsimentoNo: string; tasiyici: string } | null;
  durum: KalemDurum;
  hataMesaji?: string;
};

// Görsel toplam içindir — sunucudaki parseTutar yetkilidir. "1.500", "1.500,25", "1500.25" biçimlerini tolere eder.
function tutarSayiya(s: string): number {
  const t = s.trim();
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) return parseFloat(t.replace(/\./g, "").replace(",", "."));
  if (/^\d+,\d+$/.test(t)) return parseFloat(t.replace(",", "."));
  const n = parseFloat(t);
  return Number.isNaN(n) ? 0 : n;
}

export default function YeniTalepSayfasi({ me }: { me: PortalMe }) {
  const { toast } = useToast();
  const { data: beyannameler = [] } = useQuery<Beyanname[]>({
    queryKey: ["/api/portal/beyannameler"],
  });
  const { data: masrafTurleri = [] } = useQuery<MasrafTuru[]>({
    queryKey: ["/api/portal/masraf-turleri"],
  });
  const { data: odemeSirketleri = [] } = useQuery<OdemeSirketiDetay[]>({
    queryKey: ["/api/portal/odeme-sirketleri"],
  });

  // Dosya bloğu (kalem listesi doluyken kilitli)
  const [arama, setArama] = useState("");
  const [beyannameId, setBeyannameId] = useState("");
  const [dosyaYok, setDosyaYok] = useState(false); // beyanname henüz açılmadı/yüklenmedi

  // Kalem formu
  const [odemeTipi, setOdemeTipi] = useState<"masraf" | "depo_teminat">("masraf");
  const [masrafTuru, setMasrafTuru] = useState("");
  const [tutar, setTutar] = useState("");
  const [paraBirimi, setParaBirimi] = useState("TRY");
  const [alacakli, setAlacakli] = useState("");
  const [iban, setIban] = useState("");
  const [aciklama, setAciklama] = useState("");
  const [dosyalar, setDosyalar] = useState<FileList | null>(null);
  const [konsimento, setKonsimento] = useState<KonsimentoBilgisi>({ ...BOS_KONSIMENTO });
  const [formSayac, setFormSayac] = useState(0); // dosya/konşimento input'larını sıfırlamak için remount anahtarı

  // Kalem listesi + gönderim
  const [kalemler, setKalemler] = useState<Kalem[]>([]);
  const [gonderimAktif, setGonderimAktif] = useState(false);

  const listeDolu = kalemler.length > 0;
  const bekleyenSayisi = kalemler.filter((k) => k.durum !== "gonderildi").length;
  const hataVar = kalemler.some((k) => k.durum === "hata");

  const filtreliBeyannameler = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr");
    if (!q) return beyannameler;
    return beyannameler.filter(
      (b) =>
        b.dosyaNo.toLocaleLowerCase("tr").includes(q) ||
        (b.alici ?? "").toLocaleLowerCase("tr").includes(q) ||
        (b.beyanNo ?? "").toLocaleLowerCase("tr").includes(q),
    );
  }, [beyannameler, arama]);

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

  // Para birimi bazında görsel toplamlar (tüm listelenen kalemler)
  const toplamlar = useMemo(() => {
    const t: Record<string, number> = {};
    for (const k of kalemler) t[k.paraBirimi] = (t[k.paraBirimi] ?? 0) + tutarSayiya(k.tutar);
    return t;
  }, [kalemler]);

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

  const kalemFormunuSifirla = () => {
    setMasrafTuru("");
    setTutar("");
    setAlacakli("");
    setIban("");
    setAciklama("");
    setDosyalar(null);
    setKonsimento({ ...BOS_KONSIMENTO });
    sonAlacakliOnerisi.current = null;
    sonIbanOnerisi.current = null;
    setFormSayac((s) => s + 1);
  };

  const kalemEkle = (e: React.FormEvent) => {
    e.preventDefault();
    if (gonderimAktif) return;
    if (!dosyaYok && !beyannameId) {
      toast({ title: "Beyanname seçin", description: "Dosya henüz yoksa 'Dosya yok' işaretleyin.", variant: "destructive" });
      return;
    }
    if (dosyaYok && !aciklama.trim()) {
      toast({ title: "Dosyasız talepte açıklama zorunlu", description: "Muhasebenin işi tanıyabilmesi için müşteri/iş bilgisini yazın.", variant: "destructive" });
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
    const yeni: Kalem = {
      odemeTipi,
      masrafTuru: odemeTipi === "masraf" ? masrafTuru : "Depo Teminatı",
      tutar: tutar.trim(),
      paraBirimi,
      alacakli: alacakli.trim(),
      iban: iban.trim(),
      aciklama: aciklama.trim(),
      belgeler: dosyalar ? Array.from(dosyalar) : [],
      konsimento:
        odemeTipi === "depo_teminat" && konsimento.dosya
          ? { dosya: konsimento.dosya, konsimentoNo: konsimento.konsimentoNo.trim(), tasiyici: konsimento.tasiyici.trim() }
          : null,
      durum: "bekliyor",
    };
    setKalemler((prev) => [...prev, yeni]);
    kalemFormunuSifirla();
  };

  const kalemKaldir = (i: number) => {
    if (gonderimAktif) return;
    setKalemler((prev) => {
      const kalan = prev.filter((_, idx) => idx !== i);
      // Kalanların hepsi gönderilmişse liste görevini bitirmiştir — tamamen temizle
      if (kalan.length > 0 && kalan.every((k) => k.durum === "gonderildi")) return [];
      return kalan;
    });
  };

  const kalemGonder = async (k: Kalem): Promise<void> => {
    const fd = new FormData();
    if (!dosyaYok) fd.set("beyannameId", beyannameId);
    fd.set("odemeTipi", k.odemeTipi);
    fd.set("masrafTuru", k.odemeTipi === "masraf" ? k.masrafTuru : "");
    fd.set("tutar", k.tutar);
    fd.set("paraBirimi", k.paraBirimi);
    fd.set("alacakli", k.alacakli);
    fd.set("iban", k.iban);
    fd.set("aciklama", k.aciklama);
    k.belgeler.forEach((f) => fd.append("belgeler", f));
    if (k.odemeTipi === "depo_teminat" && k.konsimento) {
      fd.set("konsimento", k.konsimento.dosya);
      fd.set("konsimentoNo", k.konsimento.konsimentoNo);
      fd.set("tasiyici", k.konsimento.tasiyici);
    }
    const res = await fetch("/api/portal/talepler", { method: "POST", body: fd, credentials: "include" });
    if (!res.ok) throw new Error((await res.json()).error || "Talep gönderilemedi");
  };

  const topluGonder = async () => {
    if (gonderimAktif || bekleyenSayisi === 0) return;
    // Eklenmemiş form koruması: formda anlamlı veri varsa sessizce gönderme
    if (tutar.trim() || alacakli.trim()) {
      toast({
        title: "Formda eklenmemiş kalem var",
        description: "Önce Ekle'ye basın ya da formu temizleyin.",
        variant: "destructive",
      });
      return;
    }
    setGonderimAktif(true);
    let gidenler = 0;
    let hatalar = 0;
    try {
      for (let i = 0; i < kalemler.length; i++) {
        if (kalemler[i].durum === "gonderildi") continue;
        setKalemler((prev) => prev.map((k, idx) => (idx === i ? { ...k, durum: "gonderiliyor", hataMesaji: undefined } : k)));
        try {
          await kalemGonder(kalemler[i]);
          gidenler++;
          setKalemler((prev) => prev.map((k, idx) => (idx === i ? { ...k, durum: "gonderildi" } : k)));
        } catch (err: any) {
          hatalar++;
          setKalemler((prev) => prev.map((k, idx) => (idx === i ? { ...k, durum: "hata", hataMesaji: err.message } : k)));
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/portal/talepler"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/odeme-sirketleri"] });
      if (hatalar === 0) {
        toast({ title: `${gidenler} talep muhasebeye gönderildi` });
        setKalemler([]);
        setBeyannameId("");
        setDosyaYok(false);
        kalemFormunuSifirla();
      } else {
        toast({
          title: `${gidenler} talep gönderildi, ${hatalar} kalem hata aldı`,
          description: "Hatalı kalemler listede kaldı — 'Kalanları Tekrar Gönder' ile yeniden deneyin.",
          variant: "destructive",
        });
      }
    } finally {
      setGonderimAktif(false);
    }
  };

  const durumEtiketi = (k: Kalem): { metin: string; sinif: string } => {
    switch (k.durum) {
      case "gonderiliyor": return { metin: "Gönderiliyor…", sinif: "text-muted-foreground" };
      case "gonderildi": return { metin: "✓ Gönderildi", sinif: "text-green-600" };
      case "hata": return { metin: `✗ ${k.hataMesaji ?? "Hata"}`, sinif: "text-destructive" };
      default: return { metin: "", sinif: "text-muted-foreground" };
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Yeni Ödeme Talebi</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={kalemEkle} className="space-y-4">
            <div className="space-y-2">
              <Label>Beyanname / Dosya</Label>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="dosya-yok"
                  checked={dosyaYok}
                  disabled={listeDolu || gonderimAktif}
                  onCheckedChange={(v) => {
                    setDosyaYok(v === true);
                    if (v === true) setBeyannameId("");
                  }}
                  data-testid="checkbox-dosya-yok"
                />
                <Label htmlFor="dosya-yok" className="font-normal text-muted-foreground">
                  Dosya yok — beyanname henüz açılmadı / sisteme yüklenmedi
                  (ödeme sonrası eşleştirmeniz istenir)
                </Label>
              </div>
              {listeDolu && (
                <p className="text-xs text-muted-foreground" data-testid="text-dosya-kilidi">
                  Dosyayı değiştirmek için önce listedeki kalemleri kaldırın.
                </p>
              )}
              {!dosyaYok && (
                <>
                  <Input
                    placeholder="Dosya no, müşteri veya beyan no ara…"
                    value={arama}
                    onChange={(e) => setArama(e.target.value)}
                    disabled={listeDolu || gonderimAktif}
                    data-testid="input-beyanname-arama"
                  />
                  <Select value={beyannameId} onValueChange={setBeyannameId} disabled={listeDolu || gonderimAktif}>
                    <SelectTrigger data-testid="select-beyanname">
                      <SelectValue placeholder="Beyanname seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      {filtreliBeyannameler.slice(0, 100).map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.dosyaNo} — {b.alici ?? "?"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
              {!dosyaYok && secili && (
                <div className="text-xs text-muted-foreground rounded-md border p-2 space-y-0.5">
                  <div><span className="font-medium">Müşteri:</span> {secili.alici ?? "—"}</div>
                  <div><span className="font-medium">Beyan No:</span> {secili.beyanNo ?? "—"}</div>
                  <div>
                    <span className="font-medium">Beyan Tarihi:</span>{" "}
                    {secili.beyanTarihi ? formatTarih(secili.beyanTarihi) : "beyan tarihi yok"}
                  </div>
                  <div><span className="font-medium">Gümrük:</span> {secili.gumrukIdaresi ?? "—"}</div>
                  <div>
                    <span className="font-medium">Fatura:</span>{" "}
                    {formatPara(secili.fatBedeli, secili.doviz)}
                  </div>
                </div>
              )}
            </div>

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
                  <SelectTrigger data-testid="select-odeme-tipi">
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
                  <MasrafTuruSecici value={masrafTuru} onChange={setMasrafTuru} testId="masraf-turu" />
                </div>
              )}
              <div className="space-y-2">
                <Label>Tutar</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="0,00"
                    value={tutar}
                    onChange={(e) => setTutar(e.target.value)}
                    data-testid="input-tutar"
                  />
                  <Select value={paraBirimi} onValueChange={setParaBirimi}>
                    <SelectTrigger className="w-24" data-testid="select-para-birimi">
                      <SelectValue />
                    </SelectTrigger>
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
              <KonsimentoAnalizAlani key={formSayac} deger={konsimento} onDegisim={konsimentoDegisti} idOnEki="talep" />
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Kime Ödenecek (Alacaklı)</Label>
                <Input
                  placeholder="Firma adı"
                  value={alacakli}
                  onChange={(e) => setAlacakli(e.target.value)}
                  list="alacakli-onerileri-talep"
                  data-testid="input-alacakli"
                />
                <datalist id="alacakli-onerileri-talep">
                  {odemeSirketleri.map((s) => (
                    <option key={s.id} value={s.ad} />
                  ))}
                </datalist>
                {benzerOneriler.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1" data-testid="benzer-firmalar-talep">
                    <span className="text-xs text-muted-foreground w-full">Benzer kayıtlı firmalar:</span>
                    {benzerOneriler.map((f, i) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => firmaSec(f)}
                        className="text-xs rounded-full border px-2 py-0.5 hover:bg-accent"
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
                  <div className="pt-1" data-testid="alan-iban-secim">
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
                  data-testid="input-iban"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Açıklama</Label>
              <Textarea
                placeholder="Ödemeyle ilgili not…"
                value={aciklama}
                onChange={(e) => setAciklama(e.target.value)}
                data-testid="input-aciklama"
              />
            </div>

            <div className="space-y-2">
              <Label>Belgeler (fatura vb. — birden fazla seçilebilir, bu kaleme bağlanır)</Label>
              <Input
                key={formSayac}
                type="file"
                multiple
                onChange={(e) => setDosyalar(e.target.files)}
                data-testid="input-belgeler"
              />
            </div>

            <Button type="submit" disabled={gonderimAktif} data-testid="button-kalem-ekle">
              Ekle
            </Button>
          </form>
        </CardContent>
      </Card>

      {listeDolu && (
        <Card>
          <CardHeader>
            <CardTitle>Eklenen Kalemler ({kalemler.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2" data-testid="list-kalemler">
              {kalemler.map((k, i) => {
                const d = durumEtiketi(k);
                return (
                  <div
                    key={i}
                    className={`flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 ${k.durum === "gonderildi" ? "opacity-60" : ""}`}
                    data-testid={`row-kalem-${i}`}
                  >
                    <div className="space-y-0.5 text-sm">
                      <div className="font-medium">
                        {k.odemeTipi === "depo_teminat" ? "Depo Teminatı" : k.masrafTuru}
                        {" — "}
                        {k.alacakli}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatPara(k.tutar, k.paraBirimi)}
                        {k.belgeler.length > 0 && ` · ${k.belgeler.length} belge`}
                        {k.konsimento && ` · Konşimento: ${k.konsimento.konsimentoNo}`}
                      </div>
                      {d.metin && (
                        <div className={`text-xs ${d.sinif}`} data-testid={`text-kalem-durum-${i}`}>{d.metin}</div>
                      )}
                    </div>
                    {k.durum !== "gonderildi" && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={gonderimAktif}
                        onClick={() => kalemKaldir(i)}
                        data-testid={`button-kalem-kaldir-${i}`}
                      >
                        Kaldır
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
              <div className="text-sm text-muted-foreground" data-testid="text-kalem-toplamlar">
                {kalemler.length} kalem —{" "}
                {Object.entries(toplamlar)
                  .map(([pb, top]) => `${top.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${pb}`)
                  .join(" + ")}
              </div>
              <Button
                type="button"
                disabled={gonderimAktif || bekleyenSayisi === 0}
                onClick={topluGonder}
                data-testid="button-toplu-gonder"
              >
                {gonderimAktif
                  ? "Gönderiliyor…"
                  : hataVar
                    ? "Kalanları Tekrar Gönder"
                    : "Tümünü Muhasebeye Gönder"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

import { useMemo, useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import type { Beyanname, MasrafTuru } from "@shared/schema";
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
import { formatTarih, formatPara } from "./portalUtils";
import KonsimentoAnalizAlani, { type KonsimentoBilgisi, BOS_KONSIMENTO } from "./KonsimentoAnalizAlani";

export default function YeniTalepSayfasi({ me }: { me: PortalMe }) {
  const { toast } = useToast();
  const { data: beyannameler = [] } = useQuery<Beyanname[]>({
    queryKey: ["/api/portal/beyannameler"],
  });
  const { data: masrafTurleri = [] } = useQuery<MasrafTuru[]>({
    queryKey: ["/api/portal/masraf-turleri"],
  });

  // Form durumu
  const [arama, setArama] = useState("");
  const [beyannameId, setBeyannameId] = useState("");
  const [dosyaYok, setDosyaYok] = useState(false); // beyanname henüz açılmadı/yüklenmedi
  const [odemeTipi, setOdemeTipi] = useState<"masraf" | "depo_teminat">("masraf");
  const [masrafTuru, setMasrafTuru] = useState("");
  const [tutar, setTutar] = useState("");
  const [paraBirimi, setParaBirimi] = useState("TRY");
  const [alacakli, setAlacakli] = useState("");
  const [iban, setIban] = useState("");
  const [aciklama, setAciklama] = useState("");
  const [dosyalar, setDosyalar] = useState<FileList | null>(null);
  const [konsimento, setKonsimento] = useState<KonsimentoBilgisi>({ ...BOS_KONSIMENTO });
  const [formSayac, setFormSayac] = useState(0); // dosya input'unu sıfırlamak için remount anahtarı
  const [gonderiliyor, setGonderiliyor] = useState(false);

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

  // Son GEÇERLİ öneriyi ref'te izle: dosya değişimindeki ara null-öneri çağrısı
  // izi silmesin — yoksa yeni öneri "elle yazılmış" sanılıp eski acente ekranda kalır.
  const sonAlacakliOnerisi = useRef<string | null>(null);
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
      if (dosyalar) Array.from(dosyalar).forEach((f) => fd.append("belgeler", f));
      if (odemeTipi === "depo_teminat" && konsimento.dosya) {
        fd.set("konsimento", konsimento.dosya);
        fd.set("konsimentoNo", konsimento.konsimentoNo.trim());
        fd.set("tasiyici", konsimento.tasiyici.trim());
      }
      const res = await fetch("/api/portal/talepler", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Talep gönderilemedi");
      toast({ title: "Talep gönderildi", description: "Muhasebe listesine düştü." });
      setBeyannameId("");
      setDosyaYok(false);
      setMasrafTuru("");
      setTutar("");
      setAlacakli("");
      setIban("");
      setAciklama("");
      setDosyalar(null);
      setKonsimento({ ...BOS_KONSIMENTO });
      sonAlacakliOnerisi.current = null;
      setFormSayac((s) => s + 1);
      queryClient.invalidateQueries({ queryKey: ["/api/portal/talepler"] });
    } catch (err: any) {
      toast({ title: "Hata", description: err.message, variant: "destructive" });
    } finally {
      setGonderiliyor(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Yeni Ödeme Talebi</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={gonder} className="space-y-4">
            <div className="space-y-2">
              <Label>Beyanname / Dosya</Label>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="dosya-yok"
                  checked={dosyaYok}
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
              {!dosyaYok && (
                <>
              <Input
                placeholder="Dosya no, müşteri veya beyan no ara…"
                value={arama}
                onChange={(e) => setArama(e.target.value)}
                data-testid="input-beyanname-arama"
              />
              <Select value={beyannameId} onValueChange={setBeyannameId}>
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
                  onValueChange={(v) => setOdemeTipi(v as "masraf" | "depo_teminat")}
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
                  <Select value={masrafTuru} onValueChange={setMasrafTuru}>
                    <SelectTrigger data-testid="select-masraf-turu">
                      <SelectValue placeholder="Seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      {masrafTurleri.map((t) => (
                        <SelectItem key={t.id} value={t.ad}>{t.ad}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                  data-testid="input-alacakli"
                />
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
              <Label>Belgeler (fatura vb. — birden fazla seçilebilir)</Label>
              <Input
                key={formSayac}
                type="file"
                multiple
                onChange={(e) => setDosyalar(e.target.files)}
                data-testid="input-belgeler"
              />
            </div>

            <Button type="submit" disabled={gonderiliyor} data-testid="button-talep-gonder">
              {gonderiliyor ? "Gönderiliyor…" : "Talebi Gönder"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

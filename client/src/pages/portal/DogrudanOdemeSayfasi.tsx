import { useMemo, useState } from "react";
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
import { formatTarih, formatPara } from "./portalUtils";
import KonsimentoAnalizAlani, { type KonsimentoBilgisi, BOS_KONSIMENTO } from "./KonsimentoAnalizAlani";

// Muhasebenin talepsiz ödeme girişi — tek adımda "Ödendi" kaydı oluşur (dekont zorunlu).
export default function DogrudanOdemeSayfasi() {
  const { toast } = useToast();
  const { data: beyannameler = [] } = useQuery<Beyanname[]>({
    queryKey: ["/api/portal/beyannameler"], // muhasebe: tüm liste
  });
  const { data: masrafTurleri = [] } = useQuery<MasrafTuru[]>({
    queryKey: ["/api/portal/masraf-turleri"],
  });

  const [arama, setArama] = useState("");
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

  const konsimentoDegisti = (b: KonsimentoBilgisi) => {
    // Öneri yeni geldiyse ve alacaklı boşsa/önceki öneriyse otomatik doldur (elle yazılmışsa ezme)
    if (b.alacakliOnerisi && b.alacakliOnerisi !== konsimento.alacakliOnerisi) {
      if (!alacakli.trim() || alacakli === konsimento.alacakliOnerisi) {
        setAlacakli(b.alacakliOnerisi);
      }
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
      setFormSayac((s) => s + 1);
      queryClient.invalidateQueries({ queryKey: ["/api/portal/talepler"] });
    } catch (err: any) {
      toast({ title: "Hata", description: err.message, variant: "destructive" });
    } finally {
      setGonderiliyor(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Doğrudan Ödeme Girişi</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={gonder} className="space-y-4">
          <div className="space-y-2">
            <Label>Beyanname / Dosya</Label>
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
              <>
                <Input
                  placeholder="Dosya no, müşteri veya beyan no ara…"
                  value={arama}
                  onChange={(e) => setArama(e.target.value)}
                  data-testid="input-dogrudan-arama"
                />
                <Select value={beyannameId} onValueChange={setBeyannameId}>
                  <SelectTrigger data-testid="select-dogrudan-beyanname">
                    <SelectValue placeholder="Beyanname seçin (tüm liste)" />
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
                <Select value={masrafTuru} onValueChange={setMasrafTuru}>
                  <SelectTrigger data-testid="select-dogrudan-masraf-turu">
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Kime Ödendi (Alacaklı)</Label>
              <Input
                placeholder="Firma adı"
                value={alacakli}
                onChange={(e) => setAlacakli(e.target.value)}
                data-testid="input-dogrudan-alacakli"
              />
            </div>
            <div className="space-y-2">
              <Label>IBAN (varsa)</Label>
              <Input placeholder="TR.." value={iban} onChange={(e) => setIban(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Açıklama</Label>
            <Textarea
              placeholder="Ödemeyle ilgili not…"
              value={aciklama}
              onChange={(e) => setAciklama(e.target.value)}
              data-testid="input-dogrudan-aciklama"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Dekont (zorunlu)</Label>
              <Input
                key={`dekont-${formSayac}`}
                type="file"
                onChange={(e) => setDekont(e.target.files?.[0] ?? null)}
                data-testid="input-dogrudan-dekont"
              />
            </div>
          </div>

          <Button type="submit" disabled={gonderiliyor} data-testid="button-dogrudan-kaydet">
            {gonderiliyor ? "Kaydediliyor…" : "Ödemeyi Kaydet"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

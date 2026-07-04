import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import type { Beyanname, MasrafTuru } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { type PortalMe } from "./PortalApp";
import {
  type TalepDetay, formatTarih, formatPara,
  TIP_ETIKET, DURUM_ETIKET, IADE_ETIKET, BELGE_ETIKET, belgeUrl,
} from "./portalUtils";

// Ödenmiş ama beyannamesiz talepler — temsilciden eşleştirme istenir
function EslesmeBekleyenler({
  talepler, beyannameler,
}: { talepler: TalepDetay[]; beyannameler: Beyanname[] }) {
  const { toast } = useToast();
  const [secimler, setSecimler] = useState<Record<string, string>>({});
  const [aramalar, setAramalar] = useState<Record<string, string>>({});
  const [gonderilen, setGonderilen] = useState<string | null>(null);

  const bekleyenler = talepler.filter((t) => !t.beyannameId && t.durum === "odendi");
  if (!bekleyenler.length) return null;

  const eslestir = async (talepId: string) => {
    const beyannameId = secimler[talepId];
    if (!beyannameId) {
      toast({ title: "Beyanname seçin", variant: "destructive" });
      return;
    }
    setGonderilen(talepId);
    try {
      const res = await fetch(`/api/portal/talepler/${talepId}/beyanname`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ beyannameId }),
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Eşleştirme yapılamadı");
      toast({ title: "Eşleştirildi" });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/talepler"] });
    } catch (e: any) {
      toast({ title: "Hata", description: e.message, variant: "destructive" });
    } finally {
      setGonderilen(null);
    }
  };

  return (
    <Card className="border-amber-300">
      <CardHeader>
        <CardTitle className="text-amber-700">
          Eşleşme Bekleyen Ödemeler ({bekleyenler.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Bu ödemeler dosyasız gönderilmişti ve ödendi. Lütfen ait oldukları beyannameyle
          eşleştirin.
        </p>
        {bekleyenler.map((t) => {
          const q = (aramalar[t.id] ?? "").trim().toLocaleLowerCase("tr");
          const filtreli = q
            ? beyannameler.filter(
                (b) =>
                  b.dosyaNo.toLocaleLowerCase("tr").includes(q) ||
                  (b.alici ?? "").toLocaleLowerCase("tr").includes(q),
              )
            : beyannameler;
          return (
            <div
              key={t.id}
              className="rounded-md border p-3 space-y-2"
              data-testid={`row-eslesmeyen-${t.id}`}
            >
              <div className="text-sm">
                {formatTarih(t.talepTarihi)} — {formatPara(t.tutar, t.paraBirimi)} — {t.alacakli}
                {t.aciklama && <span className="text-muted-foreground"> — {t.aciklama}</span>}
              </div>
              <div className="flex flex-col md:flex-row gap-2">
                <Input
                  placeholder="Beyanname ara…"
                  value={aramalar[t.id] ?? ""}
                  onChange={(e) => setAramalar((s) => ({ ...s, [t.id]: e.target.value }))}
                  className="md:max-w-56"
                />
                <Select
                  value={secimler[t.id] ?? ""}
                  onValueChange={(v) => setSecimler((s) => ({ ...s, [t.id]: v }))}
                >
                  <SelectTrigger className="md:max-w-md">
                    <SelectValue placeholder="Beyanname seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    {filtreli.slice(0, 100).map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.dosyaNo} — {b.alici ?? "?"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  onClick={() => eslestir(t.id)}
                  disabled={gonderilen === t.id}
                  data-testid={`button-eslestir-${t.id}`}
                >
                  {gonderilen === t.id ? "Eşleştiriliyor…" : "Eşleştir"}
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export default function TemsilciPanel({ me }: { me: PortalMe }) {
  const { toast } = useToast();
  const { data: beyannameler = [] } = useQuery<Beyanname[]>({
    queryKey: ["/api/portal/beyannameler"],
  });
  const { data: masrafTurleri = [] } = useQuery<MasrafTuru[]>({
    queryKey: ["/api/portal/masraf-turleri"],
  });
  const { data: talepler = [] } = useQuery<TalepDetay[]>({
    queryKey: ["/api/portal/talepler"],
    refetchInterval: 30000, // muhasebe "Ödendi" yapınca 30 sn içinde görünür
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

      <EslesmeBekleyenler talepler={talepler} beyannameler={beyannameler} />

      <Card>
        <CardHeader>
          <CardTitle>Taleplerim</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tarih</TableHead>
                <TableHead>Dosya No</TableHead>
                <TableHead>Müşteri</TableHead>
                <TableHead>Tür</TableHead>
                <TableHead>Tutar</TableHead>
                <TableHead>Alacaklı</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead>Belgeler</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {talepler.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    Henüz talep yok
                  </TableCell>
                </TableRow>
              )}
              {talepler.map((t) => (
                <TableRow key={t.id} data-testid={`row-talep-${t.id}`}>
                  <TableCell>{formatTarih(t.talepTarihi)}</TableCell>
                  <TableCell>
                    {t.beyanname?.dosyaNo ?? <Badge variant="outline">Dosyasız</Badge>}
                  </TableCell>
                  <TableCell className="max-w-48 truncate">{t.beyanname?.alici ?? "—"}</TableCell>
                  <TableCell>
                    {TIP_ETIKET[t.odemeTipi] ?? t.odemeTipi}
                    {t.odemeTipi === "masraf" ? ` / ${t.masrafTuru}` : ""}
                  </TableCell>
                  <TableCell>{formatPara(t.tutar, t.paraBirimi)}</TableCell>
                  <TableCell className="max-w-40 truncate">{t.alacakli}</TableCell>
                  <TableCell>
                    <Badge variant={t.durum === "odendi" ? "default" : "secondary"}>
                      {DURUM_ETIKET[t.durum] ?? t.durum}
                    </Badge>
                    {t.odemeTipi === "depo_teminat" && t.iadeDurumu && (
                      <Badge variant="outline" className="ml-1">
                        {IADE_ETIKET[t.iadeDurumu] ?? t.iadeDurumu}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      {t.belgeler.map((b) => (
                        <a
                          key={b.id}
                          href={belgeUrl(b)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary underline"
                        >
                          {BELGE_ETIKET[b.belgeTipi] ?? b.belgeTipi}: {b.filename}
                        </a>
                      ))}
                      {t.belgeler.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

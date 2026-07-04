import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  type TalepDetay, formatTarih, formatPara, gunFarki,
  TIP_ETIKET, DURUM_ETIKET, IADE_ETIKET, BELGE_ETIKET, belgeUrl,
} from "./portalUtils";

function BelgeLinkleri({ talep }: { talep: TalepDetay }) {
  if (!talep.belgeler.length) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex flex-col gap-0.5">
      {talep.belgeler.map((b) => (
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
    </div>
  );
}

function OdemeDialog({
  talep, kapat,
}: { talep: TalepDetay | null; kapat: () => void }) {
  const { toast } = useToast();
  const [dekont, setDekont] = useState<File | null>(null);
  const [konsimento, setKonsimento] = useState<File | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);

  const odemeYap = async () => {
    if (!talep) return;
    if (!dekont) {
      toast({ title: "Dekont dosyası zorunlu", variant: "destructive" });
      return;
    }
    setGonderiliyor(true);
    try {
      const fd = new FormData();
      fd.set("dekont", dekont);
      if (konsimento) fd.set("konsimento", konsimento);
      const res = await fetch(`/api/portal/talepler/${talep.id}/odeme`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Ödeme kaydedilemedi");
      toast({ title: "Ödendi olarak işaretlendi" });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/talepler"] });
      kapat();
    } catch (e: any) {
      toast({ title: "Hata", description: e.message, variant: "destructive" });
    } finally {
      setGonderiliyor(false);
    }
  };

  return (
    <Dialog open={!!talep} onOpenChange={(a) => !a && kapat()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ödemeyi Kaydet</DialogTitle>
        </DialogHeader>
        {talep && (
          <div className="space-y-4">
            <div className="text-sm rounded-md border p-3 space-y-1">
              <div><span className="font-medium">Dosya:</span> {talep.beyanname?.dosyaNo ?? "—"} — {talep.beyanname?.alici ?? "—"}</div>
              <div><span className="font-medium">Talep Eden:</span> {talep.talepEdenAd}</div>
              <div><span className="font-medium">Tür:</span> {TIP_ETIKET[talep.odemeTipi] ?? talep.odemeTipi} / {talep.masrafTuru}</div>
              <div><span className="font-medium">Tutar:</span> {formatPara(talep.tutar, talep.paraBirimi)}</div>
              <div><span className="font-medium">Alacaklı:</span> {talep.alacakli}{talep.iban ? ` — ${talep.iban}` : ""}</div>
              {talep.aciklama && <div><span className="font-medium">Açıklama:</span> {talep.aciklama}</div>}
              <div className="pt-1"><BelgeLinkleri talep={talep} /></div>
            </div>
            <div className="space-y-2">
              <Label>Dekont (zorunlu)</Label>
              <Input
                type="file"
                onChange={(e) => setDekont(e.target.files?.[0] ?? null)}
                data-testid="input-dekont"
              />
            </div>
            {talep.odemeTipi === "depo_teminat" && (
              <div className="space-y-2">
                <Label>Konşimento Örneği</Label>
                <Input
                  type="file"
                  onChange={(e) => setKonsimento(e.target.files?.[0] ?? null)}
                  data-testid="input-konsimento"
                />
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={kapat}>Vazgeç</Button>
          <Button onClick={odemeYap} disabled={gonderiliyor} data-testid="button-odeme-kaydet">
            {gonderiliyor ? "Kaydediliyor…" : "Ödendi Olarak Kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IadeDialog({
  talep, kapat,
}: { talep: TalepDetay | null; kapat: () => void }) {
  const { toast } = useToast();
  const [iadeDurumu, setIadeDurumu] = useState("iade_edildi");
  const [iadeTutari, setIadeTutari] = useState(talep?.iadeTutari ?? "");
  const [iadeTarihi, setIadeTarihi] = useState(talep?.iadeTarihi ?? "");
  const [iadeNotu, setIadeNotu] = useState(talep?.iadeNotu ?? "");
  const [gonderiliyor, setGonderiliyor] = useState(false);

  const kaydet = async () => {
    if (!talep) return;
    setGonderiliyor(true);
    try {
      const res = await fetch(`/api/portal/talepler/${talep.id}/iade`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          iadeDurumu,
          iadeTutari: iadeTutari.trim() ? iadeTutari.replace(",", ".") : null,
          iadeTarihi: iadeTarihi || null,
          iadeNotu: iadeNotu.trim() || null,
        }),
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error || "İade kaydedilemedi");
      toast({ title: "İade kaydı güncellendi" });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/talepler"] });
      kapat();
    } catch (e: any) {
      toast({ title: "Hata", description: e.message, variant: "destructive" });
    } finally {
      setGonderiliyor(false);
    }
  };

  return (
    <Dialog open={!!talep} onOpenChange={(a) => !a && kapat()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>İade Kaydı</DialogTitle>
        </DialogHeader>
        {talep && (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              {talep.beyanname?.dosyaNo ?? "—"} — {formatPara(talep.tutar, talep.paraBirimi)} — {talep.alacakli}
            </div>
            <div className="space-y-2">
              <Label>İade Durumu</Label>
              <Select value={iadeDurumu} onValueChange={setIadeDurumu}>
                <SelectTrigger data-testid="select-iade-durumu">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="beklemede">İade Bekleniyor</SelectItem>
                  <SelectItem value="iade_edildi">İade Alındı</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>İade Tutarı (kesinti varsa farklı olabilir)</Label>
                <Input
                  placeholder="0,00"
                  value={iadeTutari}
                  onChange={(e) => setIadeTutari(e.target.value)}
                  data-testid="input-iade-tutari"
                />
              </div>
              <div className="space-y-2">
                <Label>İade Tarihi</Label>
                <Input
                  type="date"
                  value={iadeTarihi}
                  onChange={(e) => setIadeTarihi(e.target.value)}
                  data-testid="input-iade-tarihi"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Not (örn. demuraj kesintisi)</Label>
              <Textarea
                value={iadeNotu}
                onChange={(e) => setIadeNotu(e.target.value)}
                data-testid="input-iade-notu"
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={kapat}>Vazgeç</Button>
          <Button onClick={kaydet} disabled={gonderiliyor} data-testid="button-iade-kaydet">
            {gonderiliyor ? "Kaydediliyor…" : "Kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function MuhasebePanel() {
  const { data: talepler = [] } = useQuery<TalepDetay[]>({
    queryKey: ["/api/portal/talepler"],
    refetchInterval: 30000, // yeni talepler 30 sn içinde düşer
  });
  const [odemeTalebi, setOdemeTalebi] = useState<TalepDetay | null>(null);
  const [iadeTalebi, setIadeTalebi] = useState<TalepDetay | null>(null);

  const bekleyenSayisi = talepler.filter((t) => t.durum === "bekliyor").length;
  const depoTalepleri = talepler.filter((t) => t.odemeTipi === "depo_teminat");
  const acikIadeSayisi = depoTalepleri.filter(
    (t) => t.durum === "odendi" && t.iadeDurumu === "beklemede",
  ).length;

  return (
    <Tabs defaultValue="gelen">
      <TabsList>
        <TabsTrigger value="gelen" data-testid="tab-gelen-talepler">
          Gelen Talepler
          {bekleyenSayisi > 0 && <Badge className="ml-2">{bekleyenSayisi}</Badge>}
        </TabsTrigger>
        <TabsTrigger value="depo" data-testid="tab-depo-odemeleri">
          Depo Ödemeleri
          {acikIadeSayisi > 0 && <Badge variant="secondary" className="ml-2">{acikIadeSayisi}</Badge>}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="gelen">
        <Card>
          <CardHeader>
            <CardTitle>Tüm Temsilcilerin Talepleri</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tarih</TableHead>
                  <TableHead>Temsilci</TableHead>
                  <TableHead>Dosya No</TableHead>
                  <TableHead>Müşteri</TableHead>
                  <TableHead>Tür</TableHead>
                  <TableHead>Tutar</TableHead>
                  <TableHead>Alacaklı</TableHead>
                  <TableHead>Belgeler</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {talepler.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground">
                      Talep yok
                    </TableCell>
                  </TableRow>
                )}
                {talepler.map((t) => (
                  <TableRow key={t.id} data-testid={`row-muhasebe-talep-${t.id}`}>
                    <TableCell>{formatTarih(t.talepTarihi)}</TableCell>
                    <TableCell>{t.talepEdenAd}</TableCell>
                    <TableCell>
                      {t.beyanname?.dosyaNo ?? <Badge variant="outline">Dosyasız</Badge>}
                    </TableCell>
                    <TableCell className="max-w-44 truncate">{t.beyanname?.alici ?? "—"}</TableCell>
                    <TableCell>
                      {TIP_ETIKET[t.odemeTipi] ?? t.odemeTipi}
                      {t.odemeTipi === "masraf" ? ` / ${t.masrafTuru}` : ""}
                    </TableCell>
                    <TableCell>{formatPara(t.tutar, t.paraBirimi)}</TableCell>
                    <TableCell className="max-w-36 truncate">
                      {t.alacakli}
                      {t.iban && <div className="text-xs text-muted-foreground">{t.iban}</div>}
                    </TableCell>
                    <TableCell><BelgeLinkleri talep={t} /></TableCell>
                    <TableCell>
                      <Badge variant={t.durum === "odendi" ? "default" : "secondary"}>
                        {DURUM_ETIKET[t.durum] ?? t.durum}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {t.durum === "bekliyor" && (
                        <Button
                          size="sm"
                          onClick={() => setOdemeTalebi(t)}
                          data-testid={`button-ode-${t.id}`}
                        >
                          Öde
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="depo">
        <Card>
          <CardHeader>
            <CardTitle>Depo Teminatları — İade Takibi</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dosya No</TableHead>
                  <TableHead>Müşteri</TableHead>
                  <TableHead>Temsilci</TableHead>
                  <TableHead>Tutar</TableHead>
                  <TableHead>Ödeme Tarihi</TableHead>
                  <TableHead>Kaç Gündür Açık</TableHead>
                  <TableHead>İade Durumu</TableHead>
                  <TableHead>İade Tutarı</TableHead>
                  <TableHead>Belgeler</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {depoTalepleri.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground">
                      Depo teminatı kaydı yok
                    </TableCell>
                  </TableRow>
                )}
                {depoTalepleri.map((t) => {
                  const acikGun =
                    t.durum === "odendi" && t.iadeDurumu === "beklemede"
                      ? gunFarki(t.odemeTarihi)
                      : null;
                  return (
                    <TableRow key={t.id} data-testid={`row-depo-${t.id}`}>
                      <TableCell>
                        {t.beyanname?.dosyaNo ?? <Badge variant="outline">Dosyasız</Badge>}
                      </TableCell>
                      <TableCell className="max-w-44 truncate">{t.beyanname?.alici ?? "—"}</TableCell>
                      <TableCell>{t.talepEdenAd}</TableCell>
                      <TableCell>{formatPara(t.tutar, t.paraBirimi)}</TableCell>
                      <TableCell>{formatTarih(t.odemeTarihi)}</TableCell>
                      <TableCell>
                        {acikGun == null ? "—" : (
                          <span className={acikGun > 30 ? "text-red-600 font-medium" : ""}>
                            {acikGun} gün
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {t.durum !== "odendi" ? (
                          <Badge variant="secondary">Ödeme Bekliyor</Badge>
                        ) : (
                          <Badge variant={t.iadeDurumu === "iade_edildi" ? "default" : "outline"}>
                            {IADE_ETIKET[t.iadeDurumu ?? ""] ?? "—"}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {t.iadeTutari ? formatPara(t.iadeTutari, t.paraBirimi) : "—"}
                        {t.iadeNotu && (
                          <div className="text-xs text-muted-foreground max-w-36 truncate">
                            {t.iadeNotu}
                          </div>
                        )}
                      </TableCell>
                      <TableCell><BelgeLinkleri talep={t} /></TableCell>
                      <TableCell>
                        {t.durum === "odendi" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setIadeTalebi(t)}
                            data-testid={`button-iade-${t.id}`}
                          >
                            İade Kaydı
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      <OdemeDialog
        key={odemeTalebi?.id ?? "odeme-kapali"}
        talep={odemeTalebi}
        kapat={() => setOdemeTalebi(null)}
      />
      <IadeDialog
        key={iadeTalebi?.id ?? "iade-kapali"}
        talep={iadeTalebi}
        kapat={() => setIadeTalebi(null)}
      />
    </Tabs>
  );
}

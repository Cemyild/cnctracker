import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { subeler, type MasrafTuru, type PortalKullanici } from "@shared/schema";
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
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  type TalepDetay, formatTarih, formatPara,
  TIP_ETIKET, DURUM_ETIKET, IADE_ETIKET, BELGE_ETIKET, belgeUrl,
} from "@/pages/portal/portalUtils";
import { OtomatikYuklemeRozeti } from "@/components/OtomatikYuklemeRozeti";

type Ozet = {
  talepler: TalepDetay[];
  eslesmeyen: { kullanici: string; adet: number }[];
};

type KullaniciGoruntu = Omit<PortalKullanici, "sifreHash">;

type ExcelSonuc = {
  toplam: number;
  eklenen: number;
  guncellenen: number;
  eslesmeyen: { kullanici: string; adet: number }[];
};

function ExcelYukleme() {
  const { toast } = useToast();
  const [dosya, setDosya] = useState<File | null>(null);
  const [sonuc, setSonuc] = useState<ExcelSonuc | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [inputSayac, setInputSayac] = useState(0);

  const yukle = async () => {
    if (!dosya) {
      toast({ title: "Dosya seçin", variant: "destructive" });
      return;
    }
    setYukleniyor(true);
    try {
      const fd = new FormData();
      fd.set("dosya", dosya);
      const res = await fetch("/api/odemeler/beyanname-excel", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const veri = await res.json();
      if (!res.ok) throw new Error(veri.error || "Yükleme başarısız");
      setSonuc(veri);
      setDosya(null);
      setInputSayac((s) => s + 1);
      toast({
        title: "Beyanname listesi güncellendi",
        description: `${veri.toplam} satır: ${veri.eklenen} yeni, ${veri.guncellenen} güncellendi`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/odemeler/ozet"] });
    } catch (e: any) {
      toast({ title: "Hata", description: e.message, variant: "destructive" });
    } finally {
      setYukleniyor(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Beyanname Excel Yükleme</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Input
            key={inputSayac}
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setDosya(e.target.files?.[0] ?? null)}
            className="max-w-sm"
            data-testid="input-beyanname-excel"
          />
          <Button onClick={yukle} disabled={yukleniyor} data-testid="button-beyanname-yukle">
            {yukleniyor ? "Yükleniyor…" : "Yükle"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          "İthalat Raporu" sayfası okunur; satırlar DOSYA NO üzerinden güncellenir/eklenir.
          Başlıklar uyuşmazsa yükleme reddedilir.
        </p>
        {sonuc && (
          <div className="text-sm rounded-md border p-3 space-y-1">
            <div>Toplam: <b>{sonuc.toplam}</b> — Yeni: <b>{sonuc.eklenen}</b> — Güncellenen: <b>{sonuc.guncellenen}</b></div>
            {sonuc.eslesmeyen.length > 0 && (
              <div className="text-amber-600">
                Eşleşmeyen kullanıcılar:{" "}
                {sonuc.eslesmeyen.map((e) => `${e.kullanici} (${e.adet})`).join(", ")}
                {" "}— bu temsilciler beyannamelerini göremez; Kullanıcılar sekmesinden AV adı atayın.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function KullaniciFormDialog({
  duzenlenen, kapat,
}: { duzenlenen: KullaniciGoruntu | "yeni" | null; kapat: () => void }) {
  const { toast } = useToast();
  const yeniMi = duzenlenen === "yeni";
  const k = yeniMi || !duzenlenen ? null : duzenlenen;
  const [kullaniciAdi, setKullaniciAdi] = useState(k?.kullaniciAdi ?? "");
  const [adSoyad, setAdSoyad] = useState(k?.adSoyad ?? "");
  const [rol, setRol] = useState(k?.rol ?? "temsilci");
  const [avAdi, setAvAdi] = useState(k?.avAdi ?? "");
  const [sube, setSube] = useState(k?.sube ?? "");
  const [sifre, setSifre] = useState("");
  const [gonderiliyor, setGonderiliyor] = useState(false);

  const kaydet = async () => {
    if (rol === "operasyon" && !sube.trim()) {
      toast({ title: "Operasyon kullanıcısı için şube seçin", variant: "destructive" });
      return;
    }
    setGonderiliyor(true);
    try {
      if (yeniMi) {
        const res = await fetch("/api/odemeler/kullanicilar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kullaniciAdi: kullaniciAdi.trim(),
            adSoyad: adSoyad.trim(),
            rol,
            avAdi: avAdi.trim() || null,
            sube: rol === "operasyon" ? sube : null,
            sifre,
          }),
          credentials: "include",
        });
        if (!res.ok) throw new Error((await res.json()).error || "Kaydedilemedi");
      } else if (k) {
        const res = await fetch(`/api/odemeler/kullanicilar/${k.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            adSoyad: adSoyad.trim(),
            rol,
            avAdi: avAdi.trim() || null,
            sube: rol === "operasyon" ? sube : null,
            ...(sifre ? { sifre } : {}),
          }),
          credentials: "include",
        });
        if (!res.ok) throw new Error((await res.json()).error || "Kaydedilemedi");
      }
      toast({ title: yeniMi ? "Kullanıcı oluşturuldu" : "Kullanıcı güncellendi" });
      queryClient.invalidateQueries({ queryKey: ["/api/odemeler/kullanicilar"] });
      kapat();
    } catch (e: any) {
      toast({ title: "Hata", description: e.message, variant: "destructive" });
    } finally {
      setGonderiliyor(false);
    }
  };

  return (
    <Dialog open={duzenlenen !== null} onOpenChange={(a) => !a && kapat()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{yeniMi ? "Yeni Kullanıcı" : "Kullanıcı Düzenle"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {yeniMi && (
            <div className="space-y-2">
              <Label>Kullanıcı Adı</Label>
              <Input
                value={kullaniciAdi}
                onChange={(e) => setKullaniciAdi(e.target.value)}
                data-testid="input-yeni-kullanici-adi"
              />
            </div>
          )}
          <div className="space-y-2">
            <Label>Ad Soyad</Label>
            <Input value={adSoyad} onChange={(e) => setAdSoyad(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Rol</Label>
              <Select value={rol} onValueChange={setRol}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="temsilci">Müşteri Temsilcisi</SelectItem>
                  <SelectItem value="muhasebe">Muhasebe</SelectItem>
                  <SelectItem value="operasyon">Operasyon</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>AV Adı (Excel eşleşmesi)</Label>
              <Input
                placeholder="örn. SÜLEYMAN"
                value={avAdi}
                onChange={(e) => setAvAdi(e.target.value)}
              />
            </div>
          </div>
          {rol === "operasyon" && (
            <div className="space-y-2">
              <Label>Şube</Label>
              <Select value={sube} onValueChange={setSube}>
                <SelectTrigger data-testid="select-kullanici-sube"><SelectValue placeholder="Şube seçin" /></SelectTrigger>
                <SelectContent>
                  {subeler.map((s) => (
                    <SelectItem key={s} value={s} data-testid={`select-item-sube-${s}`}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label>{yeniMi ? "Şifre" : "Yeni Şifre (boşsa değişmez)"}</Label>
            <Input type="password" value={sifre} onChange={(e) => setSifre(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={kapat}>Vazgeç</Button>
          <Button onClick={kaydet} disabled={gonderiliyor} data-testid="button-kullanici-kaydet">
            {gonderiliyor ? "Kaydediliyor…" : "Kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Kullanicilar() {
  const { toast } = useToast();
  const { data: kullanicilar = [] } = useQuery<KullaniciGoruntu[]>({
    queryKey: ["/api/odemeler/kullanicilar"],
  });
  const [duzenlenen, setDuzenlenen] = useState<KullaniciGoruntu | "yeni" | null>(null);

  const aktifDegistir = async (k: KullaniciGoruntu, aktif: boolean) => {
    try {
      const res = await fetch(`/api/odemeler/kullanicilar/${k.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aktif }),
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Güncellenemedi");
      queryClient.invalidateQueries({ queryKey: ["/api/odemeler/kullanicilar"] });
    } catch (e: any) {
      toast({ title: "Hata", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Portal Kullanıcıları</CardTitle>
        <Button size="sm" onClick={() => setDuzenlenen("yeni")} data-testid="button-yeni-kullanici">
          Yeni Kullanıcı
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kullanıcı Adı</TableHead>
              <TableHead>Ad Soyad</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>AV Adı</TableHead>
              <TableHead>Şube</TableHead>
              <TableHead>Aktif</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {kullanicilar.map((k) => (
              <TableRow key={k.id} data-testid={`row-kullanici-${k.id}`}>
                <TableCell>{k.kullaniciAdi}</TableCell>
                <TableCell>{k.adSoyad}</TableCell>
                <TableCell>{k.rol === "muhasebe" ? "Muhasebe" : k.rol === "operasyon" ? "Operasyon" : "Temsilci"}</TableCell>
                <TableCell>{k.avAdi ?? "—"}</TableCell>
                <TableCell>{k.sube ?? "—"}</TableCell>
                <TableCell>
                  <Switch
                    checked={k.aktif}
                    onCheckedChange={(a) => aktifDegistir(k, a)}
                    data-testid={`switch-aktif-${k.id}`}
                  />
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" onClick={() => setDuzenlenen(k)}>
                    Düzenle
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <KullaniciFormDialog
        key={duzenlenen === "yeni" ? "yeni" : duzenlenen?.id ?? "kapali"}
        duzenlenen={duzenlenen}
        kapat={() => setDuzenlenen(null)}
      />
    </Card>
  );
}

function MasrafTurleri() {
  const { toast } = useToast();
  const { data: turler = [] } = useQuery<MasrafTuru[]>({
    queryKey: ["/api/odemeler/masraf-turleri"],
  });
  const [yeniAd, setYeniAd] = useState("");

  const ekle = async () => {
    if (!yeniAd.trim()) return;
    try {
      const res = await fetch("/api/odemeler/masraf-turleri", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ad: yeniAd.trim(), sira: turler.length }),
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Eklenemedi");
      setYeniAd("");
      queryClient.invalidateQueries({ queryKey: ["/api/odemeler/masraf-turleri"] });
    } catch (e: any) {
      toast({ title: "Hata", description: e.message, variant: "destructive" });
    }
  };

  const aktifDegistir = async (t: MasrafTuru, aktif: boolean) => {
    try {
      const res = await fetch(`/api/odemeler/masraf-turleri/${t.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aktif }),
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Güncellenemedi");
      queryClient.invalidateQueries({ queryKey: ["/api/odemeler/masraf-turleri"] });
    } catch (e: any) {
      toast({ title: "Hata", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Masraf Türleri</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2 max-w-sm">
          <Input
            placeholder="Yeni tür adı"
            value={yeniAd}
            onChange={(e) => setYeniAd(e.target.value)}
            data-testid="input-yeni-masraf-turu"
          />
          <Button onClick={ekle} data-testid="button-masraf-turu-ekle">Ekle</Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ad</TableHead>
              <TableHead>Aktif (kapalıysa formda görünmez)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {turler.map((t) => (
              <TableRow key={t.id}>
                <TableCell>{t.ad}</TableCell>
                <TableCell>
                  <Switch checked={t.aktif} onCheckedChange={(a) => aktifDegistir(t, a)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function Odemeler() {
  const { data: ozet } = useQuery<Ozet>({
    queryKey: ["/api/odemeler/ozet"],
    refetchInterval: 60000,
  });
  const talepler = ozet?.talepler ?? [];

  return (
    <div className="p-4 space-y-4">
      <Tabs defaultValue="izleme">
        <TabsList>
          <TabsTrigger value="izleme" data-testid="tab-odemeler-izleme">İzleme</TabsTrigger>
          <TabsTrigger value="kullanicilar" data-testid="tab-odemeler-kullanicilar">Kullanıcılar</TabsTrigger>
          <TabsTrigger value="turler" data-testid="tab-odemeler-turler">Masraf Türleri</TabsTrigger>
        </TabsList>

        <TabsContent value="izleme" className="space-y-4">
          <OtomatikYuklemeRozeti tip="beyanname" />
          <ExcelYukleme />
          {ozet && ozet.eslesmeyen.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-amber-600">Eşleşmeyen Beyanname Kullanıcıları</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {ozet.eslesmeyen.map((e) => (
                  <Badge key={e.kullanici} variant="outline" className="mr-2 mb-1">
                    {e.kullanici}: {e.adet} beyanname
                  </Badge>
                ))}
                <p className="text-xs text-muted-foreground mt-2">
                  Bu AV adları hiçbir portal kullanıcısına atanmamış — ilgili temsilciler
                  beyannamelerini göremez.
                </p>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Tüm Ödeme Talepleri</CardTitle>
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
                    <TableHead>Durum</TableHead>
                    <TableHead>İade</TableHead>
                    <TableHead>Belgeler</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {talepler.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground">
                        Talep yok
                      </TableCell>
                    </TableRow>
                  )}
                  {talepler.map((t) => (
                    <TableRow key={t.id} data-testid={`row-izleme-${t.id}`}>
                      <TableCell>{formatTarih(t.talepTarihi)}</TableCell>
                      <TableCell>{t.talepEdenAd}</TableCell>
                      <TableCell>{t.beyanname?.dosyaNo ?? "—"}</TableCell>
                      <TableCell className="max-w-44 truncate">{t.beyanname?.alici ?? "—"}</TableCell>
                      <TableCell>
                        {TIP_ETIKET[t.odemeTipi] ?? t.odemeTipi}
                        {t.odemeTipi === "masraf" ? ` / ${t.masrafTuru}` : ""}
                      </TableCell>
                      <TableCell>{formatPara(t.tutar, t.paraBirimi)}</TableCell>
                      <TableCell>
                        <Badge variant={t.durum === "odendi" ? "default" : "secondary"}>
                          {DURUM_ETIKET[t.durum] ?? t.durum}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {t.odemeTipi === "depo_teminat" && t.iadeDurumu
                          ? (IADE_ETIKET[t.iadeDurumu] ?? t.iadeDurumu)
                          : "—"}
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
                              {BELGE_ETIKET[b.belgeTipi] ?? b.belgeTipi}
                            </a>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="kullanicilar">
          <Kullanicilar />
        </TabsContent>

        <TabsContent value="turler">
          <MasrafTurleri />
        </TabsContent>
      </Tabs>
    </div>
  );
}

# Ödemeler Portalı Faz 1.8 — Çoklu Masraf Girişi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Yeni Talep sayfasında dosya sabit kalırken "Ekle" ile kalem biriktirme, kalem listesi ve "Tümünü Muhasebeye Gönder" (seri gönderim + kısmi hata yönetimi).

**Architecture:** Yalnız istemci değişikliği (yaklaşım A): kalemler React state'inde birikir; Gönder'de mevcut `POST /api/portal/talepler` ucuna kalem başına bir FormData isteği seri atılır. Backend, muhasebe sayfaları ve `KonsimentoAnalizAlani` değişmez. Spec: `docs/superpowers/specs/2026-07-06-odemeler-portal-faz18-coklu-masraf-design.md`.

**Tech Stack:** React 18 + TanStack Query + shadcn/ui (mevcut), Playwright (scratchpad'de kurulu, doğrulama scriptleri için).

## Global Constraints

- Değişen tek uygulama dosyası: `client/src/pages/portal/YeniTalepSayfasi.tsx`. Başka uygulama dosyasına DOKUNMA.
- Türkçe kaynak dosyaları PowerShell Set-Content/Out-File ile ASLA yazılmaz — yalnız Edit/Write araçları; iş sonunda `node -e` ile U+FFFD taraması yapılır.
- `git push` YASAK (push = canlı deploy, kullanıcı kararı). `git add` daima açık dosya yollarıyla; `KONŞİMENTO ÖRNEKLERİ/`, `uploads/`, `.env`, xlsx dosyaları asla eklenmez.
- Test komutu uydurma: repoda test runner YOK; kalite kapıları `npm run check` (tsc) + Playwright scriptleri (scratchpad) + `npm run build`.
- Scratchpad: `C:\Users\cem\AppData\Local\Temp\claude\e--CEM-APPS-cnctracker\f8e48f44-2295-45d2-af94-f819937c735a\scratchpad` (Playwright + node_modules kurulu; gerçek örnek PDF: `e:/CEM APPS/cnctracker/KONŞİMENTO ÖRNEKLERİ/ADP.pdf`).
- Dev sunucu: port 5000. tsx hot-reload YAPMAZ; sunucu kodu değişmediği için restart gerekmez, ama sunucu düşmüşse: `netstat -ano | findstr :5000` → `taskkill //PID <pid> //F` → arka planda `npm run dev`. Vite middleware frontend'i otomatik tazeler.
- Portal test kullanıcıları (lokal dev DB): temsilci `suleyman` / muhasebe `muhasebe`, şifre `1234`. Login'de Türkçe karakterli veri curl inline `-d` ile GÖNDERİLMEZ (dosyadan `--data-binary`) — Playwright'ta sorun yok.
- Mevcut testid'ler korunur (`input-tutar`, `input-alacakli`, `select-beyanname`, `checkbox-dosya-yok`, `select-odeme-tipi`, `select-masraf-turu`, `select-para-birimi`, `input-iban`, `input-aciklama`, `input-belgeler`, konşimento alanı testid'leri). Kaldırılan: `button-talep-gonder` (yerine `button-kalem-ekle` + `button-toplu-gonder`).

---

### Task 1: YeniTalepSayfasi — kalem biriktirme + liste + seri gönderim

**Files:**
- Modify: `client/src/pages/portal/YeniTalepSayfasi.tsx` (tam yeniden yazım — aşağıdaki kod bloğu dosyanın YENİ TAM içeriğidir)
- Test: scratchpad `f18t1-smoke.js` (Playwright duman testi, repo dışı)

**Interfaces:**
- Consumes: `KonsimentoAnalizAlani` (props: `deger: KonsimentoBilgisi`, `onDegisim`, `idOnEki: "talep"`, `key` remount), `POST /api/portal/talepler` (multipart: `beyannameId?`, `odemeTipi`, `masrafTuru`, `tutar`, `paraBirimi`, `alacakli`, `iban`, `aciklama`, `belgeler[]`, depo ise `konsimento` + `konsimentoNo` + `tasiyici`), `GET /api/portal/{beyannameler,masraf-turleri,odeme-sirketleri}`.
- Produces: Task 2'nin kullanacağı testid'ler: `button-kalem-ekle`, `list-kalemler`, `row-kalem-{i}`, `button-kalem-kaldir-{i}`, `button-toplu-gonder`, `text-kalem-toplamlar`, `text-kalem-durum-{i}`.

- [ ] **Step 1: Dosyayı aşağıdaki tam içerikle değiştir**

`client/src/pages/portal/YeniTalepSayfasi.tsx` dosyasının YENİ TAM içeriği (Write aracıyla yaz):

```tsx
import { useMemo, useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import type { Beyanname, MasrafTuru, OdemeSirketi } from "@shared/schema";
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
  const { data: odemeSirketleri = [] } = useQuery<OdemeSirketi[]>({
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

  // Para birimi bazında görsel toplamlar (tüm listelenen kalemler)
  const toplamlar = useMemo(() => {
    const t: Record<string, number> = {};
    for (const k of kalemler) t[k.paraBirimi] = (t[k.paraBirimi] ?? 0) + tutarSayiya(k.tutar);
    return t;
  }, [kalemler]);

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

  const kalemFormunuSifirla = () => {
    setMasrafTuru("");
    setTutar("");
    setAlacakli("");
    setIban("");
    setAciklama("");
    setDosyalar(null);
    setKonsimento({ ...BOS_KONSIMENTO });
    sonAlacakliOnerisi.current = null;
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
                  list="alacakli-onerileri-talep"
                  data-testid="input-alacakli"
                />
                <datalist id="alacakli-onerileri-talep">
                  {odemeSirketleri.map((s) => (
                    <option key={s.id} value={s.ad} />
                  ))}
                </datalist>
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
```

- [ ] **Step 2: Tip kontrolü**

Run: `npm run check`
Expected: çıktı yalnız `> tsc` satırı, hata yok (exit 0).

- [ ] **Step 3: Türkçe karakter bütünlüğü**

Run: `node -e "const s=require('fs').readFileSync('client/src/pages/portal/YeniTalepSayfasi.tsx','utf8'); console.log('fffd:', s.includes('�'), 'tr:', /[şğİıçöü]/.test(s))"`
Expected: `fffd: false tr: true`

- [ ] **Step 4: Playwright duman testi**

Scratchpad'e `f18t1-smoke.js` yaz ve çalıştır. Senaryo (temsilci `suleyman`/1234 ile http://localhost:5000/portal):
1. Yeni Talep'te beyanname seç (listeden ilki), masraf türü seç, tutar `1`, alacaklı `SMOKE FIRMA A` → `button-kalem-ekle` → `row-kalem-0` görünür, `select-beyanname` disabled (kilit) ve `text-dosya-kilidi` görünür.
2. İkinci kalem: tutar `1`, alacaklı `SMOKE FIRMA B`, masraf türü seç → Ekle → `row-kalem-1` + `text-kalem-toplamlar` "2 kalem" içerir.
3. `button-kalem-kaldir-1` → listede 1 kalem kalır.
4. Formda tutar `1` yaz (eklemeden) → `button-toplu-gonder` → "Formda eklenmemiş kalem var" toast'ı görünür, ağ isteği atılmaz (talep sayısı değişmez).
5. Tutar alanını temizle → `button-toplu-gonder` → "1 talep muhasebeye gönderildi" toast'ı, liste kaybolur, `select-beyanname` tekrar enabled.
6. Taleplerim sayfasında `SMOKE FIRMA A` satırı görünür.
Expected: 6/6 assert PASS, ekran görüntüleri scratchpad'e.

- [ ] **Step 5: Test verisini temizle**

Run (repo kökünde):
```bash
node -e "
require('dotenv').config();
const pg = require('pg');
const p = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false } });
(async () => {
  const ids = await p.query(\"SELECT id FROM odeme_talepleri WHERE alacakli LIKE 'SMOKE %'\");
  for (const r of ids.rows) await p.query('DELETE FROM odeme_belgeleri WHERE talep_id = \$1', [r.id]);
  const t = await p.query(\"DELETE FROM odeme_talepleri WHERE alacakli LIKE 'SMOKE %'\");
  const s = await p.query(\"DELETE FROM odeme_sirketleri WHERE ad LIKE 'SMOKE %'\");
  console.log('talep:', t.rowCount, 'sirket:', s.rowCount);
  p.end();
})();
"
```
Expected: `talep: 1 sirket: 0` (SMOKE kalemler masraf tipiydi — şirket upsert'i yalnız depo_teminat'ta çalışır, 0 normaldir).

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/portal/YeniTalepSayfasi.tsx
git commit -m "feat(odemeler): yeni talepte coklu masraf girisi - kalem listesi + seri gonderim (F1.8 T1)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Karma E2E (depo + masraf) + kısmi hata gözden geçirme + build

**Files:**
- Create (scratchpad): `e2e-faz18.js`
- Modify: yok (gerçek uygulama hatası bulunursa → kod değiştirme, DONE_WITH_CONCERNS raporla)

**Interfaces:**
- Consumes: Task 1'in testid'leri (`button-kalem-ekle`, `row-kalem-{i}`, `button-kalem-kaldir-{i}`, `button-toplu-gonder`, `text-kalem-toplamlar`, `text-kalem-durum-{i}`, `text-dosya-kilidi`) + `KONŞİMENTO ÖRNEKLERİ/ADP.pdf` (gerçek analiz: konsimentoNo `DGSSE260400154`, acente ASAV) + Taleplerim sayfası.
- Produces: rapor (commit yok).

- [ ] **Step 1: Karma akış E2E**

Scratchpad'e `e2e-faz18.js` yaz, çalıştır. Senaryo (suleyman/1234):
1. Beyanname seç → masraf kalemi 1: tür seç, tutar `1`, alacaklı `E2E MASRAF BIR` → Ekle.
2. Masraf kalemi 2: tür seç, tutar `2`, para birimi `USD`, alacaklı `E2E MASRAF IKI` → Ekle.
3. Depo kalemi: ödeme tipi Depo Teminatı → ADP.pdf yükle → analiz sonucu bekle (60 sn'ye kadar) → konsimentoNo `DGSSE260400154` görünür, alacaklı otomatik ASAV dolar → onay kutusu → tutar `1` → Ekle.
4. Asserts: `row-kalem-0..2` mevcut; `text-kalem-toplamlar` hem `TRY` hem `USD` içerir; `row-kalem-2` içinde `DGSSE260400154` geçer; dosya bloğu kilitli.
5. `button-toplu-gonder` → "3 talep muhasebeye gönderildi" toast; liste kaybolur.
6. Taleplerim'de `E2E MASRAF BIR`, `E2E MASRAF IKI` ve ASAV'lı depo talebi görünür (3 yeni satır).
Expected: tüm assert'ler PASS; ekran görüntüleri scratchpad'e. Başarısızlıkta kod DEĞİŞTİRME — tam çıktıyla raporla.

- [ ] **Step 2: Kısmi hata kod gözden geçirmesi (masaüstü kontrol)**

Ağ hatası simülasyonu E2E'de güvenilir kurulamıyorsa zorlanmaz; bunun yerine `topluGonder` içindeki durum makinesini satır satır oku ve şunları raporda İMZALA: (a) `gonderildi` kalem retry döngüsünde atlanıyor (çift talep imkânsız), (b) hata alan kalemde döngü DEVAM ediyor, (c) invalidate kısmi durumda da çağrılıyor, (d) kısmi durumda buton etiketi "Kalanları Tekrar Gönder" oluyor, (e) gönderim sırasında Ekle/Kaldır/Gönder disabled.

- [ ] **Step 3: Temizlik**

Task 1 Step 5'teki node komutunun aynısını `LIKE 'E2E %'` desenli çalıştır + depo kaleminin `odeme_sirketleri`'ne yazdığı ASAV kaydını sil (`DELETE FROM odeme_sirketleri`  — lokal dev DB'de tablo komple temizlenebilir). `uploads/odemeler/` altına bu taleplerle yazılmış dosyaları da sil (odeme_belgeleri.filepath değerlerinden). Sayıları raporla; `GET /api/portal/odeme-sirketleri` → `[]` doğrula.

- [ ] **Step 4: Kalite kapıları**

Run: `npm run check` → hatasız; `npm run build` → `dist/` üretilir, hatasız. Dev sunucu açık bırakılır.

- [ ] **Step 5: Rapor**

Commit YOK (test-only görev). Rapora: E2E assert sonuçları + ekran görüntüsü yolları, kısmi-hata gözden geçirme imzaları, temizlik sayıları, check/build çıktı özeti.

---

## Self-Review Notu

- Spec §3 (üç blok, kilit, Ekle doğrulamaları, kalem modeli) → Task 1 Step 1 kodunda birebir; §4 (seri gönderim, kısmi hata, koruma, buton etiketleri) → `topluGonder` + Task 2 Step 2 imzaları; §5 (tek dosya, testid'ler) → Task 1; §6 (E2E senaryoları) → Task 1 Step 4 + Task 2 Step 1. Kapsam dışı maddeler planda yok (YAGNI).
- `button-talep-gonder` bilinçli kaldırıldı (spec §5 not düşüldü) — eski scratchpad scriptleri repo dışı, kırılmaları önemsiz.
- Tip tutarlılığı: `Kalem`, `KalemDurum`, `tutarSayiya`, testid adları Task 1 kodu ile Task 2 assert'lerinde aynı.

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Plus, Pencil, Trash2, ChevronDown, ChevronRight, CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type Toplantı = {
  id: string;
  tarih: string;
  katilimcilar: string | null;
  gundem: string | null;
  musteriSikayetleri: string | null;
  tedarikciPerformansi: string | null;
  urunUygunsuzluk: string | null;
  oncekiKararDurum: string | null;
  sonuclar: string | null;
  aksiyon_sayisi: number;
};

type ToplantıDetail = Toplantı & { aksiyonlar: Aksiyon[] };

type Aksiyon = {
  id: string;
  toplantId: string;
  aksiyon: string;
  sorumlu: string;
  hedefTarih: string | null;
  durum: string;
  toplantıTarihi?: string;
};

type IsoStats = {
  dufAcik: number;
  dufKapali: number;
  hedefCount: number;
  hedefYesilCount: number;
  egitimCount: number;
  toplamKatilimciCount: number;
  tedarikciCount: number;
  buYilDegerlendirmeCount: number;
};

const emptyForm = {
  tarih: "",
  katilimcilar: "",
  gundem: "",
  musteriSikayetleri: "",
  tedarikciPerformansi: "",
  urunUygunsuzluk: "",
  oncekiKararDurum: "",
  sonuclar: "",
};

const emptyAksiyonForm = { aksiyon: "", sorumlu: "", hedefTarih: "" };

export default function ISO9001YonetimGozdenGecirme() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const today = new Date().toISOString().split("T")[0];

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modal, setModal] = useState<{ open: boolean; editing: Toplantı | null }>({ open: false, editing: null });
  const [form, setForm] = useState(emptyForm);
  const [aksiyonForm, setAksiyonForm] = useState(emptyAksiyonForm);
  const [pendingAksiyonlar, setPendingAksiyonlar] = useState<typeof emptyAksiyonForm[]>([]);
  const [aksiyonFilter, setAksiyonFilter] = useState("tumu");

  const { data: toplantılar = [] } = useQuery<Toplantı[]>({
    queryKey: ["/api/yonetim-toplantilari"],
    queryFn: () => fetch("/api/yonetim-toplantilari").then(r => r.json()),
  });

  const { data: expandedDetail } = useQuery<ToplantıDetail>({
    queryKey: ["/api/yonetim-toplantilari", expandedId],
    queryFn: () => fetch(`/api/yonetim-toplantilari/${expandedId}`).then(r => r.json()),
    enabled: !!expandedId,
  });

  const { data: tumAksiyonlar = [] } = useQuery<(Aksiyon & { toplantıTarihi: string })[]>({
    queryKey: ["/api/yonetim-aksiyonlar"],
    queryFn: () => fetch("/api/yonetim-aksiyonlar").then(r => r.json()),
  });

  const { data: isoStats } = useQuery<IsoStats>({
    queryKey: ["/api/iso9001/stats"],
    queryFn: () => fetch("/api/iso9001/stats").then(r => r.json()),
  });

  const createToplantı = useMutation({
    mutationFn: async (data: typeof emptyForm) => {
      const toplantı = await fetch("/api/yonetim-toplantilari", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(r => r.json());
      for (const pa of pendingAksiyonlar) {
        await fetch("/api/yonetim-aksiyonlar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...pa, toplantId: toplantı.id }),
        });
      }
      return toplantı;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/yonetim-toplantilari"] });
      qc.invalidateQueries({ queryKey: ["/api/yonetim-aksiyonlar"] });
      qc.invalidateQueries({ queryKey: ["/api/iso9001/stats"] });
      setModal({ open: false, editing: null });
      setPendingAksiyonlar([]);
      toast({ title: "Toplantı oluşturuldu" });
    },
  });

  const updateToplantı = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof emptyForm }) =>
      fetch(`/api/yonetim-toplantilari/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/yonetim-toplantilari"] });
      setModal({ open: false, editing: null });
      toast({ title: "Toplantı güncellendi" });
    },
  });

  const deleteToplantı = useMutation({
    mutationFn: (id: string) => fetch(`/api/yonetim-toplantilari/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/yonetim-toplantilari"] });
      qc.invalidateQueries({ queryKey: ["/api/yonetim-aksiyonlar"] });
      qc.invalidateQueries({ queryKey: ["/api/iso9001/stats"] });
      if (expandedId) setExpandedId(null);
      toast({ title: "Toplantı silindi" });
    },
  });

  const addAksiyon = useMutation({
    mutationFn: (data: { toplantId: string; aksiyon: string; sorumlu: string; hedefTarih?: string }) =>
      fetch("/api/yonetim-aksiyonlar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/yonetim-toplantilari", expandedId] });
      qc.invalidateQueries({ queryKey: ["/api/yonetim-toplantilari"] });
      qc.invalidateQueries({ queryKey: ["/api/yonetim-aksiyonlar"] });
      qc.invalidateQueries({ queryKey: ["/api/iso9001/stats"] });
      setAksiyonForm(emptyAksiyonForm);
      toast({ title: "Aksiyon eklendi" });
    },
  });

  const toggleAksiyon = useMutation({
    mutationFn: ({ id, durum }: { id: string; durum: string }) =>
      fetch(`/api/yonetim-aksiyonlar/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ durum: durum === "acik" ? "kapali" : "acik" }) }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/yonetim-aksiyonlar"] });
      qc.invalidateQueries({ queryKey: ["/api/yonetim-toplantilari", expandedId] });
      qc.invalidateQueries({ queryKey: ["/api/iso9001/stats"] });
    },
  });

  const deleteAksiyon = useMutation({
    mutationFn: (id: string) => fetch(`/api/yonetim-aksiyonlar/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/yonetim-aksiyonlar"] });
      qc.invalidateQueries({ queryKey: ["/api/yonetim-toplantilari", expandedId] });
      qc.invalidateQueries({ queryKey: ["/api/yonetim-toplantilari"] });
      qc.invalidateQueries({ queryKey: ["/api/iso9001/stats"] });
      toast({ title: "Aksiyon silindi" });
    },
  });

  const isGecikmiş = (a: Aksiyon) => !!a.hedefTarih && a.hedefTarih < today && a.durum === "acik";

  const getDurumBadge = (a: Aksiyon) => {
    if (isGecikmiş(a)) return <Badge variant="destructive">Gecikmiş</Badge>;
    if (a.durum === "kapali") return <Badge className="bg-green-600 text-white">Kapalı</Badge>;
    return <Badge variant="secondary">Açık</Badge>;
  };

  const filteredAksiyonlar = tumAksiyonlar.filter(a => {
    if (aksiyonFilter === "acik") return a.durum === "acik" && !isGecikmiş(a);
    if (aksiyonFilter === "kapali") return a.durum === "kapali";
    if (aksiyonFilter === "gecikmiş") return isGecikmiş(a);
    return true;
  });

  const openModal = (editing: Toplantı | null) => {
    setForm(editing ? {
      tarih: editing.tarih,
      katilimcilar: editing.katilimcilar ?? "",
      gundem: editing.gundem ?? "",
      musteriSikayetleri: editing.musteriSikayetleri ?? "",
      tedarikciPerformansi: editing.tedarikciPerformansi ?? "",
      urunUygunsuzluk: editing.urunUygunsuzluk ?? "",
      oncekiKararDurum: editing.oncekiKararDurum ?? "",
      sonuclar: editing.sonuclar ?? "",
    } : emptyForm);
    setPendingAksiyonlar([]);
    setAksiyonForm(emptyAksiyonForm);
    setModal({ open: true, editing });
  };

  const addPending = () => {
    if (!aksiyonForm.aksiyon || !aksiyonForm.sorumlu) return;
    setPendingAksiyonlar(p => [...p, aksiyonForm]);
    setAksiyonForm(emptyAksiyonForm);
  };

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <BarChart3 className="w-7 h-7 text-primary" />
        <h2 className="text-2xl font-semibold">Yönetim Gözden Geçirme</h2>
      </div>

      <Tabs defaultValue="toplantılar">
        <TabsList className="mb-4">
          <TabsTrigger value="toplantılar">Toplantılar</TabsTrigger>
          <TabsTrigger value="aksiyonlar">Aksiyonlar</TabsTrigger>
        </TabsList>

        {/* ── Sekme 1: Toplantılar ── */}
        <TabsContent value="toplantılar">
          <div className="flex justify-end mb-3">
            <Button size="sm" onClick={() => openModal(null)}>
              <Plus className="w-4 h-4 mr-1" /> Yeni Toplantı
            </Button>
          </div>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Tarih</th>
                  <th className="text-left p-3 font-medium">Katılımcılar</th>
                  <th className="text-left p-3 font-medium">Aksiyon</th>
                  <th className="text-right p-3 font-medium">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {toplantılar.map(t => (
                  <>
                    <tr
                      key={t.id}
                      className="border-t cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                    >
                      <td className="p-3 font-medium">
                        <div className="flex items-center gap-2">
                          {expandedId === t.id ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                          {t.tarih}
                        </div>
                      </td>
                      <td className="p-3 text-muted-foreground truncate max-w-[200px]">{t.katilimcilar ?? "—"}</td>
                      <td className="p-3">
                        <Badge variant="secondary">{t.aksiyon_sayisi} aksiyon</Badge>
                      </td>
                      <td className="p-3 text-right" onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" onClick={() => openModal(t)}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteToplantı.mutate(t.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </td>
                    </tr>
                    {expandedId === t.id && expandedDetail && (
                      <tr key={`${t.id}-expand`} className="border-t bg-muted/10">
                        <td colSpan={4} className="p-4 space-y-4">
                          {/* ISO Özeti */}
                          {isoStats && (
                            <div className="rounded-lg border p-3 bg-background">
                              <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">ISO 9001 Anlık Özet</p>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                <div><span className="text-muted-foreground">DÜF:</span> <span className="font-medium">{isoStats.dufAcik} açık, {isoStats.dufKapali} kapalı</span></div>
                                <div><span className="text-muted-foreground">Hedef:</span> <span className="font-medium">{isoStats.hedefYesilCount}/{isoStats.hedefCount} yeşil</span></div>
                                <div><span className="text-muted-foreground">Eğitim:</span> <span className="font-medium">{isoStats.egitimCount} eğitim</span></div>
                                <div><span className="text-muted-foreground">Tedarikçi:</span> <span className="font-medium">{isoStats.buYilDegerlendirmeCount} değerlendirme</span></div>
                              </div>
                            </div>
                          )}
                          {/* Serbest metin alanları */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                            {[
                              { label: "Gündem", val: expandedDetail.gundem },
                              { label: "Müşteri Şikayetleri", val: expandedDetail.musteriSikayetleri },
                              { label: "Tedarikçi Performansı", val: expandedDetail.tedarikciPerformansi },
                              { label: "Ürün Uygunsuzluk", val: expandedDetail.urunUygunsuzluk },
                              { label: "Önceki Karar Durumu", val: expandedDetail.oncekiKararDurum },
                              { label: "Sonuçlar", val: expandedDetail.sonuclar },
                            ].filter(f => f.val).map(f => (
                              <div key={f.label}>
                                <p className="text-xs text-muted-foreground font-medium mb-1">{f.label}</p>
                                <p className="whitespace-pre-wrap">{f.val}</p>
                              </div>
                            ))}
                          </div>
                          {/* Aksiyonlar */}
                          <div>
                            <p className="text-sm font-medium text-muted-foreground mb-2">Aksiyonlar</p>
                            {expandedDetail.aksiyonlar.length > 0 && (
                              <table className="w-full text-sm border rounded-lg overflow-hidden mb-3">
                                <thead className="bg-muted/50">
                                  <tr>
                                    <th className="text-left p-2 font-medium">Aksiyon</th>
                                    <th className="text-left p-2 font-medium">Sorumlu</th>
                                    <th className="text-left p-2 font-medium">Hedef Tarih</th>
                                    <th className="text-left p-2 font-medium">Durum</th>
                                    <th className="text-right p-2 font-medium">İşlemler</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {expandedDetail.aksiyonlar.map(a => (
                                    <tr key={a.id} className="border-t">
                                      <td className="p-2">{a.aksiyon}</td>
                                      <td className="p-2 text-muted-foreground">{a.sorumlu}</td>
                                      <td className="p-2 text-muted-foreground">{a.hedefTarih ?? "—"}</td>
                                      <td className="p-2">{getDurumBadge(a)}</td>
                                      <td className="p-2 text-right">
                                        <Button variant="ghost" size="icon" onClick={() => toggleAksiyon.mutate({ id: a.id, durum: a.durum })}>
                                          {a.durum === "acik" ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Circle className="w-4 h-4" />}
                                        </Button>
                                        <Button variant="ghost" size="icon" onClick={() => deleteAksiyon.mutate(a.id)}>
                                          <Trash2 className="w-4 h-4 text-destructive" />
                                        </Button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                            {/* Aksiyon Ekle satırı */}
                            <div className="flex gap-2 items-end">
                              <div className="flex-1"><Label className="text-xs">Aksiyon *</Label><Input placeholder="Aksiyon açıklaması" value={aksiyonForm.aksiyon} onChange={e => setAksiyonForm(f => ({ ...f, aksiyon: e.target.value }))} /></div>
                              <div className="w-32"><Label className="text-xs">Sorumlu *</Label><Input placeholder="Ad Soyad" value={aksiyonForm.sorumlu} onChange={e => setAksiyonForm(f => ({ ...f, sorumlu: e.target.value }))} /></div>
                              <div className="w-36"><Label className="text-xs">Hedef Tarih</Label><Input type="date" value={aksiyonForm.hedefTarih} onChange={e => setAksiyonForm(f => ({ ...f, hedefTarih: e.target.value }))} /></div>
                              <Button size="sm" disabled={!aksiyonForm.aksiyon || !aksiyonForm.sorumlu} onClick={() => addAksiyon.mutate({ toplantId: t.id, aksiyon: aksiyonForm.aksiyon, sorumlu: aksiyonForm.sorumlu, hedefTarih: aksiyonForm.hedefTarih || undefined })}>
                                <Plus className="w-4 h-4 mr-1" /> Ekle
                              </Button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
                {toplantılar.length === 0 && (
                  <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Henüz toplantı kaydı yok.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ── Sekme 2: Aksiyonlar ── */}
        <TabsContent value="aksiyonlar">
          <div className="flex gap-2 mb-3">
            <Select value={aksiyonFilter} onValueChange={setAksiyonFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tumu">Tümü</SelectItem>
                <SelectItem value="acik">Açık</SelectItem>
                <SelectItem value="kapali">Kapalı</SelectItem>
                <SelectItem value="gecikmiş">Gecikmiş</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground self-center">{filteredAksiyonlar.length} aksiyon</span>
          </div>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Aksiyon</th>
                  <th className="text-left p-3 font-medium">Sorumlu</th>
                  <th className="text-left p-3 font-medium">Hedef Tarih</th>
                  <th className="text-left p-3 font-medium">Toplantı</th>
                  <th className="text-left p-3 font-medium">Durum</th>
                  <th className="text-right p-3 font-medium">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {filteredAksiyonlar.map(a => (
                  <tr key={a.id} className="border-t">
                    <td className="p-3">{a.aksiyon}</td>
                    <td className="p-3 text-muted-foreground">{a.sorumlu}</td>
                    <td className="p-3 text-muted-foreground">{a.hedefTarih ?? "—"}</td>
                    <td className="p-3 text-muted-foreground">{a.toplantıTarihi}</td>
                    <td className="p-3">{getDurumBadge(a)}</td>
                    <td className="p-3 text-right">
                      <Button variant="ghost" size="icon" onClick={() => toggleAksiyon.mutate({ id: a.id, durum: a.durum })}>
                        {a.durum === "acik" ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Circle className="w-4 h-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteAksiyon.mutate(a.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {filteredAksiyonlar.length === 0 && (
                  <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Aksiyon bulunamadı.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Toplantı Modalı ── */}
      <Dialog open={modal.open} onOpenChange={o => !o && setModal({ open: false, editing: null })}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{modal.editing ? "Toplantı Düzenle" : "Yeni Toplantı"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Bölüm 1 */}
            <div className="grid grid-cols-1 gap-3">
              <div><Label>Tarih *</Label><Input type="date" value={form.tarih} onChange={e => setForm(f => ({ ...f, tarih: e.target.value }))} /></div>
              <div><Label>Katılımcılar</Label><Textarea rows={2} value={form.katilimcilar} onChange={e => setForm(f => ({ ...f, katilimcilar: e.target.value }))} /></div>
              <div><Label>Gündem</Label><Textarea rows={3} value={form.gundem} onChange={e => setForm(f => ({ ...f, gundem: e.target.value }))} /></div>
            </div>
            {/* Bölüm 2: ISO Özeti */}
            {isoStats && (
              <div className="rounded-lg border p-3 bg-muted/30">
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">ISO 9001 Anlık Özet</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>DÜF: <span className="font-medium">{isoStats.dufAcik} açık, {isoStats.dufKapali} kapalı</span></div>
                  <div>Hedef: <span className="font-medium">{isoStats.hedefYesilCount}/{isoStats.hedefCount} yeşil</span></div>
                  <div>Eğitim: <span className="font-medium">{isoStats.egitimCount} eğitim, {isoStats.toplamKatilimciCount} katılım</span></div>
                  <div>Tedarikçi: <span className="font-medium">{isoStats.tedarikciCount} tedarikçi, {isoStats.buYilDegerlendirmeCount} bu yıl</span></div>
                </div>
              </div>
            )}
            {/* Bölüm 3: Giriş Verileri */}
            <div className="space-y-3 border-t pt-3">
              <p className="text-sm font-medium">Giriş Verileri</p>
              <div><Label>Müşteri Şikayetleri</Label><Textarea rows={2} value={form.musteriSikayetleri} onChange={e => setForm(f => ({ ...f, musteriSikayetleri: e.target.value }))} /></div>
              <div><Label>Tedarikçi Performansı</Label><Textarea rows={2} value={form.tedarikciPerformansi} onChange={e => setForm(f => ({ ...f, tedarikciPerformansi: e.target.value }))} /></div>
              <div><Label>Ürün Uygunsuzluk</Label><Textarea rows={2} value={form.urunUygunsuzluk} onChange={e => setForm(f => ({ ...f, urunUygunsuzluk: e.target.value }))} /></div>
              <div><Label>Önceki Karar Durumu</Label><Textarea rows={2} value={form.oncekiKararDurum} onChange={e => setForm(f => ({ ...f, oncekiKararDurum: e.target.value }))} /></div>
            </div>
            {/* Bölüm 4: Sonuçlar */}
            <div className="border-t pt-3">
              <Label>Sonuçlar / Notlar</Label><Textarea rows={3} value={form.sonuclar} onChange={e => setForm(f => ({ ...f, sonuclar: e.target.value }))} />
            </div>
            {/* Bölüm 5: Aksiyonlar (sadece create modunda pending liste) */}
            {!modal.editing && (
              <div className="border-t pt-3 space-y-2">
                <p className="text-sm font-medium">Aksiyonlar</p>
                {pendingAksiyonlar.length > 0 && (
                  <div className="space-y-1">
                    {pendingAksiyonlar.map((pa, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm bg-muted/30 rounded p-2">
                        <span className="flex-1">{pa.aksiyon} — {pa.sorumlu}</span>
                        {pa.hedefTarih && <span className="text-muted-foreground">{pa.hedefTarih}</span>}
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setPendingAksiyonlar(p => p.filter((_, i) => i !== idx))}>
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 items-end">
                  <div className="flex-1"><Label className="text-xs">Aksiyon</Label><Input placeholder="Aksiyon" value={aksiyonForm.aksiyon} onChange={e => setAksiyonForm(f => ({ ...f, aksiyon: e.target.value }))} /></div>
                  <div className="w-32"><Label className="text-xs">Sorumlu</Label><Input placeholder="Sorumlu" value={aksiyonForm.sorumlu} onChange={e => setAksiyonForm(f => ({ ...f, sorumlu: e.target.value }))} /></div>
                  <div className="w-36"><Label className="text-xs">Hedef Tarih</Label><Input type="date" value={aksiyonForm.hedefTarih} onChange={e => setAksiyonForm(f => ({ ...f, hedefTarih: e.target.value }))} /></div>
                  <Button size="sm" variant="outline" disabled={!aksiyonForm.aksiyon || !aksiyonForm.sorumlu} onClick={addPending}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal({ open: false, editing: null })}>İptal</Button>
            <Button
              disabled={!form.tarih}
              onClick={() => modal.editing
                ? updateToplantı.mutate({ id: modal.editing.id, data: form })
                : createToplantı.mutate(form)
              }
            >Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

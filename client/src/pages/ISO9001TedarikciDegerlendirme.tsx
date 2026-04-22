import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Truck, Plus, Pencil, Trash2, ChevronDown, ChevronRight, Eye, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

type Tedarikci = {
  id: string;
  ad: string;
  kategori: string | null;
  yetkiliAdi: string | null;
  telefon: string | null;
  email: string | null;
  aciklama: string | null;
  degerlendirmeSayisi: number;
};

type Kriter = {
  id: string;
  kriter: string;
  tip: string;
  sira: number;
};

type Degerlendirme = {
  id: string;
  tedarikciId: string;
  tarih: string;
  degerlendiren: string | null;
  notlar: string | null;
  ortPuan: number | null;
};

type DegerlendirmeDetay = Degerlendirme & {
  cevaplar: { id: string; kriterId: string; puan: number | null; cevap: string | null }[];
};

const emptyTedarikciForm = { ad: "", kategori: "", yetkiliAdi: "", telefon: "", email: "", aciklama: "" };
const emptyKriterForm = { kriter: "", tip: "puan_1_5" };
const emptyDegerlendirmeForm = { tarih: "", degerlendiren: "", notlar: "" };

export default function ISO9001TedarikciDegerlendirme() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [expandedTedarikciId, setExpandedTedarikciId] = useState<string | null>(null);
  const [tedarikciModal, setTedarikciModal] = useState<{ open: boolean; editing: Tedarikci | null }>({ open: false, editing: null });
  const [tedarikciForm, setTedarikciForm] = useState(emptyTedarikciForm);

  const [kriterModal, setKriterModal] = useState<{ open: boolean; editing: Kriter | null }>({ open: false, editing: null });
  const [kriterForm, setKriterForm] = useState(emptyKriterForm);

  const [degerlendirmeModal, setDegerlendirmeModal] = useState<{ open: boolean; tedarikciId: string | null }>({ open: false, tedarikciId: null });
  const [degerlendirmeForm, setDegerlendirmeForm] = useState(emptyDegerlendirmeForm);
  const [cevaplar, setCevaplar] = useState<Record<string, { puan?: number; cevap?: string }>>({});

  const [goruntuleModal, setGoruntuleModal] = useState<{ open: boolean; tedarikciId: string | null; degerlendirmeId: string | null }>({ open: false, tedarikciId: null, degerlendirmeId: null });

  const { data: tedarikcilar = [] } = useQuery<Tedarikci[]>({
    queryKey: ["/api/tedarikcilar"],
    queryFn: () => fetch("/api/tedarikcilar").then(r => r.json()),
  });

  const { data: kriterler = [] } = useQuery<Kriter[]>({
    queryKey: ["/api/tedarikci-degerlendirme-kriterleri"],
    queryFn: () => fetch("/api/tedarikci-degerlendirme-kriterleri").then(r => r.json()),
  });

  const { data: expandedDegerlendirmeler = [] } = useQuery<Degerlendirme[]>({
    queryKey: ["/api/tedarikcilar", expandedTedarikciId, "degerlendirmeler"],
    queryFn: () => fetch(`/api/tedarikcilar/${expandedTedarikciId}/degerlendirmeler`).then(r => r.json()),
    enabled: !!expandedTedarikciId,
  });

  const { data: goruntuleDetay } = useQuery<DegerlendirmeDetay>({
    queryKey: ["/api/tedarikcilar", goruntuleModal.tedarikciId, "degerlendirmeler", goruntuleModal.degerlendirmeId],
    queryFn: () => fetch(`/api/tedarikcilar/${goruntuleModal.tedarikciId}/degerlendirmeler/${goruntuleModal.degerlendirmeId}`).then(r => r.json()),
    enabled: !!goruntuleModal.tedarikciId && !!goruntuleModal.degerlendirmeId,
  });

  const createTedarikci = useMutation({
    mutationFn: (data: typeof emptyTedarikciForm) => fetch("/api/tedarikcilar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/tedarikcilar"] }); setTedarikciModal({ open: false, editing: null }); toast({ title: "Tedarikçi eklendi" }); },
  });

  const updateTedarikci = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof emptyTedarikciForm }) => fetch(`/api/tedarikcilar/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/tedarikcilar"] }); setTedarikciModal({ open: false, editing: null }); toast({ title: "Tedarikçi güncellendi" }); },
  });

  const deleteTedarikci = useMutation({
    mutationFn: (id: string) => fetch(`/api/tedarikcilar/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/tedarikcilar"] }); toast({ title: "Tedarikçi silindi" }); },
  });

  const createDegerlendirme = useMutation({
    mutationFn: ({ tedarikciId, body }: { tedarikciId: string; body: object }) =>
      fetch(`/api/tedarikcilar/${tedarikciId}/degerlendirmeler`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json()),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/tedarikcilar", vars.tedarikciId, "degerlendirmeler"] });
      qc.invalidateQueries({ queryKey: ["/api/tedarikcilar"] });
      qc.invalidateQueries({ queryKey: ["/api/iso9001/stats"] });
      setDegerlendirmeModal({ open: false, tedarikciId: null });
      toast({ title: "Değerlendirme kaydedildi" });
    },
  });

  const deleteDegerlendirme = useMutation({
    mutationFn: ({ tedarikciId, degerlendirmeId }: { tedarikciId: string; degerlendirmeId: string }) =>
      fetch(`/api/tedarikcilar/${tedarikciId}/degerlendirmeler/${degerlendirmeId}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/tedarikcilar", vars.tedarikciId, "degerlendirmeler"] });
      qc.invalidateQueries({ queryKey: ["/api/tedarikcilar"] });
      qc.invalidateQueries({ queryKey: ["/api/iso9001/stats"] });
      toast({ title: "Değerlendirme silindi" });
    },
  });

  const createKriter = useMutation({
    mutationFn: (data: typeof emptyKriterForm) => fetch("/api/tedarikci-degerlendirme-kriterleri", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/tedarikci-degerlendirme-kriterleri"] }); setKriterModal({ open: false, editing: null }); toast({ title: "Kriter eklendi" }); },
  });

  const updateKriter = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) => fetch(`/api/tedarikci-degerlendirme-kriterleri/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/tedarikci-degerlendirme-kriterleri"] }); setKriterModal({ open: false, editing: null }); toast({ title: "Kriter güncellendi" }); },
  });

  const deleteKriter = useMutation({
    mutationFn: (id: string) => fetch(`/api/tedarikci-degerlendirme-kriterleri/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/tedarikci-degerlendirme-kriterleri"] }); toast({ title: "Kriter silindi" }); },
  });

  const moveKriter = async (kriter: Kriter, direction: "up" | "down") => {
    const sorted = [...kriterler].sort((a, b) => a.sira - b.sira);
    const idx = sorted.findIndex(k => k.id === kriter.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    await Promise.all([
      fetch(`/api/tedarikci-degerlendirme-kriterleri/${kriter.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kriter: kriter.kriter, tip: kriter.tip, sira: other.sira }) }),
      fetch(`/api/tedarikci-degerlendirme-kriterleri/${other.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kriter: other.kriter, tip: other.tip, sira: kriter.sira }) }),
    ]);
    qc.invalidateQueries({ queryKey: ["/api/tedarikci-degerlendirme-kriterleri"] });
  };

  const openTedarikciModal = (editing: Tedarikci | null) => {
    setTedarikciForm(editing ? { ad: editing.ad, kategori: editing.kategori ?? "", yetkiliAdi: editing.yetkiliAdi ?? "", telefon: editing.telefon ?? "", email: editing.email ?? "", aciklama: editing.aciklama ?? "" } : emptyTedarikciForm);
    setTedarikciModal({ open: true, editing });
  };

  const openKriterModal = (editing: Kriter | null) => {
    setKriterForm(editing ? { kriter: editing.kriter, tip: editing.tip } : emptyKriterForm);
    setKriterModal({ open: true, editing });
  };

  const openDegerlendirmeModal = (tedarikciId: string) => {
    setDegerlendirmeForm(emptyDegerlendirmeForm);
    setCevaplar({});
    setDegerlendirmeModal({ open: true, tedarikciId });
  };

  const handleDegerlendirmeSubmit = () => {
    if (!degerlendirmeModal.tedarikciId || !degerlendirmeForm.tarih) return;
    const cevaplarArr = kriterler.map(k => ({ kriterId: k.id, puan: cevaplar[k.id]?.puan, cevap: cevaplar[k.id]?.cevap }));
    createDegerlendirme.mutate({
      tedarikciId: degerlendirmeModal.tedarikciId,
      body: { tarih: degerlendirmeForm.tarih, degerlendiren: degerlendirmeForm.degerlendiren || undefined, notlar: degerlendirmeForm.notlar || undefined, cevaplar: cevaplarArr },
    });
  };

  const degerlendirmeSaveDisabled = !degerlendirmeForm.tarih || kriterler.filter(k => k.tip === "puan_1_5").some(k => !cevaplar[k.id]?.puan);

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <Truck className="w-7 h-7 text-primary" />
        <h2 className="text-2xl font-semibold">Tedarikçi Değerlendirme</h2>
      </div>

      <Tabs defaultValue="tedarikcilar">
        <TabsList className="mb-4">
          <TabsTrigger value="tedarikcilar">Tedarikçiler</TabsTrigger>
          <TabsTrigger value="sablon">Değerlendirme Şablonu</TabsTrigger>
        </TabsList>

        {/* ── Sekme 1: Tedarikçiler ── */}
        <TabsContent value="tedarikcilar">
          <div className="flex justify-end mb-3">
            <Button size="sm" onClick={() => openTedarikciModal(null)}>
              <Plus className="w-4 h-4 mr-1" /> Yeni Tedarikçi
            </Button>
          </div>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Ad</th>
                  <th className="text-left p-3 font-medium">Kategori</th>
                  <th className="text-left p-3 font-medium">Yetkili</th>
                  <th className="text-left p-3 font-medium">Telefon</th>
                  <th className="text-left p-3 font-medium">Değerlendirme</th>
                  <th className="text-right p-3 font-medium">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {tedarikcilar.map(t => (
                  <>
                    <tr
                      key={t.id}
                      className="border-t cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => setExpandedTedarikciId(expandedTedarikciId === t.id ? null : t.id)}
                    >
                      <td className="p-3 font-medium">
                        <div className="flex items-center gap-2">
                          {expandedTedarikciId === t.id ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                          {t.ad}
                        </div>
                      </td>
                      <td className="p-3 text-muted-foreground">{t.kategori ?? "—"}</td>
                      <td className="p-3 text-muted-foreground">{t.yetkiliAdi ?? "—"}</td>
                      <td className="p-3 text-muted-foreground">{t.telefon ?? "—"}</td>
                      <td className="p-3">
                        <Badge variant="secondary">{t.degerlendirmeSayisi} değerlendirme</Badge>
                      </td>
                      <td className="p-3 text-right" onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" onClick={() => openTedarikciModal(t)}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteTedarikci.mutate(t.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </td>
                    </tr>
                    {expandedTedarikciId === t.id && (
                      <tr key={`${t.id}-expand`} className="border-t bg-muted/20">
                        <td colSpan={6} className="p-4">
                          <div className="flex justify-between items-center mb-3">
                            <span className="text-sm font-medium text-muted-foreground">Geçmiş Değerlendirmeler</span>
                            <Button size="sm" variant="outline" onClick={() => openDegerlendirmeModal(t.id)}>
                              <Plus className="w-4 h-4 mr-1" /> Yeni Değerlendirme
                            </Button>
                          </div>
                          {expandedDegerlendirmeler.length === 0 ? (
                            <p className="text-sm text-muted-foreground italic">Henüz değerlendirme yok.</p>
                          ) : (
                            <table className="w-full text-sm border rounded-lg overflow-hidden">
                              <thead className="bg-muted/50">
                                <tr>
                                  <th className="text-left p-2 font-medium">Tarih</th>
                                  <th className="text-left p-2 font-medium">Değerlendiren</th>
                                  <th className="text-left p-2 font-medium">Ort. Puan</th>
                                  <th className="text-right p-2 font-medium">İşlemler</th>
                                </tr>
                              </thead>
                              <tbody>
                                {expandedDegerlendirmeler.map(d => (
                                  <tr key={d.id} className="border-t">
                                    <td className="p-2">{d.tarih}</td>
                                    <td className="p-2 text-muted-foreground">{d.degerlendiren ?? "—"}</td>
                                    <td className="p-2">
                                      {d.ortPuan !== null ? (
                                        <Badge variant={d.ortPuan >= 4 ? "default" : d.ortPuan >= 3 ? "secondary" : "destructive"}>
                                          {d.ortPuan.toFixed(1)} / 5
                                        </Badge>
                                      ) : "—"}
                                    </td>
                                    <td className="p-2 text-right">
                                      <Button variant="ghost" size="icon" onClick={() => setGoruntuleModal({ open: true, tedarikciId: t.id, degerlendirmeId: d.id })}>
                                        <Eye className="w-4 h-4" />
                                      </Button>
                                      <Button variant="ghost" size="icon" onClick={() => deleteDegerlendirme.mutate({ tedarikciId: t.id, degerlendirmeId: d.id })}>
                                        <Trash2 className="w-4 h-4 text-destructive" />
                                      </Button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
                {tedarikcilar.length === 0 && (
                  <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Henüz tedarikçi yok.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ── Sekme 2: Değerlendirme Şablonu ── */}
        <TabsContent value="sablon">
          <div className="flex justify-end mb-3">
            <Button size="sm" onClick={() => openKriterModal(null)}>
              <Plus className="w-4 h-4 mr-1" /> Kriter Ekle
            </Button>
          </div>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium w-12">Sıra</th>
                  <th className="text-left p-3 font-medium">Kriter</th>
                  <th className="text-left p-3 font-medium">Tip</th>
                  <th className="text-right p-3 font-medium">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {kriterler.map((k, idx) => (
                  <tr key={k.id} className="border-t">
                    <td className="p-3 text-muted-foreground">{k.sira}</td>
                    <td className="p-3">{k.kriter}</td>
                    <td className="p-3">
                      <Badge variant="outline">{k.tip === "puan_1_5" ? "1-5 Puan" : "Açık Metin"}</Badge>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" disabled={idx === 0} onClick={() => moveKriter(k, "up")}><ArrowUp className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" disabled={idx === kriterler.length - 1} onClick={() => moveKriter(k, "down")}><ArrowDown className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => openKriterModal(k)}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteKriter.mutate(k.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {kriterler.length === 0 && (
                  <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Henüz kriter yok.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Tedarikçi Modal ── */}
      <Dialog open={tedarikciModal.open} onOpenChange={o => !o && setTedarikciModal({ open: false, editing: null })}>
        <DialogContent>
          <DialogHeader><DialogTitle>{tedarikciModal.editing ? "Tedarikçi Düzenle" : "Yeni Tedarikçi"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Ad *</Label><Input value={tedarikciForm.ad} onChange={e => setTedarikciForm(f => ({ ...f, ad: e.target.value }))} /></div>
            <div><Label>Kategori</Label><Input placeholder="ör. Hammadde, Hizmet" value={tedarikciForm.kategori} onChange={e => setTedarikciForm(f => ({ ...f, kategori: e.target.value }))} /></div>
            <div><Label>Yetkili Adı</Label><Input value={tedarikciForm.yetkiliAdi} onChange={e => setTedarikciForm(f => ({ ...f, yetkiliAdi: e.target.value }))} /></div>
            <div><Label>Telefon</Label><Input value={tedarikciForm.telefon} onChange={e => setTedarikciForm(f => ({ ...f, telefon: e.target.value }))} /></div>
            <div><Label>E-posta</Label><Input type="email" value={tedarikciForm.email} onChange={e => setTedarikciForm(f => ({ ...f, email: e.target.value }))} /></div>
            <div><Label>Açıklama</Label><Textarea value={tedarikciForm.aciklama} onChange={e => setTedarikciForm(f => ({ ...f, aciklama: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTedarikciModal({ open: false, editing: null })}>İptal</Button>
            <Button
              disabled={!tedarikciForm.ad}
              onClick={() => tedarikciModal.editing
                ? updateTedarikci.mutate({ id: tedarikciModal.editing.id, data: tedarikciForm })
                : createTedarikci.mutate(tedarikciForm)
              }
            >Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Kriter Modal ── */}
      <Dialog open={kriterModal.open} onOpenChange={o => !o && setKriterModal({ open: false, editing: null })}>
        <DialogContent>
          <DialogHeader><DialogTitle>{kriterModal.editing ? "Kriter Düzenle" : "Kriter Ekle"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Kriter Metni *</Label><Input value={kriterForm.kriter} onChange={e => setKriterForm(f => ({ ...f, kriter: e.target.value }))} /></div>
            <div>
              <Label>Tip *</Label>
              <Select value={kriterForm.tip} onValueChange={v => setKriterForm(f => ({ ...f, tip: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="puan_1_5">1-5 Puan</SelectItem>
                  <SelectItem value="acik_metin">Açık Metin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKriterModal({ open: false, editing: null })}>İptal</Button>
            <Button
              disabled={!kriterForm.kriter}
              onClick={() => {
                if (kriterModal.editing) {
                  updateKriter.mutate({ id: kriterModal.editing.id, data: { kriter: kriterForm.kriter, tip: kriterForm.tip, sira: kriterModal.editing.sira } });
                } else {
                  const maxSira = kriterler.length > 0 ? Math.max(...kriterler.map(k => k.sira)) : 0;
                  createKriter.mutate({ kriter: kriterForm.kriter, tip: kriterForm.tip, sira: maxSira + 1 } as any);
                }
              }}
            >Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Yeni Değerlendirme Modal ── */}
      <Dialog open={degerlendirmeModal.open} onOpenChange={o => !o && setDegerlendirmeModal({ open: false, tedarikciId: null })}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Yeni Değerlendirme</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Tarih *</Label><Input type="date" value={degerlendirmeForm.tarih} onChange={e => setDegerlendirmeForm(f => ({ ...f, tarih: e.target.value }))} /></div>
            <div><Label>Değerlendiren</Label><Input value={degerlendirmeForm.degerlendiren} onChange={e => setDegerlendirmeForm(f => ({ ...f, degerlendiren: e.target.value }))} /></div>
            <div><Label>Notlar</Label><Textarea value={degerlendirmeForm.notlar} onChange={e => setDegerlendirmeForm(f => ({ ...f, notlar: e.target.value }))} /></div>
            {kriterler.length > 0 && (
              <div className="space-y-4 border-t pt-4">
                <p className="text-sm font-medium">Kriterler</p>
                {kriterler.map(k => (
                  <div key={k.id} className="space-y-1">
                    <Label>{k.kriter}{k.tip === "puan_1_5" ? " *" : ""}</Label>
                    {k.tip === "puan_1_5" ? (
                      <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map(p => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setCevaplar(c => ({ ...c, [k.id]: { ...c[k.id], puan: p } }))}
                            className={`w-9 h-9 rounded-full border text-sm font-medium transition-colors ${cevaplar[k.id]?.puan === p ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
                          >{p}</button>
                        ))}
                      </div>
                    ) : (
                      <Textarea
                        value={cevaplar[k.id]?.cevap ?? ""}
                        onChange={e => setCevaplar(c => ({ ...c, [k.id]: { ...c[k.id], cevap: e.target.value } }))}
                        rows={2}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDegerlendirmeModal({ open: false, tedarikciId: null })}>İptal</Button>
            <Button disabled={degerlendirmeSaveDisabled} onClick={handleDegerlendirmeSubmit}>Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Değerlendirme Görüntüle Modal ── */}
      <Dialog open={goruntuleModal.open} onOpenChange={o => !o && setGoruntuleModal({ open: false, tedarikciId: null, degerlendirmeId: null })}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Değerlendirme Detayı</DialogTitle></DialogHeader>
          {goruntuleDetay && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Tarih:</span> <span className="font-medium">{goruntuleDetay.tarih}</span></div>
                <div><span className="text-muted-foreground">Değerlendiren:</span> <span className="font-medium">{goruntuleDetay.degerlendiren ?? "—"}</span></div>
              </div>
              {goruntuleDetay.notlar && <div className="text-sm"><span className="text-muted-foreground">Notlar:</span> <p className="mt-1">{goruntuleDetay.notlar}</p></div>}
              {goruntuleDetay.ortPuan !== null && (
                <div className="text-sm flex items-center gap-2">
                  <span className="text-muted-foreground">Ortalama Puan:</span>
                  <Badge variant={goruntuleDetay.ortPuan >= 4 ? "default" : goruntuleDetay.ortPuan >= 3 ? "secondary" : "destructive"}>
                    {goruntuleDetay.ortPuan.toFixed(1)} / 5
                  </Badge>
                </div>
              )}
              <div className="border-t pt-4 space-y-3">
                {kriterler.map(k => {
                  const c = goruntuleDetay.cevaplar.find(cv => cv.kriterId === k.id);
                  return (
                    <div key={k.id} className="text-sm">
                      <p className="font-medium mb-1">{k.kriter}</p>
                      {k.tip === "puan_1_5" ? (
                        <div className="flex gap-2">
                          {[1, 2, 3, 4, 5].map(p => (
                            <div key={p} className={`w-9 h-9 rounded-full border flex items-center justify-center text-sm font-medium ${c?.puan === p ? "bg-primary text-primary-foreground border-primary" : "border-muted text-muted-foreground"}`}>{p}</div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-muted-foreground">{c?.cevap ?? "—"}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setGoruntuleModal({ open: false, tedarikciId: null, degerlendirmeId: null })}>Kapat</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

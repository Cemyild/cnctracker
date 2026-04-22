import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Target, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

type KaliteOlcum = {
  id: string;
  hedefId: string;
  olcumTarihi: string;
  gerceklesenDeger: string;
  notlar: string | null;
  olusturmaTarihi: string;
};

type KaliteHedef = {
  id: string;
  baslik: string;
  hedefDeger: string;
  olcumBirimi: string;
  yon: string;
  sorumluKisi: string;
  terminTarihi: string;
  isoMaddesi: string | null;
  periyot: string;
  durum: string;
  olusturmaTarihi: string;
  sonOlcum: KaliteOlcum | null;
};

type KaliteOlcumWithHedef = KaliteOlcum & { hedef: KaliteHedef };

type Durum = "yok" | "yesil" | "sari" | "kirmizi";

function getDurum(hedef: KaliteHedef, sonOlcum: KaliteOlcum | null): Durum {
  if (!sonOlcum) return "yok";
  const g = Number(sonOlcum.gerceklesenDeger);
  const h = Number(hedef.hedefDeger);
  if (hedef.yon === "yuksek_iyi") {
    if (g >= h) return "yesil";
    if (g >= h * 0.8) return "sari";
    return "kirmizi";
  } else {
    if (g <= h) return "yesil";
    if (g <= h * 1.2) return "sari";
    return "kirmizi";
  }
}

function DurumBadge({ durum }: { durum: Durum }) {
  if (durum === "yok") return <Badge variant="secondary">Ölçüm Yok</Badge>;
  if (durum === "yesil") return <Badge className="bg-green-100 text-green-800 border-green-300">Hedefte</Badge>;
  if (durum === "sari") return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">Yakın</Badge>;
  return <Badge className="bg-red-100 text-red-800 border-red-300">Geride</Badge>;
}

const emptyHedefForm = { baslik: "", hedefDeger: "", olcumBirimi: "", yon: "yuksek_iyi", sorumluKisi: "", terminTarihi: "", isoMaddesi: "", periyot: "Aylık", durum: "Aktif" };

export default function ISO9001KaliteHedefleri() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [hedefModal, setHedefModal] = useState<{ open: boolean; editing: KaliteHedef | null }>({ open: false, editing: null });
  const [hedefForm, setHedefForm] = useState(emptyHedefForm);

  const [olcumModal, setOlcumModal] = useState<{ open: boolean; hedef: KaliteHedef | null }>({ open: false, hedef: null });
  const [olcumForm, setOlcumForm] = useState({ olcumTarihi: new Date().toISOString().split("T")[0], gerceklesenDeger: "", notlar: "" });

  const { data: hedefler = [] } = useQuery<KaliteHedef[]>({
    queryKey: ["/api/kalite-hedefleri"],
    queryFn: () => fetch("/api/kalite-hedefleri").then(r => r.json()),
  });

  const { data: olcumler = [] } = useQuery<KaliteOlcumWithHedef[]>({
    queryKey: ["/api/kalite-olcumler"],
    queryFn: () => fetch("/api/kalite-olcumler").then(r => r.json()),
  });

  const createHedefMutation = useMutation({
    mutationFn: (data: typeof emptyHedefForm) => fetch("/api/kalite-hedefleri", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/kalite-hedefleri"] });
      qc.invalidateQueries({ queryKey: ["/api/iso9001/stats"] });
      setHedefModal({ open: false, editing: null });
      setHedefForm(emptyHedefForm);
      toast({ title: "Hedef oluşturuldu" });
    },
    onError: () => toast({ title: "Hata", description: "Hedef oluşturulamadı", variant: "destructive" }),
  });

  const updateHedefMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof emptyHedefForm }) => fetch(`/api/kalite-hedefleri/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/kalite-hedefleri"] });
      qc.invalidateQueries({ queryKey: ["/api/iso9001/stats"] });
      setHedefModal({ open: false, editing: null });
      setHedefForm(emptyHedefForm);
      toast({ title: "Hedef güncellendi" });
    },
    onError: () => toast({ title: "Hata", description: "Hedef güncellenemedi", variant: "destructive" }),
  });

  const deleteHedefMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/kalite-hedefleri/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/kalite-hedefleri"] });
      qc.invalidateQueries({ queryKey: ["/api/iso9001/stats"] });
      toast({ title: "Hedef silindi" });
    },
    onError: () => toast({ title: "Hata", description: "Hedef silinemedi", variant: "destructive" }),
  });

  const createOlcumMutation = useMutation({
    mutationFn: (data: { hedefId: string; olcumTarihi: string; gerceklesenDeger: string; notlar: string }) =>
      fetch("/api/kalite-olcumler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/kalite-hedefleri"] });
      qc.invalidateQueries({ queryKey: ["/api/kalite-olcumler"] });
      qc.invalidateQueries({ queryKey: ["/api/iso9001/stats"] });
      setOlcumModal({ open: false, hedef: null });
      setOlcumForm({ olcumTarihi: new Date().toISOString().split("T")[0], gerceklesenDeger: "", notlar: "" });
      toast({ title: "Ölçüm eklendi" });
    },
    onError: () => toast({ title: "Hata", description: "Ölçüm eklenemedi", variant: "destructive" }),
  });

  const deleteOlcumMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/kalite-olcumler/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/kalite-hedefleri"] });
      qc.invalidateQueries({ queryKey: ["/api/kalite-olcumler"] });
      qc.invalidateQueries({ queryKey: ["/api/iso9001/stats"] });
      toast({ title: "Ölçüm silindi" });
    },
    onError: () => toast({ title: "Hata", description: "Ölçüm silinemedi", variant: "destructive" }),
  });

  function openYeniHedef() {
    setHedefForm(emptyHedefForm);
    setHedefModal({ open: true, editing: null });
  }

  function openDuzenle(hedef: KaliteHedef) {
    setHedefForm({
      baslik: hedef.baslik,
      hedefDeger: hedef.hedefDeger,
      olcumBirimi: hedef.olcumBirimi,
      yon: hedef.yon,
      sorumluKisi: hedef.sorumluKisi,
      terminTarihi: hedef.terminTarihi,
      isoMaddesi: hedef.isoMaddesi ?? "",
      periyot: hedef.periyot,
      durum: hedef.durum,
    });
    setHedefModal({ open: true, editing: hedef });
  }

  function submitHedef() {
    const payload = { ...hedefForm, isoMaddesi: hedefForm.isoMaddesi || null };
    if (hedefModal.editing) {
      updateHedefMutation.mutate({ id: hedefModal.editing.id, data: payload as typeof emptyHedefForm });
    } else {
      createHedefMutation.mutate(payload as typeof emptyHedefForm);
    }
  }

  const hedefFormValid = hedefForm.baslik && hedefForm.hedefDeger && hedefForm.olcumBirimi && hedefForm.sorumluKisi && hedefForm.terminTarihi && hedefForm.periyot;
  const isPendingHedef = createHedefMutation.isPending || updateHedefMutation.isPending;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Target className="w-7 h-7 text-primary" />
          <h2 className="text-2xl font-semibold">Kalite Hedefleri & KPI</h2>
        </div>
        <Button onClick={openYeniHedef}>
          <Plus className="w-4 h-4 mr-2" /> Yeni Hedef
        </Button>
      </div>

      <Tabs defaultValue="hedefler">
        <TabsList className="mb-4">
          <TabsTrigger value="hedefler">Hedefler</TabsTrigger>
          <TabsTrigger value="olcumler">Ölçümler</TabsTrigger>
        </TabsList>

        <TabsContent value="hedefler">
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Başlık</th>
                  <th className="text-left p-3 font-medium">ISO Maddesi</th>
                  <th className="text-left p-3 font-medium">Periyot</th>
                  <th className="text-left p-3 font-medium">Hedef</th>
                  <th className="text-left p-3 font-medium">Son Ölçüm</th>
                  <th className="text-left p-3 font-medium">Durum</th>
                  <th className="text-left p-3 font-medium">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {hedefler.length === 0 && (
                  <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Henüz hedef yok</td></tr>
                )}
                {hedefler.map(hedef => {
                  const durum = getDurum(hedef, hedef.sonOlcum);
                  return (
                    <tr key={hedef.id} className="border-t hover:bg-muted/20">
                      <td className="p-3 font-medium">{hedef.baslik}</td>
                      <td className="p-3 text-muted-foreground">{hedef.isoMaddesi ?? "—"}</td>
                      <td className="p-3 text-muted-foreground">{hedef.periyot}</td>
                      <td className="p-3">{hedef.hedefDeger} {hedef.olcumBirimi}</td>
                      <td className="p-3 text-muted-foreground">
                        {hedef.sonOlcum ? `${hedef.sonOlcum.gerceklesenDeger} ${hedef.olcumBirimi}` : "—"}
                      </td>
                      <td className="p-3"><DurumBadge durum={durum} /></td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => {
                            setOlcumModal({ open: true, hedef });
                            setOlcumForm({ olcumTarihi: new Date().toISOString().split("T")[0], gerceklesenDeger: "", notlar: "" });
                          }}>
                            <Plus className="w-4 h-4 mr-1" /> Ölçüm Gir
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => openDuzenle(hedef)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700"
                            onClick={() => { if (confirm("Bu hedef ve tüm ölçümleri silinecek. Emin misiniz?")) deleteHedefMutation.mutate(hedef.id); }}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="olcumler">
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Tarih</th>
                  <th className="text-left p-3 font-medium">Hedef</th>
                  <th className="text-left p-3 font-medium">Hedef Değer</th>
                  <th className="text-left p-3 font-medium">Gerçekleşen</th>
                  <th className="text-left p-3 font-medium">Durum</th>
                  <th className="text-left p-3 font-medium">Notlar</th>
                  <th className="text-left p-3 font-medium">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {olcumler.length === 0 && (
                  <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Henüz ölçüm yok</td></tr>
                )}
                {olcumler.map(olcum => {
                  const durum = getDurum(olcum.hedef, olcum);
                  return (
                    <tr key={olcum.id} className="border-t hover:bg-muted/20">
                      <td className="p-3">{olcum.olcumTarihi}</td>
                      <td className="p-3 font-medium">{olcum.hedef.baslik}</td>
                      <td className="p-3 text-muted-foreground">{olcum.hedef.hedefDeger} {olcum.hedef.olcumBirimi}</td>
                      <td className="p-3">{olcum.gerceklesenDeger} {olcum.hedef.olcumBirimi}</td>
                      <td className="p-3"><DurumBadge durum={durum} /></td>
                      <td className="p-3 text-muted-foreground">{olcum.notlar ?? "—"}</td>
                      <td className="p-3">
                        <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700"
                          onClick={() => { if (confirm("Bu ölçüm silinecek. Emin misiniz?")) deleteOlcumMutation.mutate(olcum.id); }}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Hedef Modal */}
      <Dialog open={hedefModal.open} onOpenChange={open => { if (!open) setHedefModal({ open: false, editing: null }); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{hedefModal.editing ? "Hedefi Düzenle" : "Yeni Hedef"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Başlık *</Label>
              <Input value={hedefForm.baslik} onChange={e => setHedefForm(f => ({ ...f, baslik: e.target.value }))} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Hedef Değer *</Label>
                <Input type="number" value={hedefForm.hedefDeger} onChange={e => setHedefForm(f => ({ ...f, hedefDeger: e.target.value }))} />
              </div>
              <div>
                <Label>Birim *</Label>
                <Input placeholder="%, adet, gün..." value={hedefForm.olcumBirimi} onChange={e => setHedefForm(f => ({ ...f, olcumBirimi: e.target.value }))} />
              </div>
              <div>
                <Label>Yön *</Label>
                <Select value={hedefForm.yon} onValueChange={v => setHedefForm(f => ({ ...f, yon: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yuksek_iyi">↑ Yüksek iyi</SelectItem>
                    <SelectItem value="dusuk_iyi">↓ Düşük iyi</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Sorumlu Kişi *</Label>
                <Input value={hedefForm.sorumluKisi} onChange={e => setHedefForm(f => ({ ...f, sorumluKisi: e.target.value }))} />
              </div>
              <div>
                <Label>Termin Tarihi *</Label>
                <Input type="date" value={hedefForm.terminTarihi} onChange={e => setHedefForm(f => ({ ...f, terminTarihi: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>ISO Maddesi</Label>
                <Input placeholder="8.2.1" value={hedefForm.isoMaddesi} onChange={e => setHedefForm(f => ({ ...f, isoMaddesi: e.target.value }))} />
              </div>
              <div>
                <Label>Periyot *</Label>
                <Select value={hedefForm.periyot} onValueChange={v => setHedefForm(f => ({ ...f, periyot: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Aylık">Aylık</SelectItem>
                    <SelectItem value="Çeyreklik">Çeyreklik</SelectItem>
                    <SelectItem value="Yıllık">Yıllık</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Durum *</Label>
                <Select value={hedefForm.durum} onValueChange={v => setHedefForm(f => ({ ...f, durum: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Aktif">Aktif</SelectItem>
                    <SelectItem value="Pasif">Pasif</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHedefModal({ open: false, editing: null })}>İptal</Button>
            <Button onClick={submitHedef} disabled={!hedefFormValid || isPendingHedef}>
              {isPendingHedef ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ölçüm Modal */}
      <Dialog open={olcumModal.open} onOpenChange={open => { if (!open) setOlcumModal({ open: false, hedef: null }); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Ölçüm Gir — {olcumModal.hedef?.baslik}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Ölçüm Tarihi *</Label>
              <Input type="date" value={olcumForm.olcumTarihi} onChange={e => setOlcumForm(f => ({ ...f, olcumTarihi: e.target.value }))} />
            </div>
            <div>
              <Label>Gerçekleşen Değer * ({olcumModal.hedef?.olcumBirimi})</Label>
              <Input type="number" value={olcumForm.gerceklesenDeger} onChange={e => setOlcumForm(f => ({ ...f, gerceklesenDeger: e.target.value }))} />
            </div>
            <div>
              <Label>Notlar</Label>
              <Textarea value={olcumForm.notlar} onChange={e => setOlcumForm(f => ({ ...f, notlar: e.target.value }))} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOlcumModal({ open: false, hedef: null })}>İptal</Button>
            <Button
              onClick={() => createOlcumMutation.mutate({ hedefId: olcumModal.hedef!.id, olcumTarihi: olcumForm.olcumTarihi, gerceklesenDeger: olcumForm.gerceklesenDeger, notlar: olcumForm.notlar })}
              disabled={!olcumForm.olcumTarihi || !olcumForm.gerceklesenDeger || createOlcumMutation.isPending}
            >
              {createOlcumMutation.isPending ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

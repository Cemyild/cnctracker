import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { type BakimVarlik, type BakimKayit } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Wrench, Plus, Edit, Trash2, Car, Monitor, Settings, ChevronLeft } from "lucide-react";

type VarlikWithStats = BakimVarlik & { sonBakimTarihi: string | null; kayitSayisi: number };
type VarlikWithKayitlar = BakimVarlik & { kayitlar: BakimKayit[] };

const KATEGORI_TABS = [
  { value: "arac", label: "Araçlar", icon: Car },
  { value: "donanim", label: "Donanım", icon: Monitor },
  { value: "cihaz", label: "Cihazlar", icon: Settings },
];

const emptyVarlikForm = {
  kategori: "arac",
  marka: "",
  model: "",
  plaka: "",
  kod: "",
  aciklama: "",
  bakimPeriyodu: "",
};

const emptyKayitForm = {
  bakimTarihi: "",
  km: "",
  yapilanIslemler: "",
  faturaNu: "",
};

export default function ISO9001BakimOnarim() {
  const { toast } = useToast();
  const [aktifKategori, setAktifKategori] = useState("arac");
  const [selectedVarlik, setSelectedVarlik] = useState<VarlikWithKayitlar | null>(null);
  const [varlikDialogOpen, setVarlikDialogOpen] = useState(false);
  const [editVarlikId, setEditVarlikId] = useState<string | null>(null);
  const [varlikForm, setVarlikForm] = useState(emptyVarlikForm);
  const [kayitForm, setKayitForm] = useState(emptyKayitForm);
  const [editKayitId, setEditKayitId] = useState<string | null>(null);
  const [kayitFormOpen, setKayitFormOpen] = useState(false);

  const { data: varliklar = [] } = useQuery<VarlikWithStats[]>({
    queryKey: ["/api/bakim/varliklar", aktifKategori],
    queryFn: () => fetch(`/api/bakim/varliklar?kategori=${aktifKategori}`).then(r => r.json()),
  });

  const { data: varlikDetay, refetch: refetchDetay } = useQuery<VarlikWithKayitlar>({
    queryKey: ["/api/bakim/varliklar", selectedVarlik?.id],
    queryFn: () => fetch(`/api/bakim/varliklar/${selectedVarlik!.id}`).then(r => r.json()),
    enabled: !!selectedVarlik,
  });

  const saveVarlikMutation = useMutation({
    mutationFn: async () => {
      const url = editVarlikId ? `/api/bakim/varliklar/${editVarlikId}` : "/api/bakim/varliklar";
      const method = editVarlikId ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...varlikForm, kategori: aktifKategori }) });
      if (!res.ok) throw new Error();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bakim/varliklar", aktifKategori] });
      queryClient.invalidateQueries({ queryKey: ["/api/iso9001/stats"] });
      setVarlikDialogOpen(false);
      setEditVarlikId(null);
      setVarlikForm(emptyVarlikForm);
      toast({ title: editVarlikId ? "Varlık güncellendi" : "Varlık eklendi" });
    },
    onError: () => toast({ title: "Hata", variant: "destructive" }),
  });

  const deleteVarlikMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/bakim/varliklar/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bakim/varliklar", aktifKategori] });
      queryClient.invalidateQueries({ queryKey: ["/api/iso9001/stats"] });
      if (selectedVarlik) setSelectedVarlik(null);
      toast({ title: "Varlık silindi" });
    },
  });

  const saveKayitMutation = useMutation({
    mutationFn: async () => {
      const url = editKayitId ? `/api/bakim/kayitlar/${editKayitId}` : `/api/bakim/varliklar/${selectedVarlik!.id}/kayitlar`;
      const method = editKayitId ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(kayitForm) });
      if (!res.ok) throw new Error();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bakim/varliklar", selectedVarlik?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/bakim/varliklar", aktifKategori] });
      refetchDetay();
      setKayitFormOpen(false);
      setEditKayitId(null);
      setKayitForm(emptyKayitForm);
      toast({ title: editKayitId ? "Kayıt güncellendi" : "Bakım kaydı eklendi" });
    },
    onError: () => toast({ title: "Hata", variant: "destructive" }),
  });

  const deleteKayitMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/bakim/kayitlar/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bakim/varliklar", selectedVarlik?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/bakim/varliklar", aktifKategori] });
      refetchDetay();
      toast({ title: "Bakım kaydı silindi" });
    },
  });

  function openNewVarlik() {
    setEditVarlikId(null);
    setVarlikForm({ ...emptyVarlikForm, kategori: aktifKategori });
    setVarlikDialogOpen(true);
  }

  function openEditVarlik(v: VarlikWithStats) {
    setEditVarlikId(v.id);
    setVarlikForm({
      kategori: v.kategori,
      marka: v.marka,
      model: v.model ?? "",
      plaka: v.plaka ?? "",
      kod: v.kod ?? "",
      aciklama: v.aciklama ?? "",
      bakimPeriyodu: v.bakimPeriyodu ?? "",
    });
    setVarlikDialogOpen(true);
  }

  async function openKimlikKarti(v: VarlikWithStats) {
    const res = await fetch(`/api/bakim/varliklar/${v.id}`);
    const data: VarlikWithKayitlar = await res.json();
    setSelectedVarlik(data);
    setKayitFormOpen(false);
    setEditKayitId(null);
    setKayitForm(emptyKayitForm);
  }

  function openNewKayit() {
    setEditKayitId(null);
    setKayitForm(emptyKayitForm);
    setKayitFormOpen(true);
  }

  function openEditKayit(k: BakimKayit) {
    setEditKayitId(k.id);
    setKayitForm({
      bakimTarihi: k.bakimTarihi,
      km: k.km ?? "",
      yapilanIslemler: k.yapilanIslemler,
      faturaNu: k.faturaNu ?? "",
    });
    setKayitFormOpen(true);
  }

  const isArac = aktifKategori === "arac";
  const displayData = selectedVarlik?.id ? (varlikDetay ?? selectedVarlik) : null;

  if (selectedVarlik) {
    const kayitlar = (displayData as VarlikWithKayitlar)?.kayitlar ?? [];
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => setSelectedVarlik(null)}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <Wrench className="w-6 h-6 text-primary" />
          <div>
            <h2 className="text-xl font-semibold">Araç/Cihaz Kimlik Kartı</h2>
            <p className="text-sm text-muted-foreground">Bakım & Onarım</p>
          </div>
        </div>

        {/* Kimlik Bilgileri */}
        <div className="rounded-xl border bg-card p-5 mb-5">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
            {isArac ? "Araç Kimlik Kartı" : "Cihaz Kimlik Kartı"}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div><span className="text-muted-foreground">Marka:</span> <span className="font-medium ml-1">{selectedVarlik.marka}</span></div>
            <div><span className="text-muted-foreground">Model:</span> <span className="font-medium ml-1">{selectedVarlik.model ?? "—"}</span></div>
            {isArac
              ? <div><span className="text-muted-foreground">Plakası:</span> <span className="font-medium ml-1">{selectedVarlik.plaka ?? "—"}</span></div>
              : <div><span className="text-muted-foreground">Kodu:</span> <span className="font-medium ml-1">{selectedVarlik.kod ?? "—"}</span></div>
            }
            <div><span className="text-muted-foreground">Bakım Periyodu:</span> <span className="font-medium ml-1">{selectedVarlik.bakimPeriyodu ?? "—"}</span></div>
            {selectedVarlik.aciklama && (
              <div className="col-span-2"><span className="text-muted-foreground">Açıklama:</span> <span className="font-medium ml-1">{selectedVarlik.aciklama}</span></div>
            )}
          </div>
        </div>

        {/* Bakım Bilgileri */}
        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between p-4 border-b">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Bakım Bilgileri</h3>
            <Button size="sm" onClick={openNewKayit}><Plus className="w-4 h-4 mr-1" />Bakım Ekle</Button>
          </div>

          {kayitFormOpen && (
            <div className="p-4 border-b bg-muted/30">
              <p className="text-sm font-medium mb-3">{editKayitId ? "Kaydı Düzenle" : "Yeni Bakım Kaydı"}</p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <Label className="text-xs">Bakım Tarihi *</Label>
                  <Input type="date" value={kayitForm.bakimTarihi} onChange={e => setKayitForm(f => ({ ...f, bakimTarihi: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">KM</Label>
                  <Input placeholder="örn. 85.000" value={kayitForm.km} onChange={e => setKayitForm(f => ({ ...f, km: e.target.value }))} />
                </div>
              </div>
              <div className="mb-3">
                <Label className="text-xs">Yapılan İşlemler *</Label>
                <Textarea rows={2} value={kayitForm.yapilanIslemler} onChange={e => setKayitForm(f => ({ ...f, yapilanIslemler: e.target.value }))} />
              </div>
              <div className="mb-3">
                <Label className="text-xs">Fatura / Servis No</Label>
                <Input placeholder="örn. SER2024000000388" value={kayitForm.faturaNu} onChange={e => setKayitForm(f => ({ ...f, faturaNu: e.target.value }))} />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => saveKayitMutation.mutate()} disabled={saveKayitMutation.isPending || !kayitForm.bakimTarihi || !kayitForm.yapilanIslemler}>
                  {saveKayitMutation.isPending ? "Kaydediliyor..." : "Kaydet"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setKayitFormOpen(false); setEditKayitId(null); setKayitForm(emptyKayitForm); }}>İptal</Button>
              </div>
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">Bakım Tarihi</TableHead>
                <TableHead>KM</TableHead>
                <TableHead>Yapılan İşlemler</TableHead>
                <TableHead className="whitespace-nowrap">Fatura / Servis No</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {kayitlar.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Bakım kaydı yok</TableCell></TableRow>
              )}
              {kayitlar.map(k => (
                <TableRow key={k.id}>
                  <TableCell className="whitespace-nowrap font-medium">{k.bakimTarihi}</TableCell>
                  <TableCell className="text-sm">{k.km ?? "—"}</TableCell>
                  <TableCell className="text-sm">{k.yapilanIslemler}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{k.faturaNu ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEditKayit(k)}><Edit className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteKayitMutation.mutate(k.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <Wrench className="w-7 h-7 text-primary" />
        <h2 className="text-2xl font-semibold">Bakım & Onarım</h2>
      </div>

      <Tabs value={aktifKategori} onValueChange={v => { setAktifKategori(v); setSelectedVarlik(null); }}>
        <div className="flex items-center justify-between mb-4">
          <TabsList>
            {KATEGORI_TABS.map(t => (
              <TabsTrigger key={t.value} value={t.value} className="flex items-center gap-1.5">
                <t.icon className="w-4 h-4" />{t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <Button onClick={openNewVarlik}><Plus className="w-4 h-4 mr-2" />Yeni Ekle</Button>
        </div>

        {KATEGORI_TABS.map(t => (
          <TabsContent key={t.value} value={t.value}>
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Marka</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>{t.value === "arac" ? "Plaka" : "Kod"}</TableHead>
                    <TableHead className="whitespace-nowrap">Bakım Periyodu</TableHead>
                    <TableHead className="whitespace-nowrap">Son Bakım</TableHead>
                    <TableHead className="text-center">Kayıt</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {varliklar.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Kayıt yok</TableCell></TableRow>
                  )}
                  {varliklar.map(v => (
                    <TableRow key={v.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openKimlikKarti(v)}>
                      <TableCell className="font-medium">{v.marka}</TableCell>
                      <TableCell>{v.model ?? "—"}</TableCell>
                      <TableCell>
                        {t.value === "arac"
                          ? <Badge variant="outline" className="font-mono text-xs">{v.plaka ?? "—"}</Badge>
                          : <span className="text-sm">{v.kod ?? "—"}</span>
                        }
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{v.bakimPeriyodu ?? "—"}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{v.sonBakimTarihi ?? "—"}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{v.kayitSayisi}</Badge>
                      </TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditVarlik(v)}><Edit className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteVarlikMutation.mutate(v.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* Varlık Ekle/Düzenle Dialog */}
      <Dialog open={varlikDialogOpen} onOpenChange={setVarlikDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editVarlikId ? "Varlık Düzenle" : "Yeni Varlık Ekle"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Marka *</Label>
                <Input value={varlikForm.marka} onChange={e => setVarlikForm(f => ({ ...f, marka: e.target.value }))} />
              </div>
              <div>
                <Label>Model</Label>
                <Input value={varlikForm.model} onChange={e => setVarlikForm(f => ({ ...f, model: e.target.value }))} />
              </div>
            </div>
            {aktifKategori === "arac" ? (
              <div>
                <Label>Plaka</Label>
                <Input placeholder="örn. 16 CNC 47" value={varlikForm.plaka} onChange={e => setVarlikForm(f => ({ ...f, plaka: e.target.value }))} />
              </div>
            ) : (
              <div>
                <Label>Kod</Label>
                <Input value={varlikForm.kod} onChange={e => setVarlikForm(f => ({ ...f, kod: e.target.value }))} />
              </div>
            )}
            <div>
              <Label>Bakım Periyodu</Label>
              <Input placeholder="örn. 15.000 km / 1 YIL" value={varlikForm.bakimPeriyodu} onChange={e => setVarlikForm(f => ({ ...f, bakimPeriyodu: e.target.value }))} />
            </div>
            <div>
              <Label>Açıklama</Label>
              <Input placeholder="örn. 308 (Merkez)" value={varlikForm.aciklama} onChange={e => setVarlikForm(f => ({ ...f, aciklama: e.target.value }))} />
            </div>
            <Button className="w-full" onClick={() => saveVarlikMutation.mutate()} disabled={saveVarlikMutation.isPending || !varlikForm.marka}>
              {saveVarlikMutation.isPending ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

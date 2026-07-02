import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { type BakimVarlik, type BakimKayit } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Wrench, Plus, Edit, Trash2, Car, Monitor, Settings, ChevronLeft } from "lucide-react";

type VarlikWithStats = BakimVarlik & { sonBakimTarihi: string | null; kayitSayisi: number };
type VarlikWithKayitlar = BakimVarlik & { kayitlar: BakimKayit[] };

function formatTarih(s: string | null | undefined): string {
  if (!s) return "—";
  const p = s.split("-");
  if (p.length !== 3) return s;
  return `${p[2]}/${p[1]}/${p[0]}`;
}

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

  // ================= KİMLİK KARTI GÖRÜNÜMÜ =================
  if (selectedVarlik) {
    const kayitlar = (displayData as VarlikWithKayitlar)?.kayitlar ?? [];
    return (
      <div className="min-h-full bg-slate-50 dark:bg-background">
        <div className="px-6 pb-12 pt-5 lg:px-8">
          {/* Listeye Dön */}
          <button
            onClick={() => setSelectedVarlik(null)}
            className="mb-4 inline-flex items-center gap-1.5 rounded-[9px] border bg-card px-3 py-2 text-[12.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <ChevronLeft className="h-4 w-4" />
            Listeye Dön
          </button>

          {/* Kimlik Bilgileri */}
          <div className="mb-4 rounded-[14px] border bg-card p-6">
            <div className="mb-5 flex items-center gap-3.5">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[12px] bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400">
                <Wrench className="h-6 w-6" strokeWidth={1.8} />
              </div>
              <div>
                <div className="text-[17px] font-extrabold text-foreground">{selectedVarlik.marka} {selectedVarlik.model ?? ""}</div>
                <div className="text-[12.5px] text-muted-foreground">{isArac ? "Araç Kimlik Kartı" : "Cihaz/Ekipman Kimlik Kartı"}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Marka</div>
                <div className="mt-1 text-[13.5px] font-bold text-slate-800 dark:text-slate-100">{selectedVarlik.marka}</div>
              </div>
              <div>
                <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Model</div>
                <div className="mt-1 text-[13.5px] font-bold text-slate-800 dark:text-slate-100">{selectedVarlik.model ?? "—"}</div>
              </div>
              <div>
                <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">{isArac ? "Plaka" : "Kod"}</div>
                <div className="mt-1">
                  {isArac
                    ? <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[12.5px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{selectedVarlik.plaka ?? "—"}</span>
                    : <span className="text-[13.5px] font-bold text-slate-800 dark:text-slate-100">{selectedVarlik.kod ?? "—"}</span>
                  }
                </div>
              </div>
              {/* Bakım Periyodu — accent kart */}
              <div className="rounded-[11px] border border-sky-100 bg-sky-50 px-3 py-2 dark:border-sky-950/40 dark:bg-sky-950/20">
                <div className="text-[10.5px] font-bold uppercase tracking-wide" style={{ color: "#0369a1" }}>Bakım Periyodu</div>
                <div className="mt-1 text-[13.5px] font-bold tabular-nums text-slate-900 dark:text-slate-100">{selectedVarlik.bakimPeriyodu ?? "—"}</div>
              </div>
              {selectedVarlik.aciklama && (
                <div className="col-span-2 sm:col-span-4">
                  <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Açıklama</div>
                  <div className="mt-1 text-[13px] text-slate-600 dark:text-slate-300">{selectedVarlik.aciklama}</div>
                </div>
              )}
            </div>
          </div>

          {/* Bakım Bilgileri */}
          <div className="overflow-hidden rounded-[14px] border bg-card">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h3 className="text-[15px] font-bold">Bakım Bilgileri</h3>
              <Button size="sm" onClick={openNewKayit} className="bg-slate-900 text-white hover:bg-slate-800"><Plus className="mr-1.5 h-4 w-4" />Bakım Ekle</Button>
            </div>

            {kayitFormOpen && (
              <div className="border-b bg-slate-50 p-4 dark:bg-slate-900/20">
                <p className="mb-3 text-sm font-semibold">{editKayitId ? "Kaydı Düzenle" : "Yeni Bakım Kaydı"}</p>
                <div className="mb-3 grid grid-cols-2 gap-3">
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

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="whitespace-nowrap text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Bakım Tarihi</TableHead>
                    <TableHead className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">KM</TableHead>
                    <TableHead className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Yapılan İşlemler</TableHead>
                    <TableHead className="whitespace-nowrap text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Fatura / Servis No</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {kayitlar.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">Bakım kaydı yok</TableCell></TableRow>
                  )}
                  {kayitlar.map(k => (
                    <TableRow key={k.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <TableCell className="whitespace-nowrap font-semibold tabular-nums text-slate-800 dark:text-slate-100">{formatTarih(k.bakimTarihi)}</TableCell>
                      <TableCell className="text-sm tabular-nums text-muted-foreground">{k.km ?? "—"}</TableCell>
                      <TableCell className="text-sm text-slate-600 dark:text-slate-300">{k.yapilanIslemler}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{k.faturaNu ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditKayit(k)}><Edit className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteKayitMutation.mutate(k.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ================= LİSTE GÖRÜNÜMÜ =================
  const kategoriLabel = KATEGORI_TABS.find(t => t.value === aktifKategori)?.label ?? "";
  const toplamBakim = varliklar.reduce((a, v) => a + (v.kayitSayisi ?? 0), 0);
  const sonBakimEnGuncel = varliklar.reduce<string | null>((max, v) => {
    if (!v.sonBakimTarihi) return max;
    return !max || v.sonBakimTarihi > max ? v.sonBakimTarihi : max;
  }, null);
  const kpis = [
    { label: "Varlık", value: String(varliklar.length), sub: isArac ? "kayıtlı araç" : "kayıtlı ekipman", color: "#0ea5e9" },
    { label: "Toplam Bakım", value: String(toplamBakim), sub: "kayıtlı işlem", color: "#7c3aed" },
    { label: "Son Bakım", value: formatTarih(sonBakimEnGuncel), sub: "en güncel", color: "#16a34a" },
    { label: "Kategori", value: kategoriLabel, sub: "aktif filtre", color: "#d97706" },
  ];

  return (
    <div className="min-h-full bg-slate-50 dark:bg-background">
      <div className="px-6 pb-12 lg:px-8">
        <Tabs value={aktifKategori} className="w-full">
          {/* ===== STICKY HEADER + TABS ===== */}
          <div className="sticky top-0 z-20 border-b border-border/70 bg-slate-50/90 pt-5 backdrop-blur dark:bg-background/90">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400">
                  <Wrench className="h-[22px] w-[22px]" strokeWidth={1.9} />
                </div>
                <div>
                  <h1 className="text-[21px] font-extrabold tracking-tight">Bakım & Onarım</h1>
                  <p className="mt-0.5 text-[12.5px] text-muted-foreground">ISO 9001 · varlık kimlik kartları ve bakım geçmişi · satıra tıklayarak kart</p>
                </div>
              </div>
              <Button onClick={openNewVarlik} className="h-[38px] bg-slate-900 text-white hover:bg-slate-800"><Plus className="mr-2 h-4 w-4" />Yeni Ekle</Button>
            </div>
            {/* Kategori sekmeleri */}
            <div className="mt-3.5 flex gap-1">
              {KATEGORI_TABS.map(t => {
                const active = aktifKategori === t.value;
                return (
                  <button
                    key={t.value}
                    onClick={() => { setAktifKategori(t.value); setSelectedVarlik(null); }}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-t-lg px-3.5 py-2.5 text-[13.5px] transition-colors",
                      active
                        ? "font-bold text-foreground shadow-[inset_0_-2px_0_#0ea5e9]"
                        : "font-semibold text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <t.icon className="h-4 w-4" />
                    {t.label}
                    {active && (
                      <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-sky-100 px-1.5 text-[10.5px] font-extrabold text-sky-700 tabular-nums dark:bg-sky-950/50 dark:text-sky-300">
                        {varliklar.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* KPI şeridi — listeden türetilir */}
          <div className="mt-5 grid grid-cols-2 gap-3.5 md:grid-cols-4">
            {kpis.map(k => (
              <div key={k.label} className="relative overflow-hidden rounded-[14px] border bg-card p-4">
                <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: k.color }} />
                <div className="pl-2 text-[10.5px] font-bold uppercase leading-tight tracking-wide text-muted-foreground">{k.label}</div>
                <div className="mt-2 pl-2 text-[22px] font-extrabold tracking-tight tabular-nums">{k.value}</div>
                <div className="mt-0.5 pl-2 text-[11.5px] text-muted-foreground">{k.sub}</div>
              </div>
            ))}
          </div>

          {KATEGORI_TABS.map(t => (
            <TabsContent key={t.value} value={t.value} className="mt-4">
              <div className="overflow-hidden rounded-[14px] border bg-card">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Marka</TableHead>
                        <TableHead className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Model</TableHead>
                        <TableHead className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">{t.value === "arac" ? "Plaka" : "Kod"}</TableHead>
                        <TableHead className="whitespace-nowrap text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Bakım Periyodu</TableHead>
                        <TableHead className="whitespace-nowrap text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Son Bakım</TableHead>
                        <TableHead className="text-center text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Kayıt</TableHead>
                        <TableHead className="w-20"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {varliklar.length === 0 && (
                        <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Kayıt yok</TableCell></TableRow>
                      )}
                      {varliklar.map(v => (
                        <TableRow key={v.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40" onClick={() => openKimlikKarti(v)}>
                          <TableCell className="font-bold text-slate-800 dark:text-slate-100">{v.marka}</TableCell>
                          <TableCell className="text-slate-600 dark:text-slate-300">{v.model ?? "—"}</TableCell>
                          <TableCell>
                            {t.value === "arac"
                              ? <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11.5px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{v.plaka ?? "—"}</span>
                              : <span className="text-sm text-slate-600 dark:text-slate-300">{v.kod ?? "—"}</span>
                            }
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{v.bakimPeriyodu ?? "—"}</TableCell>
                          <TableCell className="whitespace-nowrap text-sm tabular-nums text-slate-600 dark:text-slate-300">{formatTarih(v.sonBakimTarihi)}</TableCell>
                          <TableCell className="text-center">
                            <span className="inline-flex min-w-[28px] items-center justify-center rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">{v.kayitSayisi}</span>
                          </TableCell>
                          <TableCell onClick={e => e.stopPropagation()}>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEditVarlik(v)}><Edit className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => deleteVarlikMutation.mutate(v.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
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
            <div className="mt-2 space-y-3">
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
    </div>
  );
}

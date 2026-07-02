import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Target, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

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

// Durum → etiket + yumuşak zemin/koyu metin + ilerleme barı rengi (referansla birebir)
const durumMeta: Record<Durum, { label: string; bg: string; text: string; bar: string }> = {
  yesil: { label: "Hedefte", bg: "#dcfce7", text: "#15803d", bar: "#16a34a" },
  sari: { label: "Yakın", bg: "#fef9c3", text: "#a16207", bar: "#eab308" },
  kirmizi: { label: "Geride", bg: "#fee2e2", text: "#b91c1c", bar: "#dc2626" },
  yok: { label: "Ölçüm Yok", bg: "#f1f5f9", text: "#64748b", bar: "#94a3b8" },
};

function DurumBadge({ durum }: { durum: Durum }) {
  const m = durumMeta[durum];
  return (
    <span
      className="inline-block rounded-full px-2.5 py-1 text-[11px] font-bold"
      style={{ background: m.bg, color: m.text }}
    >
      {m.label}
    </span>
  );
}

// Görsel gerçekleşme yüzdesi (yuksek_iyi → son/hedef; dusuk_iyi → hedef/son), 0–120 aralığına kırpılır
function gerceklesmePct(hedef: KaliteHedef, sonOlcum: KaliteOlcum | null): number | null {
  if (!sonOlcum) return null;
  const g = Number(sonOlcum.gerceklesenDeger);
  const h = Number(hedef.hedefDeger);
  if (!h || !isFinite(g)) return null;
  const ratio = hedef.yon === "yuksek_iyi" ? g / h : h / g;
  return Math.max(0, Math.min(120, Math.round(ratio * 100)));
}

const emptyHedefForm = { baslik: "", hedefDeger: "", olcumBirimi: "", yon: "yuksek_iyi", sorumluKisi: "", terminTarihi: "", isoMaddesi: "", periyot: "Aylık", durum: "Aktif" };

export default function ISO9001KaliteHedefleri() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [tab, setTab] = useState<string>("hedefler");

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

  // KPI sayıları — listeden türetilir (sabit yazılmaz)
  const durumSayilari = hedefler.reduce(
    (acc, h) => {
      acc[getDurum(h, h.sonOlcum)] += 1;
      return acc;
    },
    { yok: 0, yesil: 0, sari: 0, kirmizi: 0 } as Record<Durum, number>,
  );
  const kpis: { label: string; value: number; sub: string; color: string; valColor?: string }[] = [
    { label: "Toplam Hedef", value: hedefler.length, sub: "aktif KPI", color: "#0ea5e9" },
    { label: "Hedefte", value: durumSayilari.yesil, sub: "hedefi tutturan", color: "#16a34a", valColor: "#16a34a" },
    { label: "Yakın", value: durumSayilari.sari, sub: "sınırda · izlemede", color: "#eab308", valColor: "#a16207" },
    { label: "Geride", value: durumSayilari.kirmizi, sub: "aksiyon gerekli", color: "#dc2626", valColor: "#dc2626" },
  ];

  const TABS = [
    { id: "hedefler", label: "Hedefler", count: hedefler.length },
    { id: "olcumler", label: "Ölçümler", count: olcumler.length },
  ];

  return (
    <div className="min-h-full bg-slate-50 dark:bg-background">
      <div className="px-6 pb-12 lg:px-8">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          {/* ===== STICKY HEADER + TABS ===== */}
          <div className="sticky top-0 z-20 border-b border-border/70 bg-slate-50/90 pt-5 backdrop-blur dark:bg-background/90">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400">
                  <Target className="h-[22px] w-[22px]" strokeWidth={1.9} />
                </div>
                <div>
                  <h1 className="text-[21px] font-extrabold tracking-tight">Kalite Hedefleri</h1>
                  <p className="mt-0.5 text-[12.5px] text-muted-foreground">ISO 9001 · ölçülebilir kalite hedefleri ve dönemsel gerçekleşme takibi</p>
                </div>
              </div>
              <Button onClick={openYeniHedef} className="h-[38px] gap-2 rounded-[9px] bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white">
                <Plus className="h-4 w-4" strokeWidth={2.2} /> Yeni Hedef
              </Button>
            </div>
            {/* Tab barı — aktif tab inset alt çizgi + sayı rozeti */}
            <div className="mt-3.5 flex gap-1">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-t-lg px-3.5 py-2.5 text-[13.5px] transition-colors",
                    tab === t.id
                      ? "font-bold text-foreground shadow-[inset_0_-2px_0_#0ea5e9]"
                      : "font-semibold text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label}
                  <span
                    className={cn(
                      "inline-flex h-[19px] min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-extrabold tabular-nums",
                      tab === t.id ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-400",
                    )}
                  >
                    {t.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* ===== KPI STRIP (accent-bar) ===== */}
          <div className="mt-5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
            {kpis.map((k) => (
              <div key={k.label} className="relative overflow-hidden rounded-[14px] border bg-card p-4">
                <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: k.color }} />
                <div className="flex items-center gap-2 pl-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: k.color }} />
                  <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground leading-tight">{k.label}</div>
                </div>
                <div className="mt-2 pl-2 text-[22px] font-extrabold tracking-tight tabular-nums" style={{ color: k.valColor }}>{k.value}</div>
                <div className="mt-0.5 pl-2 text-[11.5px] text-muted-foreground">{k.sub}</div>
              </div>
            ))}
          </div>

          {/* ===================== HEDEFLER ===================== */}
          <TabsContent value="hedefler" className="mt-4">
            <div className="overflow-hidden rounded-[14px] border bg-card">
              <div className="flex items-baseline justify-between border-b px-5 py-4">
                <h3 className="text-[15px] font-extrabold">Hedef Listesi</h3>
                <span className="text-xs text-muted-foreground">gerçekleşme = son ölçüm / hedef</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px] text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 text-[10.5px] font-bold uppercase tracking-wide text-slate-500">
                      <th className="p-3 pl-5 text-left">Hedef · Sorumlu</th>
                      <th className="p-3 text-left">ISO</th>
                      <th className="p-3 text-left">Periyot</th>
                      <th className="p-3 text-left">Gerçekleşme</th>
                      <th className="p-3 text-right">Hedef / Son</th>
                      <th className="p-3 text-center">Durum</th>
                      <th className="p-3 pr-5 text-right">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hedefler.length === 0 && (
                      <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Henüz hedef yok</td></tr>
                    )}
                    {hedefler.map(hedef => {
                      const durum = getDurum(hedef, hedef.sonOlcum);
                      const m = durumMeta[durum];
                      const pct = gerceklesmePct(hedef, hedef.sonOlcum);
                      const yuksek = hedef.yon === "yuksek_iyi";
                      return (
                        <tr key={hedef.id} className="border-b last:border-b-0 hover:bg-slate-50">
                          <td className="p-3 pl-5">
                            <div className="flex items-center gap-2">
                              <span className="text-[13.5px] font-bold text-slate-800">{hedef.baslik}</span>
                              <span
                                className="rounded-[5px] px-1.5 py-px text-[10px] font-bold"
                                style={{ color: yuksek ? "#0369a1" : "#7c3aed", background: yuksek ? "#e0f2fe" : "#ede9fe" }}
                              >
                                {yuksek ? "↑ yüksek iyi" : "↓ düşük iyi"}
                              </span>
                            </div>
                            <div className="mt-0.5 text-[11.5px] text-slate-400">{hedef.sorumluKisi} · termin {hedef.terminTarihi}</div>
                          </td>
                          <td className="p-3 text-[12px] text-slate-500 tabular-nums">{hedef.isoMaddesi ?? "—"}</td>
                          <td className="p-3">
                            <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">{hedef.periyot}</span>
                          </td>
                          <td className="p-3">
                            <div className="h-2 w-full max-w-[160px] overflow-hidden rounded-full bg-slate-100">
                              <span className="block h-full rounded-full" style={{ width: `${Math.min(100, pct ?? 0)}%`, background: m.bar }} />
                            </div>
                            <div className="mt-1 text-[11px] text-slate-400 tabular-nums">{pct === null ? "—" : `%${pct}`} gerçekleşme</div>
                          </td>
                          <td className="p-3 text-right">
                            <div className="text-[13px] font-extrabold text-slate-900 tabular-nums">{hedef.hedefDeger} {hedef.olcumBirimi}</div>
                            <div className="mt-px text-[11.5px] font-semibold tabular-nums" style={{ color: m.text }}>
                              son: {hedef.sonOlcum ? `${hedef.sonOlcum.gerceklesenDeger} ${hedef.olcumBirimi}` : "—"}
                            </div>
                          </td>
                          <td className="p-3 text-center"><DurumBadge durum={durum} /></td>
                          <td className="p-3 pr-5">
                            <div className="flex justify-end gap-1">
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
            </div>
          </TabsContent>

          {/* ===================== ÖLÇÜMLER ===================== */}
          <TabsContent value="olcumler" className="mt-4">
            <div className="overflow-hidden rounded-[14px] border bg-card">
              <div className="flex items-baseline justify-between border-b px-5 py-4">
                <h3 className="text-[15px] font-extrabold">Ölçüm Geçmişi</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 text-[10.5px] font-bold uppercase tracking-wide text-slate-500">
                      <th className="p-3 pl-5 text-left">Tarih</th>
                      <th className="p-3 text-left">Hedef</th>
                      <th className="p-3 text-right">Hedef Değer</th>
                      <th className="p-3 text-right">Gerçekleşen</th>
                      <th className="p-3 text-center">Durum</th>
                      <th className="p-3 text-left">Notlar</th>
                      <th className="p-3 pr-5 text-right">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {olcumler.length === 0 && (
                      <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Henüz ölçüm yok</td></tr>
                    )}
                    {olcumler.map(olcum => {
                      const durum = getDurum(olcum.hedef, olcum);
                      return (
                        <tr key={olcum.id} className="border-b last:border-b-0 hover:bg-slate-50">
                          <td className="p-3 pl-5 text-[12.5px] text-slate-600 tabular-nums">{olcum.olcumTarihi}</td>
                          <td className="p-3 text-[12.5px] font-semibold text-slate-800">{olcum.hedef.baslik}</td>
                          <td className="p-3 text-right text-[12.5px] text-slate-400 tabular-nums">{olcum.hedef.hedefDeger} {olcum.hedef.olcumBirimi}</td>
                          <td className="p-3 text-right text-[13px] font-bold text-slate-900 tabular-nums">{olcum.gerceklesenDeger} {olcum.hedef.olcumBirimi}</td>
                          <td className="p-3 text-center"><DurumBadge durum={durum} /></td>
                          <td className="p-3 text-[12px] text-slate-500">{olcum.notlar ?? "—"}</td>
                          <td className="p-3 pr-5 text-right">
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
    </div>
  );
}

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Plus, Pencil, Trash2, ChevronDown, ChevronRight, CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

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

// Tarih gösterimi: YYYY-MM-DD → dd.mm.yyyy (new Date KULLANMADAN — timezone off-by-one önlenir)
const fmtTarih = (d?: string | null) => {
  if (!d) return "—";
  const p = d.split("-");
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : d;
};

export default function ISO9001YonetimGozdenGecirme() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const today = new Date().toISOString().split("T")[0];

  const [tab, setTab] = useState("toplantılar");
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
      qc.invalidateQueries({ queryKey: ["/api/yonetim-toplantilari", expandedId] });
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
    if (isGecikmiş(a)) return <span className="inline-block rounded-full bg-rose-100 px-2.5 py-0.5 text-[10.5px] font-bold text-rose-700">Gecikmiş</span>;
    if (a.durum === "kapali") return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10.5px] font-bold text-emerald-700">✓ Kapalı</span>;
    return <span className="inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-[10.5px] font-bold text-amber-700">Açık</span>;
  };

  const filteredAksiyonlar = tumAksiyonlar.filter(a => {
    if (aksiyonFilter === "acik") return a.durum === "acik" && !isGecikmiş(a);
    if (aksiyonFilter === "kapali") return a.durum === "kapali";
    if (aksiyonFilter === "gecikmiş") return isGecikmiş(a);
    return true;
  });

  // KPI / rozet sayıları — listeden türetilir (sabit yazılmaz)
  const acikCount = tumAksiyonlar.filter(a => a.durum === "acik" && !isGecikmiş(a)).length;
  const gecikmisCount = tumAksiyonlar.filter(a => isGecikmiş(a)).length;
  const kapaliCount = tumAksiyonlar.filter(a => a.durum === "kapali").length;

  const kpis = [
    { label: "Toplantı", value: String(toplantılar.length), sub: "YGG kaydı", color: "#0ea5e9", valColor: undefined as string | undefined },
    { label: "Toplam Aksiyon", value: String(tumAksiyonlar.length), sub: "tüm toplantılar", color: "#7c3aed", valColor: undefined as string | undefined },
    { label: "Açık Aksiyon", value: String(acikCount), sub: "devam ediyor", color: "#eab308", valColor: "#a16207" },
    { label: "Gecikmiş", value: String(gecikmisCount), sub: "termin aşıldı", color: "#dc2626", valColor: "#dc2626" },
  ];

  const tabDefs = [
    { id: "toplantılar", label: "Toplantılar", count: toplantılar.length },
    { id: "aksiyonlar", label: "Aksiyonlar", count: tumAksiyonlar.length },
  ];

  const chipDefs = [
    { id: "tumu", label: "Tümü", count: tumAksiyonlar.length },
    { id: "acik", label: "Açık", count: acikCount },
    { id: "gecikmiş", label: "Gecikmiş", count: gecikmisCount },
    { id: "kapali", label: "Kapalı", count: kapaliCount },
  ];

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
    <div className="min-h-full bg-slate-50 dark:bg-background">
      <div className="px-6 pb-12 lg:px-8">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          {/* ===== STICKY HEADER + TABS ===== */}
          <div className="sticky top-0 z-20 border-b border-border/70 bg-slate-50/90 pt-5 backdrop-blur dark:bg-background/90">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400">
                  <BarChart3 className="h-[22px] w-[22px]" strokeWidth={1.9} />
                </div>
                <div>
                  <h1 className="text-[21px] font-extrabold tracking-tight">Yönetim Gözden Geçirme</h1>
                  <p className="mt-0.5 text-[12.5px] text-muted-foreground">ISO 9001 · YGG toplantıları, girdi verileri ve karar aksiyonları</p>
                </div>
              </div>
              <Button
                onClick={() => openModal(null)}
                className="h-[38px] gap-1.5 rounded-[9px] bg-slate-900 text-white hover:bg-slate-800"
              >
                <Plus className="h-[15px] w-[15px]" /> Yeni Toplantı
              </Button>
            </div>
            {/* Tab barı — aktif tab inset alt çizgi + sayı rozeti */}
            <div className="mt-3.5 flex gap-1">
              {tabDefs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-t-lg px-3.5 py-2.5 text-[13.5px] transition-colors",
                    tab === t.id
                      ? "font-bold text-foreground shadow-[inset_0_-2px_0_#0ea5e9]"
                      : "font-semibold text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t.label}
                  <span className={cn(
                    "inline-flex h-[19px] min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-extrabold tabular-nums",
                    tab === t.id ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-400"
                  )}>{t.count}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ===== KPI ŞERİDİ (listeden türetilir) ===== */}
          <div className="mt-5 grid grid-cols-2 gap-3.5 md:grid-cols-4">
            {kpis.map((k) => (
              <div key={k.label} className="relative overflow-hidden rounded-[14px] border bg-card p-4">
                <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: k.color }} />
                <div className="pl-2 text-[10.5px] font-bold uppercase tracking-wide leading-tight text-muted-foreground">{k.label}</div>
                <div className="mt-2 pl-2 text-[24px] font-extrabold tracking-tight tabular-nums" style={k.valColor ? { color: k.valColor } : undefined}>{k.value}</div>
                <div className="mt-0.5 pl-2 text-[11.5px] text-muted-foreground">{k.sub}</div>
              </div>
            ))}
          </div>

          {/* ── Sekme 1: Toplantılar ── */}
          <TabsContent value="toplantılar" className="mt-4">
            <div className="overflow-hidden rounded-[14px] border bg-card">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="px-5 py-3 text-left text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Tarih</th>
                      <th className="px-5 py-3 text-left text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Katılımcılar</th>
                      <th className="px-5 py-3 text-center text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Aksiyon</th>
                      <th className="px-5 py-3 text-right text-[10.5px] font-bold uppercase tracking-wide text-slate-500">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {toplantılar.map(t => (
                      <React.Fragment key={t.id}>
                        <tr
                          key={t.id}
                          className="cursor-pointer border-b transition-colors hover:bg-slate-50"
                          onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                        >
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              {expandedId === t.id ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                              <span className="text-[13.5px] font-bold text-slate-800 tabular-nums">{fmtTarih(t.tarih)}</span>
                            </div>
                          </td>
                          <td className="max-w-[220px] truncate px-5 py-3 text-[12.5px] text-slate-500">{t.katilimcilar ?? "—"}</td>
                          <td className="px-5 py-3 text-center">
                            <span className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600 tabular-nums">{t.aksiyon_sayisi} aksiyon</span>
                          </td>
                          <td className="px-5 py-3 text-right" onClick={e => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" onClick={() => openModal(t)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => deleteToplantı.mutate(t.id)}><Trash2 className="h-4 w-4 text-rose-600" /></Button>
                          </td>
                        </tr>
                        {expandedId === t.id && expandedDetail && (
                          <tr key={`${t.id}-expand`} className="border-b bg-slate-50">
                            <td colSpan={4} className="space-y-3.5 px-5 py-4">
                              {/* ISO 9001 Anlık Özet — accent-bordered info card */}
                              {isoStats && (
                                <div className="relative overflow-hidden rounded-[11px] border bg-card p-4 pl-5">
                                  <span className="absolute left-0 top-0 bottom-0 w-1 bg-sky-500" />
                                  <div className="mb-2.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">ISO 9001 Anlık Özet</div>
                                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                                    <div>
                                      <div className="text-[11px] text-slate-400">DÜF</div>
                                      <div className="mt-0.5 text-[13px] font-bold text-slate-800">{isoStats.dufAcik} açık · {isoStats.dufKapali} kapalı</div>
                                    </div>
                                    <div>
                                      <div className="text-[11px] text-slate-400">Hedef</div>
                                      <div className="mt-0.5 text-[13px] font-bold text-slate-800">{isoStats.hedefYesilCount}/{isoStats.hedefCount} yeşil</div>
                                    </div>
                                    <div>
                                      <div className="text-[11px] text-slate-400">Eğitim</div>
                                      <div className="mt-0.5 text-[13px] font-bold text-slate-800">{isoStats.egitimCount} eğitim</div>
                                    </div>
                                    <div>
                                      <div className="text-[11px] text-slate-400">Tedarikçi</div>
                                      <div className="mt-0.5 text-[13px] font-bold text-slate-800">{isoStats.buYilDegerlendirmeCount} değerlendirme</div>
                                    </div>
                                  </div>
                                </div>
                              )}
                              {/* Girdi verileri */}
                              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                {[
                                  { label: "Gündem", val: expandedDetail.gundem },
                                  { label: "Müşteri Şikayetleri", val: expandedDetail.musteriSikayetleri },
                                  { label: "Tedarikçi Performansı", val: expandedDetail.tedarikciPerformansi },
                                  { label: "Ürün Uygunsuzluk", val: expandedDetail.urunUygunsuzluk },
                                  { label: "Önceki Karar Durumu", val: expandedDetail.oncekiKararDurum },
                                  { label: "Sonuçlar", val: expandedDetail.sonuclar },
                                ].filter(f => f.val).map(f => (
                                  <div key={f.label} className="rounded-[10px] border bg-card p-3">
                                    <div className="mb-1 text-[11px] font-bold text-slate-500">{f.label}</div>
                                    <div className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-slate-700">{f.val}</div>
                                  </div>
                                ))}
                              </div>
                              {/* Aksiyonlar */}
                              <div>
                                <div className="mb-2.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Aksiyonlar</div>
                                {expandedDetail.aksiyonlar.length > 0 && (
                                  <div className="mb-3 flex flex-col gap-2">
                                    {expandedDetail.aksiyonlar.map(a => (
                                      <div key={a.id} className="flex items-center gap-3 rounded-[10px] border bg-card px-3.5 py-2.5">
                                        <button onClick={() => toggleAksiyon.mutate({ id: a.id, durum: a.durum })} className="flex-shrink-0" title={a.durum === "acik" ? "Kapat" : "Aç"}>
                                          {a.durum === "acik" ? <Circle className="h-[18px] w-[18px] text-slate-300" /> : <CheckCircle2 className="h-[18px] w-[18px] text-emerald-600" />}
                                        </button>
                                        <span className="flex-1 text-[12.5px] text-slate-800">{a.aksiyon}</span>
                                        <span className="text-[12px] text-slate-500">{a.sorumlu}</span>
                                        <span className={cn("text-[11.5px] tabular-nums", isGecikmiş(a) ? "text-rose-600" : "text-slate-400")}>{fmtTarih(a.hedefTarih)}</span>
                                        {getDurumBadge(a)}
                                        <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={() => deleteAksiyon.mutate(a.id)}>
                                          <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                                        </Button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {/* Aksiyon Ekle satırı */}
                                <div className="flex items-end gap-2 rounded-[10px] border border-dashed bg-card p-3">
                                  <div className="flex-1"><Label className="text-xs">Aksiyon *</Label><Input placeholder="Aksiyon açıklaması" value={aksiyonForm.aksiyon} onChange={e => setAksiyonForm(f => ({ ...f, aksiyon: e.target.value }))} /></div>
                                  <div className="w-32"><Label className="text-xs">Sorumlu *</Label><Input placeholder="Ad Soyad" value={aksiyonForm.sorumlu} onChange={e => setAksiyonForm(f => ({ ...f, sorumlu: e.target.value }))} /></div>
                                  <div className="w-36"><Label className="text-xs">Hedef Tarih</Label><Input type="date" value={aksiyonForm.hedefTarih} onChange={e => setAksiyonForm(f => ({ ...f, hedefTarih: e.target.value }))} /></div>
                                  <Button size="sm" disabled={!aksiyonForm.aksiyon || !aksiyonForm.sorumlu} onClick={() => addAksiyon.mutate({ toplantId: t.id, aksiyon: aksiyonForm.aksiyon, sorumlu: aksiyonForm.sorumlu, hedefTarih: aksiyonForm.hedefTarih || undefined })}>
                                    <Plus className="mr-1 h-4 w-4" /> Ekle
                                  </Button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                    {toplantılar.length === 0 && (
                      <tr><td colSpan={4} className="px-5 py-10 text-center text-sm text-muted-foreground">Henüz toplantı kaydı yok.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          {/* ── Sekme 2: Aksiyonlar ── */}
          <TabsContent value="aksiyonlar" className="mt-4">
            {/* Filtre çipleri */}
            <div className="mb-3.5 flex flex-wrap items-center gap-2">
              {chipDefs.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setAksiyonFilter(c.id)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-[8px] border px-3 py-1.5 text-[12.5px] transition-colors",
                    aksiyonFilter === c.id
                      ? "border-slate-900 bg-slate-900 font-bold text-white"
                      : "border-border bg-card font-semibold text-slate-600 hover:text-foreground"
                  )}
                >
                  {c.label}
                  <span className={cn(
                    "inline-flex h-[18px] min-w-[19px] items-center justify-center rounded-full px-1.5 text-[10.5px] font-extrabold tabular-nums",
                    aksiyonFilter === c.id ? "bg-white/20 text-white" : "bg-slate-100 text-slate-400"
                  )}>{c.count}</span>
                </button>
              ))}
              <span className="ml-auto text-[12.5px] text-slate-400 tabular-nums">{filteredAksiyonlar.length} aksiyon</span>
            </div>
            <div className="overflow-hidden rounded-[14px] border bg-card">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="px-5 py-3 text-left text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Aksiyon</th>
                      <th className="px-5 py-3 text-left text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Sorumlu</th>
                      <th className="px-5 py-3 text-left text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Hedef Tarih</th>
                      <th className="px-5 py-3 text-left text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Toplantı</th>
                      <th className="px-5 py-3 text-center text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Durum</th>
                      <th className="px-5 py-3 text-right text-[10.5px] font-bold uppercase tracking-wide text-slate-500">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAksiyonlar.map(a => (
                      <tr key={a.id} className="border-b transition-colors last:border-b-0 hover:bg-slate-50">
                        <td className="px-5 py-3 text-[12.5px] text-slate-800">{a.aksiyon}</td>
                        <td className="px-5 py-3 text-[12.5px] text-slate-500">{a.sorumlu}</td>
                        <td className={cn("px-5 py-3 text-[12px] tabular-nums", isGecikmiş(a) ? "text-rose-600" : "text-slate-500")}>{fmtTarih(a.hedefTarih)}</td>
                        <td className="px-5 py-3 text-[12px] text-slate-400 tabular-nums">{fmtTarih(a.toplantıTarihi)}</td>
                        <td className="px-5 py-3 text-center">{getDurumBadge(a)}</td>
                        <td className="px-5 py-3 text-right">
                          <Button variant="ghost" size="icon" onClick={() => toggleAksiyon.mutate({ id: a.id, durum: a.durum })}>
                            {a.durum === "acik" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4" />}
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteAksiyon.mutate(a.id)}>
                            <Trash2 className="h-4 w-4 text-rose-600" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {filteredAksiyonlar.length === 0 && (
                      <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-muted-foreground">Aksiyon bulunamadı.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
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
                <div className="relative overflow-hidden rounded-[11px] border bg-slate-50 p-4 pl-5">
                  <span className="absolute left-0 top-0 bottom-0 w-1 bg-sky-500" />
                  <p className="mb-2 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">ISO 9001 Anlık Özet</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="text-slate-600">DÜF: <span className="font-bold text-slate-800">{isoStats.dufAcik} açık, {isoStats.dufKapali} kapalı</span></div>
                    <div className="text-slate-600">Hedef: <span className="font-bold text-slate-800">{isoStats.hedefYesilCount}/{isoStats.hedefCount} yeşil</span></div>
                    <div className="text-slate-600">Eğitim: <span className="font-bold text-slate-800">{isoStats.egitimCount} eğitim, {isoStats.toplamKatilimciCount} katılım</span></div>
                    <div className="text-slate-600">Tedarikçi: <span className="font-bold text-slate-800">{isoStats.tedarikciCount} tedarikçi, {isoStats.buYilDegerlendirmeCount} bu yıl</span></div>
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
                <div className="space-y-2 border-t pt-3">
                  <p className="text-sm font-medium">Aksiyonlar</p>
                  {pendingAksiyonlar.length > 0 && (
                    <div className="space-y-1">
                      {pendingAksiyonlar.map((pa, idx) => (
                        <div key={idx} className="flex items-center gap-2 rounded bg-slate-50 p-2 text-sm">
                          <span className="flex-1">{pa.aksiyon} — {pa.sorumlu}</span>
                          {pa.hedefTarih && <span className="text-muted-foreground">{fmtTarih(pa.hedefTarih)}</span>}
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setPendingAksiyonlar(p => p.filter((_, i) => i !== idx))}>
                            <Trash2 className="h-3 w-3 text-rose-600" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-end gap-2">
                    <div className="flex-1"><Label className="text-xs">Aksiyon</Label><Input placeholder="Aksiyon" value={aksiyonForm.aksiyon} onChange={e => setAksiyonForm(f => ({ ...f, aksiyon: e.target.value }))} /></div>
                    <div className="w-32"><Label className="text-xs">Sorumlu</Label><Input placeholder="Sorumlu" value={aksiyonForm.sorumlu} onChange={e => setAksiyonForm(f => ({ ...f, sorumlu: e.target.value }))} /></div>
                    <div className="w-36"><Label className="text-xs">Hedef Tarih</Label><Input type="date" value={aksiyonForm.hedefTarih} onChange={e => setAksiyonForm(f => ({ ...f, hedefTarih: e.target.value }))} /></div>
                    <Button size="sm" variant="outline" disabled={!aksiyonForm.aksiyon || !aksiyonForm.sorumlu} onClick={addPending}>
                      <Plus className="h-4 w-4" />
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
    </div>
  );
}

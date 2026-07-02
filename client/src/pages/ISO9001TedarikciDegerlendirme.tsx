import { useState, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Truck, Plus, Pencil, Trash2, ChevronDown, ChevronRight, Eye, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

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

// Puan rengi — ortPuan (5 üzerinden): ≥4 yeşil, ≥3 amber, <3 kırmızı (kaynağa sadık)
const puanRenk = (p: number) =>
  p >= 4
    ? { bg: "#dcfce7", text: "#15803d", bar: "#16a34a" }
    : p >= 3
    ? { bg: "#fef9c3", text: "#a16207", bar: "#eab308" }
    : { bg: "#fee2e2", text: "#b91c1c", bar: "#dc2626" };

// Kategori rozet renkleri (yumuşak zemin + koyu metin)
const KATEGORI_RENK: Record<string, [string, string]> = {
  Hizmet: ["#0369a1", "#e0f2fe"],
  Nakliye: ["#7c3aed", "#ede9fe"],
  Malzeme: ["#0f766e", "#ccfbf1"],
  Danışmanlık: ["#9a3412", "#ffedd5"],
};
const katRenk = (k: string | null): [string, string] => (k && KATEGORI_RENK[k]) || ["#64748b", "#f1f5f9"];

export default function ISO9001TedarikciDegerlendirme() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [tab, setTab] = useState("tedarikcilar");
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

  // KPI'lar — listeden türetilir (skor alanları liste seviyesinde yok; satır açılınca yüklenir)
  const toplamDegerlendirme = tedarikcilar.reduce((s, t) => s + (t.degerlendirmeSayisi || 0), 0);
  const kpis: { label: string; value: string; sub: string; color: string; valColor: string }[] = [
    { label: "Tedarikçi", value: String(tedarikcilar.length), sub: "aktif kayıt", color: "#0ea5e9", valColor: "#0f172a" },
    { label: "Ortalama Puan", value: "—", sub: "satır açılınca görünür", color: "#16a34a", valColor: "#16a34a" },
    { label: "Toplam Değerlendirme", value: String(toplamDegerlendirme), sub: "tüm dönemler", color: "#7c3aed", valColor: "#0f172a" },
    { label: "Riskli", value: "—", sub: "puan < 3,0", color: "#dc2626", valColor: "#dc2626" },
  ];

  const tabDefs = [
    { id: "tedarikcilar", label: "Tedarikçiler", count: tedarikcilar.length },
    { id: "sablon", label: "Değerlendirme Şablonu", count: kriterler.length },
  ] as const;

  return (
    <div className="min-h-full bg-slate-50 dark:bg-background">
      <div className="px-6 pb-12 lg:px-8">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          {/* ===== STICKY HEADER + TABS ===== */}
          <div className="sticky top-0 z-20 border-b border-border/70 bg-slate-50/90 pt-5 backdrop-blur dark:bg-background/90">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400">
                  <Truck className="h-[22px] w-[22px]" strokeWidth={1.9} />
                </div>
                <div>
                  <h1 className="text-[21px] font-extrabold tracking-tight">Tedarikçi Değerlendirme</h1>
                  <p className="mt-0.5 text-[12.5px] text-muted-foreground">ISO 9001 · tedarikçi performansı ve dönemsel puanlama</p>
                </div>
              </div>
              {tab === "sablon" ? (
                <Button onClick={() => openKriterModal(null)} className="h-[38px] gap-1.5 bg-slate-900 text-white hover:bg-slate-800">
                  <Plus className="h-4 w-4" /> Kriter Ekle
                </Button>
              ) : (
                <Button onClick={() => openTedarikciModal(null)} className="h-[38px] gap-1.5 bg-slate-900 text-white hover:bg-slate-800">
                  <Plus className="h-4 w-4" /> Yeni Tedarikçi
                </Button>
              )}
            </div>
            {/* Tab barı — aktif tab inset alt çizgi + sayı rozeti */}
            <div className="mt-3.5 flex gap-1">
              {tabDefs.map((tb) => {
                const active = tab === tb.id;
                return (
                  <button
                    key={tb.id}
                    onClick={() => { setTab(tb.id); setExpandedTedarikciId(null); }}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-t-lg px-3.5 py-2.5 text-[13.5px] transition-colors",
                      active ? "font-bold text-foreground shadow-[inset_0_-2px_0_#0ea5e9]" : "font-semibold text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {tb.label}
                    <span
                      className="inline-flex h-[19px] min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-extrabold tabular-nums"
                      style={active ? { background: "#e0f2fe", color: "#0369a1" } : { background: "#f1f5f9", color: "#94a3b8" }}
                    >
                      {tb.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ===== KPI ŞERİDİ ===== */}
          <div className="mt-5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
            {kpis.map((k) => (
              <div key={k.label} className="relative overflow-hidden rounded-[14px] border bg-card p-4">
                <span className="absolute bottom-0 left-0 top-0 w-1" style={{ background: k.color }} />
                <div className="pl-2 text-[10.5px] font-bold uppercase leading-tight tracking-wide text-muted-foreground">{k.label}</div>
                <div className="mt-2 pl-2 text-[22px] font-extrabold tracking-tight tabular-nums" style={{ color: k.valColor }}>{k.value}</div>
                <div className="mt-0.5 pl-2 text-[11.5px] text-muted-foreground">{k.sub}</div>
              </div>
            ))}
          </div>

          {/* ── Sekme 1: Tedarikçiler ── */}
          <TabsContent value="tedarikcilar" className="mt-4">
            <div className="overflow-hidden rounded-[14px] border bg-card">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead className="border-b bg-slate-50">
                    <tr>
                      <th className="p-3 text-left text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Tedarikçi</th>
                      <th className="p-3 text-left text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Kategori</th>
                      <th className="p-3 text-left text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Yetkili</th>
                      <th className="p-3 text-left text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Telefon</th>
                      <th className="p-3 text-center text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Değerlendirme</th>
                      <th className="p-3 text-right text-[10.5px] font-bold uppercase tracking-wide text-slate-500">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tedarikcilar.map(t => {
                      const [katColor, katBg] = katRenk(t.kategori);
                      const expanded = expandedTedarikciId === t.id;
                      return (
                        <Fragment key={t.id}>
                          <tr
                            className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50"
                            onClick={() => setExpandedTedarikciId(expanded ? null : t.id)}
                          >
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                {expanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                                <span className="text-[13.5px] font-bold text-slate-800">{t.ad}</span>
                              </div>
                            </td>
                            <td className="p-3">
                              {t.kategori ? (
                                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold" style={{ color: katColor, background: katBg }}>{t.kategori}</span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="p-3 text-[12.5px] text-slate-600">{t.yetkiliAdi ?? "—"}</td>
                            <td className="p-3 text-[12.5px] tabular-nums text-slate-600">{t.telefon ?? "—"}</td>
                            <td className="p-3 text-center">
                              <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[12px] font-semibold tabular-nums text-slate-600">{t.degerlendirmeSayisi} değerlendirme</span>
                            </td>
                            <td className="p-3 text-right" onClick={e => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openTedarikciModal(t)}><Pencil className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteTedarikci.mutate(t.id)}><Trash2 className="h-4 w-4 text-rose-600" /></Button>
                            </td>
                          </tr>
                          {expanded && (
                            <tr className="border-b border-slate-100 bg-slate-50">
                              <td colSpan={6} className="px-5 py-4">
                                <div className="mb-3 flex items-center justify-between">
                                  <span className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Geçmiş Değerlendirmeler</span>
                                  <Button size="sm" variant="outline" onClick={() => openDegerlendirmeModal(t.id)}>
                                    <Plus className="mr-1 h-4 w-4" /> Yeni Değerlendirme
                                  </Button>
                                </div>
                                {expandedDegerlendirmeler.length === 0 ? (
                                  <p className="text-sm italic text-muted-foreground">Henüz değerlendirme yok.</p>
                                ) : (
                                  <div className="flex flex-col gap-2">
                                    {expandedDegerlendirmeler.map(d => {
                                      const pr = d.ortPuan !== null ? puanRenk(d.ortPuan) : null;
                                      return (
                                        <div key={d.id} className="flex items-center gap-3 rounded-[10px] border bg-card px-3.5 py-2.5">
                                          <span className="w-[92px] flex-shrink-0 text-[12.5px] tabular-nums text-slate-600">{d.tarih}</span>
                                          <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-500">{d.degerlendiren ?? "—"}</span>
                                          {pr ? (
                                            <>
                                              <span className="hidden h-[7px] max-w-[180px] flex-1 overflow-hidden rounded-full bg-slate-100 sm:block">
                                                <span className="block h-full rounded-full" style={{ width: `${(d.ortPuan! / 5 * 100).toFixed(0)}%`, background: pr.bar }} />
                                              </span>
                                              <span className="inline-flex flex-shrink-0 items-center rounded-full px-2.5 py-0.5 text-[12px] font-extrabold tabular-nums" style={{ background: pr.bg, color: pr.text }}>
                                                {d.ortPuan!.toFixed(1)} / 5
                                              </span>
                                            </>
                                          ) : (
                                            <span className="text-[12.5px] text-slate-400">—</span>
                                          )}
                                          <div className="flex flex-shrink-0 gap-1">
                                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setGoruntuleModal({ open: true, tedarikciId: t.id, degerlendirmeId: d.id })}>
                                              <Eye className="h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteDegerlendirme.mutate({ tedarikciId: t.id, degerlendirmeId: d.id })}>
                                              <Trash2 className="h-4 w-4 text-rose-600" />
                                            </Button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                    {tedarikcilar.length === 0 && (
                      <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Henüz tedarikçi yok.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          {/* ── Sekme 2: Değerlendirme Şablonu ── */}
          <TabsContent value="sablon" className="mt-4">
            <div className="overflow-hidden rounded-[14px] border bg-card">
              <div className="border-b px-5 py-4">
                <h3 className="text-[15px] font-extrabold">Değerlendirme Kriterleri</h3>
                <p className="mt-0.5 text-[12px] text-muted-foreground">her tedarikçi değerlendirmesinde puanlanan kriterler</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="border-b bg-slate-50">
                    <tr>
                      <th className="w-16 p-3 text-left text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Sıra</th>
                      <th className="p-3 text-left text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Kriter</th>
                      <th className="p-3 text-left text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Tip</th>
                      <th className="p-3 text-right text-[10.5px] font-bold uppercase tracking-wide text-slate-500">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kriterler.map((k, idx) => {
                      const isPuan = k.tip === "puan_1_5";
                      return (
                        <tr key={k.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50">
                          <td className="p-3">
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-[7px] bg-slate-100 text-[12px] font-extrabold text-slate-600">{k.sira}</span>
                          </td>
                          <td className="p-3 text-[13px] text-slate-800">{k.kriter}</td>
                          <td className="p-3">
                            <span
                              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                              style={isPuan ? { color: "#0369a1", background: "#e0f2fe" } : { color: "#64748b", background: "#f1f5f9" }}
                            >
                              {isPuan ? "1-5 Puan" : "Açık Metin"}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={idx === 0} onClick={() => moveKriter(k, "up")}><ArrowUp className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={idx === kriterler.length - 1} onClick={() => moveKriter(k, "down")}><ArrowDown className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openKriterModal(k)}><Pencil className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteKriter.mutate(k.id)}><Trash2 className="h-4 w-4 text-rose-600" /></Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {kriterler.length === 0 && (
                      <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Henüz kriter yok.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
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
                              className={cn(
                                "h-9 w-9 rounded-full border text-sm font-medium transition-colors",
                                cevaplar[k.id]?.puan === p ? "border-sky-500 bg-sky-500 text-white" : "hover:bg-muted"
                              )}
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
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Ortalama Puan:</span>
                    {(() => {
                      const pr = puanRenk(goruntuleDetay.ortPuan);
                      return (
                        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-extrabold tabular-nums" style={{ background: pr.bg, color: pr.text }}>
                          {goruntuleDetay.ortPuan.toFixed(1)} / 5
                        </span>
                      );
                    })()}
                  </div>
                )}
                <div className="space-y-3 border-t pt-4">
                  {kriterler.map(k => {
                    const c = goruntuleDetay.cevaplar.find(cv => cv.kriterId === k.id);
                    return (
                      <div key={k.id} className="text-sm">
                        <p className="mb-1 font-medium">{k.kriter}</p>
                        {k.tip === "puan_1_5" ? (
                          <div className="flex gap-2">
                            {[1, 2, 3, 4, 5].map(p => (
                              <div key={p} className={cn("flex h-9 w-9 items-center justify-center rounded-full border text-sm font-medium", c?.puan === p ? "border-sky-500 bg-sky-500 text-white" : "border-muted text-muted-foreground")}>{p}</div>
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
    </div>
  );
}

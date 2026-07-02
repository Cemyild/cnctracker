import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { type TetkikPlan, type TetkikBulgu } from "@shared/schema";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit, Trash2, Paperclip, Search } from "lucide-react";
import { cn } from "@/lib/utils";

const PLAN_DURUM = [
  { value: "planlandi", label: "Planlandı" },
  { value: "tamamlandi", label: "Tamamlandı" },
  { value: "iptal", label: "İptal" },
];

const BULGU_TURU = [
  { value: "uygunsuzluk", label: "Uygunsuzluk" },
  { value: "gozlem", label: "Gözlem" },
  { value: "iyilestirme_firsati", label: "İyileştirme Fırsatı" },
];

const BULGU_DURUM = [
  { value: "acik", label: "Açık" },
  { value: "kapali", label: "Kapalı" },
];

// Rozet renkleri (referanstan birebir): [zemin, metin]
const PLAN_DURUM_META: Record<string, { bg: string; color: string }> = {
  planlandi: { bg: "#dbeafe", color: "#1e40af" },
  tamamlandi: { bg: "#dcfce7", color: "#15803d" },
  iptal: { bg: "#f1f5f9", color: "#64748b" },
};

// Bulgu türü: Uygunsuzluk (rose) / Gözlem (amber) / İyileştirme Fırsatı (sky)
const BULGU_TUR_META: Record<string, { bg: string; color: string }> = {
  uygunsuzluk: { bg: "#fee2e2", color: "#b91c1c" },
  gozlem: { bg: "#fef9c3", color: "#a16207" },
  iyilestirme_firsati: { bg: "#e0f2fe", color: "#0369a1" },
};

// Bulgu durumu: Açık (rose) / Kapalı (emerald)
const BULGU_DURUM_META: Record<string, { bg: string; color: string }> = {
  acik: { bg: "#fee2e2", color: "#b91c1c" },
  kapali: { bg: "#dcfce7", color: "#15803d" },
};

const emptyPlan = { tetkikAdi: "", planlananTarih: "", tetkikEdilenBolum: "", basTetkikci: "", durum: "planlandi" };
const emptyBulgu = { tetkikPlanId: "", bulguTuru: "uygunsuzluk", bulguAciklamasi: "", ilgiliIsoMaddesi: "", durum: "acik" };

export default function ISO9001Tetkik() {
  const { toast } = useToast();

  const [tab, setTab] = useState("planlar");

  const [planOpen, setPlanOpen] = useState(false);
  const [planEditId, setPlanEditId] = useState<string | null>(null);
  const [planForm, setPlanForm] = useState(emptyPlan);
  const [planDosya, setPlanDosya] = useState<File | null>(null);

  const [bulguOpen, setBulguOpen] = useState(false);
  const [bulguEditId, setBulguEditId] = useState<string | null>(null);
  const [bulguForm, setBulguForm] = useState(emptyBulgu);

  const { data: planlar = [] } = useQuery<TetkikPlan[]>({
    queryKey: ["/api/tetkik/planlar"],
    queryFn: () => fetch("/api/tetkik/planlar").then(r => r.json()),
  });

  const { data: bulgular = [] } = useQuery<TetkikBulgu[]>({
    queryKey: ["/api/tetkik/bulgular"],
    queryFn: () => fetch("/api/tetkik/bulgular").then(r => r.json()),
  });

  const savePlan = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append("data", JSON.stringify(planForm));
      if (planDosya) fd.append("dosyaEki", planDosya);
      const url = planEditId ? `/api/tetkik/planlar/${planEditId}` : "/api/tetkik/planlar";
      const res = await fetch(url, { method: planEditId ? "PUT" : "POST", body: fd });
      if (!res.ok) throw new Error();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tetkik/planlar"] });
      queryClient.invalidateQueries({ queryKey: ["/api/iso9001/stats"] });
      setPlanOpen(false); setPlanEditId(null); setPlanForm(emptyPlan); setPlanDosya(null);
      toast({ title: planEditId ? "Plan güncellendi" : "Plan oluşturuldu" });
    },
    onError: () => toast({ title: "Hata", variant: "destructive" }),
  });

  const deletePlan = useMutation({
    mutationFn: (id: string) => fetch(`/api/tetkik/planlar/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tetkik/planlar"] });
      queryClient.invalidateQueries({ queryKey: ["/api/iso9001/stats"] });
    },
  });

  const saveBulgu = useMutation({
    mutationFn: async () => {
      const url = bulguEditId ? `/api/tetkik/bulgular/${bulguEditId}` : "/api/tetkik/bulgular";
      const res = await fetch(url, { method: bulguEditId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bulguForm) });
      if (!res.ok) throw new Error();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tetkik/bulgular"] });
      setBulguOpen(false); setBulguEditId(null); setBulguForm(emptyBulgu);
      toast({ title: bulguEditId ? "Bulgu güncellendi" : "Bulgu eklendi" });
    },
    onError: () => toast({ title: "Hata", variant: "destructive" }),
  });

  const deleteBulgu = useMutation({
    mutationFn: (id: string) => fetch(`/api/tetkik/bulgular/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/tetkik/bulgular"] }),
  });

  // KPI'lar listeden türetilir
  const planTamamlandi = planlar.filter(p => p.durum === "tamamlandi").length;
  const bulguUygunsuzluk = bulgular.filter(b => b.bulguTuru === "uygunsuzluk").length;
  const bulguAcik = bulgular.filter(b => b.durum === "acik").length;

  const kpis = [
    { label: "Tetkik Planı", value: String(planlar.length), sub: `${planTamamlandi} tamamlandı`, color: "#0ea5e9", valColor: "#0f172a" },
    { label: "Toplam Bulgu", value: String(bulgular.length), sub: "tüm tetkikler", color: "#7c3aed", valColor: "#0f172a" },
    { label: "Uygunsuzluk", value: String(bulguUygunsuzluk), sub: "DÖF tetikleyebilir", color: "#dc2626", valColor: "#dc2626" },
    { label: "Açık Bulgu", value: String(bulguAcik), sub: "kapatılmayı bekliyor", color: "#ea580c", valColor: "#c2410c" },
  ];

  const TABS = [
    { id: "planlar", label: "Tetkik Planları", count: planlar.length },
    { id: "bulgular", label: "Bulgular", count: bulgular.length },
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
                  <Search className="h-[22px] w-[22px]" strokeWidth={1.9} />
                </div>
                <div>
                  <h1 className="text-[21px] font-extrabold tracking-tight">İç Tetkik</h1>
                  <p className="mt-0.5 text-[12.5px] text-muted-foreground">ISO 9001 · tetkik planları ve bulgu (uygunsuzluk/gözlem) takibi</p>
                </div>
              </div>

              {/* Bağlama duyarlı birincil aksiyon — aktif sekmeye göre Yeni Plan / Yeni Bulgu */}
              {tab === "planlar" ? (
                <Dialog open={planOpen} onOpenChange={setPlanOpen}>
                  <DialogTrigger asChild>
                    <Button
                      className="h-[38px] gap-2 rounded-[9px] bg-slate-900 px-4 text-[13px] font-semibold text-white hover:bg-slate-800"
                      onClick={() => { setPlanEditId(null); setPlanForm(emptyPlan); setPlanDosya(null); }}
                    >
                      <Plus className="h-4 w-4" />Yeni Plan
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader><DialogTitle>{planEditId ? "Planı Düzenle" : "Yeni Tetkik Planı"}</DialogTitle></DialogHeader>
                    <div className="space-y-4 mt-2">
                      <div><Label>Tetkik Adı *</Label><Input value={planForm.tetkikAdi} onChange={e => setPlanForm(f => ({ ...f, tetkikAdi: e.target.value }))} /></div>
                      <div className="grid grid-cols-2 gap-3">
                        <div><Label>Planlanan Tarih *</Label><Input type="date" value={planForm.planlananTarih} onChange={e => setPlanForm(f => ({ ...f, planlananTarih: e.target.value }))} /></div>
                        <div>
                          <Label>Durum *</Label>
                          <Select value={planForm.durum} onValueChange={v => setPlanForm(f => ({ ...f, durum: v }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{PLAN_DURUM.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div><Label>Tetkik Edilen Bölüm/Süreç *</Label><Input value={planForm.tetkikEdilenBolum} onChange={e => setPlanForm(f => ({ ...f, tetkikEdilenBolum: e.target.value }))} /></div>
                      <div><Label>Baş Tetkikçi *</Label><Input value={planForm.basTetkikci} onChange={e => setPlanForm(f => ({ ...f, basTetkikci: e.target.value }))} /></div>
                      <div><Label>Dosya Eki (PDF)</Label><Input type="file" accept=".pdf" onChange={e => setPlanDosya(e.target.files?.[0] ?? null)} /></div>
                      <Button className="w-full" onClick={() => savePlan.mutate()} disabled={savePlan.isPending || !planForm.tetkikAdi || !planForm.planlananTarih || !planForm.tetkikEdilenBolum || !planForm.basTetkikci}>
                        {savePlan.isPending ? "Kaydediliyor..." : "Kaydet"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              ) : (
                <Dialog open={bulguOpen} onOpenChange={setBulguOpen}>
                  <DialogTrigger asChild>
                    <Button
                      className="h-[38px] gap-2 rounded-[9px] bg-slate-900 px-4 text-[13px] font-semibold text-white hover:bg-slate-800"
                      onClick={() => { setBulguEditId(null); setBulguForm(emptyBulgu); }}
                    >
                      <Plus className="h-4 w-4" />Yeni Bulgu
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader><DialogTitle>{bulguEditId ? "Bulguyu Düzenle" : "Yeni Bulgu"}</DialogTitle></DialogHeader>
                    <div className="space-y-4 mt-2">
                      <div>
                        <Label>Bağlı Tetkik *</Label>
                        <Select value={bulguForm.tetkikPlanId} onValueChange={v => setBulguForm(f => ({ ...f, tetkikPlanId: v }))}>
                          <SelectTrigger><SelectValue placeholder="Tetkik seçin" /></SelectTrigger>
                          <SelectContent>{planlar.map(p => <SelectItem key={p.id} value={p.id}>{p.tetkikAdi} — {p.planlananTarih}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Bulgu Türü *</Label>
                        <Select value={bulguForm.bulguTuru} onValueChange={v => setBulguForm(f => ({ ...f, bulguTuru: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{BULGU_TURU.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div><Label>Bulgu Açıklaması *</Label><Textarea rows={3} value={bulguForm.bulguAciklamasi} onChange={e => setBulguForm(f => ({ ...f, bulguAciklamasi: e.target.value }))} /></div>
                      <div><Label>İlgili ISO Maddesi</Label><Input placeholder="ör. 8.4.1" value={bulguForm.ilgiliIsoMaddesi} onChange={e => setBulguForm(f => ({ ...f, ilgiliIsoMaddesi: e.target.value }))} /></div>
                      <div>
                        <Label>Durum *</Label>
                        <Select value={bulguForm.durum} onValueChange={v => setBulguForm(f => ({ ...f, durum: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{BULGU_DURUM.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <Button className="w-full" onClick={() => saveBulgu.mutate()} disabled={saveBulgu.isPending || !bulguForm.tetkikPlanId || !bulguForm.bulguAciklamasi}>
                        {saveBulgu.isPending ? "Kaydediliyor..." : "Kaydet"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>

            {/* Tab barı — aktif tab inset alt çizgi + sayı rozeti */}
            <div className="mt-3.5 flex gap-1">
              {TABS.map((t) => {
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-t-lg px-3.5 py-2.5 text-[13.5px] transition-colors",
                      active
                        ? "font-bold text-foreground shadow-[inset_0_-2px_0_#0ea5e9]"
                        : "font-semibold text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t.label}
                    <span
                      className={cn(
                        "inline-flex h-[19px] min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-extrabold tabular-nums",
                        active ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-400"
                      )}
                    >
                      {t.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ===== KPI ŞERİDİ ===== */}
          <div className="mt-5 grid grid-cols-2 gap-3.5 md:grid-cols-4">
            {kpis.map((k) => (
              <div key={k.label} className="relative overflow-hidden rounded-[14px] border bg-card p-4">
                <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: k.color }} />
                <div className="pl-2 text-[10.5px] font-bold uppercase leading-tight tracking-wide text-muted-foreground">{k.label}</div>
                <div className="mt-2 pl-2 text-[22px] font-extrabold tracking-tight tabular-nums" style={{ color: k.valColor }}>{k.value}</div>
                <div className="mt-0.5 pl-2 text-[11.5px] text-muted-foreground">{k.sub}</div>
              </div>
            ))}
          </div>

          {/* ===== PLANLAR ===== */}
          <TabsContent value="planlar" className="mt-4">
            <div className="overflow-hidden rounded-[14px] border bg-card">
              <div className="border-b px-5 py-4">
                <h3 className="text-[15px] font-bold">Tetkik Planları</h3>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Tetkik Adı</TableHead>
                      <TableHead className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Tarih</TableHead>
                      <TableHead className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Bölüm/Süreç</TableHead>
                      <TableHead className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Baş Tetkikçi</TableHead>
                      <TableHead className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Durum</TableHead>
                      <TableHead className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Ek</TableHead>
                      <TableHead className="w-20"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {planlar.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Kayıt yok</TableCell></TableRow>}
                    {planlar.map(row => {
                      const meta = PLAN_DURUM_META[row.durum] ?? PLAN_DURUM_META.planlandi;
                      return (
                        <TableRow key={row.id} className="hover:bg-slate-50">
                          <TableCell className="text-[13.5px] font-bold text-slate-800">{row.tetkikAdi}</TableCell>
                          <TableCell className="text-[12.5px] text-slate-500 tabular-nums">{row.planlananTarih}</TableCell>
                          <TableCell className="text-[12.5px] text-slate-600">{row.tetkikEdilenBolum}</TableCell>
                          <TableCell className="text-[12.5px] text-slate-600">{row.basTetkikci}</TableCell>
                          <TableCell>
                            <span className="inline-block rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: meta.bg, color: meta.color }}>
                              {PLAN_DURUM.find(o => o.value === row.durum)?.label}
                            </span>
                          </TableCell>
                          <TableCell>{row.dosyaEki && <a href={row.dosyaEki} target="_blank" rel="noreferrer"><Paperclip className="w-4 h-4 text-muted-foreground hover:text-primary" /></a>}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" onClick={() => { setPlanEditId(row.id); setPlanForm({ tetkikAdi: row.tetkikAdi, planlananTarih: row.planlananTarih, tetkikEdilenBolum: row.tetkikEdilenBolum, basTetkikci: row.basTetkikci, durum: row.durum }); setPlanDosya(null); setPlanOpen(true); }}><Edit className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => deletePlan.mutate(row.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>

          {/* ===== BULGULAR ===== */}
          <TabsContent value="bulgular" className="mt-4">
            <div className="overflow-hidden rounded-[14px] border bg-card">
              <div className="border-b px-5 py-4">
                <h3 className="text-[15px] font-bold">Bulgular</h3>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Bağlı Tetkik</TableHead>
                      <TableHead className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Bulgu Türü</TableHead>
                      <TableHead className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Açıklama</TableHead>
                      <TableHead className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">ISO Maddesi</TableHead>
                      <TableHead className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Durum</TableHead>
                      <TableHead className="w-20"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bulgular.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Kayıt yok</TableCell></TableRow>}
                    {bulgular.map(row => {
                      const turMeta = BULGU_TUR_META[row.bulguTuru] ?? BULGU_TUR_META.uygunsuzluk;
                      const durumMeta = BULGU_DURUM_META[row.durum] ?? BULGU_DURUM_META.acik;
                      return (
                        <TableRow key={row.id} className="hover:bg-slate-50">
                          <TableCell className="text-[12.5px] font-semibold text-slate-800">{planlar.find(p => p.id === row.tetkikPlanId)?.tetkikAdi ?? row.tetkikPlanId}</TableCell>
                          <TableCell>
                            <span className="inline-block rounded-[6px] px-2 py-1 text-[10.5px] font-bold" style={{ background: turMeta.bg, color: turMeta.color }}>
                              {BULGU_TURU.find(o => o.value === row.bulguTuru)?.label}
                            </span>
                          </TableCell>
                          <TableCell className="max-w-xs truncate text-[12.5px] text-slate-600">{row.bulguAciklamasi}</TableCell>
                          <TableCell className="text-[12px] text-slate-500 tabular-nums">{row.ilgiliIsoMaddesi ?? "—"}</TableCell>
                          <TableCell>
                            <span className="inline-block rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: durumMeta.bg, color: durumMeta.color }}>
                              {BULGU_DURUM.find(o => o.value === row.durum)?.label}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" onClick={() => { setBulguEditId(row.id); setBulguForm({ tetkikPlanId: row.tetkikPlanId, bulguTuru: row.bulguTuru, bulguAciklamasi: row.bulguAciklamasi, ilgiliIsoMaddesi: row.ilgiliIsoMaddesi ?? "", durum: row.durum }); setBulguOpen(true); }}><Edit className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => deleteBulgu.mutate(row.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

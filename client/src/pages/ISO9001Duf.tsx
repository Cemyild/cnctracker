import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { type Duf } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit, Trash2, Paperclip, AlertTriangle } from "lucide-react";

function formatTarih(s: string | null | undefined): string {
  if (!s) return "—";
  const p = s.split("-");
  if (p.length !== 3) return s;
  return `${p[2]}/${p[1]}/${p[0]}`;
}

const KAYNAK_OPTIONS = [
  { value: "ic_tetkik", label: "İç Tetkik" },
  { value: "musteri_sikayeti", label: "Müşteri Şikayeti" },
  { value: "proses", label: "Proses" },
  { value: "diger", label: "Diğer" },
];

// Kaynak rozeti — yumuşak zemin + koyu metin (referansla birebir)
const KAYNAK_META: Record<string, { label: string; color: string; bg: string }> = {
  ic_tetkik: { label: "İç Tetkik", color: "#0369a1", bg: "#e0f2fe" },
  musteri_sikayeti: { label: "Müşteri Şikayeti", color: "#dc2626", bg: "#fee2e2" },
  proses: { label: "Proses", color: "#7c3aed", bg: "#ede9fe" },
  diger: { label: "Diğer", color: "#64748b", bg: "#f1f5f9" },
};

const DURUM_OPTIONS = [
  { value: "acik", label: "Açık" },
  { value: "devam_ediyor", label: "Devam Ediyor" },
  { value: "kapali", label: "Kapalı" },
];

const KAPAMA_SONUCU_OPTIONS = [
  { value: "basarili", label: "Başarılı" },
  { value: "basarisiz", label: "Başarısız" },
];

// Durum-renk mantığı (kaynağa sadık): kapali+basarisiz → Kapalı·Başarısız (rose);
// kapali → Kapalı·Başarılı (emerald); gecikmiş & açık → Gecikmiş (turuncu);
// devam_ediyor → Devam (amber); aksi halde Açık (rose).
function durumBadge(row: Duf, gecikmiş: boolean) {
  let label: string, bg: string, color: string;
  if (row.durum === "kapali") {
    if (row.kapamaSonucu === "basarisiz") {
      label = "Kapalı · Başarısız"; bg = "#fee2e2"; color = "#b91c1c";
    } else {
      label = "Kapalı · Başarılı"; bg = "#dcfce7"; color = "#15803d";
    }
  } else if (gecikmiş) {
    label = "Gecikmiş"; bg = "#ffedd5"; color = "#9a3412";
  } else if (row.durum === "devam_ediyor") {
    label = "Devam"; bg = "#fef9c3"; color = "#a16207";
  } else {
    label = "Açık"; bg = "#fee2e2"; color = "#b91c1c";
  }
  return (
    <span
      className="inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[10.5px] font-bold"
      style={{ background: bg, color }}
    >
      {label}
    </span>
  );
}

const emptyForm = {
  talepTarihi: "",
  talepEden: "",
  uygunsuzlukKaynagi: "ic_tetkik",
  aciklama: "",
  sorumluKisi: "",
  kokNedenAnalizi: "",
  alinanAksiyon: "",
  hedefKapanisTarihi: "",
  durum: "acik",
  sonucDogrulamaFaaliyetleri: "",
  kapamaTarihi: "",
  kapamaSonucu: "",
};

export default function ISO9001Duf() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [dosya, setDosya] = useState<File | null>(null);
  const [filtre, setFiltre] = useState<"tumu" | "acik" | "gecikmis" | "kapali">("tumu");

  const { data: list = [] } = useQuery<Duf[]>({
    queryKey: ["/api/duf"],
    queryFn: () => fetch("/api/duf").then(r => r.json()),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      const data: Record<string, string> = {
        ...form,
        baslik: form.aciklama.slice(0, 150),
      };
      if (!data.kapamaSonucu) delete data.kapamaSonucu;
      if (!data.kapamaTarihi) delete data.kapamaTarihi;
      if (!data.talepTarihi) delete data.talepTarihi;
      fd.append("data", JSON.stringify(data));
      if (dosya) fd.append("dosyaEki", dosya);
      const url = editId ? `/api/duf/${editId}` : "/api/duf";
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, { method, body: fd });
      if (!res.ok) throw new Error("Kayıt başarısız");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/duf"] });
      queryClient.invalidateQueries({ queryKey: ["/api/iso9001/stats"] });
      setOpen(false);
      setEditId(null);
      setForm(emptyForm);
      setDosya(null);
      toast({ title: editId ? "DÜF güncellendi" : "DÜF oluşturuldu" });
    },
    onError: () => toast({ title: "Hata", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/duf/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/duf"] });
      queryClient.invalidateQueries({ queryKey: ["/api/iso9001/stats"] });
      toast({ title: "DÜF silindi" });
    },
  });

  function openNew() {
    setEditId(null);
    setForm(emptyForm);
    setDosya(null);
    setOpen(true);
  }

  function openEdit(row: Duf) {
    setEditId(row.id);
    setForm({
      talepTarihi: row.talepTarihi ?? "",
      talepEden: row.talepEden ?? "",
      uygunsuzlukKaynagi: row.uygunsuzlukKaynagi,
      aciklama: row.aciklama,
      sorumluKisi: row.sorumluKisi,
      kokNedenAnalizi: row.kokNedenAnalizi ?? "",
      alinanAksiyon: row.alinanAksiyon ?? "",
      hedefKapanisTarihi: row.hedefKapanisTarihi,
      durum: row.durum,
      sonucDogrulamaFaaliyetleri: row.sonucDogrulamaFaaliyetleri ?? "",
      kapamaTarihi: row.kapamaTarihi ?? "",
      kapamaSonucu: row.kapamaSonucu ?? "",
    });
    setDosya(null);
    setOpen(true);
  }

  const today = new Date().toISOString().split("T")[0];
  const canSave = !!form.aciklama && !!form.sorumluKisi && !!form.hedefKapanisTarihi;

  // Gecikme bayrağı ile zenginleştirilmiş liste (KPI/çip/filtre türetimi)
  const computed = useMemo(
    () => list.map(row => ({ row, gecikmis: row.hedefKapanisTarihi < today && row.durum !== "kapali" })),
    [list, today],
  );

  const counts = useMemo(() => {
    const acik = computed.filter(c => c.row.durum !== "kapali").length;
    const devam = computed.filter(c => c.row.durum === "devam_ediyor").length;
    const gecikmis = computed.filter(c => c.gecikmis).length;
    const kapali = computed.filter(c => c.row.durum === "kapali").length;
    return { toplam: computed.length, acik, devam, gecikmis, kapali };
  }, [computed]);

  // KPI şeridi — sayılar listeden türetilir
  const kpis = [
    { label: "Toplam DÖF", value: String(counts.toplam), sub: "tüm kayıtlar", color: "#0ea5e9", valColor: undefined as string | undefined },
    { label: "Açık", value: String(counts.acik - counts.devam), sub: "henüz başlanmadı", color: "#dc2626", valColor: "#dc2626" },
    { label: "Devam Ediyor", value: String(counts.devam), sub: "aksiyon sürüyor", color: "#eab308", valColor: "#a16207" },
    { label: "Gecikmiş", value: String(counts.gecikmis), sub: "termin aşıldı", color: "#ea580c", valColor: "#c2410c" },
    { label: "Kapalı", value: String(counts.kapali), sub: "sonuçlandı", color: "#16a34a", valColor: "#16a34a" },
  ];

  const chips: { id: typeof filtre; label: string; count: number }[] = [
    { id: "tumu", label: "Tümü", count: counts.toplam },
    { id: "acik", label: "Açık / Devam", count: counts.acik },
    { id: "gecikmis", label: "Gecikmiş", count: counts.gecikmis },
    { id: "kapali", label: "Kapalı", count: counts.kapali },
  ];

  const filteredRows = useMemo(() => {
    if (filtre === "acik") return computed.filter(c => c.row.durum !== "kapali");
    if (filtre === "gecikmis") return computed.filter(c => c.gecikmis);
    if (filtre === "kapali") return computed.filter(c => c.row.durum === "kapali");
    return computed;
  }, [computed, filtre]);

  return (
    <div className="min-h-full bg-slate-50 dark:bg-background">
      <div className="px-6 pb-12 lg:px-8">
        {/* ===== STICKY HEADER ===== */}
        <div className="sticky top-0 z-20 border-b border-border/70 bg-slate-50/90 pb-4 pt-5 backdrop-blur dark:bg-background/90">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400">
                <AlertTriangle className="h-[22px] w-[22px]" strokeWidth={1.9} />
              </div>
              <div>
                <h1 className="text-[21px] font-extrabold tracking-tight">Düzeltici/Önleyici Faaliyet (DÖF)</h1>
                <p className="mt-0.5 text-[12.5px] text-muted-foreground">ISO 9001 · uygunsuzluk kayıtları, kök neden analizi ve kapanış takibi</p>
              </div>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button onClick={openNew} className="h-[38px] bg-slate-900 text-white hover:bg-slate-800"><Plus className="w-4 h-4 mr-2" />Yeni DÖF</Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editId ? "DÜF Düzenle" : "Yeni DÜF Kaydı"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-5 mt-2">

                  {/* Bölüm 1: Temel Bilgiler */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Temel Bilgiler</p>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Talep Tarihi</Label>
                          <Input type="date" value={form.talepTarihi} onChange={e => setForm(f => ({ ...f, talepTarihi: e.target.value }))} />
                        </div>
                        <div>
                          <Label>DF Talep Eden</Label>
                          <Input placeholder="Departman / Kişi" value={form.talepEden} onChange={e => setForm(f => ({ ...f, talepEden: e.target.value }))} />
                        </div>
                      </div>
                      <div>
                        <Label>Uygunsuzluk Kaynağı *</Label>
                        <Select value={form.uygunsuzlukKaynagi} onValueChange={v => setForm(f => ({ ...f, uygunsuzlukKaynagi: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {KAYNAK_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Uygunsuzluğun Tanımı *</Label>
                        <Textarea rows={3} value={form.aciklama} onChange={e => setForm(f => ({ ...f, aciklama: e.target.value }))} />
                      </div>
                      <div>
                        <Label>Yürütme Sorumlusu *</Label>
                        <Input value={form.sorumluKisi} onChange={e => setForm(f => ({ ...f, sorumluKisi: e.target.value }))} />
                      </div>
                    </div>
                  </div>

                  <hr />

                  {/* Bölüm 2: Analiz */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Analiz</p>
                    <div className="space-y-3">
                      <div>
                        <Label>Uygunsuzluk Sebebi</Label>
                        <Textarea rows={2} value={form.kokNedenAnalizi} onChange={e => setForm(f => ({ ...f, kokNedenAnalizi: e.target.value }))} />
                      </div>
                      <div>
                        <Label>Gerekli Düzeltici Faaliyetler</Label>
                        <Textarea rows={3} value={form.alinanAksiyon} onChange={e => setForm(f => ({ ...f, alinanAksiyon: e.target.value }))} />
                      </div>
                    </div>
                  </div>

                  <hr />

                  {/* Bölüm 3: Takip & Kapanış */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Takip & Kapanış</p>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Planlanan Bitiş Tarihi *</Label>
                          <Input type="date" value={form.hedefKapanisTarihi} onChange={e => setForm(f => ({ ...f, hedefKapanisTarihi: e.target.value }))} />
                        </div>
                        <div>
                          <Label>Durum *</Label>
                          <Select value={form.durum} onValueChange={v => setForm(f => ({ ...f, durum: v }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {DURUM_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div>
                        <Label>Sonuç / Doğrulama Faaliyetleri</Label>
                        <Textarea rows={2} value={form.sonucDogrulamaFaaliyetleri} onChange={e => setForm(f => ({ ...f, sonucDogrulamaFaaliyetleri: e.target.value }))} />
                      </div>
                      {form.durum === "kapali" && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label>Kapama Tarihi</Label>
                            <Input type="date" value={form.kapamaTarihi} onChange={e => setForm(f => ({ ...f, kapamaTarihi: e.target.value }))} />
                          </div>
                          <div>
                            <Label>Kapama Sonucu</Label>
                            <Select value={form.kapamaSonucu} onValueChange={v => setForm(f => ({ ...f, kapamaSonucu: v }))}>
                              <SelectTrigger><SelectValue placeholder="Seçiniz" /></SelectTrigger>
                              <SelectContent>
                                {KAPAMA_SONUCU_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <hr />

                  {/* Bölüm 4: Dosya */}
                  <div>
                    <Label>Dosya Eki (PDF/Word)</Label>
                    <Input type="file" accept=".pdf,.doc,.docx" onChange={e => setDosya(e.target.files?.[0] ?? null)} />
                  </div>

                  <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !canSave}>
                    {saveMutation.isPending ? "Kaydediliyor..." : "Kaydet"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* ===== KPI ŞERİDİ ===== */}
        <div className="mt-5 grid grid-cols-2 gap-3.5 md:grid-cols-3 lg:grid-cols-5">
          {kpis.map(k => (
            <div key={k.label} className="relative overflow-hidden rounded-[14px] border bg-card p-4">
              <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: k.color }} />
              <div className="pl-2 text-[10.5px] font-bold uppercase tracking-wide leading-tight text-muted-foreground">{k.label}</div>
              <div className="mt-2 pl-2 text-[22px] font-extrabold tracking-tight tabular-nums" style={k.valColor ? { color: k.valColor } : undefined}>{k.value}</div>
              <div className="mt-0.5 pl-2 text-[11.5px] text-muted-foreground">{k.sub}</div>
            </div>
          ))}
        </div>

        {/* ===== FİLTRE ÇİPLERİ ===== */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {chips.map(c => {
            const active = filtre === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setFiltre(c.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] transition-colors",
                  active
                    ? "border-slate-900 bg-slate-900 font-bold text-white"
                    : "border-border bg-card font-semibold text-slate-600 hover:text-foreground",
                )}
              >
                {c.label}
                <span className={cn(
                  "inline-flex h-[18px] min-w-[19px] items-center justify-center rounded-full px-1.5 text-[10.5px] font-extrabold tabular-nums",
                  active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-400",
                )}>{c.count}</span>
              </button>
            );
          })}
        </div>

        {/* ===== TABLO ===== */}
        <div className="mt-3.5 overflow-hidden rounded-[14px] border bg-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12 text-center text-[10.5px] font-bold uppercase tracking-wide text-slate-500">No</TableHead>
                  <TableHead className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Uygunsuzluk · Kaynak</TableHead>
                  <TableHead className="whitespace-nowrap text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Sorumlu</TableHead>
                  <TableHead className="whitespace-nowrap text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Talep</TableHead>
                  <TableHead className="whitespace-nowrap text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Termin</TableHead>
                  <TableHead className="whitespace-nowrap text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Kapama</TableHead>
                  <TableHead className="text-center text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Durum</TableHead>
                  <TableHead className="text-right text-[10.5px] font-bold uppercase tracking-wide text-slate-500">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">Kayıt yok</TableCell>
                  </TableRow>
                )}
                {filteredRows.map(({ row, gecikmis }, idx) => {
                  const kaynak = KAYNAK_META[row.uygunsuzlukKaynagi] ?? { label: row.uygunsuzlukKaynagi, color: "#64748b", bg: "#f1f5f9" };
                  return (
                    <TableRow key={row.id} className="hover:bg-slate-50">
                      <TableCell className="text-center text-[12px] font-bold tabular-nums text-slate-400">{filteredRows.length - idx}</TableCell>
                      <TableCell className="max-w-md">
                        <div className="text-[13px] font-semibold leading-snug text-slate-800 line-clamp-2">{row.aciklama}</div>
                        <div className="mt-1">
                          <span className="rounded-[5px] px-2 py-0.5 text-[10.5px] font-bold" style={{ color: kaynak.color, background: kaynak.bg }}>{kaynak.label}</span>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-[12.5px] text-slate-600">{row.sorumluKisi}</TableCell>
                      <TableCell className="whitespace-nowrap text-[12.5px] tabular-nums text-slate-500">{formatTarih(row.talepTarihi)}</TableCell>
                      <TableCell className="whitespace-nowrap text-[12.5px] font-semibold tabular-nums" style={{ color: gecikmis ? "#ea580c" : "#475569" }}>
                        {formatTarih(row.hedefKapanisTarihi)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-[12.5px] tabular-nums text-slate-500">{formatTarih(row.kapamaTarihi)}</TableCell>
                      <TableCell className="text-center">{durumBadge(row, gecikmis)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {row.dosyaEki && (
                            <a href={row.dosyaEki} target="_blank" rel="noreferrer" className="inline-flex">
                              <Paperclip className="w-4 h-4 text-muted-foreground hover:text-primary" />
                            </a>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => openEdit(row)}><Edit className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(row.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}

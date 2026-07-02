import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Plus, Upload, ChevronDown, ChevronUp, Trash2, Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type BelgeVersiyon = {
  id: string;
  belgeId: string;
  versiyonNo: string;
  degisiklikNotu: string | null;
  dosyaYolu: string;
  isAktif: boolean;
  olusturmaTarihi: string;
};

type Belge = {
  id: string;
  baslik: string;
  anaKategori: string;
  altKategori: string;
  aciklama: string | null;
  olusturmaTarihi: string;
  aktifVersiyon: BelgeVersiyon | null;
};

const ANA_KATEGORILER = ["Prosedür", "Talimat", "Form", "Diğer"];

// Kategori renk eşlemesi (referansla birebir): Prosedür sky, Talimat violet, Form teal, Diğer slate
const KAT_META: Record<string, { text: string; bg: string }> = {
  "Prosedür": { text: "#0369a1", bg: "#e0f2fe" },
  "Talimat": { text: "#7c3aed", bg: "#ede9fe" },
  "Form": { text: "#0f766e", bg: "#ccfbf1" },
  "Diğer": { text: "#64748b", bg: "#f1f5f9" },
};
const katMeta = (k: string) => KAT_META[k] ?? { text: "#64748b", bg: "#f1f5f9" };

export default function ISO9001Belgeler() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [filterAnaKategori, setFilterAnaKategori] = useState("tumu");
  const [filterAltKategori, setFilterAltKategori] = useState("");
  const [filterDurum, setFilterDurum] = useState("tumu");
  const [filterBaslangic, setFilterBaslangic] = useState("");
  const [filterBitis, setFilterBitis] = useState("");
  const [filterArama, setFilterArama] = useState("");

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [yeniBelgeAcik, setYeniBelgeAcik] = useState(false);
  const [yeniVersiyonBelge, setYeniVersiyonBelge] = useState<Belge | null>(null);

  const [form, setForm] = useState({ baslik: "", anaKategori: "", altKategori: "", aciklama: "", versiyonNo: "v1.0", degisiklikNotu: "" });
  const [formDosya, setFormDosya] = useState<File | null>(null);

  const [versiyonForm, setVersiyonForm] = useState({ versiyonNo: "", degisiklikNotu: "" });
  const [versiyonDosya, setVersiyonDosya] = useState<File | null>(null);

  const queryParams = new URLSearchParams();
  if (filterAnaKategori && filterAnaKategori !== "tumu") queryParams.set("anaKategori", filterAnaKategori);
  if (filterAltKategori) queryParams.set("altKategori", filterAltKategori);
  if (filterDurum && filterDurum !== "tumu") queryParams.set("durum", filterDurum);
  if (filterBaslangic) queryParams.set("baslangic", filterBaslangic);
  if (filterBitis) queryParams.set("bitis", filterBitis);
  if (filterArama) queryParams.set("arama", filterArama);

  const { data: belgeler = [] } = useQuery<Belge[]>({
    queryKey: ["/api/belgeler", filterAnaKategori, filterAltKategori, filterDurum, filterBaslangic, filterBitis, filterArama],
    queryFn: () => fetch(`/api/belgeler?${queryParams}`).then(r => r.json()),
  });

  const { data: versiyonlar = [] } = useQuery<BelgeVersiyon[]>({
    queryKey: ["/api/belgeler", expandedId, "versiyonlar"],
    queryFn: () => fetch(`/api/belgeler/${expandedId}/versiyonlar`).then(r => r.json()),
    enabled: !!expandedId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!formDosya) throw new Error("Dosya seçilmedi");
      const fd = new FormData();
      fd.append("dosya", formDosya);
      fd.append("data", JSON.stringify({
        baslik: form.baslik,
        anaKategori: form.anaKategori,
        altKategori: form.altKategori,
        aciklama: form.aciklama || null,
        versiyonNo: form.versiyonNo,
        degisiklikNotu: form.degisiklikNotu || null,
      }));
      const res = await fetch("/api/belgeler", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Hata");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/belgeler"] });
      qc.invalidateQueries({ queryKey: ["/api/iso9001/stats"] });
      setYeniBelgeAcik(false);
      setForm({ baslik: "", anaKategori: "", altKategori: "", aciklama: "", versiyonNo: "v1.0", degisiklikNotu: "" });
      setFormDosya(null);
      toast({ title: "Belge oluşturuldu" });
    },
    onError: () => toast({ title: "Hata", description: "Belge oluşturulamadı", variant: "destructive" }),
  });

  const addVersiyonMutation = useMutation({
    mutationFn: async () => {
      if (!versiyonDosya || !yeniVersiyonBelge) throw new Error("Eksik");
      const fd = new FormData();
      fd.append("dosya", versiyonDosya);
      fd.append("data", JSON.stringify({ versiyonNo: versiyonForm.versiyonNo, degisiklikNotu: versiyonForm.degisiklikNotu || null }));
      const res = await fetch(`/api/belgeler/${yeniVersiyonBelge.id}/versiyonlar`, { method: "POST", body: fd });
      if (!res.ok) throw new Error("Hata");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/belgeler"] });
      setYeniVersiyonBelge(null);
      setVersiyonForm({ versiyonNo: "", degisiklikNotu: "" });
      setVersiyonDosya(null);
      toast({ title: "Yeni versiyon eklendi" });
    },
    onError: () => toast({ title: "Hata", description: "Versiyon eklenemedi", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/belgeler/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/belgeler"] });
      qc.invalidateQueries({ queryKey: ["/api/iso9001/stats"] });
      toast({ title: "Belge silindi" });
    },
    onError: () => toast({ title: "Hata", description: "Belge silinemedi", variant: "destructive" }),
  });

  // KPI'lar listeden türetilir (kategori sayıları)
  const byKat = (k: string) => belgeler.filter(b => b.anaKategori === k).length;
  const kpis = [
    { label: "Toplam Belge", value: String(belgeler.length), sub: "aktif kayıt", color: "#0ea5e9" },
    { label: "Prosedür", value: String(byKat("Prosedür")), sub: "süreç tanımı", color: "#0369a1" },
    { label: "Talimat", value: String(byKat("Talimat")), sub: "iş talimatı", color: "#7c3aed" },
    { label: "Form", value: String(byKat("Form")), sub: "kayıt formu", color: "#0f766e" },
  ];

  const KATEGORI_CHIPS = ["tumu", ...ANA_KATEGORILER];
  const COLS = "2.3fr 1.4fr 1fr 1.1fr 1.3fr";

  return (
    <div className="min-h-full bg-slate-50 dark:bg-background">
      <div className="px-6 pb-12 lg:px-8">
        {/* ===== STICKY HEADER ===== */}
        <div className="sticky top-0 z-20 border-b border-border/70 bg-slate-50/90 pt-5 pb-3.5 backdrop-blur dark:bg-background/90">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400">
                <FileText className="h-[22px] w-[22px]" strokeWidth={1.9} />
              </div>
              <div>
                <h1 className="text-[21px] font-extrabold tracking-tight">Belge Arşivi</h1>
                <p className="mt-0.5 text-[12.5px] text-muted-foreground">ISO 9001 · prosedür, talimat ve formların versiyonlu kayıt sistemi</p>
              </div>
            </div>
            <Button onClick={() => setYeniBelgeAcik(true)} className="h-[38px] rounded-[9px] bg-slate-900 text-white hover:bg-slate-800">
              <Plus className="w-4 h-4 mr-2" /> Yeni Belge
            </Button>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          {/* ===== KPI STRIP ===== */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            {kpis.map((k) => (
              <div key={k.label} className="relative overflow-hidden rounded-[14px] border bg-card p-4">
                <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: k.color }} />
                <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground leading-tight pl-2">{k.label}</div>
                <div className="mt-2 text-[22px] font-extrabold tracking-tight tabular-nums pl-2">{k.value}</div>
                <div className="mt-0.5 text-[11.5px] text-muted-foreground pl-2">{k.sub}</div>
              </div>
            ))}
          </div>

          {/* ===== FILTER CARD ===== */}
          <div className="rounded-[14px] border bg-card p-3 space-y-3">
            {/* Kategori çipleri + arama */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-1.5">
                {KATEGORI_CHIPS.map((k) => {
                  const active = filterAnaKategori === k;
                  return (
                    <button
                      key={k}
                      onClick={() => { setFilterAnaKategori(k); setExpandedId(null); }}
                      className={cn(
                        "rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors",
                        active
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-border bg-white text-slate-600 hover:bg-slate-50 dark:bg-transparent dark:text-slate-300"
                      )}
                    >
                      {k === "tumu" ? "Tümü" : k}
                    </button>
                  );
                })}
              </div>
              <div className="relative ml-auto min-w-[220px] max-w-[300px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Belge ara…"
                  value={filterArama}
                  onChange={(e) => setFilterArama(e.target.value)}
                  className="h-9 rounded-[9px] pl-9 text-[13px]"
                />
              </div>
            </div>

            {/* İkincil filtreler (alt kategori · durum · tarih aralığı) — korunuyor */}
            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              <Input
                placeholder="Alt kategori…"
                value={filterAltKategori}
                onChange={(e) => setFilterAltKategori(e.target.value)}
                className="h-9 w-[160px] rounded-[9px] text-[13px]"
              />
              <Select value={filterDurum} onValueChange={setFilterDurum}>
                <SelectTrigger className="h-9 w-[130px] rounded-[9px] text-[12.5px]"><SelectValue placeholder="Durum" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tumu">Tümü</SelectItem>
                  <SelectItem value="aktif">Aktif</SelectItem>
                  <SelectItem value="arsiv">Arşiv</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <span className="font-semibold">Tarih</span>
                <Input type="date" value={filterBaslangic} onChange={(e) => setFilterBaslangic(e.target.value)} className="h-9 w-[150px] rounded-[9px] text-[12.5px]" />
                <span>–</span>
                <Input type="date" value={filterBitis} onChange={(e) => setFilterBitis(e.target.value)} className="h-9 w-[150px] rounded-[9px] text-[12.5px]" />
              </div>
            </div>
          </div>

          {/* ===== TABLE ===== */}
          <div className="overflow-hidden rounded-[14px] border bg-card">
            <div className="overflow-x-auto">
              <div className="min-w-[920px]">
                {/* Başlık satırı */}
                <div
                  className="grid gap-3 border-b bg-slate-50 px-5 py-3 text-[10.5px] font-bold uppercase tracking-wide text-slate-500"
                  style={{ gridTemplateColumns: COLS }}
                >
                  <div>Belge Adı</div>
                  <div>Kategori</div>
                  <div className="text-center">Aktif Versiyon</div>
                  <div>Son Güncelleme</div>
                  <div className="text-right">İşlemler</div>
                </div>

                {belgeler.length === 0 ? (
                  <div className="px-5 py-10 text-center text-sm text-muted-foreground">Henüz belge yok</div>
                ) : (
                  belgeler.map((belge) => {
                    const km = katMeta(belge.anaKategori);
                    const isExp = expandedId === belge.id;
                    return (
                      <div key={belge.id} className="border-b last:border-b-0">
                        <div
                          className="grid items-center gap-3 px-5 py-[13px] transition-colors hover:bg-slate-50"
                          style={{ gridTemplateColumns: COLS }}
                        >
                          {/* Belge Adı */}
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-lg" style={{ background: km.bg, color: km.text }}>
                              <FileText className="h-[15px] w-[15px]" strokeWidth={1.9} />
                            </span>
                            <span className="truncate text-[13.5px] font-bold text-slate-800">{belge.baslik}</span>
                          </div>
                          {/* Kategori */}
                          <div className="min-w-0 truncate text-[12.5px]">
                            <span className="rounded-md px-2 py-0.5 text-[11px] font-bold" style={{ background: km.bg, color: km.text }}>{belge.anaKategori}</span>
                            <span className="text-slate-400"> › {belge.altKategori}</span>
                          </div>
                          {/* Aktif Versiyon */}
                          <div className="text-center">
                            {belge.aktifVersiyon ? (
                              <span className="inline-block rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-emerald-700">{belge.aktifVersiyon.versiyonNo}</span>
                            ) : (
                              <span className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-500">Arşiv</span>
                            )}
                          </div>
                          {/* Son Güncelleme */}
                          <div className="text-[12.5px] tabular-nums text-slate-500">
                            {belge.aktifVersiyon ? new Date(belge.aktifVersiyon.olusturmaTarihi).toLocaleDateString("tr-TR") : "—"}
                          </div>
                          {/* İşlemler */}
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setExpandedId(isExp ? null : belge.id)}
                              className="inline-flex items-center gap-1.5 rounded-[7px] border bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                            >
                              Versiyonlar
                              {isExp ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </button>
                            <button
                              onClick={() => { setYeniVersiyonBelge(belge); setVersiyonForm({ versiyonNo: "", degisiklikNotu: "" }); }}
                              title="Yeni Versiyon"
                              className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[7px] border bg-white text-slate-600 transition-colors hover:bg-slate-50"
                            >
                              <Upload className="h-[14px] w-[14px]" />
                            </button>
                            <button
                              onClick={() => { if (confirm("Bu belge ve tüm versiyonları silinecek. Emin misiniz?")) deleteMutation.mutate(belge.id); }}
                              title="Sil"
                              className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[7px] border bg-white text-rose-500 transition-colors hover:bg-rose-50"
                            >
                              <Trash2 className="h-[14px] w-[14px]" />
                            </button>
                          </div>
                        </div>

                        {/* Açılır versiyon geçmişi satırı */}
                        {isExp && (
                          <div className="border-t bg-slate-50 px-5 py-4 pl-[60px]">
                            <div className="mb-2.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Versiyon Geçmişi</div>
                            <div className="flex flex-col gap-2">
                              {versiyonlar.length === 0 && <div className="text-[12.5px] text-muted-foreground">Versiyon bulunamadı</div>}
                              {versiyonlar.map((v) => (
                                <div key={v.id} className="flex items-center gap-3">
                                  <span
                                    className={cn(
                                      "inline-block flex-shrink-0 rounded-full px-2.5 py-0.5 text-[10.5px] font-bold tabular-nums",
                                      v.isAktif ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                                    )}
                                  >
                                    {v.isAktif ? "Aktif" : "Arşiv"} · {v.versiyonNo}
                                  </span>
                                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-600">{v.degisiklikNotu ?? "—"}</span>
                                  <span className="flex-shrink-0 text-[11.5px] tabular-nums text-slate-400">{new Date(v.olusturmaTarihi).toLocaleDateString("tr-TR")}</span>
                                  <a href={v.dosyaYolu} target="_blank" rel="noreferrer" className="flex-shrink-0">
                                    <span className="inline-flex items-center gap-1.5 rounded-md border bg-white px-2.5 py-1 text-[11px] font-semibold text-sky-600 transition-colors hover:bg-sky-50">
                                      <Download className="h-3 w-3" /> İndir
                                    </span>
                                  </a>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Yeni Belge Modal */}
        <Dialog open={yeniBelgeAcik} onOpenChange={setYeniBelgeAcik}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Yeni Belge</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Başlık *</Label>
                <Input value={form.baslik} onChange={e => setForm(f => ({ ...f, baslik: e.target.value }))} />
              </div>
              <div>
                <Label>Ana Kategori *</Label>
                <Select value={form.anaKategori} onValueChange={v => setForm(f => ({ ...f, anaKategori: v }))}>
                  <SelectTrigger><SelectValue placeholder="Seç..." /></SelectTrigger>
                  <SelectContent>{ANA_KATEGORILER.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Alt Kategori *</Label>
                <Input placeholder="ör. Satın Alma" value={form.altKategori} onChange={e => setForm(f => ({ ...f, altKategori: e.target.value }))} />
              </div>
              <div>
                <Label>Açıklama</Label>
                <Textarea value={form.aciklama} onChange={e => setForm(f => ({ ...f, aciklama: e.target.value }))} rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>İlk Versiyon No *</Label>
                  <Input value={form.versiyonNo} onChange={e => setForm(f => ({ ...f, versiyonNo: e.target.value }))} />
                </div>
                <div>
                  <Label>Değişiklik Notu</Label>
                  <Input value={form.degisiklikNotu} onChange={e => setForm(f => ({ ...f, degisiklikNotu: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label>Dosya * (PDF veya Word)</Label>
                <Input type="file" accept=".pdf,.doc,.docx" onChange={e => setFormDosya(e.target.files?.[0] ?? null)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setYeniBelgeAcik(false)}>İptal</Button>
              <Button onClick={() => createMutation.mutate()} disabled={!form.baslik || !form.anaKategori || !form.altKategori || !form.versiyonNo || !formDosya || createMutation.isPending}>
                {createMutation.isPending ? "Kaydediliyor..." : "Kaydet"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Yeni Versiyon Modal */}
        <Dialog open={!!yeniVersiyonBelge} onOpenChange={open => { if (!open) setYeniVersiyonBelge(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Yeni Versiyon — {yeniVersiyonBelge?.baslik}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Versiyon No *</Label>
                <Input placeholder="ör. v2.0" value={versiyonForm.versiyonNo} onChange={e => setVersiyonForm(f => ({ ...f, versiyonNo: e.target.value }))} />
              </div>
              <div>
                <Label>Değişiklik Notu</Label>
                <Textarea value={versiyonForm.degisiklikNotu} onChange={e => setVersiyonForm(f => ({ ...f, degisiklikNotu: e.target.value }))} rows={3} />
              </div>
              <div>
                <Label>Dosya * (PDF veya Word)</Label>
                <Input type="file" accept=".pdf,.doc,.docx" onChange={e => setVersiyonDosya(e.target.files?.[0] ?? null)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setYeniVersiyonBelge(null)}>İptal</Button>
              <Button onClick={() => addVersiyonMutation.mutate()} disabled={!versiyonForm.versiyonNo || !versiyonDosya || addVersiyonMutation.isPending}>
                {addVersiyonMutation.isPending ? "Yükleniyor..." : "Yükle"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

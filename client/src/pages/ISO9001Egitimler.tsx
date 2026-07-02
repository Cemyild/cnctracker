import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { GraduationCap, Plus, Pencil, Trash2, ChevronDown, ChevronRight, Link as LinkIcon, User, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type IsoPersonel = {
  id: string;
  ad: string;
  pozisyon: string | null;
  departman: string | null;
  egitimSayisi: number;
};

type Egitim = {
  id: string;
  baslik: string;
  egitimTarihi: string;
  sure: string | null;
  egitimci: string | null;
  aciklama: string | null;
  sertifikaDosyaYolu: string | null;
  katilimciSayisi: number;
  degerlendirmeSayisi: number;
};

type Katilimci = {
  id: string;
  egitimId: string;
  personelId: string;
  personel: IsoPersonel;
};

type Soru = {
  id: string;
  soru: string;
  tip: string;
  sira: number;
};

type PersonelKart = {
  personel: IsoPersonel;
  egitimler: { egitimId: string; baslik: string; egitimTarihi: string; degerlendirmeDoldu: boolean }[];
};

const emptyPersonelForm = { ad: "", pozisyon: "", departman: "" };
const emptyEgitimForm = { baslik: "", egitimTarihi: "", sure: "", egitimci: "", aciklama: "" };

// Personel avatar renk paleti (referanstan) — [zemin, metin]
const avatarPalette: [string, string][] = [
  ["bg-sky-100 dark:bg-sky-950/40", "text-sky-700 dark:text-sky-300"],
  ["bg-violet-100 dark:bg-violet-950/40", "text-violet-700 dark:text-violet-300"],
  ["bg-emerald-100 dark:bg-emerald-950/40", "text-emerald-700 dark:text-emerald-300"],
  ["bg-amber-100 dark:bg-amber-950/40", "text-amber-700 dark:text-amber-300"],
  ["bg-rose-100 dark:bg-rose-950/40", "text-rose-700 dark:text-rose-300"],
];
const getInitials = (ad: string) => ad.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();

export default function ISO9001Egitimler() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [tab, setTab] = useState("egitimler");
  const [expandedEgitimId, setExpandedEgitimId] = useState<string | null>(null);
  const [egitimModal, setEgitimModal] = useState<{ open: boolean; editing: Egitim | null }>({ open: false, editing: null });
  const [egitimForm, setEgitimForm] = useState(emptyEgitimForm);
  const [egitimSertifika, setEgitimSertifika] = useState<File | null>(null);
  const [katilimciModal, setKatilimciModal] = useState<{ open: boolean; egitimId: string | null }>({ open: false, egitimId: null });
  const [selectedPersonelIds, setSelectedPersonelIds] = useState<string[]>([]);
  const [personelModal, setPersonelModal] = useState<{ open: boolean; editing: IsoPersonel | null }>({ open: false, editing: null });
  const [personelForm, setPersonelForm] = useState(emptyPersonelForm);
  const [kartModal, setKartModal] = useState<{ open: boolean; personelId: string | null }>({ open: false, personelId: null });
  const [soruModal, setSoruModal] = useState<{ open: boolean; editing: Soru | null }>({ open: false, editing: null });
  const [soruForm, setSoruForm] = useState({ soru: "", tip: "puan_1_5" });

  const { data: egitimlerList = [] } = useQuery<Egitim[]>({
    queryKey: ["/api/egitimler"],
    queryFn: () => fetch("/api/egitimler").then(r => r.json()),
  });

  const { data: personellerList = [] } = useQuery<IsoPersonel[]>({
    queryKey: ["/api/iso-personeller"],
    queryFn: () => fetch("/api/iso-personeller").then(r => r.json()),
  });

  const { data: sorularList = [] } = useQuery<Soru[]>({
    queryKey: ["/api/degerlendirme-sorulari"],
    queryFn: () => fetch("/api/degerlendirme-sorulari").then(r => r.json()),
  });

  const { data: katilimcilar = [] } = useQuery<Katilimci[]>({
    queryKey: ["/api/egitimler", expandedEgitimId, "katilimcilar"],
    queryFn: () => fetch(`/api/egitimler/${expandedEgitimId}/katilimcilar`).then(r => r.json()),
    enabled: !!expandedEgitimId,
  });

  const { data: kartData } = useQuery<PersonelKart>({
    queryKey: ["/api/iso-personeller", kartModal.personelId, "kart"],
    queryFn: () => fetch(`/api/iso-personeller/${kartModal.personelId}/kart`).then(r => r.json()),
    enabled: !!kartModal.personelId && kartModal.open,
  });

  const createEgitimMutation = useMutation({
    mutationFn: (formData: FormData) => fetch("/api/egitimler", { method: "POST", body: formData }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/egitimler"] }); qc.invalidateQueries({ queryKey: ["/api/iso9001/stats"] }); setEgitimModal({ open: false, editing: null }); setEgitimForm(emptyEgitimForm); setEgitimSertifika(null); toast({ title: "Eğitim oluşturuldu" }); },
    onError: () => toast({ title: "Hata", description: "Eğitim oluşturulamadı", variant: "destructive" }),
  });

  const updateEgitimMutation = useMutation({
    mutationFn: ({ id, formData }: { id: string; formData: FormData }) => fetch(`/api/egitimler/${id}`, { method: "PUT", body: formData }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/egitimler"] }); setEgitimModal({ open: false, editing: null }); setEgitimForm(emptyEgitimForm); setEgitimSertifika(null); toast({ title: "Eğitim güncellendi" }); },
    onError: () => toast({ title: "Hata", description: "Eğitim güncellenemedi", variant: "destructive" }),
  });

  const deleteEgitimMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/egitimler/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/egitimler"] }); qc.invalidateQueries({ queryKey: ["/api/iso9001/stats"] }); toast({ title: "Eğitim silindi" }); },
    onError: () => toast({ title: "Hata", description: "Eğitim silinemedi", variant: "destructive" }),
  });

  const addKatilimciMutation = useMutation({
    mutationFn: ({ egitimId, personelIds }: { egitimId: string; personelIds: string[] }) =>
      fetch(`/api/egitimler/${egitimId}/katilimcilar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personelIds }) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/egitimler", expandedEgitimId, "katilimcilar"] }); qc.invalidateQueries({ queryKey: ["/api/egitimler"] }); qc.invalidateQueries({ queryKey: ["/api/iso9001/stats"] }); setKatilimciModal({ open: false, egitimId: null }); setSelectedPersonelIds([]); toast({ title: "Katılımcılar eklendi" }); },
    onError: () => toast({ title: "Hata", description: "Katılımcı eklenemedi", variant: "destructive" }),
  });

  const removeKatilimciMutation = useMutation({
    mutationFn: ({ egitimId, personelId }: { egitimId: string; personelId: string }) =>
      fetch(`/api/egitimler/${egitimId}/katilimcilar/${personelId}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/egitimler", expandedEgitimId, "katilimcilar"] }); qc.invalidateQueries({ queryKey: ["/api/egitimler"] }); qc.invalidateQueries({ queryKey: ["/api/iso9001/stats"] }); toast({ title: "Katılımcı çıkarıldı" }); },
    onError: () => toast({ title: "Hata", description: "Katılımcı çıkarılamadı", variant: "destructive" }),
  });

  const createPersonelMutation = useMutation({
    mutationFn: (data: typeof emptyPersonelForm) => fetch("/api/iso-personeller", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/iso-personeller"] }); setPersonelModal({ open: false, editing: null }); setPersonelForm(emptyPersonelForm); toast({ title: "Personel oluşturuldu" }); },
    onError: () => toast({ title: "Hata", description: "Personel oluşturulamadı", variant: "destructive" }),
  });

  const updatePersonelMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof emptyPersonelForm }) => fetch(`/api/iso-personeller/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/iso-personeller"] }); setPersonelModal({ open: false, editing: null }); setPersonelForm(emptyPersonelForm); toast({ title: "Personel güncellendi" }); },
    onError: () => toast({ title: "Hata", description: "Personel güncellenemedi", variant: "destructive" }),
  });

  const deletePersonelMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/iso-personeller/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/iso-personeller"] }); toast({ title: "Personel silindi" }); },
    onError: () => toast({ title: "Hata", description: "Personel silinemedi", variant: "destructive" }),
  });

  const createSoruMutation = useMutation({
    mutationFn: (data: { soru: string; tip: string; sira: number }) => fetch("/api/degerlendirme-sorulari", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/degerlendirme-sorulari"] }); setSoruModal({ open: false, editing: null }); setSoruForm({ soru: "", tip: "puan_1_5" }); toast({ title: "Soru eklendi" }); },
    onError: () => toast({ title: "Hata", description: "Soru eklenemedi", variant: "destructive" }),
  });

  const updateSoruMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { soru: string; tip: string; sira: number } }) => fetch(`/api/degerlendirme-sorulari/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/degerlendirme-sorulari"] }); setSoruModal({ open: false, editing: null }); setSoruForm({ soru: "", tip: "puan_1_5" }); toast({ title: "Soru güncellendi" }); },
    onError: () => toast({ title: "Hata", description: "Soru güncellenemedi", variant: "destructive" }),
  });

  const deleteSoruMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/degerlendirme-sorulari/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/degerlendirme-sorulari"] }); toast({ title: "Soru silindi" }); },
    onError: () => toast({ title: "Hata", description: "Soru silinemedi", variant: "destructive" }),
  });

  const moveSoruMutation = useMutation({
    mutationFn: ({ id, sira }: { id: string; sira: number }) => fetch(`/api/degerlendirme-sorulari/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sira }) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/degerlendirme-sorulari"] }); },
  });

  function submitEgitim() {
    const fd = new FormData();
    const data: Record<string, string | null> = {
      baslik: egitimForm.baslik,
      egitimTarihi: egitimForm.egitimTarihi,
      sure: egitimForm.sure || null,
      egitimci: egitimForm.egitimci || null,
      aciklama: egitimForm.aciklama || null,
    };
    fd.append("data", JSON.stringify(data));
    if (egitimSertifika) fd.append("sertifika", egitimSertifika);
    if (egitimModal.editing) {
      updateEgitimMutation.mutate({ id: egitimModal.editing.id, formData: fd });
    } else {
      createEgitimMutation.mutate(fd);
    }
  }

  function submitPersonel() {
    const payload = { ad: personelForm.ad, pozisyon: personelForm.pozisyon || null, departman: personelForm.departman || null };
    if (personelModal.editing) {
      updatePersonelMutation.mutate({ id: personelModal.editing.id, data: payload as typeof emptyPersonelForm });
    } else {
      createPersonelMutation.mutate(payload as typeof emptyPersonelForm);
    }
  }

  function submitSoru() {
    const sorted = [...sorularList].sort((a, b) => a.sira - b.sira);
    const nextSira = sorted.length > 0 ? sorted[sorted.length - 1].sira + 1 : 1;
    if (soruModal.editing) {
      updateSoruMutation.mutate({ id: soruModal.editing.id, data: { soru: soruForm.soru, tip: soruForm.tip, sira: soruModal.editing.sira } });
    } else {
      createSoruMutation.mutate({ soru: soruForm.soru, tip: soruForm.tip, sira: nextSira });
    }
  }

  function moveSoru(soru: Soru, direction: "up" | "down") {
    const sorted = [...sorularList].sort((a, b) => a.sira - b.sira);
    const idx = sorted.findIndex(s => s.id === soru.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const swapSoru = sorted[swapIdx];
    moveSoruMutation.mutate({ id: soru.id, sira: swapSoru.sira });
    moveSoruMutation.mutate({ id: swapSoru.id, sira: soru.sira });
  }

  function copyLink(egitimId: string) {
    const url = `${window.location.origin}/egitim-degerlendirme/${egitimId}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link kopyalandı" });
  }

  const alreadyAddedIds = new Set(katilimcilar.map(k => k.personelId));

  // KPI değerleri listelerden türetilir
  const toplamKatilim = egitimlerList.reduce((a, e) => a + (e.katilimciSayisi || 0), 0);
  const kpis = [
    { label: "Toplam Eğitim", value: egitimlerList.length, sub: "kayıtlı oturum", color: "#0ea5e9" },
    { label: "Personel", value: personellerList.length, sub: "eğitim havuzu", color: "#7c3aed" },
    { label: "Toplam Katılım", value: toplamKatilim, sub: "kişi × eğitim", color: "#0f766e" },
    { label: "Şablon Sorusu", value: sorularList.length, sub: "değerlendirme anketi", color: "#d97706" },
  ];

  const TABS = [
    { id: "egitimler", label: "Eğitimler", count: egitimlerList.length },
    { id: "personeller", label: "Personeller", count: personellerList.length },
    { id: "sablon", label: "Değerlendirme Şablonu", count: sorularList.length },
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
                  <GraduationCap className="h-[22px] w-[22px]" strokeWidth={1.8} />
                </div>
                <div>
                  <h1 className="text-[21px] font-extrabold tracking-tight">Eğitim Kayıtları</h1>
                  <p className="mt-0.5 text-[12.5px] text-muted-foreground">ISO 9001 · eğitimler, katılımcılar ve değerlendirme şablonu</p>
                </div>
              </div>
              <div className="flex items-center">
                {tab === "egitimler" && (
                  <Button
                    className="h-[38px] bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                    onClick={() => { setEgitimForm(emptyEgitimForm); setEgitimSertifika(null); setEgitimModal({ open: true, editing: null }); }}
                  >
                    <Plus className="w-4 h-4 mr-2" /> Yeni Eğitim
                  </Button>
                )}
                {tab === "personeller" && (
                  <Button
                    className="h-[38px] bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                    onClick={() => { setPersonelForm(emptyPersonelForm); setPersonelModal({ open: true, editing: null }); }}
                  >
                    <Plus className="w-4 h-4 mr-2" /> Yeni Personel
                  </Button>
                )}
                {tab === "sablon" && (
                  <Button
                    className="h-[38px] bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                    onClick={() => { setSoruForm({ soru: "", tip: "puan_1_5" }); setSoruModal({ open: true, editing: null }); }}
                  >
                    <Plus className="w-4 h-4 mr-2" /> Soru Ekle
                  </Button>
                )}
              </div>
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
                      : "font-semibold text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t.label}
                  <span className={cn(
                    "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10.5px] font-extrabold tabular-nums",
                    tab === t.id ? "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300" : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
                  )}>
                    {t.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* KPI şeridi — listelerden türetilir */}
          <div className="mt-5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
            {kpis.map((k) => (
              <div key={k.label} className="relative overflow-hidden rounded-[14px] border bg-card p-4">
                <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: k.color }} />
                <div className="pl-2 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground leading-tight">{k.label}</div>
                <div className="mt-2 pl-2 text-[24px] font-extrabold tracking-tight tabular-nums">{k.value}</div>
                <div className="mt-0.5 pl-2 text-[11.5px] text-muted-foreground">{k.sub}</div>
              </div>
            ))}
          </div>

          <TabsContent value="egitimler" className="mt-4">
            <div className="rounded-[14px] border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[900px]">
                  <thead>
                    <tr className="border-b bg-slate-50 dark:bg-muted/40">
                      <th className="w-8 px-4 py-3"></th>
                      <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Başlık</th>
                      <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Tarih</th>
                      <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Süre</th>
                      <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Eğitimci</th>
                      <th className="text-center px-4 py-3 text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Katılımcı</th>
                      <th className="text-center px-4 py-3 text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Sertifika</th>
                      <th className="text-right px-4 py-3 text-[10.5px] font-bold uppercase tracking-wide text-slate-500">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {egitimlerList.length === 0 && (
                      <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Henüz eğitim yok</td></tr>
                    )}
                    {egitimlerList.map(egitim => {
                      const isExpanded = expandedEgitimId === egitim.id;
                      return (
                        <>
                          <tr key={egitim.id} className="border-b hover:bg-slate-50 dark:hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => setExpandedEgitimId(isExpanded ? null : egitim.id)}>
                            <td className="px-4 py-3 text-slate-400">
                              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </td>
                            <td className="px-4 py-3 text-[13.5px] font-bold text-slate-800 dark:text-slate-100">{egitim.baslik}</td>
                            <td className="px-4 py-3 text-muted-foreground tabular-nums">{egitim.egitimTarihi}</td>
                            <td className="px-4 py-3 text-muted-foreground">{egitim.sure ?? "—"}</td>
                            <td className="px-4 py-3 text-muted-foreground">{egitim.egitimci ?? "—"}</td>
                            <td className="px-4 py-3 text-center">
                              <span className="inline-block rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-bold text-sky-700 tabular-nums dark:bg-sky-950/50 dark:text-sky-300">{egitim.katilimciSayisi} kişi</span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {egitim.sertifikaDosyaYolu
                                ? <a href={egitim.sertifikaDosyaYolu} target="_blank" rel="noreferrer" className="text-[12px] font-semibold text-sky-600 hover:underline" onClick={e => e.stopPropagation()}>İndir</a>
                                : <span className="text-slate-300 dark:text-slate-600">—</span>}
                            </td>
                            <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                              <div className="flex justify-end gap-1">
                                <Button size="sm" variant="ghost" title="Değerlendirme Linki Kopyala" onClick={() => copyLink(egitim.id)}>
                                  <LinkIcon className="w-4 h-4" />
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => { setEgitimForm({ baslik: egitim.baslik, egitimTarihi: egitim.egitimTarihi, sure: egitim.sure ?? "", egitimci: egitim.egitimci ?? "", aciklama: egitim.aciklama ?? "" }); setEgitimSertifika(null); setEgitimModal({ open: true, editing: egitim }); }}>
                                  <Pencil className="w-4 h-4" />
                                </Button>
                                <Button size="sm" variant="ghost" className="text-rose-500 hover:text-rose-700"
                                  onClick={() => { if (confirm("Bu eğitim ve tüm verileri silinecek. Emin misiniz?")) deleteEgitimMutation.mutate(egitim.id); }}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr key={`${egitim.id}-expanded`} className="border-b bg-slate-50 dark:bg-muted/20">
                              <td colSpan={8} className="px-4 py-4 pl-12">
                                <div className="flex items-center justify-between mb-3">
                                  <span className="text-[11.5px] text-muted-foreground">
                                    Katılımcılar (<strong className="text-foreground">{egitim.katilimciSayisi}</strong>) · <strong className="text-foreground">{egitim.degerlendirmeSayisi}</strong> değerlendirme dolduruldu
                                  </span>
                                  <Button size="sm" variant="outline" onClick={() => { setKatilimciModal({ open: true, egitimId: egitim.id }); setSelectedPersonelIds([]); }}>
                                    <Plus className="w-3 h-3 mr-1" /> Katılımcı Ekle
                                  </Button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {katilimcilar.map(k => (
                                    <div key={k.id} className="flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs text-slate-600 dark:text-slate-300">
                                      <User className="w-3 h-3 text-slate-400" />
                                      {k.personel.ad}
                                      <button className="ml-1 text-slate-400 hover:text-rose-500"
                                        onClick={() => removeKatilimciMutation.mutate({ egitimId: egitim.id, personelId: k.personelId })}>×</button>
                                    </div>
                                  ))}
                                  {katilimcilar.length === 0 && <span className="text-xs text-muted-foreground">Henüz katılımcı yok</span>}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="personeller" className="mt-4">
            <div className="rounded-[14px] border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[720px]">
                  <thead>
                    <tr className="border-b bg-slate-50 dark:bg-muted/40">
                      <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Ad</th>
                      <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Pozisyon</th>
                      <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Departman</th>
                      <th className="text-center px-4 py-3 text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Eğitim Sayısı</th>
                      <th className="text-right px-4 py-3 text-[10.5px] font-bold uppercase tracking-wide text-slate-500">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {personellerList.length === 0 && (
                      <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Henüz personel yok</td></tr>
                    )}
                    {personellerList.map((p, i) => {
                      const [avatarBg, avatarFg] = avatarPalette[i % avatarPalette.length];
                      return (
                        <tr key={p.id} className="border-b hover:bg-slate-50 dark:hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <span className={cn("flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-extrabold", avatarBg, avatarFg)}>{getInitials(p.ad)}</span>
                              <span className="text-[13px] font-bold text-slate-800 dark:text-slate-100">{p.ad}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{p.pozisyon ?? "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground">{p.departman ?? "—"}</td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600 tabular-nums dark:bg-slate-800 dark:text-slate-300">{p.egitimSayisi} eğitim</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" onClick={() => setKartModal({ open: true, personelId: p.id })}>
                                <User className="w-4 h-4 mr-1" /> Kart
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => { setPersonelForm({ ad: p.ad, pozisyon: p.pozisyon ?? "", departman: p.departman ?? "" }); setPersonelModal({ open: true, editing: p }); }}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button size="sm" variant="ghost" className="text-rose-500 hover:text-rose-700"
                                onClick={() => { if (confirm("Bu personel silinecek. Emin misiniz?")) deletePersonelMutation.mutate(p.id); }}>
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

          <TabsContent value="sablon" className="mt-4">
            <div className="rounded-[14px] border bg-card overflow-hidden">
              <div className="px-5 py-4 border-b">
                <h3 className="text-[15px] font-bold">Değerlendirme Şablonu</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">eğitim sonrası katılımcılara gönderilen anket soruları</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="border-b bg-slate-50 dark:bg-muted/40">
                      <th className="text-left px-5 py-3 w-16 text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Sıra</th>
                      <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Soru</th>
                      <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Tip</th>
                      <th className="text-right px-4 py-3 text-[10.5px] font-bold uppercase tracking-wide text-slate-500">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorularList.length === 0 && (
                      <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Henüz soru yok</td></tr>
                    )}
                    {[...sorularList].sort((a, b) => a.sira - b.sira).map((soru, idx, arr) => (
                      <tr key={soru.id} className="border-b last:border-b-0 hover:bg-slate-50 dark:hover:bg-muted/30 transition-colors">
                        <td className="px-5 py-3">
                          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-[12px] font-extrabold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{soru.sira}</span>
                        </td>
                        <td className="px-4 py-3 text-[13px] text-slate-800 dark:text-slate-100">{soru.soru}</td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "inline-block rounded-md px-2.5 py-0.5 text-[11px] font-bold",
                            soru.tip === "puan_1_5" ? "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                          )}>
                            {soru.tip === "puan_1_5" ? "1-5 Puan" : "Açık Metin"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" disabled={idx === 0} onClick={() => moveSoru(soru, "up")}><ArrowUp className="w-3 h-3" /></Button>
                            <Button size="sm" variant="ghost" disabled={idx === arr.length - 1} onClick={() => moveSoru(soru, "down")}><ArrowDown className="w-3 h-3" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => { setSoruForm({ soru: soru.soru, tip: soru.tip }); setSoruModal({ open: true, editing: soru }); }}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-rose-500 hover:text-rose-700"
                              onClick={() => { if (confirm("Bu soru silinecek. Emin misiniz?")) deleteSoruMutation.mutate(soru.id); }}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Eğitim Modal */}
      <Dialog open={egitimModal.open} onOpenChange={open => { if (!open) setEgitimModal({ open: false, editing: null }); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{egitimModal.editing ? "Eğitimi Düzenle" : "Yeni Eğitim"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Başlık *</Label><Input value={egitimForm.baslik} onChange={e => setEgitimForm(f => ({ ...f, baslik: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Eğitim Tarihi *</Label><Input type="date" value={egitimForm.egitimTarihi} onChange={e => setEgitimForm(f => ({ ...f, egitimTarihi: e.target.value }))} /></div>
              <div><Label>Süre</Label><Input placeholder="8 saat" value={egitimForm.sure} onChange={e => setEgitimForm(f => ({ ...f, sure: e.target.value }))} /></div>
            </div>
            <div><Label>Eğitimci</Label><Input value={egitimForm.egitimci} onChange={e => setEgitimForm(f => ({ ...f, egitimci: e.target.value }))} /></div>
            <div><Label>Açıklama</Label><Textarea value={egitimForm.aciklama} onChange={e => setEgitimForm(f => ({ ...f, aciklama: e.target.value }))} rows={2} /></div>
            <div><Label>Sertifika (PDF/Resim)</Label><Input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setEgitimSertifika(e.target.files?.[0] ?? null)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEgitimModal({ open: false, editing: null })}>İptal</Button>
            <Button onClick={submitEgitim} disabled={!egitimForm.baslik || !egitimForm.egitimTarihi || createEgitimMutation.isPending || updateEgitimMutation.isPending}>Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Katılımcı Ekle Modal */}
      <Dialog open={katilimciModal.open} onOpenChange={open => { if (!open) setKatilimciModal({ open: false, egitimId: null }); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Katılımcı Ekle</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {personellerList.filter(p => !alreadyAddedIds.has(p.id)).map(p => (
              <label key={p.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/30 rounded p-2">
                <input type="checkbox" checked={selectedPersonelIds.includes(p.id)}
                  onChange={e => setSelectedPersonelIds(prev => e.target.checked ? [...prev, p.id] : prev.filter(id => id !== p.id))} />
                <span className="text-sm">{p.ad}</span>
                {p.pozisyon && <span className="text-xs text-muted-foreground">— {p.pozisyon}</span>}
              </label>
            ))}
            {personellerList.filter(p => !alreadyAddedIds.has(p.id)).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Tüm personeller zaten eklendi</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKatilimciModal({ open: false, egitimId: null })}>İptal</Button>
            <Button disabled={selectedPersonelIds.length === 0 || addKatilimciMutation.isPending}
              onClick={() => addKatilimciMutation.mutate({ egitimId: katilimciModal.egitimId!, personelIds: selectedPersonelIds })}>
              Ekle ({selectedPersonelIds.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Personel Modal */}
      <Dialog open={personelModal.open} onOpenChange={open => { if (!open) setPersonelModal({ open: false, editing: null }); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{personelModal.editing ? "Personeli Düzenle" : "Yeni Personel"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Ad *</Label><Input value={personelForm.ad} onChange={e => setPersonelForm(f => ({ ...f, ad: e.target.value }))} /></div>
            <div><Label>Pozisyon</Label><Input value={personelForm.pozisyon} onChange={e => setPersonelForm(f => ({ ...f, pozisyon: e.target.value }))} /></div>
            <div><Label>Departman</Label><Input value={personelForm.departman} onChange={e => setPersonelForm(f => ({ ...f, departman: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPersonelModal({ open: false, editing: null })}>İptal</Button>
            <Button onClick={submitPersonel} disabled={!personelForm.ad || createPersonelMutation.isPending || updatePersonelMutation.isPending}>Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Personel Kart Modal */}
      <Dialog open={kartModal.open} onOpenChange={open => { if (!open) setKartModal({ open: false, personelId: null }); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{kartData?.personel.ad ?? "Personel Kartı"}</DialogTitle></DialogHeader>
          {kartData && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground space-y-1">
                {kartData.personel.pozisyon && <p>Pozisyon: {kartData.personel.pozisyon}</p>}
                {kartData.personel.departman && <p>Departman: {kartData.personel.departman}</p>}
                <p className="font-medium text-foreground">
                  Toplam {kartData.egitimler.length} eğitim · {kartData.egitimler.filter(e => e.degerlendirmeDoldu).length} değerlendirme doldurdu
                </p>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-2 font-medium">Eğitim</th>
                      <th className="text-left p-2 font-medium">Tarih</th>
                      <th className="text-left p-2 font-medium">Değerlendirme</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kartData.egitimler.length === 0 && <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">Henüz eğitim yok</td></tr>}
                    {kartData.egitimler.map(e => (
                      <tr key={e.egitimId} className="border-t">
                        <td className="p-2">{e.baslik}</td>
                        <td className="p-2 text-muted-foreground">{e.egitimTarihi}</td>
                        <td className="p-2">
                          {e.degerlendirmeDoldu
                            ? <Badge className="bg-green-100 text-green-800 border-green-300">Dolduruldu</Badge>
                            : <Badge variant="secondary">Doldurulmadı</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setKartModal({ open: false, personelId: null })}>Kapat</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Soru Modal */}
      <Dialog open={soruModal.open} onOpenChange={open => { if (!open) setSoruModal({ open: false, editing: null }); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{soruModal.editing ? "Soruyu Düzenle" : "Soru Ekle"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Soru Metni *</Label><Textarea value={soruForm.soru} onChange={e => setSoruForm(f => ({ ...f, soru: e.target.value }))} rows={3} /></div>
            <div>
              <Label>Tip *</Label>
              <Select value={soruForm.tip} onValueChange={v => setSoruForm(f => ({ ...f, tip: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="puan_1_5">1-5 Puan</SelectItem>
                  <SelectItem value="acik_metin">Açık Metin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSoruModal({ open: false, editing: null })}>İptal</Button>
            <Button onClick={submitSoru} disabled={!soruForm.soru || createSoruMutation.isPending || updateSoruMutation.isPending}>Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

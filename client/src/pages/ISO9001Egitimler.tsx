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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

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

export default function ISO9001Egitimler() {
  const { toast } = useToast();
  const qc = useQueryClient();

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

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <GraduationCap className="w-7 h-7 text-primary" />
        <h2 className="text-2xl font-semibold">Eğitim Kayıtları</h2>
      </div>

      <Tabs defaultValue="egitimler">
        <TabsList className="mb-4">
          <TabsTrigger value="egitimler">Eğitimler</TabsTrigger>
          <TabsTrigger value="personeller">Personeller</TabsTrigger>
          <TabsTrigger value="sablon">Değerlendirme Şablonu</TabsTrigger>
        </TabsList>

        <TabsContent value="egitimler">
          <div className="flex justify-end mb-3">
            <Button onClick={() => { setEgitimForm(emptyEgitimForm); setEgitimSertifika(null); setEgitimModal({ open: true, editing: null }); }}>
              <Plus className="w-4 h-4 mr-2" /> Yeni Eğitim
            </Button>
          </div>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="w-6 p-3"></th>
                  <th className="text-left p-3 font-medium">Başlık</th>
                  <th className="text-left p-3 font-medium">Tarih</th>
                  <th className="text-left p-3 font-medium">Süre</th>
                  <th className="text-left p-3 font-medium">Eğitimci</th>
                  <th className="text-left p-3 font-medium">Katılımcı</th>
                  <th className="text-left p-3 font-medium">Sertifika</th>
                  <th className="text-left p-3 font-medium">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {egitimlerList.length === 0 && (
                  <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Henüz eğitim yok</td></tr>
                )}
                {egitimlerList.map(egitim => {
                  const isExpanded = expandedEgitimId === egitim.id;
                  return (
                    <>
                      <tr key={egitim.id} className="border-t hover:bg-muted/20 cursor-pointer" onClick={() => setExpandedEgitimId(isExpanded ? null : egitim.id)}>
                        <td className="p-3 text-muted-foreground">
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </td>
                        <td className="p-3 font-medium">{egitim.baslik}</td>
                        <td className="p-3 text-muted-foreground">{egitim.egitimTarihi}</td>
                        <td className="p-3 text-muted-foreground">{egitim.sure ?? "—"}</td>
                        <td className="p-3 text-muted-foreground">{egitim.egitimci ?? "—"}</td>
                        <td className="p-3"><Badge variant="secondary">{egitim.katilimciSayisi} kişi</Badge></td>
                        <td className="p-3">
                          {egitim.sertifikaDosyaYolu
                            ? <a href={egitim.sertifikaDosyaYolu} target="_blank" rel="noreferrer" className="text-primary underline text-xs" onClick={e => e.stopPropagation()}>İndir</a>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="p-3" onClick={e => e.stopPropagation()}>
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" title="Değerlendirme Linki Kopyala" onClick={() => copyLink(egitim.id)}>
                              <LinkIcon className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => { setEgitimForm({ baslik: egitim.baslik, egitimTarihi: egitim.egitimTarihi, sure: egitim.sure ?? "", egitimci: egitim.egitimci ?? "", aciklama: egitim.aciklama ?? "" }); setEgitimSertifika(null); setEgitimModal({ open: true, editing: egitim }); }}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700"
                              onClick={() => { if (confirm("Bu eğitim ve tüm verileri silinecek. Emin misiniz?")) deleteEgitimMutation.mutate(egitim.id); }}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${egitim.id}-expanded`} className="border-t bg-muted/10">
                          <td colSpan={8} className="p-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium text-muted-foreground">
                                Katılımcılar ({egitim.katilimciSayisi}) · {egitim.degerlendirmeSayisi} değerlendirme
                              </span>
                              <Button size="sm" variant="outline" onClick={() => { setKatilimciModal({ open: true, egitimId: egitim.id }); setSelectedPersonelIds([]); }}>
                                <Plus className="w-3 h-3 mr-1" /> Katılımcı Ekle
                              </Button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {katilimcilar.map(k => (
                                <div key={k.id} className="flex items-center gap-1 bg-background border rounded-full px-3 py-1 text-xs">
                                  <User className="w-3 h-3" />
                                  {k.personel.ad}
                                  <button className="ml-1 text-muted-foreground hover:text-red-500"
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
        </TabsContent>

        <TabsContent value="personeller">
          <div className="flex justify-end mb-3">
            <Button onClick={() => { setPersonelForm(emptyPersonelForm); setPersonelModal({ open: true, editing: null }); }}>
              <Plus className="w-4 h-4 mr-2" /> Yeni Personel
            </Button>
          </div>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Ad</th>
                  <th className="text-left p-3 font-medium">Pozisyon</th>
                  <th className="text-left p-3 font-medium">Departman</th>
                  <th className="text-left p-3 font-medium">Eğitim Sayısı</th>
                  <th className="text-left p-3 font-medium">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {personellerList.length === 0 && (
                  <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Henüz personel yok</td></tr>
                )}
                {personellerList.map(p => (
                  <tr key={p.id} className="border-t hover:bg-muted/20">
                    <td className="p-3 font-medium">{p.ad}</td>
                    <td className="p-3 text-muted-foreground">{p.pozisyon ?? "—"}</td>
                    <td className="p-3 text-muted-foreground">{p.departman ?? "—"}</td>
                    <td className="p-3"><Badge variant="secondary">{p.egitimSayisi} eğitim</Badge></td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setKartModal({ open: true, personelId: p.id })}>
                          <User className="w-4 h-4 mr-1" /> Kart
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setPersonelForm({ ad: p.ad, pozisyon: p.pozisyon ?? "", departman: p.departman ?? "" }); setPersonelModal({ open: true, editing: p }); }}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700"
                          onClick={() => { if (confirm("Bu personel silinecek. Emin misiniz?")) deletePersonelMutation.mutate(p.id); }}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="sablon">
          <div className="flex justify-end mb-3">
            <Button onClick={() => { setSoruForm({ soru: "", tip: "puan_1_5" }); setSoruModal({ open: true, editing: null }); }}>
              <Plus className="w-4 h-4 mr-2" /> Soru Ekle
            </Button>
          </div>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium w-12">Sıra</th>
                  <th className="text-left p-3 font-medium">Soru</th>
                  <th className="text-left p-3 font-medium">Tip</th>
                  <th className="text-left p-3 font-medium">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {sorularList.length === 0 && (
                  <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Henüz soru yok</td></tr>
                )}
                {[...sorularList].sort((a, b) => a.sira - b.sira).map((soru, idx, arr) => (
                  <tr key={soru.id} className="border-t hover:bg-muted/20">
                    <td className="p-3 text-muted-foreground">{soru.sira}</td>
                    <td className="p-3">{soru.soru}</td>
                    <td className="p-3"><Badge variant="outline">{soru.tip === "puan_1_5" ? "1-5 Puan" : "Açık Metin"}</Badge></td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" disabled={idx === 0} onClick={() => moveSoru(soru, "up")}><ArrowUp className="w-3 h-3" /></Button>
                        <Button size="sm" variant="ghost" disabled={idx === arr.length - 1} onClick={() => moveSoru(soru, "down")}><ArrowDown className="w-3 h-3" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => { setSoruForm({ soru: soru.soru, tip: soru.tip }); setSoruModal({ open: true, editing: soru }); }}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700"
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
        </TabsContent>
      </Tabs>

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

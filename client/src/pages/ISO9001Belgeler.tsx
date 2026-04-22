import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Plus, Upload, ChevronDown, ChevronUp, Trash2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

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

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FileText className="w-7 h-7 text-primary" />
          <h2 className="text-2xl font-semibold">Belge Arşivi</h2>
        </div>
        <Button onClick={() => setYeniBelgeAcik(true)}>
          <Plus className="w-4 h-4 mr-2" /> Yeni Belge
        </Button>
      </div>

      {/* Filtre Çubuğu */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6 p-4 border rounded-lg bg-muted/30">
        <Select value={filterAnaKategori} onValueChange={setFilterAnaKategori}>
          <SelectTrigger><SelectValue placeholder="Ana Kategori" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tumu">Tümü</SelectItem>
            {ANA_KATEGORILER.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input placeholder="Alt kategori..." value={filterAltKategori} onChange={e => setFilterAltKategori(e.target.value)} />
        <Select value={filterDurum} onValueChange={setFilterDurum}>
          <SelectTrigger><SelectValue placeholder="Durum" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tumu">Tümü</SelectItem>
            <SelectItem value="aktif">Aktif</SelectItem>
            <SelectItem value="arsiv">Arşiv</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" value={filterBaslangic} onChange={e => setFilterBaslangic(e.target.value)} />
        <Input type="date" value={filterBitis} onChange={e => setFilterBitis(e.target.value)} />
        <Input placeholder="Belge ara..." value={filterArama} onChange={e => setFilterArama(e.target.value)} />
      </div>

      {/* Tablo */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 font-medium">Belge Adı</th>
              <th className="text-left p-3 font-medium">Kategori</th>
              <th className="text-left p-3 font-medium">Aktif Versiyon</th>
              <th className="text-left p-3 font-medium">Son Güncelleme</th>
              <th className="text-left p-3 font-medium">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {belgeler.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Henüz belge yok</td></tr>
            )}
            {belgeler.map(belge => (
              <>
                <tr key={belge.id} className="border-t hover:bg-muted/20">
                  <td className="p-3 font-medium">{belge.baslik}</td>
                  <td className="p-3 text-muted-foreground">{belge.anaKategori} &rsaquo; {belge.altKategori}</td>
                  <td className="p-3">
                    {belge.aktifVersiyon
                      ? <Badge variant="outline" className="text-green-700 border-green-300">{belge.aktifVersiyon.versiyonNo}</Badge>
                      : <Badge variant="secondary">Arşiv</Badge>}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {belge.aktifVersiyon ? new Date(belge.aktifVersiyon.olusturmaTarihi).toLocaleDateString("tr-TR") : "—"}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setExpandedId(expandedId === belge.id ? null : belge.id)}>
                        {expandedId === belge.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        Versiyonlar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setYeniVersiyonBelge(belge); setVersiyonForm({ versiyonNo: "", degisiklikNotu: "" }); }}>
                        <Upload className="w-4 h-4 mr-1" /> Yeni Versiyon
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700"
                        onClick={() => { if (confirm("Bu belge ve tüm versiyonları silinecek. Emin misiniz?")) deleteMutation.mutate(belge.id); }}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
                {expandedId === belge.id && (
                  <tr key={`${belge.id}-versiyonlar`} className="bg-muted/10">
                    <td colSpan={5} className="p-4">
                      <p className="text-xs font-semibold text-muted-foreground mb-2">VERSİYON GEÇMİŞİ</p>
                      <div className="space-y-2">
                        {versiyonlar.map(v => (
                          <div key={v.id} className="flex items-center gap-3 text-sm">
                            {v.isAktif
                              ? <Badge className="bg-green-100 text-green-800 border-green-300">Aktif — {v.versiyonNo}</Badge>
                              : <Badge variant="secondary">Arşiv — {v.versiyonNo}</Badge>}
                            <span className="text-muted-foreground">{v.degisiklikNotu ?? "—"}</span>
                            <span className="text-muted-foreground text-xs">{new Date(v.olusturmaTarihi).toLocaleDateString("tr-TR")}</span>
                            <a href={v.dosyaYolu} target="_blank" rel="noreferrer">
                              <Button size="sm" variant="ghost"><Download className="w-3 h-3 mr-1" /> İndir</Button>
                            </a>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
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
  );
}

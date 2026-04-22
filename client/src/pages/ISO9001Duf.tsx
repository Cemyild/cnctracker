import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { type Duf } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Paperclip, AlertTriangle } from "lucide-react";

const KAYNAK_OPTIONS = [
  { value: "ic_tetkik", label: "İç Tetkik" },
  { value: "musteri_sikayeti", label: "Müşteri Şikayeti" },
  { value: "proses", label: "Proses" },
  { value: "diger", label: "Diğer" },
];

const DURUM_OPTIONS = [
  { value: "acik", label: "Açık" },
  { value: "devam_ediyor", label: "Devam Ediyor" },
  { value: "kapali", label: "Kapalı" },
];

function durumBadge(durum: string, gecikmiş: boolean) {
  if (durum === "kapali") return <Badge className="bg-green-100 text-green-800 border-green-300">Kapalı</Badge>;
  if (gecikmiş) return <Badge className="bg-orange-100 text-orange-800 border-orange-300">Gecikmiş</Badge>;
  if (durum === "devam_ediyor") return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">Devam</Badge>;
  return <Badge className="bg-red-100 text-red-800 border-red-300">Açık</Badge>;
}

const emptyForm = {
  baslik: "",
  uygunsuzlukKaynagi: "ic_tetkik",
  aciklama: "",
  sorumluKisi: "",
  hedefKapanisTarihi: "",
  durum: "acik",
  kokNedenAnalizi: "",
  alinanAksiyon: "",
};

export default function ISO9001Duf() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [dosya, setDosya] = useState<File | null>(null);

  const { data: list = [] } = useQuery<Duf[]>({
    queryKey: ["/api/duf"],
    queryFn: () => fetch("/api/duf").then(r => r.json()),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append("data", JSON.stringify(form));
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
      baslik: row.baslik,
      uygunsuzlukKaynagi: row.uygunsuzlukKaynagi,
      aciklama: row.aciklama,
      sorumluKisi: row.sorumluKisi,
      hedefKapanisTarihi: row.hedefKapanisTarihi,
      durum: row.durum,
      kokNedenAnalizi: row.kokNedenAnalizi ?? "",
      alinanAksiyon: row.alinanAksiyon ?? "",
    });
    setDosya(null);
    setOpen(true);
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-7 h-7 text-primary" />
          <h2 className="text-2xl font-semibold">Düzeltici Faaliyet (DÜF)</h2>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />Yeni DÜF</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editId ? "DÜF Düzenle" : "Yeni DÜF Kaydı"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <Label>Başlık *</Label>
                <Input value={form.baslik} onChange={e => setForm(f => ({ ...f, baslik: e.target.value }))} />
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
                <Label>Açıklama *</Label>
                <Textarea rows={3} value={form.aciklama} onChange={e => setForm(f => ({ ...f, aciklama: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Sorumlu Kişi *</Label>
                  <Input value={form.sorumluKisi} onChange={e => setForm(f => ({ ...f, sorumluKisi: e.target.value }))} />
                </div>
                <div>
                  <Label>Hedef Kapanış *</Label>
                  <Input type="date" value={form.hedefKapanisTarihi} onChange={e => setForm(f => ({ ...f, hedefKapanisTarihi: e.target.value }))} />
                </div>
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
              <div>
                <Label>Kök Neden Analizi</Label>
                <Textarea rows={2} value={form.kokNedenAnalizi} onChange={e => setForm(f => ({ ...f, kokNedenAnalizi: e.target.value }))} />
              </div>
              <div>
                <Label>Alınan Aksiyon</Label>
                <Textarea rows={2} value={form.alinanAksiyon} onChange={e => setForm(f => ({ ...f, alinanAksiyon: e.target.value }))} />
              </div>
              <div>
                <Label>Dosya Eki (PDF/Word)</Label>
                <Input type="file" accept=".pdf,.doc,.docx" onChange={e => setDosya(e.target.files?.[0] ?? null)} />
              </div>
              <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.baslik || !form.aciklama || !form.sorumluKisi || !form.hedefKapanisTarihi}>
                {saveMutation.isPending ? "Kaydediliyor..." : "Kaydet"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Başlık</TableHead>
              <TableHead>Kaynak</TableHead>
              <TableHead>Sorumlu</TableHead>
              <TableHead>Hedef Tarih</TableHead>
              <TableHead>Durum</TableHead>
              <TableHead>Ek</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Kayıt yok</TableCell></TableRow>
            )}
            {list.map(row => {
              const gecikmiş = row.hedefKapanisTarihi < today && row.durum !== "kapali";
              return (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.baslik}</TableCell>
                  <TableCell>{KAYNAK_OPTIONS.find(o => o.value === row.uygunsuzlukKaynagi)?.label}</TableCell>
                  <TableCell>{row.sorumluKisi}</TableCell>
                  <TableCell className={gecikmiş ? "text-orange-600 font-medium" : ""}>{row.hedefKapanisTarihi}</TableCell>
                  <TableCell>{durumBadge(row.durum, gecikmiş)}</TableCell>
                  <TableCell>
                    {row.dosyaEki && <a href={row.dosyaEki} target="_blank" rel="noreferrer"><Paperclip className="w-4 h-4 text-muted-foreground hover:text-primary" /></a>}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
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
  );
}

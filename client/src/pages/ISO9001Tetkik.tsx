import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { type TetkikPlan, type TetkikBulgu } from "@shared/schema";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Paperclip, Search } from "lucide-react";

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

const emptyPlan = { tetkikAdi: "", planlananTarih: "", tetkikEdilenBolum: "", basTetkikci: "", durum: "planlandi" };
const emptyBulgu = { tetkikPlanId: "", bulguTuru: "uygunsuzluk", bulguAciklamasi: "", ilgiliIsoMaddesi: "", durum: "acik" };

export default function ISO9001Tetkik() {
  const { toast } = useToast();

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

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <Search className="w-7 h-7 text-primary" />
        <h2 className="text-2xl font-semibold">İç Tetkik</h2>
      </div>

      <Tabs defaultValue="planlar">
        <TabsList className="mb-6">
          <TabsTrigger value="planlar">Tetkik Planları</TabsTrigger>
          <TabsTrigger value="bulgular">Bulgular</TabsTrigger>
        </TabsList>

        <TabsContent value="planlar">
          <div className="flex justify-end mb-4">
            <Dialog open={planOpen} onOpenChange={setPlanOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => { setPlanEditId(null); setPlanForm(emptyPlan); setPlanDosya(null); }}>
                  <Plus className="w-4 h-4 mr-2" />Yeni Plan
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
          </div>
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tetkik Adı</TableHead>
                  <TableHead>Tarih</TableHead>
                  <TableHead>Bölüm/Süreç</TableHead>
                  <TableHead>Baş Tetkikçi</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead>Ek</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {planlar.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Kayıt yok</TableCell></TableRow>}
                {planlar.map(row => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.tetkikAdi}</TableCell>
                    <TableCell>{row.planlananTarih}</TableCell>
                    <TableCell>{row.tetkikEdilenBolum}</TableCell>
                    <TableCell>{row.basTetkikci}</TableCell>
                    <TableCell>
                      <Badge className={row.durum === "tamamlandi" ? "bg-green-100 text-green-800 border-green-300" : row.durum === "iptal" ? "bg-gray-100 text-gray-600" : "bg-blue-100 text-blue-800 border-blue-300"}>
                        {PLAN_DURUM.find(o => o.value === row.durum)?.label}
                      </Badge>
                    </TableCell>
                    <TableCell>{row.dosyaEki && <a href={row.dosyaEki} target="_blank" rel="noreferrer"><Paperclip className="w-4 h-4 text-muted-foreground hover:text-primary" /></a>}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => { setPlanEditId(row.id); setPlanForm({ tetkikAdi: row.tetkikAdi, planlananTarih: row.planlananTarih, tetkikEdilenBolum: row.tetkikEdilenBolum, basTetkikci: row.basTetkikci, durum: row.durum }); setPlanDosya(null); setPlanOpen(true); }}><Edit className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => deletePlan.mutate(row.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="bulgular">
          <div className="flex justify-end mb-4">
            <Dialog open={bulguOpen} onOpenChange={setBulguOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => { setBulguEditId(null); setBulguForm(emptyBulgu); }}>
                  <Plus className="w-4 h-4 mr-2" />Yeni Bulgu
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
          </div>
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bağlı Tetkik</TableHead>
                  <TableHead>Bulgu Türü</TableHead>
                  <TableHead>Açıklama</TableHead>
                  <TableHead>ISO Maddesi</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bulgular.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Kayıt yok</TableCell></TableRow>}
                {bulgular.map(row => (
                  <TableRow key={row.id}>
                    <TableCell className="text-sm">{planlar.find(p => p.id === row.tetkikPlanId)?.tetkikAdi ?? row.tetkikPlanId}</TableCell>
                    <TableCell>{BULGU_TURU.find(o => o.value === row.bulguTuru)?.label}</TableCell>
                    <TableCell className="max-w-xs truncate">{row.bulguAciklamasi}</TableCell>
                    <TableCell>{row.ilgiliIsoMaddesi ?? "—"}</TableCell>
                    <TableCell>
                      <Badge className={row.durum === "kapali" ? "bg-green-100 text-green-800 border-green-300" : "bg-red-100 text-red-800 border-red-300"}>
                        {BULGU_DURUM.find(o => o.value === row.durum)?.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => { setBulguEditId(row.id); setBulguForm({ tetkikPlanId: row.tetkikPlanId, bulguTuru: row.bulguTuru, bulguAciklamasi: row.bulguAciklamasi, ilgiliIsoMaddesi: row.ilgiliIsoMaddesi ?? "", durum: row.durum }); setBulguOpen(true); }}><Edit className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteBulgu.mutate(row.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

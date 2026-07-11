import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import type { MasrafTuru } from "@shared/schema";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const YENI = "__yeni__";

export default function MasrafTuruSecici({
  value, onChange, testId = "masraf-turu",
}: { value: string; onChange: (ad: string) => void; testId?: string }) {
  const { toast } = useToast();
  const { data: turler = [] } = useQuery<MasrafTuru[]>({ queryKey: ["/api/portal/masraf-turleri"] });
  const [dialogAcik, setDialogAcik] = useState(false);
  const [yeniAd, setYeniAd] = useState("");
  const [ekleniyor, setEkleniyor] = useState(false);

  const secildi = (v: string) => {
    if (v === YENI) { setYeniAd(""); setDialogAcik(true); return; }
    onChange(v);
  };

  const ekle = async () => {
    const ad = yeniAd.trim();
    if (!ad) { toast({ title: "Tür adı girin", variant: "destructive" }); return; }
    setEkleniyor(true);
    try {
      const res = await fetch("/api/portal/masraf-turleri", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ad }), credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Eklenemedi");
      const yeni = await res.json();
      await queryClient.invalidateQueries({ queryKey: ["/api/portal/masraf-turleri"] });
      onChange(yeni.ad);
      setDialogAcik(false);
      toast({ title: "Masraf türü eklendi" });
    } catch (err: any) {
      toast({ title: "Hata", description: err.message, variant: "destructive" });
    } finally {
      setEkleniyor(false);
    }
  };

  return (
    <>
      <Select value={value} onValueChange={secildi}>
        <SelectTrigger data-testid={`select-${testId}`}><SelectValue placeholder="Seçin" /></SelectTrigger>
        <SelectContent>
          {turler.map((t) => (<SelectItem key={t.id} value={t.ad}>{t.ad}</SelectItem>))}
          <SelectItem value={YENI} data-testid="select-item-yeni-tur">+ Yeni tür ekle…</SelectItem>
        </SelectContent>
      </Select>
      <Dialog open={dialogAcik} onOpenChange={setDialogAcik}>
        <DialogContent>
          <DialogHeader><DialogTitle>Yeni Masraf Türü</DialogTitle></DialogHeader>
          <div className="space-y-1">
            <Label>Tür Adı</Label>
            <Input
              value={yeniAd}
              onChange={(e) => setYeniAd(e.target.value)}
              placeholder="Örn. Kırtasiye"
              data-testid="input-yeni-tur-ad"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ekle(); } }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAcik(false)}>Vazgeç</Button>
            <Button onClick={ekle} disabled={ekleniyor} data-testid="button-yeni-tur-ekle">{ekleniyor ? "Ekleniyor…" : "Ekle"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

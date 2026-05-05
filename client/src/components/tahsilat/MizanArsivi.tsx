import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface MizanRow {
  id: string;
  mizanTarihi: string;
  filename: string;
  sizeBytes: number | null;
  kayitSayisi: number;
  toplamNetBakiye: string | null;
  yuklemeTarihi: string;
  not: string | null;
}

export function MizanArsivi() {
  const { data: list, isLoading } = useQuery<MizanRow[]>({ queryKey: ["/api/tahsilat/mizan"] });
  const qc = useQueryClient();
  const { toast } = useToast();

  const fmtTry = (v: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(v);
  const fmtSize = (b: number | null) => b ? (b < 1048576 ? `${(b/1024).toFixed(0)} KB` : `${(b/1048576).toFixed(2)} MB`) : "-";

  const handleDelete = async (id: string, filename: string) => {
    if (!confirm(`"${filename}" mizan'ı silinsin mi? İlişkili tüm bakiye kayıtları da silinir.`)) return;
    const r = await fetch(`/api/tahsilat/mizan/${id}`, { method: "DELETE" });
    if (!r.ok) { toast({ variant: "destructive", title: "Silinemedi" }); return; }
    toast({ title: "Silindi", description: filename });
    qc.invalidateQueries({ queryKey: ["/api/tahsilat/mizan"] });
    qc.invalidateQueries({ queryKey: ["/api/tahsilat/dashboard"] });
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  if (!list?.length) return <div className="text-center text-muted-foreground py-12">Henüz mizan yüklenmemiş.</div>;

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mizan Tarihi</TableHead>
              <TableHead>Dosya</TableHead>
              <TableHead className="text-right">Müşteri Sayısı</TableHead>
              <TableHead className="text-right">Toplam Net Bakiye</TableHead>
              <TableHead className="text-right">Boyut</TableHead>
              <TableHead>Yükleme</TableHead>
              <TableHead className="w-[80px]">İşlem</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium tabular-nums">{m.mizanTarihi}</TableCell>
                <TableCell className="truncate max-w-[300px]" title={m.filename}>{m.filename}</TableCell>
                <TableCell className="text-right tabular-nums">{m.kayitSayisi}</TableCell>
                <TableCell className="text-right tabular-nums font-semibold">{m.toplamNetBakiye ? fmtTry(Number(m.toplamNetBakiye)) : "-"}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtSize(m.sizeBytes)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(m.yuklemeTarihi).toLocaleString("tr-TR")}</TableCell>
                <TableCell>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" onClick={() => handleDelete(m.id, m.filename)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

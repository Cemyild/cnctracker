import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Wallet } from "lucide-react";

export default function PortalLogin() {
  const [kullaniciAdi, setKullaniciAdi] = useState("");
  const [sifre, setSifre] = useState("");
  const [hata, setHata] = useState("");
  const [gonderiliyor, setGonderiliyor] = useState(false);

  const girisYap = async (e: React.FormEvent) => {
    e.preventDefault();
    setGonderiliyor(true);
    setHata("");
    try {
      const res = await apiRequest("POST", "/api/portal/login", { kullaniciAdi: kullaniciAdi.trim(), sifre });
      const me = await res.json();
      queryClient.setQueryData(["/api/portal/me"], me);
    } catch (err: any) {
      const mesaj = String(err?.message ?? "");
      setHata(mesaj.includes("Hesap kapalı") ? "Hesap kapalı" : "Kullanıcı adı veya şifre hatalı");
    } finally {
      setGonderiliyor(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">
            <Wallet className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Ödemeler Portalı</h1>
            <p className="mt-1 text-sm text-muted-foreground">Kullanıcı adınız ve şifrenizle giriş yapın</p>
          </div>
        </div>

        <form onSubmit={girisYap} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="portal-kullanici">Kullanıcı adı</Label>
            <Input
              id="portal-kullanici"
              placeholder="Kullanıcı adı"
              value={kullaniciAdi}
              onChange={(e) => setKullaniciAdi(e.target.value)}
              autoFocus
              data-testid="input-portal-kullanici"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="portal-sifre">Şifre</Label>
            <Input
              id="portal-sifre"
              type="password"
              placeholder="Şifre"
              value={sifre}
              onChange={(e) => setSifre(e.target.value)}
              data-testid="input-portal-sifre"
            />
          </div>

          {hata && <p className="text-sm font-medium text-rose-600">{hata}</p>}

          <Button type="submit" size="lg" className="w-full" disabled={gonderiliyor} data-testid="button-portal-giris">
            {gonderiliyor ? "Giriş yapılıyor…" : "Giriş Yap"}
          </Button>
        </form>

        <p className="mt-6 text-center text-[11px] text-muted-foreground">CNC Gümrük Müşavirliği · İç Portal</p>
      </div>
    </div>
  );
}

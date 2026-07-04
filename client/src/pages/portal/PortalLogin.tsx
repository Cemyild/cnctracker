import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

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
      await apiRequest("POST", "/api/portal/login", { kullaniciAdi: kullaniciAdi.trim(), sifre });
      await queryClient.invalidateQueries({ queryKey: ["/api/portal/me"] });
    } catch (err: any) {
      const mesaj = String(err?.message ?? "");
      setHata(mesaj.includes("Hesap kapalı") ? "Hesap kapalı" : "Kullanıcı adı veya şifre hatalı");
    } finally {
      setGonderiliyor(false);
    }
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-slate-50">
      <form onSubmit={girisYap} className="p-8 bg-white rounded-xl shadow-lg border max-w-sm w-full space-y-4">
        <div className="flex justify-center mb-2 text-primary">
          <Lock className="w-10 h-10" />
        </div>
        <h2 className="text-xl font-bold text-center">Ödemeler Portalı</h2>
        <p className="text-sm text-center text-slate-500">Kullanıcı adınız ve şifrenizle giriş yapın.</p>
        <Input
          placeholder="Kullanıcı adı"
          value={kullaniciAdi}
          onChange={(e) => setKullaniciAdi(e.target.value)}
          autoFocus
          data-testid="input-portal-kullanici"
        />
        <Input
          type="password"
          placeholder="Şifre"
          value={sifre}
          onChange={(e) => setSifre(e.target.value)}
          data-testid="input-portal-sifre"
        />
        {hata && <p className="text-xs text-red-500">{hata}</p>}
        <Button type="submit" className="w-full" disabled={gonderiliyor} data-testid="button-portal-giris">
          {gonderiliyor ? "Giriş yapılıyor…" : "Giriş Yap"}
        </Button>
      </form>
    </div>
  );
}

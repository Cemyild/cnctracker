import { Link, useLocation } from "wouter";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { FilePlus2, ListChecks, Inbox, Warehouse, Banknote, Building2, LogOut, Wallet, CalendarCheck, Building, BarChart3, Trash2 } from "lucide-react";
import { type PortalMe } from "./PortalApp";
import { type Rozetler, type SayfaAnahtari } from "./useTalepBildirimleri";

type MenuOgesi = {
  title: string;
  href: string;
  icon: typeof Inbox;
  rozetAnahtari?: SayfaAnahtari;
};

const TEMSILCI_MENU: MenuOgesi[] = [
  { title: "Yeni Talep", href: "/portal/yeni-talep", icon: FilePlus2 },
  { title: "Taleplerim", href: "/portal/taleplerim", icon: ListChecks, rozetAnahtari: "taleplerim" },
];

const MUHASEBE_MENU: MenuOgesi[] = [
  { title: "Gelen Talepler", href: "/portal/gelen-talepler", icon: Inbox, rozetAnahtari: "gelenTalepler" },
  { title: "Depo Ödemeleri", href: "/portal/depo", icon: Warehouse, rozetAnahtari: "depo" },
  { title: "Doğrudan Ödeme", href: "/portal/dogrudan-odeme", icon: Banknote },
  { title: "Ödeme Firmaları", href: "/portal/firmalar", icon: Building2 },
  { title: "Şube Masraf", href: "/portal/sube-masraf", icon: Building },
  { title: "Şube Raporu", href: "/portal/sube-raporu", icon: BarChart3 },
];

const OPERASYON_MENU: MenuOgesi[] = [
  { title: "Kasam", href: "/portal/kasam", icon: Wallet },
  { title: "Kapanışlarım", href: "/portal/kapanislarim", icon: CalendarCheck },
];

// Admin muhasebenin gördüğü her şeyi görür; üstüne silme günlüğü.
const ADMIN_MENU: MenuOgesi[] = [
  ...MUHASEBE_MENU,
  { title: "Silme Günlüğü", href: "/portal/silme-log", icon: Trash2 },
];

const ROL_ETIKETI: Record<PortalMe["rol"], string> = {
  muhasebe: "Muhasebe",
  operasyon: "Operasyon",
  temsilci: "Müşteri Temsilcisi",
  admin: "Yönetici",
};

// Ad-soyad -> baş harfler (avatar rozeti). tr-TR locale ile Türkçe büyük harf kuralı (i -> İ) doğru çalışır.
function basHarfleri(adSoyad: string): string {
  const parcalar = adSoyad.trim().split(/\s+/).filter(Boolean);
  if (parcalar.length === 0) return "?";
  const ilk = parcalar[0]?.[0] ?? "";
  const son = parcalar.length > 1 ? (parcalar[parcalar.length - 1]?.[0] ?? "") : "";
  return (ilk + son).toLocaleUpperCase("tr-TR");
}

export default function PortalSidebar({
  me, rozetler, cikisYap,
}: { me: PortalMe; rozetler: Rozetler; cikisYap: () => void }) {
  const [location] = useLocation();
  const menu = me.rol === "admin" ? ADMIN_MENU
    : me.rol === "muhasebe" ? MUHASEBE_MENU
    : me.rol === "operasyon" ? OPERASYON_MENU
    : TEMSILCI_MENU;

  return (
    <Sidebar className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-3 px-1">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-950/40">
            <img src="/logo.png" alt="CNC" className="h-7 w-7 object-contain" />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold text-foreground">Ödemeler Portalı</div>
            <div className="truncate text-[11px] text-muted-foreground">CNC Gümrük Müşavirliği</div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3 py-4">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menu.map((item) => {
                const rozet = item.rozetAnahtari ? rozetler[item.rozetAnahtari] : 0;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={location === item.href}
                      className="h-10 text-muted-foreground data-[active=true]:bg-indigo-50 data-[active=true]:text-indigo-700 hover:bg-indigo-50/60 hover:text-indigo-700 dark:data-[active=true]:bg-indigo-950/40 dark:data-[active=true]:text-indigo-300 dark:hover:bg-indigo-950/25 dark:hover:text-indigo-300"
                    >
                      <Link href={item.href} data-testid={`link-portal-${item.href.split("/").pop()}`}>
                        <item.icon className="h-[18px] w-[18px]" />
                        <span>{item.title}</span>
                        {rozet > 0 && (
                          <Badge
                            className="ml-auto min-w-[1.25rem] justify-center rounded-full border-transparent bg-rose-500 px-1.5 py-0 text-[11px] font-semibold text-white tabular-nums"
                            data-testid={`rozet-${item.rozetAnahtari}`}
                          >
                            {rozet}
                          </Badge>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        <div className="mb-3 flex min-w-0 items-center gap-2.5">
          <Avatar className="h-9 w-9 shrink-0">
            <AvatarFallback className="bg-indigo-50 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
              {basHarfleri(me.adSoyad)}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-sm font-medium" data-testid="text-portal-kullanici">
              {me.adSoyad}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {ROL_ETIKETI[me.rol]}
            </span>
          </div>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
          onClick={cikisYap}
          data-testid="button-portal-cikis"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Çıkış
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}

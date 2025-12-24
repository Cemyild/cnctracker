import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  FileText,
  Shield,
  Truck,
  BarChart3,
  LogOut,
  Wrench,
} from "lucide-react";

const navItems = [
  { title: "Dashboard", icon: LayoutDashboard, href: "/" },
  { title: "Gümrük", icon: FileText, href: "/gumruk" },
  { title: "Sigorta", icon: Shield, href: "/sigorta" },
  { title: "Nakliye", icon: Truck, href: "/nakliye" },
  { title: "Raporlar", icon: BarChart3, href: "/raporlar" },
  { title: "Araçlar", icon: Wrench, href: "/araclar" },
];

export function AppSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar className="border-r border-sidebar-border">
      <SidebarHeader className="p-6 border-b border-sidebar-border">
        <div className="flex flex-col items-center justify-center gap-3">
          <img
            src="/logo.png"
            alt="CNC Gümrük Müşavirliği"
            className="h-16 w-auto object-contain"
          />
          <span className="text-xs text-muted-foreground uppercase tracking-widest text-center">
            CUSTOMS MANAGEMENT
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3 py-4">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = location === item.href;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className="h-10"
                    >
                      <Link href={item.href} data-testid={`link-nav-${item.title.toLowerCase()}`}>
                        <item.icon className="w-5 h-5" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 mb-3">
          <Avatar className="w-10 h-10">
            <AvatarImage src="" alt="User avatar" />
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
              CY
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium truncate" data-testid="text-username">
              cem.yildirim
            </span>
            <span className="text-xs text-muted-foreground truncate">
              cem.yildirim@cncgumr
            </span>
          </div>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start text-muted-foreground"
          onClick={() => console.log("Logout clicked")}
          data-testid="button-logout"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Logout
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}

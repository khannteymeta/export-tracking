"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  Globe, 
  LayoutDashboard, 
  Layers, 
  PlusCircle,
  Settings
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface NavbarProps {
  user: {
    name: string;
    email: string;
    role: string;
  };
}

export function Navbar({ user }: NavbarProps) {
  const pathname = usePathname();

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "admin":
        return <Badge className="bg-red-500/10 text-red-600 border-red-500/20 capitalize font-semibold">Admin</Badge>;
      case "manager":
        return <Badge className="bg-indigo-500/10 text-indigo-600 border-indigo-500/20 capitalize font-semibold">Manager</Badge>;
      default:
        return <Badge className="bg-zinc-500/10 text-zinc-600 border-zinc-500/20 capitalize font-semibold">User</Badge>;
    }
  };

  const navLinks = [
    {
      href: "/dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
    },
    {
      href: "/export-tracking",
      label: "Export Tracking",
      icon: Layers,
    },
  ];

  if (user.role === "admin") {
    navLinks.push({
      href: "/settings",
      label: "Settings",
      icon: Settings,
    });
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
      <div className="flex h-14 items-center justify-between px-6 max-w-(screen-2xl) mx-auto w-full">
        {/* Left: Branding & Nav Links */}
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-2 font-bold text-foreground">
            <div className="rounded-lg bg-primary p-1.5 text-primary-foreground shadow-sm">
              <Globe className="h-4 w-4" />
            </div>
            <span className="text-lg font-extrabold tracking-tight bg-linear-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
              ExportTrack
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = 
                pathname === link.href || 
                (link.href !== "/dashboard" && pathname?.startsWith(link.href));
              
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    isActive
                      ? "bg-secondary text-foreground font-semibold shadow-xs"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right: Actions, User Info & LogOut */}
        <div className="flex items-center gap-4">
          {/* Quick Action: New Shipment */}
          <Link href="/export-tracking/new" passHref>
            <Button size="sm" className="hidden sm:flex items-center gap-1.5 font-semibold">
              <PlusCircle className="h-4 w-4" />
              New Shipment
            </Button>
          </Link>

          {/* User Profile Info Card */}
          <div className="flex items-center gap-3 border-l border-border/60 pl-4">
            <div className="hidden lg:flex flex-col items-end text-right">
              <span className="text-xs font-semibold text-foreground truncate max-w-[150px]">
                {user.name}
              </span>
              <span className="text-[10px] text-muted-foreground truncate max-w-[150px]">
                {user.email}
              </span>
            </div>
            {getRoleBadge(user.role)}
          </div>
        </div>
      </div>
    </header>
  );
}

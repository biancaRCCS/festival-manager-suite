import { Link, useLocation } from "wouter"
import { useClerk, useUser } from "@clerk/react"
import { useEffect, useState } from "react"
import { Calendar, Users, Briefcase, HandHeart, Settings, LogOut, ShieldCheck, Home, ClipboardList, Gift, FileSignature } from "lucide-react"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation()
  const { signOut } = useClerk()
  const { user } = useUser()
  const [emailFailureCount, setEmailFailureCount] = useState(0)

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/dashboard/email-failures`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.count) setEmailFailureCount(data.count) })
      .catch(() => {})
  }, [])

  const navItems = [
    { href: "/dashboard",  label: "Dashboard",   icon: Home },
    { href: "/vendors",    label: "Vendors",      icon: Briefcase },
    { href: "/special-agreements", label: "Special Agreements", icon: FileSignature },
    { href: "/sponsors",   label: "Sponsors",     icon: HandHeart },
    { href: "/volunteers", label: "Volunteers",   icon: Users },
    { href: "/contributions", label: "Contributions", icon: Gift },
    { href: "/activity",   label: "Activity Log", icon: ClipboardList },
    { href: "/staff",      label: "Staff",        icon: ShieldCheck },
    { href: "/settings",   label: "Settings",     icon: Settings, badge: emailFailureCount > 0 ? emailFailureCount : undefined },
  ]

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans">
      {/* Sidebar — deep navy matching RCCS header */}
      <div className="w-60 flex flex-col justify-between" style={{ backgroundColor: "hsl(224 68% 15%)" }}>
        {/* Brand */}
        <div>
          <div className="h-16 flex items-center px-5 gap-3 border-b border-white/10">
            <img
              src={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/festival-dancers-navy@120.png`}
              alt="Romanian Festival – dancing figures logo"
              className="h-8 w-auto"
            />
            <span className="font-serif font-semibold text-base text-white tracking-wide leading-tight">
              Fest Manager
            </span>
          </div>

          <nav className="p-3 space-y-0.5 mt-1">
            {navItems.map((item) => {
              const active = location.startsWith(item.href)
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-colors cursor-pointer",
                      active
                        ? "bg-primary text-white shadow-sm"
                        : "text-white/70 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    <item.icon className="w-4 h-4 shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    {"badge" in item && item.badge !== undefined && (
                      <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-[18px] text-center">
                        {item.badge > 99 ? "99+" : item.badge}
                      </span>
                    )}
                  </div>
                </Link>
              )
            })}
          </nav>
        </div>

        {/* User footer */}
        <div className="p-3 border-t border-white/10">
          <div className="flex items-center gap-3 px-2 mb-3">
            <Avatar className="h-8 w-8 border border-white/20">
              <AvatarImage src={user?.imageUrl} />
              <AvatarFallback className="bg-primary text-white text-xs font-bold">
                {user?.firstName?.charAt(0) || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-medium text-white truncate">{user?.fullName || "Staff"}</span>
              <span className="text-xs text-white/50 truncate">{user?.primaryEmailAddress?.emailAddress}</span>
            </div>
          </div>
          <button
            onClick={() => signOut({ redirectUrl: "/" })}
            className="flex w-full items-center gap-3 px-3 py-2 rounded text-sm font-medium text-white/60 hover:bg-white/10 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Log out
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden bg-background">
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

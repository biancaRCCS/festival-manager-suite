import { Link, useLocation } from "wouter"
import { useClerk, useUser } from "@clerk/react"
import { Calendar, Users, Briefcase, HandHeart, Settings, LogOut, ShieldCheck, Home } from "lucide-react"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation()
  const { signOut } = useClerk()
  const { user } = useUser()
  
  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: Home },
    { href: "/vendors", label: "Vendors", icon: Briefcase },
    { href: "/sponsors", label: "Sponsors", icon: HandHeart },
    { href: "/volunteers", label: "Volunteers", icon: Users },
    { href: "/staff", label: "Staff", icon: ShieldCheck },
    { href: "/settings", label: "Settings", icon: Settings },
  ]

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans">
      {/* Sidebar */}
      <div className="w-64 border-r border-border bg-sidebar flex flex-col justify-between shadow-sm relative z-10">
        <div>
          <div className="h-16 flex items-center px-6 border-b border-border bg-sidebar gap-3">
             <img src={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/logo.svg`} alt="Logo" className="w-8 h-8 rounded-full shadow-sm" />
             <span className="font-serif font-semibold text-lg text-sidebar-foreground">Fest Manager</span>
          </div>
          <nav className="p-4 space-y-1">
            {navItems.map((item) => {
              const active = location.startsWith(item.href)
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                      active 
                        ? "bg-primary text-primary-foreground shadow-sm" 
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </div>
                </Link>
              )
            })}
          </nav>
        </div>
        
        <div className="p-4 border-t border-border bg-sidebar">
          <div className="flex items-center gap-3 mb-4 px-2">
            <Avatar className="h-9 w-9 border border-border">
              <AvatarImage src={user?.imageUrl} />
              <AvatarFallback className="bg-primary/10 text-primary font-bold">
                {user?.firstName?.charAt(0) || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-medium truncate">{user?.fullName || "Staff"}</span>
              <span className="text-xs text-muted-foreground truncate">{user?.primaryEmailAddress?.emailAddress}</span>
            </div>
          </div>
          <button
            onClick={() => signOut({ redirectUrl: "/" })}
            className="flex w-full items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Log out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden bg-noise relative">
        <main className="flex-1 overflow-y-auto p-8 relative z-10">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

import { Link } from "wouter"

export function PublicLayout({ children, title, subtitle }: { children: React.ReactNode, title: string, subtitle?: string }) {
  return (
    <div className="min-h-screen bg-noise bg-background flex flex-col font-sans relative">
      <header className="absolute top-0 w-full p-6 flex items-center justify-between z-20">
        <Link href="/">
          <div className="flex items-center gap-3 cursor-pointer">
            <img src={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/logo.svg`} alt="Logo" className="w-10 h-10 rounded-full shadow-md border-2 border-primary/20" />
            <span className="font-serif font-bold text-xl text-primary drop-shadow-sm hidden sm:block">Romanian Festival</span>
          </div>
        </Link>
        <Link href="/">
          <button className="text-sm font-medium hover:text-primary transition-colors">Back to Home</button>
        </Link>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center py-24 px-4 relative z-10">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-10">
            <h1 className="text-4xl md:text-5xl font-serif text-primary mb-4 drop-shadow-sm">{title}</h1>
            {subtitle && <p className="text-lg text-muted-foreground">{subtitle}</p>}
          </div>
          {children}
        </div>
      </div>
      
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 pointer-events-none z-0"></div>
    </div>
  )
}

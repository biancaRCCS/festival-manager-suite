import { Link } from "wouter"

export function PublicLayout({ children, title, subtitle }: { children: React.ReactNode, title: string, subtitle?: string }) {
  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      {/* Navy header bar — matches RCCS */}
      <header className="w-full bg-secondary shadow-md">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center gap-3 cursor-pointer">
              <img
                src={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/logo.svg`}
                alt="Logo"
                className="w-9 h-9 rounded"
              />
              <span className="font-serif font-bold text-lg text-white hidden sm:block tracking-wide">
                Romanian Festival
              </span>
            </div>
          </Link>
          <Link href="/">
            <button className="text-sm font-medium text-white/80 hover:text-white transition-colors uppercase tracking-wider">
              Back to Home
            </button>
          </Link>
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center py-12 px-4">
        <div className="w-full max-w-2xl">
          {/* Page title */}
          <div className="mb-10">
            <h1 className="font-serif text-4xl md:text-5xl text-secondary font-bold mb-1 leading-tight section-underline">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-5 text-base text-muted-foreground">{subtitle}</p>
            )}
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}

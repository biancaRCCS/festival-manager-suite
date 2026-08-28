import { FileText } from "lucide-react"

export function GuideLinks() {
  return (
    <div className="mb-10">
      <p className="font-sans text-[15px] text-muted-foreground mb-4">
        New to the festival? Start with the guide.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <a
          href="/2026-romanian-festival-guide.pdf"
          target="_blank"
          rel="noopener"
          className="flex items-center gap-3 border border-secondary bg-secondary/5 px-5 py-4 text-secondary hover:bg-secondary/10 transition-colors rounded-none"
        >
          <FileText className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block font-serif text-lg font-semibold leading-tight">
              Sponsor &amp; Vendor Guide
            </span>
            <span className="block font-sans text-[15px] text-muted-foreground mt-1">
              3 pages · best on desktop
            </span>
          </span>
        </a>
        <a
          href="/2026-romanian-festival-guide-mobile.pdf"
          target="_blank"
          rel="noopener"
          className="flex items-center gap-3 border border-secondary bg-secondary/5 px-5 py-4 text-secondary hover:bg-secondary/10 transition-colors rounded-none"
        >
          <FileText className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block font-serif text-lg font-semibold leading-tight">
              Mobile Guide
            </span>
            <span className="block font-sans text-[15px] text-muted-foreground mt-1">
              7 pages · designed for phones
            </span>
          </span>
        </a>
      </div>
    </div>
  )
}
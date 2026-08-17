import { useState } from "react"
import { useListSponsors, useGetCurrentYear } from "@workspace/api-client-react"
import { AdminLayout } from "@/components/layout/admin-layout"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Link } from "wouter"
import { Search, Eye, Download, AlertCircle } from "lucide-react"

// ---------------------------------------------------------------------------
// Status display
// ---------------------------------------------------------------------------
const STATUS_CONFIG: Record<string, { label: string; className: string; needsRccsAction?: boolean }> = {
  pending:           { label: "Pending Review",          className: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100",  needsRccsAction: true },
  approved:          { label: "Awaiting Details",        className: "bg-blue-100 text-blue-800 hover:bg-blue-100" },
  details_submitted: { label: "Details In — Review Needed", className: "bg-purple-100 text-purple-800 hover:bg-purple-100", needsRccsAction: true },
  details_approved:  { label: "Awaiting Payment",        className: "bg-indigo-100 text-indigo-800 hover:bg-indigo-100" },
  payment_pending:   { label: "Payment Pending",         className: "bg-orange-100 text-orange-800 hover:bg-orange-100" },
  paid:              { label: "Paid",                    className: "bg-green-100 text-green-800 hover:bg-green-100" },
  final_approved:    { label: "Final Approved",          className: "bg-green-100 text-green-800 hover:bg-green-100" },
  rejected:          { label: "Rejected",                className: "bg-red-100 text-red-800 hover:bg-red-100" },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status.replace(/_/g, " "), className: "bg-gray-100 text-gray-700 hover:bg-gray-100" }
  return (
    <Badge variant="secondary" className={cfg.className}>
      {cfg.label}
    </Badge>
  )
}

const TIER_LABELS: Record<string, string> = {
  bronze: "Bronze", silver: "Silver", gold: "Gold", platinum: "Platinum", diamond: "Diamond",
}

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------
type TabKey = "all" | "needs_action" | "awaiting_details" | "details_submitted" | "awaiting_payment" | "paid" | "rejected"

const TABS: { key: TabKey; label: string; needsAction?: boolean }[] = [
  { key: "all",              label: "All" },
  { key: "needs_action",     label: "Needs Review",     needsAction: true },
  { key: "awaiting_details", label: "Awaiting Details" },
  { key: "details_submitted",label: "Details In",       needsAction: true },
  { key: "awaiting_payment", label: "Awaiting Payment" },
  { key: "paid",             label: "Paid" },
  { key: "rejected",         label: "Rejected" },
]

const STATUS_SETS: Record<TabKey, string[]> = {
  all:               [],
  needs_action:      ["pending", "details_submitted"],
  awaiting_details:  ["approved"],
  details_submitted: ["details_submitted"],
  awaiting_payment:  ["details_approved", "payment_pending"],
  paid:              ["paid", "final_approved"],
  rejected:          ["rejected"],
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function SponsorsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("all")
  const [search, setSearch] = useState("")

  const { data: currentYear } = useGetCurrentYear()

  // Always fetch all; filter client-side for flexibility
  const { data: sponsors, isLoading } = useListSponsors(
    { yearId: currentYear?.id },
    { query: { enabled: !!currentYear, queryKey: ["sponsors", currentYear?.id] } }
  )

  const allowedStatuses = STATUS_SETS[activeTab]

  const filtered = sponsors?.filter(s => {
    // Status filter
    if (allowedStatuses.length > 0 && !allowedStatuses.includes(s.status)) return false
    // Search
    const q = search.toLowerCase()
    if (!q) return true
    return (
      s.name.toLowerCase().includes(q) ||
      s.orgName.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q)
    )
  })

  // Badge counts for tabs
  const countFor = (key: TabKey) => {
    const set = STATUS_SETS[key]
    if (!set.length) return sponsors?.length ?? 0
    return sponsors?.filter(s => set.includes(s.status)).length ?? 0
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif text-secondary mb-2">Sponsors</h1>
            <p className="text-muted-foreground">Manage sponsor applications and agreements.</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => window.open(`/api/export/sponsors?yearId=${currentYear?.id}`)}
              disabled={!currentYear}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </button>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">

            {/* ── Toolbar ── */}
            <div className="p-4 border-b bg-muted/20 space-y-3">
              {/* Tabs */}
              <div className="flex flex-wrap gap-1">
                {TABS.map(tab => {
                  const count   = countFor(tab.key)
                  const isActive = activeTab === tab.key
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-secondary text-secondary-foreground shadow-sm"
                          : "bg-background border border-input text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      }`}
                    >
                      {tab.needsAction && !isActive && (
                        <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                      )}
                      {tab.label}
                      {count > 0 && (
                        <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none ${
                          isActive
                            ? "bg-secondary-foreground/20 text-secondary-foreground"
                            : tab.needsAction && count > 0
                              ? "bg-amber-100 text-amber-800"
                              : "bg-muted text-muted-foreground"
                        }`}>
                          {count}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Search */}
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search sponsors…"
                  className="pl-9 bg-background"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>

            {/* ── Table ── */}
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Loading sponsors…</div>
            ) : filtered?.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Search className="w-8 h-8 text-muted-foreground opacity-50" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-1">No sponsors found</h3>
                <p className="text-muted-foreground">No applications match your current filters.</p>
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>Organization</TableHead>
                    <TableHead>Tier / Amount</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Applied</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered?.map(sponsor => {
                    const cfg = STATUS_CONFIG[sponsor.status]
                    const needsAction = !!cfg?.needsRccsAction
                    return (
                      <TableRow
                        key={sponsor.id}
                        className={`hover:bg-muted/20 ${needsAction ? "border-l-2 border-l-amber-400" : ""}`}
                      >
                        <TableCell className="font-medium text-foreground">
                          <div className="flex items-center gap-2">
                            {needsAction && (
                              <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" aria-label="Needs your review" />
                            )}
                            <div>
                              {sponsor.orgName}
                              <div className="text-xs text-muted-foreground font-normal">{sponsor.name}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge variant="outline" className="capitalize w-fit">
                              {TIER_LABELS[sponsor.tier] ?? sponsor.tier}
                            </Badge>
                            {sponsor.sponsorshipAmount != null && (
                              <span className="text-xs text-muted-foreground">
                                ${Number(sponsor.sponsorshipAmount).toLocaleString()}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{sponsor.email}</div>
                          <div className="text-xs text-muted-foreground">{sponsor.phone}</div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(sponsor.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={sponsor.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Link
                            href={`/sponsors/${sponsor.id}`}
                            className="inline-flex items-center justify-center rounded-md text-sm font-medium h-8 px-3 border border-input bg-background shadow-sm hover:bg-secondary/10 hover:text-secondary hover:border-secondary/30 transition-colors"
                          >
                            <Eye className="w-4 h-4 mr-1.5" />
                            {needsAction ? "Review" : "View"}
                          </Link>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  )
}

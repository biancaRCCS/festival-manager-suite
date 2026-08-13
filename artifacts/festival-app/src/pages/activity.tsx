import { useState } from "react"
import { Link } from "wouter"
import { AdminLayout } from "@/components/layout/admin-layout"
import { useGetRecentActivity } from "@workspace/api-client-react"
import type { ActivityItemType, ActivityItemEntityType } from "@workspace/api-client-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  CheckCircle,
  XCircle,
  DollarSign,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Trash2,
  Star,
  UserPlus,
  Filter,
  X,
  Download,
  User,
} from "lucide-react"
import { cn } from "@/lib/utils"

const TYPE_LABELS: Record<string, string> = {
  approved:        "Approved",
  rejected:        "Rejected",
  paid:            "Paid",
  final_approved:  "Final Approved",
  assigned:        "Assigned",
  deleted:         "Deleted",
  new_application: "New Application",
}

const ENTITY_LABELS: Record<string, string> = {
  vendor:    "Vendor",
  sponsor:   "Sponsor",
  volunteer: "Volunteer",
}

function typeIcon(type: string) {
  switch (type) {
    case "approved":        return <CheckCircle  className="w-4 h-4 text-emerald-500" />
    case "final_approved":  return <Star         className="w-4 h-4 text-emerald-600" />
    case "rejected":        return <XCircle      className="w-4 h-4 text-red-500" />
    case "paid":            return <DollarSign   className="w-4 h-4 text-blue-500" />
    case "assigned":        return <Briefcase    className="w-4 h-4 text-violet-500" />
    case "deleted":         return <Trash2       className="w-4 h-4 text-gray-400" />
    case "new_application": return <UserPlus     className="w-4 h-4 text-amber-500" />
    default:                return <ClipboardList className="w-4 h-4 text-muted-foreground" />
  }
}

function typeBadgeVariant(type: string): "default" | "secondary" | "destructive" | "outline" {
  switch (type) {
    case "approved":
    case "final_approved": return "default"
    case "rejected":
    case "deleted":        return "destructive"
    case "paid":           return "secondary"
    default:               return "outline"
  }
}

function entityLink(entityType: string, entityId?: number): string | null {
  if (!entityId) return null
  switch (entityType) {
    case "vendor":    return `/vendors/${entityId}`
    case "sponsor":   return `/sponsors/${entityId}`
    case "volunteer": return `/volunteers/${entityId}`
    default:          return null
  }
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString("en-US", {
    month: "short",
    day:   "numeric",
    year:  "numeric",
    hour:  "numeric",
    minute: "2-digit",
  })
}

const LIMIT = 50

export default function ActivityPage() {
  const [page, setPage]             = useState(1)
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [entityFilter, setEntityFilter] = useState<string>("all")
  const [isExporting, setIsExporting] = useState(false)

  function handleExport() {
    const params = new URLSearchParams()
    if (typeFilter   !== "all") params.set("type",       typeFilter)
    if (entityFilter !== "all") params.set("entityType", entityFilter)
    const qs = params.toString()
    const url = `/api/dashboard/activity/export${qs ? `?${qs}` : ""}`

    setIsExporting(true)
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error("Export failed")
        return res.blob()
      })
      .then(blob => {
        const href = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = href
        const date = new Date().toISOString().slice(0, 10)
        a.download = `activity-log-${date}.csv`
        a.click()
        URL.revokeObjectURL(href)
      })
      .catch(console.error)
      .finally(() => setIsExporting(false))
  }

  const params = {
    page,
    limit: LIMIT,
    ...(typeFilter   !== "all" ? { type:       typeFilter   as ActivityItemType }       : {}),
    ...(entityFilter !== "all" ? { entityType: entityFilter as ActivityItemEntityType } : {}),
  }

  const { data, isLoading, isError } = useGetRecentActivity(params, {
    query: { queryKey: ["paginatedActivity", params] },
  })

  function resetFilters() {
    setTypeFilter("all")
    setEntityFilter("all")
    setPage(1)
  }

  const hasFilters = typeFilter !== "all" || entityFilter !== "all"

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">Activity Log</h1>
            <p className="text-muted-foreground mt-1">
              Full audit trail — approvals, rejections, payments, and deletions
            </p>
          </div>
          <div className="flex items-center gap-3">
            {data && (
              <span className="text-sm text-muted-foreground">
                {data.total.toLocaleString()} total {data.total === 1 ? "entry" : "entries"}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={isExporting || !data || data.total === 0}
              className="gap-1.5"
            >
              <Download className="w-4 h-4" />
              {isExporting ? "Exporting…" : "Export CSV"}
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap gap-3 items-center">
              <Filter className="w-4 h-4 text-muted-foreground shrink-0" />

              <Select
                value={typeFilter}
                onValueChange={(v) => { setTypeFilter(v); setPage(1) }}
              >
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="final_approved">Final approved</SelectItem>
                  <SelectItem value="assigned">Assigned</SelectItem>
                  <SelectItem value="deleted">Deleted</SelectItem>
                  <SelectItem value="new_application">New application</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={entityFilter}
                onValueChange={(v) => { setEntityFilter(v); setPage(1) }}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All entities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All entities</SelectItem>
                  <SelectItem value="vendor">Vendors</SelectItem>
                  <SelectItem value="sponsor">Sponsors</SelectItem>
                  <SelectItem value="volunteer">Volunteers</SelectItem>
                </SelectContent>
              </Select>

              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={resetFilters} className="gap-1.5 text-muted-foreground">
                  <X className="w-3.5 h-3.5" />
                  Clear filters
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium text-muted-foreground">
              {isLoading
                ? "Loading…"
                : data
                  ? `Showing ${Math.min((page - 1) * LIMIT + 1, data.total)}–${Math.min(page * LIMIT, data.total)} of ${data.total.toLocaleString()}`
                  : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isError && (
              <div className="p-8 text-center text-destructive">
                Failed to load activity log. Please try again.
              </div>
            )}

            {isLoading && (
              <div className="divide-y divide-border">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-4 px-6 py-4 animate-pulse">
                    <div className="w-4 h-4 rounded-full bg-muted mt-0.5 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-muted rounded w-3/4" />
                      <div className="h-3 bg-muted rounded w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!isLoading && !isError && data && data.items.length === 0 && (
              <div className="p-12 text-center text-muted-foreground">
                <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No activity entries match the current filters.</p>
              </div>
            )}

            {!isLoading && !isError && data && data.items.length > 0 && (
              <div className="divide-y divide-border">
                {data.items.map((item) => {
                  const link = entityLink(item.entityType, item.entityId)
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "flex items-start gap-4 px-6 py-4 transition-colors",
                        link ? "hover:bg-muted/40" : ""
                      )}
                    >
                      {/* Icon */}
                      <div className="mt-0.5 shrink-0">{typeIcon(item.type)}</div>

                      {/* Message + meta */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground leading-snug">
                          {link ? (
                            <Link href={link} className="font-medium hover:underline text-primary">
                              {item.message}
                            </Link>
                          ) : (
                            <span className="font-medium">{item.message}</span>
                          )}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          <Badge variant={typeBadgeVariant(item.type)} className="text-xs py-0 h-5">
                            {TYPE_LABELS[item.type] ?? item.type}
                          </Badge>
                          <Badge variant="outline" className="text-xs py-0 h-5 text-muted-foreground">
                            {ENTITY_LABELS[item.entityType] ?? item.entityType}
                          </Badge>
                          {item.performedBy && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <User className="w-3 h-3" />
                              {item.performedBy}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {formatDate(item.createdAt)}
                          </span>
                        </div>
                      </div>

                      {/* Link arrow */}
                      {link && (
                        <Link href={link}>
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground">
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </Link>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="gap-1.5"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </Button>

            <span className="text-sm text-muted-foreground">
              Page {page} of {data.totalPages}
            </span>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
              disabled={page === data.totalPages}
              className="gap-1.5"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}

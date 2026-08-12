import { useGetDashboardSummary, useGetRecentActivity, useGetCurrentYear } from "@workspace/api-client-react"
import { AdminLayout } from "@/components/layout/admin-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Link } from "wouter"
import { Store, HandHeart, Users, Calendar, ArrowRight, Activity, Clock, DollarSign } from "lucide-react"

function formatFestivalDate(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00")
  const weekday = date.toLocaleDateString("en-US", { weekday: "long" })
  const month = date.toLocaleDateString("en-US", { month: "long" })
  const day = date.getDate()
  const suffix =
    day === 1 || day === 21 || day === 31 ? "st" :
    day === 2 || day === 22 ? "nd" :
    day === 3 || day === 23 ? "rd" : "th"
  return `${weekday}, ${month} ${day}${suffix}, ${date.getFullYear()}`
}

export default function DashboardPage() {
  const { data: currentYear, isLoading: yearLoading } = useGetCurrentYear()
  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary({ query: { enabled: !!currentYear, queryKey: ["dashboardSummary"] } })
  const { data: activity, isLoading: activityLoading } = useGetRecentActivity({ query: { enabled: !!currentYear, queryKey: ["recentActivity"] } })

  const isLoading = yearLoading || summaryLoading || activityLoading

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-4xl font-serif text-primary mb-2">Festival Dashboard</h1>
          <p className="text-muted-foreground text-lg">Welcome back. Here is what's happening today.</p>
        </div>

        {isLoading ? (
          <div className="h-64 flex items-center justify-center">
            <div className="animate-pulse flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              <p className="text-muted-foreground font-medium">Loading summary...</p>
            </div>
          </div>
        ) : !summary ? (
          <Card className="border-dashed border-2 bg-transparent shadow-none">
            <CardContent className="flex flex-col items-center justify-center h-64 text-center">
              <Calendar className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
              <p className="text-xl font-medium text-foreground mb-2">No Active Festival Year</p>
              <p className="text-muted-foreground mb-6">Create and activate a festival year in settings to see data.</p>
              <Link href="/settings" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium h-10 px-8 bg-primary text-primary-foreground shadow hover:bg-primary/90">
                Go to Settings
              </Link>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* ── Countdown banner ── */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <Card className="md:col-span-4 bg-gradient-to-br from-primary/10 to-transparent border-primary/20 shadow-sm relative overflow-hidden">
                <div className="absolute right-0 top-0 w-64 h-full bg-noise mix-blend-multiply opacity-50 pointer-events-none" />
                <CardContent className="p-8 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-medium text-primary uppercase tracking-wider mb-1">
                      Countdown to the 2026 Romanian Festival
                    </h2>

                    {summary.festivalDate ? (
                      <>
                        <div className="text-5xl font-serif text-foreground mt-2">
                          {summary.countdown !== null && summary.countdown > 0 ? (
                            <>
                              <span className="text-primary font-bold">{summary.countdown}</span>
                              {" "}days left
                            </>
                          ) : summary.countdown === 0 ? (
                            <span className="text-secondary font-bold">Today!</span>
                          ) : (
                            <span className="text-muted-foreground font-bold">Completed</span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-2">
                          {formatFestivalDate(summary.festivalDate)}
                        </p>
                      </>
                    ) : (
                      <p className="text-base text-muted-foreground mt-3 flex items-center gap-2">
                        <Calendar className="w-4 h-4 shrink-0 text-muted-foreground/60" />
                        <Link
                          href="/settings"
                          className="underline underline-offset-2 hover:text-foreground transition-colors"
                        >
                          Set a festival date in Settings
                        </Link>
                      </p>
                    )}
                  </div>

                  <div className="hidden md:flex flex-col items-end text-right">
                    <span className="text-sm text-muted-foreground">Pending Actions</span>
                    <div className="text-3xl font-bold text-destructive mt-1 flex items-center gap-2">
                      <Activity className="w-6 h-6" /> {summary.pendingActions}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ── Application stats ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Vendors */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xl flex items-center justify-between">
                    <span className="flex items-center gap-2 text-secondary"><Store className="w-5 h-5" /> Vendors</span>
                    <Badge variant="secondary" className="text-lg px-3 py-1 bg-secondary/10 text-secondary hover:bg-secondary/20">{summary.vendorStats.total}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 mt-4">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground flex items-center gap-1.5"><Clock className="w-4 h-4" /> Pending Review</span>
                      <span className="font-semibold">{summary.vendorStats.pending}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-secondary" /> Payment Pending</span>
                      <span className="font-semibold">{summary.vendorStats.approved}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-500" /> Final Approved</span>
                      <span className="font-semibold text-green-600">{summary.vendorStats.finalApproved}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm pt-2 border-t mt-1">
                      <span className="text-muted-foreground flex items-center gap-1.5"><DollarSign className="w-4 h-4 text-green-600" /> Revenue collected</span>
                      <span className="font-semibold text-green-700">${(summary.vendorRevenue ?? 0).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="mt-6">
                    <Link href="/vendors" className="text-secondary text-sm font-medium flex items-center gap-1 hover:underline">
                      Manage Vendors <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </CardContent>
              </Card>

              {/* Sponsors */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xl flex items-center justify-between">
                    <span className="flex items-center gap-2 text-amber-500"><HandHeart className="w-5 h-5" /> Sponsors</span>
                    <Badge variant="secondary" className="text-lg px-3 py-1 bg-amber-50 text-amber-600 hover:bg-amber-100">{summary.sponsorStats.total}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 mt-4">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground flex items-center gap-1.5"><Clock className="w-4 h-4" /> Pending Review</span>
                      <span className="font-semibold">{summary.sponsorStats.pending}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-secondary" /> Payment Pending</span>
                      <span className="font-semibold">{summary.sponsorStats.approved}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-500" /> Final Approved</span>
                      <span className="font-semibold text-green-600">{summary.sponsorStats.finalApproved}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm pt-2 border-t mt-1">
                      <span className="text-muted-foreground flex items-center gap-1.5"><DollarSign className="w-4 h-4 text-green-600" /> Revenue collected</span>
                      <span className="font-semibold text-green-700">${(summary.sponsorRevenue ?? 0).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="mt-6">
                    <Link href="/sponsors" className="text-amber-500 text-sm font-medium flex items-center gap-1 hover:underline">
                      Manage Sponsors <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </CardContent>
              </Card>

              {/* Volunteers */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xl flex items-center justify-between">
                    <span className="flex items-center gap-2 text-primary"><Users className="w-5 h-5" /> Volunteers</span>
                    <Badge variant="secondary" className="text-lg px-3 py-1">{summary.volunteerStats.total}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 mt-4">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground flex items-center gap-1.5"><Clock className="w-4 h-4" /> Pending Review</span>
                      <span className="font-semibold">{summary.volunteerStats.pending}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-500" /> Approved</span>
                      <span className="font-semibold text-green-600">{summary.volunteerStats.approved}</span>
                    </div>
                  </div>
                  <div className="mt-6">
                    <Link href="/volunteers" className="text-primary text-sm font-medium flex items-center gap-1 hover:underline">
                      Manage Volunteers <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ── Recent Activity ── */}
            <div className="grid grid-cols-1 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl">Recent Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  {activity && activity.length > 0 ? (
                    <div className="space-y-4">
                      {activity.map((item) => (
                        <div key={item.id} className="flex gap-4 items-start pb-4 border-b border-border/50 last:border-0 last:pb-0">
                          <div className="mt-1">
                            {item.entityType === 'vendor' ? <Store className="w-4 h-4 text-primary" /> :
                             item.entityType === 'sponsor' ? <HandHeart className="w-4 h-4 text-secondary" /> :
                             <Users className="w-4 h-4 text-primary" />}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-foreground">{item.message}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Date(item.createdAt).toLocaleDateString()} at {new Date(item.createdAt).toLocaleTimeString()}
                            </p>
                          </div>
                          <Badge variant="outline" className="capitalize text-[10px] tracking-wider">{item.type.replace('_', ' ')}</Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">No recent activity.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  )
}

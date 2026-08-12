import { useState, useRef } from "react"
import { useLocation, useParams } from "wouter"
import { useGetSponsor, useReviewSponsor, useFinalApproveSponsor, useAssignSponsorSpot, getGetSponsorQueryKey } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { AdminLayout } from "@/components/layout/admin-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ArrowLeft, CheckCircle2, MapPin, Clock } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------
const TIER_LABELS: Record<string, string> = {
  bronze:   "Bronze",
  silver:   "Silver",
  gold:     "Gold",
  platinum: "Platinum",
  diamond:  "Diamond",
}

const TIER_RANGES: Record<string, string> = {
  bronze:   "$750 – $1,499",
  silver:   "$1,500 – $2,999",
  gold:     "$3,000 – $4,999",
  platinum: "$5,000 – $9,999",
  diamond:  "$10,000 and above",
}

const BOOTH_LABELS: Record<string, string> = {
  booth:     "Booth at the festival — will operate a 10′×10′ promotional booth",
  name_only: "Name-only sponsorship — recognition without operating a booth",
}

function SectionDivider({ title }: { title: string }) {
  return (
    <div className="border-t pt-5 mt-2">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">{title}</h3>
    </div>
  )
}

function Field({ label, value, wide }: { label: string; value?: string | null; wide?: boolean }) {
  if (value === undefined || value === null || value === "") return null
  return (
    <div className={wide ? "col-span-2" : ""}>
      <p className="text-xs font-medium text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{value}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function SponsorDetailPage() {
  const params = useParams()
  const id = Number(params.id)
  const [, setLocation] = useLocation()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data: sponsor, isLoading } = useGetSponsor(id, { query: { enabled: !!id, queryKey: getGetSponsorQueryKey(id) } })
  const reviewMutation = useReviewSponsor({ mutation: { mutationKey: ["reviewSponsor", id] } })
  const finalApproveMutation = useFinalApproveSponsor({ mutation: { mutationKey: ["finalApproveSponsor", id] } })
  const assignSpotMutation = useAssignSponsorSpot({ mutation: { mutationKey: ["assignSpotSponsor", id] } })

  const [reviewNote, setReviewNote] = useState("")
  const [spotNumber, setSpotNumber] = useState("")
  const [locationName, setLocationName] = useState("")
  const [isReviewOpen, setIsReviewOpen] = useState(false)
  const [isSpotOpen, setIsSpotOpen] = useState(false)

  const reviewMutateFnRef = useRef(reviewMutation.mutate)
  reviewMutateFnRef.current = reviewMutation.mutate
  const finalApproveMutateFnRef = useRef(finalApproveMutation.mutate)
  finalApproveMutateFnRef.current = finalApproveMutation.mutate
  const assignSpotMutateFnRef = useRef(assignSpotMutation.mutate)
  assignSpotMutateFnRef.current = assignSpotMutation.mutate

  const handleReview = (status: 'approved' | 'rejected') => {
    reviewMutateFnRef.current(
      { id, data: { status, note: reviewNote } },
      {
        onSuccess: (data) => {
          toast({ title: `Sponsor ${status} successfully` })
          setIsReviewOpen(false)
          queryClient.setQueryData(getGetSponsorQueryKey(id), data)
        },
        onError: () => toast({ title: "Failed to review sponsor", variant: "destructive" })
      }
    )
  }

  const handleFinalApprove = () => {
    finalApproveMutateFnRef.current(
      { id },
      {
        onSuccess: (data) => {
          toast({ title: "Sponsor final approved" })
          queryClient.setQueryData(getGetSponsorQueryKey(id), data)
        },
        onError: () => toast({ title: "Failed to approve", variant: "destructive" })
      }
    )
  }

  const handleAssignSpot = () => {
    if (!spotNumber || !locationName) return
    assignSpotMutateFnRef.current(
      { id, data: { spotNumber, location: locationName } },
      {
        onSuccess: (data) => {
          toast({ title: "Spot assigned successfully" })
          setIsSpotOpen(false)
          queryClient.setQueryData(getGetSponsorQueryKey(id), data)
        },
        onError: () => toast({ title: "Failed to assign spot", variant: "destructive" })
      }
    )
  }

  if (isLoading) return <AdminLayout><div className="p-8">Loading...</div></AdminLayout>
  if (!sponsor) return <AdminLayout><div className="p-8">Sponsor not found.</div></AdminLayout>

  const ad = (sponsor.applicationData ?? {}) as Record<string, unknown>
  const str = (k: string) => (ad[k] != null && ad[k] !== "" ? String(ad[k]) : null)

  const tierLabel = TIER_LABELS[sponsor.tier] ?? sponsor.tier
  const tierRange = TIER_RANGES[sponsor.tier] ?? null
  const tierDisplay = tierRange ? `${tierLabel} — ${tierRange}` : tierLabel

  const amountDisplay = sponsor.sponsorshipAmount != null
    ? `$${Number(sponsor.sponsorshipAmount).toLocaleString()}`
    : null

  const boothDisplay = str("boothOrNameOnly")
    ? (BOOTH_LABELS[str("boothOrNameOnly")!] ?? str("boothOrNameOnly"))
    : null

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-5xl mx-auto">
        <button onClick={() => setLocation("/sponsors")} className="text-muted-foreground hover:text-secondary text-sm flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to Sponsors
        </button>

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-serif text-secondary mb-1">{sponsor.orgName}</h1>
            <p className="text-muted-foreground">{sponsor.name}</p>
          </div>
          <div className="flex gap-3 items-center flex-wrap">
            {sponsor.status === 'pending' && (
              <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-secondary text-secondary-foreground hover:bg-secondary/80">Review Application</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Review Sponsor</DialogTitle>
                    <DialogDescription>Approve or reject this application. Approving will send them an invite to the portal.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Internal Note (Optional)</Label>
                      <Input value={reviewNote} onChange={e => setReviewNote(e.target.value)} placeholder="e.g., Will bring extra banners" />
                    </div>
                  </div>
                  <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="destructive" onClick={() => handleReview('rejected')}>Reject</Button>
                    <Button onClick={() => handleReview('approved')} className="bg-secondary text-secondary-foreground hover:bg-secondary/80">Approve Sponsor</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            {sponsor.status === 'paid' && (
              <Button onClick={handleFinalApprove} variant="default" className="bg-green-600 hover:bg-green-700 text-white">
                <CheckCircle2 className="w-4 h-4 mr-2" /> Final Approve
              </Button>
            )}

            <Dialog open={isSpotOpen} onOpenChange={setIsSpotOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="border-secondary/30 hover:bg-secondary/10 text-secondary-foreground">
                  <MapPin className="w-4 h-4 mr-2" />
                  {sponsor.spotNumber ? 'Edit Spot' : 'Assign Spot'}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Assign Location</DialogTitle>
                  <DialogDescription>Assign a physical spot or designated area for this sponsor.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Spot Number</Label>
                    <Input value={spotNumber} onChange={e => setSpotNumber(e.target.value)} placeholder="e.g., VIP-1" />
                  </div>
                  <div className="space-y-2">
                    <Label>Location / Zone</Label>
                    <Input value={locationName} onChange={e => setLocationName(e.target.value)} placeholder="e.g., Main Entrance" />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleAssignSpot} disabled={!spotNumber || !locationName}>Save Assignment</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* ── Application Details card ── */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-xl">Application Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">

              {/* Status strip */}
              <div className="flex flex-wrap gap-3 items-center pb-3 border-b mb-2">
                <Badge variant="outline" className="capitalize text-xs">{sponsor.status.replace(/_/g, ' ')}</Badge>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Applied {new Date(sponsor.createdAt).toLocaleString()}
                </span>
                {sponsor.approvedAt && (
                  <span className="text-xs text-muted-foreground">Approved {new Date(sponsor.approvedAt).toLocaleDateString()}</span>
                )}
              </div>

              {/* Contact Information */}
              <SectionDivider title="Contact Information" />
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <Field label="Contact Name" value={sponsor.name} />
                <Field label="Organization / Business Name" value={sponsor.orgName} />
                <Field label="Email" value={sponsor.email} />
                <Field label="Phone" value={sponsor.phone} />
              </div>

              {/* Sponsorship */}
              <SectionDivider title="Sponsorship" />
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <Field label="Tier" value={tierDisplay} />
                <Field label="Sponsorship Amount" value={amountDisplay ?? "Not specified"} />
              </div>

              {/* About Your Organization */}
              <SectionDivider title="About Your Organization" />
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <Field label="Sponsored Before" value={str("participatedBefore")} />
                <Field label="Organization / Business Description" value={str("orgDescription")} wide />
              </div>

              {/* Booth or Name Only */}
              <SectionDivider title="Booth or Name-Only Sponsorship" />
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <Field label="Preference" value={boothDisplay} wide />
              </div>

            </CardContent>
          </Card>

          {/* ── Sidebar ── */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Spot Assignment</CardTitle>
              </CardHeader>
              <CardContent>
                {sponsor.spotNumber ? (
                  <div className="flex items-center gap-4 bg-secondary/10 p-4 rounded-lg border border-secondary/20">
                    <div className="w-12 h-12 rounded-full bg-secondary/20 flex items-center justify-center text-secondary-foreground font-bold text-lg shrink-0">
                      {sponsor.spotNumber}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{sponsor.location}</p>
                      <p className="text-xs text-muted-foreground">Assigned Location</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No spot assigned yet.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Legal & Payment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Agreement</span>
                  {sponsor.agreementSigned ?
                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Signed</Badge> :
                    <Badge variant="secondary">Pending</Badge>
                  }
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Payment</span>
                  {sponsor.paidAt ?
                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Paid {new Date(sponsor.paidAt).toLocaleDateString()}</Badge> :
                    <Badge variant="secondary">Pending</Badge>
                  }
                </div>
                {sponsor.reviewNote && (
                  <div className="pt-4 border-t">
                    <span className="text-xs font-medium text-muted-foreground block mb-1">Internal Note</span>
                    <p className="text-sm bg-yellow-50 p-2 text-yellow-900 rounded">{sponsor.reviewNote}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}

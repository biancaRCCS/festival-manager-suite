import { useState, useRef } from "react"
import { useLocation, useParams } from "wouter"
import { useGetSponsor, useReviewSponsor, useFinalApproveSponsor, useAssignSponsorSpot, getGetSponsorQueryKey, useDeleteSponsor } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { AdminLayout } from "@/components/layout/admin-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ArrowLeft, CheckCircle2, MapPin, Clock, Trash2 } from "lucide-react"
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

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:            { label: "Pending Review",       color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  approved:           { label: "Approved — Awaiting Details", color: "bg-blue-100 text-blue-800 border-blue-200" },
  rejected:           { label: "Rejected",             color: "bg-red-100 text-red-800 border-red-200" },
  details_submitted:  { label: "Details Submitted",    color: "bg-purple-100 text-purple-800 border-purple-200" },
  details_approved:   { label: "Details Approved — Awaiting Payment", color: "bg-indigo-100 text-indigo-800 border-indigo-200" },
  payment_pending:    { label: "Payment Pending",       color: "bg-orange-100 text-orange-800 border-orange-200" },
  paid:               { label: "Paid",                  color: "bg-green-100 text-green-800 border-green-200" },
  final_approved:     { label: "Final Approved",        color: "bg-green-100 text-green-800 border-green-200" },
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABELS[status] ?? { label: status.replace(/_/g, " "), color: "bg-gray-100 text-gray-700 border-gray-200" }
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${s.color}`}>
      {s.label}
    </span>
  )
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
  const deleteMutation = useDeleteSponsor()

  const [reviewNote, setReviewNote] = useState("")
  const [spotNumber, setSpotNumber] = useState("")
  const [locationName, setLocationName] = useState("")
  const [isReviewOpen, setIsReviewOpen] = useState(false)
  const [isApproveDetailsOpen, setIsApproveDetailsOpen] = useState(false)
  const [isSpotOpen, setIsSpotOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)

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
          toast({ title: status === 'approved'
            ? "Sponsor approved — details invite sent"
            : "Sponsor rejected"
          })
          setIsReviewOpen(false)
          queryClient.setQueryData(getGetSponsorQueryKey(id), data)
        },
        onError: () => toast({ title: "Failed to review sponsor", variant: "destructive" })
      }
    )
  }

  const handleApproveDetails = () => {
    finalApproveMutateFnRef.current(
      { id },
      {
        onSuccess: (data) => {
          toast({ title: "Details approved — payment email sent to sponsor" })
          setIsApproveDetailsOpen(false)
          queryClient.setQueryData(getGetSponsorQueryKey(id), data)
        },
        onError: () => toast({ title: "Failed to approve details", variant: "destructive" })
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

  const handleDelete = () => {
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Sponsor record deleted" })
          setLocation("/sponsors")
        },
        onError: () => toast({ title: "Failed to delete sponsor", variant: "destructive" })
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

  const hasStage2 = !!str("stage2SubmittedAt")

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

            {/* Stage 1 review — only for pending applications */}
            {sponsor.status === 'pending' && (
              <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-secondary text-secondary-foreground hover:bg-secondary/80">Review Application</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Review Sponsor Application</DialogTitle>
                    <DialogDescription>
                      Approve to send the sponsor a link to complete their stage 2 details. Payment is not collected until after you approve their details.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Internal Note (Optional)</Label>
                      <Input value={reviewNote} onChange={e => setReviewNote(e.target.value)} placeholder="e.g., Check booth preference" />
                    </div>
                  </div>
                  <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="destructive" onClick={() => handleReview('rejected')}>Reject</Button>
                    <Button onClick={() => handleReview('approved')} className="bg-secondary text-secondary-foreground hover:bg-secondary/80">
                      Approve — Send Details Link
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            {/* Stage 2 details approval — only for details_submitted */}
            {sponsor.status === 'details_submitted' && (
              <Dialog open={isApproveDetailsOpen} onOpenChange={setIsApproveDetailsOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-secondary text-secondary-foreground hover:bg-secondary/80">
                    <CheckCircle2 className="w-4 h-4 mr-2" /> Approve Details
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Approve Sponsorship Details</DialogTitle>
                    <DialogDescription>
                      This will move the sponsor to <strong>Details Approved</strong> and send them a payment email with their tier, amount, and payment deadline.
                    </DialogDescription>
                  </DialogHeader>
                  {amountDisplay && (
                    <div className="py-2 space-y-1 text-sm">
                      <p><span className="text-muted-foreground">Tier:</span> {tierDisplay}</p>
                      <p><span className="text-muted-foreground">Amount due:</span> {amountDisplay}</p>
                    </div>
                  )}
                  <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={() => setIsApproveDetailsOpen(false)}>Cancel</Button>
                    <Button
                      onClick={handleApproveDetails}
                      disabled={finalApproveMutation.isPending}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      {finalApproveMutation.isPending ? "Approving…" : "Approve & Send Payment Email"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
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

            <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/5">
                  <Trash2 className="w-4 h-4 mr-2" /> Delete
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete this sponsor record?</DialogTitle>
                  <DialogDescription>
                    This will permanently delete <strong>{sponsor.orgName}</strong> ({sponsor.name}) and all associated data. This cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>Cancel</Button>
                  <Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
                    {deleteMutation.isPending ? "Deleting…" : "Delete Permanently"}
                  </Button>
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
                <StatusBadge status={sponsor.status} />
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Applied {new Date(sponsor.createdAt).toLocaleString()}
                </span>
                {sponsor.approvedAt && (
                  <span className="text-xs text-muted-foreground">Stage 1 approved {new Date(sponsor.approvedAt).toLocaleDateString()}</span>
                )}
                {(sponsor as any).detailsSubmittedAt && (
                  <span className="text-xs text-muted-foreground">Details submitted {new Date((sponsor as any).detailsSubmittedAt).toLocaleDateString()}</span>
                )}
                {sponsor.finalApprovedAt && (
                  <span className="text-xs text-muted-foreground">Details approved {new Date(sponsor.finalApprovedAt).toLocaleDateString()}</span>
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
                <Field label="Booth Preference" value={boothDisplay} wide />
              </div>

              {/* About Your Organization */}
              <SectionDivider title="About Your Organization" />
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <Field label="Sponsored Before" value={str("participatedBefore")} />
                <Field label="Organization / Business Description" value={str("orgDescription")} wide />
              </div>

              {/* Stage 2 details — shown only if submitted */}
              {hasStage2 && (
                <>
                  <SectionDivider title="Stage 2 Details (Submitted)" />
                  <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                    <Field label="On-site Contact Name" value={str("onsiteContactName")} />
                    <Field label="On-site Contact Phone" value={str("onsiteContactPhone")} />
                    <Field label="Booth Description / Products" value={str("boothDescription")} wide />
                    <Field label="Electrical Requirements" value={str("electricalRequirements")} wide />
                    <Field label="Special Setup Requests" value={str("specialRequests")} wide />
                    <Field label="Logo Submitted" value={str("logoUrl") ? "Yes" : null} />
                  </div>
                </>
              )}

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
                <CardTitle className="text-xl">Flow Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { step: "Stage 1 approved",    done: !!sponsor.approvedAt },
                  { step: "Details submitted",   done: !!(sponsor as any).detailsSubmittedAt },
                  { step: "Details approved",    done: !!sponsor.finalApprovedAt },
                  { step: "Agreement signed",    done: !!sponsor.agreementSigned },
                  { step: "Payment received",    done: !!sponsor.paidAt },
                ].map(({ step, done }) => (
                  <div key={step} className="flex items-center justify-between">
                    <span className="text-sm">{step}</span>
                    {done
                      ? <Badge className="bg-green-100 text-green-800 hover:bg-green-100">✓ Done</Badge>
                      : <Badge variant="secondary">Pending</Badge>}
                  </div>
                ))}
                {sponsor.paidAt && (
                  <p className="text-xs text-muted-foreground pt-1">Paid {new Date(sponsor.paidAt).toLocaleDateString()}</p>
                )}
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

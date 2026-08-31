import { useState, useRef } from "react"
import { useLocation, useParams } from "wouter"
import { useGetSponsor, useReviewSponsor, useFinalApproveSponsor, useAssignSponsorSpot, getGetSponsorQueryKey, useDeleteSponsor, useResendSponsorConfirmation, useResendSponsorPaymentLink, useUpdateSponsorDetails, useRecordSponsorManualPayment, useRemoveSponsorManualPayment, useReconcileSponsorStatusFromTimestamps, useMarkSponsorInKind } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { AdminLayout } from "@/components/layout/admin-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ArrowLeft, CheckCircle2, MapPin, Clock, Trash2, Check, Mail, Pencil, DollarSign, Gift } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { ApplicantDetailsEditorDialog, type ApplicantDetailsField } from "@/components/applicant-details-editor-dialog"
import { ManualPaymentDialog } from "@/components/manual-payment-dialog"
import { ApplicationFlow } from "@/components/application-flow"
import { StatusRepairDialog } from "@/components/status-repair-dialog"
import type { ManualPaymentInput } from "@workspace/api-client-react"

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
const SPONSOR_DETAIL_FIELDS: ApplicantDetailsField[] = [
  { key: "name", label: "Contact name" },
  { key: "orgName", label: "Organization / business name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "website", label: "Website" },
  { key: "social", label: "Facebook / Instagram" },
]

const STATUS_META: Record<string, { label: string; color: string; step: number }> = {
  pending_payment:    { label: "Awaiting Payment",                  color: "bg-orange-100 text-orange-800 border-orange-200",  step: 2 },
  payment_processing: { label: "Payment Processing",                color: "bg-purple-100 text-purple-800 border-purple-200", step: 2 },
  paid:               { label: "Paid — Review Needed",              color: "bg-yellow-100 text-yellow-800 border-yellow-200",  step: 3 },
  approved:           { label: "Approved — Awaiting Details",       color: "bg-blue-100 text-blue-800 border-blue-200",        step: 4 },
  rejected:           { label: "Rejected",                          color: "bg-red-100 text-red-800 border-red-200",           step: 3 },
  details_submitted:  { label: "Details Submitted — Review Needed", color: "bg-purple-100 text-purple-800 border-purple-200",  step: 5 },
  details_approved:   { label: "Confirmed",                         color: "bg-green-100 text-green-800 border-green-200",     step: 5 },
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_META[status] ?? { label: status.replace(/_/g, " "), color: "bg-gray-100 text-gray-700 border-gray-200", step: 0 }
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

function AckDisplay({ checked, children }: { checked: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 py-2">
      <div className={`mt-0.5 w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border ${checked ? "bg-green-600 border-green-600" : "border-muted-foreground/40 bg-muted/30"}`}>
        {checked && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
      </div>
      <span className="text-sm text-foreground leading-snug">{children}</span>
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
  const reviewMutation       = useReviewSponsor({ mutation: { mutationKey: ["reviewSponsor", id] } })
  const finalApproveMutation = useFinalApproveSponsor({ mutation: { mutationKey: ["finalApproveSponsor", id] } })
  const assignSpotMutation   = useAssignSponsorSpot({ mutation: { mutationKey: ["assignSpotSponsor", id] } })
  const deleteMutation       = useDeleteSponsor()
  const resendMutation       = useResendSponsorConfirmation()
  const resendPaymentLinkMutation = useResendSponsorPaymentLink()
  const detailsMutation      = useUpdateSponsorDetails({ mutation: { mutationKey: ["updateSponsorDetails", id] } })
  const recordPaymentMutation = useRecordSponsorManualPayment({ mutation: { mutationKey: ["recordSponsorManualPayment", id] } })
  const removePaymentMutation = useRemoveSponsorManualPayment({ mutation: { mutationKey: ["removeSponsorManualPayment", id] } })
  const repairStatusMutation = useReconcileSponsorStatusFromTimestamps({ mutation: { mutationKey: ["reconcileSponsorStatusFromTimestamps", id] } })
  const inKindMutation = useMarkSponsorInKind()

  const [reviewNote, setReviewNote]             = useState("")
  const [spotNumber, setSpotNumber]             = useState("")
  const [locationName, setLocationName]         = useState("")
  const [isReviewOpen, setIsReviewOpen]         = useState(false)
  const [isApproveDetailsOpen, setIsApproveDetailsOpen] = useState(false)
  const [isSpotOpen, setIsSpotOpen]             = useState(false)
  const [isDeleteOpen, setIsDeleteOpen]         = useState(false)
  const [isDetailsOpen, setIsDetailsOpen]       = useState(false)
  const [isManualPaymentOpen, setIsManualPaymentOpen] = useState(false)
  const [isRemovePaymentOpen, setIsRemovePaymentOpen] = useState(false)
  const [isInKindOpen, setIsInKindOpen] = useState(false)
  const [inKindDescription, setInKindDescription] = useState("")

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
          toast({ title: status === 'approved' ? "Sponsor approved — details invite sent" : "Sponsor rejected" })
          setIsReviewOpen(false)
          queryClient.setQueryData(getGetSponsorQueryKey(id), data)
        },
        onError: () => toast({ title: "Failed to review sponsor", variant: "destructive" }),
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
        onError: () => toast({ title: "Failed to approve details", variant: "destructive" }),
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
        onError: () => toast({ title: "Failed to assign spot", variant: "destructive" }),
      }
    )
  }

  const handleDelete = () => {
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => { toast({ title: "Sponsor record deleted" }); setLocation("/sponsors") },
        onError: () => toast({ title: "Failed to delete sponsor", variant: "destructive" }),
      }
    )
  }

  const handleResend = () => {
    resendMutation.mutate(
      { id },
      {
        onSuccess: () => toast({ title: "Confirmation email resent successfully" }),
        onError: () => toast({ title: "Failed to resend confirmation email", variant: "destructive" }),
      }
    )
  }

  const handleResendPaymentLink = () => {
    resendPaymentLinkMutation.mutate(
      { id },
      {
        onSuccess: () => toast({ title: "Payment link resent to sponsor" }),
        onError: () => toast({ title: "Failed to resend payment link", variant: "destructive" }),
      }
    )
  }

  const handleSaveDetails = (values: Record<string, string>) => {
    detailsMutation.mutate(
      {
        id,
        data: {
          name: values.name ?? "",
          orgName: values.orgName ?? "",
          email: values.email ?? "",
          phone: values.phone ?? "",
          website: values.website?.trim() || null,
          social: values.social?.trim() || null,
        },
      },
      {
        onSuccess: (data) => {
          queryClient.setQueryData(getGetSponsorQueryKey(id), data)
          setIsDetailsOpen(false)
          toast({ title: "Sponsor details updated" })
        },
        onError: () => toast({ title: "Failed to update sponsor details", variant: "destructive" }),
      },
    )
  }

  const handleRecordPayment = (data: ManualPaymentInput) => {
    recordPaymentMutation.mutate(
      { id, data },
      {
        onSuccess: (updated) => {
          queryClient.setQueryData(getGetSponsorQueryKey(id), updated)
          queryClient.invalidateQueries({ queryKey: ["sponsors"] })
          queryClient.invalidateQueries({ queryKey: ["paginatedActivity"] })
          setIsManualPaymentOpen(false)
          toast({ title: "Manual payment recorded successfully" })
        },
        onError: () => toast({ title: "Failed to record manual payment", variant: "destructive" }),
      }
    )
  }

  const handleRemovePayment = () => {
    removePaymentMutation.mutate(
      { id },
      {
        onSuccess: (updated) => {
          queryClient.setQueryData(getGetSponsorQueryKey(id), updated)
          queryClient.invalidateQueries({ queryKey: ["sponsors"] })
          queryClient.invalidateQueries({ queryKey: ["paginatedActivity"] })
          setIsRemovePaymentOpen(false)
          toast({ title: "Manual payment removed" })
        },
        onError: () => toast({ title: "Failed to remove manual payment", variant: "destructive" }),
      }
    )
  }

  const handleRepairStatus = async () => {
    try {
      const updated = await repairStatusMutation.mutateAsync({ id })
      queryClient.setQueryData(getGetSponsorQueryKey(id), updated)
      queryClient.invalidateQueries({ queryKey: ["sponsors"] })
      queryClient.invalidateQueries({ queryKey: ["paginatedActivity"] })
      toast({ title: "Sponsor status repaired", description: "No email was sent." })
    } catch (error) {
      toast({ title: "Failed to repair sponsor status", variant: "destructive" })
      throw error
    }
  }
  const handleMarkInKind = () => {
    if (!inKindDescription.trim()) return
    inKindMutation.mutate({ id, data: { description: inKindDescription.trim() } }, { onSuccess: (updated) => {
      queryClient.setQueryData(getGetSponsorQueryKey(id), updated); queryClient.invalidateQueries({ queryKey: ["sponsors"] }); setIsInKindOpen(false); toast({ title: "In-kind contribution recorded" })
    }, onError: () => toast({ title: "Could not record in-kind contribution", variant: "destructive" }) })
  }

  if (isLoading) return <AdminLayout><div className="p-8">Loading…</div></AdminLayout>
  if (!sponsor)  return <AdminLayout><div className="p-8">Sponsor not found.</div></AdminLayout>

  const ad  = (sponsor.applicationData ?? {}) as Record<string, unknown>
  const str = (k: string) => (ad[k] != null && ad[k] !== "" ? String(ad[k]) : null)
  const ack = (k: string) => ad[k] === true

  const tierLabel   = TIER_LABELS[sponsor.tier] ?? sponsor.tier
  const tierRange   = TIER_RANGES[sponsor.tier] ?? null
  const tierDisplay = tierRange ? `${tierLabel} — ${tierRange}` : tierLabel

  const amountDisplay = sponsor.sponsorshipAmount != null
    ? `$${Number(sponsor.sponsorshipAmount).toLocaleString()}`
    : null

  const boothOrNameOnly = str("boothOrNameOnly")
  const isBoothSponsor  = boothOrNameOnly === "Booth"

  const detailsSubmittedAt = (sponsor as any).detailsSubmittedAt as string | null | undefined
  const hasStage2 = !!detailsSubmittedAt
  const paymentReceivedAt = [
    sponsor.hasStripePayment ? (sponsor.stripePaidAt ?? sponsor.paidAt) : null,
    sponsor.manualPaymentRecordedAt ? (sponsor.manualPaymentReceivedDate ?? sponsor.manualPaymentRecordedAt) : null,
  ].filter((value): value is string => Boolean(value))
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] ?? null

  const fmtDateTime = (d?: string | null) =>
    d ? new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null

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
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-muted-foreground">{sponsor.name}</p>
              <StatusBadge status={sponsor.status} />
              {sponsor.isInKind && <Badge className="bg-violet-700 hover:bg-violet-700">In-kind contribution</Badge>}
            </div>
          </div>
          <div className="flex gap-3 items-center flex-wrap">

            {/* Stage 1 review — pending only */}
            <Button variant="outline" className="border-primary/20 hover:bg-primary/5 text-primary" onClick={() => setIsDetailsOpen(true)}>
              <Pencil className="w-4 h-4 mr-2" /> Edit details
            </Button>
            {sponsor.statusNeedsRepair && sponsor.timestampImpliedStatus && (
              <StatusRepairDialog
                entityLabel="sponsor"
                currentStatus={sponsor.status}
                targetStatus={sponsor.timestampImpliedStatus}
                isPending={repairStatusMutation.isPending}
                onRepair={handleRepairStatus}
              />
            )}
            <ApplicantDetailsEditorDialog
              entityLabel="sponsor"
              fields={SPONSOR_DETAIL_FIELDS}
              initialValues={{
                name: sponsor.name,
                orgName: sponsor.orgName,
                email: sponsor.email,
                phone: sponsor.phone,
                website: str("website") ?? "",
                social: str("social") ?? "",
              }}
              open={isDetailsOpen}
              onOpenChange={setIsDetailsOpen}
              onSave={handleSaveDetails}
              isSaving={detailsMutation.isPending}
            />
            {sponsor.status === 'pending_payment' && !sponsor.isInKind && (
              <Button
                variant="outline"
                className="border-primary/20 hover:bg-primary/5 text-primary"
                onClick={handleResendPaymentLink}
                disabled={resendPaymentLinkMutation.isPending}
              >
                <Mail className="w-4 h-4 mr-2" />
                {resendPaymentLinkMutation.isPending ? "Sending…" : "Resend Payment Link"}
              </Button>
            )}

            {sponsor.status === 'paid' && !detailsSubmittedAt && !sponsor.finalApprovedAt && (
              <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-secondary text-secondary-foreground hover:bg-secondary/80">
                    Review Application
                  </Button>
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

            {/* Stage 2 details approval — details_submitted only */}
            {sponsor.status === 'details_submitted' && (
              <Dialog open={isApproveDetailsOpen} onOpenChange={setIsApproveDetailsOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-green-600 hover:bg-green-700 text-white">
                    <CheckCircle2 className="w-4 h-4 mr-2" /> Approve Details
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Approve Sponsorship Details</DialogTitle>
                    <DialogDescription>
                      This moves the sponsor to <strong>Details Approved</strong> and sends them a payment email with their tier, amount, and payment deadline.
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

            {sponsor.status === "pending_payment" && !sponsor.isInKind && !sponsor.manualPaymentRecordedAt && !sponsor.hasStripePayment && (
              <Button
                variant="outline"
                className="border-primary/20 hover:bg-primary/5 text-primary"
                onClick={() => setIsManualPaymentOpen(true)}
              >
                <DollarSign className="w-4 h-4 mr-2" />
                Record Manual Payment
              </Button>
            )}
            <ManualPaymentDialog
              open={isManualPaymentOpen}
              onOpenChange={setIsManualPaymentOpen}
              title="Record Manual Payment"
              description="Record a cash, check, or bank transfer for this sponsor."
              defaultAmount={sponsor.sponsorshipAmount ?? undefined}
              hasStripePayment={sponsor.hasStripePayment}
              isPending={recordPaymentMutation.isPending}
              onSubmit={handleRecordPayment}
            />
            {sponsor.status === "pending_payment" && !sponsor.isInKind && (
              <Dialog open={isInKindOpen} onOpenChange={setIsInKindOpen}>
                <DialogTrigger asChild><Button variant="outline" className="border-violet-300 text-violet-800 hover:bg-violet-50"><Gift className="w-4 h-4 mr-2" />Mark as in-kind</Button></DialogTrigger>
                <DialogContent><DialogHeader><DialogTitle>Record in-kind sponsorship</DialogTitle><DialogDescription>This fulfils the sponsorship without recording a cash payment. Any open online payment link will be expired.</DialogDescription></DialogHeader>
                  <div className="space-y-2 py-3"><Label htmlFor="in-kind-description">Contribution description</Label><Input id="in-kind-description" value={inKindDescription} onChange={e => setInKindDescription(e.target.value)} maxLength={2000} placeholder="e.g., catering, printing, donated services" /></div>
                  <DialogFooter><Button variant="outline" onClick={() => setIsInKindOpen(false)}>Cancel</Button><Button onClick={handleMarkInKind} disabled={!inKindDescription.trim() || inKindMutation.isPending}>{inKindMutation.isPending ? "Recording…" : "Record in-kind contribution"}</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            )}
            <Dialog open={isRemovePaymentOpen} onOpenChange={setIsRemovePaymentOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Remove Manual Payment</DialogTitle>
                  <DialogDescription>
                    This removes the active manual payment and restores the sponsor's prior workflow state. Any Stripe payment remains recorded.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsRemovePaymentOpen(false)}>Cancel</Button>
                  <Button variant="destructive" onClick={handleRemovePayment} disabled={removePaymentMutation.isPending}>
                    {removePaymentMutation.isPending ? "Removing..." : "Remove Payment"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={isSpotOpen} onOpenChange={setIsSpotOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="border-primary/20 hover:bg-primary/5 text-primary">
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

            <Button
              variant="outline"
              className="border-primary/20 hover:bg-primary/5 text-primary"
              onClick={handleResend}
              disabled={resendMutation.isPending}
            >
              <Mail className="w-4 h-4 mr-2" />
              {resendMutation.isPending ? "Sending…" : "Resend Confirmation"}
            </Button>

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

          {/* ── Main card ── */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-xl">Application Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">

              {/* Timestamps strip */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 items-center pb-3 border-b mb-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  Applied {new Date(sponsor.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
                {sponsor.approvedAt && (
                  <span>Stage 1 approved {new Date(sponsor.approvedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                )}
                {detailsSubmittedAt && (
                  <span>Details submitted {new Date(detailsSubmittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                )}
                {sponsor.finalApprovedAt && (
                  <span>Details approved {new Date(sponsor.finalApprovedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                )}
                {sponsor.paidAt && (
                  <span>Paid {new Date(sponsor.paidAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                )}
                {sponsor.isInKind && <span>In-kind contribution recorded</span>}
              </div>

              {sponsor.status === 'payment_processing' && (
                <div role="status" className="rounded-md border border-purple-200 bg-purple-50 p-3 text-sm text-purple-900 mb-2">
                  <p className="font-semibold">Bank payment processing</p>
                  <p className="mt-1">The sponsor completed checkout with a bank transfer (e.g. ACH). It can take a few business days to settle — this will update automatically once it clears.</p>
                </div>
              )}
              {sponsor.paymentFailedAt && (
                <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-950 mb-2">
                  <p className="font-semibold">Bank payment failed — {new Date(sponsor.paymentFailedAt).toLocaleString()}</p>
                  <p className="mt-1">{sponsor.paymentFailureReason ?? "The bank payment did not settle."} The sponsor was reverted to Awaiting Payment so the payment link can be resent.</p>
                </div>
              )}

              {(sponsor.hasStripePayment || sponsor.manualPaymentRecordedAt) && (
                <>
                  <SectionDivider title="Payment Record" />
                  <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                    <Field label="Payment Source" value={sponsor.hasStripePayment && sponsor.manualPaymentRecordedAt ? "Stripe + manual" : sponsor.hasStripePayment ? "Online (Stripe)" : "Manual"} />
                    {sponsor.hasStripePayment && (
                      <>
                        <Field label="Stripe Amount" value={sponsor.stripePaymentAmount != null ? `$${Number(sponsor.stripePaymentAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : undefined} />
                        <Field label="Stripe Paid" value={sponsor.stripePaidAt ? new Date(sponsor.stripePaidAt).toLocaleDateString() : sponsor.paidAt ? new Date(sponsor.paidAt).toLocaleDateString() : undefined} />
                      </>
                    )}
                    {sponsor.manualPaymentRecordedAt && (
                      <>
                        <Field label="Method" value={sponsor.paymentMethod?.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())} />
                        <Field label="Amount Paid" value={sponsor.manualPaymentAmount != null ? `$${Number(sponsor.manualPaymentAmount).toLocaleString()}` : undefined} />
                        <Field label="Date Received" value={sponsor.manualPaymentReceivedDate ? new Date(`${sponsor.manualPaymentReceivedDate}T12:00:00`).toLocaleDateString() : undefined} />
                        <Field label="Reference" value={sponsor.manualPaymentReference} />
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-0.5">Actions</p>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="mt-1 h-7 text-xs"
                            onClick={() => setIsRemovePaymentOpen(true)}
                          >
                            Remove Manual Payment
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
              {sponsor.isInKind && <><SectionDivider title="In-kind Contribution" /><Field label="Description" value={sponsor.inKindDescription} wide /></>}

              {/* ── Contact Information ── */}
              <SectionDivider title="Contact Information" />
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <Field label="Contact Name"              value={sponsor.name} />
                <Field label="Organization / Business"   value={sponsor.orgName} />
                <Field label="Email"                     value={sponsor.email} />
                <Field label="Phone"                     value={sponsor.phone} />
              </div>

              {/* ── Sponsorship ── */}
              <SectionDivider title="Sponsorship" />
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <Field label="Tier"                value={tierDisplay} />
                <Field label="Sponsorship Amount"  value={amountDisplay ?? "Not specified"} />
                <Field label="Booth or Name Only"  value={boothOrNameOnly} wide />
                <Field label="Sponsored Before"    value={str("participatedBefore")} />
              </div>

              {/* ── About the Organization ── */}
              {str("orgDescription") && (
                <>
                  <SectionDivider title="About the Organization" />
                  <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                    <Field label="Organization Description" value={str("orgDescription")} wide />
                  </div>
                </>
              )}

              {/* ── Acknowledgements & Signature (collected at apply time, all sponsors) ── */}
              <SectionDivider title="Acknowledgements & Signature" />
              <div className="rounded-md border border-border bg-muted/20 p-4 space-y-0 divide-y divide-border">
                <AckDisplay checked={ack("ackPromoOnly")}>
                  Complimentary sponsor booth is for <strong>promotional purposes</strong> only — selling prepared food requires a separate vendor application and vendor fee.
                </AckDisplay>
                <AckDisplay checked={ack("ackPermits")}>
                  Additional permits, licenses, or proof of insurance may be required before participating.
                </AckDisplay>
                <AckDisplay checked={ack("ackPaymentRequired")}>
                  Sponsorship is <strong>not confirmed</strong> until payment is received in full.
                </AckDisplay>
                <AckDisplay checked={ack("ackStyleGuidelines")}>
                  Agreed to follow RCCS Romanian Festival style guidelines for sponsor signage, booth presentation, and promotional materials.
                </AckDisplay>
              </div>

              {str("signatureName") && (
                <div className="pt-4 grid grid-cols-2 gap-x-6 gap-y-4">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-0.5">Signed by</p>
                    <p className="text-base font-serif text-foreground">{str("signatureName")}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-0.5">Submission date</p>
                    <p className="text-sm text-foreground">
                      {fmtDateTime(sponsor.createdAt)}
                    </p>
                  </div>
                </div>
              )}

              {/* ── Stage 2 details ─────────────────────────────────────────── */}
              {hasStage2 && isBoothSponsor && (
                <>
                  <SectionDivider title="Booth & Operational Information" />
                  <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                    <Field label="Setup Type"       value={
                      str("setupType") === "Other (describe)"
                        ? `Other — ${str("setupOther") ?? ""}`
                        : str("setupType")
                    } />
                    <Field label="Requires Electricity" value={str("requiresElectricity")} />
                    {str("requiresElectricity") === "Yes" && (
                      <>
                        <Field label="Equipment Requiring Electricity" value={str("electricityEquipment")} />
                        <Field label="Total Amps Needed"               value={str("electricityAmps")} />
                      </>
                    )}
                    <Field label="Staff / Representatives" value={str("staffCount")} />
                    <Field label="Placement Requests"      value={str("placementRequests")} />
                    <Field label="Accessibility Needs"     value={str("accessibilityNeeds")} />
                  </div>

                  <SectionDivider title="Contacts" />
                  <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                    <Field label="Day-of Contact — Name"   value={str("dayOfContactName")} />
                    <Field label="Day-of Contact — Mobile" value={str("dayOfContactPhone")} />
                    <Field label="Backup Contact — Name"   value={str("backupContactName")} />
                    <Field label="Backup Contact — Mobile" value={str("backupContactPhone")} />
                  </div>
                </>
              )}

              {/* Prompt if no stage 2 yet */}
              {!hasStage2 && sponsor.status === 'approved' && (
                <div className="mt-4 rounded-md bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800">
                  Stage 2 details form has been sent. Waiting for the sponsor to complete it.
                </div>
              )}

            </CardContent>
          </Card>

          {/* ── Sidebar ── */}
          <div className="space-y-6">

            {/* Spot assignment */}
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

            {/* Stage flow */}
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Application Flow</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ApplicationFlow
                  rejected={sponsor.status === "rejected"}
                  steps={[
                    { key: "applied", label: "Applied", completedAt: sponsor.createdAt },
                    { key: "paid", label: "Payment Received", completedAt: paymentReceivedAt },
                    { key: "stage1", label: "Stage 1 Approved", completedAt: sponsor.approvedAt },
                    { key: "details", label: "Details Submitted", completedAt: detailsSubmittedAt },
                    { key: "confirmed", label: "Confirmed", completedAt: sponsor.finalApprovedAt },
                  ]}
                />

                {/* Internal note */}
                {sponsor.reviewNote && (
                  <div className="pt-4 border-t mt-2">
                    <span className="text-xs font-medium text-muted-foreground block mb-1">Internal Note</span>
                    <p className="text-sm bg-yellow-50 p-2 text-yellow-900 rounded border border-yellow-200">
                      {sponsor.reviewNote}
                    </p>
                  </div>
                )}

                {/* Agreement signed indicator */}
                {sponsor.agreementSigned && (
                  <div className="pt-4 border-t mt-2 flex items-center gap-2 text-xs text-green-700">
                    <Check className="w-3.5 h-3.5" />
                    Agreement signed
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

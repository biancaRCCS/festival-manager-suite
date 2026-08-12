import { useState, useRef } from "react"
import { useLocation, useParams } from "wouter"
import { useGetVendor, useReviewVendor, useFinalApproveVendor, useAssignVendorSpot, getGetVendorQueryKey, useDeleteVendor } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { AdminLayout } from "@/components/layout/admin-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ArrowLeft, CheckCircle2, XCircle, MapPin, Clock, Trash2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------
const VENDOR_TYPE_LABELS: Record<string, string> = {
  major_food:    "Major Food Vendor",
  specialty_food: "Specialty Food & Beverage Vendor",
  retail:        "Retail, Artisan & Business Vendor",
  nonprofit:     "Verified Nonprofit Organization",
}

const SPACE_SIZES: Record<string, { single: string; double: string }> = {
  major_food:    { single: "10′×20′", double: "20′×20′" },
  specialty_food: { single: "10′×10′", double: "10′×20′" },
  retail:        { single: "10′×10′", double: "10′×20′" },
  nonprofit:     { single: "10′×10′", double: "10′×20′" },
}

const VENDOR_FEES: Record<string, number> = {
  major_food: 2000,
  specialty_food: 600,
  retail: 300,
  nonprofit: 150,
}

const ACK_LABELS: Record<string, string> = {
  ack_noGuarantee:       "Submission does not guarantee acceptance.",
  ack_feesAfterApproval: "Vendor fees are due only after application approval.",
  ack_paymentDeadline:   "Payment is due within 7 days of approval; space may be released if not paid.",
  ack_nonRefundable:     "Booth fees are non-refundable after payment unless otherwise stated by RCCS.",
  ack_ownEquipment:      "Responsible for own tent, tables, chairs, signage, and all booth equipment.",
  ack_noWater:           "Running water is not provided.",
  ack_electricity:       "Electrical outlets available in prime/VIP locations only; responsible for own power if required.",
  ack_permits:           "Responsible for all permits, licenses, insurance, and approvals required to operate.",
  ack_foodCompliance:    "Food vendors must comply with all applicable Placer County Health Department requirements.",
  ack_fireMarshal:       "Food trucks/trailers not permitted; any tent larger than 10′×10′ requires Roseville Fire Marshal approval.",
  ack_loadIn:            "Assigned a load-in time with 30 minutes to unload; no vehicles on grounds after unloading.",
  ack_cleanBooth:        "Responsible for a clean booth and removing all trash before leaving the event.",
  ack_notResponsible:    "RCCS is not responsible for lost, stolen, or damaged property.",
  ack_rccsRight:         "RCCS reserves the right to approve, deny, or reclassify any application.",
  ack_documents:         "Required documents emailed to vendors@romaniancenter.org by 18 September 2026.",
}

const FOOD_KEYS = new Set(["major_food", "specialty_food"])

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function SectionDivider({ title }: { title: string }) {
  return (
    <div className="border-t pt-5 mt-2">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">{title}</h3>
    </div>
  )
}

function Field({ label, value, wide }: { label: string; value?: string | null | boolean; wide?: boolean }) {
  if (value === undefined || value === null || value === "") return null
  const display = typeof value === "boolean" ? (value ? "Yes" : "No") : value
  return (
    <div className={wide ? "col-span-2" : ""}>
      <p className="text-xs font-medium text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{display}</p>
    </div>
  )
}

function AckCheck({ checked, label }: { checked: boolean; label: string }) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      {checked
        ? <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
        : <XCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
      }
      <span className="text-sm text-foreground leading-snug">{label}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function VendorDetailPage() {
  const params = useParams()
  const id = Number(params.id)
  const [, setLocation] = useLocation()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data: vendor, isLoading } = useGetVendor(id, { query: { enabled: !!id, queryKey: getGetVendorQueryKey(id) } })
  const reviewMutation = useReviewVendor({ mutation: { mutationKey: ["reviewVendor", id] } })
  const finalApproveMutation = useFinalApproveVendor({ mutation: { mutationKey: ["finalApproveVendor", id] } })
  const assignSpotMutation = useAssignVendorSpot({ mutation: { mutationKey: ["assignSpotVendor", id] } })
  const deleteMutation = useDeleteVendor()

  const [reviewNote, setReviewNote] = useState("")
  const [spotNumber, setSpotNumber] = useState("")
  const [locationName, setLocationName] = useState("")
  const [isReviewOpen, setIsReviewOpen] = useState(false)
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
          toast({ title: `Vendor ${status} successfully` })
          setIsReviewOpen(false)
          queryClient.setQueryData(getGetVendorQueryKey(id), data)
        },
        onError: () => toast({ title: "Failed to review vendor", variant: "destructive" })
      }
    )
  }

  const handleFinalApprove = () => {
    finalApproveMutateFnRef.current(
      { id },
      {
        onSuccess: (data) => {
          toast({ title: "Vendor final approved" })
          queryClient.setQueryData(getGetVendorQueryKey(id), data)
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
          queryClient.setQueryData(getGetVendorQueryKey(id), data)
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
          toast({ title: "Vendor record deleted" })
          setLocation("/vendors")
        },
        onError: () => toast({ title: "Failed to delete vendor", variant: "destructive" })
      }
    )
  }

  if (isLoading) return <AdminLayout><div className="p-8">Loading...</div></AdminLayout>
  if (!vendor) return <AdminLayout><div className="p-8">Vendor not found.</div></AdminLayout>

  const ad = (vendor.applicationData ?? {}) as Record<string, unknown>
  const str = (k: string) => (ad[k] != null && ad[k] !== "" ? String(ad[k]) : null)
  const bool = (k: string) => (ad[k] === true)

  const isFood = FOOD_KEYS.has(vendor.vendorType)
  const isNonprofit = vendor.vendorType === "nonprofit"
  const categoryLabel = VENDOR_TYPE_LABELS[vendor.vendorType] ?? vendor.vendorType
  const fee = VENDOR_FEES[vendor.vendorType] ?? 0
  const spaceSizes = SPACE_SIZES[vendor.vendorType]
  const spaces = str("spacesRequested")
  const spaceDim = spaces === "double" ? spaceSizes?.double : spaceSizes?.single
  const spaceLabel = spaces
    ? `${spaces === "double" ? "Double" : "Single"} — ${spaceDim} · $${spaces === "double" ? (fee * 2).toLocaleString() : fee.toLocaleString()}`
    : null

  const cookingEquipment = Array.isArray(ad.cookingEquipment)
    ? (ad.cookingEquipment as string[]).join(", ")
    : str("cookingEquipment")

  const signatureDate = str("signatureDate")

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-5xl mx-auto">
        <button onClick={() => setLocation("/vendors")} className="text-muted-foreground hover:text-primary text-sm flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to Vendors
        </button>

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-serif text-primary mb-1">{vendor.businessName}</h1>
            <p className="text-muted-foreground">{vendor.name}</p>
          </div>
          <div className="flex gap-3 items-center flex-wrap">
            {vendor.status === 'pending' && (
              <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-primary text-primary-foreground">Review Application</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Review Vendor</DialogTitle>
                    <DialogDescription>Approve or reject this application. Approving will send them an invite to the portal to pay.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Internal Note (Optional)</Label>
                      <Input value={reviewNote} onChange={e => setReviewNote(e.target.value)} placeholder="e.g., They requested a corner spot" />
                    </div>
                  </div>
                  <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="destructive" onClick={() => handleReview('rejected')}>Reject</Button>
                    <Button onClick={() => handleReview('approved')}>Approve Vendor</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            {vendor.status === 'paid' && (
              <Button onClick={handleFinalApprove} variant="default" className="bg-green-600 hover:bg-green-700 text-white">
                <CheckCircle2 className="w-4 h-4 mr-2" /> Final Approve
              </Button>
            )}

            <Dialog open={isSpotOpen} onOpenChange={setIsSpotOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="border-primary/20 hover:bg-primary/5 text-primary">
                  <MapPin className="w-4 h-4 mr-2" />
                  {vendor.spotNumber ? 'Edit Spot' : 'Assign Spot'}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Assign Location</DialogTitle>
                  <DialogDescription>Assign a physical spot for this vendor at the festival.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Spot Number</Label>
                    <Input value={spotNumber} onChange={e => setSpotNumber(e.target.value)} placeholder="e.g., A12" />
                  </div>
                  <div className="space-y-2">
                    <Label>Location / Zone</Label>
                    <Input value={locationName} onChange={e => setLocationName(e.target.value)} placeholder="e.g., Main Food Court" />
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
                  <DialogTitle>Delete this vendor record?</DialogTitle>
                  <DialogDescription>
                    This will permanently delete <strong>{vendor.businessName}</strong> ({vendor.name}) and all associated data. This cannot be undone.
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
                <Badge variant="outline" className="capitalize text-xs">{vendor.status.replace(/_/g, ' ')}</Badge>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Applied {new Date(vendor.createdAt).toLocaleString()}
                </span>
                {vendor.approvedAt && (
                  <span className="text-xs text-muted-foreground">Approved {new Date(vendor.approvedAt).toLocaleDateString()}</span>
                )}
              </div>

              {/* 4.1 Basic Information */}
              <SectionDivider title="4.1 Basic Information" />
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <Field label="Contact Name" value={vendor.name} />
                <Field label="Business / Organization Name" value={vendor.businessName} />
                <Field label="Email" value={vendor.email} />
                <Field label="Phone" value={vendor.phone} />
                <Field label="Website" value={str("website")} />
                <Field label="Facebook / Instagram" value={str("social")} />
              </div>

              {/* 4.2 Category */}
              <SectionDivider title="4.2 Vendor Category" />
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <Field label="Category" value={categoryLabel} />
              </div>

              {/* 4.3 Space */}
              <SectionDivider title="4.3 Space Requested" />
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <Field label="Spaces Requested" value={spaceLabel} />
              </div>

              {/* 4.4 Products & Business */}
              <SectionDivider title="4.4 Products & Business Information" />
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <Field label="Products / Services" value={str("productsDescription")} wide />
                <Field label="Business Description" value={str("businessDescription")} wide />
              </div>

              {/* 4.5 Booth & Operational */}
              <SectionDivider title="4.5 Booth & Operational Information" />
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <Field label="Setup Type" value={str("setupType")} />
                {str("setupType") === "Other (describe)" && (
                  <Field label="Setup Description" value={str("setupOther")} />
                )}
                {isFood && <Field label="Preparing Food On-Site" value={str("preparingFood")} />}
                {isFood && <Field label="Using Propane" value={str("usingPropane")} />}
                {isFood && str("usingPropane") === "Yes" && (
                  <>
                    <Field label="Propane Tanks (count)" value={str("propaneTanks")} />
                    <Field label="Propane Tank Size" value={str("propaneTankSize")} />
                  </>
                )}
                <Field label="Requires Electricity" value={str("requiresElectricity")} />
                {str("requiresElectricity") === "Yes" && (
                  <>
                    <Field label="Electricity Equipment" value={str("electricityEquipment")} />
                    <Field label="Total Amps Needed" value={str("electricityAmps")} />
                  </>
                )}
                {isFood && <Field label="Cooking Equipment" value={cookingEquipment} />}
                <Field label="Staff / Workers" value={str("staffCount")} />
                <Field label="Placement Requests" value={str("placementRequests")} />
                <Field label="Accessibility Needs" value={str("accessibilityNeeds")} />
              </div>

              {/* 4.6 Contacts */}
              <SectionDivider title="4.6 Contacts" />
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <Field label="Day-of Contact — Name" value={str("dayOfContactName")} />
                <Field label="Day-of Contact — Mobile" value={str("dayOfContactPhone")} />
                <Field label="Backup Contact — Name" value={str("backupContactName")} />
                <Field label="Backup Contact — Mobile" value={str("backupContactPhone")} />
              </div>

              {/* 4.7 Documents */}
              <SectionDivider title="4.7 Documents" />
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <Field label="Seller's Permit Number" value={str("sellerPermitNumber")} />
                {isNonprofit && <Field label="Employer Identification Number (EIN)" value={str("ein")} />}
                <Field
                  label="Document Acknowledgement"
                  value={bool("ack_documents") ? "Acknowledged — will email documents by 18 Sep 2026" : "Not acknowledged"}
                />
              </div>

              {/* 4.8 Additional Information */}
              <SectionDivider title="4.8 Additional Information" />
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <Field label="Participated Before" value={str("participatedBefore")} />
                {str("participatedBefore") === "Yes" && (
                  <Field label="Previous Year(s)" value={str("previousYears")} />
                )}
                <Field label="How They Heard About Us" value={str("heardAboutUs")} />
                <Field label="Additional Comments" value={str("additionalComments")} wide />
                <Field label="Marketing Consent" value={bool("marketingConsent") ? "Yes — consented" : "No"} />
              </div>

              {/* 4.10 / 4.11 Agreement & Signature */}
              <SectionDivider title="Vendor Agreement & Signature" />
              <div className="space-y-1">
                {Object.entries(ACK_LABELS)
                  .filter(([key]) => {
                    // food-only acks hidden for non-food categories
                    if ((key === "ack_foodCompliance") && !isFood) return false
                    return true
                  })
                  .map(([key, label]) => (
                    <AckCheck key={key} checked={bool(key)} label={label} />
                  ))
                }
              </div>

              {/* Signature */}
              {(vendor.agreementSignedName || vendor.agreementSigned) && (
                <div className="mt-4 pt-4 border-t space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Signature</p>
                  {vendor.agreementSignedName && (
                    <p className="font-serif text-xl text-foreground">{vendor.agreementSignedName}</p>
                  )}
                  {signatureDate && (
                    <p className="text-sm text-muted-foreground">Signed on {signatureDate}</p>
                  )}
                  {!vendor.agreementSignedName && vendor.agreementSigned && (
                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Agreement Signed</Badge>
                  )}
                </div>
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
                {vendor.spotNumber ? (
                  <div className="flex items-center gap-4 bg-primary/5 p-4 rounded-lg border border-primary/20">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg shrink-0">
                      {vendor.spotNumber}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{vendor.location}</p>
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
                  {vendor.agreementSigned ?
                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Signed</Badge> :
                    <Badge variant="secondary">Pending</Badge>
                  }
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Payment</span>
                  {vendor.paidAt ?
                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Paid {new Date(vendor.paidAt).toLocaleDateString()}</Badge> :
                    <Badge variant="secondary">Pending</Badge>
                  }
                </div>
                {vendor.reviewNote && (
                  <div className="pt-4 border-t">
                    <span className="text-xs font-medium text-muted-foreground block mb-1">Internal Note</span>
                    <p className="text-sm bg-yellow-50 p-2 text-yellow-900 rounded">{vendor.reviewNote}</p>
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

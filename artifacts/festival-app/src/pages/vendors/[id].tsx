import { useEffect, useState, useRef } from "react"
import { useLocation, useParams } from "wouter"
import { useGetVendor, useGetSettings, useReviewVendor, useUpdateVendorCategory, useSettleVendorCategoryAdjustment, useFinalApproveVendor, useAssignVendorSpot, getGetVendorQueryKey, getGetSettingsQueryKey, getGetSpecialAgreementSettlementSummaryQueryKey, useDeleteVendor, useResendVendorConfirmation, useUpdateSpecialAgreementSettlement, useUpdateVendorDetails } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { AdminLayout } from "@/components/layout/admin-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ArrowLeft, CheckCircle2, XCircle, MapPin, Clock, Trash2, Pencil, AlertTriangle, Mail } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { ApplicantDetailsEditorDialog, type ApplicantDetailsField } from "@/components/applicant-details-editor-dialog"

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
  ack_fireMarshal:       "Any tent larger than 10′×10′ requires Roseville Fire Marshal approval.",
  ack_loadIn:            "Assigned a load-in time with 30 minutes to unload; no vehicles on grounds after unloading.",
  ack_cleanBooth:        "Responsible for a clean booth and removing all trash before leaving the event.",
  ack_notResponsible:    "RCCS is not responsible for lost, stolen, or damaged property.",
  ack_rccsRight:         "RCCS reserves the right to approve, deny, or reclassify any application.",
  ack_documents:         "Required documents emailed to vendors@romaniancenter.org by 18 September 2026.",
  ack_styleGuidelines:   "Agreed to follow RCCS Romanian Festival style guidelines for signage, booth presentation, and promotional materials.",
}

const FOOD_KEYS = new Set(["major_food", "specialty_food"])
const VENDOR_DETAIL_FIELDS: ApplicantDetailsField[] = [
  { key: "name", label: "Contact name" },
  { key: "businessName", label: "Business / organization name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "website", label: "Website" },
  { key: "social", label: "Facebook / Instagram" },
  { key: "productsDescription", label: "Products / services", multiline: true },
  { key: "businessDescription", label: "Business description", multiline: true },
]

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

const formatCurrency = (value: number | null | undefined) =>
  value == null ? "—" : value.toLocaleString("en-US", { style: "currency", currency: "USD" })

const settlementStatusLabel: Record<string, string> = {
  awaiting_figures: "Awaiting figures",
  calculated: "Calculated",
  paid: "Paid",
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
  const { data: settings } = useGetSettings(
    { yearId: vendor?.yearId },
    { query: { enabled: !!vendor?.yearId, queryKey: getGetSettingsQueryKey({ yearId: vendor?.yearId }) } }
  )
  const reviewMutation = useReviewVendor({ mutation: { mutationKey: ["reviewVendor", id] } })
  const categoryMutation = useUpdateVendorCategory({ mutation: { mutationKey: ["updateVendorCategory", id] } })
  const settleAdjustmentMutation = useSettleVendorCategoryAdjustment({ mutation: { mutationKey: ["settleVendorCategoryAdjustment", id] } })
  const finalApproveMutation = useFinalApproveVendor({ mutation: { mutationKey: ["finalApproveVendor", id] } })
  const assignSpotMutation = useAssignVendorSpot({ mutation: { mutationKey: ["assignSpotVendor", id] } })
  const deleteMutation = useDeleteVendor()
  const resendMutation = useResendVendorConfirmation()
  const settlementMutation = useUpdateSpecialAgreementSettlement({ mutation: { mutationKey: ["updateSpecialAgreementSettlement", id] } })
  const detailsMutation = useUpdateVendorDetails({ mutation: { mutationKey: ["updateVendorDetails", id] } })

  const [reviewNote, setReviewNote] = useState("")
  const [spotNumber, setSpotNumber] = useState("")
  const [locationName, setLocationName] = useState("")
  const [isReviewOpen, setIsReviewOpen] = useState(false)
  const [isCategoryOpen, setIsCategoryOpen] = useState(false)
  const [isSpotOpen, setIsSpotOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState("")
  const [categoryReason, setCategoryReason] = useState("")
  const [settlementVendorId, setSettlementVendorId] = useState<number | null>(null)
  const [settlementForm, setSettlementForm] = useState({
    grossSales: "",
    deductions: "",
    deductionsNotes: "",
    amountPaid: "",
    paidDate: "",
    settlementNotes: "",
  })
  const [paymentReconciliation, setPaymentReconciliation] = useState<{
    oldAmount: number | null
    newAmount: number
    paymentAdjustment: { isPaid: boolean; direction: "collect" | "refund" | "none"; amount: number }
  } | null>(null)

  const reviewMutateFnRef = useRef(reviewMutation.mutate)
  reviewMutateFnRef.current = reviewMutation.mutate
  const finalApproveMutateFnRef = useRef(finalApproveMutation.mutate)
  finalApproveMutateFnRef.current = finalApproveMutation.mutate
  const assignSpotMutateFnRef = useRef(assignSpotMutation.mutate)
  assignSpotMutateFnRef.current = assignSpotMutation.mutate

  useEffect(() => {
    if (!vendor || vendor.vendorType !== "special_agreement" || settlementVendorId === vendor.id) return
    setSettlementVendorId(vendor.id)
    setSettlementForm({
      grossSales: vendor.specialAgreementGrossSales?.toString() ?? "",
      deductions: vendor.specialAgreementDeductions?.toString() ?? "",
      deductionsNotes: vendor.specialAgreementDeductionsNotes ?? "",
      amountPaid: vendor.specialAgreementAmountPaid?.toString() ?? "",
      paidDate: vendor.specialAgreementPaidDate ?? "",
      settlementNotes: vendor.specialAgreementSettlementNotes ?? "",
    })
  }, [vendor, settlementVendorId])

  const openCategoryDialog = (open: boolean) => {
    setIsCategoryOpen(open)
    if (open && vendor) {
      setSelectedCategory(vendor.vendorType)
      setCategoryReason("")
    }
  }

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

  const handleCategoryChange = () => {
    if (!vendor || selectedCategory === vendor.vendorType || categoryReason.trim().length < 3) return

    categoryMutation.mutate(
      { id, data: { vendorType: selectedCategory as "major_food" | "specialty_food" | "retail" | "nonprofit", reason: categoryReason.trim() } },
      {
        onSuccess: (data) => {
          queryClient.setQueryData(getGetVendorQueryKey(id), data.vendor)
          setIsCategoryOpen(false)
          const { paymentAdjustment } = data
          setPaymentReconciliation(paymentAdjustment.isPaid
            ? { oldAmount: data.oldAmount, newAmount: data.newAmount, paymentAdjustment }
            : null)
          const adjustmentMessage = paymentAdjustment.isPaid && paymentAdjustment.amount > 0
            ? paymentAdjustment.direction === "collect"
              ? `Collect ${paymentAdjustment.amount.toLocaleString("en-US", { style: "currency", currency: "USD" })} manually from this paid vendor.`
              : `Refund ${paymentAdjustment.amount.toLocaleString("en-US", { style: "currency", currency: "USD" })} manually to this paid vendor.`
            : "The vendor will receive their updated payment details."
          toast({ title: "Vendor category updated", description: adjustmentMessage })
        },
        onError: () => toast({ title: "Failed to update vendor category", variant: "destructive" })
      }
    )
  }

  const handleSaveDetails = (values: Record<string, string>) => {
    detailsMutation.mutate(
      {
        id,
        data: {
          name: values.name ?? "",
          businessName: values.businessName ?? "",
          email: values.email ?? "",
          phone: values.phone ?? "",
          website: values.website?.trim() || null,
          social: values.social?.trim() || null,
          productsDescription: values.productsDescription?.trim() || null,
          businessDescription: values.businessDescription?.trim() || null,
        },
      },
      {
        onSuccess: (data) => {
          queryClient.setQueryData(getGetVendorQueryKey(id), data)
          setIsDetailsOpen(false)
          toast({ title: "Vendor details updated" })
        },
        onError: () => toast({ title: "Failed to update vendor details", variant: "destructive" }),
      },
    )
  }

  const handleSettleCategoryAdjustment = () => {
    settleAdjustmentMutation.mutate(
      { id },
      {
        onSuccess: (data) => {
          queryClient.setQueryData(getGetVendorQueryKey(id), data)
          setPaymentReconciliation(null)
          toast({ title: "Manual adjustment marked handled" })
        },
        onError: () => toast({ title: "Unable to settle the manual adjustment", variant: "destructive" })
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

  const handleResend = () => {
    resendMutation.mutate(
      { id },
      {
        onSuccess: () => toast({ title: "Confirmation email resent successfully" }),
        onError: () => toast({ title: "Failed to resend confirmation email", variant: "destructive" }),
      }
    )
  }

  const handleSettlementSave = () => {
    if (!vendor) return
    const parseAmount = (value: string) => {
      if (value.trim() === "") return null
      const amount = Number(value)
      return Number.isFinite(amount) ? amount : undefined
    }
    const grossSales = parseAmount(settlementForm.grossSales)
    const deductions = parseAmount(settlementForm.deductions)
    const amountPaid = parseAmount(settlementForm.amountPaid)
    if (grossSales === undefined || deductions === undefined || amountPaid === undefined) {
      toast({ title: "Enter valid dollar amounts", variant: "destructive" })
      return
    }

    settlementMutation.mutate({
      id,
      data: {
        grossSales,
        deductions,
        deductionsNotes: settlementForm.deductionsNotes.trim() || null,
        amountPaid,
        paidDate: settlementForm.paidDate || null,
        settlementNotes: settlementForm.settlementNotes.trim() || null,
        expectedSettlementVersion: vendor.specialAgreementSettlementVersion ?? 0,
      },
    }, {
      onSuccess: (updated) => {
        queryClient.setQueryData(getGetVendorQueryKey(id), updated)
        queryClient.invalidateQueries({ queryKey: getGetSpecialAgreementSettlementSummaryQueryKey({ yearId: updated.yearId }) })
        toast({ title: "Settlement saved", description: "Calculated amounts and status have been updated." })
      },
      onError: () => toast({ title: "Could not save settlement", description: "Check the amounts, required deduction notes, and payment date.", variant: "destructive" }),
    })
  }

  if (isLoading) return <AdminLayout><div className="p-8">Loading...</div></AdminLayout>
  if (!vendor) return <AdminLayout><div className="p-8">Vendor not found.</div></AdminLayout>

  const ad = (vendor.applicationData ?? {}) as Record<string, unknown>
  const str = (k: string) => (ad[k] != null && ad[k] !== "" ? String(ad[k]) : null)
  const bool = (k: string) => (ad[k] === true)

  const isFood = FOOD_KEYS.has(vendor.vendorType)
  const isNonprofit = vendor.vendorType === "nonprofit"
  const isSpecialAgreement = vendor.vendorType === "special_agreement"
  const categoryLabel = isSpecialAgreement ? "Special Agreement Vendor" : (VENDOR_TYPE_LABELS[vendor.vendorType] ?? vendor.vendorType)
  const feeForCategory = (type: string) => {
    const settingKey = {
      major_food: "vendorPriceMajorFood",
      specialty_food: "vendorPriceSpecialtyFood",
      retail: "vendorPriceRetail",
      nonprofit: "vendorPriceNonprofit",
    }[type] as keyof typeof settings | undefined
    const configuredFee = settingKey ? Number(settings?.[settingKey]) : NaN
    return Number.isFinite(configuredFee) ? configuredFee : (VENDOR_FEES[type] ?? 0)
  }
  const fee = feeForCategory(vendor.vendorType)
  const spaceSizes = SPACE_SIZES[vendor.vendorType]
  const spaces = str("spacesRequested")
  const isDoubleSpace = spaces === "double"
  const currentAmount = isDoubleSpace ? fee * 2 : fee
  const selectedFee = feeForCategory(selectedCategory)
  const selectedAmount = isDoubleSpace ? selectedFee * 2 : selectedFee
  const selectedSpaceDimensions = selectedCategory
    ? SPACE_SIZES[selectedCategory]?.[isDoubleSpace ? "double" : "single"]
    : null
  const spaceDim = spaces === "double" ? spaceSizes?.double : spaceSizes?.single
  const spaceLabel = spaces
    ? `${spaces === "double" ? "Double" : "Single"} — ${spaceDim} · $${currentAmount.toLocaleString()}`
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
            <Button variant="outline" className="border-primary/20 hover:bg-primary/5 text-primary" onClick={() => setIsDetailsOpen(true)}>
              <Pencil className="w-4 h-4 mr-2" /> Edit details
            </Button>
            <ApplicantDetailsEditorDialog
              entityLabel="vendor"
              fields={VENDOR_DETAIL_FIELDS}
              initialValues={{
                name: vendor.name,
                businessName: vendor.businessName,
                email: vendor.email,
                phone: vendor.phone,
                website: str("website") ?? "",
                social: str("social") ?? "",
                productsDescription: str("productsDescription") ?? "",
                businessDescription: str("businessDescription") ?? "",
              }}
              open={isDetailsOpen}
              onOpenChange={setIsDetailsOpen}
              onSave={handleSaveDetails}
              isSaving={detailsMutation.isPending}
            />
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
                       <Label>A note from RCCS (optional)</Label>
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

            {!isSpecialAgreement && <Dialog open={isCategoryOpen} onOpenChange={openCategoryDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" className="border-primary/20 hover:bg-primary/5 text-primary">
                  <Pencil className="w-4 h-4 mr-2" /> Change Category
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Change vendor category</DialogTitle>
                  <DialogDescription>
                    Update this vendor’s category, booth dimensions, and amount due. RCCS records why each change was made.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="vendor-category">New category</Label>
                    <select
                      id="vendor-category"
                      value={selectedCategory}
                      onChange={(event) => setSelectedCategory(event.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    >
                      {Object.entries(VENDOR_TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                  {selectedCategory && selectedCategory !== vendor.vendorType && (
                    <div className="rounded-md border bg-muted/40 p-3 text-sm">
                      <p><span className="font-medium">Updated booth:</span> {selectedSpaceDimensions}</p>
                      <p><span className="font-medium">Updated amount due:</span> {selectedAmount.toLocaleString("en-US", { style: "currency", currency: "USD" })}</p>
                    </div>
                  )}
                  {vendor.paidAt && selectedCategory !== vendor.vendorType && (
                    <div role="alert" className="flex gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                      <div>
                        <p className="font-semibold">Manual payment adjustment required</p>
                        <p>
                          RCCS will verify the original Stripe payment when this change is saved, then show the exact manual amount to collect or refund.
                          {" "}No automatic charge, refund, or email will be sent.
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="category-reason">Reason for change</Label>
                    <Textarea
                      id="category-reason"
                      value={categoryReason}
                      onChange={(event) => setCategoryReason(event.target.value)}
                      placeholder="Explain why RCCS is correcting this category."
                      rows={4}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCategoryOpen(false)}>Cancel</Button>
                  <Button
                    onClick={handleCategoryChange}
                    disabled={selectedCategory === vendor.vendorType || categoryReason.trim().length < 3 || categoryMutation.isPending}
                  >
                    {categoryMutation.isPending ? "Saving…" : "Save Category Change"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>}

            {!isSpecialAgreement && vendor.pendingManualAdjustment != null && (
              <Button
                onClick={handleSettleCategoryAdjustment}
                variant="outline"
                disabled={settleAdjustmentMutation.isPending}
                className="border-amber-400 text-amber-900 hover:bg-amber-50"
              >
                <AlertTriangle className="w-4 h-4 mr-2" />
                {settleAdjustmentMutation.isPending ? "Recording…" : "Mark Manual Adjustment Handled"}
              </Button>
            )}

            {!isSpecialAgreement && vendor.status === 'paid' && (
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

            {!isSpecialAgreement && <Button
              variant="outline"
              className="border-primary/20 hover:bg-primary/5 text-primary"
              onClick={handleResend}
              disabled={resendMutation.isPending}
            >
              <Mail className="w-4 h-4 mr-2" />
              {resendMutation.isPending ? "Sending…" : "Resend Confirmation"}
            </Button>}

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

               {isSpecialAgreement ? (
                 <>
                   <SectionDivider title="Special Agreement Terms" />
                   <div className="rounded-md border border-violet-200 bg-violet-50/60 p-4">
                     <Badge variant="outline" className="border-violet-300 bg-white text-violet-800 mb-3">Special Agreement</Badge>
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                       <Field label="Operation Type" value={vendor.specialAgreementOperationType} />
                       <Field label="RCCS Revenue Share" value={vendor.specialAgreementRevenueSharePercentage != null ? `${vendor.specialAgreementRevenueSharePercentage}% of net profit` : null} />
                       <Field label="Internal Notes" value={vendor.specialAgreementInternalNotes} wide />
                     </div>
                   </div>
                   <SectionDivider title="Agreement Contacts" />
                   <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                     <Field label="Day-of Contact — Name" value={vendor.specialAgreementDayOfContactName} />
                     <Field label="Day-of Contact — Mobile" value={vendor.specialAgreementDayOfContactPhone} />
                     <Field label="Backup Contact — Name" value={vendor.specialAgreementBackupContactName} />
                     <Field label="Backup Contact — Mobile" value={vendor.specialAgreementBackupContactPhone} />
                   </div>
                   <SectionDivider title="Electronic Signature" />
                   {vendor.agreementSigned ? (
                     <div className="rounded-md bg-green-50 border border-green-200 p-4">
                       <p className="font-serif text-xl text-green-900">{vendor.agreementSignedName || "Agreement signed"}</p>
                       <p className="text-sm text-green-800 mt-1">
                         Signed {vendor.specialAgreementSignedDate ? new Date(`${vendor.specialAgreementSignedDate}T12:00:00`).toLocaleDateString() : ""}
                       </p>
                     </div>
                   ) : (
                     <p className="text-muted-foreground">The contact has not yet submitted the Special Agreement.</p>
                   )}
                    <SectionDivider title="Acknowledgements" />
                    <AckCheck
                      checked={(((vendor as { specialAgreementAcknowledgements?: Record<string, unknown> }).specialAgreementAcknowledgements ?? {}).ackStyleGuidelines === true)}
                      label="Agreed to follow RCCS Romanian Festival style guidelines for signage, booth presentation, and promotional materials."
                    />
                 </>
               ) : (
                 <>
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
                 <CardTitle className="text-xl">{isSpecialAgreement ? "Special Agreement" : "Legal & Payment"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                 {isSpecialAgreement ? (
                   <>
                     <div className="rounded-md border border-violet-200 bg-violet-50/60 p-3 text-sm text-violet-950">
                       <p className="font-semibold">No booth fee or Stripe payment</p>
                       <p className="mt-1">This vendor participates under a revenue-share agreement. Their normal spot assignment and festival logistics remain available.</p>
                     </div>
                     <div className="flex items-center justify-between">
                       <span className="text-sm font-medium">Agreement</span>
                       {vendor.agreementSigned ? <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Signed</Badge> : <Badge variant="secondary">Awaiting signature</Badge>}
                     </div>
                   </>
                 ) : (
                   <>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Amount Due</span>
                  <div className="text-right">
                    <span className="text-sm font-semibold text-foreground">
                      ${currentAmount.toLocaleString()}
                    </span>
                    {isDoubleSpace && (
                      <p className="text-xs text-muted-foreground">2 × ${fee.toLocaleString()}</p>
                    )}
                  </div>
                </div>
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
                {(paymentReconciliation?.paymentAdjustment.isPaid || vendor.pendingManualAdjustment != null) && (
                  <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                    <p className="font-semibold">Manual payment reconciliation</p>
                    <p className="mt-1">
                      {vendor.pendingManualAdjustment != null
                        ? <>
                            A {vendor.pendingManualAdjustment > 0 ? "collection" : "refund"} of {Math.abs(vendor.pendingManualAdjustment).toLocaleString("en-US", { style: "currency", currency: "USD" })} is awaiting manual handling.
                            {" "}After it is complete outside the app, use <strong>Mark Manual Adjustment Handled</strong> before changing this vendor’s category again.
                          </>
                        : <>
                            The vendor paid {paymentReconciliation?.oldAmount?.toLocaleString("en-US", { style: "currency", currency: "USD" })}.
                            {" "}Their corrected amount is {paymentReconciliation?.newAmount.toLocaleString("en-US", { style: "currency", currency: "USD" })}.
                            {paymentReconciliation?.paymentAdjustment.direction === "collect" && ` Collect ${paymentReconciliation.paymentAdjustment.amount.toLocaleString("en-US", { style: "currency", currency: "USD" })} manually.`}
                            {paymentReconciliation?.paymentAdjustment.direction === "refund" && ` Refund ${paymentReconciliation.paymentAdjustment.amount.toLocaleString("en-US", { style: "currency", currency: "USD" })} manually.`}
                            {paymentReconciliation?.paymentAdjustment.direction === "none" && " No payment adjustment is needed."}
                          </>}
                    </p>
                  </div>
                )}
                {vendor.reviewNote && (
                  <div className="pt-4 border-t">
                     <span className="text-xs font-medium text-muted-foreground block mb-1">Review Note</span>
                    <p className="text-sm bg-yellow-50 p-2 text-yellow-900 rounded">{vendor.reviewNote}</p>
                  </div>
                )}
                   </>
                 )}
              </CardContent>
            </Card>

             {isSpecialAgreement && (
               <Card className="border-t-4 border-t-violet-600">
                 <CardHeader>
                   <CardTitle className="text-xl">Vendor Settlement</CardTitle>
                   <p className="text-sm text-muted-foreground">All amounts record money RCCS owes this vendor after the festival.</p>
                 </CardHeader>
                 <CardContent className="space-y-4">
                   <div className="flex items-center justify-between rounded-md bg-violet-50 border border-violet-100 px-3 py-2">
                     <span className="text-sm font-medium">Settlement status</span>
                     <Badge className={vendor.specialAgreementSettlementStatus === "paid" ? "bg-green-100 text-green-800 hover:bg-green-100" : vendor.specialAgreementSettlementStatus === "calculated" ? "bg-blue-100 text-blue-800 hover:bg-blue-100" : "bg-amber-100 text-amber-900 hover:bg-amber-100"}>
                       {settlementStatusLabel[vendor.specialAgreementSettlementStatus ?? "awaiting_figures"]}
                     </Badge>
                   </div>

                   <div className="space-y-2">
                     <Label htmlFor="settlement-gross">Gross sales collected by RCCS</Label>
                     <Input id="settlement-gross" inputMode="decimal" type="number" min="0" step="0.01" placeholder="0.00" value={settlementForm.grossSales} onChange={(event) => setSettlementForm((form) => ({ ...form, grossSales: event.target.value }))} />
                   </div>
                   <div className="space-y-2">
                     <Label htmlFor="settlement-deductions">Deductions or costs</Label>
                     <Input id="settlement-deductions" inputMode="decimal" type="number" min="0" step="0.01" placeholder="0.00" value={settlementForm.deductions} onChange={(event) => setSettlementForm((form) => ({ ...form, deductions: event.target.value }))} />
                   </div>
                   <div className="space-y-2">
                     <Label htmlFor="settlement-deductions-notes">What deductions cover</Label>
                     <Textarea id="settlement-deductions-notes" rows={2} placeholder="Required whenever deductions are entered." value={settlementForm.deductionsNotes} onChange={(event) => setSettlementForm((form) => ({ ...form, deductionsNotes: event.target.value }))} />
                   </div>

                   <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                     <div className="flex justify-between gap-4 text-sm"><span className="text-muted-foreground">Net profit</span><span className="font-semibold">{formatCurrency(vendor.specialAgreementNetProfit)}</span></div>
                     <div className="flex justify-between gap-4 text-sm"><span className="text-muted-foreground">Agreed revenue share</span><span className="font-semibold">{vendor.specialAgreementRevenueSharePercentage ?? 0}%</span></div>
                     <div className="flex justify-between gap-4 border-t pt-2 text-sm"><span className="font-medium">Amount owed to vendor</span><span className="font-bold text-primary">{formatCurrency(vendor.specialAgreementAmountOwed)}</span></div>
                     <p className="text-xs text-muted-foreground">These values are calculated from the entered figures and cannot be edited directly.</p>
                   </div>

                   <div className="grid grid-cols-2 gap-3">
                     <div className="space-y-2">
                       <Label htmlFor="settlement-paid">Amount paid</Label>
                       <Input id="settlement-paid" inputMode="decimal" type="number" min="0" step="0.01" placeholder="0.00" value={settlementForm.amountPaid} onChange={(event) => setSettlementForm((form) => ({ ...form, amountPaid: event.target.value }))} />
                     </div>
                     <div className="space-y-2">
                       <Label htmlFor="settlement-paid-date">Date paid</Label>
                       <Input id="settlement-paid-date" type="date" value={settlementForm.paidDate} onChange={(event) => setSettlementForm((form) => ({ ...form, paidDate: event.target.value }))} />
                     </div>
                   </div>
                   <div className="flex justify-between gap-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                     <span className="font-medium text-amber-950">Outstanding balance</span>
                     <span className="font-bold text-amber-950">{formatCurrency(vendor.specialAgreementOutstandingBalance)}</span>
                   </div>
                   <div className="space-y-2">
                     <Label htmlFor="settlement-notes">Settlement notes</Label>
                     <Textarea id="settlement-notes" rows={3} placeholder="Optional internal notes about this settlement." value={settlementForm.settlementNotes} onChange={(event) => setSettlementForm((form) => ({ ...form, settlementNotes: event.target.value }))} />
                   </div>
                   <Button className="w-full" onClick={handleSettlementSave} disabled={settlementMutation.isPending}>
                     {settlementMutation.isPending ? "Saving settlement…" : "Save Settlement"}
                   </Button>
                 </CardContent>
               </Card>
             )}
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}

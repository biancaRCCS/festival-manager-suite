import { useState, useRef } from "react"
import { useParams } from "wouter"
import {
  useGetPortalInfo, useSignPortalAgreement, useCreatePortalCheckout,
  useSubmitSponsorDetails, getGetPortalInfoQueryKey,
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { Loader2, CheckCircle2, FileSignature, CreditCard, MapPin, Calendar, Clock, ClipboardList } from "lucide-react"

// ---------------------------------------------------------------------------
// Sponsor stage 2 detail form state
// ---------------------------------------------------------------------------
const EMPTY_STAGE2 = {
  onsiteContactName: "",
  onsiteContactPhone: "",
  boothDescription: "",
  electricalRequirements: "",
  specialRequests: "",
  logoUrl: "",
  ackPromoOnly: false,
}

export default function PortalPage() {
  const { token } = useParams()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data: portal, isLoading } = useGetPortalInfo(token || "", {
    query: { enabled: !!token, queryKey: getGetPortalInfoQueryKey(token || "") },
  })
  const signMutation = useSignPortalAgreement()
  const checkoutMutation = useCreatePortalCheckout()
  const submitDetailsMutation = useSubmitSponsorDetails()

  const [signedName, setSignedName] = useState("")
  const [stage2, setStage2] = useState(EMPTY_STAGE2)

  const signMutateFnRef = useRef(signMutation.mutate)
  signMutateFnRef.current = signMutation.mutate
  const checkoutMutateFnRef = useRef(checkoutMutation.mutate)
  checkoutMutateFnRef.current = checkoutMutation.mutate
  const submitDetailsMutateFnRef = useRef(submitDetailsMutation.mutate)
  submitDetailsMutateFnRef.current = submitDetailsMutation.mutate

  const handleSign = () => {
    if (!token || !signedName) return
    signMutateFnRef.current(
      { token, data: { signedName } },
      {
        onSuccess: (data) => {
          toast({ title: "Agreement signed" })
          queryClient.setQueryData(getGetPortalInfoQueryKey(token), data)
        },
        onError: () => toast({ title: "Failed to sign agreement", variant: "destructive" }),
      }
    )
  }

  const handleCheckout = () => {
    if (!token) return
    checkoutMutateFnRef.current(
      { token },
      {
        onSuccess: (data) => { window.location.href = data.checkoutUrl },
        onError: () => toast({ title: "Failed to create checkout session", variant: "destructive" }),
      }
    )
  }

  const handleSubmitDetails = () => {
    if (!token) return
    if (!stage2.ackPromoOnly) {
      toast({ title: "Please acknowledge the booth terms before submitting.", variant: "destructive" })
      return
    }
    submitDetailsMutateFnRef.current(
      { token, data: stage2 },
      {
        onSuccess: (data) => {
          toast({ title: "Details submitted — our team will review and be in touch." })
          queryClient.setQueryData(getGetPortalInfoQueryKey(token), data)
        },
        onError: () => toast({ title: "Failed to submit details", variant: "destructive" }),
      }
    )
  }

  const s2field = (key: keyof typeof stage2) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setStage2(prev => ({ ...prev, [key]: e.target.value }))

  if (isLoading) {
    return (
      <div className="min-h-screen bg-noise bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!portal) {
    return (
      <div className="min-h-screen bg-noise bg-background flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <h2 className="text-xl font-medium mb-2">Invalid Link</h2>
            <p className="text-muted-foreground">This portal link is invalid or has expired.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── Status helpers ──────────────────────────────────────────────────────
  const isSponsor = portal.type === "sponsor"

  // Sponsor-specific statuses
  const sponsorNeedsDetails  = isSponsor && portal.status === "approved"
  const sponsorDetailsUnder  = isSponsor && portal.status === "details_submitted"
  const sponsorCanPay        = isSponsor && (portal.status === "details_approved" || portal.status === "payment_pending")

  // Vendor: approved or payment_pending → show agreement + payment
  const vendorCanPay = !isSponsor && (portal.status === "approved" || portal.status === "payment_pending")

  // Show agreement + payment if: vendor (approved/payment_pending) OR sponsor (details_approved/payment_pending)
  const showAgreementAndPayment = vendorCanPay || sponsorCanPay

  const isPaid    = portal.status === "paid"
  const isFinal   = portal.status === "final_approved"

  // ── Amount calculation (vendors + sponsors at payment stage) ──────────
  const vendorTypePrice: Record<string, number | null | undefined> = {
    major_food:    portal.vendorPriceMajorFood,
    specialty_food: portal.vendorPriceSpecialtyFood,
    retail:        portal.vendorPriceRetail,
    nonprofit:     portal.vendorPriceNonprofit,
  }
  const sponsorTierPrice: Record<string, number | null | undefined> = {
    bronze:   portal.sponsorPriceBronze,
    silver:   portal.sponsorPriceSilver,
    gold:     portal.sponsorPriceGold,
    platinum: portal.sponsorPricePlatinum,
    diamond:  portal.sponsorPriceDiamond,
  }
  const tierMinAmount = sponsorTierPrice[portal.tier ?? "bronze"] ?? portal.sponsorPriceBronze ?? 0
  const baseAmount = portal.type === "vendor"
    ? (vendorTypePrice[portal.vendorType ?? "retail"] ?? portal.vendorPriceRetail ?? 0)
    : ((portal as any).sponsorshipAmount ?? tierMinAmount)
  const isDoubleSpace = portal.type === "vendor" && (portal as any).spacesRequested === "double"
  const amount = isDoubleSpace ? (baseAmount as number) * 2 : baseAmount

  const paymentDeadline = (portal as any).paymentDeadline as string | null

  return (
    <div className="min-h-screen bg-noise bg-background font-sans relative pb-20">
      <header className="bg-card border-b p-6 flex justify-between items-center shadow-sm relative z-20">
        <div className="flex items-center gap-3">
          <img
            src={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/festival-dancers.png`}
            alt="Romanian Festival – dancing figures logo"
            className="h-10 w-auto shadow-sm"
          />
          <span className="font-serif font-bold text-xl text-primary hidden sm:block">Romanian Festival</span>
        </div>
        <Badge variant="outline" className="text-sm px-3 py-1">
          {portal.festivalYear} Portal
        </Badge>
      </header>

      <main className="max-w-3xl mx-auto p-4 md:p-8 mt-8 relative z-10 space-y-8">
        <div className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-serif mb-2">
            Welcome, {portal.businessName || portal.orgName || portal.name}
          </h1>
          <p className="text-muted-foreground text-lg">
            Application Status:{" "}
            <Badge className="ml-2 capitalize">
              {portal.status.replace(/_/g, " ")}
            </Badge>
          </p>
        </div>

        {/* ── Sponsor stage 2: complete details ────────────────────────── */}
        {sponsorNeedsDetails && (
          <Card className="border-t-4 border-t-primary shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-primary" /> Complete Your Sponsorship Details
              </CardTitle>
              <CardDescription>
                Your application has been approved. Please fill in your operational details so we can finalise your participation. Once our team reviews your information, you will receive a separate email with payment instructions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>On-site Contact Name <span className="text-destructive">*</span></Label>
                  <Input
                    value={stage2.onsiteContactName}
                    onChange={s2field("onsiteContactName")}
                    placeholder="Name of person on-site during the festival"
                  />
                </div>
                <div className="space-y-2">
                  <Label>On-site Contact Phone <span className="text-destructive">*</span></Label>
                  <Input
                    value={stage2.onsiteContactPhone}
                    onChange={s2field("onsiteContactPhone")}
                    placeholder="Mobile number"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Booth Description / What You Will Display</Label>
                <Textarea
                  value={stage2.boothDescription}
                  onChange={s2field("boothDescription")}
                  placeholder="Describe what your organisation will display or promote at your booth"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Electrical Requirements</Label>
                <Input
                  value={stage2.electricalRequirements}
                  onChange={s2field("electricalRequirements")}
                  placeholder="e.g., None, 1× 110V outlet for laptop"
                />
              </div>

              <div className="space-y-2">
                <Label>Special Setup Requests</Label>
                <Textarea
                  value={stage2.specialRequests}
                  onChange={s2field("specialRequests")}
                  placeholder="Any special requests for setup, access, or location"
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>Logo URL (for marketing materials)</Label>
                <Input
                  value={stage2.logoUrl}
                  onChange={s2field("logoUrl")}
                  placeholder="https://your-organisation.com/logo.png"
                />
                <p className="text-xs text-muted-foreground">
                  Link to your organisation's logo (PNG or SVG preferred). You can also email it to{" "}
                  <a href="mailto:vendors@romaniancenter.org" className="text-primary underline">vendors@romaniancenter.org</a>.
                </p>
              </div>

              {/* Acknowledgement */}
              <div className="rounded-md border border-border bg-muted/30 p-4 space-y-2">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={stage2.ackPromoOnly}
                    onChange={e => setStage2(prev => ({ ...prev, ackPromoOnly: e.target.checked }))}
                    className="mt-1 h-4 w-4 rounded border-gray-300 accent-primary"
                  />
                  <span className="text-sm text-foreground">
                    I understand that my complimentary sponsor booth is for <strong>promotional purposes only</strong>, and that selling prepared food requires a separate vendor application and vendor fee.
                  </span>
                </label>
              </div>

              <Button
                onClick={handleSubmitDetails}
                disabled={
                  submitDetailsMutation.isPending ||
                  !stage2.onsiteContactName.trim() ||
                  !stage2.onsiteContactPhone.trim()
                }
                className="w-full"
                size="lg"
              >
                {submitDetailsMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting…</>
                ) : (
                  "Submit Details"
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── Sponsor details under review ─────────────────────────────── */}
        {sponsorDetailsUnder && (
          <Card className="border-t-4 border-t-blue-400 shadow-md">
            <CardContent className="p-8 text-center flex flex-col items-center">
              <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                <ClipboardList className="w-7 h-7 text-blue-600" />
              </div>
              <h3 className="text-xl font-serif text-blue-900 mb-2">Details Under Review</h3>
              <p className="text-blue-800 max-w-sm">
                Thank you for submitting your sponsorship details. Our team will review your information and email you with the next step — payment instructions — shortly.
              </p>
            </CardContent>
          </Card>
        )}

        {/* ── Agreement + Payment (vendors at approved, sponsors at details_approved) ── */}
        {showAgreementAndPayment && (
          <div className="space-y-6">
            {!portal.agreementSigned ? (
              <Card className="border-t-4 border-t-primary shadow-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileSignature className="w-5 h-5 text-primary" /> Step 1: Sign Agreement
                  </CardTitle>
                  <CardDescription>Please review and sign the terms for participating.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="p-4 bg-muted/50 rounded-md text-sm text-muted-foreground h-48 overflow-y-auto border border-border/50">
                    <h4 className="font-medium text-foreground mb-2">Terms and Conditions</h4>
                    <p>By signing this agreement, you confirm that you will abide by all festival rules and regulations...</p>
                    <p className="mt-2">Payment is non-refundable. You must arrive at least 2 hours prior to the event start time to set up your booth.</p>
                  </div>
                  <div className="space-y-3">
                    <Label>Type your full name to sign digitally</Label>
                    <div className="flex gap-4">
                      <Input
                        value={signedName}
                        onChange={e => setSignedName(e.target.value)}
                        placeholder={portal.name}
                        className="max-w-xs"
                      />
                      <Button onClick={handleSign} disabled={!signedName || signMutation.isPending}>
                        {signMutation.isPending ? "Signing..." : "Sign Agreement"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-t-4 border-t-green-500 shadow-md opacity-75">
                <CardContent className="p-6 flex items-center gap-4">
                  <CheckCircle2 className="w-8 h-8 text-green-500" />
                  <div>
                    <h3 className="font-medium text-lg">Agreement Signed</h3>
                    <p className="text-sm text-muted-foreground">Thank you for signing the terms.</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {portal.agreementSigned && (
              <Card className="border-t-4 border-t-primary shadow-md animate-in fade-in slide-in-from-bottom-4 duration-500">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-primary" /> Step 2: Payment
                  </CardTitle>
                  <CardDescription>
                    {isSponsor
                      ? "Complete your sponsorship payment to secure your place at the festival."
                      : "Pay your registration fee to secure your spot."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col md:flex-row items-center justify-between p-6 bg-muted/30 rounded-lg border">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Total Amount Due</p>
                      <p className="text-4xl font-serif text-foreground">${(amount as number).toLocaleString()}</p>
                      {isDoubleSpace && (
                        <p className="text-xs text-muted-foreground mt-1">Double space — 2 × ${(baseAmount as number).toLocaleString()}</p>
                      )}
                      {paymentDeadline && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Payment by {new Date(paymentDeadline + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} to be included in printed materials.
                        </p>
                      )}
                    </div>
                    <Button
                      onClick={handleCheckout}
                      size="lg"
                      disabled={checkoutMutation.isPending}
                      className="mt-4 md:mt-0 w-full md:w-auto"
                    >
                      {checkoutMutation.isPending ? "Redirecting..." : "Pay Securely via Stripe"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ── Paid / Final Approved ─────────────────────────────────────── */}
        {(isPaid || isFinal) && (
          <div className="space-y-6">
            <Card className="bg-green-50/50 border-green-200">
              <CardContent className="p-8 text-center flex flex-col items-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-2xl font-serif text-green-900 mb-2">Payment Confirmed</h3>
                <p className="text-green-800">
                  Your payment of ${(amount as number).toLocaleString()} was successful. We have received your application and agreement.
                </p>
              </CardContent>
            </Card>

            {isFinal ? (
              <Card className="border-t-4 border-t-secondary shadow-md">
                <CardHeader>
                  <CardTitle className="text-xl">Your Festival Details</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex gap-4">
                    <div className="mt-1"><Calendar className="w-5 h-5 text-muted-foreground" /></div>
                    <div>
                      <p className="font-medium">Event Date</p>
                      <p className="text-muted-foreground">
                        {new Date(portal.eventDate + "T12:00:00").toLocaleDateString("en-US", {
                          weekday: "long", year: "numeric", month: "long", day: "numeric",
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="mt-1"><MapPin className="w-5 h-5 text-muted-foreground" /></div>
                    <div>
                      <p className="font-medium">Location</p>
                      <p className="text-muted-foreground">{portal.location || "To be announced"}</p>
                    </div>
                  </div>
                  <div className="flex gap-4 md:col-span-2">
                    <div className="mt-1"><Clock className="w-5 h-5 text-muted-foreground" /></div>
                    <div>
                      <p className="font-medium">Assigned Spot</p>
                      <div className="mt-2 inline-block px-4 py-2 bg-secondary/10 border border-secondary/20 rounded-md">
                        <span className="font-serif text-xl text-secondary-foreground">{portal.spotNumber || "TBD"}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-6 text-center">
                  <p className="text-muted-foreground">Our team is finalizing the festival map. We will assign your spot shortly.</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </main>

      <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent pointer-events-none z-0"></div>
    </div>
  )
}

import { useState, useRef } from "react"
import { useParams } from "wouter"
import {
  useGetPortalInfo, useSignPortalAgreement, useCreatePortalCheckout,
  useSubmitSponsorDetails, useSubmitSpecialAgreement, getGetPortalInfoQueryKey, type PortalInfo,
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useToast } from "@/hooks/use-toast"
import {
  Loader2, CheckCircle2, FileSignature, CreditCard, MapPin, Calendar,
  Clock, ClipboardList, Mail,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Shared local helpers (styled to match the vendor application form)
// ---------------------------------------------------------------------------
function SectionHeading({ title }: { title: string }) {
  return (
    <div className="border-b border-border pb-2 mb-5">
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
    </div>
  )
}

function RequiredStar() {
  return <span className="text-destructive ml-0.5">*</span>
}

function FieldNote({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground mt-1.5 leading-snug">{children}</p>
}

function AckRow({
  id, checked, onChange, children,
}: { id: string; checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-primary flex-shrink-0"
      />
      <label htmlFor={id} className="text-sm text-foreground leading-snug cursor-pointer">
        {children}
      </label>
    </div>
  )
}

function StyleGuidelinesLink({ url }: { url: string | null | undefined }) {
  const isSafeUrl = !!url && (() => {
    try {
      return ["http:", "https:"].includes(new URL(url).protocol)
    } catch {
      return false
    }
  })()
  return isSafeUrl
    ? <a href={url!} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">style guidelines</a>
    : <>style guidelines</>
}

function YesNoRadio({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <RadioGroup value={value} onValueChange={onChange} className="flex gap-6 mt-1">
      {["Yes", "No"].map(opt => (
        <div key={opt} className="flex items-center gap-2">
          <RadioGroupItem value={opt} id={`${id}-${opt}`} />
          <Label htmlFor={`${id}-${opt}`} className="font-normal">{opt}</Label>
        </div>
      ))}
    </RadioGroup>
  )
}

const SPECIAL_AGREEMENT_ACKS = [
  ["ackRevenueShare", "I agree that RCCS will receive the stated percentage of net profit from this operation."],
  ["ackPermitsInsurance", "I am responsible for obtaining and maintaining all permits, licenses, certificates, and insurance required for my operation."],
  ["ackEquipment", "I am responsible for providing and safely operating all equipment, supplies, and staffing needed for my operation."],
  ["ackNoRunningWater", "I understand that running water is not provided at the event site."],
  ["ackPower", "I understand that standard electrical power is available only as arranged with RCCS and I will communicate my requirements in advance."],
  ["ackLoadInVehicles", "I will follow RCCS load-in instructions and will not keep vehicles in the event area during festival hours."],
  ["ackCleanUp", "I will keep my assigned area clean and remove all equipment, materials, and waste after the event."],
  ["ackPropertyLiability", "I accept responsibility for my property, equipment, staff, and operations and release RCCS from liability except where prohibited by law."],
  ["ackStyleGuidelines", "I agree to follow the Romanian Festival style guidelines provided by RCCS."],
] as const

function SpecialAgreementPortal({ portal, token }: { portal: PortalInfo; token: string }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const submitMutation = useSubmitSpecialAgreement()
  const [contacts, setContacts] = useState({
    dayOfContactName: portal.specialAgreementDayOfContactName ?? "",
    dayOfContactPhone: portal.specialAgreementDayOfContactPhone ?? "",
    backupContactName: portal.specialAgreementBackupContactName ?? "",
    backupContactPhone: portal.specialAgreementBackupContactPhone ?? "",
    signedName: "",
  })
  const [acks, setAcks] = useState<Record<(typeof SPECIAL_AGREEMENT_ACKS)[number][0], boolean>>({
    ackRevenueShare: false,
    ackPermitsInsurance: false,
    ackEquipment: false,
    ackNoRunningWater: false,
    ackPower: false,
    ackLoadInVehicles: false,
    ackCleanUp: false,
    ackPropertyLiability: false,
    ackStyleGuidelines: false,
  })
  const todayIso = new Date().toISOString().slice(0, 10)

  const submit = () => {
    if (Object.values(contacts).some((value) => !value.trim())) {
      toast({ title: "Please complete all contact and signature fields.", variant: "destructive" })
      return
    }
    if (Object.values(acks).some((value) => !value)) {
      toast({ title: "Please acknowledge every agreement requirement.", variant: "destructive" })
      return
    }
    submitMutation.mutate({ token, data: { ...contacts, ...acks, signedDate: todayIso } }, {
      onSuccess: (updated) => {
        queryClient.setQueryData(getGetPortalInfoQueryKey(token), updated)
        toast({ title: "Special Agreement submitted", description: "RCCS has been notified of your signed agreement." })
      },
      onError: () => toast({ title: "We could not submit your agreement. Please try again.", variant: "destructive" }),
    })
  }

  const eventDate = portal.eventDate
    ? new Date(`${portal.eventDate}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    : "To be announced"

  return (
    <div className="min-h-screen bg-noise bg-background font-sans pb-16">
      <header className="bg-card border-b px-6 py-5 shadow-sm">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <img src={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/festival-dancers.png`} alt="Romanian Festival" className="h-10 w-auto" />
          <div>
            <p className="font-serif font-bold text-xl text-primary">Romanian Festival</p>
            <p className="text-sm text-muted-foreground">Special Agreement Vendor Portal</p>
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
        <div className="text-center py-4">
          <Badge className="mb-3 bg-violet-700 hover:bg-violet-700">Special Agreement</Badge>
          <h1 className="text-3xl font-serif">{portal.businessName || portal.name}</h1>
          <p className="text-muted-foreground mt-2">Please review and electronically sign your festival participation agreement.</p>
        </div>

        {portal.agreementSigned ? (
          <Card className="border-t-4 border-t-green-500">
            <CardContent className="p-8 text-center">
              <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-4" />
              <h2 className="text-2xl font-serif text-green-900">Agreement Submitted</h2>
              <p className="text-green-800 mt-2">Thank you. RCCS has received your signed Special Agreement. There is no booth fee or online payment required.</p>
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 text-left text-sm">
                <div className="rounded border bg-muted/30 p-3"><p className="text-muted-foreground">Festival date</p><p className="font-medium">{eventDate}</p></div>
                <div className="rounded border bg-muted/30 p-3"><p className="text-muted-foreground">Assigned spot</p><p className="font-medium">{portal.spotNumber || "To be assigned"}</p></div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="border-t-4 border-t-primary">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><FileSignature className="w-5 h-5 text-primary" /> Agreement Summary</CardTitle>
                <CardDescription>Your participation is governed by this special revenue-share agreement, not a standard booth fee.</CardDescription>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-2 gap-4 text-sm">
                <div className="rounded-md bg-muted/40 p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Operation type</p><p className="font-medium mt-1">{portal.specialAgreementOperationType}</p></div>
                <div className="rounded-md bg-muted/40 p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">RCCS revenue share</p><p className="font-medium mt-1">{portal.specialAgreementRevenueSharePercentage}% of net profit</p></div>
                <div className="sm:col-span-2 rounded-md border border-primary/20 bg-primary/5 p-4">
                  <p className="font-medium text-primary">Net-profit definition</p>
                  <p className="mt-1 leading-relaxed">{portal.specialAgreementNetProfitDefinition || "The net-profit definition will be confirmed by RCCS."}</p>
                </div>
                <div className="sm:col-span-2 text-muted-foreground leading-relaxed">
                  <p><strong className="text-foreground">Event:</strong> {portal.festivalYear} · {eventDate}</p>
                  {portal.documentDeadline && <p><strong className="text-foreground">Documents due:</strong> {new Date(`${portal.documentDeadline}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Day-of Contacts</CardTitle><CardDescription>RCCS will use these numbers for festival-day coordination.</CardDescription></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  ["dayOfContactName", "Day-of contact name"], ["dayOfContactPhone", "Day-of contact mobile"],
                  ["backupContactName", "Backup contact name"], ["backupContactPhone", "Backup contact mobile"],
                ].map(([key, label]) => (
                  <div className="space-y-2" key={key}>
                    <Label htmlFor={key}>{label}<RequiredStar /></Label>
                    <Input id={key} value={contacts[key as keyof typeof contacts]} onChange={(e) => setContacts((current) => ({ ...current, [key]: e.target.value }))} />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Participation Requirements</CardTitle><CardDescription>Every item must be accepted before you can sign.</CardDescription></CardHeader>
              <CardContent className="divide-y divide-border">
                {SPECIAL_AGREEMENT_ACKS.map(([key, label]) => (
                  <AckRow key={key} id={key} checked={acks[key]} onChange={(checked) => setAcks((current) => ({ ...current, [key]: checked }))}>
                    {key === "ackStyleGuidelines"
                      ? <>I agree to follow the Romanian Festival <StyleGuidelinesLink url={portal.styleGuidelinesUrl} /> provided by RCCS for signage, booth presentation, and promotional materials, to help present a consistent festival identity.</>
                      : label}
                  </AckRow>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Electronic Signature</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="max-w-md space-y-2"><Label htmlFor="special-signature">Type your full name<RequiredStar /></Label><Input id="special-signature" className="font-serif text-lg" value={contacts.signedName} onChange={(e) => setContacts((current) => ({ ...current, signedName: e.target.value }))} placeholder="Full name as signature" /></div>
                <p className="text-sm text-muted-foreground">Date: <strong>{new Date(`${todayIso}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</strong></p>
                <p className="text-sm text-muted-foreground">By signing, you confirm that you have authority to enter this agreement and accept the requirements above.</p>
                <Button className="w-full h-12 text-base" onClick={submit} disabled={submitMutation.isPending}>
                  {submitMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting…</> : "Submit Signed Agreement"}
                </Button>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  )
}

const TIER_LABELS: Record<string, string> = {
  bronze: "Bronze", silver: "Silver", gold: "Gold",
  platinum: "Platinum", diamond: "Diamond",
}

// ---------------------------------------------------------------------------
// Stage 2 form state
// ---------------------------------------------------------------------------
const EMPTY_STAGE2 = {
  // Booth & operational (booth sponsors only)
  setupType: "",
  setupOther: "",
  requiresElectricity: "" as "" | "Yes" | "No",
  electricityEquipment: "",
  electricityAmps: "",
  staffCount: "",
  placementRequests: "",
  accessibilityNeeds: "",
  // Contacts (booth sponsors only)
  dayOfContactName: "",
  dayOfContactPhone: "",
  backupContactName: "",
  backupContactPhone: "",
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function PortalPage() {
  const { token } = useParams()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data: portal, isLoading } = useGetPortalInfo(token || "", {
    query: { enabled: !!token, queryKey: getGetPortalInfoQueryKey(token || "") },
  })
  const signMutation    = useSignPortalAgreement()
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

  const s2 = <K extends keyof typeof EMPTY_STAGE2>(key: K) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setStage2(prev => ({ ...prev, [key]: e.target.value }))

  const setS2 = <K extends keyof typeof EMPTY_STAGE2>(key: K, val: (typeof EMPTY_STAGE2)[K]) =>
    setStage2(prev => ({ ...prev, [key]: val }))

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
    if (!token || !portal) return

    const isBoothSponsor = portal.boothOrNameOnly === "Booth"
    const errors: string[] = []

    if (isBoothSponsor) {
      if (!stage2.setupType)              errors.push("Booth setup type is required.")
      if (!stage2.requiresElectricity)    errors.push("Please answer the electricity question.")
      if (!stage2.dayOfContactName.trim()) errors.push("Day-of on-site contact name is required.")
      if (!stage2.dayOfContactPhone.trim()) errors.push("Day-of on-site contact mobile is required.")
      if (!stage2.backupContactName.trim()) errors.push("Backup contact name is required.")
      if (!stage2.backupContactPhone.trim()) errors.push("Backup contact mobile is required.")
    }

    if (errors.length > 0) {
      toast({ title: errors[0], variant: "destructive" })
      return
    }

    submitDetailsMutateFnRef.current(
      { token, data: stage2 },
      {
        onSuccess: (data) => {
          queryClient.setQueryData(getGetPortalInfoQueryKey(token), data)
        },
        onError: () => toast({ title: "Failed to submit details. Please try again.", variant: "destructive" }),
      }
    )
  }

  // ── Loading / invalid ────────────────────────────────────────────────────
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

  if (portal.type === "special_agreement") {
    return <SpecialAgreementPortal portal={portal} token={token || ""} />
  }

  // ── Status helpers ───────────────────────────────────────────────────────
  const isSponsor = portal.type === "sponsor"
  const isInKindSponsor = isSponsor && portal.isInKind

  const sponsorNeedsDetails = isSponsor && portal.status === "approved"
  const sponsorDetailsUnder = isSponsor && portal.status === "details_submitted"

  // Sponsors pay at the time of their public application, not through the portal.
  const vendorCanPay = !isSponsor && (portal.status === "approved" || portal.status === "payment_pending")

  const showAgreementAndPayment = vendorCanPay

  const isPaid  = portal.status === "paid"
  const isFinal = isSponsor ? portal.status === "details_approved" : portal.status === "final_approved"

  // ── Amount ───────────────────────────────────────────────────────────────
  const vendorTypePrice: Record<string, number | null | undefined> = {
    major_food:     portal.vendorPriceMajorFood,
    specialty_food: portal.vendorPriceSpecialtyFood,
    retail:         portal.vendorPriceRetail,
    nonprofit:      portal.vendorPriceNonprofit,
  }
  const sponsorTierPrice: Record<string, number | null | undefined> = {
    bronze:   portal.sponsorPriceBronze,
    silver:   portal.sponsorPriceSilver,
    gold:     portal.sponsorPriceGold,
    platinum: portal.sponsorPricePlatinum,
    diamond:  portal.sponsorPriceDiamond,
  }
  const tierMinAmount = sponsorTierPrice[portal.tier ?? "bronze"] ?? portal.sponsorPriceBronze ?? 0
  const baseAmount    = portal.type === "vendor"
    ? (vendorTypePrice[portal.vendorType ?? "retail"] ?? portal.vendorPriceRetail ?? 0)
    : ((portal as any).sponsorshipAmount ?? tierMinAmount)
  const isDoubleSpace = portal.type === "vendor" && (portal as any).spacesRequested === "double"
  const amount        = isDoubleSpace ? (baseAmount as number) * 2 : baseAmount

  const paymentDeadline = portal.paymentDeadline

  // ── Sponsor stage 2 helpers ──────────────────────────────────────────────
  const isBoothSponsor   = portal.boothOrNameOnly === "Booth"
  const sponsorshipAmount = (portal as any).sponsorshipAmount as number | undefined
  const inKindValue = portal.inKindValue
  const tierLabel         = TIER_LABELS[portal.tier ?? ""] ?? portal.tier ?? ""

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
          <div className="text-muted-foreground text-lg">
            Application Status:{" "}
            <Badge className="ml-2 capitalize">
              {isInKindSponsor ? "In-kind contribution recorded" : portal.status.replace(/_/g, " ")}
            </Badge>
          </div>
        </div>

        {/* ── Sponsor stage 2: complete details ─────────────────────────── */}
        {sponsorNeedsDetails && (
          <Card className="border-t-4 border-t-primary shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-primary" />
                Complete Your Sponsorship Details
              </CardTitle>
              <CardDescription>
                Your application and {isInKindSponsor ? "in-kind contribution" : "payment"} have been accepted. Please complete the details below so we can
                finalise your participation. Once our team reviews your information, you will receive
                a confirmation email with next steps for the festival.
              </CardDescription>

              {/* Sponsorship summary */}
              <div className="mt-4 rounded-md bg-muted/50 border border-border px-5 py-4 flex flex-wrap gap-6 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Organisation</p>
                  <p className="font-medium text-foreground">{portal.orgName || portal.businessName || portal.name}</p>
                </div>
                {isInKindSponsor && (
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">In-kind contribution</p>
                    <p className="font-medium text-foreground">In-kind — valued at {inKindValue != null ? `$${inKindValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}{portal.inKindDescription ? `: ${portal.inKindDescription}` : ""}</p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Tier</p>
                  <p className="font-medium text-foreground">{tierLabel}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Sponsorship Amount</p>
                  <p className="font-medium text-foreground">
                    {sponsorshipAmount != null ? `$${sponsorshipAmount.toLocaleString()}` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Booth</p>
                  <p className="font-medium text-foreground">{portal.boothOrNameOnly ?? "—"}</p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-10">

              {/* ── Booth sections (booth sponsors only) ─────────────────── */}
              {isBoothSponsor && (
                <>
                  {/* Booth & Operational Information */}
                  <section>
                    <SectionHeading title="Booth & Operational Information" />
                    <div className="space-y-6">

                      {/* Setup type */}
                      <div className="space-y-1.5">
                        <Label>What type of setup will you have?<RequiredStar /></Label>
                        <RadioGroup
                          value={stage2.setupType}
                          onValueChange={v => setS2("setupType", v)}
                          className="flex flex-col gap-2 mt-1"
                        >
                          {["Standard 10′×10′ Tent", "Other (describe)"].map(opt => (
                            <div key={opt} className="flex items-center gap-2">
                              <RadioGroupItem value={opt} id={`setup-${opt}`} />
                              <Label htmlFor={`setup-${opt}`} className="font-normal">{opt}</Label>
                            </div>
                          ))}
                        </RadioGroup>
                        {stage2.setupType === "Other (describe)" && (
                          <Input
                            className="mt-2 max-w-md"
                            placeholder="Describe your setup"
                            value={stage2.setupOther}
                            onChange={s2("setupOther")}
                          />
                        )}
                        <FieldNote>
                          All sponsors receive a complimentary 10′×10′ promotional booth space. Only
                          10′×10′ pop-up tents are permitted. Any tent larger than 10′×10′ must be
                          approved by the Roseville Fire Marshal.
                        </FieldNote>
                      </div>

                      {/* Electricity */}
                      <div className="space-y-1">
                        <Label>Will you require electricity?<RequiredStar /></Label>
                        <YesNoRadio
                          id="requiresElectricity"
                          value={stage2.requiresElectricity}
                          onChange={v => setS2("requiresElectricity", v as "Yes" | "No")}
                        />
                        <FieldNote>
                          Electrical outlets are available in prime and VIP sponsor locations. Standard
                          locations do not have power access. Sponsors requiring power who are placed
                          in a standard location may need to supply their own generator.
                        </FieldNote>
                        {stage2.requiresElectricity === "Yes" && (
                          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4 pl-4 border-l-2 border-border">
                            <div className="space-y-1.5">
                              <Label htmlFor="electricityEquipment">Equipment requiring electricity</Label>
                              <Input
                                id="electricityEquipment"
                                placeholder="e.g. display lights, laptop, monitor"
                                value={stage2.electricityEquipment}
                                onChange={s2("electricityEquipment")}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="electricityAmps">Total amps needed</Label>
                              <Input
                                id="electricityAmps"
                                placeholder="e.g. 15A"
                                value={stage2.electricityAmps}
                                onChange={s2("electricityAmps")}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Staff count */}
                      <div className="space-y-1.5 max-w-xs">
                        <Label htmlFor="staffCount">
                          Number of staff / representatives at your booth{" "}
                          <span className="text-muted-foreground text-sm">(optional)</span>
                        </Label>
                        <Input
                          id="staffCount"
                          type="number"
                          min={1}
                          placeholder="e.g. 2"
                          value={stage2.staffCount}
                          onChange={s2("staffCount")}
                        />
                      </div>

                      {/* Placement & accessibility */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="space-y-1.5">
                          <Label htmlFor="placementRequests">
                            Special placement requests{" "}
                            <span className="text-muted-foreground text-sm">(optional)</span>
                          </Label>
                          <Input
                            id="placementRequests"
                            placeholder="e.g. near entrance, corner spot"
                            value={stage2.placementRequests}
                            onChange={s2("placementRequests")}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="accessibilityNeeds">
                            Accessibility needs{" "}
                            <span className="text-muted-foreground text-sm">(optional)</span>
                          </Label>
                          <Input
                            id="accessibilityNeeds"
                            placeholder="Any accessibility requirements"
                            value={stage2.accessibilityNeeds}
                            onChange={s2("accessibilityNeeds")}
                          />
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Contacts */}
                  <section>
                    <SectionHeading title="Contacts" />
                    <div className="space-y-6">
                      <div>
                        <p className="text-sm font-medium text-foreground mb-3">
                          Day-of on-site contact<RequiredStar />
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label htmlFor="dayOfContactName">Full name</Label>
                            <Input
                              id="dayOfContactName"
                              value={stage2.dayOfContactName}
                              onChange={s2("dayOfContactName")}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="dayOfContactPhone">Mobile number</Label>
                            <Input
                              id="dayOfContactPhone"
                              type="tel"
                              value={stage2.dayOfContactPhone}
                              onChange={s2("dayOfContactPhone")}
                            />
                          </div>
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground mb-3">
                          Backup contact<RequiredStar />
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label htmlFor="backupContactName">Full name</Label>
                            <Input
                              id="backupContactName"
                              value={stage2.backupContactName}
                              onChange={s2("backupContactName")}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="backupContactPhone">Mobile number</Label>
                            <Input
                              id="backupContactPhone"
                              type="tel"
                              value={stage2.backupContactPhone}
                              onChange={s2("backupContactPhone")}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Permits & Insurance */}
                  <section>
                    <SectionHeading title="Permits & Insurance" />
                    <p className="text-sm text-muted-foreground mb-4">
                      Sponsors are responsible for obtaining any licenses, permits, and insurance required for
                      their participation. Requirements may vary based on activities. RCCS will provide
                      applicable requirements prior to the event.
                    </p>
                  </section>
                </>
              )}

              {/* ── Logo & Marketing Materials (all sponsors) ───────────── */}
              <section>
                <SectionHeading title="Logo & Marketing Materials" />
                <div className="rounded-md bg-muted/40 border border-border p-4 flex gap-3">
                  <Mail className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-foreground leading-relaxed">
                    <p className="font-medium mb-1">Email your logo files to us</p>
                    <p className="text-muted-foreground">
                      Please email your logo files (PNG, SVG, or vector formats preferred) to{" "}
                      <a
                        href="mailto:vendors@romaniancenter.org"
                        className="text-primary underline underline-offset-2 font-medium"
                      >
                        vendors@romaniancenter.org
                      </a>{" "}
                      for use in festival marketing and signage. To be included in printed materials,
                      logos must be received by <strong>Monday, August 31, 2026</strong>.
                    </p>
                  </div>
                </div>
              </section>

              {/* Submit */}
              <Button
                onClick={handleSubmitDetails}
                disabled={submitDetailsMutation.isPending}
                className="w-full h-12 text-base"
                size="lg"
              >
                {submitDetailsMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting…</>
                ) : (
                  "Submit Sponsorship Details"
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── Sponsor details under review ──────────────────────────────── */}
        {sponsorDetailsUnder && (
          <Card className="border-t-4 border-t-blue-400 shadow-md">
            <CardContent className="p-8 text-center flex flex-col items-center">
              <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                <ClipboardList className="w-7 h-7 text-blue-600" />
              </div>
              <h3 className="text-xl font-serif text-blue-900 mb-2">Details Under Review</h3>
              <p className="text-blue-800 max-w-sm">
                Thank you for submitting your sponsorship details. Our team at RCCS will review your
                information and email you a confirmation shortly.
              </p>
            </CardContent>
          </Card>
        )}

        {/* ── Agreement + Payment ───────────────────────────────────────── */}
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
                          Payment by{" "}
                          {new Date(paymentDeadline + "T12:00:00").toLocaleDateString("en-US", {
                            month: "long", day: "numeric", year: "numeric",
                          })}{" "}
                          to be included in printed materials.
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
                <h3 className="text-2xl font-serif text-green-900 mb-2">{isInKindSponsor ? "In-kind Contribution Confirmed" : "Payment Confirmed"}</h3>
                <p className="text-green-800">
                  {isInKindSponsor
                    ? <>Your in-kind contribution{portal.inKindDescription ? ` (${portal.inKindDescription})` : ""} has been recorded. We have received your application and agreement.</>
                    : <>Your payment of ${(amount as number).toLocaleString()} was successful. We have received your application and agreement.</>}
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
                        <span className="font-serif text-xl text-secondary-foreground">
                          {portal.spotNumber || "TBD"}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-6 text-center">
                  <p className="text-muted-foreground">
                    Our team is finalizing the festival map. We will assign your spot shortly.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </main>

      <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent pointer-events-none z-0" />
    </div>
  )
}

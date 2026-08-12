import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useGetCurrentYear, useSubmitSponsorApplication } from "@workspace/api-client-react"
import { PublicLayout } from "@/components/layout/public-layout"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Check, Mail } from "lucide-react"
import { ApplicationDeadlineCountdown } from "@/components/application-deadline-countdown"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface SponsorTier {
  key: string
  label: string
  min: number
  max: number | null
  spotLimit: number
}

interface FormConfig {
  sponsorTiers: SponsorTier[]
  applicationDeadline: string | null
}

async function fetchSponsorConfig(): Promise<FormConfig> {
  const res = await fetch("/api/public/form-questions?type=sponsor")
  if (!res.ok) return { sponsorTiers: [], applicationDeadline: null }
  return res.json()
}

// ---------------------------------------------------------------------------
// Benefits table — exact text from section 5.0 of the spec.
// Columns ordered Diamond → Bronze (highest to lowest), matching the guide.
// ---------------------------------------------------------------------------
const TIER_KEYS_DESC = ["diamond", "platinum", "gold", "silver", "bronze"] as const

// Row label → [diamond, platinum, gold, silver, bronze]
const BENEFITS_ROWS: Array<{ label: string; asterisk?: boolean; values: [string, string, string, string, string] }> = [
  { label: "Availability",                                   values: ["3",               "5",                "10",              "10",           "10"]             },
  { label: "Booth space",                                    values: ["VIP location",    "Prime location",   "Prime location",  "Standard location", "Standard location"] },
  { label: "Recognition on RCCS & Festival websites",        values: ["Premier logo & link", "Prominent logo & link", "Logo & link", "Logo & link", "Name listing"] },
  { label: "Complimentary 10′×10′ promo booth space",        values: ["Included",        "Included",         "Included",        "Included",     "Included"]       },
  { label: "Logo on stage LED screen",  asterisk: true,      values: ["Premier display", "Prominent display","Standard display","Logo listing", "–"]              },
  { label: "Recognition in email campaigns",                 values: ["Premier placement","Prominent placement","Grouped logo", "Logo listing", "–"]              },
  { label: "Acknowledgment during the event",                values: ["Throughout event","Multiple mentions", "One mention",    "–",            "–"]              },
  { label: "Social-media recognition (pre & post)",          values: ["Dedicated feature","Dedicated post",  "Individual mention","–",          "–"]              },
  { label: "Company-provided banner near main stage",        values: ["Included",        "Included",         "–",               "–",            "–"]              },
  { label: "Additional on-site signage at key locations",    values: ["Premier logo",    "Prominent logo",   "–",               "–",            "–"]              },
  { label: "Post-event thank-you email & social post",       values: ["Premier mention", "Prominent mention","–",               "–",            "–"]              },
  { label: "Company logo on official event flyer", asterisk: true, values: ["Premier logo", "Prominent logo","–",              "–",            "–"]              },
  { label: "Reserved sponsor VIP area seating",              values: ["6 Seats",         "4 Seats",          "–",               "–",            "–"]              },
  { label: "Additional company-provided banner",             values: ["Included",        "–",                "–",               "–",            "–"]              },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmt(n: number) {
  return "$" + n.toLocaleString()
}

function tierRangeLabel(tier: SponsorTier) {
  return tier.max == null ? `${fmt(tier.min)} and above` : `${fmt(tier.min)} – ${fmt(tier.max)}`
}

function tierShortLabel(tier: SponsorTier) {
  return tier.max == null ? `${fmt(tier.min)}+` : `${fmt(tier.min)}+`
}

function findTierForAmount(amount: number, tiers: SponsorTier[]): SponsorTier | null {
  for (const t of tiers) {
    const withinMax = t.max == null ? true : amount <= t.max
    if (amount >= t.min && withinMax) return t
  }
  return null
}

function validateAmount(
  rawAmount: string,
  selectedTierKey: string,
  tiers: SponsorTier[]
): { ok: boolean; error?: string; parsedAmount?: number } {
  const n = parseFloat(rawAmount)
  if (!rawAmount.trim() || isNaN(n) || n <= 0) {
    return { ok: false, error: "Please enter a sponsorship amount." }
  }
  if (!Number.isInteger(n)) {
    return { ok: false, error: "Please enter a whole dollar amount (no cents)." }
  }
  const minBronze = tiers.find(t => t.key === "bronze")?.min ?? 750
  if (n < minBronze) {
    return { ok: false, error: `Sponsorship amounts start at ${fmt(minBronze)} (Bronze tier).` }
  }
  const matchedTier = findTierForAmount(n, tiers)
  const selectedTier = tiers.find(t => t.key === selectedTierKey)
  if (!matchedTier) {
    return { ok: false, error: "Please enter a valid sponsorship amount." }
  }
  if (matchedTier.key !== selectedTierKey) {
    const range = tierRangeLabel(matchedTier)
    const selRange = selectedTier ? tierRangeLabel(selectedTier) : ""
    return {
      ok: false,
      error: `An amount of ${fmt(n)} falls within the ${matchedTier.label} tier (${range}). Please select ${matchedTier.label} as your sponsorship tier, or enter an amount in the ${selectedTier?.label ?? "selected"} range (${selRange}).`,
    }
  }
  return { ok: true, parsedAmount: n }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function RequiredStar() {
  return <span className="text-destructive ml-0.5">*</span>
}

function SectionHeading({ title }: { title: string }) {
  return (
    <div className="border-b pb-2 mb-4">
      <h3 className="font-serif text-xl text-foreground">{title}</h3>
    </div>
  )
}

function BenefitsTable({ tiers }: { tiers: SponsorTier[] }) {
  // Map key → tier object for quick lookup; display order is Diamond → Bronze
  const tierMap = Object.fromEntries(tiers.map(t => [t.key, t]))
  const colTiers = TIER_KEYS_DESC.map(k => tierMap[k]).filter(Boolean) as SponsorTier[]

  if (colTiers.length === 0) return null

  return (
    <div className="space-y-6">
      {/* Why sponsor — verbatim from spec */}
      <blockquote className="border-l-4 border-secondary pl-5 py-1 text-muted-foreground text-sm leading-relaxed">
        Sponsors are featured across all of our outreach and marketing: our website, email
        campaigns, social media, printed materials, and on-site signage before, during, and
        after the festival. Vendor booths, by comparison, are not included in any outreach or
        marketing materials. If visibility for your brand matters to you, sponsorship is where
        it happens.
      </blockquote>

      {/* Benefits table */}
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="text-left px-4 py-3 font-medium text-foreground min-w-[220px]">Benefit</th>
              {colTiers.map(t => (
                <th key={t.key} className="px-4 py-3 text-center font-semibold text-foreground whitespace-nowrap min-w-[110px]">
                  <div>{t.label}</div>
                  <div className="text-xs font-normal text-muted-foreground mt-0.5">{tierShortLabel(t)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {BENEFITS_ROWS.map((row, i) => (
              <tr key={row.label} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                <td className="px-4 py-2.5 text-foreground leading-snug">
                  {row.label}{row.asterisk && <span className="text-muted-foreground"> *</span>}
                </td>
                {TIER_KEYS_DESC.map((key, ci) => {
                  const val = row.values[ci]
                  const isDash = val === "–"
                  const isIncluded = val === "Included" || val === "6 Seats" || val === "4 Seats"
                  return (
                    <td key={key} className="px-4 py-2.5 text-center">
                      {isDash
                        ? <span className="text-muted-foreground/40">–</span>
                        : isIncluded
                        ? <span className="text-green-700 font-medium">{val}</span>
                        : <span className="text-foreground">{val}</span>
                      }
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* VIP seating note — verbatim from spec */}
      <p className="text-sm text-muted-foreground leading-relaxed">
        Diamond includes six reserved seats and Platinum sponsorship includes four reserved seats
        in a designated 10′ × 10′ sponsor viewing area. Seating is separate from the sponsor booth
        and does not include food, beverages, parking, or other hospitality unless confirmed by RCCS.
      </p>

      {/* Production deadline note — verbatim from spec */}
      <p className="text-sm text-muted-foreground leading-relaxed">
        <span className="font-medium">*</span>{" "}
        Inclusion in printed or finalized promotional materials is subject to receipt of payment
        and approved logo files by Monday, August 31, 2026. Sponsorships confirmed after this
        deadline will receive remaining digital and on-site benefits where feasible.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Confirmation — exact text from spec
// ---------------------------------------------------------------------------
function ConfirmationMessage() {
  return (
    <div className="py-10 space-y-6 max-w-xl mx-auto">
      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
        <Check className="w-8 h-8 text-green-600" />
      </div>
      <div className="space-y-4">
        <p className="text-foreground leading-relaxed">
          Thank you for your interest in sponsoring the Romanian Festival. Someone from the Romanian
          Community Center of Sacramento will be in touch within one to two business days.
        </p>
        <p className="text-foreground leading-relaxed">
          If you have any questions in the meantime, please email us at{" "}
          <a
            href="mailto:vendors@romaniancenter.org"
            className="text-primary underline underline-offset-2 inline-flex items-center gap-1"
          >
            <Mail className="w-3.5 h-3.5" />
            vendors@romaniancenter.org
          </a>
          .
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function ApplySponsorPage() {
  const { toast } = useToast()

  const { data: currentYear, isLoading: yearLoading } = useGetCurrentYear()
  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ["sponsorFormConfig"],
    queryFn: fetchSponsorConfig,
  })

  const submitMutation = useSubmitSponsorApplication()
  const [submitted, setSubmitted] = useState(false)
  const [amountError, setAmountError] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: "",
    orgName: "",
    email: "",
    phone: "",
    tier: "",
    sponsorshipAmount: "",
    participatedBefore: "",
    orgDescription: "",
    boothOrNameOnly: "",
  })

  const tiers: SponsorTier[] = config?.sponsorTiers ?? []
  const selectedTier = tiers.find(t => t.key === form.tier)

  const set = (k: keyof typeof form, v: string) => {
    setForm(prev => ({ ...prev, [k]: v }))
    if (k === "tier" && form.sponsorshipAmount && tiers.length > 0) {
      const result = validateAmount(form.sponsorshipAmount, v, tiers)
      setAmountError(result.ok ? null : (result.error ?? null))
    }
  }

  const handleAmountBlur = () => {
    if (!form.sponsorshipAmount || !form.tier || tiers.length === 0) return
    const result = validateAmount(form.sponsorshipAmount, form.tier, tiers)
    setAmountError(result.ok ? null : (result.error ?? null))
  }

  const handleAmountChange = (v: string) => {
    setForm(prev => ({ ...prev, sponsorshipAmount: v }))
    if (amountError) setAmountError(null)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const errors: string[] = []
    if (!form.name.trim())        errors.push("Contact Name is required.")
    if (!form.orgName.trim())     errors.push("Organization / Business Name is required.")
    if (!form.email.trim())       errors.push("Email Address is required.")
    if (!form.phone.trim())       errors.push("Phone Number is required.")
    if (!form.tier)               errors.push("Please select a sponsorship tier.")
    if (!form.participatedBefore) errors.push("Please answer whether you have sponsored the festival before.")
    if (!form.boothOrNameOnly)    errors.push("Please indicate whether you want a booth or name-only sponsorship.")

    let parsedAmount: number | undefined
    if (!form.sponsorshipAmount.trim()) {
      errors.push("Sponsorship amount is required.")
    } else if (tiers.length > 0 && form.tier) {
      const result = validateAmount(form.sponsorshipAmount, form.tier, tiers)
      if (!result.ok) {
        setAmountError(result.error ?? null)
        errors.push(result.error ?? "Invalid sponsorship amount.")
      } else {
        parsedAmount = result.parsedAmount
      }
    } else {
      parsedAmount = parseFloat(form.sponsorshipAmount)
    }

    if (errors.length > 0) {
      toast({ title: errors[0], variant: "destructive" })
      return
    }

    submitMutation.mutate(
      {
        data: {
          name: form.name,
          orgName: form.orgName,
          email: form.email,
          phone: form.phone,
          tier: form.tier,
          sponsorshipAmount: parsedAmount,
          answers: {
            participatedBefore: form.participatedBefore,
            orgDescription: form.orgDescription,
            boothOrNameOnly: form.boothOrNameOnly,
            sponsorshipAmount: parsedAmount,
          },
        },
      },
      {
        onSuccess: () => setSubmitted(true),
        onError: () => toast({ title: "Failed to submit application. Please try again.", variant: "destructive" }),
      }
    )
  }

  const isLoading = yearLoading || configLoading

  return (
    <PublicLayout
      title="Sponsor Application"
      subtitle="Support the 2026 Romanian Festival — Saturday, 26 September 2026, Vernon Street Town Square, Roseville."
    >
      {config?.applicationDeadline && (
        <ApplicationDeadlineCountdown deadline={config.applicationDeadline} />
      )}

      {/* ── Benefits table — shown above form, hidden after submission ── */}
      {!submitted && (
        <div className="mb-8 space-y-4">
          <h2 className="font-serif text-2xl text-foreground">Sponsorship Tiers & Benefits</h2>
          {isLoading
            ? <div className="h-32 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            : <BenefitsTable tiers={tiers} />
          }
        </div>
      )}

      <Card className="border-t-4 border-t-secondary shadow-xl bg-card/95 backdrop-blur">
        <CardContent className="p-6 md:p-10">
          {isLoading ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-secondary" />
            </div>
          ) : !currentYear ? (
            <div className="text-center py-12">
              <h3 className="text-xl font-medium text-foreground mb-2">Applications Closed</h3>
              <p className="text-muted-foreground">We are not currently accepting sponsor applications.</p>
            </div>
          ) : submitted ? (
            <ConfirmationMessage />
          ) : (
            <form onSubmit={handleSubmit} className="space-y-10" noValidate>

              {/* ── Contact Information ── */}
              <section>
                <SectionHeading title="Contact Information" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Contact Name<RequiredStar /></Label>
                    <Input id="name" value={form.name} onChange={e => set("name", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="orgName">Organization / Business Name<RequiredStar /></Label>
                    <Input id="orgName" value={form.orgName} onChange={e => set("orgName", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email Address<RequiredStar /></Label>
                    <Input id="email" type="email" value={form.email} onChange={e => set("email", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="phone">Phone Number<RequiredStar /></Label>
                    <Input id="phone" type="tel" value={form.phone} onChange={e => set("phone", e.target.value)} />
                  </div>
                </div>
              </section>

              {/* ── Sponsorship Tier ── */}
              <section>
                <SectionHeading title="Sponsorship Tier" />
                <div className="space-y-2">
                  <Label>Select your tier<RequiredStar /></Label>
                  <RadioGroup
                    value={form.tier}
                    onValueChange={v => set("tier", v)}
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-1"
                  >
                    {/* Show Bronze → Diamond ascending for selection */}
                    {[...tiers].reverse().map(tier => (
                      <label
                        key={tier.key}
                        htmlFor={`tier-${tier.key}`}
                        className={`cursor-pointer rounded-md border p-4 transition-colors ${
                          form.tier === tier.key
                            ? "border-secondary bg-secondary/5"
                            : "border-border hover:border-secondary/40 hover:bg-muted/30"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <RadioGroupItem value={tier.key} id={`tier-${tier.key}`} />
                          <span className="font-semibold text-foreground">{tier.label}</span>
                        </div>
                        <p className="text-sm text-muted-foreground pl-6">{tierRangeLabel(tier)}</p>
                      </label>
                    ))}
                  </RadioGroup>
                </div>
              </section>

              {/* ── Sponsorship Amount ── */}
              <section>
                <SectionHeading title="Sponsorship Amount" />
                <div className="space-y-1.5 max-w-xs">
                  <Label htmlFor="sponsorshipAmount">
                    Sponsorship amount<RequiredStar />
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm select-none">$</span>
                    <Input
                      id="sponsorshipAmount"
                      type="number"
                      min={tiers.find(t => t.key === "bronze")?.min ?? 750}
                      step={1}
                      className="pl-7"
                      placeholder={
                        selectedTier
                          ? selectedTier.max != null
                            ? `${selectedTier.min} – ${selectedTier.max}`
                            : `${selectedTier.min} or more`
                          : "Select a tier first"
                      }
                      value={form.sponsorshipAmount}
                      onChange={e => handleAmountChange(e.target.value)}
                      onBlur={handleAmountBlur}
                    />
                  </div>
                  {selectedTier && !amountError && (
                    <p className="text-xs text-muted-foreground">
                      {selectedTier.key === "diamond"
                        ? `Enter any amount of ${fmt(selectedTier.min)} or more.`
                        : `Enter any whole-dollar amount from ${fmt(selectedTier.min)} to ${fmt(selectedTier.max!)}.`
                      }
                    </p>
                  )}
                  {amountError && (
                    <p className="text-sm text-destructive leading-snug">{amountError}</p>
                  )}
                </div>
              </section>

              {/* ── About Your Organization ── */}
              <section>
                <SectionHeading title="About Your Organization" />
                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <Label>Have you sponsored the Romanian Festival before?<RequiredStar /></Label>
                    <RadioGroup
                      value={form.participatedBefore}
                      onValueChange={v => set("participatedBefore", v)}
                      className="flex gap-6 mt-1"
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="Yes" id="pb-yes" />
                        <Label htmlFor="pb-yes" className="font-normal">Yes</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="No" id="pb-no" />
                        <Label htmlFor="pb-no" className="font-normal">No</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="orgDescription">
                      Describe your organization or business{" "}
                      <span className="text-muted-foreground text-sm">(optional)</span>
                    </Label>
                    <Textarea
                      id="orgDescription"
                      rows={4}
                      placeholder="Tell us about your organization, mission, and why you want to sponsor the Romanian Festival."
                      value={form.orgDescription}
                      onChange={e => set("orgDescription", e.target.value)}
                    />
                  </div>
                </div>
              </section>

              {/* ── Booth or Name Only ── */}
              <section>
                <SectionHeading title="Booth or Name-Only Sponsorship" />
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Every sponsorship tier includes a complimentary 10′×10′ promotional booth. This
                    booth is for visibility and promotion — it is not a vendor booth and does not
                    include the right to sell prepared food. If you prefer to be recognized as a
                    sponsor without operating a booth, select "Name only."
                  </p>
                  <RadioGroup
                    value={form.boothOrNameOnly}
                    onValueChange={v => set("boothOrNameOnly", v)}
                    className="flex flex-col sm:flex-row gap-4 mt-2"
                  >
                    <label
                      htmlFor="booth-booth"
                      className={`cursor-pointer flex items-start gap-3 rounded-md border p-4 flex-1 transition-colors ${
                        form.boothOrNameOnly === "booth"
                          ? "border-secondary bg-secondary/5"
                          : "border-border hover:border-secondary/40 hover:bg-muted/30"
                      }`}
                    >
                      <RadioGroupItem value="booth" id="booth-booth" className="mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium text-foreground">Booth at the festival</p>
                        <p className="text-sm text-muted-foreground">
                          I would like to operate a 10′×10′ promotional booth.
                        </p>
                      </div>
                    </label>
                    <label
                      htmlFor="booth-name"
                      className={`cursor-pointer flex items-start gap-3 rounded-md border p-4 flex-1 transition-colors ${
                        form.boothOrNameOnly === "name_only"
                          ? "border-secondary bg-secondary/5"
                          : "border-border hover:border-secondary/40 hover:bg-muted/30"
                      }`}
                    >
                      <RadioGroupItem value="name_only" id="booth-name" className="mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium text-foreground">Name-only sponsorship</p>
                        <p className="text-sm text-muted-foreground">
                          I prefer to be recognized as a sponsor without operating a booth.
                        </p>
                      </div>
                    </label>
                  </RadioGroup>
                </div>
              </section>

              {/* Submit */}
              <Button
                type="submit"
                className="w-full h-12 text-lg bg-secondary text-secondary-foreground hover:bg-secondary/90"
                disabled={submitMutation.isPending}
              >
                {submitMutation.isPending
                  ? <><Loader2 className="w-5 h-5 animate-spin mr-2" />Submitting…</>
                  : "Submit Sponsor Application"
                }
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </PublicLayout>
  )
}

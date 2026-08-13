import { useState } from "react"
import { useLocation } from "wouter"
import { useQuery } from "@tanstack/react-query"
import { useGetCurrentYear, useSubmitVendorApplication } from "@workspace/api-client-react"
import { PublicLayout } from "@/components/layout/public-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { Loader2, ExternalLink } from "lucide-react"
import { ApplicationDeadlineCountdown } from "@/components/application-deadline-countdown"

// ---------------------------------------------------------------------------
// Section 8 — Vendor category reference text
// ---------------------------------------------------------------------------
const CATEGORY_INFO: Record<string, {
  description: string
  examples: string
  characteristics: string
  notIncluded: string
  extra?: string
}> = {
  major_food: {
    description:
      "Designed for high-volume food vendors serving complete meals or operating large-scale prepared food service.",
    examples:
      "Romanian grill (mici / mititei) · Sarmale · Romanian barbecue · Traditional Romanian entrées · Multiple hot meal items · Full-service food vendors · Large food trucks · Large prepared food operations",
    characteristics:
      "Complete meal service · Multiple menu items · High customer volume · Larger staffing requirements · Expanded equipment (grills, smokers, fryers, trailers) · Larger booth footprint",
    notIncluded:
      "Coffee or espresso vendors · Ice cream or shaved ice · Beverage-only vendors · Dessert-focused vendors · Pastries or baked goods only · Packaged food products",
  },
  specialty_food: {
    description:
      "Designed for vendors offering specialty prepared foods, desserts, beverages, or limited-menu food items.",
    examples:
      "Coffee & espresso · Tea · Lemonade · Fresh juices · Smoothies · Boba tea · Ice cream · Shaved ice · Papanași · Romanian pastries · Cakes · Cookies · Crepes · Waffles · Funnel cakes · Specialty desserts · Langoș (limited-menu operation)",
    characteristics:
      "Limited food menu · Dessert or beverage focused · Specialty prepared foods · Standard booth footprint · Lower operational complexity than major food vendors",
    notIncluded:
      "Full Romanian entrée menus · Multiple hot meal stations · High-volume meal service · Large grill operations · Vendors serving complete meals as their primary offering",
    extra:
      "No more than 2 menu items. Alcoholic beverages are excluded from this category and are managed separately by RCCS.",
  },
  retail: {
    description:
      "Designed for vendors selling merchandise, handmade goods, packaged food products, or promoting a business or professional service.",
    examples:
      "Handmade crafts · Jewelry · Clothing & apparel · Romanian souvenirs · Home décor · Artwork · Pottery · Woodworking · Books · Gifts · Specialty imported goods · Packaged Romanian foods · Honey · Jams · Candies · Sealed baked goods · Insurance · Real estate · Financial services · Healthcare · Education · Home improvement · Technology · Professional services · Promotional businesses",
    characteristics:
      "Merchandise sales · Business promotion · Product demonstrations · No on-site food preparation or beverage service",
    notIncluded:
      "Food prepared or served on-site · Coffee or beverage service · Ice cream or shaved ice · Fresh desserts · Hot food vendors",
  },
  nonprofit: {
    description:
      "Designed for registered nonprofit organizations participating for community outreach, education, fundraising, or public service.",
    examples:
      "501(c)(3) organizations · Cultural organizations · Churches · Educational organizations · Museums · Youth organizations · Community service organizations · Public agencies · Humanitarian organizations",
    characteristics:
      "Community outreach · Education · Fundraising · Public service",
    notIncluded:
      "For-profit businesses · Commercial vendors · Vendors selling prepared food as their primary offering (may be reclassified as a food vendor)",
    extra:
      "Must provide a valid Employer Identification Number (EIN). RCCS may request documentation verifying nonprofit status.",
  },
}

const FOOD_KEYS = new Set(["major_food", "specialty_food"])

// Single/Double space dimensions per category
const SPACE_SIZES: Record<string, { single: string; double: string }> = {
  major_food:    { single: "10′×20′", double: "20′×20′" },
  specialty_food: { single: "10′×10′", double: "10′×20′" },
  retail:        { single: "10′×10′", double: "10′×20′" },
  nonprofit:     { single: "10′×10′", double: "10′×20′" },
}

const COOKING_EQUIPMENT_OPTIONS = ["None", "Grill", "Flat Top", "Fryer", "Smoker", "Generator", "Other"]

const HEARD_ABOUT_OPTIONS = [
  "Social media (Facebook, Instagram)",
  "Friend or family referral",
  "Romanian community",
  "RCCS newsletter or email",
  "Festival website",
  "Google search",
  "Flyer or poster",
  "Previous years' attendance",
  "Other",
]

interface VendorType {
  key: string
  label: string
  price: number
  booth: string
}

async function fetchFormConfig(): Promise<{ vendorTypes: VendorType[]; applicationDeadline: string | null }> {
  const res = await fetch(`/api/public/form-questions?type=vendor`)
  if (!res.ok) return { vendorTypes: [], applicationDeadline: null }
  return res.json()
}

interface FormData {
  // 4.1 Basic Info
  name: string; businessName: string; email: string; phone: string
  website: string; social: string
  // 4.2 Category
  vendorType: string
  // 4.3 Space
  spacesRequested: string
  // 4.4 Products
  productsDescription: string; businessDescription: string
  // 4.5 Booth & Operational
  setupType: string; setupOther: string
  preparingFood: string; usingPropane: string
  propaneTanks: string; propaneTankSize: string
  requiresElectricity: string
  electricityEquipment: string; electricityAmps: string
  cookingEquipment: string[]
  staffCount: string; placementRequests: string; accessibilityNeeds: string
  // 4.6 Contacts
  dayOfContactName: string; dayOfContactPhone: string
  backupContactName: string; backupContactPhone: string
  // 4.7 Documents
  sellerPermitNumber: string; ein: string; ack_documents: boolean
  // 4.8 Additional
  participatedBefore: string; previousYears: string
  heardAboutUs: string; heardAboutUsOther: string; additionalComments: string
  // 4.9 Marketing
  marketingConsent: boolean
  // 4.10 Acknowledgements
  ack_noGuarantee: boolean; ack_feesAfterApproval: boolean; ack_paymentDeadline: boolean
  ack_nonRefundable: boolean; ack_ownEquipment: boolean; ack_noWater: boolean
  ack_electricity: boolean; ack_permits: boolean; ack_foodCompliance: boolean
  ack_fireMarshal: boolean
  ack_loadIn: boolean; ack_cleanBooth: boolean; ack_notResponsible: boolean
  ack_rccsRight: boolean
  // 4.11 Signature
  signatureName: string
}

const INITIAL: FormData = {
  name: "", businessName: "", email: "", phone: "", website: "", social: "",
  vendorType: "", spacesRequested: "",
  productsDescription: "", businessDescription: "",
  setupType: "", setupOther: "", preparingFood: "", usingPropane: "",
  propaneTanks: "", propaneTankSize: "", requiresElectricity: "",
  electricityEquipment: "", electricityAmps: "", cookingEquipment: [],
  staffCount: "", placementRequests: "", accessibilityNeeds: "",
  dayOfContactName: "", dayOfContactPhone: "",
  backupContactName: "", backupContactPhone: "",
  sellerPermitNumber: "", ein: "", ack_documents: false,
  participatedBefore: "", previousYears: "", heardAboutUs: "", heardAboutUsOther: "", additionalComments: "",
  marketingConsent: false,
  ack_noGuarantee: false, ack_feesAfterApproval: false, ack_paymentDeadline: false,
  ack_nonRefundable: false, ack_ownEquipment: false, ack_noWater: false,
  ack_electricity: false, ack_permits: false, ack_foodCompliance: false,
  ack_fireMarshal: false,
  ack_loadIn: false, ack_cleanBooth: false, ack_notResponsible: false,
  ack_rccsRight: false,
  signatureName: "",
}

// ---------------------------------------------------------------------------
// Helper sub-components
// ---------------------------------------------------------------------------
function SectionHeading({ num, title }: { num: string; title: string }) {
  return (
    <div className="border-b pb-2 mb-4">
      <h3 className="font-serif text-xl text-foreground">
        <span className="text-muted-foreground text-sm font-sans font-normal mr-2">{num}</span>
        {title}
      </h3>
    </div>
  )
}

function RequiredStar() {
  return <span className="text-destructive ml-0.5">*</span>
}

function FieldNote({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground mt-1">{children}</p>
}

function YesNoRadio({
  id, value, onChange,
}: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <RadioGroup value={value} onValueChange={onChange} className="flex gap-6 mt-1">
      <div className="flex items-center gap-2">
        <RadioGroupItem value="Yes" id={`${id}-yes`} />
        <Label htmlFor={`${id}-yes`} className="font-normal">Yes</Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="No" id={`${id}-no`} />
        <Label htmlFor={`${id}-no`} className="font-normal">No</Label>
      </div>
    </RadioGroup>
  )
}

function AckRow({ id, checked, onChange, children }: {
  id: string; checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onChange(!!v)}
        className="mt-0.5 shrink-0"
      />
      <Label htmlFor={id} className="font-normal leading-snug cursor-pointer">{children}</Label>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function ApplyVendorPage() {
  const [, setLocation] = useLocation()
  const { toast } = useToast()

  const { data: currentYear, isLoading: yearLoading } = useGetCurrentYear()
  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ["vendorFormConfig"],
    queryFn: fetchFormConfig,
  })

  const submitMutation = useSubmitVendorApplication()
  const [form, setForm] = useState<FormData>(INITIAL)

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setForm(prev => ({ ...prev, [key]: value }))

  const toggleEquipment = (item: string) =>
    setForm(prev => {
      if (item === "None") {
        // toggling None clears everything else
        const already = prev.cookingEquipment.includes("None")
        return { ...prev, cookingEquipment: already ? [] : ["None"] }
      }
      // selecting any real item clears None
      const s = new Set(prev.cookingEquipment.filter(i => i !== "None"))
      s.has(item) ? s.delete(item) : s.add(item)
      return { ...prev, cookingEquipment: Array.from(s) }
    })

  const isFood = FOOD_KEYS.has(form.vendorType)
  const isNonprofit = form.vendorType === "nonprofit"
  const vendorTypes = config?.vendorTypes ?? []
  const selectedVt = vendorTypes.find(v => v.key === form.vendorType)
  const categoryInfo = CATEGORY_INFO[form.vendorType]
  const fee = selectedVt?.price ?? 0
  const submittedDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Required field checks
    const errors: string[] = []
    if (!form.name.trim())             errors.push("Contact Name is required")
    if (!form.businessName.trim())     errors.push("Business / Organization Name is required")
    if (!form.email.trim())            errors.push("Email Address is required")
    if (!form.phone.trim())            errors.push("Phone Number is required")
    if (!form.vendorType)              errors.push("Vendor Category is required")
    if (!form.spacesRequested)         errors.push("Number of spaces requested is required")
    if (!form.productsDescription.trim()) errors.push("Products / services description is required")
    if (!form.setupType)               errors.push("Booth setup type is required")
    if (isFood && !form.preparingFood) errors.push("'Preparing food on-site' answer is required")
    if (isFood && !form.usingPropane)  errors.push("'Using propane' answer is required")
    if (!form.requiresElectricity)     errors.push("'Requires electricity' answer is required")
    if (!form.dayOfContactName.trim()) errors.push("Day-of on-site contact name is required")
    if (!form.dayOfContactPhone.trim()) errors.push("Day-of on-site contact mobile is required")
    if (!form.backupContactName.trim()) errors.push("Backup contact name is required")
    if (!form.backupContactPhone.trim()) errors.push("Backup contact mobile is required")
    if (isNonprofit && !form.ein.trim()) errors.push("Employer Identification Number (EIN) is required for nonprofits")
    if (!form.ack_documents)           errors.push("You must acknowledge the document email requirement")
    if (!form.participatedBefore)      errors.push("Please answer whether you have participated before")
    // Acknowledgements
    if (!form.ack_noGuarantee)         errors.push("Please check all acknowledgements")
    if (!form.ack_feesAfterApproval)   errors.push("Please check all acknowledgements")
    if (!form.ack_paymentDeadline)     errors.push("Please check all acknowledgements")
    if (!form.ack_nonRefundable)       errors.push("Please check all acknowledgements")
    if (!form.ack_ownEquipment)        errors.push("Please check all acknowledgements")
    if (!form.ack_noWater)             errors.push("Please check all acknowledgements")
    if (!form.ack_electricity)         errors.push("Please check all acknowledgements")
    if (!form.ack_permits)             errors.push("Please check all acknowledgements")
    if (isFood && !form.ack_foodCompliance) errors.push("Please check all acknowledgements")
    if (!form.ack_fireMarshal)         errors.push("Please check all acknowledgements")
    if (!form.ack_loadIn)              errors.push("Please check all acknowledgements")
    if (!form.ack_cleanBooth)          errors.push("Please check all acknowledgements")
    if (!form.ack_notResponsible)      errors.push("Please check all acknowledgements")
    if (!form.ack_rccsRight)           errors.push("Please check all acknowledgements")
    if (!form.signatureName.trim())    errors.push("Typed signature is required")

    if (errors.length > 0) {
      // Show the first unique error
      const unique = [...new Set(errors)]
      toast({ title: unique[0], variant: "destructive" })
      return
    }

    const answers: Record<string, unknown> = {
      website: form.website,
      social: form.social,
      spacesRequested: form.spacesRequested,
      productsDescription: form.productsDescription,
      businessDescription: form.businessDescription,
      setupType: form.setupType,
      setupOther: form.setupOther,
      preparingFood: form.preparingFood,
      usingPropane: form.usingPropane,
      propaneTanks: form.propaneTanks,
      propaneTankSize: form.propaneTankSize,
      requiresElectricity: form.requiresElectricity,
      electricityEquipment: form.electricityEquipment,
      electricityAmps: form.electricityAmps,
      cookingEquipment: form.cookingEquipment,
      staffCount: form.staffCount,
      placementRequests: form.placementRequests,
      accessibilityNeeds: form.accessibilityNeeds,
      dayOfContactName: form.dayOfContactName,
      dayOfContactPhone: form.dayOfContactPhone,
      backupContactName: form.backupContactName,
      backupContactPhone: form.backupContactPhone,
      sellerPermitNumber: form.sellerPermitNumber,
      ein: form.ein,
      ack_documents: form.ack_documents,
      participatedBefore: form.participatedBefore,
      previousYears: form.previousYears,
      heardAboutUs: form.heardAboutUs === "Other" ? form.heardAboutUsOther : form.heardAboutUs,
      additionalComments: form.additionalComments,
      marketingConsent: form.marketingConsent,
      ack_noGuarantee: form.ack_noGuarantee,
      ack_feesAfterApproval: form.ack_feesAfterApproval,
      ack_paymentDeadline: form.ack_paymentDeadline,
      ack_nonRefundable: form.ack_nonRefundable,
      ack_ownEquipment: form.ack_ownEquipment,
      ack_noWater: form.ack_noWater,
      ack_electricity: form.ack_electricity,
      ack_permits: form.ack_permits,
      ack_foodCompliance: form.ack_foodCompliance,
      ack_fireMarshal: form.ack_fireMarshal,
      ack_loadIn: form.ack_loadIn,
      ack_cleanBooth: form.ack_cleanBooth,
      ack_notResponsible: form.ack_notResponsible,
      ack_rccsRight: form.ack_rccsRight,
      signatureName: form.signatureName,
      signatureDate: submittedDate,
    }

    submitMutation.mutate(
      { data: { name: form.name, businessName: form.businessName, email: form.email, phone: form.phone, vendorType: form.vendorType, answers } },
      {
        onSuccess: () => setLocation("/apply/success"),
        onError: () => toast({ title: "Failed to submit application. Please try again.", variant: "destructive" }),
      }
    )
  }

  const isLoading = yearLoading || configLoading

  return (
    <PublicLayout title="Vendor Application" subtitle="Apply for a booth at the 2026 Romanian Festival — Saturday, 26 September 2026.">
      {config?.applicationDeadline && (
        <ApplicationDeadlineCountdown deadline={config.applicationDeadline} />
      )}
      <Card className="border-t-4 border-t-primary shadow-xl bg-card/95 backdrop-blur">
        <CardContent className="p-6 md:p-10">
          {isLoading ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : !currentYear ? (
            <div className="text-center py-12">
              <h3 className="text-xl font-medium text-foreground mb-2">Applications Closed</h3>
              <p className="text-muted-foreground">We are not currently accepting vendor applications.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-10" noValidate>

              {/* ── 4.1 Basic Information ── */}
              <section>
                <SectionHeading num="4.1" title="Basic Information" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Contact Name<RequiredStar /></Label>
                    <Input id="name" value={form.name} onChange={e => set("name", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="businessName">Business / Organization Name<RequiredStar /></Label>
                    <Input id="businessName" value={form.businessName} onChange={e => set("businessName", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email Address<RequiredStar /></Label>
                    <Input id="email" type="email" value={form.email} onChange={e => set("email", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="phone">Phone Number<RequiredStar /></Label>
                    <Input id="phone" type="tel" value={form.phone} onChange={e => set("phone", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="website">Website <span className="text-muted-foreground text-sm">(optional)</span></Label>
                    <Input id="website" type="url" placeholder="https://" value={form.website} onChange={e => set("website", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="social">Facebook / Instagram <span className="text-muted-foreground text-sm">(optional)</span></Label>
                    <Input id="social" placeholder="@handle or page URL" value={form.social} onChange={e => set("social", e.target.value)} />
                  </div>
                </div>
              </section>

              {/* ── 4.2 Vendor Category ── */}
              <section>
                <SectionHeading num="4.2" title="Vendor Category" />
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="vendorType">Select your category<RequiredStar /></Label>
                    <Select value={form.vendorType} onValueChange={v => set("vendorType", v)}>
                      <SelectTrigger id="vendorType">
                        <SelectValue placeholder="— choose a category —" />
                      </SelectTrigger>
                      <SelectContent>
                        {vendorTypes.map(vt => (
                          <SelectItem key={vt.key} value={vt.key}>
                            {vt.label} — ${vt.price.toLocaleString()} · {vt.booth}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Category description — shown after selection */}
                  {categoryInfo && (
                    <div className="rounded-md border border-border bg-muted/40 p-4 space-y-3 text-sm">
                      <p className="text-foreground leading-relaxed">{categoryInfo.description}</p>
                      <div>
                        <p className="font-medium text-foreground mb-0.5">Examples</p>
                        <p className="text-muted-foreground">{categoryInfo.examples}</p>
                      </div>
                      <div>
                        <p className="font-medium text-foreground mb-0.5">Typical characteristics</p>
                        <p className="text-muted-foreground">{categoryInfo.characteristics}</p>
                      </div>
                      <div>
                        <p className="font-medium text-foreground mb-0.5">Not typically included</p>
                        <p className="text-muted-foreground">{categoryInfo.notIncluded}</p>
                      </div>
                      {categoryInfo.extra && (
                        <p className="text-muted-foreground italic">{categoryInfo.extra}</p>
                      )}
                    </div>
                  )}

                  {/* Vendor Category Review — always visible */}
                  <div className="rounded-md border border-border/60 bg-background p-4 text-sm space-y-2">
                    <p className="font-semibold text-foreground">Vendor Category Review</p>
                    <p className="text-muted-foreground">
                      Please select the category that best matches your primary products or services.
                    </p>
                    <p className="text-muted-foreground">
                      All applications are reviewed by the Romanian Community Center of Sacramento (RCCS).
                      RCCS reserves the right to assign or adjust your final vendor category based on your
                      proposed menu or products, booth footprint, equipment, operational requirements, and
                      the overall balance of the festival. If your category is adjusted, we will notify you
                      before any fees are due.
                    </p>
                    <p className="text-muted-foreground">
                      Submission of an application does not guarantee acceptance. Applications are reviewed
                      for product quality, cultural fit, menu duplication, operating capacity, safety, space
                      requirements, and the overall balance of the festival.
                    </p>
                  </div>
                </div>
              </section>

              {/* ── 4.3 Space ── */}
              <section>
                <SectionHeading num="4.3" title="Space" />
                <div className="space-y-1.5">
                  <Label>Number of spaces requested<RequiredStar /></Label>
                  <RadioGroup value={form.spacesRequested} onValueChange={v => set("spacesRequested", v)} className="flex flex-col sm:flex-row gap-4 mt-1">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="single" id="space-single" />
                      <Label htmlFor="space-single" className="font-normal">
                        Single space
                        {selectedVt && (
                          <span className="text-muted-foreground ml-1.5">
                            — {SPACE_SIZES[form.vendorType]?.single} · ${fee.toLocaleString()}
                          </span>
                        )}
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="double" id="space-double" />
                      <Label htmlFor="space-double" className="font-normal">
                        Double space
                        {selectedVt && (
                          <span className="text-muted-foreground ml-1.5">
                            — {SPACE_SIZES[form.vendorType]?.double} · ${(fee * 2).toLocaleString()} (2× fee)
                          </span>
                        )}
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              </section>

              {/* ── 4.4 Products & Business Information ── */}
              <section>
                <SectionHeading num="4.4" title="Products & Business Information" />
                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <Label htmlFor="productsDescription">
                      Describe the products or services you plan to offer<RequiredStar />
                    </Label>
                    <Textarea
                      id="productsDescription"
                      rows={5}
                      placeholder="Please provide as much detail as possible. Food vendors should include their proposed menu items."
                      value={form.productsDescription}
                      onChange={e => set("productsDescription", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="businessDescription">
                      Brief Business Description <span className="text-muted-foreground text-sm">(optional)</span>
                    </Label>
                    <Textarea
                      id="businessDescription"
                      rows={4}
                      placeholder="Tell us about your business. This information may be used for festival marketing if your application is approved."
                      value={form.businessDescription}
                      onChange={e => set("businessDescription", e.target.value)}
                    />
                  </div>
                </div>
              </section>

              {/* ── 4.5 Booth & Operational Information ── */}
              <section>
                <SectionHeading num="4.5" title="Booth & Operational Information" />
                <div className="space-y-6">

                  {/* Setup type */}
                  <div className="space-y-1.5">
                    <Label>What type of setup will you have?<RequiredStar /></Label>
                    <RadioGroup value={form.setupType} onValueChange={v => set("setupType", v)} className="flex flex-col gap-2 mt-1">
                      {["Standard 10′×10′ Tent", "Other (describe)"].map(opt => (
                        <div key={opt} className="flex items-center gap-2">
                          <RadioGroupItem value={opt} id={`setup-${opt}`} />
                          <Label htmlFor={`setup-${opt}`} className="font-normal">{opt}</Label>
                        </div>
                      ))}
                    </RadioGroup>
                    {form.setupType === "Other (describe)" && (
                      <Input
                        className="mt-2 max-w-md"
                        placeholder="Describe your setup"
                        value={form.setupOther}
                        onChange={e => set("setupOther", e.target.value)}
                      />
                    )}
                    <FieldNote>
                      Only 10′×10′ pop-up tents are permitted. Food trucks and food trailers are not allowed.
                      Major Food Vendors receive a 10′×20′ footprint, which may be used as two 10′×10′ tents
                      or a single tent within the larger space. Any tent larger than 10′×10′ must be approved
                      by the Roseville Fire Marshal, and it is the vendor's responsibility to obtain that approval.
                    </FieldNote>
                  </div>

                  {/* Food-only: preparing food on-site */}
                  {isFood && (
                    <div className="space-y-1">
                      <Label>Will you be preparing food on-site?<RequiredStar /></Label>
                      <YesNoRadio id="preparingFood" value={form.preparingFood} onChange={v => set("preparingFood", v)} />
                    </div>
                  )}

                  {/* Food-only: propane */}
                  {isFood && (
                    <div className="space-y-1">
                      <Label>Will you be using propane?<RequiredStar /></Label>
                      <YesNoRadio id="usingPropane" value={form.usingPropane} onChange={v => set("usingPropane", v)} />
                      {form.usingPropane === "Yes" && (
                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4 pl-4 border-l-2 border-border">
                          <div className="space-y-1.5">
                            <Label htmlFor="propaneTanks">Number of tanks</Label>
                            <Input id="propaneTanks" type="number" min={1} placeholder="e.g. 2" value={form.propaneTanks} onChange={e => set("propaneTanks", e.target.value)} />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="propaneTankSize">Tank size</Label>
                            <Input id="propaneTankSize" placeholder="e.g. 20 lb" value={form.propaneTankSize} onChange={e => set("propaneTankSize", e.target.value)} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Electricity */}
                  <div className="space-y-1">
                    <Label>Will you require electricity?<RequiredStar /></Label>
                    <YesNoRadio id="requiresElectricity" value={form.requiresElectricity} onChange={v => set("requiresElectricity", v)} />
                    <FieldNote>
                      Electrical outlets are available in prime and VIP sponsor locations only. Power is not
                      provided to standard vendor locations. Vendors requiring power should plan to supply
                      their own generator.
                    </FieldNote>
                    {form.requiresElectricity === "Yes" && (
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4 pl-4 border-l-2 border-border">
                        <div className="space-y-1.5">
                          <Label htmlFor="electricityEquipment">Equipment requiring electricity</Label>
                          <Input id="electricityEquipment" placeholder="e.g. display lights, refrigerator" value={form.electricityEquipment} onChange={e => set("electricityEquipment", e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="electricityAmps">Total amps needed</Label>
                          <Input id="electricityAmps" placeholder="e.g. 20A" value={form.electricityAmps} onChange={e => set("electricityAmps", e.target.value)} />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Cooking equipment — food categories only */}
                  {isFood && (
                    <div className="space-y-2">
                      <Label>Cooking equipment <span className="text-muted-foreground text-sm">(check all that apply)</span></Label>
                      <div className="flex flex-wrap gap-4 mt-1">
                        {COOKING_EQUIPMENT_OPTIONS.map(item => {
                          const noneSelected = form.cookingEquipment.includes("None")
                          const disabled = item !== "None" && noneSelected
                          return (
                            <div key={item} className="flex items-center gap-2">
                              <Checkbox
                                id={`equip-${item}`}
                                checked={form.cookingEquipment.includes(item)}
                                onCheckedChange={() => toggleEquipment(item)}
                                disabled={disabled}
                              />
                              <Label htmlFor={`equip-${item}`} className={`font-normal ${disabled ? "text-muted-foreground" : ""}`}>{item}</Label>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Staff count */}
                  <div className="space-y-1.5 max-w-xs">
                    <Label htmlFor="staffCount">Number of staff/workers in your booth <span className="text-muted-foreground text-sm">(optional)</span></Label>
                    <Input id="staffCount" type="number" min={1} placeholder="e.g. 3" value={form.staffCount} onChange={e => set("staffCount", e.target.value)} />
                  </div>

                  {/* Placement & accessibility */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-1.5">
                      <Label htmlFor="placementRequests">Special placement requests <span className="text-muted-foreground text-sm">(optional)</span></Label>
                      <Input id="placementRequests" placeholder="e.g. near entrance, corner spot" value={form.placementRequests} onChange={e => set("placementRequests", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="accessibilityNeeds">Accessibility needs <span className="text-muted-foreground text-sm">(optional)</span></Label>
                      <Input id="accessibilityNeeds" placeholder="Any accessibility requirements" value={form.accessibilityNeeds} onChange={e => set("accessibilityNeeds", e.target.value)} />
                    </div>
                  </div>
                </div>
              </section>

              {/* ── 4.6 Contacts ── */}
              <section>
                <SectionHeading num="4.6" title="Contacts" />
                <div className="space-y-6">
                  <div>
                    <p className="text-sm font-medium text-foreground mb-3">Day-of on-site contact<RequiredStar /></p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="dayOfContactName">Full name</Label>
                        <Input id="dayOfContactName" value={form.dayOfContactName} onChange={e => set("dayOfContactName", e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="dayOfContactPhone">Mobile number</Label>
                        <Input id="dayOfContactPhone" type="tel" value={form.dayOfContactPhone} onChange={e => set("dayOfContactPhone", e.target.value)} />
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground mb-3">Backup contact<RequiredStar /></p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="backupContactName">Full name</Label>
                        <Input id="backupContactName" value={form.backupContactName} onChange={e => set("backupContactName", e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="backupContactPhone">Mobile number</Label>
                        <Input id="backupContactPhone" type="tel" value={form.backupContactPhone} onChange={e => set("backupContactPhone", e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* ── 4.7 Required Documents ── */}
              <section>
                <SectionHeading num="4.7" title="Required Documents" />

                {/* Email instructions banner */}
                <div className="rounded-md border border-border bg-muted/40 p-4 text-sm space-y-2 mb-6">
                  <p className="font-semibold text-foreground">Required Documents</p>
                  <p className="text-muted-foreground">
                    Please email the documents below to{" "}
                    <a href="mailto:vendors@romaniancenter.org" className="text-primary underline underline-offset-2">
                      vendors@romaniancenter.org
                    </a>{" "}
                    by <strong> September 18th, 2026</strong>. Include your business name in the subject line.
                    Document uploads will be available directly in this form in future years.
                  </p>
                </div>

                <div className="space-y-6">
                  {/* Seller's Permit */}
                  <div className="space-y-1.5">
                    <Label htmlFor="sellerPermitNumber">
                      Seller's Permit Number <span className="text-muted-foreground text-sm">(required where applicable)</span>
                    </Label>
                    <Input id="sellerPermitNumber" className="max-w-sm" placeholder="Permit number" value={form.sellerPermitNumber} onChange={e => set("sellerPermitNumber", e.target.value)} />
                    <FieldNote>Email a copy of your seller's permit to vendors@romaniancenter.org by 18 September 2026.</FieldNote>
                  </div>

                  {/* Health Permit — food categories only */}
                  {isFood && (
                    <div className="rounded-md border border-border/60 p-4 space-y-2 bg-background">
                      <p className="text-sm font-medium text-foreground">Health Permit — food vendors</p>
                      <p className="text-sm text-muted-foreground">
                        Each vendor is responsible for obtaining their own Placer County health permit.
                        Email a copy to vendors@romaniancenter.org by 18 September 2026.
                      </p>
                      <a
                        href="https://www.placer.ca.gov/DocumentCenter/View/9479/Application-for-TFF-Food-Vendor-Authorization-PDF-Fillable-Form?bidId="
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-primary underline underline-offset-2"
                      >
                        Placer County TFF Food Vendor Authorization Form
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}

                  {/* Certificate of Insurance */}
                  <div className="rounded-md border border-border/60 p-4 space-y-3 bg-background text-sm">
                    <p className="font-semibold text-foreground">Certificate of Insurance</p>
                    <p className="text-muted-foreground">
                      All vendors must carry commercial general liability insurance of at least{" "}
                      <strong>$1,000,000 per occurrence</strong> and{" "}
                      <strong>$2,000,000 general aggregate</strong>.
                    </p>
                    <p className="text-muted-foreground">Your certificate must name as additional insured:</p>
                    <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                      <li><strong>Romanian Community Center of Sacramento Inc.</strong></li>
                      <li><strong>The City of Roseville, its officers, agents, employees and volunteers</strong></li>
                    </ul>
                    <p className="text-muted-foreground">
                      The certificate must be accompanied by an <strong>Additional Insured Endorsement</strong>{" "}
                      (form CG 20 12 07 98 or equivalent — a blanket endorsement or the relevant section of
                      your policy is acceptable). A statement on the certificate alone is <strong>not</strong> sufficient;
                      the City does not accept certificate statements in place of the endorsement document.
                    </p>
                    <p className="text-muted-foreground">
                      Also required: a <strong>Waiver of Subrogation Endorsement</strong>, a{" "}
                      <strong>Primary and Non-Contributory Coverage Endorsement</strong>, and a policy providing{" "}
                      <strong>30 days' notice of cancellation</strong>.
                    </p>
                    <p className="text-muted-foreground">
                      Vendors serving or selling alcohol must additionally carry{" "}
                      <strong>liquor liability coverage</strong> of $1,000,000 per occurrence and
                      $2,000,000 aggregate, primary and non-contributory.
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                      Email your certificate and endorsements to vendors@romaniancenter.org by 18 September 2026.
                    </p>
                  </div>

                  {/* Nonprofit EIN — nonprofit category only */}
                  {isNonprofit && (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="ein">Employer Identification Number (EIN)<RequiredStar /></Label>
                        <Input id="ein" className="max-w-sm" placeholder="XX-XXXXXXX" value={form.ein} onChange={e => set("ein", e.target.value)} />
                      </div>
                      <FieldNote>Email a copy of your IRS Determination Letter to vendors@romaniancenter.org by 18 September 2026.</FieldNote>
                    </div>
                  )}

                  {/* Document acknowledgement */}
                  <div className="pt-2">
                    <AckRow id="ack_documents" checked={form.ack_documents} onChange={v => set("ack_documents", v)}>
                      I understand I must email my required documents to{" "}
                      <strong>vendors@romaniancenter.org</strong> by{" "}
                      <strong>September 18th, 2026</strong>, and that my space may be released if they are not received.
                    </AckRow>
                  </div>
                </div>
              </section>

              {/* ── 4.8 Additional Information ── */}
              <section>
                <SectionHeading num="4.8" title="Additional Information" />
                <div className="space-y-5">
                  <div className="space-y-1">
                    <Label>Have you participated in the Romanian Festival before?<RequiredStar /></Label>
                    <YesNoRadio id="participatedBefore" value={form.participatedBefore} onChange={v => set("participatedBefore", v)} />
                    {form.participatedBefore === "Yes" && (
                      <div className="mt-2 pl-4 border-l-2 border-border">
                        <Label htmlFor="previousYears" className="text-sm">Approximate year(s)</Label>
                        <Input id="previousYears" className="mt-1 max-w-xs" placeholder="e.g. 2023, 2024" value={form.previousYears} onChange={e => set("previousYears", e.target.value)} />
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="heardAboutUs">How did you hear about us? <span className="text-muted-foreground text-sm">(optional)</span></Label>
                    <Select value={form.heardAboutUs} onValueChange={v => set("heardAboutUs", v)}>
                      <SelectTrigger id="heardAboutUs" className="max-w-sm">
                        <SelectValue placeholder="Select one" />
                      </SelectTrigger>
                      <SelectContent>
                        {HEARD_ABOUT_OPTIONS.map(opt => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {form.heardAboutUs === "Other" && (
                      <Input className="mt-2 max-w-sm" placeholder="Please specify" value={form.heardAboutUsOther} onChange={e => set("heardAboutUsOther", e.target.value)} />
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="additionalComments">Additional comments or special requests <span className="text-muted-foreground text-sm">(optional)</span></Label>
                    <Textarea id="additionalComments" rows={3} value={form.additionalComments} onChange={e => set("additionalComments", e.target.value)} />
                  </div>
                </div>
              </section>

              {/* ── 4.9 Marketing Consent ── */}
              <section>
                <SectionHeading num="4.9" title="Marketing Consent" />
                <AckRow id="marketingConsent" checked={form.marketingConsent} onChange={v => set("marketingConsent", v)}>
                  I consent to RCCS using my business name, logo, and description in festival marketing materials.
                </AckRow>
              </section>

              {/* ── 4.10 Vendor Agreement ── */}
              <section>
                <SectionHeading num="4.10" title="Vendor Agreement" />
                <p className="text-sm text-muted-foreground mb-3">
                  Each of the following must be acknowledged before submitting.<RequiredStar />
                </p>
                <div className="divide-y divide-border">
                  <AckRow id="ack_noGuarantee" checked={form.ack_noGuarantee} onChange={v => set("ack_noGuarantee", v)}>
                    I understand that submission of an application does not guarantee acceptance.
                  </AckRow>
                  <AckRow id="ack_feesAfterApproval" checked={form.ack_feesAfterApproval} onChange={v => set("ack_feesAfterApproval", v)}>
                    I understand vendor fees are due only after my application has been approved.
                  </AckRow>
                  <AckRow id="ack_paymentDeadline" checked={form.ack_paymentDeadline} onChange={v => set("ack_paymentDeadline", v)}>
                    I understand payment is due within 7 days of approval, and that my space may be released if payment is not received.
                  </AckRow>
                  <AckRow id="ack_nonRefundable" checked={form.ack_nonRefundable} onChange={v => set("ack_nonRefundable", v)}>
                    I understand booth fees are non-refundable after payment unless otherwise stated by RCCS.
                  </AckRow>
                  <AckRow id="ack_ownEquipment" checked={form.ack_ownEquipment} onChange={v => set("ack_ownEquipment", v)}>
                    I understand I am responsible for providing my own tent, tables, chairs, signage, and all other booth equipment unless otherwise approved by RCCS.
                  </AckRow>
                  <AckRow id="ack_noWater" checked={form.ack_noWater} onChange={v => set("ack_noWater", v)}>
                    I understand running water is not provided.
                  </AckRow>
                  <AckRow id="ack_electricity" checked={form.ack_electricity} onChange={v => set("ack_electricity", v)}>
                    I understand electrical outlets are available in prime and VIP sponsor locations only, and that I am responsible for my own power if required.
                  </AckRow>
                  <AckRow id="ack_permits" checked={form.ack_permits} onChange={v => set("ack_permits", v)}>
                    I understand I am responsible for obtaining all permits, licenses, insurance, and approvals required to operate at this event.
                  </AckRow>
                  {isFood && (
                    <AckRow id="ack_foodCompliance" checked={form.ack_foodCompliance} onChange={v => set("ack_foodCompliance", v)}>
                      I understand food vendors must comply with all applicable Placer County Health Department requirements.
                    </AckRow>
                  )}
                  <AckRow id="ack_fireMarshal" checked={form.ack_fireMarshal} onChange={v => set("ack_fireMarshal", v)}>
                    I understand that food trucks and food trailers are not permitted, and that any tent larger than 10′×10′ requires approval from the Roseville Fire Marshal, which I am responsible for obtaining.
                  </AckRow>
                  <AckRow id="ack_loadIn" checked={form.ack_loadIn} onChange={v => set("ack_loadIn", v)}>
                    I understand I will be assigned a load-in time, that I will have 30 minutes to unload, and that no vehicles may remain on the festival grounds. Vehicles must be moved to the free parking structure.
                  </AckRow>
                  <AckRow id="ack_cleanBooth" checked={form.ack_cleanBooth} onChange={v => set("ack_cleanBooth", v)}>
                    I understand I am responsible for maintaining a clean booth space and removing all trash before leaving the event.
                  </AckRow>
                  <AckRow id="ack_notResponsible" checked={form.ack_notResponsible} onChange={v => set("ack_notResponsible", v)}>
                    I understand RCCS is not responsible for lost, stolen, or damaged property.
                  </AckRow>
                  <AckRow id="ack_rccsRight" checked={form.ack_rccsRight} onChange={v => set("ack_rccsRight", v)}>
                    I understand RCCS reserves the right to approve, deny, or reclassify any application based on the overall needs of the festival.
                  </AckRow>
                </div>
              </section>

              {/* ── 4.11 Signature ── */}
              <section>
                <SectionHeading num="4.11" title="Signature" />
                <div className="space-y-4">
                  <div className="space-y-1.5 max-w-sm">
                    <Label htmlFor="signatureName">Type your full name<RequiredStar /></Label>
                    <Input
                      id="signatureName"
                      className="font-serif text-lg"
                      placeholder="Full name as signature"
                      value={form.signatureName}
                      onChange={e => set("signatureName", e.target.value)}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Date: <strong>{submittedDate}</strong>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    By typing your name above, you certify that all information provided is accurate, and
                    that you have read and agree to all terms set out in this application.
                  </p>
                </div>
              </section>

              {/* Submit */}
              <Button
                type="submit"
                className="w-full h-12 text-lg"
                disabled={submitMutation.isPending}
              >
                {submitMutation.isPending ? (
                  <><Loader2 className="w-5 h-5 animate-spin mr-2" />Submitting…</>
                ) : (
                  "Submit Vendor Application"
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </PublicLayout>
  );
}

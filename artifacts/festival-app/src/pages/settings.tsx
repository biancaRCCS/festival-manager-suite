import { useState, useEffect, useRef, useCallback } from "react"
import { useGetCurrentYear, useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { AdminLayout } from "@/components/layout/admin-layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Save, Plus, Trash2, GripVertical, ImageIcon, X, Send, AlertTriangle, CheckCircle, Server, MailX } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { FestivalSettings, FormQuestion } from "@workspace/api-client-react"

// Vendor categories: key → booth size (static, not editable)
const VENDOR_CATEGORIES = [
  { key: "MajorFood",     booth: "10′ × 20′" },
  { key: "SpecialtyFood", booth: "10′ × 10′" },
  { key: "Retail",        booth: "10′ × 10′" },
  { key: "Nonprofit",     booth: "10′ × 10′" },
] as const

// Sponsor tiers in display order (lowest → highest)
const SPONSOR_TIERS = ["Bronze", "Silver", "Gold", "Platinum", "Diamond"] as const

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data: currentYear } = useGetCurrentYear()
  const { data: settings, isLoading } = useGetSettings(
    { yearId: currentYear?.id },
    { query: { enabled: !!currentYear, queryKey: getGetSettingsQueryKey({ yearId: currentYear?.id }) } }
  )

  const updateMutation = useUpdateSettings()
  const updateMutateFnRef = useRef(updateMutation.mutate)
  updateMutateFnRef.current = updateMutation.mutate

  const [localSettings, setLocalSettings] = useState<Partial<FestivalSettings>>({})
  const initialized = useRef(false)
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false)

  // Email status (Resend)
  const [smtpStatus, setSmtpStatus] = useState<{
    configured: boolean;
    from: string | null;
    apiKeyHint: string | null;
  } | null>(null)

  // Email failure log
  const [emailFailures, setEmailFailures] = useState<{ id: number; message: string; createdAt: string }[]>([])

  useEffect(() => {
    fetch("/api/settings/email-status")
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setSmtpStatus(data) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/dashboard/email-failures`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.items) setEmailFailures(data.items) })
      .catch(() => {})
  }, [])

  const handleSendTestEmail = useCallback(async () => {
    setIsSendingTestEmail(true)
    try {
      const res = await fetch("/api/settings/test-email", { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: "Failed to send test email", description: data.error ?? "Unknown error", variant: "destructive" })
      } else {
        toast({ title: "Test email sent", description: `Check the inbox for ${data.sentTo}` })
      }
    } catch {
      toast({ title: "Failed to send test email", description: "Network error — check server logs", variant: "destructive" })
    } finally {
      setIsSendingTestEmail(false)
    }
  }, [toast])

  useEffect(() => {
    if (settings && !initialized.current) {
      setLocalSettings(settings)
      initialized.current = true
    }
  }, [settings])

  const set = (key: keyof FestivalSettings, value: unknown) =>
    setLocalSettings(prev => ({ ...prev, [key]: value }))

  const handleSave = () => {
    if (!currentYear?.id) return
    updateMutateFnRef.current(
      { data: localSettings },
      {
        onSuccess: (data) => {
          toast({ title: "Settings saved successfully" })
          queryClient.setQueryData(getGetSettingsQueryKey({ yearId: currentYear.id }), data)
        },
        onError: () => toast({ title: "Failed to save settings", variant: "destructive" })
      }
    )
  }

  // ── Question editor (shared across form tabs) ─────────────────────────────
  const QuestionEditor = ({ formType, questions }: { formType: 'vendor' | 'sponsor' | 'volunteer', questions: FormQuestion[] }) => {
    const key = `${formType}FormQuestions` as keyof FestivalSettings

    const updateQuestion = (id: string, updates: Partial<FormQuestion>) => {
      const newQs = questions.map(q => q.id === id ? { ...q, ...updates } : q)
      setLocalSettings(prev => ({ ...prev, [key]: newQs }))
    }
    const removeQuestion = (id: string) => {
      const newQs = questions.filter(q => q.id !== id)
      setLocalSettings(prev => ({ ...prev, [key]: newQs }))
    }
    const addQuestion = () => {
      const newQ: FormQuestion = { id: `q_${Date.now()}`, label: "New Question", type: "text", required: false }
      setLocalSettings(prev => ({ ...prev, [key]: [...questions, newQ] }))
    }

    return (
      <div className="space-y-4">
        {questions.map((q) => (
          <div key={q.id} className="flex gap-4 items-start p-4 border rounded-md bg-background shadow-sm">
            <div className="pt-2 cursor-move text-muted-foreground"><GripVertical className="w-5 h-5" /></div>
            <div className="flex-1 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Label</Label>
                  <Input value={q.label} onChange={e => updateQuestion(q.id, { label: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={q.type} onValueChange={(v: any) => updateQuestion(q.id, { type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Short Text</SelectItem>
                      <SelectItem value="textarea">Long Text</SelectItem>
                      <SelectItem value="select">Dropdown Select</SelectItem>
                      <SelectItem value="checkbox">Checkbox</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch checked={q.required} onCheckedChange={(c) => updateQuestion(q.id, { required: c })} />
                  <Label className="text-xs">Required</Label>
                </div>
                {q.type === 'select' && (
                  <div className="flex-1">
                    <Input
                      placeholder="Comma-separated options"
                      value={q.options?.join(", ") || ""}
                      onChange={e => updateQuestion(q.id, { options: e.target.value.split(",").map(s => s.trim()) })}
                    />
                  </div>
                )}
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => removeQuestion(q.id)} className="text-destructive hover:bg-destructive/10">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
        <Button onClick={addQuestion} variant="outline" className="w-full border-dashed">
          <Plus className="w-4 h-4 mr-2" /> Add Question
        </Button>
      </div>
    )
  }

  // ── Table header helper ───────────────────────────────────────────────────
  const TH = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
    <div className={`text-xs font-semibold text-muted-foreground uppercase tracking-wide py-1 ${className}`}>
      {children}
    </div>
  )

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-4">
          <div>
            <h1 className="text-3xl font-serif text-primary mb-2">Festival Settings</h1>
            <p className="text-muted-foreground">
              Configure pricing, limits, and application forms for {currentYear?.eventName || 'the festival'}.
            </p>
          </div>
          <Button onClick={handleSave} disabled={updateMutation.isPending || isLoading} className="shrink-0 bg-primary">
            <Save className="w-4 h-4 mr-2" /> Save Settings
          </Button>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground">Loading settings…</div>
        ) : (
          <Tabs defaultValue="general" className="w-full">
            <TabsList className="grid w-full grid-cols-4 mb-6">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="vendor_form">Vendor Form</TabsTrigger>
              <TabsTrigger value="sponsor_form">Sponsor Form</TabsTrigger>
              <TabsTrigger value="volunteer_form">Volunteer Form</TabsTrigger>
            </TabsList>

            {/* ── GENERAL TAB ─────────────────────────────────────────────── */}
            <TabsContent value="general" className="space-y-6">

              {/* Festival Dates & Settings */}
              <Card>
                <CardHeader>
                  <CardTitle>Festival Dates &amp; Settings</CardTitle>
                  <CardDescription>Key dates and operational settings for the 2026 festival.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>Festival Date</Label>
                    <Input
                      type="date"
                      value={localSettings.festivalDate ?? ""}
                      onChange={e => set("festivalDate", e.target.value || null)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Application Deadline</Label>
                    <Input
                      type="date"
                      value={localSettings.applicationDeadline ?? ""}
                      onChange={e => set("applicationDeadline", e.target.value || null)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Document Deadline</Label>
                    <Input
                      type="date"
                      value={localSettings.documentDeadline ?? ""}
                      onChange={e => set("documentDeadline", e.target.value || null)}
                    />
                    <p className="text-xs text-muted-foreground">Deadline for emailed permits, certificates, and licenses.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Payment Window (days after approval)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={localSettings.paymentWindowDays ?? 7}
                      onChange={e => set("paymentWindowDays", Number(e.target.value))}
                    />
                    <p className="text-xs text-muted-foreground">Vendors must pay within this many days of approval.</p>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Notification Email</Label>
                    <div className="flex gap-2">
                      <Input
                        type="email"
                        value={localSettings.notificationEmail ?? ""}
                        onChange={e => set("notificationEmail", e.target.value || null)}
                        placeholder="vendors@romaniancenter.org"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isSendingTestEmail || !localSettings.notificationEmail}
                        onClick={handleSendTestEmail}
                        className="shrink-0"
                      >
                        <Send className="w-4 h-4 mr-2" />
                        {isSendingTestEmail ? "Sending…" : "Send Test Email"}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">All new vendor, sponsor, and volunteer applications are emailed here.</p>
                  </div>

                  {/* Email status row */}
                  <div className="md:col-span-2">
                    <Label className="mb-2 block">Email Sending Account</Label>
                    {smtpStatus === null ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Server className="w-4 h-4 shrink-0" />
                        <span>Loading…</span>
                      </div>
                    ) : smtpStatus.configured ? (
                      <div className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                        <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-green-600" />
                        <span>
                          Sending via Resend as <strong>{smtpStatus.from}</strong>
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2 rounded-md border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-yellow-600" />
                        <span>No API key configured — set <code className="font-mono text-xs">RESEND_API_KEY</code> to enable email delivery.</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Email Delivery Failures */}
              {emailFailures.length > 0 && (
                <Card className="border-red-200">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <MailX className="w-5 h-5 text-red-600 shrink-0" />
                      <CardTitle className="text-red-700">Email Delivery Failures (last 30 days)</CardTitle>
                    </div>
                    <CardDescription>
                      {emailFailures.length === 1
                        ? "1 email failed to deliver."
                        : `${emailFailures.length} emails failed to deliver.`}{" "}
                      Check your Resend API key and use the test button above to verify delivery is working.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border border-red-100 overflow-hidden text-sm">
                      {emailFailures.map((f, idx) => (
                        <div
                          key={f.id}
                          className={`px-4 py-3 ${idx % 2 === 0 ? "bg-red-50/50" : "bg-white"}`}
                        >
                          <div className="flex justify-between gap-4 items-start">
                            <span className="text-red-800 break-all">{f.message}</span>
                            <span className="text-xs text-muted-foreground shrink-0 mt-0.5">
                              {new Date(f.createdAt).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Vendor Categories */}
              <Card>
                <CardHeader>
                  <CardTitle>Vendor Categories</CardTitle>
                  <CardDescription>
                    Spot targets are soft — a full category never blocks an application. Counts are visible to admins only;
                    availability is never shown to applicants.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Table — 4 columns */}
                  <div className="grid grid-cols-[1fr_100px_90px_80px] gap-x-4 gap-y-2 items-center min-w-0">
                    <TH>Category Label</TH>
                    <TH className="text-right">Fee ($)</TH>
                    <TH className="text-center">Spot Target</TH>
                    <TH>Booth</TH>

                    {VENDOR_CATEGORIES.map(({ key, booth }) => {
                      const labelField  = `vendorTypeLabel${key}` as keyof FestivalSettings
                      const priceField  = `vendorPrice${key}`     as keyof FestivalSettings
                      const limitField  = `vendorSpotLimit${key}` as keyof FestivalSettings
                      return (
                        <>
                          <Input
                            key={`${key}-label`}
                            value={(localSettings[labelField] as string) ?? ""}
                            onChange={e => set(labelField, e.target.value)}
                            className="text-sm"
                          />
                          <Input
                            key={`${key}-price`}
                            type="number"
                            min={0}
                            value={(localSettings[priceField] as number) ?? 0}
                            onChange={e => set(priceField, Number(e.target.value))}
                            className="text-right text-sm"
                          />
                          <Input
                            key={`${key}-limit`}
                            type="number"
                            min={0}
                            value={(localSettings[limitField] as number) ?? 0}
                            onChange={e => set(limitField, Number(e.target.value))}
                            className="text-center text-sm"
                          />
                          <span key={`${key}-booth`} className="text-sm text-muted-foreground whitespace-nowrap">{booth}</span>
                        </>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Sponsor Tiers */}
              <Card>
                <CardHeader>
                  <CardTitle>Sponsor Tiers</CardTitle>
                  <CardDescription>
                    Sponsors choose their own contribution within the tier range. Leave the Diamond maximum blank — there is no upper limit.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Table — 5 columns */}
                  <div className="grid grid-cols-[80px_1fr_1fr_80px] gap-x-4 gap-y-2 items-center">
                    <TH>Tier</TH>
                    <TH>Minimum ($)</TH>
                    <TH>Maximum ($)</TH>
                    <TH className="text-center">Spots</TH>

                    {SPONSOR_TIERS.map(tier => {
                      const minField   = `sponsorPrice${tier}`        as keyof FestivalSettings
                      const maxField   = `sponsorPriceMax${tier}`     as keyof FestivalSettings
                      const limitField = `sponsorSpotLimit${tier}`    as keyof FestivalSettings
                      const isDiamond  = tier === "Diamond"

                      const maxValue = localSettings[maxField]
                      const maxDisplayValue = maxValue != null ? (maxValue as number) : ""

                      return (
                        <>
                          <span key={`${tier}-label`} className="font-medium text-sm">{tier}</span>
                          <Input
                            key={`${tier}-min`}
                            type="number"
                            min={0}
                            value={(localSettings[minField] as number) ?? 0}
                            onChange={e => set(minField, Number(e.target.value))}
                            className="text-sm"
                          />
                          <Input
                            key={`${tier}-max`}
                            type="number"
                            min={0}
                            value={maxDisplayValue}
                            placeholder={isDiamond ? "No maximum" : ""}
                            onChange={e => {
                              const val = e.target.value
                              set(maxField, val === "" ? null : Number(val))
                            }}
                            className="text-sm"
                          />
                          <Input
                            key={`${tier}-spots`}
                            type="number"
                            min={0}
                            value={(localSettings[limitField] as number) ?? 0}
                            onChange={e => set(limitField, Number(e.target.value))}
                            className="text-center text-sm"
                          />
                        </>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── VENDOR FORM TAB ──────────────────────────────────────────── */}
            <TabsContent value="vendor_form">
              <Card>
                <CardHeader>
                  <CardTitle>Vendor Application Form</CardTitle>
                  <CardDescription>Customize the questions asked during vendor registration.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {localSettings.vendorFormQuestions && localSettings.vendorFormQuestions.length > 0 && (
                    <QuestionEditor formType="vendor" questions={[localSettings.vendorFormQuestions[0]]} />
                  )}

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Form Description / Details</Label>
                    <Textarea
                      placeholder="Add any details or instructions to display on the vendor application form..."
                      rows={4}
                      value={localSettings.vendorFormDescription ?? ""}
                      onChange={e => setLocalSettings(prev => ({ ...prev, vendorFormDescription: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">This text will appear on the public vendor application form.</p>
                  </div>

                  {localSettings.vendorFormQuestions && localSettings.vendorFormQuestions.length > 1 && (
                    <QuestionEditor formType="vendor" questions={localSettings.vendorFormQuestions.slice(1)} />
                  )}

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Header Image</Label>
                    {localSettings.vendorFormHeaderImage ? (
                      <div className="relative inline-block">
                        <img src={localSettings.vendorFormHeaderImage} alt="Vendor form header" className="max-h-40 rounded-md border object-cover" />
                        <button
                          onClick={() => setLocalSettings(prev => ({ ...prev, vendorFormHeaderImage: null }))}
                          className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5 shadow"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                        <ImageIcon className="w-8 h-8 text-muted-foreground mb-2" />
                        <span className="text-sm text-muted-foreground">Click to upload an image</span>
                        <input type="file" accept="image/*" className="hidden" onChange={e => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          const reader = new FileReader()
                          reader.onload = ev => setLocalSettings(prev => ({ ...prev, vendorFormHeaderImage: ev.target?.result as string }))
                          reader.readAsDataURL(file)
                        }} />
                      </label>
                    )}
                    <p className="text-xs text-muted-foreground">Displayed at the top of the vendor application form.</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── SPONSOR FORM TAB ─────────────────────────────────────────── */}
            <TabsContent value="sponsor_form">
              <Card>
                <CardHeader>
                  <CardTitle>Sponsor Application Form</CardTitle>
                  <CardDescription>Customize the questions asked during sponsor registration.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {localSettings.sponsorFormQuestions && localSettings.sponsorFormQuestions.length > 0 && (
                    <QuestionEditor formType="sponsor" questions={[localSettings.sponsorFormQuestions[0]]} />
                  )}

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Form Description / Details</Label>
                    <Textarea
                      placeholder="Add any details or instructions to display on the sponsor application form..."
                      rows={4}
                      value={localSettings.sponsorFormDescription ?? ""}
                      onChange={e => setLocalSettings(prev => ({ ...prev, sponsorFormDescription: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">This text will appear on the public sponsor application form.</p>
                  </div>

                  {localSettings.sponsorFormQuestions && localSettings.sponsorFormQuestions.length > 1 && (
                    <QuestionEditor formType="sponsor" questions={localSettings.sponsorFormQuestions.slice(1)} />
                  )}

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Header Image</Label>
                    {localSettings.sponsorFormHeaderImage ? (
                      <div className="relative inline-block">
                        <img src={localSettings.sponsorFormHeaderImage} alt="Sponsor form header" className="max-h-40 rounded-md border object-cover" />
                        <button
                          onClick={() => setLocalSettings(prev => ({ ...prev, sponsorFormHeaderImage: null }))}
                          className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5 shadow"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                        <ImageIcon className="w-8 h-8 text-muted-foreground mb-2" />
                        <span className="text-sm text-muted-foreground">Click to upload an image</span>
                        <input type="file" accept="image/*" className="hidden" onChange={e => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          const reader = new FileReader()
                          reader.onload = ev => setLocalSettings(prev => ({ ...prev, sponsorFormHeaderImage: ev.target?.result as string }))
                          reader.readAsDataURL(file)
                        }} />
                      </label>
                    )}
                    <p className="text-xs text-muted-foreground">Displayed at the top of the sponsor application form.</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── VOLUNTEER FORM TAB ───────────────────────────────────────── */}
            <TabsContent value="volunteer_form">
              <Card>
                <CardHeader>
                  <CardTitle>Volunteer Application Form</CardTitle>
                  <CardDescription>Customize the questions asked during volunteer registration.</CardDescription>
                </CardHeader>
                <CardContent>
                  <QuestionEditor formType="volunteer" questions={localSettings.volunteerFormQuestions || []} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AdminLayout>
  )
}

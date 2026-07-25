import { useState, useEffect, useRef } from "react"
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
import { Save, Plus, Trash2, GripVertical, ImageIcon, X } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { FestivalSettings, FormQuestion } from "@workspace/api-client-react"

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

  useEffect(() => {
    if (settings && !initialized.current) {
      setLocalSettings(settings)
      initialized.current = true
    }
  }, [settings])

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
      const newQ: FormQuestion = {
        id: `q_${Date.now()}`,
        label: "New Question",
        type: "text",
        required: false
      }
      setLocalSettings(prev => ({ ...prev, [key]: [...questions, newQ] }))
    }

    return (
      <div className="space-y-4">
        {questions.map((q, i) => (
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
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
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
                  <Switch 
                    checked={q.required} 
                    onCheckedChange={(c) => updateQuestion(q.id, { required: c })}
                  />
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
        <Button onClick={addQuestion} variant="outline" className="w-full border-dashed"><Plus className="w-4 h-4 mr-2" /> Add Question</Button>
      </div>
    )
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-4">
          <div>
            <h1 className="text-3xl font-serif text-primary mb-2">Festival Settings</h1>
            <p className="text-muted-foreground">Configure pricing, limits, and application forms for {currentYear?.eventName || 'the festival'}.</p>
          </div>
          <Button onClick={handleSave} disabled={updateMutation.isPending || isLoading} className="shrink-0 bg-primary">
            <Save className="w-4 h-4 mr-2" /> Save Settings
          </Button>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground">Loading settings...</div>
        ) : (
          <Tabs defaultValue="general" className="w-full">
            <TabsList className="grid w-full grid-cols-4 mb-6">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="vendor_form">Vendor Form</TabsTrigger>
              <TabsTrigger value="sponsor_form">Sponsor Form</TabsTrigger>
              <TabsTrigger value="volunteer_form">Volunteer Form</TabsTrigger>
            </TabsList>
            
            <TabsContent value="general" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Pricing & Limits</CardTitle>
                  <CardDescription>Set the base prices and maximum available spots.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2 md:col-span-2">
                    <Label className="text-base font-semibold">Vendor Type Names</Label>
                    <p className="text-xs text-muted-foreground -mt-1">These labels appear on the public apply form.</p>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-1">
                      {(["Food", "Crafts", "Merchandise", "Cultural", "Other"] as const).map(key => {
                        const labelField = `vendorTypeLabel${key}` as keyof typeof localSettings;
                        return (
                          <div key={key} className="space-y-1">
                            <Label className="text-xs text-muted-foreground">{key}</Label>
                            <Input
                              value={(localSettings[labelField] as string) ?? ""}
                              onChange={e => setLocalSettings(p => ({ ...p, [labelField]: e.target.value }))}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label className="text-base font-semibold">Vendor Type Prices ($)</Label>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-1">
                      {(["Food", "Crafts", "Merchandise", "Cultural", "Other"] as const).map(key => {
                        const labelField = `vendorTypeLabel${key}` as keyof typeof localSettings;
                        const priceField = `vendorPrice${key}` as keyof typeof localSettings;
                        const displayLabel = (localSettings[labelField] as string) || key;
                        return (
                          <div key={key} className="space-y-1">
                            <Label className="text-xs text-muted-foreground">{displayLabel}</Label>
                            <Input
                              type="number"
                              value={(localSettings[priceField] as number) || 0}
                              onChange={e => setLocalSettings(p => ({ ...p, [priceField]: Number(e.target.value) }))}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label className="text-base font-semibold">Vendor Spot Limits (per type)</Label>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-1">
                      {(["Food", "Crafts", "Merchandise", "Cultural", "Other"] as const).map(key => {
                        const labelField = `vendorTypeLabel${key}` as keyof typeof localSettings;
                        const limitField = `vendorSpotLimit${key}` as keyof typeof localSettings;
                        const displayLabel = (localSettings[labelField] as string) || key;
                        return (
                          <div key={key} className="space-y-1">
                            <Label className="text-xs text-muted-foreground">{displayLabel}</Label>
                            <Input
                              type="number"
                              value={(localSettings[limitField] as number) || 0}
                              onChange={e => setLocalSettings(p => ({ ...p, [limitField]: Number(e.target.value) }))}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label className="text-base font-semibold">Sponsor Tier Prices ($)</Label>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-1">
                      {(["Bronze", "Silver", "Gold", "Platinum", "Diamond"] as const).map(tier => {
                        const key = `sponsorPrice${tier}` as keyof typeof localSettings;
                        return (
                          <div key={tier} className="space-y-1">
                            <Label className="text-xs text-muted-foreground">{tier}</Label>
                            <Input
                              type="number"
                              value={(localSettings[key] as number) || 0}
                              onChange={e => setLocalSettings(p => ({ ...p, [key]: Number(e.target.value) }))}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label className="text-base font-semibold">Sponsor Spot Limits (per tier)</Label>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-1">
                      {(["Bronze", "Silver", "Gold", "Platinum", "Diamond"] as const).map(tier => {
                        const key = `sponsorSpotLimit${tier}` as keyof typeof localSettings;
                        return (
                          <div key={tier} className="space-y-1">
                            <Label className="text-xs text-muted-foreground">{tier}</Label>
                            <Input
                              type="number"
                              value={(localSettings[key] as number) || 0}
                              onChange={e => setLocalSettings(p => ({ ...p, [key]: Number(e.target.value) }))}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="vendor_form">
              <Card>
                <CardHeader>
                  <CardTitle>Vendor Application Form</CardTitle>
                  <CardDescription>Customize the questions asked during vendor registration.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* First question */}
                  {localSettings.vendorFormQuestions && localSettings.vendorFormQuestions.length > 0 && (
                    <QuestionEditor formType="vendor" questions={[localSettings.vendorFormQuestions[0]]} />
                  )}

                  {/* Details / description field */}
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

                  {/* Remaining questions */}
                  {localSettings.vendorFormQuestions && localSettings.vendorFormQuestions.length > 1 && (
                    <QuestionEditor formType="vendor" questions={localSettings.vendorFormQuestions.slice(1)} />
                  )}

                  {/* Image upload */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Header Image</Label>
                    {localSettings.vendorFormHeaderImage ? (
                      <div className="relative inline-block">
                        <img
                          src={localSettings.vendorFormHeaderImage}
                          alt="Vendor form header"
                          className="max-h-40 rounded-md border object-cover"
                        />
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
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={e => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            const reader = new FileReader()
                            reader.onload = ev => setLocalSettings(prev => ({ ...prev, vendorFormHeaderImage: ev.target?.result as string }))
                            reader.readAsDataURL(file)
                          }}
                        />
                      </label>
                    )}
                    <p className="text-xs text-muted-foreground">Displayed at the top of the vendor application form.</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="sponsor_form">
              <Card>
                <CardHeader>
                  <CardTitle>Sponsor Application Form</CardTitle>
                  <CardDescription>Customize the questions asked during sponsor registration.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* First question */}
                  {localSettings.sponsorFormQuestions && localSettings.sponsorFormQuestions.length > 0 && (
                    <QuestionEditor formType="sponsor" questions={[localSettings.sponsorFormQuestions[0]]} />
                  )}

                  {/* Details / description field */}
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

                  {/* Remaining questions */}
                  {localSettings.sponsorFormQuestions && localSettings.sponsorFormQuestions.length > 1 && (
                    <QuestionEditor formType="sponsor" questions={localSettings.sponsorFormQuestions.slice(1)} />
                  )}

                  {/* Image upload */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Header Image</Label>
                    {localSettings.sponsorFormHeaderImage ? (
                      <div className="relative inline-block">
                        <img
                          src={localSettings.sponsorFormHeaderImage}
                          alt="Sponsor form header"
                          className="max-h-40 rounded-md border object-cover"
                        />
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
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={e => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            const reader = new FileReader()
                            reader.onload = ev => setLocalSettings(prev => ({ ...prev, sponsorFormHeaderImage: ev.target?.result as string }))
                            reader.readAsDataURL(file)
                          }}
                        />
                      </label>
                    )}
                    <p className="text-xs text-muted-foreground">Displayed at the top of the sponsor application form.</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

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

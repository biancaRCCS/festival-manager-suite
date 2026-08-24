import { useState } from "react"
import { useLocation } from "wouter"
import { useQuery } from "@tanstack/react-query"
import { useGetCurrentYear, useSubmitVolunteerApplication } from "@workspace/api-client-react"
import { PublicLayout } from "@/components/layout/public-layout"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { Loader2 } from "lucide-react"
import { ApplicationDeadlineCountdown } from "@/components/application-deadline-countdown"

interface FormQuestion {
  id: string
  label: string
  type: "text" | "textarea" | "select"
  required: boolean
  options?: string[]
  placeholder?: string
}

async function fetchFormQuestions(type: string): Promise<{ questions: FormQuestion[]; applicationDeadline: string | null; styleGuidelinesUrl: string | null }> {
  const res = await fetch(`/api/public/form-questions?type=${type}`)
  if (!res.ok) return { questions: [], applicationDeadline: null, styleGuidelinesUrl: null }
  return res.json()
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

export default function ApplyVolunteerPage() {
  const [, setLocation] = useLocation()
  const { toast } = useToast()

  const { data: currentYear, isLoading: yearLoading } = useGetCurrentYear()
  const { data: questionsData, isLoading: questionsLoading } = useQuery({
    queryKey: ["publicFormQuestions", "volunteer"],
    queryFn: () => fetchFormQuestions("volunteer"),
  })

  const submitMutation = useSubmitVolunteerApplication()

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    availability: "",
  })

  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [styleGuidelinesAcknowledged, setStyleGuidelinesAcknowledged] = useState(false)

  const isLoading = yearLoading || questionsLoading
  const questions = questionsData?.questions ?? []

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    for (const q of questions) {
      if (q.required && (!answers[q.label] || String(answers[q.label]).trim() === "")) {
        toast({ title: `Please answer: ${q.label}`, variant: "destructive" })
        return
      }
    }
    if (!styleGuidelinesAcknowledged) {
      toast({ title: "Please acknowledge the festival style guidelines.", variant: "destructive" })
      return
    }

    submitMutation.mutate(
      { data: { ...formData, answers: { ...answers, ack_styleGuidelines: styleGuidelinesAcknowledged } } },
      {
        onSuccess: () => setLocation("/apply/success"),
        onError: () => toast({ title: "Failed to submit application. Please try again.", variant: "destructive" }),
      }
    )
  }

  const deadline = questionsData?.applicationDeadline ?? null

  return (
    <PublicLayout title="Volunteer with Us" subtitle="Help make this year's festival amazing.">
      {deadline && <ApplicationDeadlineCountdown deadline={deadline} />}
      <Card className="border-t-4 border-t-primary shadow-xl bg-card/95 backdrop-blur">
        <CardContent className="p-6 md:p-10">
          {isLoading ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : !currentYear ? (
            <div className="text-center py-12">
              <h3 className="text-xl font-medium text-foreground mb-2">Applications Closed</h3>
              <p className="text-muted-foreground">We are not currently accepting volunteer applications.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="space-y-4">
                <h3 className="font-serif text-xl border-b pb-2">Personal Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="name">Full Name <span className="text-destructive">*</span></Label>
                    <Input id="name" data-testid="name" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address <span className="text-destructive">*</span></Label>
                    <Input id="email" data-testid="email" type="email" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input id="phone" data-testid="phone" type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="availability">General Availability</Label>
                    <Input
                      id="availability"
                      data-testid="availability"
                      placeholder="e.g., Saturday morning, all day Sunday"
                      value={formData.availability}
                      onChange={e => setFormData({...formData, availability: e.target.value})}
                    />
                  </div>
                </div>
              </div>

              {questions.length > 0 && (
                <div className="space-y-6">
                  <h3 className="font-serif text-xl border-b pb-2">Additional Details</h3>
                  <div className="space-y-6">
                    {questions.map((q) => (
                      <div key={q.id} className="space-y-2">
                        <Label>
                          {q.label} {q.required && <span className="text-destructive">*</span>}
                        </Label>
                        {q.type === "text" && (
                          <Input
                            required={q.required}
                            placeholder={q.placeholder ?? ""}
                            value={answers[q.label] ?? ""}
                            onChange={e => setAnswers({...answers, [q.label]: e.target.value})}
                          />
                        )}
                        {q.type === "textarea" && (
                          <textarea
                            className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                            required={q.required}
                            placeholder={q.placeholder ?? ""}
                            value={answers[q.label] ?? ""}
                            onChange={e => setAnswers({...answers, [q.label]: e.target.value})}
                          />
                        )}
                        {q.type === "select" && (
                          <Select
                            required={q.required}
                            value={answers[q.label] ?? ""}
                            onValueChange={v => setAnswers({...answers, [q.label]: v})}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={q.placeholder ?? "Select an option"} />
                            </SelectTrigger>
                            <SelectContent>
                              {q.options?.map(opt => (
                                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <h3 className="font-serif text-xl border-b pb-2">Acknowledgement</h3>
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="ack_styleGuidelines"
                    checked={styleGuidelinesAcknowledged}
                    onCheckedChange={checked => setStyleGuidelinesAcknowledged(checked === true)}
                    className="mt-0.5 shrink-0"
                  />
                  <Label htmlFor="ack_styleGuidelines" className="font-normal leading-snug cursor-pointer">
                    I agree to follow the Romanian Festival <StyleGuidelinesLink url={questionsData?.styleGuidelinesUrl} /> provided by RCCS for volunteer attire, presentation, and conduct, to help present a welcoming and consistent festival identity.
                  </Label>
                </div>
              </div>

              <Button data-testid="submit" type="submit" className="w-full h-12 text-lg" disabled={submitMutation.isPending}>
                {submitMutation.isPending ? "Submitting..." : "Submit as Volunteer"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </PublicLayout>
  )
}

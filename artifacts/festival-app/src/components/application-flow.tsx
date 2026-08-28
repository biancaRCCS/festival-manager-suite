import { Check } from "lucide-react"

export interface ApplicationFlowStep {
  key: string
  label: string
  completedAt?: string | null
}

interface ApplicationFlowProps {
  steps: ApplicationFlowStep[]
  rejected?: boolean
}

function formatEvidenceDate(value?: string | null) {
  if (!value) return null
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export function ApplicationFlow({ steps, rejected = false }: ApplicationFlowProps) {
  return (
    <div className="space-y-0">
      {steps.map((step, index) => {
        const completed = Boolean(step.completedAt)
        const date = formatEvidenceDate(step.completedAt)
        const isLast = index === steps.length - 1

        return (
          <div key={step.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-colors ${
                completed
                  ? "bg-green-600 border-green-600"
                  : "bg-background border-muted-foreground/30"
              }`}>
                {completed ? (
                  <Check className="w-3 h-3 text-white" strokeWidth={3} />
                ) : (
                  <span className="text-[10px] text-muted-foreground/60 font-medium">{index + 1}</span>
                )}
              </div>
              {!isLast && (
                <div className={`w-0.5 flex-1 my-1 min-h-[16px] ${completed ? "bg-green-400" : "bg-border"}`} />
              )}
            </div>

            <div className="pb-4 pt-0.5">
              <p className={`text-sm font-medium leading-snug ${completed ? "text-foreground" : "text-muted-foreground/60"}`}>
                {step.label}
              </p>
              {completed && date && (
                <p className="text-xs text-muted-foreground mt-0.5">{date}</p>
              )}
            </div>
          </div>
        )
      })}

      {rejected && (
        <div className="mt-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 font-medium">
          Application rejected
        </div>
      )}
    </div>
  )
}
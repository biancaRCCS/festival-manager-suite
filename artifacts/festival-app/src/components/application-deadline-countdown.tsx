import { useEffect, useState } from "react"
import { Clock } from "lucide-react"

interface TimeLeft {
  days: number
  hours: number
  minutes: number
  seconds: number
}

function calcTimeLeft(deadline: string): TimeLeft | null {
  const diff = new Date(deadline).getTime() - Date.now()
  if (diff <= 0) return null
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  }
}

interface Props {
  deadline: string
}

export function ApplicationDeadlineCountdown({ deadline }: Props) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(() => calcTimeLeft(deadline))

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(calcTimeLeft(deadline))
    }, 1000)
    return () => clearInterval(timer)
  }, [deadline])

  if (!timeLeft) {
    return (
      <div className="mb-8 rounded-2xl border-2 border-destructive/40 bg-destructive/5 px-6 py-5 text-center">
        <p className="text-lg font-semibold text-destructive">Applications are now closed.</p>
      </div>
    )
  }

  const pad = (n: number) => String(n).padStart(2, "0")

  return (
    <div className="mb-8 overflow-hidden rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 via-background to-secondary/5 shadow-md">
      <div className="flex items-center gap-2 border-b border-primary/10 bg-primary/5 px-5 py-3">
        <Clock className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">
          Application Deadline
        </p>
      </div>
      <div className="px-6 py-5">
        <p className="mb-4 text-center text-sm text-muted-foreground">
          Applications close on{" "}
          <span className="font-semibold text-foreground">
            {new Date(deadline).toLocaleDateString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </span>
        </p>
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Days", value: timeLeft.days },
            { label: "Hours", value: timeLeft.hours },
            { label: "Minutes", value: timeLeft.minutes },
            { label: "Seconds", value: timeLeft.seconds },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="flex flex-col items-center rounded-xl border border-primary/15 bg-background py-3 shadow-sm"
            >
              <span className="font-serif text-4xl font-bold leading-none tracking-tight text-primary">
                {pad(value)}
              </span>
              <span className="mt-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                {label}
              </span>
            </div>
          ))}
        </div>
        {timeLeft.days <= 3 && (
          <p className="mt-4 text-center text-sm font-medium text-destructive">
            Deadline approaching — submit your application soon!
          </p>
        )}
      </div>
    </div>
  )
}

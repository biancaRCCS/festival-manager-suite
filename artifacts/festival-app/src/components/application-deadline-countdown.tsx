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
    const timer = setInterval(() => setTimeLeft(calcTimeLeft(deadline)), 1000)
    return () => clearInterval(timer)
  }, [deadline])

  if (!timeLeft) {
    return (
      <div className="mb-8 rounded border-l-4 border-l-primary bg-primary/5 px-5 py-4">
        <p className="text-base font-semibold text-primary uppercase tracking-wide">
          Applications are now closed.
        </p>
      </div>
    )
  }

  const pad = (n: number) => String(n).padStart(2, "0")
  const urgent = timeLeft.days <= 3

  return (
    <div className={`mb-8 rounded border-l-4 ${urgent ? "border-l-primary bg-primary/5" : "border-l-secondary bg-secondary/5"}`}>
      {/* Header bar */}
      <div className={`flex items-center gap-2 px-5 py-3 border-b ${urgent ? "border-primary/15" : "border-secondary/15"}`}>
        <Clock className={`h-4 w-4 ${urgent ? "text-primary" : "text-secondary"}`} />
        <p className={`text-xs font-bold uppercase tracking-widest ${urgent ? "text-primary" : "text-secondary"}`}>
          Application Deadline
        </p>
      </div>
      <div className="px-5 py-5">
        <p className="mb-4 text-muted-foreground text-[18px]">
          Applications close on{" "}
          <span className="font-semibold text-foreground text-[18px]">
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
              className={`flex flex-col items-center rounded border py-4 bg-white shadow-sm ${urgent ? "border-primary/20" : "border-secondary/20"}`}
            >
              <span className={`font-serif text-4xl font-bold leading-none ${urgent ? "text-primary" : "text-secondary"}`}>
                {pad(value)}
              </span>
              <span className="mt-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {label}
              </span>
            </div>
          ))}
        </div>

        {urgent && (
          <p className="mt-4 text-sm font-semibold text-primary uppercase tracking-wide">
            Deadline approaching — submit your application soon.
          </p>
        )}
      </div>
    </div>
  );
}

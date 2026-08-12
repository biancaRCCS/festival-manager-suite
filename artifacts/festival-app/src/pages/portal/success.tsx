import { Link, useParams } from "wouter"
import { Card, CardContent } from "@/components/ui/card"
import { CheckCircle2, ArrowRight } from "lucide-react"

export default function PortalSuccessPage() {
  const { token } = useParams()
  
  return (
    <div className="min-h-screen bg-noise bg-background flex flex-col font-sans">
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <Card className="max-w-md w-full border-t-4 border-t-green-500 shadow-xl">
          <CardContent className="p-8 text-center flex flex-col items-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-serif mb-4">Payment Successful!</h2>
            <p className="text-muted-foreground mb-8">
              Thank you for your payment. Your registration is now confirmed.
            </p>
            <Link href={`/portal/${token}`}>
              <button className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium h-10 px-6 bg-primary text-primary-foreground shadow hover:bg-primary/90">
                Return to Portal <ArrowRight className="w-4 h-4 ml-2" />
              </button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

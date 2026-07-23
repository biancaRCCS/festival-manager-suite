import { PublicLayout } from "@/components/layout/public-layout"
import { Card, CardContent } from "@/components/ui/card"
import { Link } from "wouter"
import { CheckCircle2, ArrowRight } from "lucide-react"

export default function ApplySuccessPage() {
  return (
    <PublicLayout title="Application Received!" subtitle="Thank you for applying to the Romanian Festival.">
      <Card className="border-t-4 border-t-primary shadow-lg bg-card/90 backdrop-blur">
        <CardContent className="p-10 flex flex-col items-center text-center">
          <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6 shadow-inner">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-serif mb-4">You're all set!</h2>
          <p className="text-muted-foreground mb-8 max-w-md">
            We have received your application. Our team will review it shortly. 
            Once approved, you will receive an email with next steps and a link to your portal.
          </p>
          <Link href="/">
            <button className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium h-12 px-8 bg-primary text-primary-foreground shadow hover:bg-primary/90 transition-transform hover:-translate-y-0.5">
              Return to Homepage <ArrowRight className="w-4 h-4 ml-2" />
            </button>
          </Link>
        </CardContent>
      </Card>
    </PublicLayout>
  )
}

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { format } from "date-fns"
import { AlertCircle, CalendarIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"
import type { ManualPaymentInput, ManualPaymentInputMethod } from "@workspace/api-client-react"

const schema = z.object({
  method: z.enum(["cash", "check", "bank_transfer", "other"] as const),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  receivedDate: z.date({
    required_error: "A date is required.",
  }),
  reference: z.string().max(500).optional(),
  confirmStripeOverlap: z.boolean().default(false),
  sendConfirmationEmail: z.boolean().default(false),
})

type FormValues = z.infer<typeof schema>

interface ManualPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  defaultAmount?: number
  hasStripePayment?: boolean
  isPending: boolean
  onSubmit: (data: ManualPaymentInput) => void
}

export function ManualPaymentDialog({
  open,
  onOpenChange,
  title,
  description,
  defaultAmount,
  hasStripePayment,
  isPending,
  onSubmit,
}: ManualPaymentDialogProps) {
  const [stripeWarningAcknowledged, setStripeWarningAcknowledged] = useState(!hasStripePayment)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      method: "check",
      amount: defaultAmount ?? 0,
      receivedDate: new Date(),
      reference: "",
      confirmStripeOverlap: false,
      sendConfirmationEmail: false,
    },
  })

  // Reset form when opened with new defaults
  useEffect(() => {
    if (open) {
      form.reset({
        method: "check",
        amount: defaultAmount ?? 0,
        receivedDate: new Date(),
        reference: "",
        confirmStripeOverlap: false,
        sendConfirmationEmail: false,
      })
      setStripeWarningAcknowledged(!hasStripePayment)
    }
  }, [open, defaultAmount, hasStripePayment, form])

  const handleSubmit = (values: FormValues) => {
    onSubmit({
      method: values.method as ManualPaymentInputMethod,
      amount: values.amount,
      receivedDate: format(values.receivedDate, "yyyy-MM-dd"),
      reference: values.reference || null,
      confirmStripeOverlap: values.confirmStripeOverlap,
      sendConfirmationEmail: values.sendConfirmationEmail,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 pt-2">
            
            {hasStripePayment && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                  <div>
                    <p className="font-semibold">Stripe Payment Already Exists</p>
                    <p className="mt-1">This record already has an online payment via Stripe. Recording a manual payment will override the payment source.</p>
                  </div>
                </div>
                <FormField
                  control={form.control}
                  name="confirmStripeOverlap"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 mt-3 p-2 bg-amber-100/50 rounded-sm border border-amber-200">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(checked) => {
                            field.onChange(checked)
                            setStripeWarningAcknowledged(checked === true)
                          }}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel className="text-amber-900 cursor-pointer">
                          I confirm I want to record this overlapping manual payment
                        </FormLabel>
                      </div>
                    </FormItem>
                  )}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount ($)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="receivedDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col pt-[5px]">
                    <FormLabel className="mb-[5px]">Date Received</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "MMM d, yyyy")
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) =>
                            date > new Date() || date < new Date("1900-01-01")
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="method"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Method</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select method" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="check">Check</SelectItem>
                        <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="reference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reference (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Check #, notes..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="sendConfirmationEmail"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel className="cursor-pointer">
                      Send payment confirmation email
                    </FormLabel>
                    <FormDescription>
                      The applicant will receive an email receipt.
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isPending || !stripeWarningAcknowledged}
              >
                {isPending ? "Saving..." : "Record Payment"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

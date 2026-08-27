import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"
import type { ManualContributionInput, ManualPaymentInputMethod, FestivalYear } from "@workspace/api-client-react"

const schema = z.object({
  yearId: z.coerce.number().positive("Year is required"),
  name: z.string().min(1, "Name is required").max(200),
  email: z.string().email("Valid email is required"),
  method: z.enum(["cash", "check", "bank_transfer", "other"] as const),
  amount: z.coerce.number()
    .positive("Amount must be greater than 0")
    .max(99_999_999.99, "Amount must be $99,999,999.99 or less")
    .refine((value) => Number.isInteger(value * 100), "Amount cannot include fractions of a cent"),
  receivedDate: z.date({
    required_error: "A date is required.",
  }),
  reference: z.string().max(500).optional(),
  sendConfirmationEmail: z.boolean().default(false),
})

type FormValues = z.infer<typeof schema>

interface CreateManualContributionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  years?: FestivalYear[]
  defaultYearId?: number
  isPending: boolean
  onSubmit: (data: ManualContributionInput) => void
}

export function CreateManualContributionDialog({
  open,
  onOpenChange,
  years = [],
  defaultYearId,
  isPending,
  onSubmit,
}: CreateManualContributionDialogProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      yearId: defaultYearId || 0,
      name: "",
      email: "",
      method: "check",
      amount: 0,
      receivedDate: new Date(),
      reference: "",
      sendConfirmationEmail: false,
    },
  })

  // Reset form when opened with new defaults
  useEffect(() => {
    if (open) {
      form.reset({
        yearId: defaultYearId || (years.length > 0 ? years[0].id : 0),
        name: "",
        email: "",
        method: "check",
        amount: 0,
        receivedDate: new Date(),
        reference: "",
        sendConfirmationEmail: false,
      })
    }
  }, [open, defaultYearId, years, form])

  const handleSubmit = (values: FormValues) => {
    onSubmit({
      yearId: values.yearId,
      name: values.name,
      email: values.email,
      method: values.method as ManualPaymentInputMethod,
      amount: values.amount,
      receivedDate: format(values.receivedDate, "yyyy-MM-dd"),
      reference: values.reference || null,
      sendConfirmationEmail: values.sendConfirmationEmail,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Record Manual Contribution</DialogTitle>
          <DialogDescription>Record an offline donation (cash, check, or transfer).</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 pt-2">
            
            <FormField
              control={form.control}
              name="yearId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Festival Year</FormLabel>
                  <Select onValueChange={(val) => field.onChange(Number(val))} value={field.value ? String(field.value) : undefined}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select year" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {years.map(y => (
                        <SelectItem key={y.id} value={String(y.id)}>{y.year} {y.isActive ? '(Active)' : ''}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="john@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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
                      The contributor will receive an email receipt.
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
                disabled={isPending}
              >
                {isPending ? "Saving..." : "Record Contribution"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

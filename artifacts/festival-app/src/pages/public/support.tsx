import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useCreateContributionCheckout } from "@workspace/api-client-react";
import { PublicLayout } from "@/components/layout/public-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const PRESETS = [50, 100, 200, 500];

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  amount: z.coerce.number().min(5, "Minimum contribution is $5"),
  preset: z.string().optional(),
});

export default function SupportPage() {
  const [isOther, setIsOther] = useState(false);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      amount: 100,
      preset: "100",
    },
  });

  const createCheckout = useCreateContributionCheckout();

  function onSubmit(values: z.infer<typeof formSchema>) {
    createCheckout.mutate({
      data: {
        name: values.name,
        email: values.email,
        amount: values.amount,
      }
    }, {
      onSuccess: (data) => {
        window.location.href = data.checkoutUrl;
      },
      onError: () => {
        toast({
          title: "Unable to start payment",
          description: "Please check your details and try again.",
          variant: "destructive",
        });
      },
    });
  }

  const currentPreset = form.watch("preset");
  const isPending = createCheckout.isPending;

  return (
    <PublicLayout
      title="25 Years and Counting"
      subtitle="Since 2001, this community has built something worth continuing. Contributions help us keep building — this festival, and the events that follow."
    >
      <Card className="border-t-4 border-t-primary shadow-lg bg-card/90 backdrop-blur">
        <CardContent className="p-8 md:p-10">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

              <div className="space-y-4">
                <FormLabel className="text-base font-semibold text-foreground">Select an amount</FormLabel>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setIsOther(false);
                        form.setValue("preset", String(preset));
                        form.setValue("amount", preset);
                        form.clearErrors("amount");
                      }}
                      className={cn(
                        "h-14 rounded-md border text-lg font-medium transition-colors flex items-center justify-center",
                        currentPreset === String(preset) && !isOther
                          ? "border-primary bg-primary/10 text-primary shadow-sm"
                          : "border-input bg-background hover:bg-muted text-foreground"
                      )}
                    >
                      ${preset}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() => {
                      setIsOther(true);
                      form.setValue("preset", "other");
                      if (PRESETS.includes(form.getValues("amount"))) {
                        form.setValue("amount", "" as any);
                      }
                    }}
                    className={cn(
                      "h-14 rounded-md border text-base font-medium transition-colors flex items-center justify-center",
                      isOther
                        ? "border-primary bg-primary/10 text-primary shadow-sm"
                        : "border-input bg-background hover:bg-muted text-foreground"
                    )}
                  >
                    Other
                  </button>
                </div>
              </div>

              {isOther && (
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Custom Amount ($)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          min="5" 
                          step="0.01"
                          placeholder="Other amount" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <div className="space-y-4 pt-4 border-t">
                <FormLabel className="text-base font-semibold text-foreground">Your Details</FormLabel>
                <p className="text-sm text-muted-foreground mb-4">Required for your tax receipt.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
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
                        <FormLabel>Email Address</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="john@example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-14 text-base font-bold tracking-wide uppercase mt-4"
                disabled={isPending}
              >
                {isPending ? "Processing..." : "Continue to Payment"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </PublicLayout>
  );
}

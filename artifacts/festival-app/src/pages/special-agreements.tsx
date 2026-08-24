import { useState } from "react"
import {
  useCreateSpecialAgreementVendor,
  useGetCurrentYear,
  useListSpecialAgreementVendors,
  getListSpecialAgreementVendorsQueryKey,
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { AdminLayout } from "@/components/layout/admin-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { FileSignature, Plus, ExternalLink, Send } from "lucide-react"
import { Link } from "wouter"

const EMPTY_FORM = {
  name: "",
  businessName: "",
  email: "",
  phone: "",
  operationType: "",
  revenueSharePercentage: "",
  internalNotes: "",
}

export default function SpecialAgreementsPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { data: currentYear } = useGetCurrentYear()
  const { data: agreements, isLoading } = useListSpecialAgreementVendors(
    { yearId: currentYear?.id },
    { query: { enabled: !!currentYear, queryKey: getListSpecialAgreementVendorsQueryKey({ yearId: currentYear?.id }) } },
  )
  const createMutation = useCreateSpecialAgreementVendor()
  const [isCreating, setIsCreating] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  const set = (key: keyof typeof EMPTY_FORM, value: string) => setForm((current) => ({ ...current, [key]: value }))

  const submit = () => {
    if (!currentYear) return
    const percentage = Number(form.revenueSharePercentage)
    if (!form.name.trim() || !form.businessName.trim() || !form.email.trim() || !form.phone.trim() || !form.operationType.trim()) {
      toast({ title: "Complete each required field", variant: "destructive" })
      return
    }
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      toast({ title: "Enter a revenue share from 0 to 100", variant: "destructive" })
      return
    }
    createMutation.mutate({
      data: {
        yearId: currentYear.id,
        name: form.name.trim(),
        businessName: form.businessName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        operationType: form.operationType.trim(),
        revenueSharePercentage: percentage,
        internalNotes: form.internalNotes.trim() || null,
      },
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSpecialAgreementVendorsQueryKey({ yearId: currentYear.id }) })
        queryClient.invalidateQueries({ queryKey: ["vendors", currentYear.id] })
        toast({ title: "Special Agreement Vendor created", description: "The contact has been emailed a private agreement link." })
        setForm(EMPTY_FORM)
        setIsCreating(false)
      },
      onError: () => toast({ title: "Could not create the agreement", variant: "destructive" }),
    })
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif text-primary mb-2 flex items-center gap-2">
              <FileSignature className="w-7 h-7" /> Special Agreements
            </h1>
            <p className="text-muted-foreground">Create and track revenue-share vendors with no booth fee or Stripe payment.</p>
          </div>
          <Button onClick={() => setIsCreating((open) => !open)}>
            <Plus className="w-4 h-4 mr-2" /> {isCreating ? "Close Form" : "New Special Agreement"}
          </Button>
        </div>

        {isCreating && (
          <Card className="border-t-4 border-t-violet-600">
            <CardHeader>
              <CardTitle>Create Special Agreement Vendor</CardTitle>
              <CardDescription>
                This creates an approved vendor record, skips booth fees and Checkout, and emails the contact a private agreement link.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="agreement-name">Primary contact</Label>
                  <Input id="agreement-name" value={form.name} onChange={(e) => set("name", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="agreement-business">Business / organization</Label>
                  <Input id="agreement-business" value={form.businessName} onChange={(e) => set("businessName", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="agreement-email">Email</Label>
                  <Input id="agreement-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="agreement-phone">Phone</Label>
                  <Input id="agreement-phone" type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="agreement-operation">Operation type</Label>
                  <Input id="agreement-operation" placeholder="e.g., beer garden, cultural activity" value={form.operationType} onChange={(e) => set("operationType", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="agreement-share">RCCS revenue share (%)</Label>
                  <Input id="agreement-share" type="number" min="0" max="100" step="0.01" value={form.revenueSharePercentage} onChange={(e) => set("revenueSharePercentage", e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="agreement-notes">Internal notes <span className="text-muted-foreground font-normal">(staff only)</span></Label>
                <Textarea id="agreement-notes" rows={3} value={form.internalNotes} onChange={(e) => set("internalNotes", e.target.value)} />
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setIsCreating(false)}>Cancel</Button>
                <Button onClick={submit} disabled={createMutation.isPending}>
                  <Send className="w-4 h-4 mr-2" /> {createMutation.isPending ? "Creating…" : "Create & Email Agreement"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Agreement Vendors</CardTitle>
            <CardDescription>{currentYear ? `For ${currentYear.eventName}` : "Loading active festival year…"}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <p className="p-8 text-center text-muted-foreground">Loading agreements…</p>
            ) : agreements?.length ? (
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>Business / Contact</TableHead>
                    <TableHead>Operation</TableHead>
                    <TableHead>RCCS Share</TableHead>
                    <TableHead>Agreement</TableHead>
                    <TableHead>Spot</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agreements.map((vendor) => (
                    <TableRow key={vendor.id}>
                      <TableCell>
                        <p className="font-medium">{vendor.businessName}</p>
                        <p className="text-sm text-muted-foreground">{vendor.name} · {vendor.email}</p>
                      </TableCell>
                      <TableCell>{vendor.specialAgreementOperationType}</TableCell>
                      <TableCell>{vendor.specialAgreementRevenueSharePercentage}% net profit</TableCell>
                      <TableCell>
                        {vendor.agreementSigned ? (
                          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Signed</Badge>
                        ) : (
                          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">Awaiting signature</Badge>
                        )}
                      </TableCell>
                      <TableCell>{vendor.spotNumber || "Unassigned"}</TableCell>
                      <TableCell className="text-right">
                        <Link href={`/vendors/${vendor.id}`} className="inline-flex items-center text-sm font-medium text-primary hover:underline">
                          Open <ExternalLink className="w-3.5 h-3.5 ml-1" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-12 text-center">
                <FileSignature className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
                <p className="font-medium">No Special Agreement Vendors yet</p>
                <p className="text-sm text-muted-foreground mt-1">Create one to send the contact their signing link.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  )
}
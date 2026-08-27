import { useState } from "react"
import { useListVendors, useGetCurrentYear } from "@workspace/api-client-react"
import { AdminLayout } from "@/components/layout/admin-layout"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Link } from "wouter"
import { Search, Eye, Download, Store } from "lucide-react"

export default function VendorsPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [search, setSearch] = useState("")

  const { data: currentYear } = useGetCurrentYear()
  const { data: vendors, isLoading } = useListVendors(
    { yearId: currentYear?.id, status: statusFilter !== "all" ? statusFilter : undefined },
    { query: { enabled: !!currentYear, queryKey: ["vendors", currentYear?.id, statusFilter] } }
  )

  const filteredVendors = vendors?.filter(v => {
    const q = search.toLowerCase()
    if (!q) return true
    const ad = (v.applicationData ?? {}) as Record<string, unknown>
    const permit = String(ad.sellerPermitNumber ?? "").toLowerCase()
    return (
      v.name.toLowerCase().includes(q) ||
      v.businessName.toLowerCase().includes(q) ||
      v.email.toLowerCase().includes(q) ||
      permit.includes(q)
    )
  })

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Pending Review</Badge>
      case 'approved': return <Badge variant="secondary" className="bg-blue-100 text-blue-800 hover:bg-blue-100">Approved</Badge>
      case 'payment_pending': return <Badge variant="secondary" className="bg-orange-100 text-orange-800 hover:bg-orange-100">Payment Pending</Badge>
      case 'payment_processing': return <Badge variant="secondary" className="bg-purple-100 text-purple-800 hover:bg-purple-100">Payment Processing</Badge>
      case 'paid': return <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-100">Paid</Badge>
      case 'final_approved': return <Badge variant="success">Final Approved</Badge>
      case 'rejected': return <Badge variant="destructive">Rejected</Badge>
      default: return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif text-primary mb-2 flex items-center gap-2"><Store className="w-7 h-7" /> Vendors</h1>
            <p className="text-muted-foreground">Manage vendor applications, special agreements, and payments.</p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => window.open(`/api/export/vendors?yearId=${currentYear?.id}`)}
              disabled={!currentYear}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </button>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="p-4 border-b flex flex-col sm:flex-row justify-between gap-4 items-center bg-muted/20">
              <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full sm:w-auto">
                <TabsList className="bg-background border shadow-sm">
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="pending">Pending</TabsTrigger>
                  <TabsTrigger value="approved">Approved</TabsTrigger>
                  <TabsTrigger value="payment_pending">Payment</TabsTrigger>
                  <TabsTrigger value="paid">Paid</TabsTrigger>
                  <TabsTrigger value="final_approved">Final</TabsTrigger>
                </TabsList>
              </Tabs>
              
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search vendors..."
                  className="pl-9 bg-background"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Loading vendors...</div>
            ) : filteredVendors?.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center">
                 <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                   <Search className="w-8 h-8 text-muted-foreground opacity-50" />
                 </div>
                 <h3 className="text-lg font-medium text-foreground mb-1">No vendors found</h3>
                 <p className="text-muted-foreground">No applications match your current filters.</p>
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>Business Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Applied On</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVendors?.map((vendor) => (
                    <TableRow key={vendor.id} className="hover:bg-muted/20">
                      <TableCell className="font-medium text-foreground">
                        {vendor.businessName}
                        <div className="text-xs text-muted-foreground font-normal">{vendor.name}</div>
                         {vendor.vendorType === "special_agreement" && (
                           <Badge variant="outline" className="mt-1 border-violet-300 bg-violet-50 text-violet-800">Special Agreement</Badge>
                         )}
                        {(() => {
                          const permit = String(((vendor.applicationData ?? {}) as Record<string, unknown>).sellerPermitNumber ?? "")
                          return permit ? <div className="text-xs text-muted-foreground font-normal">Permit: {permit}</div> : null
                        })()}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{vendor.email}</div>
                        <div className="text-xs text-muted-foreground">{vendor.phone}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-foreground">
                          {vendor.paymentSource === 'stripe' ? 'Stripe' : vendor.paymentSource === 'manual' ? (vendor.paymentMethod ? vendor.paymentMethod.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) : 'Manual') : '—'}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(vendor.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(vendor.status)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/vendors/${vendor.id}`} className="inline-flex items-center justify-center rounded-md text-sm font-medium h-8 px-3 border border-input bg-background shadow-sm hover:bg-primary/5 hover:text-primary hover:border-primary/30 transition-colors">
                          <Eye className="w-4 h-4 mr-1.5" />
                          Review
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  )
}

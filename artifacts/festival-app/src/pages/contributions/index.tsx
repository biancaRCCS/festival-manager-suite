import { useState } from "react"
import { useListContributions } from "@workspace/api-client-react"
import { AdminLayout } from "@/components/layout/admin-layout"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Search, Heart, Receipt } from "lucide-react"
import { format } from "date-fns"

export default function ContributionsPage() {
  const [search, setSearch] = useState("")
  
  const { data: response, isLoading } = useListContributions()
  
  const items = response?.items ?? []
  const totalAmount = response?.total ?? 0

  const filtered = items.filter(c => {
    const q = search.toLowerCase()
    if (!q) return true
    return (
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q)
    )
  })

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif text-secondary mb-2">Contributions</h1>
            <p className="text-muted-foreground">View completed public contributions and total support received.</p>
          </div>
          <div className="flex gap-4">
            <div className="flex flex-col items-end">
              <span className="text-sm font-medium text-muted-foreground">Total Raised</span>
              <span className="text-2xl font-bold text-green-600">
                ${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {/* Toolbar */}
            <div className="p-4 border-b bg-muted/20 space-y-3">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search contributors..."
                  className="pl-9 bg-background"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>

            {/* Table */}
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Loading contributions...</div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Heart className="w-8 h-8 text-muted-foreground opacity-50" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-1">No contributions found</h3>
                <p className="text-muted-foreground">No records match your search.</p>
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Contributor</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(contribution => (
                    <TableRow key={contribution.id} className="hover:bg-muted/20">
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(contribution.paidAt || contribution.createdAt), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="font-medium text-foreground">
                        {contribution.name}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {contribution.email}
                      </TableCell>
                      <TableCell className="text-right font-medium text-foreground">
                        ${contribution.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

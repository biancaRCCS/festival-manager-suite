import { useState } from "react"
import { useListVolunteers, useGetCurrentYear } from "@workspace/api-client-react"
import { AdminLayout } from "@/components/layout/admin-layout"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Link } from "wouter"
import { Search, Eye, Download } from "lucide-react"

export default function VolunteersPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [search, setSearch] = useState("")

  const { data: currentYear } = useGetCurrentYear()
  const { data: volunteers, isLoading } = useListVolunteers(
    { yearId: currentYear?.id, status: statusFilter !== "all" ? statusFilter : undefined },
    { query: { enabled: !!currentYear, queryKey: ["volunteers", currentYear?.id, statusFilter] } }
  )

  const filteredVolunteers = volunteers?.filter(v => 
    v.name.toLowerCase().includes(search.toLowerCase()) || 
    v.email.toLowerCase().includes(search.toLowerCase())
  )

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Pending Review</Badge>
      case 'approved': return <Badge variant="success">Approved</Badge>
      case 'rejected': return <Badge variant="destructive">Rejected</Badge>
      default: return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif text-primary mb-2">Volunteers</h1>
            <p className="text-muted-foreground">Manage volunteer applications and roles.</p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => window.open(`/api/export/volunteers?yearId=${currentYear?.id}`)}
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
                  <TabsTrigger value="rejected">Rejected</TabsTrigger>
                </TabsList>
              </Tabs>
              
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search volunteers..."
                  className="pl-9 bg-background"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Loading volunteers...</div>
            ) : filteredVolunteers?.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center">
                 <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                   <Search className="w-8 h-8 text-muted-foreground opacity-50" />
                 </div>
                 <h3 className="text-lg font-medium text-foreground mb-1">No volunteers found</h3>
                 <p className="text-muted-foreground">No applications match your current filters.</p>
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Applied On</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVolunteers?.map((volunteer) => (
                    <TableRow key={volunteer.id} className="hover:bg-muted/20">
                      <TableCell className="font-medium text-foreground">
                        {volunteer.name}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{volunteer.email}</div>
                        <div className="text-xs text-muted-foreground">{volunteer.phone}</div>
                      </TableCell>
                      <TableCell>
                         {volunteer.assignedRole ? (
                            <Badge variant="outline" className="font-normal border-primary/30 text-primary">{volunteer.assignedRole}</Badge>
                         ) : (
                            <span className="text-xs text-muted-foreground italic">Unassigned</span>
                         )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(volunteer.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(volunteer.status)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/volunteers/${volunteer.id}`} className="inline-flex items-center justify-center rounded-md text-sm font-medium h-8 px-3 border border-input bg-background shadow-sm hover:bg-primary/5 hover:text-primary hover:border-primary/30 transition-colors">
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

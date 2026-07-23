import { useState, useRef } from "react"
import { useListStaff, useInviteStaff, useRemoveStaff, getListStaffQueryKey } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { AdminLayout } from "@/components/layout/admin-layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ShieldCheck, Mail, Trash2, Plus } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

export default function StaffPage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  
  const { data: staffList, isLoading } = useListStaff()
  const inviteMutation = useInviteStaff()
  const removeMutation = useRemoveStaff()

  const [isInviteOpen, setIsInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteName, setInviteName] = useState("")
  const [inviteRole, setInviteRole] = useState<"admin" | "staff">("staff")

  const inviteMutateFnRef = useRef(inviteMutation.mutate)
  inviteMutateFnRef.current = inviteMutation.mutate
  
  const removeMutateFnRef = useRef(removeMutation.mutate)
  removeMutateFnRef.current = removeMutation.mutate

  const handleInvite = () => {
    if (!inviteEmail) return
    inviteMutateFnRef.current(
      { data: { email: inviteEmail, name: inviteName, role: inviteRole } },
      {
        onSuccess: () => {
          toast({ title: "Staff invited successfully" })
          setIsInviteOpen(false)
          setInviteEmail("")
          setInviteName("")
          setInviteRole("staff")
          queryClient.invalidateQueries({ queryKey: getListStaffQueryKey() })
        },
        onError: () => toast({ title: "Failed to invite staff", variant: "destructive" })
      }
    )
  }

  const handleRemove = (id: number) => {
    if (!confirm("Are you sure you want to remove this staff member?")) return
    removeMutateFnRef.current(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Staff removed" })
          queryClient.invalidateQueries({ queryKey: getListStaffQueryKey() })
        },
        onError: () => toast({ title: "Failed to remove staff", variant: "destructive" })
      }
    )
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-4">
          <div>
            <h1 className="text-3xl font-serif text-primary mb-2">Staff Directory</h1>
            <p className="text-muted-foreground">Manage administrative access to the festival portal.</p>
          </div>
          
          <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
            <DialogTrigger asChild>
              <Button className="shrink-0"><Plus className="w-4 h-4 mr-2" /> Invite Staff</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite New Staff</DialogTitle>
                <DialogDescription>Send an email invitation to give a team member access to this portal.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="e.g., Jane Doe" />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="jane@example.com" />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={inviteRole} onValueChange={(v: "admin" | "staff") => setInviteRole(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin (Full Access)</SelectItem>
                      <SelectItem value="staff">Staff (Limited Access)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleInvite} disabled={!inviteEmail || inviteMutation.isPending}>Send Invitation</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Loading staff directory...</div>
            ) : staffList?.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center">
                 <ShieldCheck className="w-12 h-12 text-muted-foreground opacity-50 mb-4" />
                 <h3 className="text-lg font-medium">No staff members found</h3>
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staffList?.map((staff) => (
                    <TableRow key={staff.id}>
                      <TableCell className="font-medium text-foreground">
                        {staff.name || "Pending Invite"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm">
                          <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                          {staff.email}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={staff.role === 'admin' ? "default" : "secondary"}>
                          {staff.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(staff.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => handleRemove(staff.id)} className="text-destructive hover:bg-destructive/10 hover:text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </Button>
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

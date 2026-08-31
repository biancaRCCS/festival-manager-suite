import { useState, useRef } from "react"
import { useLocation, useParams } from "wouter"
import { useGetVolunteer, useReviewVolunteer, getGetVolunteerQueryKey, useDeleteVolunteer, useResendVolunteerConfirmation, useUpdateVolunteerDetails } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { AdminLayout } from "@/components/layout/admin-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ArrowLeft, Mail, Phone, Clock, UserCog, Trash2, Pencil } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { ApplicantDetailsEditorDialog, type ApplicantDetailsField } from "@/components/applicant-details-editor-dialog"

const VOLUNTEER_DETAIL_FIELDS: ApplicantDetailsField[] = [
  { key: "name", label: "Contact name", required: true },
  { key: "organizationName", label: "Organization / business name" },
  { key: "email", label: "Email", type: "email", required: true },
  { key: "phone", label: "Phone", required: true },
  { key: "website", label: "Website" },
  { key: "social", label: "Facebook / Instagram" },
]

function AcknowledgementStatus({ checked }: { checked: boolean }) {
  return (
    <div className="flex items-start gap-2.5 py-2 text-sm">
      <span className={`mt-0.5 h-4 w-4 rounded border flex items-center justify-center ${checked ? "border-green-600 bg-green-600 text-white" : "border-muted-foreground/40 bg-muted/30"}`}>
        {checked ? "✓" : ""}
      </span>
      <span>Agreed to follow RCCS Romanian Festival style guidelines for volunteer attire, presentation, and conduct.</span>
    </div>
  )
}

export default function VolunteerDetailPage() {
  const params = useParams()
  const id = Number(params.id)
  const [, setLocation] = useLocation()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data: volunteer, isLoading } = useGetVolunteer(id, { query: { enabled: !!id, queryKey: getGetVolunteerQueryKey(id) } })
  const reviewMutation = useReviewVolunteer({ mutation: { mutationKey: ["reviewVolunteer", id] } })
  const deleteMutation = useDeleteVolunteer()
  const resendMutation = useResendVolunteerConfirmation()
  const detailsMutation = useUpdateVolunteerDetails({ mutation: { mutationKey: ["updateVolunteerDetails", id] } })

  const [reviewNote, setReviewNote] = useState("")
  const [assignedRole, setAssignedRole] = useState("")
  const [isReviewOpen, setIsReviewOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)

  const reviewMutateFnRef = useRef(reviewMutation.mutate)
  reviewMutateFnRef.current = reviewMutation.mutate

  const handleReview = (status: 'approved' | 'rejected') => {
    reviewMutateFnRef.current(
      { id, data: { status, note: reviewNote, assignedRole: status === 'approved' ? assignedRole : undefined } },
      {
        onSuccess: (data) => {
          toast({ title: `Volunteer ${status} successfully` })
          setIsReviewOpen(false)
          queryClient.setQueryData(getGetVolunteerQueryKey(id), data)
        },
        onError: () => toast({ title: "Failed to review volunteer", variant: "destructive" })
      }
    )
  }

  const handleDelete = () => {
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Volunteer record deleted" })
          setLocation("/volunteers")
        },
        onError: () => toast({ title: "Failed to delete volunteer", variant: "destructive" })
      }
    )
  }

  const handleResend = () => {
    resendMutation.mutate(
      { id },
      {
        onSuccess: () => toast({ title: "Confirmation email resent successfully" }),
        onError: () => toast({ title: "Failed to resend confirmation email", variant: "destructive" }),
      }
    )
  }

  const handleSaveDetails = (values: Record<string, string>) => {
    detailsMutation.mutate(
      {
        id,
        data: {
          name: values.name ?? "",
          organizationName: values.organizationName?.trim() || null,
          email: values.email ?? "",
          phone: values.phone ?? "",
          website: values.website?.trim() || null,
          social: values.social?.trim() || null,
        },
      },
      {
        onSuccess: (data) => {
          queryClient.setQueryData(getGetVolunteerQueryKey(id), data)
          setIsDetailsOpen(false)
          toast({ title: "Volunteer details updated" })
        },
        onError: () => toast({ title: "Failed to update volunteer details", variant: "destructive" }),
      },
    )
  }

  if (isLoading) return <AdminLayout><div className="p-8">Loading...</div></AdminLayout>
  if (!volunteer) return <AdminLayout><div className="p-8">Volunteer not found.</div></AdminLayout>

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        <button onClick={() => setLocation("/volunteers")} className="text-muted-foreground hover:text-primary text-sm flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to Volunteers
        </button>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-serif text-primary mb-1">{volunteer.name}</h1>
            <p className="text-muted-foreground flex items-center gap-2">
              <Mail className="w-4 h-4" /> {volunteer.email}
            </p>
          </div>
          <div className="flex gap-3 items-center">
            <Button
              variant="outline"
              className="border-primary/20 hover:bg-primary/5 text-primary"
              onClick={() => setIsDetailsOpen(true)}
            >
              <Pencil className="w-4 h-4 mr-2" /> Edit details
            </Button>
            <ApplicantDetailsEditorDialog
              entityLabel="volunteer"
              fields={VOLUNTEER_DETAIL_FIELDS}
              initialValues={{
                name: volunteer.name,
                organizationName: String((volunteer.applicationData as Record<string, unknown> | null)?.organizationName ?? ""),
                email: volunteer.email,
                phone: volunteer.phone,
                website: String((volunteer.applicationData as Record<string, unknown> | null)?.website ?? ""),
                social: String((volunteer.applicationData as Record<string, unknown> | null)?.social ?? ""),
              }}
              open={isDetailsOpen}
              onOpenChange={setIsDetailsOpen}
              onSave={handleSaveDetails}
              isSaving={detailsMutation.isPending}
            />
            {volunteer.status === 'pending' && (
              <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
                <DialogTrigger asChild>
                  <Button>Review Application</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Review Volunteer</DialogTitle>
                    <DialogDescription>Approve and assign a role to this volunteer.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Assign Role</Label>
                      <Input value={assignedRole} onChange={e => setAssignedRole(e.target.value)} placeholder="e.g., Check-in Desk, Setup Crew" />
                    </div>
                    <div className="space-y-2">
                      <Label>Internal Note (Optional)</Label>
                      <Input value={reviewNote} onChange={e => setReviewNote(e.target.value)} placeholder="e.g., Requested morning shift" />
                    </div>
                  </div>
                  <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="destructive" onClick={() => handleReview('rejected')}>Reject</Button>
                    <Button onClick={() => handleReview('approved')} disabled={!assignedRole}>Approve & Assign</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            <Button
              variant="outline"
              className="border-primary/20 hover:bg-primary/5 text-primary"
              onClick={handleResend}
              disabled={resendMutation.isPending}
            >
              <Mail className="w-4 h-4 mr-2" />
              {resendMutation.isPending ? "Sending…" : "Resend Confirmation"}
            </Button>

            <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/5">
                  <Trash2 className="w-4 h-4 mr-2" /> Delete
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete this volunteer record?</DialogTitle>
                  <DialogDescription>
                    This will permanently delete <strong>{volunteer.name}</strong> and all associated data. This cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>Cancel</Button>
                  <Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
                    {deleteMutation.isPending ? "Deleting…" : "Delete Permanently"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-xl">Application Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> Phone</h4>
                  <p className="text-sm">{volunteer.phone}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Applied On</h4>
                  <p className="text-sm">{new Date(volunteer.createdAt).toLocaleString()}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1.5">Availability</h4>
                  <p className="text-sm">{volunteer.availability || "Not specified"}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1.5">Status</h4>
                  <Badge variant="outline" className="capitalize">{volunteer.status}</Badge>
                </div>
              </div>

              <div className="border-t pt-6 mt-6">
                <h3 className="font-serif text-lg mb-4">Questionnaire Responses</h3>
                <div className="space-y-4">
                  {Object.entries(volunteer.applicationData || {}).map(([key, value]) => (
                    <div key={key} className="bg-muted/30 p-3 rounded-md border-l-2 border-primary">
                      <h4 className="text-sm font-medium text-foreground mb-1">{key}</h4>
                      <p className="text-sm text-muted-foreground">{String(value)}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t pt-6 mt-6">
                <h3 className="font-serif text-lg mb-2">Acknowledgement</h3>
                <AcknowledgementStatus checked={(volunteer.applicationData as Record<string, unknown> | null)?.ack_styleGuidelines === true} />
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Role Assignment</CardTitle>
              </CardHeader>
              <CardContent>
                {volunteer.assignedRole ? (
                  <div className="flex items-center gap-4 bg-primary/5 p-4 rounded-lg border border-primary/20">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                      <UserCog className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{volunteer.assignedRole}</p>
                      <p className="text-xs text-muted-foreground">Assigned Role</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No role assigned yet.</p>
                )}
                
                {volunteer.reviewNote && (
                  <div className="mt-4 pt-4 border-t">
                    <span className="text-xs font-medium text-muted-foreground block mb-1">Internal Note</span>
                    <p className="text-sm bg-yellow-50 p-2 text-yellow-900 rounded">{volunteer.reviewNote}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}

import { useState } from "react"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

const STATUS_LABELS: Record<string, string> = {
  pending_payment: "Awaiting Payment",
  payment_processing: "Payment Processing",
  paid: "Paid — Review Needed",
  approved: "Approved — Awaiting Details",
  rejected: "Rejected",
  details_submitted: "Details Submitted — Review Needed",
  details_approved: "Confirmed",
  pending: "Pending",
  final_approved: "Final Approved",
}

function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? status.replace(/_/g, " ")
}

type StatusRepairDialogProps = {
  entityLabel: "sponsor" | "vendor"
  currentStatus: string
  targetStatus: string
  isPending: boolean
  onRepair: () => Promise<void>
}

export function StatusRepairDialog({
  entityLabel,
  currentStatus,
  targetStatus,
  isPending,
  onRepair,
}: StatusRepairDialogProps) {
  const [open, setOpen] = useState(false)

  const handleRepair = async () => {
    try {
      await onRepair()
      setOpen(false)
    } catch {
      // The parent displays the API error. Keep the dialog open so staff can
      // retry or cancel without creating an unhandled rejected promise.
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
          disabled={isPending}
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          {isPending ? "Repairing…" : "Repair status"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Repair {entityLabel} status?</DialogTitle>
          <DialogDescription>
            This will move the {entityLabel} from{" "}
            <strong>{statusLabel(currentStatus)}</strong> to{" "}
            <strong>{statusLabel(targetStatus)}</strong> using the existing workflow
            timestamps as evidence.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          No payment records will be changed, and no email will be sent. The
          action will be recorded in the Activity Log with your staff identity.
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            className="bg-amber-700 text-white hover:bg-amber-800"
            onClick={() => void handleRepair()}
            disabled={isPending}
          >
            {isPending ? "Repairing…" : "Repair status"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
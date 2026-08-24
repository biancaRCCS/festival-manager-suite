import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export type ApplicantDetailsField = {
  key: string
  label: string
  multiline?: boolean
}

type ApplicantDetailsEditorDialogProps = {
  entityLabel: string
  fields: ApplicantDetailsField[]
  initialValues: Record<string, string>
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (values: Record<string, string>) => void
  isSaving: boolean
}

export function ApplicantDetailsEditorDialog({
  entityLabel,
  fields,
  initialValues,
  open,
  onOpenChange,
  onSave,
  isSaving,
}: ApplicantDetailsEditorDialogProps) {
  const [values, setValues] = useState<Record<string, string>>({})

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) setValues(initialValues)
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit {entityLabel} details</DialogTitle>
          <DialogDescription>
            Correct applicant-entered contact and business details. Changes are recorded in the Activity Log and do not send an email.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          {fields.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label htmlFor={`detail-${field.key}`}>{field.label}</Label>
              {field.multiline ? (
                <Textarea
                  id={`detail-${field.key}`}
                  value={values[field.key] ?? ""}
                  onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                  rows={4}
                />
              ) : (
                <Input
                  id={`detail-${field.key}`}
                  value={values[field.key] ?? ""}
                  onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                  type={field.key === "email" ? "email" : "text"}
                />
              )}
            </div>
          ))}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSaving}>Cancel</Button>
          <Button onClick={() => onSave(values)} disabled={isSaving}>
            {isSaving ? "Saving…" : "Save details"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
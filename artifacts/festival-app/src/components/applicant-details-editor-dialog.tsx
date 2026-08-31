import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"

export type ApplicantDetailsField = {
  key: string
  label: string
  multiline?: boolean
  required?: boolean | ((values: Record<string, string>) => boolean)
  type?: "text" | "email" | "number" | "checkbox"
  min?: number
  max?: number
  step?: number
  showWhen?: (values: Record<string, string>) => boolean
  checkedUpdates?: Record<string, string>
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
  useEffect(() => {
    if (open) setValues(initialValues)
  }, [open])

  const visibleFields = fields.filter((field) => !field.showWhen || field.showWhen(values))
  const hasMissingRequired = visibleFields.some((field) => {
    const required = typeof field.required === "function" ? field.required(values) : field.required
    return required && (field.type === "checkbox" ? values[field.key] !== "true" : !(values[field.key] ?? "").trim())
  })

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
          {visibleFields.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label htmlFor={`detail-${field.key}`}>{field.label}{(typeof field.required === "function" ? field.required(values) : field.required) && " *"}</Label>
              {field.type === "checkbox" ? (
                <Checkbox
                  id={`detail-${field.key}`}
                  checked={values[field.key] === "true"}
                  onCheckedChange={(checked) => setValues((current) => ({
                    ...current,
                    ...(checked === true ? field.checkedUpdates : {}),
                    [field.key]: checked === true ? "true" : "false",
                  }))}
                />
              ) : field.multiline ? (
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
                  type={field.type ?? (field.key === "email" ? "email" : "text")}
                  min={field.min}
                  max={field.max}
                  step={field.step}
                />
              )}
            </div>
          ))}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSaving}>Cancel</Button>
          <Button onClick={() => onSave(values)} disabled={isSaving || hasMissingRequired}>
            {isSaving ? "Saving…" : "Save details"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
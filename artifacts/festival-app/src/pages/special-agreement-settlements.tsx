import { useEffect, useMemo, useState } from "react"
import { Link } from "wouter"
import { useGetCurrentYear, useGetSpecialAgreementSettlementSummary, useListFestivalYears } from "@workspace/api-client-react"
import { AdminLayout } from "@/components/layout/admin-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ExternalLink, FileSignature } from "lucide-react"

const formatCurrency = (value: number | null | undefined) =>
  value == null ? "—" : value.toLocaleString("en-US", { style: "currency", currency: "USD" })

const statusLabel: Record<string, string> = {
  awaiting_figures: "Awaiting figures",
  calculated: "Calculated",
  paid: "Paid",
}

function StatusBadge({ status }: { status: string }) {
  const className = status === "paid"
    ? "bg-green-100 text-green-800 hover:bg-green-100"
    : status === "calculated"
      ? "bg-blue-100 text-blue-800 hover:bg-blue-100"
      : "bg-amber-100 text-amber-900 hover:bg-amber-100"
  return <Badge className={className}>{statusLabel[status] ?? "Awaiting figures"}</Badge>
}

export default function SpecialAgreementSettlementsPage() {
  const [selectedYearId, setSelectedYearId] = useState<number | undefined>()
  const { data: currentYear } = useGetCurrentYear()
  const { data: festivalYears, isLoading: yearsLoading } = useListFestivalYears()

  useEffect(() => {
    if (selectedYearId === undefined && currentYear?.id) setSelectedYearId(currentYear.id)
  }, [currentYear?.id, selectedYearId])

  const selectedYear = useMemo(
    () => festivalYears?.find((year) => year.id === selectedYearId),
    [festivalYears, selectedYearId],
  )
  const { data: summary, isLoading: settlementLoading } = useGetSpecialAgreementSettlementSummary(
    { yearId: selectedYearId ?? 0 },
    {
      query: {
        enabled: selectedYearId !== undefined,
        queryKey: ["special-agreement-settlement-summary", selectedYearId],
      },
    },
  )
  const isLoading = yearsLoading || settlementLoading
  const totals = summary?.totals

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif text-primary mb-2 flex items-center gap-2">
              <FileSignature className="w-7 h-7" /> Agreement Settlements
            </h1>
            <p className="text-muted-foreground">Track the money RCCS owes each Special Agreement Vendor after the festival.</p>
          </div>
          <Link href="/special-agreements">
            <Button variant="outline">Manage agreements</Button>
          </Link>
        </div>

        <Card>
          <CardContent className="p-4">
            <Select
              value={selectedYearId?.toString() ?? ""}
              onValueChange={(value) => setSelectedYearId(Number(value))}
              disabled={yearsLoading || !festivalYears?.length}
            >
              <SelectTrigger className="w-full sm:w-64 bg-background">
                <SelectValue placeholder="Choose festival year" />
              </SelectTrigger>
              <SelectContent>
                {festivalYears?.map((year) => (
                  <SelectItem key={year.id} value={year.id.toString()}>
                    {year.year} {year.isActive ? "(Active)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            ["Gross sales", totals?.grossSales, "text-foreground"],
            ["Deductions", totals?.deductions, "text-foreground"],
            ["Net profit", totals?.netProfit, "text-primary"],
            ["Total owed", totals?.amountOwed, "text-primary"],
            ["Total paid", totals?.amountPaid, "text-green-700"],
            ["Outstanding", totals?.outstandingBalance, "text-amber-800"],
          ].map(([label, value, color]) => (
            <Card key={label as string}>
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">{label as string}</p>
                <p className={`text-2xl font-bold mt-1 ${color as string}`}>{formatCurrency(value as number | undefined)}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Vendor Settlement Summary</CardTitle>
            <CardDescription>
              {selectedYear ? `All Special Agreement Vendors for ${selectedYear.year}.` : "Choose a festival year to view settlement figures."}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <p className="p-8 text-center text-muted-foreground">Loading settlements…</p>
            ) : !summary?.vendors.length ? (
              <div className="p-12 text-center">
                <FileSignature className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
                <p className="font-medium">No Special Agreement Vendors for this year</p>
                <p className="text-sm text-muted-foreground mt-1">Create an agreement vendor before tracking settlement figures.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Share</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">Deductions</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                      <TableHead className="text-right">Owed</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.vendors.map((vendor) => (
                      <TableRow key={vendor.id}>
                        <TableCell>
                          <p className="font-medium">{vendor.businessName}</p>
                          <p className="text-sm text-muted-foreground">{vendor.name}</p>
                        </TableCell>
                        <TableCell>{vendor.specialAgreementRevenueSharePercentage}%</TableCell>
                        <TableCell className="text-right">{formatCurrency(vendor.grossSales)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(vendor.deductions)}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(vendor.netProfit)}</TableCell>
                        <TableCell className="text-right font-medium text-primary">{formatCurrency(vendor.amountOwed)}</TableCell>
                        <TableCell className="text-right text-green-700">{formatCurrency(vendor.amountPaid)}</TableCell>
                        <TableCell className="text-right font-semibold text-amber-800">{formatCurrency(vendor.outstandingBalance)}</TableCell>
                        <TableCell><StatusBadge status={vendor.settlementStatus} /></TableCell>
                        <TableCell className="text-right">
                          <Link href={`/vendors/${vendor.id}`} className="inline-flex items-center text-sm font-medium text-primary hover:underline">
                            Open <ExternalLink className="w-3.5 h-3.5 ml-1" />
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  )
}
// Extraído de routes/subitens-genericos.tsx (port do sucontsubitem): metadados da mensagem.
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"

interface ReportMetadataCardProps {
	reportDate: string
	msgNumber: string
	msgDate: string
	onReportDateChange: (value: string) => void
	onMsgNumberChange: (value: string) => void
	onMsgDateChange: (value: string) => void
}

export function ReportMetadataCard({ reportDate, msgNumber, msgDate, onReportDateChange, onMsgNumberChange, onMsgDateChange }: ReportMetadataCardProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Dados do relatório</CardTitle>
				<CardDescription>Identificam a mensagem gerada para a UG. Aparecem no cabeçalho do documento exportado.</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-4 sm:grid-cols-3">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="report-date">Data do relatório</Label>
					<Input id="report-date" type="date" value={reportDate} onChange={(e) => onReportDateChange(e.target.value)} />
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="msg-number">Nº da mensagem</Label>
					<Input id="msg-number" type="text" value={msgNumber} onChange={(e) => onMsgNumberChange(e.target.value)} placeholder="___" />
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="msg-date">Data da mensagem</Label>
					<Input id="msg-date" type="date" value={msgDate} onChange={(e) => onMsgDateChange(e.target.value)} />
				</div>
			</CardContent>
		</Card>
	)
}

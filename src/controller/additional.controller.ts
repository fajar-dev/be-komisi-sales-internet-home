import { period } from "../helper/period";
import { Context } from "hono";
import { IsService } from "../service/is.service";

export class AdditionalController {
    constructor(
        private periodHelper = period,
        private isService = IsService
    ) {}

    async getPeriod(c: Context) {
        const { startDate, endDate } = this.periodHelper.getStartAndEndDateForCurrentMonth();
        const month = parseInt(endDate.split('-')[1]);
        const year = parseInt(endDate.split('-')[0]);

        return c.json({
            start: startDate,
            end: endDate,
            month,
            year
        });
    }

    async getInvoice(c: Context) {
        const { startDate, endDate } = this.periodHelper.getStartAndEndDateForCurrentMonth();
        const rows = await this.isService.getInvoiceByDateRange(startDate, endDate);

        const headers = [
            "ai_invoice", "ai_receipt",
            "customer_id", "customer_name", "customer_company",
            "customer_service_id", "customer_service_account",
            "service_group", "service_id", "service_name",
            "invoice_number", "invoice_order", "invoice_date", "invoice_due_date",
            "period_start", "period_end", "month",
            "dpp", "paid_date",
            "new_subscription", "counter", "is_prorate", "is_upgrade", "line_rental",
            "category", "sales_id", "manager_id", "reseller_name",
        ];
        const csvRows = rows.map(row =>
            [
                row.ai_invoice, row.ai_receipt,
                row.customer_id, row.customer_name, row.customer_company,
                row.customer_service_id, row.customer_service_account,
                row.service_group, row.service_id, row.service_name,
                row.invoice_number, row.invoice_order, row.invoice_date, row.invoice_due_date,
                row.period_start, row.period_end, row.month,
                row.dpp, row.paid_date,
                row.new_subscription, row.counter, row.is_prorate, row.is_upgrade, row.line_rental,
                row.category, row.sales_id, row.manager_id, row.reseller_name,
            ].join(";")
        );
        const csv = [headers.join(";"), ...csvRows].join("\n");

        return new Response(csv, {
            headers: {
                "Content-Type": "text/csv",
                "Content-Disposition": `attachment; filename="invoice-${startDate}_${endDate}.csv"`,
            },
        });
    }
}
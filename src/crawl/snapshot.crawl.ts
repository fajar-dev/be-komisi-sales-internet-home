import { IsService } from '../service/is.service';
import { SnapshotService } from '../service/snapshot.service';
import { period } from '../helper/period';

export class SnapshotCrawl {
    constructor(
        private isService = IsService,
        private snapshotService = SnapshotService,
        private periodHelper = period
    ) {}

    async crawlInvoice() {
        const { startDate, endDate } = this.periodHelper.getStartAndEndDateForCurrentMonth();
        const rows = await this.isService.getInvoiceByDateRange(startDate, endDate);
        // const rows = await this.isService.getInvoiceByDateRange('2025-12-26', '2026-01-25');


        const commissionData = rows.map((row: any) => {
            const dpp = Number(row.dpp ?? 0);
            const months = Number(row.month || 1);

            let type = '';
            
            let mrc = 0;
            
            if (row.category === 'home') {
                if (row.is_prorate == 1) {
                    type = 'prorate';
                } else if (row.is_upgrade == 1) {
                    type = 'upgrade';
                     mrc = dpp / months;
                } else if (row.counter > 1 && String(row.new_subscription) === "0.00") {
                    type = 'recurring';
                } else {
                    type = 'new';
                     mrc = dpp / months;
                }
            } else if (row.category === 'setup') {
                type = 'setup';
            } else if (row.category === 'alat') {
                type = 'alat';
            }
            
            return {
                ai: row.ai_invoice,
                aiReceipt: row.ai_receipt,
                customerId: row.customer_id,
                customerName: row.customer_name,
                customerCompany: row.customer_company,
                customerServiceId: row.customer_service_id,
                customerServiceAccount: row.customer_service_account,
                serviceGroup: row.service_group,
                serviceId: row.service_id,
                serviceName: row.service_name,
                invoiceDate: row.invoice_date,
                invoiceDueDate: row.invoice_due_date,
                periodStart: row.period_start,
                periodEnd: row.period_end,
                month: row.month,
                dpp: dpp,
                paidDate: row.paid_date,
                newSubscription: row.new_subscription,
                counter: row.counter,
                isProrate: row.is_prorate,
                isUpgrade: row.is_upgrade,
                lineRental: row.line_rental,
                category: row.category,
                salesId: row.sales_id,
                managerId: row.manager_id,
                resellerName: row.reseller_name,
                mrc,
                type,
                isAdjustment: false
            };
        });
        
        for (const data of commissionData) {
            await this.snapshotService.insertSnapshot(data);
            console.log("Invoice inserted:", data.ai);
        }
    }
}
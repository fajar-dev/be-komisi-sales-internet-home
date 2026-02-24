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

            let type = null;
            
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
            }

            // Hitung keterlambatan bayar dalam bulan (30 hari = 1 bulan)
            // Pakai selisih hari ÷ 30 supaya 1 hari terlambat tidak langsung jadi 1 bulan
            let lateMonth: number | null = null;
            if (row.invoice_due_date && row.paid_date) {
                const due = new Date(row.invoice_due_date);
                const paid = new Date(row.paid_date);
                const diffMs = paid.getTime() - due.getTime();
                if (diffMs <= 0) {
                    // Bayar tepat waktu atau lebih awal
                    lateMonth = 0;
                } else {
                    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                    lateMonth = Math.floor(diffDays / 30); // 0-29 hari = 0, 30-59 = 1, dst
                }
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
                lateMonth,
                isAdjustment: false
            };
        });
        
        for (const data of commissionData) {
            await this.snapshotService.insertSnapshot(data);
            console.log("Invoice inserted:", data.ai);
        }
    }
}
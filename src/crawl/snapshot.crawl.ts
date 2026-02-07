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
        const rows = await this.isService.getCustomerInvoiceByDateRange(startDate, endDate);
        // const rows = await this.isService.getCustomerInvoiceByDateRange('2025-12-26', '2026-01-25');

        const commissionData = rows.map((row: any) => {
            const dpp = Number(row.dpp ?? 0);
            const months = Number(row.month || 1);
            const serviceId = row.service_id;
            const isProrata = row.is_prorata === 1;
            const isUpgrade = row.is_upgrade === 1;

            let type = 'new'
            let mrc = 0

            if (row.is_upgrade === 1 || row.is_prorata === 1) {
                type = 'prorate';
                mrc = dpp / months;
            } else if (row.counter > 1 && String(row.new_subscription) === "0.00") {
                type = 'recurring';
            } else {
                type = 'new';
                mrc = dpp / months;
            }

            let commissionPercentage = 0;

            const commissionRates: Record<string, { [key: number]: number }> = {
                'BFLITE': { 1: 28.38, 6: 6.55, 12: 5.09 },
                'NFSP030': { 1: 20.00, 6: 5.56, 12: 4.44 },
                'NFSP100': { 1: 20.00, 6: 5.56, 12: 4.44 },
                'NFSP200': { 1: 26.00, 6: 6.00, 12: 4.67 },
                'HOME100': { 1: 28.57, 6: 5.95, 12: 4.76 },
                'HOMEADV200': { 1: 27.78, 6: 5.56, 12: 4.63 },
                'HOMEADV': { 1: 27.78, 6: 5.56, 12: 4.63 },
                'HOMEPREM300': { 1: 31.25, 6: 6.25, 12: 5.21 },
            };

            if (type === 'prorate') {
                commissionPercentage = 10;
            } else if (type === 'recurring') {
                commissionPercentage = 1.5;
            } else {
                const rates = commissionRates[serviceId];
                if (rates) {
                    if (months >= 12) {
                        commissionPercentage = rates[12];
                    } else if (months >= 6) {
                        commissionPercentage = rates[6];
                    } else {
                        commissionPercentage = rates[1];
                    }
                }
            }

            const commissionAmount = dpp * (commissionPercentage / 100);

            return {
                ai: row.ai,
                customerId: row.customer_id,
                customerName: row.customer_name,
                customerCompany: row.customer_company,
                customerServiceId: row.customer_service_id,
                serviceGroupId: row.service_group_id,
                serviceId: row.service_id,
                invoiceNumber: row.invoice_num,
                invoiceOrder: row.invoice_order,
                serviceName: row.service_name,
                invoiceDate: row.invoice_date,
                month: row.month,
                dpp: dpp,
                newSubscription: row.new_subscription,
                mrc,
                paidDate: row.paid_date,
                counter: row.counter,
                isProrata: isProrata,
                isUpgrade: isUpgrade,
                salesId: row.sales_id,
                managerId: row.manager_id,
                referralId: row.referral_id,
                customerServiceAccount: row.customer_service_account,
                type: type,
                salesCommission: commissionAmount,
                salesCommissionPercentage: commissionPercentage,
                isAdjustment: false
            };
        });
        
        for (const data of commissionData) {
            await this.snapshotService.insertSnapshot(data);
            console.log("Invoice inserted:", data.ai);
        }
    }
}
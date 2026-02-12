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
        // const rows = await this.isService.getCustomerInvoiceByDateRange('2025-12-26', '2026-01-25');

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

        const commissionData = rows.map((row: any) => {
            const dpp = Number(row.dpp ?? 0);
            const months = Number(row.month || 1);
            const serviceId = row.service_id;

            let type = null;
            let mrc = 0;
            let commissionPercentage = 0;

            if (row.category === 'home') {
                if (row.is_prorate == 1) {
                    type = 'prorate';
                    commissionPercentage = 10;
                } else if (row.is_upgrade == 1) {
                    type = 'upgrade';
                    mrc = dpp / months;
                    const rates = commissionRates[serviceId];
                    if (rates) {
                        if (['NFSP030', 'NFSP100', 'NFSP200'].includes(serviceId)) {
                            commissionPercentage = months >= 12 ? rates[12] : (months >= 6 ? rates[6] : rates[1]);
                        } else {
                            commissionPercentage = months >= 12 ? rates[12] : (months > 1 ? rates[6] : rates[1]);
                        }
                    }
                } else if (row.counter > 1 && String(row.new_subscription) === "0.00") {
                    type = 'recurring';
                    commissionPercentage = 1.5;
                } else {
                    type = 'new';
                    mrc = dpp / months;
                    const rates = commissionRates[serviceId];
                    if (rates) {
                        if (['NFSP030', 'NFSP100', 'NFSP200'].includes(serviceId)) {
                            commissionPercentage = months >= 12 ? rates[12] : (months >= 6 ? rates[6] : rates[1]);
                        } else {
                            commissionPercentage = months >= 12 ? rates[12] : (months > 1 ? rates[6] : rates[1]);
                        }
                    }
                }
            } else if (row.category === 'setup') {
                commissionPercentage = 5;
            } else if (row.category === 'alat') {
                commissionPercentage = 2;
            }

            const commissionAmount = dpp * (commissionPercentage / 100);

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
                invoiceNumber: row.invoice_number,
                invoiceOrder: row.invoice_order,
                invoiceDate: row.invoice_date,
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
                salesCommission: commissionAmount,
                salesCommissionPercentage: commissionPercentage,
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
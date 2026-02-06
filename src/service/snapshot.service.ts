import { pool } from "../config/database";

export class SnapshotService {
    static async insertSnapshot(data: any) {
        const sql = `
            INSERT INTO snapshot (
                ai,
                customer_id,
                customer_name,
                customer_company,
                customer_service_id,
                service_group_id,
                service_id,
                service_name,
                invoice_date,
                month,
                dpp,
                new_subscription,
                paid_date,
                counter,
                is_prorata,
                is_upgrade,
                sales_id,
                manager_id,
                referral_id,
                sales_commission,
                sales_commission_percentage,
                is_adjustment,
                is_deleted
            )
            SELECT
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            WHERE NOT EXISTS (
                SELECT 1
                FROM snapshot s
                WHERE s.ai = ?
            );
        `;

        const params = [
            data.ai,
            data.customerId,
            data.customerName,
            data.customerCompany,
            data.customerServiceId,
            data.serviceGroupId,
            data.serviceId,
            data.serviceName,
            data.invoiceDate,
            data.month,
            data.dpp,
            data.newSubscription,
            data.paidDate ?? null,
            data.counter ?? 0,
            data.isProrata ?? false,
            data.isUpgrade ?? false,
            data.salesId,
            data.managerId,
            data.referralId ?? null,
            data.salesCommission ?? 0,
            data.salesCommissionPercentage ?? 0,
            data.isAdjustment ?? false,
            false,
            data.ai
        ];

        const [result] = await pool.query(sql, params);

        return result;
    }
}

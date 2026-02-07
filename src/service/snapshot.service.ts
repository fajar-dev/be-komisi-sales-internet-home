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
                customer_service_account,
                service_group_id,
                service_id,
                service_name,
                invoice_number,
                invoice_order,
                invoice_date,
                month,
                dpp,
                new_subscription,
                paid_date,
                counter,
                type,
                sales_id,
                manager_id,
                referral_id,
                mrc,
                sales_commission,
                sales_commission_percentage,
                is_adjustment,
                is_deleted
            )
            SELECT
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, false
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
            data.customerServiceAccount ?? null,
            data.serviceGroupId,
            data.serviceId,
            data.serviceName,
            data.invoiceNumber,
            data.invoiceOrder,
            data.invoiceDate,
            data.month,
            data.dpp,
            data.newSubscription,
            data.paidDate ?? null,
            data.counter ?? 0,
            data.type ?? 'recurring',
            data.salesId,
            data.managerId,
            data.referralId ?? null,
            data.mrc ?? 0,
            data.salesCommission ?? 0,
            data.salesCommissionPercentage ?? 0,
            data.isAdjustment ?? false,
            data.ai
        ];

        const [result] = await pool.query(sql, params);

        return result;
    }

    static async getSnapshotBySales(salesId: string, startDate: string, endDate: string) {
        const [rows] = await pool.query(`
            SELECT s.* 
            FROM snapshot s
            LEFT JOIN adjustment a 
                ON s.ai = a.ai
            WHERE s.sales_id = ?
            AND s.paid_date BETWEEN ? AND ?
             group by s.ai
        `, [salesId, startDate, endDate]);
        return rows as any[];
    }

    static async getSnapshotBySalesIds(salesIds: string[], startDate: string, endDate: string) {
        if (salesIds.length === 0) return [];
        
        // Create placeholders for IN clause
        const placeholders = salesIds.map(() => '?').join(',');
        
        const [rows] = await pool.query(`
            SELECT snapshot.*, employee.name 
            FROM snapshot
            LEFT JOIN employee ON snapshot.sales_id = employee.employee_id
            WHERE snapshot.sales_id IN (${placeholders})
            AND snapshot.paid_date BETWEEN ? AND ?
        `, [...salesIds, startDate, endDate]);
        
        return rows as any[];
    }

    static async getSnapshotByAi(ai: string) {
        const [rows] = await pool.query(`
            SELECT *
            FROM snapshot
            WHERE ai = ?
            LIMIT 1
        `, [ai]);
        return (rows as any[])[0];
    }
}

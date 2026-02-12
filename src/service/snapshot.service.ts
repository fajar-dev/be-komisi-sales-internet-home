import { pool } from "../config/database";

export class SnapshotService {
    static async insertSnapshot(data: any) {
        const sql = `
            INSERT INTO snapshot (
                ai,
                ai_receipt,
                customer_id,
                customer_name,
                customer_company,
                customer_service_id,
                customer_service_account,
                service_group,
                service_id,
                service_name,
                invoice_number,
                invoice_order,
                invoice_date,
                period_start,
                period_end,
                month,
                dpp,
                paid_date,
                new_subscription,
                counter,
                is_prorate,
                is_upgrade,
                line_rental,
                category,
                sales_id,
                manager_id,
                reseller_name,
                mrc,
                sales_commission,
                sales_commission_percentage,
                type,
                is_adjustment
            )
            SELECT
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            WHERE NOT EXISTS (
                SELECT 1
                FROM snapshot s
                WHERE s.ai = ?
            );
        `;

        const params = [
            data.ai,
            data.aiReceipt,
            data.customerId,
            data.customerName,
            data.customerCompany,
            data.customerServiceId,
            data.customerServiceAccount,
            data.serviceGroup,
            data.serviceId,
            data.serviceName,
            data.invoiceNumber,
            data.invoiceOrder,
            data.invoiceDate,
            data.periodStart,
            data.periodEnd,
            data.month,
            data.dpp,
            data.paidDate,
            data.newSubscription,
            data.counter,
            data.isProrate,
            data.isUpgrade,
            data.lineRental,
            data.category,
            data.salesId,
            data.managerId,
            data.resellerName,
            data.mrc,
            data.salesCommission,
            data.salesCommissionPercentage,
            data.type,
            data.isAdjustment,
            data.aiInvoice
        ];

        const [result] = await pool.query(sql, params);

        return result;
    }

    static async getSnapshotBySales(salesId: string, startDate: string, endDate: string, type?: string) {
        let query = `
            SELECT s.* 
            FROM snapshot s
            LEFT JOIN adjustment a 
                ON s.ai = a.ai
            WHERE s.sales_id = ?
            AND s.paid_date BETWEEN ? AND ?
            AND NOT (s.service_id IN ('NFSP030', 'FSP100', 'NFSP200') AND s.type = 'recurring')
        `;
        const params: any[] = [salesId, startDate, endDate];

        if (type) {
            query += ` AND s.type = ?`;
            params.push(type);
        }

        query += ` GROUP BY s.ai`;

        const [rows] = await pool.query(query, params);
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

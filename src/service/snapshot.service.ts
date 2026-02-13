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
                invoice_date,
                invoice_due_date,
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
                type,
                is_adjustment
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                ai_receipt = IF(is_adjustment = 1, ai_receipt, VALUES(ai_receipt)),
                customer_id = IF(is_adjustment = 1, customer_id, VALUES(customer_id)),
                customer_name = IF(is_adjustment = 1, customer_name, VALUES(customer_name)),
                customer_company = IF(is_adjustment = 1, customer_company, VALUES(customer_company)),
                customer_service_id = IF(is_adjustment = 1, customer_service_id, VALUES(customer_service_id)),
                customer_service_account = IF(is_adjustment = 1, customer_service_account, VALUES(customer_service_account)),
                service_group = IF(is_adjustment = 1, service_group, VALUES(service_group)),
                service_id = IF(is_adjustment = 1, service_id, VALUES(service_id)),
                service_name = IF(is_adjustment = 1, service_name, VALUES(service_name)),
                invoice_date = IF(is_adjustment = 1, invoice_date, VALUES(invoice_date)),
                invoice_due_date = IF(is_adjustment = 1, invoice_due_date, VALUES(invoice_due_date)),
                period_start = IF(is_adjustment = 1, period_start, VALUES(period_start)),
                period_end = IF(is_adjustment = 1, period_end, VALUES(period_end)),
                month = IF(is_adjustment = 1, month, VALUES(month)),
                dpp = IF(is_adjustment = 1, dpp, VALUES(dpp)),
                paid_date = IF(is_adjustment = 1, paid_date, VALUES(paid_date)),
                new_subscription = IF(is_adjustment = 1, new_subscription, VALUES(new_subscription)),
                counter = IF(is_adjustment = 1, counter, VALUES(counter)),
                is_prorate = IF(is_adjustment = 1, is_prorate, VALUES(is_prorate)),
                is_upgrade = IF(is_adjustment = 1, is_upgrade, VALUES(is_upgrade)),
                line_rental = IF(is_adjustment = 1, line_rental, VALUES(line_rental)),
                category = IF(is_adjustment = 1, category, VALUES(category)),
                sales_id = IF(is_adjustment = 1, sales_id, VALUES(sales_id)),
                manager_id = IF(is_adjustment = 1, manager_id, VALUES(manager_id)),
                reseller_name = IF(is_adjustment = 1, reseller_name, VALUES(reseller_name)),
                mrc = IF(is_adjustment = 1, mrc, VALUES(mrc)),
                type = IF(is_adjustment = 1, type, VALUES(type));
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
            data.invoiceDate,
            data.invoiceDueDate,
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
            data.type,
            data.isAdjustment
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

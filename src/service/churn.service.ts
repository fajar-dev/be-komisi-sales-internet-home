import { pool } from "../config/database";

export class ChurnService {
    static async insertChurn(data: any) {
        const sql = `
            INSERT INTO churn (
                customer_service_id, customer_id, customer_name, 
                customer_service_account, service_id, service_name, 
                registration_date, unregistration_date, reason, 
                period, price, sales_id, manager_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                customer_id = VALUES(customer_id),
                customer_name = VALUES(customer_name),
                customer_service_account = VALUES(customer_service_account),
                service_id = VALUES(service_id),
                service_name = VALUES(service_name),
                registration_date = VALUES(registration_date),
                unregistration_date = VALUES(unregistration_date),
                reason = VALUES(reason),
                period = VALUES(period),
                price = VALUES(price),
                sales_id = VALUES(sales_id),
                manager_id = VALUES(manager_id);
        `;

        const params = [
            data.customer_service_id,
            data.customer_id,
            data.customer_name,
            data.customer_service_account,
            data.service_id,
            data.service_name,
            data.registration_date,
            data.unregistration_date,
            data.reason,
            data.period,
            data.price,
            data.sales_id,
            data.manager_id
        ];

        await pool.query(sql, params);
    }

    static async deleteMissingChurns(validCsIds: number[], startDate: string, endDate: string) {
        if (validCsIds.length === 0) return;

        // Find IDs in local that should be in the crawl range
        const [rows] = await pool.query(`
            SELECT customer_service_id FROM churn 
            WHERE unregistration_date BETWEEN ? AND ?
        `, [startDate, endDate]);

        const localIds = (rows as any[]).map(r => Number(r.customer_service_id));
        const crawledIds = validCsIds.map(v => Number(v));

        const toDelete = localIds.filter(id => !crawledIds.includes(id));

        if (toDelete.length > 0) {
            await pool.query(`DELETE FROM churn WHERE customer_service_id IN (?)`, [toDelete]);
            console.log(`[Churn Sync] Deleted ${toDelete.length} orphaned records from local DB.`);
        }
    }

    static async getChurnByEmployeeId(employeeId: string, startDate: string, endDate: string) {
        const [rows] = await pool.query(
            `SELECT * FROM churn WHERE sales_id = ? AND unregistration_date BETWEEN ? AND ?`,
            [employeeId, startDate, endDate]
        );
        return rows as any[];
    }

    static async getChurnByEmployeeIds(employeeIds: string[], startDate: string, endDate: string) {
        if (employeeIds.length === 0) return [];
        const [rows] = await pool.query(
            `SELECT * FROM churn WHERE sales_id IN (?) AND unregistration_date BETWEEN ? AND ?`,
            [employeeIds, startDate, endDate]
        );
        return rows as any[];
    }
}

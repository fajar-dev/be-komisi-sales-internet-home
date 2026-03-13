import { pool } from "../config/database";

export class SnapshotService {
    static async insertSnapshot(data: any) {
    const sql = `
        INSERT INTO snapshot (
        ai, ai_receipt, customer_id, customer_name, customer_company,
        customer_service_id, customer_service_account, service_group,
        service_id, service_name, invoice_date, invoice_due_date,
        period_start, period_end, month, late_month, dpp, paid_date, new_subscription,
        counter, is_prorate, is_upgrade, line_rental, category,
        sales_id, manager_id, reseller_name, mrc, type, is_adjustment
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        late_month = IF(is_adjustment = 1, late_month, VALUES(late_month)),
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

    const nullIfEmpty = (v: any) => (v === '' || v === undefined ? null : v);

    const numOrNull = (v: any) => {
        if (v === '' || v === null || v === undefined) return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    };

    const intOrNull = (v: any) => {
        const n = numOrNull(v);
        return n === null ? null : Math.trunc(n);
    };

    const tinyIntOrNull = (v: any) => {
        if (v === '' || v === null || v === undefined) return null;
        if (v === true || v === 'true') return 1;
        if (v === false || v === 'false') return 0;
        const n = Number(v);
        return n === 0 || n === 1 ? n : null;
    };

    const params = [
        data.ai,
        nullIfEmpty(data.aiReceipt),

        data.customerId,
        nullIfEmpty(data.customerName),
        nullIfEmpty(data.customerCompany),
        nullIfEmpty(data.customerServiceId),
        nullIfEmpty(data.customerServiceAccount),
        nullIfEmpty(data.serviceGroup),
        nullIfEmpty(data.serviceId),
        nullIfEmpty(data.serviceName),

        nullIfEmpty(data.invoiceDate),
        nullIfEmpty(data.invoiceDueDate),
        nullIfEmpty(data.periodStart),
        nullIfEmpty(data.periodEnd),
        intOrNull(data.month),
        intOrNull(data.lateMonth),

        numOrNull(data.dpp),
        nullIfEmpty(data.paidDate),

        numOrNull(data.newSubscription),
        intOrNull(data.counter),
        tinyIntOrNull(data.isProrate),
        tinyIntOrNull(data.isUpgrade),
        numOrNull(data.lineRental),

        data.category,
        nullIfEmpty(data.salesId),
        nullIfEmpty(data.managerId),
        nullIfEmpty(data.resellerName),

        numOrNull(data.mrc),
        nullIfEmpty(data.type),

        tinyIntOrNull(data.isAdjustment) ?? 0, // BOOLEAN: mysql2 usually accepts true/false too
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

    static async deleteMissingSnapshots(validAis: string[], startDate: string, endDate: string) {
        // Safeguard: Jika hasil crawl benar-benar kosong, jangan hapus apapun (mencegah mass-delete jika ada error koneksi)
        if (validAis.length === 0) {
            console.log("[Sync] Crawl returned 0 items. Skipping deletion safeguard.");
            return;
        }

        // 1. Cari data di DB lokal yang seharusnya masuk dalam kriteria crawl (di periode ini)
        // tapi TIDAK ADA di dalam daftar AI hasil crawl terbaru.
        // Kita juga pastikan hanya menghapus kategori yang di-crawl ('home', 'alat', 'setup')
        const sqlFind = `
            SELECT ai FROM snapshot 
            WHERE (paid_date BETWEEN ? AND ? OR invoice_date BETWEEN ? AND ?)
            AND category IN ('home', 'alat', 'setup')
            AND is_adjustment = 0
        `;
        
        const [rows] = await pool.query(sqlFind, [startDate, endDate, startDate, endDate]);
        const localAis = (rows as any[]).map(r => String(r.ai));
        const crawledAis = validAis.map(v => String(v));

        // 2. Tentukan mana yang "Selisih" (Ada di lokal tapi sudah Hilang di NCIIC)
        const toDelete = localAis.filter(ai => !crawledAis.includes(ai));

        if (toDelete.length > 0) {
            // 3. Hapus hanya yang selisih
            await pool.query(`DELETE FROM snapshot WHERE ai IN (?)`, [toDelete]);
            console.log(`[Sync] Found difference: ${toDelete.length} records in Local DB no longer exist in NCIIC. Deleted.`);
            console.log(`[Sync] Deleted IDs:`, toDelete);
        } else {
            console.log(`[Sync] Database local sudah sinkron dengan NCIIC. Tidak ada data selisih.`);
        }
    }

    static async updateFromSheet(ai: string | number, data: any) {
        const updateFields: string[] = [];
        const params: any[] = [];

        if (data.referralFee !== undefined) {
            updateFields.push('referral_fee = ?');
            params.push(data.referralFee);
        }
        if (data.referralType !== undefined) {
            updateFields.push('referral_type = ?');
            params.push(data.referralType);
        }
        if (data.isApproved !== undefined) {
            updateFields.push('is_approved = ?');
            params.push(data.isApproved ? 1 : 0);
        }
        if (data.type !== undefined) {
            updateFields.push('type = ?');
            params.push(data.type);
        }
        if (data.lateMonth !== undefined) {
            updateFields.push('late_month = ?');
            params.push(data.lateMonth);
        }

        if (updateFields.length === 0) return null;

        // Always set is_adjustment to 1 when updated from sheet
        updateFields.push('is_adjustment = 1');

        const sql = `UPDATE snapshot SET ${updateFields.join(', ')} WHERE ai = ?`;
        params.push(ai);

        const [result] = await pool.query(sql, params);
        return result;
    }
}

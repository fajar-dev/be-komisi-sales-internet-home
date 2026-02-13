import { pool } from "../config/database"
import { RowDataPacket } from "mysql2"

export class EmployeeService {
    static async insertEmployee(data: any) {
        const [rows] = await pool.query(
            `
            INSERT INTO employee (
            id,
            employee_id,
            name,
            email,
            photo_profile,
            job_position,
            organization_name,
            job_level,
            branch,
            status,
            manager_id,
            has_dashboard
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            employee_id = VALUES(employee_id),
            name = VALUES(name),
            email = VALUES(email),
            photo_profile = VALUES(photo_profile),
            job_position = VALUES(job_position),
            organization_name = VALUES(organization_name),
            job_level = VALUES(job_level),
            branch = VALUES(branch),
            manager_id = VALUES(manager_id),
            has_dashboard = VALUES(has_dashboard)
            `,
            [
            data.userId,
            data.employeeId,
            data.name,
            data.email,             
            data.photoProfile,
            data.jobPosition,
            data.organizationName,
            data.jobLevel,
            data.branch,
            data.status,
            data.managerId ?? null,     
            data.hasDashboard ?? false,
            ]
        );

        return rows;
    }

    static async getManagerById(employeeId: string) {
        const [rows] = await pool.query<RowDataPacket[]>(`
            SELECT *
            FROM employee
            WHERE employee_id = ?
        `, [employeeId]);
        return rows;
    }

    static async getStaff(managerId: string) {
        const [rows] = await pool.query<RowDataPacket[]>(`
            SELECT *
            FROM employee
            WHERE manager_id = ?
        `, [managerId]);
        return rows;
    }

    static async getEmployeeByEmployeeId(employeeId: string) {
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT e1.*, e2.name as managerName, e2.employee_id as managerEmployeeId, e2.photo_profile as managerPhotoProfile FROM employee e1 LEFT JOIN employee e2 ON e1.manager_id = e2.id WHERE e1.employee_id = ? LIMIT 1`,
            [employeeId]
        );
        return rows.length > 0 ? rows[0] : null;
    }

    static async getEmployeeById(id: string) {
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT * FROM employee WHERE id = ? LIMIT 1`,
            [id]
        );
        return rows.length > 0 ? rows[0] : null;
    }

    static async getEmployeeByEmail(email: string) {
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT * FROM employee WHERE email = ? LIMIT 1`,
            [email]
        );

        return rows.length > 0 ? rows[0] : null;
    }

    static async getHierarchy(employeeId: string, search?: string) {
        const employee: any = await this.getEmployeeByEmployeeId(employeeId);

        if (employee && employee.manager_id == null) {
            let query = `SELECT * FROM employee WHERE has_dashboard = true`;
            const params: any[] = [];

            if (search) {
                query += ` AND (name LIKE ? OR employee_id LIKE ? OR job_position LIKE ? OR organization_name LIKE ? OR job_level LIKE ? OR branch LIKE ?)`;
                params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
            }

            const [rows]: any[] = await pool.query(query, params);
            return Array.isArray(rows) ? rows : [];
        }

        let query = `
            WITH RECURSIVE employee_hierarchy AS (
                SELECT *, 0 as depth
                FROM employee
                WHERE employee_id = ?
                
                UNION ALL
                
                SELECT e.*, eh.depth + 1
                FROM employee e
                INNER JOIN employee_hierarchy eh ON e.manager_id = eh.id
            )
            SELECT * FROM employee_hierarchy WHERE has_dashboard = true
        `;
        
        const params: any[] = [employeeId];

        if (search) {
            query += ` AND (name LIKE ? OR employee_id LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`);
        }

        query += ` ORDER BY depth ASC`;

        const [rows]: any[] = await pool.query(query, params);

        return Array.isArray(rows) ? rows : [];
    }

    static async insertStatusPeriod(employeeId: string, startDate: string, endDate: string, status: string) {
        const [existing] = await pool.query<RowDataPacket[]>(
            `SELECT id FROM status_period WHERE employee_id = ? AND start_date = ? AND end_date = ?`,
            [employeeId, startDate, endDate]
        );

        if (existing.length > 0) {
            return;
        }

        const [rows] = await pool.query(
            `
            INSERT INTO status_period (
            employee_id, start_date, end_date, status
            ) VALUES (?, ?, ?, ?)
            `,
            [employeeId, startDate, endDate, status]
        );

        return rows;
    }

    static async getStatusByPeriod(employeeId: string, startDate: string, endDate: string) {
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT status FROM status_period WHERE employee_id = ? AND start_date = ? AND end_date = ? LIMIT 1`,
            [employeeId, startDate, endDate]
        );

        return rows.length > 0 ? rows[0].status : null;
    }

}

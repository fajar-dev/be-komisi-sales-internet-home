import { Context } from 'hono';
import { SnapshotService } from '../service/snapshot.service';
import { ApiResponseHandler } from '../helper/api-response';
import { IsService } from '../service/is.service';
import { EmployeeService } from '../service/employee.service';
import { period } from '../helper/period';

export class SnapshotController {
    constructor(
        private snapshotService = SnapshotService,
        private employeeService = EmployeeService,
        private apiResponse = ApiResponseHandler,
    ) {}

    async salesInvoice(c: Context) {
        try {
            const { start, end, type } = c.req.query();
            const employeeId = c.req.param('id');
            const result = await this.snapshotService.getSnapshotBySales(employeeId, start, end, type);

            const data = result.map((row: any) => ({
                ai: row.ai,
                invoiceNumber: row.invoice_number,
                invoiceOrder: row.invoice_order,
                invoiceDate: row.invoice_date,
                paidDate: row.paid_date,
                month: row.month,
                dpp: row.dpp,
                newSubscription: row.new_subscription,
                customerServiceId: row.customer_service_id,
                customerId: row.customer_id,
                customerName: row.customer_name,
                customerCompany: row.customer_company,
                customerServiceAccount: row.customer_service_account,
                serviceGroupId: row.service_group_id,
                serviceId: row.service_id,
                serviceName: row.service_name,
                salesId: row.sales_id,
                managerSalesId: row.manager_sales_id,
                implementatorId: row.implementator_id,
                referralId: row.referral_id,
                isNew: row.is_new,
                isUpgrade: row.is_upgrade,
                isTermin: row.is_termin,
                isAdjustment: row.is_adjustment,
                isDeleted: row.is_deleted,
                type: row.type,
                modal: row.modal,
                typeSub: row.type_sub,
                salesCommission: row.sales_commission,
                salesCommissionPercentage: row.sales_commission_percentage,
            }));

            const { totalCommission, totalDpp } = data.reduce(
                (acc, inv) => {
                    if (!inv.isDeleted) {
                        acc.totalCommission += Number(inv.salesCommission || 0);
                        acc.totalDpp += Number(inv.dpp || 0);
                    }
                    return acc;
                },
                { totalCommission: 0, totalDpp: 0 }
            );

            return c.json(
                this.apiResponse.success("Invoice retrived successfuly", {
                    data,
                    totalCommission,
                    totalDpp,
                })
            );
        } catch (error: any) {
            return c.json(this.apiResponse.error("Failed to retrieve snapshot", error.message), 500);
        }
    }

    async managerTeamCommission(c: Context) {
        try {
            const employeeId = c.req.param('id');
            const { year } = c.req.query();
            const yearInt = parseInt(year as string);

            if (isNaN(yearInt)) {
                 return c.json(this.apiResponse.error("Invalid year", "Year must be a number"));
            }

            const startPeriod = period.getStartAndEndDateForMonth(yearInt, 0);
            const endPeriod = period.getStartAndEndDateForMonth(yearInt, 11);

            const startDate = startPeriod.startDate;
            const endDate = endPeriod.endDate;

            const hierarchy = await this.employeeService.getHierarchy(employeeId);
            
            // Exclude the manager themselves
            const subordinates = hierarchy.filter((e: any) => e.employee_id !== employeeId);
            
            if (!subordinates || subordinates.length === 0) {
                 return c.json(this.apiResponse.success("No employees found", []));
            }

            const employeeIds = subordinates.map((e: any) => e.employee_id);
            const snapshots = await this.snapshotService.getSnapshotBySalesIds(employeeIds, startDate, endDate);

            // Group snapshots by sales_id and sum commission
            const commissionMap = new Map<string, number>();
            snapshots.forEach((row: any) => {
                if (row.is_deleted === 1 || row.is_deleted === true) return;
                // if (row.is_upgrade === 1 && row.upgrade_count > 1) return;

                const salesId = row.sales_id;
                const commission = parseFloat(row.sales_commission) || 0;
                const current = commissionMap.get(salesId) || 0;
                commissionMap.set(salesId, current + commission);
            });

            // Map results back to hierarchy
            const data = subordinates.map((emp: any) => ({
                ...emp,
                totalCommission: commissionMap.get(emp.employee_id) || 0
            }));

            const total = data.reduce((sum: number, emp: any) => sum + emp.totalCommission, 0);

            return c.json(this.apiResponse.success("Employee commission hierarchy retrieved successfully", {
                data,
                total
            }));

        } catch (error: any) {
            return c.json(this.apiResponse.error("Failed to retrieve hierarchy commission", error.message), 500);
        }
    }

    async salesSnapshotByAi(c: Context) {
        try {
            const ai = c.req.param('ai');
            const row: any = await this.snapshotService.getSnapshotByAi(ai);

            if (!row) {
                return c.json(this.apiResponse.error("Snapshot not found"), 404);
            }

            const data = {
                ai: row.ai,
                invoiceNumber: row.invoice_number,
                invoiceOrder: row.invoice_order,
                invoiceDate: row.invoice_date,
                paidDate: row.paid_date,
                month: row.month,
                dpp: row.dpp,
                newSubscription: row.new_subscription,
                customerServiceId: row.customer_service_id,
                customerId: row.customer_id,
                customerName: row.customer_name,
                customerCompany: row.customer_company,
                serviceGroupId: row.service_group_id,
                serviceId: row.service_id,
                serviceName: row.service_name,
                salesId: row.sales_id,
                managerSalesId: row.manager_sales_id,
                implementatorId: row.implementator_id,
                referralId: row.referral_id,
                isNew: row.is_new,
                isUpgrade: row.is_upgrade,
                isTermin: row.is_termin,
                isAdjustment: row.is_adjustment,
                isDeleted: row.is_deleted,
                type: row.type,
                modal: row.modal,
                typeSub: row.type_sub,
                salesCommission: row.sales_commission,
                salesCommissionPercentage: row.sales_commission_percentage,
            };
            
            return c.json(
                this.apiResponse.success("Invoice retrived successfuly", data)
            );
        } catch (error: any) {
            return c.json(this.apiResponse.error("Failed to retrieve snapshot", error.message), 500);
        }
    }
}
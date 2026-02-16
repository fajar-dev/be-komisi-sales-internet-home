import { Context } from 'hono';
import { SnapshotService } from '../service/snapshot.service';
import { ApiResponseHandler } from '../helper/api-response';
import { IsService } from '../service/is.service';
import { EmployeeService } from '../service/employee.service';
import { period } from '../helper/period';
import { CommissionHelper } from '../helper/commission.helper';

export class SnapshotController {
    constructor(
        private snapshotService = SnapshotService,
        private employeeService = EmployeeService,
        private commissionHelper = CommissionHelper,
        private apiResponse = ApiResponseHandler,
    ) {}

    async salesInvoice(c: Context) {
        try {
            const { month, year } = c.req.query();
            const employeeId = c.req.param('id');

            if (!month || !year) {
                 return c.json(this.apiResponse.error("Missing month or year parameter"), 400);
            }

            const monthInt = parseInt(month as string);
            const yearInt = parseInt(year as string);

            if (isNaN(monthInt) || isNaN(yearInt)) {
                 return c.json(this.apiResponse.error("Invalid month or year parameter"), 400);
            }

            // Get start and end date based on commission period (26th - 25th)
            // monthInt is 1-based, period helper expects 0-based
            const { startDate, endDate } = period.getStartAndEndDateForMonth(yearInt, monthInt - 1);

            const status = await this.employeeService.getStatusByPeriod(employeeId, startDate, endDate);
            const result = await this.snapshotService.getSnapshotBySales(employeeId, startDate, endDate);

            // Calculate Activity Count and identify setup categories per customer
            let nusaSelectaCount = 0;
            let totalNewCount = 0;
            const customerSetupMap: Record<string, boolean> = {};

            result.forEach((row: any) => {
                 if (row.is_deleted) return;
                 const serviceName = this.commissionHelper.getServiceName(row.service_id);
                 
                 let type = row.type;
                 if (row.category === 'alat') type = 'alat';
                 else if (row.category === 'setup') type = 'setup';
                 else if (!type) type = 'recurring';
                 if (type === 'prorata') type = 'prorate';
                 
                 if (type === 'new') {
                     totalNewCount++;
                     if (serviceName === 'NusaSelecta' && row.service_id !== 'NFSP200') {
                        nusaSelectaCount++;
                     }
                 }

                 if (type === 'setup') {
                     customerSetupMap[row.customer_id] = true;
                 }
            });

            const standardNewCount = totalNewCount - nusaSelectaCount;
            const nusaSelectaPairs = Math.floor(nusaSelectaCount / 2);
            const activityCount = standardNewCount + nusaSelectaPairs;

            const responseData = {
                startPeriod: startDate,
                endPeriod: endDate,
                count: 0,
                commission: 0,
                dpp: 0,
                mrc: 0,
                new: { count: 0, commission: 0, dpp: 0, mrc: 0, data: [] as any[] },
                upgrade: { count: 0, commission: 0, dpp: 0, mrc: 0, data: [] as any[] },
                prorate: { count: 0, commission: 0, dpp: 0, mrc: 0, data: [] as any[] },
                recurring: { count: 0, commission: 0, dpp: 0, mrc: 0, data: [] as any[] },
                alat: { count: 0, commission: 0, dpp: 0, mrc: 0, data: [] as any[] },
                setup: { count: 0, commission: 0, dpp: 0, mrc: 0, data: [] as any[] },
            };

            result.forEach((row: any) => {
                if (row.is_deleted) return;

                const dpp = Number(row.dpp ?? 0);
                const mrc = Number(row.mrc ?? 0);
                const months = Number(row.month || 1);
                const hasSetup = customerSetupMap[row.customer_id] || false;
                
                let type = row.type;
                if (row.category === 'alat') type = 'alat';
                else if (row.category === 'setup') type = 'setup';
                else if (!type) type = 'recurring';
                if (type === 'prorata') type = 'prorate';

                const { commission, commissionPercentage } = this.commissionHelper.calculateCommission(
                    row,
                    dpp,
                    months,
                    row.service_id,
                    row.category,
                    type,
                    status as string,
                    activityCount,
                    hasSetup
                );

                const item = {
                    ai: row.ai,
                    invoiceDate: row.invoice_date,
                    paidDate: row.paid_date,
                    month: row.month,
                    dpp: Number(dpp).toFixed(2),
                    newSubscription: Number(row.new_subscription || 0).toFixed(2),
                    customerServiceId: row.customer_service_id,
                    customerId: row.customer_id,
                    customerName: row.customer_name,
                    customerCompany: row.customer_company,
                    customerServiceAccount: row.customer_service_account,
                    serviceId: row.service_id,
                    serviceName: row.service_name,
                    salesId: row.sales_id,
                    isUpgrade: row.is_upgrade,
                    isAdjustment: row.is_adjustment,
                    type: row.type, // keeping original type field as requested in example
                    salesCommission: commission,
                    salesCommissionPercentage: commissionPercentage
                };

                // Determine grouping key
                let groupKey: keyof typeof responseData | undefined;
                if (type === 'new') groupKey = 'new';
                else if (type === 'upgrade') groupKey = 'upgrade';
                else if (type === 'prorate') groupKey = 'prorate';
                else if (type === 'recurring') groupKey = 'recurring';
                else if (type === 'alat') groupKey = 'alat';
                else if (type === 'setup') groupKey = 'setup';

                if (groupKey && responseData[groupKey]) {
                    // Update group stats
                    const group = responseData[groupKey] as any;
                    group.data.push(item);
                    group.count += 1;
                    group.commission += commission;
                    group.dpp += dpp;
                    group.mrc += mrc;

                    // Update total stats
                    responseData.count += 1;
                    responseData.commission += commission;
                    responseData.dpp += dpp;
                    responseData.mrc += mrc;
                }
            });

            // Format numbers to strings as requested
            const formattedResponse = {
                startPeriod: responseData.startPeriod,
                endPeriod: responseData.endPeriod,
                count: responseData.count,
                commission: responseData.commission.toFixed(2),
                dpp: responseData.dpp.toFixed(2),
                mrc: responseData.mrc.toFixed(2),
                new: {
                    ...responseData.new,
                    commission: responseData.new.commission.toFixed(2),
                    dpp: responseData.new.dpp.toFixed(2),
                    mrc: responseData.new.mrc.toFixed(2)
                },
                upgrade: {
                    ...responseData.upgrade,
                    commission: responseData.upgrade.commission.toFixed(2),
                    dpp: responseData.upgrade.dpp.toFixed(2),
                    mrc: responseData.upgrade.mrc.toFixed(2)
                },
                prorate: {
                    ...responseData.prorate,
                    commission: responseData.prorate.commission.toFixed(2),
                    dpp: responseData.prorate.dpp.toFixed(2),
                    mrc: responseData.prorate.mrc.toFixed(2)
                },
                recurring: {
                    ...responseData.recurring,
                    commission: responseData.recurring.commission.toFixed(2),
                    dpp: responseData.recurring.dpp.toFixed(2),
                    mrc: responseData.recurring.mrc.toFixed(2)
                },
                alat: {
                    ...responseData.alat,
                    commission: responseData.alat.commission.toFixed(2),
                    dpp: responseData.alat.dpp.toFixed(2),
                    mrc: responseData.alat.mrc.toFixed(2)
                },
                setup: {
                    ...responseData.setup,
                    commission: responseData.setup.commission.toFixed(2),
                    dpp: responseData.setup.dpp.toFixed(2),
                    mrc: responseData.setup.mrc.toFixed(2)
                }
            };

            return c.json(
                this.apiResponse.success("Invoice retrived successfuly", formattedResponse)
            );
        } catch (error: any) {
            return c.json(this.apiResponse.error("Failed to retrieve snapshot", error.message), 500);
        }
    }

        async salesSnapshotByAi(c: Context) {
        try {
            const ai = c.req.param('ai');
            const row: any = await this.snapshotService.getSnapshotByAi(ai);

            if (!row) {
                return c.json(this.apiResponse.error("Snapshot not found"), 404);
            }

            const dpp = Number(row.dpp ?? 0);
            const months = Number(row.month || 1);
            
            let type = row.type;
            if (row.category === 'alat') type = 'alat';
            else if (row.category === 'setup') type = 'setup';
            else if (!type) type = 'recurring';
            if (type === 'prorata') type = 'prorate';

            const { commission, commissionPercentage } = this.commissionHelper.calculateCommission(
                row,
                dpp,
                months,
                row.service_id,
                row.category,
                type
            );

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
                salesCommission: commission,
                salesCommissionPercentage: commissionPercentage,
            };
            
            return c.json(
                this.apiResponse.success("Invoice retrived successfuly", data)
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
                
                const dpp = Number(row.dpp ?? 0);
                const months = Number(row.month || 1);
                
                let type = row.type;
                if (row.category === 'alat') type = 'alat';
                else if (row.category === 'setup') type = 'setup';
                else if (!type) type = 'recurring';
                if (type === 'prorata') type = 'prorate';

                const { commission } = this.commissionHelper.calculateCommission(
                    row,
                    dpp,
                    months,
                    row.service_id,
                    row.category,
                    type
                );

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


}
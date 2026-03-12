import { Context } from 'hono';
import { SnapshotService } from '../service/snapshot.service';
import { ApiResponseHandler } from '../helper/api-response';
import { IsService } from '../service/is.service';
import { EmployeeService } from '../service/employee.service';
import { period } from '../helper/period';
import { CommissionHelper } from '../helper/commission.helper';
import { ChurnService } from '../service/churn.service';

export class SnapshotController {
    constructor(
        private snapshotService = SnapshotService,
        private employeeService = EmployeeService,
        private churnService = ChurnService,
        private commissionHelper = CommissionHelper,
        private apiResponse = ApiResponseHandler,
    ) {}

    async salesInvoice(c: Context) {
        try {
            const { month, year } = c.req.query();
            const employeeId = c.req.param('id');

            if (!month || !year || !employeeId) {
                 return c.json(this.apiResponse.error("Missing month, year, or employee ID parameter"), 400);
            }

            const monthInt = parseInt(month as string);
            const yearInt = parseInt(year as string);

            if (isNaN(monthInt) || isNaN(yearInt)) {
                 return c.json(this.apiResponse.error("Invalid month or year parameter"), 400);
            }

            // Get start and end date based on commission period (26th - 25th)
            // monthInt is 1-based, period helper expects 0-based
            const { startDate, endDate } = period.getStartAndEndDateForMonth(yearInt, monthInt - 1);

            const status = await this.employeeService.getStatusByPeriod(employeeId as string, startDate, endDate);
            const result = await this.snapshotService.getSnapshotBySales(employeeId as string, startDate, endDate);

            // Fetch Churn for Achievement Adjustment
            const churnRows = await ChurnService.getChurnByEmployeeId(employeeId as string, startDate, endDate);
            
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

            // Adjust by churn
            churnRows.forEach((row: any) => {
                if (row.is_approved) return;
                const sName = this.commissionHelper.getServiceName(row.service_id);
                totalNewCount--;
                if (sName === 'NusaSelecta' && row.service_id !== 'NFSP200') {
                    nusaSelectaCount--;
                }
            });

            const standardNewCount = totalNewCount - nusaSelectaCount;
            const nusaSelectaPairs = Math.floor(nusaSelectaCount / 2);
            const activityCount = Math.max(0, standardNewCount + nusaSelectaPairs);

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
                
                const referralFee = Number(row.referral_fee ?? 0);
                // Jika referral_type == Cashback | Monthly makan dpp - referral jika tidak ambil saja dari dpp
                const commissionBasis = (row.referral_type === 'Cashback' || row.referral_type === 'Monthly') 
                    ? (dpp - referralFee) 
                    : dpp;

                const typeForPenalty = (row.category === 'alat') ? 'alat' : (row.category === 'setup' ? 'setup' : (row.type === 'prorata' ? 'prorate' : (row.type || 'recurring')));
                const effectiveDpp = this.commissionHelper.applyLateMonthPenalty(commissionBasis, row.late_month, row.is_approved, typeForPenalty);
                
                let type = row.type;
                if (row.category === 'alat') type = 'alat';
                else if (row.category === 'setup') type = 'setup';
                else if (!type) type = 'recurring';
                if (type === 'prorata') type = 'prorate';

                const { commission, commissionPercentage, baseCommission } = this.commissionHelper.calculateCommission(
                    row,
                    commissionBasis,
                    months,
                    row.service_id,
                    row.category,
                    type,
                    status as string,
                    activityCount,
                    hasSetup,
                    row.late_month
                );

                const item = {
                    ai: row.ai,
                    invoiceDate: row.invoice_date,
                    invoiceDueDate: row.invoice_due_date,
                    paidDate: row.paid_date,
                    lateMonth: row.late_month,
                    month: row.month,
                    dpp: Number(dpp).toFixed(2),
                    mrc: Number(mrc).toFixed(2),
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
                    type: row.type,
                    baseCommission: baseCommission.toFixed(2),
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
            if (!ai) {
                return c.json(this.apiResponse.error("Missing ai parameter"), 400);
            }
            const row: any = await this.snapshotService.getSnapshotByAi(ai);

            if (!row) {
                return c.json(this.apiResponse.error("Snapshot not found"), 404);
            }

            const dpp = Number(row.dpp ?? 0);
            const months = Number(row.month || 1);
            
            const referralFee = Number(row.referral_fee ?? 0);
            // Jika referral_type == Cashback | Monthly makan dpp - referral jika tidak ambil saja dari dpp
            const commissionBasis = (row.referral_type === 'Cashback' || row.referral_type === 'Monthly') 
                ? (dpp - referralFee) 
                : dpp;

            let type = row.type;
            if (row.category === 'alat') type = 'alat';
            else if (row.category === 'setup') type = 'setup';
            else if (!type) type = 'recurring';
            if (type === 'prorata') type = 'prorate';

            const effectiveDpp = this.commissionHelper.applyLateMonthPenalty(commissionBasis, row.late_month, row.is_approved, type);

            // To apply the 30% rule correctly, we need the context of the whole month's activity
            const invoiceDate = new Date(row.invoice_date);
            const { startDate, endDate } = period.getPeriodByDate(invoiceDate);
            
            const [status, allMonthSnapshots, churnRows] = await Promise.all([
                this.employeeService.getStatusByPeriod(row.sales_id, startDate, endDate),
                this.snapshotService.getSnapshotBySales(row.sales_id, startDate, endDate),
                ChurnService.getChurnByEmployeeId(row.sales_id, startDate, endDate)
            ]);

            let nusaSelectaCount = 0;
            let totalNewCount = 0;
            const customerSetupMap: Record<string, boolean> = {};

            allMonthSnapshots.forEach((s: any) => {
                if (s.is_deleted) return;
                const serviceName = this.commissionHelper.getServiceName(s.service_id);
                let stype = s.type;
                if (s.category === 'alat') stype = 'alat';
                else if (s.category === 'setup') stype = 'setup';
                else if (!stype) stype = 'recurring';
                if (stype === 'prorata') stype = 'prorate';

                if (stype === 'new') {
                    totalNewCount++;
                    if (serviceName === 'NusaSelecta' && s.service_id !== 'NFSP200') {
                        nusaSelectaCount++;
                    }
                }
                if (stype === 'setup') customerSetupMap[s.customer_id] = true;
            });

            // Adjust by churn
            churnRows.forEach((c: any) => {
                if (c.is_approved) return;
                const sName = this.commissionHelper.getServiceName(c.service_id);
                totalNewCount--;
                if (sName === 'NusaSelecta' && c.service_id !== 'NFSP200') {
                    nusaSelectaCount--;
                }
            });

            const activityCount = Math.max(0, (totalNewCount - nusaSelectaCount) + Math.floor(nusaSelectaCount / 2));
            const hasSetup = customerSetupMap[row.customer_id] || false;

            const { commission, commissionPercentage, baseCommission } = this.commissionHelper.calculateCommission(
                row,
                commissionBasis,
                months,
                row.service_id,
                row.category,
                type,
                status as string,
                activityCount,
                hasSetup,
                row.late_month
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
                baseCommission: baseCommission.toFixed(2),
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

            if (!employeeId || !year) {
                return c.json(this.apiResponse.error("Missing employee ID or year parameter"), 400);
            }

            const yearInt = parseInt(year as string);

            if (isNaN(yearInt)) {
                 return c.json(this.apiResponse.error("Invalid year", "Year must be a number"));
            }

            const startPeriod = period.getStartAndEndDateForMonth(yearInt, 0);
            const endPeriod = period.getStartAndEndDateForMonth(yearInt, 11);

            const startDate = startPeriod.startDate;
            const endDate = endPeriod.endDate;

            const hierarchy = await this.employeeService.getHierarchy(employeeId, undefined, true, false);
            
            // Exclude the manager themselves
            const subordinates = hierarchy.filter((e: any) => e.employee_id !== employeeId);
            
            if (!subordinates || subordinates.length === 0) {
                 return c.json(this.apiResponse.success("No employees found", []));
            }

            const employeeIds = subordinates.map((e: any) => e.employee_id);
            const snapshots = await this.snapshotService.getSnapshotBySalesIds(employeeIds, startDate, endDate);
            const churns = await this.churnService.getChurnByEmployeeIds(employeeIds, startDate, endDate);
            const statusRecords = await this.employeeService.getStatusesByPeriodAndIds(employeeIds, startDate, endDate);

            // Group data by salesperson
            const groupSnapshots = (sid: string) => snapshots.filter((s: any) => s.sales_id === sid);
            const groupChurns = (sid: string) => churns.filter((c: any) => c.sales_id === sid);
            const findStatus = (sid: string, start: string, end: string) => 
                statusRecords.find((r: any) => r.employee_id === sid && r.start_date === start && r.end_date === end)?.status || null;

            const commissionMap = new Map<string, number>();

            for (const empId of employeeIds) {
                let totalEmpCommission = 0;
                const empSnapshots = groupSnapshots(empId);
                const empChurns = groupChurns(empId);

                // Yearly loop – month by month (0 to 11)
                for (let m = 0; m < 12; m++) {
                    const { startDate: mStart, endDate: mEnd } = period.getStartAndEndDateForMonth(yearInt, m);
                    
                    const monthlyRows = empSnapshots.filter((s: any) => s.paid_date >= mStart && s.paid_date <= mEnd);
                    const monthlyChurns = empChurns.filter((c: any) => c.unregistration_date >= mStart && c.unregistration_date <= mEnd);
                    const status = findStatus(empId, mStart, mEnd);

                    if (monthlyRows.length > 0 || monthlyChurns.length > 0) {
                        const statsResult: any = this.commissionHelper.calculateEmployeeMonthlyStats(monthlyRows, status, monthlyChurns);
                        totalEmpCommission += statsResult.stats.commission;
                    }
                }
                commissionMap.set(empId, totalEmpCommission);
            }

            // Map results back to hierarchy
            const data = subordinates.map((emp: any) => ({
                ...emp,
                totalCommission: commissionMap.get(emp.employee_id) || 0
            })).filter((emp: any) => emp.is_active || emp.totalCommission > 0);

            const total = data.reduce((sum: number, emp: any) => sum + emp.totalCommission, 0);

            return c.json(this.apiResponse.success("Employee commission hierarchy retrieved successfully", {
                data,
                total
            }));

        } catch (error: any) {
            return c.json(this.apiResponse.error("Failed to retrieve hierarchy commission", error.message), 500);
        }
    }

    async salesChurn(c: Context) {
        try {
            const employeeId = c.req.param("id");
            const { month, year } = c.req.query();

            if (!employeeId || !month || !year) {
                return c.json(this.apiResponse.error("Missing employee ID, month or year parameter"), 400);
            }

            const monthInt = parseInt(month as string);
            const yearInt = parseInt(year as string);

            if (isNaN(monthInt) || isNaN(yearInt)) {
                 return c.json(this.apiResponse.error("Invalid month or year parameter"), 400);
            }

            const { startDate, endDate } = period.getStartAndEndDateForMonth(yearInt, monthInt - 1);
            const churnRows = await ChurnService.getChurnByEmployeeId(employeeId as string, startDate, endDate);
            const employeeStatus = await this.employeeService.getStatusByPeriod(employeeId as string, startDate, endDate);

            const result = churnRows
                .filter(row => !row.is_approved)
                .map(row => {
                const price = Number(row.price);
                const periodVal = Math.max(Number(row.period), 1);
                const mrc = price / periodVal;
                
                // Calculating commission deduction based on new installation rate
                const { commission, commissionPercentage, baseCommission } = CommissionHelper.calculateCommission(
                    row,
                    price,
                    periodVal,
                    row.service_id,
                    'home', 
                    'new',  
                    employeeStatus || '',
                    12, // Assume target reached for deduction purposes
                    false,
                    0 // lateMonth
                );

                const registrationDate = new Date(row.registration_date);
                const unregistrationDate = new Date(row.unregistration_date);
                let subscriptionPeriod = "-";

                if (!isNaN(registrationDate.getTime()) && !isNaN(unregistrationDate.getTime())) {
                    let months = (unregistrationDate.getFullYear() - registrationDate.getFullYear()) * 12 + (unregistrationDate.getMonth() - registrationDate.getMonth());
                    let days = unregistrationDate.getDate() - registrationDate.getDate();

                    if (days < 0) {
                        months--;
                        const lastDayOfMonth = new Date(unregistrationDate.getFullYear(), unregistrationDate.getMonth(), 0).getDate();
                        days += lastDayOfMonth;
                    }

                    const periodParts = [];
                    if (months > 0) periodParts.push(`${months} bulan`);
                    if (days > 0) periodParts.push(`${days} hari`);
                    
                    subscriptionPeriod = periodParts.length > 0 ? periodParts.join(" ") : "0 hari";
                }

                return {
                    customerServiceId: row.customer_service_id,
                    customerId: row.customer_id,
                    customerName: row.customer_name,
                    customerServiceAccount: row.customer_service_account,
                    serviceId: row.service_id,
                    serviceName: row.service_name,
                    registrationDate: row.registration_date,
                    unregistrationDate: row.unregistration_date,
                    subscriptionPeriod: subscriptionPeriod,
                    reason: row.reason,
                    period: periodVal,
                    price: price,
                    salesId: row.sales_id,
                    managerId: row.manager_id,
                    mrc: mrc,
                    baseCommission: baseCommission.toFixed(2),
                    commission: commission,
                    commissionPercentage: commissionPercentage
                };
            });

            return c.json(this.apiResponse.success("Sales churn retrieved successfully", result));
        } catch (error: any) {
            return c.json(this.apiResponse.error("Failed to retrieve sales churn", error.message), 500);
        }
    }
}
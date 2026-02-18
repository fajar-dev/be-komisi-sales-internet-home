import { Context } from "hono";
import { ApiResponseHandler } from "../helper/api-response";
import { CommissionHelper } from "../helper/commission.helper";
import { IsService } from "../service/is.service";
import { EmployeeService } from "../service/employee.service";
import { SnapshotService } from "../service/snapshot.service";
import { period } from "../helper/period";

export class CommissionController {
    constructor(
        private snapshotService = SnapshotService,  
        private employeeService = EmployeeService,
        private isService = IsService,
        private commissionHelper = CommissionHelper,
        private apiResponse = ApiResponseHandler,
    ) {}

    async salesCommission(c: Context) {
        try {
            const employeeId = c.req.param("id");
            const year = Number(c.req.query("year"));

            const annual = await this.commissionHelper.processAnnualCommission(year, async (startDate, endDate) => {
                const rows = await this.snapshotService.getSnapshotBySales(employeeId, startDate, endDate);
                const status = await this.employeeService.getStatusByPeriod(employeeId, startDate, endDate);
                
                const stats = this.commissionHelper.initStats();
                const detail = this.commissionHelper.initDetail();
                const serviceMap: Record<string, any> = this.commissionHelper.initServiceMap();

                // 1. First pass: Calculate Activity Count and identify setup categories per customer
                let nusaSelectaCount = 0;
                let totalNewCount = 0;
                const customerSetupMap: Record<string, boolean> = {};

                rows.forEach((row: any) => {
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

                // 2. Second pass: Calculate commissions
                rows.forEach((row: any) => {
                    if (row.is_deleted) return;

                    const mrc = this.commissionHelper.toNum(row.mrc);
                    const dpp = this.commissionHelper.toNum(row.dpp);

                    let type = row.type;
                    if (row.category === 'alat') type = 'alat';
                    else if (row.category === 'setup') type = 'setup';
                    else if (!type) type = 'recurring';

                    if (type === 'prorata') type = 'prorate';

                    const months = Number(row.month || 1);
                    const hasSetup = customerSetupMap[row.customer_id] || false; 

                    const { commission: calculatedCommission } = CommissionHelper.calculateCommission(
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

                const commission = calculatedCommission;
                
                const safeType = type as keyof typeof detail;
                const serviceName = this.commissionHelper.getServiceName(row.service_id);

                // Monthly Totals
                stats.count++;
                stats.commission += commission;
                stats.mrc += mrc;
                stats.dpp += dpp;

                // Detail by Type
                if (detail[safeType]) {
                    detail[safeType].count++;
                    detail[safeType].commission += commission;
                    detail[safeType].mrc += mrc;
                    detail[safeType].dpp += dpp;
                }

                // Service Breakdown
                if (serviceMap[serviceName]) {
                    serviceMap[serviceName].count++;
                    serviceMap[serviceName].commission += commission;
                    serviceMap[serviceName].mrc += mrc;
                    serviceMap[serviceName].dpp += dpp;
                    
                    if (serviceMap[serviceName].detail[safeType]) {
                        serviceMap[serviceName].detail[safeType].count++;
                        serviceMap[serviceName].detail[safeType].commission += commission;
                        serviceMap[serviceName].detail[safeType].mrc += mrc;
                        serviceMap[serviceName].detail[safeType].dpp += dpp;
                    }
                }
            });

                const { achievementStatus, motivation } = this.commissionHelper.calculateAchievement(status as string, activityCount);
                const bonus = this.commissionHelper.calculateBonus(activityCount);
                const totalCommission = stats.commission + bonus;

                const service = Object.values(serviceMap).map((s: any) => ({
                    ...s,
                    commission: this.commissionHelper.formatCurrency(s.commission),
                    mrc: this.commissionHelper.formatCurrency(s.mrc),
                    dpp: this.commissionHelper.formatCurrency(s.dpp),
                    detail: {
                        new: { ...s.detail.new, commission: this.commissionHelper.formatCurrency(s.detail.new.commission), mrc: this.commissionHelper.formatCurrency(s.detail.new.mrc), dpp: this.commissionHelper.formatCurrency(s.detail.new.dpp) },
                        upgrade: { ...s.detail.upgrade, commission: this.commissionHelper.formatCurrency(s.detail.upgrade.commission), mrc: this.commissionHelper.formatCurrency(s.detail.upgrade.mrc), dpp: this.commissionHelper.formatCurrency(s.detail.upgrade.dpp) },
                        prorate: { ...s.detail.prorate, commission: this.commissionHelper.formatCurrency(s.detail.prorate.commission), mrc: this.commissionHelper.formatCurrency(s.detail.prorate.mrc), dpp: this.commissionHelper.formatCurrency(s.detail.prorate.dpp) },
                        recurring: { ...s.detail.recurring, commission: this.commissionHelper.formatCurrency(s.detail.recurring.commission), mrc: this.commissionHelper.formatCurrency(s.detail.recurring.mrc), dpp: this.commissionHelper.formatCurrency(s.detail.recurring.dpp) }
                    }
                }));

                return {
                    total: totalCommission,
                    detail: {
                        achievement: {
                            activity: activityCount,
                            type: status,
                            status: achievementStatus,
                            motivation: motivation
                        },
                        startPeriod: startDate,
                        endPeriod: endDate,
                        commission: this.commissionHelper.formatCurrency(stats.commission),
                        bonus: this.commissionHelper.formatCurrency(bonus),
                        totalCommission: this.commissionHelper.formatCurrency(totalCommission),
                        mrc: this.commissionHelper.formatCurrency(stats.mrc),
                        dpp: this.commissionHelper.formatCurrency(stats.dpp),
                        count: stats.count,
                        detail: {
                            new: { ...detail.new, commission: this.commissionHelper.formatCurrency(detail.new.commission), mrc: this.commissionHelper.formatCurrency(detail.new.mrc), dpp: this.commissionHelper.formatCurrency(detail.new.dpp) },
                            upgrade: { ...detail.upgrade, commission: this.commissionHelper.formatCurrency(detail.upgrade.commission), mrc: this.commissionHelper.formatCurrency(detail.upgrade.mrc), dpp: this.commissionHelper.formatCurrency(detail.upgrade.dpp) },
                            prorate: { ...detail.prorate, commission: this.commissionHelper.formatCurrency(detail.prorate.commission), mrc: this.commissionHelper.formatCurrency(detail.prorate.mrc), dpp: this.commissionHelper.formatCurrency(detail.prorate.dpp) },
                            recurring: { ...detail.recurring, commission: this.commissionHelper.formatCurrency(detail.recurring.commission), mrc: this.commissionHelper.formatCurrency(detail.recurring.mrc), dpp: this.commissionHelper.formatCurrency(detail.recurring.dpp) },
                            alat: { ...detail.alat, commission: this.commissionHelper.formatCurrency(detail.alat.commission), mrc: this.commissionHelper.formatCurrency(detail.alat.mrc), dpp: this.commissionHelper.formatCurrency(detail.alat.dpp) },
                            setup: { ...detail.setup, commission: this.commissionHelper.formatCurrency(detail.setup.commission), mrc: this.commissionHelper.formatCurrency(detail.setup.mrc), dpp: this.commissionHelper.formatCurrency(detail.setup.dpp) }
                        },
                        service
                    }
                } as any;
            });

            // Aggregate Yearly Data
            const yearlyStats = this.commissionHelper.initStats();
            let yearlyBonus = 0;
            let yearlyTotalCommission = 0;
            const yearlyDetail = this.commissionHelper.initDetail();
            const yearlyServiceMap: any = this.commissionHelper.initServiceMap();

            const monthlyData: Record<string, any> = {};

            annual.data.forEach((monthItem: any) => {
                const monthName = monthItem.month;
                const mData = monthItem.detail;

                monthlyData[monthName] = mData;

                // Aggregate Yearly
                yearlyStats.count += mData.count;
                yearlyStats.commission += this.commissionHelper.toNum(mData.commission);
                yearlyBonus += this.commissionHelper.toNum(mData.bonus);
                yearlyTotalCommission += this.commissionHelper.toNum(mData.totalCommission);
                yearlyStats.mrc += this.commissionHelper.toNum(mData.mrc);
                yearlyStats.dpp += this.commissionHelper.toNum(mData.dpp);

                // Detail
                ['new', 'upgrade', 'prorate', 'recurring', 'alat', 'setup'].forEach((key: string) => {
                    const k = key as keyof typeof yearlyDetail;
                    yearlyDetail[k].count += mData.detail[k].count;
                    yearlyDetail[k].commission += this.commissionHelper.toNum(mData.detail[k].commission);
                    yearlyDetail[k].mrc += this.commissionHelper.toNum(mData.detail[k].mrc);
                    yearlyDetail[k].dpp += this.commissionHelper.toNum(mData.detail[k].dpp);
                });

                // Service
                mData.service.forEach((s: any) => {
                    const sName = s.name;
                    if (yearlyServiceMap[sName]) {
                        yearlyServiceMap[sName].count += s.count;
                        yearlyServiceMap[sName].commission += this.commissionHelper.toNum(s.commission);
                        yearlyServiceMap[sName].mrc += this.commissionHelper.toNum(s.mrc);
                        yearlyServiceMap[sName].dpp += this.commissionHelper.toNum(s.dpp);

                        ['new', 'upgrade', 'prorate', 'recurring'].forEach((key: string) => {
                            const k = key as keyof typeof yearlyDetail;
                            yearlyServiceMap[sName].detail[k].count += s.detail[k].count;
                            yearlyServiceMap[sName].detail[k].commission += this.commissionHelper.toNum(s.detail[k].commission);
                            yearlyServiceMap[sName].detail[k].mrc += this.commissionHelper.toNum(s.detail[k].mrc);
                            yearlyServiceMap[sName].detail[k].dpp += this.commissionHelper.toNum(s.detail[k].dpp);
                        });
                    }
                });
            });

            const yearlyService = Object.values(yearlyServiceMap).map((s: any) => ({
                ...s,
                commission: this.commissionHelper.formatCurrency(s.commission),
                mrc: this.commissionHelper.formatCurrency(s.mrc),
                dpp: this.commissionHelper.formatCurrency(s.dpp),
                detail: {
                    new: { ...s.detail.new, commission: this.commissionHelper.formatCurrency(s.detail.new.commission), mrc: this.commissionHelper.formatCurrency(s.detail.new.mrc), dpp: this.commissionHelper.formatCurrency(s.detail.new.dpp) },
                    upgrade: { ...s.detail.upgrade, commission: this.commissionHelper.formatCurrency(s.detail.upgrade.commission), mrc: this.commissionHelper.formatCurrency(s.detail.upgrade.mrc), dpp: this.commissionHelper.formatCurrency(s.detail.upgrade.dpp) },
                    prorate: { ...s.detail.prorate, commission: this.commissionHelper.formatCurrency(s.detail.prorate.commission), mrc: this.commissionHelper.formatCurrency(s.detail.prorate.mrc), dpp: this.commissionHelper.formatCurrency(s.detail.prorate.dpp) },
                    recurring: { ...s.detail.recurring, commission: this.commissionHelper.formatCurrency(s.detail.recurring.commission), mrc: this.commissionHelper.formatCurrency(s.detail.recurring.mrc), dpp: this.commissionHelper.formatCurrency(s.detail.recurring.dpp) }
                }
            }));

            const finalResult = {
                commission: this.commissionHelper.formatCurrency(yearlyStats.commission),
                bonus: this.commissionHelper.formatCurrency(yearlyBonus),
                totalCommission: this.commissionHelper.formatCurrency(yearlyTotalCommission),
                mrc: this.commissionHelper.formatCurrency(yearlyStats.mrc),
                dpp: this.commissionHelper.formatCurrency(yearlyStats.dpp),
                count: yearlyStats.count,
                detail: {
                    new: { ...yearlyDetail.new, commission: this.commissionHelper.formatCurrency(yearlyDetail.new.commission), mrc: this.commissionHelper.formatCurrency(yearlyDetail.new.mrc), dpp: this.commissionHelper.formatCurrency(yearlyDetail.new.dpp) },
                    upgrade: { ...yearlyDetail.upgrade, commission: this.commissionHelper.formatCurrency(yearlyDetail.upgrade.commission), mrc: this.commissionHelper.formatCurrency(yearlyDetail.upgrade.mrc), dpp: this.commissionHelper.formatCurrency(yearlyDetail.upgrade.dpp) },
                    prorate: { ...yearlyDetail.prorate, commission: this.commissionHelper.formatCurrency(yearlyDetail.prorate.commission), mrc: this.commissionHelper.formatCurrency(yearlyDetail.prorate.mrc), dpp: this.commissionHelper.formatCurrency(yearlyDetail.prorate.dpp) },
                    recurring: { ...yearlyDetail.recurring, commission: this.commissionHelper.formatCurrency(yearlyDetail.recurring.commission), mrc: this.commissionHelper.formatCurrency(yearlyDetail.recurring.mrc), dpp: this.commissionHelper.formatCurrency(yearlyDetail.recurring.dpp) },
                    alat: { ...yearlyDetail.alat, commission: this.commissionHelper.formatCurrency(yearlyDetail.alat.commission), mrc: this.commissionHelper.formatCurrency(yearlyDetail.alat.mrc), dpp: this.commissionHelper.formatCurrency(yearlyDetail.alat.dpp) },
                    setup: { ...yearlyDetail.setup, commission: this.commissionHelper.formatCurrency(yearlyDetail.setup.commission), mrc: this.commissionHelper.formatCurrency(yearlyDetail.setup.mrc), dpp: this.commissionHelper.formatCurrency(yearlyDetail.setup.dpp) }
                },
                service: yearlyService,
                monthly: monthlyData
            };

            return c.json(this.apiResponse.success("Count retrieved successfully", finalResult));
        } catch (error: any) {
            return c.json(this.apiResponse.error("An error occurred", error.message), 500);
        }
    }

    async salesCommissionPeriod(c: Context) {
        try {
            const employeeId = c.req.param("id");
            const { month, year } = c.req.query();

            if (!month || !year) {
                 return c.json(this.apiResponse.error("Missing month or year parameter"), 400);
            }

            const monthInt = parseInt(month as string);
            const yearInt = parseInt(year as string);

            if (isNaN(monthInt) || isNaN(yearInt)) {
                 return c.json(this.apiResponse.error("Invalid month or year parameter"), 400);
            }

            const { startDate, endDate } = period.getStartAndEndDateForMonth(yearInt, monthInt - 1);

            const status = await this.employeeService.getStatusByPeriod(employeeId, startDate, endDate);
            const rows = await this.snapshotService.getSnapshotBySales(employeeId, startDate, endDate);
            
            const stats = this.commissionHelper.initStats();
            const detail = this.commissionHelper.initDetail();
            const serviceMap: Record<string, any> = this.commissionHelper.initServiceMap();
            // 1. First pass: Calculate Activity Count for Achievement
            let nusaSelectaCount = 0;
            let totalNewCount = 0;
            const customerSetupMap: Record<string, boolean> = {};

            rows.forEach((row: any) => {
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

            // 2. Second pass: Calculate commissions and details
            rows.forEach((row: any) => {
                if (row.is_deleted) return;

                    const mrc = this.commissionHelper.toNum(row.mrc);
                    const dpp = this.commissionHelper.toNum(row.dpp);

                    let type = row.type;
                    if (row.category === 'alat') type = 'alat';
                    else if (row.category === 'setup') type = 'setup';
                    else if (!type) type = 'recurring';

                    if (type === 'prorata') type = 'prorate';

                    const months = Number(row.month || 1);
                    const hasSetup = customerSetupMap[row.customer_id] || false;

                    const { commission: calculatedCommission } = CommissionHelper.calculateCommission(
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

                    const commission = calculatedCommission;
                
                const safeType = type as keyof typeof detail;
                const serviceName = this.commissionHelper.getServiceName(row.service_id);

                // Monthly Totals
                stats.count++;
                stats.commission += commission;
                stats.mrc += mrc;
                stats.dpp += dpp;

                // Detail by Type
                if (detail[safeType]) {
                    detail[safeType].count++;
                    detail[safeType].commission += commission;
                    detail[safeType].mrc += mrc;
                    detail[safeType].dpp += dpp;
                }

                // Service Breakdown
                if (serviceMap[serviceName]) {
                    serviceMap[serviceName].count++;
                    serviceMap[serviceName].commission += commission;
                    serviceMap[serviceName].mrc += mrc;
                    serviceMap[serviceName].dpp += dpp;
                    
                    if (serviceMap[serviceName].detail[safeType]) {
                        serviceMap[serviceName].detail[safeType].count++;
                        serviceMap[serviceName].detail[safeType].commission += commission;
                        serviceMap[serviceName].detail[safeType].mrc += mrc;
                        serviceMap[serviceName].detail[safeType].dpp += dpp;
                    }
                }
            });

            const service = Object.values(serviceMap).map((s: any) => ({
                ...s,
                commission: this.commissionHelper.formatCurrency(s.commission),
                mrc: this.commissionHelper.formatCurrency(s.mrc),
                dpp: this.commissionHelper.formatCurrency(s.dpp),
                detail: {
                    new: { ...s.detail.new, commission: this.commissionHelper.formatCurrency(s.detail.new.commission), mrc: this.commissionHelper.formatCurrency(s.detail.new.mrc), dpp: this.commissionHelper.formatCurrency(s.detail.new.dpp) },
                    upgrade: { ...s.detail.upgrade, commission: this.commissionHelper.formatCurrency(s.detail.upgrade.commission), mrc: this.commissionHelper.formatCurrency(s.detail.upgrade.mrc), dpp: this.commissionHelper.formatCurrency(s.detail.upgrade.dpp) },
                    prorate: { ...s.detail.prorate, commission: this.commissionHelper.formatCurrency(s.detail.prorate.commission), mrc: this.commissionHelper.formatCurrency(s.detail.prorate.mrc), dpp: this.commissionHelper.formatCurrency(s.detail.prorate.dpp) },
                    recurring: { ...s.detail.recurring, commission: this.commissionHelper.formatCurrency(s.detail.recurring.commission), mrc: this.commissionHelper.formatCurrency(s.detail.recurring.mrc), dpp: this.commissionHelper.formatCurrency(s.detail.recurring.dpp) }
                }
            }));

            const { achievementStatus, motivation } = this.commissionHelper.calculateAchievement(status as string, activityCount);
            const bonus = this.commissionHelper.calculateBonus(activityCount);
            
            const totalCommission = stats.commission + bonus;
            
            const finalResult = {
                startPeriod: startDate,
                endPeriod: endDate,
                commission: this.commissionHelper.formatCurrency(stats.commission),
                bonus: this.commissionHelper.formatCurrency(bonus),
                totalCommission: this.commissionHelper.formatCurrency(totalCommission),
                mrc: this.commissionHelper.formatCurrency(stats.mrc),
                dpp: this.commissionHelper.formatCurrency(stats.dpp),
                count: stats.count,
                detail: {
                    new: { ...detail.new, commission: this.commissionHelper.formatCurrency(detail.new.commission), mrc: this.commissionHelper.formatCurrency(detail.new.mrc), dpp: this.commissionHelper.formatCurrency(detail.new.dpp) },
                    upgrade: { ...detail.upgrade, commission: this.commissionHelper.formatCurrency(detail.upgrade.commission), mrc: this.commissionHelper.formatCurrency(detail.upgrade.mrc), dpp: this.commissionHelper.formatCurrency(detail.upgrade.dpp) },
                    prorate: { ...detail.prorate, commission: this.commissionHelper.formatCurrency(detail.prorate.commission), mrc: this.commissionHelper.formatCurrency(detail.prorate.mrc), dpp: this.commissionHelper.formatCurrency(detail.prorate.dpp) },
                    recurring: { ...detail.recurring, commission: this.commissionHelper.formatCurrency(detail.recurring.commission), mrc: this.commissionHelper.formatCurrency(detail.recurring.mrc), dpp: this.commissionHelper.formatCurrency(detail.recurring.dpp) },
                    alat: { ...detail.alat, commission: this.commissionHelper.formatCurrency(detail.alat.commission), mrc: this.commissionHelper.formatCurrency(detail.alat.mrc), dpp: this.commissionHelper.formatCurrency(detail.alat.dpp) },
                    setup: { ...detail.setup, commission: this.commissionHelper.formatCurrency(detail.setup.commission), mrc: this.commissionHelper.formatCurrency(detail.setup.mrc), dpp: this.commissionHelper.formatCurrency(detail.setup.dpp) }
                },
                service
            };

            return c.json(this.apiResponse.success("Commission period data retrieved successfully", {
                achievement: {
                    activity: activityCount,
                    type: status,
                    status: achievementStatus,
                    motivation: motivation
                },
                ...finalResult
            }));
        } catch (error: any) {
            return c.json(this.apiResponse.error("An error occurred", error.message), 500);
        }
    }

    async managerCommission(c: Context) {
        try {
            const employeeId = c.req.param("id");
            const yearStr = c.req.query("year");
            const year = yearStr ? Number(yearStr) : new Date().getFullYear();

            const team = await this.employeeService.getHierarchy(employeeId);
            const months = [
                "January", "February", "March", "April", "May", "June",
                "July", "August", "September", "October", "November", "December"
            ];

            const monthlyData: Record<string, any> = {};
            
            // Yearly Totals
            const yearlyTotals = {
                yearlyNewMrc: 0,
                yearlyNewSubscription: 0,
                yearlyNewCommission: 0,
                yearlyRecurringSubscription: 0,
                yearlyRecurringCommission: 0
            };

            for (let i = 0; i < 12; i++) {
                const monthName = months[i];
                const { startDate, endDate } = period.getStartAndEndDateForMonth(year, i);
                
                const monthEmployees: any[] = [];
                const monthTotals = {
                    monthlyNewMrc: 0,
                    monthlyNewSubscription: 0,
                    monthlyNewCommission: 0,
                    monthlyRecurringSubscription: 0,
                    monthlyRecurringCommission: 0
                };

                const monthSales: any = {
                    Permanent: 0,
                    Probation: 0,
                    total: 0,
                    activity: 0,
                    percentage: "0%",
                    status: "Tidak Capai Target"
                };

                for (const member of team) {
                     const rows = await this.snapshotService.getSnapshotBySales(member.employee_id, startDate, endDate);
                     const status = await this.employeeService.getStatusByPeriod(member.employee_id, startDate, endDate);

                     const statsResult: any = this.commissionHelper.calculateEmployeeMonthlyStats(rows, status);
                     
                     const type = statsResult.status || "Permanent";
                     if (type === 'Permanent') {
                         monthSales.Permanent++;
                     } else {
                         monthSales.Probation++;
                     }
                     monthSales.total++;
                     monthSales.activity += statsResult.activityCount;

                     const newDetail = statsResult.detail.new;
                     const recurringDetail = statsResult.detail.recurring;
                     
                     // New Service breakdown
                     const newServices = Object.values(statsResult.serviceMap).map((s: any) => {
                         const n = s.detail.new;
                         if (n.count === 0) return null;
                         return {
                             name: s.name,
                             count: n.count,
                             mrc: this.commissionHelper.formatCurrency(n.mrc),
                             subscription: this.commissionHelper.formatCurrency(n.dpp)
                         };
                     }).filter((s: any) => s !== null);

                     const employeeData = {
                         name: member.name,
                         employeeId: member.employee_id,
                         photoProfile: member.photo_profile,
                         achievement: {
                             activity: statsResult.activityCount,
                             type: statsResult.status || "Permanent",
                             status: statsResult.achievementStatus
                         },
                         newService: newServices,
                         newMrc: this.commissionHelper.formatCurrency(newDetail.mrc),
                         newSubscription: this.commissionHelper.formatCurrency(newDetail.dpp),
                         newCommission: this.commissionHelper.formatCurrency(newDetail.commission),
                         recurringSubscription: this.commissionHelper.formatCurrency(recurringDetail.dpp),
                         recurringCommission: this.commissionHelper.formatCurrency(recurringDetail.commission)
                     };

                     monthEmployees.push(employeeData);

                     // Accumulate Month Totals
                     monthTotals.monthlyNewMrc += newDetail.mrc;
                     monthTotals.monthlyNewSubscription += newDetail.dpp;
                     monthTotals.monthlyNewCommission += newDetail.commission;
                     monthTotals.monthlyRecurringSubscription += recurringDetail.dpp;
                     monthTotals.monthlyRecurringCommission += recurringDetail.commission;
                }

                let percentageVal = 0;
                if (monthSales.Permanent === 0 && monthSales.Probation === 0) {
                     percentageVal = 0;
                } else if (monthSales.Permanent === 0 && monthSales.Probation !== 0) {
                     percentageVal = 100;
                } else {
                     const target = monthSales.Permanent * 12;
                     percentageVal = (monthSales.activity / target) * 100;
                }
                
                const targetPercentage = this.commissionHelper.getTeamTargetThreshold(monthSales.total);

                monthSales.percentage = percentageVal.toFixed(2) + "%";
                monthSales.status = percentageVal >= targetPercentage ? "Capai Target" : "Tidak Capai Target";

                const managerAchievement = this.commissionHelper.calculateManagerCommission(
                    percentageVal,
                    monthTotals.monthlyNewCommission,
                    monthTotals.monthlyRecurringSubscription,
                    monthSales.status
                );

                monthlyData[monthName] = {
                    startDate,
                    endDate,
                    sales: monthSales,
                    monthlyNewMrc: this.commissionHelper.formatCurrency(monthTotals.monthlyNewMrc),
                    monthlyNewSubscription: this.commissionHelper.formatCurrency(monthTotals.monthlyNewSubscription),
                    monthlyNewCommission: this.commissionHelper.formatCurrency(monthTotals.monthlyNewCommission),
                    monthlyRecurringSubscription: this.commissionHelper.formatCurrency(monthTotals.monthlyRecurringSubscription),
                    monthlyRecurringCommission: this.commissionHelper.formatCurrency(monthTotals.monthlyRecurringCommission),
                    achievement: {
                        newCommission: this.commissionHelper.formatCurrency(managerAchievement.newCommission),
                        recurringCommission: this.commissionHelper.formatCurrency(managerAchievement.recurringCommission),
                        totalCommission: this.commissionHelper.formatCurrency(managerAchievement.totalCommission)
                    },
                    employee: monthEmployees
                };

                // Accumulate Yearly
                yearlyTotals.yearlyNewMrc += monthTotals.monthlyNewMrc;
                yearlyTotals.yearlyNewSubscription += monthTotals.monthlyNewSubscription;
                yearlyTotals.yearlyNewCommission += monthTotals.monthlyNewCommission;
                yearlyTotals.yearlyRecurringSubscription += monthTotals.monthlyRecurringSubscription;
                yearlyTotals.yearlyRecurringCommission += monthTotals.monthlyRecurringCommission;
            }

            const response = {
                yearlyNewMrc: this.commissionHelper.formatCurrency(yearlyTotals.yearlyNewMrc),
                yearlyNewSubscription: this.commissionHelper.formatCurrency(yearlyTotals.yearlyNewSubscription),
                yearlyNewCommission: this.commissionHelper.formatCurrency(yearlyTotals.yearlyNewCommission),
                yearlyRecurringSubscription: this.commissionHelper.formatCurrency(yearlyTotals.yearlyRecurringSubscription),
                yearlyRecurringCommission: this.commissionHelper.formatCurrency(yearlyTotals.yearlyRecurringCommission),
                monthly: monthlyData
            };
            
            return c.json(this.apiResponse.success("Chart retrieved successfully", response));

        } catch (error: any) {
            return c.json(this.apiResponse.error("An error occurred", error.message), 500);
        }
    }

    async managerCommissionPeriod(c: Context) {
        try {
            const employeeId = c.req.param("id");
            const { month, year } = c.req.query();

            if (!month || !year) {
                 return c.json(this.apiResponse.error("Missing month or year parameter"), 400);
            }

            const monthInt = parseInt(month as string);
            const yearInt = parseInt(year as string);

            if (isNaN(monthInt) || isNaN(yearInt)) {
                 return c.json(this.apiResponse.error("Invalid month or year parameter"), 400);
            }

            const { startDate, endDate } = period.getStartAndEndDateForMonth(yearInt, monthInt - 1);
            const team = await this.employeeService.getHierarchy(employeeId);

            const monthEmployees: any[] = [];
            const monthTotals = {
                monthlyNewMrc: 0,
                monthlyNewSubscription: 0,
                monthlyNewCommission: 0,
                monthlyRecurringSubscription: 0,
                monthlyRecurringCommission: 0
            };

            const monthSales: any = {
                Permanent: 0,
                Probation: 0,
                total: 0,
                activity: 0,
                percentage: "0%",
                status: "Tidak Capai Target"
            };

            for (const member of team) {
                    const rows = await this.snapshotService.getSnapshotBySales(member.employee_id, startDate, endDate);
                    const status = await this.employeeService.getStatusByPeriod(member.employee_id, startDate, endDate);

                    const statsResult: any = this.commissionHelper.calculateEmployeeMonthlyStats(rows, status);
                    
                    const type = statsResult.status || "Permanent";
                    if (type === 'Permanent') {
                        monthSales.Permanent++;
                    } else {
                        monthSales.Probation++;
                    }
                    monthSales.total++;
                    monthSales.activity += statsResult.activityCount;

                    const newDetail = statsResult.detail.new;
                    const recurringDetail = statsResult.detail.recurring;
                    
                    // New Service breakdown
                    const newServices = Object.values(statsResult.serviceMap).map((s: any) => {
                        const n = s.detail.new;
                        if (n.count === 0) return null;
                        return {
                            name: s.name,
                            count: n.count,
                            mrc: this.commissionHelper.formatCurrency(n.mrc),
                            subscription: this.commissionHelper.formatCurrency(n.dpp)
                        };
                    }).filter((s: any) => s !== null);

                    const employeeData = {
                        name: member.name,
                        employeeId: member.employee_id,
                        photoProfile: member.photo_profile,
                        achievement: {
                            activity: statsResult.activityCount,
                            type: statsResult.status || "Permanent",
                            status: statsResult.achievementStatus
                        },
                        newService: newServices,
                        newMrc: this.commissionHelper.formatCurrency(newDetail.mrc),
                        newSubscription: this.commissionHelper.formatCurrency(newDetail.dpp),
                        newCommission: this.commissionHelper.formatCurrency(newDetail.commission),
                        recurringSubscription: this.commissionHelper.formatCurrency(recurringDetail.dpp),
                        recurringCommission: this.commissionHelper.formatCurrency(recurringDetail.commission)
                    };

                    monthEmployees.push(employeeData);

                    // Accumulate Month Totals
                    monthTotals.monthlyNewMrc += newDetail.mrc;
                    monthTotals.monthlyNewSubscription += newDetail.dpp;
                    monthTotals.monthlyNewCommission += newDetail.commission;
                    monthTotals.monthlyRecurringSubscription += recurringDetail.dpp;
                    monthTotals.monthlyRecurringCommission += recurringDetail.commission;
            }

            let percentageVal = 0;
            if (monthSales.Permanent === 0 && monthSales.Probation === 0) {
                 percentageVal = 0;
            } else if (monthSales.Permanent === 0 && monthSales.Probation !== 0) {
                 percentageVal = 100;
            } else {
                 const target = monthSales.Permanent * 12;
                 percentageVal = (monthSales.activity / target) * 100;
            }
            
            const targetPercentage = this.commissionHelper.getTeamTargetThreshold(monthSales.total);

            monthSales.percentage = percentageVal.toFixed(2) + "%";
            monthSales.status = percentageVal >= targetPercentage ? "Capai Target" : "Tidak Capai Target";

            const managerAchievement = this.commissionHelper.calculateManagerCommission(
                percentageVal,
                monthTotals.monthlyNewCommission,
                monthTotals.monthlyRecurringSubscription,
                monthSales.status
            );

            const response = {
                startDate,
                endDate,
                sales: monthSales,
                monthlyNewMrc: this.commissionHelper.formatCurrency(monthTotals.monthlyNewMrc),
                monthlyNewSubscription: this.commissionHelper.formatCurrency(monthTotals.monthlyNewSubscription),
                monthlyNewCommission: this.commissionHelper.formatCurrency(monthTotals.monthlyNewCommission),
                monthlyRecurringSubscription: this.commissionHelper.formatCurrency(monthTotals.monthlyRecurringSubscription),
                monthlyRecurringCommission: this.commissionHelper.formatCurrency(monthTotals.monthlyRecurringCommission),
                achievement: {
                    newCommission: this.commissionHelper.formatCurrency(managerAchievement.newCommission),
                    recurringCommission: this.commissionHelper.formatCurrency(managerAchievement.recurringCommission),
                    totalCommission: this.commissionHelper.formatCurrency(managerAchievement.totalCommission)
                },
                employee: monthEmployees
            };
            
            return c.json(this.apiResponse.success("Manager commission period data retrieved successfully", response));
            
        } catch (error: any) {
            return c.json(this.apiResponse.error("An error occurred", error.message), 500);
        }
    }
}
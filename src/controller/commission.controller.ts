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

                let achievementStatus = "N/A";
                let motivation = "N/A";

                if (status === 'Permanent') {
                    if (activityCount >= 15) {
                        achievementStatus = "Capai target Bonus";
                        motivation = "Congratulations on your outstanding achievement!";
                    } else if (activityCount >= 12) {
                        achievementStatus = "Capai target";
                        motivation = "Bravo! Keep up the great work!";
                    } else if (activityCount < 3) {
                        achievementStatus = "SP1";
                        motivation = "Keep fighting and don't give up!";
                    } else {
                        achievementStatus = "Tidak Capai target";
                        motivation = "Just a little more fights, go on!";
                    }
                } else if (status === 'Probation') {
                    if (activityCount >= 8) {
                        achievementStatus = "Excelent";
                        motivation = "Congratulations on your outstanding achievement!";
                    } else if (activityCount >= 5) {
                        achievementStatus = "Very Good";
                        motivation = "Bravo! Keep up the great work!";
                    } else if (activityCount >= 3) {
                        achievementStatus = "Average";
                        motivation = "You’re much better than what you think!";
                    } else {
                        achievementStatus = "Below Average";
                        motivation = "Keep pushing!";
                    }
                }

                // Commission Bonus Logic (stays based on original count or activity count? 
                // The prompt says "dapat diklaim menjadi 1 New Service yang masuk ke target bulanan" which implies it affects target/achievement.
                // Assuming bonus calculation uses the same activity count or still raw count?
                // Usually bonus is tied to achievement/target. Let's use activityCount.
                
                let bonus = 0;
                // Using activityCount for bonus thresholds as it reflects "target"
                if (activityCount >= 15) {
                    if (activityCount > 20) {
                        bonus = 1500000 + ((activityCount - 20) * 150000);
                    } else if (activityCount === 20) {
                        bonus = 1500000;
                    } else if (activityCount >= 17) {
                        bonus = 1000000;
                    } else if (activityCount >= 15) {
                        bonus = 500000;
                    }
                }
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

            let achievementStatus = "N/A";
            let motivation = "N/A";
            let bonus = 0;

            if (activityCount >= 15) {
                if (activityCount > 20) {
                     bonus = 1500000 + ((activityCount - 20) * 150000);
                } else if (activityCount === 20) {
                    bonus = 1500000;
                } else if (activityCount >= 17) {
                    bonus = 1000000;
                } else if (activityCount >= 15) {
                    bonus = 500000;
                }
            }

            if (status === 'Permanent') {
                if (activityCount >= 15) {
                    achievementStatus = "Capai target Bonus";
                    motivation = "Congratulations on your outstanding achievement!";
                } else if (activityCount >= 12) {
                    achievementStatus = "Capai target";
                    motivation = "Bravo! Keep up the great work!";
                } else if (activityCount < 3) {
                    achievementStatus = "SP1";
                    motivation = "Keep fighting and don't give up!";
                } else {
                    achievementStatus = "Tidak Capai target";
                    motivation = "Just a little more fights, go on!";
                }
            } else if (status === 'Probation' || status === 'Contract') {
                if (activityCount >= 8) {
                    achievementStatus = "Excelent";
                    motivation = "Congratulations on your outstanding achievement!";
                } else if (activityCount >= 5) {
                    achievementStatus = "Very Good";
                    motivation = "Bravo! Keep up the great work!";
                } else if (activityCount >= 3) {
                    achievementStatus = "Average";
                    motivation = "You’re much better than what you think!";
                } else {
                    achievementStatus = "Below Average";
                    motivation = "Keep pushing!";
                }
            }
            
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

}
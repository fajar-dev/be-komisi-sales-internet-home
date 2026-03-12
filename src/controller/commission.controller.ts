import { Context } from "hono";
import { ApiResponseHandler } from "../helper/api-response";
import { CommissionHelper } from "../helper/commission.helper";
import { IsService } from "../service/is.service";
import { EmployeeService } from "../service/employee.service";
import { SnapshotService } from "../service/snapshot.service";
import { ChurnService } from "../service/churn.service";
import { period } from "../helper/period";

export class CommissionController {
    constructor(
        private snapshotService = SnapshotService,  
        private employeeService = EmployeeService,
        private isService = IsService,
        private churnService = ChurnService,
        private commissionHelper = CommissionHelper,
        private apiResponse = ApiResponseHandler,
    ) {}

    async salesCommission(c: Context) {
        try {
            const employeeId = c.req.param("id");
            const yearStr = c.req.query("year");

            if (!employeeId || !yearStr) {
                return c.json(this.apiResponse.error("Missing employee ID or year parameter"), 400);
            }

            const year = Number(yearStr);

            const annual = await this.commissionHelper.processAnnualCommission(year, async (startDate, endDate) => {
                const rows = await this.snapshotService.getSnapshotBySales(employeeId, startDate, endDate);
                const status = await this.employeeService.getStatusByPeriod(employeeId, startDate, endDate);
                
                const stats = this.commissionHelper.initStats();
                const detail = this.commissionHelper.initDetail();
                const serviceMap: Record<string, any> = this.commissionHelper.initServiceMap();

                // 1. Identify Setup Categories and Initial New Counts
                let initialNusaSelectaCount = 0;
                let initialTotalNewCount = 0;
                const customerSetupMap: Record<string, boolean> = {};

                rows.forEach((row: any) => {
                     if (row.is_deleted) return;
                     const serviceName = this.commissionHelper.getServiceName(row.service_id);
                     let type = row.type || 'recurring';
                     if (row.category === 'alat') type = 'alat';
                     else if (row.category === 'setup') type = 'setup';
                     if (type === 'prorata') type = 'prorate';
                     
                     if (type === 'new') {
                         initialTotalNewCount++;
                         if (serviceName === 'NusaSelecta' && row.service_id !== 'NFSP200') {
                            initialNusaSelectaCount++;
                         }
                     }
                     if (type === 'setup') customerSetupMap[row.customer_id] = true;
                });

                // 2. Fetch and Process Churn for Achievement
                const churnRows = await ChurnService.getChurnByEmployeeId(employeeId as string, startDate, endDate);
                let netTotalNewCount = initialTotalNewCount;
                let netNusaSelectaCount = initialNusaSelectaCount;
                const churnNewCounts: Record<string, number> = { 'Home': 0, 'Nusafiber': 0, 'NusaSelecta': 0 };

                churnRows.forEach((row: any) => {
                    if (row.is_approved) return;
                    const sName = this.commissionHelper.getServiceName(row.service_id);
                    netTotalNewCount--;
                    if (sName === 'NusaSelecta' && row.service_id !== 'NFSP200') {
                        netNusaSelectaCount--;
                    }
                    if (churnNewCounts[sName] !== undefined) churnNewCounts[sName]++;
                });

                const activityCount = Math.max(0, (netTotalNewCount - netNusaSelectaCount) + Math.floor(netNusaSelectaCount / 2));
                const { achievementStatus, motivation } = this.commissionHelper.calculateAchievement(status as string, activityCount);
                const bonus = this.commissionHelper.calculateBonus(activityCount);

                // 3. Calculate Commissions from regular rows
                rows.forEach((row: any) => {
                    if (row.is_deleted) return;

                    const mrc = this.commissionHelper.toNum(row.mrc);
                    const dpp = this.commissionHelper.toNum(row.dpp);
                    const referralFee = this.commissionHelper.toNum(row.referral_fee);
                    const commissionBasis = (row.referral_type === 'Cashback' || row.referral_type === 'Monthly') ? (dpp - referralFee) : dpp;
                    const typeForPenalty = (row.category === 'alat') ? 'alat' : (row.category === 'setup' ? 'setup' : (row.type === 'prorata' ? 'prorate' : (row.type || 'recurring')));
                    const effectiveDpp = this.commissionHelper.applyLateMonthPenalty(commissionBasis, row.late_month, row.is_approved, typeForPenalty);

                    let type = row.type || 'recurring';
                    if (row.category === 'alat') type = 'alat';
                    else if (row.category === 'setup') type = 'setup';
                    if (type === 'prorata') type = 'prorate';

                    const months = Number(row.month || 1);
                    const hasSetup = customerSetupMap[row.customer_id] || false; 

                    const { commission } = CommissionHelper.calculateCommission(row, commissionBasis, months, row.service_id, row.category, type, status as string, activityCount, hasSetup, row.late_month);

                    const safeType = type as keyof typeof detail;
                    const serviceName = this.commissionHelper.getServiceName(row.service_id);
                    const isNusaSelectaNew = serviceName === 'NusaSelecta' && row.service_id !== 'NFSP200' && type === 'new';

                    // Totals
                    if (!isNusaSelectaNew) stats.count++;
                    stats.commission += commission;
                    stats.mrc += mrc;
                    stats.dpp += dpp;

                    if (detail[safeType]) {
                        if (!isNusaSelectaNew) detail[safeType].count++;
                        detail[safeType].commission += commission;
                        detail[safeType].mrc += mrc;
                        detail[safeType].dpp += dpp;
                    }

                    if (serviceMap[serviceName]) {
                        if (!isNusaSelectaNew) serviceMap[serviceName].count++;
                        serviceMap[serviceName].commission += commission;
                        serviceMap[serviceName].mrc += mrc;
                        serviceMap[serviceName].dpp += dpp;
                        if (serviceMap[serviceName].detail[safeType]) {
                            if (!isNusaSelectaNew) serviceMap[serviceName].detail[safeType].count++;
                            serviceMap[serviceName].detail[safeType].commission += commission;
                            serviceMap[serviceName].detail[safeType].mrc += mrc;
                            serviceMap[serviceName].detail[safeType].dpp += dpp;
                        }
                    }
                });

                // Add NusaSelecta Pairs to stats
                const nusaSelectaPairsRaw = Math.floor(initialNusaSelectaCount / 2);
                stats.count += nusaSelectaPairsRaw;
                detail.new.count += nusaSelectaPairsRaw;
                if (serviceMap['NusaSelecta']) {
                    serviceMap['NusaSelecta'].count += nusaSelectaPairsRaw;
                    serviceMap['NusaSelecta'].detail.new.count += nusaSelectaPairsRaw;
                }

                // 4. Subtract Churn
                let totalChurnMrc = 0;
                let totalChurnCommission = 0;
                let totalChurnSubscription = 0;
                churnRows.forEach((row: any) => {
                    if (row.is_approved) return;
                    const sName = this.commissionHelper.getServiceName(row.service_id);
                    const price = this.commissionHelper.toNum(row.price);
                    const periodVal = Math.max(this.commissionHelper.toNum(row.period), 1);
                    const mrc = price / periodVal;
                    
                    const { commission } = CommissionHelper.calculateCommission(row, price, periodVal, row.service_id, 'home', 'new', status || '', 12);
                    
                    totalChurnMrc += mrc;
                    totalChurnCommission += commission;
                    totalChurnSubscription += price;

                    stats.count--;
                    stats.commission -= commission;
                    stats.mrc -= mrc;
                    stats.dpp -= price;

                    if (detail.new) {
                        detail.new.count--;
                        detail.new.commission -= commission;
                        detail.new.mrc -= mrc;
                        detail.new.dpp -= price;
                    }

                    if (serviceMap[sName]) {
                        serviceMap[sName].count--;
                        serviceMap[sName].commission -= commission;
                        serviceMap[sName].mrc -= mrc;
                        serviceMap[sName].dpp -= price;
                        if (serviceMap[sName].detail && serviceMap[sName].detail.new) {
                            serviceMap[sName].detail.new.count--;
                            serviceMap[sName].detail.new.commission -= commission;
                            serviceMap[sName].detail.new.mrc -= mrc;
                            serviceMap[sName].detail.new.dpp -= price;
                        }
                    }
                });

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
                        deduction: {
                            mrc: this.commissionHelper.formatCurrency(totalChurnMrc),
                            commission: this.commissionHelper.formatCurrency(totalChurnCommission),
                            subscription: this.commissionHelper.formatCurrency(totalChurnSubscription),
                            new: Object.entries(churnNewCounts).map(([name, count]) => ({ name, count }))
                        },
                        service
                    }
                } as any;
            });

            // Aggregate Yearly Data
            const yearlyStats = this.commissionHelper.initStats();
            let yearlyBonus = 0;
            let yearlyTotalCommission = 0;
            let yearlyChurnMrc = 0;
            let yearlyChurnCommission = 0;
            let yearlyChurnSubscription = 0;
            const yearlyChurnNewCounts: Record<string, number> = { 'Home': 0, 'Nusafiber': 0, 'NusaSelecta': 0 };
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
                yearlyChurnMrc += this.commissionHelper.toNum(mData.deduction.mrc);
                yearlyChurnCommission += this.commissionHelper.toNum(mData.deduction.commission);
                yearlyChurnSubscription += this.commissionHelper.toNum(mData.deduction.subscription);
                
                if (mData.deduction.new && Array.isArray(mData.deduction.new)) {
                    mData.deduction.new.forEach((item: { name: string, count: number }) => {
                        if (yearlyChurnNewCounts[item.name] !== undefined) {
                            yearlyChurnNewCounts[item.name] += item.count;
                        }
                    });
                }

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
                deduction: {
                    mrc: this.commissionHelper.formatCurrency(yearlyChurnMrc),
                    commission: this.commissionHelper.formatCurrency(yearlyChurnCommission),
                    subscription: this.commissionHelper.formatCurrency(yearlyChurnSubscription),
                    new: Object.entries(yearlyChurnNewCounts).map(([name, count]) => ({ name, count }))
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

            const status = await this.employeeService.getStatusByPeriod(employeeId as string, startDate, endDate);
            const rows = await this.snapshotService.getSnapshotBySales(employeeId as string, startDate, endDate);
            
            const stats = this.commissionHelper.initStats();
            const detail = this.commissionHelper.initDetail();
            const serviceMap: Record<string, any> = this.commissionHelper.initServiceMap();

            // 1. Identify Setup Categories and Initial New Counts
            let initialNusaSelectaCount = 0;
            let initialTotalNewCount = 0;
            const customerSetupMap: Record<string, boolean> = {};

            rows.forEach((row: any) => {
                 if (row.is_deleted) return;
                 const serviceName = this.commissionHelper.getServiceName(row.service_id);
                 let type = row.type || 'recurring';
                 if (row.category === 'alat') type = 'alat';
                 else if (row.category === 'setup') type = 'setup';
                 if (type === 'prorata') type = 'prorate';
                 
                 if (type === 'new') {
                     initialTotalNewCount++;
                     if (serviceName === 'NusaSelecta' && row.service_id !== 'NFSP200') {
                        initialNusaSelectaCount++;
                     }
                 }
                 if (type === 'setup') customerSetupMap[row.customer_id] = true;
            });

            // 2. Fetch and Process Churn for Achievement
            const churnRows = await ChurnService.getChurnByEmployeeId(employeeId as string, startDate, endDate);
            let netTotalNewCount = initialTotalNewCount;
            let netNusaSelectaCount = initialNusaSelectaCount;
            const churnNewCounts: Record<string, number> = { 'Home': 0, 'Nusafiber': 0, 'NusaSelecta': 0 };

            churnRows.forEach((row: any) => {
                if (row.is_approved) return;
                const sName = this.commissionHelper.getServiceName(row.service_id);
                netTotalNewCount--;
                if (sName === 'NusaSelecta' && row.service_id !== 'NFSP200') {
                    netNusaSelectaCount--;
                }
                if (churnNewCounts[sName] !== undefined) churnNewCounts[sName]++;
            });

            const activityCount = Math.max(0, (netTotalNewCount - netNusaSelectaCount) + Math.floor(netNusaSelectaCount / 2));
            const { achievementStatus, motivation } = this.commissionHelper.calculateAchievement(status as string, activityCount);
            const bonus = this.commissionHelper.calculateBonus(activityCount);

            // 3. Second pass: Calculate commissions and details
            rows.forEach((row: any) => {
                if (row.is_deleted) return;

                const mrc = this.commissionHelper.toNum(row.mrc);
                const dpp = this.commissionHelper.toNum(row.dpp);
                const referralFee = this.commissionHelper.toNum(row.referral_fee);
                const commissionBasis = (row.referral_type === 'Cashback' || row.referral_type === 'Monthly') ? (dpp - referralFee) : dpp;
                let type = row.type || 'recurring';
                if (row.category === 'alat') type = 'alat';
                else if (row.category === 'setup') type = 'setup';
                if (type === 'prorata') type = 'prorate';

                const effectiveDpp = this.commissionHelper.applyLateMonthPenalty(commissionBasis, row.late_month, row.is_approved, type);

                const months = Number(row.month || 1);
                const hasSetup = customerSetupMap[row.customer_id] || false;

                const { commission } = CommissionHelper.calculateCommission(row, commissionBasis, months, row.service_id, row.category, type, status as string, activityCount, hasSetup, row.late_month);

                const safeType = type as keyof typeof detail;
                const serviceName = this.commissionHelper.getServiceName(row.service_id);
                const isNusaSelectaNew = serviceName === 'NusaSelecta' && row.service_id !== 'NFSP200' && type === 'new';

                if (!isNusaSelectaNew) stats.count++;
                stats.commission += commission;
                stats.mrc += mrc;
                stats.dpp += dpp;

                if (detail[safeType]) {
                    if (!isNusaSelectaNew) detail[safeType].count++;
                    detail[safeType].commission += commission;
                    detail[safeType].mrc += mrc;
                    detail[safeType].dpp += dpp;
                }

                if (serviceMap[serviceName]) {
                    if (!isNusaSelectaNew) serviceMap[serviceName].count++;
                    serviceMap[serviceName].commission += commission;
                    serviceMap[serviceName].mrc += mrc;
                    serviceMap[serviceName].dpp += dpp;
                    if (serviceMap[serviceName].detail[safeType]) {
                        if (!isNusaSelectaNew) serviceMap[serviceName].detail[safeType].count++;
                        serviceMap[serviceName].detail[safeType].commission += commission;
                        serviceMap[serviceName].detail[safeType].mrc += mrc;
                        serviceMap[serviceName].detail[safeType].dpp += dpp;
                    }
                }
            });

            // NusaSelecta new pairs adjustment for display
            const initialNusaSelectaPairs = Math.floor(initialNusaSelectaCount / 2);
            stats.count += initialNusaSelectaPairs;
            detail.new.count += initialNusaSelectaPairs;
            if (serviceMap['NusaSelecta']) {
                serviceMap['NusaSelecta'].count += initialNusaSelectaPairs;
                serviceMap['NusaSelecta'].detail.new.count += initialNusaSelectaPairs;
            }

            // 4. Process churn amounts subtraction
            let totalChurnMrc = 0;
            let totalChurnCommission = 0;
            let totalChurnSubscription = 0;
            churnRows.forEach((row: any) => {
                if (row.is_approved) return;
                const sName = this.commissionHelper.getServiceName(row.service_id);
                const price = this.commissionHelper.toNum(row.price);
                const periodVal = Math.max(this.commissionHelper.toNum(row.period), 1);
                const mrc = price / periodVal;
                
                const { commission } = CommissionHelper.calculateCommission(row, price, periodVal, row.service_id, 'home', 'new', status || '', 12);
                
                totalChurnMrc += mrc;
                totalChurnCommission += commission;
                totalChurnSubscription += price;

                stats.count--;
                stats.commission -= commission;
                stats.mrc -= mrc;
                stats.dpp -= price;

                if (detail.new) {
                    detail.new.count--;
                    detail.new.commission -= commission;
                    detail.new.mrc -= mrc;
                    detail.new.dpp -= price;
                }

                if (serviceMap[sName]) {
                    serviceMap[sName].count--;
                    serviceMap[sName].commission -= commission;
                    serviceMap[sName].mrc -= mrc;
                    serviceMap[sName].dpp -= price;
                    if (serviceMap[sName].detail && serviceMap[sName].detail.new) {
                        serviceMap[sName].detail.new.count--;
                        serviceMap[sName].detail.new.commission -= commission;
                        serviceMap[sName].detail.new.mrc -= mrc;
                        serviceMap[sName].detail.new.dpp -= price;
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
                deduction: {
                    mrc: this.commissionHelper.formatCurrency(totalChurnMrc),
                    commission: this.commissionHelper.formatCurrency(totalChurnCommission),
                    subscription: this.commissionHelper.formatCurrency(totalChurnSubscription),
                    new: Object.entries(churnNewCounts).map(([name, count]) => ({ name, count }))
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

            if (!employeeId) {
                return c.json(this.apiResponse.error("Missing employee ID parameter"), 400);
            }

            const year = yearStr ? Number(yearStr) : new Date().getFullYear();

            const team = await this.employeeService.getHierarchy(employeeId, "", false, false);
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
                     const rows = await this.snapshotService.getSnapshotBySales(member.employee_id as string, startDate, endDate);
                     const status = await this.employeeService.getStatusByPeriod(member.employee_id as string, startDate, endDate);

                     if (!status) continue;

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
                     // New Service breakdown
                     const newServices = Object.values(statsResult.serviceMap).map((s: any) => {
                         const n = s.detail.new;
                         return {
                             name: s.name,
                             count: n.count,
                             mrc: this.commissionHelper.formatCurrency(n.mrc),
                             subscription: this.commissionHelper.formatCurrency(n.dpp)
                         };
                     });

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
                         recurringCommission: this.commissionHelper.formatCurrency(recurringDetail.commission),
                         _rawNewSubscription: newDetail.dpp,
                         _rawNewCommission: newDetail.commission,
                         _rawRecurringSubscription: recurringDetail.dpp
                     };

                     // Only show if active or has data
                     if (statsResult.activityCount > 0 || recurringDetail.commission > 0 || member.is_active) {
                        monthEmployees.push(employeeData);
                     }

                     // Accumulate Month Totals
                     monthTotals.monthlyNewMrc += newDetail.mrc;
                     monthTotals.monthlyNewSubscription += newDetail.dpp;
                     monthTotals.monthlyNewCommission += newDetail.commission;
                     monthTotals.monthlyRecurringSubscription += recurringDetail.dpp;
                     monthTotals.monthlyRecurringCommission += recurringDetail.commission;
                }

                const performance = this.commissionHelper.calculateManagerMonthlyPerformance(monthSales);
                monthSales.percentage = performance.percentage;
                monthSales.target = performance.target;
                monthSales.status = performance.status;
                const percentageVal = performance.percentageVal;

                const managerAchievement = this.commissionHelper.calculateManagerCommission(
                    percentageVal,
                    monthTotals.monthlyNewCommission,
                    monthTotals.monthlyRecurringSubscription,
                    monthSales.status
                );

                const finalMonthEmployees = monthEmployees.map((emp: any) => ({
                    ...emp,
                    managerNewCommission: this.commissionHelper.formatCurrency(emp._rawNewCommission * (managerAchievement.rates.new / 100)),
                    managerNewCommissionPercentage: this.commissionHelper.formatCurrency(managerAchievement.rates.new),
                    managerRecurringCommission: this.commissionHelper.formatCurrency(emp._rawRecurringSubscription * (managerAchievement.rates.recurring / 100)),
                    managerRecurringCommissionPercentage: this.commissionHelper.formatCurrency(managerAchievement.rates.recurring)
                })).map(({ _rawNewSubscription, _rawNewCommission, _rawRecurringSubscription, ...emp }) => emp);

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
                        newCommissionPercentage: this.commissionHelper.formatCurrency(managerAchievement.rates.new),
                        newCommission: this.commissionHelper.formatCurrency(managerAchievement.newCommission),
                        recurringCommissionPercentage: this.commissionHelper.formatCurrency(managerAchievement.rates.recurring),
                        recurringCommission: this.commissionHelper.formatCurrency(managerAchievement.recurringCommission),
                        totalCommission: this.commissionHelper.formatCurrency(managerAchievement.totalCommission)
                    },
                    employee: finalMonthEmployees
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
            const team = await this.employeeService.getHierarchy(employeeId as string, "", false, false);

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
                    const [rows, churnRows, status] = await Promise.all([
                        this.snapshotService.getSnapshotBySales(member.employee_id as string, startDate, endDate),
                        this.churnService.getChurnByEmployeeId(member.employee_id as string, startDate, endDate),
                        this.employeeService.getStatusByPeriod(member.employee_id as string, startDate, endDate)
                    ]);

                    if (!status) continue;

                    const statsResult: any = this.commissionHelper.calculateEmployeeMonthlyStats(rows, status, churnRows);
                    
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
                        return {
                            name: s.name,
                            count: n.count,
                            mrc: this.commissionHelper.formatCurrency(n.mrc),
                            subscription: this.commissionHelper.formatCurrency(n.dpp)
                        };
                    });

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
                        recurringCommission: this.commissionHelper.formatCurrency(recurringDetail.commission),
                        _rawNewSubscription: newDetail.dpp,
                        _rawNewCommission: newDetail.commission,
                        _rawRecurringSubscription: recurringDetail.dpp
                    };

                    // Only show if active or has data
                    if (statsResult.activityCount > 0 || recurringDetail.commission > 0 || member.is_active) {
                        monthEmployees.push(employeeData);
                    }

                    // Accumulate Month Totals
                    monthTotals.monthlyNewMrc += newDetail.mrc;
                    monthTotals.monthlyNewSubscription += newDetail.dpp;
                    monthTotals.monthlyNewCommission += newDetail.commission;
                    monthTotals.monthlyRecurringSubscription += recurringDetail.dpp;
                    monthTotals.monthlyRecurringCommission += recurringDetail.commission;
            }

            const performance = this.commissionHelper.calculateManagerMonthlyPerformance(monthSales);
            monthSales.percentage = performance.percentage;
            monthSales.target = performance.target;
            monthSales.status = performance.status;
            const percentageVal = performance.percentageVal;

            const managerAchievement = this.commissionHelper.calculateManagerCommission(
                percentageVal,
                monthTotals.monthlyNewCommission,
                monthTotals.monthlyRecurringSubscription,
                monthSales.status
            );

            const finalMonthEmployees = monthEmployees.map((emp: any) => ({
                ...emp,
                managerNewCommission: this.commissionHelper.formatCurrency(emp._rawNewCommission * (managerAchievement.rates.new / 100)),
                managerNewCommissionPercentage: this.commissionHelper.formatCurrency(managerAchievement.rates.new),
                managerRecurringCommission: this.commissionHelper.formatCurrency(emp._rawRecurringSubscription * (managerAchievement.rates.recurring / 100)),
                managerRecurringCommissionPercentage: this.commissionHelper.formatCurrency(managerAchievement.rates.recurring)
            })).map(({ _rawNewSubscription, _rawNewCommission, _rawRecurringSubscription, ...emp }) => emp);

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
                    newCommissionPercentage: this.commissionHelper.formatCurrency(managerAchievement.rates.new),
                    newCommission: this.commissionHelper.formatCurrency(managerAchievement.newCommission),
                    recurringCommissionPercentage: this.commissionHelper.formatCurrency(managerAchievement.rates.recurring),
                    recurringCommission: this.commissionHelper.formatCurrency(managerAchievement.recurringCommission),
                    totalCommission: this.commissionHelper.formatCurrency(managerAchievement.totalCommission)
                },
                employee: finalMonthEmployees
            };
            
            return c.json(this.apiResponse.success("Manager commission period data retrieved successfully", response));
            
        } catch (error: any) {
            return c.json(this.apiResponse.error("An error occurred", error.message), 500);
        }
    }
}
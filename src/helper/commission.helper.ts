import { period } from "./period";

export class CommissionHelper {
    static formatCurrency(val: number) {
        return val.toFixed(2);
    }

    static toNum(val: any) {
        return Number(val || 0);
    }

    static getServiceName(id: string) {
        if (!id) return 'Home';
        const code = id.toUpperCase();
        const nusafiberCodes = ['BFLITE'];
        const nusaSelectaCodes = ['NFSP030', 'NFSP100', 'NFSP200'];

        if (nusafiberCodes.includes(code)) return 'Nusafiber';
        if (nusaSelectaCodes.includes(code)) return 'NusaSelecta';
        return 'Home';
    }

    static initStats() {
        return {
            count: 0,
            commission: 0,
            mrc: 0,
            dpp: 0
        };
    }

    static initDetail() {
        return {
            new: this.initStats(),
            upgrade: this.initStats(),
            prorate: this.initStats(),
            recurring: this.initStats(),
            alat: this.initStats(),
            setup: this.initStats()
        };
    }

    static initServiceMap() {
        return {
            'Home': { name: 'Home', ...this.initStats(), detail: this.initDetail() },
            'Nusafiber': { name: 'Nusafiber', ...this.initStats(), detail: this.initDetail() },
            'NusaSelecta': { name: 'NusaSelecta', ...this.initStats(), detail: this.initDetail() }
        };
    }

    static async processAnnualCommission(
        year: number,
        processMonth: (startDate: string, endDate: string) => Promise<{ detail: any, total: number }>
    ) {
        const months = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ];

        const data: any[] = [];
        let grandTotal = 0;

        for (let i = 0; i < 12; i++) {
            const { startDate, endDate } = period.getStartAndEndDateForMonth(year, i);
            
            // Execute the specific logic for the month
            const monthResult = await processMonth(startDate, endDate);
            
            grandTotal += monthResult.total;

            data.push({
                month: months[i],
                detail: monthResult.detail,
                total: monthResult.total
            });
        }

        return {
            total: Math.round(grandTotal * 100) / 100,
            data: data
        };
    }
    static applyLateMonthPenalty(dpp: number, lateMonth: number | null | undefined, isApproved: any = false, type: string = ''): number {
        // Rule: Late Payment Penalty - 10% per month, max 50%
        // Skip only for approved invoices or if no late month
        const isActuallyApproved = isApproved === true || isApproved === 1 || isApproved === '1' || isApproved === 'true';
        if (isActuallyApproved || !lateMonth || lateMonth <= 0) return dpp;
        
        const deductPct = Math.min(Number(lateMonth) * 0.1, 0.5); // max 50%
        return dpp * (1 - deductPct);
    }

    static calculateCommission(
        row: any,
        dpp: number,
        months: number,
        serviceId: string,
        category: string,
        type: string,
        status: string = '',
        activityCount: number = 0,
        hasSetup: boolean = false,
        lateMonth: number = 0
    ): { commission: number, commissionPercentage: number, baseCommission: number } {
        const commissionRates = this.getCommissionRates();

        let commissionPercentage = 0;
        let penaltyPct = 0;

        // 1. Apply Late Payment Penalty to get the effective base commission basis (effectiveDpp)
        // This handles: 10% per month, max 50%, skip if approved, skip if recurring
        const effectiveDpp = this.applyLateMonthPenalty(dpp, lateMonth, row.is_approved, type);

        if (category === 'home') {
            // Rule: Base Commission is only 30% (Penalty 70% of effectiveDpp) if Permanent & Low Activity
            // Skip for everything except 'new' type
            if (status === 'Permanent' && activityCount < 12 && type === 'new') {
                penaltyPct += 0.7;
            }

            // Rule: Prorate Commission -> Always 10%
            if (type === 'prorate') {
                commissionPercentage = 10;
            } 
            // Rule: Upgrade Commission -> Based on defined rates for service & contract duration
            else if (type === 'upgrade') {
                 const rates = commissionRates[serviceId as keyof typeof commissionRates];
                if (rates) {
                    if (['NFSP030', 'NFSP100', 'NFSP200'].includes(serviceId)) {
                        commissionPercentage = months >= 12 ? rates[12] : (months >= 6 ? rates[6] : rates[1]);
                    } else {
                        commissionPercentage = months >= 12 ? rates[12] : (months > 1 ? rates[6] : rates[1]);
                    }
                }
            } 
            // Rule: Recurring Commission -> 0.5% (Permanent low activity) or 1.5% (Probation/Permanent high activity)
            else if (type === 'recurring') {
                if (status === 'Permanent' && activityCount < 12) {
                    commissionPercentage = 0.5;
                } else {
                    commissionPercentage = 1.5;
                }
            } 
            // Rule: New Installation Commission -> Based on defined rates
            else if (type === 'new') {
                const rates = commissionRates[serviceId as keyof typeof commissionRates];
                if (rates) {
                    if (['NFSP030', 'NFSP100', 'NFSP200'].includes(serviceId)) {
                        commissionPercentage = months >= 12 ? rates[12] : (months >= 6 ? rates[6] : rates[1]);
                    } else {
                         commissionPercentage = months >= 12 ? rates[12] : (months > 1 ? rates[6] : rates[1]);
                    }
                }
            }
        } 
        // Rule: Setup Commission -> Always 5%
        else if (category === 'setup') {
            commissionPercentage = 5;
        } 
        // Rule: Alat (Device) Commission -> 2% if bundled with setup, 1% if standalone
        else if (category === 'alat') {
            if (hasSetup) {
                commissionPercentage = 2;
            } else {
                commissionPercentage = 1;
            }
        }

        // Calculate final base commission
        const baseCommission = Math.max(0, effectiveDpp * (1 - penaltyPct));
        const commission = baseCommission * (commissionPercentage / 100);
        return { commission, commissionPercentage, baseCommission };
    }

    static calculateEmployeeMonthlyStats(rows: any[], status: string | null, churnRows: any[] = []) {
        const stats = this.initStats();
        const detail = this.initDetail();
        const serviceMap: Record<string, any> = this.initServiceMap();

        // 1. First pass
        let nusaSelectaCount = 0;
        let totalNewCount = 0;
        const customerSetupMap: Record<string, boolean> = {};

        rows.forEach((row: any) => {
             if (row.is_deleted) return;
             const serviceName = this.getServiceName(row.service_id);
             
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

        // Use net counts after churn for activityCount
        let netTotalNewCount = totalNewCount;
        let netNusaSelectaCount = nusaSelectaCount;

        churnRows.forEach((row: any) => {
            if (row.is_approved) return;
            const sName = this.getServiceName(row.service_id);
            netTotalNewCount--;
            if (sName === 'NusaSelecta' && row.service_id !== 'NFSP200') {
                netNusaSelectaCount--;
            }
        });

        const standardNewCount = netTotalNewCount - netNusaSelectaCount;
        const nusaSelectaPairs = Math.floor(netNusaSelectaCount / 2);
        const activityCount = Math.max(0, standardNewCount + nusaSelectaPairs);

        // 2. Second pass
        rows.forEach((row: any) => {
            if (row.is_deleted) return;

            const mrc = this.toNum(row.mrc);
            const dpp = this.toNum(row.dpp);
            const referralFee = this.toNum(row.referral_fee);
            // Jika referral_type == Cashback | Monthly makan dpp - referral jika tidak ambil saja dari dpp
            const commissionBasis = (row.referral_type === 'Cashback' || row.referral_type === 'Monthly') 
                ? (dpp - referralFee) 
                : dpp;

            let type = row.type;
            if (row.category === 'alat') type = 'alat';
            else if (row.category === 'setup') type = 'setup';
            else if (!type) type = 'recurring';
            if (type === 'prorata') type = 'prorate';

            const effectiveDpp = this.applyLateMonthPenalty(commissionBasis, row.late_month, row.is_approved, type);

            const months = Number(row.month || 1);
            const hasSetup = customerSetupMap[row.customer_id] || false; 

            const { commission: calculatedCommission } = this.calculateCommission(
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

            const commission = calculatedCommission;
            
            const safeType = type as keyof typeof detail;
            const serviceName = this.getServiceName(row.service_id);
            // NusaSelecta new (non-NFSP200) count dihitung per-pair, skip individual count
            const isNusaSelectaNew = serviceName === 'NusaSelecta' && row.service_id !== 'NFSP200' && type === 'new';

            // Monthly Totals
            if (!isNusaSelectaNew) stats.count++;
            stats.commission += commission;
            stats.mrc += mrc;
            stats.dpp += dpp;

            // Detail by Type
            if (detail[safeType]) {
                if (!isNusaSelectaNew) detail[safeType].count++;
                detail[safeType].commission += commission;
                detail[safeType].mrc += mrc;
                detail[safeType].dpp += dpp;
            }

            // Service Breakdown
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

        // NusaSelecta new: setiap 2 pelanggan dihitung sebagai 1 count
        stats.count += nusaSelectaPairs;
        detail.new.count += nusaSelectaPairs;
        if (serviceMap['NusaSelecta']) {
            serviceMap['NusaSelecta'].count += nusaSelectaPairs;
            serviceMap['NusaSelecta'].detail.new.count += nusaSelectaPairs;
        }

        // 3. Process churn amounts subtraction
        let totalChurnMrc = 0;
        let totalChurnCommission = 0;
        let totalChurnSubscription = 0;
        const churnNewCounts: Record<string, number> = {};

        churnRows.forEach((row: any) => {
            if (row.is_approved) return;
            const sName = this.getServiceName(row.service_id);
            const price = this.toNum(row.price);
            const periodVal = Math.max(this.toNum(row.period), 1);
            const mrc = price / periodVal;
            
            // Rule: Churn deduction is based on 'new' status and target level 12 (as per existing controllers)
            const { commission } = this.calculateCommission(row, price, periodVal, row.service_id, 'home', 'new', status || '', 12);
            
            totalChurnMrc += mrc;
            totalChurnCommission += commission;
            totalChurnSubscription += price;

            churnNewCounts[sName] = (churnNewCounts[sName] || 0) + 1;

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

        const { achievementStatus, motivation } = this.calculateAchievement(status as string, activityCount);

        return {
            stats,
            detail,
            serviceMap,
            activityCount,
            status,
            achievementStatus,
            deduction: {
                mrc: totalChurnMrc,
                commission: totalChurnCommission,
                subscription: totalChurnSubscription,
                new: Object.entries(churnNewCounts).map(([name, count]) => ({ name, count }))
            }
        };
    }

    static getCommissionRates() {
        return {
            'BFLITE': { 1: 28.38, 6: 6.55, 12: 5.09 },
            'NFSP030': { 1: 20.00, 6: 5.56, 12: 4.44 },
            'NFSP100': { 1: 20.00, 6: 5.56, 12: 4.44 },
            'NFSP200': { 1: 26.00, 6: 6.00, 12: 4.67 },
            'HOME100': { 1: 28.57, 6: 5.95, 12: 4.76 },
            'HOMESTD100': { 1: 28.57, 6: 5.95, 12: 4.76 },
            'HOMEADV200': { 1: 27.78, 6: 5.56, 12: 4.63 },
            'HOMEADV': { 1: 27.78, 6: 5.56, 12: 4.63 },
            'HOMEPREM300': { 1: 31.25, 6: 6.25, 12: 5.21 },
        };
    }

    static calculateAchievement(status: string, activityCount: number) {
        let achievementStatus = "N/A";
        let motivation = "N/A";

        if (status === 'Permanent') {
            // Rule: Permanent Employee Achievement Levels
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
            // Rule: Probation/Contract Employee Achievement Levels
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
        return { achievementStatus, motivation };
    }

    static calculateBonus(activityCount: number) {
        let bonus = 0;
        // Rule: Bonus Calculation based on Activity Count
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
        return bonus;
    }

    static calculateManagerMonthlyPerformance(monthSales: { Permanent: number, Probation: number, total: number, activity: number }) {
        let percentageVal = 0;
        
        // Rule: Manager Performance (%) Calculation
        if (monthSales.Permanent === 0 && monthSales.Probation === 0) {
             percentageVal = 0;
        } else if (monthSales.Permanent === 0 && monthSales.Probation !== 0) {
             percentageVal = 100;
        } else {
             // Target = Permanent Staff * 12
             const target = monthSales.Permanent * 12;
             percentageVal = (monthSales.activity / target) * 100;
        }
        
        let status = "Tidak Capai Target";

        if (monthSales.Permanent === 0) {
            status = "Capai Target";
        } else {
            const targetPercentage = this.getTeamTargetThreshold(monthSales.Permanent);
            // Rule: Manager Status based on Target Threshold
            status = percentageVal >= targetPercentage ? "Capai Target" : "Tidak Capai Target";
        }

        return {
            percentageVal,
            percentage: percentageVal.toFixed(2) + "%",
            target: (monthSales.Permanent + monthSales.Probation) === 0 ? 0 : monthSales.Permanent * 12,
            status
        };
    }

    static getTeamTargetThreshold(totalSales: number) {
        // Rule: Team Target Thresholds based on Total Sales Count
        const targetThresholds: Record<number, number> = {
            1: 120, 2: 115, 3: 110, 4: 105, 5: 100,
            6: 95, 7: 92, 8: 90, 9: 88, 10: 85
        };
        return targetThresholds[totalSales] || 85;
    }

    static calculateManagerCommission(percentageVal: number, monthlyNewCommission: number, monthlyRecurringSubscription: number, status: string) {
        let newCommissionPercentage = 0;
        
        // Rule: Manager New Commission Percentage based on Performance %
        // 150% -> 60%
        // 125% -> 50%
        // 100% -> 40%
        // 50%  -> 25%
        if (percentageVal >= 150) newCommissionPercentage = 60;
        else if (percentageVal >= 125) newCommissionPercentage = 50;
        else if (percentageVal >= 100) newCommissionPercentage = 40;
        else if (percentageVal >= 50) newCommissionPercentage = 25;
        
        const newCommission = monthlyNewCommission * (newCommissionPercentage / 100);
        
        // Rule: Manager Recurring Commission Rate
        // Capai Target -> 0.90%
        // Tidak Capai Target -> 0.50%
        const recurringRate = status === 'Capai Target' ? 0.90 : 0.50;
        const recurringCommission = monthlyRecurringSubscription * (recurringRate / 100);
        
        return {
            newCommission,
            recurringCommission,
            totalCommission: newCommission + recurringCommission,
            rates: {
                new: newCommissionPercentage,
                recurring: recurringRate
            }
        };
    }
}

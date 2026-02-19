import { period } from "./period";

export class CommissionHelper {
    static formatCurrency(val: number) {
        return val.toFixed(2);
    }

    static toNum(val: any) {
        return Number(val || 0);
    }

    static getServiceName(id: string) {
        if (id === 'BFLITE') return 'Nusafiber';
        if (['NFSP030', 'FSP100', 'NFSP100', 'NFSP200'].includes(id)) return 'NusaSelecta';
        if (['HOME100', 'HOMEADV200', 'HOMEADV', 'HOMEPREM300'].includes(id)) return 'Home';
        return 'Other';
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
    static calculateCommission(
        row: any,
        dpp: number,
        months: number,
        serviceId: string,
        category: string,
        type: string,
        status: string = '',
        activityCount: number = 0,
        hasSetup: boolean = false
    ): { commission: number, commissionPercentage: number } {
        const commissionRates = this.getCommissionRates();

        let commissionPercentage = 0;

        if (category === 'home') {
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
            // Rule: Recurring Commission -> 0.5% if Permanent & Low Activity (<12), otherwise 1.5%
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

        const commission = dpp * (commissionPercentage / 100);
        return { commission, commissionPercentage };
    }

    static calculateEmployeeMonthlyStats(rows: any[], status: string | null) {
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

        const standardNewCount = totalNewCount - nusaSelectaCount;
        const nusaSelectaPairs = Math.floor(nusaSelectaCount / 2);
        const activityCount = standardNewCount + nusaSelectaPairs;

        // 2. Second pass
        rows.forEach((row: any) => {
            if (row.is_deleted) return;

            const mrc = this.toNum(row.mrc);
            const dpp = this.toNum(row.dpp);

            let type = row.type;
            if (row.category === 'alat') type = 'alat';
            else if (row.category === 'setup') type = 'setup';
            else if (!type) type = 'recurring';

            if (type === 'prorata') type = 'prorate';

            const months = Number(row.month || 1);
            const hasSetup = customerSetupMap[row.customer_id] || false; 

            const { commission: calculatedCommission } = this.calculateCommission(
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
            const serviceName = this.getServiceName(row.service_id);

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

        const { achievementStatus, motivation } = this.calculateAchievement(status as string, activityCount);

        return {
            stats,
            detail,
            serviceMap,
            activityCount,
            status,
            achievementStatus
        };
    }

    static getCommissionRates() {
        return {
            'BFLITE': { 1: 28.38, 6: 6.55, 12: 5.09 },
            'NFSP030': { 1: 20.00, 6: 5.56, 12: 4.44 },
            'NFSP100': { 1: 20.00, 6: 5.56, 12: 4.44 },
            'NFSP200': { 1: 26.00, 6: 6.00, 12: 4.67 },
            'HOME100': { 1: 28.57, 6: 5.95, 12: 4.76 },
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
        
        const targetPercentage = this.getTeamTargetThreshold(monthSales.total);
        // Rule: Manager Status based on Target Threshold
        const status = percentageVal >= targetPercentage ? "Capai Target" : "Tidak Capai Target";

        return {
            percentageVal,
            percentage: percentageVal.toFixed(2) + "%",
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

    static calculateManagerCommission(percentageVal: number, monthlyNewSubscription: number, monthlyRecurringSubscription: number, status: string) {
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
        
        const newCommission = monthlyNewSubscription * (newCommissionPercentage / 100);
        
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

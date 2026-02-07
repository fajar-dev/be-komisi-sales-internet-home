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
            prorate: this.initStats(),
            recurring: this.initStats()
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
}

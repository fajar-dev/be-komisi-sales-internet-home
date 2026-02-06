import { format } from 'date-fns';

export class period{
    static getStartAndEndDateForCurrentMonth() {
        const today = new Date();
        let targetMonth = today.getMonth();
        let targetYear = today.getFullYear();

        // Jika hari ini tanggal > 25, maka masuk periode bulan depan
        if (today.getDate() > 25) {
            targetMonth += 1;
            if (targetMonth > 11) {
                targetMonth = 0;
                targetYear += 1;
            }
        }
    
        const startMonth = targetMonth === 0 ? 11 : targetMonth - 1;
        const startYear = targetMonth === 0 ? targetYear - 1 : targetYear;
    
        const startDate = new Date(startYear, startMonth, 26);
        const endDate = new Date(targetYear, targetMonth, 25);
    
        return {
            startDate: format(startDate, 'yyyy-MM-dd'),
            endDate: format(endDate, 'yyyy-MM-dd')
        };
    }

    static getStartAndEndDateForMonth(year: number, monthIndex: number) {
        // monthIndex: 0 = January, 1 = February, dst
        const startMonth = monthIndex === 0 ? 11 : monthIndex - 1;
        const startYear = monthIndex === 0 ? year - 1 : year;

        const startDate = new Date(startYear, startMonth, 26);
        const endDate = new Date(year, monthIndex, 25);

        return {
            startDate: format(startDate, 'yyyy-MM-dd'),
            endDate: format(endDate, 'yyyy-MM-dd')
        };
    }
}
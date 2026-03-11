import { IsService } from '../service/is.service';
import { ChurnService } from '../service/churn.service';
import { period } from '../helper/period';

export class ChurnCrawl {
    constructor(
        private isService = IsService,
        private churnService = ChurnService,
        private periodHelper = period
    ) {}

    async crawlChurn() {
        // const { startDate, endDate } = this.periodHelper.getStartAndEndDateForCurrentMonth();
        const startDate = '2026-01-26';
        const endDate = '2026-02-25';
        console.log(`Starting Churn crawl for period: ${startDate} to ${endDate}...`);
        
        const rows = await this.isService.getChurnbyDateRange(startDate, endDate);
        
        const validCsIds: number[] = [];
        for (const row of rows) {
            await this.churnService.insertChurn(row);
            validCsIds.push(row.customer_service_id);
            console.log("Churn inserted/updated for CSID:", row.customer_service_id);
        }

        // Sync with deletion if some were removed from source
        await this.churnService.deleteMissingChurns(validCsIds, startDate, endDate);
        
        console.log("Churn crawl finished.");
    }
}

import { GoogleSheetService } from '../service/google-sheet.service';
import { SnapshotService } from '../service/snapshot.service';

export class GoogleSheetCrawl {
    constructor(
        private sheetService = new GoogleSheetService(),
        private snapshotService = SnapshotService
    ) {}

    async crawlSnapshotOverride() {
        try {
            console.log("Starting Google Sheet snapshot override crawl...");
            
            // Assume the sheet title is 'Snapshot Override' or similar
            // You might want to make this configurable or check multiple sheets
            const sheetsToCrawl = ['Snapshot Override', 'Referral'];
            
            for (const sheetTitle of sheetsToCrawl) {
                console.log(`Processing sheet: ${sheetTitle}`);
                const rows = await this.sheetService.getRows(sheetTitle);
                
                if (rows.length === 0) {
                    console.log(`No data found or sheet "${sheetTitle}" missing.`);
                    continue;
                }

                for (const row of rows) {
                    const ai = row.get('AI');
                    if (!ai) continue;

                    const data: any = {};
                    
                    // Map common columns if they exist
                    if (row.get('Referral Fee') !== undefined) data.referralFee = row.get('Referral Fee');
                    if (row.get('Referral Type') !== undefined) data.referralType = row.get('Referral Type');
                    if (row.get('Is Approved') !== undefined) {
                        const val = row.get('Is Approved')?.toLowerCase();
                        data.isApproved = val === '1' || val === 'true' || val === 'yes';
                    }
                    if (row.get('Type') !== undefined) data.type = row.get('Type');
                    if (row.get('Late Month') !== undefined) data.lateMonth = row.get('Late Month');

                    if (Object.keys(data).length > 0) {
                        await this.snapshotService.updateFromSheet(ai, data);
                        console.log(`Updated AI ${ai} from sheet "${sheetTitle}"`);
                    }
                }
            }
            
            console.log("Google Sheet crawl finished.");
        } catch (error: any) {
            console.error("Error during Google Sheet crawl:", error.message);
        }
    }
}

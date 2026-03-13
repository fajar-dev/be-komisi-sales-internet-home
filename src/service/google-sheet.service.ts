import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY } from '../config/config';

export class GoogleSheetService {
    private doc: GoogleSpreadsheet;

    constructor() {
        if (!GOOGLE_SHEET_ID || !GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) {
            console.warn("Google Sheet configuration is incomplete. Check your .env file.");
        }

        const serviceAccountAuth = new JWT({
            email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
            key: GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        this.doc = new GoogleSpreadsheet(GOOGLE_SHEET_ID!, serviceAccountAuth);
    }

    async getRows(sheetTitle: string) {
        try {
            await this.doc.loadInfo();
            const sheet = this.doc.sheetsByTitle[sheetTitle];
            if (!sheet) {
                console.error(`Sheet with title "${sheetTitle}" not found in spreadsheet ${GOOGLE_SHEET_ID}.`);
                return [];
            }
            return await sheet.getRows();
        } catch (error: any) {
            console.error(`Error fetching rows from Google Sheet: ${error.message}`);
            return [];
        }
    }
}

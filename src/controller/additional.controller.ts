import { period } from "../helper/period";
import { Context } from "hono";

export class AdditionalController {
    constructor(
        private periodHelper = period
    ) {}

    async getPeriod(c: Context) {
        const { startDate, endDate } = this.periodHelper.getStartAndEndDateForCurrentMonth();
        return c.json({
            start: startDate,
            end: endDate
        })
    }
}
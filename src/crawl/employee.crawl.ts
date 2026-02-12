import { Nusawork } from '../service/nusawork.service';
import { EmployeeService } from '../service/employee.service';
import { period as PeriodHelper } from '../helper/period';

export class EmployeeCrawl {
    constructor(
        private nusaworkService = Nusawork,
        private employeeService = EmployeeService,
        private period = PeriodHelper
    ) {}

    async crawlEmployee() {
        const sales = await this.nusaworkService.getSalesHome()
        const period = this.period.getStartAndEndDateForCurrentMonth()
        for (const data of sales) {
            await this.employeeService.insertEmployee(data);
            await this.employeeService.insertStatusPeriod(data.employeeId, period.startDate, period.endDate, data.status);
            console.log("Employee inserted: ", data.employeeId);
        }

        const admin = await this.nusaworkService.getEmployeeAdmin()
        for (const data of admin) {
            await this.employeeService.insertEmployee(data);
            console.log("Employee inserted: ", data.employeeId);
        }
    }
}
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
        const crawledIds: string[] = [];
        
        const sales = await this.nusaworkService.getSalesHome()
        const period = this.period.getStartAndEndDateForCurrentMonth()
        for (const data of sales) {
            await this.employeeService.insertEmployee(data);
            await this.employeeService.insertStatusPeriod(data.employeeId, period.startDate, period.endDate, data.status);
            crawledIds.push(data.employeeId);
            console.log("Employee inserted: ", data.employeeId);
        }

        const admin = await this.nusaworkService.getEmployeeAdmin()
        for (const data of admin) {
            await this.employeeService.insertEmployee(data);
            crawledIds.push(data.employeeId);
            console.log("Employee inserted: ", data.employeeId);
        }

        // Handle deactivation for employees in database not found in crawl
        const dbIds = await this.employeeService.getAllEmployeeIds();
        const deactivateIds = dbIds.filter(id => !crawledIds.includes(id));

        for (const id of deactivateIds) {
            await this.employeeService.updateEmployeeActiveStatus(id, false);
            console.log("Employee deactivated: ", id);
        }
    }
}

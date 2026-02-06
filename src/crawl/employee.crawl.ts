import { Nusawork } from '../service/nusawork.service';
import { EmployeeService } from '../service/employee.service';

export class EmployeeCrawl {
    constructor(
        private nusaworkService = Nusawork,
        private employeeService = EmployeeService
    ) {}

    async crawlEmployee() {
        const sales = await this.nusaworkService.getSalesHome()
        for (const data of sales) {
            await this.employeeService.insertEmployee(data);
            console.log("Employee inserted: ", data.employeeId);
        }

        const admin = await this.nusaworkService.getEmployeeAdmin()
        for (const data of admin) {
            await this.employeeService.insertEmployee(data);
            console.log("Employee inserted: ", data.employeeId);
        }
    }
}
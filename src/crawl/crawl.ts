import { EmployeeCrawl } from "./employee.crawl";

class Crawl {
    constructor(
        private employeeCrawl = new EmployeeCrawl()
    ) {}
    
    async run() {
        try {
            console.log("Starting the employee crawl...");
            await this.employeeCrawl.crawlEmployee();
            console.log("Employee crawl finished.");
            process.exit(0); 
        } catch (error) {
            console.error("Error running the crawl:", error);
            process.exit(1); 
        }
    }
}

new Crawl().run();

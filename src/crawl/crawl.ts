import { EmployeeCrawl } from "./employee.crawl";
import { SnapshotCrawl } from "./snapshot.crawl";

class Crawl {
    constructor(
        private employeeCrawl = new EmployeeCrawl(),
        private snapshotCrawl = new SnapshotCrawl() 
    ) {}
    
    async run() {
        try {
            console.log("Starting the crawl...");
            // console.log("Starting the snapshot crawl...");
            // await this.snapshotCrawl.crawlInvoice();
            // console.log("Snapshot crawl finished.");
            // console.log("Starting the employee crawl...");
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

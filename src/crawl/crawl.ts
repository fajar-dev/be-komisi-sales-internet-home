import { EmployeeCrawl } from "./employee.crawl";
import { SnapshotCrawl } from "./snapshot.crawl";
import { ChurnCrawl } from "./churn.crawl";

class Crawl {
    constructor(
        private employeeCrawl = new EmployeeCrawl(),
        private snapshotCrawl = new SnapshotCrawl(),
        private churnCrawl = new ChurnCrawl()
    ) {}
    
    async run() {
        try {
            console.log("Starting the crawl...");
            
            console.log("Starting the snapshot crawl...");
            await this.snapshotCrawl.crawlInvoice();
            console.log("Snapshot crawl finished.");

            console.log("Starting the churn crawl...");
            await this.churnCrawl.crawlChurn();
            console.log("Churn crawl finished.");

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

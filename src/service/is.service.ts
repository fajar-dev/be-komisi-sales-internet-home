import { nisPool } from "../config/nis.db"

export class IsService {
    static async getInvoiceByDateRange(startDate: string, endDate: string) {
        let query = `
            (
                SELECT
                    nci.AI                                                AS ai_invoice,
                    MAX(nci2.AI)                                          AS ai_receipt,
                    cit.CustId                                            AS customer_id,
                    c.CustName                                            AS customer_name,
                    c.CustCompany                                         AS customer_company,
                    cit.CustServId                                        AS customer_service_id,
                    cs.CustAccName                                        AS customer_service_account,
                    cit.ServiceGroup                                      AS service_group,
                    cs.ServiceId                                          AS service_id,
                    s.ServiceType                                         AS service_name,
                    cit.InvoiceNum                                        AS invoice_number,
                    cit.Urut                                              AS invoice_order,
                    IFNULL(citc.InvoiceDate, cit.InvoiceDate)             AS invoice_date,
                    cit.AwalPeriode                                       AS period_start,
                    cit.AkhirPeriode                                      AS period_end,
                    IFNULL(itm.Month, 1)                                  AS month,
                    nciic.dpp                                			  AS dpp,
                    MAX(nci2.TransDate)                                   AS paid_date,
                    nciic.new_subscription                                AS new_subscription,
                    nciic.counter                                         AS counter,
                    nciic.is_prorata                                      AS is_prorate,
                    nciic.is_upgrade                                      AS is_upgrade,
                    nciic.line_rental                                     AS line_rental,
                    'home'                                                AS category,
                    cs.SalesId                                            AS sales_id,
                    cs.ManagerSalesId                                     AS manager_id,
                    IFNULL(rs.Name, "")                                   AS reseller_name
                FROM
                    Nusanet.CustomerInvoiceTemp cit
                    LEFT JOIN Nusanet.CustomerInvoiceTemp_Custom citc
                        ON cit.InvoiceNum = citc.InvoiceNum
                    AND cit.Urut       = citc.Urut
                    LEFT JOIN Nusanet.InvoiceTypeMonth itm
                        ON itm.InvoiceType = cit.InvoiceType
                    LEFT JOIN Nusanet.NewCustomerInvoice nci
                        ON cit.InvoiceNum = nci.Id
                    AND nci.No         = cit.Urut
                    AND nci.Type       = 'internet'
                    LEFT JOIN Nusanet.CustomerInvoiceDiscount cid
                        ON cid.InvoiceNum = cit.InvoiceNum
                    AND cid.Urut       = cit.Urut
                    LEFT JOIN Nusanet.NewCustomerInvoiceBatch ncib
                        ON nci.AI = ncib.AI
                    LEFT JOIN Nusanet.NewCustomerInvoiceBatch ncib2
                        ON ncib.batchNo = ncib2.batchNo
                    AND ncib2.AI    != ncib.AI
                    AND ncib2.total  > 0
                    LEFT JOIN Nusanet.NewCustomerInvoice nci2
                        ON ncib2.AI = nci2.AI
                    LEFT JOIN Nusanet.CustomerServices cs
                        ON cit.CustServId = cs.CustServId
                    LEFT JOIN Nusanet.Services s
                        ON s.ServiceId = cs.ServiceId
                    LEFT JOIN Nusanet.ServiceGroup sg
                        ON sg.ServiceGroup = s.ServiceGroup
                    LEFT JOIN Nusanet.Customer c
                        ON c.CustId = cs.CustId
                    LEFT JOIN Nusanet.Reseller rs
                        ON c.ResellerId = rs.Id
                    LEFT JOIN Nusanet.FiberVendorServices fvs
                        ON fvs.type      = 'CustomerServices'
                    AND cs.CustServId = fvs.typeId
                    LEFT JOIN Nusanet.NewCustomerInvoiceInternetCounter nciic
                        ON nciic.AI = nci.AI
                WHERE
                    cit.RInvoiceNum = 0
                    AND (ncib.batchNo IS NULL OR nci2.Type = 'RA02')
                    AND ncib.batchNo IS NOT NULL
                    AND (
                        IFNULL(c.DisplayBranchId, c.BranchId) IN ('020', '062', '025', '027', '029')
                        OR (
                            IFNULL(c.DisplayBranchId, c.BranchId) IN ('028')
                            AND nciic.new_subscription > 110000
                            AND cs.SalesId NOT IN ('0208801')
                        )
                    )
                    AND s.ServiceId IN ('BFLITE', 'NFSP030', 'NFSP100', 'NFSP200', 'HOME100', 'HOMEADV200', 'HOMEPREM300', 'HOMEADV')
                    AND (
                        (DATE(nci.InsertDate) BETWEEN ? AND ?)
                        OR (nci2.TransDate IS NOT NULL AND nci2.TransDate BETWEEN ? AND ?)
                    )
                    AND cs.CustServId IS NOT NULL
                GROUP BY
                    nci.AI
                ORDER BY
                    nci.AI
            )
            UNION ALL
            (
                SELECT
                    nci.AI                                                AS ai_invoice,
                    MAX(nci2.AI)                                          AS ai_receipt,
                    cit.cid                                               AS customer_id,
                    c.CustName                                            AS customer_name,
                    c.CustCompany                                         AS customer_company,
                    cit.csid                                              AS customer_service_id,
                    cs.CustAccName                                        AS customer_service_account,
                    s.ServiceGroup                                        AS service_group,
                    cs.ServiceId                                          AS service_id,
                    s.ServiceType                                         AS service_name,
                    cit.siid                                              AS invoice_number,
                    NULL                                                  AS invoice_order,
                    cit.date                                              AS invoice_date,
                    DATE_FORMAT(cit.date, '%Y%m')                         AS period_start,
                    DATE_FORMAT(cit.date, '%Y%m')                         AS period_end,
                    1                                                     AS month,
                    cit.dpp                                               AS dpp,
                    MAX(nci2.TransDate)                                   AS paid_date,
                    ''                                                    AS new_subscription,
                    ''                                                    AS counter,
                    ''                                                    AS is_prorate,
                    0                                                     AS is_upgrade,
                    0                                                     AS line_rental,
                    'alat'                                                AS category, 
                    cs.SalesId                                            AS sales_id,
                    cs.ManagerSalesId                                     AS manager_id,
                    IFNULL(rs.Name, "")                                   AS reseller_name
                FROM
                    (
                        SELECT
                            sih.CustId                                    AS cid,
                            sih.No                                        AS siid,
                            sh.CustServId                                 AS csid,
                            sih.Date                                      AS date,
                            sih.DueDate                                   AS due_date,
                            ROUND(SUM((si.Unit - si.Free) * si.Price) / 1.11, 2) AS dpp,
                            si.Code                                       AS Code
                        FROM
                            Nusanet.StockInvoice si
                            LEFT JOIN Nusanet.StockInvoiceHead sih ON sih.No = si.No
                            LEFT JOIN Nusanet.SPMBHead sh         ON sh.No  = sih.Spmb
                        WHERE
                            sih.Status = 'BL'
                            AND sih.RNo = 0
                            AND (sh.CustServId != 0 OR sih.No IN (0000130674))
                            AND si.Code NOT IN (
                                'SETUP000','JSTRKKBL','TARIKKBL','TOWER000','TARIKKBV','INSTALWF',
                                'TRKKBLDT','TRKKBLFO','MNTNCE00','JSSETTAP','TARKBLFO'
                            )
                        GROUP BY
                            sih.No
                        HAVING
                            dpp != 0
                        ORDER BY
                            sih.No
                    ) cit
                    LEFT JOIN Nusanet.NewCustomerInvoice nci
                        ON nci.Id   = cit.siid
                    AND nci.Type = 'stock'
                    LEFT JOIN Nusanet.NewCustomerInvoiceBatch ncib
                        ON nci.AI = ncib.AI
                    LEFT JOIN Nusanet.NewCustomerInvoiceBatch ncib2
                        ON ncib.batchNo = ncib2.batchNo
                    AND ncib2.AI    != ncib.AI
                    AND ncib2.total  > 0
                    LEFT JOIN Nusanet.NewCustomerInvoice nci2
                        ON ncib2.AI = nci2.AI
                    LEFT JOIN Nusanet.CustomerServices cs
                        ON cit.csid = cs.CustServId
                    LEFT JOIN Nusanet.Services s
                        ON s.ServiceId = cs.ServiceId
                    LEFT JOIN Nusanet.Customer c
                        ON c.CustId = cs.CustId
                    LEFT JOIN Nusanet.Reseller rs
                        ON c.ResellerId = rs.Id
                WHERE
                    (ncib.batchNo IS NULL OR nci2.Type = 'RA02')
                    AND ncib.batchNo IS NOT NULL
                    AND (IFNULL(c.DisplayBranchId, c.BranchId) IN ('020', '062', '025', '027', '029'))
                    AND (
                        (cit.date BETWEEN ? AND ?)
                        OR (nci2.TransDate BETWEEN ? AND ?)
                    )
                    AND (nci.AI NOT IN (1463680))
                GROUP BY
                    nci.AI
                ORDER BY
                    nci.AI
            )
            UNION ALL
            (
                SELECT
                    nci.AI                                                AS ai_invoice,
                    MAX(nci2.AI)                                          AS ai_receipt,
                    cit.cid                                               AS customer_id,
                    c.CustName                                            AS customer_name,
                    c.CustCompany                                         AS customer_company,
                    cit.csid                                              AS customer_service_id,
                    cs.CustAccName                                        AS customer_service_account,
                    s.ServiceGroup                                        AS service_group,
                    cs.ServiceId                                          AS service_id,
                    s.ServiceType                                         AS service_name,
                    cit.siid                                              AS invoice_number,
                    NULL                                                  AS invoice_order,
                    cit.date                                              AS invoice_date,
                    DATE_FORMAT(cit.date, '%Y%m')                         AS period_start,
                    DATE_FORMAT(cit.date, '%Y%m')                         AS period_end,
                    1                                                     AS month,
                    cit.dpp                                               AS dpp,
                    MAX(nci2.TransDate)                                   AS paid_date,
                    ''                                                    AS new_subscription,
                    ''                                                    AS counter,
                    ''                                                    AS is_prorate,
                    0                                                     AS is_upgrade,
                    0                                                     AS line_rental,
                    'setup'                                               AS category,
                    cs.SalesId                                            AS sales_id,
                    cs.ManagerSalesId                                     AS manager_id,
                    IFNULL(rs.Name, "")                                   AS reseller_name
                FROM
                    (
                        SELECT
                            sih.CustId                                    AS cid,
                            sih.No                                        AS siid,
                            sh.CustServId                                 AS csid,
                            sih.Date                                      AS date,
                            sih.DueDate                                   AS due_date,
                            ROUND(SUM((si.Unit - si.Free) * si.Price) / 1.11, 2) AS dpp,
                            si.Code                                       AS Code
                        FROM
                            Nusanet.StockInvoice si
                            LEFT JOIN Nusanet.StockInvoiceHead sih ON sih.No = si.No
                            LEFT JOIN Nusanet.SPMBHead sh         ON sh.No  = sih.Spmb
                        WHERE
                            sih.Status = 'BL'
                            AND sih.RNo = 0
                            AND sh.CustServId != 0
                            AND si.Code IN (
                                'SETUP000','JSTRKKBL','TARIKKBL','TARIKKBV','TRKKBLDT',
                                'TRKKBLFO','INSTALWF','MNTNCE00','JSSETTAP','TARKBLFO'
                            )
                        GROUP BY
                            sih.No
                        HAVING
                            dpp != 0
                        ORDER BY
                            sih.No
                    ) cit
                    LEFT JOIN Nusanet.NewCustomerInvoice nci
                        ON nci.Id   = cit.siid
                    AND nci.Type = 'stock'
                    LEFT JOIN Nusanet.NewCustomerInvoiceBatch ncib
                        ON nci.AI = ncib.AI
                    LEFT JOIN Nusanet.NewCustomerInvoiceBatch ncib2
                        ON ncib.batchNo = ncib2.batchNo
                    AND ncib2.AI    != ncib.AI
                    AND ncib2.total  > 0
                    LEFT JOIN Nusanet.NewCustomerInvoice nci2
                        ON ncib2.AI = nci2.AI
                    LEFT JOIN Nusanet.CustomerServices cs
                        ON cit.csid = cs.CustServId
                    LEFT JOIN Nusanet.Services s
                        ON s.ServiceId = cs.ServiceId
                    LEFT JOIN Nusanet.Customer c
                        ON c.CustId = cs.CustId
                    LEFT JOIN Nusanet.Reseller rs
                        ON c.ResellerId = rs.Id
                WHERE
                    (ncib.batchNo IS NULL OR nci2.Type = 'RA02')
                    AND ncib.batchNo IS NOT NULL
                    AND (IFNULL(c.DisplayBranchId, c.BranchId) IN ('020', '062', '025', '027', '029'))
                    AND (
                        (cit.date BETWEEN ? AND ?)
                        OR (nci2.TransDate BETWEEN ? AND ?)
                    )
                    AND (nci.AI NOT IN (1463679))
                GROUP BY
                    nci.AI
                ORDER BY
                    nci.AI
            );
        `;

        const [rows] = await nisPool.query({
            sql: query,
        }, [startDate, endDate, startDate, endDate, startDate, endDate, startDate, endDate, startDate, endDate, startDate, endDate ]);

        return rows as any[];
    }

}
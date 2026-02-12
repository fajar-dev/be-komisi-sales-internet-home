CREATE TABLE snapshot(
    ai BIGINT NOT NULL,
    ai_receipt BIGINT NULL,
    customer_id VARCHAR(20) NOT NULL,
    customer_name VARCHAR(255) NULL,
    customer_company VARCHAR(255) NULL,
    customer_service_id BIGINT NULL,
    customer_service_account VARCHAR(255) NULL,
    service_group VARCHAR(50) NULL,
    service_id VARCHAR(50) NULL,
    service_name VARCHAR(255) NULL,
    invoice_number VARCHAR(30) NULL,
    invoice_order INT NULL,
    invoice_date DATE NULL,
    period_start CHAR(6) NULL,
    period_end CHAR(6) NULL,
    month INT NULL,
    dpp DECIMAL(18,2) NULL,
    paid_date DATE NULL,
    new_subscription DECIMAL(18,2) NULL,
    counter INT NULL,
    is_prorate TINYINT NULL,
    is_upgrade TINYINT NULL,
    line_rental DECIMAL(18,2) NULL,
    category ENUM('home', 'alat', 'setup') NOT NULL DEFAULT 'home',
    sales_id VARCHAR(20) NULL,
    manager_id VARCHAR(20) NULL,
    reseller_name VARCHAR(255) NULL,
    mrc DECIMAL(15,2) NULL,
    sales_commission DECIMAL(15,2) NULL,
    sales_commission_percentage DECIMAL(5,2) NULL,
    type ENUM('new','prorate','upgrade','recurring') NULL DEFAULT NULL,
    is_adjustment BOOLEAN NOT NULL DEFAULT FALSE,
    INDEX idx_ai_invoice(ai_invoice),
    INDEX idx_paid_date(paid_date),
    INDEX idx_service_id(service_id),
    INDEX idx_sales_id(sales_id),
    INDEX idx_category(category),
    INDEX idx_type(type)
);

CREATE TABLE adjustment (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ai INT NOT NULL,
    employee_id VARCHAR(20) NOT NULL,
    approved_id VARCHAR(20) NULL,
    old_value JSON NULL,
    new_value JSON NULL,
    note TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    action ENUM('insert', 'update', 'delete') NOT NULL,
    status ENUM('pending', 'accept', 'decline') NOT NULL DEFAULT 'pending'
);

CREATE TABLE employee (
    id INT PRIMARY KEY,
    employee_id VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    photo_profile VARCHAR(255) NOT NULL,
    job_position VARCHAR(255) NOT NULL,
    organization_name VARCHAR(255) NOT NULL,
    job_level VARCHAR(50) NOT NULL,
    branch VARCHAR(255) NOT NULL,
    status VARCHAR(255) NOT NULL,
    manager_id INT NULL,
    has_dashboard BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE status_period (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id VARCHAR(20) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status ENUM('Probation', 'Permanent') NOT NULL DEFAULT 'Probation'
);


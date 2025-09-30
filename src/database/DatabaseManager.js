const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

class DatabaseManager {
  constructor() {
    this.db = null;
    this.dbPath = path.join(process.cwd(), 'data', 'business_manager.db');
    this.ensureDataDirectory();
  }

  ensureDataDirectory() {
    const dataDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  async initialize() {
    try {
      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
      
      await this.createTables();
      await this.insertDefaultData();
      
      console.log('Database initialized successfully');
      return true;
    } catch (error) {
      console.error('Database initialization error:', error);
      throw error;
    }
  }

  async createTables() {
    const tables = [
      // Companies table
      `CREATE TABLE IF NOT EXISTS companies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        legal_name TEXT NOT NULL,
        gstin TEXT UNIQUE,
        pan TEXT NOT NULL,
        cin TEXT,
        address TEXT NOT NULL,
        city TEXT NOT NULL,
        state TEXT NOT NULL,
        pincode TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        website TEXT,
        logo_path TEXT,
        financial_year_start TEXT DEFAULT '04-01',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_active INTEGER DEFAULT 1
      )`,

      // Users table
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        email TEXT,
        role TEXT DEFAULT 'user',
        is_active INTEGER DEFAULT 1,
        last_login DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Company access permissions
      `CREATE TABLE IF NOT EXISTS user_company_access (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        company_id INTEGER NOT NULL,
        access_level TEXT DEFAULT 'read',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (company_id) REFERENCES companies (id),
        UNIQUE(user_id, company_id)
      )`,

      // Customers/Vendors master
      `CREATE TABLE IF NOT EXISTS parties (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('customer', 'vendor', 'both')),
        gstin TEXT,
        pan TEXT,
        address TEXT,
        city TEXT,
        state TEXT,
        pincode TEXT,
        phone TEXT,
        email TEXT,
        credit_limit DECIMAL(15,2) DEFAULT 0,
        credit_days INTEGER DEFAULT 0,
        tds_applicable INTEGER DEFAULT 0,
        tds_section TEXT,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies (id)
      )`,

      // Product/Service master
      `CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        type TEXT NOT NULL CHECK(type IN ('product', 'service')),
        hsn_sac TEXT NOT NULL,
        unit TEXT NOT NULL,
        gst_rate DECIMAL(5,2) NOT NULL,
        purchase_rate DECIMAL(15,2),
        sale_rate DECIMAL(15,2),
        minimum_stock DECIMAL(15,3) DEFAULT 0,
        current_stock DECIMAL(15,3) DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies (id)
      )`,

      // Sales invoices
      `CREATE TABLE IF NOT EXISTS sales_invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        invoice_no TEXT NOT NULL,
        invoice_date DATE NOT NULL,
        customer_id INTEGER NOT NULL,
        place_of_supply TEXT NOT NULL,
        total_amount DECIMAL(15,2) NOT NULL,
        cgst_amount DECIMAL(15,2) DEFAULT 0,
        sgst_amount DECIMAL(15,2) DEFAULT 0,
        igst_amount DECIMAL(15,2) DEFAULT 0,
        total_gst DECIMAL(15,2) NOT NULL,
        grand_total DECIMAL(15,2) NOT NULL,
        payment_terms TEXT,
        notes TEXT,
        status TEXT DEFAULT 'draft',
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies (id),
        FOREIGN KEY (customer_id) REFERENCES parties (id),
        FOREIGN KEY (created_by) REFERENCES users (id),
        UNIQUE(company_id, invoice_no)
      )`,

      // Sales invoice items
      `CREATE TABLE IF NOT EXISTS sales_invoice_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        quantity DECIMAL(15,3) NOT NULL,
        rate DECIMAL(15,2) NOT NULL,
        discount_percent DECIMAL(5,2) DEFAULT 0,
        discount_amount DECIMAL(15,2) DEFAULT 0,
        taxable_amount DECIMAL(15,2) NOT NULL,
        gst_rate DECIMAL(5,2) NOT NULL,
        cgst_amount DECIMAL(15,2) DEFAULT 0,
        sgst_amount DECIMAL(15,2) DEFAULT 0,
        igst_amount DECIMAL(15,2) DEFAULT 0,
        total_amount DECIMAL(15,2) NOT NULL,
        FOREIGN KEY (invoice_id) REFERENCES sales_invoices (id),
        FOREIGN KEY (item_id) REFERENCES items (id)
      )`,

      // Purchase invoices
      `CREATE TABLE IF NOT EXISTS purchase_invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        invoice_no TEXT NOT NULL,
        vendor_invoice_no TEXT,
        invoice_date DATE NOT NULL,
        vendor_id INTEGER NOT NULL,
        place_of_supply TEXT NOT NULL,
        total_amount DECIMAL(15,2) NOT NULL,
        cgst_amount DECIMAL(15,2) DEFAULT 0,
        sgst_amount DECIMAL(15,2) DEFAULT 0,
        igst_amount DECIMAL(15,2) DEFAULT 0,
        total_gst DECIMAL(15,2) NOT NULL,
        tds_section TEXT,
        tds_rate DECIMAL(5,2) DEFAULT 0,
        tds_amount DECIMAL(15,2) DEFAULT 0,
        grand_total DECIMAL(15,2) NOT NULL,
        payment_terms TEXT,
        notes TEXT,
        status TEXT DEFAULT 'draft',
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies (id),
        FOREIGN KEY (vendor_id) REFERENCES parties (id),
        FOREIGN KEY (created_by) REFERENCES users (id)
      )`,

      // Purchase invoice items
      `CREATE TABLE IF NOT EXISTS purchase_invoice_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        quantity DECIMAL(15,3) NOT NULL,
        rate DECIMAL(15,2) NOT NULL,
        discount_percent DECIMAL(5,2) DEFAULT 0,
        discount_amount DECIMAL(15,2) DEFAULT 0,
        taxable_amount DECIMAL(15,2) NOT NULL,
        gst_rate DECIMAL(5,2) NOT NULL,
        cgst_amount DECIMAL(15,2) DEFAULT 0,
        sgst_amount DECIMAL(15,2) DEFAULT 0,
        igst_amount DECIMAL(15,2) DEFAULT 0,
        total_amount DECIMAL(15,2) NOT NULL,
        FOREIGN KEY (invoice_id) REFERENCES purchase_invoices (id),
        FOREIGN KEY (item_id) REFERENCES items (id)
      )`,

      // Payments
      `CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        payment_no TEXT NOT NULL,
        payment_date DATE NOT NULL,
        party_id INTEGER NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('receipt', 'payment')),
        amount DECIMAL(15,2) NOT NULL,
        mode TEXT NOT NULL,
        reference_no TEXT,
        notes TEXT,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies (id),
        FOREIGN KEY (party_id) REFERENCES parties (id),
        FOREIGN KEY (created_by) REFERENCES users (id)
      )`,

      // GST Returns tracking
      `CREATE TABLE IF NOT EXISTS gst_returns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        return_type TEXT NOT NULL,
        period_month INTEGER NOT NULL,
        period_year INTEGER NOT NULL,
        filing_date DATE,
        status TEXT DEFAULT 'pending',
        arn TEXT,
        total_taxable_amount DECIMAL(15,2),
        total_tax_amount DECIMAL(15,2),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies (id)
      )`,

      // TDS Returns tracking
      `CREATE TABLE IF NOT EXISTS tds_returns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        return_type TEXT NOT NULL,
        quarter INTEGER NOT NULL,
        financial_year TEXT NOT NULL,
        filing_date DATE,
        status TEXT DEFAULT 'pending',
        arn TEXT,
        total_tds_amount DECIMAL(15,2),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies (id)
      )`,

      // Audit log
      `CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER,
        user_id INTEGER,
        action TEXT NOT NULL,
        table_name TEXT,
        record_id INTEGER,
        old_values TEXT,
        new_values TEXT,
        ip_address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies (id),
        FOREIGN KEY (user_id) REFERENCES users (id)
      )`
    ];

    for (const tableQuery of tables) {
      this.db.exec(tableQuery);
    }
  }

  async insertDefaultData() {
    // Insert default admin user
    const adminExists = this.db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
    
    if (!adminExists) {
      const passwordHash = crypto.createHash('sha256').update('admin123').digest('hex');
      
      this.db.prepare(`
        INSERT INTO users (username, password_hash, full_name, role)
        VALUES (?, ?, ?, ?)
      `).run('admin', passwordHash, 'System Administrator', 'admin');
      
      console.log('Default admin user created (username: admin, password: admin123)');
    }

    // Insert HSN/SAC codes sample data
    const hsnExists = this.db.prepare('SELECT COUNT(*) as count FROM items WHERE company_id IS NULL').get();
    
    if (hsnExists.count === 0) {
      // This would be expanded with full HSN/SAC database
      const sampleHSN = [
        { code: '1001', description: 'Live horses, asses, mules and hinnies', gst_rate: 0 },
        { code: '1006', description: 'Rice', gst_rate: 5 },
        { code: '6403', description: 'Footwear', gst_rate: 18 },
        { code: '8517', description: 'Electrical apparatus for line telephony', gst_rate: 18 },
        { code: '9983', description: 'Business support services', gst_rate: 18 }
      ];
      
      // These would be master HSN codes available to all companies
    }
  }

  // Company management methods
  async createCompany(companyData) {
    const stmt = this.db.prepare(`
      INSERT INTO companies (name, legal_name, gstin, pan, cin, address, city, state, pincode, phone, email, website)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      companyData.name,
      companyData.legal_name,
      companyData.gstin,
      companyData.pan,
      companyData.cin || null,
      companyData.address,
      companyData.city,
      companyData.state,
      companyData.pincode,
      companyData.phone || null,
      companyData.email || null,
      companyData.website || null
    );
    
    return { id: result.lastInsertRowid, ...companyData };
  }

  async getCompanies() {
    const stmt = this.db.prepare('SELECT * FROM companies WHERE is_active = 1 ORDER BY name');
    return stmt.all();
  }

  async getCompany(id) {
    const stmt = this.db.prepare('SELECT * FROM companies WHERE id = ? AND is_active = 1');
    return stmt.get(id);
  }

  // User management
  async authenticateUser(username, password) {
    const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
    const stmt = this.db.prepare('SELECT * FROM users WHERE username = ? AND password_hash = ? AND is_active = 1');
    const user = stmt.get(username, passwordHash);
    
    if (user) {
      // Update last login
      this.db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
      delete user.password_hash;
      return user;
    }
    
    return null;
  }

  // Transaction methods
  async createSalesInvoice(invoiceData) {
    const transaction = this.db.transaction((data) => {
      // Insert main invoice
      const invoiceStmt = this.db.prepare(`
        INSERT INTO sales_invoices 
        (company_id, invoice_no, invoice_date, customer_id, place_of_supply, 
         total_amount, cgst_amount, sgst_amount, igst_amount, total_gst, grand_total, 
         payment_terms, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const invoiceResult = invoiceStmt.run(
        data.company_id, data.invoice_no, data.invoice_date, data.customer_id,
        data.place_of_supply, data.total_amount, data.cgst_amount, data.sgst_amount,
        data.igst_amount, data.total_gst, data.grand_total, data.payment_terms,
        data.notes, data.created_by
      );
      
      const invoiceId = invoiceResult.lastInsertRowid;
      
      // Insert invoice items
      const itemStmt = this.db.prepare(`
        INSERT INTO sales_invoice_items
        (invoice_id, item_id, quantity, rate, discount_percent, discount_amount,
         taxable_amount, gst_rate, cgst_amount, sgst_amount, igst_amount, total_amount)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      for (const item of data.items) {
        itemStmt.run(
          invoiceId, item.item_id, item.quantity, item.rate, item.discount_percent,
          item.discount_amount, item.taxable_amount, item.gst_rate, item.cgst_amount,
          item.sgst_amount, item.igst_amount, item.total_amount
        );
        
        // Update stock for products
        this.db.prepare(`
          UPDATE items SET current_stock = current_stock - ?
          WHERE id = ? AND type = 'product'
        `).run(item.quantity, item.item_id);
      }
      
      return invoiceId;
    });
    
    return transaction(invoiceData);
  }

  // Reporting methods
  async getDashboardData(companyId) {
    const queries = {
      totalSales: 'SELECT COALESCE(SUM(grand_total), 0) as total FROM sales_invoices WHERE company_id = ? AND DATE(invoice_date) >= DATE("now", "start of month")',
      totalPurchases: 'SELECT COALESCE(SUM(grand_total), 0) as total FROM purchase_invoices WHERE company_id = ? AND DATE(invoice_date) >= DATE("now", "start of month")',
      pendingReceivables: 'SELECT COALESCE(SUM(grand_total), 0) as total FROM sales_invoices WHERE company_id = ? AND status != "paid"',
      pendingPayables: 'SELECT COALESCE(SUM(grand_total), 0) as total FROM purchase_invoices WHERE company_id = ? AND status != "paid"',
      lowStockItems: 'SELECT COUNT(*) as count FROM items WHERE company_id = ? AND current_stock <= minimum_stock AND type = "product"'
    };
    
    const result = {};
    
    for (const [key, query] of Object.entries(queries)) {
      const data = this.db.prepare(query).get(companyId);
      result[key] = data.total || data.count || 0;
    }
    
    return result;
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = { DatabaseManager };
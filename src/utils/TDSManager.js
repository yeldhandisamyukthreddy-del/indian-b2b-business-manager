class TDSManager {
  constructor() {
    this.tdsRates = {
      '194A': { // Interest other than Securities
        withPAN: 10.0,
        withoutPAN: 20.0,
        threshold: 40000
      },
      '194C': { // Payments to contractors
        withPAN: 1.0,
        withoutPAN: 20.0,
        threshold: 30000,
        thresholdIndividual: 100000
      },
      '194H': { // Commission or brokerage
        withPAN: 5.0,
        withoutPAN: 20.0,
        threshold: 15000
      },
      '194I': { // Rent
        withPAN: 10.0,
        withoutPAN: 20.0,
        threshold: 240000,
        plantMachinery: 2.0
      },
      '194J': { // Professional/technical services
        withPAN: 10.0,
        withoutPAN: 20.0,
        threshold: 30000
      },
      '194O': { // E-commerce transactions
        withPAN: 1.0,
        withoutPAN: 1.0,
        threshold: 500000
      },
      '194Q': { // Purchase of goods
        withPAN: 0.1,
        withoutPAN: 0.1,
        threshold: 5000000
      },
      '194S': { // Crypto currency
        withPAN: 1.0,
        withoutPAN: 1.0,
        threshold: 10000
      }
    };
    
    this.tcsRates = {
      '206C_1H': { // Sale of goods
        rate: 0.1,
        threshold: 5000000
      },
      '206CG': { // Parking lot/toll plaza
        rate: 2.0,
        threshold: 250000
      }
    };
  }

  calculateTDS(amount, section, panAvailable = false, vendorType = 'company') {
    const paymentAmount = parseFloat(amount);
    
    if (!this.tdsRates[section]) {
      return {
        tdsAmount: 0,
        tdsRate: 0,
        applicableThreshold: 0,
        isApplicable: false,
        error: `Invalid TDS section: ${section}`
      };
    }
    
    const sectionData = this.tdsRates[section];
    let threshold = sectionData.threshold;
    
    // Special handling for section 194C (contractors)
    if (section === '194C' && vendorType === 'individual') {
      threshold = sectionData.thresholdIndividual;
    }
    
    const isApplicable = paymentAmount >= threshold;
    
    if (!isApplicable) {
      return {
        tdsAmount: 0,
        tdsRate: 0,
        applicableThreshold: threshold,
        isApplicable: false,
        reason: `Payment amount ${paymentAmount} is below threshold ${threshold}`
      };
    }
    
    const tdsRate = panAvailable ? sectionData.withPAN : sectionData.withoutPAN;
    const tdsAmount = (paymentAmount * tdsRate) / 100;
    
    return {
      tdsAmount: parseFloat(tdsAmount.toFixed(2)),
      tdsRate: tdsRate,
      applicableThreshold: threshold,
      isApplicable: true,
      netPayableAmount: parseFloat((paymentAmount - tdsAmount).toFixed(2)),
      section: section
    };
  }

  calculateTCS(amount, section) {
    const saleAmount = parseFloat(amount);
    
    if (!this.tcsRates[section]) {
      return {
        tcsAmount: 0,
        tcsRate: 0,
        applicableThreshold: 0,
        isApplicable: false,
        error: `Invalid TCS section: ${section}`
      };
    }
    
    const sectionData = this.tcsRates[section];
    const isApplicable = saleAmount >= sectionData.threshold;
    
    if (!isApplicable) {
      return {
        tcsAmount: 0,
        tcsRate: 0,
        applicableThreshold: sectionData.threshold,
        isApplicable: false,
        reason: `Sale amount ${saleAmount} is below threshold ${sectionData.threshold}`
      };
    }
    
    const tcsAmount = (saleAmount * sectionData.rate) / 100;
    
    return {
      tcsAmount: parseFloat(tcsAmount.toFixed(2)),
      tcsRate: sectionData.rate,
      applicableThreshold: sectionData.threshold,
      isApplicable: true,
      totalReceivableAmount: parseFloat((saleAmount + tcsAmount).toFixed(2)),
      section: section
    };
  }

  validatePAN(pan) {
    if (!pan) return { valid: false, error: 'PAN is required' };
    
    // PAN format: AAAAA9999A
    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    
    if (!panRegex.test(pan)) {
      return { valid: false, error: 'Invalid PAN format' };
    }
    
    return { valid: true };
  }

  generate26QData(companyId, quarter, financialYear, tdsData) {
    const quarterMonths = {
      'Q1': ['04', '05', '06'],
      'Q2': ['07', '08', '09'],
      'Q3': ['10', '11', '12'],
      'Q4': ['01', '02', '03']
    };
    
    const form26Q = {
      formType: '26Q',
      quarter: quarter,
      financialYear: financialYear,
      assessmentYear: this.getAssessmentYear(financialYear),
      pan: '',
      tan: '',
      deductorDetails: {
        name: '',
        address: '',
        city: '',
        state: '',
        pincode: ''
      },
      challanDetails: [],
      deducteeDetails: [],
      summary: {
        totalDeductees: 0,
        totalTDS: 0,
        totalChallan: 0
      }
    };
    
    // Process TDS data for the quarter
    const monthsInQuarter = quarterMonths[quarter];
    const filteredTDS = tdsData.filter(tds => {
      const tdsMonth = new Date(tds.payment_date).getMonth() + 1;
      return monthsInQuarter.includes(String(tdsMonth).padStart(2, '0'));
    });
    
    // Group by deductee (vendor)
    const deducteeWise = {};
    filteredTDS.forEach(tds => {
      const key = tds.vendor_pan || 'NOPAN';
      if (!deducteeWise[key]) {
        deducteeWise[key] = {
          pan: tds.vendor_pan,
          name: tds.vendor_name,
          payments: []
        };
      }
      deducteeWise[key].payments.push(tds);
    });
    
    // Create deductee details
    Object.values(deducteeWise).forEach(deductee => {
      const totalTDS = deductee.payments.reduce((sum, payment) => sum + payment.tds_amount, 0);
      
      form26Q.deducteeDetails.push({
        pan: deductee.pan,
        name: deductee.name,
        totalTDS: totalTDS,
        payments: deductee.payments.map(payment => ({
          section: payment.tds_section,
          amount: payment.amount,
          tdsAmount: payment.tds_amount,
          date: payment.payment_date,
          challanNo: payment.challan_no
        }))
      });
    });
    
    form26Q.summary.totalDeductees = Object.keys(deducteeWise).length;
    form26Q.summary.totalTDS = filteredTDS.reduce((sum, tds) => sum + tds.tds_amount, 0);
    
    return form26Q;
  }

  generate24QData(companyId, quarter, financialYear, salaryTDSData) {
    // Similar to 26Q but for salary TDS
    const form24Q = {
      formType: '24Q',
      quarter: quarter,
      financialYear: financialYear,
      assessmentYear: this.getAssessmentYear(financialYear),
      pan: '',
      tan: '',
      deductorDetails: {
        name: '',
        address: '',
        city: '',
        state: '',
        pincode: ''
      },
      employeeDetails: [],
      summary: {
        totalEmployees: 0,
        totalTDS: 0,
        totalSalary: 0
      }
    };
    
    // Process salary TDS data
    salaryTDSData.forEach(employee => {
      form24Q.employeeDetails.push({
        pan: employee.pan,
        name: employee.name,
        grossSalary: employee.gross_salary,
        tdsAmount: employee.tds_amount,
        section: '192', // Salary TDS section
        quarters: employee.quarterly_data
      });
    });
    
    form24Q.summary.totalEmployees = salaryTDSData.length;
    form24Q.summary.totalTDS = salaryTDSData.reduce((sum, emp) => sum + emp.tds_amount, 0);
    form24Q.summary.totalSalary = salaryTDSData.reduce((sum, emp) => sum + emp.gross_salary, 0);
    
    return form24Q;
  }

  generateTDSCertificate(paymentData, deductorDetails) {
    const certificate = {
      certificateType: '16A',
      uniqueTransactionNo: this.generateUTN(),
      assessmentYear: this.getAssessmentYear(paymentData.financial_year),
      deductorDetails: {
        name: deductorDetails.name,
        address: deductorDetails.address,
        pan: deductorDetails.pan,
        tan: deductorDetails.tan
      },
      deducteeDetails: {
        name: paymentData.vendor_name,
        address: paymentData.vendor_address,
        pan: paymentData.vendor_pan
      },
      paymentDetails: {
        amount: paymentData.amount,
        tdsAmount: paymentData.tds_amount,
        tdsRate: paymentData.tds_rate,
        section: paymentData.tds_section,
        date: paymentData.payment_date,
        challanNo: paymentData.challan_no,
        challanDate: paymentData.challan_date,
        bsrCode: paymentData.bsr_code
      },
      dateOfGeneration: new Date().toISOString().split('T')[0],
      responsiblePerson: {
        name: deductorDetails.responsible_person_name,
        designation: deductorDetails.responsible_person_designation
      }
    };
    
    return certificate;
  }

  getAssessmentYear(financialYear) {
    // Financial Year 2023-24 => Assessment Year 2024-25
    const [startYear, endYear] = financialYear.split('-');
    return `${endYear}-${String(parseInt(endYear) + 1).slice(-2)}`;
  }

  generateUTN() {
    // Generate Unique Transaction Number
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${timestamp}${random}`;
  }

  getTDSRateCard() {
    return Object.keys(this.tdsRates).map(section => ({
      section,
      description: this.getSectionDescription(section),
      withPAN: this.tdsRates[section].withPAN,
      withoutPAN: this.tdsRates[section].withoutPAN,
      threshold: this.tdsRates[section].threshold
    }));
  }

  getSectionDescription(section) {
    const descriptions = {
      '194A': 'Interest other than Securities',
      '194C': 'Payments to contractors',
      '194H': 'Commission or brokerage',
      '194I': 'Rent',
      '194J': 'Professional/technical services',
      '194O': 'E-commerce transactions',
      '194Q': 'Purchase of goods',
      '194S': 'Crypto currency payments'
    };
    
    return descriptions[section] || 'Unknown section';
  }
}

module.exports = { TDSManager };
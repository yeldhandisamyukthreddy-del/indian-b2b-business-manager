class GSTManager {
  constructor() {
    this.gstRates = {
      0: { cgst: 0, sgst: 0, igst: 0 },
      5: { cgst: 2.5, sgst: 2.5, igst: 5 },
      12: { cgst: 6, sgst: 6, igst: 12 },
      18: { cgst: 9, sgst: 9, igst: 18 },
      28: { cgst: 14, sgst: 14, igst: 28 }
    };
    
    this.stateCodes = {
      'ANDHRA PRADESH': '37',
      'ARUNACHAL PRADESH': '12',
      'ASSAM': '18',
      'BIHAR': '10',
      'CHHATTISGARH': '22',
      'GOA': '30',
      'GUJARAT': '24',
      'HARYANA': '06',
      'HIMACHAL PRADESH': '02',
      'JHARKHAND': '20',
      'KARNATAKA': '29',
      'KERALA': '32',
      'MADHYA PRADESH': '23',
      'MAHARASHTRA': '27',
      'MANIPUR': '14',
      'MEGHALAYA': '17',
      'MIZORAM': '15',
      'NAGALAND': '13',
      'ODISHA': '21',
      'PUNJAB': '03',
      'RAJASTHAN': '08',
      'SIKKIM': '11',
      'TAMIL NADU': '33',
      'TELANGANA': '36',
      'TRIPURA': '16',
      'UTTAR PRADESH': '09',
      'UTTARAKHAND': '05',
      'WEST BENGAL': '19',
      'ANDAMAN AND NICOBAR ISLANDS': '35',
      'CHANDIGARH': '04',
      'DADRA AND NAGAR HAVELI': '26',
      'DAMAN AND DIU': '25',
      'DELHI': '07',
      'JAMMU AND KASHMIR': '01',
      'LADAKH': '38',
      'LAKSHADWEEP': '31',
      'PUDUCHERRY': '34'
    };
  }

  calculateGST(amount, gstRate, companyState, placeOfSupply) {
    const taxableAmount = parseFloat(amount);
    const rate = parseFloat(gstRate);
    
    if (!this.gstRates[rate]) {
      throw new Error(`Invalid GST rate: ${rate}%`);
    }
    
    const isInterstate = this.isInterstateTransaction(companyState, placeOfSupply);
    const rates = this.gstRates[rate];
    
    let cgst = 0, sgst = 0, igst = 0;
    
    if (isInterstate) {
      igst = (taxableAmount * rates.igst) / 100;
    } else {
      cgst = (taxableAmount * rates.cgst) / 100;
      sgst = (taxableAmount * rates.sgst) / 100;
    }
    
    const totalGst = cgst + sgst + igst;
    const totalAmount = taxableAmount + totalGst;
    
    return {
      taxableAmount: parseFloat(taxableAmount.toFixed(2)),
      cgst: parseFloat(cgst.toFixed(2)),
      sgst: parseFloat(sgst.toFixed(2)),
      igst: parseFloat(igst.toFixed(2)),
      totalGst: parseFloat(totalGst.toFixed(2)),
      totalAmount: parseFloat(totalAmount.toFixed(2)),
      isInterstate
    };
  }

  isInterstateTransaction(companyState, placeOfSupply) {
    const companyStateCode = this.getStateCode(companyState);
    const posCode = this.getStateCode(placeOfSupply);
    
    return companyStateCode !== posCode;
  }

  getStateCode(stateName) {
    const normalizedState = stateName.toUpperCase().trim();
    return this.stateCodes[normalizedState] || '00';
  }

  validateGSTIN(gstin) {
    if (!gstin) return { valid: false, error: 'GSTIN is required' };
    
    // GSTIN format: 15 characters
    // First 2: State code
    // Next 10: PAN
    // 13th: Entity code
    // 14th: Checksum
    // 15th: Default 'Z'
    
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    
    if (!gstinRegex.test(gstin)) {
      return { valid: false, error: 'Invalid GSTIN format' };
    }
    
    const stateCode = gstin.substring(0, 2);
    const validStateCodes = Object.values(this.stateCodes);
    
    if (!validStateCodes.includes(stateCode)) {
      return { valid: false, error: 'Invalid state code in GSTIN' };
    }
    
    return { valid: true, stateCode };
  }

  generateGSTR1Data(companyId, month, year, salesData) {
    const gstr1Data = {
      gstin: '',
      ret_period: `${String(month).padStart(2, '0')}${year}`,
      b2b: [],
      b2cl: [],
      b2cs: [],
      cdnr: [],
      cdnur: [],
      exp: [],
      at: [],
      atadj: [],
      exemp: [],
      itcr: [],
      isd: []
    };
    
    // Process sales data and categorize transactions
    salesData.forEach(invoice => {
      const invoiceData = this.processInvoiceForGSTR1(invoice);
      
      if (invoice.customer_gstin && invoice.grand_total >= 250000) {
        gstr1Data.b2b.push(invoiceData);
      } else if (!invoice.customer_gstin && invoice.grand_total >= 250000) {
        gstr1Data.b2cl.push(invoiceData);
      } else {
        gstr1Data.b2cs.push(invoiceData);
      }
    });
    
    return gstr1Data;
  }

  processInvoiceForGSTR1(invoice) {
    return {
      inum: invoice.invoice_no,
      idt: invoice.invoice_date,
      val: invoice.grand_total,
      pos: this.getStateCode(invoice.place_of_supply),
      rchrg: 'N',
      inv_typ: 'R',
      itms: invoice.items.map(item => ({
        num: 1,
        itm_det: {
          rt: item.gst_rate,
          txval: item.taxable_amount,
          iamt: item.igst_amount,
          camt: item.cgst_amount,
          samt: item.sgst_amount,
          csamt: 0
        }
      }))
    };
  }

  generateGSTR3BData(companyId, month, year, salesData, purchaseData) {
    const gstr3bData = {
      gstin: '',
      ret_period: `${String(month).padStart(2, '0')}${year}`,
      sec_sum: {
        ttl_val: 0,
        ttl_igst: 0,
        ttl_cgst: 0,
        ttl_sgst: 0,
        ttl_cess: 0
      },
      itc_elg: {
        itc_avl: []
      },
      intr_ltfee: {
        intr_details: {
          sec_3_1: 0,
          sec_3_2: 0
        }
      }
    };
    
    // Calculate outward supplies
    let totalTaxable = 0, totalIgst = 0, totalCgst = 0, totalSgst = 0;
    
    salesData.forEach(invoice => {
      totalTaxable += invoice.total_amount;
      totalIgst += invoice.igst_amount;
      totalCgst += invoice.cgst_amount;
      totalSgst += invoice.sgst_amount;
    });
    
    gstr3bData.sec_sum.ttl_val = totalTaxable;
    gstr3bData.sec_sum.ttl_igst = totalIgst;
    gstr3bData.sec_sum.ttl_cgst = totalCgst;
    gstr3bData.sec_sum.ttl_sgst = totalSgst;
    
    // Calculate ITC from purchases
    let itcIgst = 0, itcCgst = 0, itcSgst = 0;
    
    purchaseData.forEach(invoice => {
      itcIgst += invoice.igst_amount;
      itcCgst += invoice.cgst_amount;
      itcSgst += invoice.sgst_amount;
    });
    
    gstr3bData.itc_elg.itc_avl.push({
      ty: 'IMPG',
      iamt: itcIgst,
      camt: itcCgst,
      samt: itcSgst,
      csamt: 0
    });
    
    return gstr3bData;
  }

  generateEWayBill(invoiceData) {
    const ewayBillData = {
      supplyType: 'O', // Outward
      subSupplyType: '1', // Supply
      docType: 'INV', // Invoice
      docNo: invoiceData.invoice_no,
      docDate: invoiceData.invoice_date,
      gstin: invoiceData.company_gstin,
      fromGstin: invoiceData.company_gstin,
      fromTrdName: invoiceData.company_name,
      fromAddr1: invoiceData.company_address,
      fromPlace: invoiceData.company_city,
      fromPincode: invoiceData.company_pincode,
      fromStateCode: this.getStateCode(invoiceData.company_state),
      toGstin: invoiceData.customer_gstin || 'URP',
      toTrdName: invoiceData.customer_name,
      toAddr1: invoiceData.customer_address,
      toPlace: invoiceData.customer_city,
      toPincode: invoiceData.customer_pincode,
      toStateCode: this.getStateCode(invoiceData.customer_state),
      totalValue: invoiceData.total_amount,
      cgstValue: invoiceData.cgst_amount,
      sgstValue: invoiceData.sgst_amount,
      igstValue: invoiceData.igst_amount,
      cessValue: 0,
      totInvValue: invoiceData.grand_total,
      transMode: '1', // Road
      transDistance: '0',
      transporterName: '',
      transporterId: '',
      transDocNo: '',
      transDocDate: '',
      vehicleNo: '',
      vehicleType: 'R', // Regular
      itemList: invoiceData.items.map((item, index) => ({
        productName: item.name,
        productDesc: item.description,
        hsnCode: item.hsn_code,
        quantity: item.quantity,
        qtyUnit: item.unit,
        taxableAmount: item.taxable_amount,
        sgstRate: item.sgst_rate || 0,
        cgstRate: item.cgst_rate || 0,
        igstRate: item.igst_rate || 0,
        cessRate: 0
      }))
    };
    
    return ewayBillData;
  }
}

module.exports = { GSTManager };
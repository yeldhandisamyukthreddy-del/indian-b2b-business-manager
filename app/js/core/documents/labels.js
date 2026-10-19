// Default labels printed on invoices, per language. Users can rename any of them per template
// (Settings → Invoice templates). A missing key falls back to English.
// Telugu labels were written for this feature and should be reviewed by a native speaker.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else (root.Vyapar = root.Vyapar || {}).labels = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const en = {
        title: 'TAX INVOICE',
        invoiceNumber: 'Invoice No',
        invoiceDate: 'Invoice Date',
        time: 'Time',
        dueDate: 'Due Date',
        reference: 'Reference',
        ewayBill: 'E-way Bill No',
        paymentTerms: 'Payment Terms',
        paymentTermsValue: 'Net {days} days',
        dueOnReceipt: 'Due on receipt',
        placeOfSupply: 'Place of Supply',
        reverseCharge: 'Reverse Charge',
        yes: 'Yes',
        no: 'No',
        billTo: 'Bill To',
        shipTo: 'Ship To',
        gstin: 'GSTIN',
        state: 'State',
        stateCode: 'Code',
        phone: 'Phone',
        email: 'Email',
        colIndex: '#',
        colName: 'Item',
        colHsnOrSac: 'HSN/SAC',
        colQty: 'Qty',
        colRate: 'Rate',
        colDiscount: 'Discount',
        colAmount: 'Taxable Value',
        colTaxPercent: 'GST %',
        colTaxAmount: 'GST',
        colTotal: 'Total',
        batch: 'Batch',
        serial: 'Serial',
        expiry: 'Exp',
        cgst: 'CGST',
        sgst: 'SGST',
        igst: 'IGST',
        subTotal: 'Sub Total',
        discount: 'Discount',
        shipping: 'Shipping',
        roundOff: 'Round Off',
        total: 'Grand Total',
        paid: 'Paid',
        credits: 'Credit Notes',
        balanceDue: 'Balance Due',
        amountInWords: 'Amount in words',
        taxIncluded: 'Prices include GST',
        taxSummary: 'Tax Summary',
        taxableValue: 'Taxable Value',
        totalTax: 'Total Tax',
        notes: 'Notes',
        terms: 'Terms & Conditions',
        paymentDetails: 'Bank Details',
        bankName: 'Bank',
        accountNo: 'A/c No',
        ifsc: 'IFSC',
        paymentStub: 'Payment Slip',
        amountEnclosed: 'Amount Enclosed',
        customer: 'Customer',
        signatureFor: 'For',
        authorisedSignatory: 'Authorised Signatory',
        stampPaid: 'PAID',
        stampPartial: 'PARTIALLY PAID',
        stampOverdue: 'OVERDUE',
        page: 'Page',
        of: 'of',
        items: 'Items',
        thankYou: 'Thank you! Please visit again.',
        computerGenerated: 'This is a computer-generated invoice.',
        vatNumber: 'VAT No',
        eori: 'EORI',
        reverseChargeNote: 'Reverse charge: the customer accounts for the VAT.'
    };

    const te = {
        title: 'పన్ను ఇన్‌వాయిస్',
        invoiceNumber: 'ఇన్‌వాయిస్ నం.',
        invoiceDate: 'తేదీ',
        time: 'సమయం',
        dueDate: 'చెల్లింపు గడువు',
        reference: 'రిఫరెన్స్',
        paymentTerms: 'చెల్లింపు నిబంధనలు',
        paymentTermsValue: '{days} రోజుల్లో',
        placeOfSupply: 'సరఫరా స్థలం',
        billTo: 'బిల్లు గ్రహీత',
        shipTo: 'సరుకు పంపే చిరునామా',
        state: 'రాష్ట్రం',
        phone: 'ఫోన్',
        email: 'ఇమెయిల్',
        colName: 'వస్తువు',
        colQty: 'పరిమాణం',
        colRate: 'ధర',
        colDiscount: 'తగ్గింపు',
        colAmount: 'పన్ను విధించదగిన విలువ',
        colTotal: 'మొత్తం',
        subTotal: 'ఉప మొత్తం',
        discount: 'తగ్గింపు',
        roundOff: 'రౌండ్ ఆఫ్',
        total: 'మొత్తం',
        paid: 'చెల్లించినది',
        balanceDue: 'బాకీ',
        amountInWords: 'అక్షరాలలో మొత్తం',
        taxSummary: 'పన్ను సారాంశం',
        notes: 'గమనికలు',
        terms: 'నిబంధనలు & షరతులు',
        paymentDetails: 'బ్యాంక్ వివరాలు',
        customer: 'కస్టమర్',
        authorisedSignatory: 'అధీకృత సంతకం',
        stampPaid: 'చెల్లించబడింది',
        thankYou: 'ధన్యవాదాలు! మళ్ళీ రండి.'
    };

    const DEFAULT_LABELS = Object.freeze({ en: Object.freeze(en), te: Object.freeze(te) });
    const LABEL_KEYS = Object.freeze(Object.keys(en));
    // Languages written right to left. Urdu is an Indian scheduled language.
    const RTL_LANGUAGES = Object.freeze(['ar', 'fa', 'he', 'ur']);

    // English, then the language's defaults, then the user's own labels for that language
    function resolveLabels(lang, custom = {}) {
        const base = { ...en, ...(DEFAULT_LABELS[lang] || {}) };
        const mine = (custom && custom[lang]) || {};
        LABEL_KEYS.forEach(k => {
            if (typeof mine[k] === 'string' && mine[k].trim()) base[k] = mine[k];
        });
        return base;
    }

    return { DEFAULT_LABELS, LABEL_KEYS, RTL_LANGUAGES, resolveLabels };
});

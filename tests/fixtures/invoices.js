// Invoice fixtures in the view-model builder's domain shape (see docs/invoice-templates.md).
// Used by unit tests, snapshot tests and `npm run render-invoice`.
const fs = require('fs');
const path = require('path');
const settings = require('../../app/js/core/documents/settings.js');
// India GST's invoice blocks, as the region_india_gst module contributes them in the app
const indiaBlocks = require('../../app/js/modules/region_india_gst/document-blocks.js');

// A real 240×80 PNG (tests/fixtures/logo.png) so PDFs and screenshots show a logo
const LOGO = Object.freeze({
    mime: 'image/png',
    width: 240,
    height: 80,
    dataUri: 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, 'logo.png')).toString('base64')
});

const ORG = Object.freeze({
    name: 'Sri Lakshmi Traders',
    address: '12-3, Main Road\nAbids, Hyderabad 500001',
    gstin: '36AABCU9603R1ZM',
    stateCode: '36',
    stateName: 'Telangana',
    phone: '+91 98480 12345',
    email: 'accounts@srilakshmi.example',
    bankAccounts: [{ bankName: 'State Bank of India', accountNo: '30123456789', ifsc: 'SBIN0001234' }],
    terms: 'Goods once sold cannot be returned.\nPayment due within credit period.\nSubject to Hyderabad jurisdiction.',
    timeZone: 'Asia/Kolkata'
});

const KARNATAKA_BUYER = Object.freeze({
    name: 'Bengaluru Build Mart Pvt Ltd',
    address: '45, 2nd Cross, Peenya Industrial Area\nBengaluru 560058',
    gstin: '29AAACB1234F1Z5',
    stateCode: '29',
    stateName: 'Karnataka',
    phone: '080 2345 6789',
    email: ''
});

const LOCAL_BUYER = Object.freeze({
    name: `Anil "Best" Stores & Sons`,
    address: 'Shop 4, Koti\nHyderabad',
    gstin: '',
    stateCode: '36',
    stateName: 'Telangana',
    phone: '',
    email: ''
});

// Effective settings as the invoice screen passes them (India GST on), optionally changed
function settingsFor(type, patch = {}, extra = {}) {
    return { ...settings.mergeSettings(type, patch), regions: { extraTaxId: true }, regionModules: [indiaBlocks], extraTaxIds: [], logo: null, ...extra };
}

const simple = Object.freeze({
    number: 'INV-0007',
    date: '2026-10-18',
    createdAt: '2026-10-18T09:05:00.000Z',
    dueDate: '2026-11-17',
    creditDays: 30,
    asOfDate: '2026-10-18',
    status: 'pending',
    customer: LOCAL_BUYER,
    shipTo: null,
    placeOfSupply: '36',
    placeOfSupplyName: 'Telangana',
    reverseCharge: false,
    reference: '',
    ewayBillNumber: '',
    notes: 'Delivered by <b>own vehicle</b> TS09 AB 1234',
    lines: [
        { name: 'Cement 50kg', hsn: '2523', unit: 'BAG', qty: 10, rate: 400, gstRate: 28 },
        { name: 'TMT Bar 12mm', hsn: '7214', unit: 'KG', qty: 25.5, rate: 62.75, gstRate: 18 }
    ],
    roundOff: 'nearest',
    paidAmount: 2000,
    creditedAmount: 0,
    currency: 'INR'
});

const PRODUCTS = [
    ['Portland Cement 53 Grade', '2523', 'BAG', 28],
    ['TMT Steel Bar Fe500 10mm', '7214', 'KG', 18],
    ['River Sand (Fine)', '2505', 'TON', 5],
    ['PVC Pipe 4 inch 6 m', '3917', 'NOS', 18],
    ['Ceramic Floor Tile 600×600 Glossy Ivory', '6907', 'BOX', 18],
    ['Cement Bricks Solid 6 inch', '6810', 'NOS', 12],
    ['Electrical Wire 2.5 sq mm FR copper, 90 m coil', '8544', 'COIL', 18],
    ['Labour charges for unloading', '9967', 'JOB', 18]
];

// 60 lines: enough for three A4 pages, with a long name and line discounts
const multiPage = Object.freeze({
    ...simple,
    number: 'INV-0420',
    customer: KARNATAKA_BUYER,
    placeOfSupply: '29',
    placeOfSupplyName: 'Karnataka',
    notes: '',
    paidAmount: 0,
    lines: Array.from({ length: 60 }, (_, i) => {
        const [name, hsn, unit, gstRate] = PRODUCTS[i % PRODUCTS.length];
        return {
            name: i === 7 ? `${name} — includes loading, unloading and stacking at the site as per the work order dated 01/10/2026` : name,
            hsn,
            unit,
            qty: (i % 9) + 1,
            rate: 100 + ((i * 37) % 900) + 0.5,
            gstRate,
            discount: i % 10 === 0 ? { type: 'percent', value: 5 } : null
        };
    })
});

// Inter-state B2B with ship-to in another state, e-way bill, reference, extra ids and a logo
const indiaGst = Object.freeze({
    ...simple,
    number: 'TS/2026-27/0153',
    customer: KARNATAKA_BUYER,
    shipTo: { name: 'Bengaluru Build Mart — Site Office', address: 'Plot 9, Hosur Road\nBengaluru 560068', gstin: '', stateCode: '29', stateName: 'Karnataka' },
    placeOfSupply: '29',
    placeOfSupplyName: 'Karnataka',
    reference: 'PO-BBM-7781',
    ewayBillNumber: '3410 1234 5678',
    notes: 'Material dispatched in 2 lots.',
    lines: [
        { name: 'Portland Cement 53 Grade', hsn: '2523', unit: 'BAG', qty: 200, rate: 365, gstRate: 28 },
        { name: 'TMT Steel Bar Fe500 10mm', hsn: '7214', unit: 'KG', qty: 1250.5, rate: 61.4, gstRate: 18 },
        { name: 'PVC Pipe 4 inch 6 m', hsn: '3917', unit: 'NOS', qty: 40, rate: 812.25, gstRate: 18 },
        { name: 'Transport (Hyderabad to Bengaluru)', hsn: '9965', unit: 'TRIP', qty: 1, rate: 18000, gstRate: 5 }
    ],
    paidAmount: 50000,
    creditedAmount: 1000
});

const indiaGstSettings = type =>
    settingsFor(
        type,
        {},
        {
            extraTaxIds: [
                { label: 'PAN', value: 'AABCU9603R' },
                { label: 'Udyam', value: 'UDYAM-TS-02-0012345' }
            ],
            logo: LOGO
        }
    );

module.exports = { ORG, LOGO, KARNATAKA_BUYER, LOCAL_BUYER, settingsFor, simple, multiPage, indiaGst, indiaGstSettings };

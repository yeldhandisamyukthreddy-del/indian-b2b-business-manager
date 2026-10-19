// Money core: every amount is an integer number of paise, so totals never drift by a paisa.
// Rounding is defined once, here: half away from zero (half-up for positive amounts), applied per line.
// Loaded by app/index.html (as window.Vyapar.money) and by Node tests (require).
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else (root.Vyapar = root.Vyapar || {}).money = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const QTY_PLACES = 6; // quantities and rates are read with up to 6 decimals
    const PCT_PLACES = 4; // GST rates such as 0.25 or 1.5

    // Integer (a * b) / d rounded half away from zero, with BigInt so large invoices cannot overflow
    function mulDivRound(a, b, d) {
        if (!d) throw new Error('mulDivRound: divide by zero');
        const num = BigInt(a) * BigInt(b);
        const den = BigInt(d);
        const neg = num < 0n !== den < 0n;
        const n = num < 0n ? -num : num;
        const m = den < 0n ? -den : den;
        let q = n / m;
        if ((n % m) * 2n >= m) q += 1n;
        return Number(neg ? -q : q);
    }

    // The decimal a person typed, scaled to an integer: scaleDecimal(2.675, 2) === 268.
    // toFixed(10) reads the binary value back as the short decimal it stands for, then digits are rounded as text.
    function scaleBig(value, places) {
        const x = Number(value);
        if (!Number.isFinite(x) || x === 0) return 0n;
        if (Math.abs(x) >= 1e15) throw new Error(`Amount ${value} is too large`);
        const [int, frac] = Math.abs(x).toFixed(10).split('.');
        let n = BigInt(int + frac.slice(0, places));
        if (frac.charCodeAt(places) >= 53) n += 1n; // next digit is 5 or more
        return x < 0 ? -n : n;
    }
    function scaleDecimal(value, places) {
        const n = scaleBig(value, places);
        if (n > BigInt(Number.MAX_SAFE_INTEGER) || -n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`Amount ${value} is too large`);
        return n ? Number(n) : 0;
    }

    const toPaise = rupees => scaleDecimal(rupees, 2);
    const fromPaise = paise => (paise || 0) / 100;

    // qty × rate in paise. Both are read with 6 decimals, so 10 × 1.234 is 1234 paise, not 1230.
    const lineAmount = (qty, rate) => mulDivRound(scaleBig(qty, QTY_PLACES), scaleBig(rate, QTY_PLACES), 10 ** (2 * QTY_PLACES - 2));
    // percent of an amount in paise, e.g. GST: percentOf(100000, 18) === 18000
    const percentOf = (paise, pct) => mulDivRound(paise, scaleDecimal(pct, PCT_PLACES), 100 * 10 ** PCT_PLACES);

    // A tax-inclusive amount split into taxable value + tax that add back to exactly the same amount
    function splitInclusive(amountPaise, pct) {
        const scale = 100 * 10 ** PCT_PLACES;
        const taxable = mulDivRound(amountPaise, scale, scale + scaleDecimal(pct, PCT_PLACES));
        return { taxable, tax: amountPaise - taxable };
    }

    // CGST gets the rounded half, SGST the remainder, so CGST + SGST is always the tax
    function splitHalf(taxPaise) {
        const cgst = mulDivRound(taxPaise, 1, 2);
        return { cgst, sgst: taxPaise - cgst };
    }

    // Split an amount in proportion to weights (largest remainder), e.g. a document discount across lines
    function allocate(totalPaise, weights) {
        const sum = weights.reduce((a, w) => a + Math.abs(w), 0);
        if (!sum || !totalPaise) return weights.map(() => 0);
        const sign = totalPaise < 0 ? -1 : 1;
        const total = Math.abs(totalPaise);
        const exact = weights.map(w => (BigInt(total) * BigInt(Math.abs(w))) / BigInt(sum));
        const rem = weights.map((w, i) => ({ i, r: (BigInt(total) * BigInt(Math.abs(w))) % BigInt(sum) }));
        let left = total - exact.reduce((a, b) => a + Number(b), 0);
        rem.sort((a, b) => (b.r > a.r ? 1 : b.r < a.r ? -1 : a.i - b.i));
        const out = exact.map(Number);
        for (let k = 0; left > 0; k++, left--) out[rem[k % rem.length].i] += 1;
        return out.map(p => (p ? sign * p : 0));
    }

    const numberFormats = new Map();
    function numberFormat(locale, currency) {
        const key = `${locale}|${currency}`;
        if (!numberFormats.has(key)) {
            const symbol = new Intl.NumberFormat(locale, { style: 'currency', currency }).formatToParts(0).find(p => p.type === 'currency');
            const nf = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            numberFormats.set(key, { nf, symbol: symbol ? symbol.value : currency });
        }
        return numberFormats.get(key);
    }
    // '₹1,23,456.78'. The amount is formatted from integer paise; the division is exact at 2 decimals.
    function formatMoney(paise, { locale = 'en-IN', currency = 'INR', currencyAfter = false, symbol = true } = {}) {
        const { nf, symbol: sym } = numberFormat(locale, currency);
        const p = paise || 0;
        const digits = nf.format(Math.abs(p) / 100);
        const body = !symbol ? digits : currencyAfter ? `${digits} ${sym}` : `${sym}${digits}`;
        return p < 0 ? `-${body}` : body;
    }

    // Indian numbering words, e.g. 123456.5 -> "Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Fifty Paise Only"
    const ONES = [
        '',
        'One',
        'Two',
        'Three',
        'Four',
        'Five',
        'Six',
        'Seven',
        'Eight',
        'Nine',
        'Ten',
        'Eleven',
        'Twelve',
        'Thirteen',
        'Fourteen',
        'Fifteen',
        'Sixteen',
        'Seventeen',
        'Eighteen',
        'Nineteen'
    ];
    const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const two = n => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : ''));
    const three = n => (n >= 100 ? ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' : '') : '') + (n % 100 ? two(n % 100) : '');
    function words(n) {
        if (n === 0) return 'Zero';
        const parts = [];
        const crore = Math.floor(n / 10000000);
        n %= 10000000;
        const lakh = Math.floor(n / 100000);
        n %= 100000;
        const thousand = Math.floor(n / 1000);
        n %= 1000;
        if (crore) parts.push(words(crore) + ' Crore');
        if (lakh) parts.push(two(lakh) + ' Lakh');
        if (thousand) parts.push(two(thousand) + ' Thousand');
        if (n) parts.push(three(n));
        return parts.join(' ');
    }
    function amountInWordsPaise(paise) {
        const total = Math.abs(paise || 0);
        const rupees = Math.floor(total / 100);
        const p = total % 100;
        return 'Rupees ' + words(rupees) + (p ? ' and ' + two(p) + ' Paise' : '') + ' Only';
    }
    const amountInWords = rupees => amountInWordsPaise(toPaise(rupees));

    return {
        mulDivRound,
        scaleDecimal,
        toPaise,
        fromPaise,
        lineAmount,
        percentOf,
        splitInclusive,
        splitHalf,
        allocate,
        formatMoney,
        amountInWords,
        amountInWordsPaise
    };
});

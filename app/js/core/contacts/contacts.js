// Contacts: customers and vendors are two types of one contact model (kept in their existing stores).
// Regional checks such as the GSTIN come from region modules through the 'contact.validate' extension point.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else ((root.Vyapar = root.Vyapar || {}).core = root.Vyapar.core || {}).contacts = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const TYPES = Object.freeze({
        customers: Object.freeze({ type: 'customer', store: 'customers', label: 'Customer' }),
        vendors: Object.freeze({ type: 'vendor', store: 'vendors', label: 'Vendor' })
    });

    function typeOf(store) {
        if (!Object.prototype.hasOwnProperty.call(TYPES, store)) throw new Error(`"${store}" is not a contact type`);
        return { ...TYPES[store] };
    }

    function validateContact(c) {
        const errors = [];
        if (!String(c.name || '').trim()) errors.push('Name is required');
        if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) errors.push('Email looks wrong');
        if (c.phone && String(c.phone).replace(/\D/g, '').length < 6) errors.push('Phone number looks too short');
        return errors;
    }

    return { TYPES, typeOf, validateContact };
});

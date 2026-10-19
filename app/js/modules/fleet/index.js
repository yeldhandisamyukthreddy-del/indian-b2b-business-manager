// Fleet module: vehicles, drivers and fuel expenses. Offers its vehicles to delivery challans
// ('fulfilment.vehicles') without depending on the fulfilment module.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.Vyapar.app.register(api);
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    return {
        id: 'fleet',
        version: '1.0.0',
        displayName: 'Fleet',
        description: 'Vehicles, drivers and fuel expenses.',
        dependsOn: [],
        adds: ['Vehicle list with drivers', 'Fuel expenses per vehicle', 'Vehicles to pick on delivery challans'],
        stores: ['vehicles', 'drivers', 'fuelExpenses'],
        sections: [{ id: 'vehicles', label: 'Vehicles', labels: { te: 'వాహనాలు' }, order: 80 }],
        navItems: [
            {
                id: 'vehicles',
                label: 'Vehicle List',
                labels: { te: 'వాహన జాబితా' },
                route: 'vehicles',
                section: 'vehicles',
                order: 10,
                requires: ['fleet.view'],
                newAction: 'showVehicleForm',
                icon: '<rect x="1" y="3" width="15" height="13" /> <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /> <circle cx="5.5" cy="18.5" r="2.5" /> <circle cx="18.5" cy="18.5" r="2.5" />'
            },
            {
                id: 'fuel',
                label: 'Fuel Expenses',
                labels: { te: 'ఇంధన ఖర్చులు' },
                route: 'fuel',
                section: 'vehicles',
                order: 20,
                requires: ['fleet.view'],
                newAction: 'showFuelForm',
                icon: '<path d="M3 22V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v14" /> <path d="M17 12h2a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2" /> <path d="M7 10h6" />'
            }
        ],
        permissions: ['fleet.view', 'fleet.manage'],
        extensionPoints: {
            // Vehicles a delivery challan can be sent with: [{ id, number }]
            'fulfilment.vehicles': async ({ list }) => (await list('vehicles')).map(v => ({ id: v.id, number: v.regNumber }))
        }
    };
});

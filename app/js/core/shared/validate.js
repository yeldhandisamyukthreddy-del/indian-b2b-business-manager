// A small schema validator for inputs at the boundaries (module manifests, settings, form data).
// validate(schema, value) returns a list of messages, empty when the value is valid.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else ((root.Vyapar = root.Vyapar || {}).core = root.Vyapar.core || {}).validate = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
    const label = path => path || 'value';

    const string =
        ({ min = 0, max = Infinity, pattern } = {}) =>
        (x, path) => {
            if (typeof x !== 'string') return [`${label(path)} must be text`];
            if (x.length < min) return [`${label(path)} must have at least ${min} character${min === 1 ? '' : 's'}`];
            if (x.length > max) return [`${label(path)} must have at most ${max} characters`];
            if (pattern && !pattern.test(x)) return [`${label(path)} has an invalid format`];
            return [];
        };
    const number =
        ({ int = false, min = -Infinity, max = Infinity } = {}) =>
        (x, path) => {
            if (typeof x !== 'number' || !Number.isFinite(x)) return [`${label(path)} must be a number`];
            if (int && !Number.isInteger(x)) return [`${label(path)} must be a whole number`];
            if (x < min || x > max) return [`${label(path)} must be between ${min} and ${max}`];
            return [];
        };
    const boolean = () => (x, path) => (typeof x === 'boolean' ? [] : [`${label(path)} must be true or false`]);
    const func = () => (x, path) => (typeof x === 'function' ? [] : [`${label(path)} must be a function`]);
    const any = () => () => [];
    const oneOf = values => (x, path) => (values.includes(x) ? [] : [`${label(path)} must be one of ${values.join(', ')}`]);
    const optional = inner => (x, path) => (x === undefined || x === null ? [] : inner(x, path));

    const array =
        (item, { min = 0, max = Infinity } = {}) =>
        (x, path) => {
            if (!Array.isArray(x)) return [`${label(path)} must be a list`];
            const errors = [];
            if (x.length < min) errors.push(`${label(path)} must have at least ${min} items`);
            if (x.length > max) errors.push(`${label(path)} must have at most ${max} items`);
            return [...errors, ...x.flatMap((el, i) => item(el, `${label(path)}[${i}]`))];
        };

    // A map with any keys and values of one shape, e.g. event name → handler
    const record = (key, value) => (x, path) => {
        if (!isObj(x)) return [`${label(path)} must be an object`];
        return Object.keys(x).flatMap(k => [...key(k, `${label(path)} key "${k}"`), ...value(x[k], path ? `${path}.${k}` : k)]);
    };

    function object(shape, { allowUnknown = false } = {}) {
        return (x, path) => {
            if (!isObj(x)) return [`${label(path)} must be an object`];
            const at = k => (path ? `${path}.${k}` : k);
            const errors = Object.keys(shape).flatMap(k => shape[k](x[k], at(k)));
            if (!allowUnknown)
                Object.keys(x)
                    .filter(k => !Object.prototype.hasOwnProperty.call(shape, k))
                    .forEach(k => errors.push(`${at(k)} is not allowed`));
            return errors;
        };
    }

    const validate = (schema, value) => schema(value, '');

    return { string, number, boolean, func, any, oneOf, optional, array, record, object, validate };
});

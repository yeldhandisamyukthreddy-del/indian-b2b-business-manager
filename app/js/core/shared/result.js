// Errors, results and pagination shared by core and modules.
// Errors carry a stable code, a message a person can act on (userMessage) and details for the log.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else ((root.Vyapar = root.Vyapar || {}).core = root.Vyapar.core || {}).result = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    class AppError extends Error {
        constructor(code, userMessage, details = {}) {
            super(userMessage);
            this.name = 'AppError';
            this.code = code;
            this.userMessage = userMessage;
            this.details = details;
        }
    }
    class ValidationError extends AppError {
        constructor(errors, code = 'validation') {
            super(code, errors.join('; '), { errors });
            this.name = 'ValidationError';
            this.errors = errors;
        }
    }
    class NotFoundError extends AppError {
        constructor(what) {
            super('not_found', `${what} was not found`);
            this.name = 'NotFoundError';
            this.status = 404;
        }
    }
    class ForbiddenError extends AppError {
        constructor(what) {
            super('forbidden', `You do not have permission to ${what}`);
            this.name = 'ForbiddenError';
            this.status = 403;
        }
    }

    const ok = value => ({ ok: true, value });
    const err = error => ({ ok: false, error });

    function paginate(list, { page = 1, size = 200 } = {}) {
        const pages = Math.max(1, Math.ceil(list.length / size));
        const p = Math.min(Math.max(1, page), pages);
        return { items: list.slice((p - 1) * size, p * size), page: p, pages, total: list.length };
    }

    return { AppError, ValidationError, NotFoundError, ForbiddenError, ok, err, paginate };
});

// In-process event bus with at-least-once delivery.
// publish() first stores the event (store 'eventLog'), then calls each subscriber in order. A subscriber that
// finished writes a receipt (store 'eventReceipts'), so a redelivered event never runs it twice. A failing
// subscriber does not stop the others; the event stays 'failed' and redeliverPending() retries only what failed.
// Events with the same id (e.g. 'invoice.finalized:12:3') are applied once.
(function (root, factory) {
    const node = typeof module === 'object' && module.exports;
    const deps = node ? { hooks: require('./hooks.js') } : { hooks: root.Vyapar.platform.hooks };
    const api = factory(deps.hooks);
    if (node) module.exports = api;
    else ((root.Vyapar = root.Vyapar || {}).platform = root.Vyapar.platform || {}).events = api;
})(typeof self !== 'undefined' ? self : this, function (hooks) {
    'use strict';

    const LOG = 'eventLog';
    const RECEIPTS = 'eventReceipts';

    class EventDeliveryError extends Error {
        constructor(event, failures) {
            super(`Event ${event.type} (${event.id}) could not be handled by ${failures.map(f => `${f.moduleId}: ${f.error}`).join('; ')}`);
            this.name = 'EventDeliveryError';
            this.event = event;
            this.failures = failures;
        }
    }

    /**
     * @param {{ store: object, now: () => string, subscribers: (orgId: number, type: string, moduleId?: string) => Array<{ key: string, moduleId: string, handler: Function, ctx?: object }> }} options
     */
    function createEventBus({ store, now, subscribers }) {
        let counter = 0;
        // Increasing sequence for ordering stored events (milliseconds × 1000 + a counter)
        const nextSeq = () => Date.now() * 1000 + (counter++ % 1000);
        const receiptId = (key, eventId) => `${key}|${eventId}`;

        async function deliver(event, subs) {
            const delivered = [];
            const skipped = [];
            const failures = [];
            const frozen = hooks.frozenCopy({ id: event.id, type: event.type, companyId: event.companyId, payload: event.payload, createdAt: event.createdAt });
            for (const s of subs) {
                const rid = receiptId(s.key, event.id);
                if (await store.get(RECEIPTS, rid)) {
                    skipped.push(s.key);
                    continue;
                }
                try {
                    await s.handler(frozen, s.ctx);
                    await store.put(RECEIPTS, { id: rid, companyId: event.companyId, eventId: event.id, key: s.key, at: now() });
                    delivered.push(s.key);
                } catch (err) {
                    failures.push({ moduleId: s.moduleId, key: s.key, error: (err && err.message) || String(err) });
                }
            }
            return { delivered, skipped, failures };
        }

        async function finish(event, result) {
            const failed = result.failures.length > 0;
            const updated = {
                ...event,
                status: failed ? 'failed' : 'done',
                attempts: (event.attempts || 0) + 1,
                lastError: failed ? result.failures.map(f => `${f.moduleId}: ${f.error}`).join('; ') : null
            };
            await store.put(LOG, updated);
            if (failed) throw new EventDeliveryError(updated, result.failures);
            return { id: event.id, ...result };
        }

        async function publish(orgId, type, payload, { id } = {}) {
            const eventId = id || `${type}:${now()}:${counter}`;
            const existing = await store.get(LOG, eventId);
            if (existing && existing.status === 'done') return { id: eventId, duplicate: true, delivered: [], skipped: [], failures: [] };
            const event = existing || { id: eventId, companyId: orgId, type, payload, createdAt: now(), seq: nextSeq(), status: 'pending', attempts: 0 };
            if (!existing) await store.put(LOG, event);
            return finish(event, await deliver(event, await subscribers(orgId, type)));
        }

        const pendingFor = async orgId => (await store.getAll(LOG)).filter(e => e.companyId === orgId && e.status !== 'done').sort((a, b) => a.seq - b.seq);

        // Retry events that did not finish (after a crash or a failing handler). Returns the errors that remain.
        async function redeliverPending(orgId) {
            const errors = [];
            for (const event of await pendingFor(orgId)) {
                try {
                    await finish(event, await deliver(event, await subscribers(orgId, event.type)));
                } catch (err) {
                    errors.push(err);
                }
            }
            return errors;
        }

        // Give one module the events it missed while it was off (after afterSeq, no receipt yet)
        async function catchUp(orgId, moduleId, afterSeq) {
            const events = (await store.getAll(LOG)).filter(e => e.companyId === orgId && e.seq > afterSeq).sort((a, b) => a.seq - b.seq);
            const failures = [];
            for (const event of events) {
                const result = await deliver(event, await subscribers(orgId, event.type, moduleId));
                failures.push(...result.failures);
            }
            if (failures.length) throw new EventDeliveryError({ type: 'catch-up', id: moduleId }, failures);
        }

        const lastSeq = async orgId => (await store.getAll(LOG)).filter(e => e.companyId === orgId).reduce((max, e) => Math.max(max, e.seq), 0);

        return { publish, redeliverPending, catchUp, lastSeq };
    }

    return { createEventBus, EventDeliveryError, LOG, RECEIPTS };
});

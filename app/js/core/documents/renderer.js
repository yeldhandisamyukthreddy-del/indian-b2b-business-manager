// Renders an invoice view model with its template into a complete HTML document.
// Template files are found only through the registry. The file loader is passed in
// (fetch in the app, fs in Node), so this module itself does no I/O.
(function (root, factory) {
    const node = typeof module === 'object' && module.exports;
    const deps = node
        ? { registry: require('./registry.js'), mustache: require('./mustache.js'), schema: require('./schema.js'), viewModel: require('./view-model.js') }
        : root.Vyapar;
    const api = factory(deps.registry, deps.mustache, deps.schema, deps.viewModel);
    if (node) module.exports = api;
    else (root.Vyapar = root.Vyapar || {}).renderer = api;
})(typeof self !== 'undefined' ? self : this, function (registry, mustache, schema, viewModel) {
    'use strict';
    const { TemplateError } = mustache;
    const STYLE = /<!--style_start-->([\s\S]*?)<!--style_end-->/;

    // SHA-256 hex, or null where Web Crypto is unavailable (then nothing is cached)
    async function sha256(text) {
        const subtle = globalThis.crypto && globalThis.crypto.subtle;
        if (!subtle) return null;
        const bytes = new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(text)));
        return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    }

    // Separate the CSS from the body, e.g. to send them to an engine that takes them apart
    function splitStyle(html) {
        const m = STYLE.exec(html);
        return { css: m ? m[1].replace(/^\s*<style>|<\/style>\s*$/g, '').trim() : '', html: m ? html.replace(STYLE, '') : html };
    }

    /**
     * @param {{ loadFile: (path: string) => Promise<string>, cacheSize?: number }} options
     */
    function createRenderer({ loadFile, cacheSize = 20 }) {
        const sources = new Map();
        const cache = new Map();
        const stats = { hits: 0, misses: 0 };

        async function load(path, type) {
            try {
                return await loadFile(path);
            } catch (err) {
                throw new TemplateError(`Could not load ${path} for the "${type}" template: ${(err && err.message) || err}`);
            }
        }
        async function readSources(type) {
            const t = registry.getTemplate(type);
            const template = await load(t.templatePath, type);
            const partials = {};
            for (const name of t.partials) partials[name] = await load(registry.partialPath(name), type);
            const version = await sha256([template, ...t.partials.map(n => partials[n])].join('\u0000'));
            return { template, partials, version };
        }
        function loadSources(type) {
            if (!sources.has(type)) {
                const pending = readSources(type);
                sources.set(type, pending);
                pending.catch(() => sources.delete(type)); // retry next time
            }
            return sources.get(type);
        }
        function remember(key, html) {
            if (!key) return;
            cache.delete(key);
            cache.set(key, html);
            if (cache.size > cacheSize) cache.delete(cache.keys().next().value);
        }

        async function renderHtml(vm) {
            const errors = schema.validateViewModel(vm);
            if (errors.length) throw new schema.InvoiceDataError(errors);
            const type = vm.meta.templateType;
            const src = await loadSources(type);
            const key = src.version && (await sha256(`${src.version}\u0000${JSON.stringify(vm)}`));
            if (key && cache.has(key)) {
                stats.hits++;
                const html = cache.get(key);
                remember(key, html);
                return html;
            }
            stats.misses++;
            const html = mustache.render(src.template, vm, src.partials, { name: type });
            // Never hand a blank page to the printer or the PDF engine
            if (!html.includes('data-invoice-root') || !vm.lineItems.length) throw new TemplateError(`The "${type}" template produced no invoice`);
            remember(key, html);
            return html;
        }

        async function renderInvoice({ invoice, org, settings, locale = 'en-IN', mode = 'preview' }) {
            const vm = viewModel.buildInvoiceViewModel(invoice, org, settings, locale, mode);
            return { html: await renderHtml(vm), viewModel: vm };
        }

        return { renderHtml, renderInvoice, loadSources, stats: () => ({ ...stats, cached: cache.size }), clearCache: () => cache.clear() };
    }

    return { createRenderer, splitStyle, sha256, TemplateError };
});

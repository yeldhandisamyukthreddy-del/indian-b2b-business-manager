// Escaping and sanitizing for printed invoices.
// Rich text (notes, terms) goes through an allowlist: every character is escaped first, then only a few
// formatting tags with no attributes are turned back into HTML. Nothing with a URL or an event can get through.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else (root.Vyapar = root.Vyapar || {}).sanitize = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // Same characters as mustache.js, so templates behave the same with either renderer
    const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '/': '&#x2F;', '`': '&#x60;', '=': '&#x3D;' };
    const escapeHtml = s => String(s ?? '').replace(/[&<>"'`=/]/g, c => ENTITIES[c]);

    const ALLOWED = ['b', 'strong', 'i', 'em', 'u', 'p', 'ul', 'ol', 'li', 'br'];
    // An escaped tag such as &lt;b&gt;, &lt;&#x2F;li&gt; or &lt;br&#x2F;&gt;, with nothing else inside
    const TAG = new RegExp(`&lt;(&#x2F;)?(${ALLOWED.join('|')})\\s*(?:&#x2F;)?&gt;`, 'gi');

    function sanitizeRichText(text) {
        const escaped = escapeHtml(text).replace(/\r?\n/g, '<br>');
        const open = [];
        const html = escaped.replace(TAG, (m, closing, tag) => {
            const name = tag.toLowerCase();
            if (name === 'br') return '<br>';
            if (!closing) {
                open.push(name);
                return `<${name}>`;
            }
            const at = open.lastIndexOf(name);
            if (at < 0) return ''; // stray closing tag
            // Close anything opened inside it first, e.g. <b><i>x</b> → <b><i>x</i></b>
            return open
                .splice(at)
                .reverse()
                .map(t => `</${t}>`)
                .join('');
        });
        return (
            html +
            open
                .reverse()
                .map(t => `</${t}>`)
                .join('')
        );
    }

    // A quoted CSS string. Everything except letters, digits and spaces becomes a \hex escape,
    // so the value cannot close the string, the rule or the <style> element.
    const cssString = s => `"${String(s ?? '').replace(/[^A-Za-z0-9 ]/gu, c => `\\${c.codePointAt(0).toString(16)} `)}"`;

    return { escapeHtml, sanitizeRichText, cssString };
});

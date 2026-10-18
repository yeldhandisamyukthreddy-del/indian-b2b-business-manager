// A small Mustache renderer with only what invoice templates may use:
//   {{name}} (escaped), {{{name}}} / {{& name}} (raw, for pre-sanitized HTML only), {{#section}}, {{^inverted}},
//   {{>partial}}, {{! comment}} and {{.}}. No lambdas, no delimiter changes, no logic.
// Output matches mustache.js (a test renders every template with both). Differences, on purpose:
//   strict mode (the default) throws on an unknown field or partial instead of printing nothing,
//   and only own properties are looked up, never the prototype.
(function (root, factory) {
    const deps = typeof module === 'object' && module.exports ? { sanitize: require('./sanitize.js') } : root.Vyapar;
    const api = factory(deps.sanitize);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else (root.Vyapar = root.Vyapar || {}).mustache = api;
})(typeof self !== 'undefined' ? self : this, function (sanitize) {
    'use strict';

    class TemplateError extends Error {
        constructor(message) {
            super(message);
            this.name = 'TemplateError';
        }
    }

    const NAME = /^(\.|[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*)$/;
    const STANDALONE = new Set(['#', '^', '/', '!', '>']);
    const MAX_DEPTH = 20;

    function readTag(tpl, start, where) {
        const triple = tpl.startsWith('{{{', start);
        const close = triple ? '}}}' : '}}';
        const end = tpl.indexOf(close, start);
        if (end < 0) throw new TemplateError(`Unclosed tag in ${where}`);
        const raw = tpl.slice(start + (triple ? 3 : 2), end);
        const sigil = triple ? '&' : '#^/>!&'.includes(raw[0]) ? raw[0] : '';
        const name = (triple || !sigil ? raw : raw.slice(1)).trim();
        if (sigil !== '!' && !NAME.test(name)) throw new TemplateError(`Unsupported tag "{{${raw}}}" in ${where}`);
        return { type: sigil || 'name', name, next: end + close.length };
    }

    function tokenize(tpl, label) {
        const tokens = [];
        let i = 0;
        let line = 1;
        while (i < tpl.length) {
            const start = tpl.indexOf('{{', i);
            const text = tpl.slice(i, start < 0 ? tpl.length : start);
            if (text) tokens.push({ type: 'text', text });
            line += (text.match(/\n/g) || []).length;
            if (start < 0) break;
            const tag = readTag(tpl, start, `"${label}" line ${line}`);
            tokens.push({ type: tag.type, name: tag.name, line });
            line += (tpl.slice(start, tag.next).match(/\n/g) || []).length;
            i = tag.next;
        }
        return stripStandalone(tokens);
    }

    // A section, comment or partial tag alone on its line removes that whole line (as in Mustache)
    // Decided on the original text first, then trimmed, so two standalone lines in a row both go.
    function isStandalone(tokens, k) {
        if (!STANDALONE.has(tokens[k].type)) return false;
        const prev = tokens[k - 1];
        const next = tokens[k + 1];
        const before = !prev ? '' : prev.type === 'text' ? prev.text : null;
        const after = !next ? '' : next.type === 'text' ? next.text : null;
        if (before === null || after === null) return false;
        const lineStart = k <= 1 || before.includes('\n');
        return lineStart && /^[ \t]*$/.test(before.slice(before.lastIndexOf('\n') + 1)) && /^[ \t]*(\r?\n|$)/.test(after);
    }
    function stripStandalone(tokens) {
        const standalone = tokens.map((tok, k) => isStandalone(tokens, k));
        tokens.forEach((tok, k) => {
            if (!standalone[k]) return;
            const prev = tokens[k - 1];
            const next = tokens[k + 1];
            if (prev) prev.text = prev.text.replace(/[ \t]*$/, '');
            if (next) next.text = next.text.replace(/^[ \t]*(\r?\n|$)/, '');
        });
        return tokens;
    }

    function buildTree(tokens, label) {
        const root = { children: [] };
        const stack = [root];
        tokens.forEach(tok => {
            const top = stack[stack.length - 1];
            if (tok.type === '!' || (tok.type === 'text' && !tok.text)) return;
            if (tok.type === '#' || tok.type === '^') {
                const node = { ...tok, children: [] };
                top.children.push(node);
                stack.push(node);
            } else if (tok.type === '/') {
                if (stack.length === 1) throw new TemplateError(`Unexpected "/${tok.name}" in "${label}" line ${tok.line}`);
                if (top.name !== tok.name) throw new TemplateError(`Section "${top.name}" closed by "${tok.name}" in "${label}" line ${tok.line}`);
                stack.pop();
            } else top.children.push(tok);
        });
        if (stack.length > 1) {
            const open = stack[stack.length - 1];
            throw new TemplateError(`Unclosed section "${open.name}" in "${label}" line ${open.line}`);
        }
        return root.children;
    }

    const compiled = new Map();
    function compile(tpl, label) {
        const key = `${label}\u0000${tpl}`;
        if (!compiled.has(key)) {
            if (compiled.size > 200) compiled.clear();
            compiled.set(key, buildTree(tokenize(tpl, label), label));
        }
        return compiled.get(key);
    }

    const own = (obj, key) => obj !== null && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key);

    function lookup(stack, name, ctx, line) {
        if (name === '.') return stack[stack.length - 1];
        const [head, ...rest] = name.split('.');
        let k = stack.length - 1;
        while (k >= 0 && !own(stack[k], head)) k--;
        let value = k >= 0 ? stack[k][head] : undefined;
        let found = k >= 0;
        for (const part of rest) {
            found = found && own(value, part);
            value = found ? value[part] : undefined;
        }
        if (!found && ctx.strict) throw new TemplateError(`Unknown field "${name}" in "${ctx.label}" line ${line}`);
        if (typeof value === 'function') throw new TemplateError(`"${name}" is a function in "${ctx.label}" line ${line}; lambdas are not supported`);
        return value;
    }

    function text(value, tok, ctx) {
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') throw new TemplateError(`"${tok.name}" is an object and cannot be printed, in "${ctx.label}" line ${tok.line}`);
        return String(value);
    }

    function renderNodes(nodes, stack, ctx) {
        let out = '';
        for (const node of nodes) {
            if (node.type === 'text') out += node.text;
            else if (node.type === 'name') out += sanitize.escapeHtml(text(lookup(stack, node.name, ctx, node.line), node, ctx));
            else if (node.type === '&') out += text(lookup(stack, node.name, ctx, node.line), node, ctx);
            else if (node.type === '>') out += renderPartial(node, stack, ctx);
            else out += renderSection(node, stack, ctx);
        }
        return out;
    }

    function renderSection(node, stack, ctx) {
        const value = lookup(stack, node.name, ctx, node.line);
        const empty = !value || (Array.isArray(value) && !value.length);
        if (node.type === '^') return empty ? renderNodes(node.children, stack, ctx) : '';
        if (empty) return '';
        if (Array.isArray(value)) return value.map(item => renderNodes(node.children, [...stack, item], ctx)).join('');
        return renderNodes(node.children, [...stack, value], ctx);
    }

    function renderPartial(node, stack, ctx) {
        if (!own(ctx.partials, node.name)) throw new TemplateError(`Missing partial "${node.name}" in "${ctx.label}"`);
        if (ctx.depth >= MAX_DEPTH) throw new TemplateError(`Partials nested too deeply at "${node.name}" in "${ctx.label}"`);
        const inner = { ...ctx, label: node.name, depth: ctx.depth + 1 };
        return renderNodes(compile(ctx.partials[node.name], node.name), stack, inner);
    }

    function render(template, view, partials = {}, { name = 'template', strict = true } = {}) {
        return renderNodes(compile(template, name), [view], { partials, strict, label: name, depth: 0 });
    }

    return { render, TemplateError };
});

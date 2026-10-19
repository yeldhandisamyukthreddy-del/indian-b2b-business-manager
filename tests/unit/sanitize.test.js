// The allowlist sanitizer is the only way user HTML reaches a printed invoice
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { escapeHtml, sanitizeRichText, cssString } = require('../../app/js/core/documents/sanitize.js');

test('escapeHtml escapes the same characters as Mustache', () => {
    assert.equal(escapeHtml(`<a href="x">'&'</a> = \`/`), '&lt;a href&#x3D;&quot;x&quot;&gt;&#39;&amp;&#39;&lt;&#x2F;a&gt; &#x3D; &#x60;&#x2F;');
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(12), '12');
});

test('plain text keeps its line breaks', () => {
    assert.equal(sanitizeRichText('Goods once sold\ncannot be returned.'), 'Goods once sold<br>cannot be returned.');
    assert.equal(sanitizeRichText(''), '');
    assert.equal(sanitizeRichText(undefined), '');
});

test('allowlisted tags without attributes survive', () => {
    assert.equal(sanitizeRichText('<b>Bold</b> and <em>em</em><br/>'), '<b>Bold</b> and <em>em</em><br>');
    assert.equal(sanitizeRichText('<UL><li>one</li></UL>'), '<ul><li>one</li></ul>');
});

test('anything else is shown as text, never run', () => {
    assert.equal(sanitizeRichText('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;&#x2F;script&gt;');
    assert.equal(sanitizeRichText('<img src=x onerror=alert(1)>'), '&lt;img src&#x3D;x onerror&#x3D;alert(1)&gt;');
    // The tag with an attribute stays text; its closing tag then has nothing to close and is dropped
    assert.equal(sanitizeRichText('<b onclick="x">hi</b>'), '&lt;b onclick&#x3D;&quot;x&quot;&gt;hi');
    assert.equal(sanitizeRichText('<a href="javascript:alert(1)">x</a>'), '&lt;a href&#x3D;&quot;javascript:alert(1)&quot;&gt;x&lt;&#x2F;a&gt;');
});

test('unbalanced tags are closed or dropped so they cannot style the rest of the invoice', () => {
    assert.equal(sanitizeRichText('<b>never closed'), '<b>never closed</b>');
    assert.equal(sanitizeRichText('stray</i> close'), 'stray close');
    assert.equal(sanitizeRichText('<b><i>x</b>'), '<b><i>x</i></b>');
});

test('cssString makes a CSS string literal that cannot break out of a style sheet', () => {
    assert.equal(cssString('INV-0001'), '"INV\\2d 0001"');
    const nasty = cssString('"</style><script>x</script>');
    assert.ok(!/[<>"]/.test(nasty.slice(1, -1)));
    assert.equal(cssString(''), '""');
});

// Invoice template settings: what each company shows on each template.
// Stored in the IndexedDB 'settings' store as plain rows (kind: 'invoiceTemplate' | 'invoiceTemplatePrefs' | 'asset'),
// so backups and restores carry them. Defaults are merged with stored values on read; writes are validated.
(function (root, factory) {
    const node = typeof module === 'object' && module.exports;
    const deps = node ? { registry: require('./registry.js'), labels: require('./labels.js') } : root.Vyapar;
    const api = factory(deps.registry, deps.labels);
    if (node) module.exports = api;
    else (root.Vyapar = root.Vyapar || {}).settings = api;
})(typeof self !== 'undefined' ? self : this, function (registry, labels) {
    'use strict';

    // User toggles. A "Required" flag shows its section when the invoice has the data for it.
    const FLAG_DEFAULTS = Object.freeze({
        showLogo: true,
        isOrgNameRequired: true,
        isOrgAddressRequired: true,
        isTitleRequired: true,
        isEntityDateRequired: true,
        isTimeRequired: false,
        isDueDateRequired: true,
        isBillToRequired: true,
        isShipToRequired: true,
        isReferenceNumberRequired: true,
        isPaymentTermsRequired: true,
        isSubTotalRequired: true,
        isTotalRequired: true,
        isBalanceDueRequired: true,
        isAmountInWordsRequired: true,
        isTaxSummaryRequired: true,
        showNotes: true,
        isTermsAndConditionsRequired: true,
        isPaymentDetailsRequired: true,
        isPaymentStubRequired: false,
        isStatusStampRequired: false,
        isSignatureRequired: true,
        showCurrencyAfterAmount: false
    });
    const FLAG_KEYS = Object.freeze(Object.keys(FLAG_DEFAULTS));
    const COLUMN_KEYS = Object.freeze(['index', 'name', 'hsnOrSac', 'qty', 'rate', 'discount', 'amount', 'tax', 'total']);
    const REGION_KEYS = Object.freeze(['extraTaxId']);
    const PREFS_DEFAULTS = Object.freeze({
        defaultTemplateType: 'standard',
        logoAssetId: null,
        regions: Object.freeze({ extraTaxId: true }),
        extraTaxIds: Object.freeze([])
    });
    const DEFAULT_ACCENT = '#1f4e79';
    const SETTING_KEYS = ['fieldFlags', 'columnConfig', 'labels', 'accentColor', 'logoAssetId', 'pageSize', 'language'];
    const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
    const LOGO_MAX_BYTES = 300 * 1024;
    const LOGO_MAX_SIDE = 2000;
    const MAX_LABEL = 80;
    const MAX_EXTRA_IDS = 5;

    const LANG = /^[a-z]{2,3}$/;
    const COLOR = /^#[0-9a-fA-F]{6}$/;
    const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
    const isId = v => Number.isInteger(v) && v > 0;
    const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

    class ValidationError extends Error {
        constructor(errors) {
            super(errors.join('; '));
            this.name = 'ValidationError';
            this.errors = errors;
        }
    }

    // ---------- defaults and merging ----------
    function mergeColumns(type, stored) {
        const t = registry.getTemplate(type);
        const defaults = t.defaults.columns.map(key => ({ key, visible: !t.defaults.hiddenColumns.includes(key) }));
        const seen = new Set();
        const kept = (Array.isArray(stored) ? stored : [])
            .filter(c => isObj(c) && COLUMN_KEYS.includes(c.key) && !seen.has(c.key) && seen.add(c.key))
            .map(c => ({ key: c.key, visible: c.visible === true }));
        return [...kept, ...defaults.filter(c => !seen.has(c.key))];
    }

    function cleanLabels(stored) {
        const out = {};
        if (!isObj(stored)) return out;
        Object.keys(stored)
            .filter(lang => LANG.test(lang) && isObj(stored[lang]))
            .forEach(lang => {
                out[lang] = {};
                labels.LABEL_KEYS.filter(k => typeof stored[lang][k] === 'string').forEach(k => (out[lang][k] = stored[lang][k].slice(0, MAX_LABEL)));
            });
        return out;
    }

    function mergeSettings(type, stored = {}) {
        const t = registry.getTemplate(type);
        const s = isObj(stored) ? stored : {};
        const fieldFlags = { ...FLAG_DEFAULTS, ...t.defaults.fieldFlags };
        if (isObj(s.fieldFlags)) FLAG_KEYS.filter(k => typeof s.fieldFlags[k] === 'boolean').forEach(k => (fieldFlags[k] = s.fieldFlags[k]));
        return {
            templateType: type,
            fieldFlags,
            columnConfig: mergeColumns(type, s.columnConfig),
            labels: cleanLabels(s.labels),
            accentColor: COLOR.test(s.accentColor || '') ? s.accentColor : DEFAULT_ACCENT,
            logoAssetId: isId(s.logoAssetId) ? s.logoAssetId : null,
            pageSize: registry.getPageSize(type, s.pageSize).key,
            language: LANG.test(s.language || '') ? s.language : 'en',
            updatedAt: typeof s.updatedAt === 'string' ? s.updatedAt : null
        };
    }
    const defaultSettings = type => mergeSettings(type, {});

    function mergePrefs(stored = {}) {
        const s = isObj(stored) ? stored : {};
        const regions = { ...PREFS_DEFAULTS.regions };
        if (isObj(s.regions)) REGION_KEYS.filter(k => typeof s.regions[k] === 'boolean').forEach(k => (regions[k] = s.regions[k]));
        return {
            defaultTemplateType: registry.isTemplateType(s.defaultTemplateType) ? s.defaultTemplateType : PREFS_DEFAULTS.defaultTemplateType,
            logoAssetId: isId(s.logoAssetId) ? s.logoAssetId : null,
            regions,
            extraTaxIds: Array.isArray(s.extraTaxIds)
                ? s.extraTaxIds.filter(x => isObj(x) && x.label && x.value).map(x => ({ label: String(x.label), value: String(x.value) }))
                : []
        };
    }

    // ---------- validation on write ----------
    function checkFlags(flags, errors) {
        if (!isObj(flags)) return errors.push('fieldFlags must be an object');
        Object.keys(flags).forEach(k => {
            if (!FLAG_KEYS.includes(k)) errors.push(`fieldFlags.${k} is not a setting`);
            else if (typeof flags[k] !== 'boolean') errors.push(`fieldFlags.${k} must be true or false`);
        });
    }
    function checkColumns(cols, errors) {
        if (!Array.isArray(cols)) return errors.push('columnConfig must be a list');
        const seen = new Set();
        cols.forEach(c => {
            if (!isObj(c)) return errors.push('columnConfig entries must look like { key, visible }');
            if (!COLUMN_KEYS.includes(c.key)) errors.push(`columnConfig: "${String(c.key).slice(0, 30)}" is not a column`);
            else if (seen.has(c.key)) errors.push(`columnConfig: "${c.key}" is listed twice`);
            if (typeof c.visible !== 'boolean') errors.push(`columnConfig: "${String(c.key).slice(0, 30)}" visible must be true or false`);
            seen.add(c.key);
        });
    }
    function checkLabels(all, errors) {
        if (!isObj(all)) return errors.push('labels must be an object');
        Object.keys(all).forEach(lang => {
            if (!LANG.test(lang)) return errors.push(`labels: "${lang.slice(0, 10)}" is not a language code`);
            if (!isObj(all[lang])) return errors.push(`labels.${lang} must be an object`);
            Object.keys(all[lang]).forEach(k => {
                const v = all[lang][k];
                if (!labels.LABEL_KEYS.includes(k)) errors.push(`labels.${lang}.${k.slice(0, 30)} is not a label`);
                else if (typeof v !== 'string') errors.push(`labels.${lang}.${k} must be text`);
                else if (v.length > MAX_LABEL) errors.push(`labels.${lang}.${k} is longer than ${MAX_LABEL} characters`);
            });
        });
    }

    function validateSettingsPatch(type, patch) {
        if (!isObj(patch)) return ['Settings must be an object'];
        const t = registry.getTemplate(type);
        const errors = [];
        Object.keys(patch)
            .filter(k => !SETTING_KEYS.includes(k))
            .forEach(k => errors.push(`"${k.slice(0, 30)}" is not a setting`));
        if (own(patch, 'fieldFlags')) checkFlags(patch.fieldFlags, errors);
        if (own(patch, 'columnConfig')) checkColumns(patch.columnConfig, errors);
        if (own(patch, 'labels')) checkLabels(patch.labels, errors);
        if (own(patch, 'accentColor') && !COLOR.test(String(patch.accentColor))) errors.push('accentColor must be a colour like #1f4e79');
        if (own(patch, 'pageSize') && !t.pageSizes.includes(patch.pageSize))
            errors.push(`pageSize "${String(patch.pageSize).slice(0, 20)}" is not available for this template`);
        if (own(patch, 'language') && !LANG.test(String(patch.language))) errors.push('language must be a language code such as en or te');
        if (own(patch, 'logoAssetId') && patch.logoAssetId !== null && !isId(patch.logoAssetId))
            errors.push('logoAssetId must be a positive whole number or empty');
        return errors;
    }

    function checkExtraIds(list, errors) {
        if (!Array.isArray(list)) return errors.push('extraTaxIds must be a list');
        if (list.length > MAX_EXTRA_IDS) errors.push(`extraTaxIds: at most ${MAX_EXTRA_IDS}`);
        list.forEach((x, i) => {
            if (!isObj(x)) return errors.push(`extraTaxIds[${i}] must be { label, value }`);
            if (typeof x.label !== 'string' || !x.label.trim()) errors.push(`extraTaxIds[${i}] needs a label`);
            if (typeof x.value !== 'string' || !x.value.trim()) errors.push(`extraTaxIds[${i}] needs a value`);
            if (String(x.label).length > 30 || String(x.value).length > 40) errors.push(`extraTaxIds[${i}] is too long`);
        });
    }
    function validatePrefsPatch(patch) {
        if (!isObj(patch)) return ['Preferences must be an object'];
        const errors = [];
        Object.keys(patch)
            .filter(k => !own(PREFS_DEFAULTS, k))
            .forEach(k => errors.push(`"${k.slice(0, 30)}" is not a preference`));
        if (own(patch, 'defaultTemplateType') && !registry.isTemplateType(patch.defaultTemplateType))
            errors.push(`defaultTemplateType "${String(patch.defaultTemplateType).slice(0, 30)}" is not a template`);
        if (own(patch, 'logoAssetId') && patch.logoAssetId !== null && !isId(patch.logoAssetId))
            errors.push('logoAssetId must be a positive whole number or empty');
        if (own(patch, 'regions')) {
            if (!isObj(patch.regions)) errors.push('regions must be an object');
            else
                Object.keys(patch.regions).forEach(k => {
                    if (!REGION_KEYS.includes(k)) errors.push(`regions.${k.slice(0, 30)} is not a region module`);
                    else if (typeof patch.regions[k] !== 'boolean') errors.push(`regions.${k} must be true or false`);
                });
        }
        if (own(patch, 'extraTaxIds')) checkExtraIds(patch.extraTaxIds, errors);
        return errors;
    }

    function validateAsset(asset) {
        if (!isObj(asset)) return ['Logo must be an object'];
        const errors = [];
        if (!LOGO_TYPES.includes(asset.mime)) errors.push('Logo must be a PNG, JPEG or WebP image');
        const prefix = `data:${asset.mime};base64,`;
        const data = typeof asset.dataUri === 'string' ? asset.dataUri : '';
        if (!data.startsWith(prefix) || !/^[A-Za-z0-9+/]*={0,2}$/.test(data.slice(prefix.length))) errors.push('Logo data does not match its image type');
        if (Math.floor((data.length - prefix.length) * 0.75) > LOGO_MAX_BYTES) errors.push('Logo is larger than 300 KB');
        if (![asset.width, asset.height].every(n => Number.isInteger(n) && n > 0 && n <= LOGO_MAX_SIDE))
            errors.push(`Logo width and height must be at most ${LOGO_MAX_SIDE} pixels`);
        return errors;
    }

    // ---------- repository ----------
    // store: { getAll(): Promise<row[]>, add(row): Promise<id>, put(row): Promise, delete(id): Promise }
    function createRepository(store, { now = () => new Date().toISOString() } = {}) {
        const checkOrg = orgId => {
            if (!isId(orgId)) throw new Error('Invalid company id');
        };
        const rows = async (orgId, kind) => (await store.getAll()).filter(r => isObj(r) && r.companyId === orgId && (!kind || r.kind === kind));
        const templateRow = async (orgId, type) => (await rows(orgId, 'invoiceTemplate')).find(r => r.templateType === type) || null;
        const prefsRow = async orgId => (await rows(orgId, 'invoiceTemplatePrefs'))[0] || null;
        const save = (existing, record) => (existing ? store.put({ ...record, id: existing.id }) : store.add(record));

        async function findByOrg(orgId) {
            checkOrg(orgId);
            return (await rows(orgId, 'invoiceTemplate'))
                .filter(r => registry.isTemplateType(r.templateType))
                .map(r => ({ companyId: orgId, ...mergeSettings(r.templateType, r) }));
        }
        async function find(orgId, type) {
            checkOrg(orgId);
            registry.getTemplate(type);
            return { companyId: orgId, ...mergeSettings(type, (await templateRow(orgId, type)) || {}) };
        }
        async function upsert(orgId, type, patch) {
            checkOrg(orgId);
            const errors = validateSettingsPatch(type, patch);
            if (errors.length) throw new ValidationError(errors);
            const existing = await templateRow(orgId, type);
            const prev = existing || {};
            const labelsNext = { ...(prev.labels || {}) };
            Object.keys(patch.labels || {}).forEach(lang => (labelsNext[lang] = { ...(labelsNext[lang] || {}), ...patch.labels[lang] }));
            const merged = mergeSettings(type, {
                ...prev,
                ...patch,
                fieldFlags: { ...(prev.fieldFlags || {}), ...(patch.fieldFlags || {}) },
                labels: labelsNext,
                updatedAt: now()
            });
            const { templateType, ...values } = merged;
            await save(existing, { kind: 'invoiceTemplate', companyId: orgId, templateType, ...values });
            return { companyId: orgId, ...merged };
        }
        async function getPrefs(orgId) {
            checkOrg(orgId);
            return mergePrefs((await prefsRow(orgId)) || {});
        }
        async function setPrefs(orgId, patch) {
            checkOrg(orgId);
            const errors = validatePrefsPatch(patch);
            if (errors.length) throw new ValidationError(errors);
            const existing = await prefsRow(orgId);
            const prev = mergePrefs(existing || {});
            const next = mergePrefs({ ...prev, ...patch, regions: { ...prev.regions, ...(patch.regions || {}) } });
            await save(existing, { kind: 'invoiceTemplatePrefs', companyId: orgId, ...next, updatedAt: now() });
            return next;
        }
        async function saveAsset(orgId, asset) {
            checkOrg(orgId);
            const errors = validateAsset(asset);
            if (errors.length) throw new ValidationError(errors);
            return store.add({
                kind: 'asset',
                companyId: orgId,
                mime: asset.mime,
                dataUri: asset.dataUri,
                width: asset.width,
                height: asset.height,
                createdAt: now()
            });
        }
        async function getAsset(orgId, id) {
            checkOrg(orgId);
            return (await rows(orgId, 'asset')).find(r => r.id === id) || null;
        }
        async function getEffective(orgId, type) {
            const [s, prefs] = [await find(orgId, type), await getPrefs(orgId)];
            const logoId = s.logoAssetId ?? prefs.logoAssetId;
            const logo = logoId ? await getAsset(orgId, logoId) : null;
            return { ...s, regions: prefs.regions, extraTaxIds: prefs.extraTaxIds, logo: logo && validateAsset(logo).length === 0 ? logo : null };
        }
        // Delete logos that neither the company nor any of its templates points to
        async function pruneAssets(orgId) {
            const used = new Set([(await getPrefs(orgId)).logoAssetId, ...(await rows(orgId, 'invoiceTemplate')).map(r => r.logoAssetId)]);
            for (const a of await rows(orgId, 'asset')) if (!used.has(a.id)) await store.delete(a.id);
        }
        async function deleteForOrg(orgId) {
            checkOrg(orgId);
            for (const r of await rows(orgId)) if (['invoiceTemplate', 'invoiceTemplatePrefs', 'asset'].includes(r.kind)) await store.delete(r.id);
        }
        return { findByOrg, find, upsert, getPrefs, setPrefs, saveAsset, getAsset, getEffective, pruneAssets, deleteForOrg };
    }

    return {
        FLAG_DEFAULTS,
        FLAG_KEYS,
        COLUMN_KEYS,
        REGION_KEYS,
        LOGO_TYPES,
        LOGO_MAX_BYTES,
        LOGO_MAX_SIDE,
        ValidationError,
        defaultSettings,
        mergeSettings,
        mergePrefs,
        validateSettingsPatch,
        validatePrefsPatch,
        validateAsset,
        createRepository
    };
});

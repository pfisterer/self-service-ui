// The language the UI speaks, and everything that follows from it.
//
// One place decides three things that have to agree: which strings are shown,
// how a date is written, and how dayjs phrases "in 3 months". They used to be
// decided separately — the strings were English, the dates German (see
// format-date.js) — which was defensible while there was one language, and is
// not once the reader picks one.
//
// The choice lives in the browser, not in the backend: it is a preference of
// this person at this screen, no server needs to know it, and a stored
// preference would be one more thing to migrate per deployment.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import dayjs from 'dayjs';
import 'dayjs/locale/de';

// One file per area and language (see README.md in this folder); the file name
// is the key's first segment, so `projects.json` holds everything addressed as
// `projects.…`.
import enCommon from './en/common.json';
import enProjects from './en/projects.json';
import enDyndns from './en/dyndns.json';
import enTokens from './en/tokens.json';
import enHome from './en/home.json';
import deCommon from './de/common.json';
import deProjects from './de/projects.json';
import deDyndns from './de/dyndns.json';
import deTokens from './de/tokens.json';
import deHome from './de/home.json';

const en = { ...enCommon, projects: enProjects, dyndns: enDyndns, tokens: enTokens, home: enHome };
const de = { ...deCommon, projects: deProjects, dyndns: deDyndns, tokens: deTokens, home: deHome };
import { setDateLocale } from '../format-date.js';

// Where the preference is kept. Namespaced, because an artifact origin is
// shared by everything this app stores.
export const LANGUAGE_STORAGE_KEY = 'dhbw-cloud.lang';

// The languages on offer, in the order the switcher lists them. `label` is each
// language's own name — a German reader looks for "Deutsch", not for "German".
export const LANGUAGES = [
    { code: 'en', label: 'English' },
    { code: 'de', label: 'Deutsch' },
];

// dayjs ships 'de'; English is its built-in default and needs no import.
const DAYJS_LOCALE = { en: 'en', de: 'de' };

// applyLanguage brings the two non-React formatters along. Called on every
// change rather than read by them, so a module that formats a date outside a
// component (util-project.jsx does) needs no hook.
function applyLanguage(language) {
    const code = LANGUAGES.some(l => l.code === language) ? language : 'en';
    setDateLocale(code);
    dayjs.locale(DAYJS_LOCALE[code]);
}

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: { en: { translation: en }, de: { translation: de } },
        fallbackLng: 'en',
        supportedLngs: LANGUAGES.map(l => l.code),
        // 'de-DE' from the browser means 'de' — without this it would miss and
        // fall back to English on exactly the machines this is written for.
        nonExplicitSupportedLngs: true,
        detection: {
            order: ['localStorage', 'navigator'],
            lookupLocalStorage: LANGUAGE_STORAGE_KEY,
            caches: ['localStorage'],
        },
        // React escapes what it renders; i18next escaping again would turn an
        // apostrophe into &#39; on the screen.
        interpolation: { escapeValue: false },
        returnNull: false,
    });

applyLanguage(i18n.resolvedLanguage);
i18n.on('languageChanged', applyLanguage);

export default i18n;

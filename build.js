const fs = require('fs');
const path = require('path');

// =====================================================================
// 1. GLOBAL KONFIGURATION
// =====================================================================
const CONFIG = {
    baseLang: 'de',
    targetLangs: ['es', 'fr', 'it', 'nl', 'pt', 'nl-be', 'fr-be', 'en-us', 'en-gb'],
    domain: 'https://www.fix-my-trip.com',

    // Silos, die NUR für die Basissprache generiert werden (kein EU-Recht / keine EU-weiten Daten)
    baseLangOnlySilos: ['ota', 'zoll', 'flughafen-parken'],

    // Silos, die aktuell komplett pausiert sind (für ALLE Sprachen).
    // Code bleibt drin, zum Reaktivieren einfach aus der Liste entfernen.
    disabledSilos: ['visum'],   // Einreise: vorerst auf Eis gelegt

    // Aufräumen: Nicht mehr generierte .html-Dateien aus docs/<lang>/ löschen
    cleanup: true,              // false = Aufräumen komplett AUS (es wird nie etwas gelöscht)
    cleanupDryRun: false,       // true = nur anzeigen, was gelöscht würde

    // Handgepflegte Seiten, die NIE gelöscht werden (gilt für docs/<lang>/).
    // Wildcard * ist erlaubt, z.B. 'ueber-*' oder 'rechtliches-*.html'
    keepFiles: [
        'index.html',
        'datenschutz.html',
        'impressum.html',
        'ueber-uns.html'
        // weitere Seiten hier ergänzen
    ]
};

// Prüft, ob eine Datei laut keepFiles geschützt ist (unterstützt *)
const isKept = (fileName) => CONFIG.keepFiles.some(pattern => {
    if (!pattern.includes('*')) return pattern === fileName;
    const regex = new RegExp('^' + pattern.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
    return regex.test(fileName);
});

// Ausnahmen von der Basissprachen-Regel
const SILO_LANG_EXCEPTIONS = {
    'ota': ['nl', 'nl-be', 'en-us', 'en-gb'],
    'flughafen-parken': ['en-us', 'en-gb']
};

// Silos, die für bestimmte Sprachen gesperrt sind
const SILO_LANG_BLOCKS = {
    'en-us': ['bahn', 'steuern', 'ferienhaus']
};

// Prüft, ob ein Silo für die aktuelle Sprache übersprungen werden soll
const isExcludedForLang = (siloName, lang) => {
    if (CONFIG.disabledSilos.includes(siloName)) return true;
    if ((SILO_LANG_EXCEPTIONS[siloName] || []).includes(lang)) return false;
    if ((SILO_LANG_BLOCKS[lang] || []).includes(siloName)) return true;
    return lang !== CONFIG.baseLang && CONFIG.baseLangOnlySilos.includes(siloName);
};

console.log('🚀 Starte das internationale Hub & Spoke Build-System...\n');

// =====================================================================
// 2. SEO: DYNAMISCHE HREFLANG GENERIERUNG
// =====================================================================
const jsonCache = {};

// Prüft, ob ein Slug in der JSON der jeweiligen Sprache existiert
function hasItemInLang(lang, jsonFile, slug) {
    if (!jsonCache[lang]) jsonCache[lang] = {};
    if (!jsonCache[lang][jsonFile]) {
        const p = path.join(__dirname, 'src', lang, jsonFile);
        jsonCache[lang][jsonFile] = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : [];
    }
    return jsonCache[lang][jsonFile].some(item => item.slug === slug);
}

// Baut den SEO-Block und ersetzt den Platzhalter {{SEO_LINKS}} im HTML
function injectSEO(content, currentLang, fName, jsonFile = null, slug = null, siloName = null) {
    // Kein Platzhalter = manuelle SEO-Tags, nichts tun
    if (!content.includes('{{SEO_LINKS}}')) return content;

    const allLangs = [CONFIG.baseLang, ...CONFIG.targetLangs];
    const availableLangs = allLangs.filter(l => {
        if (siloName && isExcludedForLang(siloName, l)) return false;
        if (jsonFile && slug) return hasItemInLang(l, jsonFile, slug);
        return true; // Hub-Seiten ohne JSON/Slug
    });

    if (availableLangs.length === 0) availableLangs.push(currentLang);

    let seoBlock = `<link rel="canonical" href="${CONFIG.domain}/${currentLang}/${fName}">\n`;
    availableLangs.forEach(l => {
        seoBlock += `<link rel="alternate" hreflang="${l}" href="${CONFIG.domain}/${l}/${fName}">\n`;
    });

    // x-default: US bevorzugen, sonst Basissprache, sonst das Erste
    const xDefault = availableLangs.includes('en-us') ? 'en-us'
        : (availableLangs.includes(CONFIG.baseLang) ? CONFIG.baseLang : availableLangs[0]);
    seoBlock += `<link rel="alternate" hreflang="x-default" href="${CONFIG.domain}/${xDefault}/${fName}">`;

    return content.replace('{{SEO_LINKS}}', seoBlock);
}

// =====================================================================
// 3. HILFSFUNKTIONEN
// =====================================================================

// Zufällige interne Verlinkung (Fisher-Yates Shuffle)
function generateCrossLinks(allItems, currentItem, urlGenerator, nameGenerator, maxLinks = 5) {
    const otherItems = allItems.filter(item => item.slug !== currentItem.slug);
    for (let i = otherItems.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [otherItems[i], otherItems[j]] = [otherItems[j], otherItems[i]];
    }
    return otherItems
        .slice(0, maxLinks)
        .map(item => `<a href="${urlGenerator(item)}">${nameGenerator(item)}</a>\n`)
        .join('');
}

// Löscht .html-Dateien aus docs/<lang>/, die in diesem Build NICHT erzeugt wurden
function cleanupOutputDir(outputDir, generated, lang) {
    if (!CONFIG.cleanup) return;

    const stale = fs.readdirSync(outputDir)
        .filter(f => f.endsWith('.html'))
        .filter(f => !generated.has(f) && !isKept(f));

    if (stale.length === 0) {
        console.log(`   🧹 [${lang.toUpperCase()}] Nichts aufzuräumen.`);
        return;
    }

    stale.forEach(f => {
        if (!CONFIG.cleanupDryRun) fs.unlinkSync(path.join(outputDir, f));
    });
    console.log(`   🧹 [${lang.toUpperCase()}] ${stale.length} veraltete Datei(en) ${CONFIG.cleanupDryRun ? 'würden entfernt (Dry-Run)' : 'entfernt'}.`);
    if (CONFIG.cleanupDryRun) stale.forEach(f => console.log(`      - ${f}`));
}

// =====================================================================
// 4. HAUPT-BUILD ENGINE
// =====================================================================
function buildEngine() {
    const allLangs = [CONFIG.baseLang, ...CONFIG.targetLangs];

    const baseOutputDir = path.join(__dirname, 'docs');
    if (!fs.existsSync(baseOutputDir)) fs.mkdirSync(baseOutputDir);

    allLangs.forEach(lang => {
        const currentSrcDir = path.join(__dirname, 'src', lang);
        const outputDir = path.join(__dirname, 'docs', lang);

        if (!fs.existsSync(currentSrcDir)) {
            console.warn(`⚠️ Quellordner "src/${lang}" existiert nicht. Überspringe Sprache (docs/${lang} bleibt unangetastet).`);
            return;
        }

        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        console.log(`🌍 Generiere HTML-Seiten für Sprache: [${lang.toUpperCase()}]`);

        // Alle in diesem Durchlauf erzeugten Dateien (für das Aufräumen am Ende)
        const generated = new Set();
        const write = (fileName, content) => {
            fs.writeFileSync(path.join(outputDir, fileName), content, 'utf8');
            generated.add(fileName);
        };

        const loadTemplate = (name) => fs.readFileSync(path.join(currentSrcDir, name), 'utf8');
        const readJson = (name) => JSON.parse(fs.readFileSync(path.join(currentSrcDir, name), 'utf8'));
        const srcExists = (name) => fs.existsSync(path.join(currentSrcDir, name));

        // =====================================================================
        // SILO 1: FLUG (Airlines) + GEPÄCK + STEUERN + DOT
        // =====================================================================
        const airlines = readJson('airlines.json');
        const flugTpl = loadTemplate('flug-master.html');
        const gepaeckTpl = loadTemplate('gepaeck-master.html');
        let optFlug = "", optGepaeck = "", linkFlug = "", linkGepaeck = "";

        const generateSteuern = !isExcludedForLang('steuern', lang);
        let steuerTpl, optSteuer = "", linkSteuer = "";
        if (generateSteuern) steuerTpl = loadTemplate('steuern-master.html');

        const generateDot = srcExists('dot-escalation.html');
        let dotTpl, optDot = "", linkDot = "";
        if (generateDot) dotTpl = loadTemplate('dot-escalation.html');

        airlines.forEach(a => {
            const fFlug = `flugverspaetung-entschaedigung-${a.slug}.html`;
            const fGepaeck = `koffer-verloren-beschaedigt-${a.slug}.html`;

            const crossFlug = generateCrossLinks(airlines, a, item => `flugverspaetung-entschaedigung-${item.slug}.html`, item => item.name);
            const crossGepaeck = generateCrossLinks(airlines, a, item => `koffer-verloren-beschaedigt-${item.slug}.html`, item => item.name);

            let textName = a.name;
            let inputAdresse = a.adresse;

            if (a.slug === 'andere-airline') {
                textName = lang === 'de' ? "Ihrer Fluggesellschaft" : (a.textName || a.name || "your airline");
                inputAdresse = "";
            }

            const processTemplate = (tpl, fName, crossLinks) => {
                let content = tpl;
                if (a.slug === 'andere-airline') {
                    const placeholderText = lang === 'de' ? "Name der Airline eintragen" : (a.placeholderName || "Enter airline name");
                    const addrPlaceholder = lang === 'de' ? "Bitte Adresse der Fluggesellschaft eintragen" : "Enter airline address";
                    content = content
                        .replace(/value="\{\{AIRLINE_NAME\}\}"/g, `value="" placeholder="${placeholderText}"`)
                        .replace(/>\{\{AIRLINE_ADRESSE\}\}</g, ` placeholder="${addrPlaceholder}">${inputAdresse}<`);
                }
                return content
                    .replace(/\{\{AIRLINE_NAME\}\}/g, textName)
                    .replace(/\{\{AIRLINE_ADRESSE\}\}/g, inputAdresse)
                    .replace(/\{\{DATEINAME\}\}/g, fName)
                    .replace(/\{\{BELIEBTE_LINKS\}\}/g, crossLinks)
                    .replace(/\{\{PORTAL_URL\}\}/g, a.portal_url || '#')
                    .replace(/\{\{AIRLINE_INFOBOX\}\}/g, a.infobox || '');
            };

            write(fFlug, injectSEO(processTemplate(flugTpl, fFlug, crossFlug), lang, fFlug, 'airlines.json', a.slug, 'flug'));
            write(fGepaeck, injectSEO(processTemplate(gepaeckTpl, fGepaeck, crossGepaeck), lang, fGepaeck, 'airlines.json', a.slug, 'gepaeck'));

            const displayName = a.slug === 'andere-airline'
                ? (lang === 'de' ? "Andere Airline (Allgemeines Formular)" : (a.name || "Other Airline"))
                : a.name;
            optFlug += `<option value="${fFlug}">${displayName}</option>\n`;
            linkFlug += `<a href="${fFlug}">${displayName}</a>\n`;
            optGepaeck += `<option value="${fGepaeck}">${displayName}</option>\n`;
            linkGepaeck += `<a href="${fGepaeck}">${displayName}</a>\n`;

            if (generateSteuern) {
                const fSteuer = `steuern-gebuehren-zurueckfordern-${a.slug}.html`;
                const crossSteuer = generateCrossLinks(airlines, a, item => `steuern-gebuehren-zurueckfordern-${item.slug}.html`, item => item.name);
                write(fSteuer, injectSEO(processTemplate(steuerTpl, fSteuer, crossSteuer), lang, fSteuer, 'airlines.json', a.slug, 'steuern'));
                optSteuer += `<option value="${fSteuer}">${displayName}</option>\n`;
                linkSteuer += `<a href="${fSteuer}">${displayName}</a>\n`;
            }

            if (generateDot) {
                const fDot = `dot-complaint-escalation-${a.slug}.html`;
                const crossDot = generateCrossLinks(airlines, a, item => `dot-complaint-escalation-${item.slug}.html`, item => item.name);
                write(fDot, injectSEO(processTemplate(dotTpl, fDot, crossDot), lang, fDot, 'airlines.json', a.slug, 'dot'));
                optDot += `<option value="${fDot}">${displayName}</option>\n`;
                linkDot += `<a href="${fDot}">${displayName}</a>\n`;
            }
        });

        write('flugverspaetung-info.html', injectSEO(loadTemplate('hub-flug-master.html').replace(/\{\{AIRLINE_OPTIONS\}\}/g, optFlug).replace(/\{\{AIRLINE_LINKS\}\}/g, linkFlug), lang, 'flugverspaetung-info.html', null, null, 'flug'));
        write('gepaeck-info.html', injectSEO(loadTemplate('hub-gepaeck-master.html').replace(/\{\{GEPAECK_OPTIONS\}\}/g, optGepaeck).replace(/\{\{GEPAECK_LINKS\}\}/g, linkGepaeck), lang, 'gepaeck-info.html', null, null, 'gepaeck'));

        if (generateSteuern) {
            write('steuern-info.html', injectSEO(loadTemplate('hub-steuern-master.html').replace(/\{\{STEUER_OPTIONS\}\}/g, optSteuer).replace(/\{\{STEUER_LINKS\}\}/g, linkSteuer), lang, 'steuern-info.html', null, null, 'steuern'));
        }

        if (generateDot && srcExists('hub-dot-master.html')) {
            write('dot-complaints-info.html', injectSEO(loadTemplate('hub-dot-master.html').replace(/\{\{DOT_OPTIONS\}\}/g, optDot).replace(/\{\{DOT_LINKS\}\}/g, linkDot), lang, 'dot-complaints-info.html', null, null, 'dot'));
        }

        // =====================================================================
        // SILO 2: HOTEL & STORNO
        // =====================================================================
        const veranstalter = readJson('veranstalter.json');
        const vermittler = readJson('vermittler.json');
        const hotelTpl = loadTemplate('hotel-master.html');
        const vermittlerTpl = loadTemplate('vermittler-master.html');
        const stornoTpl = loadTemplate('storno-master.html');

        let optHotel = "", optStorno = "", linkHotel = "", linkStorno = "";

        veranstalter.forEach(v => {
            const fHotel = `hotel-reklamation-beschwerde-${v.slug}.html`;
            const fStorno = `reise-stornieren-kosten-pruefen-${v.slug}.html`;

            const crossHotel = generateCrossLinks(veranstalter, v, item => `hotel-reklamation-beschwerde-${item.slug}.html`, item => item.name);
            const crossStorno = generateCrossLinks(veranstalter, v, item => `reise-stornieren-kosten-pruefen-${item.slug}.html`, item => item.name);

            let textName = v.name;
            let inputAdresse = v.adresse;

            if (v.slug === 'anderer-veranstalter') {
                textName = lang === 'de' ? "Ihrem Reiseveranstalter" : v.name;
                inputAdresse = "";
            }

            const processTemplate = (tpl, fName, crossLinks) => {
                let content = tpl;
                if (v.slug === 'anderer-veranstalter') {
                    const placeholderName = lang === 'de' ? "Name des Veranstalters eintragen" : "Enter operator name";
                    const placeholderAdr = lang === 'de' ? "Bitte Adresse des Veranstalters eintragen" : "";
                    content = content
                        .replace(/value="\{\{VERANSTALTER_NAME\}\}"/g, `value="" placeholder="${placeholderName}"`)
                        .replace(/>\{\{VERANSTALTER_ADRESSE\}\}</g, ` placeholder="${placeholderAdr}">${inputAdresse}<`);
                }
                return content
                    .replace(/\{\{VERANSTALTER_NAME\}\}/g, textName)
                    .replace(/\{\{VERANSTALTER_ADRESSE\}\}/g, inputAdresse)
                    .replace(/\{\{DATEINAME\}\}/g, fName)
                    .replace(/\{\{BELIEBTE_LINKS\}\}/g, crossLinks)
                    .replace(/\{\{PORTAL_URL\}\}/g, v.portal_url || '#')
                    .replace(/\{\{VERANSTALTER_INFOBOX\}\}/g, v.infobox || '');
            };

            write(fHotel, injectSEO(processTemplate(hotelTpl, fHotel, crossHotel), lang, fHotel, 'veranstalter.json', v.slug, 'hotel'));
            write(fStorno, injectSEO(processTemplate(stornoTpl, fStorno, crossStorno), lang, fStorno, 'veranstalter.json', v.slug, 'storno'));

            const displayName = v.slug === 'anderer-veranstalter' ? (lang === 'de' ? "Anderer Veranstalter (Allgemein)" : v.name) : v.name;
            optHotel += `<option value="${fHotel}">${displayName}</option>\n`;
            linkHotel += `<a href="${fHotel}">${displayName}</a>\n`;
            optStorno += `<option value="${fStorno}">${displayName}</option>\n`;
            linkStorno += `<a href="${fStorno}">${displayName}</a>\n`;
        });

        vermittler.forEach(v => {
            const fPort = `hotel-reklamation-${v.slug}.html`;
            const fStorno = `reise-stornieren-kosten-pruefen-${v.slug}.html`;

            const crossHotelPort = generateCrossLinks(vermittler, v, item => `hotel-reklamation-${item.slug}.html`, item => item.name);
            const crossStornoPort = generateCrossLinks(vermittler, v, item => `reise-stornieren-kosten-pruefen-${item.slug}.html`, item => item.name);

            let textName = v.name;
            let inputAdresse = v.adresse;

            if (v.slug === 'anderer-vermittler') {
                textName = lang === 'de' ? "Ihrem Buchungsportal" : v.name;
                inputAdresse = "";
            }

            const placeholderName = lang === 'de' ? "Name des Portals eintragen" : "Enter portal name";
            const placeholderAdr = lang === 'de' ? "Bitte Adresse des Portals eintragen" : "";

            const processTemplatePort = (tpl, fName, crossLinks) => {
                let content = tpl;
                if (v.slug === 'anderer-vermittler') {
                    content = content
                        .replace(/value="\{\{VERMITTLER_NAME\}\}"/g, `value="" placeholder="${placeholderName}"`)
                        .replace(/>\{\{VERMITTLER_ADRESSE\}\}</g, ` placeholder="${placeholderAdr}">${inputAdresse}<`);
                }
                return content
                    .replace(/\{\{VERMITTLER_NAME\}\}/g, textName)
                    .replace(/\{\{VERMITTLER_ADRESSE\}\}/g, inputAdresse)
                    .replace(/\{\{DATEINAME\}\}/g, fName)
                    .replace(/\{\{BELIEBTE_LINKS\}\}/g, crossLinks)
                    .replace(/\{\{PORTAL_URL\}\}/g, v.portal_url || '#')
                    .replace(/\{\{VERMITTLER_INFOBOX\}\}/g, v.infobox || '');
            };

            // Storno-Template nutzt die VERANSTALTER_-Platzhalter
            const processTemplateStorno = (tpl, fName, crossLinks) => {
                let content = tpl;
                if (v.slug === 'anderer-vermittler') {
                    content = content
                        .replace(/value="\{\{VERANSTALTER_NAME\}\}"/g, `value="" placeholder="${placeholderName}"`)
                        .replace(/>\{\{VERANSTALTER_ADRESSE\}\}</g, ` placeholder="${placeholderAdr}">${inputAdresse}<`);
                }
                return content
                    .replace(/\{\{VERANSTALTER_NAME\}\}/g, textName)
                    .replace(/\{\{VERANSTALTER_ADRESSE\}\}/g, inputAdresse)
                    .replace(/\{\{DATEINAME\}\}/g, fName)
                    .replace(/\{\{BELIEBTE_LINKS\}\}/g, crossLinks)
                    .replace(/\{\{VERANSTALTER_INFOBOX\}\}/g, v.infobox || '');
            };

            write(fPort, injectSEO(processTemplatePort(vermittlerTpl, fPort, crossHotelPort), lang, fPort, 'vermittler.json', v.slug, 'hotel'));
            write(fStorno, injectSEO(processTemplateStorno(stornoTpl, fStorno, crossStornoPort), lang, fStorno, 'vermittler.json', v.slug, 'storno'));

            const displayName = v.slug === 'anderer-vermittler' ? (lang === 'de' ? "Anderes Portal (Allgemein)" : v.name) : v.name;
            optHotel += `<option value="${fPort}">${displayName} (Portal)</option>\n`;
            linkHotel += `<a href="${fPort}">${displayName} (Portal)</a>\n`;
            optStorno += `<option value="${fStorno}">${displayName}</option>\n`;
            linkStorno += `<a href="${fStorno}">${displayName}</a>\n`;
        });

        write('hotel-maengel-info.html', injectSEO(loadTemplate('hub-hotel-master.html').replace(/\{\{HOTEL_OPTIONS\}\}/g, optHotel).replace(/\{\{HOTEL_LINKS\}\}/g, linkHotel), lang, 'hotel-maengel-info.html', null, null, 'hotel'));
        write('storno-info.html', injectSEO(loadTemplate('hub-storno-master.html').replace(/\{\{STORNO_OPTIONS\}\}/g, optStorno).replace(/\{\{STORNO_LINKS\}\}/g, linkStorno), lang, 'storno-info.html', null, null, 'storno'));

        // =====================================================================
        // SILO 3: EINREISE / VISUM  (aktuell pausiert -> CONFIG.disabledSilos)
        // =====================================================================
        if (!isExcludedForLang('visum', lang)) {
            const laender = readJson('laender.json');
            let optVisa = "", linkVisa = "";

            laender.forEach(l => {
                const f = `einreisebestimmungen-${l.slug}.html`;
                const crossVisa = generateCrossLinks(laender, l, item => `einreisebestimmungen-${item.slug}.html`, item => item.name);
                let content = loadTemplate('visum-master.html')
                    .replace(/\{\{LAND_NAME\}\}/g, l.name)
                    .replace(/\{\{VISUM_STATUS\}\}/g, l.visum_status)
                    .replace(/\{\{PASS_MONATE\}\}/g, l.pass_monate)
                    .replace(/\{\{VISUM_TEXT\}\}/g, l.visum_text)
                    .replace(/\{\{AFFILIATE_HINWEIS\}\}/g, l.affiliate_hinweis)
                    .replace(/\{\{DATEINAME\}\}/g, f)
                    .replace(/\{\{BELIEBTE_LINKS\}\}/g, crossVisa);
                write(f, injectSEO(content, lang, f, 'laender.json', l.slug, 'visum'));
                optVisa += `<option value="${f}">${l.name}</option>\n`;
                linkVisa += `<a href="${f}">${l.name}</a>\n`;
            });

            write('einreise-info.html', injectSEO(loadTemplate('hub-einreise-master.html').replace(/\{\{VISA_OPTIONS\}\}/g, optVisa).replace(/\{\{VISA_LINKS\}\}/g, linkVisa), lang, 'einreise-info.html', null, null, 'visum'));
        } else if (lang === CONFIG.baseLang) {
            console.log(`   ⏸️  Silo [Einreise/Visum] ist pausiert (disabledSilos).`);
        }

        // =====================================================================
        // SILO 4: ESIM & MIETWAGEN
        // =====================================================================
        const esim = readJson('esim.json');
        const mietwagen = readJson('mietwagen.json');
        let optEsim = "", linkEsim = "", optMiet = "", linkMiet = "";

        esim.forEach(e => {
            const f = `internet-roaming-kosten-${e.slug}.html`;
            const crossEsim = generateCrossLinks(esim, e, item => `internet-roaming-kosten-${item.slug}.html`, item => item.name);
            const content = loadTemplate('esim-master.html')
                .replace(/\{\{LAND_NAME\}\}/g, e.name)
                .replace(/\{\{ROAMING_KOSTEN\}\}/g, e.roaming_kosten)
                .replace(/\{\{ESIM_PREIS\}\}/g, e.esim_preis)
                .replace(/\{\{DATENVOLUMEN\}\}/g, e.datenvolumen)
                .replace(/\{\{AFFILIATE_LINK\}\}/g, e.affiliate_link)
                .replace(/\{\{DATEINAME\}\}/g, f)
                .replace(/\{\{BELIEBTE_LINKS\}\}/g, crossEsim);
            write(f, injectSEO(content, lang, f, 'esim.json', e.slug, 'esim'));
            optEsim += `<option value="${f}">${e.name}</option>\n`;
            linkEsim += `<a href="${f}">${e.name}</a>\n`;
        });

        mietwagen.forEach(m => {
            const f = `mietwagen-versicherungen-${m.slug}.html`;
            const crossMiet = generateCrossLinks(mietwagen, m, item => `mietwagen-versicherungen-${item.slug}.html`, item => item.name);
            const content = loadTemplate('mietwagen-master.html')
                .replace(/\{\{MIETWAGEN_NAME\}\}/g, m.name)
                .replace(/\{\{SCHALTER_TAKTIK\}\}/g, m.schalter_taktik)
                .replace(/\{\{KAUTION_HINWEIS\}\}/g, m.kaution_hinweis)
                .replace(/\{\{DATEINAME\}\}/g, f)
                .replace(/\{\{BELIEBTE_LINKS\}\}/g, crossMiet);
            write(f, injectSEO(content, lang, f, 'mietwagen.json', m.slug, 'mietwagen'));
            optMiet += `<option value="${f}">${m.name}</option>\n`;
            linkMiet += `<a href="${f}">${m.name}</a>\n`;
        });

        write('esim-roaming-info.html', injectSEO(loadTemplate('hub-esim-master.html').replace(/\{\{ESIM_OPTIONS\}\}/g, optEsim).replace(/\{\{ESIM_LINKS\}\}/g, linkEsim), lang, 'esim-roaming-info.html', null, null, 'esim'));
        write('mietwagen-info.html', injectSEO(loadTemplate('hub-mietwagen-master.html').replace(/\{\{MIETWAGEN_OPTIONS\}\}/g, optMiet).replace(/\{\{MIETWAGEN_LINKS\}\}/g, linkMiet), lang, 'mietwagen-info.html', null, null, 'mietwagen'));

        // =====================================================================
        // SILO 5: ZOLL — nur Basissprache
        // =====================================================================
        if (!isExcludedForLang('zoll', lang)) {
            const zoll = readJson('zoll.json');
            let optZoll = "", linkZoll = "";

            zoll.forEach(z => {
                const f = `zoll-strafe-beschlagnahmt-${z.slug}.html`;
                const crossZoll = generateCrossLinks(zoll, z, item => `zoll-strafe-beschlagnahmt-${item.slug}.html`, item => item.artikel);
                const content = loadTemplate('zoll-master.html')
                    .replace(/\{\{ARTIKEL\}\}/g, z.artikel)
                    .replace(/\{\{PROBLEM\}\}/g, z.problem)
                    .replace(/\{\{DATEINAME\}\}/g, f)
                    .replace(/\{\{BELIEBTE_LINKS\}\}/g, crossZoll);
                write(f, injectSEO(content, lang, f, 'zoll.json', z.slug, 'zoll'));
                optZoll += `<option value="${f}">${z.artikel}</option>\n`;
                linkZoll += `<a href="${f}">${z.artikel}</a>\n`;
            });

            write('zoll-info.html', injectSEO(loadTemplate('hub-zoll-master.html').replace(/\{\{ZOLL_OPTIONS\}\}/g, optZoll).replace(/\{\{ZOLL_LINKS\}\}/g, linkZoll), lang, 'zoll-info.html', null, null, 'zoll'));
        } else {
            console.log(`   ⏭️  Silo [Zoll] wird für [${lang.toUpperCase()}] übersprungen.`);
        }

        // =====================================================================
        // SILO 6: BAHN
        // =====================================================================
        if (!isExcludedForLang('bahn', lang)) {
            const bahnAnbieter = readJson('bahn.json');
            const bahnTpl = loadTemplate('bahn-master.html');
            let optBahn = "", linkBahn = "";

            bahnAnbieter.forEach(b => {
                const fBahn = `zugverspaetung-entschaedigung-${b.slug}.html`;
                const crossBahn = generateCrossLinks(bahnAnbieter, b, item => `zugverspaetung-entschaedigung-${item.slug}.html`, item => item.name);
                const content = bahnTpl
                    .replace(/\{\{BAHN_NAME\}\}/g, b.name)
                    .replace(/\{\{BAHN_ADRESSE\}\}/g, b.adresse)
                    .replace(/\{\{DATEINAME\}\}/g, fBahn)
                    .replace(/\{\{BELIEBTE_LINKS\}\}/g, crossBahn)
                    .replace(/\{\{PORTAL_URL\}\}/g, b.portal_url || '#')
                    .replace(/\{\{BAHN_INFOBOX\}\}/g, b.infobox || '');
                write(fBahn, injectSEO(content, lang, fBahn, 'bahn.json', b.slug, 'bahn'));
                optBahn += `<option value="${fBahn}">${b.name}</option>\n`;
                linkBahn += `<a href="${fBahn}">${b.name}</a>\n`;
            });

            write('zugverspaetung-info.html', injectSEO(loadTemplate('hub-bahn-master.html').replace(/\{\{BAHN_OPTIONS\}\}/g, optBahn).replace(/\{\{BAHN_LINKS\}\}/g, linkBahn), lang, 'zugverspaetung-info.html', null, null, 'bahn'));
        } else {
            console.log(`   ⏭️  Silo [Bahn] wird für [${lang.toUpperCase()}] übersprungen.`);
        }

        // =====================================================================
        // SILO 7: OTA
        // =====================================================================
        if (!isExcludedForLang('ota', lang)) {
            const otaVermittler = readJson('vermittler-ota.json');
            const otaTpl = loadTemplate('ota-vermittler-master.html');
            let optOta = "", linkOta = "";

            otaVermittler.forEach(v => {
                const fOta = `rueckerstattung-flug-portal-${v.slug}.html`;
                const crossOta = generateCrossLinks(otaVermittler, v, item => `rueckerstattung-flug-portal-${item.slug}.html`, item => item.name);

                let textName = v.name;
                let inputAdresse = v.adresse;

                if (v.slug === 'allgemein') {
                    textName = lang === 'de' ? "Ihrem Buchungsportal" : v.name;
                    inputAdresse = "";
                }

                let content = otaTpl;
                if (v.slug === 'allgemein') {
                    const placeholderName = lang === 'de' ? "Name des Portals eintragen" : "Enter portal name";
                    const placeholderAdr = lang === 'de' ? "Bitte Adresse des Portals eintragen" : "";
                    content = content
                        .replace(/value="\{\{VERMITTLER_NAME\}\}"/g, `value="" placeholder="${placeholderName}"`)
                        .replace(/>\{\{VERMITTLER_ADRESSE\}\}</g, ` placeholder="${placeholderAdr}">${inputAdresse}<`);
                }
                content = content
                    .replace(/\{\{VERMITTLER_NAME\}\}/g, textName)
                    .replace(/\{\{VERMITTLER_ADRESSE\}\}/g, inputAdresse)
                    .replace(/\{\{DATEINAME\}\}/g, fOta)
                    .replace(/\{\{BELIEBTE_LINKS\}\}/g, crossOta)
                    .replace(/\{\{PORTAL_URL\}\}/g, v.portal_url || '#')
                    .replace(/\{\{VERMITTLER_INFOBOX\}\}/g, v.infobox || '');

                write(fOta, injectSEO(content, lang, fOta, 'vermittler-ota.json', v.slug, 'ota'));
                optOta += `<option value="${fOta}">${v.name}</option>\n`;
                linkOta += `<a href="${fOta}">${v.name}</a>\n`;
            });

            write('ota-rueckerstattung-info.html', injectSEO(loadTemplate('hub-ota-master.html').replace(/\{\{OTA_OPTIONS\}\}/g, optOta).replace(/\{\{OTA_LINKS\}\}/g, linkOta), lang, 'ota-rueckerstattung-info.html', null, null, 'ota'));
        } else {
            console.log(`   ⏭️  Silo [OTA] wird für [${lang.toUpperCase()}] übersprungen.`);
        }

        // =====================================================================
        // SILO 8: KREUZFAHRTEN
        // =====================================================================
        const kreuzfahrten = readJson('kreuzfahrten.json');
        const kreuzfahrtTpl = loadTemplate('kreuzfahrt-master.html');
        let optCruise = "", linkCruise = "";

        kreuzfahrten.forEach(c => {
            const fCruise = `kreuzfahrt-maengel-minderung-${c.slug}.html`;
            const crossCruise = generateCrossLinks(kreuzfahrten, c, item => `kreuzfahrt-maengel-minderung-${item.slug}.html`, item => item.name);

            let textName = c.name;
            let inputAdresse = c.adresse;

            if (c.slug === 'allgemein') {
                textName = lang === 'de' ? "Ihrer Reederei" : c.name;
                inputAdresse = "";
            }

            let content = kreuzfahrtTpl;
            if (c.slug === 'allgemein') {
                const placeholderName = lang === 'de' ? "Name der Reederei eintragen" : "Enter cruise line name";
                const placeholderAdr = lang === 'de' ? "Bitte Adresse der Reederei eintragen" : "";
                content = content
                    .replace(/value="\{\{CRUISE_LINE\}\}"/g, `value="" placeholder="${placeholderName}"`)
                    .replace(/>\{\{CRUISE_ADRESSE\}\}</g, ` placeholder="${placeholderAdr}">${inputAdresse}<`);
            }
            content = content
                .replace(/\{\{CRUISE_LINE\}\}/g, textName)
                .replace(/\{\{CRUISE_ADRESSE\}\}/g, inputAdresse)
                .replace(/\{\{DATEINAME\}\}/g, fCruise)
                .replace(/\{\{BELIEBTE_LINKS\}\}/g, crossCruise)
                .replace(/\{\{PORTAL_URL\}\}/g, c.portal_url || '#')
                .replace(/\{\{CRUISE_INFOBOX\}\}/g, c.infobox || '');

            write(fCruise, injectSEO(content, lang, fCruise, 'kreuzfahrten.json', c.slug, 'kreuzfahrt'));
            optCruise += `<option value="${fCruise}">${c.name}</option>\n`;
            linkCruise += `<a href="${fCruise}">${c.name}</a>\n`;
        });

        write('kreuzfahrt-minderung.html', injectSEO(loadTemplate('hub-kreuzfahrt-master.html').replace(/\{\{CRUISE_OPTIONS\}\}/g, optCruise).replace(/\{\{CRUISE_LINKS\}\}/g, linkCruise), lang, 'kreuzfahrt-minderung.html', null, null, 'kreuzfahrt'));

        // =====================================================================
        // SILO 9: FERIENHÄUSER
        // =====================================================================
        if (!isExcludedForLang('ferienhaus', lang)) {
            const fewoAnbieter = readJson('ferienhaus.json');
            const fewoTpl = loadTemplate('ferienhaus-master.html');
            let optFewo = "", linkFewo = "";

            fewoAnbieter.forEach(f => {
                const fFileName = `ferienhaus-reklamation-beschwerde-${f.slug}.html`;
                const crossFewo = generateCrossLinks(fewoAnbieter, f, item => `ferienhaus-reklamation-beschwerde-${item.slug}.html`, item => item.name);

                let textName = f.name;
                let inputValue = f.name;
                let titleName = f.name + (lang === 'de' ? " Beschwerde" : " Complaint");
                let inputAdresse = f.adresse;
                let finalPlaceholderName = "";
                let finalPlaceholderAdr = f.adresse;

                if (f.slug === 'allgemein') {
                    textName = lang === 'de' ? "Ihrem Anbieter" : (f.name || "your provider");
                    inputValue = "";
                    inputAdresse = "";
                    titleName = lang === 'de' ? "Allgemeine Beschwerde" : "General Complaint";
                    finalPlaceholderName = lang === 'de' ? "Name des Anbieters eintragen" : "Enter provider name";
                    finalPlaceholderAdr = lang === 'de' ? "Bitte Adresse des Anbieters eintragen" : "Enter provider address";
                }

                const content = fewoTpl
                    .replace(/\{\{ANBIETER_NAME\}\} Beschwerde/g, titleName)
                    .replace(/value="\{\{ANBIETER_NAME\}\}"/g, `value="${inputValue}" placeholder="${finalPlaceholderName}"`)
                    .replace(/>\{\{ANBIETER_ADRESSE\}\}</g, ` placeholder="${finalPlaceholderAdr}">${inputAdresse}<`)
                    .replace(/\{\{ANBIETER_NAME\}\}/g, textName)
                    .replace(/\{\{DATEINAME\}\}/g, fFileName)
                    .replace(/\{\{BELIEBTE_LINKS\}\}/g, crossFewo)
                    .replace(/\{\{PORTAL_URL\}\}/g, f.portal_url || '#')
                    .replace(/\{\{ANBIETER_INFOBOX\}\}/g, f.infobox || '');

                write(fFileName, injectSEO(content, lang, fFileName, 'ferienhaus.json', f.slug, 'ferienhaus'));
                optFewo += `<option value="${fFileName}">${f.name}</option>\n`;
                linkFewo += `<a href="${fFileName}">${f.name}</a>\n`;
            });

            write('ferienhaus-maengel-info.html', injectSEO(loadTemplate('hub-ferienhaus-master.html').replace(/\{\{FEWO_OPTIONS\}\}/g, optFewo).replace(/\{\{FEWO_LINKS\}\}/g, linkFewo), lang, 'ferienhaus-maengel-info.html', null, null, 'ferienhaus'));
        } else {
            console.log(`   ⏭️  Silo [Ferienhaus] wird für [${lang.toUpperCase()}] übersprungen.`);
        }

        // =====================================================================
        // SILO 10: AIRBNB
        // =====================================================================
        const airbnbThemen = readJson('airbnb.json');
        const airbnbTpl = loadTemplate('airbnb-master.html');
        let optAirbnb = "", linkAirbnb = "";

        airbnbThemen.forEach(a => {
            const fAirbnb = `airbnb-beschwerde-${a.slug}.html`;
            const crossAirbnb = generateCrossLinks(airbnbThemen, a, item => `airbnb-beschwerde-${item.slug}.html`, item => item.name);
            const content = airbnbTpl
                .replace(/\{\{PROBLEM_KATEGORIE\}\}/g, a.name)
                .replace(/\{\{MANGEL_BESCHREIBUNG\}\}/g, a.beschreibung)
                .replace(/\{\{DATEINAME\}\}/g, fAirbnb)
                .replace(/\{\{PORTAL_URL\}\}/g, a.portal_url || '#')
                .replace(/\{\{BELIEBTE_LINKS\}\}/g, crossAirbnb);
            write(fAirbnb, injectSEO(content, lang, fAirbnb, 'airbnb.json', a.slug, 'airbnb'));
            optAirbnb += `<option value="${fAirbnb}">${a.name}</option>\n`;
            linkAirbnb += `<a href="${fAirbnb}">${a.name}</a>\n`;
        });

        write('airbnb-probleme-info.html', injectSEO(loadTemplate('hub-airbnb-master.html').replace(/\{\{AIRBNB_OPTIONS\}\}/g, optAirbnb).replace(/\{\{AIRBNB_LINKS\}\}/g, linkAirbnb), lang, 'airbnb-probleme-info.html', null, null, 'airbnb'));

        // =====================================================================
        // SILO 11: FLUGHAFEN-PARKEN
        // =====================================================================
        if (!isExcludedForLang('flughafen-parken', lang)) {
            const flughaefen = readJson('flughafen.json');
            const flughafenTpl = loadTemplate('flughafen-parken-master.html');
            let optFlughafen = "", linkFlughafen = "";

            flughaefen.forEach(f => {
                const fFileName = `parken-flughafen-${f.slug}.html`;
                const crossFlughafen = generateCrossLinks(flughaefen, f, item => `parken-flughafen-${item.slug}.html`, item => item.name);

                const content = flughafenTpl
                    .replace(/\{\{FLUGHAFEN_NAME\}\}/g, f.name)
                    .replace(/\{\{FLUGHAFEN_KUERZEL\}\}/g, f.kuerzel)
                    .replace(/\{\{TERMINAL_PREIS_14_TAGE\}\}/g, f.terminal_preis_14 || "280 €")
                    .replace(/\{\{ALTERNATIVE_PREIS_START\}\}/g, f.alternative_preis_start || "60 €")
                    .replace(/\{\{AFFILIATE_LINK\}\}/g, f.affiliate_link || "https://www.parkos.de/")
                    .replace(/\{\{DATEINAME\}\}/g, fFileName)
                    .replace(/\{\{BELIEBTE_LINKS\}\}/g, crossFlughafen)
                    .replace(/\{\{TERMINAL_RATE_PER_DAY\}\}/g, f.terminal_rate_per_day || 22.00)
                    .replace(/\{\{ALTERNATIVE_RATE_PER_DAY\}\}/g, f.alternative_rate_per_day || 5.00);

                write(fFileName, injectSEO(content, lang, fFileName, 'flughafen.json', f.slug, 'flughafen-parken'));
                optFlughafen += `<option value="${fFileName}">${f.name} (${f.kuerzel})</option>\n`;
                linkFlughafen += `<a href="${fFileName}">${f.name} (${f.kuerzel})</a>\n`;
            });

            if (srcExists('hub-flughafen-parken-master.html')) {
                write('flughafen-parken-info.html', injectSEO(loadTemplate('hub-flughafen-parken-master.html').replace(/\{\{FLUGHAFEN_OPTIONS\}\}/g, optFlughafen).replace(/\{\{FLUGHAFEN_LINKS\}\}/g, linkFlughafen), lang, 'flughafen-parken-info.html', null, null, 'flughafen-parken'));
            }
        } else {
            console.log(`   ⏭️  Silo [Flughafen-Parken] wird für [${lang.toUpperCase()}] übersprungen.`);
        }

        // =====================================================================
        // SILO 12: REISEKREDITKARTEN
        // =====================================================================
        const waehrungsLaender = readJson('fremdwaehrung.json');
        const kreditkartenTpl = loadTemplate('reisekreditkarte-master.html');
        let optKredit = "", linkKredit = "";

        waehrungsLaender.forEach(w => {
            const fFileName = `geld-abheben-bezahlen-${w.slug}.html`;
            const crossKredit = generateCrossLinks(waehrungsLaender, w, item => `geld-abheben-bezahlen-${item.slug}.html`, item => item.name);
            const content = kreditkartenTpl
                .replace(/\{\{LAND_NAME\}\}/g, w.name)
                .replace(/\{\{WAEHRUNG\}\}/g, w.waehrung)
                .replace(/\{\{AFFILIATE_LINK\}\}/g, w.affiliate_link || "https://dein-standard-affiliate-link.de")
                .replace(/\{\{DATEINAME\}\}/g, fFileName)
                .replace(/\{\{BELIEBTE_LINKS\}\}/g, crossKredit);
            write(fFileName, injectSEO(content, lang, fFileName, 'fremdwaehrung.json', w.slug, 'reisekreditkarte'));
            optKredit += `<option value="${fFileName}">${w.name} (${w.waehrung})</option>\n`;
            linkKredit += `<a href="${fFileName}">${w.name}</a>\n`;
        });

        if (srcExists('hub-reisekreditkarten-master.html')) {
            write('reisekreditkarten-info.html', injectSEO(loadTemplate('hub-reisekreditkarten-master.html').replace(/\{\{KREDIT_OPTIONS\}\}/g, optKredit).replace(/\{\{KREDIT_LINKS\}\}/g, linkKredit), lang, 'reisekreditkarten-info.html', null, null, 'reisekreditkarte'));
        }

        // =====================================================================
        // SILO 13: CHARGEBACK (optional, z.B. en-us)
        // =====================================================================
        if (srcExists('chargeback.json')) {
            const chargebackMerchants = readJson('chargeback.json');
            const chargebackTpl = loadTemplate('chargeback-generator.html');
            let optCharge = "", linkCharge = "";

            chargebackMerchants.forEach(c => {
                const fCharge = `credit-card-chargeback-${c.slug}.html`;
                const crossCharge = generateCrossLinks(chargebackMerchants, c, item => `credit-card-chargeback-${item.slug}.html`, item => item.name);
                const content = chargebackTpl
                    .replace(/\{\{MERCHANT_NAME\}\}/g, c.name)
                    .replace(/\{\{MERCHANT_INFOBOX\}\}/g, c.infobox || '')
                    .replace(/\{\{DATEINAME\}\}/g, fCharge)
                    .replace(/\{\{BELIEBTE_LINKS\}\}/g, crossCharge);
                write(fCharge, injectSEO(content, lang, fCharge, 'chargeback.json', c.slug, 'chargeback'));
                optCharge += `<option value="${fCharge}">${c.name}</option>\n`;
                linkCharge += `<a href="${fCharge}">${c.name}</a>\n`;
            });

            if (srcExists('hub-chargeback-master.html')) {
                write('chargeback-info.html', injectSEO(loadTemplate('hub-chargeback-master.html').replace(/\{\{CHARGEBACK_OPTIONS\}\}/g, optCharge).replace(/\{\{CHARGEBACK_LINKS\}\}/g, linkCharge), lang, 'chargeback-info.html', null, null, 'chargeback'));
            }
        }

        // =====================================================================
        // SILO 14: ESKALATION (Anleitungen & Mahnungs-Generator, optional)
        // =====================================================================
        if (srcExists('eskalation.json')) {
            const eskalationen = readJson('eskalation.json');
            const anleitungTpl = loadTemplate('anleitung-master.html');
            const mahnungTpl = loadTemplate('mahnung-master.html');
            let optAnleitung = "", linkAnleitung = "", optMahnung = "", linkMahnung = "";

            // Gemeinsame Platzhalter beider Templates
            const fillShared = (tpl, e, crossLinks) => tpl
                .replace(/\{\{BRAND_NAME\}\}/g, e.name)
                .replace(/\{\{BRAND_ADRESSE\}\}/g, e.adresse)
                .replace(/\{\{FAQ_FRAGE\}\}/g, e.faq_frage)
                .replace(/\{\{FAQ_ANTWORT\}\}/g, e.faq_antwort)
                .replace(/\{\{FAQ2_FRAGE\}\}/g, e.faq2_frage || '')
                .replace(/\{\{FAQ2_ANTWORT\}\}/g, e.faq2_antwort || '')
                .replace(/\{\{FAQ3_FRAGE\}\}/g, e.faq3_frage || '')
                .replace(/\{\{FAQ3_ANTWORT\}\}/g, e.faq3_antwort || '')
                .replace(/\{\{SCHLICHTUNG_NAME\}\}/g, e.schlichtung_name)
                .replace(/\{\{SCHLICHTUNG_LINK\}\}/g, e.schlichtung_link)
                .replace(/\{\{BRAND_INFOBOX\}\}/g, e.infobox || '')
                .replace(/\{\{BELIEBTE_LINKS\}\}/g, crossLinks);

            eskalationen.forEach(e => {
                const fAnleitung = `beschwerde-anleitung-${e.slug}.html`;
                const fMahnung = `letzte-mahnung-nachdruck-${e.slug}.html`;

                const crossAnleitung = generateCrossLinks(eskalationen, e, item => `beschwerde-anleitung-${item.slug}.html`, item => item.name);
                const crossMahnung = generateCrossLinks(eskalationen, e, item => `letzte-mahnung-nachdruck-${item.slug}.html`, item => item.name);

                // Anleitung (BRAND_SLUG führt den Button zur passenden Mahnung)
                const contentAnleitung = fillShared(anleitungTpl, e, crossAnleitung)
                    .replace(/\{\{BRAND_SLUG\}\}/g, e.slug);
                write(fAnleitung, injectSEO(contentAnleitung, lang, fAnleitung, 'eskalation.json', e.slug, 'eskalation'));

                // Mahnungs-Generator
                const contentMahnung = fillShared(mahnungTpl, e, crossMahnung)
                    .replace(/\{\{BRAND_TYP\}\}/g, e.typ);
                write(fMahnung, injectSEO(contentMahnung, lang, fMahnung, 'eskalation.json', e.slug, 'eskalation'));

                optAnleitung += `<option value="${fAnleitung}">${e.name} (Anleitung)</option>\n`;
                linkAnleitung += `<a href="${fAnleitung}">${e.name}</a>\n`;
                optMahnung += `<option value="${fMahnung}">${e.name} (Mahnung generieren)</option>\n`;
                linkMahnung += `<a href="${fMahnung}">${e.name}</a>\n`;
            });

            if (srcExists('hub-anleitung-master.html')) {
                write('beschwerde-anleitungen-info.html', injectSEO(loadTemplate('hub-anleitung-master.html').replace(/\{\{ANLEITUNG_OPTIONS\}\}/g, optAnleitung).replace(/\{\{ANLEITUNG_LINKS\}\}/g, linkAnleitung), lang, 'beschwerde-anleitungen-info.html', null, null, 'eskalation'));
            }
            if (srcExists('hub-mahnung-master.html')) {
                write('letzte-mahnung-nachdruck-info.html', injectSEO(loadTemplate('hub-mahnung-master.html').replace(/\{\{MAHNUNG_OPTIONS\}\}/g, optMahnung).replace(/\{\{MAHNUNG_LINKS\}\}/g, linkMahnung), lang, 'letzte-mahnung-nachdruck-info.html', null, null, 'eskalation'));
            }
        } else {
            console.log(`   ⏭️  Silo [Eskalation] wird für [${lang.toUpperCase()}] übersprungen (keine JSON gefunden).`);
        }

        // =====================================================================
        // AUFRÄUMEN: Alles in docs/<lang>/ löschen, was nicht mehr erzeugt wurde
        // =====================================================================
        console.log(`   ✅ ${generated.size} Seiten generiert.`);
        cleanupOutputDir(outputDir, generated, lang);
    });

    console.log('\n🎉 Fertig! Alle internationalen Verzeichnisse wurden erfolgreich erzeugt.');
}

// Skript starten
buildEngine();
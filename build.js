const fs = require('fs');
const path = require('path');

// =====================================================================
// 1. GLOBAL KONFIGURATION
// =====================================================================
const CONFIG = {
    baseLang: 'de',          // Wo liegen deine deutschen Originale? (src/de/)
    targetLangs: ['es', 'fr', 'it', 'nl', 'pt', 'nl-be', 'fr-be', 'en-us', 'en-gb'],     // Welche Sprachen sollen generiert werden? (z.B. ['es', 'it', 'fr'])
    useAI: false,            // HIER AUF 'true' STELLEN, UM DIE KI ZU STARTEN oder false
    openaiKey: '', // HIER DEINEN API KEY EINTRAGEN

    // Silos, die NUR für die Basissprache generiert werden (kein EU-Recht / keine EU-weiten Daten)
    baseLangOnlySilos: ['ota', 'zoll', 'flughafen-parken']
};

// Hilfsfunktion: Prüft ob ein Silo für die aktuelle Sprache übersprungen werden soll
const isExcludedForLang = (siloName, lang) => {
    // 1. AUSNAHME OTA: Darf für nl, nl-be UND en-us generiert werden
    if (siloName === 'ota' && ['nl', 'nl-be', 'en-us', 'en-gb'].includes(lang)) {
        return false; // Nicht ausschließen!
    }
    
    // 2. AUSNAHME FLUGHAFEN-PARKEN: Darf für en-us & en-gb generiert werden
    if (siloName === 'flughafen-parken' && ['en-us', 'en-gb'].includes(lang)) {
        return false; // Parken für UK/US erlauben
    }
    
    // 3. AUSNAHME US-MARKT: Bahn, Steuern und Ferienhaus in en-us NICHT generieren
    if (['bahn', 'steuern', 'ferienhaus'].includes(siloName) && lang === 'en-us') {
        return true; // Ausschließen!
    }
    
    // Standard-Regel für alle anderen Silos und Sprachen (Zoll etc.)
    return lang !== CONFIG.baseLang && CONFIG.baseLangOnlySilos.includes(siloName);
};

console.log('🚀 Starte das internationale Hub & Spoke Build-System...\n');

// =====================================================================
// SEO-MAGIE: DYNAMISCHE HREFLANG GENERIERUNG
// =====================================================================
const jsonCache = {};

// Prüft, ob ein Slug in der JSON der jeweiligen Sprache existiert
function hasItemInLang(lang, jsonFile, slug) {
    if (!jsonCache[lang]) jsonCache[lang] = {};
    if (!jsonCache[lang][jsonFile]) {
        const p = path.join(__dirname, 'src', lang, jsonFile);
        if (fs.existsSync(p)) {
            jsonCache[lang][jsonFile] = JSON.parse(fs.readFileSync(p, 'utf8'));
        } else {
            jsonCache[lang][jsonFile] = [];
        }
    }
    return jsonCache[lang][jsonFile].some(item => item.slug === slug);
}

// Baut den fertigen SEO-Block und ersetzt den Platzhalter im HTML
function injectSEO(content, currentLang, fName, jsonFile = null, slug = null, siloName = null) {
    const domain = "https://www.fix-my-trip.com";
    const allLangs = [CONFIG.baseLang, ...CONFIG.targetLangs];
    let availableLangs = [];

    allLangs.forEach(l => {
        // 1. Überspringen, wenn das Silo (z.B. Bahn) für diese Sprache (z.B. en-us) gesperrt ist
        if (siloName && isExcludedForLang(siloName, l)) return;

        // 2. Existiert der Eintrag in der Ziel-JSON? (Für Detailseiten)
        if (jsonFile && slug) {
            if (hasItemInLang(l, jsonFile, slug)) availableLangs.push(l);
        } else {
            // (Für Hub-Seiten, die keine JSON/Slugs haben)
            availableLangs.push(l);
        }
    });

    // Fallback: Wenn nichts da ist, zumindest auf sich selbst verweisen
    if (availableLangs.length === 0) availableLangs.push(currentLang);

    // Canonical Tag bauen
    let seoBlock = `<link rel="canonical" href="${domain}/${currentLang}/${fName}">\n`;
    
    // Hreflang Tags bauen
    availableLangs.forEach(l => {
        let langCode = l;
        if (l === 'en-us') langCode = 'en-us';
        if (l === 'en-gb') langCode = 'en-gb';
        if (l === 'nl-be') langCode = 'nl-be';
        if (l === 'fr-be') langCode = 'fr-be';
        seoBlock += `<link rel="alternate" hreflang="${langCode}" href="${domain}/${l}/${fName}">\n`;
    });

    // x-default (US bevorzugen, sonst DE, sonst das Erste)
    let xDefault = availableLangs.includes('en-us') ? 'en-us' : (availableLangs.includes(CONFIG.baseLang) ? CONFIG.baseLang : availableLangs[0]);
    seoBlock += `<link rel="alternate" hreflang="x-default" href="${domain}/${xDefault}/${fName}">`;

   // Den Platzhalter im HTML ersetzen
    if (content.includes('{{SEO_LINKS}}')) {
        return content.replace('{{SEO_LINKS}}', seoBlock);
    }
    
    // Wenn kein Platzhalter da ist: Nichts tun! (Erlaubt manuelle SEO-Tags)
    return content;
}

// =====================================================================
// 2. HILFSFUNKTION FÜR KI-ÜBERSETZUNG (Nutzt natives Fetch ab Node 18+)
// =====================================================================
async function translateWithGPT(content, targetLang, isJson = false) {
    if (!CONFIG.openaiKey || CONFIG.openaiKey.startsWith('DEIN')) {
        console.error('❌ KI-Übersetzung fehlgeschlagen: Kein gültiger OpenAI Key hinterlegt!');
        return content;
    }

    // --- NEUE, MASSIV VERSCHÄRFTE KI-PROMPTS ---
    const systemPrompt = isJson 
        ? `You are a professional translator. Translate the values of the following JSON into language code "${targetLang}". 
CRITICAL RULES:
1. KEEP ALL JSON KEYS EXACTLY THE SAME. Only translate the string values.
2. Do not translate or change slugs, IDs, or variable technical names.
3. DO NOT shorten or omit anything. Return the complete JSON with all items intact.`
        
        : `You are a professional web translator. Translate the text content of this HTML template into language code "${targetLang}". 
CRITICAL RULES:
1. KEEP ALL TEMPLATE PLACEHOLDERS LIKE {{AIRLINE_NAME}}, {{DATEINAME}} OR {{BELIEBTE_LINKS}} EXACTLY AS THEY ARE.
2. TRANSLATE HTML ATTRIBUTES: You MUST translate human-readable text inside HTML attributes! Specifically, translate all text inside placeholder="..." , alt="..." , and title="...". DO NOT leave placeholders in German!
3. TRANSLATE JAVASCRIPT STRINGS: You MUST translate all human-readable text strings inside the <script> tags! This includes strings inside doc.text("..."), template literals for PDF generation (like \`Sehr geehrte...\`), and button labels. Keep variables (like \${sName}) and JS syntax completely intact.
4. UPDATE META TAGS: Change <html lang="de"> to <html lang="${targetLang}"> and update any hreflang attributes to match "${targetLang}".
5. REPHRASE GERMAN LEGAL TERMS & TABLES: 
   - German civil law ("BGB", "Bürgerliches Gesetzbuch", "§ 286 BGB"): DO NOT translate literally. Rephrase into generic terms like "applicable civil law" or "consumer protection regulations". Omit paragraph numbers.
   - Compensation tables ("Würzburger Tabelle", "Frankfurter Tabelle"): DO NOT keep the German city names! Generalize them into natural terms like "established travel law guidelines" or "industry-standard compensation tables".
6. DO NOT alter HTML structure (except attributes mentioned in Rule 2), CSS class names, or JavaScript logic/functions.
7. DO NOT shorten or leave out any part of the file. Output the complete HTML code exactly as provided, from start to finish, just translated.`;

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CONFIG.openaiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-5.4-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: content }
                ],
                temperature: 0.1 // Sehr niedrig gestellt, damit die KI nicht kreativ wird, sondern strikt übersetzt
            })
        });

        const data = await response.json();
        let result = data.choices[0].message.content.trim();
        if (isJson) result = result.replace(/^```json\s*|```$/g, ''); // Markdown-Block Filter
        if (!isJson) result = result.replace(/^```html\s*|```$/g, ''); // Falls die KI HTML-Markdown macht
        return result;
    } catch (err) {
        console.error(`❌ Fehler bei der KI-Übersetzung:`, err);
        return content;
    }
}

// =====================================================================
// 3. KI-ÜBERSETZUNGSTRIGGER (Prüft ob Zielordner existieren)
// =====================================================================

// Dateien, die NUR für die Basissprache relevant sind und NICHT übersetzt werden sollen
const BASE_LANG_ONLY_FILES = [
    // OTA
    'vermittler-ota.json', 'ota-vermittler-master.html', 'hub-ota-master.html',
    // Zoll
    'zoll.json', 'zoll-master.html', 'hub-zoll-master.html',
    // Flughafen-Parken
    'flughafen.json', 'flughafen-parken-master.html', 'hub-flughafen-parken-master.html'
];

async function checkAndTranslateSources() {
    if (!CONFIG.useAI) return;

    for (const lang of CONFIG.targetLangs) {
        const targetSrcDir = path.join(__dirname, 'src', lang);
        const baseSrcDir = path.join(__dirname, 'src', CONFIG.baseLang);

        // Nur übersetzen, wenn der Zielordner noch nicht existiert oder leer ist
        if (!fs.existsSync(targetSrcDir) || fs.readdirSync(targetSrcDir).length === 0) {
            console.log(`🤖 KI startet Übersetzung von [${CONFIG.baseLang}] nach [${lang}]...`);
            fs.mkdirSync(targetSrcDir, { recursive: true });

            const files = fs.readdirSync(baseSrcDir);
            for (const file of files) {

                // Dateien für ausgeschlossene Silos überspringen
                if (BASE_LANG_ONLY_FILES.includes(file)) {
                    console.log(` ⏭️  Überspringe (nur Basissprache): ${file}`);
                    continue;
                }

                console.log(` 📝 KI übersetzt Datei: ${file}...`);
                const content = fs.readFileSync(path.join(baseSrcDir, file), 'utf8');
                const isJson = file.endsWith('.json');
                
                const translated = await translateWithGPT(content, lang, isJson);
                fs.writeFileSync(path.join(targetSrcDir, file), translated, 'utf8');
            }
            console.log(`✅ KI-Übersetzung für [${lang}] erfolgreich im Ordner "src/${lang}" gespeichert!\n`);
        } else {
            console.log(`⏭️  Ordner "src/${lang}" existiert bereits. Überspringe KI-Übersetzung.`);
        }
    }
}

// --- HILFSFUNKTION FÜR CROSS-LINKING ---
function generateCrossLinks(allItems, currentItem, urlGenerator, nameGenerator, maxLinks = 5) {
    let otherItems = allItems.filter(item => item.slug !== currentItem.slug);
    for (let i = otherItems.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [otherItems[i], otherItems[j]] = [otherItems[j], otherItems[i]];
    }
    const selectedItems = otherItems.slice(0, maxLinks);
    
    let html = '';
    selectedItems.forEach(item => {
        html += `<a href="${urlGenerator(item)}">${nameGenerator(item)}</a>\n`;
    });
    return html;
}

// =====================================================================
// 4. HAUPT-BUILD ENGINE
// =====================================================================
async function buildEngine() {
    // Zuerst prüfen, ob wir Quelldateien per KI übersetzen müssen
    await checkAndTranslateSources();

    // Alle aktiven Sprachen (z.B. ['de', 'es'])
    const allLangs = [CONFIG.baseLang, ...CONFIG.targetLangs];

    // Hauptordner "docs" sicherstellen
    const baseOutputDir = path.join(__dirname, 'docs');
    if (!fs.existsSync(baseOutputDir)) fs.mkdirSync(baseOutputDir);

    // Jetzt loopen wir durch jede Sprache!
    allLangs.forEach(lang => {
        const currentSrcDir = path.join(__dirname, 'src', lang);
        const outputDir = path.join(__dirname, 'docs', lang);

        if (!fs.existsSync(currentSrcDir)) {
            console.warn(`⚠️ Quellordner "src/${lang}" existiert nicht. Überspringe Sprache.`);
            return;
        }

        // Zielordner für die Sprache erstellen (z.B. docs/de oder docs/es)
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        console.log(`🌍 Generiere HTML-Seiten für Sprache: [${lang.toUpperCase()}]`);

        // Lokale Hilfsfunktion zum Laden der Templates aus dem jeweiligen Sprachordner
        const loadTemplate = (name) => fs.readFileSync(path.join(currentSrcDir, name), 'utf8');
        const readJson = (name) => JSON.parse(fs.readFileSync(path.join(currentSrcDir, name), 'utf8'));

        // =====================================================================
        // SILO 1: FLUG (Airlines) + DOT (US-Markt)
        // =====================================================================
        const airlines = readJson('airlines.json');
        
        // Diese gibt es immer
        const flugTpl = loadTemplate('flug-master.html');
        const gepaeckTpl = loadTemplate('gepaeck-master.html');
        let optFlug = "", optGepaeck = "";
        let linkFlug = "", linkGepaeck = "";

        // STEUERN (Prüfen, ob für diese Sprache aktiv)
        const generateSteuern = !isExcludedForLang('steuern', lang);
        let steuerTpl, optSteuer = "", linkSteuer = "";
        if (generateSteuern) steuerTpl = loadTemplate('steuern-master.html');

        // DOT (Prüfen, ob das Template in diesem Sprachordner existiert)
        const dotPath = path.join(currentSrcDir, 'dot-escalation.html');
        const generateDot = fs.existsSync(dotPath);
        let dotTpl, optDot = "", linkDot = "";
        if (generateDot) dotTpl = loadTemplate('dot-escalation.html');

        airlines.forEach(a => {
            // Standard: Flug & Gepäck
            let fFlug = `flugverspaetung-entschaedigung-${a.slug}.html`;
            let fGepaeck = `koffer-verloren-beschaedigt-${a.slug}.html`;

            let crossFlug = generateCrossLinks(airlines, a, item => `flugverspaetung-entschaedigung-${item.slug}.html`, item => item.name);
            let crossGepaeck = generateCrossLinks(airlines, a, item => `koffer-verloren-beschaedigt-${item.slug}.html`, item => item.name);

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
                    .replace(/\{\{PORTAL_URL\}\}/g, a.Portal_URL || '#')
                    .replace(/\{\{AIRLINE_INFOBOX\}\}/g, a.infobox || '');
            };

            // Speichere Flug & Gepäck mit SEO Inject
            let finalFlug = injectSEO(processTemplate(flugTpl, fFlug, crossFlug), lang, fFlug, 'airlines.json', a.slug, 'flug');
            fs.writeFileSync(path.join(outputDir, fFlug), finalFlug, 'utf8');

            let finalGepaeck = injectSEO(processTemplate(gepaeckTpl, fGepaeck, crossGepaeck), lang, fGepaeck, 'airlines.json', a.slug, 'gepaeck');
            fs.writeFileSync(path.join(outputDir, fGepaeck), finalGepaeck, 'utf8');
            
            let displayName = a.slug === 'andere-airline' ? (lang === 'de' ? "Andere Airline (Allgemeines Formular)" : (a.name || "Other Airline")) : a.name;
            optFlug += `<option value="${fFlug}">${displayName}</option>\n`;
            linkFlug += `<a href="${fFlug}">${displayName}</a>\n`;
            optGepaeck += `<option value="${fGepaeck}">${displayName}</option>\n`;
            linkGepaeck += `<a href="${fGepaeck}">${displayName}</a>\n`;

            // Optional: Steuern speichern (falls nicht ausgeschlossen)
            if (generateSteuern) {
                let fSteuer = `steuern-gebuehren-zurueckfordern-${a.slug}.html`;
                let crossSteuer = generateCrossLinks(airlines, a, item => `steuern-gebuehren-zurueckfordern-${item.slug}.html`, item => item.name);
                let finalSteuer = injectSEO(processTemplate(steuerTpl, fSteuer, crossSteuer), lang, fSteuer, 'airlines.json', a.slug, 'steuern');
                fs.writeFileSync(path.join(outputDir, fSteuer), finalSteuer, 'utf8');
                optSteuer += `<option value="${fSteuer}">${displayName}</option>\n`;
                linkSteuer += `<a href="${fSteuer}">${displayName}</a>\n`;
            }

            // Optional: DOT speichern (falls Template existiert)
            if (generateDot) {
                let fDot = `dot-complaint-escalation-${a.slug}.html`;
                let crossDot = generateCrossLinks(airlines, a, item => `dot-complaint-escalation-${item.slug}.html`, item => item.name);
                let finalDot = injectSEO(processTemplate(dotTpl, fDot, crossDot), lang, fDot, 'airlines.json', a.slug, 'dot');
                fs.writeFileSync(path.join(outputDir, fDot), finalDot, 'utf8');
                optDot += `<option value="${fDot}">${displayName}</option>\n`;
                linkDot += `<a href="${fDot}">${displayName}</a>\n`;
            }
        });

        // Die Hub-Seiten generieren mit SEO Inject
        let finalHubFlug = injectSEO(loadTemplate('hub-flug-master.html').replace(/\{\{AIRLINE_OPTIONS\}\}/g, optFlug).replace(/\{\{AIRLINE_LINKS\}\}/g, linkFlug), lang, 'flugverspaetung-info.html', null, null, 'flug');
        fs.writeFileSync(path.join(outputDir, 'flugverspaetung-info.html'), finalHubFlug, 'utf8');

        let finalHubGepaeck = injectSEO(loadTemplate('hub-gepaeck-master.html').replace(/\{\{GEPAECK_OPTIONS\}\}/g, optGepaeck).replace(/\{\{GEPAECK_LINKS\}\}/g, linkGepaeck), lang, 'gepaeck-info.html', null, null, 'gepaeck');
        fs.writeFileSync(path.join(outputDir, 'gepaeck-info.html'), finalHubGepaeck, 'utf8');
        
        if (generateSteuern) {
            let finalHubSteuer = injectSEO(loadTemplate('hub-steuern-master.html').replace(/\{\{STEUER_OPTIONS\}\}/g, optSteuer).replace(/\{\{STEUER_LINKS\}\}/g, linkSteuer), lang, 'steuern-info.html', null, null, 'steuern');
            fs.writeFileSync(path.join(outputDir, 'steuern-info.html'), finalHubSteuer, 'utf8');
        }

        if (generateDot && fs.existsSync(path.join(currentSrcDir, 'hub-dot-master.html'))) {
            let finalHubDot = injectSEO(loadTemplate('hub-dot-master.html').replace(/\{\{DOT_OPTIONS\}\}/g, optDot).replace(/\{\{DOT_LINKS\}\}/g, linkDot), lang, 'dot-complaints-info.html', null, null, 'dot');
            fs.writeFileSync(path.join(outputDir, 'dot-complaints-info.html'), finalHubDot, 'utf8');
        }

        // =====================================================================
        // SILO 2: HOTEL & STORNO
        // =====================================================================
        const veranstalter = readJson('veranstalter.json');
        const vermittler = readJson('vermittler.json');
        const hotelTpl = loadTemplate('hotel-master.html');
        const vermittlerTpl = loadTemplate('vermittler-master.html');
        const stornoTpl = loadTemplate('storno-master.html');

        let optHotel = "", optStorno = "";
        let linkHotel = "", linkStorno = "";

        veranstalter.forEach(v => {
            let fHotel = `hotel-reklamation-beschwerde-${v.slug}.html`;
            let fStorno = `reise-stornieren-kosten-pruefen-${v.slug}.html`;

            let crossHotel = generateCrossLinks(veranstalter, v, item => `hotel-reklamation-beschwerde-${item.slug}.html`, item => item.name);
            let crossStorno = generateCrossLinks(veranstalter, v, item => `reise-stornieren-kosten-pruefen-${item.slug}.html`, item => item.name);

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
                    .replace(/\{\{PORTAL_URL\}\}/g, v.Portal_URL || '#')
                    .replace(/\{\{VERANSTALTER_INFOBOX\}\}/g, v.infobox || '');
            };

            let finalHotel = injectSEO(processTemplate(hotelTpl, fHotel, crossHotel), lang, fHotel, 'veranstalter.json', v.slug, 'hotel');
            fs.writeFileSync(path.join(outputDir, fHotel), finalHotel, 'utf8');

            let finalStorno = injectSEO(processTemplate(stornoTpl, fStorno, crossStorno), lang, fStorno, 'veranstalter.json', v.slug, 'storno');
            fs.writeFileSync(path.join(outputDir, fStorno), finalStorno, 'utf8');
            
            let displayName = v.slug === 'anderer-veranstalter' ? (lang === 'de' ? "Anderer Veranstalter (Allgemein)" : v.name) : v.name;
            optHotel += `<option value="${fHotel}">${displayName}</option>\n`;
            linkHotel += `<a href="${fHotel}">${displayName}</a>\n`;
            optStorno += `<option value="${fStorno}">${displayName}</option>\n`;
            linkStorno += `<a href="${fStorno}">${displayName}</a>\n`;
        });

        vermittler.forEach(v => {
            let fPort = `hotel-reklamation-${v.slug}.html`;
            let fStorno = `reise-stornieren-kosten-pruefen-${v.slug}.html`;

            let crossHotelPort = generateCrossLinks(vermittler, v, item => `hotel-reklamation-${item.slug}.html`, item => item.name);
            let crossStornoPort = generateCrossLinks(vermittler, v, item => `reise-stornieren-kosten-pruefen-${item.slug}.html`, item => item.name);

            let textName = v.name;
            let inputAdresse = v.adresse;

            if (v.slug === 'anderer-vermittler') {
                textName = lang === 'de' ? "Ihrem Buchungsportal" : v.name; 
                inputAdresse = ""; 
            }

            const processTemplatePort = (tpl, fName, crossLinks) => {
                let content = tpl;
                if (v.slug === 'anderer-vermittler') {
                    const placeholderName = lang === 'de' ? "Name des Portals eintragen" : "Enter portal name";
                    const placeholderAdr = lang === 'de' ? "Bitte Adresse des Portals eintragen" : "";
                    content = content
                        .replace(/value="\{\{VERMITTLER_NAME\}\}"/g, `value="" placeholder="${placeholderName}"`)
                        .replace(/>\{\{VERMITTLER_ADRESSE\}\}</g, ` placeholder="${placeholderAdr}">${inputAdresse}<`);
                }
                return content
                    .replace(/\{\{VERMITTLER_NAME\}\}/g, textName)
                    .replace(/\{\{VERMITTLER_ADRESSE\}\}/g, inputAdresse)
                    .replace(/\{\{DATEINAME\}\}/g, fName)
                    .replace(/\{\{BELIEBTE_LINKS\}\}/g, crossLinks)
                    .replace(/\{\{PORTAL_URL\}\}/g, v.Portal_URL || '#')
                    .replace(/\{\{VERMITTLER_INFOBOX\}\}/g, v.infobox || '');
            };

            const processTemplateStorno = (tpl, fName, crossLinks) => {
                let content = tpl;
                if (v.slug === 'anderer-vermittler') {
                    const placeholderName = lang === 'de' ? "Name des Portals eintragen" : "Enter portal name";
                    const placeholderAdr = lang === 'de' ? "Bitte Adresse des Portals eintragen" : "";
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

            let finalPort = injectSEO(processTemplatePort(vermittlerTpl, fPort, crossHotelPort), lang, fPort, 'vermittler.json', v.slug, 'hotel');
            fs.writeFileSync(path.join(outputDir, fPort), finalPort, 'utf8');

            let finalStornoPort = injectSEO(processTemplateStorno(stornoTpl, fStorno, crossStornoPort), lang, fStorno, 'vermittler.json', v.slug, 'storno');
            fs.writeFileSync(path.join(outputDir, fStorno), finalStornoPort, 'utf8');
            
            let displayName = v.slug === 'anderer-vermittler' ? (lang === 'de' ? "Anderes Portal (Allgemein)" : v.name) : v.name;
            optHotel += `<option value="${fPort}">${displayName} (Portal)</option>\n`;
            linkHotel += `<a href="${fPort}">${displayName} (Portal)</a>\n`;
            optStorno += `<option value="${fStorno}">${displayName}</option>\n`;
            linkStorno += `<a href="${fStorno}">${displayName}</a>\n`;
        });

        let finalHubHotel = injectSEO(loadTemplate('hub-hotel-master.html').replace(/\{\{HOTEL_OPTIONS\}\}/g, optHotel).replace(/\{\{HOTEL_LINKS\}\}/g, linkHotel), lang, 'hotel-maengel-info.html', null, null, 'hotel');
        fs.writeFileSync(path.join(outputDir, 'hotel-maengel-info.html'), finalHubHotel, 'utf8');

        let finalHubStorno = injectSEO(loadTemplate('hub-storno-master.html').replace(/\{\{STORNO_OPTIONS\}\}/g, optStorno).replace(/\{\{STORNO_LINKS\}\}/g, linkStorno), lang, 'storno-info.html', null, null, 'storno');
        fs.writeFileSync(path.join(outputDir, 'storno-info.html'), finalHubStorno, 'utf8');

        // =====================================================================
        // SILO 3 & 4: PRE-TRAVEL & ZOLL
        // =====================================================================
        const laender = readJson('laender.json');
        const esim = readJson('esim.json');
        const mietwagen = readJson('mietwagen.json');

        let optVisa = "", optEsim = "", optMiet = "", optZoll = "";
        let linkVisa = "", linkEsim = "", linkMiet = "", linkZoll = "";

        laender.forEach(l => {
            let f = `einreisebestimmungen-${l.slug}.html`;
            let crossVisa = generateCrossLinks(laender, l, item => `einreisebestimmungen-${item.slug}.html`, item => item.name);
            let contentVisa = loadTemplate('visum-master.html').replace(/\{\{LAND_NAME\}\}/g, l.name).replace(/\{\{VISUM_STATUS\}\}/g, l.visum_status).replace(/\{\{PASS_MONATE\}\}/g, l.pass_monate).replace(/\{\{VISUM_TEXT\}\}/g, l.visum_text).replace(/\{\{AFFILIATE_HINWEIS\}\}/g, l.affiliate_hinweis).replace(/\{\{DATEINAME\}\}/g, f).replace(/\{\{BELIEBTE_LINKS\}\}/g, crossVisa);
            contentVisa = injectSEO(contentVisa, lang, f, 'laender.json', l.slug, 'visum');
            fs.writeFileSync(path.join(outputDir, f), contentVisa, 'utf8');
            optVisa += `<option value="${f}">${l.name}</option>\n`;
            linkVisa += `<a href="${f}">${l.name}</a>\n`;
        });

        esim.forEach(e => {
            let f = `internet-roaming-kosten-${e.slug}.html`;
            let crossEsim = generateCrossLinks(esim, e, item => `internet-roaming-kosten-${item.slug}.html`, item => item.name);
            let contentEsim = loadTemplate('esim-master.html').replace(/\{\{LAND_NAME\}\}/g, e.name).replace(/\{\{ROAMING_KOSTEN\}\}/g, e.roaming_kosten).replace(/\{\{ESIM_PREIS\}\}/g, e.esim_preis).replace(/\{\{DATENVOLUMEN\}\}/g, e.datenvolumen).replace(/\{\{AFFILIATE_LINK\}\}/g, e.affiliate_link).replace(/\{\{DATEINAME\}\}/g, f).replace(/\{\{BELIEBTE_LINKS\}\}/g, crossEsim);
            contentEsim = injectSEO(contentEsim, lang, f, 'esim.json', e.slug, 'esim');
            fs.writeFileSync(path.join(outputDir, f), contentEsim, 'utf8');
            optEsim += `<option value="${f}">${e.name}</option>\n`;
            linkEsim += `<a href="${f}">${e.name}</a>\n`;
        });

        mietwagen.forEach(m => {
            let f = `mietwagen-versicherungen-${m.slug}.html`;
            let crossMiet = generateCrossLinks(mietwagen, m, item => `mietwagen-versicherungen-${item.slug}.html`, item => item.name);
            let contentMiet = loadTemplate('mietwagen-master.html').replace(/\{\{MIETWAGEN_NAME\}\}/g, m.name).replace(/\{\{SCHALTER_TAKTIK\}\}/g, m.schalter_taktik).replace(/\{\{KAUTION_HINWEIS\}\}/g, m.kaution_hinweis).replace(/\{\{DATEINAME\}\}/g, f).replace(/\{\{BELIEBTE_LINKS\}\}/g, crossMiet);
            contentMiet = injectSEO(contentMiet, lang, f, 'mietwagen.json', m.slug, 'mietwagen');
            fs.writeFileSync(path.join(outputDir, f), contentMiet, 'utf8');
            optMiet += `<option value="${f}">${m.name}</option>\n`;
            linkMiet += `<a href="${f}">${m.name}</a>\n`;
        });

        let finalHubVisa = injectSEO(loadTemplate('hub-einreise-master.html').replace(/\{\{VISA_OPTIONS\}\}/g, optVisa).replace(/\{\{VISA_LINKS\}\}/g, linkVisa), lang, 'einreise-info.html', null, null, 'visum');
        fs.writeFileSync(path.join(outputDir, 'einreise-info.html'), finalHubVisa, 'utf8');

        let finalHubEsim = injectSEO(loadTemplate('hub-esim-master.html').replace(/\{\{ESIM_OPTIONS\}\}/g, optEsim).replace(/\{\{ESIM_LINKS\}\}/g, linkEsim), lang, 'esim-roaming-info.html', null, null, 'esim');
        fs.writeFileSync(path.join(outputDir, 'esim-roaming-info.html'), finalHubEsim, 'utf8');

        let finalHubMiet = injectSEO(loadTemplate('hub-mietwagen-master.html').replace(/\{\{MIETWAGEN_OPTIONS\}\}/g, optMiet).replace(/\{\{MIETWAGEN_LINKS\}\}/g, linkMiet), lang, 'mietwagen-info.html', null, null, 'mietwagen');
        fs.writeFileSync(path.join(outputDir, 'mietwagen-info.html'), finalHubMiet, 'utf8');

        // ---- ZOLL: Nur für Basissprache ----
        if (!isExcludedForLang('zoll', lang)) {
            const zoll = readJson('zoll.json');
            zoll.forEach(z => {
                let f = `zoll-strafe-beschlagnahmt-${z.slug}.html`;
                let crossZoll = generateCrossLinks(zoll, z, item => `zoll-strafe-beschlagnahmt-${item.slug}.html`, item => item.artikel);
                let contentZoll = loadTemplate('zoll-master.html').replace(/\{\{ARTIKEL\}\}/g, z.artikel).replace(/\{\{PROBLEM\}\}/g, z.problem).replace(/\{\{DATEINAME\}\}/g, f).replace(/\{\{BELIEBTE_LINKS\}\}/g, crossZoll);
                contentZoll = injectSEO(contentZoll, lang, f, 'zoll.json', z.slug, 'zoll');
                fs.writeFileSync(path.join(outputDir, f), contentZoll, 'utf8');
                optZoll += `<option value="${f}">${z.artikel}</option>\n`;
                linkZoll += `<a href="${f}">${z.artikel}</a>\n`;
            });
            let finalHubZoll = injectSEO(loadTemplate('hub-zoll-master.html').replace(/\{\{ZOLL_OPTIONS\}\}/g, optZoll).replace(/\{\{ZOLL_LINKS\}\}/g, linkZoll), lang, 'zoll-info.html', null, null, 'zoll');
            fs.writeFileSync(path.join(outputDir, 'zoll-info.html'), finalHubZoll, 'utf8');
        } else {
            console.log(`   ⏭️  Silo [Zoll] wird für [${lang.toUpperCase()}] übersprungen (kein EU-Recht).`);
        }

        // =====================================================================
        // SILO 5: BAHN
        // =====================================================================
        if (!isExcludedForLang('bahn', lang)) {
            const bahnAnbieter = readJson('bahn.json');
            const bahnTpl = loadTemplate('bahn-master.html');

            let optBahn = "", linkBahn = "";

            bahnAnbieter.forEach(b => {
                let fBahn = `zugverspaetung-entschaedigung-${b.slug}.html`;
                let crossBahn = generateCrossLinks(bahnAnbieter, b, item => `zugverspaetung-entschaedigung-${item.slug}.html`, item => item.name);

                let content = bahnTpl
                    .replace(/\{\{BAHN_NAME\}\}/g, b.name)
                    .replace(/\{\{BAHN_ADRESSE\}\}/g, b.adresse)
                    .replace(/\{\{DATEINAME\}\}/g, fBahn)
                    .replace(/\{\{BELIEBTE_LINKS\}\}/g, crossBahn)
                    .replace(/\{\{PORTAL_URL\}\}/g, b.Portal_URL || '#')
                    .replace(/\{\{BAHN_INFOBOX\}\}/g, b.infobox || '');

                content = injectSEO(content, lang, fBahn, 'bahn.json', b.slug, 'bahn');
                fs.writeFileSync(path.join(outputDir, fBahn), content, 'utf8');
                optBahn += `<option value="${fBahn}">${b.name}</option>\n`;
                linkBahn += `<a href="${fBahn}">${b.name}</a>\n`;
            });

            let finalHubBahn = injectSEO(loadTemplate('hub-bahn-master.html').replace(/\{\{BAHN_OPTIONS\}\}/g, optBahn).replace(/\{\{BAHN_LINKS\}\}/g, linkBahn), lang, 'zugverspaetung-info.html', null, null, 'bahn');
            fs.writeFileSync(path.join(outputDir, 'zugverspaetung-info.html'), finalHubBahn, 'utf8');
        } else {
            console.log(`   ⏭️  Silo [Bahn] wird für [${lang.toUpperCase()}] übersprungen.`);
        }

        // =====================================================================
        // SILO 6: OTA — Nur für Basissprache
        // =====================================================================
        if (!isExcludedForLang('ota', lang)) {
            const otaVermittler = readJson('vermittler-ota.json');
            const otaTpl = loadTemplate('ota-vermittler-master.html');

            let optOta = "", linkOta = "";

            otaVermittler.forEach(v => {
                let fOta = `rueckerstattung-flug-portal-${v.slug}.html`;
                let crossOta = generateCrossLinks(otaVermittler, v, item => `rueckerstattung-flug-portal-${item.slug}.html`, item => item.name);

                let textName = v.name;
                let inputAdresse = v.adresse;

                if (v.slug === 'allgemein') {
                    textName = lang === 'de' ? "Ihrem Buchungsportal" : v.name;
                    inputAdresse = "";
                }

                const processTemplateOta = (tpl, fName, crossLinks) => {
                    let content = tpl;
                    if (v.slug === 'allgemein') {
                        const placeholderName = lang === 'de' ? "Name des Portals eintragen" : "Enter portal name";
                        const placeholderAdr = lang === 'de' ? "Bitte Adresse des Portals eintragen" : "";
                        content = content
                            .replace(/value="\{\{VERMITTLER_NAME\}\}"/g, `value="" placeholder="${placeholderName}"`)
                            .replace(/>\{\{VERMITTLER_ADRESSE\}\}</g, ` placeholder="${placeholderAdr}">${inputAdresse}<`);
                    }
                    return content
                        .replace(/\{\{VERMITTLER_NAME\}\}/g, textName)
                        .replace(/\{\{VERMITTLER_ADRESSE\}\}/g, inputAdresse)
                        .replace(/\{\{DATEINAME\}\}/g, fName)
                        .replace(/\{\{BELIEBTE_LINKS\}\}/g, crossLinks)
                        .replace(/\{\{PORTAL_URL\}\}/g, v.Portal_URL || '#')
                        .replace(/\{\{VERMITTLER_INFOBOX\}\}/g, v.infobox || '');
                };

                let finalOta = injectSEO(processTemplateOta(otaTpl, fOta, crossOta), lang, fOta, 'vermittler-ota.json', v.slug, 'ota');
                fs.writeFileSync(path.join(outputDir, fOta), finalOta, 'utf8');
                optOta += `<option value="${fOta}">${v.name}</option>\n`;
                linkOta += `<a href="${fOta}">${v.name}</a>\n`;
            });

            let finalHubOta = injectSEO(loadTemplate('hub-ota-master.html').replace(/\{\{OTA_OPTIONS\}\}/g, optOta).replace(/\{\{OTA_LINKS\}\}/g, linkOta), lang, 'ota-rueckerstattung-info.html', null, null, 'ota');
            fs.writeFileSync(path.join(outputDir, 'ota-rueckerstattung-info.html'), finalHubOta, 'utf8');
        } else {
            console.log(`   ⏭️  Silo [OTA] wird für [${lang.toUpperCase()}] übersprungen (kein EU-Recht).`);
        }

        // =====================================================================
        // SILO 7: KREUZFAHRTEN
        // =====================================================================
        const kreuzfahrten = readJson('kreuzfahrten.json');
        const kreuzfahrtTpl = loadTemplate('kreuzfahrt-master.html');

        let optCruise = "", linkCruise = "";

        kreuzfahrten.forEach(c => {
            let fCruise = `kreuzfahrt-maengel-minderung-${c.slug}.html`;
            let crossCruise = generateCrossLinks(kreuzfahrten, c, item => `kreuzfahrt-maengel-minderung-${item.slug}.html`, item => item.name);

            let textName = c.name;
            let inputAdresse = c.adresse;

            if (c.slug === 'allgemein') {
                textName = lang === 'de' ? "Ihrer Reederei" : c.name;
                inputAdresse = "";
            }

            const processTemplateCruise = (tpl, fName, crossLinks) => {
                let content = tpl;
                if (c.slug === 'allgemein') {
                    const placeholderName = lang === 'de' ? "Name der Reederei eintragen" : "Enter cruise line name";
                    const placeholderAdr = lang === 'de' ? "Bitte Adresse der Reederei eintragen" : "";
                    content = content
                        .replace(/value="\{\{CRUISE_LINE\}\}"/g, `value="" placeholder="${placeholderName}"`)
                        .replace(/>\{\{CRUISE_ADRESSE\}\}</g, ` placeholder="${placeholderAdr}">${inputAdresse}<`);
                }
                return content
                    .replace(/\{\{CRUISE_LINE\}\}/g, textName)
                    .replace(/\{\{CRUISE_ADRESSE\}\}/g, inputAdresse)
                    .replace(/\{\{DATEINAME\}\}/g, fName)
                    .replace(/\{\{BELIEBTE_LINKS\}\}/g, crossLinks)
                    .replace(/\{\{PORTAL_URL\}\}/g, c.Portal_URL || '#')
                    .replace(/\{\{CRUISE_INFOBOX\}\}/g, c.infobox || '');
            };

            let finalCruise = injectSEO(processTemplateCruise(kreuzfahrtTpl, fCruise, crossCruise), lang, fCruise, 'kreuzfahrten.json', c.slug, 'kreuzfahrt');
            fs.writeFileSync(path.join(outputDir, fCruise), finalCruise, 'utf8');
            optCruise += `<option value="${fCruise}">${c.name}</option>\n`;
            linkCruise += `<a href="${fCruise}">${c.name}</a>\n`;
        });

        let finalHubCruise = injectSEO(loadTemplate('hub-kreuzfahrt-master.html').replace(/\{\{CRUISE_OPTIONS\}\}/g, optCruise).replace(/\{\{CRUISE_LINKS\}\}/g, linkCruise), lang, 'kreuzfahrt-minderung.html', null, null, 'kreuzfahrt');
        fs.writeFileSync(path.join(outputDir, 'kreuzfahrt-minderung.html'), finalHubCruise, 'utf8');

        // =====================================================================
        // SILO 8: FERIENHÄUSER
        // =====================================================================
        if (!isExcludedForLang('ferienhaus', lang)) {
            const fewoAnbieter = readJson('ferienhaus.json');
            const fewoTpl = loadTemplate('ferienhaus-master.html');

            let optFewo = "", linkFewo = "";

            fewoAnbieter.forEach(f => {
                let fFileName = `ferienhaus-reklamation-beschwerde-${f.slug}.html`;
                let crossFewo = generateCrossLinks(fewoAnbieter, f, item => `ferienhaus-reklamation-beschwerde-${item.slug}.html`, item => item.name);

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

                let content = fewoTpl
                    .replace(/\{\{ANBIETER_NAME\}\} Beschwerde/g, titleName) 
                    .replace(/value="\{\{ANBIETER_NAME\}\}"/g, `value="${inputValue}" placeholder="${finalPlaceholderName}"`) 
                    .replace(/>\{\{ANBIETER_ADRESSE\}\}</g, ` placeholder="${finalPlaceholderAdr}">${inputAdresse}<`) 
                    .replace(/\{\{ANBIETER_NAME\}\}/g, textName) 
                    .replace(/\{\{DATEINAME\}\}/g, fFileName)
                    .replace(/\{\{BELIEBTE_LINKS\}\}/g, crossFewo)
                    .replace(/\{\{PORTAL_URL\}\}/g, f.Portal_URL || '#')
                    .replace(/\{\{ANBIETER_INFOBOX\}\}/g, f.infobox || '');

                content = injectSEO(content, lang, fFileName, 'ferienhaus.json', f.slug, 'ferienhaus');
                fs.writeFileSync(path.join(outputDir, fFileName), content, 'utf8');
                optFewo += `<option value="${fFileName}">${f.name}</option>\n`;
                linkFewo += `<a href="${fFileName}">${f.name}</a>\n`;
            });

            let finalHubFewo = injectSEO(loadTemplate('hub-ferienhaus-master.html').replace(/\{\{FEWO_OPTIONS\}\}/g, optFewo).replace(/\{\{FEWO_LINKS\}\}/g, linkFewo), lang, 'ferienhaus-maengel-info.html', null, null, 'ferienhaus');
            fs.writeFileSync(path.join(outputDir, 'ferienhaus-maengel-info.html'), finalHubFewo, 'utf8');
        } else {
            console.log(`   ⏭️  Silo [Ferienhaus] wird für [${lang.toUpperCase()}] übersprungen.`);
        }

        // =====================================================================
        // SILO 9: AIRBNB
        // =====================================================================
        const airbnbThemen = readJson('airbnb.json');
        const airbnbTpl = loadTemplate('airbnb-master.html');

        let optAirbnb = "", linkAirbnb = "";

        airbnbThemen.forEach(a => {
            let fAirbnb = `airbnb-beschwerde-${a.slug}.html`;
            let crossAirbnb = generateCrossLinks(airbnbThemen, a, item => `airbnb-beschwerde-${item.slug}.html`, item => item.name);

            let content = airbnbTpl
                .replace(/\{\{PROBLEM_KATEGORIE\}\}/g, a.name)
                .replace(/\{\{MANGEL_BESCHREIBUNG\}\}/g, a.beschreibung) 
                .replace(/\{\{DATEINAME\}\}/g, fAirbnb)
                .replace(/\{\{PORTAL_URL\}\}/g, a.Portal_URL || '#')
                .replace(/\{\{BELIEBTE_LINKS\}\}/g, crossAirbnb);

            content = injectSEO(content, lang, fAirbnb, 'airbnb.json', a.slug, 'airbnb');
            fs.writeFileSync(path.join(outputDir, fAirbnb), content, 'utf8');
            optAirbnb += `<option value="${fAirbnb}">${a.name}</option>\n`;
            linkAirbnb += `<a href="${fAirbnb}">${a.name}</a>\n`;
        });

        let finalHubAirbnb = injectSEO(loadTemplate('hub-airbnb-master.html').replace(/\{\{AIRBNB_OPTIONS\}\}/g, optAirbnb).replace(/\{\{AIRBNB_LINKS\}\}/g, linkAirbnb), lang, 'airbnb-probleme-info.html', null, null, 'airbnb');
        fs.writeFileSync(path.join(outputDir, 'airbnb-probleme-info.html'), finalHubAirbnb, 'utf8');

        // =====================================================================
        // SILO 10: FLUGHAFEN-PARKEN — Nur für Basissprache
        // =====================================================================
        if (!isExcludedForLang('flughafen-parken', lang)) {
            const flughaefen = readJson('flughafen.json');
            const flughafenTpl = loadTemplate('flughafen-parken-master.html');

            let optFlughafen = "", linkFlughafen = "";

            flughaefen.forEach(f => {
                let fFileName = `parken-flughafen-${f.slug}.html`;
                let crossFlughafen = generateCrossLinks(flughaefen, f, item => `parken-flughafen-${item.slug}.html`, item => item.name);

                let terminalPreis14 = f.terminal_preis_14 || "280 €";
                let alternativePreisStart = f.alternative_preis_start || "60 €";
                let affiliateLink = f.affiliate_link || "https://www.parkos.de/"; 
                let terminalRate = f.terminal_rate_per_day || 22.00;
                let alternativeRate = f.alternative_rate_per_day || 5.00;

                let content = flughafenTpl
                    .replace(/\{\{FLUGHAFEN_NAME\}\}/g, f.name)
                    .replace(/\{\{FLUGHAFEN_KUERZEL\}\}/g, f.kuerzel)
                    .replace(/\{\{TERMINAL_PREIS_14_TAGE\}\}/g, terminalPreis14)
                    .replace(/\{\{ALTERNATIVE_PREIS_START\}\}/g, alternativePreisStart)
                    .replace(/\{\{AFFILIATE_LINK\}\}/g, affiliateLink)
                    .replace(/\{\{DATEINAME\}\}/g, fFileName)
                    .replace(/\{\{BELIEBTE_LINKS\}\}/g, crossFlughafen)
                    .replace(/\{\{TERMINAL_RATE_PER_DAY\}\}/g, terminalRate)
                    .replace(/\{\{ALTERNATIVE_RATE_PER_DAY\}\}/g, alternativeRate);

                content = injectSEO(content, lang, fFileName, 'flughafen.json', f.slug, 'flughafen-parken');
                fs.writeFileSync(path.join(outputDir, fFileName), content, 'utf8');
                optFlughafen += `<option value="${fFileName}">${f.name} (${f.kuerzel})</option>\n`;
                linkFlughafen += `<a href="${fFileName}">${f.name} (${f.kuerzel})</a>\n`;
            });

            if (fs.existsSync(path.join(currentSrcDir, 'hub-flughafen-parken-master.html'))) {
                let finalHubFlughafen = injectSEO(loadTemplate('hub-flughafen-parken-master.html').replace(/\{\{FLUGHAFEN_OPTIONS\}\}/g, optFlughafen).replace(/\{\{FLUGHAFEN_LINKS\}\}/g, linkFlughafen), lang, 'flughafen-parken-info.html', null, null, 'flughafen-parken');
                fs.writeFileSync(path.join(outputDir, 'flughafen-parken-info.html'), finalHubFlughafen, 'utf8');
            }
        } else {
            console.log(`   ⏭️  Silo [Flughafen-Parken] wird für [${lang.toUpperCase()}] übersprungen (DE-spezifisch).`);
        }

        // =====================================================================
        // SILO 11: REISEKREDITKARTEN
        // =====================================================================
        const waehrungsLaender = readJson('fremdwaehrung.json');
        const kreditkartenTpl = loadTemplate('reisekreditkarte-master.html');

        let optKredit = "", linkKredit = "";

        waehrungsLaender.forEach(w => {
            let fFileName = `geld-abheben-bezahlen-${w.slug}.html`;
            let crossKredit = generateCrossLinks(waehrungsLaender, w, item => `geld-abheben-bezahlen-${item.slug}.html`, item => item.name);
            let affiliateLink = w.affiliate_link || "https://dein-standard-affiliate-link.de";

            let content = kreditkartenTpl
                .replace(/\{\{LAND_NAME\}\}/g, w.name)
                .replace(/\{\{WAEHRUNG\}\}/g, w.waehrung)
                .replace(/\{\{AFFILIATE_LINK\}\}/g, affiliateLink)
                .replace(/\{\{DATEINAME\}\}/g, fFileName)
                .replace(/\{\{BELIEBTE_LINKS\}\}/g, crossKredit);

            content = injectSEO(content, lang, fFileName, 'fremdwaehrung.json', w.slug, 'reisekreditkarte');
            fs.writeFileSync(path.join(outputDir, fFileName), content, 'utf8');
            optKredit += `<option value="${fFileName}">${w.name} (${w.waehrung})</option>\n`;
            linkKredit += `<a href="${fFileName}">${w.name}</a>\n`;
        });

        if (fs.existsSync(path.join(currentSrcDir, 'hub-reisekreditkarten-master.html'))) {
            let finalHubKredit = injectSEO(loadTemplate('hub-reisekreditkarten-master.html').replace(/\{\{KREDIT_OPTIONS\}\}/g, optKredit).replace(/\{\{KREDIT_LINKS\}\}/g, linkKredit), lang, 'reisekreditkarten-info.html', null, null, 'reisekreditkarte');
            fs.writeFileSync(path.join(outputDir, 'reisekreditkarten-info.html'), finalHubKredit, 'utf8');
        }
   

// =====================================================================
        // SILO 12: CHARGEBACK GENERATOR (z.B. für en-us)
        // =====================================================================
        const chargebackJsonPath = path.join(currentSrcDir, 'chargeback.json');
        
        if (fs.existsSync(chargebackJsonPath)) {
            const chargebackMerchants = readJson('chargeback.json');
            const chargebackTpl = loadTemplate('chargeback-generator.html');

            let optCharge = "", linkCharge = "";

            chargebackMerchants.forEach(c => {
                let fCharge = `credit-card-chargeback-${c.slug}.html`; 
                let crossCharge = generateCrossLinks(chargebackMerchants, c, item => `credit-card-chargeback-${item.slug}.html`, item => item.name);

                let content = chargebackTpl
                    .replace(/\{\{MERCHANT_NAME\}\}/g, c.name) 
                    .replace(/\{\{MERCHANT_INFOBOX\}\}/g, c.infobox || '') 
                    .replace(/\{\{DATEINAME\}\}/g, fCharge)
                    .replace(/\{\{BELIEBTE_LINKS\}\}/g, crossCharge);

                content = injectSEO(content, lang, fCharge, 'chargeback.json', c.slug, 'chargeback');
                fs.writeFileSync(path.join(outputDir, fCharge), content, 'utf8');
                optCharge += `<option value="${fCharge}">${c.name}</option>\n`;
                linkCharge += `<a href="${fCharge}">${c.name}</a>\n`;
            });

            if (fs.existsSync(path.join(currentSrcDir, 'hub-chargeback-master.html'))) {
                let finalHubChargeback = injectSEO(loadTemplate('hub-chargeback-master.html').replace(/\{\{CHARGEBACK_OPTIONS\}\}/g, optCharge).replace(/\{\{CHARGEBACK_LINKS\}\}/g, linkCharge), lang, 'chargeback-info.html', null, null, 'chargeback');
                fs.writeFileSync(path.join(outputDir, 'chargeback-info.html'), finalHubChargeback, 'utf8');
            }
        }

        

         // =====================================================================
        // SILO 13: ESKALATION (Anleitungen & Mahnungs-Generator)
        // =====================================================================
        // Prüfen, ob die json existiert (so crasht das Skript nicht, wenn du sie in manchen Sprachen noch nicht hast)
        const eskalationJsonPath = path.join(currentSrcDir, 'eskalation.json');
        
        if (fs.existsSync(eskalationJsonPath)) {
            const eskalationen = readJson('eskalation.json');
            
            // Templates laden
            const anleitungTpl = loadTemplate('anleitung-master.html');
            const mahnungTpl = loadTemplate('mahnung-master.html');
            
            let optAnleitung = "", linkAnleitung = "";
            let optMahnung = "", linkMahnung = "";

            eskalationen.forEach(e => {
                // Dateinamen definieren
                let fAnleitung = `beschwerde-anleitung-${e.slug}.html`;
                let fMahnung = `letzte-mahnung-nachdruck-${e.slug}.html`;

                // Cross-Links generieren (für das SEO-Netz am Ende der Seite)
                let crossAnleitung = generateCrossLinks(eskalationen, e, item => `beschwerde-anleitung-${item.slug}.html`, item => item.name);
                let crossMahnung = generateCrossLinks(eskalationen, e, item => `letzte-mahnung-nachdruck-${item.slug}.html`, item => item.name);

                // --- 1. Anleitung verarbeiten ---
                let contentAnleitung = anleitungTpl
                    .replace(/\{\{BRAND_NAME\}\}/g, e.name)
                    .replace(/\{\{BRAND_SLUG\}\}/g, e.slug) // Wichtig, damit der Button zur richtigen Mahnung führt!
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
                    .replace(/\{\{BELIEBTE_LINKS\}\}/g, crossAnleitung);

                // SEO Inject & Speichern
                contentAnleitung = injectSEO(contentAnleitung, lang, fAnleitung, 'eskalation.json', e.slug, 'eskalation');
                fs.writeFileSync(path.join(outputDir, fAnleitung), contentAnleitung, 'utf8');

                // --- 2. Mahnungs-Generator verarbeiten ---
                let contentMahnung = mahnungTpl
                    .replace(/\{\{BRAND_NAME\}\}/g, e.name)
                    .replace(/\{\{BRAND_TYP\}\}/g, e.typ)
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
                    .replace(/\{\{BELIEBTE_LINKS\}\}/g, crossMahnung);

                // SEO Inject & Speichern
                contentMahnung = injectSEO(contentMahnung, lang, fMahnung, 'eskalation.json', e.slug, 'eskalation');
                fs.writeFileSync(path.join(outputDir, fMahnung), contentMahnung, 'utf8');

                // Optionen für die Hub-Seiten sammeln
                optAnleitung += `<option value="${fAnleitung}">${e.name} (Anleitung)</option>\n`;
                linkAnleitung += `<a href="${fAnleitung}">${e.name}</a>\n`;
                
                optMahnung += `<option value="${fMahnung}">${e.name} (Mahnung generieren)</option>\n`;
                linkMahnung += `<a href="${fMahnung}">${e.name}</a>\n`;
            });

            // --- 3. Hub-Seiten speichern ---
            if (fs.existsSync(path.join(currentSrcDir, 'hub-anleitung-master.html'))) {
                let finalHubAnleitung = injectSEO(loadTemplate('hub-anleitung-master.html')
                    .replace(/\{\{ANLEITUNG_OPTIONS\}\}/g, optAnleitung)
                    .replace(/\{\{ANLEITUNG_LINKS\}\}/g, linkAnleitung), lang, 'beschwerde-anleitungen-info.html', null, null, 'eskalation');
                fs.writeFileSync(path.join(outputDir, 'beschwerde-anleitungen-info.html'), finalHubAnleitung, 'utf8');
            }

            if (fs.existsSync(path.join(currentSrcDir, 'hub-mahnung-master.html'))) {
                let finalHubMahnung = injectSEO(loadTemplate('hub-mahnung-master.html')
                    .replace(/\{\{MAHNUNG_OPTIONS\}\}/g, optMahnung)
                    .replace(/\{\{MAHNUNG_LINKS\}\}/g, linkMahnung), lang, 'letzte-mahnung-nachdruck-info.html', null, null, 'eskalation');
                fs.writeFileSync(path.join(outputDir, 'letzte-mahnung-nachdruck-info.html'), finalHubMahnung, 'utf8');
            }
        } else {
            console.log(`   ⏭️  Silo [Eskalation] wird für [${lang.toUpperCase()}] übersprungen (keine JSON gefunden).`);
        }
});
         console.log('\n🎉 Fertig! Alle internationalen Verzeichnisse wurden erfolgreich erzeugt.');
}

 



// Skript starten
buildEngine();
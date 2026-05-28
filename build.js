const fs = require('fs');
const path = require('path');

// =====================================================================
// 1. GLOBAL KONFIGURATION
// =====================================================================
const CONFIG = {
    baseLang: 'de',          // Wo liegen deine deutschen Originale? (src/de/)
    targetLangs: ['es', 'fr', 'it', 'nl', 'pt', 'nl-be', 'fr-be'],     // Welche Sprachen sollen generiert werden? (z.B. ['es', 'it', 'fr'])
    useAI: false,            // HIER AUF 'true' STELLEN, UM DIE KI ZU STARTEN oder false
    openaiKey: '', // HIER DEINEN API KEY EINTRAGEN

    // Silos, die NUR für die Basissprache generiert werden (kein EU-Recht / keine EU-weiten Daten)
    baseLangOnlySilos: ['ota', 'zoll', 'flughafen-parken']
};

// Hilfsfunktion: Prüft ob ein Silo für die aktuelle Sprache übersprungen werden soll
const isExcludedForLang = (siloName, lang) => {
    // AUSNAHME: OTA darf für nl und nl-be generiert werden
    if (siloName === 'ota' && ['nl', 'nl-be'].includes(lang)) {
        return false; // Nicht ausschließen!
    }
    
    // Standard-Regel für alle anderen Silos und Sprachen
    return lang !== CONFIG.baseLang && CONFIG.baseLangOnlySilos.includes(siloName);
};

console.log('🚀 Starte das internationale Hub & Spoke Build-System...\n');

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
        // SILO 1: FLUG (Airlines)
        // =====================================================================
        const airlines = readJson('airlines.json');
        const flugTpl = loadTemplate('flug-master.html');
        const steuerTpl = loadTemplate('steuern-master.html');
        const gepaeckTpl = loadTemplate('gepaeck-master.html');

        let optFlug = "", optSteuer = "", optGepaeck = "";
        let linkFlug = "", linkSteuer = "", linkGepaeck = "";

        airlines.forEach(a => {
            let fFlug = `flugverspaetung-entschaedigung-${a.slug}.html`;
            let fSteuer = `steuern-gebuehren-zurueckfordern-${a.slug}.html`;
            let fGepaeck = `koffer-verloren-beschaedigt-${a.slug}.html`;

            let crossFlug = generateCrossLinks(airlines, a, item => `flugverspaetung-entschaedigung-${item.slug}.html`, item => item.name);
            let crossSteuer = generateCrossLinks(airlines, a, item => `steuern-gebuehren-zurueckfordern-${item.slug}.html`, item => item.name);
            let crossGepaeck = generateCrossLinks(airlines, a, item => `koffer-verloren-beschaedigt-${item.slug}.html`, item => item.name);

            let textName = a.name;
            let inputAdresse = a.adresse;

            if (a.slug === 'andere-airline') {
                textName = lang === 'de' ? "Ihrer Fluggesellschaft" : (a.textName || a.name); 
                inputAdresse = ""; 
            }

            const processTemplate = (tpl, fName, crossLinks) => {
                let content = tpl;
                if (a.slug === 'andere-airline') {
                    const placeholderText = lang === 'de' ? "Name der Airline eintragen" : (a.placeholderName || "Enter airline name");
                    const addrPlaceholder = lang === 'de' ? "Bitte Adresse der Fluggesellschaft eintragen" : "";
                    content = content
                        .replace(/value="\{\{AIRLINE_NAME\}\}"/g, `value="" placeholder="${placeholderText}"`)
                        .replace(/>\{\{AIRLINE_ADRESSE\}\}</g, ` placeholder="${addrPlaceholder}">${inputAdresse}<`);
                }
                return content
                    .replace(/\{\{AIRLINE_NAME\}\}/g, textName)
                    .replace(/\{\{AIRLINE_ADRESSE\}\}/g, inputAdresse)
                    .replace(/\{\{DATEINAME\}\}/g, fName)
                    .replace(/\{\{BELIEBTE_LINKS\}\}/g, crossLinks)
                    .replace(/\{\{AIRLINE_INFOBOX\}\}/g, a.infobox || '');
            };

            fs.writeFileSync(path.join(outputDir, fFlug), processTemplate(flugTpl, fFlug, crossFlug), 'utf8');
            fs.writeFileSync(path.join(outputDir, fSteuer), processTemplate(steuerTpl, fSteuer, crossSteuer), 'utf8');
            fs.writeFileSync(path.join(outputDir, fGepaeck), processTemplate(gepaeckTpl, fGepaeck, crossGepaeck), 'utf8');
            
            let displayName = a.slug === 'andere-airline' ? (lang === 'de' ? "Andere Airline (Allgemeines Formular)" : a.name) : a.name;

            optFlug += `<option value="${fFlug}">${displayName}</option>\n`;
            linkFlug += `<a href="${fFlug}">${displayName}</a>\n`;
            optSteuer += `<option value="${fSteuer}">${displayName}</option>\n`;
            linkSteuer += `<a href="${fSteuer}">${displayName}</a>\n`;
            optGepaeck += `<option value="${fGepaeck}">${displayName}</option>\n`;
            linkGepaeck += `<a href="${fGepaeck}">${displayName}</a>\n`;
        });

        fs.writeFileSync(path.join(outputDir, 'flugverspaetung-info.html'), loadTemplate('hub-flug-master.html').replace(/\{\{AIRLINE_OPTIONS\}\}/g, optFlug).replace(/\{\{AIRLINE_LINKS\}\}/g, linkFlug), 'utf8');
        fs.writeFileSync(path.join(outputDir, 'steuern-info.html'), loadTemplate('hub-steuern-master.html').replace(/\{\{STEUER_OPTIONS\}\}/g, optSteuer).replace(/\{\{STEUER_LINKS\}\}/g, linkSteuer), 'utf8');
        fs.writeFileSync(path.join(outputDir, 'gepaeck-info.html'), loadTemplate('hub-gepaeck-master.html').replace(/\{\{GEPAECK_OPTIONS\}\}/g, optGepaeck).replace(/\{\{GEPAECK_LINKS\}\}/g, linkGepaeck), 'utf8');

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
                    .replace(/\{\{VERANSTALTER_INFOBOX\}\}/g, v.infobox || '');
            };

            fs.writeFileSync(path.join(outputDir, fHotel), processTemplate(hotelTpl, fHotel, crossHotel), 'utf8');
            fs.writeFileSync(path.join(outputDir, fStorno), processTemplate(stornoTpl, fStorno, crossStorno), 'utf8');
            
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

            fs.writeFileSync(path.join(outputDir, fPort), processTemplatePort(vermittlerTpl, fPort, crossHotelPort), 'utf8');
            fs.writeFileSync(path.join(outputDir, fStorno), processTemplateStorno(stornoTpl, fStorno, crossStornoPort), 'utf8');
            
            let displayName = v.slug === 'anderer-vermittler' ? (lang === 'de' ? "Anderes Portal (Allgemein)" : v.name) : v.name;
            optHotel += `<option value="${fPort}">${displayName} (Portal)</option>\n`;
            linkHotel += `<a href="${fPort}">${displayName} (Portal)</a>\n`;
            optStorno += `<option value="${fStorno}">${displayName}</option>\n`;
            linkStorno += `<a href="${fStorno}">${displayName}</a>\n`;
        });

        fs.writeFileSync(path.join(outputDir, 'hotel-maengel-info.html'), loadTemplate('hub-hotel-master.html').replace(/\{\{HOTEL_OPTIONS\}\}/g, optHotel).replace(/\{\{HOTEL_LINKS\}\}/g, linkHotel), 'utf8');
        fs.writeFileSync(path.join(outputDir, 'storno-info.html'), loadTemplate('hub-storno-master.html').replace(/\{\{STORNO_OPTIONS\}\}/g, optStorno).replace(/\{\{STORNO_LINKS\}\}/g, linkStorno), 'utf8');

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
            fs.writeFileSync(path.join(outputDir, f), loadTemplate('visum-master.html').replace(/\{\{LAND_NAME\}\}/g, l.name).replace(/\{\{VISUM_STATUS\}\}/g, l.visum_status).replace(/\{\{PASS_MONATE\}\}/g, l.pass_monate).replace(/\{\{VISUM_TEXT\}\}/g, l.visum_text).replace(/\{\{AFFILIATE_HINWEIS\}\}/g, l.affiliate_hinweis).replace(/\{\{DATEINAME\}\}/g, f).replace(/\{\{BELIEBTE_LINKS\}\}/g, crossVisa), 'utf8');
            optVisa += `<option value="${f}">${l.name}</option>\n`;
            linkVisa += `<a href="${f}">${l.name}</a>\n`;
        });

        esim.forEach(e => {
            let f = `internet-roaming-kosten-${e.slug}.html`;
            let crossEsim = generateCrossLinks(esim, e, item => `internet-roaming-kosten-${item.slug}.html`, item => item.name);
            fs.writeFileSync(path.join(outputDir, f), loadTemplate('esim-master.html').replace(/\{\{LAND_NAME\}\}/g, e.name).replace(/\{\{ROAMING_KOSTEN\}\}/g, e.roaming_kosten).replace(/\{\{ESIM_PREIS\}\}/g, e.esim_preis).replace(/\{\{DATENVOLUMEN\}\}/g, e.datenvolumen).replace(/\{\{AFFILIATE_LINK\}\}/g, e.affiliate_link).replace(/\{\{DATEINAME\}\}/g, f).replace(/\{\{BELIEBTE_LINKS\}\}/g, crossEsim), 'utf8');
            optEsim += `<option value="${f}">${e.name}</option>\n`;
            linkEsim += `<a href="${f}">${e.name}</a>\n`;
        });

        mietwagen.forEach(m => {
            let f = `mietwagen-versicherungen-${m.slug}.html`;
            let crossMiet = generateCrossLinks(mietwagen, m, item => `mietwagen-versicherungen-${item.slug}.html`, item => item.name);
            fs.writeFileSync(path.join(outputDir, f), loadTemplate('mietwagen-master.html').replace(/\{\{MIETWAGEN_NAME\}\}/g, m.name).replace(/\{\{SCHALTER_TAKTIK\}\}/g, m.schalter_taktik).replace(/\{\{KAUTION_HINWEIS\}\}/g, m.kaution_hinweis).replace(/\{\{DATEINAME\}\}/g, f).replace(/\{\{BELIEBTE_LINKS\}\}/g, crossMiet), 'utf8');
            optMiet += `<option value="${f}">${m.name}</option>\n`;
            linkMiet += `<a href="${f}">${m.name}</a>\n`;
        });

        fs.writeFileSync(path.join(outputDir, 'einreise-info.html'), loadTemplate('hub-einreise-master.html').replace(/\{\{VISA_OPTIONS\}\}/g, optVisa).replace(/\{\{VISA_LINKS\}\}/g, linkVisa), 'utf8');
        fs.writeFileSync(path.join(outputDir, 'esim-roaming-info.html'), loadTemplate('hub-esim-master.html').replace(/\{\{ESIM_OPTIONS\}\}/g, optEsim).replace(/\{\{ESIM_LINKS\}\}/g, linkEsim), 'utf8');
        fs.writeFileSync(path.join(outputDir, 'mietwagen-info.html'), loadTemplate('hub-mietwagen-master.html').replace(/\{\{MIETWAGEN_OPTIONS\}\}/g, optMiet).replace(/\{\{MIETWAGEN_LINKS\}\}/g, linkMiet), 'utf8');

        // ---- ZOLL: Nur für Basissprache ----
        if (!isExcludedForLang('zoll', lang)) {
            const zoll = readJson('zoll.json');
            zoll.forEach(z => {
                let f = `zoll-strafe-beschlagnahmt-${z.slug}.html`;
                let crossZoll = generateCrossLinks(zoll, z, item => `zoll-strafe-beschlagnahmt-${item.slug}.html`, item => item.artikel);
                fs.writeFileSync(path.join(outputDir, f), loadTemplate('zoll-master.html').replace(/\{\{ARTIKEL\}\}/g, z.artikel).replace(/\{\{PROBLEM\}\}/g, z.problem).replace(/\{\{DATEINAME\}\}/g, f).replace(/\{\{BELIEBTE_LINKS\}\}/g, crossZoll), 'utf8');
                optZoll += `<option value="${f}">${z.artikel}</option>\n`;
                linkZoll += `<a href="${f}">${z.artikel}</a>\n`;
            });
            fs.writeFileSync(path.join(outputDir, 'zoll-info.html'), loadTemplate('hub-zoll-master.html').replace(/\{\{ZOLL_OPTIONS\}\}/g, optZoll).replace(/\{\{ZOLL_LINKS\}\}/g, linkZoll), 'utf8');
        } else {
            console.log(`   ⏭️  Silo [Zoll] wird für [${lang.toUpperCase()}] übersprungen (kein EU-Recht).`);
        }

        // =====================================================================
        // SILO 5: BAHN
        // =====================================================================
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
                .replace(/\{\{BAHN_INFOBOX\}\}/g, b.infobox || '');

            fs.writeFileSync(path.join(outputDir, fBahn), content, 'utf8');
            optBahn += `<option value="${fBahn}">${b.name}</option>\n`;
            linkBahn += `<a href="${fBahn}">${b.name}</a>\n`;
        });

        fs.writeFileSync(path.join(outputDir, 'zugverspaetung-info.html'), loadTemplate('hub-bahn-master.html').replace(/\{\{BAHN_OPTIONS\}\}/g, optBahn).replace(/\{\{BAHN_LINKS\}\}/g, linkBahn), 'utf8');

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
                        .replace(/\{\{VERMITTLER_INFOBOX\}\}/g, v.infobox || '');
                };

                fs.writeFileSync(path.join(outputDir, fOta), processTemplateOta(otaTpl, fOta, crossOta), 'utf8');
                optOta += `<option value="${fOta}">${v.name}</option>\n`;
                linkOta += `<a href="${fOta}">${v.name}</a>\n`;
            });

            fs.writeFileSync(path.join(outputDir, 'ota-rueckerstattung-info.html'), loadTemplate('hub-ota-master.html').replace(/\{\{OTA_OPTIONS\}\}/g, optOta).replace(/\{\{OTA_LINKS\}\}/g, linkOta), 'utf8');
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
                    .replace(/\{\{CRUISE_INFOBOX\}\}/g, c.infobox || '');
            };

            fs.writeFileSync(path.join(outputDir, fCruise), processTemplateCruise(kreuzfahrtTpl, fCruise, crossCruise), 'utf8');
            optCruise += `<option value="${fCruise}">${c.name}</option>\n`;
            linkCruise += `<a href="${fCruise}">${c.name}</a>\n`;
        });

        fs.writeFileSync(path.join(outputDir, 'kreuzfahrt-minderung.html'), loadTemplate('hub-kreuzfahrt-master.html').replace(/\{\{CRUISE_OPTIONS\}\}/g, optCruise).replace(/\{\{CRUISE_LINKS\}\}/g, linkCruise), 'utf8');

        // =====================================================================
        // SILO 8: FERIENHÄUSER
        // =====================================================================
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
                .replace(/\{\{ANBIETER_INFOBOX\}\}/g, f.infobox || '');

            fs.writeFileSync(path.join(outputDir, fFileName), content, 'utf8');
            optFewo += `<option value="${fFileName}">${f.name}</option>\n`;
            linkFewo += `<a href="${fFileName}">${f.name}</a>\n`;
        });

        fs.writeFileSync(path.join(outputDir, 'ferienhaus-maengel-info.html'), loadTemplate('hub-ferienhaus-master.html').replace(/\{\{FEWO_OPTIONS\}\}/g, optFewo).replace(/\{\{FEWO_LINKS\}\}/g, linkFewo), 'utf8');

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
                .replace(/\{\{BELIEBTE_LINKS\}\}/g, crossAirbnb);

            fs.writeFileSync(path.join(outputDir, fAirbnb), content, 'utf8');
            optAirbnb += `<option value="${fAirbnb}">${a.name}</option>\n`;
            linkAirbnb += `<a href="${fAirbnb}">${a.name}</a>\n`;
        });

        fs.writeFileSync(path.join(outputDir, 'airbnb-probleme-info.html'), loadTemplate('hub-airbnb-master.html').replace(/\{\{AIRBNB_OPTIONS\}\}/g, optAirbnb).replace(/\{\{AIRBNB_LINKS\}\}/g, linkAirbnb), 'utf8');

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

                fs.writeFileSync(path.join(outputDir, fFileName), content, 'utf8');
                optFlughafen += `<option value="${fFileName}">${f.name} (${f.kuerzel})</option>\n`;
                linkFlughafen += `<a href="${fFileName}">${f.name} (${f.kuerzel})</a>\n`;
            });

            if (fs.existsSync(path.join(currentSrcDir, 'hub-flughafen-parken-master.html'))) {
                fs.writeFileSync(path.join(outputDir, 'flughafen-parken-info.html'), loadTemplate('hub-flughafen-parken-master.html').replace(/\{\{FLUGHAFEN_OPTIONS\}\}/g, optFlughafen).replace(/\{\{FLUGHAFEN_LINKS\}\}/g, linkFlughafen), 'utf8');
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

            fs.writeFileSync(path.join(outputDir, fFileName), content, 'utf8');
            optKredit += `<option value="${fFileName}">${w.name} (${w.waehrung})</option>\n`;
            linkKredit += `<a href="${fFileName}">${w.name}</a>\n`;
        });

        if (fs.existsSync(path.join(currentSrcDir, 'hub-reisekreditkarten-master.html'))) {
            fs.writeFileSync(path.join(outputDir, 'reisekreditkarten-info.html'), loadTemplate('hub-reisekreditkarten-master.html').replace(/\{\{KREDIT_OPTIONS\}\}/g, optKredit).replace(/\{\{KREDIT_LINKS\}\}/g, linkKredit), 'utf8');
        }
    });

    console.log('\n🎉 Fertig! Alle internationalen Verzeichnisse wurden erfolgreich erzeugt.');
}

// Skript starten
buildEngine();
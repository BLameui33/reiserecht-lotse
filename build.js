const fs = require('fs');
const path = require('path');

// Hauptordner erstellen
const baseOutputDir = path.join(__dirname, 'docs');
if (!fs.existsSync(baseOutputDir)) fs.mkdirSync(baseOutputDir);

// DE-Unterordner erstellen
const outputDir = path.join(__dirname, 'docs', 'de');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

console.log('🚀 Starte finale Generierung aller Hubs & Spokes...\n');

// --- HILFSFUNKTION FÜR TEMPLATES ---
const loadTemplate = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');

// --- NEUE HILFSFUNKTION FÜR CROSS-LINKING ---
// Nimmt ein Array (z.B. alle Länder) und gibt HTML-Links für 5 *andere* Elemente zurück.
function generateCrossLinks(allItems, currentItem, urlGenerator, nameGenerator, maxLinks = 5) {
    let otherItems = allItems.filter(item => item.slug !== currentItem.slug);
    // Fisher-Yates Shuffle für zufällige, aber gleichmäßige Verteilung
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
// SILO 1: FLUG (Airlines)
// =====================================================================
const airlines = JSON.parse(fs.readFileSync(path.join(__dirname, 'airlines.json'), 'utf8'));
const flugTpl = loadTemplate('flug-master.html');
const steuerTpl = loadTemplate('steuern-master.html');
const gepaeckTpl = loadTemplate('gepaeck-master.html');

let optFlug = "", optSteuer = "", optGepaeck = "";
let linkFlug = "", linkSteuer = "", linkGepaeck = ""; // NEU: Für Hub-Seite

airlines.forEach(a => {
    let fFlug = `flugverspaetung-entschaedigung-${a.slug}.html`;
    let fSteuer = `steuern-gebuehren-zurueckfordern-${a.slug}.html`;
    let fGepaeck = `koffer-verloren-beschaedigt-${a.slug}.html`;

    // Cross-Links generieren
    let crossFlug = generateCrossLinks(airlines, a, item => `flugverspaetung-entschaedigung-${item.slug}.html`, item => item.name);
    let crossSteuer = generateCrossLinks(airlines, a, item => `steuern-gebuehren-zurueckfordern-${item.slug}.html`, item => item.name);
    let crossGepaeck = generateCrossLinks(airlines, a, item => `koffer-verloren-beschaedigt-${item.slug}.html`, item => item.name);

    // Unterseiten schreiben (jetzt mit {{BELIEBTE_LINKS}})
    fs.writeFileSync(path.join(outputDir, fFlug), flugTpl.replace(/\{\{AIRLINE_NAME\}\}/g, a.name).replace(/\{\{AIRLINE_ADRESSE\}\}/g, a.adresse).replace(/\{\{DATEINAME\}\}/g, fFlug).replace(/\{\{BELIEBTE_LINKS\}\}/g, crossFlug), 'utf8');
    fs.writeFileSync(path.join(outputDir, fSteuer), steuerTpl.replace(/\{\{AIRLINE_NAME\}\}/g, a.name).replace(/\{\{AIRLINE_ADRESSE\}\}/g, a.adresse).replace(/\{\{DATEINAME\}\}/g, fSteuer).replace(/\{\{BELIEBTE_LINKS\}\}/g, crossSteuer), 'utf8');
    fs.writeFileSync(path.join(outputDir, fGepaeck), gepaeckTpl.replace(/\{\{AIRLINE_NAME\}\}/g, a.name).replace(/\{\{AIRLINE_ADRESSE\}\}/g, a.adresse).replace(/\{\{DATEINAME\}\}/g, fGepaeck).replace(/\{\{BELIEBTE_LINKS\}\}/g, crossGepaeck), 'utf8');
    
    // Dropdown & Link-Verzeichnis aufbauen
    optFlug += `<option value="${fFlug}">${a.name}</option>\n`;
    linkFlug += `<a href="${fFlug}">${a.name}</a>\n`;

    optSteuer += `<option value="${fSteuer}">${a.name}</option>\n`;
    linkSteuer += `<a href="${fSteuer}">${a.name}</a>\n`;

    optGepaeck += `<option value="${fGepaeck}">${a.name}</option>\n`;
    linkGepaeck += `<a href="${fGepaeck}">${a.name}</a>\n`;
});

// Hubs schreiben (jetzt mit {{_LINKS}})
fs.writeFileSync(path.join(outputDir, 'flugverspaetung-info.html'), loadTemplate('hub-flug-master.html').replace(/\{\{AIRLINE_OPTIONS\}\}/g, optFlug).replace(/\{\{AIRLINE_LINKS\}\}/g, linkFlug), 'utf8');
fs.writeFileSync(path.join(outputDir, 'steuern-info.html'), loadTemplate('hub-steuern-master.html').replace(/\{\{STEUER_OPTIONS\}\}/g, optSteuer).replace(/\{\{STEUER_LINKS\}\}/g, linkSteuer), 'utf8');
fs.writeFileSync(path.join(outputDir, 'gepaeck-info.html'), loadTemplate('hub-gepaeck-master.html').replace(/\{\{GEPAECK_OPTIONS\}\}/g, optGepaeck).replace(/\{\{GEPAECK_LINKS\}\}/g, linkGepaeck), 'utf8');


// =====================================================================
// SILO 2: HOTEL & STORNO (Veranstalter & Vermittler)
// =====================================================================
const veranstalter = JSON.parse(fs.readFileSync(path.join(__dirname, 'veranstalter.json'), 'utf8'));
const vermittler = JSON.parse(fs.readFileSync(path.join(__dirname, 'vermittler.json'), 'utf8'));
const hotelTpl = loadTemplate('hotel-master.html');
const vermittlerTpl = loadTemplate('vermittler-master.html');
const stornoTpl = loadTemplate('storno-master.html');

let optHotel = "", optStorno = "";
let linkHotel = "", linkStorno = ""; // NEU

veranstalter.forEach(v => {
    let fHotel = `hotel-reklamation-beschwerde-${v.slug}.html`;
    let fStorno = `reise-stornieren-kosten-pruefen-${v.slug}.html`;

    let crossHotel = generateCrossLinks(veranstalter, v, item => `hotel-reklamation-beschwerde-${item.slug}.html`, item => item.name);
    let crossStorno = generateCrossLinks(veranstalter, v, item => `reise-stornieren-kosten-pruefen-${item.slug}.html`, item => item.name);

    fs.writeFileSync(path.join(outputDir, fHotel), hotelTpl.replace(/\{\{VERANSTALTER_NAME\}\}/g, v.name).replace(/\{\{VERANSTALTER_ADRESSE\}\}/g, v.adresse).replace(/\{\{DATEINAME\}\}/g, fHotel).replace(/\{\{BELIEBTE_LINKS\}\}/g, crossHotel), 'utf8');
    fs.writeFileSync(path.join(outputDir, fStorno), stornoTpl.replace(/\{\{VERANSTALTER_NAME\}\}/g, v.name).replace(/\{\{VERANSTALTER_ADRESSE\}\}/g, v.adresse).replace(/\{\{DATEINAME\}\}/g, fStorno).replace(/\{\{BELIEBTE_LINKS\}\}/g, crossStorno), 'utf8');
    
    optHotel += `<option value="${fHotel}">${v.name}</option>\n`;
    linkHotel += `<a href="${fHotel}">${v.name}</a>\n`;

    optStorno += `<option value="${fStorno}">${v.name}</option>\n`;
    linkStorno += `<a href="${fStorno}">${v.name}</a>\n`;
});

vermittler.forEach(v => {
    let fPort = `hotel-reklamation-${v.slug}.html`;
    let fStorno = `reise-stornieren-kosten-pruefen-${v.slug}.html`;

    let crossHotelPort = generateCrossLinks(vermittler, v, item => `hotel-reklamation-${item.slug}.html`, item => item.name);
    let crossStornoPort = generateCrossLinks(vermittler, v, item => `reise-stornieren-kosten-pruefen-${item.slug}.html`, item => item.name);

    fs.writeFileSync(path.join(outputDir, fPort), vermittlerTpl.replace(/\{\{VERMITTLER_NAME\}\}/g, v.name).replace(/\{\{VERMITTLER_ADRESSE\}\}/g, v.adresse).replace(/\{\{DATEINAME\}\}/g, fPort).replace(/\{\{BELIEBTE_LINKS\}\}/g, crossHotelPort), 'utf8');
    fs.writeFileSync(path.join(outputDir, fStorno), stornoTpl.replace(/\{\{VERANSTALTER_NAME\}\}/g, v.name).replace(/\{\{VERANSTALTER_ADRESSE\}\}/g, v.adresse).replace(/\{\{DATEINAME\}\}/g, fStorno).replace(/\{\{BELIEBTE_LINKS\}\}/g, crossStornoPort), 'utf8');
    
    optHotel += `<option value="${fPort}">${v.name} (Portal)</option>\n`;
    linkHotel += `<a href="${fPort}">${v.name} (Portal)</a>\n`;
    
    optStorno += `<option value="${fStorno}">${v.name}</option>\n`;
    linkStorno += `<a href="${fStorno}">${v.name}</a>\n`;
});

fs.writeFileSync(path.join(outputDir, 'hotel-maengel-info.html'), loadTemplate('hub-hotel-master.html').replace(/\{\{HOTEL_OPTIONS\}\}/g, optHotel).replace(/\{\{HOTEL_LINKS\}\}/g, linkHotel), 'utf8');
fs.writeFileSync(path.join(outputDir, 'storno-info.html'), loadTemplate('hub-storno-master.html').replace(/\{\{STORNO_OPTIONS\}\}/g, optStorno).replace(/\{\{STORNO_LINKS\}\}/g, linkStorno), 'utf8');


// =====================================================================
// SILO 3 & 4: PRE-TRAVEL & ZOLL
// =====================================================================
const laender = JSON.parse(fs.readFileSync(path.join(__dirname, 'laender.json'), 'utf8'));
const esim = JSON.parse(fs.readFileSync(path.join(__dirname, 'esim.json'), 'utf8'));
const mietwagen = JSON.parse(fs.readFileSync(path.join(__dirname, 'mietwagen.json'), 'utf8'));
const zoll = JSON.parse(fs.readFileSync(path.join(__dirname, 'zoll.json'), 'utf8'));

let optVisa = "", optEsim = "", optMiet = "", optZoll = "";
let linkVisa = "", linkEsim = "", linkMiet = "", linkZoll = ""; // NEU

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

zoll.forEach(z => {
    let f = `zoll-strafe-beschlagnahmt-${z.slug}.html`;
    let crossZoll = generateCrossLinks(zoll, z, item => `zoll-strafe-beschlagnahmt-${item.slug}.html`, item => item.artikel);

    fs.writeFileSync(path.join(outputDir, f), loadTemplate('zoll-master.html').replace(/\{\{ARTIKEL\}\}/g, z.artikel).replace(/\{\{PROBLEM\}\}/g, z.problem).replace(/\{\{DATEINAME\}\}/g, f).replace(/\{\{BELIEBTE_LINKS\}\}/g, crossZoll), 'utf8');
    
    optZoll += `<option value="${f}">${z.artikel}</option>\n`;
    linkZoll += `<a href="${f}">${z.artikel}</a>\n`;
});

fs.writeFileSync(path.join(outputDir, 'einreise-info.html'), loadTemplate('hub-einreise-master.html').replace(/\{\{VISA_OPTIONS\}\}/g, optVisa).replace(/\{\{VISA_LINKS\}\}/g, linkVisa), 'utf8');
fs.writeFileSync(path.join(outputDir, 'esim-roaming-info.html'), loadTemplate('hub-esim-master.html').replace(/\{\{ESIM_OPTIONS\}\}/g, optEsim).replace(/\{\{ESIM_LINKS\}\}/g, linkEsim), 'utf8');
fs.writeFileSync(path.join(outputDir, 'mietwagen-info.html'), loadTemplate('hub-mietwagen-master.html').replace(/\{\{MIETWAGEN_OPTIONS\}\}/g, optMiet).replace(/\{\{MIETWAGEN_LINKS\}\}/g, linkMiet), 'utf8');
fs.writeFileSync(path.join(outputDir, 'zoll-info.html'), loadTemplate('hub-zoll-master.html').replace(/\{\{ZOLL_OPTIONS\}\}/g, optZoll).replace(/\{\{ZOLL_LINKS\}\}/g, linkZoll), 'utf8');


// =====================================================================
// SILO 5: BAHN (Zugverspätungen)
// =====================================================================
const bahnAnbieter = JSON.parse(fs.readFileSync(path.join(__dirname, 'bahn.json'), 'utf8'));
const bahnTpl = loadTemplate('bahn-master.html');

let optBahn = "";
let linkBahn = "";

bahnAnbieter.forEach(b => {
    let fBahn = `zugverspaetung-entschaedigung-${b.slug}.html`;

    // Cross-Links zu anderen Bahnanbietern generieren (SEO!)
    let crossBahn = generateCrossLinks(bahnAnbieter, b, item => `zugverspaetung-entschaedigung-${item.slug}.html`, item => item.name);

    // Seite schreiben
    let content = bahnTpl
        .replace(/\{\{BAHN_NAME\}\}/g, b.name)
        .replace(/\{\{BAHN_ADRESSE\}\}/g, b.adresse)
        .replace(/\{\{DATEINAME\}\}/g, fBahn)
        .replace(/\{\{BELIEBTE_LINKS\}\}/g, crossBahn);

    fs.writeFileSync(path.join(outputDir, fBahn), content, 'utf8');
    
    // Daten für den Hub (Übersichtsseite) sammeln
    optBahn += `<option value="${fBahn}">${b.name}</option>\n`;
    linkBahn += `<a href="${fBahn}">${b.name}</a>\n`;
});

// Hub-Seite für Bahn schreiben
fs.writeFileSync(
    path.join(outputDir, 'zugverspaetung-info.html'), 
    loadTemplate('hub-bahn-master.html')
        .replace(/\{\{BAHN_OPTIONS\}\}/g, optBahn)
        .replace(/\{\{BAHN_LINKS\}\}/g, linkBahn), 
    'utf8'
);

// =====================================================================
// SILO 6: OTA (Online Travel Agents)
// =====================================================================

const otaVermittler = JSON.parse(fs.readFileSync(path.join(__dirname, 'vermittler-ota.json'), 'utf8'));
const otaTpl = loadTemplate('ota-vermittler-master.html');

let optOta = "", linkOta = "";

otaVermittler.forEach(v => {
    let fOta = `rueckerstattung-flug-portal-${v.slug}.html`;
    let crossOta = generateCrossLinks(otaVermittler, v, item => `rueckerstattung-flug-portal-${item.slug}.html`, item => item.name);

    fs.writeFileSync(path.join(outputDir, fOta), 
        otaTpl.replace(/\{\{VERMITTLER_NAME\}\}/g, v.name)
              .replace(/\{\{VERMITTLER_ADRESSE\}\}/g, v.adresse)
              .replace(/\{\{DATEINAME\}\}/g, fOta)
              .replace(/\{\{BELIEBTE_LINKS\}\}/g, crossOta), 
        'utf8'
    );

    optOta += `<option value="${fOta}">${v.name}</option>\n`;
    linkOta += `<a href="${fOta}">${v.name}</a>\n`;
});

// Hub-Seite schreiben
fs.writeFileSync(path.join(outputDir, 'ota-rueckerstattung-info.html'), 
    loadTemplate('hub-ota-master.html')
        .replace(/\{\{OTA_OPTIONS\}\}/g, optOta)
        .replace(/\{\{OTA_LINKS\}\}/g, linkOta), 
    'utf8'
);

// =====================================================================
// SILO 7: KREUZFAHRTEN (Würzburger Tabelle)
// =====================================================================
const kreuzfahrten = JSON.parse(fs.readFileSync(path.join(__dirname, 'kreuzfahrten.json'), 'utf8'));
const kreuzfahrtTpl = loadTemplate('kreuzfahrt-master.html');

let optCruise = "";
let linkCruise = "";

kreuzfahrten.forEach(c => {
    // Spoke-Dateiname generieren
    let fCruise = `kreuzfahrt-maengel-minderung-${c.slug}.html`;

    // SEO-Cross-Links generieren
    let crossCruise = generateCrossLinks(kreuzfahrten, c, item => `kreuzfahrt-maengel-minderung-${item.slug}.html`, item => item.name);

    // Spoke-Seite schreiben
    let content = kreuzfahrtTpl
        .replace(/\{\{CRUISE_LINE\}\}/g, c.name)
        .replace(/\{\{CRUISE_ADRESSE\}\}/g, c.adresse)
        .replace(/\{\{DATEINAME\}\}/g, fCruise)
        .replace(/\{\{BELIEBTE_LINKS\}\}/g, crossCruise);

    fs.writeFileSync(path.join(outputDir, fCruise), content, 'utf8');
    
    // Daten für Hub-Seite sammeln
    optCruise += `<option value="${fCruise}">${c.name}</option>\n`;
    linkCruise += `<a href="${fCruise}">${c.name}</a>\n`;
});

// Hub-Seite schreiben (Übersicht aller Reedereien)
fs.writeFileSync(
    path.join(outputDir, 'kreuzfahrt-minderung.html'), 
    loadTemplate('hub-kreuzfahrt-master.html')
        .replace(/\{\{CRUISE_OPTIONS\}\}/g, optCruise)
        .replace(/\{\{CRUISE_LINKS\}\}/g, linkCruise), 
    'utf8'
);

// =====================================================================
// SILO 8: FERIENHÄUSER & FERIENWOHNUNGEN
// =====================================================================
const fewoAnbieter = JSON.parse(fs.readFileSync(path.join(__dirname, 'ferienhaus.json'), 'utf8'));
const fewoTpl = loadTemplate('ferienhaus-master.html');

let optFewo = "";
let linkFewo = "";

fewoAnbieter.forEach(f => {
    let fFileName = `ferienhaus-reklamation-beschwerde-${f.slug}.html`;
    let crossFewo = generateCrossLinks(fewoAnbieter, f, item => `ferienhaus-reklamation-beschwerde-${item.slug}.html`, item => item.name);

    // --- NEU: Grammatik- und Formular-Logik für "allgemein" ---
    let textName = f.name;
    let inputValue = f.name;
    let titleName = f.name + " Beschwerde";
    let inputAdresse = f.adresse;

    if (f.slug === 'allgemein') {
        textName = "Ihrem Anbieter";          // Repariert H1 und Fließtext (z.B. "bei Ihrem Anbieter")
        inputValue = "";                      // Formularfeld (Name) bleibt leer
        inputAdresse = "";                    // Formularfeld (Adresse) bleibt leer
        titleName = "Allgemeine Beschwerde";  // Repariert den <title> Tag im Header
    }

    // Spoke-Seite schreiben mit intelligentem Replace
    let content = fewoTpl
        .replace(/\{\{ANBIETER_NAME\}\} Beschwerde/g, titleName) 
        .replace(/value="\{\{ANBIETER_NAME\}\}"/g, `value="${inputValue}" placeholder="Name des Anbieters eintragen"`) 
        .replace(/>\{\{ANBIETER_ADRESSE\}\}</g, ` placeholder="${f.adresse}">${inputAdresse}<`) 
        .replace(/\{\{ANBIETER_NAME\}\}/g, textName) 
        .replace(/\{\{DATEINAME\}\}/g, fFileName)
        .replace(/\{\{BELIEBTE_LINKS\}\}/g, crossFewo);

    fs.writeFileSync(path.join(outputDir, fFileName), content, 'utf8');
    
    // Daten für Hub-Seite sammeln
    optFewo += `<option value="${fFileName}">${f.name}</option>\n`;
    linkFewo += `<a href="${fFileName}">${f.name}</a>\n`;
});

// Hub-Seite für Ferienhäuser schreiben
fs.writeFileSync(
    path.join(outputDir, 'ferienhaus-maengel-info.html'), 
    loadTemplate('hub-ferienhaus-master.html')
        .replace(/\{\{FEWO_OPTIONS\}\}/g, optFewo)
        .replace(/\{\{FEWO_LINKS\}\}/g, linkFewo), 
    'utf8'
);

// =====================================================================
// SILO 9: AIRBNB (Sonderfall Problemlösungen)
// =====================================================================
const airbnbThemen = JSON.parse(fs.readFileSync(path.join(__dirname, 'airbnb.json'), 'utf8'));
const airbnbTpl = loadTemplate('airbnb-master.html');

let optAirbnb = "";
let linkAirbnb = "";

airbnbThemen.forEach(a => {
    // Spoke-Dateiname generieren (optimiert für Suchanfragen)
    let fAirbnb = `airbnb-beschwerde-${a.slug}.html`;

    // SEO-Cross-Links generieren
    let crossAirbnb = generateCrossLinks(airbnbThemen, a, item => `airbnb-beschwerde-${item.slug}.html`, item => item.name);

    // Spoke-Seite schreiben
    let content = airbnbTpl
    .replace(/\{\{PROBLEM_KATEGORIE\}\}/g, a.name)
    .replace(/\{\{MANGEL_BESCHREIBUNG\}\}/g, a.beschreibung) 
    .replace(/\{\{DATEINAME\}\}/g, fAirbnb)
    .replace(/\{\{BELIEBTE_LINKS\}\}/g, crossAirbnb);

fs.writeFileSync(path.join(outputDir, fAirbnb), content, 'utf8');
    
    // Daten für Hub-Seite sammeln
    optAirbnb += `<option value="${fAirbnb}">${a.name}</option>\n`;
    linkAirbnb += `<a href="${fAirbnb}">${a.name}</a>\n`;
});

// Hub-Seite für Airbnb schreiben
fs.writeFileSync(
    path.join(outputDir, 'airbnb-probleme-info.html'), 
    loadTemplate('hub-airbnb-master.html')
        .replace(/\{\{AIRBNB_OPTIONS\}\}/g, optAirbnb)
        .replace(/\{\{AIRBNB_LINKS\}\}/g, linkAirbnb), 
    'utf8'
);



console.log('🎉 Fertig! Alle Hubs & Spokes wurden generiert.');
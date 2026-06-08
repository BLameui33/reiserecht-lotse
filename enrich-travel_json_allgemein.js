// ==========================================
//  Reise-Portal Master-Skript (All-in-One)
//  Multilingual & Multi-File
// ==========================================
const fs = require('fs');
const path = require('path');

// ==========================================
// 1. HIER OPENAI API-KEY EINTRAGEN
// ==========================================
const API_KEY = "";

// Definition der Ordnerstruktur und Sprachen
const folders = ['de', 'es', 'it', 'fr', 'nl', 'fr-be', 'nl-be', 'pt'];

// ALLE JSON-Dateien, die das Skript durchsuchen soll
const filesToProcess = [
    'ferienhaus.json'
 
     // <-- NEU HINZUGEFÜGT
];

// Sprach-Mapping
const languageMap = {
    'de': 'Deutsch',
    'es': 'Spanisch',
    'it': 'Italienisch',
    'fr': 'Französisch',
    'fr-be': 'Französisch',
    'nl': 'Niederländisch',
    'nl-be': 'Niederländisch',
    'pt': 'Portugiesisch'
};

const delay = ms => new Promise(res => setTimeout(res, ms));

// Dynamischer Prompt-Generator je nach Dateityp
function getPrompt(type, companyName, language, oldInfobox) {
    if (type === 'airlines') {
        return `
Du bist ein SEO-Texter und Anwalt für internationale Fluggastrechte. Schreibe einen SEO-Infobox-Text (ca. 90-110 Wörter) für die Airline "${companyName}" in der Sprache ${language}.
VORGABEN:
Alter Text zur groben Orientierung (nicht kopieren, nur als Kontext): "${oldInfobox}"
1. Erwähne das Profil der Airline und ihren Heimat-/Knotenflughafen.
2. Der Text muss auf 3 Webseiten passen: Flugverspätung, Koffer verloren, Steuern/Gebühren zurückfordern.
3. Nutze (in der Zielsprache!) die Begriffe: "EU-Fluggastrechte-Verordnung" und "Montrealer Übereinkommen".
4. Nenne den juristischen Hauptsitz/Gerichtsstand der Airline.
5. Fasse den Text in ein <p>-Tag ein.
6. Antworte AUSSCHLIESSLICH mit dem HTML-Code, kein Markdown.`;
    } 
    else if (type === 'veranstalter') {
        return `
Du bist ein SEO-Texter und Anwalt für Reiserecht. Schreibe einen SEO-Infobox-Text (ca. 90-110 Wörter) für den Reiseveranstalter "${companyName}" in der Sprache ${language}.
VORGABEN:
Alter Text zur groben Orientierung (nicht kopieren, nur als Kontext): "${oldInfobox}"
1. Erwähne kurz das Profil des Reiseveranstalters.
2. Der Text muss auf 2 Webseiten passen: Reisemängel (z.B. Hotel schlecht) UND Reiserücktritt/Stornogebühren.
3. Nutze (in der Zielsprache!) die Begriffe: "Pauschalreiserichtlinie" und beziehe dich auf typische Minderungstabellen (wie die Frankfurter Tabelle).
4. Nenne den juristischen Hauptsitz/Gerichtsstand des Veranstalters.
5. Fasse den Text in ein <p>-Tag ein.
6. Antworte AUSSCHLIESSLICH mit dem HTML-Code, kein Markdown.`;
    } 
    else if (type === 'ferienhaus') {
    return `
Du bist ein SEO-Texter und Anwalt für Reiserecht. Schreibe einen SEO-Infobox-Text (ca. 90-110 Wörter) für den Ferienhausanbieter bzw. Ferienhausvermittler "${companyName}" in der Sprache ${language}.

VORGABEN:
Alter Text zur groben Orientierung (nicht kopieren, nur als Kontext): "${oldInfobox}"

1. Erwähne kurz das Profil des Ferienhausanbieters bzw. Vermittlers.
2. Der Text muss sowohl für Seiten zu Unterkunftsmängeln (z.B. mangelhaftes Ferienhaus, fehlende Ausstattung, Sauberkeitsmängel) als auch für Stornierungen und Rücktrittskosten geeignet sein.
3. Erkläre kurz die rechtliche Einordnung als Vermittler oder Anbieter von Ferienunterkünften und mögliche Ansprüche von Kunden.
4. Beziehe dich auf typische Minderungsansprüche bei Unterkunftsmängeln und auf Stornierungsregelungen.
5. Nenne den juristischen Hauptsitz/Gerichtsstand des Unternehmens.
6. Der Text soll sachlich, juristisch korrekt und SEO-optimiert formuliert sein.
7. Fasse den Text in ein <p>-Tag ein.
8. Antworte AUSSCHLIESSLICH mit dem HTML-Code, kein Markdown.`;
}
    else if (type === 'vermittler') {
        return `
Du bist ein SEO-Texter und Anwalt für Reiserecht. Schreibe einen SEO-Infobox-Text (ca. 90-110 Wörter) für das Reiseportal / den Vermittler "${companyName}" in der Sprache ${language}.
VORGABEN:
Alter Text zur groben Orientierung (nicht kopieren, nur als Kontext): "${oldInfobox}"
1. Erwähne kurz das Profil als Vermittler/Buchungsportal (sie führen die Reise nicht selbst durch).
2. Der Text muss auf 2 Webseiten passen: Reisemängel UND Reiserücktritt/Stornogebühren.
3. Kläre kurz die rechtliche Rolle: Bei Mängeln haftet oft der Veranstalter, aber bei Stornierungen ist der Vermittler oft der erste Ansprechpartner.
4. Nenne den juristischen Hauptsitz/Gerichtsstand.
5. Fasse den Text in ein <p>-Tag ein.
6. Antworte AUSSCHLIESSLICH mit dem HTML-Code, kein Markdown.`;
    }
    else if (type === 'kreuzfahrten') {
        return `
Du bist ein SEO-Texter und Anwalt für Reiserecht. Schreibe einen SEO-Infobox-Text (ca. 90-110 Wörter) für die Kreuzfahrt-Reederei "${companyName}" in der Sprache ${language}.
VORGABEN:
Alter Text zur groben Orientierung (nicht kopieren, nur als Kontext): "${oldInfobox}"
1. Erwähne das Profil der Reederei und typische Kreuzfahrt-Routen oder Zielgebiete.
2. Der Text ist für eine Webseite zum Thema "Reisemängel auf Kreuzfahrten und Minderung".
3. Nutze (in der Zielsprache!) rechtliche Begriffe wie "Pauschalreiserecht", "Routenänderung", "Hafenausfall" oder "Schadensersatz wegen vertanen Urlaubs".
4. Nenne den juristischen Hauptsitz bzw. die europäische Vertretung der Reederei.
5. Fasse den Text in ein <p>-Tag ein.
6. Antworte AUSSCHLIESSLICH mit dem HTML-Code, kein Markdown.`;
    }
    else if (type === 'vermittler-ota') {
        return `
Du bist ein SEO-Texter und Anwalt für Reiserecht. Schreibe einen SEO-Infobox-Text (ca. 90-110 Wörter) für das Online-Reisebüro (OTA) "${companyName}" in der Sprache ${language}.
VORGABEN:
Alter Text zur groben Orientierung (nicht kopieren, nur als Kontext): "${oldInfobox}"
1. Erwähne kurz, dass es sich um eine Buchungsplattform/OTA handelt und nicht um die durchführende Airline.
2. Der Text ist für eine Webseite zum Thema "Ticketstornierung und Erstattung von Steuern/Gebühren".
3. Kläre rechtlich auf: Bei Erstattungen verweisen OTAs oft an die Airline und umgekehrt. Das OTA darf keine überzogenen eigenen Bearbeitungsgebühren für den reinen Erstattungsprozess verlangen.
4. Nenne den juristischen Hauptsitz.
5. Fasse den Text in ein <p>-Tag ein.
6. Antworte AUSSCHLIESSLICH mit dem HTML-Code, kein Markdown.`;
    }
    else if (type === 'bahn') {
        return `
Du bist ein SEO-Texter und Anwalt für Fahrgastrechte. Schreibe einen SEO-Infobox-Text (ca. 90-110 Wörter) für das Bahnunternehmen "${companyName}" in der Sprache ${language}.
VORGABEN:
Alter Text zur groben Orientierung (nicht kopieren, nur als Kontext): "${oldInfobox}"
1. Erwähne kurz das Profil des Bahnunternehmens und sein typisches Streckennetz/Einsatzland.
2. Der Text ist für eine Webseite zum Thema "Zugverspätung, Zugausfall und Entschädigung".
3. Nutze (in der Zielsprache!) rechtliche Begriffe wie "EU-Fahrgastrechte", "Verspätung ab 60 Minuten" oder "Fahrpreiserstattung". Beziehe dich auf die EU-Verordnung über die Rechte der Fahrgäste im Eisenbahnverkehr.
4. Nenne den juristischen Hauptsitz bzw. den Sitz des Kundenservice des Unternehmens.
5. Fasse den Text in ein <p>-Tag ein.
6. Antworte AUSSCHLIESSLICH mit dem HTML-Code, kein Markdown.`;
    }
}

async function generateInfobox(type, companyName, language, oldInfobox) {
    const prompt = getPrompt(type, companyName, language, oldInfobox);

    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-5.4-mini",
                messages: [
                    { role: "system", content: "Du lieferst puren HTML-Code ohne Formatierungs-Ticks (kein ```html)." },
                    { role: "user", content: prompt }
                ],
                temperature: 0.7
            })
        });

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`API Fehler: ${response.status} - ${errBody}`);
        }

        const data = await response.json();
        let text = data.choices[0].message.content.trim();
        
        text = text.replace(/^```html\s*/i, '').replace(/\s*```$/i, '');
        return text + '<!--opt-->'; 
        
    } catch (error) {
        console.error(`❌ Fehler bei ${companyName}:`, error.message);
        return null;
    }
}

async function processAll() {
    console.log('🚀 Starte KI-Generierung für das gesamte Reise-Portal...\n');

    for (const folder of folders) {
        const lang = languageMap[folder];
        
        for (const fileName of filesToProcess) {
            const type = fileName.replace('.json', ''); 
            const inputPath = path.join(__dirname, 'src', folder, fileName);
            const outputPath = path.join(__dirname, 'src', folder, fileName.replace('.json', '_optimiert.json'));

            if (!fs.existsSync(inputPath)) {
                // Überspringen, falls Datei für dieses Land nicht existiert
                continue;
            }

            console.log(`\n📂 Öffne [${folder.toUpperCase()}] -> ${fileName} (Sprache: ${lang})`);
            
           let items;
if (fs.existsSync(outputPath)) {
    console.log(`   ↩️  Fortschritt gefunden, nehme _optimiert.json als Basis...`);
    items = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
} else {
    items = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
}
const itemsOptimiert = [];

            for (let i = 0; i < items.length; i++) {
                let item = items[i];
                
                // Bereits bearbeitete Einträge ignorieren
                if (item.infobox && item.infobox.includes('<!--opt-->')) {
                    console.log(`⏭️  [${i+1}/${items.length}] ${item.name} bereits optimiert.`);
                    itemsOptimiert.push(item);
                    continue;
                }

                console.log(`⏳ [${i+1}/${items.length}] Generiere Text für: ${item.name}...`);
                
                const neueInfobox = await generateInfobox(type, item.name, lang, item.infobox);
                
                // Wir übernehmen alle vorhandenen Felder (slug, adresse, land etc.) 1:1
                const itemGesichert = {
                    ...item,
                    infobox: neueInfobox || item.infobox
                };

                itemsOptimiert.push(itemGesichert);

                fs.writeFileSync(outputPath, JSON.stringify(itemsOptimiert, null, 2), 'utf8');

                // 1 Sekunde Pause für das Rate-Limit
                await delay(1000);
            }
            console.log(`✅ ${fileName} in [${folder}] abgeschlossen!`);
        }
    }

    console.log('\n🎉 FERTIG! Alle Dateien in allen Sprachen wurden optimiert.');
    console.log('👉 Bitte benenne nun alle "_optimiert.json"-Dateien in ".json" um.');
}

processAll();
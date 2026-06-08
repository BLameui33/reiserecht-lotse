// ==========================================
//  Reise-Portal Master-Skript (Laender-Anpassung)
//  Multilingual & Multi-File - Visa & Kreditkarten
// ==========================================
const fs = require('fs');
const path = require('path');

// ==========================================
// 1. HIER OPENAI API-KEY & KREDITKARTEN-LINK EINTRAGEN
// ==========================================
const API_KEY = "";
const CREDIT_CARD_LINK = "https://www.tarifcheck.com/YKQ2R5K"; // Dein neuer Link

// Definition der Ordnerstruktur und genaue Zuordnung von Sprache + Staatsbürgerschaft
const originMap = {
    'de': { language: 'Deutsch', citizen: 'deutsche Staatsbürger (Deutschland)' },
    'es': { language: 'Spanisch', citizen: 'spanische Staatsbürger (Spanien)' },
    'it': { language: 'Italienisch', citizen: 'italienische Staatsbürger (Italien)' },
    'fr': { language: 'Französisch', citizen: 'französische Staatsbürger (Frankreich)' },
    'nl': { language: 'Niederländisch', citizen: 'niederländische Staatsbürger (Niederlande)' },
    'fr-be': { language: 'Französisch', citizen: 'belgische Staatsbürger (Belgien)' },
    'nl-be': { language: 'Niederländisch', citizen: 'belgische Staatsbürger (Belgien)' },
    'pt': { language: 'Portugiesisch', citizen: 'portugiesische Staatsbürger (Portugal)' }
};

const filesToProcess = ['laender.json'];
const delay = ms => new Promise(res => setTimeout(res, ms));

// Dynamischer Prompt-Generator für die Länder-Spezifischen Anpassungen
function getPrompt(targetCountry, origin, oldData) {
    return `
Du bist ein Experte für internationale Einreisebestimmungen und ein SEO-Copywriter.
Deine Aufgabe ist es, die Einreisebestimmungen für das Zielland "${targetCountry}" anzupassen.

WICHTIGSTE REGEL: 
Die Bestimmungen müssen speziell für **${origin.citizen}** gelten, die als Touristen einreisen! 
Recherchiere kurz (bzw. nutze dein Wissen), ob für ${origin.citizen} andere Regeln als für deutsche Staatsbürger gelten (z.B. Visumzwang, Visa on Arrival oder Visumfreiheit).

Hier sind die alten Daten zur Orientierung (beziehen sich meist auf deutsche Staatsbürger):
- Alter Visum Status: "${oldData.visum_status}"
- Alter Text: "${oldData.visum_text}"

ZUSÄTZLICHE AUFGABE (Affiliate-Wechsel):
Schreibe den Affiliate-Hinweis komplett um. Erstelle einen attraktiven Tipp für einen Kreditkarten-Vergleich, der auf Reisen im Zielland "${targetCountry}" optimiert ist (z.B. Gebühren sparen beim Geld abheben im Ausland, weltweit kostenlos bezahlen). 
Füge dort exakt diesen Link ein: ${CREDIT_CARD_LINK}

VORGABEN FÜR DIE AUSGABE:
1. Sprache: Schreibe ALLES komplett in der Sprache **${origin.language}**.
2. Der Stil soll professionell, einladend und SEO-optimiert sein.
3. Verwende im Affiliate-Hinweis passende HTML-Tags wie <strong> und <a href='...'> (Nutze im JSON bitte einfache Anführungszeichen '' für HTML-Attribute, damit das JSON valide bleibt).
4. Antworte AUSSCHLIESSLICH mit einem validen JSON-Objekt. Verwende kein Markdown (keine \`\`\`json Blöcke). 

Das JSON MUSS exakt diese Struktur haben:
{
  "visum_status": "Ein prägnanter Status-Satz",
  "visum_text": "Der ausführliche Text zu den Einreisebestimmungen",
  "affiliate_hinweis": "Der neue Kreditkarten-Tipp mit dem Link"
}
`;
}

async function generateCountryData(targetCountry, origin, oldData) {
    const prompt = getPrompt(targetCountry, origin, oldData);

    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-5.4-mini", // Auf ein existierendes, stabiles Modell angepasst
                messages: [
                    { role: "system", content: "Du bist eine API, die ausschließlich reines JSON ohne Markdown-Formatierung zurückgibt." },
                    { role: "user", content: prompt }
                ],
                temperature: 0.4
            })
        });

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`API Fehler: ${response.status} - ${errBody}`);
        }

        const data = await response.json();
        let text = data.choices[0].message.content.trim();
        
        // Eventuelle Markdown-Reste entfernen, falls die KI sich nicht dran hält
        text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
        
        return JSON.parse(text); 
        
    } catch (error) {
        console.error(`❌ Fehler bei Land ${targetCountry} (${origin.language}):`, error.message);
        return null;
    }
}

async function processAll() {
    console.log('🚀 Starte KI-Anpassung für Länder, Visa & Kreditkarten...\n');

    for (const folder of Object.keys(originMap)) {
        const origin = originMap[folder];
        
        for (const fileName of filesToProcess) {
            const inputPath = path.join(__dirname, 'src', folder, fileName);
            const outputPath = path.join(__dirname, 'src', folder, fileName.replace('.json', '_optimiert.json'));

            if (!fs.existsSync(inputPath)) {
                // Überspringen, falls das Verzeichnis oder die Datei nicht existiert
                continue;
            }

            console.log(`\n📂 Öffne [${folder.toUpperCase()}] -> ${fileName} (Zielgruppe: ${origin.citizen})`);
            
            let items;
            if (fs.existsSync(outputPath)) {
                console.log(`  ↩️  Fortschritt gefunden, nehme _optimiert.json als Basis...`);
                items = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
            } else {
                items = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
            }
            
            const itemsOptimiert = [];

            for (let i = 0; i < items.length; i++) {
                let item = items[i];
                
                // Bereits bearbeitete Einträge anhand unseres neuen Flags ignorieren
                if (item.is_optimized === true) {
                    console.log(`⏭️  [${i+1}/${items.length}] ${item.name} bereits angepasst.`);
                    itemsOptimiert.push(item);
                    continue;
                }

                console.log(`⏳ [${i+1}/${items.length}] Optimiere Regeln für: ${item.name}...`);
                
                const result = await generateCountryData(item.name, origin, item);
                
                let itemGesichert;
                if (result) {
                    itemGesichert = {
                        ...item,
                        visum_status: result.visum_status,
                        visum_text: result.visum_text,
                        affiliate_hinweis: result.affiliate_hinweis,
                        is_optimized: true // Markierung für den nächsten Durchlauf
                    };
                    console.log(`✅ Text erfolgreich generiert.`);
                } else {
                    // Fallback, falls die API fehlschlägt
                    itemGesichert = item;
                }

                itemsOptimiert.push(itemGesichert);

                // Direkt speichern, um bei Abbruch den Fortschritt zu sichern
                fs.writeFileSync(outputPath, JSON.stringify(itemsOptimiert, null, 2), 'utf8');

                // 1,5 Sekunden Pause für das Rate-Limit
                await delay(1500);
            }
            console.log(`✅ ${fileName} in [${folder}] vollständig bearbeitet!`);
        }
    }

    console.log('\n🎉 FERTIG! Alle Länderdaten wurden auf die jeweiligen Staatsbürger und Kreditkarten umgestellt.');
    console.log('👉 Bitte benenne nun alle "laender_optimiert.json"-Dateien in "laender.json" um.');
}

processAll();
// ==========================================
//  Airlines-Portal Master-Skript (Laender-Anpassung)
//  Fokus: NUR Adressen anpassen (Chain-of-Thought für LOKALE Adressen)
// ==========================================
const fs = require('fs');
const path = require('path');

// ==========================================
// 1. HIER OPENAI API-KEY EINTRAGEN
// ==========================================
const API_KEY = "Hier KEY eintragen"; // <--- Bitte hier deinen OpenAI API-Key eintragen

// Definition der Ordnerstruktur und genaue Zuordnung von Sprache + Zielland
const originMap = {
    'de': { language: 'Deutsch', country: 'Deutschland' },
    'es': { language: 'Spanisch', country: 'Spanien' },
    'it': { language: 'Italienisch', country: 'Italien' },
    'fr': { language: 'Französisch', country: 'Frankreich' },
    'nl': { language: 'Niederländisch', country: 'Niederlande' },
    'fr-be': { language: 'Französisch', country: 'Belgien' },
    'nl-be': { language: 'Niederländisch', country: 'Belgien' },
    'pt': { language: 'Portugiesisch', country: 'Portugal' }
};

const filesToProcess = ['airlines.json'];
const delay = ms => new Promise(res => setTimeout(res, ms));

// Dynamischer Prompt-Generator - MIT Chain-of-Thought für lokale Büros
function getPrompt(airlineName, origin, oldData) {
    return `
Du bist ein Experte für Luftfahrt und kennst die weltweiten Standorte, City Ticket Offices (CTO), Flughafenbüros und Landesvertretungen (GSA) der Fluggesellschaften.
Deine Aufgabe ist es, die postalische Kontaktadresse von "${airlineName}" SPEZIELL FÜR DAS LAND "${origin.country}" (Sprache: ${origin.language}) herauszufinden.

Bisherige Adresse (als Referenz): "${oldData.adresse}"

REGELN FÜR DIE SUCHE:
1. Nimm NICHT einfach den globalen Hauptsitz im Heimatland der Airline!
2. Suche gezielt nach einer Niederlassung, einem Stadtbüro (City Office) oder einem Flughafenbüro von ${airlineName} direkt in ${origin.country}.
3. Wenn es z.B. um Frankreich geht, suche nach dem Büro in Paris oder am Flughafen CDG/ORY. 
4. Nur wenn du dir zu 100% sicher bist, dass diese Airline absolut keine Vertretung in ${origin.country} hat, darfst du den globalen Hauptsitz verwenden (dann aber das Land auf ${origin.language} übersetzt).
5. Erhalte zwingend die Zeilenumbrüche mit \\n.

VORGABEN FÜR DIE AUSGABE:
Antworte AUSSCHLIESSLICH mit einem validen JSON-Objekt.
Um sicherzustellen, dass du gründlich suchst, fülle zuerst das Feld "gedankengang" aus, in dem du kurz erklärst, wo sich das Büro in ${origin.country} befindet. Danach trägst du die gefundene Adresse ins Feld "adresse" ein.

Das JSON MUSS exakt diese Struktur haben:
{
  "gedankengang": "Hat die Airline ein Büro in [Zielland]? Ja, das Büro befindet sich in... / Nein, sie haben keines, ich nutze das HQ in...",
  "adresse": "Straße\\nPLZ Ort\\nLand"
}
`;
}

async function generateAirlineData(airlineName, origin, oldData) {
    const prompt = getPrompt(airlineName, origin, oldData);

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
                    { role: "system", content: "Du bist eine API, die ausschließlich reines JSON ohne Markdown-Formatierung zurückgibt." },
                    { role: "user", content: prompt }
                ],
                // Leicht erhöhte Temperatur (0.3), damit die KI besser "nachdenken" und Assoziationen zu lokalen Büros knüpfen kann
                temperature: 0.3 
            })
        });

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`API Fehler: ${response.status} - ${errBody}`);
        }

        const data = await response.json();
        let text = data.choices[0].message.content.trim();
        
        text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
        
        return JSON.parse(text); 
        
    } catch (error) {
        console.error(`❌ Fehler bei Airline ${airlineName} (${origin.language}):`, error.message);
        return null;
    }
}

async function processAll() {
    console.log('🚀 Starte KI-Anpassung für Airlines (Fokus: LOKALE Adressen)...\n');

    for (const folder of Object.keys(originMap)) {
        const origin = originMap[folder];
        
        for (const fileName of filesToProcess) {
            const inputPath = path.join(__dirname, 'src', folder, fileName);
            const outputPath = path.join(__dirname, 'src', folder, fileName.replace('.json', '_optimiert.json'));

            if (!fs.existsSync(inputPath)) {
                continue;
            }

            console.log(`\n📂 Öffne [${folder.toUpperCase()}] -> ${fileName} (Ziel-Markt: ${origin.country})`);
            
            let items;
            if (fs.existsSync(outputPath)) {
                console.log(`  ↩️  Fortschritt gefunden, nehme _optimiert.json als Basis...`);
                items = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
            } else {
                items = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
            }
            
            const itemsOptimiert = [];

            // Um das Ganze erneut zu testen, müsstest du bei den falschen Einträgen in deiner JSON 
            // "is_optimized": false wieder entfernen oder auf false setzen, damit das Skript sie neu greift!
            for (let i = 0; i < items.length; i++) {
                let item = items[i];
                
                if (item.is_optimized === true) {
                    console.log(`⏭️  [${i+1}/${items.length}] ${item.name} bereits angepasst.`);
                    itemsOptimiert.push(item);
                    continue;
                }

                console.log(`⏳ [${i+1}/${items.length}] Suche lokales Büro für: ${item.name}...`);
                
                const result = await generateAirlineData(item.name, origin, item);
                
                let itemGesichert;
                if (result && result.adresse) {
                    console.log(`   💡 KI-Gedanke: ${result.gedankengang}`);
                    
                    itemGesichert = {
                        ...item, 
                        adresse: result.adresse, // Wir übernehmen NUR die Adresse, der Gedankengang wird verworfen
                        is_optimized: true 
                    };
                    console.log(`✅ Adresse erfolgreich aktualisiert.`);
                } else {
                    itemGesichert = item;
                }

                itemsOptimiert.push(itemGesichert);

                fs.writeFileSync(outputPath, JSON.stringify(itemsOptimiert, null, 2), 'utf8');

                await delay(1200);
            }
            console.log(`✅ ${fileName} in [${folder}] vollständig bearbeitet!`);
        }
    }

    console.log('\n🎉 FERTIG! Alle Airline-Adressen wurden überprüft.');
}

processAll();
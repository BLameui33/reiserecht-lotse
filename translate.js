const fs = require('fs');
const path = require('path');

// =====================================================================
// 1. KONFIGURATION FÜR DEN ÜBERSETZER
// =====================================================================
const CONFIG = {
    baseLang: 'de',
    // Trage hier die Sprachen ein, die du übersetzen möchtest.
    // Wenn du einen Ordner (z.B. en-gb) neu übersetzen willst, 
    // lösche ihn vorher einfach aus dem /src/ Ordner.
    targetLangs: ['en-gb'], 
    openaiKey: 'Key hier' 
};

// Dateien, die NUR für Deutschland relevant sind und gar nicht erst kopiert/übersetzt werden sollen
const BASE_LANG_ONLY_FILES = [
    'zoll.json', 'zoll-master.html', 'hub-zoll-master.html'
    
];

// =====================================================================
// 2. OPENAI API-LOGIK (Natives Fetch, funktioniert ab Node 18)
// =====================================================================
async function translateWithGPT(content, targetLang) {
    if (!CONFIG.openaiKey || CONFIG.openaiKey.startsWith('DEIN')) {
        console.error('❌ KI-Übersetzung fehlgeschlagen: Kein gültiger OpenAI Key hinterlegt!');
        process.exit(1);
    }

    let systemPrompt = "";

    if (targetLang === 'en-gb') {
        // 🇬🇧 SPEZIAL-PROMPT FÜR DEN UK-MARKT
        systemPrompt = `You are a professional legal web localizer for the UK market. Translate and adapt this HTML template into British English.
CRITICAL UK-LAW LOCALIZATION RULES:
1. Flight Law: Replace references to "EU-Fluggastrechteverordnung (EG) Nr. 261/2004" or "EU261" with "UK Regulation 261 (UK261)". Adapt compensation amounts: 250€ becomes £220, 400€ becomes £350, and 600€ becomes £520.
2. Train Delays: Replace German railway rights with the UK "Delay Repay" scheme and "National Rail Conditions of Travel".
3. Package Holidays & General Civil Law: Replace German law like "BGB" or "Reiserecht" with the "UK Consumer Rights Act 2015" and the "Package Travel and Linked Travel Arrangements Regulations 2018".
4. Compensation Tables: Replace German frameworks like "Frankfurter Tabelle" or "Würzburger Tabelle" with "industry-standard ABTA guidelines for compensation".
5. Authorities & Sources: Replace German entities (LBA, SÖP, Verbraucherzentrale) with UK equivalents like the Civil Aviation Authority (CAA), AviationADR, ABTA, or ATOL. Adapt source references at the bottom of the page to official UK sources (e.g., Gov.uk, CAA, Citizens Advice).

STRICT TECHNICAL RULES:
6. KEEP ALL TEMPLATE PLACEHOLDERS LIKE {{AIRLINE_NAME}} EXACTLY AS THEY ARE.
7. TRANSLATE HTML ATTRIBUTES: Translate text inside placeholder="...", alt="...", and title="...".
8. TRANSLATE JAVASCRIPT STRINGS: Translate human-readable text inside <script> tags (like doc.text("..."), template literals, button labels) but KEEP JS variables and syntax exactly intact.
9. UPDATE META TAGS: Change <html lang="de"> to <html lang="en-GB">.
10. DO NOT alter HTML structure, CSS classes, or JS logic.
11. DO NOT shorten, summarize, or omit anything. Output the complete HTML code exactly as provided, just translated and localized.`;
    } else {
        // 🇪🇺 STANDARD-PROMPT FÜR ANDERE EU-LÄNDER (FR, ES, IT etc.)
        systemPrompt = `You are a professional web translator. Translate the text content of this HTML template into language code "${targetLang}". 
CRITICAL RULES:
1. KEEP ALL TEMPLATE PLACEHOLDERS LIKE {{AIRLINE_NAME}} EXACTLY AS THEY ARE.
2. TRANSLATE HTML ATTRIBUTES: Translate text inside placeholder="..." , alt="..." , and title="...". DO NOT leave placeholders in German!
3. TRANSLATE JAVASCRIPT STRINGS: Translate all human-readable text strings inside the <script> tags (like doc.text("..."), template literals, button labels). Keep JS variables intact.
4. UPDATE META TAGS: Change <html lang="de"> to <html lang="${targetLang}">.
5. REPHRASE GERMAN LEGAL TERMS: 
   - German civil law (BGB, etc.): Rephrase into generic terms like "applicable consumer protection laws". Omit paragraph numbers.
   - Tables ("Würzburger Tabelle", "Frankfurter Tabelle"): Generalize into "industry-standard travel compensation guidelines".
   - Authorities (LBA, SÖP): Generalize to "national aviation authorities" or "Alternative Dispute Resolution (ADR) bodies".
6. DO NOT alter HTML structure, CSS class names, or JavaScript logic/functions.
7. DO NOT shorten or leave out any part of the file. Output the complete HTML exactly as provided.`;
    }

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CONFIG.openaiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-5.4', // Hochwertiges Modell für gute rechtliche Adaption
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: content }
                ],
                temperature: 0.1
            })
        });

        const data = await response.json();
        
        if (data.error) {
            console.error('❌ OpenAI API Fehler:', data.error.message);
            return content;
        }

        let result = data.choices[0].message.content.trim();
        result = result.replace(/^```html\s*|```$/g, ''); // Markdown bereinigen falls nötig
        return result;
    } catch (err) {
        console.error(`❌ Fehler bei der Netzwerkverbindung zu OpenAI:`, err);
        return content;
    }
}

// =====================================================================
// 3. HAUPT-SKRIPT (Kopiert JSONs unberührt, übersetzt HTML)
// =====================================================================
async function runTranslation() {
    console.log('🚀 Starte KI-Übersetzungs- & Lokalisierungstool...\n');

    const baseSrcDir = path.join(__dirname, 'src', CONFIG.baseLang);

    if (!fs.existsSync(baseSrcDir)) {
        console.error(`❌ Quell-Ordner "src/${CONFIG.baseLang}" nicht gefunden!`);
        return;
    }

    for (const lang of CONFIG.targetLangs) {
        const targetSrcDir = path.join(__dirname, 'src', lang);

        if (!fs.existsSync(targetSrcDir) || fs.readdirSync(targetSrcDir).length === 0) {
            console.log(`🤖 KI startet Arbeit für Sprache: [${lang.toUpperCase()}]...`);
            fs.mkdirSync(targetSrcDir, { recursive: true });

            const files = fs.readdirSync(baseSrcDir);
            for (const file of files) {

                // Aussortierte Dateien ignorieren
                if (BASE_LANG_ONLY_FILES.includes(file)) {
                    console.log(`   ⏭️  Überspringe DE-spezifische Datei: ${file}`);
                    continue;
                }

                // JSON-Dateien 1:1 kopieren (für manuelle Bearbeitung)
                if (file.endsWith('.json')) {
                    console.log(`   📋 Kopiere JSON (ohne Übersetzung): ${file}`);
                    fs.copyFileSync(path.join(baseSrcDir, file), path.join(targetSrcDir, file));
                    continue;
                }

                // HTML-Templates an die KI senden
                if (file.endsWith('.html')) {
                    console.log(`   📝 KI übersetzt & lokalisiert HTML: ${file}`);
                    const content = fs.readFileSync(path.join(baseSrcDir, file), 'utf8');
                    const translated = await translateWithGPT(content, lang);
                    fs.writeFileSync(path.join(targetSrcDir, file), translated, 'utf8');
                }
            }
            console.log(`✅ Ordner "src/${lang}" wurde erfolgreich erstellt und befüllt!\n`);
            console.log(`⚠️ WICHTIG: Bitte vergiss nicht, die kopierten .json Dateien im "src/${lang}" Ordner nun manuell anzupassen!\n`);
        } else {
            console.log(`⏭️  Ordner "src/${lang}" existiert bereits und ist nicht leer. Überspringe.`);
            console.log(`💡 Tipp: Wenn du ihn neu generieren willst, lösche den Ordner "src/${lang}" vorher manuell.\n`);
        }
    }
}

// Skript starten
runTranslation();
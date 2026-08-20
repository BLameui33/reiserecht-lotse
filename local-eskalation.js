const fs = require('fs');
const path = require('path');

// =====================================================================
// KONFIGURATION
// =====================================================================
const CONFIG = {
    baseLang: 'de',
    sourceFile: 'eskalation.json', // liegt in src/de/eskalation.json
    openaiKey: '',
    model: 'gpt-5.4',
    chunkSize: 10, // Anzahl Einträge pro API-Call (kleinere Blöcke = höhere Qualität pro Eintrag)

    // Zielländer/-sprachen. 'locale' = Ordnername unter src/, 'country' = Klartext für die KI.
    targetLangs: [
        { locale: 'en-gb', country: 'United Kingdom' },
        { locale: 'fr',    country: 'France' },
        { locale: 'es',    country: 'Spain' },

        { locale: 'it',    country: 'Italy' },

        { locale: 'nl',    country: 'Netherlands' },

        { locale: 'pt',    country: 'Portugal' },

        { locale: 'nl-be',    country: 'Netherlands (Belgium)' },

        { locale: 'fr-be',    country: 'France (Belgium)' },
        


        // weitere einfach ergänzen: { locale: 'at', country: 'Austria' },
    ],
};

// =====================================================================
// OPENAI-CALL
// =====================================================================
async function callOpenAI(systemPrompt, userContent) {
    if (!CONFIG.openaiKey || CONFIG.openaiKey.startsWith('DEIN') || CONFIG.openaiKey === 'Key hier') {
        console.error('❌ Kein gültiger OpenAI Key hinterlegt!');
        process.exit(1);
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${CONFIG.openaiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: CONFIG.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userContent }
            ],
            temperature: 0.2
        })
    });

    const data = await response.json();

    if (data.error) {
        console.error('❌ OpenAI API Fehler:', data.error.message);
        return null;
    }

    let result = data.choices[0].message.content.trim();
    result = result.replace(/^```(json)?\s*/i, '').replace(/```$/, '').trim();
    return result;
}

// =====================================================================
// PROMPT-BUILDER: Anbieter-Auswahl + Rechts-/Sprach-Lokalisierung
// =====================================================================
function buildSystemPrompt(target, alreadyUsedNames) {
    const alreadyUsedBlock = alreadyUsedNames.length > 0
        ? `\nPROVIDERS ALREADY USED IN THIS LOCALIZATION (from earlier batches of the same list, for ${target.country}) — DO NOT reuse any of these names again for a different entry, even if it seems like a fitting replacement, to avoid duplicates across the full list:\n${alreadyUsedNames.map(n => `- ${n}`).join('\n')}\n`
        : '';

    const legalBlock = target.locale === 'en-gb'
        ? `COUNTRY-SPECIFIC LEGAL LOCALIZATION FOR THE UK:
- Flight law: use "UK Regulation 261 (UK261)" instead of EU261. Compensation amounts: 250€→£220, 400€→£350, 600€→£520.
- Rail: use the "Delay Repay" scheme and "National Rail Conditions of Travel".
- Package holidays / general consumer law: use the "UK Consumer Rights Act 2015" and "Package Travel and Linked Travel Arrangements Regulations 2018".
- Compensation guideline tables: refer to "industry-standard ABTA guidelines for compensation" instead of "Frankfurter Tabelle".
- Dispute resolution / authorities: use UK equivalents such as the Civil Aviation Authority (CAA), AviationADR, ABTA, or ATOL as "schlichtung_name", with a real, currently correct UK website as "schlichtung_link" if you are confident of it, otherwise use https://www.caa.co.uk/ as a safe default.`
        : `COUNTRY-SPECIFIC LEGAL LOCALIZATION FOR ${target.country.toUpperCase()}:
- Replace German legal citations (BGB, EU261 wording, "Frankfurter Tabelle") with the correct locally applicable legal basis for ${target.country} where you are confident (e.g. national implementation of EU Regulation 261/2004, national package travel law, national compensation guideline concept). If unsure of an exact law name or paragraph, use a safe generic phrase in the target language instead of inventing one.
- For "schlichtung_name" / "schlichtung_link": use the real, nationally recognized consumer/travel/aviation dispute resolution body of ${target.country} if you are confident of its correct current name and URL. If not fully confident, fall back to the pan-EU Online Dispute Resolution platform (translated into the target language) with the link https://ec.europa.eu/consumers/odr/ — never invent a name or URL you are not reasonably sure is correct.`;

    return `You are a professional legal/travel web localizer. You will receive a JSON array of travel-complaint providers (airlines, railways, tour operators, booking portals, holiday-home platforms, cruise lines) originally written for the German-speaking market (Germany, Austria, Switzerland).

TASK: Produce an equivalent, fully localized JSON array for consumers in ${target.country}, written in the language matching locale "${target.locale}".

DECISION RULE PER ENTRY:
1. If the provider is genuinely relevant and well-known to consumers in ${target.country} (large international airlines actually flying there, global platforms like Booking.com, Airbnb, Expedia, Vrbo, major international cruise lines) — KEEP the same company, translate and legally localize its text fields.
2. If the provider is a Germany/DACH-only brand that residents of ${target.country} would not realistically use (e.g. a German-only tour operator, or "Deutsche Bahn" for a country outside the DACH region) — REPLACE it with the leading, most commonly used provider of the SAME category ("typ") that is actually relevant and important (high market share) for consumers in ${target.country}. Example: "Deutsche Bahn" (Bahngesellschaft) for Italy becomes "Trenitalia"; for France "SNCF"; for Spain "Renfe"; for the Netherlands "NS (Nederlandse Spoorwegen)". Apply the same logic to national tour operators and national booking portals.
3. Keep the exact same TOTAL NUMBER of entries and the same category distribution as the input — do not add or remove entries.
4. Keep the general "(allgemein)" placeholder entries (general airline / general tour operator) as generic entries — translate and localize their content but do not tie them to one specific company.
5. Update "slug" to match the new company name (lowercase, hyphenated, ASCII only, no accents/umlauts, e.g. "trenitalia", "sncf").
6. Translate the "typ" field's language into the target language.
7. Update "adresse" to the real, correct headquarters or customer-complaints address of the new/kept company if you are reasonably confident of it. If not fully confident of the exact street/number, give company name + city/country only rather than guessing.
8. Fully rewrite "faq_frage", "faq_antwort", "faq2_frage", "faq2_antwort", "faq3_frage", "faq3_antwort" and "infobox" in the target language, keeping the same STRUCTURE, similar LENGTH, TONE and LEVEL OF DETAIL as the German original, but with content and legal references that make sense for ${target.country} and for the (possibly new) company in that entry.

${legalBlock}

STRICT TECHNICAL RULES:
- Output ONLY a valid JSON array, no markdown code fences, no commentary before or after.
- Keep the exact same JSON KEYS as the input for every object. Do not add or remove keys.
- If the input objects contain a "laender" array, update it to contain "${target.locale.split('-')[0]}" (and other countries where the entry is genuinely also relevant), using lowercase ISO country codes.
- Do not omit any entry. Every input entry must have exactly one corresponding output entry in the same array position.
- Write naturally in the target language as a native legal/consumer-rights copywriter would — do not produce a literal word-for-word translation of the German wording, adapt it properly.
- NOTE: You will only receive a SUBSET (batch) of the full provider list per call, not the entire list at once. Localize only the entries given to you in this batch — do not add extras.
${alreadyUsedBlock}`;
}

// =====================================================================
// HILFSFUNKTION: Array in Blöcke á chunkSize aufteilen
// =====================================================================
function chunkArray(arr, size) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }
    return chunks;
}

// =====================================================================
// EINEN EINZELNEN BLOCK LOKALISIEREN (mit 1x Retry bei Fehlern)
// =====================================================================
async function localizeChunk(chunk, target, alreadyUsedNames, attempt = 1) {
    const systemPrompt = buildSystemPrompt(target, alreadyUsedNames);
    const result = await callOpenAI(systemPrompt, JSON.stringify(chunk, null, 2));

    if (result === null) {
        if (attempt < 2) {
            console.log(`      ↻ Erneuter Versuch für diesen Block...`);
            return localizeChunk(chunk, target, alreadyUsedNames, attempt + 1);
        }
        return null;
    }

    let parsed;
    try {
        parsed = JSON.parse(result);
    } catch (err) {
        console.error(`      ❌ Kein valides JSON in diesem Block:`, err.message);
        if (attempt < 2) {
            console.log(`      ↻ Erneuter Versuch für diesen Block...`);
            return localizeChunk(chunk, target, alreadyUsedNames, attempt + 1);
        }
        return null;
    }

    if (!Array.isArray(parsed)) {
        console.error(`      ❌ Antwort ist kein Array.`);
        return null;
    }
    if (parsed.length !== chunk.length) {
        console.warn(`      ⚠️  Block-Länge weicht ab! Erwartet: ${chunk.length}, erhalten: ${parsed.length}.`);
    }

    return parsed;
}

// =====================================================================
// LOKALISIERUNG EINER SPRACHE (in Blöcken, sequenziell, Duplikat-Schutz)
// =====================================================================
async function localizeForTarget(sourceJsonString, target) {
    const original = JSON.parse(sourceJsonString);
    const chunks = chunkArray(original, CONFIG.chunkSize);

    console.log(`   📦 ${original.length} Einträge in ${chunks.length} Blöcke á max. ${CONFIG.chunkSize} aufgeteilt.`);

    const resultEntries = [];
    const alreadyUsedNames = [];

    for (let i = 0; i < chunks.length; i++) {
        console.log(`   🔹 Block ${i + 1}/${chunks.length} (${chunks[i].length} Einträge)...`);
        const localizedChunk = await localizeChunk(chunks[i], target, alreadyUsedNames);

        if (!localizedChunk) {
            console.error(`      ❌ Block ${i + 1} endgültig fehlgeschlagen. Breche für ${target.locale} ab.`);
            return null;
        }

        resultEntries.push(...localizedChunk);
        localizedChunk.forEach(e => { if (e && e.name) alreadyUsedNames.push(e.name); });
    }

    if (resultEntries.length !== original.length) {
        console.warn(`   ⚠️  Gesamtanzahl weicht ab! Original: ${original.length}, ${target.locale}: ${resultEntries.length}. Bitte manuell prüfen.`);
    }

    return JSON.stringify(resultEntries, null, 2);
}

// =====================================================================
// HAUPT-SKRIPT
// =====================================================================
async function run() {
    console.log('🚀 Starte Lokalisierung von', CONFIG.sourceFile, '...\n');

    const sourcePath = path.join(__dirname, 'src', CONFIG.baseLang, CONFIG.sourceFile);
    if (!fs.existsSync(sourcePath)) {
        console.error(`❌ Quelldatei nicht gefunden: ${sourcePath}`);
        return;
    }
    const sourceJsonString = fs.readFileSync(sourcePath, 'utf8');

    for (const target of CONFIG.targetLangs) {
        const targetDir = path.join(__dirname, 'src', target.locale);
        const targetFile = path.join(targetDir, CONFIG.sourceFile);

        if (fs.existsSync(targetFile)) {
            console.log(`⏭️  ${target.locale}: "${CONFIG.sourceFile}" existiert bereits. Überspringe.`);
            console.log(`💡 Zum Neu-Generieren vorher die Datei löschen.\n`);
            continue;
        }

        console.log(`🌍 Lokalisiere für ${target.country} [${target.locale}]...`);
        const localized = await localizeForTarget(sourceJsonString, target);

        if (!localized) {
            console.log(`   ⚠️  Fehlgeschlagen für ${target.locale} – bitte erneut versuchen.\n`);
            continue;
        }

        fs.mkdirSync(targetDir, { recursive: true });
        fs.writeFileSync(targetFile, localized, 'utf8');
        console.log(`   ✅ src/${target.locale}/${CONFIG.sourceFile} erstellt.\n`);
    }

    console.log('⚠️ WICHTIG: Adressen und Schlichtungsstellen stichprobenartig prüfen — die KI arbeitet ohne Internetzugriff und kann Details verwechseln oder veraltet wiedergeben.');
}

run();
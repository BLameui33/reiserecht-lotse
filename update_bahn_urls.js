const fs = require('fs');
const path = require('path');

// Pfad zur Quell-Datei (PT) und Ziel-Länderordnern
const PT_JSON_PATH = path.join(__dirname, 'src', 'pt', 'airlines.json');
const TARGET_COUNTRIES = ['en-gb', 'nl-be', 'nl', 'it', 'fr-be', 'fr'];

function updateAirlineUrls() {
  // 1. Quell-Datei (PT) prüfen und einlesen
  if (!fs.existsSync(PT_JSON_PATH)) {
    console.error(`❌ Quelle nicht gefunden: ${PT_JSON_PATH}`);
    return;
  }

  const dataPt = JSON.parse(fs.readFileSync(PT_JSON_PATH, 'utf8'));
  
  // Lookup-Map auf Basis des SLUGs aus der PT-Datei erstellen
  const urlMap = new Map();
  dataPt.forEach(item => {
    if (item.slug && item.portal_url && item.portal_url.trim() !== '') {
      urlMap.set(item.slug.trim().toLowerCase(), item.portal_url.trim());
    }
  });

  console.log(`ℹ️ ${urlMap.size} URLs aus src/pt/airlines.json geladen.\n`);

  // 2. Durch alle Ziel-Länderordner iterieren
  TARGET_COUNTRIES.forEach(country => {
    const filePath = path.join(__dirname, 'src', country, 'airlines.json');

    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️ Datei nicht gefunden: src/${country}/airlines.json (wird übersprungen)`);
      return;
    }

    const countryData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    let updatedCount = 0;

    // Einträge über den Slug abgleichen und portal_url in jedem Fall überschreiben
    const updatedData = countryData.map(item => {
      const itemSlug = item.slug ? item.slug.trim().toLowerCase() : '';

      if (itemSlug && urlMap.has(itemSlug)) {
        item.portal_url = urlMap.get(itemSlug);
        updatedCount++;
      }
      return item;
    });

    // 3. Datei im jeweiligen Ordner überschreiben
    fs.writeFileSync(filePath, JSON.stringify(updatedData, null, 2), 'utf8');
    console.log(`✅ src/${country}/airlines.json: ${updatedCount} URLs erfolgreich befüllt.`);
  });

  console.log('\n🎉 Fertig! Alle Länder-Dateien wurden aktualisiert.');
}

updateAirlineUrls();
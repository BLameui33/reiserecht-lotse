const fs = require('fs');
const path = require('path');

// Pfad zum Quellordner (DE) und Zielordnern
const DE_JSON_PATH = path.join(__dirname, 'src', 'de', 'ferienhaus.json');
const TARGET_COUNTRIES = ['es', 'fr', 'it', 'en-gb', 'en-us', 'fr-be', 'nl-be', 'pt', 'nl'];

function updateBahnUrls() {
  // 1. Quell-Datei (DE) prüfen und einlesen
  if (!fs.existsSync(DE_JSON_PATH)) {
    console.error(`❌ Quelle nicht gefunden: ${DE_JSON_PATH}`);
    return;
  }

  const dataDe = JSON.parse(fs.readFileSync(DE_JSON_PATH, 'utf8'));
  
  // Lookup-Map auf Basis des SLUGs erstellen {"ice": "https://..."}
  const urlMap = new Map();
  dataDe.forEach(item => {
    if (item.slug && item.portal_url && item.portal_url.trim() !== '') {
      urlMap.set(item.slug.trim().toLowerCase(), item.portal_url.trim());
    }
  });

  console.log(`ℹ️ ${urlMap.size} URLs aus der deutschen ferienhaus.json geladen.\n`);

  // 2. Durch alle Länderordner iterieren
  TARGET_COUNTRIES.forEach(country => {
    const filePath = path.join(__dirname, 'src', country, 'ferienhaus.json');

    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️ Datei nicht gefunden: src/${country}/ferienhaus.json (wird übersprungen)`);
      return;
    }

    const countryData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    let updatedCount = 0;

    // Einträge abgleichen und portal_url befüllen
    const updatedData = countryData.map(item => {
      const itemSlug = item.slug ? item.slug.trim().toLowerCase() : '';

      if (itemSlug && urlMap.has(itemSlug)) {
        item.portal_url = urlMap.get(itemSlug);
        updatedCount++;
      }
      return item;
    });

    // 3. Datei direkt im jeweiligen Ordner überschreiben
    fs.writeFileSync(filePath, JSON.stringify(updatedData, null, 2), 'utf8');
    console.log(`✅ src/${country}/ferienhaus.json: ${updatedCount} URLs erfolgreich befüllt.`);
  });

  console.log('\n🎉 Fertig! Alle Länder-Dateien wurden aktualisiert.');
}

updateBahnUrls();
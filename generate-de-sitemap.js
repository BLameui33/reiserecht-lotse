const fs = require('fs');
const path = require('path');

const baseUrl = 'https://www.fix-my-trip.com';
const docsDir = path.join(__dirname, 'docs');
const deDir = path.join(docsDir, 'de'); // Zielordner nur für Deutschland

// Hilfsfunktion: Sucht rekursiv nach HTML-Dateien
function getHtmlFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);

    if (fs.statSync(filePath).isDirectory()) {
      getHtmlFiles(filePath, fileList);
    } else if (file.endsWith('.html')) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

console.log('🗺️  Starte Sitemap-Generierung exklusiv für den DE-Ordner...\n');

// 1. Nur HTML-Dateien aus dem /docs/de/-Ordner einsammeln
const deHtmlFiles = getHtmlFiles(deDir);
console.log(` 🌍 [DE] -> ${deHtmlFiles.length} HTML-Seiten gefunden.`);

// 2. URLs für die XML-Struktur konvertieren
const urls = deHtmlFiles.map(file => {
  // Erstellt den relativen Pfad ab dem "docs"-Ordner (z.B. "de/gepaeck-info.html")
  const relativePath = path
    .relative(docsDir, file)
    .replace(/\\/g, '/');

  return `  <url>
    <loc>${baseUrl}/${relativePath}</loc>
  </url>`;
});

// 3. XML-Struktur zusammenbauen
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;

// 4. Als "sitemap-de.xml" im docs-Root speichern
fs.writeFileSync(path.join(docsDir, 'sitemap-de.xml'), sitemap);

console.log(`\n🚀 Fertig! DE-Sitemap mit ${urls.length} URLs erfolgreich in "docs/sitemap-de.xml" erstellt.`);
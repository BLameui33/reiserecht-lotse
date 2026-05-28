const fs = require('fs');
const path = require('path');

const baseUrl = 'https://www.fix-my-trip.com';
const docsDir = path.join(__dirname, 'docs');

// Ordner, die KEINE Sprachen sind und ignoriert werden sollen (falls vorhanden)
const ignoreDirs = ['assets', 'css', 'js', 'images'];

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

console.log('🗺️  Starte Sitemap-Generierung nach Ländern...\n');

// 1. Alle Unterordner in /docs/ ermitteln (de, nl, nl-be, es, etc.)
const languages = fs.readdirSync(docsDir).filter(file => {
  const fullPath = path.join(docsDir, file);
  return fs.statSync(fullPath).isDirectory() && !ignoreDirs.includes(file);
});

let allHtmlFiles = [];

// 2. Dateien für jedes Land einsammeln und tracken
languages.forEach(lang => {
  const langDir = path.join(docsDir, lang);
  const filesInLang = getHtmlFiles(langDir);
  
  console.log(` 🌍 [${lang.toUpperCase()}] -> ${filesInLang.length} HTML-Seiten gefunden.`);
  allHtmlFiles = allHtmlFiles.concat(filesInLang);
});

// 3. URLs für die XML-Struktur konvertieren
const urls = allHtmlFiles.map(file => {
  // Erstellt den relativen Pfad ab dem "docs"-Ordner (z.B. "nl-be/gepaeck-info.html")
  const relativePath = path
    .relative(docsDir, file)
    .replace(/\\/g, '/');

  return `  <url>
    <loc>${baseUrl}/${relativePath}</loc>
  </url>`;
});

// 4. XML-Struktur zusammenbauen
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;

// 5. Datei im docs-Root speichern
fs.writeFileSync(path.join(docsDir, 'sitemap.xml'), sitemap);

console.log(`\n🚀 Fertig! Gesamte Sitemap mit ${urls.length} URLs erfolgreich in "docs/sitemap.xml" erstellt.`);
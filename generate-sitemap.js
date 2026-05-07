const fs = require('fs');
const path = require('path');

const baseUrl = 'https://fix-my-trip.com';

// Live-Ordner für DE
const directoryPath = path.join(__dirname, 'docs', 'de');

function getHtmlFiles(dir, fileList = []) {
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

const files = getHtmlFiles(directoryPath);

const urls = files.map(file => {
  // relativer Pfad ab docs
  const relativePath = path
    .relative(path.join(__dirname, 'docs'), file)
    .replace(/\\/g, '/');

  return `  <url>
    <loc>${baseUrl}/${relativePath}</loc>
  </url>`;
});

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;

// Sitemap direkt in docs speichern
fs.writeFileSync(path.join(__dirname, 'docs', 'sitemap.xml'), sitemap);

console.log('Sitemap für docs/de erstellt!');
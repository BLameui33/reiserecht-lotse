const fs = require('fs');
const path = require('path');

const baseUrl = 'https://fix-my-trip.com';
const directoryPath = path.join(__dirname, 'fertige_seiten', 'de');

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
  // relativer Pfad ab "fertige Seiten"
  const relativePath = path
    .relative(path.join(__dirname, 'fertige Seiten'), file)
    .replace(/\\/g, '/');

  return `<url><loc>${baseUrl}/${relativePath}</loc></url>`;
});

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;

fs.writeFileSync('sitemap.xml', sitemap);

console.log('Sitemap nur für /fertige Seiten/de erstellt!');
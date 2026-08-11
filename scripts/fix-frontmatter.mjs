import fs from 'node:fs';
import path from 'node:path';

const docsDir = path.join(process.cwd(), 'src', 'content', 'docs');

function formatFolderLabel(dirName) {
  return dirName
    .replace(/^[0-9]+-/, (match) => `${match.replace('-', '')}. `)
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function fixFrontmatter(directory) {
  if (!fs.existsSync(directory)) {
    return;
  }

  const entries = fs.readdirSync(directory, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      fixFrontmatter(fullPath);
    } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.mdx'))) {
      let content = fs.readFileSync(fullPath, 'utf8');
      const baseName = entry.name.replace(/\.(md|mdx)$/, '');
      const parentFolder = path.basename(path.dirname(fullPath));

      if (!content.trim().startsWith('---')) {
        let title = '';
        const h1Match = content.match(/^#\s+(.+)$/m);

        if (baseName.toLowerCase() === 'toc') {
          title = `${formatFolderLabel(parentFolder)} - Table of Contents`;
        } else if (baseName.toLowerCase() === 'index' && parentFolder !== 'docs') {
          title = formatFolderLabel(parentFolder);
        } else if (h1Match?.[1]) {
          title = h1Match[1].trim().replace(/"/g, '\\"');
        } else {
          title = formatFolderLabel(baseName);
        }

        const frontmatter = `---\ntitle: "${title}"\n---\n\n`;
        fs.writeFileSync(fullPath, frontmatter + content, 'utf8');
      }
    }
  }
}

fixFrontmatter(docsDir);

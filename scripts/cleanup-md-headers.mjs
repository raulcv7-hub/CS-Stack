import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const docsDir = path.join(process.cwd(), "src", "content", "docs");
const applyDirectly = process.argv.includes("--apply");

function findMdFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) {
    return fileList;
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findMdFiles(fullPath, fileList);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const files = findMdFiles(docsDir);
const proposedChanges = [];

for (const file of files) {
  const relativePath = path.relative(docsDir, file).replace(/\\/g, "/");
  const content = fs.readFileSync(file, "utf8");
  const lines = content.split(/\r?\n/);

  const h1Index = lines.findIndex((line) => /^#\s+/.test(line.trim()));

  if (h1Index > 0) {
    const removedLines = lines.slice(0, h1Index);
    const newContent = lines.slice(h1Index).join("\n");
    proposedChanges.push({
      file,
      relativePath,
      h1Index,
      h1Line: lines[h1Index],
      removedLines,
      newContent,
    });
  } else if (h1Index === -1) {
    console.warn(
      `\x1b[33m[WARN] No '# H1' heading found in: ${relativePath}\x1b[0m`,
    );
  }
}

if (proposedChanges.length === 0) {
  console.log(
    "\x1b[32m\n✨ All .md files already start directly with # H1 on Line 1. No changes needed!\x1b[0m\n",
  );
  process.exit(0);
}

console.log(
  `\n\x1b[36m🔍 Found ${proposedChanges.length} files with leading lines before # H1:\x1b[0m\n`,
);

for (const change of proposedChanges) {
  console.log(`\x1b[33m📄 File:\x1b[0m ${change.relativePath}`);
  console.log(
    `   \x1b[32mLine ${change.h1Index + 1} will become Line 1:\x1b[0m "${change.h1Line}"`,
  );
  console.log(
    `   \x1b[31mLines to be DELETED (${change.removedLines.length} lines):\x1b[0m`,
  );
  for (const line of change.removedLines) {
    console.log(`     - "${line}"`);
  }
  console.log("────────────────────────────────────────────────────────────");
}

if (!applyDirectly) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question(
    "\n\x1b[35m⚠️ Do you want to apply these deletions to disk? (y/N): \x1b[0m",
    (answer) => {
      const choice = answer.trim().toLowerCase();
      if (choice === "y" || choice === "yes") {
        for (const change of proposedChanges) {
          fs.writeFileSync(change.file, change.newContent, "utf8");
        }
        console.log(
          `\n\x1b[32m✨ Successfully updated ${proposedChanges.length} files. Line 1 is now # H1 across all files!\x1b[0m\n`,
        );
      } else {
        console.log(
          "\n\x1b[31m❌ Operation cancelled. No files were modified.\x1b[0m\n",
        );
      }
      rl.close();
    },
  );
} else {
  for (const change of proposedChanges) {
    fs.writeFileSync(change.file, change.newContent, "utf8");
  }
  console.log(
    `\n\x1b[32m✨ Successfully updated ${proposedChanges.length} files. Line 1 is now # H1 across all files!\x1b[0m\n`,
  );
}

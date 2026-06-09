const fs = require('fs');
const path = require('path');
const readline = require('readline');

const BASE_DIR = "c:/Users/bau85/OneDrive - 한울초등학교 (1)/26년 자료/badminton-league-main";
const TARGET_DIR = "c:/Users/bau85/OneDrive - 한울초등학교 (1)/26년 자료/lovable-project-c1d0bcbc-12c3-486c-b9d2-865bdef007a8-2026-05-22";

const TRANSCRIPTS = [
  "C:/Users/bau85/.gemini/antigravity/brain/255511c5-de7e-4787-8814-c8ac99f3d65f/.system_generated/logs/transcript.jsonl",
  "C:/Users/bau85/.gemini/antigravity/brain/a453c141-fef3-4731-863b-b81908352eab/.system_generated/logs/transcript.jsonl",
  "C:/Users/bau85/.gemini/antigravity/brain/1a6cf3a0-587d-499d-a736-8aac0d91833b/.system_generated/logs/transcript.jsonl"
];

// Map from relative path (e.g., "src/lib/league-store.ts") to content
const fileMap = new Map();

// Load initial files from badminton-league-main
function loadInitialFiles(dir, prefix = "") {
  if (!fs.existsSync(dir)) return;
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const relPath = prefix ? `${prefix}/${item}` : item;
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (item !== 'node_modules' && item !== '.git') {
        loadInitialFiles(fullPath, relPath);
      }
    } else {
      if (relPath.startsWith('src/')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        fileMap.set(relPath, content);
      }
    }
  }
}

// Helper to normalize file paths
function getRelativeSrcPath(filePath) {
  if (!filePath) return null;
  const normalized = filePath.replace(/\\/g, '/');
  const srcIdx = normalized.indexOf('/src/');
  if (srcIdx !== -1) {
    return normalized.substring(srcIdx + 1);
  }
  if (normalized.startsWith('src/')) {
    return normalized;
  }
  return null;
}

async function processTranscripts() {
  console.log("Loading base files from badminton-league-main...");
  loadInitialFiles(BASE_DIR);
  console.log(`Loaded ${fileMap.size} base files.`);

  for (const transPath of TRANSCRIPTS) {
    if (!fs.existsSync(transPath)) {
      console.log(`Transcript not found: ${transPath}, skipping.`);
      continue;
    }
    console.log(`Processing transcript: ${transPath}`);
    const fileStream = fs.createReadStream(transPath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const step = JSON.parse(line);
        // Look for tool calls in planner responses or other steps
        const toolCalls = step.tool_calls || [];
        for (const call of toolCalls) {
          const name = call.name;
          const args = call.args || {};
          
          if (name === 'write_to_file') {
            const rawTarget = args.TargetFile;
            const relPath = getRelativeSrcPath(rawTarget);
            if (relPath) {
              console.log(`[write_to_file] writing ${relPath}`);
              fileMap.set(relPath, args.CodeContent || "");
            }
          } else if (name === 'replace_file_content') {
            const rawTarget = args.TargetFile;
            const relPath = getRelativeSrcPath(rawTarget);
            if (relPath && fileMap.has(relPath)) {
              console.log(`[replace_file_content] editing ${relPath}`);
              let content = fileMap.get(relPath);
              const target = args.TargetContent;
              const replacement = args.ReplacementContent;
              if (content.includes(target)) {
                content = content.replace(target, replacement);
                fileMap.set(relPath, content);
              } else {
                console.warn(`[replace_file_content] warning: target content not found in ${relPath}`);
                // Try removing carriage returns and check
                const normContent = content.replace(/\r\n/g, '\n');
                const normTarget = target.replace(/\r\n/g, '\n');
                const normReplacement = replacement.replace(/\r\n/g, '\n');
                if (normContent.includes(normTarget)) {
                  console.log(`[replace_file_content] matched after normalizing line endings for ${relPath}`);
                  content = normContent.replace(normTarget, normReplacement);
                  fileMap.set(relPath, content);
                } else {
                  console.error(`[replace_file_content] error: target content mismatch in ${relPath}`);
                }
              }
            }
          } else if (name === 'multi_replace_file_content') {
            const rawTarget = args.TargetFile;
            const relPath = getRelativeSrcPath(rawTarget);
            if (relPath && fileMap.has(relPath)) {
              console.log(`[multi_replace_file_content] editing ${relPath}`);
              let content = fileMap.get(relPath);
              let chunks = args.ReplacementChunks;
              if (typeof chunks === 'string') {
                try {
                  chunks = JSON.parse(chunks);
                } catch(e) {
                  console.error(`Failed to parse chunks string in ${relPath}`);
                }
              }
              if (Array.isArray(chunks)) {
                // Apply replacements
                for (const chunk of chunks) {
                  const target = chunk.TargetContent;
                  const replacement = chunk.ReplacementContent;
                  if (content.includes(target)) {
                    content = content.replace(target, replacement);
                  } else {
                    const normContent = content.replace(/\r\n/g, '\n');
                    const normTarget = target.replace(/\r\n/g, '\n');
                    const normReplacement = replacement.replace(/\r\n/g, '\n');
                    if (normContent.includes(normTarget)) {
                      content = normContent.replace(normTarget, normReplacement);
                    } else {
                      console.error(`[multi_replace_file_content] chunk mismatch in ${relPath}: "${target.substring(0, 50)}..."`);
                    }
                  }
                }
                fileMap.set(relPath, content);
              }
            }
          }
        }
      } catch (err) {
        console.error("Failed to parse line", err);
      }
    }
  }

  // Now write all reconstructed files to TARGET_DIR
  console.log("Writing files back to target directory...");
  for (const [relPath, content] of fileMap.entries()) {
    const destPath = path.join(TARGET_DIR, relPath);
    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    fs.writeFileSync(destPath, content, 'utf8');
    console.log(`Restored: ${relPath} (${content.length} chars)`);
  }

  console.log("Restoration complete!");
}

processTranscripts();

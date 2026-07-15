// Copies the static web app (index.html, css/, js/) into the Android project's assets
// folder, so the WebView shell in android/ can load it fully offline via
// file:///android_asset/www/index.html. Re-run this after any web app change intended
// to ship in the Android build — it's a snapshot copy, not a live symlink.
import { cpSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const destDir = join(repoRoot, "android", "app", "src", "main", "assets", "www");

cpSync(join(repoRoot, "index.html"), join(destDir, "index.html"));
cpSync(join(repoRoot, "css"), join(destDir, "css"), { recursive: true });
cpSync(join(repoRoot, "js"), join(destDir, "js"), { recursive: true });

console.log(`Synced index.html, css/, js/ -> ${destDir}`);

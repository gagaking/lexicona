const fs = require("fs");
const content = fs.readFileSync(__dirname + "/src/views/ReversePrompt.tsx", "utf-8");

// Remove from "} catch (fallbackErr: any) {" to "    } finally {"
const orphanMarker = "} catch (fallbackErr: any) {";
const orphanIdx = content.indexOf(orphanMarker);
if (orphanIdx === -1) {
  console.log("NOT FOUND");
  process.exit(1);
}

const beforeOrphan = content.slice(0, orphanIdx);
const afterOrphan = content.slice(orphanIdx);
const finallyIdx = afterOrphan.indexOf("    } finally");
const cleaned = beforeOrphan + afterOrphan.slice(finallyIdx);
fs.writeFileSync(__dirname + "/src/views/ReversePrompt.tsx", cleaned, "utf-8");
console.log("OK");

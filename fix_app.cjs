const fs = require("fs");
const fp = __dirname + "/src/App.tsx";
let c = fs.readFileSync(fp, "utf-8");
c = c.replace("import { useState } from 'react';", "import { ErrorBoundary } from './components/ErrorBoundary';\nimport { useState } from 'react';");
c = c.replace("    <AppProvider>\n      <AppContent />\n    </AppProvider>", "    <ErrorBoundary>\n      <AppProvider>\n        <AppContent />\n      </AppProvider>\n    </ErrorBoundary>");
fs.writeFileSync(fp, c, "utf-8");
console.log("Done");

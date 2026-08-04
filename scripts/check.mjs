const modules = [
  "../src/bytes.ts",
  "../src/json.ts",
  "../src/pb.ts",
  "../src/crypto.ts",
  "../src/fmt.ts",
  "../src/id.ts",
  "../src/core.ts",
  "../src/index.ts",
];
for (const path of modules) await import(path);
console.log("Source modules loaded.");

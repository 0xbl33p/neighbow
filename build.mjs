// Build: terser minify -> roadroller pack -> inline into dist/index.html -> zip -> report size
import { minify } from "terser";
import { Packer } from "roadroller";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { execSync } from "child_process";

const LIMIT = 13312;
const src = readFileSync("src/game.js", "utf8")
  .replace(/\/\*DBG\*\/[\s\S]*?\/\*DBG-END\*\//, "");

const min = await minify(src, {
  compress: {
    passes: 3,
    unsafe: true,
    unsafe_arrows: true,
    unsafe_math: true,
    pure_getters: true,
    drop_console: true,
    toplevel: true,
  },
  mangle: { toplevel: true },
  format: { comments: false },
});
console.log("terser:", min.code.length, "bytes");

const packer = new Packer([{ data: min.code, type: "js", action: "eval" }], {});
await packer.optimize(2);
const { firstLine, secondLine } = packer.makeDecoder();
const packed = firstLine + secondLine;
console.log("roadroller:", packed.length, "bytes");

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><title>NEIGHBOW</title><style>html,body{margin:0;height:100%;overflow:hidden;background:#000}canvas{display:block;width:100vw;height:100vh;height:100dvh;touch-action:none;cursor:pointer}</style></head><body><canvas id="c"></canvas><a href="https://x.com/0xbl33p" target="_blank" rel="noopener" onpointerdown="event.stopPropagation()" style="position:fixed;right:10px;bottom:8px;font:12px ui-monospace,Consolas,monospace;color:#fff;opacity:.55;text-decoration:none">@0xbl33p</a><script>${packed}</script></body></html>`;

mkdirSync("dist", { recursive: true });
writeFileSync("dist/index.html", html);
console.log("dist/index.html:", html.length, "bytes");

// Bullpad Arcade wrapper — same game + their SDK; NOT part of the js13k zip
const bullpad = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><title>NEIGHBOW</title><style>html,body{margin:0;height:100%;overflow:hidden;background:#000}canvas{display:block;width:100vw;height:100vh;height:100dvh;touch-action:none;cursor:pointer}</style></head><body><canvas id="c"></canvas><script src="https://bullpad.fi/arcade/sdk.js"></script><script>
let bp=null;
window.nbScore=s=>{try{bp&&bp.submitScore(s)}catch(e){}};
window.nbReady=()=>{try{bp&&bp.ready()}catch(e){}};
(async()=>{try{bp=await BullpadArcade.connect({name:"NEIGHBOW"});bp.ready()}catch(e){/* standalone: no arcade frame, game runs fine without it */}})();
</script><script>${packed}</script></body></html>`;
writeFileSync("dist/bullpad.html", bullpad);
console.log("dist/bullpad.html:", bullpad.length, "bytes (arcade embed, not in zip)");

// zip via PowerShell (System.IO.Compression, Optimal deflate)
execSync(`powershell -NoProfile -Command "if(Test-Path dist/game.zip){Remove-Item dist/game.zip}; Add-Type -A System.IO.Compression.FileSystem; $z=[System.IO.Compression.ZipFile]::Open((Resolve-Path dist).Path+'\\\\game.zip','Create'); [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($z,(Resolve-Path dist/index.html).Path,'index.html',[System.IO.Compression.CompressionLevel]::Optimal) | Out-Null; $z.Dispose(); (Get-Item dist/game.zip).Length"`, { stdio: "inherit" });
const zipSize = readFileSync("dist/game.zip").length;
console.log(`ZIP: ${zipSize} / ${LIMIT} bytes (${(zipSize / LIMIT * 100).toFixed(1)}%) — ${LIMIT - zipSize} bytes to spare`);
if (zipSize > LIMIT) { console.error("OVER LIMIT!"); process.exit(1); }

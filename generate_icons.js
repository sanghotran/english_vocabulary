const fs = require('fs');
const path = require('path');

const iconsDir = path.join(__dirname, 'src-tauri', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// 1x1 pixel transparent PNG hex data
const pngHex = '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63606060600000000500010d0a2db40000000049454e44ae426082';
const pngBuffer = Buffer.from(pngHex, 'hex');

// Write PNG icons
fs.writeFileSync(path.join(iconsDir, '32x32.png'), pngBuffer);
fs.writeFileSync(path.join(iconsDir, '128x128.png'), pngBuffer);
fs.writeFileSync(path.join(iconsDir, '128x128@2x.png'), pngBuffer);
fs.writeFileSync(path.join(iconsDir, 'icon.png'), pngBuffer);

// Write basic ICO file (using PNG data as fallback)
fs.writeFileSync(path.join(iconsDir, 'icon.ico'), pngBuffer);
fs.writeFileSync(path.join(iconsDir, 'icon.icns'), pngBuffer);

console.log('Dummy icons generated successfully in', iconsDir);

import fs from "node:fs";
import WebCEmu from "../app/emulator/cemu-core/WebCEmu.js";

const romPath = process.argv[2];
if (!romPath) throw new Error("usage: node tests/manual-cemu-transfer-smoke.mjs ROM");

function makeProgram() {
  const data = Uint8Array.from([0x03, 0x00, 0xef, 0x7b, 0x00]);
  const bytes = [];
  const push16 = (value) => bytes.push(value & 0xff, value >>> 8);
  bytes.push(...new TextEncoder().encode("**TI83F*"), 0x1a, 0x0a, 0x00);
  bytes.push(...new Uint8Array(42));
  push16(17 + data.length);
  push16(13);
  push16(data.length);
  bytes.push(0x05, ...new TextEncoder().encode("WEBTEST\0"), 0x00, 0x00);
  push16(data.length);
  bytes.push(...data);
  const checksum = bytes.slice(55).reduce((sum, value) => (sum + value) & 0xffff, 0);
  push16(checksum);
  return Uint8Array.from(bytes);
}

const output = [];
const cemuModule = await WebCEmu({
  noExitRuntime: true,
  print: (line) => output.push(line),
  printErr: (line) => output.push(line),
});

cemuModule.FS.writeFile("/CE.rom", fs.readFileSync(romPath));
cemuModule.FS.writeFile("/WEBTEST.8xp", makeProgram());

const romName = new TextEncoder().encode("/CE.rom\0");
const romPtr = cemuModule._malloc(romName.length);
cemuModule.HEAPU8.set(romName, romPtr);
if (cemuModule._emu_init(romPtr) !== 0) throw new Error("ROM initialization failed");
cemuModule._free(romPtr);

cemuModule._emu_keypad_event(2, 0, true);
cemuModule._emu_step(30);
cemuModule._emu_keypad_event(2, 0, false);
cemuModule._emu_step(3000);

const fileName = new TextEncoder().encode("/WEBTEST.8xp\0");
const fileNamePtr = cemuModule._malloc(fileName.length);
cemuModule.HEAPU8.set(fileName, fileNamePtr);
const fileListPtr = cemuModule._malloc(4);
cemuModule.HEAPU32[fileListPtr >>> 2] = fileNamePtr;
const result = cemuModule._emu_send_variables(fileListPtr, 1, 2, 0, 0);
cemuModule._free(fileListPtr);
cemuModule._free(fileNamePtr);
if (result !== 0) throw new Error(`native transfer rejected with ${result}`);

cemuModule._emu_step(1800);

const stateCapacity = cemuModule._emu_save_state_size();
const statePtr = cemuModule._malloc(stateCapacity);
const stateSize = cemuModule._emu_save_state(statePtr, stateCapacity);
if (stateSize <= 0) throw new Error(`state save failed with ${stateSize}`);
const state = cemuModule.HEAPU8.slice(statePtr, statePtr + stateSize);
cemuModule._free(statePtr);

const marker = new TextEncoder().encode("WEBTEST");
const received = state.some((_, offset) =>
  marker.every((value, index) => state[offset + index] === value),
);

console.log(output.filter((line) => line.includes("USB transfer")).join("\n"));
console.log(`native result=${result}; WEBTEST present in saved state=${received}`);
if (!received) throw new Error("transfer did not place WEBTEST in calculator state");

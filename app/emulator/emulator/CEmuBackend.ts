// CEmu WASM emulator backend

import type { EmulatorBackend } from './types';

// CEmu Module type
interface CEmuModule {
  FS: {
    writeFile(path: string, data: Uint8Array): void;
    readdir(path: string): string[];
    chdir(path: string): void;
    mkdir(path: string): void;
  };
  HEAPU8: Uint8Array;
  HEAPU32: Uint32Array;
  _malloc(size: number): number;
  _free(ptr: number): void;
  _emu_init(romPathPtr: number): number;
  _emu_step(frames: number): void;
  _emu_reset(): void;
  _lcd_get_frame(): number;
  _emu_lcd_is_on(): number;
  _emu_keypad_event(row: number, col: number, press: boolean): void;
  _emu_save_state_size(): number;
  _emu_save_state(bufferPtr: number, bufferSize: number): number;
  _emu_load_state(bufferPtr: number, size: number): number;
  _emu_send_variables(
    fileListPtr: number,
    count: number,
    location: number,
    progressHandlerPtr: number,
    progressContextPtr: number,
  ): number;
}

interface CEmuGlobals {
  emul_is_inited: boolean;
  emul_is_paused: boolean;
  initFuncs: () => void;
  initLCD: () => void;
  enableGUI: () => void;
  disableGUI: () => void;
  transferProgressCallback?: (value: number, total: number) => void;
  transferErrorCallback?: () => void;
}

export class CEmuBackend implements EmulatorBackend {
  readonly name = 'CEmu (Reference)';
  private module: CEmuModule | null = null;
  private _isInitialized = false;
  private _isRomLoaded = false;
  private pendingTransfers: { path: string; name: string }[] = [];
  private transferActive = false;
  private activeTransferName: string | null = null;
  private transferCounter = 0;

  private readonly transferProgressCallback = (value: number, total: number) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cemu-transfer-progress', {
        detail: { name: this.activeTransferName, value, total },
      }));
    }

    if (total > 0 && value >= total) {
      this.transferActive = false;
      this.activeTransferName = null;
    }
  };

  private readonly transferErrorCallback = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cemu-transfer-error', {
        detail: { name: this.activeTransferName },
      }));
    }
    this.transferActive = false;
    this.activeTransferName = null;
  };

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  get isRomLoaded(): boolean {
    return this._isRomLoaded;
  }

  async init(): Promise<void> {
    const cemuGlobals = globalThis as typeof globalThis & CEmuGlobals;
    // Set up globals that CEmu expects
    cemuGlobals.emul_is_inited = false;
    cemuGlobals.emul_is_paused = true;
    cemuGlobals.initFuncs = () => {};
    cemuGlobals.initLCD = () => {};
    cemuGlobals.enableGUI = () => {};
    cemuGlobals.disableGUI = () => {};
    cemuGlobals.transferProgressCallback = this.transferProgressCallback;
    cemuGlobals.transferErrorCallback = this.transferErrorCallback;

    // Dynamically import CEmu module
    const { default: WebCEmu } = await import('../cemu-core/WebCEmu.js');

    this.module = await WebCEmu({
      print: (text: string) => console.log('[CEmu]', text),
      printErr: (text: string) => console.error('[CEmu]', text),
      locateFile: (path: string) => {
        if (path.endsWith('.wasm')) {
          return new URL('../cemu-core/WebCEmu.wasm', import.meta.url).href;
        }
        return path;
      },
      noExitRuntime: true,
    }) as CEmuModule;

    // Create /tmp directory for state file operations
    try {
      this.module.FS.mkdir('/tmp');
    } catch {
      // Directory may already exist
    }

    try {
      this.module.FS.mkdir('/transfers');
    } catch {
      // Directory may already exist
    }

    this._isInitialized = true;
  }

  destroy(): void {
    const cemuGlobals = globalThis as typeof globalThis & CEmuGlobals;
    if (cemuGlobals.transferProgressCallback === this.transferProgressCallback) {
      delete cemuGlobals.transferProgressCallback;
    }
    if (cemuGlobals.transferErrorCallback === this.transferErrorCallback) {
      delete cemuGlobals.transferErrorCallback;
    }
    this.pendingTransfers = [];
    this.transferActive = false;
    this.activeTransferName = null;
    this.module = null;
    this._isInitialized = false;
    this._isRomLoaded = false;
  }

  async loadRom(data: Uint8Array): Promise<number> {
    if (!this.module) throw new Error('Backend not initialized');

    // Write ROM to virtual filesystem
    this.module.FS.writeFile('/CE.rom', data);
    this.module.FS.chdir('/');

    // Initialize emulator with ROM
    const romPath = '/CE.rom';
    const romPathBytes = new TextEncoder().encode(romPath + '\0');
    const romPathPtr = this.module._malloc(romPathBytes.length);
    this.module.HEAPU8.set(romPathBytes, romPathPtr);

    const result = this.module._emu_init(romPathPtr);
    this.module._free(romPathPtr);

    if (result === 0) {
      this._isRomLoaded = true;
    }

    return result;
  }

  sendFile(data: Uint8Array, filename = 'transfer.8xp'): number {
    if (!this.module || !this._isRomLoaded) return -1;

    const safeName = filename
      .split(/[\\/]/)
      .pop()!
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(-160) || 'transfer.8xp';
    const path = `/transfers/${++this.transferCounter}-${safeName}`;

    try {
      this.module.FS.writeFile(path, data);
      this.pendingTransfers.push({ path, name: safeName });
      return 1;
    } catch (error) {
      console.error('[CEmu] Failed to queue file:', error);
      return -1;
    }
  }

  sendFileLive(data: Uint8Array, filename?: string): number {
    return this.sendFile(data, filename);
  }

  powerOn(): void {
    // CEmu handles power on during init/reset
  }

  reset(): void {
    if (!this.module) throw new Error('Backend not initialized');
    this.module._emu_reset();
  }

  runCycles(_cycles: number): number {
    // CEmu uses frame-based stepping, not cycle-based
    // Run approximately 1 frame worth
    this.runFrame();
    return _cycles;
  }

  runFrame(): void {
    if (!this.module) throw new Error('Backend not initialized');

    if (this.pendingTransfers.length > 0) {
      const batch = this.pendingTransfers.splice(0);
      const pathPointers: number[] = [];
      const fileListPtr = this.module._malloc(batch.length * 4);

      try {
        for (const entry of batch) {
          const pathBytes = new TextEncoder().encode(`${entry.path}\0`);
          const pathPtr = this.module._malloc(pathBytes.length);
          this.module.HEAPU8.set(pathBytes, pathPtr);
          pathPointers.push(pathPtr);
        }
        this.module.HEAPU32.set(pathPointers, fileListPtr >>> 2);

        // LINK_FILE (2) lets CEmu inspect each TI file and perform its native
        // DUSB transfer. The manual emu_step() wrapper does not execute
        // os-emscripten.c's gui_do_stuff(), so _set_file_to_send would remain
        // queued forever; start the USB device directly instead.
        const result = this.module._emu_send_variables(
          fileListPtr,
          batch.length,
          2,
          0,
          0,
        );

        if (result !== 0) {
          console.error('[CEmu] Native USB transfer rejected:', result);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('cemu-transfer-error', {
              detail: { name: batch.map((entry) => entry.name).join(', ') },
            }));
          }
        } else if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('cemu-transfer-started', {
            detail: { names: batch.map((entry) => entry.name) },
          }));
        }
      } finally {
        for (const pathPtr of pathPointers) this.module._free(pathPtr);
        this.module._free(fileListPtr);
      }
    }

    this.module._emu_step(1);
  }

  getFramebufferWidth(): number {
    return 320;
  }

  getFramebufferHeight(): number {
    return 240;
  }

  getFramebufferRGBA(): Uint8Array {
    if (!this.module) throw new Error('Backend not initialized');

    const framePtr = this.module._lcd_get_frame();
    if (!framePtr) {
      return new Uint8Array(320 * 240 * 4);
    }

    // CEmu panel.display is 320x240 ARGB8888 (A=bits 31-24, R=23-16, G=15-8, B=7-0)
    const width = 320;
    const height = 240;
    const result = new Uint8Array(width * height * 4);

    // Convert from CEmu's ARGB8888 to canvas RGBA
    const heapu32 = new Uint32Array(this.module.HEAPU8.buffer, framePtr, width * height);
    for (let i = 0; i < width * height; i++) {
      const pixel = heapu32[i];
      result[i * 4 + 0] = (pixel >> 16) & 0xFF; // R
      result[i * 4 + 1] = (pixel >> 8) & 0xFF;  // G
      result[i * 4 + 2] = (pixel >> 0) & 0xFF;  // B
      result[i * 4 + 3] = 255; // A (always opaque)
    }

    return result;
  }

  setKey(row: number, col: number, down: boolean): void {
    if (!this.module) return;
    // Use emu_keypad_event which takes row, col directly
    this.module._emu_keypad_event(row, col, down);
  }

  isLcdOn(): boolean {
    return this.module !== null && this.module._emu_lcd_is_on() !== 0;
  }


  saveState(): Uint8Array | null {
    if (!this.module || !this._isRomLoaded) return null;

    const bufferSize = this.module._emu_save_state_size();
    const bufferPtr = this.module._malloc(bufferSize);

    try {
      const result = this.module._emu_save_state(bufferPtr, bufferSize);
      if (result <= 0) {
        console.error('[CEmu] Failed to save state:', result);
        return null;
      }

      // Copy data from WASM memory
      const stateData = new Uint8Array(result);
      stateData.set(this.module.HEAPU8.subarray(bufferPtr, bufferPtr + result));
      return stateData;
    } finally {
      this.module._free(bufferPtr);
    }
  }

  loadState(data: Uint8Array): boolean {
    if (!this.module) return false;

    const bufferPtr = this.module._malloc(data.length);

    try {
      // Copy data to WASM memory
      this.module.HEAPU8.set(data, bufferPtr);

      const result = this.module._emu_load_state(bufferPtr, data.length);
      if (result !== 0) {
        console.error('[CEmu] Failed to load state:', result);
        return false;
      }

      this._isRomLoaded = true;
      return true;
    } finally {
      this.module._free(bufferPtr);
    }
  }
}

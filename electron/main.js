import { app, BrowserWindow, net, protocol, shell } from "electron";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCHEME = "ti84ce";
const HOST = "app";
const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(CURRENT_DIR, "../dist-portable");
const IS_SMOKE_TEST = process.argv.includes("--smoke-test");

if (IS_SMOKE_TEST) app.commandLine.appendSwitch("headless");

protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

function resolveWebPath(requestUrl) {
  const url = new URL(requestUrl);
  let pathname;

  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }

  if (pathname === "/" || !path.extname(pathname)) pathname = "/index.html";

  const resolved = path.resolve(WEB_ROOT, `.${pathname}`);
  if (resolved !== WEB_ROOT && !resolved.startsWith(`${WEB_ROOT}${path.sep}`)) {
    return null;
  }
  return resolved;
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1260,
    height: 900,
    minWidth: 390,
    minHeight: 620,
    show: false,
    backgroundColor: "#eef0eb",
    title: "TI-84 CE Emulator",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (!IS_SMOKE_TEST) window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
  void window.loadURL(`${SCHEME}://${HOST}/index.html`);

  if (IS_SMOKE_TEST) {
    const timeout = setTimeout(() => {
      console.error("Electron smoke test timed out.");
      app.exit(1);
    }, 15_000);

    window.webContents.once("did-finish-load", async () => {
      try {
        const result = await window.webContents.executeJavaScript(`({
          title: document.title,
          heading: document.querySelector('h1')?.textContent,
          romInput: Boolean(document.querySelector('#rom-input'))
        })`);
        clearTimeout(timeout);
        if (!result.heading?.includes("TI-84 Plus CE") || !result.romInput) {
          throw new Error(`Unexpected renderer result: ${JSON.stringify(result)}`);
        }
        console.log(`Electron renderer smoke test passed: ${result.title}`);
        app.exit(0);
      } catch (error) {
        clearTimeout(timeout);
        console.error(error);
        app.exit(1);
      }
    });
  }
}

app.whenReady().then(() => {
  protocol.handle(SCHEME, (request) => {
    const filePath = resolveWebPath(request.url);
    if (!filePath) return new Response("Not found", { status: 404 });
    return net.fetch(pathToFileURL(filePath).toString());
  });

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

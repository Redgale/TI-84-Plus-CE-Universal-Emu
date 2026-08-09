# TI-84 Plus CE Web Emulator

A browser port built from the supplied `ti84ce` web UI and the CEmu
WebAssembly core. It loads a user-provided ROM, emulates the calculator, sends
TI calculator files, and supports official `.8eu` OS updates through CEmu's
USB/DUSB implementation.

## What works

- User-supplied `.rom` and `.bin` files
- Programs, variables, apps, and other common TI transfer formats
- `.8eu` operating-system updates
- Drag-and-drop and multi-file selection
- Transfer progress and error reporting
- Periodic flash/state persistence in browser IndexedDB
- Mouse, touch, and keyboard calculator input

## Run locally

Requires Node.js 22.13 or later.

```bash
npm ci
npm run dev
```

Open the printed local URL, choose the CEmu backend, and load a ROM dumped from
your own calculator. To update the OS, choose **Send File**, select an authorized
`.8eu` file, and follow the prompts on the emulated calculator. Keep the tab
open until the progress indicator reaches 100%.

## Portable web build

The repository keeps the existing Sites build in `npm run build` and also
provides a host-neutral Vite bundle for Vercel, Netlify, Electron, Capacitor,
or any static file host:

```bash
npm ci
npm run build:portable
```

The deployable output is `dist-portable/`. Generated URLs are relative, so the
same directory works at a domain root, below a path prefix, or inside a native
web view.

### Vercel

Import the repository into Vercel and deploy it. The checked-in `vercel.json`
sets the install command, portable build command, output directory, and SPA
fallback. No dashboard overrides or environment variables are required.

For a CLI deployment:

```bash
npx vercel
```

### Netlify or another static host

Netlify reads the checked-in `netlify.toml`. For another provider, run
`npm run build:portable`, publish `dist-portable/`, and configure unknown paths
to fall back to `index.html` if the provider requires it.

## Electron desktop app

Electron uses the portable bundle through a private, secure local protocol.
The renderer is sandboxed, has context isolation enabled, and has Node.js
integration disabled.

```bash
# Run the desktop app from source
npm run electron:dev

# Create the unpacked app for the current operating system
npm run electron:pack

# Create installers/packages for the current operating system
npm run electron:dist
```

Artifacts are written to `release/`. Build Windows installers on Windows,
macOS packages on macOS, and a Linux AppImage on Linux. Code signing is
intentionally left to the release environment.

## iOS app and IPA

The checked-in `ios/` directory is a Capacitor Xcode project generated from the
same portable web app. Electron does not run on iOS, so Capacitor supplies the
native WKWebView wrapper while preserving ROM loading, calculator file input,
WASM emulation, and IndexedDB state.

### Build an IPA with GitHub Actions

The repository includes `.github/workflows/build-ios-ipa.yml`, which uses a
GitHub-hosted macOS 26 runner to build an iPhone device app and upload
`TI-84-CE-Emulator-unsigned.ipa` as a workflow artifact.

1. Push this source to GitHub.
2. Open the repository's **Actions** tab.
3. Select **Build iOS IPA**, then choose **Run workflow**.
4. When it finishes, download the `ti84ce-ios-unsigned-*` artifact from the
   workflow run.

The workflow also runs when a tag beginning with `v` is pushed. The resulting
IPA is unsigned because no Apple certificate or provisioning profile is stored
in the repository. It must be signed by a sideloading tool or signing service
before a normal iPhone will install it. App Store or TestFlight distribution
still requires an Apple Developer signing identity and provisioning profile.

After changing web source, refresh the native project:

```bash
npm ci
npm run ios:sync
```

Creating a signed IPA requires macOS, Xcode 26 or later, an Apple Developer
team, and a signing profile. On that Mac:

```bash
npm run ios:open
```

In Xcode, select the **App** target, choose your team under **Signing &
Capabilities**, and change the bundle identifier from `com.redgale.ti84ce` if
needed. Select a generic iOS device, then use **Product > Archive**. In the
Organizer choose **Distribute App** and the appropriate Development, Ad Hoc,
TestFlight/App Store, or enterprise method; Xcode will sign and export the IPA.
The generated project targets iOS 15 and later.

## Optional private preset ROM

No ROM is included in this repository or deployment. If you are building a
private copy and are authorized to use a preset ROM, place a gzip-compressed
ROM at `public/sys84.bin` and render the calculator with
`useBundledRom={true}`. Preset mode still exposes **Send File**, so it can
receive `.8eu` updates without asking the user to choose a ROM first.

Do not commit or publicly distribute ROM or OS files unless you have the right
to do so.

## Implementation notes

The CEmu backend writes selected files to Emscripten's in-memory filesystem and
passes them to CEmu's exported `_emu_send_variables` function. This starts the
native DUSB device directly; the regular emulation loop then drives the transfer,
including OS flash updates. Multiple files selected together are sent as one
native CEmu transfer batch.

See `THIRD_PARTY_NOTICES.md` and `LICENSE` for licensing information.

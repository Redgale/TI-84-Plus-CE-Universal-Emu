import { Calculator } from "./emulator/Calculator";

export default function Home() {
  return (
    <main>
      <section className="hero">
        <div className="eyebrow">CEmu · WebAssembly</div>
        <h1>TI-84 Plus CE, in your browser.</h1>
        <p>
          Load your own ROM, run the calculator, and send programs, variables,
          apps, or an official <code>.8eu</code> OS update through CEmu&apos;s USB
          emulation. Your ROM never leaves this browser.
        </p>
      </section>

      <section className="workspace" aria-label="Calculator emulator">
        <div className="emulator-panel">
          <Calculator defaultBackend="cemu" useBundledRom={false} />
        </div>

        <aside className="guide-panel">
          <div className="status-pill">
            <span aria-hidden="true" /> ROM not bundled
          </div>
          <h2>Start here</h2>
          <ol>
            <li>
              <strong>Load your ROM</strong>
              <span>Select the 4 MB ROM dumped from your own calculator.</span>
            </li>
            <li>
              <strong>Send calculator files</strong>
              <span>Use Send File or drag in programs, apps, and variables.</span>
            </li>
            <li>
              <strong>Update the OS</strong>
              <span>
                Send an official <code>.8eu</code>, then follow the calculator&apos;s
                on-screen update prompts without closing the tab.
              </span>
            </li>
          </ol>

          <div className="privacy-note">
            <strong>Local by design</strong>
            <p>
              ROM bytes, transferred files, and saved flash state stay in this
              browser. The updated OS persists in local browser storage.
            </p>
          </div>
        </aside>
      </section>

      <section className="capabilities" aria-label="Supported features">
        <article>
          <span>01</span>
          <h2>Full calculator UI</h2>
          <p>Mouse, touch, and keyboard input over CEmu&apos;s reference core.</p>
        </article>
        <article>
          <span>02</span>
          <h2>Real USB transfer path</h2>
          <p>Files travel through CEmu&apos;s DUSB implementation—not a memory hack.</p>
        </article>
        <article>
          <span>03</span>
          <h2>Persistent flash state</h2>
          <p>Calculator state is periodically saved to IndexedDB for the next visit.</p>
        </article>
      </section>

      <footer>
        This project does not include or redistribute a Texas Instruments ROM.
        Use a ROM and update files you are authorized to use.
      </footer>
    </main>
  );
}

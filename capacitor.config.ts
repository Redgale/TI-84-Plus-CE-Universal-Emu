import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.redgale.ti84ce",
  appName: "TI-84 CE Emulator",
  webDir: "dist-portable",
  ios: {
    contentInset: "automatic",
    preferredContentMode: "mobile",
  },
};

export default config;

import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        // Cache the immutable workbook separately from changes to the CRM UI.
        manualChunks(id) {
          if (id.includes("/src/data/workbook-reference.js")) return "phone-reference";
        },
      },
    },
  },
});

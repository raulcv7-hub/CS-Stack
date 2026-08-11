import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";

export default defineConfig({
  site: "https://raulcv7-hub.github.io",
  base: "/CS-Stack/",
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [[rehypeKatex, { strict: false }]],
  },
  integrations: [
    starlight({
      title: "CS Stack",
      favicon: "/favicon.svg",
      defaultLocale: "en",
      customCss: ["./src/styles/custom.css"],
      components: {
        Head: "./src/components/CustomHead.astro",
      },
      expressiveCode: {
        styleOverrides: {
          codeFontFamily:
            "'Cascadia Code', 'Cascadia Mono', 'Consolas', 'Menlo', 'DejaVu Sans Mono', monospace",
          codeFontSize: "0.85rem",
          codeLineHeight: "1.25",
        },
        shiki: {
          langAlias: {
            systemverilog: "verilog",
            sv: "verilog",
            sva: "verilog",
            x86asm: "asm",
            x86: "asm",
            riscv: "asm",
            assembly: "asm",
            s: "asm",
            sdc: "tcl",
            upf: "tcl",
            text: "txt",
          },
        },
      },
      sidebar: [
        {
          label: "00. Digital Hardware Foundations",
          autogenerate: {
            directory: "00-digital-hardware-foundations",
            collapsed: true,
          },
        },
      ],
    }),
  ],
});

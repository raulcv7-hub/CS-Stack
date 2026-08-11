import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';

export default defineConfig({
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [[rehypeKatex, { strict: false }]],
  },
  integrations: [
    starlight({
      title: 'Computer Engineering & Microarchitecture',
      defaultLocale: 'en',
      customCss: ['./src/styles/custom.css'],
      components: {
        Head: './src/components/CustomHead.astro',
      },
      expressiveCode: {
        shiki: {
          langAlias: {
            systemverilog: 'verilog',
            sv: 'verilog',
            sva: 'verilog',
            x86asm: 'asm',
            x86: 'asm',
            riscv: 'asm',
            assembly: 'asm',
            s: 'asm',
            sdc: 'tcl',
            upf: 'tcl',
            text: 'txt',
          },
        },
      },
      sidebar: [
        {
          label: '00. Digital Hardware Foundations',
          items: [
            {
              label: '01. Digital Logic Design',
              autogenerate: {
                directory: '00-digital-hardware-foundations/01-digital-logic-design',
                collapsed: true,
              },
            },
            {
              label: '02. RTL Hardware Design',
              autogenerate: {
                directory: '00-digital-hardware-foundations/02-rtl-hardware-design',
                collapsed: true,
              },
            },
            {
              label: '03. CPU Microarchitecture',
              autogenerate: {
                directory: '00-digital-hardware-foundations/03-cpu-microarchitecture',
                collapsed: true,
              },
            },
            {
              label: '04. Memory Subsystems',
              autogenerate: {
                directory: '00-digital-hardware-foundations/04-memory-subsystems',
                collapsed: true,
              },
            },
            {
              label: '05. Parallel Hardware Architectures',
              autogenerate: {
                directory: '00-digital-hardware-foundations/05-parallel-hardware-architectures',
                collapsed: true,
              },
            },
            {
              label: '06. Assembly Language Mechanics',
              autogenerate: {
                directory: '00-digital-hardware-foundations/06-assembly-language-mechanics',
                collapsed: true,
              },
            },
            {
              label: '07. Hardware Interconnects',
              autogenerate: {
                directory: '00-digital-hardware-foundations/07-hardware-interconnects',
                collapsed: true,
              },
            },
            {
              label: '08. Bare-Metal Systems',
              autogenerate: {
                directory: '00-digital-hardware-foundations/08-bare-metal-systems',
                collapsed: true,
              },
            },
            {
              label: '09. Platform Bootstrapping',
              autogenerate: {
                directory: '00-digital-hardware-foundations/09-platform-bootstrapping',
                collapsed: true,
              },
            },
            {
              label: '10. Microarchitectural Security',
              autogenerate: {
                directory: '00-digital-hardware-foundations/10-microarchitectural-security',
                collapsed: true,
              },
            },
            {
              label: '11. Energy-Efficient Microarchitecture',
              autogenerate: {
                directory: '00-digital-hardware-foundations/11-energy-efficient-microarchitecture',
                collapsed: true,
              },
            },
          ],
        },
      ],
    }),
  ],
});

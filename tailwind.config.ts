import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          500: "#D97706",
          600: "#B45309",
        },
      },
      fontFamily: {
        heading: ["Playfair Display", "Georgia", "serif"],
        body: ["Outfit", "system-ui", "sans-serif"],
        "ar-heading": ["Amiri", "serif"],
        "ar-body": ["Tajawal", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;

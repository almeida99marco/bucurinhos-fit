/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"),
        surface: v("surface"),
        surface2: v("surface2"),
        line: v("line"),
        ink: v("ink"),
        muted: v("muted"),
        onbrand: v("onbrand"),
        brand: { DEFAULT: v("brand"), dim: v("brand-dim"), soft: "rgb(var(--brand) / 0.1)" },
      },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
      boxShadow: { card: "0 1px 2px rgb(16 24 20 / 0.04), 0 4px 16px rgb(16 24 20 / 0.04)" },
    },
  },
  plugins: [],
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: { navy: "#0F172A", brand: "#2563EB", canvas: "#F8FAFC" },
      fontFamily: { sans: ["Inter", "Arial", "sans-serif"] },
    },
  },
  plugins: [],
};

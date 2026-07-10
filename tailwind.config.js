/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        ink: {
          950: "#0a0a0f",
          900: "#12121a",
          800: "#1a1a26",
          700: "#252535",
          600: "#33334a",
        },
        neon: {
          purple: "#a855f7",
          pink: "#ec4899",
          cyan: "#06b6d4",
        },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', "sans-serif"],
        body: ['"DM Sans"', "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      animation: {
        "pulse-slow": "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "gradient-shift": "gradient-shift 3s ease infinite",
        "fade-in-up": "fade-in-up 0.5s ease-out forwards",
        "fade-in": "fade-in 0.4s ease-out forwards",
        "border-glow": "border-glow 2s ease-in-out infinite alternate",
      },
      keyframes: {
        "gradient-shift": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "border-glow": {
          "0%": { boxShadow: "0 0 5px rgba(168, 85, 247, 0.3), 0 0 10px rgba(168, 85, 247, 0.2)" },
          "100%": { boxShadow: "0 0 20px rgba(168, 85, 247, 0.5), 0 0 30px rgba(236, 72, 153, 0.3)" },
        },
      },
      backgroundImage: {
        "gradient-primary": "linear-gradient(135deg, #a855f7 0%, #ec4899 100%)",
        "gradient-radial": "radial-gradient(circle at center, var(--tw-gradient-stops))",
      },
    },
  },
  plugins: [],
};

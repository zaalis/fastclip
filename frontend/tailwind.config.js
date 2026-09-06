/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Fastclip palette. Electric blue structures the workspace; saturated
        // orange carries creation, momentum and the primary user actions.
        ink: {
          900: '#0B1020', // page background
          800: '#101731', // raised background
          700: '#141C30', // panels
          600: '#1A2440', // panel hover
          500: '#25304A', // borders
          400: '#33415F', // strong borders
        },
        blue: {
          700: '#1F55A8',
          600: '#2A6FD0', // interactive fill (white label hits AA here)
          500: '#2F80ED', // brand blue: icons, borders, non-text UI
          400: '#69A7FF', // links and text on dark
          200: '#A9CBFF',
        },
        flame: {
          700: '#B94713',
          600: '#E5671D',
          500: '#FF8A3D',
          300: '#FFB27E',
        },
        chalk: '#F4F7FB',
        muted: '#9CA9BE',
        positive: { 500: '#2FBF71', 700: '#175E39' },
        negative: { 500: '#F2686C', 600: '#E5484D', 700: '#6B2124' },
      },
      fontFamily: {
        sans: ['Inter', 'Manrope', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        panel: '0 1px 2px rgba(3, 7, 18, 0.4), 0 8px 24px -12px rgba(3, 7, 18, 0.7)',
        lifted: '0 2px 4px rgba(3, 7, 18, 0.4), 0 18px 40px -16px rgba(3, 7, 18, 0.85)',
        glow: '0 0 0 1px rgba(47, 128, 237, 0.35), 0 12px 32px -12px rgba(47, 128, 237, 0.45)',
        orange: '0 0 0 1px rgba(255, 138, 61, 0.22), 0 20px 48px -18px rgba(255, 102, 31, 0.42)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'pulse-ring': {
          '0%,100%': { opacity: '0.45' },
          '50%': { opacity: '1' },
        },
        'page-enter': {
          from: { opacity: '0', transform: 'translateY(12px) scale(0.995)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'auth-card': {
          from: { opacity: '0', transform: 'translateX(22px) scale(0.975)' },
          to: { opacity: '1', transform: 'translateX(0) scale(1)' },
        },
        'auth-copy': {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-7px)' },
        },
        'drawer-in': {
          from: { opacity: '0', transform: 'translateX(-18px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        drift: {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) scale(1)' },
          '50%': { transform: 'translate3d(4%, 3%, 0) scale(1.08)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 260ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in 200ms ease-out both',
        shimmer: 'shimmer 1.6s infinite',
        'pulse-ring': 'pulse-ring 1.8s ease-in-out infinite',
        'page-enter': 'page-enter 520ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'auth-card': 'auth-card 720ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'auth-copy': 'auth-copy 680ms 120ms cubic-bezier(0.16, 1, 0.3, 1) both',
        float: 'float 5.5s ease-in-out infinite',
        'drawer-in': 'drawer-in 420ms cubic-bezier(0.16, 1, 0.3, 1) both',
        drift: 'drift 11s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

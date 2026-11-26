/**
 * LuDraw — Tailwind config.
 * Todas as cores de superfície/texto apontam para CSS variables definidas em
 * `src/styles/tokens.css`. Assim o Light/Dark Mode troca apenas as variáveis
 * (classe `.dark` no <html>) e os componentes continuam com as mesmas classes.
 * A escala `brand` é estática (hex) para permitir modificadores de opacidade (ex.: bg-brand-900/20).
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#F4F9EC',
          100: '#E7F1D6',
          200: '#D0E4AE',
          300: '#B4D38A',
          400: '#8FBE72',
          500: '#5FA067',
          600: '#3A8156',
          700: '#2A6646',
          800: '#20573B',
          900: '#194B32',
          950: '#0F2E1F',
        },
        canvas: 'var(--od-canvas)',
        panel: {
          DEFAULT: 'var(--od-panel)',
          hover: 'var(--od-panel-hover)',
          active: 'var(--od-panel-active)',
          sunken: 'var(--od-panel-sunken)',
        },
        line: {
          DEFAULT: 'var(--od-border)',
          strong: 'var(--od-border-strong)',
        },
        ink: {
          DEFAULT: 'var(--od-text)',
          muted: 'var(--od-text-muted)',
          subtle: 'var(--od-text-subtle)',
          inverse: 'var(--od-text-inverse)',
        },
        accent: {
          DEFAULT: 'var(--od-accent)',
          contrast: 'var(--od-accent-contrast)',
          soft: 'var(--od-accent-soft)',
          hover: 'var(--od-accent-hover)',
        },
        selection: 'var(--od-selection)',
        'on-selection': 'var(--od-on-selection)',
        favorite: 'var(--od-favorite)',
        guide: 'var(--od-guide)',
        danger: { DEFAULT: 'var(--od-danger)', soft: 'var(--od-danger-soft)' },
        warning: { DEFAULT: 'var(--od-warning)', soft: 'var(--od-warning-soft)' },
        success: { DEFAULT: 'var(--od-success)', soft: 'var(--od-success-soft)' },
        info: { DEFAULT: 'var(--od-info)', soft: 'var(--od-info-soft)' },
      },
      fontFamily: {
        sans: ['Figtree', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['11px', '14px'],
        xs: ['12px', '16px'],
        sm: ['13px', '18px'],
        base: ['14px', '20px'],
        md: ['15px', '22px'],
        lg: ['17px', '24px'],
        xl: ['20px', '28px'],
        '2xl': ['24px', '32px'],
        '3xl': ['32px', '38px'],
        '4xl': ['44px', '50px'],
      },
      borderRadius: {
        xs: '4px',
        sm: '6px',
        md: '8px',
        lg: '10px',
        xl: '12px',
        '2xl': '16px',
        '3xl': '22px',
      },
      boxShadow: {
        panel: 'var(--od-shadow-panel)',
        pop: 'var(--od-shadow-pop)',
        modal: 'var(--od-shadow-modal)',
        focus: 'var(--od-focus-ring)',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.22, 1, 0.36, 1)',
        'in-out': 'cubic-bezier(0.65, 0, 0.35, 1)',
        spring: 'cubic-bezier(0.34, 1.36, 0.64, 1)',
      },
      transitionDuration: {
        fast: '120ms',
        base: '180ms',
        slow: '260ms',
      },
      keyframes: {
        'pop-in': {
          '0%': { opacity: '0', transform: 'translateY(4px) scale(0.97)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-in-left': {
          '0%': { opacity: '0', transform: 'translateX(-6px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateX(0) scale(1)' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'modal-in': {
          '0%': { opacity: '0', transform: 'translateY(8px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        wave: {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '15%': { transform: 'rotate(14deg)' },
          '30%': { transform: 'rotate(-8deg)' },
          '45%': { transform: 'rotate(14deg)' },
          '60%': { transform: 'rotate(-4deg)' },
          '75%': { transform: 'rotate(10deg)' },
        },
      },
      animation: {
        'pop-in': 'pop-in 180ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in 200ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'slide-in-left': 'slide-in-left 200ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'slide-up': 'slide-up 260ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'modal-in': 'modal-in 240ms cubic-bezier(0.22, 1, 0.36, 1) both',
      },
    },
  },
  plugins: [],
};

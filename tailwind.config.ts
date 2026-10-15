import type { Config } from 'tailwindcss';

const withAlpha = (token: string) => `rgb(var(${token}) / <alpha-value>)`;

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        background: withAlpha('--color-background'),
        surface: withAlpha('--color-surface'),
        'surface-muted': withAlpha('--color-surface-muted'),
        foreground: withAlpha('--color-foreground'),
        border: withAlpha('--color-border'),
        muted: withAlpha('--color-muted'),
        ring: withAlpha('--color-ring'),
        brand: {
          50: withAlpha('--color-brand-50'),
          100: withAlpha('--color-brand-100'),
          500: withAlpha('--color-brand-500'),
          600: withAlpha('--color-brand-600'),
          700: withAlpha('--color-brand-700'),
          900: withAlpha('--color-brand-900')
        },
        success: {
          DEFAULT: withAlpha('--color-success'),
          soft: withAlpha('--color-success-soft')
        },
        warning: {
          DEFAULT: withAlpha('--color-warning'),
          soft: withAlpha('--color-warning-soft')
        },
        error: {
          DEFAULT: withAlpha('--color-error'),
          soft: withAlpha('--color-error-soft')
        },
        // `danger` is an alias of the error red — several views (expenses, outlets, staff
        // attendance) use `*-danger` classes that were otherwise undefined and rendered colorless.
        danger: {
          DEFAULT: withAlpha('--color-error'),
          soft: withAlpha('--color-error-soft')
        },
        // Static brand accents (intentionally not themed)
        forest: '#1B2A24',
        gold: '#EAB308'
      },
      borderRadius: {
        lg: '0.625rem',
        xl: '0.875rem',
        '2xl': '1.125rem'
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        soft: 'var(--shadow-pop)',
        panel: 'var(--shadow-panel)',
        pop: 'var(--shadow-pop)'
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      fontSize: {
        caption: ['0.8125rem', { lineHeight: '1.125rem' }],
        'page-title': ['2rem', { lineHeight: '2.375rem', letterSpacing: '-0.02em', fontWeight: '700' }],
        'section-title': ['1.5rem', { lineHeight: '1.875rem', letterSpacing: '-0.01em', fontWeight: '600' }]
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        }
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out'
      }
    }
  },
  plugins: []
};

export default config;

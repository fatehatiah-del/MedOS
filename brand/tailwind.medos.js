// Med OS colours for Tailwind. Tailwind v3: spread into theme.extend.colors.
// Tailwind v4: use tokens.css and map with @theme { --color-primary: var(--color-primary); ... }
module.exports = {
  medos: {
    ink: '#121638', paper: '#F4F5FB',
    'iris-blue': '#3D7BFF', 'iris-violet': '#7B5CFF', pulse: '#FF4F82',
  },
  bg: 'var(--color-bg)', surface: 'var(--color-surface)', 'surface-2': 'var(--color-surface-2)',
  border: 'var(--color-border)', text: 'var(--color-text)', muted: 'var(--color-text-muted)',
  primary: { DEFAULT: 'var(--color-primary)', hover: 'var(--color-primary-hover)', fg: 'var(--color-on-primary)' },
  accent: { DEFAULT: 'var(--color-accent)', text: 'var(--color-accent-text)' },
  success: 'var(--color-success)', warning: 'var(--color-warning)', danger: 'var(--color-danger)',
};

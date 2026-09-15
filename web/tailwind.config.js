/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        app: {
          bg: 'var(--bg)',
          surface: 'var(--surface)',
          'surface-2': 'var(--surface-2)',
          hover: 'var(--surface-hover)',
          border: 'var(--border)',
          'border-strong': 'var(--border-strong)',
          text: 'var(--text)',
          muted: 'var(--text-muted)',
          gold: 'var(--accent-gold)',
          'gold-hover': 'var(--accent-gold-hover)',
          'gold-soft': 'var(--accent-gold-soft)',
          purple: 'var(--accent-purple)',
          'purple-soft': 'var(--accent-purple-soft)',
        },
      },
      borderRadius: {
        card: 'var(--radius-card)',
        modal: 'var(--radius-modal)',
      },
      boxShadow: {
        card: '0 10px 28px rgba(40, 4, 16, 0.5)',
        'card-hover': '0 16px 42px rgba(12, 8, 4, 0.55), 0 0 18px rgba(199, 148, 14, 0.22)',
      },
    },
  },
  plugins: [
    // Tailwind v3 没有内置 pointer-coarse 变体（v4 才有），这里手动注册：
    // 匹配触摸设备（移动端），用于播放器移动端贴边全屏样式
    ({ addVariant }) => {
      addVariant('pointer-coarse', '@media (pointer: coarse)')
    },
  ],
}

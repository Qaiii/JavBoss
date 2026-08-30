// 主题化说明：
// gray/zinc/slate 全部色阶，以及彩色系的浅色阶（50-300）通过 CSS 变量输出。
// 这些变量在 src/index.css 的 :root 中取 Tailwind 官方浅色值（浅色模式渲染结果不变），
// 在 html.theme-dark 下按主题色调覆盖为暗色值，实现全站暗色模式。
// 其余色阶保持字面量，深浅两套主题下通用（如 bg-blue-600 按钮、bg-black 遮罩）。
const withVar = (name) => `rgb(var(--c-${name}) / <alpha-value>)`

const scale = (family, steps) =>
  Object.fromEntries(steps.map((step) => [step, withVar(`${family}-${step}`)]))

const neutralSteps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
const lightSteps = [50, 100, 200, 300]

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        gray: scale('gray', neutralSteps),
        zinc: scale('zinc', neutralSteps),
        slate: scale('slate', neutralSteps),
        blue: scale('blue', lightSteps),
        red: scale('red', lightSteps),
        amber: scale('amber', lightSteps),
        emerald: scale('emerald', lightSteps),
        rose: scale('rose', lightSteps),
        sky: scale('sky', lightSteps),
        cyan: scale('cyan', lightSteps),
        violet: scale('violet', lightSteps),
        purple: scale('purple', lightSteps),
        orange: scale('orange', lightSteps),
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

import { createTheme } from '@mui/material/styles'

const gold = '#c7940e'
const goldHover = '#dbab28'
const surface = '#1a1612'
const surface2 = '#241e18'
const border = '#3d3428'
const text = '#f6ead8'
const muted = '#b8a894'

export const appTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: gold, dark: '#8a6408', light: goldHover, contrastText: '#2a1a06' },
    secondary: { main: gold, contrastText: '#2a1a06' },
    background: { default: '#0c0a08', paper: surface },
    text: { primary: text, secondary: muted },
    divider: border,
    action: {
      hover: 'rgba(199, 148, 14, 0.14)',
      selected: 'rgba(199, 148, 14, 0.16)',
    },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 650 },
        containedPrimary: {
          fontWeight: 700,
          color: '#2a1a06',
          backgroundColor: gold,
          backgroundImage: 'var(--gold-grain), var(--gold-sheen)',
          backgroundSize: '140px 140px, 100% 100%',
          backgroundBlendMode: 'soft-light, normal',
          boxShadow: 'inset 0 1px 0 rgba(255, 236, 180, 0.28)',
          '&:hover': {
            backgroundColor: goldHover,
            backgroundImage: 'var(--gold-grain), var(--gold-sheen-hover)',
          },
        },
        outlined: { borderColor: border, color: text },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          color: muted,
          '&:hover': { backgroundColor: 'rgba(199, 148, 14, 0.16)', color: gold },
        },
      },
    },
    MuiSlider: {
      styleOverrides: {
        thumb: { backgroundColor: gold },
        track: { backgroundColor: gold },
        rail: { backgroundColor: border },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        switchBase: {
          '&.Mui-checked': { color: gold },
          '&.Mui-checked + .MuiSwitch-track': { backgroundColor: gold },
        },
      },
    },
    MuiRating: {
      styleOverrides: {
        iconFilled: { color: gold },
        iconHover: { color: goldHover },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: surface,
          color: text,
        },
      },
    },
    MuiPopover: {
      styleOverrides: {
        paper: {
          backgroundColor: surface2,
          border: `1px solid ${border}`,
          backgroundImage: 'none',
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: surface2,
          color: text,
          fontSize: 12,
          border: `1px solid ${border}`,
        },
      },
    },
  },
})

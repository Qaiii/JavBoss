import React from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@mui/material/styles'
import { BrowserRouter } from 'react-router-dom'
import App from '@/App'
import { AuthProvider } from '@/features/auth/components/AuthProvider'
import { appTheme } from '@/theme'
import '@/index.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider theme={appTheme}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
)

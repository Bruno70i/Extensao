import { BrowserRouter } from 'react-router-dom'
import { ToastProvider } from './components/toast'
import { AuthProvider } from './lib/auth'
import { AppRoutes } from './routes'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

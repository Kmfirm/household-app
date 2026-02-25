import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { useHousehold } from './hooks/useHousehold'
import Layout from './components/layout/Layout'
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import HouseholdSetup from './pages/HouseholdSetup'
import Dashboard from './pages/Dashboard'
import PantryPage from './pages/pantry/PantryPage'
import RecipesPage from './pages/recipes/RecipesPage'
import CalendarPage from './pages/calendar/CalendarPage'
import ShoppingPage from './pages/shopping/ShoppingPage'
import LeftoversPage from './pages/leftovers/LeftoversPage'
import NutritionPage from './pages/nutrition/NutritionPage'
import ReceiptPage from './pages/receipts/ReceiptPage'

function HouseholdGate({ children }) {
  const { household, loading } = useHousehold()
  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>
  if (!household) return <HouseholdSetup />
  return children
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>
  return user ? children : <Navigate to="/login" replace />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <HouseholdGate>
              <Layout />
            </HouseholdGate>
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="pantry" element={<PantryPage />} />
        <Route path="recipes" element={<RecipesPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="shopping" element={<ShoppingPage />} />
        <Route path="leftovers" element={<LeftoversPage />} />
        <Route path="nutrition" element={<NutritionPage />} />
        <Route path="receipts" element={<ReceiptPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}

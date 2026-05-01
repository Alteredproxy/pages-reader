import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ReaderPage } from './components/ReaderPage';
import { LibraryPage } from './components/LibraryPage';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthPage } from './components/AuthPage';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen"><div className="spinner"></div></div>;
  if (!user) return <AuthPage />;
  return <>{children}</>;
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AuthGuard>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<LibraryPage />} />
              <Route path="/reader/:docId" element={<ReaderPage />} />
            </Routes>
          </BrowserRouter>
        </AuthGuard>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;

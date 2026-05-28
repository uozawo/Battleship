import { createRoot } from 'react-dom/client';
import { AuthProvider } from './context/AuthContext.jsx';
import App from './App.jsx';
import './styles/base.css';
import './styles/components.css';

// StrictMode свідомо вимкнено: його подвійний монтаж у dev розриває
// сокет-зʼєднання й руйнує щойно створені кімнати.
createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <App />
  </AuthProvider>,
);

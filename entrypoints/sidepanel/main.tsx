import ReactDOM from 'react-dom/client';
import App from '../popup/App';
import '../popup/style.css';
import './style.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App surface="sidepanel" />,
);

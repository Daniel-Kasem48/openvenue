import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { publicBookingRoute } from './booking/publicRoute';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import './styles.css';
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App publicBooking={publicBookingRoute(window.location)} />
  </React.StrictMode>,
);

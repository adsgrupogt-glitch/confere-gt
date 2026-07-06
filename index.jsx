// index.jsx — ponto de entrada. Não precisa mexer neste arquivo.
import React from 'react';
import { createRoot } from 'react-dom/client';
import ConfereGT from './confere-gt-app.jsx';

const root = createRoot(document.getElementById('root'));
root.render(<ConfereGT />);

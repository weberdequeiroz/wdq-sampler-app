// Política de Privacidade: mostra o e-mail de contato do config.js, se houver.
import { CONFIG } from './config.js';

if (CONFIG.CONTACT_EMAIL) {
  const p = document.getElementById('contact');
  const a = document.createElement('a');
  a.href = 'mailto:' + CONFIG.CONTACT_EMAIL;
  a.textContent = CONFIG.CONTACT_EMAIL;
  p.textContent = 'Dúvidas ou pedidos sobre seus dados: ';
  p.append(a);
}

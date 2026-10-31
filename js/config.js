// Configuração do WDQ Sampler.
//
// CONTAS NA NUVEM (cadastro por e-mail com confirmação, login de qualquer
// aparelho, "Minha Pasta" sincronizada e painel do administrador): coloque em
// API_URL o endereço do server/api.php publicado no Hostinger (veja o README).
//
// Com API_URL vazio o app funciona em MODO LOCAL: as contas e os projetos
// ficam guardados só neste aparelho, com a senha protegida por PBKDF2.

export const CONFIG = {
  APP_NAME: 'WDQ Sampler',
  VERSION: '1.1.8',
  API_URL: '',
  // Onde o app procura versões novas. Pode ser a API de releases de um
  // repositório PÚBLICO do GitHub (o repositório do código pode continuar
  // privado) ou um version.json próprio. O APK baixa e abre o instalador.
  UPDATE_URL: 'https://api.github.com/repos/weberdequeiroz/wdq-sampler-app/releases/latest',
  // Política de Privacidade (LGPD) e e-mail de contato mostrado nela.
  PRIVACY_URL: 'https://weberdequeiroz.github.io/wdq-sampler-app/privacidade.html',
  CONTACT_EMAIL: '',
  // Link enviado em "Indicar para um amigo": baixa sempre o APK mais novo.
  SHARE_URL: 'https://github.com/weberdequeiroz/wdq-sampler-app/releases/latest/download/WDQ-Sampler.apk',
};

(function () {
  const API = window.location.origin === 'file://'
    ? 'http://localhost:3000'
    : window.location.origin;

  window.HealthAuth = {
    API,
    getToken() {
      return sessionStorage.getItem('token');
    },
    getUser() {
      try {
        return JSON.parse(sessionStorage.getItem('user') || 'null');
      } catch { return null; }
    },
    isLoggedIn() {
      return !!this.getToken();
    },
    logout() {
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('user');
      window.location.href = 'login.html';
    },
    requireLogin(requiredRoles) {
      if (!this.isLoggedIn()) {
        window.location.href = 'login.html';
        return false;
      }
      const user = this.getUser();
      if (requiredRoles && requiredRoles.length > 0 && !requiredRoles.includes(user.role)) {
        alert('Access denied. Required role: ' + requiredRoles.join(' or '));
        window.location.href = 'login.html';
        return false;
      }
      return true;
    },
    async fetch(path, options = {}) {
      const token = this.getToken();
      const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      };
      if (token) headers['Authorization'] = 'Bearer ' + token;

      const url = path.startsWith('http') ? path : API + path;
      const res = await fetch(url, { ...options, headers });

      if (res.status === 401) {
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
        window.location.href = 'login.html';
        throw new Error('Unauthorized');
      }
      return res;
    },
  };
})();


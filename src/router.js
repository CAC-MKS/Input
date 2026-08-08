export const router = {
    routes: {
        '#login': {
            component: () => import('./components/auth').then(m => m.LoginView()),
            onRender: () => import('./components/auth').then(m => m.initAuth()),
            requiresAuth: false
        },
        '#register': {
            component: () => import('./components/auth').then(m => m.RegisterView()),
            onRender: () => import('./components/auth').then(m => m.initAuth()),
            requiresAuth: false
        },
        '#forgot-password': {
            component: () => import('./components/auth').then(m => m.ForgotPasswordView()),
            onRender: () => import('./components/auth').then(m => m.initAuth()),
            requiresAuth: false
        },
        '#reset-password': {
            component: () => import('./components/auth').then(m => m.ResetPasswordView()),
            onRender: () => import('./components/auth').then(m => m.initAuth()),
            requiresAuth: false
        },
        '#create-match': {
            component: () => import('./components/createMatch').then(m => m.CreateMatchView()),
            onRender: () => import('./components/createMatch').then(m => m.initCreateMatch?.()),
            requiresAuth: true
        },
        '#matches': {
            component: () => import('./components/createdMatches').then(m => m.MatchesView()),
            onRender: () => import('./components/createdMatches').then(m => m.initMatches?.()),
            requiresAuth: true
        },
        '#tagger': {
            component: () => import('./components/tagger').then(m => m.TaggerView()),
            onRender: () => import('./components/tagger').then(m => m.initTagger?.()),
            requiresAuth: true
        },
        '#qc': {
            component: () => import('./components/qcPortal').then(m => m.QCPortalView()),
            onRender: () => import('./components/qcPortal').then(m => m.initQCPortal?.()),
            requiresAuth: true
        },
        '#analytics': {
            component: () => import('./components/analytics').then(m => m.AnalyticsView()),
            onRender: () => import('./components/analytics').then(m => m.initAnalytics?.()),
            requiresAuth: true
        },
        '#admin': {
            component: () => import('./components/adminPortal').then(m => m.AdminPortalView()),
            onRender: () => import('./components/adminPortal').then(m => m.initAdminPortal?.()),
            requiresAuth: true,
            requiresSuperAdmin: true
        },
    },

    getRoute(hash) {
        const routeKey = hash.split('?')[0];
        return this.routes[routeKey] || this.routes['#create-match'];
    }
};
